import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(here, "verify-sec-scan.mjs");
const FIX1 = "fix/contact-dedupe-on-send";
const FIX2 = "fix/sms-send-and-contact-dedupe-main";

const tmp = (p) => mkdtempSync(path.join(os.tmpdir(), p));
const git = (cwd, ...a) =>
  execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "-c", "commit.gpgsign=false", ...a], {
    cwd, encoding: "utf8", env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
  }).trim();
const run = (args) => {
  const r = spawnSync("node", [SCRIPT, ...args], { encoding: "utf8" });
  return { code: r.status, out: (r.stdout || "") + (r.stderr || "") };
};
const writeJson = (dir, name, obj) => {
  const f = path.join(dir, name);
  writeFileSync(f, JSON.stringify(obj, null, 2));
  return f;
};
const digestOf = (refs) =>
  createHash("sha256")
    .update(refs.map((r) => `${r.source}\t${r.ref}\t${r.tip}`).sort().join("\n"))
    .digest("hex");

// runtime-built fake secrets: no secret-shaped literal sits in this source
const FAKE_GHP = "gh" + "p_" + "A".repeat(36);
const FAKE_AKIA = "AK" + "IA" + "ABCDEFGHIJKLMNOP";
const FAKE_PEM = "-----BEG" + "IN PRIVATE KEY-----";

const goodFinding = () => ({
  file: "src/a.ts", rule: "generic-api-key", commit: "a".repeat(40), fingerprint: "b".repeat(16),
  classification: "false-positive", disposition: "documented example",
});
const goodRecord = (over = {}) => {
  const refs = [
    { ref: "refs/heads/main", tip: "1".repeat(40), source: "github" },
    { ref: "refs/pull/11/head", tip: "2".repeat(40), source: "github" },
    { ref: `refs/heads/${FIX1}`, tip: "3".repeat(40), source: "local" },
  ];
  const rec = {
    tools: [{ name: "gitleaks", version: "8.18.0", redact: true }],
    redacted: true,
    scanned_at: "2026-10-09T00:00:00Z",
    refs,
    coverage_digest: digestOf(refs),
    pull_refs_note: "PR heads fetched via refs/pull/*",
    commit_count: 10,
    trees: [{ label: "main", sha: "4".repeat(40) }],
    worktree_dirs: [{ label: "wt", path: "/x", files_scanned: 3 }],
    finding_count: 1,
    findings: [goodFinding()],
    observations: [],
  };
  return Object.assign(rec, over);
};
const rec = (over) => {
  const d = tmp("sec-rec-");
  return writeJson(d, "rec.json", goodRecord(over));
};
const scanRec = (over) => run(["--scan-record", rec(over)]).code;

test("control: known-good record passes", () => {
  assert.equal(scanRec({}), 0);
});

// ---- T-gate
test("T-gate: missing / gaps_found / passed", () => {
  const d = tmp("sec-gate-");
  const mk = (status) => {
    const pd = path.join(d, "38-code-map");
    mkdirSync(pd, { recursive: true });
    writeFileSync(path.join(pd, "38-VERIFICATION.md"), `---\nphase: 38\nstatus: ${status}\n---\n`);
  };
  assert.equal(run(["--gate-prev", "38", "--phases-dir", d]).code, 1);
  mkdirSync(path.join(d, "38-code-map"), { recursive: true });
  assert.equal(run(["--gate-prev", "38", "--phases-dir", d]).code, 1, "dir but no file");
  mk("gaps_found");
  assert.equal(run(["--gate-prev", "38", "--phases-dir", d]).code, 1);
  mk("passed");
  assert.equal(run(["--gate-prev", "38", "--phases-dir", d]).code, 0);
});

// ---- leak
test("T-leak-ghp", () => assert.equal(scanRec({ observations: [`note ${FAKE_GHP}`] }), 1));
test("T-leak-akia", () => assert.equal(scanRec({ observations: [FAKE_AKIA] }), 1));
test("T-leak-pem", () => assert.equal(scanRec({ observations: [FAKE_PEM] }), 1));
test("T-leak-clean", () => assert.equal(scanRec({ observations: ["nothing secret here"] }), 0));
test("T-leak never echoes the value", () => {
  const r = run(["--scan-record", rec({ observations: [FAKE_GHP] })]);
  assert.equal(r.code, 1);
  assert.ok(!r.out.includes(FAKE_GHP));
});

// ---- schema
test("T-schema-tool-name-empty", () =>
  assert.equal(scanRec({ tools: [{ name: "", version: "1", redact: true }] }), 1));
test("T-schema-tool-version-empty", () =>
  assert.equal(scanRec({ tools: [{ name: "gitleaks", version: "", redact: true }] }), 1));
test("T-schema-tool-singular-pos", () =>
  assert.equal(scanRec({ tools: undefined, tool: { name: "trufflehog", version: "3" } }), 0));
test("T-schema-tool-singular-neg", () =>
  assert.equal(scanRec({ tools: undefined, tool: { name: "trufflehog", version: "" } }), 1));
test("T-schema-no-tool", () => assert.equal(scanRec({ tools: undefined }), 1));
test("T-schema-redacted-false", () => assert.equal(scanRec({ redacted: false }), 1));
test("T-schema-finding-count-mismatch", () => assert.equal(scanRec({ finding_count: 2 }), 1));
test("T-schema-bad-classification", () =>
  assert.equal(scanRec({ findings: [{ ...goodFinding(), classification: "maybe" }] }), 1));
for (const c of ["real", "false-positive", "test-fixture", "public-by-design"]) {
  test(`T-schema-classification-ok-${c}`, () => {
    const f = { ...goodFinding(), classification: c };
    if (c === "real") f.rotated = { done: true, date: "2026-10-09", where: "infisical" };
    assert.equal(scanRec({ findings: [f] }), 0);
  });
}
for (const k of ["file", "rule", "commit", "fingerprint"]) {
  test(`T-schema-missing-${k}`, () => {
    const f = goodFinding();
    delete f[k];
    assert.equal(scanRec({ findings: [f] }), 1);
  });
}

// ---- rotation
test("T-rotation-neg", () => {
  const base = { ...goodFinding(), classification: "real" };
  assert.equal(scanRec({ findings: [base] }), 1, "no rotated");
  assert.equal(scanRec({ findings: [{ ...base, rotated: { done: false, date: "2026-10-09", where: "x" } }] }), 1);
  assert.equal(scanRec({ findings: [{ ...base, rotated: { done: true, where: "x" } }] }), 1);
  assert.equal(scanRec({ findings: [{ ...base, rotated: { done: true, date: "2026-10-09" } }] }), 1);
});
test("T-rotation-pos", () => {
  const f = { ...goodFinding(), classification: "real", rotated: { done: true, date: "2026-10-09", where: "infisical" } };
  assert.equal(scanRec({ findings: [f] }), 0);
});

// ---- digest
test("T-digest", () => {
  const g = goodRecord();
  assert.equal(run(["--scan-record", writeJson(tmp("sec-dg-"), "r.json", g)]).code, 0);
  g.refs = g.refs.slice(1); // digest left stale
  assert.equal(run(["--scan-record", writeJson(tmp("sec-dg-"), "r.json", g)]).code, 1);
});

// ---- coverage
function mirrorFixture() {
  const work = tmp("sec-work-");
  git(work, "init", "-q", "-b", "main");
  writeFileSync(path.join(work, "a.txt"), "a");
  git(work, "add", "a.txt");
  git(work, "commit", "-q", "-m", "one");
  const main = git(work, "rev-parse", "HEAD");
  git(work, "branch", FIX1);
  git(work, "checkout", "-q", "-b", FIX2);
  writeFileSync(path.join(work, "b.txt"), "b");
  git(work, "add", "b.txt");
  git(work, "commit", "-q", "-m", "two");
  const fix2 = git(work, "rev-parse", "HEAD");
  git(work, "checkout", "-q", "main");
  const mk = (branches) => {
    const bare = path.join(tmp("sec-bare-"), "m.git");
    git(work, "clone", "-q", "--bare", work, bare);
    for (const b of [FIX1, FIX2]) if (!branches.includes(b)) git(bare, "update-ref", "-d", `refs/heads/${b}`);
    return bare;
  };
  const github = mk([]);
  git(github, "update-ref", "refs/pull/11/head", main);
  const local = mk([FIX1, FIX2]);
  return { main, fix2, github, local, work };
}
const lsRefs = (bare) =>
  git(bare, "for-each-ref", "--format=%(refname) %(objectname)").split("\n").filter(Boolean).map((l) => {
    const [ref, tip] = l.split(" ");
    return { ref, tip };
  });
const covRecord = (fx, over = {}) => {
  const refs = [
    ...lsRefs(fx.github).map((r) => ({ ...r, source: "github" })),
    ...lsRefs(fx.local).filter((r) => r.ref.includes("fix/")).map((r) => ({ ...r, source: "local" })),
  ];
  return goodRecord({ refs, coverage_digest: digestOf(refs), ...over });
};
// local mirror holds main + two fix branches; record local refs = all of local mirror's refs
const covRecordFull = (fx, over = {}) => {
  const refs = [
    ...lsRefs(fx.github).map((r) => ({ ...r, source: "github" })),
    ...lsRefs(fx.local).map((r) => ({ ...r, source: "local" })),
  ];
  return goodRecord({ refs, coverage_digest: digestOf(refs), ...over });
};
const cov = (recObj, source, mirror, extra = []) =>
  run(["--scan-coverage", writeJson(tmp("sec-cov-"), "r.json", recObj), "--source", source, "--mirror", mirror, ...extra]).code;

test("T-cov-pos", () => {
  const fx = mirrorFixture();
  assert.equal(cov(covRecordFull(fx), "github", fx.github, ["--require-ref", "refs/heads/main", "--require-ref", "refs/pull/11/head"]), 0);
});
test("T-cov-drop-ref", () => {
  const fx = mirrorFixture();
  const r = covRecordFull(fx);
  r.refs = r.refs.filter((x) => !(x.source === "github" && x.ref === "refs/pull/11/head"));
  r.coverage_digest = digestOf(r.refs);
  assert.equal(cov(r, "github", fx.github), 1);
});
test("T-cov-tip-moved", () => {
  const fx = mirrorFixture();
  const r = covRecordFull(fx);
  r.refs.find((x) => x.source === "github" && x.ref === "refs/heads/main").tip = "9".repeat(40);
  r.coverage_digest = digestOf(r.refs);
  assert.equal(cov(r, "github", fx.github), 1);
});
test("T-cov-require-ref", () => {
  const fx = mirrorFixture();
  assert.equal(cov(covRecordFull(fx), "github", fx.github, ["--require-ref", "refs/heads/nope"]), 1);
});
test("T-cov-note", () => {
  const fx = mirrorFixture();
  assert.equal(cov(covRecordFull(fx, { pull_refs_note: "" }), "github", fx.github), 1);
  assert.equal(cov(covRecordFull(fx, { pull_refs_note: "   " }), "github", fx.github), 1);
});
test("T-cov-two-mirrors-pos", () => {
  const fx = mirrorFixture();
  const r = covRecordFull(fx);
  assert.equal(cov(r, "github", fx.github, ["--require-ref", "refs/heads/main"]), 0);
  assert.equal(cov(r, "local", fx.local, ["--require-ref", `refs/heads/${FIX1}`, "--require-ref", `refs/heads/${FIX2}`]), 0);
});
test("T-cov-wrong-source-neg", () => {
  const fx = mirrorFixture();
  const r = covRecordFull(fx);
  // fix branch exists only in the local mirror: required from github must fail
  assert.equal(cov(r, "github", fx.github, ["--require-ref", `refs/heads/${FIX1}`]), 1);
});
test("T-cov-requires-source", () => {
  const fx = mirrorFixture();
  const f = writeJson(tmp("sec-cov-"), "r.json", covRecordFull(fx));
  assert.equal(run(["--scan-coverage", f, "--mirror", fx.github]).code, 1);
});
