# Antigravity Scorch - Deployment Script (Fixed)
# Credentials retrieved from shared MT_Vystava project

$ftpHost = "ftpx.forpsi.com"
$ftpUser = "miss3cz"
$ftpPass = "87QvCdFWrD"
$remotePath = "/subdoms/virtual/scorch"

Write-Host "Starting deployment to $ftpHost..." -ForegroundColor Cyan

# Files to upload
$files = @("index.html", "game.js", "style.css", "debug.html", "test.html")

$webClient = New-Object System.Net.WebClient
$webClient.Credentials = New-Object System.Net.NetworkCredential($ftpUser, $ftpPass)

foreach ($file in $files) {
    if (Test-Path $file) {
        $localFile = (Get-Item $file).FullName
        $remoteUri = "ftp://$ftpHost$remotePath/$file"
        Write-Host "Uploading $file..." -ForegroundColor Yellow
        try {
            $webClient.UploadFile($remoteUri, "STOR", $localFile)
            Write-Host "Upload successful: $file" -ForegroundColor Green
        } catch {
            Write-Host "Failed to upload $file : $_" -ForegroundColor Red
        }
    } else {
        Write-Host "Warning: $file not found locally, skipping." -ForegroundColor Gray
    }
}

Write-Host "Deployment completed!" -ForegroundColor Cyan
