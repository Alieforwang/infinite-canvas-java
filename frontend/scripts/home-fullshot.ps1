param([string]$Base = "http://127.0.0.1:3000", [string]$Cdp = "http://127.0.0.1:9222", [string]$Out = "D:\software\desk\infinite-canvas-studio\docs\screenshots\home-full.png")
$ErrorActionPreference = "Stop"
function Send-Cdp($ws, [int]$id, [string]$method, $params) {
    $payload = @{ id = $id; method = $method; params = $params } | ConvertTo-Json -Depth 12 -Compress
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($payload)
    $ws.SendAsync((New-Object System.ArraySegment[byte] -ArgumentList @(,$bytes)), [System.Net.WebSockets.WebSocketMessageType]::Text, $true, [Threading.CancellationToken]::None).Wait()
}
function Receive-Cdp($ws, [int]$id, [int]$timeoutMs = 60000) {
    $buffer = New-Object byte[] 4194304
    $segment = New-Object System.ArraySegment[byte] -ArgumentList @(,$buffer)
    $builder = New-Object System.Text.StringBuilder
    $deadline = (Get-Date).AddMilliseconds($timeoutMs)
    while ((Get-Date) -lt $deadline) {
        $builder.Clear() | Out-Null
        do {
            $task = $ws.ReceiveAsync($segment, [Threading.CancellationToken]::None)
            if (-not $task.Wait(10000)) { throw "timeout" }
            $result = $task.Result
            $builder.Append([System.Text.Encoding]::UTF8.GetString($buffer, 0, $result.Count)) | Out-Null
        } while (-not $result.EndOfMessage)
        $message = $builder.ToString() | ConvertFrom-Json
        if ($message.id -eq $id) { return $message }
    }
    throw "no response"
}
function Invoke-Cdp($ws, [string]$method, $params, [int]$id) { Send-Cdp $ws $id $method $params; return Receive-Cdp $ws $id }

$targets = Invoke-RestMethod "$Cdp/json"
$page = $targets | Where-Object { $_.type -eq "page" } | Select-Object -First 1
$ws = New-Object System.Net.WebSockets.ClientWebSocket
$ws.ConnectAsync([Uri]$page.webSocketDebuggerUrl, [Threading.CancellationToken]::None).Wait()
$id = 1
Invoke-Cdp $ws "Page.enable" @{} $id | Out-Null; $id++
Invoke-Cdp $ws "Emulation.setDeviceMetricsOverride" @{ width = 1600; height = 5200; deviceScaleFactor = 1; mobile = $false } $id | Out-Null; $id++
Invoke-Cdp $ws "Page.navigate" @{ url = "$Base/" } $id | Out-Null; $id++
Start-Sleep -Seconds 6
$shot = Invoke-Cdp $ws "Page.captureScreenshot" @{ format = "png"; captureBeyondViewport = $false } $id
[System.IO.File]::WriteAllBytes($Out, [Convert]::FromBase64String($shot.result.data))
Write-Host "saved $Out"
$ws.Dispose()
