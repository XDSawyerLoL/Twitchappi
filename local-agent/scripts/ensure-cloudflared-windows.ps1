param(
  [string]$Destination = "",
  [switch]$Force
)
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
if ($env:OS -ne "Windows_NT") { throw "Windows only" }
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
if (!$Destination) { $Destination = Join-Path $root "bin\cloudflared.exe" }
$expected = "12c7c887f8aaab779aef1dfa9b60673530a5adb88ecc55dd6df8f56e0b70f199"
$url = "https://github.com/cloudflare/cloudflared/releases/download/2026.10.2/cloudflared-windows-amd64.exe"
$parent = Split-Path -Parent $Destination
New-Item -ItemType Directory -Path $parent -Force | Out-Null
function Valid([string]$p) {
  if (!(Test-Path -LiteralPath $p -PathType Leaf)) { return $false }
  return ((Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLowerInvariant() -eq $expected)
}
if ((Valid $Destination) -and !$Force) {
  Write-Host "cloudflared verified (SHA-256)."
  exit 0
}
$tmp = "$Destination.download"
try {
  if (Test-Path $tmp) { Remove-Item -LiteralPath $tmp -Force }
  Write-Host "Retrieving official pinned Cloudflare Tunnel helper..."
  Invoke-WebRequest -Uri $url -OutFile $tmp -UseBasicParsing -ErrorAction Stop
  if (!(Valid $tmp)) { throw "cloudflared SHA-256 mismatch; refusing unverified binary." }
  Move-Item -LiteralPath $tmp -Destination $Destination -Force
  Write-Host "cloudflared verified and installed."
} finally {
  if (Test-Path $tmp) { Remove-Item -LiteralPath $tmp -Force }
}
