@echo off
REM Smart Academic System - Website Test Server (Improved)
REM This script starts a PHP development server with better error handling

setlocal enabledelayedexpansion

set "websiteDir=%~dp0website\THESIS_CAPSTONE"
set "targetPage=index.php"
set "port="

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
echo Start Page: %targetPage%
echo.

REM Check if target page exists
if not exist "%websiteDir%\%targetPage%" (
    echo [ERROR] %targetPage% not found in %websiteDir%
    pause
    exit /b 1
)

echo [OK] All checks passed!
echo.

REM Find first available port
echo Checking available ports (8000, 8001, 8002)...
for %%P in (8000 8001 8002) do (
    netstat -ano | findstr /r /c:":%%P .*LISTENING" >nul 2>&1
    if errorlevel 1 (
        set "port=%%P"
        goto :portFound
    )
)

echo [ERROR] No available ports found in 8000, 8001, or 8002
pause
exit /b 1

:portFound

set "url=http://localhost:!port!/%targetPage%"

echo.
echo ========================================
echo Server URL: !url!
echo ========================================
echo.
echo Starting PHP Development Server on port !port!...
echo Press Ctrl+C to stop the server
echo.

cd /d "%websiteDir%"

REM Open browser
start "" "!url!"

REM Start PHP server with additional options
php -S localhost:!port! -t .

pause
