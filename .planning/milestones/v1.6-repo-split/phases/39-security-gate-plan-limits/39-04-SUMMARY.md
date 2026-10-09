---
phase: 39-security-gate-plan-limits
plan: 04
status: "blocked: rotation required"
subsystem: security
tags: [sec-01, gitleaks, parrot]
---

# Phase 39 Plan 04: Parrot secret scan Summary

**Scan completed on the GitHub mirror, but two real-key-shaped literals were found and are still in the current tips, so the plan stops at `blocked: rotation required` and no passing SCAN-RECORD was written.**

## What Shipped

- Tasks 1-2 (sanitizer, tests, RED/GREEN, approval D15) were done earlier; see 39-04-RED.txt, 39-04-GREEN.txt, 39-04-RED-live.txt (RED recorded first).
- Task 3 resumed under D15a (GitHub mirror only). The first attempt at a local-object clone failed (`fatal: bad object 000...`, broken local ref `refs/heads/main 2`); that logged line is kept in 39-04-gh-log.tsv. gitleaks 8.30.1 and the mirror were re-verified, nothing was reinstalled or recloned.
- Live RED re-confirmed (record absent exit 1; guard exit 1 while scratch existed), then GREEN-live evidence in 39-04-GREEN-live.txt (counts and exit codes only).
- History scan: 406 findings; tip trees: main 331, both fix tips 3. Classification by shape analysis (no values): the large majority are Cloudflare token_id UUIDs and sha256 hash fields (false positives) and doc placeholders.

## Findings needing a human decision (REAL, no values)

| File | Rule | Commit | Note |
| ---- | ---- | ------ | ---- |
| server/routes/contacts.js L190 | generic-api-key | 1a8dd6c0 | `X-API-Key` literal, 41 chars, high entropy; present in main and both fix tips |
| .planning/milestones/v1.0/phases/01-foundation/01-03-SUMMARY.md L87 | generic-api-key | 33cd67dc | `TELNYX_API_KEY` literal, 58 chars, KEY-prefixed; present in main and both fix tips |

Liveness was not tested (it would send the value to a provider). Rotation was NOT done. Per the plan, the orchestrator inserts an approved rotation plan (issuer first, Infisical /internjobs-ai, Worker secret, re-scan, old-credential-rejected readback).

## Observations

- Local Parrot repo has a broken ref `refs/heads/main 2` (null sha) that broke the local clone; not fixed.
- Dangling commit 1d577ffb exists only locally, is NOT in the GitHub mirror and was NOT scanned (optional step 2c skipped; run stopped before it).
- Worktree uncommitted-edit scan was not run (stopped on REAL candidates). It must be run in the re-scan after rotation.

## Rulings

None - no plan conflicts arose beyond D15a (already recorded by the orchestrator).

## Cleanup

Scratch dir deleted. `--guard` exit 0 (Parrot untouched), `--gh-log` exit 0. `--scan-record` still exits 1 (no record).

## STATE line

`<!-- 39-04 -->` 39-04 BLOCKED: rotation required (2 real-candidate literals in Parrot main + fix tips; see 39-04-SUMMARY.md); scan incomplete (worktree edits, dangling commit not scanned).
