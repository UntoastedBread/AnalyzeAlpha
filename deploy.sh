#!/bin/bash
set -e

cd ~/AnalyzeAlpha

echo "Pulling latest changes..."
git pull origin main

echo "Installing dependencies..."
npm install

echo "Building frontend..."
npm run build

echo "Restarting server..."
pm2 restart analyzealpha

echo "Deploy complete!"
