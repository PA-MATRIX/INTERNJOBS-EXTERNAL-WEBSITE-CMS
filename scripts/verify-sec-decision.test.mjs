import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(here, "verify-sec-decision.mjs");
const dir = mkdtempSync(path.join(os.tmpdir(), "sec03-"));
let n = 0;
const put = (name, body) => {
  const p = path.join(dir, `${n++}-${name}`);
  writeFileSync(p, typeof body === "string" ? body : JSON.stringify(body, null, 2));
  return p;
};
const run = (...args) => {
  const r = spawnSync("node", [SCRIPT, ...args], { encoding: "utf8" });
  return { code: r.status, out: (r.stdout || "") + (r.stderr || "") };
};

// ---------- research fixtures ----------
const CLAIMS = {
  C1: "private repo branch protection returns 403 on free plan",
  C2: "flipping to private keeps existing protection",
  C3: "push protection is free on public repos",
  C4: "secret protection price $19 per committer per month",
  C5: "team seat price $4 per user per month",
  C6: "risk assessment of unprotected main",
  C7: "secret scanning on private repos requires a paid plan",
};
const row = (id, o = {}) => {
  const f = {
    status: "VERIFIED-DOC", url: "https://docs.github.com/en/x", fetched: "fetched 2026-10-08", resolved: "", ...o,
  };
  const claim = o.claim ?? CLAIMS[id];
  return `| ${id} | ${claim} | ${f.status} | ${f.url} | ${f.fetched} | ${f.resolved} |`;
};
const DISCLOSE = "CI-only enforcement cannot block a direct push to main.";
function goodResearch({ rows = {}, drop = [], noUpgrade = false, noAlt = false, disclose = true, extra = "" } = {}) {
  const ids = Object.keys(CLAIMS).filter((i) => !drop.includes(i));
  const table = ["| id | claim | status | source | fetched | resolved_by |", "|---|---|---|---|---|---|"]
    .concat(ids.map((i) => row(i, rows[i] ?? (i === "C2" ? { status: "ASSUMED", resolved: "39-07" } : {}))))
    .join("\n");
  return [
    "# SEC-03 research", "", table, "",
    noUpgrade ? "" : "## Option: upgrade\nBuy team seats.\n",
    noAlt ? "" : `## Option: alternative\nRely on CI checks. ${disclose ? DISCLOSE : ""}\n`,
    extra,
  ].join("\n");
}
const research = (opts, ...args) => run("--research", put("research.md", goodResearch(opts)), ...args);

test("T-research-pos", () => assert.equal(research().code, 0, research().out));
test("T-research-claim-missing", () => {
  const r = research({ drop: ["C3"] });
  assert.equal(r.code, 1);
  assert.match(r.out, /C3/);
});
test("T-research-no-url", () => {
  const r = research({ rows: { C1: { url: "http://example.com" } } });
  assert.equal(r.code, 1);
  assert.match(r.out, /C1/);
});
test("T-research-no-date", () => {
  const r = research({ rows: { C1: { fetched: "fetched" } } });
  assert.equal(r.code, 1);
  assert.match(r.out, /C1/);
});
test("T-research-stale-date", () => {
  const r = research({ rows: { C1: { fetched: "fetched 2026-10-07" } } });
  assert.equal(r.code, 1);
  assert.match(r.out, /C1/);
});
test("T-research-date-boundary-pos", () => {
  assert.equal(research({ rows: { C1: { fetched: "fetched 2026-10-08" } } }).code, 0);
  assert.equal(research({ rows: { C1: { fetched: "fetched 2026-10-07" } } }, "--min-fetched", "2026-10-07").code, 0);
});
test("T-research-assumed", () => {
  const r = research({ rows: { C2: { status: "ASSUMED", resolved: "" } } });
  assert.equal(r.code, 1);
  assert.match(r.out, /C2/);
});
test("T-research-price-no-amount", () => {
  const r = research({ rows: { C4: { claim: "secret protection price per committer" } } });
  assert.equal(r.code, 1);
  assert.match(r.out, /C4/);
});
test("T-research-option-missing", () => {
  assert.equal(research({ noUpgrade: true }).code, 1);
  assert.equal(research({ noAlt: true }).code, 1);
});
test("T-research-no-disclosure", () => assert.equal(research({ disclose: false }).code, 1));
test("T-sec03-leak", () => {
  const fake = ["gh", "p_"].join("") + "A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8";
  const r = research({ extra: `leaked ${fake}` });
  assert.equal(r.code, 1);
  assert.ok(!r.out.includes(fake));
});

// ---------- visibility fixtures ----------
const snap = (m) => ({ repos: Object.fromEntries(Object.entries(m).map(([k, v]) => [k, { visibility: v }])) });
const BASE = { "PA-MATRIX/site": "PUBLIC", "PA-Ai-Team/Parrot": "PRIVATE", "growthpods/Internjobs": "PRIVATE" };
const vis = (cur) => run("--visibility-unchanged", put("cur.json", snap(cur)), "--baseline", put("base.json", snap(BASE)));
test("T-vis-pos", () => assert.equal(vis(BASE).code, 0));
test("T-vis-flipped", () => {
  const r = vis({ ...BASE, "PA-Ai-Team/Parrot": "PUBLIC" });
  assert.equal(r.code, 1);
  assert.match(r.out, /PA-Ai-Team\/Parrot/);
});
test("T-vis-missing", () => {
  const { "growthpods/Internjobs": _x, ...rest } = BASE;
  const r = vis(rest);
  assert.equal(r.code, 1);
  assert.match(r.out, /growthpods\/Internjobs/);
});

// ---------- probe fixtures ----------
const PROBE = "PA-MATRIX/zz-sec03-probe-20261008";
const APPROVED = "2026-10-08T10:00:00Z";
const stepDefs = [
  ["gh repo create PA-MATRIX/zz-sec03-probe-20261008 --public", 201],
  ["gh api -X PUT repos/PA-MATRIX/zz-sec03-probe-20261008/branches/main/protection", 200],
  ["gh api repos/PA-MATRIX/zz-sec03-probe-20261008/branches/main/protection", 200],
  ["gh repo edit PA-MATRIX/zz-sec03-probe-20261008 --visibility private", 200],
  ["gh api repos/PA-MATRIX/zz-sec03-probe-20261008/branches/main/protection", 403],
  ["git push origin main", 1],
  ["gh repo delete PA-MATRIX/zz-sec03-probe-20261008 --yes", 204],
  ["gh api repos/PA-MATRIX/zz-sec03-probe-20261008", 404],
];
function goodProbe(mut = (r) => r) {
  const steps = stepDefs.map(([cmd, status], i) => ({
    ts: `2026-10-08T10:0${i + 1}:00Z`, cmd, repo: PROBE, status,
  }));
  return mut({ approval_ref: "39-06-APPROVAL.md", approved_at: APPROVED, repo: PROBE, steps });
}
const probe = (mut) => run("--probe-record", put("probe.json", goodProbe(mut)));

test("T-probe-pos", () => assert.equal(probe().code, 0, probe().out));
test("T-probe-early", () => {
  const r = probe((x) => { x.steps[2].ts = "2026-10-08T09:00:00Z"; return x; });
  assert.equal(r.code, 1);
});
test("T-probe-other-repo", () => {
  const r = probe((x) => { x.steps[1].repo = "PA-MATRIX/internjobs-marketing-website"; return x; });
  assert.equal(r.code, 1);
});
test("T-probe-missing-step", () => assert.equal(probe((x) => { x.steps.splice(5, 1); return x; }).code, 1));
test("T-probe-order", () => {
  const r = probe((x) => { [x.steps[3], x.steps[4]] = [x.steps[4], x.steps[3]]; return x; });
  assert.equal(r.code, 1);
});
test("T-probe-left-behind", () => assert.equal(probe((x) => { x.steps[7].status = 200; return x; }).code, 1));
test("T-probe-unexpected", () => assert.equal(probe((x) => { x.steps[1].unexpected = true; return x; }).code, 1));
test("T-probe-skip-pos", () => {
  const rec = { approval_ref: "39-06-APPROVAL.md", skipped: true, reason: "no probe needed", steps: [] };
  assert.equal(run("--probe-record", put("skip.json", rec)).code, 0);
});
test("T-probe-skip-no-approval", () => {
  assert.equal(run("--probe-record", put("skip.json", { skipped: true, reason: "x", steps: [] })).code, 1);
  assert.equal(run("--probe-record", put("skip.json", { approval_ref: "a", skipped: true, steps: [] })).code, 1);
});

// ---------- decision fixtures ----------
const decisionMd = ({ status = "decided", by = "decided_by: Raj", at = "decided_at: 2026-10-08", option = "option: upgrade-team", body = "" } = {}) =>
  ["---", `status: ${status}`, by, at, option, "orgs: PA-MATRIX", "---", "# SEC-03 decision", body].filter((l) => l !== null).join("\n");
const CTX_OK = "# CONTEXT\n\n## D19\nSEC-03 decided; see SEC-03-DECISION.md\n";
const decide = (md, ctx = CTX_OK) => run("--decision", put("dec.md", md), "--context", put("ctx.md", ctx));

test("T-decision-pos", () => assert.equal(decide(decisionMd()).code, 0, decide(decisionMd()).out));
test("T-decision-pending", () => assert.equal(decide(decisionMd({ status: "pending" })).code, 1));
test("T-decision-no-option", () => {
  assert.equal(decide(decisionMd({ option: "option: maybe" })).code, 1);
  assert.equal(decide(decisionMd({ option: null })).code, 1);
});
test("T-decision-no-d19", () => assert.equal(decide(decisionMd(), "# CONTEXT\n\n## D18\nnothing\n").code, 1));
test("T-decision-alt-no-disclosure", () => {
  assert.equal(decide(decisionMd({ option: "option: alternative" })).code, 1);
  assert.equal(decide(decisionMd({ option: "option: alternative", body: DISCLOSE })).code, 0);
});
