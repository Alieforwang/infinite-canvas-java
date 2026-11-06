param(
    [string]$Base = "http://127.0.0.1:3000",
    [string]$Cdp = "http://127.0.0.1:9222"
)
$ErrorActionPreference = "Stop"
$data = [System.IO.File]::ReadAllText("D:\software\desk\infinite-canvas-studio\.tmp\ui-data.json", [System.Text.Encoding]::UTF8) | ConvertFrom-Json

function Send-Cdp($ws, [int]$id, [string]$method, $params) {
    $payload = @{ id = $id; method = $method; params = $params } | ConvertTo-Json -Depth 10 -Compress
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($payload)
    $ws.SendAsync((New-Object System.ArraySegment[byte] -ArgumentList @(,$bytes)), [System.Net.WebSockets.WebSocketMessageType]::Text, $true, [Threading.CancellationToken]::None).Wait()
}

function Receive-Any($ws, [int]$timeoutMs = 1000) {
    $buffer = New-Object byte[] 262144
    $segment = New-Object System.ArraySegment[byte] -ArgumentList @(,$buffer)
    $cts = New-Object System.Threading.CancellationTokenSource
    $cts.CancelAfter($timeoutMs)
    try {
        $task = $ws.ReceiveAsync($segment, $cts.Token)
        $task.Wait()
        if (-not $task.Result.EndOfMessage) { return $null }
        $text = [System.Text.Encoding]::UTF8.GetString($buffer, 0, $task.Result.Count)
        return $text | ConvertFrom-Json
    } catch {
        return $null
    }
}

$targets = Invoke-RestMethod "$Cdp/json"
$page = $targets | Where-Object { $_.type -eq "page" } | Select-Object -First 1
$ws = New-Object System.Net.WebSockets.ClientWebSocket
$ws.ConnectAsync([Uri]$page.webSocketDebuggerUrl, [Threading.CancellationToken]::None).Wait()
$id = 1
Send-Cdp $ws $id "Page.enable" @{}; $id++
Send-Cdp $ws $id "Runtime.enable" @{}; $id++
Send-Cdp $ws $id "Network.enable" @{}; $id++
Send-Cdp $ws $id "Emulation.setDeviceMetricsOverride" @{ width = 1600; height = 960; deviceScaleFactor = 1; mobile = $false }; $id++
$expr = "localStorage.setItem('ic_access_token','$($data.token)');localStorage.setItem('ic_refresh_token','$($data.refresh)');'ok'"
Send-Cdp $ws $id "Runtime.evaluate" @{ expression = $expr; returnByValue = $true }; $id++
Start-Sleep -Milliseconds 500
Send-Cdp $ws $id "Page.navigate" @{ url = "$Base/canvas/$($data.projectNo)" }; $id++

$end = (Get-Date).AddSeconds(10)
$events = @()
while ((Get-Date) -lt $end) {
    $msg = Receive-Any $ws 800
    if ($null -eq $msg) { continue }
    if ($msg.method -eq "Network.responseReceived" -and $msg.params.response.url -match "canvas-projects") {
        $events += "RESP $($msg.params.response.status) $($msg.params.response.url)"
    }
    if ($msg.method -eq "Network.loadingFailed") {
        $events += "FAILED $($msg.params.errorText) $($msg.params.requestId)"
    }
    if ($msg.method -eq "Runtime.exceptionThrown") {
        $events += "EXC $($msg.params.exceptionDetails.text) $($msg.params.exceptionDetails.exception.description)"
    }
    if ($msg.method -eq "Runtime.consoleAPICalled" -and $msg.params.type -eq "error") {
        $events += "CONSOLE-ERR $($msg.params.args | ForEach-Object { $_.value } | Out-String)"
    }
}
Write-Host "=== canvas project network events ==="
$events | Select-Object -Last 30 | ForEach-Object { Write-Host $_ }

$evalId = $id
Send-Cdp $ws $evalId "Runtime.evaluate" @{ expression = "JSON.stringify({status:document.body.innerText.slice(0,120), version:document.body.innerText.match(/\d+%/)?.[0]})"; returnByValue = $true }
$resp = Receive-Any $ws 3000
Write-Host "page: $($resp.result.result.value)"
$ws.Dispose()
