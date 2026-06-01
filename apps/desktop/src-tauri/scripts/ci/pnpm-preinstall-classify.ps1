param(
  [Parameter(Mandatory = $true)]
  [string[]]$EvidencePaths,

  [Parameter(Mandatory = $true)]
  [string]$OutputPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ($EvidencePaths.Count -lt 1) {
  throw "At least one evidence file is required for classification."
}

$evidences = @()
foreach ($path in $EvidencePaths) {
  if (-not (Test-Path -Path $path)) {
    throw "Evidence file not found: $path"
  }

  $raw = Get-Content -Path $path -Raw
  $evidences += ($raw | ConvertFrom-Json)
}

$first = $evidences[0]

function Get-Fingerprint {
  param($evidence)

  return @(
    $evidence.runtime.node_version,
    $evidence.runtime.pnpm_version,
    $evidence.runtime.pnpm_exec_path,
    $evidence.tooling.store_dir,
    $evidence.tooling.virtual_store_dir
  ) -join "|"
}

$baselineFingerprint = Get-Fingerprint -evidence $first
$runtimeInconsistent = $false

foreach ($evidence in $evidences) {
  $fingerprint = Get-Fingerprint -evidence $evidence
  if ($fingerprint -ne $baselineFingerprint) {
    $runtimeInconsistent = $true
    break
  }
}

$hasLockfileAnomaly = $false
foreach ($evidence in $evidences) {
  if ($evidence.lockfile.has_bom -or $evidence.lockfile.has_nul -or $evidence.lockfile.has_yaml_multidoc_separator) {
    $hasLockfileAnomaly = $true
    break
  }
}

$label = if ($runtimeInconsistent) {
  "runtime/tooling"
} elseif ($hasLockfileAnomaly) {
  "lockfile material"
} else {
  "inconclusive"
}

$summary = @(
  "# PNPM Pre-Install Classification",
  "",
  "- label: $label",
  "- evidence_count: $($EvidencePaths.Count)",
  "- runtime_inconsistent: $runtimeInconsistent",
  "- lockfile_anomaly_detected: $hasLockfileAnomaly"
)

$outputDir = Split-Path -Parent $OutputPath
if (-not [string]::IsNullOrWhiteSpace($outputDir)) {
  New-Item -Path $outputDir -ItemType Directory -Force | Out-Null
}

$summary -join [Environment]::NewLine | Set-Content -Path $OutputPath -Encoding utf8
Write-Host "Classification written to: $OutputPath"
