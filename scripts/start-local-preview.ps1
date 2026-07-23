[CmdletBinding()]
param(
  [ValidateSet('Node', 'Wrangler', 'Auto')]
  [string]$Engine = 'Node',
  [switch]$NoBrowser,
  [switch]$ReuseExisting
)

$ErrorActionPreference = 'Stop'

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$Port = 8788
$HostName = '127.0.0.1'
$Url = "http://$HostName`:$Port/"
$LogDir = Join-Path $ProjectRoot '.wrangler\local-preview'
$LauncherLog = Join-Path $LogDir 'launcher-latest.log'
$StatusFile = Join-Path $LogDir 'status.json'
$Stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$WranglerOutLog = Join-Path $LogDir "wrangler-local-$Stamp.out.log"
$WranglerErrLog = Join-Path $LogDir "wrangler-local-$Stamp.err.log"
$NodeOutLog = Join-Path $LogDir "node-local-$Stamp.out.log"
$NodeErrLog = Join-Path $LogDir "node-local-$Stamp.err.log"
$DefaultLocalJwtSecret = 'gpt-image2-local-preview-jwt-20260705'
$LauncherMutexName = 'Local\NexGen-GPT-Image2-Local-Preview-8788'

function Write-LauncherLog {
  param(
    [string]$Message,
    [ValidateSet('INFO', 'WARN', 'ERROR')]
    [string]$Level = 'INFO'
  )

  New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
  $line = '[{0}] [{1}] {2}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss.fff'), $Level, $Message
  Add-Content -LiteralPath $LauncherLog -Value $line -Encoding utf8
  if ($Level -eq 'WARN') {
    Write-Warning $Message
  } elseif ($Level -eq 'ERROR') {
    Write-Host $Message -ForegroundColor Red
  } else {
    Write-Host $Message
  }
}

function Write-PreviewStatus {
  param(
    [string]$State,
    [string]$ActiveEngine = '',
    [int]$ProcessId = 0,
    [string]$Message = ''
  )

  New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
  [ordered]@{
    state = $State
    engine = $ActiveEngine
    pid = $ProcessId
    url = $Url
    projectRoot = $ProjectRoot
    updatedAt = (Get-Date).ToString('o')
    message = $Message
  } | ConvertTo-Json | Set-Content -LiteralPath $StatusFile -Encoding utf8
}

function Test-PortOpen {
  param(
    [string]$HostName,
    [int]$Port
  )

  try {
    $client = [System.Net.Sockets.TcpClient]::new()
    $async = $client.BeginConnect($HostName, $Port, $null, $null)
    $connected = $async.AsyncWaitHandle.WaitOne(400)
    if (-not $connected) {
      $client.Close()
      return $false
    }
    $client.EndConnect($async)
    $client.Close()
    return $true
  } catch {
    return $false
  }
}

function Test-HttpReady {
  param([string]$Url)

  try {
    $resp = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5
    return [int]$resp.StatusCode -ge 200
  } catch {
    return $false
  }
}

function Test-LocalPreviewIdentity {
  param([string]$Url)

  try {
    $resp = Invoke-WebRequest -Uri ($Url.TrimEnd('/') + '/api/ping') -UseBasicParsing -TimeoutSec 5
    if ([int]$resp.StatusCode -lt 200 -or [int]$resp.StatusCode -ge 300) { return $false }
    $payload = $resp.Content | ConvertFrom-Json -ErrorAction Stop
    return $payload.localPreview -eq $true
  } catch {
    return $false
  }
}

function Get-ListeningProcessId {
  param(
    [string]$HostName,
    [int]$Port
  )

  try {
    $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop |
      Where-Object { $_.LocalAddress -eq $HostName -or $_.LocalAddress -eq '0.0.0.0' -or $_.LocalAddress -eq '::' -or $_.LocalAddress -eq '::0' } |
      Select-Object -First 1
    if ($conn) { return [int]$conn.OwningProcess }
  } catch {}

  try {
    foreach ($line in (& netstat.exe -ano -p tcp)) {
      $parts = @($line -split '\s+' | Where-Object { $_ })
      if ($parts.Count -lt 5 -or $parts[0] -ne 'TCP' -or $parts[3] -ne 'LISTENING') { continue }
      if (-not $parts[1].EndsWith(":$Port")) { continue }
      $processId = 0
      if ([int]::TryParse($parts[4], [ref]$processId)) { return $processId }
    }
  } catch {}
  return 0
}

function Get-ListeningProcessInfo {
  param(
    [string]$HostName,
    [int]$Port
  )

  $listenerProcessId = Get-ListeningProcessId -HostName $HostName -Port $Port
  if ($listenerProcessId -le 0) { return $null }
  try {
    $info = Get-CimInstance Win32_Process -Filter ("ProcessId = {0}" -f $listenerProcessId) -ErrorAction Stop
    if ($info) { return $info }
  } catch {}

  try {
    $process = Get-Process -Id $listenerProcessId -ErrorAction Stop
    return [pscustomobject]@{
      ProcessId = $listenerProcessId
      ParentProcessId = 0
      Name = $process.ProcessName
      CommandLine = ''
      ExecutablePath = $process.Path
      LimitedInfo = $true
    }
  } catch {
    return $null
  }
}

function Get-ProcessAncestry {
  param($ProcessInfo)

  $chain = @()
  $current = $ProcessInfo
  $seen = @{}
  for ($depth = 0; $current -and $depth -lt 10; $depth++) {
    $pidValue = [int]$current.ProcessId
    if ($seen.ContainsKey($pidValue)) { break }
    $seen[$pidValue] = $true
    $chain += $current
    if ($current.PSObject.Properties['LimitedInfo'] -and $current.LimitedInfo) { break }
    $parentId = [int]$current.ParentProcessId
    if ($parentId -le 0) { break }
    $current = Get-CimInstance Win32_Process -Filter ("ProcessId = {0}" -f $parentId) -ErrorAction SilentlyContinue
  }
  return $chain
}

function Test-IsProjectPreviewCommand {
  param([string]$CommandLine)

  $cmd = [string]$CommandLine
  if (-not $cmd) { return $false }
  return (
    $cmd -like "*$ProjectRoot*" -or
    $cmd -like "*local-preview-server.mjs*" -or
    $cmd -like "*wrangler*pages*dev*--port*8788*"
  )
}

function Stop-ExistingPreviewProcess {
  param(
    [string]$HostName,
    [int]$Port
  )

  $proc = Get-ListeningProcessInfo -HostName $HostName -Port $Port
  if (-not $proc) {
    if (Test-PortOpen -HostName $HostName -Port $Port) {
      throw "Port $Port is open, but its listening process could not be identified."
    }
    return
  }
  $chain = @(Get-ProcessAncestry -ProcessInfo $proc)
  $owned = @($chain | Where-Object { Test-IsProjectPreviewCommand -CommandLine ([string]$_.CommandLine) })
  if (-not $owned.Count) {
    if (-not (Test-LocalPreviewIdentity -Url $Url)) {
      throw ("Port {0} is already in use by another process: PID {1} {2}`nCommandLine: {3}" -f $Port, $proc.ProcessId, $proc.Name, ([string]$proc.CommandLine))
    }
    Write-LauncherLog -Level 'WARN' -Message "Process ancestry is unavailable; stopping the verified local preview listener PID $($proc.ProcessId)."
    Stop-Process -Id ([int]$proc.ProcessId) -Force -ErrorAction Stop
  } else {
    $root = $owned[-1]
    Stop-ProcessTree -ProcessId ([int]$root.ProcessId)
  }
  $deadline = (Get-Date).AddSeconds(5)
  while ((Get-Date) -lt $deadline) {
    if (-not (Test-PortOpen -HostName $HostName -Port $Port)) { return }
    Start-Sleep -Milliseconds 200
  }
  throw "The previous project preview process did not release port $Port."
}

function Stop-ProcessTree {
  param([int]$ProcessId)

  $children = @()
  try {
    $children = @(Get-CimInstance Win32_Process -Filter ("ParentProcessId = {0}" -f $ProcessId) -ErrorAction Stop)
  } catch {}
  foreach ($child in $children) {
    Stop-ProcessTree -ProcessId ([int]$child.ProcessId)
  }
  Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue
}

function Get-WranglerCommand {
  $localWrangler = Join-Path $ProjectRoot 'node_modules\.bin\wrangler.cmd'
  if (Test-Path -LiteralPath $localWrangler) {
    return @{
      FilePath = $localWrangler
      Arguments = @('pages', 'dev', './', '--ip', $HostName, '--port', [string]$Port)
    }
  }

  $wrangler = Get-Command wrangler -ErrorAction SilentlyContinue
  if ($wrangler) {
    if ($wrangler.CommandType -eq 'ExternalScript' -and $wrangler.Source -like '*.ps1') {
      $baseDir = Split-Path -Parent $wrangler.Source
      $bundledNode = Join-Path $baseDir 'node.exe'
      $node = if (Test-Path $bundledNode) {
        @{ Source = $bundledNode }
      } else {
        Get-Command node.exe -ErrorAction Stop
      }
      $wranglerJs = Join-Path $baseDir 'node_modules\\wrangler\\bin\\wrangler.js'
      return @{
        FilePath = $node.Source
      Arguments = @($wranglerJs, 'pages', 'dev', './', '--ip', $HostName, '--port', [string]$Port)
      }
    }
    return @{
      FilePath = $wrangler.Source
      Arguments = @('pages', 'dev', './', '--ip', $HostName, '--port', [string]$Port)
    }
  }

  return $null
}

function ConvertTo-PowerShellLiteral {
  param([string]$Value)
  return "'" + ($Value -replace "'", "''") + "'"
}

function Get-PowerShellHost {
  $pwsh = Get-Command pwsh.exe -ErrorAction SilentlyContinue
  if ($pwsh) { return $pwsh.Source }
  return (Get-Command powershell.exe -ErrorAction Stop).Source
}

function Get-LogTail {
  param(
    [string]$Path,
    [int]$Lines = 20
  )

  if (-not (Test-Path -LiteralPath $Path)) { return '<log file was not created>' }
  try {
    $tail = @(Get-Content -LiteralPath $Path -Tail $Lines -ErrorAction Stop)
    if (-not $tail.Count) { return '<log file is empty>' }
    return ($tail -join [Environment]::NewLine)
  } catch {
    return "<could not read log: $($_.Exception.Message)>"
  }
}

function Start-WranglerHidden {
  param(
    [Parameter(Mandatory=$true)][hashtable]$Command
  )

  New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
  $powershell = Get-PowerShellHost
  $quotedFile = ConvertTo-PowerShellLiteral -Value $Command.FilePath
  $quotedArgs = @($Command.Arguments | ForEach-Object { ConvertTo-PowerShellLiteral -Value ([string]$_) }) -join ' '
  $quotedProject = ConvertTo-PowerShellLiteral -Value $ProjectRoot
  $quotedOut = ConvertTo-PowerShellLiteral -Value $WranglerOutLog
  $quotedErr = ConvertTo-PowerShellLiteral -Value $WranglerErrLog
  $quotedJwt = ConvertTo-PowerShellLiteral -Value $DefaultLocalJwtSecret
  $commandLine = "if (-not `$env:JWT_SECRET) { `$env:JWT_SECRET = $quotedJwt }; if (-not `$env:ALLOW_PUBLIC_REGISTRATION) { `$env:ALLOW_PUBLIC_REGISTRATION = 'true' }; Set-Location -LiteralPath $quotedProject; & $quotedFile $quotedArgs > $quotedOut 2> $quotedErr"

  return Start-Process `
    -FilePath $powershell `
    -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', $commandLine) `
    -WorkingDirectory $ProjectRoot `
    -WindowStyle Hidden `
    -PassThru
}

function Start-NodeFallbackHidden {
  New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
  $powershell = Get-PowerShellHost
  $node = (Get-Command node.exe -ErrorAction Stop).Source
  $server = Join-Path $ProjectRoot 'scripts\local-preview-server.mjs'
  $quotedNode = ConvertTo-PowerShellLiteral -Value $node
  $quotedServer = ConvertTo-PowerShellLiteral -Value $server
  $quotedProject = ConvertTo-PowerShellLiteral -Value $ProjectRoot
  $quotedOut = ConvertTo-PowerShellLiteral -Value $NodeOutLog
  $quotedErr = ConvertTo-PowerShellLiteral -Value $NodeErrLog
  $quotedJwt = ConvertTo-PowerShellLiteral -Value $DefaultLocalJwtSecret
  $commandLine = "if (-not `$env:JWT_SECRET) { `$env:JWT_SECRET = $quotedJwt }; if (-not `$env:ALLOW_PUBLIC_REGISTRATION) { `$env:ALLOW_PUBLIC_REGISTRATION = 'true' }; `$env:LOCAL_PREVIEW_PORT = '$Port'; `$env:LOCAL_PREVIEW_HOST = '$HostName'; Set-Location -LiteralPath $quotedProject; & $quotedNode $quotedServer > $quotedOut 2> $quotedErr"

  return Start-Process `
    -FilePath $powershell `
    -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', $commandLine) `
    -WorkingDirectory $ProjectRoot `
    -WindowStyle Hidden `
    -PassThru
}

function Start-NodePreview {
  Write-LauncherLog -Message 'Starting the built-in Node preview server.'
  $process = Start-NodeFallbackHidden
  $deadline = (Get-Date).AddSeconds(20)
  while ((Get-Date) -lt $deadline) {
    if ($process.HasExited) { break }
    if (Test-HttpReady -Url ($Url + 'login')) {
      return $process
    }
    Start-Sleep -Milliseconds 300
  }

  if (-not $process.HasExited) {
    Stop-ProcessTree -ProcessId ([int]$process.Id)
  }
  $nodeTail = Get-LogTail -Path $NodeErrLog
  throw "Node preview did not become HTTP-ready within 20 seconds.`nNode stderr ($NodeErrLog):`n$nodeTail"
}

function Start-WranglerPreview {
  $command = Get-WranglerCommand
  if (-not $command) {
    throw 'Wrangler command was not found.'
  }

  $commandText = "$($command.FilePath) $($command.Arguments -join ' ')"
  Write-LauncherLog -Message "Starting Wrangler preview: $commandText"
  $process = Start-WranglerHidden -Command $command
  $deadline = (Get-Date).AddSeconds(45)
  while ((Get-Date) -lt $deadline) {
    if ($process.HasExited) {
      throw "Wrangler exited with code $($process.ExitCode)."
    }
    if (Test-HttpReady -Url ($Url + 'login')) {
      return $process
    }
    Start-Sleep -Milliseconds 500
  }

  if (-not $process.HasExited) {
    Stop-ProcessTree -ProcessId ([int]$process.Id)
  }
  throw 'Wrangler did not become HTTP-ready within 45 seconds.'
}

function Invoke-LocalPreview {
  Write-PreviewStatus -State 'starting' -ActiveEngine $Engine

  if (Test-PortOpen -HostName $HostName -Port $Port) {
    if ($ReuseExisting -and (Test-HttpReady -Url ($Url + 'login'))) {
      $existingProcessId = Get-ListeningProcessId -HostName $HostName -Port $Port
      Write-LauncherLog -Message "Reusing the healthy local preview at $Url"
      Write-PreviewStatus -State 'ready' -ActiveEngine 'existing' -ProcessId $existingProcessId
      if (-not $NoBrowser) { Start-Process $Url }
      return
    }
    Write-LauncherLog -Message "Stopping the existing project preview on port $Port."
    Stop-ExistingPreviewProcess -HostName $HostName -Port $Port
    if (Test-PortOpen -HostName $HostName -Port $Port) {
      throw "The previous service is still listening on port $Port."
    }
  }

  $activeEngine = $null
  $activeProcess = $null
  if ($Engine -eq 'Node') {
    $activeProcess = Start-NodePreview
    $activeEngine = 'Node fallback'
  } else {
    try {
      $activeProcess = Start-WranglerPreview
      $activeEngine = 'Wrangler'
    } catch {
      if ($Engine -eq 'Wrangler') { throw }
      $wranglerFailure = $_.Exception.Message
      $wranglerTail = Get-LogTail -Path $WranglerErrLog
      Write-LauncherLog -Level 'WARN' -Message "$wranglerFailure Falling back to the Node preview server.`nWrangler stderr: $WranglerErrLog`n$wranglerTail"
      if (Test-PortOpen -HostName $HostName -Port $Port) {
        Stop-ExistingPreviewProcess -HostName $HostName -Port $Port
      }
      $activeProcess = Start-NodePreview
      $activeEngine = 'Node fallback'
    }
  }

  if ($activeProcess.HasExited) {
    throw "Local preview process exited before the final health check."
  }
  if (-not (Test-LocalPreviewIdentity -Url $Url)) {
    throw "Local preview started but failed the final health check at $($Url)api/ping."
  }

  $listenerProcessId = Get-ListeningProcessId -HostName $HostName -Port $Port
  if ($listenerProcessId -le 0) { $listenerProcessId = [int]$activeProcess.Id }
  Write-PreviewStatus -State 'ready' -ActiveEngine $activeEngine -ProcessId $listenerProcessId
  Write-LauncherLog -Message "Local preview ready via $activeEngine at $Url"
  if (-not $NoBrowser) { Start-Process $Url }
}

$launcherMutex = [System.Threading.Mutex]::new($false, $LauncherMutexName)
$lockTaken = $false
try {
  $lockTaken = $launcherMutex.WaitOne([TimeSpan]::FromSeconds(15))
  if (-not $lockTaken) {
    throw 'Another local preview launch is still in progress. Wait a few seconds and try again.'
  }
  Invoke-LocalPreview
} catch {
  $message = $_.Exception.Message
  Write-PreviewStatus -State 'failed' -ActiveEngine $Engine -Message $message
  Write-LauncherLog -Level 'ERROR' -Message $message
  throw
} finally {
  if ($lockTaken) { $launcherMutex.ReleaseMutex() }
  $launcherMutex.Dispose()
}
