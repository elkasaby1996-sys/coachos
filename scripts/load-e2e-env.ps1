$envFile = Join-Path $PSScriptRoot "..\.env.e2e.local"

if (-not (Test-Path $envFile)) {
  Write-Error "Missing env file: $envFile"
  exit 1
}

Get-Content $envFile | ForEach-Object {
  if ($_ -match '^\s*#' -or $_ -match '^\s*$') {
    return
  }

  $name, $value = $_ -split '=', 2
  if (-not $name -or $null -eq $value) {
    return
  }

  Set-Item -Path "Env:$name" -Value $value
}

Write-Host "Loaded E2E env vars from .env.e2e.local"
