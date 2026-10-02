import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, relative } from "node:path";
import OpenAI from "openai";

if (!process.env.OPENAI_API_KEY) {
  writeFileSync("reports/ai-findings.json", JSON.stringify({ skipped: true, reason: "OPENAI_API_KEY is not configured" }, null, 2));
  process.exit(0);
}

const root = process.cwd().replace(/\/audit$/, "");
const cfg = JSON.parse(readFileSync("config.json", "utf8"));
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const model = process.env.AUDIT_MODEL || "gpt-5.6-luna";

const files = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" })
  .split("\n").filter(Boolean)
  .filter(f => /\.(ts|tsx|mts|js|jsx)$/.test(f))
  .filter(f => !/node_modules|\.next|dist|coverage|test-artifacts/.test(f));

const findings = [];
for (const file of files) {
  const path = join(root, file);
  let code;
  try { code = readFileSync(path, "utf8"); } catch { continue; }
  if (Buffer.byteLength(code) > cfg.maxFileBytes) continue;

  const prompt = `You are auditing a production multi-tenant food-commerce system. Review the file below in repository context.

Find only concrete, actionable issues. Focus on:
- security: auth bypass, tenant isolation, injection, secrets, SSRF, CSRF, unsafe deserialization, insecure crypto, payment/webhook flaws
- correctness: bugs, race conditions, invalid state transitions, missing error handling
- code smells: duplication, dead code, excessive coupling, misleading abstractions
- performance: N+1 queries, unbounded work, missing pagination/timeouts
- maintainability/testing gaps that create material risk

Do not report style preferences. Do not invent missing context. If uncertain, omit the finding.

Return JSON only:
{"findings":[{"severity":"CRITICAL|HIGH|MEDIUM|LOW","category":"security|correctness|architecture|performance|maintainability|testing","title":"...","line":1,"evidence":"brief exact evidence","why":"impact","recommendation":"specific fix","confidence":0.0}]}

FILE: ${file}

CODE:
${code}`;

  const response = await client.responses.create({
    model,
    input: prompt,
    text: { format: { type: "json_object" } }
  });

  try {
    const parsed = JSON.parse(response.output_text);
    for (const f of (parsed.findings ?? []).slice(0, cfg.maxAiFindingsPerChunk)) {
      findings.push({ ...f, file });
    }
  } catch {
    // Keep the audit usable even if a model response is malformed.
  }
}

mkdirSync("reports", { recursive: true });
writeFileSync("reports/ai-findings.json", JSON.stringify({ model, findings }, null, 2));
