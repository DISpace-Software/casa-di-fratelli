# Local reservation dictation prototype — 2026-11-07

Current local-only branch: feat/reservation-field-voice-20261109 in /Users/macbookpro/casa-worktrees/reservation-field-voice-20261109, based on ff214af. Not pushed or deployed. The original /private/tmp/casa-admin-parity-20261104 source files were removed by temporary-directory cleanup on November 9; its running Vite process returned HTTP 404. The development server has been restarted on the same port from the permanent worktree. The original dirty workspace remains untouched. Production occupancy change is separate: commit 2052214, Vercel dpl_8zNxm4vD6Gsbi2Gg6fZ9svCAXfsb.

## Current interaction — individual fields, November 9

The map reservation form and list create form now have a small microphone beside each of six inputs: name, phone, date, time, guests and optional email. This replaces the large conversation widget in those forms. Press a field's microphone and say only its value; final recognized results immediately update that selected input. Bulgarian is the default for the Bulgarian interface, with Russian and English still selectable. Examples: name “Георги Иванов”, phone “0888 12 34 56”, date “следващата сряда”, time “десет”, guests “трима”, email “support at example dot com”.

There is one active recorder per form. Switching fields aborts the preceding session and ignores late events. Clicking the active microphone stops it while allowing the final speech result to arrive. Manual edits cancel dictation for that field. Complete results stop after a short pause; incomplete results have a longer pause allowance, with an overall 20-second cap. Interim text is visible but does not overwrite the input. Incomplete mobile-number fragments, unavailable times and unclear answers leave the current value intact and display a field-specific message. Failed sessions retain the recognized text so a user can see what was heard. Unsupported recognition, denied permission and service/network failures have visible feedback; ordinary typing remains available. Dictation never saves a reservation automatically.

Controls have 44-pixel touch targets with small SVG icons. Mobile date/time and guest/email rows stack to avoid covering native controls. The production build still excludes microphone controls and recognition code even with the preview flag set. The old conversation parser and regression corpus remain available as domain tests, but the new field flow does not require an entire dialogue to be interpreted.

Validation: 284 domain tests pass, including the original corpus plus 95 field-parser and 12 short-session tests. Targeted ESLint and the admin production build pass. Fifteen Chromium checks pass against the local API, covering map/list entry, all six fields, partial/final speech, switching, Stop flushing, manual edits, unavailable time, permission/network errors, unsupported recognition, unmount and 390-pixel layouts. No JavaScript errors or reservation mutations occurred. Speech events were simulated; real microphone recognition accuracy was not measured. Evidence: output/casa-field-voice-20261109/ in the original workspace. Browser script: scripts/check-reservation-field-voice-browser.mjs with the same four arguments as the earlier browser script.

## Original interaction — conversation prototype

One dictation for the whole booking. The microphone button is visible immediately in the map reservation modal and list create form. Final speech results automatically populate the draft name, phone, date, time and guest count; interim hypotheses only update the transcript preview. Transcript/manual review is in a secondary disclosure, with an explicit apply button for typed corrections. Bulgarian, Russian and English recognition language options. Missing fields leave existing values unchanged; list slot changes reset table selection. Applying a transcript never submits a booking or selects tables.

Recognition starts only after the user presses the button. The browser may send audio to its speech service; this is stated before recording. The application adds no audio upload endpoint or audio storage. Errors and unsupported recognition have a text/keyboard-dictation fallback. Continuous recognition preserves finalized text across pauses and browser restarts until Stop, form close or the 90-second limit. Stop flushes the final utterance and prevents restart. Closing the form aborts recognition; late speech results are ignored. No-speech pauses can resume, while permission and network errors stop without retry loops. Existing manual form edits survive subsequent speech when the parsed field value has not changed. Invalid values require correction, and times must be among the form's available slots. The existing form/API still validate the final booking.

Parsing is deliberately conservative and local: initial or labelled name, labelled or digit phone (including spoken digits and numeric groups), today/tomorrow/day-after-tomorrow in supported languages, ISO/numeric/named-month dates, numeric or spoken times (including explicit morning/evening), guest counts in digits or common number words. Explicit field labels can appear between unrelated conversation; a later explicit correction wins. Greetings, filler phrases and incidental numbers/plans are excluded by text context. This is not speaker separation or general natural-language understanding: another speaker stating booking-like facts cannot reliably be distinguished, and unusual or ambiguous phrases require manual correction. Phone numbers should be checked digit by digit. It does not auto-correct ambiguous contact details.

Example: Име Иван Петров. Телефон 0898123456. Дата утре. Час деветнадесет и тридесет. Шест души.

Russian: Имя Иван Петров. Телефон 0898123456. Дата завтра. Время девятнадцать тридцать. Шесть человек. Choose Русский in the speech language selector before dictating in Russian.

## Bulgarian emphasis — local update

Bulgarian (`bg-BG`) now has a separate normalization layer before the existing parser. Other language modes bypass that layer; 18 Russian/English phrases were compared against commit 9e4caa3 with identical fields, issues and missing values. The raw recognized transcript remains visible for review.

Supported Bulgarian forms include “на името на…”, “името ми е…”, “телефонът ми е…”, grouped spoken phone numbers with the leading zero retained, colloquial numbers such as “двайсет”/“трийсет”/“петнайсет”, collective guest counts such as “ще бъдем шестима”, ordinal dates such as “дванадесети ноември”, and times such as “седем и половина вечерта” (19:30) and “осем без четвърт вечерта” (19:45). Explicit adult/child counts can be added together. The guest limit remains 40.

Weekdays resolve to the next occurrence in Europe/Sofia, including today; an explicit “следващия/следващата” requires a future occurrence. A stated month/day without a year follows the existing current-year policy and does not silently roll into next year. Morning/evening is not inferred from restaurant hours. Unavailable slots still require correction in the form.

Context guards exclude unrelated phrases such as “Купих билети за двама”, “Отивам на кино тази вечер” and “Телефонът ми звъни”. This remains deterministic text extraction, not speaker identification or a change to the browser's speech recognition model. Actual microphone accuracy still requires a live Bulgarian trial.

Browser evidence: output/casa-voice-bulgarian-20261107/ (11 simulated-speech scenarios including all prior lifecycle checks, natural Bulgarian five-field map entry, phone fragments across restart, and RU/EN language selection). No reservations are saved by dictation, and fixture API records remained unchanged. This update is local only.

## Bulgarian conversations and table action order

The map table popup now orders its actions as create reservation, seat without reservation, then block the table for the day. The block/unblock control is separated at the bottom; the booking date remains above the reservation list. Both desktop and mobile layouts use this order.

Bulgarian dictation recognizes diminutives such as “телефонче”, “телефончето”, “номерче” and “номерчето”, question/answer exchanges such as “На чие име?” and “За колко часа?”, and pauses containing “секунда”, “изчакайте” or “ето го”. Explicit corrections are limited to the intended field so a corrected phone does not erase the preceding name. Unanswered questions do not invent a guest name. Alternatives such as “седем или осем” and “номер A или B” flag the relevant field for clarification. If an ambiguity arrives after a final speech fragment already populated a value, the form retracts that value only while it still matches the voice entry; a different manual edit is retained. These retractions are limited to Bulgarian dictation.

The regression corpus has 1000 unique synthetic text conversations: 300 complete bookings, 150 incremental conversations, 100 corrections, 150 unrelated/interrupted conversations, 100 invalid or ambiguous cases, 100 partial bookings and 100 calendar/value boundary cases. The incremental conversations also check 750 intermediate states. Expected fields, issues and missing values are declared independently of the parser. The fixture covers different field orders, names, phone formats, dates, spoken times and guest counts; it is not a measurement of live microphone accuracy or a guarantee for every possible conversation.

Run the corpus from the repository root with Node 22:

```sh
node scripts/check-bulgarian-voice-corpus.mjs /path/to/evidence-directory
```

This produces `corpus-report.json` and the full `corpus-scenarios.json`. Latest evidence is in the original workspace at output/casa-voice-1000-20261107/.

## Follow-up: uninterrupted administrator/customer dialogue

A real conversation example exposed a gap that the earlier generated corpus missed. On commit 38689bf, an uninterrupted exchange beginning with “на чие да е резервацията” extracted only the party size and flagged the phone; the name, weekday and time were missing. Repeated “окей”/“добре”, the phone prompt “само да слушам Ви”, and the answer “за 10:00” were not handled as question/answer boundaries.

The Bulgarian normalization now handles these prompt forms and spoken acknowledgements without requiring punctuation. A repeated party answer such as “трима трима човека” remains three guests. The original user text is checked locally with its exact digits preserved; committed regression cases use synthetic contacts. The map form is tested with both the entire conversation and separate final fragments across recognition pauses. For a future booking, 10:00 is an available admin slot. Latest follow-up evidence: output/casa-voice-natural-dialogue-20261107/.

Twenty-four independently written natural dialogues additionally cover acknowledgements between phone groups, phone readbacks, reordered questions, unanswered prompts, spoken dates/times, corrections and ambiguity. Short phone groups can continue across “да”/“добре”; repeating the complete number confirms it rather than doubling it. Adjacent guest counts, clocks and dates are not appended to the phone. All 24 cases pass alongside the original generated corpus.

## Running

Keep the disposable API fixture on 127.0.0.1:8878 and run the shared admin with Node 22:

VITE_API_BASE_URL=http://127.0.0.1:8878 VITE_RESERVATION_VOICE_PREVIEW=true npm --prefix frontend run dev:admin -- --host 127.0.0.1 --port 5178 --strictPort

The entry is http://127.0.0.1:5178/r/casa-di-fratelli/admin. A separate visible Chrome window is logged into the disposable fixture for human microphone testing. Credentials/state remain in /tmp/casa-voice-local-20261107.json (private local file, never commit). The fixture owner process is 12783; stop it after human testing. The held dev server and browser are intentionally left open for review.

Voice UI requires both Vite DEV and VITE_RESERVATION_VOICE_PREVIEW=true. A production build excludes it even if that flag is set.

## Evidence

177 frontend tests pass, including the 1000-conversation corpus, 24 independently written natural dialogues and focused Bulgarian regressions. All 1000 conversations and 750 intermediate states pass. Targeted ESLint passes. A production guard build excludes the voice UI even when VITE_RESERVATION_VOICE_PREVIEW=true. Browser test script: scripts/check-local-voice-browser.mjs <private-state.json> <output-directory> <playwright-module> <chromium-executable>.

All 18 Chromium checks pass using simulated speech events: desktop/mobile action ordering and keyboard navigation, five-field filling across pauses, unrelated/interim speech exclusion, manual edit preservation, corrections, Stop/error/timeout/unmount lifecycle behavior, diminutive question/answer exchanges, ambiguity prompts and progressive retraction, Russian/English regression cases, and the unpunctuated dialogue both as one final result and as 12 separate fragments. The local API confirms unchanged reservation records; no JavaScript errors were reported. Latest browser evidence: output/casa-voice-natural-dialogue-20261107/browser/report.json and screenshot 10.

Actual microphone recognition and recognition accuracy have NOT been verified automatically. Headed Chrome exposes SpeechRecognition and is ready for the user to try it. No microphone recording was started by the agent. Browser support and server-based recognition behavior: https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition .

Latest screenshots/reports: original workspace output/casa-voice-natural-dialogue-20261107/. Earlier evidence: output/casa-voice-1000-20261107/, output/casa-voice-bulgarian-20261107/, output/casa-voice-continued-20261107/ and output/casa-voice-20261107/. Occupancy real-browser evidence: output/casa-occupancy-20261107/browser.json (closing/reopening a 40-seat terrace, capacity 232 -> 192 -> 232, free seats 140 -> 100 -> 140 with 92 arrived guests).
