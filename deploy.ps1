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
$PROJECT_PATH = "D:\Vibe Coding\codehive"
$SERVICE_NAME = "beepack"
$DOMAIN = "beepack.dev"
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

URL: https://beepack.dev

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
    Write-Info "Caddy:"
    Invoke-Vps "systemctl status caddy --no-pager | head -5"
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

    Write-Info "Creating directory on VPS..."
    Invoke-Vps "mkdir -p ${VPS_APP_PATH}"

    # Root files to transfer
    $filesToSync = @(
        "server.js",
        "auth.js",
        "embeddings.js",
        "vector-db.js",
        "storage.js",
        "mcp-remote.js",
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

    # Folders to transfer via tar
    $foldersToSync = @("site", "cli")

    # Create a zip archive (native PowerShell compatible) then extract on VPS
    $zipFile = "$env:TEMP\beepack-deploy.zip"
    $tempStaging = "$env:TEMP\beepack-staging"

    # Clean staging
    if (Test-Path $tempStaging) { Remove-Item $tempStaging -Recurse -Force }
    New-Item -ItemType Directory -Path $tempStaging | Out-Null

    foreach ($folder in $foldersToSync) {
        $srcFolder = "$PROJECT_PATH\$folder"
        if (Test-Path $srcFolder) {
            Write-Info "Copying $folder (excluding node_modules)..."
            robocopy "$srcFolder" "$tempStaging\$folder" /E /XD node_modules data /XF *.db /NFL /NDL /NJH /NJS /NC /NS | Out-Null
        }
    }

    Write-Info "Compressing..."
    if (Test-Path $zipFile) { Remove-Item $zipFile -Force }
    Compress-Archive -Path "$tempStaging\*" -DestinationPath $zipFile -CompressionLevel Optimal

    $zipSize = [math]::Round((Get-Item $zipFile).Length / 1MB, 2)
    Write-Info "Archive created: ${zipSize} MB"

    Write-Info "Sending archive to VPS..."
    scp "$zipFile" "${VPS_USER}@${VPS_IP}:${VPS_APP_PATH}/deploy.zip"

    Write-Info "Extracting on VPS..."
    Invoke-Vps "cd ${VPS_APP_PATH} && rm -rf site cli && apt-get install -y -qq unzip > /dev/null 2>&1 && unzip -qo deploy.zip && rm -f deploy.zip"

    # Local cleanup
    Remove-Item $zipFile -ErrorAction SilentlyContinue
    Remove-Item $tempStaging -Recurse -Force -ErrorAction SilentlyContinue

    Write-Success "Sources transferred"
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

    Write-Info "Starting service..."
    Invoke-Vps "systemctl daemon-reload && systemctl enable ${SERVICE_NAME} && systemctl restart ${SERVICE_NAME}"

    Start-Sleep -Seconds 5

    Write-Info "Verifying..."
    Invoke-Vps "systemctl status ${SERVICE_NAME} --no-pager -l | head -15"

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
