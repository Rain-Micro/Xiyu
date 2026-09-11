# 栖屿 server 生产部署脚本（在目标服务器上以管理员 PowerShell 执行）
# 前置：Node >= 20 已安装；部署包已解压到 C:\qiyu\server
# 用法示例：
#   .\deploy-server.ps1 -DatabasePassword "xxx" -JwtSecret "yyy" -Port 443

param(
  [Parameter(Mandatory = $true)][string]$DatabasePassword,
  [Parameter(Mandatory = $true)][string]$JwtSecret,
  [int]$Port = 443,
  [string]$InstallRoot = "C:\qiyu\server",
  [string]$PgHost = "127.0.0.1",
  [int]$PgPort = 5432,
  [string]$PgUser = "qiyu",
  [string]$PgDatabase = "qiyu",
  [string]$DeepseekKey = "",
  [string]$IflytekAppId = "", [string]$IflytekApikey = "", [string]$IflytekApisecret = ""
)

$ErrorActionPreference = "Stop"
Set-Location $InstallRoot

# 1. 依赖安装（按 lockfile，仅生产依赖）
npm ci --omit=dev --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { throw "npm ci 失败" }

# 2. 写 .env（不存在才写，避免覆盖轮换过的密钥）
$envPath = Join-Path $InstallRoot ".env"
if (-not (Test-Path $envPath)) {
  @"
PORT=$Port
DATABASE_URL=postgresql://${PgUser}:${DatabasePassword}@${PgHost}:${PgPort}/${PgDatabase}
JWT_SECRET=$JwtSecret
DEEPSEEK_API_KEY=$DeepseekKey
IFLYTEK_APPID=$IflytekAppId
IFLYTEK_APIKEY=$IflytekApikey
IFLYTEK_APISECRET=$IflytekApisecret
SMS_MODE=mock
CORS_ORIGINS=*
"@ | Out-File -FilePath $envPath -Encoding utf8
  Write-Output "[deploy] 已写入 $envPath"
} else {
  Write-Output "[deploy] .env 已存在，保留（如需重置请手动删除）"
}

# 3. 数据库迁移
$env:DATABASE_URL = "postgresql://${PgUser}:${DatabasePassword}@${PgHost}:${PgPort}/${PgDatabase}"
node db/migrate.mjs
if ($LASTEXITCODE -ne 0) { throw "数据库迁移失败" }

# 4. 注册/更新 Windows 服务（WinSW：无需安装器，单 exe + xml）
$winswExe = "C:\qiyu\bin\qiyu-server-service.exe"
$winswXml = "C:\qiyu\bin\qiyu-server-service.xml"
$nodeExe = (Get-Command node).Source

@"
<service>
  <id>qiyu-server</id>
  <name>qiyu-server</name>
  <description>栖屿数字人平台后端 API</description>
  <executable>$nodeExe</executable>
  <arguments>dist\index.js</arguments>
  <workingdirectory>$InstallRoot</workingdirectory>
  <onfailure action="restart" delay="10 sec"/>
  <onfailure action="restart" delay="30 sec"/>
  <env name="NODE_ENV">production</env>
  <log mode="roll-by-size"><sizeThreshold>10240</sizeThreshold><keepFiles>4</keepFiles></log>
</service>
"@ | Out-File -FilePath $winswXml -Encoding utf8

if (-not (Test-Path $winswExe)) { throw "缺少 WinSW 可执行文件 $winswExe（随部署包提供）" }

Stop-Service qiyu-server -ErrorAction SilentlyContinue
& $winswExe install | Out-Null
& $winswExe start | Out-Null

# 5. 健康检查（最多等 20 秒）
$ok = $false
foreach ($i in 1..10) {
  Start-Sleep -Seconds 2
  try {
    $r = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/health" -TimeoutSec 3
    if ($r.status -eq "ok") { $ok = $true; break }
  } catch { }
}
if ($ok) { Write-Output "[deploy] SUCCESS：服务已启动且 /api/health 通过（端口 $Port）" }
else { throw "[deploy] 健康检查未通过，请查看 C:\qiyu\bin\qiyu-server-service.out.log" }
