# Private reservation speech worker

Short field dictation for the admin reservation form, using the open-source
multilingual Whisper model through `faster-whisper`. This service returns a
transcript, not a reservation or an inferred contact. The frontend field parser
validates the text and the administrator reviews the value.

```text
Admin tablet → authenticated SeatMap.Api → private speech worker
                        ← { text }       ← decoded audio + Whisper
```

Only SeatMap.Api receives the worker URL and secret. Deploy the worker on a private
network accessible by that backend. Do not publish it as a browser endpoint or put
its token in a `VITE_` variable. There is no CORS allowance, public API documentation,
database connection, paid inference API or reservation write in this service.

## HTTP contract

`POST /v1/audio/transcriptions`, with `Authorization: Bearer <service token>` and
exactly three `multipart/form-data` parts:

| Part | Value |
| --- | --- |
| `file` | One WAV, M4A/MP4, WebM or Ogg audio recording |
| `language` | `bg`, `ru` or `en`; the backend normalizes locale strings |
| `field` | `guestName`, `phone`, `reservedDate`, `reservedTime`, `guestCount` or `email` |

Success: `200 {"text":"Георги Иванов"}`, with `Cache-Control: no-store`.
Missing/wrong token: `401`; malformed multipart: `400`; size/duration limit: `413`;
invalid metadata/audio or no speech: `422`; occupied slot: `429` with
`Retry-After: 2`; not ready: `503`. Model errors return a generic `500` without
decoder/model diagnostics. Empty speech does not receive invented fallback text.

`GET /health` is a shallow readiness check: `200 {"status":"ok"}` after model load,
otherwise `503 {"status":"not_ready"}`. It performs no inference. A startup model
failure prevents the server from accepting traffic.

Limits are 5 MiB per file, 5 MiB + 16 KiB for the entire request, and 21 seconds of
actual decoded audio, including silence. The form records at most 20 seconds; the
worker allows one extra second for AAC/Opus frame padding. It does not clip the
recording or transcribe longer files. Metadata duration is not trusted. Decode
stops on the first over-limit frame, before inference. Multipart files stay in RAM
and close after each request; uploads, filenames and transcripts are not logged or
persisted. Only model weights are cached on disk. Multipart field count and size
are bounded, including requests without a truthful `Content-Length`.

One request at a time covers upload, decoding and inference; there is no waiting
queue. Keep **one Uvicorn worker** and one replica for a single model slot. Increase
replicas only with an explicit resource/routing plan. Cancelling a backend request
does not interrupt CTranslate2 mid-inference; the slot remains occupied until that
inference finishes. The backend should use a timeout and offer a clear retry.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `RESERVATION_SPEECH_TOKEN` | required | Random service secret, at least 32 bytes; identical on backend and worker |
| `WHISPER_MODEL` | `small` | Multilingual model name or local converted model directory; do not use an English-only `.en` model for Bulgarian |
| `WHISPER_DEVICE` | `cpu` | `cpu`, `cuda` or `auto` |
| `WHISPER_COMPUTE_TYPE` | `int8` | CTranslate2 compute type compatible with the chosen device |
| `WHISPER_CPU_THREADS` | `4` | CPU inference threads, 1–32 |
| `WHISPER_BEAM_SIZE` | `5` | Beam search width, 1–5; lower values trade search quality for decoding speed |
| `WHISPER_DOWNLOAD_ROOT` | library default | Optional model download/cache directory |
| `WHISPER_LOCAL_FILES_ONLY` | `false` | `true` requires model files already present; disables model download |

Model loading happens once during lifespan startup, never during import or per
request. A named model is downloaded at first startup unless local-only mode is
enabled. This requires network access to the model host and enough startup time.
The Docker build installs libraries but **does not download model weights**.
CPU `small`/`int8` is the initial baseline; Bulgarian recognition quality and tablet
round-trip latency must be measured with real recordings before deployment.

## Local run and tests

Python 3.9–3.11 works with the pinned dependency set; Docker uses Python 3.11.

```sh
cd speech-service
python3 -m venv .venv
.venv/bin/pip install -r requirements-test.txt
.venv/bin/python -m pytest -q
```

Tests inject a stub model and use generated WAV, WebM/Opus, Ogg/Opus and MP4/AAC audio. They do not download weights
or call a transcription provider. Tests cover authentication, bounded in-memory
uploads, actual decoded duration, resampling, invalid recordings, silence, language
and field metadata, private errors and single-slot concurrency.

For an actual local run, inject the service token through your environment/secret
manager and choose a downloaded model or allow first-start download:

```sh
.venv/bin/uvicorn worker:app --host 127.0.0.1 --port 8000 --workers 1 --no-access-log
```

For a private CPU container:

```sh
docker build -t seatmap-speech ./speech-service
docker run --rm --network seatmap-private --name seatmap-speech \
  --env RESERVATION_SPEECH_TOKEN --mount source=seatmap-speech-models,target=/models \
  seatmap-speech
```

Provision the private Docker network/volume in the deployment environment. This
example intentionally publishes no public port. Inject secrets at runtime; never
bake them into the image. The supplied slim image is for CPU use.

An optional `Dockerfile.cuda` uses the NVIDIA CUDA 12.3.2/cuDNN 9 runtime recommended
by faster-whisper and defaults to `cuda`/`float16`. Build it with
`docker build -f speech-service/Dockerfile.cuda -t seatmap-speech-cuda speech-service`
and add `--gpus all` when running on a compatible Linux NVIDIA host with NVIDIA
Container Toolkit. This GPU recipe has not been built or GPU-tested locally; verify
driver compatibility, memory and real recordings before using it for traffic.

Implementation references: [faster-whisper official usage and model loading](https://github.com/SYSTRAN/faster-whisper),
[audio decoding implementation](https://github.com/SYSTRAN/faster-whisper/blob/master/faster_whisper/audio.py),
[FastAPI lifespan](https://fastapi.tiangolo.com/advanced/events/), and
[Starlette multipart parser](https://github.com/encode/starlette/blob/0.49.3/starlette/formparsers.py).

## Render candidate (not deployed)

`Dockerfile.render` builds the locally evaluated turbo revision into a CPU image,
verifies the model binary SHA-256, and enables offline loading at runtime. Build:

```sh
docker build -f speech-service/Dockerfile.render -t seatmap-speech-render speech-service
```

`render.yaml` describes one Ohio private service with manual deployments and no
persistent disk. Its 4 CPU / 8 GB plan is a paid benchmark candidate, not an approved
production plan. See the [Render deployment assessment](../docs/reservation-dictation-render.md)
for cost, private HTTP configuration, current validation limits and release criteria.
The Docker image has not been built locally; the feature branch is not yet on GitHub.
