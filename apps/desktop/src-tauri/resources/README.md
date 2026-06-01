This directory is reserved for bundled Tauri resources.

## Native Libraries

- `lib/pdfium.dll` — Pdfium native library for PDF rendering (Windows x86_64).
  Download from [pdfium-render releases](https://github.com/ajrcarey/pdfium-render/releases).
  The DLL is resolved at runtime with a 3-tier search (bundled → dev → system library).
  See `resources/lib/.gitkeep` for details.
- `models/ner/onnxruntime.dll` — ONNX Runtime for native layout/local-ONNX
  inference on Windows. The legacy native NER model was removed; this path is
  retained only as the current dev DLL handoff location until ORT is relocated.
  Release runtime payloads also copy this DLL into
  `runtime-pack/<platform>/resources/lib/` so Python ONNX consumers can resolve it
  through the app-managed DLL path.

## Bundled Tools

- `tools/uv/windows-x86_64/uv.exe` — bundled `uv` 0.6.14 for Windows x64.
- `tools/uv/windows-aarch64/uv.exe` — bundled `uv` 0.6.14 for Windows ARM64.
  Runtime resolution prefers bundled Tauri resources, then dev resources, then
  the legacy app-data managed copy, then system `PATH`.

## Runtime Pack Fixtures

- `runtime-pack/windows-x86_64/` and `runtime-pack/linux-x86_64/` now exist in-repo as **minimal viable fixture packs**.
- Each pack ships `manifest.json`, placeholder Python/uv launchers, managed scripts, cache placeholders, wheelhouse notes, and mirrored native-lib paths.
- `payload_profile: fixture` means these packs are structurally real and bundleable, but they are NOT the final heavy release payloads.
- `release_injection_required: true` means CI/release must replace fixture placeholders with audited redistributable artifacts before claiming a truly self-contained release.
- **Self-contained ahora**: runtime-pack layout, manifest contract, bundle globs, assembly wiring, smoke checks, and explicit offline ownership boundaries are in-repo.
- **Todavía pendiente por release-time artifact injection**: relocatable Python runtimes, offline wheelhouse contents for OCR/transcription, seeded HuggingFace/PaddleX caches, and audited Linux shared libraries. Lightweight embeddings/NER use OpenRouter and do not require `scripts/embed.py` or spaCy.

### Release payload flow

1. Run the **Runtime Payload** workflow to prepare `runtime-payloads` from audited source payload files.
2. Run the **Release** workflow manually with `runtime_payload_artifact=runtime-payloads` and `runtime_payload_run_id=<run id>`; the `runtime-pack` job injects that payload, regenerates manifests, and runs release smoke checks before installer builds start.
3. Installers are self-contained only when the release payload is real. Tag-push releases fail closed if no runtime payload is provided. `runtime-payloads-fixture` is CI/test-only and must never be used for releasable installers.

See `scripts/prepare_runtime_payload.py`, `scripts/materialize_windows_runtime_payload.py`, `scripts/build_runtime_pack.py`, `scripts/runtime-pack-smoke.py`, and each platform `ASSEMBLY_NOTES.md` for the release handoff contract.

## OCR Models

Runtime assets for the `ocrs` engine are downloaded automatically before each build:

- `text-detection.rten` (~2.4 MB) — text detection model
- `text-recognition.rten` (~9.3 MB) — text recognition model

These files are **NOT committed** to the repository (ignored by `*.rten` in `.gitignore`).
They are downloaded from the official ocrs-models S3 bucket by the pre-build script:

```
apps/desktop/src-tauri/scripts/download-ocr-models.ps1
```

The script runs automatically via `tauri.conf.json` `beforeBuildCommand` and `beforeDevCommand`.
If you need to download manually:

```powershell
powershell -File apps/desktop/src-tauri/scripts/download-ocr-models.ps1
```

## Operational Notes

- `sqlite-vec-windows-tradeoff.md`: archived note from the previous sqlite-vec/`vec_items` implementation; kept only for historical context.
