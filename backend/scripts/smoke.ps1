param(
    [string]$Base = "http://127.0.0.1:8080",
    [string]$Email = "",
    [string]$Password = "Passw0rd123"
)

$ErrorActionPreference = "Stop"
if ([string]::IsNullOrWhiteSpace($Email)) {
    $Email = "smoke$((Get-Date).ToString('HHmmss'))@test.local"
}

function Show-Json($value) { $value | ConvertTo-Json -Depth 8 -Compress }

Write-Host "== 1. register ==" -ForegroundColor Cyan
$registerBody = @{ email = $Email; password = $Password; displayName = "Smoke User" } | ConvertTo-Json
$register = Invoke-RestMethod -Method Post -Uri "$Base/api/auth/register" -ContentType "application/json" -Body $registerBody
$token = $register.data.accessToken
$headers = @{ Authorization = "Bearer $token" }
Write-Host "user=$($register.data.user.email) credits=$($register.data.credits.available)"

Write-Host "== 2. me / models ==" -ForegroundColor Cyan
$me = Invoke-RestMethod -Uri "$Base/api/auth/me" -Headers $headers
Write-Host "me credits=$($me.data.credits.available)"
$models = Invoke-RestMethod -Uri "$Base/api/models?capability=video" -Headers $headers
if ($models.data.Count -lt 1) { throw "no models available" }
$model = $models.data[0]
Write-Host "model=$($model.id) name=$($model.displayName) seconds=$($model.params.seconds -join ',') factors=$(Show-Json $model.pricing.resolutionFactors)"

Write-Host "== 3. redeem ==" -ForegroundColor Cyan
$redeemed = $false
foreach ($code in @("SMOKE-5000", "WELCOME-1000")) {
    try {
        $redeem = Invoke-RestMethod -Method Post -Uri "$Base/api/account/redeem" -Headers $headers -ContentType "application/json" -Body ("{`"code`":`"$code`"}")
        Write-Host "redeem $code credits=$($redeem.data.credits)"
        $redeemed = $true
        break
    } catch {
        Write-Host "redeem $code skipped: $($_.Exception.Message)" -ForegroundColor Yellow
    }
}
if (-not $redeemed) { Write-Host "no redeem code available, continuing with registration gift" -ForegroundColor Yellow }

Write-Host "== 4. create video task ==" -ForegroundColor Cyan
$idem = [guid]::NewGuid().ToString()
$createRaw = & curl.exe -s -X POST "$Base/api/video-tasks" `
    -H "Authorization: Bearer $token" `
    -H "Idempotency-Key: $idem" `
    -F "modelId=$($model.id)" `
    -F "prompt=rain city, silver sports car, cinematic" `
    -F "seconds=$($model.params.seconds[0])" `
    -F "resolution=720p" `
    -F "size=1280x720" `
    -F "ratio=16:9" `
    -F "generateAudio=true" `
    -F "watermark=false" `
    -F "mode=frames"
$create = $createRaw | ConvertFrom-Json
if ($create.code -ne "OK") { throw "create failed: $createRaw" }
$taskNo = $create.data.taskNo
Write-Host "task=$taskNo estimated=$($create.data.estimatedCredits) held=$($create.data.heldCredits)"

Write-Host "== 5. poll until finished ==" -ForegroundColor Cyan
$final = $null
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 2
    $task = Invoke-RestMethod -Uri "$Base/api/video-tasks/$taskNo" -Headers $headers
    Write-Host ("  poll {0}: status={1} progress={2} file={3} error={4}" -f $i, $task.data.status, $task.data.progress, $task.data.file.fileNo, $task.data.errorMessage)
    if (@("succeeded", "failed", "cancelled") -contains $task.data.status) { $final = $task; break }
}
if ($null -eq $final) { throw "task did not finish in time" }
if ($final.data.status -ne "succeeded") { throw "task failed: $($final.data.errorMessage)" }

Write-Host "== 6. download content ==" -ForegroundColor Cyan
$outFile = Join-Path $PSScriptRoot "smoke-output.mp4"
Invoke-WebRequest -Uri "$Base$($final.data.file.url)" -OutFile $outFile | Out-Null
$bytes = [System.IO.File]::ReadAllBytes($outFile)
$magic = [System.Text.Encoding]::ASCII.GetString($bytes[4..7])
Write-Host "downloaded bytes=$($bytes.Length) magic=$magic"
if ($bytes.Length -le 0) { throw "downloaded file is empty" }

Write-Host "== 7. account & ledger ==" -ForegroundColor Cyan
$account = Invoke-RestMethod -Uri "$Base/api/account" -Headers $headers
Write-Host "available=$($account.data.available) frozen=$($account.data.frozen) consumed=$($account.data.totalConsumed)"
$tx = Invoke-RestMethod -Uri "$Base/api/account/transactions?page=1&pageSize=20" -Headers $headers
$tx.data.items | Select-Object bizType, bizLabel, amount, balanceAfter | Format-Table -AutoSize | Out-String | Write-Host

Write-Host "== 8. history ==" -ForegroundColor Cyan
$history = Invoke-RestMethod -Uri "$Base/api/video-tasks?page=1&pageSize=10" -Headers $headers
Write-Host "history count=$($history.data.items.Count) first=$($history.data.items[0].taskNo) status=$($history.data.items[0].status)"

Write-Host "SMOKE PASSED email=$Email" -ForegroundColor Green
