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

  # Detect ACTUAL Windows linker failures, not the benign presence of a crate name.
  # MSVC unresolved-symbol errors (LNK2001/LNK2019) and the specific MNN symbols
  # (__std_min_4i/__std_max_4i) that the build-mnn-from-source flag exists to resolve.
  # A successful build that merely compiles onnxruntime/ort is NOT a failure.
  $linkerFailure = $text -match "LNK2001|LNK2019|__std_min_4i|__std_max_4i"
  if ($linkerFailure) {
    if ($DiagnosticsOnly) {
      Write-Host "[DIAG] ${Name}: linker failure signature detected (non-blocking diagnostic)"
    }
    else {
      Write-Host "[FAIL] ${Name}: linker failure signature detected on contract path"
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
# - default-features contract: PASS (must build/link clean; no MSVC LNK2001/LNK2019 or
#   MNN __std_min_4i/__std_max_4i unresolved-symbol regressions). BLOCKING gate — this
#   is the Pro (local-ml) build and must always compile.
# - no-default baseline (lean variant): NON-BLOCKING DIAGNOSTIC during the local-ml
#   strangler migration. Local ML (ort/onnxruntime, llama.cpp, MNN/PaddleOCR, the signed
#   managed-runtime download) is now opt-in behind the `local-ml` feature (default-on),
#   and the source that references it is being gated subsystem-by-subsystem (P1-P5). Until
#   that gating completes, a `--no-default-features` build cannot link, so this lane runs
#   as a [DIAG] that surfaces the shrinking compile punch-list without failing CI.
#   Flip it back to a BLOCKING contract (drop -DiagnosticsOnly) once the lean variant
#   links — strangler P5 — after which it becomes the permanent lean-build regression gate.
Invoke-Contract -Name "default-features contract" -CargoArgs @("build", "--manifest-path", $ManifestPath)
Invoke-Contract -Name "no-default baseline (lean variant, WIP under local-ml strangler)" -CargoArgs @("build", "--manifest-path", $ManifestPath, "--no-default-features") -DiagnosticsOnly $true
