import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, appendFileSync, statSync, utimesSync, rmSync, existsSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runClosure, scopeCheck } from "./verify-code-maps.mjs";

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
// plain `git status` control: must NOT inherit GIT_OPTIONAL_LOCKS=0 from the invoking shell,
// otherwise it does not refresh (rewrite) the index and the fixture-sensitivity control is vacuous.
const gitPlain = (cwd, ...a) => {
  const e = { ...process.env };
  delete e.GIT_OPTIONAL_LOCKS;
  return execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "-c", "commit.gpgsign=false", ...a], {
    cwd, encoding: "utf8", env: e,
  }).trim();
};
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
  gitPlain(e.legacy, "status", "--short");
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
  gitPlain(legacy, "status", "--short");
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

// ================= Plan 38-02: --maps / --relationship =================
const DOCS = ["STACK", "INTEGRATIONS", "ARCHITECTURE", "STRUCTURE", "CONVENTIONS", "TESTING", "CONCERNS"];
const SHA_C = "d1658aa5ba0ce397788cd79c34b425c459eaa0da";
const SHA_P = "74880e45226e4920cfdf1dec6b36bea5fd8a190b";
const SHA_L = "99bcced93f997c8f09147c0cb18e132f8f3da751";
const REPOS = { cms: "internjobs-cms", parrot: "PA-Ai-Team/Parrot", legacy: "growthpods/Internjobs" };
const SHAS = { cms: SHA_C, parrot: SHA_P, legacy: SHA_L };
const stamp = (k, over = {}) =>
  `<!-- generated from ${over.repo ?? REPOS[k]} @ ${over.sha ?? SHAS[k]} on ${over.date ?? "2026-10-09"} -->\n`;

function makeMaps() {
  const root = tmp("maps-");
  const m = { root, manifest: path.join(root, "MANIFEST.json") };
  for (const k of ["cms", "parrot", "legacy"]) {
    m[k] = path.join(root, k);
    for (const d of DOCS) put(m[k], `${d}.md`, `${stamp(k)}# ${d}\n\nClean prose. Mentions STRIPE_SECRET_KEY by name only.\n`);
  }
  writeFileSync(m.manifest, JSON.stringify({
    cms: { repo: REPOS.cms, sha: SHA_C, merge_date: "2026-10-08" },
    parrot: { repo: REPOS.parrot, sha: SHA_P },
    legacy: { repo: REPOS.legacy, sha: SHA_L },
  }));
  return m;
}
const maps = (m, extra = []) =>
  cli(["--maps", "--manifest", m.manifest, "--cms-dir", m.cms, "--parrot-dir", m.parrot, "--legacy-dir", m.legacy,
    "--parrot-repo", path.join(m.root, "no-parrot"), "--legacy-repo", path.join(m.root, "no-legacy"), ...extra]);

test("T-gate-plan: --gate-prev 38-01 red without VERIFICATION, green with passed", () => {
  const pd = tmp("phases-");
  mkdirSync(path.join(pd, "38-code-map-coupling-inventory"));
  assert.equal(cli(["--gate-prev", "38-01", "--phases-dir", pd]).status, 1);
  const f = path.join(pd, "38-code-map-coupling-inventory", "38-01-VERIFICATION.md");
  writeFileSync(f, "---\nstatus: gaps_found\n---\n");
  assert.equal(cli(["--gate-prev", "38-01", "--phases-dir", pd]).status, 1);
  writeFileSync(f, "---\nstatus: passed\n---\n");
  assert.equal(cli(["--gate-prev", "38-01", "--phases-dir", pd]).status, 0);
});

test("T-maps-positive: complete stamped clean maps -> 0", () => {
  const m = makeMaps();
  const r = maps(m);
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

for (const k of ["cms", "parrot", "legacy"]) {
  for (const d of DOCS) {
    test(`T-maps-missing: ${k}/${d}.md deleted -> 1 naming it`, () => {
      const m = makeMaps();
      rmSync(path.join(m[k], `${d}.md`));
      const r = maps(m);
      assert.equal(r.status, 1, r.stdout + r.stderr);
      assert.match(r.stdout, new RegExp(`${d}\\.md`));
    });
  }
  test(`T-maps-missing: ${k} empty doc -> 1`, () => {
    const m = makeMaps();
    writeFileSync(path.join(m[k], "STACK.md"), "");
    assert.equal(maps(m).status, 1);
  });
}

test("T-maps-stamp-missing: no stamp line -> 1 naming the doc", () => {
  const m = makeMaps();
  writeFileSync(path.join(m.parrot, "TESTING.md"), "# TESTING\nno stamp\n");
  const r = maps(m);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /TESTING\.md/);
});
test("T-maps-stamp-wrong-repo: stamp names another repo -> 1", () => {
  const m = makeMaps();
  writeFileSync(path.join(m.legacy, "STACK.md"), `${stamp("legacy", { repo: "internjobs-cms" })}# x\n`);
  const r = maps(m);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /STACK\.md/);
});
test("T-maps-stamp-wrong-sha: stamp sha differs from MANIFEST -> 1", () => {
  const m = makeMaps();
  writeFileSync(path.join(m.cms, "CONCERNS.md"), `${stamp("cms", { sha: "1ef2960b49d48d1f46c4151a0a115cce7e268e0d" })}# x\n`);
  const r = maps(m);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /CONCERNS\.md/);
});
test("T-maps-stamp-short-sha: a 7-char prefix of the manifest sha is accepted", () => {
  const m = makeMaps();
  writeFileSync(path.join(m.cms, "CONCERNS.md"), `${stamp("cms", { sha: SHA_C.slice(0, 7) })}# x\n`);
  assert.equal(maps(m).status, 0);
});
test("T-maps-stamp-stale-date: cms stamp date before merge_date -> 1", () => {
  const m = makeMaps();
  writeFileSync(path.join(m.cms, "ARCHITECTURE.md"), `${stamp("cms", { date: "2026-05-24" })}# x\n`);
  const r = maps(m);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /ARCHITECTURE\.md/);
});
test("T-maps-stamp-not-first-line: stamp on line 2 -> 1", () => {
  const m = makeMaps();
  writeFileSync(path.join(m.cms, "STACK.md"), `# STACK\n${stamp("cms")}`);
  assert.equal(maps(m).status, 1);
});

const SECRETS = {
  "sk-": "const k = 'sk-live-abcdefghijklmnop1234';",
  AKIA: "aws AKIAABCDEFGHIJKLMNOP here",
  ghp_: "token ghp_abcdefghijklmnopqrstuvwxyz0123456789",
  "xoxb-": "slack xoxb-1234567890-abcdefghij",
  PEM: "-----BEGIN PRIVATE KEY-----",
  JWT: "jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijklmnop",
  "KEY=": "SOME_KEY=abcdefghijklmnop12",
  ".env=": "see .env.local=abcdef1234 for details",
  "SECRET=": "APP_SECRET=abcdefghijklmnop12",
  "TOKEN=": "API_TOKEN=abcdefghijklmnop12",
  "PASSWORD=": "DB_PASSWORD=abcdefghijklmnop12",
  "url creds": "postgres://admin:hunter2pass@db.example.com/x",
};
for (const [name, body] of Object.entries(SECRETS)) {
  test(`T-maps-secret: ${name} pattern -> 1`, () => {
    const m = makeMaps();
    appendFileSync(path.join(m.legacy, "INTEGRATIONS.md"), `\n${body}\n`);
    const r = maps(m);
    assert.equal(r.status, 1, r.stdout);
    assert.match(r.stdout, /INTEGRATIONS\.md/);
    assert.ok(!r.stdout.includes("abcdefghijklmnop12"), "secret value must not be echoed");
  });
}
test("T-maps-secret: env var named without a value -> 0 (false-positive control)", () => {
  const m = makeMaps();
  appendFileSync(path.join(m.cms, "INTEGRATIONS.md"), "\n`STRIPE_SECRET_KEY` and `CLERK_SECRET_KEY=` (set via Infisical), `.env.example` lists names.\n");
  const r = maps(m);
  assert.equal(r.status, 0, r.stdout);
});

test("T-maps-location: map dir inside a Parrot or legacy work tree -> 1", () => {
  for (const which of ["parrot-repo", "legacy-repo"]) {
    const m = makeMaps();
    const fake = tmp("srcrepo-");
    gitW(fake, "init", "-q", "-b", "main");
    const inside = path.join(fake, "maps");
    mkdirSync(inside);
    for (const d of DOCS) writeFileSync(path.join(inside, `${d}.md`), `${stamp(which === "parrot-repo" ? "parrot" : "legacy")}# x\n`);
    const args = ["--maps", "--manifest", m.manifest, "--cms-dir", m.cms,
      "--parrot-dir", which === "parrot-repo" ? inside : m.parrot,
      "--legacy-dir", which === "legacy-repo" ? inside : m.legacy,
      "--parrot-repo", which === "parrot-repo" ? fake : path.join(m.root, "no-parrot"),
      "--legacy-repo", which === "legacy-repo" ? fake : path.join(m.root, "no-legacy")];
    const r = cli(args);
    assert.equal(r.status, 1, `${which}: ${r.stdout}`);
    assert.match(r.stdout, /inside/);
  }
});

// ---------- relationship ----------
function makeRel({ cmsName = "ws-fixture", parrotPkg = "parrot-server", git: useGit = false } = {}) {
  const root = tmp("rel-");
  const cms = path.join(root, "cms");
  const parrot = path.join(root, "Parrot");
  put(cms, "apps/parrot/wrangler.toml", `name = "${cmsName}"\nmain = "workers/app.ts"\n`);
  put(cms, "apps/parrot/package.json", JSON.stringify({ name: "parrot" }));
  put(cms, "apps/parrot/shared/phone.ts", "export {};\n");
  put(parrot, "package.json", JSON.stringify({ name: parrotPkg }));
  put(parrot, "server/phone.ts", "export {};\n");
  if (useGit) {
    gitW(parrot, "init", "-q", "-b", "main");
    gitW(parrot, "add", "-A");
    gitW(parrot, "commit", "-qm", "c");
    gitW(parrot, "update-ref", "refs/remotes/origin/main", "HEAD");
    put(parrot, "server/phone.ts", "export const changedInWorktreeOnly = 1;\n");
  }
  const doc = (rows = {}) => {
    const base = {
      worker_name: ["ws-fixture", "none"],
      package_name: ["parrot", "parrot-server"],
      shared_items: ["shared/phone.ts", "server/phone.ts"],
      must_not_change: ["worker name ws-fixture", "Fly app name"],
      relationship: ["independent", "independent"],
      ...rows,
    };
    const body = Object.entries(base)
      .filter(([, v]) => v !== null)
      .map(([k, v]) => `| ${k} | ${v[0]} | ${v[1]} |`).join("\n");
    const f = path.join(root, "REL.md");
    writeFileSync(f, `# Relationship\n\nProse.\n\n| fact | apps/parrot | PA-Ai-Team/Parrot |\n|---|---|---|\n${body}\n`);
    return f;
  };
  return { root, cms, parrot, doc };
}
const rel = (x, f) => cli(["--relationship", f, "--cms", x.cms, "--parrot", x.parrot]);

test("T-rel-fixture positive: claims match files -> 0", () => {
  const x = makeRel();
  const r = rel(x, x.doc());
  assert.equal(r.status, 0, r.stdout + r.stderr);
});
test("T-rel-fixture NEG: wrong worker name -> 1", () => {
  const x = makeRel();
  const r = rel(x, x.doc({ worker_name: ["something-else", "none"] }));
  assert.equal(r.status, 1);
  assert.match(r.stdout, /worker_name/);
});
test("T-rel-fixture NEG: wrong Parrot package name -> 1", () => {
  const x = makeRel();
  assert.equal(rel(x, x.doc({ package_name: ["parrot", "nope"] })).status, 1);
});
test("T-rel-fixture NEG: shared item missing in the Parrot tree -> 1", () => {
  const x = makeRel();
  const r = rel(x, x.doc({ shared_items: ["shared/phone.ts", "server/gone.ts"] }));
  assert.equal(r.status, 1);
  assert.match(r.stdout, /gone\.ts/);
});
test("T-rel-fixture NEG: shared item missing in the cms tree -> 1", () => {
  const x = makeRel();
  assert.equal(rel(x, x.doc({ shared_items: ["shared/gone.ts", "server/phone.ts"] })).status, 1);
});
test("T-rel-fixture NEG: must_not_change row omitted -> 1", () => {
  const x = makeRel();
  const r = rel(x, x.doc({ must_not_change: null }));
  assert.equal(r.status, 1);
  assert.match(r.stdout, /must_not_change/);
});
test("T-rel-fixture NEG: relationship value absent or not in the vocabulary -> 1", () => {
  const x = makeRel();
  assert.equal(rel(x, x.doc({ relationship: null })).status, 1);
  assert.equal(rel(x, x.doc({ relationship: ["cousins", "independent"] })).status, 1);
  assert.equal(rel(x, x.doc({ relationship: ["other:diverged copy", "independent"] })).status, 0);
});
test("T-rel-fixture NEG: doc missing -> 1", () => {
  const x = makeRel();
  assert.equal(rel(x, path.join(x.root, "absent.md")).status, 1);
});
test("T-rel-fixture: Parrot content is read at origin/main, not the working tree", () => {
  const x = makeRel({ git: true });
  // the committed tree has server/phone.ts; the worktree edit must not matter; a file only in worktree is not shared
  assert.equal(rel(x, x.doc()).status, 0);
  put(x.parrot, "server/only-in-worktree.ts", "x\n");
  assert.equal(rel(x, x.doc({ shared_items: ["shared/phone.ts", "server/only-in-worktree.ts"] })).status, 1);
});
test("T-rel-fixture: never reads .env*", () => {
  const x = makeRel();
  put(x.cms, "apps/parrot/.env", `NAME=${CANARY}\n`);
  const r = rel(x, x.doc());
  assert.ok(!(r.stdout + r.stderr).includes(CANARY));
});

// ---- 38-03 advisory: extended secret shapes, negative (false-positive) controls ----
for (const [name, body] of Object.entries({
  "SECRET= short value": "APP_SECRET=short",
  "TOKEN= empty": "GITHUB_TOKEN= (set in Actions)",
  "TOKEN= templated": "TOKEN=${{ secrets.NPM_TOKEN }}",
  "PASSWORD= name only": "`DB_PASSWORD=` is read from Infisical",
  "url without creds": "postgres://localhost:5432/db and https://example.com/a@b",
})) {
  test(`T-maps-secret-negative: ${name} -> 0`, () => {
    const m = makeMaps();
    appendFileSync(path.join(m.cms, "INTEGRATIONS.md"), `\n${body}\n`);
    const r = maps(m);
    assert.equal(r.status, 0, r.stdout);
  });
}

// ================= Plan 38-03: --inventory / --repo-map =================
const NAMED = [
  ".github/workflows/ci.yml", "package.json", "package-lock.json", "README.md",
  "apps/marketing/wrangler.toml", "apps/employers/src/styles.css", "apps/employers/tailwind.config.ts",
  "apps/app/src/views.mjs", "apps/marketing/src/components/StartupAccessSection.tsx",
  "packages/shared/**", ".planning/**", "infra/**", "scripts/**",
];
const INV_FILES = {
  ".github/workflows/ci.yml": "run: cd apps/marketing && npm ci\n",
  "package.json": '{"scripts":{"build:marketing":"npm -w apps/marketing run build"}}\n',
  "package-lock.json": '{"packages":{"apps/employers":{}}}\n',
  "README.md": "see apps/app\n",
  "apps/marketing/wrangler.toml": 'name = "internjobs-ai"\n',
  "apps/employers/src/styles.css": '@source "apps/marketing/src";\n',
  "apps/employers/tailwind.config.ts": "// apps/marketing\n",
  "apps/app/src/views.mjs": "// apps/marketing\n",
  "apps/marketing/src/components/StartupAccessSection.tsx": "// apps/employers\n",
  "packages/shared/x.ts": "// apps/parrot\n",
  ".planning/STATE.md": "PA-MATRIX/ repo\n",
  "infra/a.tf": "# internjobs-ai\n",
  "scripts/s.mjs": "// apps/app\n",
  "apps/marketing/src/self.ts": "// apps/marketing only mentions itself\n",
  "src/clean.ts": "export {};\n",
};
function makeInvRepo(files = INV_FILES, { envCanary = false } = {}) {
  const dir = tmp("inv-");
  gitW(dir, "init", "-q", "-b", "main");
  for (const [f, b] of Object.entries(files)) put(dir, f, b);
  gitW(dir, "add", "-A");
  gitW(dir, "commit", "-qm", "init");
  if (envCanary) put(dir, ".env.local", `internjobs-ai ${CANARY}\n`);
  return dir;
}
const HIT_ROWS = NAMED.map((p) => ({ path: p }));
const fmtRow = (r) =>
  `| ${r.repo ?? "cms"} | ${r.path} | ${r.pat ?? "apps/marketing"} | ${r.kind ?? "config"} | ${r.disp ?? "keep"} | ${r.dest ?? "n/a"} | ${r.note ?? "stays valid unchanged"} |`;
const invDoc = (rows, dir = tmp("invdoc-")) => {
  const f = path.join(dir, "COUPLING-INVENTORY.md");
  writeFileSync(f, `# Inventory\n\nProse | with a pipe is not a row.\n\n| repo | path | pattern(s) | kind | disposition | destination | note |\n|---|---|---|---|---|---|---|\n${rows.map(fmtRow).join("\n")}\n`);
  return f;
};
const inv = (doc, repo, extra = []) => cli(["--inventory", doc, "--repo", repo, ...extra]);

test("T-inv-complete: every recomputed hit covered, named minimum present -> 0", () => {
  const repo = makeInvRepo();
  const r = inv(invDoc(HIT_ROWS), repo);
  assert.equal(r.status, 0, r.stdout + r.stderr);
});
test("T-inv-excluded: a file inside apps/marketing mentioning only apps/marketing needs no row, but one mentioning packages/shared does", () => {
  const repo = makeInvRepo({ ...INV_FILES, "apps/marketing/src/uses-shared.ts": "import 'packages/shared';\n" });
  const r = inv(invDoc(HIT_ROWS), repo);
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /apps\/marketing\/src\/uses-shared\.ts/);
  assert.doesNotMatch(r.stdout, /self\.ts/);
});
for (const row of HIT_ROWS) {
  test(`T-inv-row-removed: deleting the ${row.path} row -> 1 naming an uncovered path`, () => {
    const repo = makeInvRepo();
    const doc = invDoc(HIT_ROWS.filter((x) => x !== row));
    const r = inv(doc, repo);
    assert.equal(r.status, 1, r.stdout);
    assert.ok(r.stdout.includes(row.path.replace(/\/\*\*$/, "")), r.stdout);
  });
}
test("T-inv-named: each named-minimum row removed in turn -> 1 (independent of the hit set)", () => {
  const repo = makeInvRepo({ "src/clean.ts": "export {};\n" });
  assert.equal(inv(invDoc(HIT_ROWS), repo).status, 0);
  for (const n of NAMED) {
    const r = inv(invDoc(HIT_ROWS.filter((x) => x.path !== n)), repo);
    assert.equal(r.status, 1, `${n}: ${r.stdout}`);
    assert.match(r.stdout, /named minimum/);
    assert.ok(r.stdout.includes(n), r.stdout);
  }
});
test("T-inv-named: a covering glob satisfies a named file", () => {
  const repo = makeInvRepo({ "src/clean.ts": "export {};\n" });
  const rows = HIT_ROWS.filter((x) => x.path !== "apps/app/src/views.mjs").concat([{ path: "apps/app/**" }]);
  assert.equal(inv(invDoc(rows), repo).status, 0);
});
test("T-inv-disposition: positive, plus four negatives (one per defect)", () => {
  const repo = makeInvRepo({ "src/clean.ts": "export {};\n" });
  const base = HIT_ROWS.filter((x) => x.path !== "README.md");
  const ok = (extra) => inv(invDoc(base.concat([{ path: "README.md", ...extra }])), repo);
  assert.equal(ok({ disp: "move", dest: "website" }).status, 0);
  assert.equal(ok({ disp: "move", dest: "platform" }).status, 0);
  assert.equal(ok({ disp: "rewrite", note: "rewrite: point links at the new repo" }).status, 0);
  assert.equal(ok({ disp: "delete" }).status, 0);
  let r = ok({ disp: "maybe" });
  assert.equal(r.status, 1); assert.match(r.stdout, /disposition/);
  r = ok({ disp: "keep|move" });
  assert.equal(r.status, 1);
  r = ok({ disp: "move", dest: "n/a" });
  assert.equal(r.status, 1); assert.match(r.stdout, /destination/);
  r = ok({ disp: "move", dest: "elsewhere" });
  assert.equal(r.status, 1);
  r = ok({ disp: "rewrite", note: "it changes somehow" });
  assert.equal(r.status, 1); assert.match(r.stdout, /rewrite/);
  r = ok({ note: "" });
  assert.equal(r.status, 1); assert.match(r.stdout, /rationale/);
  r = ok({ note: "   " });
  assert.equal(r.status, 1);
});
test("T-inv-listhits: --inventory --list-hits prints the recomputed hit set, nothing else", () => {
  const repo = makeInvRepo();
  const r = cli(["--inventory", "--list-hits", "--repo", repo]);
  assert.equal(r.status, 0, r.stderr);
  const got = r.stdout.split("\n").filter(Boolean);
  assert.ok(got.includes("scripts/s.mjs") && got.includes("README.md"));
  assert.ok(!got.includes("src/clean.ts") && !got.includes("apps/marketing/src/self.ts"));
});
test("T-inv-crossrepo: committed tree at a ref only; untracked .env.local canary never read or printed; row removal -> 1", () => {
  const repo = makeInvRepo({ "server/a.ts": "// uses internjobs-ai\n", "README": "plain\n" }, { envCanary: true });
  const rows = [{ repo: "parrot", path: "server/a.ts", pat: "internjobs-ai", kind: "doc" }];
  const doc = invDoc(rows);
  const r = inv(doc, repo, ["--ref", "HEAD", "--repo-name", "parrot"]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.ok(!(r.stdout + r.stderr).includes(CANARY));
  assert.ok(!readFileSync(doc, "utf8").includes(CANARY));
  const l = cli(["--inventory", "--list-hits", "--repo", repo, "--ref", "HEAD"]);
  assert.ok(!l.stdout.includes(".env.local") && !l.stdout.includes(CANARY), l.stdout);
  // cms-only named minimum must not be demanded of other repos
  const bad = inv(invDoc([]), repo, ["--ref", "HEAD", "--repo-name", "parrot"]);
  assert.equal(bad.status, 1);
  assert.match(bad.stdout, /server\/a\.ts/);
  assert.ok(!(bad.stdout + bad.stderr).includes(CANARY));
  // rows for a different repo section do not cover this repo's hits
  const other = inv(invDoc([{ repo: "legacy", path: "server/a.ts" }]), repo, ["--ref", "HEAD", "--repo-name", "parrot"]);
  assert.equal(other.status, 1);
});
test("T-inv-secret: a secret-shaped string in the inventory -> 1 without echoing it", () => {
  const repo = makeInvRepo({ "src/clean.ts": "export {};\n" });
  const doc = invDoc(HIT_ROWS.map((x) => (x.path === "README.md" ? { ...x, note: "API_TOKEN=abcdefghijklmnop12" } : x)));
  const r = inv(doc, repo);
  assert.equal(r.status, 1);
  assert.ok(!r.stdout.includes("abcdefghijklmnop12"));
});

// ---------- --repo-map ----------
const SLUGS = {
  site: "PA-MATRIX/internjobs-marketing-website",
  parrot: "PA-Ai-Team/Parrot",
  legacy: "growthpods/Internjobs",
};
function makeRepoMapEnv() {
  const root = tmp("rm-");
  const folders = {};
  const urls = {
    site: "https://github.com/PA-MATRIX/internjobs-marketing-website.git",
    parrot: "git@github.com:PA-Ai-Team/Parrot.git",
    legacy: "https://github.com/growthpods/Internjobs",
  };
  for (const k of Object.keys(SLUGS)) {
    const d = path.join(root, k);
    mkdirSync(d);
    gitW(d, "init", "-q", "-b", "main");
    gitW(d, "remote", "add", "origin", urls[k]);
    folders[k] = d;
  }
  const gh = {
    repos: {
      [SLUGS.site]: { nameWithOwner: SLUGS.site, visibility: "PUBLIC", owner: { login: "PA-MATRIX" } },
      [SLUGS.parrot]: { nameWithOwner: SLUGS.parrot, visibility: "PRIVATE", owner: { login: "PA-Ai-Team" } },
      [SLUGS.legacy]: { nameWithOwner: SLUGS.legacy, visibility: "PRIVATE", owner: { login: "growthpods" } },
    },
    lists: {
      "PA-MATRIX": [{ name: "internjobs-marketing-website", visibility: "PUBLIC" }, { name: "unrelated-thing", visibility: "PRIVATE" }],
      "PA-Ai-Team": [{ name: "Parrot", visibility: "PRIVATE" }],
      growthpods: [{ name: "Internjobs", visibility: "PRIVATE" }],
    },
  };
  const ghFile = path.join(root, "gh.json");
  const teamFile = path.join(root, "team-mode.json");
  writeFileSync(teamFile, JSON.stringify({ teams: { "team-cms": {}, "team-workspace": {} } }));
  const baseRows = () => [
    { slug: SLUGS.site, owner: "PA-MATRIX", vis: "Public", purpose: "website", folder: folders.site, deploy: "Cloudflare Pages internjobs-ai", team: "team-cms" },
    { slug: SLUGS.parrot, owner: "PA-Ai-Team", vis: "Private", purpose: "Parrot", folder: folders.parrot, deploy: "Fly", team: "unmanaged: separate org" },
    { slug: SLUGS.legacy, owner: "growthpods", vis: "Private", purpose: "legacy app", folder: folders.legacy, deploy: "none", team: "unmanaged: legacy, archive pending" },
  ];
  const write = ({ rows = baseRows(), excluded = [], ghOver, planned = true } = {}) => {
    writeFileSync(ghFile, JSON.stringify(ghOver ?? gh));
    const f = path.join(root, "REPO-MAP.md");
    const line = (r) => `| ${r.slug} | ${r.owner} | ${r.vis} | ${r.purpose} | ${r.folder} | ${r.deploy} | ${r.team} |`;
    writeFileSync(f, [
      "# Repo map", "", "## Repos", "",
      "| Repo | Owner | Visibility | Purpose | Local folder | Deploy target | Owning team |", "|---|---|---|---|---|---|---|",
      ...rows.map(line), "",
      "## Planned", "",
      "| Repo | Owner | Visibility | Purpose | Local folder | Deploy target | Owning team |", "|---|---|---|---|---|---|---|",
      ...(planned ? ["| PA-MATRIX/internjobs-platform | PA-MATRIX | Private | planned | /nonexistent/planned | planned | team-foo |"] : []), "",
      "## Excluded", "", ...excluded.map((e) => `- ${e}`), "",
    ].join("\n"));
    return f;
  };
  return { root, folders, gh, ghFile, teamFile, baseRows, write };
}
const rmap = (x, f) => cli(["--repo-map", f, "--gh-json", x.ghFile, "--team-mode", x.teamFile]);

test("T-repomap positive: matching rows, planned section ignored -> 0", () => {
  const x = makeRepoMapEnv();
  const r = rmap(x, x.write());
  assert.equal(r.status, 0, r.stdout + r.stderr);
});
for (const col of ["owner", "vis", "purpose", "folder", "deploy", "team"]) {
  test(`T-repomap-columns: blank ${col} -> 1`, () => {
    const x = makeRepoMapEnv();
    const rows = x.baseRows();
    rows[1] = { ...rows[1], [col]: "" };
    const r = rmap(x, x.write({ rows }));
    assert.equal(r.status, 1, r.stdout);
    assert.match(r.stdout, /Parrot/);
  });
}
for (const k of Object.keys(SLUGS)) {
  test(`T-repomap-columns: row for ${SLUGS[k]} missing -> 1`, () => {
    const x = makeRepoMapEnv();
    const rows = x.baseRows().filter((r) => r.slug !== SLUGS[k]);
    const r = rmap(x, x.write({ rows }));
    assert.equal(r.status, 1);
    assert.ok(r.stdout.includes(SLUGS[k]), r.stdout);
  });
}
test("T-repomap-visibility: doc says Public, gh says PRIVATE -> 1", () => {
  const x = makeRepoMapEnv();
  const rows = x.baseRows(); rows[1].vis = "Public";
  const r = rmap(x, x.write({ rows }));
  assert.equal(r.status, 1); assert.match(r.stdout, /visibility/);
});
test("T-repomap-owner: owner differs from gh -> 1", () => {
  const x = makeRepoMapEnv();
  const rows = x.baseRows(); rows[0].owner = "someone-else";
  const r = rmap(x, x.write({ rows }));
  assert.equal(r.status, 1); assert.match(r.stdout, /owner/);
});
test("T-repomap-remote: local folder's origin is another repo -> 1", () => {
  const x = makeRepoMapEnv();
  gitW(x.folders.parrot, "remote", "set-url", "origin", "https://github.com/PA-Ai-Team/Other.git");
  const r = rmap(x, x.write());
  assert.equal(r.status, 1); assert.match(r.stdout, /remote/);
});
test("T-repomap-folder: local folder missing -> 1", () => {
  const x = makeRepoMapEnv();
  const rows = x.baseRows(); rows[2].folder = path.join(x.root, "gone");
  const r = rmap(x, x.write({ rows }));
  assert.equal(r.status, 1); assert.match(r.stdout, /folder/);
});
test("T-repomap-enum: enumerated matching repo absent -> 1; Excluded with reason -> 0; reasonless -> 1; non-matching ignored", () => {
  const x = makeRepoMapEnv();
  const g = JSON.parse(JSON.stringify(x.gh));
  g.lists["PA-MATRIX"].push({ name: "intern-extra", visibility: "PRIVATE" });
  let r = rmap(x, x.write({ ghOver: g }));
  assert.equal(r.status, 1); assert.match(r.stdout, /intern-extra/);
  r = rmap(x, x.write({ ghOver: g, excluded: ["PA-MATRIX/intern-extra: scratch experiment"] }));
  assert.equal(r.status, 0, r.stdout);
  r = rmap(x, x.write({ ghOver: g, excluded: ["PA-MATRIX/intern-extra:"] }));
  assert.equal(r.status, 1);
  g.lists["PA-Ai-Team"].push({ name: "growth-notes", visibility: "PRIVATE" });
  r = rmap(x, x.write({ ghOver: g, excluded: ["PA-MATRIX/intern-extra: scratch experiment"] }));
  assert.equal(r.status, 1); assert.match(r.stdout, /growth-notes/);
});
test("T-repomap-team: unknown team -> 1; unmanaged with reason -> 0; unmanaged without reason -> 1", () => {
  const x = makeRepoMapEnv();
  let rows = x.baseRows(); rows[0].team = "team-nobody";
  let r = rmap(x, x.write({ rows }));
  assert.equal(r.status, 1); assert.match(r.stdout, /team/);
  rows = x.baseRows(); rows[1].team = "unmanaged:";
  assert.equal(rmap(x, x.write({ rows })).status, 1);
  rows = x.baseRows(); rows[1].team = "team-workspace";
  assert.equal(rmap(x, x.write({ rows })).status, 0);
});
test("T-repomap: missing doc or gh json -> 1", () => {
  const x = makeRepoMapEnv();
  const f = x.write();
  assert.equal(cli(["--repo-map", path.join(x.root, "absent.md"), "--gh-json", x.ghFile, "--team-mode", x.teamFile]).status, 1);
  assert.equal(cli(["--repo-map", f, "--gh-json", path.join(x.root, "absent.json"), "--team-mode", x.teamFile]).status, 1);
});

// ---------------- Plan 38-04: --closure ----------------
const PEND4 = "executed, pending verification";
const GREEN = { maps: () => 0, relationship: () => 0, inventoryCms: () => 0, inventoryParrot: () => 0, inventoryLegacy: () => 0, repoMap: () => 0, guard: () => 0, scope: () => 0 };
const PHASE_REL = ".planning/milestones/v1.6-repo-split/phases/38-code-map-coupling-inventory";

function makeRecords({ final = false, verification = null, patch = {} } = {}) {
  const root = tmp("rec-");
  const mapLine = (n) => final ? `- [x] **MAP-0${n}**: thing` : `- [ ] **MAP-0${n}**: thing ${PEND4}`;
  const mapRow = (n) => `| MAP-0${n} | Phase 38 | ${final ? "Complete" : "Pending verification"} |`;
  const q = [1, 2, 3, 4, 5, 6].map(mapLine).join("\n") + "\n\n" + [1, 2, 3, 4, 5, 6].map(mapRow).join("\n") + "\n";
  const r = `- [${final ? "x" : " "}] **Phase 38: Map the three codebases**${final ? "" : " (" + PEND4 + ")"}\n\n### Phase 38: Map\n**Plans**: 4 plans\n`;
  const st = `---\nphase: 38\nplan: 4\nplan_total: 4\nstatus: "${final ? "complete" : PEND4}"\n---\n\nStatus: ${final ? "complete" : PEND4}\n`;
  const ci = { milestone_id: "v1.6 Repo Split", phase_id: "38 Code map", plan_id: "38-04", intent: "x", updated_at: "2026-10-09" };
  put(root, ".planning/REQUIREMENTS.md", patch.q ? patch.q(q) : q);
  put(root, ".planning/ROADMAP.md", patch.r ? patch.r(r) : r);
  put(root, ".planning/STATE.md", patch.st ? patch.st(st) : st);
  if (patch.ci !== null) put(root, ".planning/current-intent.json", patch.ci ? patch.ci(ci) : JSON.stringify(ci));
  if (verification) put(root, `${PHASE_REL}/38-VERIFICATION.md`, `---\nstatus: ${verification}\n---\n`);
  return root;
}
const closure = (root, opts = {}, runners = GREEN) =>
  runClosure({ repo: root, phaseDir: path.join(root, PHASE_REL), final: false, log: () => {}, ...opts }, { ...GREEN, ...runners });

test("T-closure-pre: pending-verification records -> 0; --final -> 1 (T-closure-final-neg)", () => {
  const root = makeRecords();
  assert.equal(closure(root).failed, false);
  assert.equal(closure(root, { final: true }).failed, true);
});

test("T-closure-line-*: each restored old line fails closure", () => {
  const cases = {
    "MAP row Pending": { q: (q) => q.replace("| MAP-03 | Phase 38 | Pending verification |", "| MAP-03 | Phase 38 | Pending |") },
    "MAP line missing annotation": { q: (q) => q.replace(`thing ${PEND4}`, "thing") },
    "MAP line ticked": { q: (q) => q.replace("- [ ] **MAP-01**", "- [x] **MAP-01**") },
    "ROADMAP Plans TBD": { r: (r) => r.replace("4 plans", "TBD") },
    "ROADMAP phase ticked": { r: (r) => r.replace("- [ ] **Phase 38", "- [x] **Phase 38") },
    "ROADMAP annotation missing": { r: (r) => r.replace(` (${PEND4})`, "") },
    "STATE on phase 37": { st: (s) => s.replace("phase: 38", "phase: 37") },
    "STATE plan 3 of 4": { st: (s) => s.replace("plan: 4", "plan: 3") },
    "STATE annotation missing": { st: (s) => s.split(PEND4).join("in progress") },
  };
  for (const [name, patch] of Object.entries(cases)) {
    assert.equal(closure(makeRecords({ patch })).failed, true, name);
  }
});

test("T-closure-flip-neg/-pos: flipped records without passed verification -> final 1; with passed -> 0", () => {
  assert.equal(closure(makeRecords({ final: true }), { final: true }).failed, true);
  assert.equal(closure(makeRecords({ final: true, verification: "gaps_found" }), { final: true }).failed, true);
  assert.equal(closure(makeRecords({ final: true, verification: "passed" }), { final: true }).failed, false);
});

test("T-closure-intent: missing / invalid / lacking phase_id / wrong phase -> red", () => {
  assert.equal(closure(makeRecords({ patch: { ci: null } })).failed, true);
  assert.equal(closure(makeRecords({ patch: { ci: () => "{not json" } })).failed, true);
  assert.equal(closure(makeRecords({ patch: { ci: (c) => { delete c.phase_id; return JSON.stringify(c); } } })).failed, true);
  assert.equal(closure(makeRecords({ patch: { ci: (c) => JSON.stringify({ ...c, phase_id: "37 x" }) } })).failed, true);
  assert.equal(closure(makeRecords({ patch: { ci: (c) => JSON.stringify({ ...c, milestone_id: "v1.5" }) } })).failed, true);
});

test("T-closure-aggregates: each sub-gate red in turn makes closure red", () => {
  const root = makeRecords();
  for (const k of Object.keys(GREEN)) {
    assert.equal(closure(root, {}, { [k]: () => 1 }).failed, true, k);
  }
  assert.equal(closure(root, {}, { guard: () => { throw new Error("boom"); } }).failed, true, "a throwing gate is red");
});

function makeScopeRepo() {
  const dir = tmp("scope-");
  gitW(dir, "init", "-q", "-b", "main");
  put(dir, "apps/app/x.ts", "x\n");
  put(dir, "scripts/verify-code-maps.mjs", "v\n");
  put(dir, ".planning/STATE.md", "s\n");
  gitW(dir, "add", "-A");
  gitW(dir, "commit", "-qm", "init");
  gitW(dir, "update-ref", "refs/remotes/origin/main", "HEAD");
  put(dir, "apps/canary-monitor/one.ts", "1\n");
  put(dir, "apps/canary-monitor/two.ts", "2\n");
  const baseline = { cms_preexisting: { modified: [".planning/current-intent.json"], untracked: ["apps/canary-monitor/one.ts", "apps/canary-monitor/two.ts"] } };
  return { dir, baseline };
}

test("T-closure-scope: working-tree scope guard, six cases", () => {
  const { dir, baseline } = makeScopeRepo();
  // the old committed-diff check is blind: HEAD == origin/main
  assert.equal(git(dir, "diff", "origin/main...HEAD"), "");
  // untracked directory of 2+ files is reported per file and covered by the snapshot
  assert.deepEqual(scopeCheck(dir, baseline), []);
  // allowed edits: verifier script, .planning files
  appendFileSync(path.join(dir, "scripts/verify-code-maps.mjs"), "more\n");
  put(dir, ".planning/new/thing.md", "t\n");
  assert.deepEqual(scopeCheck(dir, baseline), []);
  // 1. tracked apps/ file edited
  appendFileSync(path.join(dir, "apps/app/x.ts"), "edit\n");
  assert.ok(scopeCheck(dir, baseline).some((p) => p.includes("apps/app/x.ts")));
  gitW(dir, "checkout", "--", "apps/app/x.ts");
  assert.deepEqual(scopeCheck(dir, baseline), []);
  // 2. staged apps/ change
  appendFileSync(path.join(dir, "apps/app/x.ts"), "staged\n");
  gitW(dir, "add", "apps/app/x.ts");
  assert.ok(scopeCheck(dir, baseline).some((p) => p.includes("apps/app/x.ts")));
  gitW(dir, "reset", "-q", "HEAD", "apps/app/x.ts");
  gitW(dir, "checkout", "--", "apps/app/x.ts");
  // 3. stray untracked file outside allowlist
  put(dir, "stray.txt", "s\n");
  assert.ok(scopeCheck(dir, baseline).some((p) => p.includes("stray.txt")));
  rmSync(path.join(dir, "stray.txt"));
  // 4. new file inside the snapshotted canary dir but not in the snapshot
  put(dir, "apps/canary-monitor/three.ts", "3\n");
  assert.ok(scopeCheck(dir, baseline).some((p) => p.includes("apps/canary-monitor/three.ts")));
  rmSync(path.join(dir, "apps/canary-monitor/three.ts"));
  assert.deepEqual(scopeCheck(dir, baseline), []);
  // 5. empty cms_preexisting names the canary directory
  const probs = scopeCheck(dir, { cms_preexisting: { modified: [], untracked: [] } });
  assert.ok(probs.some((p) => p.includes("apps/canary-monitor/")));
  // 6. deleted tracked apps file
  rmSync(path.join(dir, "apps/app/x.ts"));
  assert.ok(scopeCheck(dir, baseline).some((p) => p.includes("apps/app/x.ts")));
});

test("T-closure-scope via runClosure: scope problems make closure red", () => {
  const { dir, baseline } = makeScopeRepo();
  const root = makeRecords();
  const bl = path.join(root, "baseline.json");
  writeFileSync(bl, JSON.stringify({ cms_preexisting: { modified: [], untracked: [] } }));
  // real scope runner against the git fixture, records from the records fixture
  const res = runClosure({ repo: root, scopeRepo: dir, baseline: bl, phaseDir: path.join(root, PHASE_REL), final: false, log: () => {} }, { ...GREEN, scope: undefined });
  assert.equal(res.failed, true);
});

test("T-closure CLI: --closure without --baseline is a usage error (2)", () => {
  const r = cli(["--closure"]);
  assert.equal(r.status, 2);
});
