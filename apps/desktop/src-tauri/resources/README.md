# Recursos bundleados de Tauri

**English:** [README.en.md](./README.en.md)

Este directorio está reservado para recursos Tauri bundleados.

## Librerías nativas

- `lib/pdfium.dll` — librería nativa Pdfium para renderizado PDF (Windows x86_64).
  Descargar desde [pdfium-render releases](https://github.com/ajrcarey/pdfium-render/releases).
  La DLL se resuelve en runtime con una búsqueda de 3 niveles (bundleado → dev → librería del sistema).
  Ver `resources/lib/.gitkeep` para más detalles.
- `lib/linux-x86_64/` — placeholders de librerías nativas Linux y rutas de handoff documentadas para payloads de runtime de release.
- Los runtime payloads de release también pueden inyectar ONNX Runtime bajo `runtime-pack/<platform>/resources/lib/` cuando consumidores ONNX validados lo requieran.

## Herramientas bundleadas

- `tools/uv/windows-x86_64/uv.exe` — `uv` 0.6.14 bundleado para Windows x64.
- `tools/uv/windows-aarch64/uv.exe` — `uv` 0.6.14 bundleado para Windows ARM64.
  La resolución de runtime prefiere recursos Tauri bundleados, luego recursos dev, luego la copia administrada legacy en app-data y finalmente `PATH` del sistema.

## Fixtures de runtime-pack

- `runtime-pack/windows-x86_64/` y `runtime-pack/linux-x86_64/` existen en repo como **fixture packs mínimos viables**.
- Cada pack incluye `manifest.json`, launchers placeholder de Python/uv, scripts administrados, placeholders de cache, notas de wheelhouse y rutas espejo para librerías nativas.
- `payload_profile: fixture` significa que estos packs son estructuralmente reales y bundleables, pero NO son los payloads pesados finales de release.
- `release_injection_required: true` significa que CI/release debe reemplazar placeholders fixture por artefactos redistribuibles auditados antes de afirmar que una release es realmente self-contained.
- **Self-contained ahora**: layout de runtime-pack, contrato de manifest, bundle globs, wiring de assembly, smoke checks y límites explícitos de ownership offline están en repo.
- **Todavía pendiente por release-time artifact injection**: runtimes Python relocatables, wheelhouse offline para OCR/transcripción, caches HuggingFace/PaddleX presembradas y librerías compartidas Linux auditadas. Embeddings/NER livianos usan OpenRouter y no requieren `scripts/embed.py` ni spaCy.

### Flujo de release payload

1. Ejecutar el workflow **Runtime Payload** para preparar `runtime-payloads` desde archivos fuente auditados.
2. Ejecutar manualmente el workflow **Release** con `runtime_payload_artifact=runtime-payloads` y `runtime_payload_run_id=<run id>`; el job `runtime-pack` inyecta ese payload, regenera manifests y corre smoke checks de release antes de iniciar builds de instaladores.
3. Los instaladores son self-contained solo cuando el release payload es real. Las releases por push de tag fallan cerrado si no se provee runtime payload. `runtime-payloads-fixture` es solo para CI/tests y nunca debe usarse para instaladores publicables.

Ver `scripts/prepare_runtime_payload.py`, `scripts/materialize_windows_runtime_payload.py`, `scripts/build_runtime_pack.py`, `scripts/runtime-pack-smoke.py` y cada `ASSEMBLY_NOTES.md` de plataforma para el contrato de handoff de release.

## Modelos OCR

El fallback OCR nativo usa los assets PaddleOCR/MNN bundleados en `models/ocr/`:

- `PP-OCRv5_mobile_det.mnn`
- `latin_PP-OCRv5_mobile_rec_infer.mnn`
- `PP-LCNet_x1_0_doc_ori.mnn`
- `ppocr_keys_latin.txt`

OCR de alta calidad con PaddleOCR-VL corre mediante el path de runtime/script Python administrado y no requiere archivos de modelo separados commiteados en este directorio.
