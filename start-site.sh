#!/bin/bash
# CodeHive - Start Static Site
# Usage: ./start-site.sh [port]

PORT=${1:-8080}

echo "🐝 CodeHive - Starting static site on port $PORT"
echo ""

cd "$(dirname "$0")/site"

# Check if Python is available
if command -v python3 &> /dev/null; then
    echo "Using Python HTTP server..."
    python3 -m http.server $PORT
elif command -v python &> /dev/null; then
    echo "Using Python HTTP server..."
    python -m http.server $PORT
elif command -v npx &> /dev/null; then
    echo "Using npx serve..."
    npx serve -p $PORT
else
    echo "❌ No HTTP server found. Install Python or Node.js"
    exit 1
fi
