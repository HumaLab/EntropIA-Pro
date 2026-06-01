import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { resolve } from 'path'

export default defineConfig({
  plugins: [svelte()],
  optimizeDeps: {
    // Restrict dep-scan to the real frontend entry.
    // Without this, Vite may crawl every HTML file under apps/desktop,
    // including Rustdoc output under src-tauri/target/doc, which on Windows
    // can trigger EMFILE loops during dependency re-optimization.
    entries: ['index.html'],

    // @entropia/ui and @entropia/store are linked workspace packages that export
    // source files. Letting Vite discover their transitive bare imports during the
    // first browser crawl can rewrite the optimized dependency graph mid-startup.
    // Tauri's WebView is particularly sensitive to that cache churn and can end up
    // requesting stale chunk-*.js files from a previous optimization pass.
    //
    // Pin the full runtime dep set up front so the prebundle result is deterministic
    // across Linux and Windows cold starts.
    include: [
      '@tauri-apps/api/core',
      '@tauri-apps/api/event',
      '@tauri-apps/api/path',
      '@tauri-apps/api/webview',
      '@tauri-apps/plugin-dialog',
      '@tauri-apps/plugin-fs',
      '@tiptap/core',
      '@tiptap/extension-link',
      '@tiptap/extension-placeholder',
      '@tiptap/extension-underline',
      '@tiptap/starter-kit',
      'drizzle-orm',
      'drizzle-orm/sqlite-core',
      'drizzle-orm/sqlite-proxy',
      'leaflet',
      'pdfjs-dist',
      'svelte',
      'svelte/store',
    ],
    noDiscovery: true,
    holdUntilCrawlEnd: true,
  },
  resolve: {
    alias: {
      $lib: resolve(__dirname, './src/lib'),
    },
  },
  // Tauri expects a fixed port in dev
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      // Watch packages/ui for cross-package HMR
      ignored: ['**/src-tauri/**'],
    },
  },
  build: {
    target: 'chrome105',
    minify: !process.env.TAURI_DEBUG ? 'esbuild' : false,
    sourcemap: !!process.env.TAURI_DEBUG,
  },
})
