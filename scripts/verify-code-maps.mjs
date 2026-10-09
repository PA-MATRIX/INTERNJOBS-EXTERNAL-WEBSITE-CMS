#!/usr/bin/env node
// Phase 38 read-only verifier (v1.6 repo split).
// Modes: --gate-prev, --snapshot, --guard, --parrot-preflight, --parrot-ff-check.
// Every git call against legacy/Parrot runs with GIT_OPTIONAL_LOCKS=0 and uses read-only
// plumbing (ls-files, rev-parse, for-each-ref, merge-base, worktree list). Plain `git status`
// is never used because it refreshes (writes) the index.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const LEGACY_FILES = [
  "package.json",
  "package-lock.json",
  "src/app/api/chat/route.ts",
  "tests/e2e/chat-interface.spec.ts",
];
const DEFAULT_PHASES_DIR = ".planning/milestones/v1.6-repo-split/phases";

export function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        out[a.slice(2)] = next;
        i++;
      } else out[a.slice(2)] = true;
    } else out._.push(a);
  }
  return out;
}

export function hashFile(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function git(repo, args) {
  return execFileSync("git", ["-C", repo, ...args], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  });
}
function tryGit(repo, args) {
  try {
    return git(repo, args).trim();
  } catch {
    return null;
  }
}
const lines0 = (s) => s.split("\0").filter(Boolean).sort();

function indexStat(repo) {
  const s = statSync(path.join(repo, ".git", "index"));
  return { mtimeMs: s.mtimeMs, size: s.size };
}

function uncommitted(repo) {
  return {
    modified: lines0(git(repo, ["ls-files", "-m", "-z"])),
    untracked: lines0(git(repo, ["ls-files", "-o", "--exclude-standard", "-z"])),
  };
}

function isDirty(repo) {
  return (
    git(repo, ["ls-files", "-m", "-z"]).length > 0 ||
    git(repo, ["diff", "--cached", "--name-only"]).trim().length > 0
  );
}

function parseWorktrees(repo) {
  const blocks = git(repo, ["worktree", "list", "--porcelain"]).split(/\n\n+/).filter((b) => b.trim());
  return blocks.map((b) => {
    const o = {};
    for (const l of b.split("\n")) {
      const [k, ...v] = l.split(" ");
      o[k] = v.join(" ");
    }
    return { path: o.worktree, head: o.HEAD, branch: (o.branch || "").replace(/^refs\/heads\//, "") || null };
  });
}

function parrotState(repo) {
  const wts = parseWorktrees(repo);
  const branches = {};
  for (const l of git(repo, ["for-each-ref", "--format=%(refname:short) %(objectname)", "refs/heads"]).split("\n")) {
    if (!l.trim()) continue;
    const [n, sha] = l.split(" ");
    if (n !== "main") branches[n] = sha;
  }
  return {
    path: repo,
    head: tryGit(repo, ["rev-parse", "refs/heads/main"]),
    origin_main: tryGit(repo, ["rev-parse", "refs/remotes/origin/main"]),
    worktrees: wts.slice(1).map(({ path: p, head, branch }) => ({ path: p, head, branch })),
    branches,
  };
}

function legacyState(repo) {
  const files = {};
  for (const f of LEGACY_FILES) {
    const p = path.join(repo, f);
    files[f] = existsSync(p) ? hashFile(p) : null;
  }
  return {
    path: repo,
    head: tryGit(repo, ["rev-parse", "HEAD"]),
    files,
    ...uncommitted(repo),
    index: indexStat(repo),
  };
}

export function snapshot({ legacy, parrot, cms }) {
  return {
    schema: 1,
    taken_at: new Date().toISOString(),
    cms_preexisting: (() => {
      const u = uncommitted(cms);
      return { path: cms, modified: u.modified, untracked: u.untracked };
    })(),
    legacy: legacyState(legacy),
    parrot: parrotState(parrot),
  };
}

function loadRecord(file) {
  if (!file || !existsSync(file)) return null;
  try {
    const r = JSON.parse(readFileSync(file, "utf8"));
    for (const k of ["approved_by", "approved_at", "before_sha", "after_sha"]) {
      if (typeof r[k] !== "string" || !r[k]) return null;
    }
    return r;
  } catch {
    return null;
  }
}

const cmpList = (label, a, b, diffs) => {
  const sa = new Set(a), sb = new Set(b);
  for (const x of a) if (!sb.has(x)) diffs.push(`${label}: missing now: ${x}`);
  for (const x of b) if (!sa.has(x)) diffs.push(`${label}: new: ${x}`);
};

function compareWorktreesAndBranches(base, live, diffs) {
  for (const w of base.worktrees) {
    const l = live.worktrees.find((x) => x.branch === w.branch);
    if (!l) diffs.push(`parrot worktree missing: ${w.branch} (${w.path})`);
    else if (l.head !== w.head) diffs.push(`parrot worktree ${w.branch} HEAD ${w.head} -> ${l.head}`);
  }
  for (const l of live.worktrees) {
    if (!base.worktrees.some((w) => w.branch === l.branch)) diffs.push(`parrot worktree new: ${l.branch}`);
  }
  for (const [n, sha] of Object.entries(base.branches)) {
    if (!(n in live.branches)) diffs.push(`parrot branch missing: ${n}`);
    else if (live.branches[n] !== sha) diffs.push(`parrot branch ${n} ${sha} -> ${live.branches[n]}`);
  }
  for (const n of Object.keys(live.branches)) {
    if (!(n in base.branches)) diffs.push(`parrot branch new: ${n}`);
  }
}

/** Returns an array of human-readable differences; empty means identical (modulo the approved ff). */
export function guardAgainstBaseline(baseline, { legacy, parrot, record } = {}) {
  const diffs = [];
  const lrepo = legacy || baseline.legacy.path;
  const prepo = parrot || baseline.parrot.path;

  const L = legacyState(lrepo);
  const bl = baseline.legacy;
  if (L.head !== bl.head) diffs.push(`legacy HEAD ${bl.head} -> ${L.head}`);
  for (const f of LEGACY_FILES) {
    if (L.files[f] !== bl.files[f]) diffs.push(`legacy file hash changed: ${f}`);
  }
  cmpList("legacy modified", bl.modified, L.modified, diffs);
  cmpList("legacy untracked", bl.untracked, L.untracked, diffs);
  if (L.index.mtimeMs !== bl.index.mtimeMs || L.index.size !== bl.index.size) {
    diffs.push(`legacy .git/index stat changed (${bl.index.mtimeMs}:${bl.index.size} -> ${L.index.mtimeMs}:${L.index.size})`);
  }

  const P = parrotState(prepo);
  const bp = baseline.parrot;
  compareWorktreesAndBranches(bp, P, diffs);
  const rec = loadRecord(record);
  const recOk = rec && rec.before_sha === bp.head;
  const exempt = (live) => recOk && live === rec.after_sha;
  if (P.head !== bp.head && !exempt(P.head)) diffs.push(`parrot main ${bp.head} -> ${P.head}`);
  if (P.origin_main !== bp.origin_main && !exempt(P.origin_main)) {
    diffs.push(`parrot origin/main ${bp.origin_main} -> ${P.origin_main}${recOk ? " (not the approved after_sha)" : " (no valid ff record)"}`);
  }
  return diffs;
}

export function parrotPreflight(repo) {
  const problems = [];
  const notes = [];
  const branch = tryGit(repo, ["symbolic-ref", "--short", "HEAD"]);
  if (branch !== "main") problems.push(`not on main (on ${branch})`);
  if (isDirty(repo)) problems.push("tracked files are modified or staged");
  const untracked = lines0(git(repo, ["ls-files", "-o", "--exclude-standard", "-z"]));
  if (untracked.length) notes.push(`${untracked.length} untracked path(s) (not fatal)`);
  const origin = tryGit(repo, ["rev-parse", "refs/remotes/origin/main"]);
  if (!origin) problems.push("no origin/main tracking ref");
  else {
    try {
      git(repo, ["merge-base", "--is-ancestor", "refs/heads/main", "refs/remotes/origin/main"]);
    } catch {
      problems.push("local main has diverged from origin/main (not fast-forwardable)");
    }
  }
  notes.push("preflight reads the STALE local origin/main ref; exit 0 is not proof --ff-only will succeed");
  return { ok: problems.length === 0, problems, notes };
}

function parrotFfCheck({ repo, expectAfter, baselineFile, recordFile }) {
  const problems = [];
  const rec = loadRecord(recordFile);
  if (!rec) problems.push("ff record missing or invalid");
  const head = tryGit(repo, ["rev-parse", "refs/heads/main"]);
  const origin = tryGit(repo, ["rev-parse", "refs/remotes/origin/main"]);
  if (head !== expectAfter) problems.push(`local main ${head} != expect-after ${expectAfter}`);
  if (origin !== expectAfter) problems.push(`origin/main ${origin} != expect-after ${expectAfter}`);
  if (rec) {
    if (rec.after_sha !== head) problems.push(`record after_sha ${rec.after_sha} != HEAD ${head}`);
    try {
      git(repo, ["merge-base", "--is-ancestor", rec.before_sha, "refs/heads/main"]);
    } catch {
      problems.push(`before_sha ${rec.before_sha} is not an ancestor of main`);
    }
  }
  if (isDirty(repo)) problems.push("tree is dirty");
  if (!baselineFile || !existsSync(baselineFile)) problems.push("baseline missing");
  else {
    const base = JSON.parse(readFileSync(baselineFile, "utf8")).parrot;
    compareWorktreesAndBranches(base, parrotState(repo), problems);
  }
  return problems;
}

function gatePrev(n, phasesDir) {
  const num = String(n).split("-")[0];
  if (!existsSync(phasesDir)) return { ok: false, why: `phases dir missing: ${phasesDir}` };
  for (const d of readdirSync(phasesDir)) {
    if (!d.startsWith(`${num}-`)) continue;
    const f = path.join(phasesDir, d, `${n}-VERIFICATION.md`);
    if (!existsSync(f)) continue;
    const m = readFileSync(f, "utf8").match(/^---\n([\s\S]*?)\n---/);
    const st = m && m[1].match(/^status:\s*"?([A-Za-z_]+)"?\s*$/m);
    if (st && st[1] === "passed") return { ok: true, why: `${f}: status passed` };
    return { ok: false, why: `${f}: status ${st ? st[1] : "missing"}` };
  }
  return { ok: false, why: `no ${n}-VERIFICATION.md under ${phasesDir}` };
}

function main(argv) {
  const a = parseArgs(argv);
  const defRecord = (b) => path.join(path.dirname(b), "parrot-ff-record.json");
  try {
    if (a["gate-prev"] !== undefined) {
      const r = gatePrev(a["gate-prev"], a["phases-dir"] || DEFAULT_PHASES_DIR);
      console.log(`${r.ok ? "GATE OK" : "GATE FAIL"}: ${r.why}`);
      return r.ok ? 0 : 1;
    }
    if (a.snapshot) {
      for (const k of ["legacy", "parrot", "cms", "out"]) if (typeof a[k] !== "string") return usage(`--${k} required`);
      const s = snapshot({ legacy: a.legacy, parrot: a.parrot, cms: a.cms });
      mkdirSync(path.dirname(path.resolve(a.out)), { recursive: true });
      writeFileSync(a.out, JSON.stringify(s, null, 2) + "\n");
      console.log(`snapshot written: ${a.out}`);
      return 0;
    }
    if (a.guard) {
      if (typeof a.baseline !== "string") return usage("--baseline required");
      if (!existsSync(a.baseline)) {
        console.log(`GUARD FAIL: baseline missing: ${a.baseline}`);
        return 1;
      }
      const base = JSON.parse(readFileSync(a.baseline, "utf8"));
      const diffs = guardAgainstBaseline(base, {
        legacy: a.legacy, parrot: a.parrot, record: a.record || defRecord(a.baseline),
      });
      if (diffs.length) {
        console.log("GUARD FAIL:\n" + diffs.map((d) => `  - ${d}`).join("\n"));
        return 1;
      }
      console.log("GUARD OK: legacy and Parrot match baseline");
      return 0;
    }
    if (a["parrot-preflight"]) {
      if (typeof a.repo !== "string") return usage("--repo required");
      const r = parrotPreflight(a.repo);
      for (const n of r.notes) console.log(`note: ${n}`);
      for (const p of r.problems) console.log(`PROBLEM: ${p}`);
      console.log(r.ok ? "PREFLIGHT OK" : "PREFLIGHT FAIL");
      return r.ok ? 0 : 1;
    }
    if (a["parrot-ff-check"]) {
      for (const k of ["repo", "expect-after", "baseline"]) if (typeof a[k] !== "string") return usage(`--${k} required`);
      const problems = parrotFfCheck({
        repo: a.repo, expectAfter: a["expect-after"], baselineFile: a.baseline,
        recordFile: a.record || defRecord(a.baseline),
      });
      if (problems.length) {
        console.log("FF-CHECK FAIL:\n" + problems.map((p) => `  - ${p}`).join("\n"));
        return 1;
      }
      console.log("FF-CHECK OK");
      return 0;
    }
    return usage("no mode given");
  } catch (e) {
    console.error(`error: ${e.message}`);
    return 1;
  }
}
function usage(msg) {
  console.error(`usage error: ${msg}`);
  return 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
