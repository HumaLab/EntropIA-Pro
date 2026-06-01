# Whisper Model Download

> Note: native ONNX/hybrid NER was removed. `resources/models/ner/` no longer
> contains NER model assets; it only retains the Windows `onnxruntime.dll` handoff
> used by other ONNX consumers until that DLL is relocated.

The transcription feature requires a Whisper model file in GGML format compatible with whisper.cpp v1.8+ (as used by whisper-rs-sys 0.15.0).

## Quick Start

The recommended approach is to use the conversion script to generate a model from a HuggingFace checkpoint:

```powershell
# From project root, generate ggml-base-v2.bin (F32, ~291MB)
python convert_whisper_ggmlv2.py openai/whisper-base apps/desktop/src-tauri/resources/models/ggml-base-v2.bin --f32

# Or generate F16 (~148MB, faster but slightly less accurate)
python convert_whisper_ggmlv2.py openai/whisper-base apps/desktop/src-tauri/resources/models/ggml-base-v2.bin

# Tiny model for faster testing (~75MB)
python convert_whisper_ggmlv2.py openai/whisper-tiny apps/desktop/src-tauri/resources/models/ggml-tiny.bin --f32
```

**IMPORTANT**: Do NOT use pre-converted models from `ggerganov/whisper.cpp` on HuggingFace. Those are GGML v1 format and will crash whisper.cpp v1.8+ with `GGML_ASSERT(wtype != GGML_TYPE_COUNT)`.

## Available Models

| Model | HuggingFace ID         | F32 Size | F16 Size | Languages          |
| ----- | ---------------------- | -------- | -------- | ------------------ |
| Tiny  | `openai/whisper-tiny`  | ~75MB    | ~40MB    | en or multilingual |
| Base  | `openai/whisper-base`  | ~291MB   | ~148MB   | Multilingual       |
| Small | `openai/whisper-small` | ~967MB   | ~488MB   | Multilingual       |

## Model Loading Order

The app tries models in this order (see `transcription/mod.rs`):

1. `ggml-base-v2.bin` — Primary (converted from HuggingFace)
2. `ggml-base.bin` — Fallback
3. `ggml-tiny.bin` — Last resort

## Configuration

- **Default language**: Spanish (`"es"`) in `WhisperConfig` (`transcription/mod.rs`)
- **Auto-detect**: Set `language` to `None`
- **Other languages**: Set to `"en"`, `"de"`, etc.

## GGML Format Details

The conversion script (`convert_whisper_ggmlv2.py`) produces files in the legacy GGML format that whisper.cpp v1.8.3 reads:

- Magic: 0x67676D6C ("ggml")
- No version field between magic and hparams (version is encoded in ftype field)
- hparams: n_vocab, n_audio_ctx, n_audio_state, etc.
- ftype: 0=F32, 1=F16 (no GGML_QNT_VERSION_FACTOR encoding needed)
- Mel filters: n_mel × n_fft float32 matrix
- Vocabulary: count + (len + bytes) per token (no score)
- Tensors: n_dims, name_len, ftype, dims (reversed!), name, data

Tensor names use whisper.cpp convention (e.g., `encoder.blocks.0.attn.query.weight`) not HuggingFace convention.
