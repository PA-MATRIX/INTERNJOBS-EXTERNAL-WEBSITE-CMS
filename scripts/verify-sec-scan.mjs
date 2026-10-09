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

/** Guard: scratch mirror gone and Parrot/legacy untouched (delegated runner returns 0). */
export function guardScan({ baseline, scratch, runner }) {
  const problems = [];
  if (scratch && existsSync(scratch)) problems.push("guard: scratch mirror directory still exists");
  const run = runner || defaultGuardRunner;
  let code;
  try {
    code = run(baseline);
  } catch {
    code = 1;
  }
  if (code !== 0) problems.push("guard: verify-code-maps --guard did not return 0");
  return { ok: problems.length === 0, problems };
}

function defaultGuardRunner(baseline) {
  const r = spawnSync("node", [path.join(here, "verify-code-maps.mjs"), "--guard", "--baseline", baseline], {
    encoding: "utf8", env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
  });
  return r.status === null ? 1 : r.status;
}

// ---- gh/brew/docker/git command log: default-deny ----
function shellSplit(line) {
  const out = [];
  let cur = "";
  let q = null;
  let has = false;
  for (const ch of line) {
    if (q) {
      if (ch === q) q = null;
      else cur += ch;
    } else if (ch === '"' || ch === "'") {
      q = ch;
      has = true;
    } else if (/\s/.test(ch)) {
      if (cur !== "" || has) out.push(cur);
      cur = "";
      has = false;
    } else cur += ch;
  }
  if (cur !== "" || has) out.push(cur);
  return out;
}

const PROBE = "zz-sec03-probe-";
const GIT_READ = new Set([
  "status", "log", "show", "diff", "rev-parse", "for-each-ref", "ls-tree", "cat-file", "rev-list",
  "merge-base", "describe", "ls-files", "show-ref", "shortlog", "blame", "ls-remote",
]);
const GH_READ = {
  repo: ["view", "list"],
  pr: ["list", "view", "diff", "checks"],
  issue: ["list", "view"],
  run: ["list", "view"],
  release: ["list", "view"],
  auth: ["status"],
};
const API_VALUE_FLAGS = new Set(["--jq", "-q", "-H", "--header"]);
const API_BOOL_FLAGS = new Set(["--paginate", "-i", "--include", "--slurp", "--silent"]);

/** True if the line has an unquoted control operator/redirect, or a substitution anywhere
 *  outside single quotes. Quote-aware: `--jq '.a | .b'` is fine, `x; y` is not. */
export function hasShellControl(cmd) {
  let q = null;
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i];
    if (q === "'") { if (c === "'") q = null; continue; }
    if (c === "\\") { i++; continue; }
    if (c === "`" || (c === "$" && cmd[i + 1] === "(")) return true;
    if (q === '"') { if (c === '"') q = null; continue; }
    if (c === "'" || c === '"') { q = c; continue; }
    if (";&|<>\n\r".includes(c)) return true;
  }
  return q !== null; // unterminated quote: refuse
}

/** "allowed" | "approvable" | "never" */
export function classifyCommand(cmd) {
  if (hasShellControl(cmd)) return "never"; // chained/substituted: never one reviewable command
  const t = shellSplit(cmd);
  if (!t.length) return "approvable";
  if (t[0] === "gh") return classifyGh(t.slice(1));
  if (t[0] === "git") return classifyGit(t.slice(1));
  return "approvable"; // brew, docker, anything unlisted: only with approval
}

function classifyGh(a) {
  if (!a.length) return "approvable";
  if (a.includes("--help") || a[0] === "--help") return "allowed";
  if (a.length === 1 && a[0] === "--version") return "allowed";
  if (a[0] === "api") return classifyApi(a.slice(1));
  const sub = GH_READ[a[0]];
  if (sub && sub.includes(a[1])) return "allowed";
  return "approvable";
}

function classifyApi(a) {
  let path = null;
  for (let i = 0; i < a.length; i++) {
    let f = a[i];
    let val;
    const eq = f.startsWith("--") ? f.indexOf("=") : -1;
    if (eq > 0) {
      val = f.slice(eq + 1);
      f = f.slice(0, eq);
    }
    if (f === "--method" || f === "-X" || /^-X./.test(f)) {
      const m = /^-X(.+)$/.exec(f) ? /^-X(.+)$/.exec(f)[1] : val !== undefined ? val : a[++i];
      if (String(m).toUpperCase() !== "GET") return "approvable";
    } else if (API_VALUE_FLAGS.has(f)) {
      if (val === undefined) i++;
    } else if (API_BOOL_FLAGS.has(f)) {
      // fine
    } else if (f.startsWith("-")) {
      return "approvable"; // -f -F --field --raw-field --input and any unknown flag
    } else if (path === null) path = f;
    else return "approvable";
  }
  if (path === null || path === "graphql") return "approvable";
  return "allowed";
}

function classifyGit(a) {
  let dir = null;
  let i = 0;
  while (i < a.length && a[i].startsWith("-")) {
    if (a[i] === "-C") {
      dir = a[i + 1] || "";
      i += 2;
    } else if (a[i] === "-c") i += 2;
    else i++;
  }
  const sub = a[i];
  const rest = a.slice(i + 1);
  if (sub === "push" || sub === "commit") {
    const inProbe = dir !== null && dir.includes(PROBE);
    if (!inProbe) return "never";
    if (sub === "push") {
      const remote = rest.find((x) => !x.startsWith("-"));
      if (remote !== "origin" && !(remote || "").includes(PROBE)) return "never";
    }
    return "approvable";
  }
  if (sub === "clone") return "approvable";
  if (sub && GIT_READ.has(sub)) return "allowed";
  if (sub === "worktree" && rest[0] === "list") return "allowed";
  return "approvable";
}

export function checkGhLog(logText, approved) {
  const p = [];
  const lines = (logText || "").split("\n").filter((l) => l.trim() !== "");
  if (!lines.length) return ["ghlog: log is empty (absence of evidence is not a pass)"];
  const entries = (approved && Array.isArray(approved.approved) ? approved.approved : []).map((e) => ({
    cmd: e && e.cmd, at: Date.parse(e && e.approved_at),
  }));
  lines.forEach((line, idx) => {
    const n = idx + 1;
    const tab = line.indexOf("\t");
    if (tab < 0) return p.push(`ghlog: line ${n} malformed (no tab)`);
    const ts = Date.parse(line.slice(0, tab));
    const cmd = line.slice(tab + 1);
    if (Number.isNaN(ts)) return p.push(`ghlog: line ${n} has an invalid timestamp`);
    const cls = classifyCommand(cmd);
    if (cls === "allowed") return;
    if (cls === "never") return p.push(`ghlog: line ${n} is a never-approvable write`);
    const hit = entries.some((e) => e.cmd === cmd && !Number.isNaN(e.at) && ts >= e.at);
    if (!hit) p.push(`ghlog: line ${n} is not read-only and has no approval at or before its timestamp`);
  });
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
    if (a.guard) {
      if (typeof a.baseline !== "string") return report("GUARD", ["guard: --baseline required"]);
      const r = guardScan({ baseline: a.baseline, scratch: typeof a.scratch === "string" ? a.scratch : null });
      return report("GUARD", r.problems);
    }
    if (a["gh-log"] !== undefined) {
      const f = a["gh-log"];
      if (typeof f !== "string" || !existsSync(f)) return report("GH-LOG", ["ghlog: log file missing"]);
      const approved = typeof a.approved === "string" ? readJson(a.approved, "approved file").obj : null;
      return report("GH-LOG", checkGhLog(readFileSync(f, "utf8"), approved));
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
