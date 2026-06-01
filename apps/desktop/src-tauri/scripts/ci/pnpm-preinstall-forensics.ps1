param(
  [Parameter(Mandatory = $true)]
  [string]$JobName,

  [string]$LockfilePath = "pnpm-lock.yaml",

  [string]$OutputRoot = ".ci-evidence/pnpm-preinstall",

  [string[]]$RequiredKeys = @(
    "node_version",
    "pnpm_version",
    "pnpm_exec_path",
    "store_dir",
    "virtual_store_dir",
    "sha256",
    "size_bytes",
    "line_count",
    "first_bytes_hex",
    "has_bom",
    "has_nul",
    "has_yaml_multidoc_separator",
    "git_blob_sha256",
    "git_blob_first_bytes_hex",
    "lockfile_comparison_status"
  )
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-CommandOutput {
  param([Parameter(Mandatory = $true)][string]$Command)

  try {
    $result = Invoke-Expression $Command
    if ($null -eq $result) {
      return ""
    }

    return (($result | Out-String).Trim())
  }
  catch {
    return "unavailable"
  }
}

function Get-CommandPathOrUnavailable {
  param([Parameter(Mandatory = $true)][string]$Name)

  try {
    $command = Get-Command $Name -ErrorAction Stop
    if ($null -eq $command -or [string]::IsNullOrWhiteSpace($command.Source)) {
      return "unavailable"
    }

    return $command.Source
  }
  catch {
    return "unavailable"
  }
}

function Get-HexFromBytes {
  param([byte[]]$Bytes)

  if ($null -eq $Bytes -or $Bytes.Length -eq 0) {
    return ""
  }

  return (($Bytes | ForEach-Object { $_.ToString("x2") }) -join "")
}

$repoRoot = (Resolve-Path -Path (Join-Path $PSScriptRoot "../../../../..")).Path

$resolvedLockfilePath = if ([System.IO.Path]::IsPathRooted($LockfilePath)) {
  (Resolve-Path -Path $LockfilePath).Path
} else {
  (Resolve-Path -Path (Join-Path $repoRoot $LockfilePath)).Path
}

$resolvedOutputRoot = if ([System.IO.Path]::IsPathRooted($OutputRoot)) {
  $OutputRoot
} else {
  Join-Path $repoRoot $OutputRoot
}

$relativeLockfilePath = if ([System.IO.Path]::IsPathRooted($LockfilePath)) {
  if ($resolvedLockfilePath.StartsWith($repoRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    $relativePath = $resolvedLockfilePath.Substring($repoRoot.Length).TrimStart("\", "/")
    $relativePath.Replace("\", "/")
  } else {
    throw "LockfilePath must resolve inside repository root to compare git blob. LockfilePath=$LockfilePath"
  }
} else {
  $LockfilePath.Replace("\", "/")
}

$jobOutputDir = Join-Path $resolvedOutputRoot $JobName

New-Item -Path $jobOutputDir -ItemType Directory -Force | Out-Null

$lockfileBytes = [System.IO.File]::ReadAllBytes($resolvedLockfilePath)
$sha256 = (Get-FileHash -Path $resolvedLockfilePath -Algorithm SHA256).Hash.ToLowerInvariant()
$lineCount = (Get-Content -Path $resolvedLockfilePath).Count

$firstBytesLength = [Math]::Min(32, $lockfileBytes.Length)
$firstBytesHex = if ($firstBytesLength -gt 0) {
  Get-HexFromBytes -Bytes ([byte[]]($lockfileBytes[0..($firstBytesLength - 1)]))
} else {
  ""
}

$rawProbeLength = [Math]::Min(64, $lockfileBytes.Length)
$rawHeadBytes = if ($rawProbeLength -gt 0) {
  [byte[]]($lockfileBytes[0..($rawProbeLength - 1)])
} else {
  [byte[]]@()
}

$rawHeadHex = if ($rawProbeLength -gt 0) {
  Get-HexFromBytes -Bytes $rawHeadBytes
} else {
  ""
}

$rawHeadPreview = if ($rawProbeLength -gt 0) {
  [System.Text.Encoding]::UTF8.GetString($rawHeadBytes)
} else {
  ""
}

$hasBom = $lockfileBytes.Length -ge 3 -and $lockfileBytes[0] -eq 0xEF -and $lockfileBytes[1] -eq 0xBB -and $lockfileBytes[2] -eq 0xBF
$hasNul = $lockfileBytes -contains 0
$lockfileText = Get-Content -Path $resolvedLockfilePath -Raw
$hasYamlMultidocSeparator = $lockfileText -match "(?m)^---\s*$"

$gitBlobProcessInfo = New-Object System.Diagnostics.ProcessStartInfo
$gitBlobProcessInfo.FileName = "git"
$gitBlobProcessInfo.Arguments = "cat-file blob `"HEAD:$relativeLockfilePath`""
$gitBlobProcessInfo.RedirectStandardOutput = $true
$gitBlobProcessInfo.RedirectStandardError = $true
$gitBlobProcessInfo.UseShellExecute = $false
$gitBlobProcessInfo.CreateNoWindow = $true

$gitBlobProcess = [System.Diagnostics.Process]::Start($gitBlobProcessInfo)
$gitBlobStream = New-Object System.IO.MemoryStream
$gitBlobProcess.StandardOutput.BaseStream.CopyTo($gitBlobStream)
$gitBlobProcess.WaitForExit()

if ($gitBlobProcess.ExitCode -ne 0) {
  $gitBlobError = $gitBlobProcess.StandardError.ReadToEnd()
  throw "Failed to read git blob HEAD:$relativeLockfilePath. $gitBlobError"
}

$gitBlobBytes = $gitBlobStream.ToArray()
$gitBlobSha256 = if ($gitBlobBytes.Length -gt 0) {
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try {
    ([System.BitConverter]::ToString($sha.ComputeHash($gitBlobBytes)).Replace("-", "").ToLowerInvariant())
  }
  finally {
    $sha.Dispose()
  }
} else {
  ""
}

$gitBlobFirstBytesLength = [Math]::Min(32, $gitBlobBytes.Length)
$gitBlobFirstBytesHex = if ($gitBlobFirstBytesLength -gt 0) {
  Get-HexFromBytes -Bytes ([byte[]]($gitBlobBytes[0..($gitBlobFirstBytesLength - 1)]))
} else {
  ""
}

$gitBlobRawProbeLength = [Math]::Min(64, $gitBlobBytes.Length)
$gitBlobRawHeadBytes = if ($gitBlobRawProbeLength -gt 0) {
  [byte[]]($gitBlobBytes[0..($gitBlobRawProbeLength - 1)])
} else {
  [byte[]]@()
}

$gitBlobRawHeadHex = if ($gitBlobRawProbeLength -gt 0) {
  Get-HexFromBytes -Bytes $gitBlobRawHeadBytes
} else {
  ""
}

$gitBlobRawHeadPreview = if ($gitBlobRawProbeLength -gt 0) {
  [System.Text.Encoding]::UTF8.GetString($gitBlobRawHeadBytes)
} else {
  ""
}

$gitBlobHasBom = $gitBlobBytes.Length -ge 3 -and $gitBlobBytes[0] -eq 0xEF -and $gitBlobBytes[1] -eq 0xBB -and $gitBlobBytes[2] -eq 0xBF
$gitBlobHasNul = $gitBlobBytes -contains 0
$gitBlobText = [System.Text.Encoding]::UTF8.GetString($gitBlobBytes)
$gitBlobHasYamlMultidocSeparator = $gitBlobText -match "(?m)^---\s*$"
$gitBlobLineCount = if ($gitBlobText.Length -eq 0) { 0 } else { ($gitBlobText -split "`r?`n").Count }

$comparisonStatus = if (
  $sha256 -eq $gitBlobSha256 -and
  $rawHeadHex -eq $gitBlobRawHeadHex -and
  $lockfileBytes.Length -eq $gitBlobBytes.Length
) {
  "equal"
} else {
  "different"
}

$classificationHint = if ($hasBom -or $hasNul -or $hasYamlMultidocSeparator) { "lockfile_material" } else { "inconclusive" }

$evidence = [ordered]@{
  schema_version = "1"
  job = [ordered]@{
    name = $JobName
    runner_os = $env:RUNNER_OS
    runner_arch = $env:RUNNER_ARCH
    run_id = $env:GITHUB_RUN_ID
  }
  runtime = [ordered]@{
    node_version = (Get-CommandOutput -Command "node -v")
    pnpm_version = (Get-CommandOutput -Command "pnpm -v")
    pnpm_exec_path = (Get-CommandPathOrUnavailable -Name "pnpm")
  }
  tooling = [ordered]@{
    store_dir = (Get-CommandOutput -Command "pnpm config get store-dir")
    virtual_store_dir = (Get-CommandOutput -Command "pnpm config get virtual-store-dir")
  }
  lockfile = [ordered]@{
    path = $LockfilePath
    sha256 = $sha256
    size_bytes = $lockfileBytes.Length
    line_count = $lineCount
    first_bytes_hex = $firstBytesHex
    raw_head_probe_length = $rawProbeLength
    raw_head_bin_file = "lockfile-head-64.bin"
    raw_head_hex_file = "lockfile-head-64.hex.txt"
    raw_head_preview_file = "lockfile-head-64.preview.txt"
    has_bom = $hasBom
    has_nul = $hasNul
    has_yaml_multidoc_separator = $hasYamlMultidocSeparator
  }
  git_blob = [ordered]@{
    path = "HEAD:$relativeLockfilePath"
    sha256 = $gitBlobSha256
    size_bytes = $gitBlobBytes.Length
    line_count = $gitBlobLineCount
    first_bytes_hex = $gitBlobFirstBytesHex
    raw_head_probe_length = $gitBlobRawProbeLength
    raw_head_bin_file = "lockfile-head-64.git-blob.bin"
    raw_head_hex_file = "lockfile-head-64.git-blob.hex.txt"
    raw_head_preview_file = "lockfile-head-64.git-blob.preview.txt"
    has_bom = $gitBlobHasBom
    has_nul = $gitBlobHasNul
    has_yaml_multidoc_separator = $gitBlobHasYamlMultidocSeparator
  }
  lockfile_comparison = [ordered]@{
    status = $comparisonStatus
    sha256_equal = ($sha256 -eq $gitBlobSha256)
    size_equal = ($lockfileBytes.Length -eq $gitBlobBytes.Length)
    raw_head_hex_equal = ($rawHeadHex -eq $gitBlobRawHeadHex)
  }
  classification_hint = $classificationHint
  required_keys = $RequiredKeys
}

$jsonPath = Join-Path $jobOutputDir "preinstall-evidence.json"
$summaryPath = Join-Path $jobOutputDir "summary.md"
$rawHeadBinPath = Join-Path $jobOutputDir "lockfile-head-64.bin"
$rawHeadHexPath = Join-Path $jobOutputDir "lockfile-head-64.hex.txt"
$rawHeadPreviewPath = Join-Path $jobOutputDir "lockfile-head-64.preview.txt"
$gitBlobRawHeadBinPath = Join-Path $jobOutputDir "lockfile-head-64.git-blob.bin"
$gitBlobRawHeadHexPath = Join-Path $jobOutputDir "lockfile-head-64.git-blob.hex.txt"
$gitBlobRawHeadPreviewPath = Join-Path $jobOutputDir "lockfile-head-64.git-blob.preview.txt"

[System.IO.File]::WriteAllBytes($rawHeadBinPath, $rawHeadBytes)
$rawHeadHex | Set-Content -Path $rawHeadHexPath -Encoding utf8
$rawHeadPreview | Set-Content -Path $rawHeadPreviewPath -Encoding utf8
[System.IO.File]::WriteAllBytes($gitBlobRawHeadBinPath, $gitBlobRawHeadBytes)
$gitBlobRawHeadHex | Set-Content -Path $gitBlobRawHeadHexPath -Encoding utf8
$gitBlobRawHeadPreview | Set-Content -Path $gitBlobRawHeadPreviewPath -Encoding utf8

$evidence | ConvertTo-Json -Depth 8 | Set-Content -Path $jsonPath -Encoding utf8

$summary = @(
  "# PNPM pre-install evidence ($JobName)",
  "",
  "- runner_os: $($evidence.job.runner_os)",
  "- runner_arch: $($evidence.job.runner_arch)",
  "- run_id: $($evidence.job.run_id)",
  "- node_version: $($evidence.runtime.node_version)",
  "- pnpm_version: $($evidence.runtime.pnpm_version)",
  "- pnpm_exec_path: $($evidence.runtime.pnpm_exec_path)",
  "- store_dir: $($evidence.tooling.store_dir)",
  "- virtual_store_dir: $($evidence.tooling.virtual_store_dir)",
  "- lockfile.sha256: $($evidence.lockfile.sha256)",
  "- lockfile.size_bytes: $($evidence.lockfile.size_bytes)",
  "- lockfile.line_count: $($evidence.lockfile.line_count)",
  "- lockfile.first_bytes_hex: $($evidence.lockfile.first_bytes_hex)",
  "- lockfile.raw_head_probe_length: $($evidence.lockfile.raw_head_probe_length)",
  "- lockfile.raw_head_bin_file: $($evidence.lockfile.raw_head_bin_file)",
  "- lockfile.raw_head_hex_file: $($evidence.lockfile.raw_head_hex_file)",
  "- lockfile.raw_head_preview_file: $($evidence.lockfile.raw_head_preview_file)",
  "- lockfile.has_bom: $($evidence.lockfile.has_bom)",
  "- lockfile.has_nul: $($evidence.lockfile.has_nul)",
  "- lockfile.has_yaml_multidoc_separator: $($evidence.lockfile.has_yaml_multidoc_separator)",
  "- git_blob.path: $($evidence.git_blob.path)",
  "- git_blob.sha256: $($evidence.git_blob.sha256)",
  "- git_blob.size_bytes: $($evidence.git_blob.size_bytes)",
  "- git_blob.line_count: $($evidence.git_blob.line_count)",
  "- git_blob.first_bytes_hex: $($evidence.git_blob.first_bytes_hex)",
  "- git_blob.raw_head_probe_length: $($evidence.git_blob.raw_head_probe_length)",
  "- git_blob.raw_head_bin_file: $($evidence.git_blob.raw_head_bin_file)",
  "- git_blob.raw_head_hex_file: $($evidence.git_blob.raw_head_hex_file)",
  "- git_blob.raw_head_preview_file: $($evidence.git_blob.raw_head_preview_file)",
  "- git_blob.has_bom: $($evidence.git_blob.has_bom)",
  "- git_blob.has_nul: $($evidence.git_blob.has_nul)",
  "- git_blob.has_yaml_multidoc_separator: $($evidence.git_blob.has_yaml_multidoc_separator)",
  "- lockfile_comparison.status: $($evidence.lockfile_comparison.status)",
  "- lockfile_comparison.sha256_equal: $($evidence.lockfile_comparison.sha256_equal)",
  "- lockfile_comparison.size_equal: $($evidence.lockfile_comparison.size_equal)",
  "- lockfile_comparison.raw_head_hex_equal: $($evidence.lockfile_comparison.raw_head_hex_equal)",
  "- classification_hint: $($evidence.classification_hint)"
)

$summary -join [Environment]::NewLine | Set-Content -Path $summaryPath -Encoding utf8

Write-Host "PNPM pre-install evidence written to: $jobOutputDir"
