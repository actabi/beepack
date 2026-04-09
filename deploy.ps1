# Beepack - Deployment script for Hostinger VPS
# Usage: .\deploy.ps1 [-All] [-Deploy] [-Restart] [-Logs] [-Help]

param(
    [switch]$All,       # Deploy + Restart
    [switch]$Deploy,    # Transfer source files to VPS
    [switch]$Restart,   # Install deps and restart the service
    [switch]$Logs,      # Show logs
    [switch]$Status,    # Show status
    [switch]$Ssh,       # Open SSH shell to VPS
    [switch]$Setup,     # First-time setup (Docker, Caddy, etc.)
    [switch]$Help       # Show help
)

# Configuration
$VPS_IP = "92.113.26.7"
$VPS_USER = "root"
$VPS_APP_PATH = "/opt/beepack"
$PROJECT_PATH = $PSScriptRoot  # Auto-detect: use the folder where deploy.ps1 lives
$SERVICE_NAME = "beepack"
$DOMAIN = "beepack.ai"
$PORT = 3011

# Colors for messages
function Write-Info { param($msg) Write-Host "[INFO] $msg" -ForegroundColor Cyan }
function Write-Success { param($msg) Write-Host "[OK] $msg" -ForegroundColor Green }
function Write-Warn { param($msg) Write-Host "[WARN] $msg" -ForegroundColor Yellow }
function Write-Err { param($msg) Write-Host "[ERROR] $msg" -ForegroundColor Red }
function Write-Step { param($msg) Write-Host "`n=== $msg ===" -ForegroundColor Yellow }

# Helper: execute an SSH command
function Invoke-Vps {
    param([string]$Command)
    ssh "${VPS_USER}@${VPS_IP}" $Command
    return $LASTEXITCODE
}

# Show help
if ($Help -or (-not $All -and -not $Deploy -and -not $Restart -and -not $Logs -and -not $Status -and -not $Ssh -and -not $Setup)) {
    Write-Host @"

Beepack - Deployment Script
=================================

Usage: .\deploy.ps1 [options]

Options:
  -All      Full deployment (deploy + restart)
  -Deploy   Transfer source files to VPS
  -Restart  Install deps and restart the service
  -Logs     Show service logs
  -Status   Show service status
  -Ssh      Open SSH shell to VPS
  -Setup    First-time setup (Docker, Caddy, Qdrant)
  -Help     Show this help

Examples:
  .\deploy.ps1 -Setup             # First deployment (one-time only)
  .\deploy.ps1 -All               # Full deployment
  .\deploy.ps1 -Deploy            # Just transfer sources
  .\deploy.ps1 -Logs              # View logs

URL: https://beepack.ai

"@
    exit 0
}

# If -All, enable everything
if ($All) {
    $Deploy = $true
    $Restart = $true
}

Write-Host "`n========================================" -ForegroundColor Magenta
Write-Host "   Beepack - VPS Deployment              " -ForegroundColor Magenta
Write-Host "========================================`n" -ForegroundColor Magenta

# ── First-time Setup ──────────────────────────────────────────────────
if ($Setup) {
    Write-Step "First-time VPS setup"

    Write-Info "Installing Docker..."
    Invoke-Vps "curl -fsSL https://get.docker.com | sh"

    Write-Info "Installing Docker Compose..."
    Invoke-Vps "apt-get install -y docker-compose-plugin || apt-get install -y docker-compose"

    Write-Info "Installing Node.js 20..."
    Invoke-Vps "curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt-get install -y nodejs"

    Write-Info "Creating directories..."
    Invoke-Vps "mkdir -p ${VPS_APP_PATH}/data ${VPS_APP_PATH}/storage"

    Write-Info "Starting Qdrant..."
    Invoke-Vps "docker run -d --name qdrant --restart unless-stopped -p 6333:6333 -v /opt/qdrant:/qdrant/storage qdrant/qdrant"

    Write-Info "Traefik is already configured as reverse proxy (see /root/traefik/dynamic.yml)"

    Write-Success "Setup complete! Now run: .\deploy.ps1 -All"
    exit 0
}

# ── Show logs ──────────────────────────────────────────────────
if ($Logs) {
    Write-Step "Beepack service logs"
    Invoke-Vps "journalctl -u ${SERVICE_NAME} -f --no-pager -n 100"
    exit 0
}

# ── Show status ─────────────────────────────────────────────
if ($Status) {
    Write-Step "Service status"
    Write-Info "Beepack:"
    Invoke-Vps "systemctl status ${SERVICE_NAME} --no-pager | head -10"
    Write-Host ""
    Write-Info "Qdrant:"
    Invoke-Vps "docker ps | grep qdrant || echo 'Qdrant not started'"
    Write-Host ""
    Write-Info "Test API:"
    Invoke-Vps "curl -s http://localhost:${PORT}/api/v1/stats || echo 'API not available'"
    exit 0
}

# ── SSH Shell ──────────────────────────────────────────────────────
if ($Ssh) {
    Write-Info "Connecting to VPS via SSH..."
    ssh "${VPS_USER}@${VPS_IP}"
    exit 0
}

# ── 1. File transfer ─────────────────────────────────────
if ($Deploy) {
    Write-Step "Transferring sources to VPS"

    Write-Info "Creating directories on VPS..."
    Invoke-Vps "mkdir -p ${VPS_APP_PATH}/scripts"

    # Root files to transfer
    $filesToSync = @(
        "server.js",
        "auth.js",
        "embeddings.js",
        "vector-db.js",
        "storage.js",
        "mcp-remote.js",
        "clawhub-compat.js",
        "security-engine.js",
        "package.json",
        "package-lock.json"
    )

    foreach ($file in $filesToSync) {
        $srcPath = "$PROJECT_PATH\$file"
        if (Test-Path $srcPath) {
            Write-Info "Sending $file..."
            scp "$srcPath" "${VPS_USER}@${VPS_IP}:${VPS_APP_PATH}/$file"
        } else {
            Write-Warn "$file not found, skipping"
        }
    }

    # Scripts folder
    if (Test-Path "$PROJECT_PATH\scripts") {
        Write-Info "Sending scripts/..."
        scp -r "$PROJECT_PATH\scripts\*" "${VPS_USER}@${VPS_IP}:${VPS_APP_PATH}/scripts/" 2>$null
        if ($LASTEXITCODE -ne 0) {
            # Fallback: send files one by one
            Get-ChildItem "$PROJECT_PATH\scripts" -File | ForEach-Object {
                scp $_.FullName "${VPS_USER}@${VPS_IP}:${VPS_APP_PATH}/scripts/$($_.Name)"
            }
        }
    }

    # Folders: use rsync if available, fallback to scp -r
    $foldersToSync = @("site", "cli")

    # Check if rsync is available locally
    $hasRsync = $null -ne (Get-Command rsync -ErrorAction SilentlyContinue)

    foreach ($folder in $foldersToSync) {
        $srcFolder = "$PROJECT_PATH\$folder"
        if (-not (Test-Path $srcFolder)) {
            Write-Warn "$folder not found, skipping"
            continue
        }

        if ($hasRsync) {
            # rsync: fast, reliable, handles deletes
            Write-Info "Syncing $folder/ via rsync..."
            $srcUnix = ($srcFolder -replace '\\', '/') -replace '^([A-Z]):', '/$1'
            rsync -az --delete --exclude 'node_modules' --exclude '*.db' --exclude 'data' "$srcUnix/" "${VPS_USER}@${VPS_IP}:${VPS_APP_PATH}/${folder}/"
        } else {
            # Fallback: delete remote folder, then scp -r
            Write-Info "Syncing $folder/ via scp..."

            # Clean remote first to remove stale files
            Invoke-Vps "rm -rf ${VPS_APP_PATH}/${folder}"

            # Stage to temp dir without node_modules
            $tempFolder = "$env:TEMP\beepack-deploy-$folder"
            if (Test-Path $tempFolder) { Remove-Item $tempFolder -Recurse -Force }
            robocopy "$srcFolder" "$tempFolder" /E /XD node_modules data /XF *.db /NFL /NDL /NJH /NJS /NC /NS | Out-Null

            # scp the clean folder
            scp -r "$tempFolder" "${VPS_USER}@${VPS_IP}:${VPS_APP_PATH}/${folder}"

            # Cleanup
            Remove-Item $tempFolder -Recurse -Force -ErrorAction SilentlyContinue
        }
    }

    # Verify deployment
    Write-Info "Verifying files on VPS..."
    $fileCount = Invoke-Vps "find ${VPS_APP_PATH}/site -type f | wc -l"
    $serverExists = Invoke-Vps "test -f ${VPS_APP_PATH}/server.js && echo OK || echo MISSING"

    Write-Success "Sources transferred (site: $fileCount files)"
}

# ── 2. Install deps + Restart ─────────────────────────────────────
if ($Restart) {
    Write-Step "Installing and restarting on VPS"

    Write-Info "Installing dependencies..."
    Invoke-Vps "cd ${VPS_APP_PATH} && npm install --production"
    Invoke-Vps "cd ${VPS_APP_PATH}/cli && npm install --production"

    # Create systemd service
    Write-Info "Configuring systemd service..."
    # Create .env file on VPS if it doesn't exist
    Write-Info "Checking .env file on VPS..."
    Invoke-Vps "test -f ${VPS_APP_PATH}/.env || (echo 'OPENAI_API_KEY=CHANGEME' > ${VPS_APP_PATH}/.env && chmod 600 ${VPS_APP_PATH}/.env && echo '.env FILE CREATED - Edit it with: nano ${VPS_APP_PATH}/.env')"

    $serviceContent = @"
[Unit]
Description=Beepack API Server
After=network.target docker.service

[Service]
Type=simple
User=root
WorkingDirectory=${VPS_APP_PATH}
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=10
EnvironmentFile=${VPS_APP_PATH}/.env
Environment=NODE_ENV=production
Environment=PORT=${PORT}
Environment=QDRANT_URL=http://localhost:6333

[Install]
WantedBy=multi-user.target
"@

    Invoke-Vps "cat > /etc/systemd/system/${SERVICE_NAME}.service << 'EOFSERVICE'
$serviceContent
EOFSERVICE"

    Write-Info "Stopping service..."
    Invoke-Vps "systemctl stop ${SERVICE_NAME} 2>/dev/null; fuser -k ${PORT}/tcp 2>/dev/null; sleep 1"

    Write-Info "Starting service..."
    Invoke-Vps "systemctl daemon-reload && systemctl enable ${SERVICE_NAME} && systemctl start ${SERVICE_NAME}"

    Start-Sleep -Seconds 5

    # Verify service is running and API responds
    Write-Info "Verifying..."
    Invoke-Vps "systemctl status ${SERVICE_NAME} --no-pager -l | head -15"

    Write-Info "Testing API..."
    $apiCheck = Invoke-Vps "curl -sf http://localhost:${PORT}/api/v1/stats && echo '' || echo 'API_FAIL'"
    if ($apiCheck -match "API_FAIL") {
        Write-Err "API is not responding! Check logs with: .\deploy.ps1 -Logs"
    } else {
        Write-Success "API is responding"
    }

    Write-Success "Service started"
}

Write-Host "`n========================================" -ForegroundColor Green
Write-Host "   Deployment complete!                  " -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Beepack is available at:" -ForegroundColor Cyan
Write-Host "  https://${DOMAIN}" -ForegroundColor White
Write-Host "  API: https://${DOMAIN}/api/v1/stats" -ForegroundColor White
Write-Host ""
