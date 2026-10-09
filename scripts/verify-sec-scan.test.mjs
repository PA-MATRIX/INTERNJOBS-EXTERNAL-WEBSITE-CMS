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

// ================= Task 2: --guard and --gh-log =================
import { guardScan } from "./verify-sec-scan.mjs";

test("T-guard-scratch: scratch dir still present -> problem", () => {
  const scratch = tmp("sec-scratch-");
  const r = guardScan({ baseline: "b.json", scratch, runner: () => 0 });
  assert.ok(r.problems.length > 0);
  assert.equal(r.ok, false);
});
test("T-guard-delegate-neg: delegated runner non-zero -> problem", () => {
  const r = guardScan({ baseline: "b.json", scratch: "/nonexistent-sec-scratch-dir", runner: () => 1 });
  assert.equal(r.ok, false);
  assert.ok(r.problems.length > 0);
});
test("T-guard-pos", () => {
  let seen;
  const r = guardScan({ baseline: "b.json", scratch: "/nonexistent-sec-scratch-dir", runner: (b) => ((seen = b), 0) });
  assert.equal(r.ok, true);
  assert.equal(seen, "b.json");
});
test("T-guard CLI: existing scratch exits 1 (control for --guard wiring)", () => {
  assert.equal(run(["--guard", "--baseline", "x.json", "--scratch", tmp("sec-scratch-")]).code, 1);
});

const T0 = "2026-10-09T01:00:00Z";
const T1 = "2026-10-09T02:00:00Z";
const EARLY = "2026-10-09T00:00:00Z";
const ghlog = (lines, approved) => {
  const d = tmp("sec-gh-");
  const log = path.join(d, "gh.tsv");
  writeFileSync(log, lines.map((l) => (Array.isArray(l) ? `${l[0]}\t${l[1]}` : `${T1}\t${l}`)).join("\n") + "\n");
  const args = ["--gh-log", log];
  if (approved) args.push("--approved", writeJson(d, "ap.json", { approved: approved }));
  return run(args).code;
};
const ok = (...cmds) => assert.equal(ghlog(cmds), 0, cmds.join(" | "));
const bad = (...cmds) => assert.equal(ghlog(cmds), 1, cmds.join(" | "));

test("T-ghlog-get", () => {
  ok("gh api repos/x/y");
  ok('gh api -X GET "repos/x/y/pulls?state=all"');
});
test("T-ghlog-post", () => {
  bad("gh api -X POST repos/x/y/issues");
  bad("gh api -X PATCH repos/x/y");
  bad("gh api --method DELETE repos/x/y");
  bad("gh api --method=PUT repos/x/y");
  bad("gh api -XPOST repos/x/y");
});
test("T-ghlog-input", () => bad("gh api repos/x --input body.json"));
test("T-ghlog-repo-delete", () => {
  bad("gh repo delete x/y --yes");
  bad("gh repo create x/y");
  bad("gh repo edit x/y --visibility private");
  bad("gh repo rename z");
  bad("gh repo archive x/y");
  bad("gh secret set X");
  bad("gh pr merge 5");
});
test("T-ghlog-field-implicit-post", () => {
  bad("gh api repos/x -f a=b");
  bad("gh api repos/x -F a=b");
  bad("gh api repos/x --field a=b");
  bad("gh api repos/x --raw-field a=b");
});
test("T-ghlog-graphql", () => {
  const line = "gh api graphql -f query=x";
  bad(line);
  assert.equal(ghlog([[T1, line]], [{ cmd: line, approved_at: T0 }]), 0);
});
test("T-ghlog-create-run-release", () => {
  for (const c of ["gh issue create -t x", "gh pr create -t x", "gh workflow run ci.yml", "gh release create v1", "gh release edit v1", "gh release delete v1"]) bad(c);
});
test("T-ghlog-unknown-denied", () => {
  bad("gh frobnicate now");
  bad("gh");
  bad("rm -rf /");
});
test("T-ghlog-approved-pos", () => {
  const line = "gh api -X PATCH repos/x/y";
  assert.equal(ghlog([[T1, line]], [{ cmd: line, approved_at: T0 }]), 0);
  assert.equal(ghlog([[T0, line]], [{ cmd: line, approved_at: T0 }]), 0, "equal timestamp ok");
});
test("T-ghlog-approved-early-neg", () => {
  const line = "gh api -X PATCH repos/x/y";
  assert.equal(ghlog([[EARLY, line]], [{ cmd: line, approved_at: T0 }]), 1);
});
test("T-ghlog-approved-different-line-neg", () => {
  assert.equal(ghlog([[T1, "gh api -X PATCH repos/x/y"]], [{ cmd: "gh api -X PATCH repos/x/z", approved_at: T0 }]), 1);
  assert.equal(ghlog([[T1, "gh frobnicate"]], [{ cmd: "gh frobnicate now", approved_at: T0 }]), 1);
});
test("T-ghlog-allowed-reads", () => {
  ok(
    "gh api repos/x --jq .a.b",
    "gh api repos/x -q .a",
    "gh api repos/x --paginate",
    "gh repo view x/y",
    "gh repo list x",
    "gh pr list",
    "gh pr view 3",
    "gh pr diff 3",
    "gh pr checks 3",
    "gh issue list",
    "gh issue view 3",
    "gh run list",
    "gh run view 3",
    "gh release list",
    "gh release view v1",
    "gh auth status",
    "gh --version",
    "gh pr create --help",
    "git log --oneline",
    "git -C /tmp/r status",
    "git for-each-ref refs/heads",
    "git rev-parse HEAD",
    "git ls-tree -r HEAD",
    "git show HEAD",
    "git diff --stat",
  );
});
test("T-ghlog-jq-with-field-neg", () => bad("gh api repos/x --jq .a -f a=b"));
test("T-ghlog-brew-unapproved-neg", () => bad("brew install gitleaks"));
test("T-ghlog-brew-approved-pos", () => {
  const l = "brew install gitleaks";
  assert.equal(ghlog([[T1, l]], [{ cmd: l, approved_at: T0 }]), 0);
});
test("T-ghlog-brew-early-neg", () => {
  const l = "brew install gitleaks";
  assert.equal(ghlog([[EARLY, l]], [{ cmd: l, approved_at: T0 }]), 1);
});
test("T-ghlog-docker-pull-neg", () => bad("docker pull trufflesecurity/trufflehog"));
test("T-ghlog-git-clone-neg", () => bad("git clone https://github.com/x/y /tmp/y"));
test("T-ghlog-git-clone-approved-pos", () => {
  const l = "git clone --mirror https://github.com/x/y /tmp/y";
  assert.equal(ghlog([[T1, l]], [{ cmd: l, approved_at: T0 }]), 0);
});
test("T-ghlog-git-push-neg", () => bad("git push origin main"));
test("T-ghlog-git-commit-probe-neg", () => bad("git -C /tmp/zz-sec03-probe-a/repo commit -m x"));
test("T-ghlog-git-probe-write-approved-pos", () => {
  const c = "git -C /tmp/zz-sec03-probe-a/repo commit -m x";
  const p = "git -C /tmp/zz-sec03-probe-a/repo push origin HEAD:main";
  assert.equal(
    ghlog([[T1, c], [T1, p]], [{ cmd: c, approved_at: T0 }, { cmd: p, approved_at: T0 }]), 0);
  assert.equal(ghlog([[EARLY, p]], [{ cmd: p, approved_at: T0 }]), 1, "early");
});
test("T-ghlog-git-push-other-remote-neg", () => {
  for (const l of [
    "git -C /tmp/zz-sec03-probe-a/repo push https://github.com/x/y HEAD:main",
    "git -C /tmp/other/repo push origin HEAD:main",
    "git push origin HEAD:main",
    "git -C /tmp/other/repo commit -m x",
  ]) assert.equal(ghlog([[T1, l]], [{ cmd: l, approved_at: T0 }]), 1, l);
});
test("T-ghlog empty/missing/malformed log fails", () => {
  const d = tmp("sec-gh-");
  const f = path.join(d, "e.tsv");
  writeFileSync(f, "");
  assert.equal(run(["--gh-log", f]).code, 1);
  assert.equal(run(["--gh-log", path.join(d, "none.tsv")]).code, 1);
  writeFileSync(f, "no-tab-here gh api repos/x\n");
  assert.equal(run(["--gh-log", f]).code, 1);
  writeFileSync(f, `notatime\tgh api repos/x\n`);
  assert.equal(run(["--gh-log", f]).code, 1);
});

// ---- Hardening amendment: shell control operators are never a single read ----
test("T-ghlog-chain-semicolon-neg", () => {
  bad("gh repo view x/y; gh repo delete x/y --yes");
  bad("gh repo view x/y ;gh repo view x/z");
});
test("T-ghlog-chain-and-neg", () => {
  bad("gh pr list && gh pr merge 1");
  bad("gh pr list || gh pr merge 1");
  bad("gh pr list & gh pr merge 1");
});
test("T-ghlog-chain-pipe-neg", () => {
  bad("gh api repos/x/y | sh");
  bad("gh pr list |& tee out");
});
test("T-ghlog-substitution-neg", () => {
  bad("gh repo view $(gh repo delete x/y --yes)");
  bad("gh repo view `gh repo delete x/y --yes`");
  bad('gh repo view "$(gh repo delete x/y --yes)"');
  bad('gh repo view "`id`"');
});
test("T-ghlog-redirect-neg", () => {
  bad("gh api repos/x/y > out.json");
  bad("gh api repos/x/y < in.json");
  bad("gh api repos/x/y 2>&1");
});
test("T-ghlog-newline-neg", () => {
  // a second physical line without a timestamp tab is malformed, never a pass
  const d = tmp("sec-gh-");
  const log = path.join(d, "gh.tsv");
  writeFileSync(log, `${T1}\tgh repo view x/y\ngh repo delete x/y --yes\n`);
  assert.equal(run(["--gh-log", log]).code, 1);
});
test("T-ghlog-chain-approved-neg", () => {
  const line = "gh repo view x/y; gh repo delete x/y --yes";
  assert.equal(ghlog([[T1, line]], [{ cmd: line, approved_at: T0 }]), 1);
  const l2 = "gh pr list && gh pr merge 1";
  assert.equal(ghlog([[T1, l2]], [{ cmd: l2, approved_at: T0 }]), 1);
});
test("T-ghlog-jq-pipe-in-quotes-pos", () => {
  ok("gh api repos/x/y --jq '.a | .b'");
  ok('gh api repos/x/y --jq ".a | .b"');
  ok("gh api repos/x/y --jq '.a; .b && .c > 1'");
  ok('gh api "repos/x/y?a=1&b=2"');
  ok("gh pr list", "gh repo view x/y");
});
test("T-ghlog-quote-escape-neg", () => {
  bad("gh repo view 'x'; gh repo delete x");
  bad('gh repo view "x" | sh');
  bad("gh repo view x\\\\; gh repo delete x");
});

const SHA40 = "a".repeat(40);
test("T-ghlog-git-archive-read-pos", () => ok(`git -C /x/parrot.git archive ${SHA40}`));
test("T-ghlog-git-cat-file-read-pos", () => ok(`git -C /x cat-file -p ${SHA40}`));
test("T-ghlog-git-archive-output-neg", () => {
  bad(`git archive --output=/x/y.tar ${SHA40}`);
  bad(`git archive -o /x/y.tar ${SHA40}`);
  bad(`git -C /x archive --output /x/y.tar ${SHA40}`);
  bad(`git -C /x archive -o/x/y.tar ${SHA40}`);
  bad(`git -C /x archive --remote=ssh://h/r ${SHA40}`);
  const l = `git archive --output=/x/y.tar ${SHA40}`;
  assert.equal(ghlog([[T1, l]], [{ cmd: l, approved_at: T0 }]), 0, "approved write passes");
});
test("T-ghlog-env-prefix-neg", () => bad(`GIT_OPTIONAL_LOCKS=0 git -C /x archive ${SHA40}`));
test("T-ghlog-archive-pipe-neg", () => bad(`git -C /x archive ${SHA40} | tar -x -C /y`));
