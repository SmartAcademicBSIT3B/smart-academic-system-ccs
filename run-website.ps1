# Smart Academic System - Website Test Server
# This script starts a PHP development server for the website

$websiteDir = Join-Path $PSScriptRoot "website\THESIS_CAPSTONE"
$targetPage = "index.php"

function Test-PortInUse {
    param(
        [Parameter(Mandatory = $true)]
        [int]$Port
    )

    $netCmd = Get-Command Get-NetTCPConnection -ErrorAction SilentlyContinue
    if ($netCmd) {
        return [bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
    }

    return [bool](netstat -ano | Select-String -Pattern ":$Port\s+.*LISTENING")
}

Write-Host "" 
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Smart Academic System - Test Server" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Checking PHP installation..." -ForegroundColor Yellow
$phpCommand = Get-Command php -ErrorAction SilentlyContinue
if (-not $phpCommand) {
    Write-Host "" 
    Write-Host "[ERROR] PHP is not installed or not in PATH" -ForegroundColor Red
    Write-Host "Please install PHP from https://www.php.net/downloads" -ForegroundColor Red
    Write-Host "Or add PHP to your system PATH" -ForegroundColor Red
    exit 1
}

php -v

if (-not (Test-Path -Path $websiteDir -PathType Container)) {
    Write-Host "[ERROR] Website directory not found: $websiteDir" -ForegroundColor Red
    exit 1
}

$targetFile = Join-Path $websiteDir $targetPage
if (-not (Test-Path -Path $targetFile -PathType Leaf)) {
    Write-Host "[ERROR] Target page not found: $targetFile" -ForegroundColor Red
    exit 1
}

$candidatePorts = @(8000, 8001, 8002)
$port = $null
foreach ($candidate in $candidatePorts) {
    if (-not (Test-PortInUse -Port $candidate)) {
        $port = $candidate
        break
    }
}

if (-not $port) {
    Write-Host "[ERROR] No available ports found in 8000, 8001, or 8002" -ForegroundColor Red
    exit 1
}

$url = "http://localhost:$port/$targetPage"

Write-Host "Starting PHP Development Server..." -ForegroundColor Green
Write-Host "Website Directory: $websiteDir" -ForegroundColor Cyan
Write-Host "Start Page: $targetPage" -ForegroundColor Cyan
Write-Host "Server URL: $url" -ForegroundColor Cyan
Write-Host ""

# Navigate to the website directory
Set-Location $websiteDir

# Start the PHP built-in server
Write-Host "Starting server on port $port..." -ForegroundColor Yellow
Write-Host "Press Ctrl+C to stop the server" -ForegroundColor Yellow
Write-Host ""

# Open browser
Start-Process $url

# Start the PHP server (this will block)
php -S localhost:$port -t .
