#!/usr/bin/env node
// SEC-02 read-only capture of GitHub plan limits and per-repo security state.
// Only GET: ghGet refuses any method other than GET and any body/field flag BEFORE the runner runs.
// Usage: node scripts/sec-capture-state.mjs --out <snapshot.json> --log <gh-log.tsv>
import { spawnSync } from "node:child_process";
import { appendFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const OWNERS = [
  { name: "PA-MATRIX", kind: "org" },
  { name: "PA-Ai-Team", kind: "org" },
  { name: "growthpods", kind: "user" },
];
const PARROT = "PA-Ai-Team/Parrot";
const PARROT_PRS = `repos/${PARROT}/pulls?state=all&per_page=100`;
const BAD_FLAGS = /^(-X.*|--method(=.*)?|--input(=.*)?|-f|-F|--field(=.*)?|--raw-field(=.*)?)$/;

const quote = (s) => (/^[A-Za-z0-9_\/.:@%+=,-]+$/.test(s) ? s : `'${s.replace(/'/g, "'\\''")}'`);

/** Real runner: spawns gh with an args array (never a shell string). */
export function ghRunner(args) {
  const r = spawnSync("gh", args, { encoding: "utf8", env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" }, maxBuffer: 64 * 1024 * 1024 });
  if (args[0] === "api") {
    const out = r.stdout || "";
    const m = /^HTTP\/[\d.]+ (\d{3})/.exec(out);
    const split = out.search(/\r?\n\r?\n/);
    const raw = split >= 0 ? out.slice(split).trim() : "";
    let body = null;
    try { body = raw ? JSON.parse(raw) : null; } catch { body = { message: raw.slice(0, 200) }; }
    return { status: m ? Number(m[1]) : 0, body };
  }
  let body = null;
  try { body = JSON.parse(r.stdout || "null"); } catch { body = null; }
  return { status: r.status === 0 ? 0 : r.status ?? 1, body };
}

function logLine(log, cmd) {
  if (typeof log === "function") log(`${new Date().toISOString()}\t${cmd}`);
}

/** GET a GitHub API path. Never throws on HTTP errors (403/404 are data). */
export async function ghGet(apiPath, { runner = ghRunner, log, method = "GET", input, extraArgs = [] } = {}) {
  if (String(method).toUpperCase() !== "GET") throw new Error(`ghGet is GET-only: refusing method ${method}`);
  if (input !== undefined) throw new Error("ghGet is GET-only: refusing --input");
  for (const f of extraArgs) if (BAD_FLAGS.test(String(f))) throw new Error(`ghGet is GET-only: refusing flag ${f}`);
  const args = ["api", "-i", apiPath];
  logLine(log, `gh ${args.map(quote).join(" ")}`);
  const r = await runner(args);
  const body = r?.body ?? null;
  const out = { status: r?.status ?? 0, message: body && !Array.isArray(body) && typeof body.message === "string" ? body.message : "" };
  return { ...out, body };
}

async function repoList(owner, { runner, log }) {
  const args = ["repo", "list", owner, "--limit", "100", "--json", "name,visibility"];
  logLine(log, `gh ${args.map(quote).join(" ")}`);
  const r = await runner(args);
  return Array.isArray(r?.body) ? r.body : [];
}

const pick = (r) => ({ status: r.status, message: r.message });

export async function captureState({ runner = ghRunner, log } = {}) {
  const owners = {};
  const lists = {};
  for (const { name, kind } of OWNERS) {
    const info = await ghGet(kind === "org" ? `orgs/${name}` : `users/${name}`, { runner, log });
    const list = await repoList(name, { runner, log });
    lists[name] = list;
    owners[name] = {
      kind,
      plan: info.body?.plan?.name ?? null,
      public_repos: list.filter((x) => String(x.visibility).toUpperCase() === "PUBLIC").map((x) => `${name}/${x.name}`),
      public_repos_enumerated: list.length < 100,
      repo_count: list.length,
    };
  }
  const targets = new Set(lists["PA-MATRIX"].map((x) => `PA-MATRIX/${x.name}`));
  targets.add(PARROT);
  targets.add("growthpods/Internjobs");
  for (const o of OWNERS) for (const n of owners[o.name].public_repos) targets.add(n);
  const repos = [];
  for (const nwo of [...targets].sort()) {
    const meta = await ghGet(`repos/${nwo}`, { runner, log });
    const prot = await ghGet(`repos/${nwo}/branches/main/protection`, { runner, log });
    const rs = await ghGet(`repos/${nwo}/rulesets`, { runner, log });
    const al = await ghGet(`repos/${nwo}/secret-scanning/alerts?per_page=1`, { runner, log });
    repos.push({
      nameWithOwner: nwo,
      visibility: String(meta.body?.visibility ?? "unknown").toUpperCase(),
      security_and_analysis: meta.body?.security_and_analysis ?? null,
      protection: pick(prot),
      rulesets: pick(rs),
      alerts_api: pick(al),
      admin: meta.body?.permissions?.admin === true,
    });
  }
  const prs = await ghGet(PARROT_PRS, { runner, log });
  const items = Array.isArray(prs.body)
    ? prs.body.map((p) => ({ number: p.number, state: p.state, head: p.head?.ref ?? null, title: p.title ?? null }))
    : [];
  return {
    captured_at: new Date().toISOString(),
    owners,
    repos,
    parrot_prs: { query: PARROT_PRS, status: prs.status, items },
  };
}

function parseArgs(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i++) if (argv[i].startsWith("--")) a[argv[i].slice(2)] = argv[++i];
  return a;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = parseArgs(process.argv.slice(2));
  if (!a.out || !a.log) { console.error("usage: --out <snapshot.json> --log <log.tsv>"); process.exit(2); }
  writeFileSync(a.log, "");
  const snap = await captureState({ log: (l) => appendFileSync(a.log, l + "\n") });
  writeFileSync(a.out, JSON.stringify(snap, null, 2) + "\n");
  console.log(`captured ${snap.repos.length} repos, ${snap.parrot_prs.items.length} Parrot PRs`);
}
