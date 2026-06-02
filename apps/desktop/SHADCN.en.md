# shadcn-svelte in desktop

The supported path for this Svelte 5/Tauri app is the **shadcn-svelte CLI**. The official `shadcn@latest` MCP should not be used to install components in this package.

## Quick path

```bash
pnpm --filter @entropia-pro/desktop exec shadcn-svelte add button
```

## Expected wiring

| Area | Configuration |
| --- | --- |
| Compatible registry | `https://shadcn-svelte.com/registry` in `components.json` |
| Global CSS | `src/app.css` with Tailwind v4 + `shadcn-svelte/tailwind.css` |
| Utility alias | `$lib/utils` → `src/lib/utils.ts` |
| Required helper | `cn()` exported from `src/lib/utils.ts` |

## Why not the official MCP

OpenCode can start `pnpm dlx shadcn@latest mcp --cwd apps/desktop`, but that MCP resolves the official React registry (`@shadcn`), not the `shadcn-svelte` registry.

Validation performed:

- `get_project_registries` returns `@shadcn`.
- `get_add_command_for_items` for `@shadcn/button` returns `pnpm dlx shadcn@latest add @shadcn/button`.
- `view_items_in_registries` for `@shadcn/button` reports `radix-ui`, which identifies the React registry.
- The compatible Svelte registry exposes `button.json` with `.svelte` and `index.ts` targets.

For that reason, `opencode.json` keeps the MCP entry as a reference, but leaves it disabled to avoid installing React components by accident.
