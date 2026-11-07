# Local reservation dictation prototype — 2026-11-07

Local-only branch: feat/local-reservation-voice-20261107 in /private/tmp/casa-admin-parity-20261104. Not pushed or deployed. Production occupancy change is separate: commit 2052214, Vercel dpl_8zNxm4vD6Gsbi2Gg6fZ9svCAXfsb.

## Interaction

One dictation for the whole booking. The microphone button is visible immediately in the map reservation modal and list create form. Final speech results automatically populate the draft name, phone, date, time and guest count; interim hypotheses only update the transcript preview. Transcript/manual review is in a secondary disclosure, with an explicit apply button for typed corrections. Bulgarian, Russian and English recognition language options. Missing fields leave existing values unchanged; list slot changes reset table selection. Applying a transcript never submits a booking or selects tables.

Recognition starts only after the user presses the button. The browser may send audio to its speech service; this is stated before recording. The application adds no audio upload endpoint or audio storage. Errors and unsupported recognition have a text/keyboard-dictation fallback. Continuous recognition preserves finalized text across pauses and browser restarts until Stop, form close or the 90-second limit. Stop flushes the final utterance and prevents restart. Closing the form aborts recognition; late speech results are ignored. No-speech pauses can resume, while permission and network errors stop without retry loops. Existing manual form edits survive subsequent speech when the parsed field value has not changed. Invalid values require correction, and times must be among the form's available slots. The existing form/API still validate the final booking.

Parsing is deliberately conservative and local: initial or labelled name, labelled or digit phone (including spoken digits and numeric groups), today/tomorrow/day-after-tomorrow in supported languages, ISO/numeric/named-month dates, numeric or spoken times (including explicit morning/evening), guest counts in digits or common number words. Explicit field labels can appear between unrelated conversation; a later explicit correction wins. Greetings, filler phrases and incidental numbers/plans are excluded by text context. This is not speaker separation or general natural-language understanding: another speaker stating booking-like facts cannot reliably be distinguished, and unusual or ambiguous phrases require manual correction. Phone numbers should be checked digit by digit. It does not auto-correct ambiguous contact details.

Example: Име Иван Петров. Телефон 0898123456. Дата утре. Час деветнадесет и тридесет. Шест души.

Russian: Имя Иван Петров. Телефон 0898123456. Дата завтра. Время девятнадцать тридцать. Шесть человек. Choose Русский in the speech language selector before dictating in Russian.

## Running

Keep the disposable API fixture on 127.0.0.1:8878 and run the shared admin with Node 22:

VITE_API_BASE_URL=http://127.0.0.1:8878 VITE_RESERVATION_VOICE_PREVIEW=true npm --prefix frontend run dev:admin -- --host 127.0.0.1 --port 5178 --strictPort

The entry is http://127.0.0.1:5178/r/casa-di-fratelli/admin. A separate visible Chrome window is logged into the disposable fixture for human microphone testing. Credentials/state remain in /tmp/casa-voice-local-20261107.json (private local file, never commit). The fixture owner process is 12783; stop it after human testing. The held dev server and browser are intentionally left open for review.

Voice UI requires both Vite DEV and VITE_RESERVATION_VOICE_PREVIEW=true. A production build excludes it even if that flag is set.

## Evidence

125 frontend tests pass. Targeted ESLint passes. A production guard build excludes the voice UI even when VITE_RESERVATION_VOICE_PREVIEW=true. Eight real Chromium scenarios pass with simulated speech: desktop/mobile map buttons, final chunks -> actual five fields across pauses, interim/noise exclusion, manual edit preservation, corrected guest count after restarting, Stop/no-speech/permission/network handling, 90-second limit, unmount/late events, list fallback and invalid-value blocking. The real local API confirms unchanged booking data. No JavaScript errors were reported. Test script: scripts/check-local-voice-browser.mjs <private-state.json> <output-directory> <playwright-module> <chromium-executable>.

Actual microphone recognition and recognition accuracy have NOT been verified automatically. Headed Chrome exposes SpeechRecognition and is ready for the user to try it. No microphone recording was started by the agent. Browser support and server-based recognition behavior: https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition .

Latest screenshots/reports: original workspace output/casa-voice-continued-20261107/. Earlier prototype evidence: output/casa-voice-20261107/. Occupancy real-browser evidence: output/casa-occupancy-20261107/browser.json (closing/reopening a 40-seat terrace, capacity 232 -> 192 -> 232, free seats 140 -> 100 -> 140 with 92 arrived guests).
