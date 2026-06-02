# Política de firma de código de EntropIA Pro

**English:** [CODE_SIGNING.en.md](./CODE_SIGNING.en.md)

EntropIA Pro firma instaladores de release solo cuando el artefacto de release es trazable, suficientemente reproducible para revisión y está construido con componentes open-source redistribuibles. Hasta cumplir ese estándar y aprobar un proveedor de firma, los instaladores Windows pueden permanecer sin firmar.

## Camino rápido para una release firmada

1. Construir el payload de runtime de release desde artefactos fuente auditados.
2. Ejecutar el workflow Release con `runtime_payload_artifact=runtime-payloads` y el `runtime_payload_run_id` que produjo ese payload.
3. Verificar que los smoke checks del runtime-pack de release pasen antes de que empiece la construcción de instaladores.
4. Revisar assets, hashes y procedencia del draft release.
5. Firmar solo los instaladores revisados para el tag exacto de release.

## Estado actual de firma

| Área | Estado |
| ---- | ------ |
| Licencia del proyecto | MIT, ver `LICENSE`. |
| Releases públicas | GitHub Releases. |
| Firma Windows | Pendiente. Los instaladores pueden no estar firmados. |
| Proveedor de firma | No integrado todavía. Se está evaluando SignPath Foundation. |
| Gate de runtime release | Requerido por `.github/workflows/release.yml`; los fixture runtime-packs no deben llegar a builds de instaladores. |

## Reglas de firma

- No firmar builds locales ad hoc.
- No firmar artefactos producidos desde fixture runtime-packs.
- No firmar instaladores si `payload_profile != release`, `release_injection_required != false` o `external_artifacts_required` no está vacío.
- No guardar material de certificados, claves de firma ni tokens de firma en el repositorio.
- Preferir aprobación manual para el paso de firma después de que los artefactos y hashes de release estén visibles.

## Procedencia de artefactos de release

Los artefactos firmados deben ser trazables a:

- un tag Git;
- la corrida del workflow Release de GitHub Actions;
- la corrida del workflow Runtime Payload usada como input;
- el manifest del runtime-pack generado durante el armado de release;
- el hash final del instalador publicado en las notas de GitHub Release.

## Respuesta ante incidentes

Si se sospecha que un artefacto firmado está comprometido:

1. Marcar la GitHub Release como retirada o prerelease con una advertencia.
2. Remover los assets de instalador afectados si hace falta.
3. Publicar hashes y versiones afectadas.
4. Rotar credenciales de firma mediante el proveedor de firma.
5. Publicar una release corregida desde una corrida limpia del workflow.

## Pendientes antes de integrar firma

- Completar third-party notices y revisión de licencias del runtime payload.
- Confirmar que cada modelo, wheel, librería nativa y cache de runtime bundleado sea redistribuible.
- Decidir proveedor final de firma y política de aprobación.
- Agregar la firma como paso post-build de release solo después de que pase el gate de runtime payload.
