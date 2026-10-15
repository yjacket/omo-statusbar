# Run from a clone: .\install.ps1 (local copy only, no download)
$ErrorActionPreference = "Stop"
$src = Join-Path $PSScriptRoot "extension\status-arrange"
$agent = @($env:OMO_CODING_AGENT_DIR, $env:SENPI_CODING_AGENT_DIR, $env:PI_CODING_AGENT_DIR) | Where-Object { $_ } | Select-Object -First 1
if (-not $agent) { $agent = Join-Path $HOME ".omo\agent" }
if (-not (Test-Path $src -PathType Container)) { throw "missing $src" }
$ext = Join-Path $agent "extensions"
$dst = Join-Path $ext "status-arrange"
$tmp = Join-Path $ext "status-arrange.tmp-$PID"
New-Item -ItemType Directory -Force $ext | Out-Null
if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
Copy-Item $src $tmp -Recurse
if (Test-Path $dst) { Remove-Item $dst -Recurse -Force }
Rename-Item $tmp "status-arrange"
Write-Host "installed -> $dst"
Write-Host "Type /reload in running omo sessions."
