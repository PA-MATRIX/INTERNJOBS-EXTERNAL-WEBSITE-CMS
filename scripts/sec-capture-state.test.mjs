import test from "node:test";
import assert from "node:assert/strict";
import { captureState, ghGet } from "./sec-capture-state.mjs";

const MSG403 = "Upgrade to GitHub Pro or make this repository public to enable this feature.";
const FAKE = ["ghp", "_", "a".repeat(36)].join(""); // built at runtime, never a literal

// Canned runner: args is the gh argv array. Records every call.
function mkRunner(overrides = {}) {
  const calls = [];
  const runner = (args) => {
    calls.push(args);
    const key = args.join(" ");
    for (const [re, resp] of Object.entries(overrides)) if (new RegExp(re).test(key)) return typeof resp === "function" ? resp(args) : resp;
    if (args[0] === "repo" && args[1] === "list") {
      const owner = args[2];
      const lists = {
        "PA-MATRIX": [{ name: "internjobs-marketing-website", visibility: "PUBLIC" }, { name: "secret-thing", visibility: "PRIVATE" }],
        "PA-Ai-Team": [{ name: "Parrot", visibility: "PRIVATE" }, { name: "pubby", visibility: "PUBLIC" }],
        growthpods: [{ name: "Internjobs", visibility: "PRIVATE" }],
      };
      return { status: 0, body: lists[owner] };
    }
    const p = args[args.length - 1];
    if (/^orgs\//.test(p)) return { status: 200, body: { plan: { name: "free" } }, headers: { authorization: `token ${FAKE}` } };
    if (/^users\//.test(p)) return { status: 200, body: { type: "User" } };
    if (/branches\/main\/protection$/.test(p) || /\/rulesets$/.test(p)) return { status: 403, body: { message: MSG403 } };
    if (/secret-scanning\/alerts/.test(p)) return { status: 404, body: { message: "Secret scanning is disabled on this repository." } };
    if (/\/pulls\?/.test(p)) return { status: 200, body: [{ number: 11, state: "closed", head: { ref: "a" } }, { number: 12, state: "open", head: { ref: "b" } }] };
    if (/^repos\/[^/]+\/[^/?]+$/.test(p)) return { status: 200, body: { visibility: p.includes("website") || p.includes("pubby") ? "public" : "private", security_and_analysis: null, permissions: { admin: true } } };
    return { status: 404, body: { message: "Not Found" } };
  };
  return { runner, calls };
}

test("T-capture-get-only", async () => {
  const { runner, calls } = mkRunner();
  for (const opts of [{ method: "POST" }, { method: "PUT" }, { method: "PATCH" }, { method: "DELETE" }, { input: "x.json" }, { extraArgs: ["-X", "POST"] }, { extraArgs: ["--input", "f"] }, { extraArgs: ["-f", "a=b"] }]) {
    await assert.rejects(async () => ghGet("repos/a/b", { runner, log: () => {}, ...opts }), /GET-only|refus/i, JSON.stringify(opts));
  }
  assert.equal(calls.length, 0, "runner must not be invoked for refused calls");
});

test("T-capture-log", async () => {
  const { runner } = mkRunner();
  const lines = [];
  await ghGet("repos/a/b/pulls?state=all&per_page=100", { runner, log: (l) => lines.push(l) });
  assert.equal(lines.length, 1);
  assert.match(lines[0], /^\d{4}-\d\d-\d\dT[\d:.]+Z\tgh api -i 'repos\/a\/b\/pulls\?state=all&per_page=100'$/);
});

test("T-capture-403", async () => {
  const { runner } = mkRunner();
  const snap = await captureState({ runner, log: () => {} });
  const r = snap.repos.find((x) => x.nameWithOwner === "PA-Ai-Team/Parrot");
  assert.equal(r.protection.status, 403);
  assert.equal(r.protection.message, MSG403);
  assert.equal(r.rulesets.status, 403);
  assert.equal(r.rulesets.message, MSG403);
});

test("T-capture-404-alerts", async () => {
  const { runner } = mkRunner();
  const snap = await captureState({ runner, log: () => {} });
  const r = snap.repos.find((x) => x.nameWithOwner === "PA-Ai-Team/Parrot");
  assert.equal(r.alerts_api.status, 404);
  assert.match(r.alerts_api.message, /disabled/);
});

test("T-capture-owner-kinds", async () => {
  const { runner, calls } = mkRunner();
  const snap = await captureState({ runner, log: () => {} });
  const paths = calls.filter((c) => c[0] === "api").map((c) => c[c.length - 1]);
  assert.ok(paths.includes("orgs/PA-MATRIX"));
  assert.ok(paths.includes("orgs/PA-Ai-Team"));
  assert.ok(paths.includes("users/growthpods"));
  assert.equal(snap.owners["PA-MATRIX"].kind, "org");
  assert.equal(snap.owners.growthpods.kind, "user");
  assert.equal(snap.owners["PA-MATRIX"].plan, "free");
  assert.equal(snap.owners.growthpods.plan, null);
});

test("T-capture-public-enumeration", async () => {
  const { runner } = mkRunner();
  const snap = await captureState({ runner, log: () => {} });
  assert.deepEqual(snap.owners["PA-Ai-Team"].public_repos, ["PA-Ai-Team/pubby"]);
  assert.equal(snap.owners["PA-Ai-Team"].public_repos_enumerated, true);
  const big = Array.from({ length: 100 }, (_, i) => ({ name: `r${i}`, visibility: "PRIVATE" }));
  const m2 = mkRunner({ "^repo list PA-Ai-Team": { status: 0, body: big } });
  const s2 = await captureState({ runner: m2.runner, log: () => {} });
  assert.equal(s2.owners["PA-Ai-Team"].public_repos_enumerated, false);
});

test("T-capture-prs-quoted", async () => {
  const { runner } = mkRunner();
  const lines = [];
  const snap = await captureState({ runner, log: (l) => lines.push(l) });
  assert.match(snap.parrot_prs.query, /\?state=all&per_page=100$/);
  assert.deepEqual(snap.parrot_prs.items.map((i) => i.number), [11, 12]);
  assert.ok(lines.some((l) => /gh api -i 'repos\/PA-Ai-Team\/Parrot\/pulls\?state=all&per_page=100'$/.test(l)));
});

test("T-capture-no-credentials", async () => {
  const { runner } = mkRunner();
  const snap = await captureState({ runner, log: () => {} });
  assert.ok(!JSON.stringify(snap).includes(FAKE));
});
