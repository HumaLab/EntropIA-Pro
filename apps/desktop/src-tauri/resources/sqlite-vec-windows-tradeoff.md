# sqlite-vec Windows tradeoff (legacy archive)

## Estado

Este documento queda como archivo histórico de una etapa anterior item-level basada en `sqlite-vec`/`vec_items`.

La arquitectura runtime/product actual ya no depende de `sqlite-vec` para embeddings o similitud: usa `vec_assets` con embeddings BLOB y ranking cosine en Rust.

## Contexto histórico

En esa etapa se había aplicado un override por target Windows en `Cargo.toml` para usar un shim local `vendor/sqlite-vec` y degradar sin fallo fatal cuando `vec_items` no estaba disponible.

## Cómo leerlo hoy

- útil solo para entender decisiones previas alrededor de `sqlite-vec`
- NO describe la arquitectura soportada hoy
- para la verdad vigente de embeddings/similitud, usar `README.md`, `SQLite.md`, `DATABASE_DEBUGGING.md` y los specs actualizados

## Rollback

Aplicaba solo a esa implementación histórica basada en `sqlite-vec`.
