This directory is reserved for bundled Tauri resources.

## Native Libraries

- `lib/pdfium.dll` — Pdfium native library for PDF rendering (Windows x86_64).
  Download from [pdfium-render releases](https://github.com/ajrcarey/pdfium-render/releases).
  The DLL is resolved at runtime with a 3-tier search (bundled → dev → system library).
  See `resources/lib/.gitkeep` for details.
- `lib/linux-x86_64/` — Linux native-library placeholders and documented handoff
  paths for release runtime payloads.
- Release runtime payloads may also inject ONNX Runtime under
  `runtime-pack/<platform>/resources/lib/` when validated ONNX consumers require it.

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

The native OCR fallback uses the bundled PaddleOCR/MNN assets in
`models/ocr/`:

- `PP-OCRv5_mobile_det.mnn`
- `latin_PP-OCRv5_mobile_rec_infer.mnn`
- `PP-LCNet_x1_0_doc_ori.mnn`
- `ppocr_keys_latin.txt`

PaddleOCR-VL high-quality OCR runs through the managed Python runtime/script
path and does not require separate model files committed in this directory.
