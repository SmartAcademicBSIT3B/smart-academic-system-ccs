@echo off
REM Smart Academic System - Website Test Server (Improved)
REM This script starts a PHP development server with better error handling

setlocal enabledelayedexpansion

set websiteDir=c:\Users\PLPASIG\smart-academic-system-ccs\website\THESIS_CAPSTONE
set port=8000
set alt_port=8001

echo.
echo ========================================
echo Smart Academic System - Test Server
echo ========================================
echo.

REM Check if PHP is installed
echo Checking PHP installation...
where php >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] PHP is not installed or not in PATH
    echo.
    echo Please install PHP from https://www.php.net/downloads
    echo Or add PHP to your system PATH
    echo.
    pause
    exit /b 1
)

php -v
echo.

REM Check if website directory exists
if not exist "%websiteDir%" (
    echo [ERROR] Website directory not found: %websiteDir%
    pause
    exit /b 1
)

echo Website Directory: %websiteDir%
echo.

REM Check if landingpage.php exists
if not exist "%websiteDir%\landingpage.php" (
    echo [ERROR] landingpage.php not found in %websiteDir%
    pause
    exit /b 1
)

echo [OK] All checks passed!
echo.

REM Check if port 8000 is available
echo Checking if port %port% is available...
netstat -ano | findstr :%port% >nul 2>&1
if %errorlevel% equ 0 (
    echo [WARNING] Port %port% is already in use
    echo Using alternate port %alt_port% instead...
    set port=%alt_port%
)

set url=http://localhost:%port%/landingpage.php

echo.
echo ========================================
echo Server URL: %url%
echo ========================================
echo.
echo Starting PHP Development Server on port %port%...
echo Press Ctrl+C to stop the server
echo.

cd /d "%websiteDir%"

REM Open browser
start "" "%url%"

REM Start PHP server with additional options
php -S localhost:%port% -t .

pause
