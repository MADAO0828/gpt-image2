<#
.SYNOPSIS
  One-click quality gate and Cloudflare Pages deployment for NexGen.

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
  [string]$D1DatabaseName = $(if ($env:D1_DATABASE_NAME) { $env:D1_DATABASE_NAME } else { 'gpt-image2-db' }),
  [switch]$SkipProductionDeploy,
  [switch]$SkipProductionTest,
  [switch]$InstallBrowsers,
  [switch]$AllowDirtyDeploy
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
  Write-Step 'Run local deliverable quality gates'
  Invoke-LoggedCommand -FilePath 'node' -Arguments @('--check', 'assets/homepage-v3.js')
  Invoke-LoggedCommand -FilePath 'node' -Arguments @('--check', 'assets/shell-ui.js')
  Invoke-LoggedCommand -FilePath 'node' -Arguments @('--check', 'tests/e2e-quality.js')
  Invoke-LoggedCommand -FilePath 'node' -Arguments @('--check', 'scripts/api-smoke.mjs')
  Invoke-LoggedCommand -FilePath 'node' -Arguments @('tests/homepage-task-regression.js')
  Invoke-LoggedCommand -FilePath 'node' -Arguments @('tests/provider-size-branching.js')
  Invoke-LoggedCommand -FilePath 'node' -Arguments @('scripts/stability-checks.js')
  Invoke-LoggedCommand -FilePath 'node' -Arguments @('scripts/verify-quality-static.cjs')
  Invoke-LoggedCommand -FilePath 'node' -Arguments @('scripts/verify-toolbar-params.js')
  Invoke-LoggedCommand -FilePath 'node' -Arguments @('scripts/final-deliverable-audit.cjs')
  Invoke-LoggedCommand -FilePath 'node' -Arguments @('scripts/backup-security.test.mjs')
  Invoke-LoggedCommand -FilePath 'node' -Arguments @('scripts/local-preview-performance.test.mjs')
}

function Invoke-GitDiffCheck {
  Write-Step 'Git diff check (non-destructive)'
  Invoke-LoggedCommand -FilePath 'git' -Arguments @('diff', '--check')
  $status = & git status --short
  $status | ForEach-Object { Write-Host $_ }
  if ($status -and -not $AllowDirtyDeploy) {
    throw 'Working tree is dirty. Commit/stage an auditable release or pass -AllowDirtyDeploy only for a deliberate preview-only emergency.'
  }
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
  $excludeDirs = @('.git', '.codegraph', '.agents', '.codex', '.wrangler', '.playwright-cli', '.deploy', '.deploy2', '.deploy_stage', '.deploy_quality_stage', '.tmp-transparent-check', 'node_modules', 'tests', 'tests\node_modules', 'scripts', 'docs', 'migrations')
  $excludeFiles = @('.git', '.dev.vars', '.tmp-models.json', '*.log', '*.tmp', '*.bak', '*.md', '*.sql', '.env', '.env.local', 'README.md', 'init_db.sql', 'wrangler.toml', 'wrangler.json', 'wrangler.jsonc', 'prompts_data.latest.tmp.json', 'pw-*.txt', 'pw-*.png', 'pw-*.json')
  $args = @($ProjectDir, $stage, '/E', '/NFL', '/NDL', '/NJH', '/NJS', '/NP') + @('/XD') + $excludeDirs + @('/XF') + $excludeFiles
  & robocopy @args | Out-Null
  if ($LASTEXITCODE -gt 7) { throw "robocopy failed with exit code $LASTEXITCODE" }
  $sensitiveStageFiles = Get-ChildItem -LiteralPath $stage -Recurse -File | Where-Object {
    $_.Extension -ieq '.sql' -or
    $_.FullName -match '[\\/](?:migrations|scripts|tests|docs)[\\/]'
  }
  if ($sensitiveStageFiles) {
    $sensitiveStageFiles | ForEach-Object { Write-Host $_.FullName -ForegroundColor Red }
    throw 'Sensitive development or migration files leaked into deploy stage.'
  }
  return $stage
}

function Invoke-ProductionDatabasePreflight {
  Write-Step 'Run remote read-only production D1 security preflight'
  $knownSeedHash = 'BtGs_bI3gUtzS6kpjjJyPE4e6GVrFhqjpCT-zoH3qb0'
  $validAdminPredicate = @'
password_hash LIKE 'pbkdf2-sha256$%'
AND (length(password_hash) - length(replace(password_hash, '$', ''))) = 3
AND substr(substr(password_hash, length('pbkdf2-sha256$') + 1), 1, instr(substr(password_hash, length('pbkdf2-sha256$') + 1), '$') - 1) != ''
AND substr(substr(password_hash, length('pbkdf2-sha256$') + 1), 1, instr(substr(password_hash, length('pbkdf2-sha256$') + 1), '$') - 1) NOT GLOB '*[^0-9]*'
AND CAST(substr(substr(password_hash, length('pbkdf2-sha256$') + 1), 1, instr(substr(password_hash, length('pbkdf2-sha256$') + 1), '$') - 1) AS INTEGER) BETWEEN 100000 AND 2000000
AND length(substr(substr(substr(password_hash, length('pbkdf2-sha256$') + 1), instr(substr(password_hash, length('pbkdf2-sha256$') + 1), '$') + 1), 1, instr(substr(substr(password_hash, length('pbkdf2-sha256$') + 1), instr(substr(password_hash, length('pbkdf2-sha256$') + 1), '$') + 1), '$') - 1)) = 22
AND substr(substr(substr(password_hash, length('pbkdf2-sha256$') + 1), instr(substr(password_hash, length('pbkdf2-sha256$') + 1), '$') + 1), 1, instr(substr(substr(password_hash, length('pbkdf2-sha256$') + 1), instr(substr(password_hash, length('pbkdf2-sha256$') + 1), '$') + 1), '$') - 1) NOT GLOB '*[^A-Za-z0-9_-]*'
AND length(substr(substr(substr(password_hash, length('pbkdf2-sha256$') + 1), instr(substr(password_hash, length('pbkdf2-sha256$') + 1), '$') + 1), instr(substr(substr(password_hash, length('pbkdf2-sha256$') + 1), instr(substr(password_hash, length('pbkdf2-sha256$') + 1), '$') + 1), '$') + 1)) = 43
AND substr(substr(substr(password_hash, length('pbkdf2-sha256$') + 1), instr(substr(password_hash, length('pbkdf2-sha256$') + 1), '$') + 1), instr(substr(substr(password_hash, length('pbkdf2-sha256$') + 1), instr(substr(password_hash, length('pbkdf2-sha256$') + 1), '$') + 1), '$') + 1) NOT GLOB '*[^A-Za-z0-9_-]*'
'@
  $query = "SELECT (SELECT COUNT(*) FROM users WHERE password_hash = '$knownSeedHash') AS seed_hash_count, (SELECT COUNT(*) FROM users WHERE role = 'admin') AS admin_count, (SELECT COUNT(*) FROM users WHERE role = 'admin' AND $validAdminPredicate) AS valid_pbkdf2_admin_count, (SELECT COUNT(*) FROM users WHERE session_version IS NULL OR session_version < 1) AS invalid_session_version_count, (SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'auth_rate_limits') AS rate_limit_table_count;"
  $output = Invoke-LoggedCommand -FilePath 'npx' -Arguments @('--yes', 'wrangler', 'd1', 'execute', $D1DatabaseName, '--remote', '--command', $query, '--json') -CaptureOutput
  $jsonStart = $output.IndexOf('[')
  if ($jsonStart -lt 0) { throw 'Unable to parse remote D1 preflight JSON.' }
  $result = $output.Substring($jsonStart) | ConvertFrom-Json
  $row = @($result)[0].results[0]
  if ($null -eq $row) { throw 'Remote D1 preflight returned no result row.' }
  if ([int]$row.seed_hash_count -ne 0) { throw 'Production blocked: known bootstrap password hash is still present.' }
  if ([int]$row.admin_count -lt 1) { throw 'Production blocked: no administrator account exists.' }
  if ([int]$row.valid_pbkdf2_admin_count -ne [int]$row.admin_count) { throw 'Production blocked: every administrator must have a structurally valid PBKDF2 password.' }
  if ([int]$row.invalid_session_version_count -ne 0) { throw 'Production blocked: one or more users have an invalid session_version.' }
  if ([int]$row.rate_limit_table_count -ne 1) { throw 'Production blocked: auth_rate_limits migration is missing.' }
  Write-Host "D1 preflight passed: seed_hash_count=0, admin_count=$($row.admin_count), valid_pbkdf2_admin_count=$($row.valid_pbkdf2_admin_count), invalid_session_version_count=0, rate_limit_table_count=1"
}

function Invoke-PagesDeploy([string]$Branch, [string]$Label) {
  Write-Step "Deploy Cloudflare Pages $Label ($Branch)"
  $stage = New-DeployStage
  $args = @('--yes', 'wrangler', 'pages', 'deploy', $stage, '--project-name', 'gpt-image2', '--branch', $Branch, '--commit-dirty=false')
  $output = Invoke-LoggedCommand -FilePath 'npx' -Arguments $args -CaptureOutput
  $url = Get-DeployUrl $output
  if (-not $url) { throw "Unable to parse Pages URL from $Label deploy output." }
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
    Invoke-LoggedCommand -FilePath 'node' -Arguments @('scripts/api-smoke.mjs')
  } finally {
    $env:BASE_URL = $oldBase
    $env:TEST_USER = $oldUser
    $env:TEST_PASS = $oldPass
  }
}

function Test-PreviewSupportsAuth([string]$Url) {
  $payload = @{
    username = $TestUser
    usernameB64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($TestUser))
    password = $TestPass
  } | ConvertTo-Json -Compress
  try {
    $res = Invoke-WebRequest -UseBasicParsing -Uri ($Url.TrimEnd('/') + '/api/auth/login') -Method POST -ContentType 'application/json' -Body $payload -TimeoutSec 30
    return @{ ok = ($res.StatusCode -ge 200 -and $res.StatusCode -lt 300); reason = 'login-ok' }
  } catch {
    $message = ''
    if ($_.ErrorDetails -and $_.ErrorDetails.Message) { $message = $_.ErrorDetails.Message }
    elseif ($_.Exception -and $_.Exception.Message) { $message = $_.Exception.Message }
    if ($message -match 'JWT_SECRET is required') {
      return @{ ok = $false; reason = 'preview-missing-jwt-secret' }
    }
    return @{ ok = $false; reason = $message }
  }
}

function Invoke-StaticDeployChecks([string]$Url, [string]$Label) {
  Write-Step "Run static deploy checks against $Label"
  $root = Invoke-WebRequest -UseBasicParsing -Uri ($Url.TrimEnd('/') + '/') -TimeoutSec 45
  if (-not ($root.Content -match 'home-v3-20260710-output-quality-r86')) {
    throw "$Label HTML does not contain expected asset version home-v3-20260710-output-quality-r86."
  }
  $js = Invoke-WebRequest -UseBasicParsing -Method Get -Uri ($Url.TrimEnd('/') + '/assets/homepage-v3.js') -TimeoutSec 45
  $css = Invoke-WebRequest -UseBasicParsing -Method Get -Uri ($Url.TrimEnd('/') + '/assets/homepage-v3.css') -TimeoutSec 45
  $jsType = [string]($js.Headers['Content-Type'])
  $cssType = [string]($css.Headers['Content-Type'])
  if ($jsType -notmatch 'javascript|ecmascript|text/plain') { throw "$Label homepage-v3.js has unexpected content type: $jsType" }
  if ($cssType -notmatch 'css|text/plain') { throw "$Label homepage-v3.css has unexpected content type: $cssType" }
  foreach ($path in @('/init_db.sql', '/schema.sql', '/migrations/20260710_session_version_and_auth_rate_limits.sql', '/scripts/deploy-quality.ps1', '/tests/e2e-quality.js', '/README.md', '/wrangler.toml', '/wrangler.jsonc', '/.dev.vars', '/.env')) {
    try {
      $res = Invoke-WebRequest -UseBasicParsing -Method Head -Uri ($Url.TrimEnd('/') + $path) -TimeoutSec 30
      if ($res.StatusCode -ne 404) { throw "$Label sensitive path should be 404: $path returned $($res.StatusCode)" }
    } catch {
      if ($_.Exception.Response -and [int]$_.Exception.Response.StatusCode -eq 404) { continue }
      throw
    }
  }
  Write-Host "$Label static checks passed."
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
  if ($AllowDirtyDeploy) {
    $SkipProductionDeploy = $true
    $SkipProductionTest = $true
    Write-Host 'AllowDirtyDeploy is preview-only. Production deployment and production tests are forcibly disabled.' -ForegroundColor Yellow
  }

  Ensure-TestDependencies
  Invoke-StabilityChecks
  Invoke-GitDiffCheck

  $previewUrl = Invoke-PagesDeploy -Branch $PreviewBranch -Label 'preview'
  Invoke-StaticDeployChecks -Url $previewUrl -Label 'preview'
  $previewAuth = Test-PreviewSupportsAuth -Url $previewUrl
  if ($previewAuth.ok) {
    Invoke-QualityTests -Url $previewUrl -Label 'preview'
  } elseif ($previewAuth.reason -eq 'preview-missing-jwt-secret') {
    Write-Host 'Preview environment does not expose JWT_SECRET through current Pages direct-upload CLI. Production is blocked because dynamic preview auth did not pass.' -ForegroundColor Yellow
    $SkipProductionDeploy = $true
    $SkipProductionTest = $true
  } else {
    Write-Host "Preview auth probe failed: $($previewAuth.reason). Production is blocked." -ForegroundColor Yellow
    $SkipProductionDeploy = $true
    $SkipProductionTest = $true
  }

  if (-not $SkipProductionDeploy) {
    Invoke-ProductionDatabasePreflight
    $productionUrl = Invoke-PagesDeploy -Branch $ProductionBranch -Label 'production'
    Invoke-StaticDeployChecks -Url $productionUrl -Label 'production'
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

