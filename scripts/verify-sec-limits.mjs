#!/usr/bin/env node
// SEC-02 read-only verifier. Modes:
//   --state <snap.json> [--matrix <md>]
//   --enable-record <rec.json> --approval <approval.json>
// Output names the check and the owner/repo, never a value.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, scanSecrets } from "./verify-code-maps.mjs";

export const OWNERS = ["PA-MATRIX", "PA-Ai-Team", "growthpods"];
export const MSG403 = "Upgrade to GitHub Pro or make this repository public to enable this feature.";
const isFree = (plan) => plan === "free" || plan === null || plan === undefined;
const ownerOf = (nwo) => String(nwo).split("/")[0];

export function checkState(snap) {
  const p = [];
  const owners = snap?.owners ?? {};
  for (const o of OWNERS) {
    if (!owners[o]) { p.push(`owner ${o}: missing from snapshot`); continue; }
    if (owners[o].public_repos_enumerated !== true) p.push(`owner ${o}: public_repos_enumerated is not true`);
  }
  const q = snap?.parrot_prs?.query;
  if (typeof q !== "string" || !/\?state=all(&|$)/.test(q)) p.push("parrot_prs: captured without the ?state=all query");
  for (const r of snap?.repos ?? []) {
    const name = r.nameWithOwner;
    for (const k of ["protection", "rulesets"]) {
      const e = r[k];
      if (e?.status === 403 && e.message !== MSG403) {
        p.push(`repo ${name}: ${k} 403 ${e.message === undefined ? "has no message" : "message is not the verbatim GitHub text"}`);
      }
    }
    const plan = owners[ownerOf(name)]?.plan;
    if (String(r.visibility).toUpperCase() === "PRIVATE" && isFree(plan) && r.protection?.status === 200) {
      p.push(`repo ${name}: private on a free plan recorded with protection status 200`);
    }
  }
  return p;
}

export function checkMatrix(snap, md) {
  const p = [];
  const rows = {};
  for (const line of String(md).split("\n")) {
    if (!line.trim().startsWith("|")) continue;
    const cells = line.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
    if (cells.length >= 2) rows[cells[0]] = cells[1];
  }
  for (const o of OWNERS) {
    if (!(o in rows)) { p.push(`matrix: no row for owner ${o}`); continue; }
    const want = snap?.owners?.[o]?.plan;
    if (String(rows[o]) !== String(want)) p.push(`matrix: plan for owner ${o} differs from snapshot`);
  }
  return p;
}

export function checkEnableRecord(rec, approval) {
  const p = [];
  if (!approval) return ["approval: file missing"];
  const t = Date.parse(rec?.first_write_at), a = Date.parse(approval.approved_at);
  if (!Number.isFinite(t) || !Number.isFinite(a)) p.push("timestamps: first_write_at or approved_at unparseable");
  else if (t < a) p.push("first_write_at is earlier than approved_at");
  const scope = approval.scope ?? [];
  for (const r of rec?.repos ?? []) {
    const name = r.repo;
    if (!scope.includes(name)) p.push(`repo ${name}: not in approval scope`);
    if (r.outcome !== "enabled") continue;
    const b = r.before ?? {}, af = r.after ?? {};
    if (b.secret_scanning !== "disabled" && r.outcome_unchanged !== true) {
      p.push(`repo ${name}: before.secret_scanning is not disabled and not marked unchanged`);
    }
    if (af.secret_scanning !== "enabled") p.push(`repo ${name}: after.secret_scanning is not enabled`);
    if (r.alerts_api_after?.status !== 200) p.push(`repo ${name}: alerts_api_after.status is not 200`);
    if (String(r.visibility).toUpperCase() === "PRIVATE" && isFree(r.plan)) p.push(`repo ${name}: private on a free plan claimed enabled`);
    if (af.push_protection === "enabled" && !(r.push_protection_doc?.url && r.push_protection_doc?.verified_on)) {
      p.push(`repo ${name}: push protection claimed without push_protection_doc`);
    }
  }
  return p;
}

const read = (f) => readFileSync(f, "utf8");
function report(label, text, problems) {
  const leaks = scanSecrets(text);
  if (leaks.length) problems.push(`input carries credential-shaped text (${leaks.join(", ")})`);
  if (problems.length) {
    console.log(`${label} FAIL:\n` + problems.map((x) => `  - ${x}`).join("\n"));
    return 1;
  }
  console.log(`${label} OK`);
  return 0;
}

export function main(argv) {
  const a = parseArgs(argv);
  try {
    if (a.state) {
      const text = read(a.state);
      const snap = JSON.parse(text);
      const problems = checkState(snap);
      let all = text;
      if (a.matrix) { const md = read(a.matrix); all += "\n" + md; problems.push(...checkMatrix(snap, md)); }
      return report("SEC-LIMITS STATE", all, problems);
    }
    if (a["enable-record"]) {
      const text = read(a["enable-record"]);
      let approval = null, atext = "";
      if (typeof a.approval === "string") { try { atext = read(a.approval); approval = JSON.parse(atext); } catch { approval = null; } }
      return report("SEC-LIMITS ENABLE", text + "\n" + atext, checkEnableRecord(JSON.parse(text), approval));
    }
    console.error("usage error: no mode given");
    return 2;
  } catch (e) {
    console.error(`error: ${e.message}`);
    return 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
