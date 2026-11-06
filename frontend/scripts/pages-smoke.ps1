param(
    [string]$Base = "http://127.0.0.1:3000",
    [string]$Cdp = "http://127.0.0.1:9222",
    [string]$OutDir = "D:\software\desk\infinite-canvas-studio\docs\screenshots"
)

$ErrorActionPreference = "Stop"
New-Item -ItemType Directory -Force $OutDir | Out-Null
$utf8 = New-Object System.Text.UTF8Encoding($false)

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

function Save-Shot($ws, [string]$name, [int]$id) {
    $shot = Invoke-Cdp $ws "Page.captureScreenshot" @{ format = "png"; captureBeyondViewport = $false } $id
    [System.IO.File]::WriteAllBytes((Join-Path $OutDir $name), [Convert]::FromBase64String($shot.result.data))
    Write-Host "screenshot -> $name"
}

$dataFile = "D:\software\desk\infinite-canvas-studio\.tmp\ui-data.json"
if (-not (Test-Path $dataFile)) { throw "missing ui-data.json (run prepare step first)" }
$data = [System.IO.File]::ReadAllText($dataFile, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
$token = $data.token
$refresh = $data.refresh
$projectNo = $data.projectNo
if (-not $projectNo) { throw "ui-data.json missing projectNo" }
Write-Host "user=$($data.email) project=$projectNo"

$targets = Invoke-RestMethod "$Cdp/json"
$page = $targets | Where-Object { $_.type -eq "page" } | Select-Object -First 1
if (-not $page) { throw "no Chrome page target" }
$ws = New-Object System.Net.WebSockets.ClientWebSocket
$ws.ConnectAsync([Uri]$page.webSocketDebuggerUrl, [Threading.CancellationToken]::None).Wait()
$id = 1
Invoke-Cdp $ws "Page.enable" @{} $id | Out-Null; $id++
Invoke-Cdp $ws "Runtime.enable" @{} $id | Out-Null; $id++
Invoke-Cdp $ws "Emulation.setDeviceMetricsOverride" @{ width = 1600; height = 960; deviceScaleFactor = 1; mobile = $false } $id | Out-Null; $id++

Invoke-Cdp $ws "Page.navigate" @{ url = "$Base/login" } $id | Out-Null; $id++
Start-Sleep -Seconds 3
Save-Shot $ws "login.png" $id; $id++

$expr = "localStorage.setItem('ic_access_token','$token');localStorage.setItem('ic_refresh_token','$refresh');'ok'"
Invoke-Cdp $ws "Runtime.evaluate" @{ expression = $expr; returnByValue = $true } $id | Out-Null; $id++

$pages = @(
    @{ path = "/video"; file = "video.png"; wait = 4 },
    @{ path = "/canvas"; file = "canvas-list.png"; wait = 4 },
    @{ path = "/canvas/$projectNo"; file = "canvas-editor.png"; wait = 6 },
    @{ path = "/assets"; file = "assets.png"; wait = 4 },
    @{ path = "/account"; file = "account.png"; wait = 4 }
)
foreach ($item in $pages) {
    Invoke-Cdp $ws "Page.navigate" @{ url = "$Base$($item.path)" } $id | Out-Null; $id++
    Start-Sleep -Seconds $item.wait
    Save-Shot $ws $item.file $id; $id++
}

$state = Invoke-Cdp $ws "Runtime.evaluate" @{ expression = "JSON.stringify({url:location.href,title:document.title,body:document.body.innerText.slice(0,240)})"; returnByValue = $true } $id
Write-Host "editor state: $($state.result.result.value)"

# open generation modal on the canvas editor for visual verification
Invoke-Cdp $ws "Page.navigate" @{ url = "$Base/canvas/$projectNo" } $id | Out-Null; $id++
Start-Sleep -Seconds 9
$click = Invoke-Cdp $ws "Runtime.evaluate" @{ expression = "(()=>{const b=[...document.querySelectorAll('button')].find(x=>(x.textContent||'').includes('生成视频'));if(b){b.click();return 'clicked';}return 'not-found:'+document.body.innerText.slice(0,60);})()"; returnByValue = $true } $id
Write-Host "generate click: $($click.result.result.value)"; $id++
Start-Sleep -Seconds 2
Save-Shot $ws "canvas-generate.png" $id; $id++

# select the newest real generation in the video workbench history and screenshot the player
Invoke-Cdp $ws "Page.navigate" @{ url = "$Base/video" } $id | Out-Null; $id++
Start-Sleep -Seconds 5
$pick = Invoke-Cdp $ws "Runtime.evaluate" @{ expression = "(()=>{const b=[...document.querySelectorAll('aside .thin-scrollbar button')];if(!b.length)return 'no-history';b[0].click();return 'clicked';})()"; returnByValue = $true } $id
Write-Host "history pick: $($pick.result.result.value)"; $id++
Start-Sleep -Seconds 4
Save-Shot $ws "video-real.png" $id; $id++
$ws.Dispose()
Write-Host "PAGES SMOKE PASSED"
