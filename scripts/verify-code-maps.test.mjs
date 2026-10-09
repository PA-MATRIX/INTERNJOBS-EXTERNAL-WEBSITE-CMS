import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, appendFileSync, statSync, utimesSync, rmSync, existsSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(here, "verify-code-maps.mjs");
const CANARY = "SECRET_CANARY_9f3a1c77";
const WT1 = "fix/contact-dedupe-on-send";
const WT2 = "fix/sms-send-and-contact-dedupe-main";
const FOUR = ["package.json", "package-lock.json", "src/app/api/chat/route.ts", "tests/e2e/chat-interface.spec.ts"];

const git = (cwd, ...a) =>
  execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "-c", "commit.gpgsign=false", ...a], {
    cwd, encoding: "utf8", env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
  }).trim();
// plain git that is allowed to refresh the index (used only to prove fixture sensitivity / mutate)
const gitW = (cwd, ...a) =>
  execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "-c", "commit.gpgsign=false", ...a], {
    cwd, encoding: "utf8",
  }).trim();
const tmp = (p) => mkdtempSync(path.join(os.tmpdir(), p));
const put = (root, rel, body) => {
  mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  writeFileSync(path.join(root, rel), body);
};
const cli = (args) => spawnSync("node", [SCRIPT, ...args], { encoding: "utf8" });
const idxStat = (repo) => {
  const s = statSync(path.join(repo, ".git", "index"));
  return `${s.mtimeMs}:${s.size}`;
};

function makeLegacy({ env = false } = {}) {
  const dir = tmp("legacy-");
  gitW(dir, "init", "-q", "-b", "main");
  for (const f of FOUR) put(dir, f, `base ${f}\n`);
  put(dir, "other.txt", "o\n");
  gitW(dir, "add", "-A");
  gitW(dir, "commit", "-qm", "init");
  for (const f of FOUR) appendFileSync(path.join(dir, f), "uncommitted\n");
  put(dir, "playwright-report/a.html", "a");
  put(dir, "playwright-report/b.html", "b");
  put(dir, "test-results.json", "{}");
  if (env) put(dir, ".env.local", `KEY=${CANARY}\n`);
  // stale-stat tracked file + old index mtime so a plain `git status` would rewrite the index
  const old = new Date("2020-01-01T00:00:00Z");
  utimesSync(path.join(dir, "other.txt"), new Date(), new Date());
  utimesSync(path.join(dir, ".git", "index"), old, old);
  return dir;
}

function makeCms() {
  const dir = tmp("cms-");
  gitW(dir, "init", "-q", "-b", "main");
  put(dir, "a.txt", "a\n");
  gitW(dir, "add", "-A");
  gitW(dir, "commit", "-qm", "init");
  put(dir, "apps/canary-monitor/one.ts", `const k = "${CANARY}";\n`);
  put(dir, "apps/canary-monitor/two.ts", `const j = "${CANARY}";\n`);
  appendFileSync(path.join(dir, "a.txt"), "changed\n");
  return dir;
}

function makeParrot() {
  const root = tmp("parrot-");
  const seed = path.join(root, "seed");
  const bare = path.join(root, "origin.git");
  mkdirSync(seed);
  gitW(seed, "init", "-q", "-b", "main");
  put(seed, "README", "r\n");
  gitW(seed, "add", "-A");
  gitW(seed, "commit", "-qm", "c1");
  gitW(root, "init", "-q", "--bare", "-b", "main", bare);
  gitW(seed, "remote", "add", "origin", bare);
  gitW(seed, "push", "-q", "origin", "main");
  const clone = path.join(root, "Parrot");
  gitW(root, "clone", "-q", bare, clone);
  const wt1 = path.join(root, "Parrot-wt-dedupe");
  const wt2 = path.join(root, "Parrot-wt-main-port");
  gitW(clone, "worktree", "add", "-q", "-b", WT1, wt1);
  gitW(clone, "worktree", "add", "-q", "-b", WT2, wt2);
  put(wt1, "w1.txt", "1\n"); gitW(wt1, "add", "w1.txt"); gitW(wt1, "commit", "-qm", "w1");
  put(wt2, "w2.txt", "2\n"); gitW(wt2, "add", "w2.txt"); gitW(wt2, "commit", "-qm", "w2");
  const advanceOrigin = (name = "c2") => {
    put(seed, `${name}.txt`, name);
    gitW(seed, "add", "-A");
    gitW(seed, "commit", "-qm", name);
    gitW(seed, "push", "-q", "origin", "main");
    gitW(clone, "fetch", "-q", "origin");
    return git(clone, "rev-parse", "refs/remotes/origin/main");
  };
  return { root, seed, bare, clone, wt1, wt2, advanceOrigin };
}

function env({ legacyEnv = false, behind = true } = {}) {
  const legacy = makeLegacy({ env: legacyEnv });
  const cms = makeCms();
  const p = makeParrot();
  if (behind) p.advanceOrigin("c2");
  const out = path.join(tmp("base-"), "baseline.json");
  const snap = cli(["--snapshot", "--legacy", legacy, "--parrot", p.clone, "--cms", cms, "--out", out]);
  return { legacy, cms, p, out, snap, record: path.join(path.dirname(out), "parrot-ff-record.json") };
}
const guard = (e, extra = []) =>
  cli(["--guard", "--baseline", e.out, "--legacy", e.legacy, "--parrot", e.p.clone, "--record", e.record, ...extra]);
const writeRecord = (e, over = {}) => {
  const before = git(e.p.clone, "rev-parse", "refs/heads/main");
  const after = git(e.p.clone, "rev-parse", "refs/remotes/origin/main");
  writeFileSync(e.record, JSON.stringify({
    approved_by: "Raj", approved_at: "2026-10-08T00:00:00Z", before_sha: before, after_sha: after,
    worktree_heads: {}, ...over,
  }));
  return { before, after };
};

// ---------- T-gate ----------
test("T-gate: entry gate reads VERIFICATION status", () => {
  const pd = tmp("phases-");
  mkdirSync(path.join(pd, "37-merge"));
  const f = path.join(pd, "37-merge", "37-VERIFICATION.md");
  assert.equal(cli(["--gate-prev", "37", "--phases-dir", pd]).status, 1, "missing -> 1");
  writeFileSync(f, "---\nstatus: gaps_found\n---\nx\n");
  assert.equal(cli(["--gate-prev", "37", "--phases-dir", pd]).status, 1, "gaps_found -> 1");
  writeFileSync(f, "---\nstatus: passed\n---\nx\n");
  assert.equal(cli(["--gate-prev", "37", "--phases-dir", pd]).status, 0, "passed -> 0");
  mkdirSync(path.join(pd, "38-map"));
  assert.equal(cli(["--gate-prev", "38-01", "--phases-dir", pd]).status, 1);
  writeFileSync(path.join(pd, "38-map", "38-01-VERIFICATION.md"), "---\nstatus: passed\n---\n");
  assert.equal(cli(["--gate-prev", "38-01", "--phases-dir", pd]).status, 0);
});

// ---------- legacy guard ----------
test("T-guard-legacy positive: unchanged -> 0", () => {
  const e = env();
  assert.equal(e.snap.status, 0, e.snap.stderr);
  const r = guard(e);
  assert.equal(r.status, 0, r.stdout + r.stderr);
});
for (const f of FOUR) {
  test(`T-guard-legacy-hash: one byte in ${f} -> 1`, () => {
    const e = env();
    assert.equal(e.snap.status, 0, e.snap.stderr);
    appendFileSync(path.join(e.legacy, f), "x");
    assert.equal(guard(e).status, 1);
  });
}
test("T-guard-legacy-head: new commit -> 1", () => {
  const e = env();
  assert.equal(e.snap.status, 0, e.snap.stderr);
  put(e.legacy, "n.txt", "n"); gitW(e.legacy, "add", "n.txt"); gitW(e.legacy, "commit", "-qm", "n");
  assert.equal(guard(e).status, 1);
});
test("T-guard-legacy-status: extra untracked path -> 1", () => {
  const e = env();
  assert.equal(e.snap.status, 0, e.snap.stderr);
  put(e.legacy, "stray.txt", "s");
  assert.equal(guard(e).status, 1);
});
test("T-guard-legacy-status: new file inside snapshotted untracked dir -> 1", () => {
  const e = env();
  assert.equal(e.snap.status, 0, e.snap.stderr);
  put(e.legacy, "playwright-report/c.html", "c");
  assert.equal(guard(e).status, 1);
});
test("T-guard-legacy-status: tracked file reverted leaves modified list -> 1", () => {
  const e = env();
  assert.equal(e.snap.status, 0, e.snap.stderr);
  writeFileSync(path.join(e.legacy, "package.json"), "base package.json\n");
  assert.equal(guard(e).status, 1);
});
test("T-guard-legacy-index: plain git status rewrites index -> 1", () => {
  const e = env();
  assert.equal(e.snap.status, 0, e.snap.stderr);
  assert.equal(guard(e).status, 0);
  gitW(e.legacy, "status", "--short");
  assert.equal(guard(e).status, 1);
});
test("T-readonly-index: snapshot+guard leave .git/index stat unchanged; plain status does not", () => {
  const legacy = makeLegacy();
  const p = makeParrot(); p.advanceOrigin();
  const cms = makeCms();
  const out = path.join(tmp("base-"), "b.json");
  const l0 = idxStat(legacy), p0 = idxStat(p.clone);
  const s = cli(["--snapshot", "--legacy", legacy, "--parrot", p.clone, "--cms", cms, "--out", out]);
  assert.equal(s.status, 0, s.stderr);
  const g = cli(["--guard", "--baseline", out, "--legacy", legacy, "--parrot", p.clone]);
  assert.equal(g.status, 0, g.stdout + g.stderr);
  assert.equal(idxStat(legacy), l0, "legacy index changed");
  assert.equal(idxStat(p.clone), p0, "parrot index changed");
  // negative control: the fixture is sensitive (plain status would rewrite the index)
  gitW(legacy, "status", "--short");
  assert.notEqual(idxStat(legacy), l0);
  // and the script source pins GIT_OPTIONAL_LOCKS=0
  assert.match(readFileSync(SCRIPT, "utf8"), /GIT_OPTIONAL_LOCKS/);
});
test("T-snapshot-cms: pre-existing cms paths by name, never contents", () => {
  const e = env();
  assert.equal(e.snap.status, 0, e.snap.stderr);
  const raw = readFileSync(e.out, "utf8");
  const j = JSON.parse(raw);
  assert.ok(j.cms_preexisting.untracked.includes("apps/canary-monitor/one.ts"));
  assert.ok(j.cms_preexisting.untracked.includes("apps/canary-monitor/two.ts"));
  assert.ok(j.cms_preexisting.modified.includes("a.txt"));
  assert.ok(!raw.includes(CANARY));
});
test("T-no-secrets-read: .env canary never reaches output; source never touches .env", () => {
  const e = env({ legacyEnv: true });
  assert.equal(e.snap.status, 0, e.snap.stderr);
  assert.ok(!e.snap.stdout.includes(CANARY) && !e.snap.stderr.includes(CANARY));
  assert.ok(!readFileSync(e.out, "utf8").includes(CANARY));
  assert.ok(!/["'`/]\.env/.test(readFileSync(SCRIPT, "utf8")), "script source references a .env path");
});

// ---------- worktrees ----------
test("T-guard-worktree: unchanged 0; new commit on worktree branch 1; removed worktree 1", () => {
  let e = env();
  assert.equal(e.snap.status, 0, e.snap.stderr);
  assert.equal(guard(e).status, 0);
  put(e.p.wt1, "x.txt", "x"); gitW(e.p.wt1, "add", "x.txt"); gitW(e.p.wt1, "commit", "-qm", "x");
  assert.equal(guard(e).status, 1);
  e = env();
  assert.equal(e.snap.status, 0, e.snap.stderr);
  gitW(e.p.clone, "worktree", "remove", e.p.wt2);
  assert.equal(guard(e).status, 1);
});

// ---------- origin/main exemption ----------
test("T-guard-originmain-pos: moved to after_sha with record -> 0", () => {
  const e = env({ behind: false });
  assert.equal(e.snap.status, 0, e.snap.stderr);
  e.p.advanceOrigin("c3");
  writeRecord(e);
  const r = guard(e);
  assert.equal(r.status, 0, r.stdout + r.stderr);
});
test("T-guard-originmain-neg-elsewhere: moved to another sha with record -> 1", () => {
  const e = env({ behind: false });
  assert.equal(e.snap.status, 0, e.snap.stderr);
  e.p.advanceOrigin("c3");
  writeRecord(e, { after_sha: "0".repeat(40) });
  assert.equal(guard(e).status, 1);
});
test("T-guard-originmain-neg-norecord: moved, no record -> 1", () => {
  const e = env({ behind: false });
  assert.equal(e.snap.status, 0, e.snap.stderr);
  e.p.advanceOrigin("c3");
  assert.equal(guard(e).status, 1);
});

// ---------- preflight ----------
const pre = (repo) => cli(["--parrot-preflight", "--repo", repo]);
test("T-preflight-clean: ff-able clean clone -> 0 (untracked-only tolerated)", () => {
  const p = makeParrot(); p.advanceOrigin();
  assert.equal(pre(p.clone).status, 0);
  put(p.clone, "untracked.txt", "u");
  assert.equal(pre(p.clone).status, 0);
});
test("T-preflight-dirty: modified tracked file -> 1", () => {
  const p = makeParrot(); p.advanceOrigin();
  appendFileSync(path.join(p.clone, "README"), "dirty");
  assert.equal(pre(p.clone).status, 1);
});
test("T-preflight-branch: non-main checkout -> 1", () => {
  const p = makeParrot(); p.advanceOrigin();
  gitW(p.clone, "checkout", "-q", "-b", "other");
  assert.equal(pre(p.clone).status, 1);
});
test("T-preflight-diverged: local main has unique commit -> 1", () => {
  const p = makeParrot(); p.advanceOrigin();
  put(p.clone, "local.txt", "l"); gitW(p.clone, "add", "local.txt"); gitW(p.clone, "commit", "-qm", "local");
  assert.equal(pre(p.clone).status, 1);
});

// ---------- ff-check ----------
const ffArgs = (e, after) => ["--parrot-ff-check", "--repo", e.p.clone, "--expect-after", after,
  "--baseline", e.out, "--record", e.record];
function ffEnv() {
  const e = env();
  assert.equal(e.snap.status, 0, e.snap.stderr);
  return e;
}
test("T-ff-check: ff'd clone with record -> 0", () => {
  const e = ffEnv();
  const { after } = writeRecord(e);
  gitW(e.p.clone, "pull", "-q", "--ff-only", "origin", "main");
  const r = cli(ffArgs(e, after));
  assert.equal(r.status, 0, r.stdout + r.stderr);
});
test("T-ff-check: pre-ff -> 1", () => {
  const e = ffEnv();
  const { after } = writeRecord(e);
  assert.equal(cli(ffArgs(e, after)).status, 1);
});
test("T-ff-check: expect-after differs -> 1", () => {
  const e = ffEnv();
  writeRecord(e);
  gitW(e.p.clone, "pull", "-q", "--ff-only", "origin", "main");
  assert.equal(cli(ffArgs(e, "1".repeat(40))).status, 1);
});
test("T-ff-check: moved worktree -> 1", () => {
  const e = ffEnv();
  const { after } = writeRecord(e);
  gitW(e.p.clone, "pull", "-q", "--ff-only", "origin", "main");
  put(e.p.wt1, "y.txt", "y"); gitW(e.p.wt1, "add", "y.txt"); gitW(e.p.wt1, "commit", "-qm", "y");
  assert.equal(cli(ffArgs(e, after)).status, 1);
});
test("T-ff-check: dirty tree -> 1", () => {
  const e = ffEnv();
  const { after } = writeRecord(e);
  gitW(e.p.clone, "pull", "-q", "--ff-only", "origin", "main");
  appendFileSync(path.join(e.p.clone, "README"), "dirty");
  assert.equal(cli(ffArgs(e, after)).status, 1);
});
test("T-ff-record: record missing -> 1; record after_sha differs from HEAD -> 1", () => {
  const e = ffEnv();
  const { after } = writeRecord(e);
  gitW(e.p.clone, "pull", "-q", "--ff-only", "origin", "main");
  rmSync(e.record);
  assert.equal(cli(ffArgs(e, after)).status, 1);
  writeRecord(e, { after_sha: "2".repeat(40) });
  assert.equal(cli(ffArgs(e, after)).status, 1);
});
test("T-ff-record: before_sha not an ancestor of HEAD -> 1", () => {
  const e = ffEnv();
  const { after } = writeRecord(e, { before_sha: "3".repeat(40) });
  gitW(e.p.clone, "pull", "-q", "--ff-only", "origin", "main");
  assert.equal(cli(ffArgs(e, after)).status, 1);
});
