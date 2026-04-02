---
name: arbitrum-contract-auditor
description: >
  AI-powered smart contract security auditor for Arbitrum. Given any deployed
  contract address on Arbitrum One or Arbitrum Sepolia, this skill fetches the
  verified source code via Arbiscan, runs a structured multi-category security
  analysis using an LLM, computes a risk score, and stores a cryptographic hash
  of the audit report on-chain as verifiable proof-of-audit.
tags:
  - arbitrum
  - security
  - audit
  - smart-contracts
  - on-chain
version: 1.0.0
---

# Arbitrum Contract Auditor

An AI agent skill that performs automated smart contract security analysis for
contracts deployed on Arbitrum, then records the audit result on-chain as
verifiable proof-of-audit.

## What It Does

1. Fetches verified source code + ABI from Arbiscan (One or Sepolia)
2. Analyses the contract across 8 security categories using an LLM
3. Scores the contract with a 0-100 risk score and severity breakdown
4. Stores a keccak256 hash of the report on Arbitrum as proof-of-audit
5. Returns a structured Markdown report with findings and recommendations

## Why This Is Novel

Most audit tools are off-chain only, manual, or not Arbitrum-aware.
This skill is the first Arbitrum-native, on-chain verified AI audit agent.
The on-chain hash means the audit is tamper-proof, timestamped, and verifiable
by anyone on Arbiscan. Future agents can query whether a contract was audited.

## Security Categories Analysed

| # | Category | What We Check |
|---|----------|--------------|
| 1 | Reentrancy | External calls before state updates, missing guards |
| 2 | Access Control | Role patterns, missing modifiers |
| 3 | Integer Safety | Overflow/underflow, unchecked blocks |
| 4 | Oracle Manipulation | Spot price usage, TWAP, flash loan vectors |
| 5 | Upgrade Safety | Proxy patterns, initializer gaps, storage collisions |
| 6 | Asset Handling | ERC-20 return values, pull vs push |
| 7 | Arbitrum Specifics | L1-L2 messaging, sequencer dependency, block.number quirks |
| 8 | Logic Errors | Business logic, invariant violations |

## Risk Score

- 0-20   LOW      Well-structured, minor improvements only
- 21-49  MEDIUM   Some concerns, review before interacting
- 50-74  HIGH     Significant issues, caution advised
- 75-100 CRITICAL Do not interact, likely exploitable

## Quick Start
```bash
npm install
cp .env.example .env
# fill in .env with your keys
node src/agent.js register --network sepolia
node src/agent.js audit 0xYourContractAddress --network sepolia
```

## Agent Identity

Registered on the Arbitrum Identity Registry (EIP-8004):
- Network: Arbitrum Sepolia
- Registry: 0x8004A818BFB912233c491871b3d84c89A494BD9e
- Agent Name: ArbitrumContractAuditor