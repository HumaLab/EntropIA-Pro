Set-StrictMode -Version Latest

Describe "pnpm pre-install classification" {
  BeforeAll {
    function Assert-True {
      param(
        [bool]$Condition,
        [string]$Message
      )

      if (-not $Condition) {
        throw $Message
      }
    }

    function Assert-Match {
      param(
        [string]$Value,
        [string]$Pattern,
        [string]$Message
      )

      if ($Value -notmatch $Pattern) {
        throw $Message
      }
    }

    $script:TestRoot = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
    $script:RepoRoot = (Resolve-Path -Path (Join-Path $script:TestRoot "../../../../..")).Path
    $script:classifierPath = Join-Path -Path $script:RepoRoot -ChildPath "apps/desktop/src-tauri/scripts/ci/pnpm-preinstall-classify.ps1"
  }

  It "classifies runtime/tooling when runtime fingerprints differ" {
    $fixtureRoot = Join-Path -Path $env:TEMP -ChildPath ("pnpm-preinstall-fixture-" + [guid]::NewGuid().ToString("N"))
    New-Item -Path $fixtureRoot -ItemType Directory -Force | Out-Null

    $evidenceAPath = Join-Path $fixtureRoot "lint.json"
    $evidenceBPath = Join-Path $fixtureRoot "rust.json"
    $outputPath = Join-Path $fixtureRoot "classification.md"

    @'
{
  "runtime": {
    "node_version": "v22.0.0",
    "pnpm_version": "9.15.4",
    "pnpm_exec_path": "/usr/bin/pnpm"
  },
  "tooling": {
    "store_dir": "/home/runner/.pnpm-store",
    "virtual_store_dir": "node_modules/.pnpm"
  },
  "lockfile": {
    "sha256": "same-hash",
    "has_bom": false,
    "has_nul": false,
    "has_yaml_multidoc_separator": false
  }
}
'@ | Set-Content -Path $evidenceAPath -Encoding utf8

    @'
{
  "runtime": {
    "node_version": "v20.18.0",
    "pnpm_version": "9.15.4",
    "pnpm_exec_path": "C:/pnpm/pnpm.cmd"
  },
  "tooling": {
    "store_dir": "C:/pnpm/store",
    "virtual_store_dir": "node_modules/.pnpm"
  },
  "lockfile": {
    "sha256": "same-hash",
    "has_bom": false,
    "has_nul": false,
    "has_yaml_multidoc_separator": false
  }
}
'@ | Set-Content -Path $evidenceBPath -Encoding utf8

    & $script:classifierPath -EvidencePaths @($evidenceAPath, $evidenceBPath) -OutputPath $outputPath

    Assert-True -Condition (Test-Path $outputPath) -Message "classification output must exist"
    $content = Get-Content -Path $outputPath -Raw
    Assert-Match -Value $content -Pattern "runtime/tooling" -Message "classifier should label runtime/tooling when runtime fingerprint differs"
  }

  It "classifies lockfile material when runtime matches but lockfile anomalies exist" {
    $fixtureRoot = Join-Path -Path $env:TEMP -ChildPath ("pnpm-preinstall-fixture-" + [guid]::NewGuid().ToString("N"))
    New-Item -Path $fixtureRoot -ItemType Directory -Force | Out-Null

    $evidenceAPath = Join-Path $fixtureRoot "lint.json"
    $evidenceBPath = Join-Path $fixtureRoot "rust.json"
    $outputPath = Join-Path $fixtureRoot "classification.md"

    @'
{
  "runtime": {
    "node_version": "v22.0.0",
    "pnpm_version": "9.15.4",
    "pnpm_exec_path": "/usr/bin/pnpm"
  },
  "tooling": {
    "store_dir": "/home/runner/.pnpm-store",
    "virtual_store_dir": "node_modules/.pnpm"
  },
  "lockfile": {
    "sha256": "same-hash",
    "has_bom": false,
    "has_nul": true,
    "has_yaml_multidoc_separator": false
  }
}
'@ | Set-Content -Path $evidenceAPath -Encoding utf8

    @'
{
  "runtime": {
    "node_version": "v22.0.0",
    "pnpm_version": "9.15.4",
    "pnpm_exec_path": "/usr/bin/pnpm"
  },
  "tooling": {
    "store_dir": "/home/runner/.pnpm-store",
    "virtual_store_dir": "node_modules/.pnpm"
  },
  "lockfile": {
    "sha256": "same-hash",
    "has_bom": false,
    "has_nul": false,
    "has_yaml_multidoc_separator": false
  }
}
'@ | Set-Content -Path $evidenceBPath -Encoding utf8

    & $script:classifierPath -EvidencePaths @($evidenceAPath, $evidenceBPath) -OutputPath $outputPath

    Assert-True -Condition (Test-Path $outputPath) -Message "classification output must exist"
    $content = Get-Content -Path $outputPath -Raw
    Assert-Match -Value $content -Pattern "lockfile material" -Message "classifier should label lockfile material when runtime matches and lockfile anomalies exist"
  }
}
