import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(here, "verify-sec-limits.mjs");
const MSG403 = "Upgrade to GitHub Pro or make this repository public to enable this feature.";
const dir = mkdtempSync(path.join(os.tmpdir(), "sec-limits-"));
let n = 0;
const file = (body) => {
  const p = path.join(dir, `f${n++}`);
  writeFileSync(p, typeof body === "string" ? body : JSON.stringify(body, null, 2));
  return p;
};
const run = (...args) => spawnSync("node", [SCRIPT, ...args], { encoding: "utf8" });
const clone = (o) => JSON.parse(JSON.stringify(o));

const priv = (name) => ({
  nameWithOwner: name, visibility: "PRIVATE", security_and_analysis: null,
  protection: { status: 403, message: MSG403 }, rulesets: { status: 403, message: MSG403 },
  alerts_api: { status: 404, message: "Secret scanning is disabled on this repository." }, admin: true,
});
function goodSnapshot() {
  return {
    captured_at: "2026-10-08T00:00:00Z", gh_user: "raj",
    owners: {
      "PA-MATRIX": { kind: "org", plan: "free", public_repos: ["PA-MATRIX/internjobs-marketing-website"], public_repos_enumerated: true },
      "PA-Ai-Team": { kind: "org", plan: "free", public_repos: [], public_repos_enumerated: true },
      growthpods: { kind: "user", plan: null, public_repos: [], public_repos_enumerated: true },
    },
    repos: [
      {
        nameWithOwner: "PA-MATRIX/internjobs-marketing-website", visibility: "PUBLIC", security_and_analysis: {},
        protection: { status: 200, message: "" }, rulesets: { status: 200, message: "" },
        alerts_api: { status: 200, message: "" }, admin: true,
      },
      priv("PA-Ai-Team/Parrot"), priv("growthpods/Internjobs"),
    ],
    parrot_prs: { query: "repos/PA-Ai-Team/Parrot/pulls?state=all", items: [{ number: 1, state: "closed", head: "x" }] },
  };
}
const goodMatrix = () => [
  "| owner | plan | notes |", "|---|---|---|",
  "| PA-MATRIX | free | org |", "| PA-Ai-Team | free | org |", "| growthpods | null | user |",
].join("\n");

const state = (snap, matrix) => run("--state", file(snap), ...(matrix ? ["--matrix", file(matrix)] : []));

test("T-state-pos", () => assert.equal(state(goodSnapshot()).status, 0));
test("T-state-owner-missing", () => {
  for (const o of ["PA-MATRIX", "PA-Ai-Team", "growthpods"]) {
    const s = goodSnapshot(); delete s.owners[o];
    const r = state(s);
    assert.equal(r.status, 1, o);
    assert.match(r.stdout + r.stderr, new RegExp(o));
  }
});
test("T-enumerated", () => {
  const s = goodSnapshot(); s.owners.growthpods.public_repos_enumerated = false;
  assert.equal(state(s).status, 1);
});
test("T-prs-query", () => {
  const s = goodSnapshot(); s.parrot_prs.query = "repos/PA-Ai-Team/Parrot/pulls";
  assert.equal(state(s).status, 1);
  const t = goodSnapshot(); delete t.parrot_prs;
  assert.equal(state(t).status, 1);
});
test("T-403-message", () => {
  const s = goodSnapshot(); s.repos[1].protection.message = "Upgrade to GitHub Pro.";
  assert.equal(state(s).status, 1);
});
test("T-403-missing", () => {
  const s = goodSnapshot(); delete s.repos[1].protection.message;
  assert.equal(state(s).status, 1);
});
test("T-free-private-200", () => {
  const s = goodSnapshot(); s.repos[1].protection = { status: 200, message: "" };
  assert.equal(state(s).status, 1);
});
test("T-matrix-pos", () => assert.equal(state(goodSnapshot(), goodMatrix()).status, 0));
test("T-matrix-plan-mismatch", () => {
  const r = state(goodSnapshot(), goodMatrix().replace("| PA-MATRIX | free |", "| PA-MATRIX | team |"));
  assert.equal(r.status, 1);
});
test("T-matrix-owner-row-missing", () => {
  const r = state(goodSnapshot(), goodMatrix().replace("| growthpods | null | user |", ""));
  assert.equal(r.status, 1);
});
test("T-limits-leak", () => {
  const tok = "gh" + "p_" + "A".repeat(30);
  const s = goodSnapshot(); s.repos[0].description = `see ${tok}`;
  const r = state(s);
  assert.equal(r.status, 1);
  assert.ok(!(r.stdout + r.stderr).includes(tok));
});

// ---- Task 2: --enable-record ----
const PUB = "PA-MATRIX/internjobs-marketing-website";
const goodEnable = () => ({
  first_write_at: "2026-10-08T12:00:00Z", approval_ref: "D15",
  repos: [
    {
      repo: PUB, visibility: "PUBLIC", plan: "free", outcome: "enabled",
      before: { secret_scanning: "disabled", push_protection: "disabled" },
      after: { secret_scanning: "enabled", push_protection: "enabled" },
      alerts_api_after: { status: 200, count: 0 },
      push_protection_doc: { url: "https://docs.github.com/x", verified_on: "2026-10-08" },
    },
    {
      repo: "PA-Ai-Team/Parrot", visibility: "PRIVATE", plan: "free", outcome: "not-enabled", reason: "plan",
      before: { secret_scanning: "disabled", push_protection: "disabled" },
      after: { secret_scanning: "disabled", push_protection: "disabled" },
      alerts_api_after: { status: 404, count: 0 },
    },
  ],
});
const goodApproval = () => ({ approved_by: "raj", approved_at: "2026-10-08T11:00:00Z", d_number: "D15", scope: [PUB, "PA-Ai-Team/Parrot"] });
const enable = (rec, appr = goodApproval()) =>
  run("--enable-record", file(rec), ...(appr ? ["--approval", file(appr)] : []));

test("T-enable-pos", () => assert.equal(enable(goodEnable()).status, 0));
test("T-enable-before-approval", () => {
  const r = goodEnable(); r.first_write_at = "2026-10-08T10:00:00Z";
  assert.equal(enable(r).status, 1);
});
test("T-enable-not-disabled-before", () => {
  const r = goodEnable(); r.repos[0].before.secret_scanning = "enabled";
  assert.equal(enable(r).status, 1);
  r.repos[0].outcome = "unchanged";
  assert.equal(enable(r).status, 0);
});
test("T-enable-after-not-enabled", () => {
  const r = goodEnable(); r.repos[0].after.secret_scanning = "disabled";
  assert.equal(enable(r).status, 1);
});
test("T-enable-alerts-404", () => {
  const r = goodEnable(); r.repos[0].alerts_api_after.status = 404;
  assert.equal(enable(r).status, 1);
});
test("T-enable-private-free-claim", () => {
  const r = goodEnable(); r.repos[1].outcome = "enabled"; r.repos[1].visibility = "PRIVATE";
  r.repos[1].after.secret_scanning = "enabled"; r.repos[1].alerts_api_after.status = 200;
  assert.equal(enable(r).status, 1);
});
test("T-enable-pp-doc-missing", () => {
  const r = goodEnable(); delete r.repos[0].push_protection_doc;
  assert.equal(enable(r).status, 1);
});
test("T-enable-approval-missing", () => assert.equal(enable(goodEnable(), null).status, 1));
test("T-enable-scope", () => {
  const r = goodEnable(); r.repos.push({ ...clone(r.repos[0]), repo: "PA-MATRIX/other" });
  assert.equal(enable(r).status, 1);
});
test("T-enable-leak", () => {
  const r = goodEnable(); r.repos[0].reason = "gh" + "p_" + "B".repeat(30);
  assert.equal(enable(r).status, 1);
});
