param(
    [string]$server,
    [string]$user,
    [string]$pass,
    [string]$remotePath = "/subdoms/virtual/scorch"
)

# Files to upload
$files = @("index.html", "game.js", "style.css")

$webclient = New-Object System.Net.WebClient
$webclient.Credentials = New-Object System.Net.NetworkCredential($user, $pass)

Write-Host "Starting FTP Upload to: $server$remotePath" -ForegroundColor Cyan

foreach ($file in $files) {
    # Ensure correct path formatting
    $uri = "ftp://$server" + $remotePath + "/" + $file
    $localPath = (Join-Path (Get-Location) $file)
    
    Write-Host "Uploading $file..." -NoNewline
    try {
        $webclient.UploadFile($uri, $localPath)
        Write-Host " OK" -ForegroundColor Green
    } catch {
        Write-Host " ERROR" -ForegroundColor Red
        Write-Error $_
    }
}

Write-Host "Deployment finished." -ForegroundColor Yellow
