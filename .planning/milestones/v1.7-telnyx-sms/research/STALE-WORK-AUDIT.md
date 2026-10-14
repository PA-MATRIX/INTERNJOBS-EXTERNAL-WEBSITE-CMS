# Stale / half-finished work audit (2026-10-13, read-only)

Trigger: Raj: "check if there were any worktrees or subfolders which were stale or finished half way ... codex and claude code worked a lot and might be mid way ... any branches that were stale and finished". Nothing was modified, fetched or pushed (`GIT_OPTIONAL_LOCKS=0`; `gh` read-only).

**Bottom line:** no feature work is missing from `main` (d1658aa = origin/main = live Workspace). The only real loss risk was `apps/canary-monitor/`: deployed, with its source never committed. It is now committed on `docs/v1.7-telnyx-sms` and is to be retired under DECOM-01.

## A. Missing from main / half-finished
| Item | Verdict |
|------|---------|
| `origin/rrr/v1.4/team-workspace-25` (14 commits) | Superseded by later main: the admin-invite block is in main `apps/parrot/wrangler.jsonc:129`, `@neondatabase` was removed in main too. The rest is doc drift. Nothing missing. |
| `origin/rrr/v1.4/team-workspace-25-chat-provisioning` (0dcac8f) | Fully in main and newer there (`friendlyChatReason`, `createMmUser`, `MATTERMOST_ADMIN_TOKEN`, `chat_provisioned` present). |
| `origin/rrr/v1.4/team-workspace-26` | Fully in main (`resolveTodosForEmail` at durableObject/index.ts:1045; reply-forward hunk identical). Only SUBMISSION.json differs. |
| v1.6 Phase 39 | Half-finished by decision (paused, D29): 39-04 blocked on rotation, 39-10 not started. |
| `apps/canary-monitor/` | Deployed Worker, source never committed. **Committed 2026-10-13** to preserve it; retire under DECOM-01. |
| Parrot repo PR #12 (`fix/sms-send-and-contact-dedupe-main`, open since ~09-23, 6 ahead / 223 behind) and draft PR #11 (`feat/hunter-contact-drawer`) | Open, unmerged (Parrot repo, outside this monorepo). Needs review or rebase by the Parrot owner. |
| Old TODO markers (44, none added since 2026-06-01), e.g. `apps/startup/workers/routes/voice.ts` TODO(v1.5), `apps/employers/functions/api/[[path]].ts:470,495` TODO 28.5-04 | Old backlog, not interrupted work. |

## B. Stale, safe to clean (suggested, NOT run; needs Raj's go-ahead)
- Two agent worktrees (fd004a7, 2026-05-09, only `.planning/.cache/`): `git worktree remove --force .claude/worktrees/agent-a31459db0549ad502 && git worktree remove --force .claude/worktrees/agent-a4ab4c291d558c65f && git branch -D worktree-agent-a31459db0549ad502 worktree-agent-a4ab4c291d558c65f`
- Remote branches with content already in main: `rrr/v1.4/team-workspace-25`, `-25-chat-provisioning`, `-26`, plus 13 branches 0-ahead of main (docs/open-v1.6-repo-split, integration/v1.4, integration/v1.5, rrr/v1.4/team-cms, team-workspace, -23, -25-docs, -26-docs, -27, -30, rrr/v1.5/team-workspace-32, -33, -36): `git push origin --delete <branch>`.
- Local merged branches: phase-07b, phase-09, phase-10, integration/v1.4, integration/v1.5, rrr/v1.4/team-cms, rrr/v1.4/team-workspace-27, docs/open-v1.6-repo-split: `git branch -d <branch>`.
- `apps/ai-worker/` (only a gitignored `.wrangler/`; app removed in db00c8b): `rm -rf apps/ai-worker`.
- Untracked RRR logs (`.planning/subagent-runs.jsonl`, `.subagent-runs-state.json`, `.review-rounds.json`) → add to `.gitignore`.
- Paperwork gaps (optional backfill): v1.3 phases 18/20 have EXECUTION-REPORT but no SUMMARY; 33-05/33-07 have EVIDENCE but no SUMMARY; phases 19, 22, 24, 28.5, 29 and 32 have no VERIFICATION.

## C. Held branches (D10 main freeze)
`docs/patch-v1.5.1-workspace-deploy` (8 ahead; adds `scripts/verify-workspace-quarantine-live{,.test}.mjs`), `docs/phase-38-code-map` (65 ahead; 12 verifier scripts under `scripts/`), `docs/v1.7-telnyx-sms` (local only, contains phase-38). None touch `apps/`.

## D. Other local clones / Codex
- `~/Documents/Parrot` (main): clean, but 46 commits behind GitHub (74880e4 → 835b9a7) → `git -C ~/Documents/Parrot pull --ff-only`.
- `~/Documents/Parrot-wt-dedupe` duplicates PR #12's 6 commits (different hashes, no PR); remove after #12 merges.
- `~/MayaOS/internjobs-ai` (growthpods/Internjobs, last commit 2025-12-21, 7 uncommitted files): old prototype, part of v1.6 GH-04/LOCAL-02 archive.
- `~/Archives`: legacy `.env.local.bak` + NoMachine `.nxs.bak` (contents not read), pending Infisical push / rotation.
- `~/.codex`: no worktrees; only 4 sessions in internjobs-cms, the last on 2026-05-20. No recent unfinished Codex work.
