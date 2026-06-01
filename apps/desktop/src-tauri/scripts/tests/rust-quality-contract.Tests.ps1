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
    $script:RustQualityContractPath = (Resolve-Path (Join-Path $script:ScriptRoot "rust-quality-contract.ps1")).Path
    $script:RustCoveragePath = (Resolve-Path (Join-Path $script:ScriptRoot "rust-coverage.ps1")).Path

    . $script:RustQualityContractPath
    . $script:RustCoveragePath
  }

  It "exposes script-scoped bootstrap paths" {
    Assert-True -Condition (-not [string]::IsNullOrWhiteSpace($script:RustQualityContractPath)) -Message "RustQualityContractPath should be script-scoped and non-empty"
    Assert-True -Condition (-not [string]::IsNullOrWhiteSpace($script:RustCoveragePath)) -Message "RustCoveragePath should be script-scoped and non-empty"
  }

  It "loads rust quality contract functions" {
    Assert-True -Condition ($null -ne (Get-Command Classify-RustSignal -ErrorAction SilentlyContinue)) -Message "Classify-RustSignal should be loaded"
    Assert-True -Condition ($null -ne (Get-Command Get-RustCoverageArgs -ErrorAction SilentlyContinue)) -Message "Get-RustCoverageArgs should be loaded"
    Assert-True -Condition ($null -ne (Get-Command Write-RustQualitySummary -ErrorAction SilentlyContinue)) -Message "Write-RustQualitySummary should be loaded"
  }
}

Describe "Classify-RustSignal" {
  It "returns pass when command succeeds" {
    $result = Classify-RustSignal -Tool "coverage" -ExitCode 0 -Output "ok"
    Assert-Equal -Actual $result -Expected "pass" -Message "coverage success must classify as pass"
  }

  It "returns report-only for fmt debt findings" {
    $result = Classify-RustSignal -Tool "fmt" -ExitCode 1 -Output "Diff in src/main.rs"
    Assert-Equal -Actual $result -Expected "report-only" -Message "fmt debt must classify as report-only"
  }

  It "returns report-only for clippy debt findings" {
    $result = Classify-RustSignal -Tool "clippy" -ExitCode 101 -Output "warning: use of unwrap"
    Assert-Equal -Actual $result -Expected "report-only" -Message "clippy debt must classify as report-only"
  }

  It "returns infra-error for missing coverage tooling" {
    $result = Classify-RustSignal -Tool "coverage" -ExitCode 1 -Output "no such command: llvm-cov"
    Assert-Equal -Actual $result -Expected "infra-error" -Message "missing coverage tooling must classify as infra-error"
  }

  It "returns infra-error for fmt invocation errors" {
    $result = Classify-RustSignal -Tool "fmt" -ExitCode 1 -Output "error: unexpected argument '--bogus' found"
    Assert-Equal -Actual $result -Expected "infra-error" -Message "fmt invocation errors must classify as infra-error"
  }

  It "returns infra-error for clippy invocation errors" {
    $result = Classify-RustSignal -Tool "clippy" -ExitCode 1 -Output "error: Found argument '--bogus' which wasn't expected"
    Assert-Equal -Actual $result -Expected "infra-error" -Message "clippy invocation errors must classify as infra-error"
  }
}

Describe "Get-RustCoverageArgs" {
  It "builds contractual coverage command with no-default-features" {
    $args = Get-RustCoverageArgs -ManifestPath "apps/desktop/src-tauri/Cargo.toml" -OutputDir "target/coverage-rust"
    $joined = $args -join " "

    Assert-Match -Value $joined -Pattern "llvm-cov" -Message "coverage command must include llvm-cov"
    Assert-Match -Value $joined -Pattern "--manifest-path apps/desktop/src-tauri/Cargo.toml" -Message "coverage command must include manifest path"
    Assert-Match -Value $joined -Pattern "--no-default-features" -Message "coverage command must include no-default-features baseline"
    Assert-Match -Value $joined -Pattern "--lcov" -Message "coverage command must request lcov output"
  }
}

Describe "Write-RustQualitySummary" {
  It "writes report-first markdown with classifications" {
    $tmp = Join-Path ([System.IO.Path]::GetTempPath()) ([guid]::NewGuid().ToString())
    New-Item -ItemType Directory -Path $tmp -Force | Out-Null

    $summaryPath = Join-Path $tmp "summary.md"
    $result = @{
      coverage = @{ status = "pass"; note = "coverage generated" }
      fmt      = @{ status = "report-only"; note = "formatting debt" }
      clippy   = @{ status = "infra-error"; note = "tool missing" }
    }

    Write-RustQualitySummary -SummaryPath $summaryPath -Results $result
    $content = Get-Content -Path $summaryPath -Raw

    Assert-Match -Value $content -Pattern "Rust Coverage Baseline" -Message "summary must include coverage section"
    Assert-Match -Value $content -Pattern "coverage: pass" -Message "summary must include coverage classification"
    Assert-Match -Value $content -Pattern "fmt: report-only" -Message "summary must include fmt classification"
    Assert-Match -Value $content -Pattern "clippy: infra-error" -Message "summary must include clippy classification"
  }
}
