param(
  [string]$ModelId = "mrm8488/bert-spanish-cased-finetuned-ner",
  [string]$OutputDir = "apps/desktop/src-tauri/resources/models/ner",
  [string]$OrtDllPath = ""
)

$ErrorActionPreference = "Stop"

$root = Resolve-Path "."
$target = Join-Path $root $OutputDir

if (-not (Test-Path $target)) {
  New-Item -ItemType Directory -Path $target -Force | Out-Null
}

Write-Host "[ner] Exporting Hugging Face model to ONNX..."
Write-Host "[ner] Target directory: $target"

$tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("entropia-ner-" + [guid]::NewGuid())
New-Item -ItemType Directory -Path $tmp -Force | Out-Null

try {
  $exportCmd = "python -m optimum.exporters.onnx -m $ModelId --task token-classification `"$tmp`""
  Write-Host "[ner] Running: $exportCmd"
  Invoke-Expression $exportCmd

  Copy-Item (Join-Path $tmp "model.onnx") (Join-Path $target "model.onnx") -Force

  python -c "from transformers import AutoTokenizer, AutoConfig; AutoTokenizer.from_pretrained('$ModelId').save_pretrained(r'$target'); AutoConfig.from_pretrained('$ModelId').save_pretrained(r'$target')"

  foreach ($file in @("tokenizer.json", "config.json", "special_tokens_map.json", "tokenizer_config.json")) {
    $src = Join-Path $tmp $file
    if (Test-Path $src) {
      Copy-Item $src (Join-Path $target $file) -Force
    }
  }

  if (-not $OrtDllPath) {
    $OrtDllPath = python -c "import os, onnxruntime; from pathlib import Path; root = Path(onnxruntime.__file__).resolve().parent; cands = [root / 'capi' / 'onnxruntime.dll', root / 'onnxruntime.dll']; print(next((str(p) for p in cands if p.exists()), ''))"
  }

  if ($OrtDllPath -and (Test-Path $OrtDllPath)) {
    Copy-Item $OrtDllPath (Join-Path $target ([System.IO.Path]::GetFileName($OrtDllPath))) -Force
    Write-Host "[ner] Copied ORT runtime from: $OrtDllPath"
  } else {
    Write-Host "[ner] No ORT runtime copied."
    Write-Host "[ner] On Windows, place onnxruntime.dll in $target or set ORT_DYLIB_PATH."
  }

  Write-Host "[ner] Done. Final files:"
  Get-ChildItem $target | Select-Object Name, Length
}
finally {
  if (Test-Path $tmp) {
    Remove-Item $tmp -Recurse -Force
  }
}
