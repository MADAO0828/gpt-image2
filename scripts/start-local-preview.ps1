$ErrorActionPreference = 'Stop'

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$Port = 8788
$HostName = '127.0.0.1'
$Url = "http://$HostName`:$Port/"
$LogDir = Join-Path $ProjectRoot '.wrangler\local-preview'
$Stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$WranglerOutLog = Join-Path $LogDir "wrangler-local-$Stamp.out.log"
$WranglerErrLog = Join-Path $LogDir "wrangler-local-$Stamp.err.log"
$NodeOutLog = Join-Path $LogDir "node-local-$Stamp.out.log"
$NodeErrLog = Join-Path $LogDir "node-local-$Stamp.err.log"
$DefaultLocalJwtSecret = 'gpt-image2-local-preview-jwt-20260705'

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

function Get-ListeningProcessInfo {
  param(
    [string]$HostName,
    [int]$Port
  )

  try {
    $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop |
      Where-Object { $_.LocalAddress -eq $HostName -or $_.LocalAddress -eq '0.0.0.0' -or $_.LocalAddress -eq '::' -or $_.LocalAddress -eq '::0' } |
      Select-Object -First 1
    if (-not $conn) { return $null }
    return Get-CimInstance Win32_Process -Filter ("ProcessId = {0}" -f [int]$conn.OwningProcess) -ErrorAction SilentlyContinue
  } catch {
    return $null
  }
}

function Test-IsProjectPreviewProcess {
  param($ProcessInfo)

  if (-not $ProcessInfo) { return $false }
  $cmd = [string]$ProcessInfo.CommandLine
  if (-not $cmd) { return $false }
  return (
    $cmd -like "*$ProjectRoot*" -or
    $cmd -like "*local-preview-server.mjs*" -or
    $cmd -like "*wrangler*pages*dev*./*--port*8788*"
  )
}

function Stop-ExistingPreviewProcess {
  param(
    [string]$HostName,
    [int]$Port
  )

  $proc = Get-ListeningProcessInfo -HostName $HostName -Port $Port
  if (-not $proc) { return }
  if (-not (Test-IsProjectPreviewProcess -ProcessInfo $proc)) {
    throw ("Port {0} is already in use by another process: PID {1} {2}`nCommandLine: {3}" -f $Port, $proc.ProcessId, $proc.Name, ([string]$proc.CommandLine))
  }
  Stop-Process -Id $proc.ProcessId -Force -ErrorAction Stop
  Start-Sleep -Milliseconds 700
}

function Stop-ProcessTree {
  param([int]$ProcessId)

  $children = @(Get-CimInstance Win32_Process -Filter ("ParentProcessId = {0}" -f $ProcessId) -ErrorAction SilentlyContinue)
  foreach ($child in $children) {
    Stop-ProcessTree -ProcessId ([int]$child.ProcessId)
  }
  Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue
}

function Get-WranglerCommand {
  $npx = Get-Command npx.cmd -ErrorAction SilentlyContinue
  if ($npx) {
    return @{
      FilePath = $npx.Source
      Arguments = @('--yes', 'wrangler', 'pages', 'dev', './', '--ip', $HostName, '--port', [string]$Port)
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
  $commandLine = "if (-not `$env:JWT_SECRET) { `$env:JWT_SECRET = $quotedJwt }; if (-not `$env:ALLOW_PUBLIC_REGISTRATION) { `$env:ALLOW_PUBLIC_REGISTRATION = 'false' }; Set-Location -LiteralPath $quotedProject; & $quotedFile $quotedArgs > $quotedOut 2> $quotedErr"

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
  $commandLine = "if (-not `$env:JWT_SECRET) { `$env:JWT_SECRET = $quotedJwt }; if (-not `$env:ALLOW_PUBLIC_REGISTRATION) { `$env:ALLOW_PUBLIC_REGISTRATION = 'false' }; `$env:LOCAL_PREVIEW_PORT = '$Port'; `$env:LOCAL_PREVIEW_HOST = '$HostName'; Set-Location -LiteralPath $quotedProject; & $quotedNode $quotedServer > $quotedOut 2> $quotedErr"

  return Start-Process `
    -FilePath $powershell `
    -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', $commandLine) `
    -WorkingDirectory $ProjectRoot `
    -WindowStyle Hidden `
    -PassThru
}

if (Test-PortOpen -HostName $HostName -Port $Port) {
  Stop-ExistingPreviewProcess -HostName $HostName -Port $Port
}

$engine = $null
$wranglerFailure = $null
$command = Get-WranglerCommand
if ($command) {
  $commandText = "$($command.FilePath) $($command.Arguments -join ' ')"
  Write-Host "Starting Wrangler preview: $commandText"
  try {
    $wranglerProcess = Start-WranglerHidden -Command $command
    $deadline = (Get-Date).AddSeconds(60)
    while ((Get-Date) -lt $deadline) {
      if (Test-HttpReady -Url ($Url + 'login')) {
        $engine = 'Wrangler'
        break
      }
      if ($wranglerProcess.HasExited) {
        $wranglerFailure = "Wrangler exited with code $($wranglerProcess.ExitCode)."
        break
      }
      Start-Sleep -Milliseconds 500
    }
    if (-not $engine -and -not $wranglerFailure) {
      $wranglerFailure = 'Wrangler did not become HTTP-ready within 60 seconds.'
    }
  } catch {
    $wranglerFailure = "Wrangler launch failed: $($_.Exception.Message)"
  }
} else {
  $wranglerFailure = 'Wrangler command was not found.'
}

if (-not $engine) {
  if ($wranglerProcess -and -not $wranglerProcess.HasExited) {
    Stop-ProcessTree -ProcessId ([int]$wranglerProcess.Id)
    Start-Sleep -Milliseconds 500
  }
  if (Test-PortOpen -HostName $HostName -Port $Port) {
    try {
      Stop-ExistingPreviewProcess -HostName $HostName -Port $Port
    } catch {
      $wranglerFailure += " Failed to clear Wrangler listener: $($_.Exception.Message)"
    }
  }
  $wranglerTail = Get-LogTail -Path $WranglerErrLog
  Write-Warning "$wranglerFailure Falling back to the Node preview server.`nWrangler stderr: $WranglerErrLog`n$wranglerTail"
  $nodeProcess = Start-NodeFallbackHidden
  $deadline = (Get-Date).AddSeconds(20)
  while ((Get-Date) -lt $deadline) {
    if (Test-HttpReady -Url ($Url + 'login')) {
      $engine = 'Node fallback'
      break
    }
    if ($nodeProcess.HasExited) { break }
    Start-Sleep -Milliseconds 500
  }
}

if (-not $engine) {
  $wranglerTail = Get-LogTail -Path $WranglerErrLog
  $nodeTail = Get-LogTail -Path $NodeErrLog
  throw "Local preview did not start on $Url.`nWrangler: $wranglerFailure`nWrangler stderr ($WranglerErrLog):`n$wranglerTail`nNode stderr ($NodeErrLog):`n$nodeTail"
}

Write-Host "Local preview ready via $engine at $Url"
Start-Process $Url
