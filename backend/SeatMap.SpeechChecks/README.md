# Reservation speech API checks

Run from the repository root with the .NET 8 SDK:

```sh
dotnet build backend/SeatMap.SpeechChecks/SeatMap.SpeechChecks.csproj -p:UseAppHost=false
dotnet backend/SeatMap.SpeechChecks/bin/Debug/net8.0/SeatMap.SpeechChecks.dll
```

The current suite reports **82 focused checks**. It starts a temporary local HTTP
server and two separate SQLite databases in memory. It uses the real tenant
middleware and admin authorization filter, with synthetic administrator and
waiter sessions. It does not connect to production, write reservations, require a
worker secret, download a model or call a speech provider.

Checks cover authentication and permitted roles, cross-tenant isolation, disabled
and missing configuration, private worker URL rules, request/concurrency limits,
bounded multipart uploads, MIME/container signatures, normalized worker requests,
sanitized error responses, response-size limits and `no-store` results.
Private HTTP is off by default; its explicit exact-host configuration is checked
against IPs, public domain suffixes, wrong hosts, missing/default ports, credentials,
queries, fragments and paths that URI parsing would otherwise normalize away.

The worker HTTP handler is a **test double**. Its audio payloads and transcription
responses verify the protocol and failure handling, not decoding or recognition
accuracy. The timeout case injects cancellation rather than waiting 20 seconds.
These checks do not establish physical iPad microphone support, real model
latency, production networking, or how quickly CTranslate2 finishes after a
client disconnect. The worker has separate decoder tests in
[`speech-service`](../../speech-service/README.md); real audio and device checks
remain necessary before enabling dictation.

`GET /api/admin/reservations/voice/capabilities` reports that this tenant is
allowed and the worker configuration is present. It does **not** contact the
worker or guarantee model health/recognition availability. Runtime failures remain
explicit errors; there is no external-provider fallback.

The API deadline is 20 seconds for upload and transcription after authorization.
The UI separately limits capture to 20 seconds. The worker accepts up to 21
seconds of decoded audio to allow container padding; this is an audio-duration
limit, not an extra processing-time allowance. A cancelled API request does not
terminate an inference thread already running in the worker.

Audio goes only to the configured private service and remains in memory. The API
does not log or persist recordings/transcripts and does not expose the service
token to the browser. Deployment logging/proxies must preserve these properties.
