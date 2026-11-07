# Local reservation dictation prototype — 2026-11-07

Local-only branch: feat/local-reservation-voice-20261107 in /private/tmp/casa-admin-parity-20261104. Not pushed or deployed. Production occupancy change is separate: commit 2052214, Vercel dpl_8zNxm4vD6Gsbi2Gg6fZ9svCAXfsb.

## Interaction

One dictation for the whole booking, with a five-field review before applying name, phone, date, time and guest count. Available in the map reservation modal and list create form. Bulgarian, Russian and English recognition language options. Missing fields leave existing values unchanged; list slot changes reset table selection. Applying a transcript never submits a booking or selects tables.

Recognition starts only after the user presses the button. The browser may send audio to its speech service; this is stated before recording. The application adds no audio upload endpoint or audio storage. Errors and unsupported recognition have a text/keyboard-dictation fallback. Closing/collapsing the form aborts recognition; late speech results are ignored. Invalid values require correction, and times must be among the form's available slots. The existing form/API still validate the final booking.

Parsing is deliberately conservative and local: initial or labelled name, labelled or digit phone (including spoken single digits), today/tomorrow/day-after-tomorrow in supported languages, ISO/numeric/named-month dates and numeric times, guest counts in digits or common number words. It does not claim general natural-language understanding; unusual phrases and unrecognized dates/times require manual correction. Phone numbers should be checked digit by digit. It does not auto-correct ambiguous contact details.

Example: Иван Петров, телефон 0898123456, утре в 19:30, шест души.

## Running

Keep the disposable API fixture on 127.0.0.1:8878 and run the shared admin with Node 22:

VITE_API_BASE_URL=http://127.0.0.1:8878 VITE_RESERVATION_VOICE_PREVIEW=true npm --prefix frontend run dev:admin -- --host 127.0.0.1 --port 5178 --strictPort

The entry is http://127.0.0.1:5178/r/casa-di-fratelli/admin. A separate visible Chrome window is logged into the disposable fixture for human microphone testing. Credentials/state remain in /tmp/casa-voice-local-20261107.json (private local file, never commit). The fixture owner process is 12783; stop it after human testing. The held dev server and browser are intentionally left open for review.

Voice UI requires both Vite DEV and VITE_RESERVATION_VOICE_PREVIEW=true. A production build excludes it even if that flag is set.

## Evidence

120 frontend tests pass. Targeted ESLint passes. A production guard build excludes the voice UI. Real Chromium desktop/mobile tests pass for simulated recognition -> review -> actual form fields, no automatic booking writes, unmount abort, unsupported-browser fallback and invalid-value blocking. The real local API confirms unchanged booking data after voice apply. Four browser scenarios pass with no JavaScript errors. Test script: scripts/check-local-voice-browser.mjs <private-state.json> <output-directory> <playwright-module> <chromium-executable>.

Actual microphone recognition and recognition accuracy have NOT been verified automatically. Headed Chrome exposes SpeechRecognition and is ready for the user to try it. No microphone recording was started by the agent. Browser support and server-based recognition behavior: https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition .

Screenshots/reports: original workspace output/casa-voice-20261107/. Occupancy real-browser evidence: output/casa-occupancy-20261107/browser.json (closing/reopening a 40-seat terrace, capacity 232 -> 192 -> 232, free seats 140 -> 100 -> 140 with 92 arrived guests).
