## EntropIA Pro vX.Y.Z

Una mejora enfocada en experiencia de uso, navegación documental y estabilidad general de la app desktop.

## Novedades principales
- mejora 1
- mejora 2
- mejora 3
- mejora 4

## Impacto para uso diario
- menos pasos para navegar entre documentos
- mejor continuidad al revisar colecciones grandes
- navegación más predecible entre vistas
- lectura y revisión más estables en documentos complejos

## Descargas
- Windows: `EntropIA_Pro_X.Y.Z_x64-setup.exe` o `EntropIA_Pro_X.Y.Z_x64_en-US.msi`
- Linux: `EntropIA_Pro_X.Y.Z_amd64.deb` o `EntropIA-Pro-X.Y.Z-1.x86_64.rpm`

## Checklist de publicación
- actualizar versión en `apps/desktop/package.json`
- actualizar versión en `apps/desktop/src-tauri/Cargo.toml`
- actualizar versión en `apps/desktop/src-tauri/tauri.conf.json`
- revisar `apps/desktop/src-tauri/Cargo.lock` si cambia la versión del paquete
- crear commit `chore: release vX.Y.Z`
- crear y subir tag `vX.Y.Z`
- ejecutar `pnpm --filter @entropia-pro/desktop tauri build`
- subir assets al release en GitHub
- publicar release y validar assets
- actualizar `README.md` con la release actual
