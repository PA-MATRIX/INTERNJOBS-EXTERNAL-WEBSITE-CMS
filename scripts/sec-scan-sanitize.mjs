#!/usr/bin/env node
// SEC-01 report sanitizer (Phase 39-04). Turns a REDACTED gitleaks JSON report into the
// value-free scan record. Only an allowlist of non-value fields is ever copied.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { refsDigest } from "./verify-sec-scan.mjs";

/**
 * @param {object[]} report gitleaks JSON entries (must be produced with --redact=100)
 * @param {{refs:object[], tool?:object, tools?:object[], classifications?:Record<string,{classification:string,disposition?:string,rotated?:object}>, [k:string]:any}} meta
 */
export function sanitizeReport(report, meta = {}) {
  if (!Array.isArray(report)) throw new Error("report must be an array");
  const tools = Array.isArray(meta.tools) ? meta.tools : meta.tool ? [meta.tool] : [];
  for (const t of tools) {
    if (t.redact !== 100) throw new Error("redaction required: tool.redact must be 100");
  }
  report.forEach((e, i) => {
    if (e.Secret !== "REDACTED") throw new Error(`redaction required: report entry ${i} Secret is not REDACTED`);
  });
  const cls = meta.classifications || {};
  const findings = report.map((e) => {
    const c = cls[e.Fingerprint] || {};
    const f = {
      file: e.File,
      rule: e.RuleID,
      commit: e.Commit,
      fingerprint: e.Fingerprint,
      classification: c.classification || "unclassified",
      disposition: c.disposition || "",
    };
    if (c.rotated) f.rotated = c.rotated;
    return f;
  });
  const { classifications: _c, tool: _t, tools: _ts, refs, ...rest } = meta;
  return {
    ...rest,
    ...(meta.tools ? { tools: meta.tools } : { tool: meta.tool }),
    redacted: true,
    refs,
    coverage_digest: refsDigest(refs || []),
    finding_count: findings.length,
    findings,
  };
}

function main(argv) {
  const get = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
  const [rep, meta, out] = [get("--report"), get("--meta"), get("--out")];
  if (!rep || !meta || !out) { console.error("usage: --report <json> --meta <json> --out <json>"); return 2; }
  try {
    const record = sanitizeReport(JSON.parse(readFileSync(rep, "utf8")), JSON.parse(readFileSync(meta, "utf8")));
    writeFileSync(out, JSON.stringify(record, null, 2) + "\n");
    console.log(`sanitized ${record.finding_count} finding(s)`);
    return 0;
  } catch (e) {
    console.error(`sanitize failed: ${e.message}`);
    return 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exit(main(process.argv.slice(2)));
