# shadcn-svelte en desktop

El camino soportado para esta app Svelte 5/Tauri es **shadcn-svelte CLI**. El MCP oficial de `shadcn@latest` no debe usarse para instalar componentes en este paquete.

## Camino rápido

```bash
pnpm --filter @entropia-pro/desktop exec shadcn-svelte add button
```

## Wiring esperado

| Área | Configuración |
| --- | --- |
| Registry compatible | `https://shadcn-svelte.com/registry` en `components.json` |
| CSS global | `src/app.css` con Tailwind v4 + `shadcn-svelte/tailwind.css` |
| Alias de utilidades | `$lib/utils` → `src/lib/utils.ts` |
| Helper requerido | `cn()` exportado desde `src/lib/utils.ts` |

## Por qué no MCP oficial

OpenCode puede arrancar `pnpm dlx shadcn@latest mcp --cwd apps/desktop`, pero ese MCP resuelve el registry oficial React (`@shadcn`), no el registry de `shadcn-svelte`.

Validación realizada:

- `get_project_registries` devuelve `@shadcn`.
- `get_add_command_for_items` para `@shadcn/button` devuelve `pnpm dlx shadcn@latest add @shadcn/button`.
- `view_items_in_registries` para `@shadcn/button` reporta dependencia `radix-ui`, señal de registry React.
- El registry Svelte compatible expone `button.json` con targets `.svelte` y `index.ts`.

Por eso `opencode.json` conserva la entrada MCP como referencia, pero la deja deshabilitada para evitar instalar componentes React por accidente.
