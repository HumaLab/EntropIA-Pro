# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is EntropIA

A desktop app for analyzing digitized historical sources using AI pipelines (OCR, NER, embeddings, semantic triples). Built offline-first with Tauri 2 + Svelte 5 + SQLite. Target users are historians working with fragmentary/degraded documents.

## Monorepo Structure

PNPM 9.15.4 workspaces + Turborepo. Three layers:

- **`apps/desktop/`** — Tauri 2 shell. Svelte 5 frontend (`src/`) + Rust backend (`src-tauri/`).
- **`packages/store/`** — Data layer: Drizzle ORM schema, SQLite repos (collection, item, asset, note, job, extraction, entity, embedding, fts, triple), migration runner.
- **`packages/ui/`** — Svelte 5 component library (Button, Card, DocumentViewer, EntityViewer, SearchBar, etc.) + design tokens CSS.
- **`packages/config-ts/`** — Shared tsconfig.

The Rust backend (`apps/desktop/src-tauri/`) contains these modules:

- **`db/`** — SQLite state management, Tauri IPC commands (`db_execute`, `db_select`, `db_select_rows`)
- **`ocr/`** — OCR engine with PaddleOCR light + PaddleOCR-VL high mode, PDF text extraction, layout-aware OCR, async job queue
- **`nlp/`** — FTS5 indexing, OpenRouter `baai/bge-m3` embeddings, Gemma/OpenRouter JSON NER (`PER`, `LOC`, `ORG`, `DATE`, `MISC`), semantic triple extraction, async job queue. NER is a sub-module (`nlp/ner/`).
- **`layout/`** — DocLayout-YOLO document structure analysis (Python subprocess), reading order algorithm, stores results in `layouts` table
- **`transcription/`** — Audio transcription via Python faster-whisper subprocess, async job queue

- **`llm/`** — LLM pipeline with dual backend: local Gemma via llama.cpp sidecar OR OpenRouter API. Jobs: OCR correction, entity extraction, triple extraction, summarization, classification, Q&A. Results persisted in `llm_results` table. Asset-level variants avoid context-window overflow on multi-page documents.
- **`geo/`** — Nominatim geocoding for place entities (populates latitude/longitude/geoStatus on entities)
- **`settings/`** — Key-value settings store (`app_settings` table). Tauri commands: `settings_get`, `settings_set`, `settings_get_all`, `settings_delete`. Used for OpenRouter API key, model selection, and user preferences.
- **`image_edit/`** — Image manipulation commands (rotation, cropping)

`openspec/` contains SDD (Specification-Driven Development) specs and change archives — not code.
`AGENTS.md` contains detailed build prerequisites (Windows toolchain, LLVM/Clang, Python OCR/NLP packages) and engine architecture notes.

## Common Commands

```bash
pnpm install              # install all workspace deps
pnpm dev                  # turbo dev (all packages)
pnpm build                # turbo build (all packages)
pnpm lint                 # eslint across all packages
pnpm typecheck            # tsc + svelte-check across all packages
pnpm test                 # vitest run across all packages
pnpm test:run             # vitest run (explicit --run flag)

# Single package
pnpm --filter @entropia/store test
pnpm --filter @entropia-pro/desktop lint

# Single test file
pnpm --filter @entropia/store test -- --run src/repos/item.repo.test.ts

# Single Rust test (from apps/desktop/src-tauri/)
cargo test nlp::tests::test_extract_entities

# Tauri desktop
cd apps/desktop && pnpm tauri dev     # run desktop app with hot reload
cd apps/desktop && pnpm tauri build   # production build

# Rust (from apps/desktop/src-tauri/)
cargo test                            # run Rust tests
cargo test -- --skip onnx              # skip ONNX tests if runtime not available
cargo clippy                          # lint Rust code
cargo fmt --check                     # check Rust formatting

# Rust quality report (Windows, PowerShell)
pnpm rust:quality:report
```

**First-time setup**: See `AGENTS.md` for Windows prerequisites (MSVC Build Tools, LLVM/Clang, CMake, Python OCR/transcription packages). Before `pnpm tauri dev` or `pnpm tauri build`, OCR models must be downloaded — Tauri's `beforeDevCommand` and `beforeBuildCommand` both run `pnpm download-ocr-models` (PowerShell script) automatically. NER runs through Gemma/OpenRouter JSON extraction; the legacy native ONNX/hybrid NER assets and `prepare-ner-model.ps1` flow were removed. Python scripts live in both `scripts/` (dev) and `resources/scripts/` (bundled with release).

## Testing

- **TypeScript/Svelte**: Vitest with happy-dom. Tests are co-located (`*.test.ts`).
- **Rust**: Standard `cargo test`. Modules have inline `#[cfg(test)]` tests.
- Tests mock the Tauri SQL plugin via `packages/store/src/__mocks__/db.mock.ts`.
- **Rust quality contract** (Windows): Pester `.ps1` test suites in `apps/desktop/src-tauri/scripts/` validate builds (`windows-feature-contract.ps1`, `rust-quality-contract.Tests.ps1`). ONNX Runtime is loaded dynamically (`load-dynamic` feature) — tests that need it will skip gracefully if the runtime is absent.

## Architecture Details

### Frontend Navigation (Not File-Based Routing)

The desktop app does **not** use SvelteKit or file-based routing. Navigation is a manual state machine in `src/lib/navigation.ts` with four views conditionally rendered in `App.svelte`:

- `collections` — list all collections
- `collection` — single collection (requires `id`, `collectionName`)
- `item` — single item (requires `itemId`, `collectionId`, `collectionName`, `itemTitle`)
- `settings` — app settings (OpenRouter API key, model selection)

Views live in `src/views/`, layout in `src/layout/` (AppShell, TopBar).

### Data Flow (Frontend to Rust)

1. Svelte views call repos from `@entropia/store` (e.g., `item.repo.ts`)
2. Repos use `client.ts` which wraps Tauri's `@tauri-apps/plugin-sql` for SQL operations, or calls `invoke()` for Rust commands
3. Rust Tauri commands (`db_execute`, `db_select`) operate on shared `AppDbState` (rusqlite)
4. Background AI commands (`extract_text`, `index_fts`, `embed_asset`, `extract_entities`, `extract_entities_for_asset`, `extract_triples`, `transcribe_audio`, `extract_layout`) go through async job queues (`OcrQueue`, `NlpQueue`, `TranscriptionQueue`, `LayoutQueue`). Direct read/admin commands like `similar_assets` and `backfill_asset_embeddings` use direct DB/blocking pathways instead of the queue.
5. LLM commands (`llm_correct_ocr`, `llm_summarize`, `llm_extract_entities`, etc.) go through `LlmQueue`. Settings commands (`settings_get`, `settings_set`) use direct DB access via `AppDbState`.

### SQLite Connections

The Rust backend manages multiple SQLite connections to `entropia.sqlite`:

- **UI connection** — used by Tauri IPC commands (reads/writes from frontend)
- **OCR worker connection** — dedicated to OCR job queue
- **NLP worker connection** — opened inside the NLP worker for queue processing (asset embeddings stored as BLOBs in `vec_assets`)

Current runtime/product architecture is **asset-only** for embeddings and similarity: `embed_asset`, `backfill_asset_embeddings`, and `similar_assets` are the active APIs. Treat `vec_items`, `similar_items`, `embed_item`, and `embeddings_fallback` as legacy/archive references only.

All connections use WAL mode + foreign keys enabled. Each queue worker opens its own connection independently.

On startup, `lib.rs` runs: (1) legacy migration from old `com.entropia.app` directory (SQLite bundle comparison by "richness score" + asset path rewriting), (2) `extractions.method` CHECK constraint migration (removes legacy `CHECK(method IN ('native','ocr'))` to allow PaddleOCR methods), (3) `layouts` table creation, (4) `assets.sort_index` column addition (for stable page ordering), (5) `llm_results` table creation, (6) `app_settings` table creation.

### OCR Provider Chain

OCR uses a fallback chain defined in `ocr/mod.rs`:

- **PaddleOCR-VL** (primary) — Python subprocess (`paddle_vl.py`) using `paddleocr[doc-parser]`. Does layout detection + OCR in a single pass, returns structured blocks with labels, bounding boxes, and reading order. Method field: `"paddle_vl"`.
- **PaddleOCR** (fallback) — `ocr-rs` crate with MNN backend, feature-gated as `paddle-ocr`. PP-OCRv5 detection + latin recognition. PP-LCNet orientation model auto-corrects 0°/90°/180°/270° rotation. `OcrEngine` is `Send + Sync`.
- **Provider chain**: PaddleVL → PaddleOCR → Error. PaddleVL is tried first automatically in OCRH; if unavailable, fails, or times out, it falls back to PaddleOCR light.
- **PDF pipeline** — Native text extraction first (`pdf-extract`), quality-checked (`is_quality_text()`: ≥50 alphanumeric chars). Falls back to pdfium-render at 300 DPI + OCR per page. Method field: `"native"` | `"pdf_paddle_vl"` | `"pdf_paddle"`.

Postprocessing heuristics in `postprocess.rs` are **DISABLED** (mixed columns). Kept for reference only.

### Layout Detection

Two layout engines available:

- **PaddleVL** (primary) — layout detection is integrated into PaddleOCR-VL's single-pass pipeline.
- **ONNX PP-DocLayout-S** — standalone PicoDet ONNX model (`resources/models/ocr/PP-DocLayout-S.onnx`, 4.68 MB). 23 region categories. Input: 2 tensors (image [1,3,480,480] + scale_factor [1,2]).

Reading order uses union-find column grouping: regions with ≥50% horizontal overlap → same column, columns left-to-right, regions within columns top-to-bottom. Results stored in `layouts` table (Rust-side, not yet in Drizzle schema). See `AGENTS.md` for full architecture details.

### Python Subprocess Architecture

Several features delegate to Python scripts, but embeddings are no longer one of them:

- **Embeddings** — BGE-M3 providers: OpenRouter `baai/bge-m3` via `https://openrouter.ai/api/v1/embeddings` or Local ONNX BGE-M3 assets (1024 dims). No legacy Python embedding fallback.
- **`scripts/transcribe.py`** — faster-whisper with `base` model, `int8` compute, default language `es`. Same sentinel pattern.
- **`scripts/layout_detect.py`** — DocLayout-YOLO layout detection. Same sentinel pattern (`===LAYOUT_JSON_BEGIN===` / `===LAYOUT_JSON_END===`).
- **`scripts/paddle_vl.py`** — PaddleOCR-VL layout + OCR in one pass. Sentinel pattern (`===VL_JSON_BEGIN===` / `===VL_JSON_END===`). Label mapping: doc_title/paragraph_title → title, text → plain_text, image → figure.

Rust spawns Python via `which_python()` / `which_python_for_layout()` (searches conda envs first, falls back to system Python). All Python-backed features degrade non-fatally if Python or dependencies are unavailable.

**Python deps required**: `faster-whisper`, `doclayout-yolo`, `paddleocr[doc-parser]` (install via pip/conda). Embeddings and lightweight NER do not use Python fallbacks.

### Lightweight NER Architecture

NER uses Gemma/OpenRouter JSON extraction in `nlp/ner/openrouter.rs`:

- **OpenRouter/Gemma** — strict JSON response parsing and category normalization to `PER`, `LOC`, `ORG`, `DATE`, `MISC`.
- **ONNX/rule-based code** — legacy optional support only when isolated; it is not the lightweight runtime fallback path.

If the provider is missing or returns invalid JSON, EntropIA reports a degraded/unavailable error. It does not fall back to spaCy.

### LLM Architecture

Dual-backend LLM system in `llm/`:

- **OpenRouter** (`openrouter.rs`) — Cloud API via `reqwest`. Model and API key stored in `app_settings` table. Frontend configures via `SettingsView`.
- **Local sidecar** (`sidecar.rs`) — llama.cpp server process managed by `SidecarManager`/`SidecarHandle`. Runs Gemma models locally.
- **Engine** (`engine.rs`) — `LlmEngine` abstracts both backends behind `LlmConfig`. Reads settings from `app_settings` to decide which backend to use.
- **Prompts** (`prompt.rs`) — All prompts in Spanish, matching source text language. Structured prompts for each job type (OCR correction, entity extraction, summarization, classification, Q&A, triple extraction).
- **Results** persisted in `llm_results` table (target_id, job_type, result JSON, timestamp).

### Job Queue Pattern

All background systems (OCR, NLP, Transcription, Layout, LLM) follow the same pattern:

1. Frontend calls Tauri command → submits job to mpsc channel → returns "queued"
2. Worker thread drains jobs serially, emits `progress/complete/error` events
3. Frontend listens to events via reactive stores → updates UI
4. DB stores results in `extractions`/`transcriptions`/`layouts` table for persistence

## CI

GitHub Actions (`.github/workflows/ci.yml`) runs on push/PR to `main`:

- **lint-typecheck** — ESLint + svelte-check + tsc (Ubuntu, Node 20)
- **windows-rust-feature-contract** — validates Rust builds on Windows
- **rust-quality-report** — clippy, fmt, coverage via cargo-llvm-cov, Pester test suites (Windows, Node 22)
- **test** — `pnpm test` (depends on lint-typecheck + Rust jobs, Node 20)
- **build** — `pnpm build --filter=!@entropia-pro/desktop` (TS/Svelte packages only; full Tauri build is release-only)

CI includes extensive **pnpm lockfile forensics** (SHA256 + git blob verification). Modifying `pnpm-lock.yaml` carelessly can cause CI failures — always use `pnpm install` to regenerate it.

## Package Exports

- `@entropia/store` — single entry `"."` → `src/index.ts` (exports all repos + `New*` mutation types)
- `@entropia/ui` — dual exports: `"."` (Svelte components) + `"./tokens"` (design tokens CSS)
- Internal dependencies use `workspace:*` protocol.

## Code Style

- **Prettier**: no semicolons, single quotes, trailing commas (es5), printWidth 100, tabWidth 2. Svelte files use `prettier-plugin-svelte`.
- **ESLint**: Flat config (ESLint 9+), TypeScript only. Unused vars prefixed with `_` are allowed. Svelte linting not yet enabled.
- **Turbo**: `typecheck` depends on `^build` (dependencies must build first). `dev` is non-cached and persistent.

## Conventions

- **Code**: English. **UI**: Spanish.
- Svelte 5 runes syntax (`$state`, `$derived`, `$effect` — not legacy Svelte 4 stores).
- Drizzle schema is the source of truth for the data model (`packages/store/src/schema.ts`).
- Migrations live in `packages/store/src/migrations/` (committed to repo, applied by `runner.ts`).
- All IDs are text (UUIDs generated client-side).
- Timestamps are integer (Unix epoch).
- Tauri dev server is hardcoded to port 1420 (`strictPort: true`).
- Rust release profile uses LTO + `opt-level = "s"` + strip for small binaries.
