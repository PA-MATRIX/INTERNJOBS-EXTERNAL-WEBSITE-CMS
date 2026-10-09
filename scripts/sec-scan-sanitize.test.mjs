// SEC-01 sanitizer tests (Phase 39-04). Fake value-bearing fields are built at runtime.
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sanitizeReport } from "./sec-scan-sanitize.mjs";
import { refsDigest } from "./verify-sec-scan.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const verifier = path.join(here, "verify-sec-scan.mjs");
const sanitizer = path.join(here, "sec-scan-sanitize.mjs");

const FAKE_SECRET = ["fake", "secret", "val"].join("_") + Math.random().toString(36).slice(2, 12);
const FAKE_MATCH = ["fake", "match", "val"].join("_") + Math.random().toString(36).slice(2, 12);
const FAKE_LINE = ["fake", "line", "val"].join("_") + Math.random().toString(36).slice(2, 12);
const FAKE_AUTHOR = ["Fake", "Author", Math.random().toString(36).slice(2, 8)].join(" ");
const FAKE_EMAIL = `${Math.random().toString(36).slice(2, 8)}@example.invalid`;

function entry(i, over = {}) {
  return {
    RuleID: "generic-api-key", File: `src/f${i}.ts`, Commit: `c0ffee${i}`.padEnd(40, "0"), StartLine: 10 + i,
    Fingerprint: `c0ffee${i}:src/f${i}.ts:generic-api-key:${10 + i}`,
    Secret: "REDACTED", Match: "REDACTED", Line: "REDACTED",
    Author: FAKE_AUTHOR, Email: FAKE_EMAIL, Date: "2026-01-01T00:00:00Z", ...over,
  };
}
// Value-bearing fields are filled at runtime for the drop test (raw, un-redacted copies).
function loaded(i) {
  return entry(i, { Match: FAKE_MATCH, Line: FAKE_LINE });
}
const refs = [
  { source: "github", ref: "refs/heads/main", tip: "a".repeat(40) },
  { source: "local", ref: "refs/heads/fix/x", tip: "b".repeat(40) },
];
const tool = { name: "gitleaks", version: "8.30.1", redact: 100 };
const base = { refs, tool, pull_refs_note: "no refs/pull in mirror" };

test("T-sanitize-drop: no value-bearing keys or strings survive", () => {
  const out = sanitizeReport([loaded(1), loaded(2)], base);
  const text = JSON.stringify(out);
  for (const s of [FAKE_SECRET, FAKE_MATCH, FAKE_LINE]) assert.ok(!text.includes(s));
  for (const f of out.findings) {
    assert.deepEqual(Object.keys(f).filter((k) => !["file", "rule", "commit", "fingerprint", "classification", "disposition", "rotated"].includes(k)), []);
    for (const k of ["Secret", "Match", "Line", "secret", "match", "line"]) assert.ok(!(k in f));
  }
  assert.equal(out.finding_count, 2);
  assert.equal(out.redacted, true);
  assert.equal(out.coverage_digest, refsDigest(refs));
});

test("T-sanitize-redact-required: unredacted Secret throws", () => {
  assert.throws(() => sanitizeReport([entry(1, { Secret: FAKE_SECRET })], base), /redact/i);
});

test("T-sanitize-redact-required: tool.redact must be 100", () => {
  assert.throws(() => sanitizeReport([entry(1)], { ...base, tool: { ...tool, redact: 0 } }), /redact/i);
});

test("T-sanitize-author-dropped: Author/Email never copied", () => {
  const text = JSON.stringify(sanitizeReport([entry(1)], base));
  assert.ok(!text.includes(FAKE_AUTHOR));
  assert.ok(!text.includes(FAKE_EMAIL));
});

test("default classification is unclassified and the record gate rejects it", () => {
  const out = sanitizeReport([entry(1)], base);
  assert.equal(out.findings[0].classification, "unclassified");
  const r = runGate(out);
  assert.equal(r.status, 1);
});

test("T-sanitize-passes-record: classified output passes --scan-record", () => {
  const out = sanitizeReport([entry(1), entry(2)], {
    ...base,
    classifications: { [entry(1).Fingerprint]: { classification: "false-positive", disposition: "lockfile hash" }, [entry(2).Fingerprint]: { classification: "test-fixture", disposition: "fixture" } },
  });
  assert.equal(runGate(out).status, 0);
});

test("real finding without rotation fails the gate; with rotation passes", () => {
  const fp = entry(1).Fingerprint;
  const no = sanitizeReport([entry(1)], { ...base, classifications: { [fp]: { classification: "real", disposition: "d" } } });
  assert.equal(runGate(no).status, 1);
  const yes = sanitizeReport([entry(1)], { ...base, classifications: { [fp]: { classification: "real", disposition: "d", rotated: { done: true, date: "2026-10-10", where: "issuer+infisical" } } } });
  assert.equal(runGate(yes).status, 0);
});

test("CLI exits non-zero on unredacted report", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "sanz-"));
  const rep = path.join(dir, "r.json");
  const meta = path.join(dir, "m.json");
  writeFileSync(rep, JSON.stringify([entry(1, { Secret: FAKE_SECRET })]));
  writeFileSync(meta, JSON.stringify(base));
  const r = spawnSync("node", [sanitizer, "--report", rep, "--meta", meta, "--out", path.join(dir, "o.json")], { encoding: "utf8" });
  assert.notEqual(r.status, 0);
  assert.ok(!(r.stdout + r.stderr).includes(FAKE_SECRET));
});

function runGate(rec) {
  const dir = mkdtempSync(path.join(tmpdir(), "sanr-"));
  const f = path.join(dir, "rec.json");
  writeFileSync(f, JSON.stringify(rec, null, 2));
  return spawnSync("node", [verifier, "--scan-record", f], { encoding: "utf8" });
}
