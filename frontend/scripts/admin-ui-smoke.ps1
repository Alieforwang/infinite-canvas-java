param(
    [string]$Base = "http://127.0.0.1:3001",
    [string]$Cdp = "http://127.0.0.1:9222",
    [string]$OutDir = "D:\software\desk\infinite-canvas-studio\docs\screenshots"
)

$ErrorActionPreference = "Stop"
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

function Save-Screenshot($ws, [string]$path, [int]$id) {
    $shot = Invoke-Cdp $ws "Page.captureScreenshot" @{ format = "png"; captureBeyondViewport = $false } $id
    [System.IO.File]::WriteAllBytes($path, [Convert]::FromBase64String($shot.result.data))
    Write-Host "screenshot -> $path"
}

$loginFile = Join-Path $env:TEMP "admin-login.json"
[System.IO.File]::WriteAllText($loginFile, '{"username":"admin","password":"Admin@123456"}', (New-Object System.Text.UTF8Encoding($false)))
$resFile = Join-Path $env:TEMP "admin-login-result.json"
& curl.exe -s -o $resFile -X POST "$Base/api/admin/auth/login" -H "Content-Type: application/json" --data-binary "@$loginFile"
$login = [System.IO.File]::ReadAllText($resFile, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
if ($login.code -ne "OK") { throw "admin login failed: $($login.message)" }
$token = $login.data.accessToken
$profile = @{ id = $login.data.id; username = $login.data.username; displayName = $login.data.displayName; role = $login.data.role } | ConvertTo-Json -Compress
Write-Host "admin=$($login.data.username) role=$($login.data.role)"

$targets = Invoke-RestMethod "$Cdp/json"
$page = $targets | Where-Object { $_.type -eq "page" } | Select-Object -First 1
if (-not $page) { throw "no Chrome page target" }
$ws = New-Object System.Net.WebSockets.ClientWebSocket
$ws.ConnectAsync([Uri]$page.webSocketDebuggerUrl, [Threading.CancellationToken]::None).Wait()
$id = 1
Invoke-Cdp $ws "Page.enable" @{} $id | Out-Null; $id++
Invoke-Cdp $ws "Runtime.enable" @{} $id | Out-Null; $id++
Invoke-Cdp $ws "Emulation.setDeviceMetricsOverride" @{ width = 1440; height = 900; deviceScaleFactor = 1; mobile = $false } $id | Out-Null; $id++

Invoke-Cdp $ws "Page.navigate" @{ url = "$Base/admin/login" } $id | Out-Null; $id++
Start-Sleep -Seconds 3
Save-Screenshot $ws (Join-Path $OutDir "admin-login.png") $id; $id++

$expr = "localStorage.setItem('ic_admin_access_token','$token');localStorage.setItem('ic_admin_profile','$($profile -replace "'", "\'" -replace '"', '\"')');'ok'"
Invoke-Cdp $ws "Runtime.evaluate" @{ expression = $expr; returnByValue = $true } $id | Out-Null; $id++

$pages = @(
    @{ path = "/admin/"; file = "admin-dashboard.png" },
    @{ path = "/admin/channels"; file = "admin-channels.png" },
    @{ path = "/admin/models"; file = "admin-models.png" },
    @{ path = "/admin/users"; file = "admin-users.png" },
    @{ path = "/admin/plans"; file = "admin-plans.png" },
    @{ path = "/admin/redeem-codes"; file = "admin-redeem-codes.png" },
    @{ path = "/admin/tasks"; file = "admin-tasks.png" },
    @{ path = "/admin/settings"; file = "admin-settings.png" }
)
foreach ($item in $pages) {
    Invoke-Cdp $ws "Page.navigate" @{ url = "$Base$($item.path)" } $id | Out-Null; $id++
    Start-Sleep -Seconds 3
    Save-Screenshot $ws (Join-Path $OutDir $item.file) $id; $id++
}

$state = Invoke-Cdp $ws "Runtime.evaluate" @{ expression = "JSON.stringify({url:location.href,title:document.title,body:document.body.innerText.slice(0,300)})"; returnByValue = $true } $id
Write-Host "page state: $($state.result.result.value)"
$ws.Dispose()
Write-Host "ADMIN UI SMOKE PASSED"
