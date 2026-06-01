param(
  [string]$ManifestPath = "apps/desktop/src-tauri/Cargo.toml"
)

$ErrorActionPreference = "Continue"

function Invoke-Contract {
  param(
    [string]$Name,
    [string[]]$CargoArgs,
    [bool]$DiagnosticsOnly = $false
  )

  Write-Host "=== $Name ==="
  Write-Host "[INFO] Running: cargo $($CargoArgs -join ' ')"
  $output = & cargo @CargoArgs 2>&1
  $exitCode = $LASTEXITCODE
  $text = ($output | Out-String)

  Write-Host "[INFO] Exit code: $exitCode"

  $ortSignature = $text -match "LNK2001|LNK2019|__std_.*|onnxruntime|ort_sys"
  if ($ortSignature) {
    if ($DiagnosticsOnly) {
      Write-Host "[DIAG] ${Name}: ORT linker signature detected (non-blocking diagnostic)"
    }
    else {
      Write-Host "[FAIL] ${Name}: ORT linker signature detected on contract path"
      Write-Host $text
      exit 1
    }
  }

  if ($text -match "sqlite-vec-diskann\.c") {
    if ($DiagnosticsOnly) {
      Write-Host "[DIAG] ${Name}: detected sqlite-vec-diskann.c error (non-blocking diagnostic)"
    }
    else {
      Write-Host "[FAIL] ${Name}: detected sqlite-vec-diskann.c error"
      Write-Host $text
      exit 1
    }
  }

  if ($exitCode -ne 0) {
    if ($DiagnosticsOnly) {
      Write-Host "[DIAG] ${Name}: cargo exited with code $exitCode (non-blocking diagnostic)"
    }
    else {
      Write-Host "[FAIL] ${Name}: cargo exited with code $exitCode"
      Write-Host $text
      exit $exitCode
    }
  }

  if ($DiagnosticsOnly) {
    Write-Host "[DIAG] $Name complete"
    # Keep diagnostics truly non-blocking for the CI step.
    # PowerShell can propagate the last native command exit code unless reset.
    $global:LASTEXITCODE = 0
  }
  else {
    Write-Host "[PASS] $Name"
  }
}

# Expected outcomes:
# - default-features contract: PASS (must not include ORT linker signatures)
# - no-default baseline: PASS (must remain compile-safe)
# - embeddings opt-in diagnostics: non-blocking DIAG/PASS for visibility only
Invoke-Contract -Name "default-features contract" -CargoArgs @("test", "--manifest-path", $ManifestPath)
Invoke-Contract -Name "no-default baseline" -CargoArgs @("test", "--manifest-path", $ManifestPath, "--no-default-features")
Invoke-Contract -Name "embeddings opt-in diagnostics" -CargoArgs @("test", "--manifest-path", $ManifestPath, "--features", "embeddings") -DiagnosticsOnly $true
