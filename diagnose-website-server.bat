@echo off
REM Diagnostic script to check PHP and port availability

echo.
echo ========================================
echo Website Server Diagnostic
echo ========================================
echo.

REM Check if PHP is installed
echo Checking for PHP installation...
where php >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] PHP found in PATH
    php -v
) else (
    echo [ERROR] PHP not found in PATH
    echo Please install PHP or add it to your system PATH
    pause
    exit /b 1
)

echo.
echo Checking port 8000 availability...
netstat -ano | findstr :8000 >nul 2>&1
if %errorlevel% equ 0 (
    echo [WARNING] Port 8000 is already in use
    echo Processes using port 8000:
    netstat -ano | findstr :8000
) else (
    echo [OK] Port 8000 is available
)

echo.
echo Checking website directory...
set websiteDir=c:\Users\PLPASIG\smart-academic-system-ccs\website\THESIS_CAPSTONE
if exist "%websiteDir%" (
    echo [OK] Website directory found: %websiteDir%
    dir "%websiteDir%" | findstr /I landingpage.php
) else (
    echo [ERROR] Website directory not found: %websiteDir%
)

echo.
echo ========================================
echo Diagnostic complete. Press any key to continue...
echo ========================================
pause
