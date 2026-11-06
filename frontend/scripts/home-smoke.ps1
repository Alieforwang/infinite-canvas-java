param(
    [string]$Base = "http://127.0.0.1:3000",
    [string]$Cdp = "http://127.0.0.1:9222",
    [string]$OutDir = "D:\software\desk\infinite-canvas-studio\docs\screenshots"
)
$ErrorActionPreference = "Stop"
New-Item -ItemType Directory -Force $OutDir | Out-Null

function Send-Cdp($ws, [int]$id, [string]$method, $params) {
    $payload = @{ id = $id; method = $method; params = $params } | ConvertTo-Json -Depth 10 -Compress
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($payload)
    $ws.SendAsync((New-Object System.ArraySegment[byte] -ArgumentList @(,$bytes)), [System.Net.WebSockets.WebSocketMessageType]::Text, $true, [Threading.CancellationToken]::None).Wait()
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
            $builder.Append([System.Text.Encoding]::UTF8.GetString($buffer, 0, $result.Count)) | Out-Null
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
function Save-Shot($ws, [string]$name, [int]$id) {
    $shot = Invoke-Cdp $ws "Page.captureScreenshot" @{ format = "png"; captureBeyondViewport = $false } $id
    [System.IO.File]::WriteAllBytes((Join-Path $OutDir $name), [Convert]::FromBase64String($shot.result.data))
    Write-Host "screenshot -> $name"
}

$targets = Invoke-RestMethod "$Cdp/json"
$page = $targets | Where-Object { $_.type -eq "page" } | Select-Object -First 1
$ws = New-Object System.Net.WebSockets.ClientWebSocket
$ws.ConnectAsync([Uri]$page.webSocketDebuggerUrl, [Threading.CancellationToken]::None).Wait()
$id = 1
Invoke-Cdp $ws "Page.enable" @{} $id | Out-Null; $id++
Invoke-Cdp $ws "Runtime.enable" @{} $id | Out-Null; $id++
Invoke-Cdp $ws "Emulation.setDeviceMetricsOverride" @{ width = 1600; height = 960; deviceScaleFactor = 1; mobile = $false } $id | Out-Null; $id++

# guest view: clear tokens, then open the official landing page
Invoke-Cdp $ws "Page.navigate" @{ url = "$Base/" } $id | Out-Null; $id++
Start-Sleep -Seconds 3
Invoke-Cdp $ws "Runtime.evaluate" @{ expression = "localStorage.removeItem('ic_access_token');localStorage.removeItem('ic_refresh_token');'cleared'"; returnByValue = $true } $id | Out-Null; $id++
Invoke-Cdp $ws "Page.reload" @{} $id | Out-Null; $id++
Start-Sleep -Seconds 4
Save-Shot $ws "home.png" $id; $id++
$state = Invoke-Cdp $ws "Runtime.evaluate" @{ expression = "JSON.stringify({url:location.href,title:document.title,hasLogin:document.body.innerText.includes('登录'),body:document.body.innerText.slice(0,160)})"; returnByValue = $true } $id
Write-Host "home state: $($state.result.result.value)"
$ws.Dispose()
Write-Host "HOME SMOKE PASSED"
