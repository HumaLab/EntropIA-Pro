# EntropIA Pro

**Español:** [README.md](./README.md)

**Current release:** [v0.1.0](https://github.com/hlabrepo/EntropIA-Pro/releases/tag/v0.1.0)

EntropIA Pro is a desktop application for research with document corpora. It lets you organize collections, process images/PDFs/audio, and enrich results with OCR, transcription, search, embeddings, entities, and semantic triples.

The focus of `v0.1.0` is to provide a first functional Pro release for **Windows x64**, with its own application identity and a packaged runtime through the Pro repository release flow.

## Download

Published installers are available at:

<https://github.com/hlabrepo/EntropIA-Pro/releases/tag/v0.1.0>

| Operating system | Assets |
| --- | --- |
| Windows 10/11 x64 | `EntropIA.Pro_0.1.0_x64-setup.exe`, `EntropIA.Pro_0.1.0_x64_en-US.msi` |

> macOS and Linux are not part of the published `v0.1.0` release.

## Included capabilities

- Corpus organization into collections, items, and local assets.
- Image, PDF, and audio ingestion.
- Local SQLite persistence.
- OCR Light for text extraction.
- OCR High with PaddleOCR-VL for layout-aware results.
- OCRH layout persistence: blocks, regions, pages, and bounding boxes.
- Audio transcription with `faster-whisper` through a Python subprocess.
- LLM-assisted correction, summary, and semantic extraction.
- Entities, triples, FTS, and asset-level embeddings.
- Notes, annotations, and manual result editing.

## Real scope of `v0.1.0`

`v0.1.0` is an initial Pro release. It is intended to validate the full Windows desktop app, installer, runtime-pack, and base functionality flow.

The app prioritizes local/offline-first execution, but some advanced capabilities still depend on configuration or external runtimes.

| Capability | Requires |
| --- | --- |
| Basic OCR | Native OCR models included with the app |
| OCR High | Python runtime + `paddleocr[doc-parser]` |
| Transcription | Python runtime + `faster-whisper` |
| Embeddings | OpenRouter API key for `baai/bge-m3` |
| Lightweight NER | OpenRouter API key + Gemma model through OpenRouter |

## Development from source

### Requirements

- Node.js 22+
- pnpm 9
- Stable Rust / MSVC toolchain on Windows

### Install

```bash
git clone git@github.com:hlabrepo/EntropIA-Pro.git
cd EntropIA-Pro
pnpm install --frozen-lockfile
```

### Run in development

```bash
pnpm --filter @entropia-pro/desktop tauri dev
```

### Validate

```bash
pnpm typecheck
pnpm test
pnpm lint
cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml
```

### Frontend build

```bash
pnpm build
```

## Runtime-pack and release

The repository includes `runtime-pack` fixtures so the layout can be verified in CI without committing heavy payloads. Real releases use **release-time artifact injection**:

1. Run the **Runtime Payload** workflow to produce `runtime-payloads`.
2. Run the **Release** workflow manually with `runtime_payload_artifact=runtime-payloads` and `runtime_payload_run_id=<run id>`.
3. The workflow assembles the final runtime-pack, runs smoke checks, and only then builds the installers.

Direct pushes of `v*` tags fail closed if no real runtime payload exists. This prevents publishing installers with fixtures.

## Useful documentation

- [SQLite](./SQLite.en.md) — schema and inspection guide for the local database.
- [Database Debugging](./DATABASE_DEBUGGING.en.md) — operational queries for diagnosing persistence.
- [Code Signing](./CODE_SIGNING.en.md) — release signing policy.
- [Privacy](./PRIVACY.en.md) — data, runtime, and external provider behavior.
- [Third Party Notices](./THIRD_PARTY_NOTICES.en.md) — dependencies, models, and runtime payloads.

---

**Powered by local compute.**
