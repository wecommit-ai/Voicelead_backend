# Push .env secrets to Fly.io
# Usage: .\push-secrets.ps1

$envFile = ".env"

if (-not (Test-Path $envFile)) {
    Write-Error ".env file not found!"
    exit 1
}

$secrets = @()

Get-Content $envFile | ForEach-Object {
    $line = $_.Trim()
    # Skip empty lines and comments
    if ($line -and -not $line.StartsWith("#")) {
        if ($line -match "^([^=]+)=(.*)$") {
            $key = $matches[1].Trim()
            $value = $matches[2].Trim()
            # Only add if value is not empty
            if ($value) {
                $secrets += "$key=$value"
            }
        }
    }
}

if ($secrets.Count -eq 0) {
    Write-Host "No secrets found in .env"
    exit 0
}

Write-Host "Pushing $($secrets.Count) secrets to Fly.io..."
fly secrets set @secrets

Write-Host "Done!"
