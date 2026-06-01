Set-StrictMode -Version Latest

Describe "pnpm pre-install forensics script raw probe" {
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

    $script:TestRoot = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
    $script:RepoRoot = (Resolve-Path -Path (Join-Path $script:TestRoot "../../../../..")).Path
    $script:ForensicsPath = Join-Path -Path $script:RepoRoot -ChildPath "apps/desktop/src-tauri/scripts/ci/pnpm-preinstall-forensics.ps1"
    $script:LockfilePath = Join-Path -Path $script:RepoRoot -ChildPath "pnpm-lock.yaml"
  }

  It "emits raw lockfile head probe files next to evidence json" {
    $fixtureRoot = Join-Path -Path $env:TEMP -ChildPath ("pnpm-preinstall-raw-" + [guid]::NewGuid().ToString("N"))
    New-Item -Path $fixtureRoot -ItemType Directory -Force | Out-Null

    $outputRoot = Join-Path -Path $fixtureRoot -ChildPath ".ci-evidence/pnpm-preinstall"
    & $script:ForensicsPath -JobName "raw-probe" -LockfilePath $script:LockfilePath -OutputRoot $outputRoot

    $jobDir = Join-Path -Path $outputRoot -ChildPath "raw-probe"
    $jsonPath = Join-Path -Path $jobDir -ChildPath "preinstall-evidence.json"
    $rawHeadBinPath = Join-Path -Path $jobDir -ChildPath "lockfile-head-64.bin"
    $rawHeadHexPath = Join-Path -Path $jobDir -ChildPath "lockfile-head-64.hex.txt"
    $rawHeadPreviewPath = Join-Path -Path $jobDir -ChildPath "lockfile-head-64.preview.txt"

    Assert-True -Condition (Test-Path -Path $jsonPath) -Message "script must create preinstall-evidence.json"
    Assert-True -Condition (Test-Path -Path $rawHeadBinPath) -Message "script must emit binary head probe"
    Assert-True -Condition (Test-Path -Path $rawHeadHexPath) -Message "script must emit hex head probe"
    Assert-True -Condition (Test-Path -Path $rawHeadPreviewPath) -Message "script must emit text preview head probe"
  }

  It "keeps raw probe bytes consistent between bin file and hex file" {
    $fixtureRoot = Join-Path -Path $env:TEMP -ChildPath ("pnpm-preinstall-raw-" + [guid]::NewGuid().ToString("N"))
    New-Item -Path $fixtureRoot -ItemType Directory -Force | Out-Null

    $outputRoot = Join-Path -Path $fixtureRoot -ChildPath ".ci-evidence/pnpm-preinstall"
    & $script:ForensicsPath -JobName "raw-probe-custom" -LockfilePath $script:LockfilePath -OutputRoot $outputRoot

    $jobDir = Join-Path -Path $outputRoot -ChildPath "raw-probe-custom"
    $rawHeadBinPath = Join-Path -Path $jobDir -ChildPath "lockfile-head-64.bin"
    $rawHeadHexPath = Join-Path -Path $jobDir -ChildPath "lockfile-head-64.hex.txt"

    $binBytes = [System.IO.File]::ReadAllBytes($rawHeadBinPath)
    $hexFromBin = ($binBytes | ForEach-Object { $_.ToString("x2") }) -join ""
    $hexFromFile = (Get-Content -Path $rawHeadHexPath -Raw).Trim()

    Assert-True -Condition ($hexFromBin.Length -gt 0) -Message "binary head probe must contain bytes"
    Assert-True -Condition ($hexFromBin -eq $hexFromFile) -Message "hex probe must match binary head probe bytes"
  }

  It "captures git blob vs working tree lockfile comparison evidence" {
    $fixtureRoot = Join-Path -Path $env:TEMP -ChildPath ("pnpm-preinstall-raw-" + [guid]::NewGuid().ToString("N"))
    New-Item -Path $fixtureRoot -ItemType Directory -Force | Out-Null

    $outputRoot = Join-Path -Path $fixtureRoot -ChildPath ".ci-evidence/pnpm-preinstall"
    & $script:ForensicsPath -JobName "blob-vs-working" -LockfilePath $script:LockfilePath -OutputRoot $outputRoot

    $jobDir = Join-Path -Path $outputRoot -ChildPath "blob-vs-working"
    $jsonPath = Join-Path -Path $jobDir -ChildPath "preinstall-evidence.json"
    $workingBinPath = Join-Path -Path $jobDir -ChildPath "lockfile-head-64.bin"
    $blobBinPath = Join-Path -Path $jobDir -ChildPath "lockfile-head-64.git-blob.bin"
    $blobHexPath = Join-Path -Path $jobDir -ChildPath "lockfile-head-64.git-blob.hex.txt"
    $blobPreviewPath = Join-Path -Path $jobDir -ChildPath "lockfile-head-64.git-blob.preview.txt"

    Assert-True -Condition (Test-Path -Path $jsonPath) -Message "script must create preinstall-evidence.json"
    Assert-True -Condition (Test-Path -Path $workingBinPath) -Message "script must create working-tree head probe"
    Assert-True -Condition (Test-Path -Path $blobBinPath) -Message "script must create git-blob head probe"
    Assert-True -Condition (Test-Path -Path $blobHexPath) -Message "script must create git-blob hex head probe"
    Assert-True -Condition (Test-Path -Path $blobPreviewPath) -Message "script must create git-blob preview head probe"

    $evidence = Get-Content -Path $jsonPath -Raw | ConvertFrom-Json

    Assert-True -Condition ($null -ne $evidence.git_blob) -Message "evidence must include git_blob section"
    Assert-True -Condition ($null -ne $evidence.lockfile_comparison) -Message "evidence must include lockfile_comparison section"
    Assert-True -Condition ([string]::IsNullOrWhiteSpace($evidence.git_blob.sha256) -eq $false) -Message "git_blob.sha256 must be present"
    Assert-True -Condition ($evidence.git_blob.raw_head_probe_length -gt 0) -Message "git_blob.raw_head_probe_length must be greater than zero"
    Assert-True -Condition ([string]::IsNullOrWhiteSpace($evidence.lockfile_comparison.status) -eq $false) -Message "lockfile comparison status must be present"
  }

  It "degrades pnpm-dependent runtime/tooling fields when pnpm is unavailable" {
    $fixtureRoot = Join-Path -Path $env:TEMP -ChildPath ("pnpm-preinstall-raw-" + [guid]::NewGuid().ToString("N"))
    New-Item -Path $fixtureRoot -ItemType Directory -Force | Out-Null

    $outputRoot = Join-Path -Path $fixtureRoot -ChildPath ".ci-evidence/pnpm-preinstall"
    $originalPath = $env:PATH

    try {
      $pathEntries = @($originalPath -split ";" | Where-Object { [string]::IsNullOrWhiteSpace($_) -eq $false })
      $filteredEntries = @(
        foreach ($entry in $pathEntries) {
          $hasPnpmBinary = (
            (Test-Path -Path (Join-Path -Path $entry -ChildPath "pnpm.cmd")) -or
            (Test-Path -Path (Join-Path -Path $entry -ChildPath "pnpm.exe")) -or
            (Test-Path -Path (Join-Path -Path $entry -ChildPath "pnpm.ps1")) -or
            (Test-Path -Path (Join-Path -Path $entry -ChildPath "pnpm"))
          )

          if (-not $hasPnpmBinary) {
            $entry
          }
        }
      )

      $env:PATH = ($filteredEntries -join ";")

      & $script:ForensicsPath -JobName "pnpm-missing" -LockfilePath $script:LockfilePath -OutputRoot $outputRoot
    }
    finally {
      $env:PATH = $originalPath
    }

    $jobDir = Join-Path -Path $outputRoot -ChildPath "pnpm-missing"
    $jsonPath = Join-Path -Path $jobDir -ChildPath "preinstall-evidence.json"

    Assert-True -Condition (Test-Path -Path $jsonPath) -Message "script must still create preinstall-evidence.json when pnpm is unavailable"

    $evidence = Get-Content -Path $jsonPath -Raw | ConvertFrom-Json

    Assert-True -Condition ($evidence.runtime.pnpm_version -eq "unavailable") -Message "pnpm_version must degrade to unavailable when pnpm is missing"
    Assert-True -Condition ($evidence.runtime.pnpm_exec_path -eq "unavailable") -Message "pnpm_exec_path must degrade to unavailable when pnpm is missing"
    Assert-True -Condition ($evidence.tooling.store_dir -eq "unavailable") -Message "store_dir must degrade to unavailable when pnpm is missing"
    Assert-True -Condition ($evidence.tooling.virtual_store_dir -eq "unavailable") -Message "virtual_store_dir must degrade to unavailable when pnpm is missing"

    Assert-True -Condition ([string]::IsNullOrWhiteSpace($evidence.lockfile.sha256) -eq $false) -Message "lockfile.sha256 must still be present"
    Assert-True -Condition ($evidence.lockfile.raw_head_probe_length -gt 0) -Message "lockfile raw head probe must still be emitted"
    Assert-True -Condition ([string]::IsNullOrWhiteSpace($evidence.git_blob.sha256) -eq $false) -Message "git_blob.sha256 must still be present"
    Assert-True -Condition ($evidence.git_blob.raw_head_probe_length -gt 0) -Message "git_blob raw head probe must still be emitted"
    Assert-True -Condition ([string]::IsNullOrWhiteSpace($evidence.lockfile_comparison.status) -eq $false) -Message "lockfile comparison status must still be present"
  }
}
