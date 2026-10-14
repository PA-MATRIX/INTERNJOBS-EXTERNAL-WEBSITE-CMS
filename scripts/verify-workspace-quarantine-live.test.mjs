import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(here, "verify-workspace-quarantine-live.mjs");

const GOOD = 'const a="Trust sender";const b="trust-sender";const c="/inbox?folder=spam";';
const PARROT = 'const t="parrot-token";';

/**
 * routes: { path: {status, headers, body} }. Returns {base, close}.
 */
async function serve(routes) {
  const srv = http.createServer((req, res) => {
    const r = routes[req.url.split("#")[0]];
    if (!r) { res.writeHead(404); res.end("nf"); return; }
    res.writeHead(r.status ?? 200, r.headers ?? {});
    res.end(r.body ?? "");
  });
  await new Promise((ok) => srv.listen(0, "127.0.0.1", ok));
  return { base: `http://127.0.0.1:${srv.address().port}`, close: () => new Promise((ok) => srv.close(ok)) };
}

const html = (manifest = "manifest-abc.js") =>
  `<!DOCTYPE html><html><head><link rel="modulepreload" href="/assets/root-r.js"/></head><body><script>x</script><script type="module" src="/assets/${manifest}"></script></body></html>`;

const manifest = (inboxImports = ["/assets/imp-i.js"]) =>
  "window.__reactRouterManifest=" + JSON.stringify({
    entry: { module: "/assets/entry.js", imports: [] },
    routes: {
      root: { id: "root", module: "/assets/root-r.js", imports: [] },
      "routes/inbox": { id: "routes/inbox", parentId: "root", path: "inbox", module: "/assets/inbox-x.js", imports: inboxImports },
    },
  }) + ";";

const js = (body) => ({ headers: { "content-type": "text/javascript" }, body });

function base({ inbox = "x", imp = GOOD, root = PARROT, extra = {}, idx } = {}) {
  return {
    "/": idx ?? { status: 200, body: html() },
    "/assets/manifest-abc.js": js(manifest()),
    "/assets/root-r.js": js(root),
    "/assets/inbox-x.js": js(inbox),
    "/assets/imp-i.js": js(imp),
    ...extra,
  };
}

// spawnSync would block the event loop that serves the fixtures; use spawn.
import { spawn } from "node:child_process";
async function runAsync(routes, args = []) {
  const s = await serve(routes);
  try {
    return await new Promise((ok) => {
      const p = spawn("node", [SCRIPT, "--base", s.base, ...args]);
      let out = "", err = "";
      p.stdout.on("data", (d) => (out += d));
      p.stderr.on("data", (d) => (err += d));
      p.on("close", (code) => ok({ status: code, stdout: out, stderr: err }));
    });
  } finally { await s.close(); }
}

test("1 NEG: no 'Trust sender' anywhere -> exit 1 naming the marker", async () => {
  const r = await runAsync(base({ imp: 'const b="trust-sender";const c="folder=spam";' }));
  assert.equal(r.status, 1);
  assert.match(r.stdout + r.stderr, /Trust sender/);
});

test("2 POSITIVE: all three markers in an imported chunk -> exit 0", async () => {
  const r = await runAsync(base());
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test("3 NEG: markers only in a chunk unreachable from manifest/inbox -> exit 1", async () => {
  const r = await runAsync(base({ imp: "nothing", extra: { "/assets/orphan.js": js(GOOD) } }));
  assert.equal(r.status, 1);
});

test("4 NEG: markers present but parrot-token absent -> exit 1", async () => {
  const r = await runAsync(base({ root: "nothing" }));
  assert.equal(r.status, 1);
  assert.match(r.stdout + r.stderr, /parrot-token/);
});

test("5a NEG: terminal 500 on index -> exit 1", async () => {
  const r = await runAsync(base({ idx: { status: 500, body: "boom" } }));
  assert.equal(r.status, 1);
});

test("5b NEG: index lacks manifest URL -> exit 1", async () => {
  const r = await runAsync(base({ idx: { status: 200, body: "<html>no manifest</html>" } }));
  assert.equal(r.status, 1);
});

test("5c NEG: manifest 404 -> exit 1", async () => {
  const routes = base();
  delete routes["/assets/manifest-abc.js"];
  const r = await runAsync(routes);
  assert.equal(r.status, 1);
});

test("6 REDIRECT: / -> 302 /sign-in?redirect_url=%2F, script follows and exits 0", async () => {
  const r = await runAsync(base({
    idx: { status: 302, headers: { location: "/sign-in?redirect_url=%2F" } },
    extra: { "/sign-in?redirect_url=%2F": { status: 200, body: html() } },
  }));
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test("6b NEG: redirect loop (>5 hops) -> exit 1", async () => {
  const r = await runAsync(base({ idx: { status: 302, headers: { location: "/" } } }));
  assert.equal(r.status, 1);
});

test("7 --no-require-parrot downgrades the parrot check only", async () => {
  const r = await runAsync(base({ root: "nothing" }), ["--no-require-parrot"]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

// ---- Phase 43 (LAK-05): opt-in --require-move-control ----------------------------------------
// The ops.safety route is resolved through the manifest key `routes/ops.safety` (43-03 build:
// manifest-f2082f7c.js -> routes/ops.safety -> /assets/ops.safety-<hash>.js; hashes change per build).
import { checkBundle } from "./verify-workspace-quarantine-live.mjs";

const MOVE_OK = 'const l="Move to Inbox";const u=`/api/ops/safety/${encodeURIComponent(i)}/move-to-inbox`;';
const MOVE_NONE = 'const h="Safety log";const r="Mark all reviewed";';

const manifestWithSafety = (safety) =>
  "window.__reactRouterManifest=" + JSON.stringify({
    entry: { module: "/assets/entry.js", imports: [] },
    routes: {
      root: { id: "root", module: "/assets/root-r.js", imports: [] },
      "routes/inbox": { id: "routes/inbox", parentId: "root", path: "inbox", module: "/assets/inbox-x.js", imports: ["/assets/imp-i.js"] },
      ...(safety ? { "routes/ops.safety": { id: "routes/ops.safety", parentId: "root", path: "ops/safety", module: "/assets/ops.safety-s.js", imports: ["/assets/safety-imp.js"] } } : {}),
    },
  }) + ";";

function safetySite({ safety = MOVE_OK, safetyImp = "export const x=1;", withRoute = true } = {}) {
  return base({
    extra: {
      "/assets/manifest-abc.js": js(manifestWithSafety(withRoute)),
      "/assets/ops.safety-s.js": js(safety),
      "/assets/safety-imp.js": js(safetyImp),
    },
  });
}

async function check(routes, opts) {
  const s = await serve(routes);
  try { return await checkBundle(s.base, opts); } finally { await s.close(); }
}

test("require-move-control: served ops.safety chunk without the control is RED", async () => {
  const r = await check(safetySite({ safety: MOVE_NONE }), { requireMoveControl: true });
  assert.equal(r.ok, false, JSON.stringify(r));
  assert.ok(r.problems.some((p) => /Move to Inbox label/.test(p)), JSON.stringify(r.problems));
  assert.ok(r.problems.some((p) => /move-to-inbox endpoint/.test(p)), JSON.stringify(r.problems));
});

test("require-move-control: label present but endpoint missing is RED (each marker checked)", async () => {
  const r = await check(safetySite({ safety: 'const l="Move to Inbox";' }), { requireMoveControl: true });
  assert.equal(r.ok, false, JSON.stringify(r));
  assert.ok(r.problems.some((p) => /move-to-inbox endpoint/.test(p)), JSON.stringify(r.problems));
  assert.ok(!r.problems.some((p) => /Move to Inbox label/.test(p)), JSON.stringify(r.problems));
});

test("require-move-control: served ops.safety chunk with the control is GREEN", async () => {
  const r = await check(safetySite(), { requireMoveControl: true });
  assert.equal(r.ok, true, JSON.stringify(r));
});

test("require-move-control: control in a static import of the ops.safety module is GREEN", async () => {
  const r = await check(safetySite({ safety: MOVE_NONE, safetyImp: MOVE_OK }), { requireMoveControl: true });
  assert.equal(r.ok, true, JSON.stringify(r));
});

test("require-move-control: control only in an unreachable chunk is RED", async () => {
  const routes = safetySite({ safety: MOVE_NONE });
  routes["/assets/orphan-move.js"] = js(MOVE_OK);
  const r = await check(routes, { requireMoveControl: true });
  assert.equal(r.ok, false, JSON.stringify(r));
});

test("require-move-control: manifest with no ops.safety route is RED when the flag is on", async () => {
  const r = await check(safetySite({ withRoute: false }), { requireMoveControl: true });
  assert.equal(r.ok, false, JSON.stringify(r));
  assert.ok(r.problems.some((p) => /routes\/ops\.safety/.test(p)), JSON.stringify(r.problems));
});

test("flag off: bundle lacking the control (and lacking the route) stays GREEN (v1.5.1 meaning)", async () => {
  const a = await check(safetySite({ safety: MOVE_NONE }), {});
  assert.equal(a.ok, true, JSON.stringify(a));
  const b = await check(safetySite({ withRoute: false }), {});
  assert.equal(b.ok, true, JSON.stringify(b));
});

test("CLI: --require-move-control exits 1 without the control and 0 with it", async () => {
  const red = await runAsync(safetySite({ safety: MOVE_NONE }), ["--require-move-control"]);
  assert.equal(red.status, 1, red.stdout + red.stderr);
  assert.match(red.stdout, /RED/);
  const green = await runAsync(safetySite(), ["--require-move-control"]);
  assert.equal(green.status, 0, green.stdout + green.stderr);
  const off = await runAsync(safetySite({ safety: MOVE_NONE }));
  assert.equal(off.status, 0, off.stdout + off.stderr);
});
