$ErrorActionPreference = 'Stop'

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$Port = 8788
$HostName = '127.0.0.1'
$Url = "http://$HostName`:$Port/"
$LogDir = Join-Path $ProjectRoot '.wrangler\local-preview'
$OutLog = Join-Path $LogDir 'wrangler-local.out.log'
$ErrLog = Join-Path $LogDir 'wrangler-local.err.log'

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

function Get-WranglerCommand {
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

  $npx = Get-Command npx.cmd -ErrorAction SilentlyContinue
  if ($npx) {
    return @{
      FilePath = $npx.Source
      Arguments = @('wrangler', 'pages', 'dev', './', '--ip', $HostName, '--port', [string]$Port)
    }
  }

  throw 'Wrangler is not installed.'
}

function ConvertTo-PowerShellLiteral {
  param([string]$Value)
  return "'" + ($Value -replace "'", "''") + "'"
}

function Start-WranglerHidden {
  param(
    [Parameter(Mandatory=$true)][hashtable]$Command
  )

  New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
  $powershell = (Get-Command powershell.exe -ErrorAction Stop).Source
  $quotedFile = ConvertTo-PowerShellLiteral -Value $Command.FilePath
  $quotedArgs = @($Command.Arguments | ForEach-Object { ConvertTo-PowerShellLiteral -Value ([string]$_) }) -join ' '
  $quotedProject = ConvertTo-PowerShellLiteral -Value $ProjectRoot
  $quotedOut = ConvertTo-PowerShellLiteral -Value $OutLog
  $quotedErr = ConvertTo-PowerShellLiteral -Value $ErrLog
  $commandLine = "Set-Location -LiteralPath $quotedProject; & $quotedFile $quotedArgs > $quotedOut 2> $quotedErr"

  Start-Process `
    -FilePath $powershell `
    -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', $commandLine) `
    -WorkingDirectory $ProjectRoot `
    -WindowStyle Hidden | Out-Null
}

if (-not (Test-PortOpen -HostName $HostName -Port $Port)) {
  $command = Get-WranglerCommand
  Start-WranglerHidden -Command $command

  $deadline = (Get-Date).AddSeconds(30)
  while ((Get-Date) -lt $deadline) {
    if (Test-PortOpen -HostName $HostName -Port $Port) { break }
    Start-Sleep -Milliseconds 500
  }
}

if (-not (Test-PortOpen -HostName $HostName -Port $Port)) {
  throw "Local preview did not start on $Url. Check $ErrLog."
}

Start-Process $Url
