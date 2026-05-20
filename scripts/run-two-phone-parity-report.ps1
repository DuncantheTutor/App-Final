Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot

Write-Host "Working directory: $repoRoot"
Write-Host "Running: npm run prototype:parity:report"

Push-Location $repoRoot
try {
  npm run prototype:parity:report
} finally {
  Pop-Location
}
