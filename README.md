# EntropIA Pro

**English:** [README.en.md](./README.en.md)

**Release actual:** [v0.1.0](https://github.com/hlabrepo/EntropIA-Pro/releases/tag/v0.1.0)

EntropIA Pro es una aplicación de escritorio para investigación con corpus documentales. Permite organizar colecciones, procesar imágenes/PDFs/audio, enriquecer resultados con OCR, transcripción, búsqueda, embeddings, entidades y triples semánticos.

El foco de `v0.1.0` es ofrecer una primera release Pro funcional para **Windows x64**, con identidad de aplicación propia y runtime empaquetado mediante el flujo de release del repositorio Pro.

## Descarga

Los instaladores publicados están en:

<https://github.com/hlabrepo/EntropIA-Pro/releases/tag/v0.1.0>

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
git clone git@github.com:hlabrepo/EntropIA-Pro.git
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

## Runtime-pack y release

El repo incluye fixtures de `runtime-pack` para que el layout sea verificable en CI sin commitear payloads pesados. Las releases reales usan **release-time artifact injection**:

1. Ejecutar el workflow **Runtime Payload** para producir `runtime-payloads`.
2. Ejecutar el workflow **Release** manualmente con `runtime_payload_artifact=runtime-payloads` y `runtime_payload_run_id=<run id>`.
3. El workflow arma el runtime-pack final, corre smoke checks y recién después construye los instaladores.

Los pushes directos de tags `v*` fallan cerrado si no existe payload de runtime real. Esto evita publicar instaladores con fixtures.

## Documentación útil

- [SQLite](./SQLite.md) — esquema y guía de inspección de la base local.
- [Debugging de base de datos](./DATABASE_DEBUGGING.md) — consultas operativas para diagnosticar persistencia.
- [Firma de código](./CODE_SIGNING.md) — política de firma para releases.
- [Privacidad](./PRIVACY.md) — comportamiento de datos, runtimes y proveedores externos.
- [Avisos de terceros](./THIRD_PARTY_NOTICES.md) — dependencias, modelos y runtime payloads.

---

**Powered by local compute.**
