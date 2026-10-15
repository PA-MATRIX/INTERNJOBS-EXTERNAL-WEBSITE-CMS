// Reads `git diff -U0 origin/main -- apps/app/src/server.mjs` on stdin and the
// origin/main server.mjs path as argv[2]. Fails (exit 1) if any hunk's OLD-side
// range overlaps the /webhooks/photon route (its `if` line up to the line
// before the next route's header comment).
import { readFileSync } from "node:fs";
const old = readFileSync(process.argv[2], "utf8").split("\n");
const start = old.findIndex((l) => l.includes('url.pathname === "/webhooks/photon"')) + 1;
const next = old.findIndex((l, i) => i >= start && l.includes("Inbound iMessage/SMS via self-hosted Mac bridge")) + 1;
const end = next - 1;
const diff = readFileSync(0, "utf8");
let bad = 0;
console.log(`photon route (origin/main): lines ${start}-${end}`);
for (const m of diff.matchAll(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/gm)) {
  const a = Number(m[1]);
  const n = m[2] === undefined ? 1 : Number(m[2]);
  // n === 0 means a pure insertion AFTER line a.
  const lo = n === 0 ? a + 0.5 : a;
  const hi = n === 0 ? a + 0.5 : a + n - 1;
  const hit = hi >= start && lo <= end;
  if (hit) bad += 1;
  console.log(`hunk old ${a},${n} -> ${n === 0 ? `insert after ${a}` : `lines ${a}-${a + n - 1}`}: ${hit ? "INSIDE photon route" : "outside photon route"}`);
}
console.log(bad ? `FAIL: ${bad} hunk(s) touch the photon route` : "PASS: no hunk touches the photon route");
process.exit(bad ? 1 : 0);
