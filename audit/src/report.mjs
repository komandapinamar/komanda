import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";

mkdirSync("reports", { recursive: true });
const read = (p, fallback) => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return fallback; } };
const stat = read("reports/static-findings.json", { findings: [] });
const ai = read("reports/ai-findings.json", { findings: [] });

const all = [...(stat.findings ?? []), ...(ai.findings ?? [])];
const key = f => `${f.file}|${f.line ?? ""}|${String(f.title).toLowerCase().replace(/\\W+/g, " ").trim()}`;
const unique = [...new Map(all.map(f => [key(f), f])).values()];
const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFO: 4 };
unique.sort((a,b) => (order[a.severity] ?? 9) - (order[b.severity] ?? 9));

const counts = Object.fromEntries(Object.keys(order).map(k => [k, unique.filter(f => f.severity === k).length]));
const lines = [
  "# Komanda — Full Repository Audit",
  "",
  `Commit: ${stat.commit ?? "unknown"}`,
  `Generated: ${stat.generatedAt ?? new Date().toISOString()}`,
  "",
  "## Summary",
  "",
  `- Critical: ${counts.CRITICAL}`,
  `- High: ${counts.HIGH}`,
  `- Medium: ${counts.MEDIUM}`,
  `- Low: ${counts.LOW}`,
  `- Info: ${counts.INFO}`,
  "",
  "## Findings",
  ""
];

for (const f of unique) {
  lines.push(`### [${f.severity}] ${f.title}`);
  lines.push(`**Category:** ${f.category}  `);
  lines.push(`**Location:** ${f.file}${f.line ? `:${f.line}` : ""}`);
  if (f.evidence) lines.push(`\n**Evidence:** ${String(f.evidence).replace(/\\n/g, " ")}`);
  if (f.why) lines.push(`\n**Impact:** ${f.why}`);
  if (f.recommendation) lines.push(`\n**Recommendation:** ${f.recommendation}`);
  lines.push("");
}

writeFileSync("reports/audit.md", lines.join("\n"));
console.log(lines.join("\n"));
