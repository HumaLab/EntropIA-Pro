# Fixture runtime-pack Windows

**English:** [ASSEMBLY_NOTES.en.md](./ASSEMBLY_NOTES.en.md)

- `payload_profile`: `fixture`
- `release_injection_required`: `true`
- El empaquetado de release real debe reemplazar estos archivos placeholder con Python redistribuible, wheels offline y caches presembradas.
- Este slice del repo hace que la estructura de runtime-pack sea testeable y bundleable sin mentir diciendo que los payloads pesados están en git.
- Entrypoints esperados del runtime después del handoff: `python/python.exe` y `uv/uv.exe`.
- Handoff esperado de assets nativos: `resources/lib/pdfium.dll` y `resources/lib/onnxruntime.dll`.
- `build_runtime_pack.py --payload-root` acepta tanto un layout directo como `.../windows-x86_64/...`; el workflow de release superpone ese payload sobre este fixture y regenera `manifest.json` más `assembly-summary.json`.

Árbol mínimo de payload Windows:

```text
windows-x86_64/
├── manifest.overrides.json
├── python/python.exe
├── uv/uv.exe
├── wheelhouse/
├── caches/
└── resources/lib/
    ├── pdfium.dll
    └── onnxruntime.dll
```
