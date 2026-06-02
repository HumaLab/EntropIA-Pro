# Runtime-pack maintenance contract

## Qué cubre este repo

- Manifiestos versionados por plataforma.
- Estructura bundleable para `windows-x86_64` y `linux-x86_64`.
- Scripts de assembly y smoke (`scripts/build_runtime_pack.py`, `scripts/runtime-pack-smoke.py`).
- Fixtures chicos para validar wiring sin subir payloads pesados al repo.

## Qué entra por release-time artifact injection

Antes de publicar una release que diga “self-contained”, CI/release DEBE reemplazar los fixtures por:

1. Python relocatable redistribuible por plataforma.
2. `uv` auditado si cambia respecto del fixture.
3. Wheelhouse offline real para OCR/transcripción.
4. Caches/modelos presembrados (HF y PaddleX) requeridos por los flujos core. El NLP liviano usa OpenRouter (`baai/bge-m3` para embeddings y Gemma JSON para NER), sin `scripts/embed.py` ni spaCy en el runtime fallback.
5. Shared libraries Linux auditadas (`libpdfium.so`, `libonnxruntime.so`, y cualquier dependencia adicional que resulte obligatoria).

## Contrato de payload externo

- El script `scripts/build_runtime_pack.py` ahora acepta `--payload-root`.
- Ese directorio puede venir como layout directo (`python/`, `uv/`, `wheelhouse/`, `caches/`, `resources/lib/`) o como `<payload-root>/<platform>/...`.
- Si existe `manifest.overrides.json`, el script aplica esos overrides al manifest final y **recalcula** los listados/checksums/tamaños a partir de los archivos realmente ensamblados.
- Workflow de release: descarga el artifact `runtime-payloads` desde el `runtime_payload_run_id` indicado, arma el pack en `target/runtime-pack/` y falla cerrado si no hay payload release real. Ya no se permite publicar instaladores desde fixtures.
- El workflow ensambla primero en `apps/desktop/src-tauri/target/runtime-pack/`, corre smoke ahí y recién después reemplaza `resources/runtime-pack/<platform>` para que el `tauri-action` bundlee el payload real sin destruir la fuente fixture durante el armado.

### Layouts aceptados para `--payload-root`

Layout directo:

```text
runtime-payloads/
├── manifest.overrides.json
├── python/
├── uv/
├── wheelhouse/
├── caches/
└── resources/lib/
```

Layout por plataforma:

```text
runtime-payloads/
├── windows-x86_64/
│   ├── manifest.overrides.json
│   ├── python/
│   ├── uv/
│   ├── wheelhouse/
│   ├── caches/
│   └── resources/lib/
└── linux-x86_64/
    ├── manifest.overrides.json
    ├── python/
    ├── uv/
    ├── wheelhouse/
    ├── caches/
    └── resources/lib/
```

### Handoff real por plataforma

| Plataforma | `python_relpath` esperado | `uv_relpath` esperado | Native assets mínimos | Artifactos externos mínimos |
| ---------- | ------------------------- | --------------------- | --------------------- | --------------------------- |
| `windows-x86_64` | `python/python.exe` | `uv/uv.exe` | `resources/lib/pdfium.dll`, `resources/lib/onnxruntime.dll` | `relocatable-python-windows-x86_64`, `offline-wheelhouse-core`, `seeded-model-caches` |
| `linux-x86_64` | `python/bin/python3` | `uv/bin/uv` | `resources/lib/libpdfium.so`, `resources/lib/libonnxruntime.so` | `relocatable-python-linux-x86_64`, `offline-wheelhouse-core`, `seeded-model-caches`, `linux-native-libs` |

### Output verificable del armado

- Cada corrida de `build_runtime_pack.py` deja `target/runtime-pack/<platform>/assembly-summary.json` con el `payload_root` resuelto, el perfil final y el listado de archivos ensamblados.
- `runtime-pack-smoke.py` acepta como `--root` tanto el directorio padre (`target/runtime-pack/`) como el directorio puntual de plataforma (`target/runtime-pack/<platform>`).
- La validación útil para handoff real es: **armar con payload externo → revisar `assembly-summary.json` → correr smoke sobre ese output**.

Diagnóstico rápido de readiness sin falsificar payloads:

```bash
python3 apps/desktop/src-tauri/scripts/build_runtime_pack.py --platform windows-x86_64 --output-dir apps/desktop/src-tauri/target/runtime-pack --require-release-payload
```

Si no se pasó `--payload-root`, este comando debe fallar con `--require-release-payload requires --payload-root`. Ese fallo es correcto: confirma que el release real todavía necesita un artifact externo y evita publicar fixtures como runtime self-contained.

Ejemplos de validación manual con payload real:

```bash
python3 apps/desktop/src-tauri/scripts/build_runtime_pack.py --platform windows-x86_64 --payload-root /abs/path/runtime-payloads --output-dir apps/desktop/src-tauri/target/runtime-pack
python3 apps/desktop/src-tauri/scripts/runtime-pack-smoke.py --platform windows-x86_64 --root apps/desktop/src-tauri/target/runtime-pack

python3 apps/desktop/src-tauri/scripts/build_runtime_pack.py --platform linux-x86_64 --payload-root /abs/path/runtime-payloads --output-dir apps/desktop/src-tauri/target/runtime-pack
python3 apps/desktop/src-tauri/scripts/runtime-pack-smoke.py --platform linux-x86_64 --root apps/desktop/src-tauri/target/runtime-pack
```

### Windows x86_64 desde el venv administrado local

Cuando una máquina Windows ya tiene `managed_venv` funcionando, se puede materializar un payload release reproducible desde ese entorno sin subir binarios pesados a git:

```powershell
python apps/desktop/src-tauri/scripts/materialize_windows_runtime_payload.py `
  --pack-version 2026.05.0 `
  --app-version 0.1.0 `
  --output-dir apps/desktop/src-tauri/target/runtime-payloads

python apps/desktop/src-tauri/scripts/build_runtime_pack.py `
  --platform windows-x86_64 `
  --payload-root apps/desktop/src-tauri/target/runtime-payloads `
  --output-dir apps/desktop/src-tauri/target/runtime-pack `
  --require-release-payload

python apps/desktop/src-tauri/scripts/runtime-pack-smoke.py `
  --platform windows-x86_64 `
  --root apps/desktop/src-tauri/target/runtime-pack `
  --release `
  --install-probe
```

Ese output queda bajo `target/`: es artefacto de release, no fuente commiteable.

### Criterio de cierre Windows x86_64

Windows se considera cerrado cuando se cumplen estas condiciones:

1. `materialize_windows_runtime_payload.py` genera `target/runtime-payloads/windows-x86_64` desde un `managed_venv` funcional.
2. `build_runtime_pack.py --require-release-payload` genera `target/runtime-pack/windows-x86_64` con `payload_profile=release`, `release_injection_required=false` y `external_artifacts_required=[]`.
3. `runtime-pack-smoke.py --release --install-probe` pasa en Windows.
4. El pack release no contiene ningun `CACHE_NOT_SEEDED.txt`; si aparece ese marcador, el smoke release debe fallar.
5. En dev, `ENTROPIA_RUNTIME_PACK_ROOT` puede apuntar a `target/runtime-pack` para validar la app sin copiar el payload pesado a `resources/`.

### Politica OCRH / PaddleOCR-VL en CPU

En Windows sin GPU NVIDIA, PaddleOCR-VL puede usar CPU. El timeout de 900s es aceptado: no es senal de runtime roto por si mismo. Si vence, OCRH debe fallar de forma controlada y caer a OCR plano; no hay que bajar este timeout salvo nueva decision de producto.

Para probarlo en dev sin copiar 3GB a `resources/`, arrancá Tauri con:

```powershell
$env:ENTROPIA_RUNTIME_PACK_ROOT = "<repo>\apps\desktop\src-tauri\target\runtime-pack"
pnpm --filter @entropia-pro/desktop tauri dev
```

El override acepta tanto el directorio padre (`target/runtime-pack`) como el pack directo (`target/runtime-pack/windows-x86_64`).

Ejemplo mínimo de `manifest.overrides.json` para una inyección completa:

```json
{
  "payload_profile": "release",
  "release_injection_required": false,
  "external_artifacts_required": []
}
```

## Regla de verdad

Si `payload_profile != release` o `release_injection_required = true`, el runtime NO debe presentarse como listo para flujo offline core.
Además, un pack `release` no puede seguir declarando `external_artifacts_required`.

## Ownership sugerido

- Producto/app: define qué capacidades entran en “core offline”.
- Release engineering: inyecta artifacts, recalcula checksums y publica installers.
- Maintainers de OCR/NLP: validan licencias, tamaño y compatibilidad de los modelos/caches incluidos.
