#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Build the production Docker image and run the full pipeline diagnostic.

.DESCRIPTION
    1. Builds the Docker image (same as CI/CD)
    2. Waits for the health endpoint to be ready
    3. Calls /api/health to confirm soffice + pdftoppm are available
    4. If an imageId is provided, calls /api/test/pipeline and prints results

.PARAMETER ImageId
    A cached image ID (UUID) to run through the full pipeline test.
    If ImageId and ImagePath are omitted, only health + dependency checks are run.

.PARAMETER ImagePath
    A local PNG/JPEG/WebP slide image to send directly to /api/test/pipeline.
    This avoids depending on Azure image generation or in-memory image cache.

.EXAMPLE
    # Health check only
    .\scripts\docker-validate.ps1

    # Full pipeline with a specific imageId
    .\scripts\docker-validate.ps1 -ImageId "abc123-..."

    # Full pipeline with a local fixture image
    .\scripts\docker-validate.ps1 -ImagePath ".\test-fixtures\slide.png"
#>
param(
    [string]$ImageId = "",
    [string]$ImagePath = "",
    [int]$Port = 3000,
    [int]$StartupTimeoutSec = 120
)

$ErrorActionPreference = "Stop"
$BaseUrl = "http://localhost:$Port"

Write-Host "`n=== Step 1: Build Docker image ===" -ForegroundColor Cyan
docker compose build
if ($LASTEXITCODE -ne 0) { Write-Error "Docker build failed"; exit 1 }

Write-Host "`n=== Step 2: Start container ===" -ForegroundColor Cyan
docker compose up -d
if ($LASTEXITCODE -ne 0) { Write-Error "docker compose up failed"; exit 1 }

Write-Host "`n=== Step 3: Wait for health ($StartupTimeoutSec s max) ===" -ForegroundColor Cyan
$deadline = (Get-Date).AddSeconds($StartupTimeoutSec)
$ready = $false
while ((Get-Date) -lt $deadline) {
    try {
        $resp = Invoke-RestMethod "$BaseUrl/api/health" -TimeoutSec 5
        if ($resp.status -eq "healthy") { $ready = $true; break }
    } catch { }
    Start-Sleep -Seconds 3
    Write-Host "  waiting..."
}
if (-not $ready) {
    Write-Error "Container did not become healthy within $StartupTimeoutSec s"
    docker compose logs --tail=50 app
    docker compose down
    exit 1
}

Write-Host "`n=== Step 4: Dependency check ===" -ForegroundColor Cyan
$health = Invoke-RestMethod "$BaseUrl/api/health"
$health | ConvertTo-Json -Depth 5

$soffice = $health.dependencies.soffice.available
$pdftoppm = $health.dependencies.pdftoppm.available
$loopReady = $health.dependencies.refinementLoopReady

if (-not $soffice) { Write-Warning "soffice NOT available — refinement loop will be skipped!" }
if (-not $pdftoppm) { Write-Warning "pdftoppm NOT available — rendering will fail!" }
if ($loopReady) {
    Write-Host "  refinementLoopReady: TRUE ✓" -ForegroundColor Green
} else {
    Write-Host "  refinementLoopReady: FALSE ✗" -ForegroundColor Red
}

# ── Optional full pipeline test ──────────────────────────────────────────────
if ($ImageId -ne "" -or $ImagePath -ne "") {
    if ($ImageId -ne "" -and $ImagePath -ne "") {
        Write-Error "Specify either -ImageId or -ImagePath, not both"
        exit 1
    }

    if ($ImagePath -ne "") {
        if (-not (Test-Path $ImagePath)) {
            Write-Error "ImagePath not found: $ImagePath"
            exit 1
        }
        $ext = [IO.Path]::GetExtension($ImagePath).ToLowerInvariant()
        $mimeType = switch ($ext) {
            ".png" { "image/png" }
            ".jpg" { "image/jpeg" }
            ".jpeg" { "image/jpeg" }
            ".webp" { "image/webp" }
            default {
                Write-Error "Unsupported ImagePath extension: $ext"
                exit 1
            }
        }
        Write-Host "`n=== Step 5: Full pipeline test (imagePath=$ImagePath) ===" -ForegroundColor Cyan
        $imageBase64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes((Resolve-Path $ImagePath)))
        $body = @{ imageBase64 = $imageBase64; mimeType = $mimeType; slideNumber = 1 } | ConvertTo-Json
    } else {
        Write-Host "`n=== Step 5: Full pipeline test (imageId=$ImageId) ===" -ForegroundColor Cyan
        $body = @{ imageId = $ImageId; slideNumber = 1 } | ConvertTo-Json
    }
    try {
        $pipeline = Invoke-RestMethod "$BaseUrl/api/test/pipeline" `
            -Method POST `
            -ContentType "application/json" `
            -Body $body `
            -TimeoutSec 300
        $pipeline | ConvertTo-Json -Depth 10

        if ($pipeline.ok) {
            Write-Host "`n  All pipeline stages passed ✓" -ForegroundColor Green
        } else {
            $failed = $pipeline.steps | Where-Object { -not $_.ok }
            Write-Host "`n  Failed stages:" -ForegroundColor Red
            $failed | ForEach-Object { Write-Host "    - $($_.step): $($_.error)" -ForegroundColor Red }
        }
    } catch {
        Write-Warning "Pipeline test request failed: $_"
    }
} else {
    Write-Host "`n  Tip: pass -ImageId <uuid> or -ImagePath <file> to run the full pipeline test" -ForegroundColor Yellow
    Write-Host "  Generate an image first via the app UI or /api/skills/image" -ForegroundColor Yellow
}

Write-Host "`n=== Done. Container still running at $BaseUrl ===" -ForegroundColor Cyan
Write-Host "  Stop with: docker compose down"
