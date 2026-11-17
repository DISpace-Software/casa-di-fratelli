# Shared reservation dictation — production release, 2026-11-18

Bulgarian dictation for **guest name and phone only** is published in the shared
restaurant administration. All resolved tenants, including future restaurants,
receive the same API policy. Basic/Pro does not affect it. Audio runs on the
device; no external recognition provider, paid worker or database migration was
introduced. Phone results require explicit acceptance.

## Published sources

| Component | Source | Deployment |
| --- | --- | --- |
| Shared API | `af01a5a05b1020cc45985762b22de71cbc6a2f90` on `main` | Render `dep-dbucvs5g1s2s73ci6k8g`, live |
| Shared admin | `f6ca33f8f8eef1c671a8c3728e4e21a3cb0e6ab2` | Vercel `dpl_7dzuTeG6J2ce1oRfpJi6Af6bs6EP`, promoted |

- [Casa admin](https://seatmap-admin-eight.vercel.app/r/casa-di-fratelli/admin)
- [Cofein admin](https://seatmap-admin-eight.vercel.app/r/cofein/admin)
- [Frontend source branch](https://github.com/DISpace-Software/casa-di-fratelli/tree/feat/casa-production-voice-20261117)

The API release contains only the additive context policy and checks. The shared
admin was built from its existing released UI source plus dictation changes in
an isolated worktree. Unrelated changes in the original workspace were not
included or modified. Public restaurant websites were not deployed from the
feature branch; their existing admin redirects use the shared application.

## Verification

| Check | Observed result |
| --- | --- |
| Domain suite | 479 tests passed |
| Backend | Existing tenancy checks and 17 new policy/controller checks passed |
| Builds | Main frontend and shared admin passed |
| Local browser matrix | 45 cases: Casa, Cofein, future tenant; real Basic; Chrome/WebKit; map/list; portrait/landscape |
| Policy lifecycle | 7 cases; disabling a prepared model destroys its worker and preserves all manual values |
| Staged package | 3 compiled JS files and model manifest matched SHA256; WASM and 3 ONNX files had correct sizes/MIME |
| Production API | Casa/Cofein: expected policy, tenant and `no-store`; unknown tenant: 404 |
| Production routes | Both return the exact verified package HTML |
| Production Cofein | Real local ASR, 4/4 expected synthetic-WAV results across map/list; Basic tier |
| Production Casa | Existing authenticated Chrome session: exactly two microphones and preparation controls in both forms |

Cofein's first model preparation took 8.383 seconds on the test Mac/Chrome;
per-field recognition took 0.344–0.915 seconds. Only microphone capture was
synthetic: audio decoding, worker, WASM and model were real. Phone confirmation
and model reuse across map/list were verified. One login POST was permitted;
all other writes were blocked, and none were attempted. No reservations were
saved, no audio was uploaded and no JavaScript errors occurred. Screenshots
include only the unsaved test form. Casa was inspected without recording or
preparing a model.

**Physical iPad microphone, speed and restaurant noise remain untested.** The
initial static assets total about 86 MB; preparation is explicit and browser
caching is best effort. Device support and memory are checked at runtime, and
manual entry remains available. A correctly formatted phone can still contain
a recognition error, so administrators must review it.

Local evidence is under `output/shared-reservation-dictation-20261118/` in the
original workspace: `browser-basic/report.json`, `browser-policy/report.json`,
`production-real-asr/report.json`, `stage-static-verification.json`,
`production-route-verification.json`, `admin-package.json`, and
`render-deploy.json`. The additional live API report is
`output/casa-production-voice-20261117/platform-live-api-20261118.json`.
Disposable local API/Vite processes and databases were cleaned up.

## Recovery and future restaurants

New restaurants use the same shared admin route and context contract; no voice
allowlist, paid plan or per-restaurant frontend build flag is needed. See
[shared administration](shared-admin.md) and [on-device implementation](reservation-dictation-ondevice.md).

For a platform-wide rollback, set API configuration
`ReservationDictation__Enabled=false` and restart/redeploy the API. The admin
revalidates on load or visible-tab focus, stops local dictation and preserves
manual input. The previous shared admin deployment was
`dpl_3qQeZG6GH43hddEmBMoHTcrtzhvs`; it can be promoted if the entire frontend
release must be reverted. Neither recovery action was performed for this release.
