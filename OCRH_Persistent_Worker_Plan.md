# OCRH Persistent Worker Plan

Plan para optimizar la latencia de OCRH en EntropIA **sin cambiar a GPU**, enfocándose únicamente en un **worker Python persistente** para PaddleOCR-VL.

## Problema actual

Hoy OCRH ejecuta PaddleOCR-VL lanzando un proceso Python nuevo por cada asset.

Eso implica pagar en cada corrida:

- arranque del proceso Python
- import de dependencias pesadas
- inicialización del runtime
- carga/calientamiento del modelo
- parseo y serialización por proceso

En CPU esto hace que la latencia total sea muy alta.

## Objetivo

Reemplazar el modelo actual de **subprocess por request** por un **worker persistente** que:

- arranque una sola vez
- cargue PaddleOCR-VL una sola vez
- procese múltiples requests consecutivos
- responda resultados estructurados (`text`, `blocks`, `regions`, `image_width`, `image_height`)

## Resultado esperado

No apunta a hacer OCRH “instantáneo”, sino a:

- reducir drásticamente el costo fijo por request
- estabilizar tiempos entre corridas
- mejorar throughput cuando se procesan varios assets

---

## Arquitectura propuesta

### Estado actual

Rust:
- crea archivo temporal
- spawnea Python
- espera fin del proceso
- parsea JSON
- mata proceso al terminar

### Estado deseado

Rust:
- inicia worker Python persistente al primer uso o en warmup lazy
- mantiene handles de stdin/stdout del proceso
- envía requests JSON delimitados
- recibe responses JSON delimitadas
- reinicia worker si muere o entra en timeout fatal

Python worker:
- inicia una vez
- importa PaddleOCR-VL una vez
- instancia engine/modelo una vez
- entra en loop
- lee request
- procesa imagen
- devuelve JSON

---

## Contrato IPC propuesto

Usar un protocolo simple por líneas o sentinel frames.

### Request

```json
{
  "id": "uuid",
  "image_path": "C:/.../temp.png"
}
```

### Response success

```json
{
  "id": "uuid",
  "ok": true,
  "result": {
    "text": "...",
    "method": "paddle_vl",
    "blocks": [],
    "regions": [],
    "image_width": 2425,
    "image_height": 809
  }
}
```

### Response error

```json
{
  "id": "uuid",
  "ok": false,
  "error": "..."
}
```

## Recomendación

Mantener el patrón de sentinels robustos, similar al que ya usa el proyecto en otros subprocesses.

---

## Fases de implementación

### Fase 1 — diseño del worker persistente

Definir:

- formato de request/response
- estrategia de framing
- política de timeout
- política de reinicio
- manejo de stderr sin romper stdout estructurado

### Fase 2 — script Python persistente

Crear un script dedicado, por ejemplo:

- `paddle_vl_worker.py`

Responsabilidades:

- cargar modelo una vez
- leer mensajes en loop
- procesar requests
- devolver JSON estructurado
- no escribir ruido a stdout fuera del protocolo

### Fase 3 — wrapper Rust del worker

Crear un wrapper en Rust que:

- spawnee el worker una vez
- conserve pipes
- serialice requests
- espere responses por `id`
- reinicie el worker si falla

### Fase 4 — integración con OCRH

Reemplazar el uso actual de `engine.detect(temp_path)` por algo tipo:

- `persistent_worker.detect(temp_path)`

Sin cambiar el contrato superior de OCRH.

### Fase 5 — tolerancia a fallos

Implementar:

- timeout por request
- restart automático del worker
- fallback a OCR plano si el worker falla
- logs claros para distinguir:
  - startup
  - request
  - timeout
  - crash
  - restart

### Fase 6 — medición

Medir por separado:

- primer request (cold)
- requests siguientes (warm)
- lote de N imágenes

---

## Decisiones importantes

### 1. Un worker por app, no por request

Ese es el punto central del plan.

### 2. Un request a la vez al principio

No empezar con concurrencia compleja.

Primero:

- cola serial
- un worker
- una request activa

Después, si hiciera falta, se evalúa pool.

### 3. Mantener temp files al inicio

No optimizar todo junto.

Seguir usando `image_path` temporal al principio simplifica mucho el cambio.
Más adelante se puede evaluar stdin binario o memoria compartida.

### 4. Fallback fuerte

Si el worker persistente falla:

- reiniciar
- si no revive, fallback a OCR plano

No bloquear la app por una mejora de performance.

---

## Riesgos

### 1. Deadlocks de pipes

Si stdout/stderr no se drenan correctamente, el proceso puede colgarse.

### 2. Corrupción de protocolo

Si el script imprime logs a stdout fuera del framing, rompe el parser.

### 3. Estado interno sucio

Un modelo persistente puede acumular estado inesperado o memoria fragmentada.

### 4. Crash silencioso del worker

Rust tiene que detectar EOF / timeout / exit code y reiniciar.

### 5. Cleanup de procesos huérfanos

Cerrar bien el worker al cerrar la app.

---

## Métricas a comparar

Antes/después medir:

- tiempo total por request
- tiempo de primera corrida
- tiempo promedio de corridas consecutivas
- tasa de fallos/timeouts
- uso de memoria del worker persistente

## Hipótesis de mejora

La mejora principal debería venir de eliminar:

- imports repetidos
- carga repetida del modelo
- bootstrap repetido de Python/Paddle

---

## Criterio de éxito

El cambio se considera exitoso si:

- el primer request sigue funcionando correctamente
- requests posteriores son sensiblemente más rápidos
- la app tolera caídas del worker
- el contrato OCRH superior no se degrada
- `blocks/regions/text` siguen siendo correctos

---

## No objetivos de este plan

Este plan **no** incluye:

- GPU
- batching complejo
- pool de múltiples workers
- streaming incremental de resultados
- reemplazo del temp file por transporte binario

Todo eso puede venir después.

---

## Orden recomendado cuando se retome

1. diseñar protocolo request/response
2. implementar `paddle_vl_worker.py`
3. implementar wrapper persistente en Rust
4. integrar con OCRH detrás de feature flag interno
5. medir cold vs warm
6. endurecer restart/timeout/fallback

---

## Resumen ejecutivo

La mejor optimización realista sin GPU es dejar de arrancar PaddleOCR-VL desde cero en cada request.

La apuesta correcta es un **worker Python persistente, serial, reiniciable y con fallback**.

Eso no elimina el costo de inferencia en CPU, pero sí elimina gran parte del costo fijo por request y vuelve OCRH mucho más usable en sesiones reales.
