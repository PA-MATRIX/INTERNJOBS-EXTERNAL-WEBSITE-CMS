#!/usr/bin/env node
// SEC-03 verifier: read-only, fixture/file based, no network.
// Modes: --research, --probe-record, --decision, --visibility-unchanged
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, scanSecrets } from "./verify-code-maps.mjs";

export const REQUIRED_CLAIMS = ["C1", "C2", "C3", "C4", "C5", "C6", "C7"];
const PRICE_CLAIMS = ["C4", "C5"];
const STATUSES = ["VERIFIED-DOC", "VERIFIED-API", "TESTED", "ASSUMED"];
const DISCLOSURE = /CI-only enforcement cannot block a direct push to `?main`?/i;
const DEFAULT_MIN_FETCHED = "2026-10-08";

const read = (f) => readFileSync(f, "utf8");

export function checkResearch({ text, minFetched = DEFAULT_MIN_FETCHED }) {
  const problems = [];
  for (const n of scanSecrets(text)) problems.push(`secret-like content (${n}) in research text`);
  const rows = {};
  for (const line of text.split("\n")) {
    const cells = line.split("|").map((c) => c.trim());
    if (cells.length < 7 || !/^C\d+$/.test(cells[1])) continue;
    rows[cells[1]] = { claim: cells[2], status: cells[3], url: cells[4], fetched: cells[5], resolved: cells[6] };
  }
  for (const id of REQUIRED_CLAIMS) {
    const r = rows[id];
    if (!r) { problems.push(`${id}: claim row missing`); continue; }
    if (!STATUSES.includes(r.status)) problems.push(`${id}: status must be one of ${STATUSES.join("|")}`);
    if (!/^https:\/\/\S+/.test(r.url)) problems.push(`${id}: no https source URL`);
    const d = /(\d{4}-\d{2}-\d{2})/.exec(r.fetched);
    if (!d) problems.push(`${id}: no fetched-on date`);
    else if (d[1] < minFetched) problems.push(`${id}: fetched ${d[1]} is earlier than floor ${minFetched}`);
    if (r.status === "ASSUMED" && !/\b\d{2}-\d{2}\b/.test(r.resolved)) {
      problems.push(`${id}: ASSUMED without resolved_by plan id`);
    }
    if (PRICE_CLAIMS.includes(id) && !/\$\s?\d/.test(r.claim)) problems.push(`${id}: price row has no $ amount`);
  }
  const altIdx = text.search(/^##\s+Option:\s*alternative\b/im);
  if (!/^##\s+Option:\s*upgrade\b/im.test(text)) problems.push("option 'upgrade' not written up");
  if (altIdx < 0) problems.push("option 'alternative' not written up");
  else if (!DISCLOSURE.test(text.slice(altIdx))) {
    problems.push("alternative lacks statement that CI-only enforcement cannot block a direct push to main");
  }
  return problems;
}

export function checkVisibility({ current, baseline }) {
  const problems = [];
  const cur = current.repos || {}, base = baseline.repos || {};
  for (const [name, b] of Object.entries(base)) {
    if (!cur[name]) { problems.push(`${name}: missing from current capture`); continue; }
    if (cur[name].visibility !== b.visibility) {
      problems.push(`${name}: visibility changed ${b.visibility} -> ${cur[name].visibility}`);
    }
  }
  return problems;
}

const PROBE_REPO = /\/zz-sec03-probe-[\w-]+$/;
const EXPECTED = ["create", "put", "get1", "private", "get2", "push", "delete", "final"];
function kindOf(cmd) {
  if (/repo create/.test(cmd)) return "create";
  if (/-X\s*PUT\b.*protection|PUT\b.*protection/.test(cmd)) return "put";
  if (/protection/.test(cmd)) return "get";
  if (/visibility[ =]private/.test(cmd)) return "private";
  if (/git push/.test(cmd)) return "push";
  if (/repo delete/.test(cmd)) return "delete";
  if (/\bapi\b/.test(cmd)) return "final";
  return "other";
}

export function checkProbe({ rec }) {
  const problems = [];
  if (!rec.approval_ref) problems.push("no approval_ref");
  if (rec.skipped) {
    if (!rec.reason) problems.push("skipped record has no reason");
    return problems;
  }
  const approved = Date.parse(rec.approved_at);
  if (Number.isNaN(approved)) problems.push("no valid approved_at");
  if (!rec.repo || !PROBE_REPO.test(rec.repo)) problems.push("record repo is not a zz-sec03-probe- repo");
  const steps = Array.isArray(rec.steps) ? rec.steps : [];
  steps.forEach((s, i) => {
    if (!(Date.parse(s.ts) >= approved)) problems.push(`step ${i + 1}: timestamp precedes approved_at (or invalid)`);
    if (s.repo !== rec.repo) problems.push(`step ${i + 1}: targets repo ${s.repo}, not the probe repo`);
  });
  if (steps.some((s) => s.unexpected) && rec.stopped !== true) {
    problems.push("unexpected result recorded without stopped:true");
  }
  if (rec.stopped !== true) {
    const kinds = steps.map((s) => kindOf(s.cmd || ""));
    let want = 0;
    for (const k of kinds) {
      const e = EXPECTED[want];
      if (e && (k === e || (k === "get" && (e === "get1" || e === "get2")))) want++;
    }
    if (want < EXPECTED.length) {
      const has = (e) => kinds.some((k) => k === e || (k === "get" && e.startsWith("get")));
      const getCount = kinds.filter((k) => k === "get").length;
      const missing = EXPECTED.filter((e) => (e.startsWith("get") ? getCount < 2 : !has(e)));
      problems.push(missing.length ? `sequence incomplete, missing: ${missing.join(",")}` : "sequence out of order");
    }
  }
  const last = steps[steps.length - 1];
  if (!last || last.status !== 404) problems.push("final readback status is not 404 (probe repo left behind)");
  return problems;
}

export function checkDecision({ text, context }) {
  const problems = [];
  const fm = /^---\n([\s\S]*?)\n---/.exec(text);
  const f = {};
  if (fm) for (const l of fm[1].split("\n")) { const m = /^(\w+):\s*(.*)$/.exec(l); if (m) f[m[1]] = m[2].trim(); }
  else problems.push("no front matter");
  if (f.status === undefined || f.status === "pending") problems.push("status is pending");
  if (!/\bRaj\b/.test(f.decided_by || "")) problems.push("decided_by must be Raj");
  if (!/^\d{4}-\d{2}-\d{2}/.test(f.decided_at || "")) problems.push("decided_at missing");
  if (!["upgrade-team", "alternative", "accept-unprotected"].includes(f.option)) {
    problems.push("option must be upgrade-team|alternative|accept-unprotected");
  }
  const d19 = /^#+\s*D19\b[^\n]*\n([\s\S]*?)(?=^#+\s*D\d+\b|(?![\s\S]))/m.exec(context);
  if (!d19) problems.push("CONTEXT.md has no D19 entry");
  else if (!/SEC-03-DECISION\.md/.test(d19[0])) problems.push("D19 does not name SEC-03-DECISION.md");
  if (f.option === "alternative" && !DISCLOSURE.test(text)) {
    problems.push("alternative lacks statement that CI-only enforcement cannot block a direct push to main");
  }
  return problems;
}

function usage(msg) {
  console.error(`usage error: ${msg}`);
  return 2;
}
const report = (label, problems) => {
  if (problems.length) {
    console.log(`${label} FAIL:\n` + problems.map((p) => `  - ${p}`).join("\n"));
    return 1;
  }
  console.log(`${label} OK`);
  return 0;
};

export function main(argv) {
  const a = parseArgs(argv);
  try {
    if (a.research !== undefined) {
      if (typeof a.research !== "string") return usage("--research <md> required");
      return report("RESEARCH", checkResearch({
        text: read(a.research), minFetched: typeof a["min-fetched"] === "string" ? a["min-fetched"] : DEFAULT_MIN_FETCHED,
      }));
    }
    if (a["visibility-unchanged"] !== undefined) {
      if (typeof a["visibility-unchanged"] !== "string" || typeof a.baseline !== "string") {
        return usage("--visibility-unchanged <current.json> --baseline <snapshot.json> required");
      }
      return report("VISIBILITY", checkVisibility({
        current: JSON.parse(read(a["visibility-unchanged"])), baseline: JSON.parse(read(a.baseline)),
      }));
    }
    if (a["probe-record"] !== undefined) {
      if (typeof a["probe-record"] !== "string") return usage("--probe-record <rec> required");
      return report("PROBE", checkProbe({ rec: JSON.parse(read(a["probe-record"])) }));
    }
    if (a.decision !== undefined) {
      if (typeof a.decision !== "string" || typeof a.context !== "string") return usage("--decision <md> --context <CONTEXT.md> required");
      return report("DECISION", checkDecision({ text: read(a.decision), context: read(a.context) }));
    }
    return usage("no mode given");
  } catch (e) {
    console.error(`error: ${e.message}`);
    return 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
