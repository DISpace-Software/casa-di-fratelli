from __future__ import annotations

import asyncio
import io
import threading
import wave
from concurrent.futures import ThreadPoolExecutor
from types import SimpleNamespace

import httpx
import av
import numpy as np
import pytest
from fastapi.testclient import TestClient

import worker

TOKEN = "unit-test-only-service-token-000000000000"
HEADERS = {"Authorization": f"Bearer {TOKEN}"}


def wav(seconds=0.1, rate=16000, channels=1):
    target = io.BytesIO()
    with wave.open(target, "wb") as audio:
        audio.setnchannels(channels)
        audio.setsampwidth(2)
        audio.setframerate(rate)
        audio.writeframes(b"\x00\x00" * int(seconds * rate) * channels)
    return target.getvalue()


def compressed_audio(format_name, codec, seconds=0.1):
    target = io.BytesIO()
    with av.open(target, "w", format=format_name) as container:
        stream = container.add_stream(codec, rate=48000)
        stream.layout = "mono"
        frame = av.AudioFrame.from_ndarray(np.zeros((1, int(seconds * 48000)), dtype=np.float32), format="flt", layout="mono")
        frame.sample_rate = 48000
        for packet in stream.encode(frame):
            container.mux(packet)
        for packet in stream.encode(None):
            container.mux(packet)
    return target.getvalue()


class StubTranscriber:
    def __init__(self, text="Георги Иванов"):
        self.text = text
        self.calls = []

    def transcribe(self, audio, language, field):
        self.calls.append((audio.shape, audio.dtype, language, field))
        return self.text


@pytest.fixture
def model():
    return StubTranscriber()


@pytest.fixture
def client(model):
    with TestClient(worker.create_app(worker.Settings(token=TOKEN), model)) as active:
        yield active


def post(client, audio=None, language="bg", field="guestName", headers=None):
    return client.post(
        "/v1/audio/transcriptions",
        headers=HEADERS if headers is None else headers,
        files={"file": ("recording.wav", wav() if audio is None else audio, "audio/wav")},
        data={"language": language, "field": field},
    )


def test_import_and_stub_startup_do_not_load_or_download_model(monkeypatch):
    def forbidden(*args, **kwargs):
        raise AssertionError("unit tests must not load a real model")

    monkeypatch.setattr(worker, "WhisperTranscriber", forbidden)
    with TestClient(worker.create_app(worker.Settings(token=TOKEN), StubTranscriber())) as client:
        assert client.get("/health").json() == {"status": "ok"}
        assert post(client).status_code == 200


def test_startup_requires_private_service_secret():
    with pytest.raises(RuntimeError, match="RESERVATION_SPEECH_TOKEN"):
        with TestClient(worker.create_app(worker.Settings(token=""), StubTranscriber())):
            pass


def test_shallow_health_and_no_browser_docs(client, model):
    assert client.get("/health").status_code == 200
    assert client.get("/docs").status_code == 404
    assert client.get("/openapi.json").status_code == 404
    assert not model.calls


@pytest.mark.parametrize("headers", [{}, {"Authorization": "Bearer wrong"}, {"Authorization": f"Basic {TOKEN}"}])
def test_authentication_precedes_audio_decoding(client, model, headers):
    response = post(client, b"not audio", headers=headers)
    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"
    assert not model.calls


def test_bearer_comparison_uses_constant_time_primitive(client, monkeypatch):
    calls = []
    compare = worker.hmac.compare_digest

    def measured(a, b):
        calls.append((isinstance(a, bytes), isinstance(b, bytes)))
        return compare(a, b)

    monkeypatch.setattr(worker.hmac, "compare_digest", measured)
    assert post(client).status_code == 200
    assert calls == [(True, True)]


@pytest.mark.parametrize("language,field", [("bg", "phone"), ("ru", "reservedDate"), ("en", "email")])
def test_contract_passes_language_and_field_and_returns_only_text(client, model, language, field):
    response = post(client, language=language, field=field)
    assert response.status_code == 200
    assert response.json() == {"text": "Георги Иванов"}
    assert response.headers["cache-control"] == "no-store"
    shape, dtype, seen_language, seen_field = model.calls[0]
    assert shape == (1600,)
    assert dtype == np.float32
    assert seen_language.value == language
    assert seen_field.value == field


@pytest.mark.parametrize("language,field", [("bg-BG", "phone"), ("de", "phone"), ("bg", "tableIds")])
def test_unknown_metadata_is_rejected_without_inference(client, model, language, field):
    response = post(client, language=language, field=field)
    assert response.status_code == 422
    assert not model.calls


def test_duplicate_metadata_or_files_cannot_override_a_field(client, model):
    response = client.post(
        "/v1/audio/transcriptions", headers=HEADERS,
        files=[("file", ("a.wav", wav())), ("file", ("b.wav", wav()))],
        data={"language": "bg", "field": "phone"},
    )
    assert response.status_code == 400
    assert not model.calls
    duplicate_language = client.post(
        "/v1/audio/transcriptions", headers=HEADERS,
        files=[("file", ("a.wav", wav())), ("language", (None, "bg")), ("language", (None, "ru")), ("field", (None, "phone"))],
    )
    assert duplicate_language.status_code == 400
    assert not model.calls


def test_file_limit_is_checked_even_when_request_overhead_is_small(client, model):
    response = post(client, b"\x00" * (worker.MAX_AUDIO_BYTES + 1))
    assert response.status_code == 413
    assert not model.calls


def test_chunked_request_cannot_bypass_total_limit_with_false_content_length(client, model):
    payload = httpx.Request(
        "POST", "http://test/v1/audio/transcriptions",
        files={"file": ("x.wav", b"x" * (worker.MAX_REQUEST_BYTES + 1))},
        data={"language": "bg", "field": "phone"},
    )
    body = payload.read()
    headers = {**HEADERS, "Content-Type": payload.headers["content-type"], "Content-Length": "0"}
    response = client.post("/v1/audio/transcriptions", headers=headers, content=iter([body[:1000], body[1000:]]))
    assert response.status_code == 413
    assert not model.calls


def test_upload_spool_never_rolls_to_disk(client, monkeypatch):
    rolled = []
    close = worker.UploadFile.close

    async def inspect_close(upload):
        rolled.append(upload.file._rolled)
        await close(upload)

    monkeypatch.setattr(worker.UploadFile, "close", inspect_close)
    # Larger than Starlette's normal 1 MiB disk-spooling threshold.
    response = post(client, wav(seconds=4, rate=96000, channels=2))
    assert response.status_code == 200
    assert rolled == [False]


def test_actual_decoded_duration_is_limited_before_model(client, model):
    response = post(client, wav(seconds=21.01))
    assert response.status_code == 413
    assert response.json() == {"detail": "audio_too_long"}
    assert not model.calls


def test_exact_duration_limit_and_stereo_resampling(client, model):
    assert post(client, wav(seconds=20)).status_code == 200
    assert model.calls[-1][0] == (320000,)
    assert post(client, wav(seconds=21)).status_code == 200
    assert model.calls[-1][0] == (336000,)
    assert post(client, wav(seconds=0.1, rate=44100, channels=2)).status_code == 200
    assert model.calls[-1][0] == (1600,)


@pytest.mark.parametrize("format_name,codec", [("webm", "libopus"), ("ogg", "libopus"), ("mp4", "aac")])
def test_browser_recorder_containers_decode_without_external_ffmpeg(client, model, format_name, codec):
    response = post(client, compressed_audio(format_name, codec))
    assert response.status_code == 200
    assert 0 < model.calls[-1][0][0] < worker.MAX_SAMPLES


def test_small_compressed_file_cannot_hide_over_limit_duration(client, model):
    data = compressed_audio("ogg", "libopus", seconds=22)
    assert len(data) < 50_000
    assert post(client, data).status_code == 413
    assert not model.calls


def test_twenty_second_aac_capture_with_encoder_padding_is_accepted(client, model):
    data = compressed_audio("mp4", "aac", seconds=20)
    assert post(client, data).status_code == 200
    assert 320000 <= model.calls[-1][0][0] <= worker.MAX_SAMPLES


@pytest.mark.parametrize("audio", [b"", b"hello.wav", b"RIFFxxxxWAVEcorrupt", b"#EXTM3U\nhttp://example.test/audio"])
def test_empty_corrupt_or_playlist_upload_is_rejected(client, model, audio):
    assert post(client, audio).status_code == 422
    assert not model.calls


def test_empty_transcript_does_not_invent_text(client, model):
    model.text = "  "
    response = post(client)
    assert response.status_code == 422
    assert response.json() == {"detail": "no_speech"}


def test_model_failures_expose_no_text_or_audio_and_release_slot(client, model, monkeypatch, caplog):
    private = "private guest text must not be logged"

    def fail(*args):
        raise RuntimeError(private)

    monkeypatch.setattr(model, "transcribe", fail)
    response = post(client)
    assert response.status_code == 500
    assert private not in response.text
    assert private not in caplog.text
    monkeypatch.setattr(model, "transcribe", lambda *args: "Георги Иванов")
    assert post(client).status_code == 200


def test_only_one_inference_runs_and_busy_request_does_not_queue():
    entered, finish = threading.Event(), threading.Event()

    class BlockingModel:
        def transcribe(self, *args):
            entered.set()
            assert finish.wait(5)
            return "трима"

    with TestClient(worker.create_app(worker.Settings(token=TOKEN), BlockingModel())) as client:
        with ThreadPoolExecutor(max_workers=1) as executor:
            first = executor.submit(post, client)
            try:
                assert entered.wait(5)
                busy = post(client)
                assert busy.status_code == 429
                assert busy.headers["retry-after"] == "2"
                assert client.get("/health").status_code == 200
            finally:
                finish.set()
            assert first.result(timeout=5).status_code == 200
        assert post(client).status_code == 200


def test_real_adapter_consumes_lazy_segments_with_fixed_language_and_no_contact_prompt():
    calls = []
    consumed = []

    def transcribe(audio, **options):
        calls.append(options)

        def segments():
            consumed.append(True)
            yield SimpleNamespace(text=" Георги ")
            yield SimpleNamespace(text=" Иванов ")

        return segments(), None

    adapter = worker.WhisperTranscriber.__new__(worker.WhisperTranscriber)
    adapter.model = SimpleNamespace(transcribe=transcribe)
    adapter.beam_size = 1
    result = adapter.transcribe(np.zeros(1600, dtype=np.float32), worker.Language.BG, worker.Field.NAME)
    assert result == "Георги Иванов"
    assert consumed == [True]
    assert calls[0]["language"] == "bg"
    assert calls[0]["beam_size"] == 1
    assert calls[0]["task"] == "transcribe"
    assert calls[0]["vad_filter"] is True
    assert calls[0]["condition_on_previous_text"] is False
    assert "initial_prompt" not in calls[0]
    assert "hotwords" not in calls[0]


def test_cancelled_http_request_keeps_slot_until_native_inference_finishes():
    entered, finish, exited = threading.Event(), threading.Event(), threading.Event()

    class BlockingModel:
        def transcribe(self, *args):
            entered.set()
            try:
                assert finish.wait(5)
                return "трима"
            finally:
                exited.set()

    async def scenario():
        app = worker.create_app(worker.Settings(token=TOKEN), BlockingModel())
        async with app.router.lifespan_context(app):
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://worker") as client:
                async def request():
                    return await client.post("/v1/audio/transcriptions", headers=HEADERS,
                                             files={"file": ("a.wav", wav())}, data={"language": "bg", "field": "guestCount"})

                first = asyncio.create_task(request())
                try:
                    for _ in range(200):
                        if entered.is_set():
                            break
                        await asyncio.sleep(0.01)
                    assert entered.is_set()
                    first.cancel()
                    with pytest.raises(asyncio.CancelledError):
                        await first
                    assert (await request()).status_code == 429
                    finish.set()
                    for _ in range(200):
                        if exited.is_set():
                            break
                        await asyncio.sleep(0.01)
                    assert exited.is_set()
                    assert (await request()).status_code == 200
                finally:
                    finish.set()

    asyncio.run(scenario())
