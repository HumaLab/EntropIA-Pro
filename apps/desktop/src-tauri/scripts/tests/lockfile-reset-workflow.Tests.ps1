Set-StrictMode -Version Latest

Describe "lockfile-reset diagnostic workflow contract" {
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
    $script:RepoRoot = (Resolve-Path -Path (Join-Path $script:TestRoot "../../../../..")).Path
    $script:workflowPath = Join-Path -Path $script:RepoRoot -ChildPath ".github/workflows/lockfile-reset.yml"
  }

  It "defines standalone lockfile reset probe workflow" {
    Assert-True -Condition (Test-Path -Path $script:workflowPath) -Message "lockfile-reset workflow file must exist"

    $workflow = Get-Content -Path $script:workflowPath -Raw

    Assert-Match -Value $workflow -Pattern "name:\s*Lockfile Reset Probe" -Message "workflow must be explicitly named Lockfile Reset Probe"
    Assert-Match -Value $workflow -Pattern "on:\s*[\s\S]*?workflow_dispatch:" -Message "workflow must support manual workflow_dispatch trigger"
    Assert-Match -Value $workflow -Pattern "on:\s*[\s\S]*?push:\s*[\s\S]*?paths:" -Message "workflow must define push path filters"
    Assert-True -Condition (-not ($workflow -match "pull_request:")) -Message "workflow must stay isolated and not trigger on pull_request"
  }

  It "limits push paths to lockfile/install-related files" {
    $workflow = Get-Content -Path $script:workflowPath -Raw

    Assert-Match -Value $workflow -Pattern "push:\s*[\s\S]*?paths:\s*[\s\S]*?-\s*pnpm-lock\.yaml" -Message "push filter must include pnpm-lock.yaml"
    Assert-Match -Value $workflow -Pattern "push:\s*[\s\S]*?paths:\s*[\s\S]*?-\s*package\.json" -Message "push filter must include package.json"
    Assert-Match -Value $workflow -Pattern "push:\s*[\s\S]*?paths:\s*[\s\S]*?-\s*pnpm-workspace\.yaml" -Message "push filter must include pnpm-workspace.yaml"
    Assert-Match -Value $workflow -Pattern "push:\s*[\s\S]*?paths:\s*[\s\S]*?-\s*\.npmrc" -Message "push filter must include .npmrc"
    Assert-Match -Value $workflow -Pattern "push:\s*[\s\S]*?paths:\s*[\s\S]*?-\s*\.github/workflows/lockfile-reset\.yml" -Message "push filter must include the workflow file itself"
  }

  It "pins ubuntu, Node 20 and pnpm 9.15.4 in a single diagnostic job" {
    $workflow = Get-Content -Path $script:workflowPath -Raw

    Assert-Match -Value $workflow -Pattern "jobs:\s*[\s\S]*?lockfile-reset-probe:" -Message "workflow must declare a single lockfile-reset-probe job"
    Assert-Match -Value $workflow -Pattern "lockfile-reset-probe:[\s\S]*?runs-on:\s*ubuntu-latest" -Message "diagnostic job must run on ubuntu-latest"
    Assert-Match -Value $workflow -Pattern "lockfile-reset-probe:[\s\S]*?name:\s*Setup pnpm[\s\S]*?uses:\s*pnpm/action-setup@v6" -Message "workflow must use pnpm/action-setup in probe job"
    Assert-Match -Value $workflow -Pattern "with:[\s\S]*?version:\s*9\.15\.4" -Message "workflow must pin pnpm 9.15.4"
    Assert-Match -Value $workflow -Pattern "lockfile-reset-probe:[\s\S]*?name:\s*Setup Node[\s\S]*?uses:\s*actions/setup-node@v6[\s\S]*?node-version:\s*20" -Message "workflow must pin Node 20"
  }

  It "defines checkpoint diagnostics after checkout, pnpm setup and node setup" {
    $workflow = Get-Content -Path $script:workflowPath -Raw

    Assert-Match -Value $workflow -Pattern "name:\s*Checkpoint after Checkout" -Message "workflow must include checkpoint diagnostics step right after checkout"
    Assert-Match -Value $workflow -Pattern "name:\s*Checkpoint after Setup pnpm" -Message "workflow must include checkpoint diagnostics step right after pnpm setup"
    Assert-Match -Value $workflow -Pattern "name:\s*Checkpoint after Setup Node" -Message "workflow must include checkpoint diagnostics step right after Node setup"

    Assert-Match -Value $workflow -Pattern "Checkpoint after Checkout[\s\S]*?checkpoint\.after_checkout\.sha256=" -Message "checkout checkpoint must log lockfile sha256"
    Assert-Match -Value $workflow -Pattern "Checkpoint after Checkout[\s\S]*?checkpoint\.after_checkout\.first_line_is_yaml_doc=" -Message "checkout checkpoint must log first-line YAML doc marker check"
    Assert-Match -Value $workflow -Pattern "Checkpoint after Checkout[\s\S]*?checkpoint\.after_checkout\.working_blob=" -Message "checkout checkpoint must log working tree lockfile blob"
    Assert-Match -Value $workflow -Pattern "Checkpoint after Checkout[\s\S]*?checkpoint\.after_checkout\.head_blob=" -Message "checkout checkpoint must log HEAD lockfile blob"
    Assert-Match -Value $workflow -Pattern "Checkpoint after Checkout[\s\S]*?checkpoint\.after_checkout\.matches_head_blob=" -Message "checkout checkpoint must log working-vs-HEAD lockfile blob comparison"

    Assert-Match -Value $workflow -Pattern "Checkpoint after Setup pnpm[\s\S]*?checkpoint\.after_setup_pnpm\.sha256=" -Message "pnpm checkpoint must log lockfile sha256"
    Assert-Match -Value $workflow -Pattern "Checkpoint after Setup pnpm[\s\S]*?checkpoint\.after_setup_pnpm\.first_line_is_yaml_doc=" -Message "pnpm checkpoint must log first-line YAML doc marker check"
    Assert-Match -Value $workflow -Pattern "Checkpoint after Setup pnpm[\s\S]*?checkpoint\.after_setup_pnpm\.working_blob=" -Message "pnpm checkpoint must log working tree lockfile blob"
    Assert-Match -Value $workflow -Pattern "Checkpoint after Setup pnpm[\s\S]*?checkpoint\.after_setup_pnpm\.head_blob=" -Message "pnpm checkpoint must log HEAD lockfile blob"
    Assert-Match -Value $workflow -Pattern "Checkpoint after Setup pnpm[\s\S]*?checkpoint\.after_setup_pnpm\.matches_head_blob=" -Message "pnpm checkpoint must log working-vs-HEAD lockfile blob comparison"

    Assert-Match -Value $workflow -Pattern "Checkpoint after Setup Node[\s\S]*?checkpoint\.after_setup_node\.sha256=" -Message "node checkpoint must log lockfile sha256"
    Assert-Match -Value $workflow -Pattern "Checkpoint after Setup Node[\s\S]*?checkpoint\.after_setup_node\.first_line_is_yaml_doc=" -Message "node checkpoint must log first-line YAML doc marker check"
    Assert-Match -Value $workflow -Pattern "Checkpoint after Setup Node[\s\S]*?checkpoint\.after_setup_node\.working_blob=" -Message "node checkpoint must log working tree lockfile blob"
    Assert-Match -Value $workflow -Pattern "Checkpoint after Setup Node[\s\S]*?checkpoint\.after_setup_node\.head_blob=" -Message "node checkpoint must log HEAD lockfile blob"
    Assert-Match -Value $workflow -Pattern "Checkpoint after Setup Node[\s\S]*?checkpoint\.after_setup_node\.matches_head_blob=" -Message "node checkpoint must log working-vs-HEAD lockfile blob comparison"

    Assert-Match -Value $workflow -Pattern "name:\s*Install dependencies[\s\S]*?npm\s+exec\s+--package=pnpm@9\.15\.4\s+--\s+pnpm\s+install\s+--frozen-lockfile" -Message "workflow must probe install via npm exec with explicit pnpm@9.15.4 pin"
  }
}
