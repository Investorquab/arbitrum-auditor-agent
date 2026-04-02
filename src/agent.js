#!/usr/bin/env node
/**
 * arbitrum-contract-auditor / src/agent.js
 * Main entrypoint — CLI commands: audit, register
 */

import { config } from "dotenv";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

import {
  fetchContractSource,
  fetchContractInfo,
  analyzeContract,
  formatReport,
  getRiskBand,
} from "./auditor.js";

import { registerAgent, storeAuditHash } from "./register.js";

config();

function requireEnv(name) {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required environment variable: ${name}`);
  return val;
}

function getEnv(name, fallback = undefined) {
  return process.env[name] || fallback;
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const command = args[0];
  const flags = {};
  const positional = [];

  for (let i = 1; i < args.length; i++) {
    if (args[i].startsWith("--")) {
      const [key, val] = args[i].slice(2).split("=");
      flags[key] = val !== undefined ? val : args[i + 1]?.startsWith("--") ? true : (args[++i] ?? true);
    } else {
      positional.push(args[i]);
    }
  }

  return { command, positional, flags };
}

async function cmdRegister(flags) {
  const network = flags.network || "sepolia";
  const privateKey = requireEnv("PRIVATE_KEY");
  const rpcUrl = requireEnv(network === "mainnet" ? "RPC_URL_MAINNET" : "RPC_URL_SEPOLIA");

  const result = await registerAgent({ privateKey, rpcUrl, network });
  console.log("\n📋 Registration Result:");
  console.log(JSON.stringify(result, null, 2));
}

async function cmdAudit(positional, flags) {
  const contractAddress = positional[0];
  if (!contractAddress || !contractAddress.startsWith("0x")) {
    throw new Error("Usage: node src/agent.js audit <0xAddress> [--network sepolia|mainnet]");
  }

  const network    = flags.network || "sepolia";
  const dryRun     = flags["dry-run"] === true || flags["dry-run"] === "true";
  const noOnChain  = flags["no-onchain"] === true || dryRun;

  const arbiscanApiKey = requireEnv("ARBISCAN_API_KEY");
  const geminiApiKey   = requireEnv("GEMINI_API_KEY");
  const privateKey     = noOnChain
    ? getEnv("PRIVATE_KEY", "0x0000000000000000000000000000000000000000000000000000000000000001")
    : requireEnv("PRIVATE_KEY");
  const rpcUrl = noOnChain
    ? getEnv(network === "mainnet" ? "RPC_URL_MAINNET" : "RPC_URL_SEPOLIA", "https://sepolia-rollup.arbitrum.io/rpc")
    : requireEnv(network === "mainnet" ? "RPC_URL_MAINNET" : "RPC_URL_SEPOLIA");

  console.log(`\n🔍 Fetching contract source from Arbiscan...`);
  console.log(`   Address : ${contractAddress}`);
  console.log(`   Network : ${network}`);

  const contractData = await fetchContractSource(contractAddress, network, arbiscanApiKey);
  const info = await fetchContractInfo(contractAddress, network, arbiscanApiKey);
  contractData.balanceEth = info.balanceEth;

  console.log(`   Name    : ${contractData.contractName}`);
  console.log(`   Verified: ${contractData.isVerified}`);
  if (contractData.proxy) console.log(`   Proxy → : ${contractData.implementation}`);

  console.log(`\n🤖 Running Gemini AI security analysis...`);
  const analysis = await analyzeContract(contractData, geminiApiKey);

  const band = getRiskBand(analysis.riskScore);
  console.log(`\n${band.icon} Risk Score: ${analysis.riskScore}/100 (${band.label})`);
  console.log(`   Total findings: ${analysis.findings.length}`);

  const countBySev = {};
  for (const f of analysis.findings) countBySev[f.severity] = (countBySev[f.severity] || 0) + 1;
  for (const [sev, count] of Object.entries(countBySev)) {
    console.log(`     ${sev}: ${count}`);
  }

  let proofTx = null;
  if (!noOnChain) {
    const proofResult = await storeAuditHash({
      privateKey,
      rpcUrl,
      network,
      contractAddress,
      riskScore: analysis.riskScore,
      reportJSON: JSON.stringify(analysis),
    });
    proofTx = proofResult.txHash;
  } else {
    console.log(`\n⚠️  Dry-run mode — skipping on-chain proof`);
  }

  const report = formatReport(contractData, analysis, proofTx);

  console.log("\n" + "=".repeat(60));
  console.log(report);

  const outDir = "./audits";
  mkdirSync(outDir, { recursive: true });
  const filename = `${contractAddress.slice(0, 10)}-${Date.now()}.md`;
  const outPath  = join(outDir, filename);
  writeFileSync(outPath, report, "utf8");
  console.log(`\n💾 Report saved to: ${outPath}`);

  return { report, analysis, proofTx };
}

async function main() {
  console.log("🛡  Arbitrum Contract Auditor");
  console.log("   AI-powered security analysis with on-chain proof");

  const { command, positional, flags } = parseArgs(process.argv);

  try {
    switch (command) {
      case "audit":
        await cmdAudit(positional, flags);
        break;
      case "register":
        await cmdRegister(flags);
        break;
      default:
        console.log(`
Usage:
  node src/agent.js audit <0xAddress> [--network sepolia|mainnet] [--dry-run]
  node src/agent.js register [--network sepolia|mainnet]

Examples:
  node src/agent.js audit 0x1F98431c8aD98523631AE4a59f267346ea31F984 --network sepolia
  node src/agent.js register --network sepolia
        `);
        process.exit(1);
    }
  } catch (err) {
    console.error(`\n❌ Error: ${err.message}`);
    process.exit(1);
  }
}

main();