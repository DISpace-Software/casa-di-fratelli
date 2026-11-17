---
language: bg
license: apache-2.0
library_name: sherpa-onnx
pipeline_tag: automatic-speech-recognition
tags:
  - automatic-speech-recognition
  - bulgarian
  - zipformer
  - transducer
  - icefall
  - k2
  - onnx
  - sherpa-onnx
metrics:
  - wer
model-index:
  - name: bulgarian-asr-zipformer (GP-v3)
    results:
      - task:
          type: automatic-speech-recognition
          name: Automatic Speech Recognition
        dataset:
          type: bg_parliament
          name: Bulgarian Parliament (frozen held-out sessions)
        metrics:
          - type: wer
            value: 3.93
            name: Test WER
---

# Bulgarian ASR — Zipformer transducer (offline)

A 65.5M-parameter Zipformer transducer trained from scratch on **2,222 hours** of
Bulgarian speech across twelve registers. On a frozen test set of unseen sessions it
reaches **3.93% WER**, against **15.37%** for Whisper large-v3 scored on the same audio
through the same text normaliser.

Exported to ONNX (fp32 and dynamic int8) and runnable on CPU with
[sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx). The int8 encoder is 73 MB and
decodes far faster than real time on a desktop CPU.

A streaming version is at
[preslaff/bulgarian-asr-zipformer-streaming](https://huggingface.co/preslaff/bulgarian-asr-zipformer-streaming).

## Results

| Test set | This model | Whisper large-v3 (zero-shot) |
|---|---|---|
| Parliament, held-out sessions | **3.93** | 15.37 |
| Parliament dev | 3.76 | — |
| Parliament dev, simulated G.711a phone line | 3.94 | — |
| FLEURS (bg) | 9.05 | 11.97 † |
| Common Voice (bg) | 7.93 | 15.42 † |

Decoded with `modified_beam_search`, beam 4, no external language model. The
parliament row is the only clean comparison — see the caveats below before quoting
the other two.

Error decomposition on the test set (123,605 words): 4,860 errors = 1,301 insertions,
1,450 deletions, 2,109 substitutions.

## Usage

```python
import sherpa_onnx, soundfile as sf

recognizer = sherpa_onnx.OfflineRecognizer.from_transducer(
    encoder="encoder-epoch-40-avg-8.int8.onnx",
    decoder="decoder-epoch-40-avg-8.int8.onnx",
    joiner="joiner-epoch-40-avg-8.int8.onnx",
    tokens="tokens.txt",
    num_threads=4,
    decoding_method="greedy_search",
)

wav, sr = sf.read("audio.wav", dtype="float32")   # 16 kHz mono
stream = recognizer.create_stream()
stream.accept_waveform(sr, wav)
recognizer.decode_stream(stream)
print(stream.result.text)
```

Audio must be 16 kHz mono. Swap the `.int8.onnx` files for the `.onnx` ones for fp32;
int8 costs about 0.03 WER and is what you want on CPU.

## Files

| File | What |
|---|---|
| `encoder-epoch-40-avg-8.int8.onnx` | encoder, dynamic int8 (73 MB) |
| `encoder-epoch-40-avg-8.onnx` | encoder, fp32 (263 MB) |
| `decoder-…`, `joiner-…` | decoder and joiner, both precisions |
| `tokens.txt` | BPE-500 token table |
| `bpe.model` | SentencePiece model, for training or re-export |

## Training

Zipformer transducer (pruned), non-causal, 65,549,011 parameters. 80-dim fbank at
16 kHz, BPE-500. Trained fp16 with ScaledAdam + Eden for 40 epochs, `--max-duration 350`,
with MUSAN CutMix and a feature-domain band-limiting augmentation for telephone audio.
Decoding checkpoint is epoch 40 averaged over the last 8.

The 2,222-hour corpus was assembled from parliamentary recordings, a national radio
archive, lecture, news and podcast video, audiobooks, FLEURS and Common Voice, labelled
by two-teacher weak supervision requiring agreement between Whisper and a second
teacher model. **The audio itself is not redistributable and is not published here.**

## Caveats — read before quoting the FLEURS and Common Voice numbers

- **Those two sets are not out-of-domain for this model.** Their *train* splits were
  folded into training, so 9.05 and 7.93 measure held-out-split, in-corpus
  performance. That is domain adaptation, not generalization.
- † **The Whisper comparison on those rows no longer holds exposure constant.**
  Whisper is zero-shot there while this model was adapted. Only the parliament row
  is a like-for-like comparison.
- Leakage was checked: zero cut-id, recording-id and sentence-text overlap between the
  train and test splits of both corpora. One residual cannot be closed — FLEURS splits
  are sentence-level and publish no speaker ids, so the same voices may appear in both.
- int8 numbers were measured on a CPU with AVX-512 VNNI, and the export does not set
  reduced-range quantization, so re-measure on a non-VNNI machine before trusting them.

A fuller write-up, including the evaluation that redirected the project and the
ablation that retired an external n-gram, is at **https://asr.cdsv.dev**.

## Credits

Built with [k2 / icefall](https://github.com/k2-fsa/icefall) and served with
[sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx). Training data includes
[FLEURS](https://huggingface.co/datasets/google/fleurs) (CC-BY-4.0) and
[Common Voice](https://commonvoice.mozilla.org/) (CC0); augmentation uses
[MUSAN](https://www.openslr.org/17/) (CC-BY-4.0).

Model by Preslav Penev · [cdsv.dev](https://cdsv.dev) · Apache-2.0.
