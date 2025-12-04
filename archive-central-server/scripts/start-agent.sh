#!/bin/bash

# StarRocks Local Agent Startup Script

# Load environment variables from .env file
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
else
    echo "Error: .env file not found"
    echo "Please copy .env.example to .env and configure it"
    exit 1
fi

# Check required environment variables
if [ -z "$SR_HOST" ]; then
    echo "Error: SR_HOST not configured in .env"
    exit 1
fi

if [ -z "$AGENT_TOKEN" ]; then
    echo "Warning: AGENT_TOKEN not configured in .env"
    echo "Running without authentication is not recommended!"
    read -p "Continue anyway? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Start the agent
echo "Starting StarRocks Local Agent..."
echo "Database: $SR_HOST:${SR_PORT:-9030}"
echo "Port: ${AGENT_PORT:-8080}"
echo ""

node local-agent.js
