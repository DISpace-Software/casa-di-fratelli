#!/usr/bin/env python3
"""Verify vendored local speech assets; --prepare reconstructs pinned binaries/JS.

Network is used only by this developer tool, never by recognition. --prepare
fetches public artifacts into a temporary/cache directory. No audio is involved.
"""
import argparse
import hashlib
import json
from pathlib import Path
import tarfile
import tempfile
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / 'frontend/public/speech/bg-zipformer/8d2f8f4-sherpa-1.12.36'
REVISION = '8d2f8f4f159918a27b33c430e4fa83b10c705c28'
MODEL = 'https://huggingface.co/preslaff/bulgarian-asr-zipformer/resolve/' + REVISION + '/'
ARCHIVE_NAME = 'sherpa-onnx-wasm-simd-1.12.36-vad-asr-en-zipformer_gigaspeech'
ARCHIVE_URL = 'https://github.com/k2-fsa/sherpa-onnx/releases/download/v1.12.36/' + ARCHIVE_NAME + '.tar.bz2'
ARCHIVE_SHA = '833cb4e3b729c96f256bec3594c149fb4f84f005dea70da5c40ce5ecbfd21350'
SOURCES = {
    'encoder-epoch-40-avg-8.int8.onnx': '60f331e122d6ed3b5845e151a608eee8e94bf12f0bd86130007b4a482221b7cc',
    'decoder-epoch-40-avg-8.int8.onnx': '6b5af659e54db0b1b42d046c8255ad9e7c0e13dc7a9eccd4a38e9eb9a4f69a85',
    'joiner-epoch-40-avg-8.int8.onnx': 'a9c0f45365455b236e67cf29e5a53231c035700a22551212f930f1ff2ea0c8ab',
    'tokens.txt': '863ff314c172148a74301a4579eda890e1c957ae797ffffafd295473d9f0f3f5',
}
RUNTIME_SOURCES = {
    'sherpa-onnx-wasm-main-vad-asr.js': 'db8e94221781a8793b9acaf1dedc5a5a2341ddd1ef59a8d85c9537a9ba802238',
    'sherpa-onnx-asr.js': 'd51ae8e8b756ee5e53423ffada0c9702973f154f561aca7984fe0b12f4060178',
    'sherpa-onnx-wasm-main-vad-asr.wasm': 'fdd6e54522cf5468c60346bcff27ac2a84785ff24ef0b8efe1b082d248cec2b2',
}


def checked(data, sha, name):
    if hashlib.sha256(data).hexdigest() != sha:
        raise ValueError('SHA256 mismatch: ' + name)
    return data


def fetch(url, cache, sha):
    path = cache / url.rsplit('/', 1)[-1]
    if not path.exists():
        with urllib.request.urlopen(url, timeout=90) as response:
            path.write_bytes(response.read())
    return checked(path.read_bytes(), sha, path.name)


def prepare(cache):
    cache.mkdir(parents=True, exist_ok=True)
    TARGET.mkdir(parents=True, exist_ok=True)
    for name, sha in SOURCES.items():
        (TARGET / name).write_bytes(fetch(MODEL + name, cache, sha))
    fetch(ARCHIVE_URL, cache, ARCHIVE_SHA)
    with tarfile.open(cache / (ARCHIVE_NAME + '.tar.bz2')) as archive:
        # Read only exact expected files; never extract arbitrary archive paths.
        runtime = {}
        for name, sha in RUNTIME_SOURCES.items():
            member = next(m for m in archive.getmembers() if m.name.lstrip('./') == ARCHIVE_NAME + '/' + name)
            runtime[name] = checked(archive.extractfile(member).read(), sha, name)
    source = runtime['sherpa-onnx-wasm-main-vad-asr.js'].decode()
    prefix, body = source.split('var moduleOverrides=', 1)
    if not prefix.startswith('var Module=typeof Module') or 'remote_package_size' not in prefix:
        raise ValueError('Unexpected upstream data preloader')
    (TARGET / 'sherpa-runtime.js').write_text('// Apache-2.0: sherpa-onnx v1.12.36. Bundled English data preloader removed; models supplied by host.\nvar Module=typeof Module!=="undefined"?Module:{};var moduleOverrides=' + body + '\nself.reservationSherpaFS=FS;\n')
    (TARGET / 'sherpa-asr.js').write_text('// Apache-2.0: sherpa-onnx v1.12.36. Export the upstream class for the isolated worker.\n' + runtime['sherpa-onnx-asr.js'].decode() + '\nself.ReservationSherpaOfflineRecognizer=OfflineRecognizer;\n')
    (TARGET / 'sherpa-runtime.wasm').write_bytes(runtime['sherpa-onnx-wasm-main-vad-asr.wasm'])


def verify():
    manifest = json.loads((TARGET / 'manifest.json').read_text())
    total = 0
    for item in manifest['files']:
        data = (TARGET / item['name']).read_bytes()
        checked(data, item['sha256'], item['name'])
        if len(data) != item['bytes']:
            raise ValueError('Length mismatch: ' + item['name'])
        total += len(data)
    print(json.dumps({'verifiedFiles': len(manifest['files']), 'bytes': total, 'modelRevision': REVISION}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--prepare', action='store_true')
    parser.add_argument('--cache', type=Path, default=Path(tempfile.gettempdir()) / 'reservation-speech-assets')
    args = parser.parse_args()
    if args.prepare:
        prepare(args.cache)
    verify()
