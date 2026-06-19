# EntropIA Pro

**English:** [README.en.md](./README.en.md)

**Release actual:** [v0.1.0](https://github.com/HumaLab/EntropIA-Pro/releases/tag/v0.1.0)

EntropIA Pro es una aplicación de escritorio para investigación con corpus documentales. Permite organizar colecciones, procesar imágenes/PDFs/audio, enriquecer resultados con OCR, transcripción, búsqueda, embeddings, entidades y triples semánticos.

El foco de `v0.1.0` es ofrecer una primera release Pro funcional para **Windows x64**, con identidad de aplicación propia y runtime empaquetado mediante el flujo de release del repositorio Pro.

## Descarga

Los instaladores publicados están en:

<https://github.com/HumaLab/EntropIA-Pro/releases/tag/v0.1.0>

| Sistema operativo | Assets |
| --- | --- |
| Windows 10/11 x64 | `EntropIA.Pro_0.1.0_x64-setup.exe`, `EntropIA.Pro_0.1.0_x64_en-US.msi` |

> macOS y Linux no forman parte de la release publicada en `v0.1.0`.

## Capacidades incluidas

- Organización de corpus en colecciones, ítems y assets locales.
- Ingesta de imágenes, PDFs y audio.
- Persistencia local en SQLite.
- OCR Light para extracción de texto.
- OCR High con PaddleOCR-VL para resultados sensibles al layout.
- Persistencia de layouts OCRH: bloques, regiones, páginas y bounding boxes.
- Transcripción de audio con `faster-whisper` vía Python subprocess.
- Corrección, resumen y extracción semántica asistida por LLM.
- Entidades, triples, FTS y embeddings asset-level.
- Notas, anotaciones y edición manual de resultados.

## Alcance real de `v0.1.0`

`v0.1.0` es una release inicial Pro. Está pensada para validar el flujo completo de app desktop Windows, instalador, runtime-pack y funcionalidad base.

La app prioriza ejecución local/offline-first, pero algunas capacidades avanzadas todavía dependen de configuración o runtimes externos.

| Capacidad | Requiere |
| --- | --- |
| OCR básico | Modelos OCR nativos incluidos con la app |
| OCR High | Runtime Python + `paddleocr[doc-parser]` |
| Transcripción | Runtime Python + `faster-whisper` |
| Embeddings | OpenRouter API key para `baai/bge-m3` |
| NER liviano | OpenRouter API key + modelo Gemma vía OpenRouter |

## Desarrollo desde código fuente

### Requisitos

- Node.js 22+
- pnpm 9
- Rust estable / MSVC toolchain en Windows

### Instalación

```bash
git clone git@github.com:HumaLab/EntropIA-Pro.git
cd EntropIA-Pro
pnpm install --frozen-lockfile
```

### Ejecutar en desarrollo

```bash
pnpm --filter @entropia-pro/desktop tauri dev
```

### Validar

```bash
pnpm typecheck
pnpm test
pnpm lint
cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml
```

### Build frontend

```bash
pnpm build
```

## Runtime-pack y release (instalador liviano)

El runtime de IA (~2.2GB) es demasiado grande para empaquetarlo dentro de un instalador Windows (NSIS y WiX fallan por encima de ~2GB). Por eso EntropIA Pro usa un **instalador liviano + descarga al primer uso**: el instalador ship el fixture chico de `runtime-pack` y NO incluye el runtime pesado; la app lo descarga al primer uso desde una fuente remota firmada (ed25519) y verifica firma + sha256 antes de confiar en él.

Flujo de release:

1. Ejecutar el workflow **Build Runtime Pack** para armar el runtime-pack fresco y subir el artifact `runtime-archive`.
2. Ejecutar **Publish Runtime Bootstrap** con ese `runtime_pack_run_id`: parte el archivo bajo el límite de 2 GiB por asset de GitHub, sube las partes al tag `runtime-bootstrap` y publica un `manifest.json` firmado.
3. Pushear el tag `v*`: el workflow **Release** construye el instalador liviano (NSIS) con la URL del manifiesto + la clave pública de la fuente **horneadas** en el binario, sin inyectar el runtime.

`build.rs` falla cerrado si un build de release embebe el fixture sin una fuente de bootstrap horneada, así que es imposible publicar un instalador que no pueda descargar el runtime en una máquina limpia.

## Documentación útil

- [SQLite](./SQLite.md) — esquema y guía de inspección de la base local.
- [Debugging de base de datos](./DATABASE_DEBUGGING.md) — consultas operativas para diagnosticar persistencia.
- [Firma de código](./CODE_SIGNING.md) — política de firma para releases.
- [Privacidad](./PRIVACY.md) — comportamiento de datos, runtimes y proveedores externos.
- [Avisos de terceros](./THIRD_PARTY_NOTICES.md) — dependencias, modelos y runtime payloads.

---

**Powered by local compute.**
