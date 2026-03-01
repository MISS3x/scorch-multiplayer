param(
    [string]$server = "ftpx.forpsi.com",
    [string]$user = "miss3.cz",
    [string]$pass = "t8pSndzY",
    [string]$remotePath = "/subdoms/virtual/scorch"
)

$files = @("index.html", "game.js", "style.css")
$webclient = New-Object System.Net.WebClient
$webclient.Credentials = New-Object System.Net.NetworkCredential($user, $pass)

Write-Host "Starting FTP Upload (FIXED PATHS) to: $server" -ForegroundColor Cyan

# Force working directory to the script location to ensure local files are found
$scriptPath = Split-Path $MyInvocation.MyCommand.Path
Push-Location $scriptPath

foreach ($file in $files) {
    $uri = "ftp://$server" + $remotePath + "/" + $file
    $localFile = Get-Item (Join-Path $scriptPath $file)
    
    Write-Host "Uploading $($localFile.FullName) -> $uri"
    try {
        $webclient.UploadFile($uri, "STOR", $localFile.FullName)
        Write-Host " -> OK" -ForegroundColor Green
    } catch {
        Write-Host " -> ERROR: $($_.Exception.Message)" -ForegroundColor Red
    }
}

Pop-Location
Write-Host "Deployment finished." -ForegroundColor Yellow
