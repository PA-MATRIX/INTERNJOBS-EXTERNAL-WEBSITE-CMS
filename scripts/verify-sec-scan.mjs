#!/usr/bin/env node
// SEC-01 read-only verifier (Phase 39-01).
// Modes: --gate-prev <N>, --scan-record <rec>, --scan-coverage <rec> --source github|local --mirror <bare>
//        [--require-ref <ref>]..., --guard --baseline <json> --scratch <dir>, --gh-log <tsv> [--approved <json>]
// Failure output names the failed check, never a matched value.
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs as baseParseArgs, scanSecrets } from "./verify-code-maps.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_PHASES_DIR = ".planning/milestones/v1.6-repo-split/phases";
const CLASSES = ["real", "false-positive", "test-fixture", "public-by-design"];
const SOURCES = ["github", "local"];

/** parseArgs from verify-code-maps plus repeatable --require-ref (collected into an array). */
export function parseArgs(argv) {
  const req = [];
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--require-ref" && argv[i + 1] !== undefined) {
      req.push(argv[i + 1]);
      i++;
    } else rest.push(argv[i]);
  }
  const out = baseParseArgs(rest);
  out["require-ref"] = req;
  return out;
}

export function refsDigest(refs) {
  return createHash("sha256")
    .update(refs.map((r) => `${r.source}\t${r.ref}\t${r.tip}`).sort().join("\n"))
    .digest("hex");
}

const nonEmpty = (v) => typeof v === "string" && v.trim() !== "";

export function gatePrev(n, phasesDir = DEFAULT_PHASES_DIR) {
  const problems = [];
  let dir = null;
  if (existsSync(phasesDir)) {
    const hit = readdirSync(phasesDir).find((d) => d.startsWith(`${n}-`));
    if (hit) dir = path.join(phasesDir, hit);
  }
  if (!dir) return [`gate: phase ${n} directory not found`];
  const f = path.join(dir, `${n}-VERIFICATION.md`);
  if (!existsSync(f)) return [`gate: ${n}-VERIFICATION.md missing`];
  const text = readFileSync(f, "utf8");
  const fm = /^---\n([\s\S]*?)\n---/.exec(text);
  if (!fm || !/^status:\s*passed\s*$/m.test(fm[1])) problems.push(`gate: ${n}-VERIFICATION.md status is not passed`);
  return problems;
}

/** Returns problems (empty = ok). `rec` is the parsed record, `raw` its text. */
export function checkScanRecord(rec, raw) {
  const p = [];
  const leaks = scanSecrets(raw);
  if (leaks.length) p.push(`leak: record text matches secret pattern(s): ${leaks.join(", ")}`);
  const tools = Array.isArray(rec.tools) ? rec.tools : rec.tool ? [rec.tool] : [];
  if (!tools.length) p.push("schema: no tool recorded");
  tools.forEach((t, i) => {
    if (!t || !nonEmpty(t.name)) p.push(`schema: tool[${i}] name empty`);
    if (!t || !nonEmpty(t.version)) p.push(`schema: tool[${i}] version empty`);
  });
  if (rec.redacted !== true) p.push("schema: redacted is not true");
  if (!Array.isArray(rec.refs) || !rec.refs.length) p.push("schema: refs missing or empty");
  else {
    rec.refs.forEach((r, i) => {
      if (!r || !nonEmpty(r.ref) || !nonEmpty(r.tip)) p.push(`schema: refs[${i}] lacks ref/tip`);
      else if (!SOURCES.includes(r.source)) p.push(`schema: refs[${i}] source not github|local`);
    });
    if (rec.coverage_digest !== refsDigest(rec.refs)) p.push("digest: coverage_digest does not match refs");
  }
  const findings = Array.isArray(rec.findings) ? rec.findings : null;
  if (!findings) p.push("schema: findings not an array");
  else {
    if (rec.finding_count !== findings.length) p.push("schema: finding_count differs from findings.length");
    findings.forEach((f, i) => {
      if (!f || typeof f !== "object") return p.push(`schema: findings[${i}] not an object`);
      for (const k of ["file", "rule", "commit", "fingerprint"]) {
        if (!nonEmpty(f[k])) p.push(`schema: findings[${i}] lacks ${k}`);
      }
      if (!CLASSES.includes(f.classification)) p.push(`schema: findings[${i}] classification invalid`);
      if (f.classification === "real") {
        const r = f.rotated;
        if (!r || r.done !== true || !nonEmpty(r.date) || !nonEmpty(r.where))
          p.push(`rotation: findings[${i}] is real without a complete rotation entry`);
      }
    });
  }
  return p;
}

function mirrorRefs(mirror) {
  const out = execFileSync("git", ["for-each-ref", "--format=%(refname) %(objectname)"], {
    cwd: mirror, encoding: "utf8", env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
  });
  return out.split("\n").filter(Boolean).map((l) => {
    const [ref, tip] = l.split(" ");
    return { ref, tip };
  });
}

export function checkCoverage(rec, { source, mirror, requireRefs = [] }) {
  const p = [];
  if (!SOURCES.includes(source)) return ["coverage: --source github|local required"];
  if (!mirror || !existsSync(mirror)) return ["coverage: --mirror missing or not found"];
  if (!nonEmpty(rec.pull_refs_note)) p.push("coverage: pull_refs_note empty");
  const mine = (rec.refs || []).filter((r) => r.source === source);
  let actual;
  try {
    actual = mirrorRefs(mirror);
  } catch {
    return [...p, "coverage: git for-each-ref failed on mirror"];
  }
  const key = (r) => `${r.ref} ${r.tip}`;
  const a = new Set(actual.map(key));
  const b = new Set(mine.map(key));
  for (const k of a) if (!b.has(k)) p.push(`coverage: ${source} mirror ref not in record (missing or tip moved): ${k.split(" ")[0]}`);
  for (const k of b) if (!a.has(k)) p.push(`coverage: record ${source} ref not in mirror (extra or tip moved): ${k.split(" ")[0]}`);
  const names = new Set(mine.map((r) => r.ref));
  for (const want of requireRefs) {
    if (!names.has(want) && !names.has(`refs/heads/${want}`)) p.push(`coverage: required ref absent from ${source} refs: ${want}`);
  }
  return p;
}

function readJson(f, label) {
  if (!f || typeof f !== "string" || !existsSync(f)) throw new Error(`${label} not found`);
  const raw = readFileSync(f, "utf8");
  try {
    return { obj: JSON.parse(raw), raw };
  } catch {
    throw new Error(`${label} is not valid JSON`);
  }
}

function report(tag, problems) {
  if (problems.length) {
    for (const x of problems) console.log(`${tag} FAIL: ${x}`);
    return 1;
  }
  console.log(`${tag} OK`);
  return 0;
}

export function main(argv) {
  const a = parseArgs(argv);
  try {
    if (a["gate-prev"] !== undefined) {
      if (typeof a["gate-prev"] !== "string") return report("GATE", ["gate: phase number required"]);
      return report("GATE", gatePrev(a["gate-prev"], typeof a["phases-dir"] === "string" ? a["phases-dir"] : DEFAULT_PHASES_DIR));
    }
    if (a["scan-record"] !== undefined) {
      const { obj, raw } = readJson(a["scan-record"], "record");
      return report("SCAN-RECORD", checkScanRecord(obj, raw));
    }
    if (a["scan-coverage"] !== undefined) {
      const { obj } = readJson(a["scan-coverage"], "record");
      return report("SCAN-COVERAGE", checkCoverage(obj, { source: a.source, mirror: a.mirror, requireRefs: a["require-ref"] }));
    }
  } catch (e) {
    console.log(`FAIL: ${e.message}`);
    return 1;
  }
  console.error("not implemented");
  return 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
