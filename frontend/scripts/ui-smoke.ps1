param(
    [string]$Base = "http://127.0.0.1:3000",
    [string]$Cdp = "http://127.0.0.1:9222",
    [string]$OutDir = "D:\software\desk\infinite-canvas-studio\docs\screenshots"
)

$ErrorActionPreference = "Stop"
$utf8 = New-Object System.Text.UTF8Encoding($false)
New-Item -ItemType Directory -Force $OutDir | Out-Null

function Send-Cdp($ws, [int]$id, [string]$method, $params) {
    $payload = @{ id = $id; method = $method; params = $params } | ConvertTo-Json -Depth 10 -Compress
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($payload)
    $segment = New-Object System.ArraySegment[byte] -ArgumentList @(,$bytes)
    $ws.SendAsync($segment, [System.Net.WebSockets.WebSocketMessageType]::Text, $true, [Threading.CancellationToken]::None).Wait()
}

function Receive-Cdp($ws, [int]$id, [int]$timeoutMs = 30000) {
    $buffer = New-Object byte[] 1048576
    $segment = New-Object System.ArraySegment[byte] -ArgumentList @(,$buffer)
    $builder = New-Object System.Text.StringBuilder
    $deadline = (Get-Date).AddMilliseconds($timeoutMs)
    while ((Get-Date) -lt $deadline) {
        $builder.Clear() | Out-Null
        do {
            $task = $ws.ReceiveAsync($segment, [Threading.CancellationToken]::None)
            if (-not $task.Wait(5000)) { throw "CDP receive timeout" }
            $result = $task.Result
            $text = [System.Text.Encoding]::UTF8.GetString($buffer, 0, $result.Count)
            $builder.Append($text) | Out-Null
        } while (-not $result.EndOfMessage)
        $message = $builder.ToString() | ConvertFrom-Json
        if ($message.id -eq $id) { return $message }
    }
    throw "CDP response $id not received"
}

function Invoke-Cdp($ws, [string]$method, $params, [int]$id) {
    Send-Cdp $ws $id $method $params
    return Receive-Cdp $ws $id
}

function Save-Screenshot($ws, [string]$path, [int]$id) {
    $shot = Invoke-Cdp $ws "Page.captureScreenshot" @{ format = "png"; captureBeyondViewport = $false } $id
    [System.IO.File]::WriteAllBytes($path, [Convert]::FromBase64String($shot.result.data))
    Write-Host "screenshot -> $path"
}

# 1) prepare a fresh account via API
$email = "ui$((Get-Date).ToString('HHmmss'))@test.local"
$bodyFile = Join-Path $env:TEMP "ui-register.json"
[System.IO.File]::WriteAllText($bodyFile, (@{ email = $email; password = "Passw0rd123"; displayName = "UI Reviewer" } | ConvertTo-Json -Compress), $utf8)
$regFile = Join-Path $env:TEMP "ui-register-result.json"
& curl.exe -s -o $regFile -X POST "$Base/api/auth/register" -H "Content-Type: application/json; charset=utf-8" --data-binary "@$bodyFile"
$reg = [System.IO.File]::ReadAllText($regFile, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
if ($reg.code -ne "OK") { throw "register failed: $($reg.message)" }
$token = $reg.data.accessToken
$refresh = $reg.data.refreshToken
Write-Host "test user=$email credits=$($reg.data.credits.available)"

# 2) connect to the first available Chrome CDP target
$targets = Invoke-RestMethod "$Cdp/json"
$page = $targets | Where-Object { $_.type -eq "page" } | Select-Object -First 1
if (-not $page) { throw "no Chrome page target, start Chrome with --remote-debugging-port=9222" }
$ws = New-Object System.Net.WebSockets.ClientWebSocket
$ws.ConnectAsync([Uri]$page.webSocketDebuggerUrl, [Threading.CancellationToken]::None).Wait()
$id = 1
Invoke-Cdp $ws "Page.enable" @{} $id | Out-Null; $id++
Invoke-Cdp $ws "Runtime.enable" @{} $id | Out-Null; $id++
Invoke-Cdp $ws "Emulation.setDeviceMetricsOverride" @{ width = 1440; height = 900; deviceScaleFactor = 1; mobile = $false } $id | Out-Null; $id++

# 3) login page screenshot
Invoke-Cdp $ws "Page.navigate" @{ url = "$Base/login" } $id | Out-Null; $id++
Start-Sleep -Seconds 3
Save-Screenshot $ws (Join-Path $OutDir "login.png") $id; $id++

# 4) inject tokens and open each app page
$expr = "localStorage.setItem('ic_access_token','$token');localStorage.setItem('ic_refresh_token','$refresh');'ok'"
Invoke-Cdp $ws "Runtime.evaluate" @{ expression = $expr; returnByValue = $true } $id | Out-Null; $id++

foreach ($route in @(
    @{ path = "/video"; file = "video.png" },
    @{ path = "/assets"; file = "assets.png" },
    @{ path = "/account"; file = "account.png" }
)) {
    Invoke-Cdp $ws "Page.navigate" @{ url = "$Base$($route.path)" } $id | Out-Null; $id++
    Start-Sleep -Seconds 4
    Save-Screenshot $ws (Join-Path $OutDir $route.file) $id; $id++
}

# 5) sanity: collect console errors and page URL/title
$state = Invoke-Cdp $ws "Runtime.evaluate" @{ expression = "JSON.stringify({url:location.href,title:document.title,body:document.body.innerText.slice(0,200)})"; returnByValue = $true } $id
Write-Host "page state: $($state.result.result.value)"
$ws.Dispose()
Write-Host "UI SMOKE PASSED email=$email"
