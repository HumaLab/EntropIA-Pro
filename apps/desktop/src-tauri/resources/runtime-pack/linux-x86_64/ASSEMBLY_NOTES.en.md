# Linux runtime-pack fixture

**Español:** [ASSEMBLY_NOTES.md](./ASSEMBLY_NOTES.md)

- `payload_profile`: `fixture`
- `release_injection_required`: `true`
- Linux parity now includes bundleable structure, manifest, placeholder scripts/caches and native-lib mirror points.
- Real release packaging must inject redistributable Python, offline wheels, seeded caches, and audited Linux native libs before claiming fully self-contained offline release parity.
- Expected runtime entrypoints after handoff: `python/bin/python3` and `uv/bin/uv`.
- Expected native asset handoff: `resources/lib/libpdfium.so` and `resources/lib/libonnxruntime.so` plus any extra audited `.so` dependencies discovered during packaging.
- `build_runtime_pack.py --payload-root` accepts either a direct payload layout or `.../linux-x86_64/...`; the release workflow overlays that payload on top of this fixture and regenerates `manifest.json` plus `assembly-summary.json`.

Minimal Linux payload tree:

```text
linux-x86_64/
├── manifest.overrides.json
├── python/bin/python3
├── uv/bin/uv
├── wheelhouse/
├── caches/
└── resources/lib/
    ├── libpdfium.so
    └── libonnxruntime.so
```
