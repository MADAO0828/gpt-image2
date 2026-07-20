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
  [string]$TestUser = $env:TEST_USER,
  [string]$PreviewBranch = $(if ($env:PREVIEW_BRANCH) { $env:PREVIEW_BRANCH } else { 'quality-' + (Get-Date -Format 'yyyyMMdd-HHmmss') }),
  [string]$ProductionBranch = $(if ($env:PRODUCTION_BRANCH) { $env:PRODUCTION_BRANCH } else { 'main' }),
  [string]$D1DatabaseName = $env:D1_DATABASE_NAME,
  [switch]$SkipProductionDeploy,
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
$testPassword = [string]$env:TEST_PASS

function Write-Step([string]$Message) {
  Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Require-Command([string]$Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required command not found: $Name"
  }
}

function Invoke-SourceSecurityGates {
  Write-Step 'Check backend security and deployment invariants'
  $helper = Get-Content -LiteralPath (Join-Path $ProjectDir 'functions\_lib\upstream-url.js') -Raw
  $auth = Get-Content -LiteralPath (Join-Path $ProjectDir 'functions\_lib\auth.js') -Raw
  $models = Get-Content -LiteralPath (Join-Path $ProjectDir 'functions\api\models\index.js') -Raw
  $analyze = Get-Content -LiteralPath (Join-Path $ProjectDir 'functions\api\pro-workbench\analyze.js') -Raw
  $render = Get-Content -LiteralPath (Join-Path $ProjectDir 'functions\api\pro-workbench\render.js') -Raw
  $proxy = Get-Content -LiteralPath (Join-Path $ProjectDir 'functions\api-proxy\[[path]].js') -Raw
  $deploy = Get-Content -LiteralPath (Join-Path $ProjectDir 'scripts\deploy-quality.ps1') -Raw
  if ($helper -notmatch 'export async function assertPublicUpstreamUrl' -or $helper -notmatch 'export function pinUpstreamFetchInit' -or $helper -notmatch 'UPSTREAM_DNS_REBOUND') {
    throw 'Security gate failed: public upstream DNS rebinding protection is missing.'
  }
  if ($helper -notmatch 'export function bindClientAbort' -or $helper -notmatch 'export function normalizeUpstreamTimeoutSeconds') {
    throw 'Security gate failed: upstream cancellation or timeout helper is missing.'
  }
  foreach ($source in @($models, $analyze, $render)) {
    if (($source -notmatch 'fetchPinnedUpstream|pinUpstreamFetchInit') -or $source -notmatch 'bindClientAbort' -or $source -notmatch 'signal:\s*controller\.signal') {
      throw 'Security gate failed: direct upstream endpoint is missing DNS or AbortSignal binding.'
    }
    if ($source -notmatch 'clientAbort\.cleanup\(\)') {
      throw 'Security gate failed: client AbortSignal cleanup is missing.'
    }
    if ($source -match '6000\s*\*\s*1000') {
      throw 'Security gate failed: an upstream timeout still exceeds the Cloudflare hard limit.'
    }
  }
  if ($proxy -notmatch 'fetchPinnedUpstream' -or $proxy -notmatch 'fetchWithPinnedAddress' -or $proxy -notmatch 'bindClientAbort' -or $proxy -notmatch 'PROXY_REQUEST_BODY_LIMIT' -or $proxy -notmatch 'normalizeUpstreamTimeoutSeconds') {
    throw 'Security gate failed: API proxy is missing DNS, cancellation, or hard timeout protection.'
  }
  if ($proxy -match '6000\s*\*\s*1000') {
    throw 'Security gate failed: API proxy timeout still exceeds the Cloudflare hard limit.'
  }
  if ($auth -notmatch 'ALLOW_INSECURE_JWT_FALLBACK' -or $auth -match 'isLocalRequest\s*\(') {
    throw 'Security gate failed: JWT fallback must use an explicit environment flag, not the request host.'
  }
  $parameterBlock = [regex]::Match($deploy, '(?s)param\s*\((.*?)\)').Groups[1].Value
  $credentialParameterToken = 'Test' + 'Pass'
  if ($parameterBlock -match [regex]::Escape($credentialParameterToken)) {
    throw 'Deployment gate failed: password must come from TEST_PASS environment only.'
  }
  $productionTestSkipToken = 'Skip' + 'Production' + 'Test'
  if ($deploy.Contains($productionTestSkipToken)) {
    throw 'Deployment gate failed: production verification may not be skipped.'
  }
  $productionCheck = 'Invoke-QualityTests -Url $productionUrl -Label ' + [char]39 + 'production' + [char]39
  if (-not $deploy.Contains($productionCheck)) {
    throw 'Deployment gate failed: production verification is not mandatory.'
  }
  if ($deploy -match '\[string\]\$TestUser\s*=.*(?:a691466166|else)') {
    throw 'Deployment gate failed: test account must be provided explicitly through TEST_USER.'
  }
  if ($deploy -match 'Invoke-LoggedCommand\s+-FilePath ''npm''\s+-Arguments @\([^\)]*''install''') {
    throw 'Deployment gate failed: deployment must not install npm dependencies automatically.'
  }
  $packageRunnerToken = 'n' + 'px'
  if ($deploy -match "(?i)\b$packageRunnerToken\b[^\r\n]*\bwrangler\b" -or $deploy -notmatch "Require-Command 'wrangler'") {
    throw 'Deployment gate failed: Wrangler must be installed before deployment; npx must not download it implicitly.'
  }
  if ($deploy -notmatch 'Invoke-ProductionSecretPreflight' -or $deploy -notmatch 'Invoke-ProductionDatabasePreflight') {
    throw 'Deployment gate failed: production secret and D1 preflights are mandatory.'
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
    throw 'Quality gate requires tests/node_modules/playwright. Install test dependencies manually before deployment; this script never runs npm install.'
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
  Invoke-SourceSecurityGates
  Invoke-LoggedCommand -FilePath 'node' -Arguments @('--check', 'functions/_lib/upstream-url.js')
  Invoke-LoggedCommand -FilePath 'node' -Arguments @('--check', 'functions/api/models/index.js')
  Invoke-LoggedCommand -FilePath 'node' -Arguments @('--check', 'functions/api/pro-workbench/analyze.js')
  Invoke-LoggedCommand -FilePath 'node' -Arguments @('--check', 'functions/api/pro-workbench/render.js')
  Invoke-LoggedCommand -FilePath 'node' -Arguments @('--check', 'assets/homepage-v3.js')
  Invoke-LoggedCommand -FilePath 'node' -Arguments @('--check', 'assets/image-stream-runtime.js')
  Invoke-LoggedCommand -FilePath 'node' -Arguments @('--check', 'assets/shell-ui.js')
  Invoke-LoggedCommand -FilePath 'node' -Arguments @('--check', 'functions/api-proxy/[[path]].js')
  Invoke-LoggedCommand -FilePath 'node' -Arguments @('--check', 'tests/e2e-quality.js')
  Invoke-LoggedCommand -FilePath 'node' -Arguments @('--check', 'scripts/api-smoke.mjs')
  Invoke-LoggedCommand -FilePath 'node' -Arguments @('tests/image-stream-regression.js')
  Invoke-LoggedCommand -FilePath 'node' -Arguments @('tests/image-edit-request-regression.js')
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
$excludeFiles = @('.git', '.dev.vars', '.tmp-models.json', '*.log', '*.tmp', '*.bak', '*.md', '*.sql', '*.pem', '*.key', '*.p12', '*.pfx', '*.sqlite', '*.sqlite3', '*.db', '.env', '.env.local', 'README.md', 'init_db.sql', 'wrangler.toml', 'wrangler.json', 'wrangler.jsonc', 'prompts_data.latest.tmp.json', 'pw-*.txt', 'pw-*.png', 'pw-*.json')
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

function Get-ConfiguredD1DatabaseName {
  $configPath = Join-Path $ProjectDir 'wrangler.jsonc'
  if (-not (Test-Path -LiteralPath $configPath)) { throw 'Production D1 gate failed: wrangler.jsonc is missing.' }
  try {
    $config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
  } catch {
    throw 'Production D1 gate failed: wrangler.jsonc could not be parsed.'
  }
  $entries = @($config.d1_databases | Where-Object { $_.binding -eq 'gpt_image2_db' })
  if ($entries.Count -ne 1 -or -not $entries[0].database_name) {
    throw 'Production D1 gate failed: exactly one gpt_image2_db binding is required.'
  }
  $configuredName = [string]$entries[0].database_name
  if ($D1DatabaseName -and $D1DatabaseName -ne $configuredName) {
    throw "Production D1 gate failed: D1_DATABASE_NAME '$D1DatabaseName' does not match wrangler.jsonc binding '$configuredName'."
  }
  return $configuredName
}

function Invoke-ProductionSecretPreflight {
  Write-Step 'Run read-only production Pages secret preflight'
  $output = Invoke-LoggedCommand -FilePath 'wrangler' -Arguments @('pages', 'secret', 'list', '--project-name', 'gpt-image2') -CaptureOutput
  if ($output -notmatch '(?i)\bJWT_SECRET\b') {
    throw 'Production blocked: Pages secret JWT_SECRET is not configured.'
  }
  if ($output -notmatch '(?i)\bUPSTREAM_ALLOWED_HOSTS\b') {
    throw 'Production blocked: Pages secret UPSTREAM_ALLOWED_HOSTS is not configured.'
  }
  if ($output -match '(?i)\bALLOW_INSECURE_JWT_FALLBACK\b') {
    throw 'Production blocked: insecure local JWT fallback must not be configured in Pages.'
  }
  if ($output -match '(?i)\bLOCAL_JWT_SECRET\b') {
    throw 'Production blocked: LOCAL_JWT_SECRET must not be configured in Pages.'
  }
  if ($output -match '(?i)\bALLOW_SESSION_HEADER_AUTH\b') {
    throw 'Production blocked: session header authentication must not be configured in Pages.'
  }
  Write-Host 'Production Pages secret preflight passed: JWT_SECRET exists and local fallback/header authentication are absent.'
}

function Invoke-ProductionDatabasePreflight {
  Write-Step 'Run remote read-only production D1 security preflight'
  $databaseName = Get-ConfiguredD1DatabaseName
  $knownSeedHash = 'BtGs_bI3gUtzS6kpjjJyPE4e6GVrFhqjpCT-zoH3qb0'
  $validAdminPredicate = @'
password_hash LIKE 'pbkdf2-sha256$%'
AND (length(password_hash) - length(replace(password_hash, '$', ''))) = 3
AND substr(substr(password_hash, length('pbkdf2-sha256$') + 1), 1, instr(substr(password_hash, length('pbkdf2-sha256$') + 1), '$') - 1) != ''
AND substr(substr(password_hash, length('pbkdf2-sha256$') + 1), 1, instr(substr(password_hash, length('pbkdf2-sha256$') + 1), '$') - 1) NOT GLOB '*[^0-9]*'
AND CAST(substr(substr(password_hash, length('pbkdf2-sha256$') + 1), 1, instr(substr(password_hash, length('pbkdf2-sha256$') + 1), '$') - 1) AS INTEGER) = 100000
AND length(substr(substr(substr(password_hash, length('pbkdf2-sha256$') + 1), instr(substr(password_hash, length('pbkdf2-sha256$') + 1), '$') + 1), 1, instr(substr(substr(password_hash, length('pbkdf2-sha256$') + 1), instr(substr(password_hash, length('pbkdf2-sha256$') + 1), '$') + 1), '$') - 1)) = 22
AND substr(substr(substr(password_hash, length('pbkdf2-sha256$') + 1), instr(substr(password_hash, length('pbkdf2-sha256$') + 1), '$') + 1), 1, instr(substr(substr(password_hash, length('pbkdf2-sha256$') + 1), instr(substr(password_hash, length('pbkdf2-sha256$') + 1), '$') + 1), '$') - 1) NOT GLOB '*[^A-Za-z0-9_-]*'
AND length(substr(substr(substr(password_hash, length('pbkdf2-sha256$') + 1), instr(substr(password_hash, length('pbkdf2-sha256$') + 1), '$') + 1), instr(substr(substr(password_hash, length('pbkdf2-sha256$') + 1), instr(substr(password_hash, length('pbkdf2-sha256$') + 1), '$') + 1), '$') + 1)) = 43
AND substr(substr(substr(password_hash, length('pbkdf2-sha256$') + 1), instr(substr(password_hash, length('pbkdf2-sha256$') + 1), '$') + 1), instr(substr(substr(password_hash, length('pbkdf2-sha256$') + 1), instr(substr(password_hash, length('pbkdf2-sha256$') + 1), '$') + 1), '$') + 1) NOT GLOB '*[^A-Za-z0-9_-]*'
'@
  $query = "SELECT (SELECT COUNT(*) FROM users WHERE password_hash = '$knownSeedHash') AS seed_hash_count, (SELECT COUNT(*) FROM users WHERE role = 'admin') AS admin_count, (SELECT COUNT(*) FROM users WHERE role = 'admin' AND $validAdminPredicate) AS valid_pbkdf2_admin_count, (SELECT COUNT(*) FROM users WHERE session_version IS NULL OR session_version < 1) AS invalid_session_version_count, (SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'auth_rate_limits') AS rate_limit_table_count;"
  $output = Invoke-LoggedCommand -FilePath 'wrangler' -Arguments @('d1', 'execute', $databaseName, '--remote', '--command', $query, '--json') -CaptureOutput
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
  Write-Host "D1 preflight passed for $databaseName`: seed_hash_count=0, admin_count=$($row.admin_count), valid_pbkdf2_admin_count=$($row.valid_pbkdf2_admin_count), invalid_session_version_count=0, rate_limit_table_count=1"
}

function Invoke-PagesDeploy([string]$Branch, [string]$Label) {
  Write-Step "Deploy Cloudflare Pages $Label ($Branch)"
  $stage = New-DeployStage
  $args = @('pages', 'deploy', $stage, '--project-name', 'gpt-image2', '--branch', $Branch, '--commit-dirty=false')
  $output = Invoke-LoggedCommand -FilePath 'wrangler' -Arguments $args -CaptureOutput
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
    $env:TEST_PASS = $testPassword
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
    password = $testPassword
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

function Invoke-DeployHttpGet([string]$Uri, [string]$Label) {
  $lastStatus = 0
  $lastMessage = ''
  for ($attempt = 1; $attempt -le 8; $attempt++) {
    try {
      return Invoke-WebRequest -UseBasicParsing -Uri $Uri -TimeoutSec 45
    } catch {
      $lastStatus = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 0 }
      $lastMessage = if ($lastStatus) { "HTTP $lastStatus" } else { $_.Exception.Message }
      $retryable = $lastStatus -eq 404 -or $lastStatus -eq 502 -or $lastStatus -eq 503
      if (-not $retryable -or $attempt -eq 8) {
        throw "$Label request failed after $attempt attempt(s): $lastMessage"
      }
      Start-Sleep -Seconds 5
    }
  }
  throw "$Label request failed: $lastMessage"
}

function Invoke-StaticDeployChecks([string]$Url, [string]$Label) {
  Write-Step "Run static deploy checks against $Label"
  $localIndex = Get-Content -LiteralPath (Join-Path $ProjectDir 'index.html') -Raw
  $localVersions = @([regex]::Matches($localIndex, 'home-v3-[A-Za-z0-9-]+') | ForEach-Object { $_.Value } | Select-Object -Unique)
  if ($localVersions.Count -ne 1) { throw "Local index.html must contain exactly one asset version marker." }
  $expectedVersion = $localVersions[0]
  $root = Invoke-DeployHttpGet -Uri ($Url.TrimEnd('/') + '/') -Label "$Label root"
  if (-not ($root.Content -match [regex]::Escape($expectedVersion))) {
    throw "$Label HTML does not contain expected asset version $expectedVersion."
  }
  $js = Invoke-DeployHttpGet -Uri ($Url.TrimEnd('/') + '/assets/homepage-v3.js') -Label "$Label homepage-v3.js"
  $streamRuntime = Invoke-DeployHttpGet -Uri ($Url.TrimEnd('/') + '/assets/image-stream-runtime.js') -Label "$Label image-stream-runtime.js"
  $css = Invoke-DeployHttpGet -Uri ($Url.TrimEnd('/') + '/assets/homepage-v3.css') -Label "$Label homepage-v3.css"
  $jsType = [string]($js.Headers['Content-Type'])
  $streamRuntimeType = [string]($streamRuntime.Headers['Content-Type'])
  $cssType = [string]($css.Headers['Content-Type'])
  if (-not ($js.Content -match [regex]::Escape($expectedVersion))) {
    throw "$Label homepage-v3.js does not match index.html asset version $expectedVersion."
  }
  if ($jsType -notmatch 'javascript|ecmascript|text/plain') { throw "$Label homepage-v3.js has unexpected content type: $jsType" }
  if ($streamRuntimeType -notmatch 'javascript|ecmascript|text/plain') { throw "$Label image-stream-runtime.js has unexpected content type: $streamRuntimeType" }
  if ($streamRuntime.Content -notmatch 'DEFAULT_SCAN_DEPTH') { throw "$Label image-stream-runtime.js does not contain the expected stack-safe r103 runtime." }
  if ($cssType -notmatch 'css|text/plain') { throw "$Label homepage-v3.css has unexpected content type: $cssType" }
  foreach ($path in @('/init_db.sql', '/schema.sql', '/migrations/20260710_session_version_and_auth_rate_limits.sql', '/scripts/deploy-quality.ps1', '/tests/e2e-quality.js', '/README.md', '/wrangler.toml', '/wrangler.jsonc', '/.dev.vars', '/.env', '/.git/config', '/.wrangler/state/foo', '/functions/_lib/auth.js', '/api/settings')) {
    try {
      $res = Invoke-WebRequest -UseBasicParsing -Method Get -Uri ($Url.TrimEnd('/') + $path) -TimeoutSec 30
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
  Require-Command 'wrangler'

  Write-Host "ProjectDir=$ProjectDir"
  Write-Host "PreviewBranch=$PreviewBranch"
  Write-Host "ProductionBranch=$ProductionBranch"
  Write-Host "TEST_USER=$TestUser"
  Write-Host 'TEST_PASS=<hidden>'
  if (-not $TestUser) { throw 'TEST_USER is required and must be provided via environment. It is never defaulted by this script.' }
  if (-not $testPassword) { throw 'TEST_PASS is required and must be provided via environment. It is never printed.' }
  if ($AllowDirtyDeploy) {
    $SkipProductionDeploy = $true
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
    throw 'Preview environment does not expose JWT_SECRET through current Pages direct-upload CLI. Production is blocked because dynamic preview auth did not pass.'
  } else {
    throw "Preview auth probe failed: $($previewAuth.reason). Production is blocked."
  }

  if (-not $SkipProductionDeploy) {
    Invoke-ProductionSecretPreflight
    Invoke-ProductionDatabasePreflight
    $productionUrl = Invoke-PagesDeploy -Branch $ProductionBranch -Label 'production'
    Invoke-StaticDeployChecks -Url $productionUrl -Label 'production'
    Invoke-QualityTests -Url $productionUrl -Label 'production'
  } else {
    Write-Host 'Skipping production deploy by parameter.' -ForegroundColor Yellow
  }

  Write-Step 'Deployment quality flow completed'
} finally {
  Pop-Location
}

