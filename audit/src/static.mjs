import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd().replace(/\/audit$/, "");
const out = join(process.cwd(), "reports");
mkdirSync(out, { recursive: true });

const run = (cmd, args, cwd = root) => {
  try {
    return { ok: true, stdout: execFileSync(cmd, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }) };
  } catch (e) {
    return { ok: false, stdout: e.stdout ?? "", stderr: e.stderr ?? "", status: e.status ?? 1 };
  }
};

const findings = [];
const add = (severity, category, title, file, evidence, recommendation) =>
  findings.push({ severity, category, title, file, evidence: String(evidence).slice(0, 800), recommendation });

const secretPatterns = [
  /MERCADOPAGO_CLIENT_SECRET\s*:\s*[^$\s"']+/g,
  /MERCADOPAGO_WEBHOOK_SECRET\s*:\s*[^$\s"']+/g,
  /(api[_-]?key|secret|token|password)\s*[:=]\s*["'][^"'\n]{16,}["']/gi
];

const tracked = run("git", ["ls-files"]).stdout.split("\n").filter(Boolean);
for (const file of tracked) {
  const p = join(root, file);
  let text = "";
  try { if (statSync(p).isFile()) text = readFileSync(p, "utf8"); } catch {}
  if (!text) continue;

  for (const re of secretPatterns) {
    for (const match of text.matchAll(re)) {
      const value = match[0].replace(/(["'])([^"']+)\1/, "$1[REDACTED]$1");
      add("CRITICAL", "security", "Potential hard-coded credential", file, value,
        "Remove the credential from git history and rotate/revoke it. Use GitHub Actions secrets or the runtime secret manager.");
    }
  }

  if (file === ".github/workflows/core-ci.yml" && /MERCADOPAGO_CLIENT_SECRET:\s*[^$\n]+/.test(text)) {
    add("CRITICAL", "security", "CI workflow contains a Mercado Pago client secret",
      file, "MERCADOPAGO_CLIENT_SECRET is assigned a literal value in the workflow.",
      "Move the value to GitHub Actions Secrets and rotate the exposed credential.");
  }
}

const commands = [
  ["npm", ["audit", "--audit-level=high"], join(root, "src"), "dependency"],
  ["npx", ["--yes", "eslint", ".", "--max-warnings=0"], join(root, "src"), "lint"],
  ["npx", ["--yes", "tsc", "--noEmit"], join(root, "src"), "typecheck"]
];

for (const [cmd, args, cwd, category] of commands) {
  const r = run(cmd, args, cwd);
  writeFileSync(join(out, `${category}.log`), r.stdout + (r.stderr ?? ""));
  if (!r.ok) add("HIGH", category, `${category} check reported failures`, "project", r.stdout || r.stderr,
    `Fix the reported ${category} findings and rerun the repository audit.`);
}

const semgrep = run("semgrep", ["scan", "--config", "p/owasp-top-ten", "--json", "--output", join(out, "semgrep.json")]);
if (!semgrep.ok && !readFileSync(join(out, "semgrep.json"), "utf8", { flag: "a" }).trim()) {
  writeFileSync(join(out, "semgrep.json"), JSON.stringify({ error: semgrep.stderr ?? semgrep.stdout }));
}

writeFileSync(join(out, "static-findings.json"), JSON.stringify({
  generatedAt: new Date().toISOString(),
  branch: run("git", ["branch", "--show-current"]).stdout.trim(),
  commit: run("git", ["rev-parse", "HEAD"]).stdout.trim(),
  findings
}, null, 2));
