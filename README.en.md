# EntropIA — Pro &amp; Lite (unified monorepo)

**Español:** [README.md](./README.md)

A single source tree that produces **two variants** of the desktop app for research with document corpora: **EntropIA Pro** (local + remote AI) and **EntropIA Lite** (100% remote, via APIs). Both are built from the same tree; the variant is chosen at compile time.

EntropIA organizes collections, processes images/PDFs/audio, and enriches results with OCR, transcription, search, embeddings, entities, and semantic triples.

## The two variants

| | **EntropIA Pro** | **EntropIA Lite** |
| --- | --- | --- |
| OCR | local PaddleOCR-VL + remote GLM | remote GLM-OCR |
| Transcription | local faster-whisper + AssemblyAI | AssemblyAI |
| LLM / NER / RAG | local Gemma + OpenRouter | OpenRouter |
| Embeddings | local BGE-M3 (ONNX) + OpenRouter | OpenRouter |
| Native ML runtime | yes (downloaded on first use) | no |
| Installer | NSIS + MSI (GitHub) | NSIS + MSI (GitHub) · MSIX (Store) |
| Identity | `com.entropia.pro.desktop` | `CONICET.EntropIALite` |
| Built with | default features (`local-ml`) + `VITE_LOCAL_ML=1` | `--no-default-features` + `VITE_LOCAL_ML=0` |

**Pro** runs AI on the machine (offline-first) and falls back to remote providers when the runtime is missing or by configuration. **Lite** is 100% remote (OpenRouter / AssemblyAI / GLM): no native models or runtime, small installer, Microsoft Store distribution.

## Download

- **EntropIA Pro** (Windows x64) — `.exe` (NSIS) + `.msi`: [repo Releases](https://github.com/HumaLab/EntropIA-Pro-Lite/releases).
- **EntropIA Lite** (Windows x64) — Microsoft Store: <https://apps.microsoft.com/detail/9N328K9L95JD>, or `.exe`/`.msi` from [repo Releases](https://github.com/HumaLab/EntropIA-Pro-Lite/releases).

## Capabilities

Same feature set in both variants — only the engine changes (local vs remote, see the table above):

- Corpus organization into collections, items, and local assets (SQLite).
- Image, PDF, and audio ingestion.
- OCR Light + OCR High with layout persistence (blocks, regions, pages, bounding boxes).
- Audio transcription.
- LLM-assisted correction, summary, and semantic extraction.
- Entities, triples, NER, FTS, and asset-level embeddings (RAG).
- Notes, annotations, and manual result editing.
- Cross-device sync (deterministic ids for duplicate-free convergence).

## Development

### Requirements

- Node.js 22+, pnpm 9
- Stable Rust / MSVC toolchain on Windows

### Install

```bash
git clone git@github.com:HumaLab/EntropIA-Pro-Lite.git
cd EntropIA-Pro-Lite
pnpm install --frozen-lockfile
```

### Run &amp; build each variant

Everything runs from **`apps/desktop/`**. If you are at the repo root, run `cd apps/desktop` first; otherwise `pnpm exec tauri` cannot find the Tauri CLI because it is installed in the desktop workspace. The variant is selected by three things: the Cargo feature (`--no-default-features` for Lite), the `VITE_LOCAL_ML` frontend flag, and (for Lite) the `tauri.lite.conf.json` Tauri config.

**EntropIA Pro** (compiles MNN from source the first time → ~30 min):

```powershell
cd apps/desktop
$env:VITE_LOCAL_ML='1'
pnpm exec tauri dev      # dev with hot-reload
pnpm exec tauri build    # NSIS installer
```

**EntropIA Lite** (lean, no MNN → starts fast):

```powershell
cd apps/desktop
$env:VITE_LOCAL_ML='0'
$env:CARGO_DEFAULT_FEATURES='0'
pnpm exec tauri dev   --config src-tauri/tauri.lite.conf.json
pnpm exec tauri build --config src-tauri/tauri.lite.conf.json --bundles nsis,msi -- --no-default-features
```

> - Use **`pnpm exec tauri`** (not `pnpm tauri … -- …`): pnpm eats the first `--` and breaks arg passing to Cargo.
> - To run it from the **repo root** without `cd`, use `pnpm --filter @entropia-pro/desktop exec tauri ...`.
> - For **Lite `tauri dev`**, do not use `-- --no-default-features`: this Tauri CLI version parses it as its own argument and fails. Use `$env:CARGO_DEFAULT_FEATURES='0'`.
> - In PowerShell `$env:VITE_LOCAL_ML` **persists for the session** → set it on every variant switch (or open a new terminal). In bash it goes inline: `VITE_LOCAL_ML=0 pnpm exec tauri …`.
> - Lite uses `identifier com.entropia.lite` → **separate app data** from Pro (you can run both without clobbering each other).
> - Lite's `tauri build` produces the **`.exe` (NSIS) + `.msi`**; the final Store **MSIX** comes from the repack (see _Release &amp; installers_).

### Validate

```bash
pnpm typecheck                                                  # Pro (frontend)
VITE_LOCAL_ML=0 pnpm --filter @entropia-pro/desktop typecheck   # Lite (frontend)
pnpm test                                                       # frontend tests (Pro)
cargo build --manifest-path apps/desktop/src-tauri/Cargo.toml                        # Pro (Rust)
cargo build --manifest-path apps/desktop/src-tauri/Cargo.toml --no-default-features  # Lite (Rust)
```

## How the variant flag works

The unification is a **strangler** over the Pro code: all local inference lives behind the `local-ml` Cargo feature (with a `paddle-ocr` sub-feature for MNN/PaddleOCR), mirrored by the `VITE_LOCAL_ML` frontend flag.

- **`cargo build` (default)** = `local-ml` ON → **Pro** (local + remote engines).
- **`cargo build --no-default-features`** = lean → **Lite** (remote only). Drops `ort`/onnxruntime, `llama-cpp-2`, MNN/`ocr-rs`, `tokenizers`, and the signed runtime download.
- The **frontend** reads `VITE_LOCAL_ML`: in Lite it hides DependenciasTab, the deps banners, and the local-model UI, and the brand becomes "EntropIA Lite".
- The **Tauri command list is identical** in both variants; only the bodies branch (the Lite arm returns healthy/no-op, like EntropIA Lite did).

CI requires **both** variants to compile — the lean build is a **blocking** gate — and verifies the lean-frontend typecheck on every push.

## Release &amp; installers

**Pro — lean installer + download-on-first-use.** The AI runtime (~2.2GB) does not fit inside a Windows installer (NSIS and WiX fail above ~2GB). The installer ships the small `runtime-pack` fixture and the app downloads the real runtime on first use from a signed remote source (ed25519), verifying signature + sha256 before trusting it. `build.rs` fails closed if a release build embeds the fixture without a baked bootstrap source.

Pro release flow:

1. **Build Runtime Pack** → builds a fresh runtime-pack (`runtime-archive` artifact).
2. **Publish Runtime Bootstrap** with that `runtime_pack_run_id` → splits the archive under GitHub's 2 GiB per-asset limit, uploads the parts to the `runtime-bootstrap` tag, and publishes a signed `manifest.json`.
3. Push a `v*` tag → the **Release** workflow builds the NSIS + MSI installers with the manifest URL + public key **baked** into the binary.

**Lite — GitHub installers + MSIX for the Store.** The `build-lite` job in the **Release** workflow builds the lean variant with `--bundles nsis,msi`; the `attach-lite-installers` job attaches the `.exe` (NSIS) + `.msi` to the GitHub release (downloadable like Pro's). In parallel, the `.msi` feeds the **repack** of a captured base MSIX (`apps/desktop/src-tauri/msix/`), rewriting the identity to `CONICET.EntropIALite` + the version; the `.msix` (unsigned — the Store signs it) is uploaded as an artifact for Partner Center.

- To test **only** the Lite MSIX without the Pro build: manually dispatch the **Release** workflow with `lite_only=true` (or `gh workflow run release.yml -f lite_only=true`).
- The base MSIX is re-captured (Hyper-V VM, manual) **only** if the package shape changes (assets/capabilities); routine releases just swap the exe + bump the version.

## Useful documentation

- [SQLite](./SQLite.en.md) — schema and inspection guide for the local database.
- [Database Debugging](./DATABASE_DEBUGGING.en.md) — operational queries for diagnosing persistence.
- [Code Signing](./CODE_SIGNING.en.md) — release signing policy.
- [Privacy](./PRIVACY.en.md) — data, runtime, and external provider behavior.
- [Third Party Notices](./THIRD_PARTY_NOTICES.en.md) — dependencies, models, and runtime payloads.

---

**Powered by local compute.**
