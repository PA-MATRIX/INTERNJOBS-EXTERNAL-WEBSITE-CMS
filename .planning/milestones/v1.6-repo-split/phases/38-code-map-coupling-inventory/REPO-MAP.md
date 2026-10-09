# REPO-MAP (MAP-06)

Phase 38, plan 03. Every Intern Jobs GitHub repo, read 2026-10-09 from `gh repo view` and `gh repo list` (saved as `gh-snapshot.json`) and
from `git remote get-url origin` in each local folder. `node scripts/verify-code-maps.mjs --repo-map <this file> --gh-json gh-snapshot.json`
re-checks visibility, owner, remote slug, local folder, owning team and the org enumeration.

## Repos

| Repo | Owner | Visibility | Purpose | Local folder | Deploy target | Owning team |
|---|---|---|---|---|---|---|
| PA-MATRIX/internjobs-marketing-website | PA-MATRIX | Public | The current monorepo (named `internjobs-cms` locally): marketing site, student app, employers app, Workspace (apps/parrot, owned by team-workspace), startup MCP Worker, email Worker, mac-bridge, infra. Source of the v1.6 split | ~/internjobs-cms | Marketing: Cloudflare Pages `internjobs-ai`. Employers: Cloudflare Pages `internjobs-employers`. Student app: Fly `internjobs-ai-student-app`. Workers: `internjobs-parrot`, `internjobs-startup-mcp`, `internjobs-email-ingest`. mac-bridge: launchd on the Mac mini | team-cms |
| PA-Ai-Team/Parrot | PA-Ai-Team | Private | The standalone Parrot server (Mattermost-adjacent workspace product with embed tenants). Stays where it is (D1); a different thing from monorepo `apps/parrot`, see PARROT-RELATIONSHIP.md | ~/Documents/Parrot | Fly app `parrot-o3vkuq` (fly.toml at origin/main; a render.yaml is also committed, not confirmed live) | unmanaged: PA-Ai-Team repo outside team-mode.json, D1 leaves it untouched |
| growthpods/Internjobs | growthpods | Private | Legacy first version of the product (Next.js plus Mastra, package name internjobs-ai). To be archived after its 4 uncommitted files are resolved (D3) | ~/MayaOS/internjobs-ai | Render services `internjobs-ai-frontend` and `internjobs-ai-mastra` per render.yaml (live status not checked); none planned after archive | unmanaged: legacy repo, archive pending (D3) |

## Planned

Not current. Post-split names from CONTEXT D2, shown so later phases have one place to update. Not checked against GitHub.

| Repo | Owner | Visibility | Purpose | Local folder | Deploy target | Owning team |
|---|---|---|---|---|---|---|
| PA-MATRIX/internjobs-cms | PA-MATRIX | Public | Website only: `apps/marketing` plus its own CI, README and lockfile (D2, D6 fresh start) | planned | Cloudflare Pages `internjobs-ai` | planned: team-cms |
| PA-MATRIX/internjobs-platform | PA-MATRIX | Private | Every other app, packages/shared, infra, scripts, .planning and team-mode config | planned | Fly, Workers and the employers Pages project as today | planned: team-workspace and team-cms |

## Excluded

Repos in the three orgs whose names match intern, parrot, marketing or growth but are not Intern Jobs repos. Each name was grepped against
the cms tree (excluding this milestone's own docs) and has zero references there; ownership beyond that is not asserted.

- PA-MATRIX/sis-marketing-website: name match only (marketing); no reference from the cms tree
- PA-Ai-Team/Projecta-marketing-cms: name match only (marketing); no reference from the cms tree
- PA-Ai-Team/simpleidcheck-marketing-cms: name match only (marketing); no reference from the cms tree
- PA-Ai-Team/innovantech-marketing-cms: name match only (marketing); no reference from the cms tree
- PA-Ai-Team/growthpods-marketing-cms: name match only (growth, marketing); no reference from the cms tree
- PA-Ai-Team/mspark-marketing-cms: name match only (marketing); no reference from the cms tree
- PA-Ai-Team/MarketingOS: name match only (marketing); no reference from the cms tree
- PA-Ai-Team/Marketing-Audit: name match only (marketing); no reference from the cms tree
- PA-Ai-Team/telecom-awards-marketing-cms: name match only (marketing); no reference from the cms tree
- PA-Ai-Team/OWL-Marketing-cms: name match only (marketing); no reference from the cms tree
- growthpods/ai-marketing-skills: name match only (marketing); no reference from the cms tree
