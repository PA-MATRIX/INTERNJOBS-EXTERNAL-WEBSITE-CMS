# Coupling inventory (MAP-04)

Phase 38, plan 03. Every place the current monorepo layout is enforced or referenced, with a disposition for the v1.6 split
(website repo = `apps/marketing` only; platform repo = everything else; Parrot unchanged per D1).

**Completeness is recomputed, not asserted.** The hit set is whatever
`node scripts/verify-code-maps.mjs --inventory <this file> --repo <repo> [--ref <ref>] [--repo-name <section>]` derives with
`git grep -l -E` over tracked files for: `apps/marketing`, `apps/employers`, `apps/app`, `apps/parrot`, `apps/startup`,
`apps/mac-bridge`, `packages/shared`, `internjobs-marketing-website`, `PA-MATRIX/`, `internjobs-ai`. A file is excluded only when its
sole hits are patterns naming its own app directory. Binary files are skipped (`-I`). Rows are one file or one `dir/**` glob.
Dispositions: **keep** = valid unchanged where it ends up; **move** = goes to `destination`; **rewrite** = must change (note starts `rewrite:`);
**delete** = removed in the split. A glob row covers every hit under it, so the glob rows below say what the hits inside actually are.

Readings were taken on 2026-10-09: cms at `d1658aa` plus this branch, Parrot at `origin/main` `74880e4` (committed tree only), legacy at
`HEAD` `99bcced` (committed tree only). No `.env*` file was opened in any repo. Process facts come from read-only `gh api` GETs.

Findings worth reading before Phase 40:

- Parrot has **zero** hits for the layout patterns at `origin/main`. Its only coupling to this product is the runtime tenant and domain
  `internjobs` / `workspace.internjobs.ai` (rows below, informational).
- `packages/shared` has no consumer: no `package.json` in the repo names `@internjobs/shared` (grep below), so it moves with the platform and
  `apps/marketing` has no dependency on it. Only README line 9 and the lockfile entries mention it.
  `git grep -n -E 'packages/shared|@internjobs/shared' -- . ':!.planning' ':!package-lock.json'` returns README.md:9 and packages/shared/package.json only.
- The four SPLIT-03 cross-references are all comments or an HTTPS URL, not source imports; none needs a shared package, only a reworded comment.
- Required check names are copied from ci.yml job `name:` values, and one of them contains the word marketing. Renaming a job without
  updating branch protection in the same step deadlocks merges.
- `apps/app/README.md` still cites the dead Infisical project id `0484b3ce...`; the live project id is recorded in memory and Infisical docs.

## cms (PA-MATRIX/internjobs-marketing-website, local ~/internjobs-cms)

| repo | path | pattern(s) | kind | disposition | destination | note |
|---|---|---|---|---|---|---|
| cms | `.github/workflows/ci.yml` | apps/parrot, apps/startup | ci | rewrite | n/a | rewrite: split by job. Website CI keeps only a marketing build plus verify:dist job. Platform CI gets workspaces (minus marketing), parrot, startup, email-worker, email-timeout-invariant and submission-gate. Hard-coded working-directory apps/parrot, apps/startup, apps/email-worker and the cache-dependency-path lockfiles stay platform-only. Job names are the required check names, see process rows |
| cms | `package.json` | apps/marketing, internjobs-ai | build | rewrite | n/a | rewrite: two roots. Workspaces globs apps/* and packages/* with exclusions for apps/agentic-inbox, apps/parrot and apps/startup stay platform. Scripts dev/build/preview/verify:marketing:dist/verify:marketing:production/deploy:pages go to the website root. dev:app/start:app/build:app/smoke:parrot-graph stay platform. Root name is internjobs-ai and collides with the Pages project name, rename both roots |
| cms | `package-lock.json` | apps/employers, packages/shared | build | rewrite | n/a | rewrite: one lockfile cannot be shared. Regenerate two lockfiles with npm install in each new repo. The packages/shared and node_modules/@internjobs/shared entries go with the platform |
| cms | `README.md` | apps/marketing, apps/app, packages/shared, internjobs-ai | doc | rewrite | n/a | rewrite: layout bullets, Pages build output, Fly deploy and the Infisical path /internjobs-ai are written for the monorepo. Write one README per repo. README line 9 calls packages/shared shared by both apps, which is not true today |
| cms | `.gitignore` | apps/mac-bridge | config | rewrite | n/a | rewrite: the apps/mac-bridge env and node_modules ignores stay in the platform .gitignore only |
| cms | `TEAM-WORKFLOW.md` | apps/parrot | process | move | platform | team ownership table, platform process only |
| cms | `apps/marketing/package.json` | internjobs-ai | deploy | move | website | scripts verify:dist and verify:production live here, not at the root. deploy:pages runs wrangler pages deploy with --project-name internjobs-ai, so the Pages project name must be kept |
| cms | `apps/marketing/wrangler.toml` | internjobs-ai | deploy | move | website | name internjobs-ai is the Cloudflare Pages project serving internjobs.ai; unchanged by the split (SPLIT-04) |
| cms | `apps/marketing/src/components/StartupAccessSection.tsx` | apps/marketing, apps/employers | import | rewrite | n/a | rewrite: not a source import. Posts to the HTTPS endpoint https://mcp.internjobs.ai/api/request-access (platform Worker apps/startup). Keep the URL as a documented contract constant and reword the Phase 28.5 transitional comment that names the employers app |
| cms | `apps/employers/src/styles.css` | apps/marketing | style | rewrite | n/a | rewrite: brand tokens are already copied into employers; only the comments name apps/marketing/src/styles.css and verify-brand.mjs. Reword to point at BRAND-V1.md so no comment depends on the other repo |
| cms | `apps/employers/tailwind.config.ts` | apps/marketing | style | rewrite | n/a | rewrite: tokens mirrored, only the header comment names apps/marketing/tailwind.config.ts. Reword the comment; no import to cut |
| cms | `apps/app/src/views.mjs` | apps/marketing | import | rewrite | n/a | rewrite: the logo SVG is inlined in the file; the comment names apps/marketing/public/logo/mark-gradient.svg. Reword the comment; no file read at runtime |
| cms | `apps/app/README.md` | apps/marketing, internjobs-ai | doc | rewrite | n/a | rewrite: says apps/marketing deploys to Pages, and cites the dead Infisical project id 0484b3ce. Update both |
| cms | `apps/app/fly.toml` | internjobs-ai | deploy | move | platform | Fly app name internjobs-ai-student-app is live and must not change |
| cms | `apps/app/**` | apps/mac-bridge, apps/parrot, apps/startup, internjobs-ai | build | move | platform | rest of the hits are comments naming sibling apps, the Fly app name in docs/fly-deploy.md and .env.example, and migration comments. No runtime import of another app |
| cms | `apps/email-worker/wrangler.toml` | apps/startup | deploy | move | platform | Worker internjobs-email-ingest; STARTUP_EMAIL_HANDOFF_URL names the apps/startup endpoint, a URL not a path |
| cms | `apps/email-worker/**` | apps/startup | build | move | platform | src/constants.js and src/index.js comments plus tests name apps/startup timeout constants. scripts/check-email-timeout-invariant.mjs reads both apps by relative path, so they must land in the same repo |
| cms | `apps/employers/**` | apps/parrot, apps/startup, internjobs-ai | build | move | platform | rest of the hits are comments mirroring parrot and startup patterns and the Infisical path in .env.example. Deploys to Pages project internjobs-employers (package.json deploy script) |
| cms | `apps/agentic-inbox/**` | none | build | move | platform | 72 tracked files, no layout-pattern hit; excluded from root workspaces by `!apps/agentic-inbox`, so it never ran in the workspaces CI job. Goes with the platform |
| cms | `apps/mattermost-proxy/**` | none | build | move | platform | 3 tracked files, no layout-pattern hit; platform |
| cms | `apps/mac-bridge/**` | apps/app | build | move | platform | src/listener.mjs comment names the app-side client |
| cms | `apps/mac-bridge/launchd/ai.internjobs.mac-bridge.plist` | apps/mac-bridge | deploy | rewrite | n/a | rewrite: hard-codes /Users/raj/internjobs-cms/apps/mac-bridge for the env file, the server entry and the working directory. Point at the platform checkout path on the Mac bridge host |
| cms | `apps/parrot-mattermost/**` | internjobs-ai | doc | move | platform | README cites Infisical paths under /internjobs-ai/mattermost |
| cms | `apps/parrot/wrangler.jsonc` | internjobs-ai | deploy | move | platform | Worker name internjobs-parrot; comments cite Infisical /internjobs-ai paths. Deploy replaces the whole Worker, so deploy only from the platform repo main |
| cms | `apps/parrot/**` | apps/app, internjobs-ai | build | move | platform | the Workspace Worker. Hits are comments naming apps/app and its own routes plus the smoke script; see PARROT-RELATIONSHIP.md for how it relates to PA-Ai-Team/Parrot |
| cms | `apps/startup/**` | apps/parrot, internjobs-ai | build | move | platform | Worker internjobs-startup-mcp (mcp.internjobs.ai). Hits are comments mirroring apps/parrot patterns and Infisical paths in wrangler.jsonc and types.ts |
| cms | `packages/shared/**` | apps/parrot | build | move | platform | no package.json names @internjobs/shared (checked); apps/marketing does not depend on it |
| cms | `docs/VOICE_AGENT_CONFIG.md` | apps/startup, internjobs-ai | doc | move | platform | runbook for the startup Worker voice agent |
| cms | `infra/**` | apps/app, apps/parrot, apps/employers, internjobs-ai | deploy | move | platform | Fly configs (falkordb, student-db, graph-api, startup-api) and runbooks that name apps/* paths and the Fly app internjobs-ai-student-app |
| cms | `scripts/check-submission.mjs` | .planning/workstreams | process | move | platform | no layout-pattern hit; run by the submission-gate job and reads .planning/workstreams/<team>/submissions/<phase>.json, so it travels with .planning |
| cms | `scripts/submit-phase.mjs` | .planning/workstreams | process | move | platform | no layout-pattern hit; writes the per-phase marker under .planning/workstreams/<team>/submissions/, platform process |
| cms | `scripts/check-email-timeout-invariant.mjs` | apps/startup | ci | move | platform | reads apps/startup and apps/email-worker constants by relative path; both apps are platform |
| cms | `scripts/**` | apps/app, apps/parrot, internjobs-ai | build | move | platform | all repo-level scripts are platform tooling (kgraph smoke, clerk restrictions, verify-v15-promotion, verify-code-maps and its test) |
| cms | `.planning/**` | apps/marketing, PA-MATRIX/, internjobs-ai | process | move | platform | planning history for every phase, including team-mode.json and workstreams. 274 tracked files mention the patterns. Website repo is a fresh start (D6) and carries none of it |
| cms | `process:branch-protection:main` | PA-MATRIX/ | process | rewrite | n/a | rewrite: GET 2026-10-09 on branch main: strict status checks on, required checks are the four names in process:required-check-names, 0 approving reviews, enforce_admins off, force push off, deletions off. Protection is per repo and does not move; re-create it on both new repos with that repo's own check names |
| cms | `process:ruleset:integration` | PA-MATRIX/ | process | rewrite | n/a | rewrite: ruleset 17824788 integration branches PR plus CI plus submission gate, active on refs/heads/integration/**: deletion blocked, non-fast-forward blocked, pull request required with 0 approvals, the same four required checks. Re-create on the platform repo; the website repo only needs it if it keeps integration branches |
| cms | `process:required-check-names` | PA-MATRIX/ | ci | rewrite | n/a | rewrite: required names are `workspaces (marketing · app · employers)`, `workspace worker (parrot)`, `startups worker (typecheck · tests)`, `submission gate (rrr)`. Not required: `email timeout invariant (cross-package)`, `email worker (tests)`. Rename the workspaces job on the platform and update the protection in the same step |
| cms | `process:cloudflare-pages:internjobs-ai` | internjobs-ai | deploy | move | website | Pages project internjobs-ai serves internjobs.ai, built from apps/marketing/dist; moves with the website repo build with no change of project or domain (SPLIT-04). Employers uses a separate Pages project internjobs-employers |
| cms | `process:fly-app:internjobs-ai-student-app` | internjobs-ai | deploy | move | platform | Fly app from apps/app/fly.toml; name fixed, deploy source becomes the platform repo |
| cms | `process:team-mode` | internjobs-marketing-website, PA-MATRIX/ | process | rewrite | n/a | rewrite: .planning/team-mode.json github.repo is PA-MATRIX/internjobs-marketing-website with integration branch integration/v1.5, and WORKSTREAMS.md repeats the slug. Moves to platform and the slug becomes the platform repo; teams team-cms (idle) and team-workspace (assigned) keep their keys |
| cms | `process:infisical-path:/internjobs-ai` | internjobs-ai | config | keep | n/a | secret path /internjobs-ai env prod is referenced by READMEs, wrangler comments and runbooks across both repos; it names no repo and does not change |

## parrot (PA-Ai-Team/Parrot, local ~/Documents/Parrot, ref origin/main)

Zero hits for the layout patterns at `origin/main` `74880e4`. The rows below are the case-insensitive `internjobs` references found while
reading (runtime tenant and domain, not repo layout). Parrot gets no changes in this milestone (D1), so every row is keep.

| repo | path | pattern(s) | kind | disposition | destination | note |
|---|---|---|---|---|---|---|
| parrot | `server/config.js` | internjobs | config | keep | n/a | EMBED_ORG_SLUG defaults to the internjobs tenant and comments cite the workspace.internjobs.ai issuer; a domain coupling to the monorepo Workspace, unchanged by the split |
| parrot | `server/db.js` | internjobs | config | keep | n/a | seeds the internjobs org and its email_inbox entitlement |
| parrot | `server/services/embedTenants.js` | internjobs | config | keep | n/a | seeds the internjobs embed tenant row from live config |
| parrot | `server/scripts/embed-test-harness.mjs` | internjobs | config | keep | n/a | test harness uses the internjobs org slug |
| parrot | `server/test/embedTenants.test.js` | internjobs | config | keep | n/a | fixtures use the workspace.internjobs.ai issuer |
| parrot | `ops/zero-trust/**` | internjobs | config | keep | n/a | callers and capabilities name the customer-internjobs caller and the workspace.internjobs.ai issuer |
| parrot | `scripts/zt/prepare-prod-access-stage.mjs` | internjobs | config | keep | n/a | stage script lists the InternJobs org and issuer |
| parrot | `fly.toml` | none | deploy | keep | n/a | Fly app parrot-o3vkuq; no monorepo coupling, listed for the deploy-target record |

## legacy (growthpods/Internjobs, local ~/MayaOS/internjobs-ai, ref HEAD)

Hits are name collisions: the legacy package and its Render services are also called `internjobs-ai`. The repo is to be archived
after its 4 uncommitted files are resolved (D3), so every row is keep and nothing is edited.

| repo | path | pattern(s) | kind | disposition | destination | note |
|---|---|---|---|---|---|---|
| legacy | `package.json` | internjobs-ai | build | keep | n/a | package name internjobs-ai, same string as the cms root name and the Pages project; archived untouched |
| legacy | `package-lock.json` | internjobs-ai | build | keep | n/a | repeats the package name |
| legacy | `README.md` | internjobs-ai | doc | keep | n/a | clone instructions use the folder name internjobs-ai |
| legacy | `memory-bank/techContext.md` | internjobs-ai | doc | keep | n/a | Render service name and clone folder |
| legacy | `render.yaml` | internjobs-ai | deploy | keep | n/a | Render services internjobs-ai-frontend and internjobs-ai-mastra; whether they are live was not checked, confirm before archiving |
