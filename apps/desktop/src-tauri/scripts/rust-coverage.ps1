Set-StrictMode -Version Latest

function Get-RustCoverageArgs {
  param(
    [string]$ManifestPath = "apps/desktop/src-tauri/Cargo.toml",
    [string]$OutputDir = "apps/desktop/src-tauri/coverage-rust"
  )

  return @(
    "llvm-cov",
    "--manifest-path", $ManifestPath,
    "--no-default-features",
    "--lcov",
    "--output-path", (Join-Path $OutputDir "lcov.info")
  )
}

function Invoke-RustCoverage {
  param(
    [string]$ManifestPath = "apps/desktop/src-tauri/Cargo.toml",
    [string]$OutputDir = "apps/desktop/src-tauri/coverage-rust"
  )

  New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
  $lcovPath = Join-Path $OutputDir "lcov.info"
  $summaryPath = Join-Path $OutputDir "summary.md"
  $args = Get-RustCoverageArgs -ManifestPath $ManifestPath -OutputDir $OutputDir

  $output = & cargo @args 2>&1
  $exitCode = $LASTEXITCODE
  $text = ($output | Out-String)

  if ($exitCode -eq 0) {
    if (-not (Test-Path -Path $lcovPath)) {
      "TN:" | Set-Content -Path $lcovPath -Encoding UTF8
    }
    "Coverage baseline generated with --no-default-features." | Set-Content -Path $summaryPath -Encoding UTF8
  }
  else {
    $text | Set-Content -Path $summaryPath -Encoding UTF8
  }

  return [pscustomobject]@{
    ExitCode = $exitCode
    Output = $text
    LcovPath = $lcovPath
    SummaryPath = $summaryPath
  }
}
