<#
.SYNOPSIS
  One-click quality gate and Cloudflare Pages deployment for GPT Image2.

.DESCRIPTION
  Runs stability checks, prints a safe git diff summary, deploys a preview,
  runs Playwright smoke tests against the preview, deploys production, and
  runs the same tests against production. Secrets are never printed; TEST_PASS
  is only passed through the process environment.
#>
[CmdletBinding()]
param(
  [string]$ProjectDir = '',
  [string]$BaseUrl = $env:BASE_URL,
  [string]$TestUser = $(if ($env:TEST_USER) { $env:TEST_USER } else { 'a691466166' }),
  [string]$TestPass = $env:TEST_PASS,
  [string]$PreviewBranch = $(if ($env:PREVIEW_BRANCH) { $env:PREVIEW_BRANCH } else { 'quality-' + (Get-Date -Format 'yyyyMMdd-HHmmss') }),
  [string]$ProductionBranch = $(if ($env:PRODUCTION_BRANCH) { $env:PRODUCTION_BRANCH } else { 'main' }),
  [switch]$SkipProductionDeploy,
  [switch]$SkipProductionTest,
  [switch]$InstallBrowsers
)

$ErrorActionPreference = 'Stop'
if (-not $ProjectDir) {
  $scriptRoot = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
  $ProjectDir = (Resolve-Path (Join-Path $scriptRoot '..')).Path
}
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)

function Write-Step([string]$Message) {
  Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Require-Command([string]$Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required command not found: $Name"
  }
}

function Invoke-LoggedCommand {
  param(
    [Parameter(Mandatory=$true)][string]$FilePath,
    [Parameter(Mandatory=$true)][string[]]$Arguments,
    [string]$WorkingDirectory = $ProjectDir,
    [switch]$CaptureOutput
  )
  $display = @($FilePath) + $Arguments
  Write-Host ("$ " + ($display -join ' ')) -ForegroundColor DarkGray
  if ($CaptureOutput) {
    $output = & $FilePath @Arguments 2>&1
    $code = $LASTEXITCODE
    $output | ForEach-Object { Write-Host $_ }
    if ($code -ne 0) { throw "Command failed with exit code ${code}: $FilePath" }
    return ($output -join "`n")
  }
  & $FilePath @Arguments
  $code = $LASTEXITCODE
  if ($code -ne 0) { throw "Command failed with exit code ${code}: $FilePath" }
}

function Ensure-TestDependencies {
  Write-Step 'Ensure Playwright Node test dependencies'
  $nodeModules = Join-Path $ProjectDir 'tests\node_modules\playwright'
  if (-not (Test-Path -LiteralPath $nodeModules)) {
    Invoke-LoggedCommand -FilePath 'npm' -Arguments @('--prefix', (Join-Path $ProjectDir 'tests'), 'install', '--no-audit', '--no-fund')
  } else {
    Write-Host 'Playwright dependency already installed under tests/node_modules.'
  }
  if ($InstallBrowsers) {
    Invoke-LoggedCommand -FilePath 'npm' -Arguments @('--prefix', (Join-Path $ProjectDir 'tests'), 'exec', '--', 'playwright', 'install', 'chromium')
  } else {
    Write-Host 'Skipping browser install; use -InstallBrowsers if the runner lacks Chromium.'
  }
}

function Invoke-StabilityChecks {
  Write-Step 'Run stability checks'
  Invoke-LoggedCommand -FilePath 'node' -Arguments @('scripts/stability-checks.js')
  Invoke-LoggedCommand -FilePath 'node' -Arguments @('scripts/verify-toolbar-params.js')
  Invoke-LoggedCommand -FilePath 'node' -Arguments @('scripts/verify-quality-static.cjs')
}

function Invoke-GitDiffCheck {
  Write-Step 'Git diff check (non-destructive)'
  Invoke-LoggedCommand -FilePath 'git' -Arguments @('status', '--short')
  $conflicts = & git grep -n -E '^(<<<<<<<|=======|>>>>>>>)' -- . ':!tests/node_modules' ':!prompts_data.json' 2>$null
  if ($LASTEXITCODE -eq 0 -and $conflicts) {
    $conflicts | ForEach-Object { Write-Host $_ -ForegroundColor Red }
    throw 'Conflict markers found; aborting deployment.'
  }
  Write-Host 'No conflict markers found. Existing uncommitted changes are not modified or reverted by this script.'
}

function Get-DeployUrl([string]$Output) {
  $matches = [regex]::Matches($Output, 'https://[^\s]+\.pages\.dev')
  if ($matches.Count -gt 0) { return $matches[$matches.Count - 1].Value.TrimEnd('.') }
  return $null
}


function New-DeployStage {
  Write-Step 'Prepare clean deploy stage'
  $stage = Join-Path $ProjectDir '.deploy_quality_stage'
  $resolvedProject = (Resolve-Path -LiteralPath $ProjectDir).Path
  if (Test-Path -LiteralPath $stage) {
    $resolvedStage = (Resolve-Path -LiteralPath $stage).Path
    if (-not $resolvedStage.StartsWith($resolvedProject, [System.StringComparison]::OrdinalIgnoreCase)) {
      throw "Refusing to remove deploy stage outside project: $resolvedStage"
    }
    Remove-Item -LiteralPath $resolvedStage -Recurse -Force
  }
  New-Item -ItemType Directory -Path $stage | Out-Null
  $excludeDirs = @('.git', '.codegraph', '.wrangler', '.playwright-cli', '.deploy', '.deploy2', '.deploy_stage', '.deploy_quality_stage', 'node_modules', 'tests\node_modules')
  $excludeFiles = @('*.log', '*.tmp', '*.bak', '.env', '.env.local', 'prompts_data.latest.tmp.json', 'pw-*.txt', 'pw-*.png', 'pw-*.json')
  $args = @($ProjectDir, $stage, '/E', '/NFL', '/NDL', '/NJH', '/NJS', '/NP') + @('/XD') + $excludeDirs + @('/XF') + $excludeFiles
  & robocopy @args | Out-Null
  if ($LASTEXITCODE -gt 7) { throw "robocopy failed with exit code $LASTEXITCODE" }
  return $stage
}

function Invoke-PagesDeploy([string]$Branch, [string]$Label) {
  Write-Step "Deploy Cloudflare Pages $Label ($Branch)"
  $stage = New-DeployStage
  $args = @('--yes', 'wrangler', 'pages', 'deploy', $stage, '--project-name', 'gpt-image2', '--branch', $Branch, '--commit-dirty=true')
  $output = Invoke-LoggedCommand -FilePath 'npx' -Arguments $args -CaptureOutput
  $url = Get-DeployUrl $output
  if (-not $url) {
    if ($Label -eq 'production' -and $BaseUrl) { $url = $BaseUrl }
    else { throw "Unable to parse Pages URL from $Label deploy output." }
  }
  Write-Host "$Label URL: $url"
  return $url
}

function Invoke-QualityTests([string]$Url, [string]$Label) {
  Write-Step "Run Playwright quality tests against $Label"
  $oldBase = $env:BASE_URL
  $oldUser = $env:TEST_USER
  $oldPass = $env:TEST_PASS
  try {
    $env:BASE_URL = $Url
    $env:TEST_USER = $TestUser
    $env:TEST_PASS = $TestPass
    Write-Host "BASE_URL=$Url"
    Write-Host "TEST_USER=$TestUser"
    Write-Host 'TEST_PASS=<hidden>'
    Invoke-LoggedCommand -FilePath 'npm' -Arguments @('--prefix', (Join-Path $ProjectDir 'tests'), 'run', 'quality', '--silent')
  } finally {
    $env:BASE_URL = $oldBase
    $env:TEST_USER = $oldUser
    $env:TEST_PASS = $oldPass
  }
}

Push-Location -LiteralPath $ProjectDir
try {
  Require-Command 'git'
  Require-Command 'node'
  Require-Command 'npm'
  Require-Command 'npx'

  Write-Host "ProjectDir=$ProjectDir"
  Write-Host "PreviewBranch=$PreviewBranch"
  Write-Host "ProductionBranch=$ProductionBranch"
  Write-Host "TEST_USER=$TestUser"
  Write-Host 'TEST_PASS=<hidden>'
  if (-not $TestPass) { throw 'TEST_PASS is required and must be provided via environment or -TestPass. It is never printed.' }

  Ensure-TestDependencies
  Invoke-StabilityChecks
  Invoke-GitDiffCheck

  $previewUrl = Invoke-PagesDeploy -Branch $PreviewBranch -Label 'preview'
  Invoke-QualityTests -Url $previewUrl -Label 'preview'

  if (-not $SkipProductionDeploy) {
    $productionUrl = Invoke-PagesDeploy -Branch $ProductionBranch -Label 'production'
    if ($BaseUrl) { $productionUrl = $BaseUrl }
    if (-not $SkipProductionTest) {
      Invoke-QualityTests -Url $productionUrl -Label 'production'
    }
  } else {
    Write-Host 'Skipping production deploy by parameter.' -ForegroundColor Yellow
  }

  Write-Step 'Deployment quality flow completed'
} finally {
  Pop-Location
}
