"""Private, bounded single-field ASR worker. No reservation data is persisted."""

from __future__ import annotations

import asyncio
import hmac
import io
import logging
import os
import threading
from contextlib import asynccontextmanager
from dataclasses import dataclass
from enum import Enum
from typing import Optional

import av
import numpy as np
from fastapi import FastAPI, HTTPException, Request
from python_multipart.exceptions import MultipartParseError
from python_multipart.multipart import parse_options_header
from starlette.concurrency import run_in_threadpool
from starlette.datastructures import UploadFile
from starlette.formparsers import MultiPartException, MultiPartParser
from starlette.responses import JSONResponse

MAX_AUDIO_BYTES = 5 * 1024 * 1024
MAX_REQUEST_BYTES = MAX_AUDIO_BYTES + 16 * 1024
# The UI records at most 20 seconds. AAC/Opus encoders add frame padding;
# keep a bounded one-second container/decode allowance without clipping speech.
MAX_SECONDS = 21
SAMPLE_RATE = 16000
MAX_SAMPLES = MAX_SECONDS * SAMPLE_RATE
MAX_TEXT_LENGTH = 2000


class Language(str, Enum):
    BG = "bg"
    RU = "ru"
    EN = "en"


class Field(str, Enum):
    NAME = "guestName"
    PHONE = "phone"
    DATE = "reservedDate"
    TIME = "reservedTime"
    GUESTS = "guestCount"
    EMAIL = "email"


class AudioError(Exception):
    def __init__(self, code: str, status: int = 422):
        self.code = code
        self.status = status
        super().__init__(code)


@dataclass(frozen=True)
class Settings:
    token: str
    model: str = "small"
    device: str = "cpu"
    compute_type: str = "int8"
    cpu_threads: int = 4
    beam_size: int = 5
    download_root: Optional[str] = None
    local_files_only: bool = False

    @classmethod
    def from_env(cls) -> Settings:
        return cls(
            token=os.environ.get("RESERVATION_SPEECH_TOKEN", ""),
            model=os.environ.get("WHISPER_MODEL", "small"),
            device=os.environ.get("WHISPER_DEVICE", "cpu"),
            compute_type=os.environ.get("WHISPER_COMPUTE_TYPE", "int8"),
            cpu_threads=int(os.environ.get("WHISPER_CPU_THREADS", "4")),
            beam_size=int(os.environ.get("WHISPER_BEAM_SIZE", "5")),
            download_root=os.environ.get("WHISPER_DOWNLOAD_ROOT") or None,
            local_files_only=os.environ.get("WHISPER_LOCAL_FILES_ONLY", "false").lower() == "true",
        )

    def validate(self) -> None:
        if len(self.token.encode("utf-8")) < 32 or self.token != self.token.strip():
            raise RuntimeError("RESERVATION_SPEECH_TOKEN must contain at least 32 bytes without edge whitespace")
        if not 1 <= self.cpu_threads <= 32:
            raise RuntimeError("WHISPER_CPU_THREADS must be between 1 and 32")
        if not 1 <= self.beam_size <= 5:
            raise RuntimeError("WHISPER_BEAM_SIZE must be between 1 and 5")
        if self.device not in {"cpu", "cuda", "auto"}:
            raise RuntimeError("Unsupported WHISPER_DEVICE")


def audio_format(data: bytes) -> str:
    """Limit demuxers to recorder formats; never open a playlist or a URL."""
    if len(data) >= 12:
        if data[:4] == b"RIFF" and data[8:12] == b"WAVE":
            return "wav"
        if data[4:8] == b"ftyp":
            return "mov"
        if data[:4] == b"\x1aE\xdf\xa3":
            return "matroska"
        if data[:4] == b"OggS":
            return "ogg"
    raise AudioError("invalid_audio")


def decode_bounded(data: bytes) -> np.ndarray:
    """Count actual decoded samples, including silence, before VAD/inference.

    Container duration metadata is not trusted. Stop at the first frame over
    the duration cap instead of decoding an arbitrarily long compressed file.
    """
    if not data or len(data) > MAX_AUDIO_BYTES:
        raise AudioError("audio_too_large" if data else "invalid_audio", 413 if data else 422)
    format_name = audio_format(data)
    av.logging.set_level(av.logging.PANIC)
    resampler = av.AudioResampler(format="s16", layout="mono", rate=SAMPLE_RATE)
    pieces = []
    sample_count = 0
    decoded_seconds = 0.0

    def append(frames):
        nonlocal sample_count
        for frame in frames:
            sample_count += frame.samples
            if sample_count > MAX_SAMPLES:
                raise AudioError("audio_too_long", 413)
            pieces.append(frame.to_ndarray().reshape(-1))

    try:
        with av.open(io.BytesIO(data), mode="r", format=format_name) as container:
            if not container.streams.audio:
                raise AudioError("invalid_audio")
            for frame in container.decode(audio=0):
                if not frame.sample_rate:
                    raise AudioError("invalid_audio")
                decoded_seconds += frame.samples / frame.sample_rate
                if decoded_seconds > MAX_SECONDS + 1e-9:
                    raise AudioError("audio_too_long", 413)
                frame.pts = None
                append(resampler.resample(frame))
            append(resampler.resample(None))
    except AudioError:
        raise
    except (av.error.FFmpegError, ValueError, EOFError):
        raise AudioError("invalid_audio") from None
    if not sample_count:
        raise AudioError("invalid_audio")
    return np.concatenate(pieces).astype(np.float32) / 32768.0


class WhisperTranscriber:
    def __init__(self, settings: Settings):
        # Import/load only during lifespan startup. Unit tests inject a stub and
        # never import the model or contact the model download service.
        from faster_whisper import WhisperModel

        self.beam_size = settings.beam_size
        logging.getLogger("faster_whisper").setLevel(logging.CRITICAL)
        self.model = WhisperModel(
            settings.model,
            device=settings.device,
            compute_type=settings.compute_type,
            cpu_threads=settings.cpu_threads,
            num_workers=1,
            download_root=settings.download_root,
            local_files_only=settings.local_files_only,
        )

    def transcribe(self, audio: np.ndarray, language: Language, field: Field) -> str:
        # The field is validated but does not seed names, numbers or addresses.
        # A guessed contact in an initial prompt could contaminate the result.
        segments, _ = self.model.transcribe(
            audio,
            language=language.value,
            task="transcribe",
            beam_size=self.beam_size,
            temperature=0.0,
            condition_on_previous_text=False,
            vad_filter=True,
            vad_parameters={"min_silence_duration_ms": 300},
            without_timestamps=True,
            max_new_tokens=256,
        )
        # Inference is lazy: consume the generator while the service slot is held.
        return " ".join(segment.text.strip() for segment in segments).strip()


class _BodyTooLarge(MultiPartException):
    pass


class _MemoryMultipartParser(MultiPartParser):
    # The stream has a smaller hard bound, so uploads never spill to disk.
    spool_max_size = MAX_REQUEST_BYTES + 1


async def read_form(request: Request):
    try:
        content_length = int(request.headers.get("content-length", "0"))
    except ValueError:
        raise HTTPException(400, "invalid_multipart") from None
    if content_length > MAX_REQUEST_BYTES:
        raise HTTPException(413, "audio_too_large")
    content_type, options = parse_options_header(request.headers.get("content-type", ""))
    boundary = options.get(b"boundary", b"")
    if content_type != b"multipart/form-data" or not 1 <= len(boundary) <= 128:
        raise HTTPException(400, "invalid_multipart")

    async def bounded_stream():
        count = 0
        async for chunk in request.stream():
            count += len(chunk)
            if count > MAX_REQUEST_BYTES:
                # Starlette closes partial uploads on MultiPartException.
                raise _BodyTooLarge("audio_too_large")
            yield chunk

    parser = _MemoryMultipartParser(request.headers, bounded_stream(), max_files=1, max_fields=2, max_part_size=128)
    try:
        return await parser.parse()
    except _BodyTooLarge:
        raise HTTPException(413, "audio_too_large") from None
    except (MultiPartException, MultipartParseError, ValueError):
        raise HTTPException(400, "invalid_multipart") from None


def create_app(settings: Optional[Settings] = None, transcriber=None) -> FastAPI:
    slot = threading.Lock()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        config = settings or Settings.from_env()
        config.validate()
        # Multipart/decoder diagnostic messages must not expose uploaded content.
        logging.getLogger("python_multipart").setLevel(logging.CRITICAL)
        logging.getLogger("multipart").setLevel(logging.CRITICAL)
        app.state.token = config.token.encode("utf-8")
        app.state.transcriber = transcriber or await run_in_threadpool(WhisperTranscriber, config)
        app.state.ready = True
        try:
            yield
        finally:
            app.state.ready = False
            app.state.transcriber = None
            app.state.token = b""

    app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)
    app.state.ready = False

    @app.get("/health")
    async def health():
        ready = app.state.ready
        return JSONResponse({"status": "ok" if ready else "not_ready"}, status_code=200 if ready else 503)

    @app.post("/v1/audio/transcriptions")
    async def transcribe(request: Request):
        if not app.state.ready:
            raise HTTPException(503, "not_ready")
        values = request.headers.getlist("authorization")
        scheme, _, supplied = values[0].partition(" ") if len(values) == 1 else ("", "", "")
        if scheme.lower() != "bearer" or not hmac.compare_digest(supplied.encode("utf-8"), app.state.token):
            raise HTTPException(401, "unauthorized", headers={"WWW-Authenticate": "Bearer"})
        # No unbounded inference/upload queue. The caller can retry explicitly.
        if not slot.acquire(blocking=False):
            raise HTTPException(429, "busy", headers={"Retry-After": "2"})
        form = None
        owns_slot = True
        try:
            form = await read_form(request)
            if sorted(key for key, _ in form.multi_items()) != ["field", "file", "language"]:
                raise HTTPException(400, "invalid_multipart")
            upload = form["file"]
            if not isinstance(upload, UploadFile):
                raise HTTPException(400, "invalid_audio")
            try:
                language = Language(form["language"])
                field = Field(form["field"])
            except (ValueError, TypeError):
                raise HTTPException(422, "invalid_field_or_language") from None
            data = await upload.read(MAX_AUDIO_BYTES + 1)
            model = app.state.transcriber

            def infer():
                try:
                    return model.transcribe(decode_bounded(data), language, field)
                finally:
                    # A disconnected/cancelled HTTP task cannot cancel native
                    # inference or release its slot while it is still running.
                    slot.release()

            inference = asyncio.get_running_loop().run_in_executor(None, infer)
            owns_slot = False
            # Consume a late exception even if the HTTP caller has gone away;
            # do not let asyncio print model diagnostics with private text.
            inference.add_done_callback(lambda done: done.exception() if not done.cancelled() else None)
            text = await asyncio.shield(inference)
            if not isinstance(text, str) or len(text) > MAX_TEXT_LENGTH:
                raise HTTPException(502, "invalid_transcription")
            text = text.strip()
            if not text:
                raise HTTPException(422, "no_speech")
            return JSONResponse({"text": text}, headers={"Cache-Control": "no-store"})
        except AudioError as error:
            raise HTTPException(error.status, error.code) from None
        except HTTPException:
            raise
        except Exception:
            # Never echo decoder/model diagnostics, a filename, audio or text.
            raise HTTPException(500, "transcription_failed") from None
        finally:
            try:
                if form is not None:
                    await form.close()
            finally:
                if owns_slot:
                    slot.release()

    return app


app = create_app()
