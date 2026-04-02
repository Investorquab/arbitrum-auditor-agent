/**
 * arbitrum-contract-auditor / src/auditor.js
 * Fetches contract source from Arbiscan, runs Groq AI analysis, formats report
 */

const ARBISCAN_ENDPOINTS = {
  mainnet: "https://api.etherscan.io/v2/api?chainid=42161",
  sepolia: "https://api.etherscan.io/v2/api?chainid=421614",
};

const RISK_BANDS = [
  { max: 20,  label: "LOW",      icon: "✅" },
  { max: 49,  label: "MEDIUM",   icon: "⚠️"  },
  { max: 74,  label: "HIGH",     icon: "🔴" },
  { max: 100, label: "CRITICAL", icon: "💀" },
];

// ── Fetch contract source from Arbiscan ───────────────────────────────────────

export async function fetchContractSource(address, network, apiKey) {
  const base = ARBISCAN_ENDPOINTS[network];
  if (!base) throw new Error(`Unknown network: ${network}`);

  const url = new URL(base);
  url.searchParams.set("module", "contract");
  url.searchParams.set("action", "getsourcecode");
  url.searchParams.set("address", address);
  url.searchParams.set("apikey", apiKey);

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Arbiscan HTTP error: ${res.status}`);

  const data = await res.json();
  if (data.status !== "1" || !data.result?.[0]) {
    throw new Error(`Arbiscan error: ${data.message || "Unknown error"}`);
  }

  const result = data.result[0];
  const isVerified = result.SourceCode && result.SourceCode.trim() !== "";

  return {
    address,
    network,
    contractName:     result.ContractName || "Unknown",
    compilerVersion:  result.CompilerVersion || "Unknown",
    optimizationUsed: result.OptimizationUsed === "1",
    sourceCode:       isVerified ? result.SourceCode : null,
    abi:              result.ABI !== "Contract source code not verified" ? result.ABI : null,
    isVerified,
    proxy:            result.Proxy === "1",
    implementation:   result.Implementation || null,
  };
}

export async function fetchContractInfo(address, network, apiKey) {
  const base = ARBISCAN_ENDPOINTS[network];
  const url = new URL(base);
  url.searchParams.set("module", "account");
  url.searchParams.set("action", "balance");
  url.searchParams.set("address", address);
  url.searchParams.set("apikey", apiKey);

  try {
    const res = await fetch(url.toString());
    const data = await res.json();
    const balanceEth =
      data.status === "1"
        ? (BigInt(data.result) / BigInt(1e18)).toString()
        : "unknown";
    return { balanceEth };
  } catch {
    return { balanceEth: "unknown" };
  }
}

// ── AI Analysis via Groq (FREE) ───────────────────────────────────────────────

export async function analyzeContract(contractData, groqApiKey) {
  const sourceDisplay = contractData.isVerified
    ? contractData.sourceCode.slice(0, 30000)
    : "[Source not verified on Arbiscan — structural analysis only]";

  const prompt = `You are an expert smart contract security auditor specialising in Arbitrum L2 contracts.

Analyse this Arbitrum smart contract and produce a structured JSON security report.
Respond with ONLY valid JSON, no markdown fences, no text outside the JSON.

JSON schema:
{
  "riskScore": <integer 0-100>,
  "summary": "<2-3 sentence executive summary>",
  "findings": [
    {
      "id": "C-01",
      "severity": "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO",
      "category": "<category name>",
      "title": "<short title>",
      "description": "<detailed description>",
      "location": "<function or line>",
      "recommendation": "<how to fix>"
    }
  ],
  "categories": {
    "reentrancy":         { "score": <0-10>, "notes": "<brief>" },
    "accessControl":      { "score": <0-10>, "notes": "<brief>" },
    "integerSafety":      { "score": <0-10>, "notes": "<brief>" },
    "oracleManipulation": { "score": <0-10>, "notes": "<brief>" },
    "upgradeSafety":      { "score": <0-10>, "notes": "<brief>" },
    "assetHandling":      { "score": <0-10>, "notes": "<brief>" },
    "arbitrumSpecifics":  { "score": <0-10>, "notes": "<brief>" },
    "logicErrors":        { "score": <0-10>, "notes": "<brief>" }
  },
  "positives": ["<good practice observed>"],
  "overallRecommendation": "<1-2 sentence verdict>"
}

Contract Details:
- Name: ${contractData.contractName}
- Network: ${contractData.network}
- Address: ${contractData.address}
- Compiler: ${contractData.compilerVersion}
- Is Proxy: ${contractData.proxy}
- ETH Balance: ${contractData.balanceEth} ETH

Source Code:
${sourceDisplay}

Respond with ONLY the JSON object, nothing else.`;

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${groqApiKey}`,
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
      max_tokens: 4096,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Groq API error ${res.status}: ${err}`);
  }

  const data = await res.json();
  const raw = data?.choices?.[0]?.message?.content;
  if (!raw) throw new Error("Groq returned empty response");

  const cleaned = raw.trim().replace(/^```json\n?/, "").replace(/\n?```$/, "").trim();

  try {
    return JSON.parse(cleaned);
  } catch (e) {
    throw new Error(`Groq returned invalid JSON: ${e.message}\n\nRaw: ${raw.slice(0, 500)}`);
  }
}

// ── Report Formatter ──────────────────────────────────────────────────────────

export function formatReport(contractData, analysis, proofTx) {
  const { riskScore, summary, findings, categories, positives, overallRecommendation } = analysis;
  const band = RISK_BANDS.find((b) => riskScore <= b.max) || RISK_BANDS[3];

  const severityOrder = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"];
  const grouped = {};
  for (const sev of severityOrder) {
    grouped[sev] = findings.filter((f) => f.severity === sev);
  }

  const countsBySev = severityOrder.map((s) => `${s}: ${grouped[s].length}`).join(" | ");
  const line     = "═".repeat(60);
  const thinLine = "─".repeat(60);

  let report = `
╔${line}╗
║  ARBITRUM CONTRACT AUDIT REPORT                           ║
╠${line}╣
║  Contract : ${contractData.address.slice(0,44).padEnd(44)}║
║  Name     : ${contractData.contractName.slice(0,44).padEnd(44)}║
║  Network  : ${contractData.network.padEnd(44)}║
║  Audited  : ${new Date().toISOString().padEnd(44)}║
║  Risk     : ${(band.icon+" "+band.label+" (Score: "+riskScore+"/100)").slice(0,44).padEnd(44)}║
${proofTx ? `║  Proof TX : ${proofTx.slice(0,44).padEnd(44)}║\n` : ""}╚${line}╝

## Summary

${summary}

**Findings: ${countsBySev}**

`;

  for (const sev of severityOrder) {
    const items = grouped[sev];
    if (items.length === 0) continue;
    const icons = { CRITICAL:"💀", HIGH:"🔴", MEDIUM:"⚠️", LOW:"🟡", INFO:"ℹ️" };
    report += `## ${icons[sev]} ${sev} (${items.length} finding${items.length > 1 ? "s" : ""})\n\n`;
    for (const f of items) {
      report += `### [${f.id}] ${f.title}\n`;
      report += `- **Category**: ${f.category}\n`;
      if (f.location) report += `- **Location**: \`${f.location}\`\n`;
      report += `\n${f.description}\n\n`;
      report += `**Recommendation**: ${f.recommendation}\n\n`;
      report += `${thinLine}\n\n`;
    }
  }

  report += `## Category Breakdown\n\n`;
  report += `| Category | Risk (0-10) | Notes |\n`;
  report += `|----------|-------------|-------|\n`;

  const catLabels = {
    reentrancy:         "Reentrancy",
    accessControl:      "Access Control",
    integerSafety:      "Integer Safety",
    oracleManipulation: "Oracle Manipulation",
    upgradeSafety:      "Upgrade Safety",
    assetHandling:      "Asset Handling",
    arbitrumSpecifics:  "Arbitrum Specifics",
    logicErrors:        "Logic Errors",
  };

  for (const [key, label] of Object.entries(catLabels)) {
    const cat = categories[key] || { score: 0, notes: "N/A" };
    const bar = "█".repeat(cat.score) + "░".repeat(10 - cat.score);
    report += `| ${label} | ${bar} ${cat.score}/10 | ${cat.notes} |\n`;
  }

  if (positives?.length > 0) {
    report += `\n## ✅ Security Positives\n\n`;
    for (const p of positives) report += `- ${p}\n`;
  }

  report += `\n## Overall Recommendation\n\n${overallRecommendation}\n`;

  if (proofTx) {
    report += `\n## On-Chain Proof\n\n`;
    report += `- **Transaction**: \`${proofTx}\`\n`;
    report += `- **Verify**: https://${contractData.network === "sepolia" ? "sepolia." : ""}arbiscan.io/tx/${proofTx}\n`;
  }

  report += `\n---\n*Generated by ArbitrumContractAuditor — AI audit agent on Arbitrum*\n`;
  return report;
}

export function getRiskBand(score) {
  return RISK_BANDS.find((b) => score <= b.max) || RISK_BANDS[3];
}