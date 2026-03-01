# Antigravity Scorch - Deployment Script
# Credentials retrieved from shared MT_Vystava project

$ftpHost = "ftpx.forpsi.com"
$ftpUser = "miss3cz"
$ftpPass = "87QvCdFWrD"
$remotePath = "/subdoms/virtual/scorch"

Write-Host "🚀 Starting deployment to $ftpHost..." -ForegroundColor Cyan

# Files to upload
$files = @("index.html", "game.js", "style.css")

$webClient = New-Object System.Net.WebClient
$webClient.Credentials = New-Object System.Net.NetworkCredential($ftpUser, $ftpPass)

foreach ($file in $files) {
    if (Test-Path $file) {
        $localFile = (Get-Item $file).FullName
        $remoteFile = "ftp://$ftpHost$remotePath/$file"
        Write-Host "📤 Uploading $file..." -ForegroundColor Yellow
        try {
            $webClient.UploadFile($remoteFile, "STOR", $localFile)
            Write-Host "✅ $file uploaded successfully." -ForegroundColor Green
        }
        catch {
            Write-Host "❌ Failed to upload $file : $_" -ForegroundColor Red
        }
    }
    else {
        Write-Host "⚠️ Warning: $file not found locally, skipping." -ForegroundColor Gray
    }
}

Write-Host "📂 Ensuring remote 'music' directory exists..." -ForegroundColor Yellow
try {
    $req = [System.Net.FtpWebRequest]::Create("ftp://$ftpHost$remotePath/music")
    $req.Method = [System.Net.WebRequestMethods+Ftp]::MakeDirectory
    $req.Credentials = New-Object System.Net.NetworkCredential($ftpUser, $ftpPass)
    $resp = $req.GetResponse()
    $resp.Close()
}
catch {
    # Directory likely already exists
}

# Upload Music Files (DISABLED TEMPORARILY)
# if (Test-Path "music") {
#     $musicFiles = Get-ChildItem "music" -Filter *.mp3
#     foreach ($m in $musicFiles) {
#         $localFile = $m.FullName
#         $remoteFile = "ftp://$ftpHost$remotePath/music/$($m.Name)"
#         Write-Host "🎵 Uploading music/$($m.Name)..." -ForegroundColor Yellow
#         try {
#             $webClient.UploadFile($remoteFile, "STOR", $localFile)
#             Write-Host "✅ music/$($m.Name) uploaded." -ForegroundColor Green
#         }
#         catch {
#             Write-Host "❌ Failed to upload music/$($m.Name) : $_" -ForegroundColor Red
#         }
#     }
# }

Write-Host "🎉 Deployment completed!" -ForegroundColor Cyan
