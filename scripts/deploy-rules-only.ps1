param(
  [string]$ProjectId = "nfc-app-7095e",
  [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$command = "firebase deploy --project $ProjectId --only `"firestore:rules,storage`""

Write-Host "Project: $ProjectId"
Write-Host "Working directory: $repoRoot"
Write-Host "Command: $command"

if ($DryRun) {
  Write-Host "Dry run enabled; not executing deploy."
  exit 0
}

Push-Location $repoRoot
try {
  if (-not (Get-Command firebase -ErrorAction SilentlyContinue)) {
    throw "Firebase CLI not found. Install with: npm i -g firebase-tools"
  }
  Invoke-Expression $command
} finally {
  Pop-Location
}
