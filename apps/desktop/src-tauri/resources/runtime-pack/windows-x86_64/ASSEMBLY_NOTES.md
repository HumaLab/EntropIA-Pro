# Windows runtime-pack fixture

- `payload_profile`: `fixture`
- `release_injection_required`: `true`
- Real release packaging must replace these placeholder files with redistributable Python, offline wheels and seeded caches.
- This repo slice makes the runtime-pack structure testable and bundleable without lying about shipping the heavy payloads in git.
- Expected runtime entrypoints after handoff: `python/python.exe` and `uv/uv.exe`.
- Expected native asset handoff: `resources/lib/pdfium.dll`.
- `build_runtime_pack.py --payload-root` accepts either a direct payload layout or `.../windows-x86_64/...`; the release workflow overlays that payload on top of this fixture and regenerates `manifest.json` plus `assembly-summary.json`.

Minimal Windows payload tree:

```text
windows-x86_64/
├── manifest.overrides.json
├── python/python.exe
├── uv/uv.exe
├── wheelhouse/
├── caches/
└── resources/lib/pdfium.dll
```
