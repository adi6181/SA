@echo off
REM ShopHub Quick Start Script for Windows
REM This script sets up and runs the complete e-commerce platform

echo.
echo 🛍️  ShopHub E-Commerce Platform - Quick Start
echo ============================================== 
echo.

REM Check if Python is installed
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Python is not installed or not in PATH
    echo Please install Python 3.8 or higher from https://www.python.org
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('python --version') do set PYTHON_VERSION=%%i
echo ✓ Python found: %PYTHON_VERSION%
echo.

REM Setup Backend
echo 🔧 Setting up backend...
cd backend

REM Create virtual environment
if not exist "venv" (
    echo Creating virtual environment...
    python -m venv venv
)

REM Activate virtual environment
call venv\Scripts\activate.bat

REM Install dependencies
echo Installing Python packages...
pip install -q -r requirements.txt

REM Setup environment file
if not exist ".env" (
    echo Creating .env file...
    copy .env.example .env
    echo ⚠️  Please edit backend\.env with your email configuration
)

REM Create database and seed data
echo Setting up database...
python run.py >nul 2>&1 &
timeout /t 2 >nul

echo Adding sample products...
python seed_products.py

echo.
echo ✓ Backend setup complete!
echo.

REM Return to root directory
cd ..

REM Summary
echo 🎉 ShopHub is ready to run!
echo.
echo 📋 To start the application, run these commands in separate terminals:
echo.
echo Command Prompt 1 (Backend):
echo   cd backend
echo   venv\Scripts\activate.bat
echo   python run.py
echo.
echo Command Prompt 2 (Frontend):
echo   cd frontend
echo   python -m http.server 8000
echo.
echo Then open: http://localhost:8000/templates/index.html
echo.
echo 📚 Documentation:
echo   - README.md - Complete documentation
echo   - DEPLOYMENT.md - Production deployment guide
echo   - TESTING.md - Testing guide
echo.
echo 🚀 Happy selling!
echo.
pause
