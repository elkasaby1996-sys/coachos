param(
  [string]$EnvFile = ".env.e2e"
)

if (!(Test-Path $EnvFile)) {
  Write-Error "Missing $EnvFile"
  exit 1
}

$required = @(
  "E2E_PT_EMAIL",
  "E2E_PT_PASSWORD",
  "E2E_CLIENT_EMAIL",
  "E2E_CLIENT_PASSWORD",
  "E2E_CLIENT_ID",
  "E2E_WORKOUT_TEMPLATE_ID"
)

$optional = @("E2E_BASE_URL")

$lines = Get-Content $EnvFile
$map = @{}
foreach ($line in $lines) {
  $trimmed = $line.Trim()
  if ($trimmed -eq "" -or $trimmed.StartsWith("#")) { continue }
  $parts = $trimmed.Split("=", 2)
  if ($parts.Length -ne 2) { continue }
  $map[$parts[0].Trim()] = $parts[1].Trim()
}

$missing = @()
foreach ($key in $required) {
  if (-not $map.ContainsKey($key) -or [string]::IsNullOrWhiteSpace($map[$key])) {
    $missing += $key
  }
}

if ($missing.Count -gt 0) {
  Write-Error ("Missing required values in {0}: {1}" -f $EnvFile, ($missing -join ", "))
  exit 1
}

$keysToSet = @($required + $optional)
foreach ($key in $keysToSet) {
  if ($map.ContainsKey($key) -and -not [string]::IsNullOrWhiteSpace($map[$key])) {
    Write-Host "Setting GitHub Actions secret: $key"
    $map[$key] | gh secret set $key --repo elkasaby1996-sys/coachos
  }
}

Write-Host "Done."
