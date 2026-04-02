/**
 * arbitrum-contract-auditor / src/register.js
 * Agent identity registration + on-chain audit hash storage
 */

import {
  createWalletClient,
  createPublicClient,
  http,
  keccak256,
  encodePacked,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arbitrumSepolia, arbitrum } from "viem/chains";

const CHAINS = {
  sepolia: arbitrumSepolia,
  mainnet: arbitrum,
};

const IDENTITY_REGISTRY = {
  sepolia: "0x8004A818BFB912233c491871b3d84c89A494BD9e",
  mainnet: "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",
};

// ERC-721 based registry — register() mints an NFT with a metadataURI
// that must point to a valid ERC-8004 agent registration JSON file
const IDENTITY_REGISTRY_ABI = [
  {
    name: "register",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "metadataURI", type: "string" },
    ],
    outputs: [{ name: "agentId", type: "uint256" }],
  },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
];

function makeClients(privateKey, rpcUrl, network = "sepolia") {
  const chain = CHAINS[network];
  if (!chain) throw new Error(`Unknown network: ${network}`);
  const account = privateKeyToAccount(privateKey);
  const walletClient = createWalletClient({ account, chain, transport: http(rpcUrl) });
  const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
  return { walletClient, publicClient, account };
}

export async function registerAgent({ privateKey, rpcUrl, network = "sepolia" }) {
  const { walletClient, publicClient, account } = makeClients(privateKey, rpcUrl, network);
  const registryAddress = IDENTITY_REGISTRY[network];

  console.log(`\n🔍 Checking registration status...`);
  console.log(`   Agent address : ${account.address}`);
  console.log(`   Registry      : ${registryAddress}`);
  console.log(`   Network       : ${network}`);

  // Check if already registered (balanceOf > 0 means they have an agent NFT)
  try {
    const balance = await publicClient.readContract({
      address: registryAddress,
      abi: IDENTITY_REGISTRY_ABI,
      functionName: "balanceOf",
      args: [account.address],
    });
    if (balance > 0n) {
      console.log(`✅ Agent already registered on ${network}`);
      return { alreadyRegistered: true, address: account.address };
    }
  } catch {
    console.log(`   (Could not check status — proceeding)`);
  }

  console.log(`\n📝 Registering agent on Arbitrum Identity Registry...`);

  // ERC-8004 requires a JSON metadata URI — inline base64 works perfectly
  // This avoids needing a live URL before GitHub is set up
  const agentCard = {
    type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
    name: "ArbitrumContractAuditor",
    description: "AI-powered smart contract security auditor for Arbitrum. Fetches verified source from Arbiscan, runs multi-category security analysis, stores proof-of-audit on-chain.",
    image: "https://arbitrum.io/wp-content/uploads/2023/09/arb_logo.png",
    services: [
      {
        name: "web",
        endpoint: "https://github.com/investorquab/arbitrum-auditor-agent"
      }
    ],
    x402Support: false,
    active: true
  };

  // Encode as base64 data URI — fully on-chain, no external URL needed
  const jsonStr = JSON.stringify(agentCard);
  const base64 = Buffer.from(jsonStr).toString("base64");
  const metadataURI = `data:application/json;base64,${base64}`;

  const txHash = await walletClient.writeContract({
    address: registryAddress,
    abi: IDENTITY_REGISTRY_ABI,
    functionName: "register",
    args: [metadataURI],
  });

  console.log(`   Transaction submitted: ${txHash}`);
  console.log(`   Waiting for confirmation...`);

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

  if (receipt.status === "success") {
    console.log(`✅ Agent registered!`);
    console.log(`   Block   : ${receipt.blockNumber}`);
    console.log(`   Arbiscan: https://sepolia.arbiscan.io/tx/${txHash}`);
  } else {
    throw new Error(`Registration transaction reverted: ${txHash}`);
  }

  return { txHash, address: account.address, blockNumber: receipt.blockNumber.toString() };
}

export function computeAuditHash({ contractAddress, auditorAddress, timestamp, riskScore, reportJSON }) {
  const packed = encodePacked(
    ["address", "address", "uint256", "uint8", "string"],
    [contractAddress, auditorAddress, BigInt(timestamp), riskScore, reportJSON.slice(0, 1000)]
  );
  return keccak256(packed);
}

export async function storeAuditHash({ privateKey, rpcUrl, network = "sepolia", contractAddress, riskScore, reportJSON }) {
  const { walletClient, publicClient, account } = makeClients(privateKey, rpcUrl, network);

  const timestamp = Math.floor(Date.now() / 1000);
  const auditHash = computeAuditHash({
    contractAddress,
    auditorAddress: account.address,
    timestamp,
    riskScore,
    reportJSON,
  });

  console.log(`\n⛓  Storing audit proof on-chain...`);
  console.log(`   Audit hash : ${auditHash}`);
  console.log(`   Risk score : ${riskScore}/100`);

  const calldata = `0x415544495424${auditHash.slice(2)}`;

  const txHash = await walletClient.sendTransaction({
    to: account.address,
    value: 0n,
    data: calldata,
  });

  console.log(`   Transaction: ${txHash}`);
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

  if (receipt.status !== "success") {
    throw new Error(`Proof transaction reverted: ${txHash}`);
  }

  console.log(`✅ Audit proof stored on-chain!`);
  console.log(`   Arbiscan: https://sepolia.arbiscan.io/tx/${txHash}`);

  return { txHash, auditHash, timestamp, blockNumber: receipt.blockNumber.toString() };
}