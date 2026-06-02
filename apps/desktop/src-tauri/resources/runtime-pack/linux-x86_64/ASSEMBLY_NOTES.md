# Fixture runtime-pack Linux

**English:** [ASSEMBLY_NOTES.en.md](./ASSEMBLY_NOTES.en.md)

- `payload_profile`: `fixture`
- `release_injection_required`: `true`
- La paridad Linux ahora incluye estructura bundleable, manifest, scripts/caches placeholder y puntos espejo para librerías nativas.
- El empaquetado de release real debe inyectar Python redistribuible, wheels offline, caches presembradas y librerías nativas Linux auditadas antes de afirmar paridad offline completamente self-contained.
- Entrypoints esperados del runtime después del handoff: `python/bin/python3` y `uv/bin/uv`.
- Handoff esperado de assets nativos: `resources/lib/libpdfium.so` y `resources/lib/libonnxruntime.so`, más cualquier dependencia `.so` adicional auditada que se descubra durante el empaquetado.
- `build_runtime_pack.py --payload-root` acepta tanto un layout directo como `.../linux-x86_64/...`; el workflow de release superpone ese payload sobre este fixture y regenera `manifest.json` más `assembly-summary.json`.

Árbol mínimo de payload Linux:

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
