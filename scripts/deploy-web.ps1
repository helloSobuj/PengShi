# Deploy Echo web UI to Vercel (run from repo root or web/)
# Prerequisites: `vercel login` once

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot\..\web

Write-Host "Linking / deploying Echo web to Vercel..."

# Ensure env vars exist for production token endpoint
$envVars = @(
  @{ Key = "LIVEKIT_URL"; Value = $env:LIVEKIT_URL },
  @{ Key = "LIVEKIT_API_KEY"; Value = $env:LIVEKIT_API_KEY },
  @{ Key = "LIVEKIT_API_SECRET"; Value = $env:LIVEKIT_API_SECRET },
  @{ Key = "AGENT_NAME"; Value = "echo-agent" },
  @{ Key = "ALLOW_PUBLIC_TOKEN"; Value = "true" },
  @{ Key = "NEXT_PUBLIC_MODEL_MODE"; Value = "inference" }
)

foreach ($item in $envVars) {
  if (-not $item.Value) {
    # Fall back to .env.local
    $line = Get-Content .env.local -ErrorAction SilentlyContinue | Where-Object { $_ -match "^$($item.Key)=" }
    if ($line) {
      $item.Value = ($line -split "=", 2)[1]
    }
  }
  if (-not $item.Value -and $item.Key -notin @("ALLOW_PUBLIC_TOKEN", "NEXT_PUBLIC_MODEL_MODE", "AGENT_NAME")) {
    throw "Missing $($item.Key). Set it in the environment or web/.env.local"
  }
}

vercel --prod --yes `
  --env "LIVEKIT_URL=$($envVars[0].Value)" `
  --env "LIVEKIT_API_KEY=$($envVars[1].Value)" `
  --env "LIVEKIT_API_SECRET=$($envVars[2].Value)" `
  --env "AGENT_NAME=echo-agent" `
  --env "ALLOW_PUBLIC_TOKEN=true" `
  --env "NEXT_PUBLIC_MODEL_MODE=inference"
