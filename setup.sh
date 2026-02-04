#!/bin/bash

# ShopHub Quick Start Script
# This script sets up and runs the complete e-commerce platform

set -e

echo "🛍️  ShopHub E-Commerce Platform - Quick Start"
echo "=============================================="
echo ""

# Check if Python is installed
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 is not installed. Please install Python 3.8 or higher."
    exit 1
fi

echo "✓ Python found: $(python3 --version)"
echo ""

# Setup Backend
echo "🔧 Setting up backend..."
cd backend

# Create virtual environment
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
source venv/bin/activate

# Install dependencies
echo "Installing Python packages..."
pip install --quiet -r requirements.txt

# Setup environment file
if [ ! -f ".env" ]; then
    echo "Creating .env file..."
    cp .env.example .env
    echo "⚠️  Please edit backend/.env with your email configuration"
fi

# Create database and seed data
echo "Setting up database..."
python3 run.py &
BACKEND_PID=$!
sleep 2

echo "Adding sample products..."
python3 seed_products.py

# Kill the test server
kill $BACKEND_PID 2>/dev/null || true

echo ""
echo "✓ Backend setup complete!"
echo ""

# Return to root directory
cd ..

# Summary
echo "🎉 ShopHub is ready to run!"
echo ""
echo "📋 To start the application, run these commands in separate terminals:"
echo ""
echo "Terminal 1 (Backend):"
echo "  cd backend"
echo "  source venv/bin/activate"
echo "  python3 run.py"
echo ""
echo "Terminal 2 (Frontend):"
echo "  cd frontend"
echo "  python3 -m http.server 8000"
echo ""
echo "Then open: http://localhost:8000/templates/index.html"
echo ""
echo "📚 Documentation:"
echo "  - README.md - Complete documentation"
echo "  - DEPLOYMENT.md - Production deployment guide"
echo "  - TESTING.md - Testing guide"
echo ""
echo "🚀 Happy selling!"
