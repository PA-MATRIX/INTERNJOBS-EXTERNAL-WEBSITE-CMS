#!/usr/bin/env node
// Phase 38 read-only verifier (v1.6 repo split).
// Modes: --gate-prev, --snapshot, --guard, --parrot-preflight, --parrot-ff-check, --maps, --relationship,
// --inventory (plus --list-hits), --repo-map.
// Every git call against legacy/Parrot runs with GIT_OPTIONAL_LOCKS=0 and uses read-only
// plumbing (ls-files, rev-parse, for-each-ref, merge-base, worktree list). Plain `git status`
// is never used because it refreshes (writes) the index.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, mkdirSync, realpathSync } from "node:fs";
import os from "node:os";
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


// ---------------- Plan 38-02: --maps ----------------
export const MAP_DOCS = ["STACK", "INTEGRATIONS", "ARCHITECTURE", "STRUCTURE", "CONVENTIONS", "TESTING", "CONCERNS"];
const STAMP_RE = /^<!-- generated from (\S+) @ ([0-9a-f]{7,40}) on (\d{4}-\d{2}-\d{2}) -->$/;
// Each pattern is a name only; matched values are never echoed.
const SECRET_PATTERNS = [
  ["sk- key", /\bsk-[A-Za-z0-9_-]{16,}/],
  ["AWS access key", /\bAKIA[0-9A-Z]{16}\b/],
  ["GitHub token", /\bghp_[A-Za-z0-9]{20,}/],
  ["Slack token", /\bxox[bp]-[A-Za-z0-9-]{10,}/],
  ["PEM header", /-----BEGIN/],
  ["JWT", /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/],
  ["KEY= assignment", /\b[A-Za-z0-9_]*KEY\s*=\s*["']?[A-Za-z0-9+\/_.-]{12,}/],
  ["SECRET/TOKEN/PASSWORD= assignment", /\b[A-Za-z0-9_]*(?:SECRET|TOKEN|PASSWORD)\s*=\s*["']?[A-Za-z0-9+\/_.-]{12,}/],
  ["URL credentials", /\b[a-z][a-z0-9+.-]*:\/\/[^\s:\/@]+:[^\s@\/]+@/i],
  ["dotenv assignment", /\.env[\w.-]*\s*=\s*["']?[^\s"'`]{4,}/],
];

export function scanSecrets(text) {
  return SECRET_PATTERNS.filter(([, re]) => re.test(text)).map(([n]) => n);
}

function realish(p) {
  try {
    return realpathSync(p);
  } catch {
    return path.resolve(p);
  }
}
const isInside = (child, parent) => {
  const c = realish(child), p = realish(parent);
  return c === p || c.startsWith(p + path.sep);
};

function sourceTrees(repo) {
  const trees = [repo];
  const wl = tryGit(repo, ["worktree", "list", "--porcelain"]);
  if (wl) for (const l of wl.split("\n")) if (l.startsWith("worktree ")) trees.push(l.slice(9));
  return trees;
}

export function checkMaps({ manifest, dirs, parrotRepo, legacyRepo }) {
  const problems = [];
  let man;
  try {
    man = JSON.parse(readFileSync(manifest, "utf8"));
  } catch (e) {
    return [`manifest unreadable: ${manifest}`];
  }
  const src = { parrot: parrotRepo, legacy: legacyRepo };
  for (const k of ["cms", "parrot", "legacy"]) {
    const dir = dirs[k];
    const exp = man[k];
    if (!exp || !exp.repo || !exp.sha) {
      problems.push(`${k}: manifest entry incomplete`);
      continue;
    }
    if (k === "cms" && !exp.merge_date) problems.push("cms: manifest merge_date missing");
    for (const [name, repo] of Object.entries(src)) {
      if (k !== name) {
        // any map dir must stay out of both source repos
      }
    }
    for (const [name, repo] of Object.entries(src)) {
      if (repo && existsSync(repo) && sourceTrees(repo).some((t) => isInside(dir, t))) {
        problems.push(`${k}: map dir ${dir} is inside the ${name} working tree`);
      }
    }
    for (const d of MAP_DOCS) {
      const f = path.join(dir, `${d}.md`);
      const label = `${k}/${d}.md`;
      if (!existsSync(f) || !statSync(f).isFile()) {
        problems.push(`${label}: missing`);
        continue;
      }
      const text = readFileSync(f, "utf8");
      if (!text.trim()) {
        problems.push(`${label}: empty`);
        continue;
      }
      const m = text.split("\n", 1)[0].match(STAMP_RE);
      if (!m) problems.push(`${label}: first-line stamp missing or malformed`);
      else {
        const [, repo, sha, date] = m;
        if (repo !== exp.repo) problems.push(`${label}: stamp repo ${repo} != ${exp.repo}`);
        if (!(sha.startsWith(exp.sha) || exp.sha.startsWith(sha))) problems.push(`${label}: stamp sha ${sha} != manifest ${exp.sha}`);
        if (k === "cms" && exp.merge_date && date < exp.merge_date) problems.push(`${label}: stamp date ${date} precedes merge date ${exp.merge_date}`);
      }
      for (const n of scanSecrets(text)) problems.push(`${label}: secret-shaped string (${n})`);
    }
  }
  return problems;
}

// ---------------- Plan 38-02: --relationship ----------------
const REL_VOCAB = /^(independent|vendored-copy|fork|mirror|other:\S.*)$/;

function makeTree(root) {
  const isGit = tryGit(root, ["rev-parse", "--git-dir"]) !== null;
  const ref = isGit && tryGit(root, ["rev-parse", "--verify", "-q", "refs/remotes/origin/main"]) ? "refs/remotes/origin/main" : null;
  return {
    read(rel) {
      if (/(^|\/)\.env/.test(rel)) return null;
      if (ref) return tryGitRaw(root, ["show", `${ref}:${rel}`]);
      const f = path.join(root, rel);
      return existsSync(f) && statSync(f).isFile() ? readFileSync(f, "utf8") : null;
    },
    exists(rel) {
      if (/(^|\/)\.env/.test(rel)) return false;
      if (ref) return tryGit(root, ["cat-file", "-e", `${ref}:${rel}`]) !== null || gitOk(root, ["cat-file", "-e", `${ref}:${rel}`]);
      return existsSync(path.join(root, rel));
    },
  };
}
function gitOk(repo, args) {
  try {
    git(repo, args);
    return true;
  } catch {
    return false;
  }
}
function tryGitRaw(repo, args) {
  try {
    return git(repo, args);
  } catch {
    return null;
  }
}

function workerName(tree, base) {
  const p = (f) => (base ? `${base}/${f}` : f);
  const toml = tree.read(p("wrangler.toml"));
  if (toml) {
    const m = toml.match(/^name\s*=\s*"([^"]+)"/m);
    if (m) return m[1];
  }
  for (const f of ["wrangler.jsonc", "wrangler.json"]) {
    const j = tree.read(p(f));
    if (j) {
      const m = j.match(/"name"\s*:\s*"([^"]+)"/);
      if (m) return m[1];
    }
  }
  return null;
}
function packageName(tree, base) {
  const j = tree.read(base ? `${base}/package.json` : "package.json");
  if (!j) return null;
  try {
    return JSON.parse(j).name ?? null;
  } catch {
    return null;
  }
}

export function checkRelationship({ doc, cms, parrot }) {
  const problems = [];
  if (!existsSync(doc)) return [`relationship doc missing: ${doc}`];
  const rows = {};
  for (const line of readFileSync(doc, "utf8").split("\n")) {
    const cells = line.split("|").map((c) => c.trim());
    if (cells.length < 5 || cells[0] !== "" ) continue;
    const key = cells[1].replace(/`/g, "");
    if (["worker_name", "package_name", "shared_items", "must_not_change", "relationship"].includes(key)) {
      rows[key] = [cells[2].replace(/`/g, ""), cells[3].replace(/`/g, "")];
    }
  }
  for (const k of ["worker_name", "package_name", "shared_items", "must_not_change", "relationship"]) {
    if (!rows[k]) problems.push(`facts table row missing: ${k}`);
    else if (!rows[k][0] || !rows[k][1]) problems.push(`facts table row empty: ${k}`);
  }
  const cmsTree = makeTree(cms), parTree = makeTree(parrot);
  const claimed = (v) => (v === "none" ? null : v);
  if (rows.worker_name) {
    const a = workerName(cmsTree, "apps/parrot"), b = workerName(parTree, "");
    if (claimed(rows.worker_name[0]) !== a) problems.push(`worker_name: apps/parrot claims ${rows.worker_name[0]}, file says ${a ?? "none"}`);
    if (claimed(rows.worker_name[1]) !== b) problems.push(`worker_name: Parrot claims ${rows.worker_name[1]}, file says ${b ?? "none"}`);
  }
  if (rows.package_name) {
    const a = packageName(cmsTree, "apps/parrot"), b = packageName(parTree, "");
    if (claimed(rows.package_name[0]) !== a) problems.push(`package_name: apps/parrot claims ${rows.package_name[0]}, file says ${a ?? "none"}`);
    if (claimed(rows.package_name[1]) !== b) problems.push(`package_name: Parrot claims ${rows.package_name[1]}, file says ${b ?? "none"}`);
  }
  if (rows.shared_items) {
    const items = (v) => (v === "none" ? [] : v.split(",").map((x) => x.trim()).filter(Boolean));
    for (const i of items(rows.shared_items[0])) if (!cmsTree.exists(`apps/parrot/${i}`)) problems.push(`shared_items: ${i} not found under apps/parrot`);
    for (const i of items(rows.shared_items[1])) if (!parTree.exists(i)) problems.push(`shared_items: ${i} not found in Parrot`);
  }
  if (rows.relationship) {
    for (const v of rows.relationship) if (!REL_VOCAB.test(v)) problems.push(`relationship: value not in vocabulary: ${v}`);
  }
  return problems;
}

// ---------------- Plan 38-03: --inventory (MAP-04) ----------------
export const COUPLING_PATTERNS = [
  "apps/marketing", "apps/employers", "apps/app", "apps/parrot", "apps/startup", "apps/mac-bridge",
  "packages/shared", "internjobs-marketing-website", "PA-MATRIX/", "internjobs-ai",
];
const APP_DIR_RE = /^(apps\/[A-Za-z0-9_-]+|packages\/shared)$/;
export const NAMED_MINIMUM = [
  ".github/workflows/ci.yml", "package.json", "package-lock.json", "README.md",
  "apps/marketing/wrangler.toml", "apps/employers/src/styles.css", "apps/employers/tailwind.config.ts",
  "apps/app/src/views.mjs", "apps/marketing/src/components/StartupAccessSection.tsx",
  "packages/shared/**", ".planning/**", "infra/**", "scripts/**",
];
const DISPOSITIONS = ["keep", "move", "rewrite", "delete"];

/** Tracked-file hit set via `git grep -l -E` per pattern; a file whose only hits are patterns naming its own
 * app directory is excluded. With `ref` only the committed tree is read; untracked files are never touched. */
export function computeHits(repo, ref) {
  const hits = new Set();
  for (const pat of COUPLING_PATTERNS) {
    const own = APP_DIR_RE.test(pat) ? `${pat}/` : null;
    let out;
    try {
      out = git(repo, ["grep", "-l", "-I", "-E", "-e", pat, ...(ref ? [ref] : []), "--"]);
    } catch (e) {
      if (e.status === 1) continue; // no match
      throw e;
    }
    for (const raw of out.split("\n")) {
      if (!raw) continue;
      const f = ref && raw.startsWith(`${ref}:`) ? raw.slice(ref.length + 1) : raw;
      if (own && f.startsWith(own)) continue;
      hits.add(f);
    }
  }
  return [...hits].sort();
}

const unq = (c) => c.replace(/`/g, "").trim();
function parseRows(text, cols) {
  const rows = [];
  for (const line of text.split("\n")) {
    if (!line.startsWith("|")) continue;
    const cells = line.replace(/^\|/, "").replace(/\|\s*$/, "").split("|").map(unq);
    if (cells.length !== cols) continue;
    if (cells.every((c) => /^:?-{3,}:?$/.test(c))) continue;
    rows.push(cells);
  }
  return rows;
}
const covers = (rowPath, target) => {
  if (rowPath === target) return true;
  if (rowPath.endsWith("/**")) {
    const pre = rowPath.slice(0, -2); // keeps trailing slash
    return target.startsWith(pre) || target === rowPath.slice(0, -3);
  }
  return false;
};

export function checkInventory({ doc, repo, ref, repoName = "cms" }) {
  const problems = [];
  if (!existsSync(doc)) return [`inventory missing: ${doc}`];
  const text = readFileSync(doc, "utf8");
  for (const n of scanSecrets(text)) problems.push(`inventory: secret-shaped string (${n})`);
  const all = parseRows(text, 7).filter((c) => c[0] !== "repo");
  const rows = all.filter((c) => c[0] === repoName);
  if (!rows.length) problems.push(`no rows for repo section "${repoName}"`);
  for (const [, p, , kind, disp, dest, note] of rows) {
    if (!p) problems.push(`row with empty path`);
    if (!DISPOSITIONS.includes(disp)) problems.push(`${p}: disposition "${disp}" is not one of ${DISPOSITIONS.join("|")}`);
    if (disp === "move" && !["website", "platform"].includes(dest)) problems.push(`${p}: move row needs destination website or platform (got "${dest}")`);
    if (!note) problems.push(`${p}: empty rationale`);
    else if (disp === "rewrite" && !/^rewrite:\s*\S/.test(note)) problems.push(`${p}: rewrite row needs a note starting "rewrite: "`);
    if (!kind) problems.push(`${p}: empty kind`);
  }
  const paths = rows.map((r) => r[1]);
  for (const h of computeHits(repo, ref)) {
    if (!paths.some((rp) => covers(rp, h))) problems.push(`uncovered hit: ${h}`);
  }
  if (repoName === "cms") {
    for (const n of NAMED_MINIMUM) {
      if (!paths.some((rp) => covers(rp, n))) problems.push(`named minimum not covered: ${n}`);
    }
  }
  return problems;
}

// ---------------- Plan 38-03: --repo-map (MAP-06) ----------------
const MATCH_RE = /intern|parrot|marketing|growth/i;
export const REQUIRED_REPOS = ["PA-MATRIX/internjobs-marketing-website", "PA-Ai-Team/Parrot", "growthpods/Internjobs"];
const expandHome = (p) => (p === "~" || p.startsWith("~/") ? path.join(os.homedir(), p.slice(1)) : p);
const slugFromUrl = (u) => {
  const m = (u || "").match(/github\.com[:/]([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/);
  return m ? `${m[1]}/${m[2]}` : null;
};

export function checkRepoMap({ doc, ghJson, teamMode }) {
  const problems = [];
  if (!existsSync(doc)) return [`repo map missing: ${doc}`];
  if (!existsSync(ghJson)) return [`gh json missing: ${ghJson}`];
  let gh, teams;
  try { gh = JSON.parse(readFileSync(ghJson, "utf8")); } catch { return [`gh json unreadable: ${ghJson}`]; }
  try { teams = Object.keys(JSON.parse(readFileSync(teamMode, "utf8")).teams || {}); } catch { return [`team-mode unreadable: ${teamMode}`]; }
  const text = readFileSync(doc, "utf8");
  for (const n of scanSecrets(text)) problems.push(`repo map: secret-shaped string (${n})`);

  // split into sections by "## " heading; only the non-Planned, non-Excluded sections hold current rows
  const current = [];
  const excluded = [];
  let section = "";
  for (const line of text.split("\n")) {
    const h = line.match(/^##\s+(.*)$/);
    if (h) { section = h[1].trim().toLowerCase(); continue; }
    if (section.startsWith("planned")) continue;
    if (section.startsWith("excluded")) {
      const m = line.match(/^\s*[-*]\s+`?([^\s:`]+)`?\s*:\s*(.*)$/);
      if (m) excluded.push({ slug: m[1], reason: m[2].trim() });
      continue;
    }
    if (!line.startsWith("|")) continue;
    const cells = line.replace(/^\|/, "").replace(/\|\s*$/, "").split("|").map(unq);
    if (cells.length !== 7 || cells.every((c) => /^:?-{3,}:?$/.test(c)) || cells[0].toLowerCase() === "repo") continue;
    current.push(cells);
  }
  const COLS = ["repo", "owner", "visibility", "purpose", "local folder", "deploy target", "owning team"];
  const bySlug = new Map(current.map((c) => [c[0], c]));
  for (const req of REQUIRED_REPOS) if (!bySlug.has(req)) problems.push(`missing row for ${req}`);
  for (const c of current) {
    const [slug, owner, vis, , folder, , team] = c;
    c.forEach((v, i) => { if (!v) problems.push(`${slug || "(row)"}: empty column ${COLS[i]}`); });
    const g = gh.repos?.[slug];
    if (!g) problems.push(`${slug}: no gh data for this repo in ${path.basename(ghJson)}`);
    else {
      if (vis && String(g.visibility).toLowerCase() !== vis.toLowerCase()) problems.push(`${slug}: visibility ${vis} != gh ${g.visibility}`);
      const gOwner = g.owner?.login ?? g.owner;
      if (owner && String(gOwner).toLowerCase() !== owner.toLowerCase()) problems.push(`${slug}: owner ${owner} != gh ${gOwner}`);
    }
    if (folder) {
      const dir = expandHome(folder);
      if (!existsSync(dir)) problems.push(`${slug}: local folder missing: ${folder}`);
      else {
        const url = tryGit(dir, ["remote", "get-url", "origin"]);
        const got = slugFromUrl(url);
        if (!got || got.toLowerCase() !== slug.toLowerCase()) problems.push(`${slug}: remote origin of ${folder} is ${got ?? "unreadable"}`);
      }
    }
    if (team && !teams.includes(team) && !/^unmanaged:\s*\S/.test(team)) {
      problems.push(`${slug}: owning team "${team}" is not a team-mode.json team (${teams.join(", ")}) or "unmanaged: <reason>"`);
    }
  }
  for (const e of excluded) if (!e.reason) problems.push(`excluded ${e.slug}: reason missing`);
  const listed = new Set([...bySlug.keys(), ...excluded.filter((e) => e.reason).map((e) => e.slug)].map((s) => s.toLowerCase()));
  for (const [org, list] of Object.entries(gh.lists || {})) {
    for (const r of list) {
      if (!MATCH_RE.test(r.name)) continue;
      if (!listed.has(`${org}/${r.name}`.toLowerCase())) problems.push(`enumerated repo ${org}/${r.name} is neither a row nor in Excluded`);
    }
  }
  return problems;
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
    if (a.maps) {
      if (typeof a.manifest !== "string") return usage("--manifest required");
      const cmsRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
      const pd = path.join(cmsRoot, DEFAULT_PHASES_DIR, "38-code-map-coupling-inventory", "maps");
      const dirs = {
        cms: a["cms-dir"] || path.join(cmsRoot, ".planning", "codebase"),
        parrot: a["parrot-dir"] || path.join(pd, "parrot"),
        legacy: a["legacy-dir"] || path.join(pd, "legacy"),
      };
      const problems = checkMaps({
        manifest: a.manifest, dirs,
        parrotRepo: a["parrot-repo"] || path.join(os.homedir(), "Documents", "Parrot"),
        legacyRepo: a["legacy-repo"] || path.join(os.homedir(), "MayaOS", "internjobs-ai"),
      });
      if (problems.length) {
        console.log("MAPS FAIL:\n" + problems.map((p) => `  - ${p}`).join("\n"));
        return 1;
      }
      console.log("MAPS OK: 3 x 7 docs present, stamped, clean, outside source repos");
      return 0;
    }
    if (a.relationship) {
      if (typeof a.relationship !== "string") return usage("--relationship <doc> required");
      const problems = checkRelationship({
        doc: a.relationship,
        cms: a.cms || path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
        parrot: a.parrot || path.join(os.homedir(), "Documents", "Parrot"),
      });
      if (problems.length) {
        console.log("RELATIONSHIP FAIL:\n" + problems.map((p) => `  - ${p}`).join("\n"));
        return 1;
      }
      console.log("RELATIONSHIP OK");
      return 0;
    }
    if (a.inventory !== undefined) {
      if (typeof a.repo !== "string") return usage("--repo required");
      const ref = typeof a.ref === "string" ? a.ref : undefined;
      if (a["list-hits"]) {
        for (const h of computeHits(a.repo, ref)) console.log(h);
        return 0;
      }
      if (typeof a.inventory !== "string") return usage("--inventory <doc> required");
      const problems = checkInventory({
        doc: a.inventory, repo: a.repo, ref, repoName: typeof a["repo-name"] === "string" ? a["repo-name"] : "cms",
      });
      if (problems.length) {
        console.log("INVENTORY FAIL:\n" + problems.map((p) => `  - ${p}`).join("\n"));
        return 1;
      }
      console.log("INVENTORY OK");
      return 0;
    }
    if (a["repo-map"] !== undefined) {
      if (typeof a["repo-map"] !== "string") return usage("--repo-map <doc> required");
      if (typeof a["gh-json"] !== "string") return usage("--gh-json required");
      const cmsRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
      const problems = checkRepoMap({
        doc: a["repo-map"], ghJson: a["gh-json"], teamMode: a["team-mode"] || path.join(cmsRoot, ".planning", "team-mode.json"),
      });
      if (problems.length) {
        console.log("REPO-MAP FAIL:\n" + problems.map((p) => `  - ${p}`).join("\n"));
        return 1;
      }
      console.log("REPO-MAP OK");
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
