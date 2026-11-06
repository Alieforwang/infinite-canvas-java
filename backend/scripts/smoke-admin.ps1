param(
    [string]$Base = "http://127.0.0.1:8080"
)

$ErrorActionPreference = "Stop"

function Invoke-Json([string]$method, [string]$path, $body, [hashtable]$headers) {
    $params = @{ Method = $method; Uri = "$Base$path"; Headers = $headers }
    if ($null -ne $body) {
        $params.ContentType = "application/json"
        $params.Body = ($body | ConvertTo-Json -Depth 10 -Compress)
    }
    return Invoke-RestMethod @params
}

Write-Host "== admin login ==" -ForegroundColor Cyan
$login = Invoke-Json "Post" "/api/admin/auth/login" @{ username = "admin"; password = "Admin@123456" } @{}
$ah = @{ Authorization = "Bearer $($login.data.accessToken)" }
Write-Host "admin=$($login.data.username) role=$($login.data.role)"

Write-Host "== dashboard ==" -ForegroundColor Cyan
$dash = Invoke-Json "Get" "/api/admin/dashboard" $null $ah
Write-Host "users=$($dash.data.users) tasksToday=$($dash.data.tasksToday) running=$($dash.data.running) successRate=$($dash.data.successRate) trend=$($dash.data.trend.Count) channels=$($dash.data.channels.Count)"

Write-Host "== settings update ==" -ForegroundColor Cyan
$settings = Invoke-Json "Get" "/api/admin/settings" $null $ah
Write-Host "settings count=$($settings.data.Count)"
Invoke-Json "Put" "/api/admin/settings" @{ "site.notice" = "系统维护中，问题请联系管理员" } $ah | Out-Null
$public = Invoke-RestMethod -Uri "$Base/api/public/settings"
Write-Host "public notice=$($public.data.notice)"
Invoke-Json "Put" "/api/admin/settings" @{ "site.notice" = "" } $ah | Out-Null

Write-Host "== channel CRUD ==" -ForegroundColor Cyan
$channelBody = @{
    name = "Smoke 本地渠道"; protocol = "newapi"; baseUrl = "http://127.0.0.1:8080/mock"
    apiKey = "sk-smoke-admin"; authType = "bearer"; maxConcurrency = 4; enabled = $true
}
$channel = Invoke-Json "Post" "/api/admin/channels" $channelBody $ah
$channelId = $channel.data.id
Write-Host "created channel id=$channelId mask=$($channel.data.apiKeyMask) normalized=$($channel.data.normalizedBaseUrl)"
$test = Invoke-Json "Post" "/api/admin/channels/$channelId/test" $null $ah
Write-Host "channel test ok=$($test.data.ok) latency=$($test.data.latencyMs) models=$($test.data.models -join ',')"
$updateBody = $channelBody.Clone()
$updateBody.name = "Smoke 本地渠道（改）"
$updated = Invoke-Json "Put" "/api/admin/channels/$channelId" $updateBody $ah
Write-Host "updated channel name=$($updated.data.name)"

Write-Host "== model CRUD ==" -ForegroundColor Cyan
$modelBody = @{
    channelId = $channelId; upstreamModel = "mock-video-2"; displayName = "Smoke 模型"
    creditsPerSecond = 8; resolutionFactors = '{"480p":1.0,"720p":1.5,"1080p":2.0}'
    resolutionDefault = "720p"; audioFactor = 1.0; minChargeCredits = 1
    supportedSeconds = '["4","6","8"]'; supportedSizes = '["1280x720","720x1280"]'
    supportedRatios = '["16:9","9:16"]'; supportsAudio = 1; supportsWatermark = 1
    supportsFirstLastFrame = 1; supportsReferenceImages = 1; maxReferenceImages = 7
    enabled = $true; sort = 2
}
$model = Invoke-Json "Post" "/api/admin/models" $modelBody $ah
$modelId = $model.data.id
Write-Host "created model id=$modelId name=$($model.data.displayName)"

Write-Host "== user admin ops ==" -ForegroundColor Cyan
$regBody = @{ email = "adminops$((Get-Date).ToString('HHmmss'))@test.local"; password = "Passw0rd123"; displayName = "Ops User" } | ConvertTo-Json -Compress
$reg = Invoke-RestMethod -Method Post -Uri "$Base/api/auth/register" -ContentType "application/json" -Body $regBody
$userId = $reg.data.user.id
Write-Host "target user id=$userId"
$adjust = @{ amount = 200; reason = "smoke 调账" }
Invoke-Json "Post" "/api/admin/users/$userId/credits" $adjust $ah | Out-Null
Invoke-Json "Post" "/api/admin/users/$userId/recharge" @{ amount = 50; remark = "smoke 充值" } $ah | Out-Null
$plans = Invoke-Json "Get" "/api/admin/plans" $null $ah
$planId = $plans.data[0].id
Invoke-Json "Post" "/api/admin/users/$userId/plan" @{ planId = $planId; reason = "smoke 开通" } $ah | Out-Null
$userDetail = Invoke-Json "Get" "/api/admin/users/$userId" $null $ah
Write-Host "user after ops available=$($userDetail.data.available) status=$($userDetail.data.status)"
$userTx = Invoke-Json "Get" "/api/admin/users/$userId/transactions" $null $ah
Write-Host "user tx count=$($userTx.data.Count)"

Write-Host "== plans ==" -ForegroundColor Cyan
$newPlan = Invoke-Json "Post" "/api/admin/plans" @{
    code = "smoke_pack"; name = "Smoke 积分包"; type = "CREDIT_PACK"; priceAmount = 1.0
    credits = 100; bonusCredits = 10; validDays = 0; sort = 99; enabled = $true; description = "smoke"
} $ah
Write-Host "created plan id=$($newPlan.data.id)"
Invoke-Json "Put" "/api/admin/plans/$($newPlan.data.id)" @{ name = "Smoke 积分包（改）" } $ah | Out-Null

Write-Host "== redeem codes ==" -ForegroundColor Cyan
$generated = Invoke-Json "Post" "/api/admin/redeem-codes" @{ count = 2; credits = 300; prefix = "SMK"; validDays = 7 } $ah
Write-Host "generated batch=$($generated.data.batchNo) codes=$($generated.data.codes -join ',')"
$codes = Invoke-Json "Get" "/api/admin/redeem-codes?page=1&pageSize=10" $null $ah
Write-Host "codes listed=$($codes.data.items.Count) firstMask=$($codes.data.items[0].codeMask)"
$codeId = $codes.data.items[0].id
Invoke-Json "Post" "/api/admin/redeem-codes/$codeId/disable" $null $ah | Out-Null
$csv = Invoke-WebRequest -Uri "$Base/api/admin/redeem-codes/export" -Headers $ah
Write-Host "csv bytes=$($csv.RawContentLength)"

Write-Host "== tasks admin ==" -ForegroundColor Cyan
$tasks = Invoke-Json "Get" "/api/admin/tasks?page=1&pageSize=5" $null $ah
Write-Host "tasks=$($tasks.data.items.Count) total=$($tasks.data.total)"
if ($tasks.data.items.Count -gt 0) {
    $taskNo = $tasks.data.items[0].task.taskNo
    $detail = Invoke-Json "Get" "/api/admin/tasks/$taskNo" $null $ah
    Write-Host "task detail=$taskNo status=$($detail.data.task.status) events=$($detail.data.events.Count) calls=$($detail.data.upstreamCalls.Count) tx=$($detail.data.transactions.Count)"
}

Write-Host "== assets ==" -ForegroundColor Cyan
$userHeaders = @{ Authorization = "Bearer $($reg.data.accessToken)" }
$asset = Invoke-Json "Post" "/api/assets" @{ kind = "TEXT"; title = "Smoke 提示词"; textContent = "雨夜城市"; tags = @("smoke", "prompt"); source = "MANUAL" } $userHeaders
Write-Host "created asset=$($asset.data.assetNo) kind=$($asset.data.kind)"
$assetList = Invoke-Json "Get" "/api/assets?kind=text&keyword=Smoke" $null $userHeaders
Write-Host "asset list=$($assetList.data.items.Count)"
$assetUpdated = Invoke-Json "Put" "/api/assets/$($asset.data.assetNo)" @{ title = "Smoke 提示词（改）"; tags = @("smoke") } $userHeaders
Write-Host "asset updated title=$($assetUpdated.data.title)"

Write-Host "== canvas projects ==" -ForegroundColor Cyan
$doc = @{ nodes = @(@{ id = "n1"; type = "text"; title = "分镜"; position = @{ x = 0; y = 0 }; width = 200; height = 100; metadata = @{ content = "雨夜" } }); connections = @(); backgroundMode = "lines"; viewport = @{ x = 0; y = 0; k = 1 } }
$project = Invoke-Json "Post" "/api/canvas-projects" @{ title = "Smoke 画布"; document = $doc } $userHeaders
$projectNo = $project.data.projectNo
Write-Host "created project=$projectNo version=$($project.data.version)"
$doc.nodes += @{ id = "n2"; type = "video"; title = "镜头"; position = @{ x = 250; y = 0 }; width = 300; height = 200; metadata = @{ prompt = "rain" } }
$project2 = Invoke-Json "Put" "/api/canvas-projects/$projectNo" @{ version = $project.data.version; title = "Smoke 画布（改）"; document = $doc } $userHeaders
Write-Host "updated project version=$($project2.data.version) nodes=$($project2.data.document.nodes.Count)"
$projects = Invoke-Json "Get" "/api/canvas-projects" $null $userHeaders
Write-Host "projects=$($projects.data.Count)"
try {
    Invoke-Json "Put" "/api/canvas-projects/$projectNo" @{ version = 1; document = $doc } $userHeaders | Out-Null
    Write-Host "ERROR: stale version accepted" -ForegroundColor Red
} catch {
    Write-Host "stale version rejected: $($_.Exception.Response.StatusCode.value__)"
}

Write-Host "== cleanup ==" -ForegroundColor Cyan
Invoke-Json "Delete" "/api/canvas-projects/$projectNo" $null $userHeaders | Out-Null
Invoke-Json "Delete" "/api/assets/$($asset.data.assetNo)" $null $userHeaders | Out-Null
Invoke-Json "Delete" "/api/admin/models/$modelId" $null $ah | Out-Null
try { Invoke-Json "Delete" "/api/admin/channels/$channelId" $null $ah | Out-Null } catch { Write-Host "channel delete returned: $($_.Exception.Response.StatusCode.value__)" }

Write-Host "ADMIN SMOKE PASSED" -ForegroundColor Green
