#!/bin/bash

# StarRocks MCP HTTP Server Startup Script

set -e

echo "🚀 Starting StarRocks MCP HTTP Server..."
echo ""

# Check if .env file exists
if [ ! -f .env ]; then
    echo "⚠️  Warning: .env file not found!"
    echo "   Creating from .env.example..."
    if [ -f .env.example ]; then
        cp .env.example .env
        echo "   ✅ Created .env file"
        echo "   ⚠️  Please edit .env and configure your settings"
        echo ""
        read -p "Press Enter to continue or Ctrl+C to exit..."
    else
        echo "   ❌ .env.example not found"
        exit 1
    fi
fi

# Load environment variables
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

# Check required environment variables
if [ -z "$SR_HOST" ] || [ -z "$SR_USER" ]; then
    echo "❌ Error: SR_HOST and SR_USER must be set in .env"
    exit 1
fi

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

echo ""
echo "✅ Environment configured:"
echo "   Database: $SR_USER@$SR_HOST:${SR_PORT:-9030}"
echo "   Port: ${PORT:-3000}"
echo "   Auth: ${API_KEY:+Enabled}"
echo ""

# Start the server
node index-expert-http.js
