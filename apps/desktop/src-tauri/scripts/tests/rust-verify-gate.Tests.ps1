Set-StrictMode -Version Latest

Describe "test bootstrap" {
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

    function Assert-Equal {
      param(
        $Actual,
        $Expected,
        [string]$Message
      )

      if ($Actual -ne $Expected) {
        throw "${Message}. Expected='$Expected' Actual='$Actual'"
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
    $script:ScriptRoot = (Resolve-Path (Join-Path $script:TestRoot "..")).Path
    $script:RustVerifyGatePath = (Resolve-Path (Join-Path $script:ScriptRoot "rust-verify-gate.ps1")).Path

    . $script:RustVerifyGatePath
  }

  It "exposes script-scoped verify bootstrap path" {
    Assert-True -Condition (-not [string]::IsNullOrWhiteSpace($script:RustVerifyGatePath)) -Message "RustVerifyGatePath should be script-scoped and non-empty"
  }

  It "loads rust verify gate functions" {
    Assert-True -Condition ($null -ne (Get-Command Test-RequiresRustEvidence -ErrorAction SilentlyContinue)) -Message "Test-RequiresRustEvidence should be loaded"
    Assert-True -Condition ($null -ne (Get-Command Write-RustVerifyEvidence -ErrorAction SilentlyContinue)) -Message "Write-RustVerifyEvidence should be loaded"
  }
}

Describe "Test-RequiresRustEvidence" {
  It "returns true when at least one .rs file changed" {
    $requires = Test-RequiresRustEvidence -ChangedFiles @(
      "apps/desktop/src-tauri/src/lib.rs",
      "README.md"
    )

    Assert-Equal -Actual $requires -Expected $true -Message "must require evidence when .rs files changed"
  }

  It "returns false when no .rs files changed" {
    $requires = Test-RequiresRustEvidence -ChangedFiles @(
      "apps/desktop/src/routes/+page.svelte",
      "package.json"
    )

    Assert-Equal -Actual $requires -Expected $false -Message "must not require evidence when no .rs files changed"
  }
}

Describe "Write-RustVerifyEvidence" {
  It "writes mandatory sections when Rust evidence is required" {
    $tmp = Join-Path ([System.IO.Path]::GetTempPath()) ([guid]::NewGuid().ToString())
    New-Item -ItemType Directory -Path $tmp -Force | Out-Null
    $evidencePath = Join-Path $tmp "rust-verify-evidence.md"

    Write-RustVerifyEvidence -EvidencePath $evidencePath -RequiresRustEvidence $true -Classification @{
      coverage = "pass"
      fmt = "report-only"
      clippy = "infra-error"
    }

    $content = Get-Content -Path $evidencePath -Raw
    Assert-Match -Value $content -Pattern "Rust Coverage Baseline" -Message "evidence must include coverage section"
    Assert-Match -Value $content -Pattern "Rust Quality Report" -Message "evidence must include quality section"
    Assert-Match -Value $content -Pattern "Classification" -Message "evidence must include classification section"
    Assert-Match -Value $content -Pattern "coverage: pass" -Message "evidence must include coverage pass status"
  }

  It "writes explicit out-of-scope justification when no Rust files changed" {
    $tmp = Join-Path ([System.IO.Path]::GetTempPath()) ([guid]::NewGuid().ToString())
    New-Item -ItemType Directory -Path $tmp -Force | Out-Null
    $evidencePath = Join-Path $tmp "rust-verify-evidence.md"

    Write-RustVerifyEvidence -EvidencePath $evidencePath -RequiresRustEvidence $false -Classification @{}

    $content = Get-Content -Path $evidencePath -Raw
    Assert-Match -Value $content -Pattern "out-of-scope" -Message "evidence must include out-of-scope justification"
  }
}
