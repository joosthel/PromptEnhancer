#!/usr/bin/env bash
# PromptEnhancer — one-click launcher (macOS / Linux)
set -e

cd "$(dirname "$0")"

# Check for Node.js
if ! command -v node &>/dev/null; then
  echo "Node.js is not installed. Download it from https://nodejs.org"
  exit 1
fi

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  npm install
fi

# Check for API key
if [ ! -f ".env.local" ]; then
  echo ""
  echo "No .env.local file found."
  echo "Create one with your OpenRouter API key:"
  echo ""
  echo "  echo 'OPENROUTER_API_KEY=sk-or-v1-...' > .env.local"
  echo ""
  echo "Get a key at https://openrouter.ai"
  exit 1
fi

echo ""
echo "Starting PromptEnhancer on http://localhost:3000 ..."
echo ""

# Open browser after a short delay
(sleep 2 && open "http://localhost:3000" 2>/dev/null || xdg-open "http://localhost:3000" 2>/dev/null) &

npm run dev
