import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(currentDir, '../../../..')
const tauriRoot = resolve(repoRoot, 'apps/desktop/src-tauri')

interface ManifestEntry {
  path: string
  sha256: string
  size: number
  executable?: boolean
}

interface RuntimePackFixtureManifest {
  pack_version: string
  app_version: string
  platform: string
  payload_profile: string
  release_injection_required: boolean
  external_artifacts_required: string[]
  python_relpath: string
  uv_relpath: string
  python_files: ManifestEntry[]
  uv_files: ManifestEntry[]
  script_files: ManifestEntry[]
  wheelhouse: ManifestEntry[]
  caches: ManifestEntry[]
  native_assets: ManifestEntry[]
}

function readDesktopVersion(): string {
  const tauriConfig = JSON.parse(readRepoFile('apps/desktop/src-tauri/tauri.conf.json')) as {
    version: string
  }
  const packageJson = JSON.parse(readRepoFile('apps/desktop/package.json')) as { version: string }

  expect(packageJson.version).toBe(tauriConfig.version)
  return tauriConfig.version
}

function readRepoFile(...segments: string[]): string {
  return readFileSync(resolve(repoRoot, ...segments), 'utf8')
}

function readPackManifest(platform: string): RuntimePackFixtureManifest {
  return JSON.parse(
    readRepoFile('apps/desktop/src-tauri/resources/runtime-pack', platform, 'manifest.json')
  ) as RuntimePackFixtureManifest
}

function allEntries(manifest: RuntimePackFixtureManifest): ManifestEntry[] {
  return [
    ...manifest.python_files,
    ...manifest.uv_files,
    ...manifest.script_files,
    ...manifest.wheelhouse,
    ...manifest.caches,
    ...manifest.native_assets,
  ]
}

describe('runtime pack packaging', () => {
  it('tauri bundles runtime-pack fixtures and linux native resource globs', () => {
    const config = JSON.parse(readRepoFile('apps/desktop/src-tauri/tauri.conf.json')) as {
      bundle?: { resources?: string[] }
    }

    const resources = config.bundle?.resources ?? []

    expect(resources).toContain('resources/runtime-pack/windows-x86_64/**/*')
    expect(resources).toContain('resources/runtime-pack/linux-x86_64/**/*')
    expect(resources).toContain('resources/lib/linux-x86_64/**/*')
  })

  it('ships fixture runtime-pack manifests for windows and linux with concrete payload files', () => {
    const platforms = ['windows-x86_64', 'linux-x86_64'] as const
    const desktopVersion = readDesktopVersion()

    for (const platform of platforms) {
      const manifest = readPackManifest(platform)
      const packRoot = resolve(tauriRoot, 'resources/runtime-pack', platform)

      expect(manifest.platform).toBe(platform)
      expect(manifest.app_version).toBe(desktopVersion)
      expect(manifest.payload_profile).toBe('fixture')
      expect(manifest.release_injection_required).toBe(true)
      expect(manifest.external_artifacts_required.length).toBeGreaterThan(0)
      expect(manifest.pack_version).toMatch(/^\d{4}\.\d{2}\.\d+$/)
      expect(manifest.python_relpath.length).toBeGreaterThan(0)
      expect(manifest.uv_relpath.length).toBeGreaterThan(0)
      expect(allEntries(manifest).length).toBeGreaterThan(5)

      for (const entry of allEntries(manifest)) {
        expect(entry.sha256).toMatch(/^[a-f0-9]{64}$/)
        expect(entry.size).toBeGreaterThan(0)
        expect(existsSync(resolve(packRoot, entry.path))).toBe(true)
      }
    }
  })

  it('wires runtime-pack assembly and offline smoke checks into release and ci workflows', () => {
    const releaseWorkflow = readRepoFile('.github/workflows/release.yml')
    const ciWorkflow = readRepoFile('.github/workflows/ci.yml')

    expect(releaseWorkflow).toContain('build_runtime_pack.py')
    expect(releaseWorkflow).toContain('--payload-root "$RUNTIME_PAYLOAD_ROOT"')
    expect(releaseWorkflow).toContain('--require-release-payload')
    expect(releaseWorkflow).toContain('runtime_payload_artifact')
    expect(releaseWorkflow).toContain('actions/download-artifact')
    expect(releaseWorkflow).toContain('ASSEMBLED_RUNTIME_PACK_ROOT="apps/desktop/src-tauri/target/runtime-pack"')
    expect(releaseWorkflow).toContain('runtime-pack-smoke')
    expect(releaseWorkflow).toContain('--release')
    expect(releaseWorkflow).toContain('Select runtime-pack platform')
    expect(releaseWorkflow).toContain('--root apps/desktop/src-tauri/target/runtime-pack')
    expect(releaseWorkflow).toContain('Inject assembled runtime-pack into bundle resources')

    expect(ciWorkflow).toContain('runtime-pack-smoke')
    expect(ciWorkflow).toContain('--root apps/desktop/src-tauri/target/runtime-pack')
    expect(ciWorkflow).toContain('src/lib/runtime-packaging.test.ts')
  })

  it('documents fixture scope and release-time artifact injection boundaries', () => {
    const rootReadme = readRepoFile('README.md')
    const resourcesReadme = readRepoFile('apps/desktop/src-tauri/resources/README.md')
    const maintenanceDoc = readRepoFile('apps/desktop/src-tauri/resources/runtime-pack/MAINTENANCE.md')
    const windowsAssemblyNotes = readRepoFile(
      'apps/desktop/src-tauri/resources/runtime-pack/windows-x86_64/ASSEMBLY_NOTES.md'
    )
    const linuxAssemblyNotes = readRepoFile(
      'apps/desktop/src-tauri/resources/runtime-pack/linux-x86_64/ASSEMBLY_NOTES.md'
    )

    expect(rootReadme).toContain('runtime-pack')
    expect(rootReadme).toContain('release-time artifact injection')
    expect(resourcesReadme).toContain('payload_profile: fixture')
    expect(resourcesReadme).toContain('Self-contained ahora')
    expect(maintenanceDoc).toContain('--payload-root')
    expect(maintenanceDoc).toContain('assembly-summary.json')
    expect(maintenanceDoc).toContain('windows-x86_64')
    expect(maintenanceDoc).toContain('linux-x86_64')
    expect(windowsAssemblyNotes).toContain('python/python.exe')
    expect(windowsAssemblyNotes).toContain('resources/lib/pdfium.dll')
    expect(linuxAssemblyNotes).toContain('python/bin/python3')
    expect(linuxAssemblyNotes).toContain('resources/lib/libonnxruntime.so')
  })
})
