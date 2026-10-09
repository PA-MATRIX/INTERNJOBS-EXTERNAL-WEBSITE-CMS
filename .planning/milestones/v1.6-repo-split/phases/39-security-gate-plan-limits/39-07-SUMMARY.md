# Phase 39 Plan 07: SEC-03 throwaway-repo probe Summary (PARTIAL measurement, cleaned up)

The probe measured protection behaviour up to the visibility flip, but the push-to-main step could not be measured because the clone failed. The probe repo PA-MATRIX/zz-sec03-probe-20261008 was then deleted by the orchestrator under the D17-approved line 7 and a final GET returned 404.

## What Shipped
- 39-07-APPROVAL.json, approved-writes (7 lines), gh-log, PROBE-RECORD.json (stopped:true, outcome partial, delete + 404 readback recorded), RED-live and GREEN-live evidence (RED first: record absent exit 1, repo GET 404).
- Measured: create 200, PUT protection 200, GET protection before flip `before_flip: 200`, flip to private 200, GET protection after flip `after_flip: 403` with message "Upgrade to GitHub Pro or make this repository public to enable this feature."
- Orchestrator GETs before delete: repo private:true, disabled:false, admin permission; org PA-MATRIX plan free, 10 private repos (incl. probe).
- push_to_main: "not measured". `git clone` returned HTTP 403 "Repository ... is disabled" (GitHub-side message, cause unknown; repo showed disabled:false afterwards).

## Limitations
"Protection survives going private" is NOT directly measured. Only the protection API being refused (403 upgrade message) on a private repo on this plan is measured, consistent with the docs (C1). Enforcement is unproven and unlikely.

## Verification
- RED (before): `--probe-record` exit 1 (repo left behind, final status not 404).
- GREEN (after): `--probe-record` exit 0 (PROBE OK); `--gh-log --approved` exit 0 (GH-LOG OK). See 39-07-GREEN-live.txt. Verifier unchanged.

## Deviations
- Stopped on unexpected clone result (no retry). Step 7 (delete) was run by the orchestrator, not the executor, using the verbatim D17-approved line, and the final 404 was read back. push_to_main step not executed.
