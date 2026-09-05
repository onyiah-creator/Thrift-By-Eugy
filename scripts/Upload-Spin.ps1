# Thrift by Eugy - upload a 360 spin sequence for one product
#
# Uploads every photo in a folder, in order, as numbered frames for one SKU.
# Requires curl.exe (built into Windows) rather than PowerShell's own HTTP
# commands - this session found Invoke-RestMethod's multipart handling
# unreliable on PowerShell 5.1; curl.exe has been the one that actually works.
#
# USAGE
#   .\Upload-Spin.ps1 -Sku TBE-0087 -FolderPath .\spin-photos\TBE-0087
#
# Expects the folder to contain the frames in the order they should play,
# named so normal alphabetical sort matches shooting order - e.g.
# frame01.jpg, frame02.jpg ... frame36.jpg (NOT frame1.jpg, frame2.jpg,
# frame10.jpg, which sorts wrong once you pass 9).

param(
    [Parameter(Mandatory=$true)][string]$Sku,
    [Parameter(Mandatory=$true)][string]$FolderPath,
    [string]$ImagesApi = "https://thriftbyeugy-images.onyiah.workers.dev"
)

$ErrorActionPreference = "Stop"

if (-not $env:TBE_TOKEN) {
    Write-Host "No admin token set." -ForegroundColor Red
    Write-Host '  $env:TBE_TOKEN = "your-token"' -ForegroundColor Yellow
    exit 1
}

if (-not (Test-Path $FolderPath)) {
    Write-Host "No folder at $FolderPath" -ForegroundColor Red
    exit 1
}

$files = Get-ChildItem $FolderPath -Include *.jpg,*.jpeg,*.png -Recurse | Sort-Object Name

if ($files.Count -eq 0) {
    Write-Host "No photos found in $FolderPath" -ForegroundColor Red
    exit 1
}
if ($files.Count -lt 8) {
    Write-Host "Only $($files.Count) photo(s) found. A spin needs at least 24 to feel smooth - continuing anyway." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "  Uploading $($files.Count) frame(s) for $Sku" -ForegroundColor Cyan
Write-Host ""

$ok = 0
for ($i = 0; $i -lt $files.Count; $i++) {
    $file = $files[$i]
    $frameArg = "frame=$i"
    $skuArg = "sku=$Sku"
    $fileArg = "file=@$($file.FullName);type=image/jpeg"

    Write-Host -NoNewline "  frame $($i.ToString().PadLeft(2,'0')) - $($file.Name) ... "

    $result = curl.exe -s -X POST "$ImagesApi/admin/spin/upload" `
        -H "Authorization: Bearer $env:TBE_TOKEN" `
        -F $skuArg -F $frameArg -F $fileArg

    try {
        $json = $result | ConvertFrom-Json
        if ($json.ok) {
            Write-Host "saved ($($json.savedPercent)% smaller)" -ForegroundColor Green
            $ok++
        } else {
            Write-Host "FAILED: $($json.error)" -ForegroundColor Red
        }
    } catch {
        Write-Host "FAILED: $result" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "  $ok of $($files.Count) frames uploaded."

if ($ok -eq $files.Count) {
    Write-Host ""
    Write-Host "  Marking $Sku as having a spin..." -ForegroundColor Cyan
    $apiToken = $env:TBE_TOKEN
    $apiUrl = "https://thriftbyeugy-api.onyiah.workers.dev/api/admin/products/$Sku"
    try {
        Invoke-RestMethod -Uri $apiUrl -Method Patch `
            -Headers @{ Authorization = "Bearer $apiToken"; "Content-Type" = "application/json" } `
            -Body (@{ has_spin = $true } | ConvertTo-Json) | Out-Null
        Write-Host "  Done. Check it at: $ImagesApi/spin/$Sku" -ForegroundColor Green
    } catch {
        Write-Host "  Frames uploaded, but couldn't set has_spin on the product record." -ForegroundColor Yellow
        Write-Host "  Check $Sku exists in the database with that exact SKU." -ForegroundColor Yellow
    }
} else {
    Write-Host "  Not all frames succeeded - has_spin was NOT set. Fix the failures and re-run before publishing." -ForegroundColor Yellow
}
