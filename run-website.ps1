# Smart Academic System - Website Test Server
# This script starts a PHP development server for the website

$websiteDir = "c:\Users\PLPASIG\smart-academic-system-ccs\website\THESIS_CAPSTONE"
$port = 8000
$url = "http://localhost:$port/landingpage.php"

Write-Host "Starting PHP Development Server..." -ForegroundColor Green
Write-Host "Website Directory: $websiteDir" -ForegroundColor Cyan
Write-Host "Server URL: $url" -ForegroundColor Cyan
Write-Host ""

# Navigate to the website directory
Set-Location $websiteDir

# Start the PHP built-in server
Write-Host "Starting server on port $port..." -ForegroundColor Yellow
Write-Host "Press Ctrl+C to stop the server" -ForegroundColor Yellow
Write-Host ""

# Open the browser after a short delay
Start-Job -ScriptBlock {
    Start-Sleep -Seconds 2
    Start-Process $using:url
}

# Start the PHP server (this will block)
php -S localhost:$port
