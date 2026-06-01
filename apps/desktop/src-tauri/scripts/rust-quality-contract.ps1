Set-StrictMode -Version Latest

$scriptRoot = Split-Path -Parent $PSCommandPath
. (Join-Path $scriptRoot "rust-coverage.ps1")

$script:RustSignalPass = "pass"
$script:RustSignalReportOnly = "report-only"
$script:RustSignalInfraError = "infra-error"

function Test-IsInfraToolingIssue {
  param(
    [string]$Output
  )

  $infraPatterns = @(
    "no such command: llvm-cov",
    "error: no such subcommand",
    "not recognized as an internal or external command",
    "command not found",
    "llvm-tools-preview",
    "could not find",
    "is not installed"
  )

  foreach ($pattern in $infraPatterns) {
    if ($Output -match [regex]::Escape($pattern)) {
      return $true
    }
  }

  return $false
}

function Test-IsInvocationUsageError {
  param(
    [string]$Output
  )

  $usagePatterns = @(
    "unexpected argument",
    "Found argument",
    "which wasn't expected",
    "unrecognized option",
    "unknown option",
    "unexpected option"
  )

  foreach ($pattern in $usagePatterns) {
    if ($Output -match [regex]::Escape($pattern)) {
      return $true
    }
  }

  return $false
}

function Classify-RustSignal {
  param(
    [Parameter(Mandatory = $true)][string]$Tool,
    [Parameter(Mandatory = $true)][int]$ExitCode,
    [string]$Output = ""
  )

  if ($ExitCode -eq 0) {
    return $script:RustSignalPass
  }

  if (Test-IsInfraToolingIssue -Output $Output) {
    return $script:RustSignalInfraError
  }

  if ($Tool -in @("fmt", "clippy")) {
    if (Test-IsInvocationUsageError -Output $Output) {
      return $script:RustSignalInfraError
    }

    return $script:RustSignalReportOnly
  }

  return $script:RustSignalInfraError
}

function Write-RustQualitySummary {
  param(
    [Parameter(Mandatory = $true)][string]$SummaryPath,
    [Parameter(Mandatory = $true)][hashtable]$Results
  )

  $parent = Split-Path -Parent $SummaryPath
  if (-not [string]::IsNullOrWhiteSpace($parent)) {
    New-Item -ItemType Directory -Path $parent -Force | Out-Null
  }

  $lines = @(
    "## Rust Coverage Baseline (--no-default-features)",
    "- Status: $($Results.coverage.status)",
    "- Note: $($Results.coverage.note)",
    "",
    "## Rust Quality Report (fmt/clippy)",
    "- fmt status: $($Results.fmt.status)",
    "- fmt note: $($Results.fmt.note)",
    "- clippy status: $($Results.clippy.status)",
    "- clippy note: $($Results.clippy.note)",
    "",
    "## Classification",
    "- coverage: $($Results.coverage.status)",
    "- fmt: $($Results.fmt.status)",
    "- clippy: $($Results.clippy.status)"
  )

  Set-Content -Path $SummaryPath -Value ($lines -join [Environment]::NewLine) -Encoding UTF8
}

function Invoke-RustCommand {
  param(
    [Parameter(Mandatory = $true)][string[]]$Args
  )

  $output = & cargo @Args 2>&1
  $exitCode = $LASTEXITCODE

  return [pscustomobject]@{
    ExitCode = $exitCode
    Output = ($output | Out-String)
  }
}

function Invoke-RustQualityReport {
  param(
    [string]$ManifestPath = "apps/desktop/src-tauri/Cargo.toml",
    [string]$OutputDir = "apps/desktop/src-tauri/coverage-rust"
  )

  New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null

  $coverage = Invoke-RustCoverage -ManifestPath $ManifestPath -OutputDir $OutputDir
  $fmt = Invoke-RustCommand -Args @("fmt", "--manifest-path", $ManifestPath, "--check")
  $clippy = Invoke-RustCommand -Args @("clippy", "--manifest-path", $ManifestPath, "--no-default-features", "--all-targets", "--", "-D", "warnings")

  $coverageStatus = Classify-RustSignal -Tool "coverage" -ExitCode $coverage.ExitCode -Output $coverage.Output
  $fmtStatus = Classify-RustSignal -Tool "fmt" -ExitCode $fmt.ExitCode -Output $fmt.Output
  $clippyStatus = Classify-RustSignal -Tool "clippy" -ExitCode $clippy.ExitCode -Output $clippy.Output

  $summaryPath = Join-Path $OutputDir "summary.md"
  Write-RustQualitySummary -SummaryPath $summaryPath -Results @{
    coverage = @{ status = $coverageStatus; note = "lcov: $($coverage.LcovPath)" }
    fmt      = @{ status = $fmtStatus; note = (($fmt.Output -split "`r?`n")[0]) }
    clippy   = @{ status = $clippyStatus; note = (($clippy.Output -split "`r?`n")[0]) }
  }

  $fmt.Output | Set-Content -Path (Join-Path $OutputDir "fmt.log") -Encoding UTF8
  $clippy.Output | Set-Content -Path (Join-Path $OutputDir "clippy.log") -Encoding UTF8
  $coverage.Output | Set-Content -Path (Join-Path $OutputDir "coverage.log") -Encoding UTF8

  return [pscustomobject]@{
    CoverageStatus = $coverageStatus
    FmtStatus = $fmtStatus
    ClippyStatus = $clippyStatus
    OutputDir = $OutputDir
    SummaryPath = $summaryPath
  }
}

if ($MyInvocation.InvocationName -ne ".") {
  $result = Invoke-RustQualityReport
  Write-Host "[coverage] $($result.CoverageStatus)"
  Write-Host "[fmt] $($result.FmtStatus)"
  Write-Host "[clippy] $($result.ClippyStatus)"
}
