#!/bin/bash
# Packbee - Test All Components

echo "🐝 Packbee - Testing All Components"
echo "======================================"
echo ""

# Start server
echo "Starting server..."
cd /home/node/vibe-coding/codehive
node server.js &
SERVER_PID=$!
sleep 3

# Check server health
echo "Testing API health..."
HEALTH=$(curl -s http://localhost:3011/api/health)
if echo "$HEALTH" | grep -q "ok"; then
    echo "✅ API Health: OK"
else
    echo "❌ API Health: FAILED"
    kill $SERVER_PID 2>/dev/null
    exit 1
fi

# Test packages endpoint
echo "Testing packages endpoint..."
PACKAGES=$(curl -s http://localhost:3011/api/v1/packages)
if echo "$PACKAGES" | grep -q "notion-sync"; then
    echo "✅ Packages API: OK"
else
    echo "❌ Packages API: FAILED"
fi

# Test search endpoint
echo "Testing search endpoint..."
SEARCH=$(curl -s "http://localhost:3011/api/v1/search?q=notion")
if echo "$SEARCH" | grep -q "results"; then
    echo "✅ Search API: OK"
else
    echo "❌ Search API: FAILED"
fi

# Test stats endpoint
echo "Testing stats endpoint..."
STATS=$(curl -s http://localhost:3011/api/v1/stats)
if echo "$STATS" | grep -q "packages"; then
    echo "✅ Stats API: OK"
else
    echo "❌ Stats API: FAILED"
fi

# Test static site
echo "Testing static site..."
SITE=$(curl -s http://localhost:3011)
if echo "$SITE" | grep -q "Packbee"; then
    echo "✅ Static Site: OK"
else
    echo "❌ Static Site: FAILED"
fi

# Test CLI (if available)
if [ -f "/home/node/vibe-coding/codehive/cli/bin/packbee.js" ]; then
    echo "Testing CLI..."
    CLI_HELP=$(node /home/node/vibe-coding/codehive/cli/bin/packbee.js --help 2>&1)
    if echo "$CLI_HELP" | grep -q "packbee"; then
        echo "✅ CLI: OK"
    else
        echo "❌ CLI: FAILED"
    fi
fi

echo ""
echo "======================================"
echo "🐝 All tests completed!"
echo ""
echo "Server running on http://localhost:3011"
echo "Press Ctrl+C to stop"

# Keep server running
wait $SERVER_PID
