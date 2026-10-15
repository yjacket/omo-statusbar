# From a clone: .\install.ps1 (local copy)
# Without a clone: irm https://raw.githubusercontent.com/yjacket/omo-status-arrange/master/install.ps1 | iex
& {
$ErrorActionPreference = "Stop"
$dl = $null
$src = if ($PSScriptRoot) { Join-Path $PSScriptRoot "extension\status-arrange" }
if (-not $src -or -not (Test-Path $src -PathType Container)) {
	$dl = Join-Path ([IO.Path]::GetTempPath()) "omo-status-arrange-$PID"
	if (Test-Path $dl) { Remove-Item $dl -Recurse -Force }
	New-Item -ItemType Directory -Force $dl | Out-Null
	$zip = Join-Path $dl "src.zip"
	Invoke-WebRequest "https://github.com/yjacket/omo-status-arrange/archive/refs/heads/master.zip" -OutFile $zip -UseBasicParsing
	Expand-Archive $zip $dl
	$src = Join-Path $dl "omo-status-arrange-master\extension\status-arrange"
}
try {
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
} finally {
	if ($dl) { Remove-Item $dl -Recurse -Force -ErrorAction SilentlyContinue }
}
}
