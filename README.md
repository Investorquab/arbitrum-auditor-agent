# Arbitrum Contract Auditor

AI-powered smart contract security analysis for Arbitrum — with on-chain proof-of-audit.

## What It Does

Give it any deployed contract address on Arbitrum. It will:

1. Fetch the verified source code from Arbiscan
2. Analyse across 8 security categories using Google Gemini AI
3. Score with a 0-100 risk score and per-category breakdown
4. Store a keccak256 audit hash on Arbitrum as verifiable proof-of-audit
5. Return a full Markdown report with findings and recommendations

## Quick Start
```bash
# 1. Install
npm install

# 2. Configure
cp .env.example .env
# Edit .env — add your ARBISCAN_API_KEY, GEMINI_API_KEY, PRIVATE_KEY

# 3. Register your agent (one-time, uses a little Sepolia ETH)
node src/agent.js register --network sepolia

# 4. Audit a contract
node src/agent.js audit 0x1F98431c8aD98523631AE4a59f267346ea31F984 --network sepolia
```

## Get Your Free Keys

- **ARBISCAN_API_KEY** — https://arbiscan.io (free account)
- **GEMINI_API_KEY** — https://aistudio.google.com/app/apikey (free, no credit card)

## Security Categories

| Category | What Gets Checked |
|----------|-------------------|
| Reentrancy | External calls before state updates |
| Access Control | Role patterns, privilege escalation |
| Integer Safety | Overflow, unchecked blocks |
| Oracle Manipulation | Spot prices, flash loan vectors |
| Upgrade Safety | Proxy patterns, storage collisions |
| Asset Handling | ERC-20 safety, pull vs push |
| Arbitrum Specifics | block.number quirks, sequencer risks |
| Logic Errors | Business logic, invariants |

## Agent Registration

Registered on the Arbitrum Identity Registry (EIP-8004):
- Registry: 0x8004A818BFB912233c491871b3d84c89A494BD9e (Sepolia)
- Agent Name: ArbitrumContractAuditor

## Built With

- viem — Arbitrum interaction
- Google Gemini — AI security analysis (free)
- Arbiscan API — source code fetching

## License

MIT