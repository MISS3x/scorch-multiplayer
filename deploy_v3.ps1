param(
    [string]$server = "ftpx.forpsi.com",
    [string]$user = "miss3.cz",
    [string]$pass = "t8pSndzY",
    [string]$remotePath = "/subdoms/virtual/scorch"
)

$files = @("index.html", "game.js", "style.css")

# Ensure we are in the script directory
$scriptPath = Split-Path $MyInvocation.MyCommand.Path
if (!$scriptPath) { $scriptPath = Get-Location }
Push-Location $scriptPath

Write-Host "Starting FTP Upload (DEBUG MODE) to: $server" -ForegroundColor Cyan

foreach ($file in $files) {
    $uri = "ftp://$server" + $remotePath + "/" + $file
    $localFile = Join-Path $scriptPath $file
    
    if (!(Test-Path $localFile)) {
        Write-Host "File not found: $localFile" -ForegroundColor Red
        continue
    }

    Write-Host "Uploading $file to $uri ..."
    try {
        $request = [System.Net.FtpWebRequest]::Create($uri)
        $request.Credentials = New-Object System.Net.NetworkCredential($user, $pass)
        $request.Method = [System.Net.WebRequestMethods+Ftp]::UploadFile
        $request.UseBinary = $true
        $request.UsePassive = $true
        $request.KeepAlive = $false

        $fileBytes = [System.IO.File]::ReadAllBytes($localFile)
        $request.ContentLength = $fileBytes.Length

        $requestStream = $request.GetRequestStream()
        $requestStream.Write($fileBytes, 0, $fileBytes.Length)
        $requestStream.Close()
        $requestStream.Dispose()

        $response = $request.GetResponse()
        Write-Host " -> OK ($($response.StatusDescription))" -ForegroundColor Green
        $response.Close()
    } catch {
        Write-Host " -> ERROR: $($_.Exception.Message)" -ForegroundColor Red
        if ($_.Exception.InnerException) {
            Write-Host " -> Inner: $($_.Exception.InnerException.Message)" -ForegroundColor Gray
        }
    }
}

Pop-Location
Write-Host "Deployment finished." -ForegroundColor Yellow
