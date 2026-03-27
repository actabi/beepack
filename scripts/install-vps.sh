#!/bin/bash
# Packbee VPS Installation Script
# Usage: curl -fsSL https://raw.githubusercontent.com/your-repo/packbee/main/scripts/install-vps.sh | bash

set -e

echo "🐝 Installing Packbee..."

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Installing..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

# Create directory
sudo mkdir -p /opt/packbee
sudo chown $USER:$USER /opt/packbee
cd /opt/packbee

# Clone or download
if [ -d ".git" ]; then
    git pull
else
    # For now, create the structure manually
    echo "📦 Setting up Packbee..."
fi

# Install dependencies
npm install

# Create systemd service
sudo tee /etc/systemd/system/packbee.service > /dev/null <<EOF
[Unit]
Description=Packbee API Server
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=/opt/packbee
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=10
Environment=NODE_ENV=production
Environment=PORT=3011

[Install]
WantedBy=multi-user.target
EOF

# Start service
sudo systemctl daemon-reload
sudo systemctl enable packbee
sudo systemctl start packbee

echo ""
echo "✅ Packbee installed!"
echo ""
echo "📍 Site: http://$(hostname -I | awk '{print $1}'):3011"
echo ""
echo "Next steps:"
echo "  1. Set GitHub OAuth: sudo systemctl edit packbee"
echo "     Add: Environment=GITHUB_CLIENT_ID=xxx"
echo "     Add: Environment=GITHUB_CLIENT_SECRET=xxx"
echo "  2. Set up reverse proxy (nginx/caddy) for HTTPS"
echo "  3. Point your domain to this server"
echo ""
echo "🐝 Happy hiving!"
