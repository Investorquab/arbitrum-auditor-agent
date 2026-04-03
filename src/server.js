/**
 * arbitrum-contract-auditor / src/server.js
 * Express API server — deploy on Render for public access
 */

import express from "express";
import { config } from "dotenv";
import {
  fetchContractSource,
  fetchContractInfo,
  analyzeContract,
  formatReport,
  getRiskBand,
} from "./auditor.js";

config();

const app = express();
app.use(express.json());

// Allow CORS for web access
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  next();
});

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({
    name: "ArbitrumContractAuditor",
    description: "AI-powered smart contract security auditor for Arbitrum",
    version: "1.0.0",
    status: "online",
    registered_on: "Arbitrum Sepolia Identity Registry (ERC-8004)",
    agent_address: "0xcD7f401774D579B16CEBc5e52550E245d6D88420",
    registration_tx: "0x26a4a3a4e7590aa851fd022e22dd96dbb245b2de7ca71476d26da72cd304209b",
    endpoints: {
      audit: "POST /audit",
      health: "GET /health",
    },
    example: {
      method: "POST",
      path: "/audit",
      body: {
        address: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
        network: "mainnet",
      },
    },
  });
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ── Main audit endpoint ───────────────────────────────────────────────────────
app.post("/audit", async (req, res) => {
  const { address, network = "mainnet" } = req.body;

  if (!address || !address.startsWith("0x")) {
    return res.status(400).json({
      error: "Invalid request. Provide a valid contract address starting with 0x",
      example: { address: "0x1F98431c8aD98523631AE4a59f267346ea31F984", network: "mainnet" },
    });
  }

  if (!["mainnet", "sepolia"].includes(network)) {
    return res.status(400).json({ error: "Network must be 'mainnet' or 'sepolia'" });
  }

  console.log(`[${new Date().toISOString()}] Auditing ${address} on ${network}`);

  try {
    const arbiscanApiKey = process.env.ARBISCAN_API_KEY;
    const geminiApiKey = process.env.GEMINI_API_KEY;

    if (!arbiscanApiKey || !geminiApiKey) {
      return res.status(500).json({ error: "Server configuration error — API keys missing" });
    }

    // Fetch contract source
    const contractData = await fetchContractSource(address, network, arbiscanApiKey);
    const info = await fetchContractInfo(address, network, arbiscanApiKey);
    contractData.balanceEth = info.balanceEth;

    // Run AI analysis
    const analysis = await analyzeContract(contractData, geminiApiKey);
    const band = getRiskBand(analysis.riskScore);
    const report = formatReport(contractData, analysis, null);

    return res.json({
      success: true,
      contract: {
        address,
        network,
        name: contractData.contractName,
        verified: contractData.isVerified,
        compiler: contractData.compilerVersion,
        proxy: contractData.proxy,
      },
      audit: {
        riskScore: analysis.riskScore,
        riskLevel: band.label,
        riskIcon: band.icon,
        summary: analysis.summary,
        findingsCount: analysis.findings.length,
        findings: analysis.findings,
        categories: analysis.categories,
        positives: analysis.positives,
        overallRecommendation: analysis.overallRecommendation,
      },
      report,
      agent: {
        address: "0xcD7f401774D579B16CEBc5e52550E245d6D88420",
        registrationTx: "0x26a4a3a4e7590aa851fd022e22dd96dbb245b2de7ca71476d26da72cd304209b",
        registry: "Arbitrum Sepolia Identity Registry (ERC-8004)",
      },
      auditedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error(`Audit error: ${err.message}`);
    return res.status(500).json({
      error: err.message,
      hint: "Make sure the contract address is valid and verified on Arbiscan",
    });
  }
});

// ── Start server ──────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🛡  ArbitrumContractAuditor API running on port ${PORT}`);
  console.log(`   POST /audit  — submit a contract address to audit`);
  console.log(`   GET  /       — agent info`);
});
