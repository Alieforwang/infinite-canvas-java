param([string]$Base = "http://127.0.0.1:8080")

$ErrorActionPreference = "Stop"
$utf8 = New-Object System.Text.UTF8Encoding($false)

# Windows PowerShell 5.1 decodes HTTP bodies with the declared charset; force UTF-8 by reading raw bytes.
function Read-Utf8Json([string]$path) {
    $text = [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)
    return $text | ConvertFrom-Json
}

$email = "enc$((Get-Date).ToString('HHmmss'))@test.local"
$bodyFile = Join-Path $env:TEMP "enc-register.json"
[System.IO.File]::WriteAllText($bodyFile, (@{ email = $email; password = "Passw0rd123"; displayName = "编码校验" } | ConvertTo-Json -Compress), $utf8)
$regFile = Join-Path $env:TEMP "enc-register-result.json"
& curl.exe -s -o $regFile -X POST "$Base/api/auth/register" -H "Content-Type: application/json; charset=utf-8" --data-binary "@$bodyFile"
$reg = Read-Utf8Json $regFile
$token = $reg.data.accessToken
if ([string]::IsNullOrWhiteSpace($token)) { throw "注册失败" }

$modelsFile = Join-Path $env:TEMP "enc-models.json"
& curl.exe -s -o $modelsFile -H "Authorization: Bearer $token" "$Base/api/models"
$models = Read-Utf8Json $modelsFile
$name = $models.data[0].displayName
Write-Host "displayName=$name"
if ($name -notlike "*视频*") {
    throw "UTF-8 编码校验失败：模型名不含中文「视频」"
}

$assetBody = Join-Path $env:TEMP "enc-asset.json"
[System.IO.File]::WriteAllText($assetBody, (@{ kind = "TEXT"; title = "中文标题校验"; textContent = "雨夜城市，霓虹倒影"; tags = @("中文标签") } | ConvertTo-Json -Compress), $utf8)
$assetFile = Join-Path $env:TEMP "enc-asset-result.json"
& curl.exe -s -o $assetFile -X POST "$Base/api/assets" -H "Authorization: Bearer $token" -H "Content-Type: application/json; charset=utf-8" --data-binary "@$assetBody"
$asset = Read-Utf8Json $assetFile
if ($asset.data.title -ne "中文标题校验") {
    throw "UTF-8 编码校验失败：资产标题回读不一致：$($asset.data.title)"
}
Write-Host "asset.title=$($asset.data.title) tags=$($asset.data.tags -join ',')"
Write-Host "ENCODING PASSED" -ForegroundColor Green
