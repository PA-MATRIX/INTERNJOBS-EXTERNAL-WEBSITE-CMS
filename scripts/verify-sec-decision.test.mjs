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
