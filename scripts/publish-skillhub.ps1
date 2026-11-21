# SkillHub Skill 发布（打包 → 预检 → 发布 → 验证提示）
#
# 用法：
#   powershell -NoProfile -File scripts\publish-skillhub.ps1 -Changelog "本次改了什么"
#   powershell -NoProfile -File scripts\publish-skillhub.ps1 -DryRunOnly
#
# 背景（2026-11-21 实测，详见 docs/publishing.md）：
#   - 平台是 skillhub.cn；Skill 走 CLI，Plugin 广场是自动抓 GitHub 的，两者不通
#   - 包内不允许无扩展名文件（LICENSE）与图片（png/jpg/webp），只收文本+脚本
#   - 包体积压到 1 MB 内最稳；assets 不进包，素材由 npm 分发
#   - 连续发布会限频，报「发布频率过高」等 1–2 分钟

param(
  [string]$Changelog = "",
  [switch]$DryRunOnly,
  [string]$OutDir = "$env:TEMP\skillhub-publish"
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Fail($msg) { Write-Host "✗ $msg" -ForegroundColor Red; exit 1 }

# ① 环境自检
$cli = Get-Command skillhub -ErrorAction SilentlyContinue
if (-not $cli) { Fail "找不到 skillhub CLI。安装：curl -fsSL https://skillhub.cn/install/install.sh | bash -s -- --cli-only" }

$who = (& skillhub auth whoami 2>&1 | Out-String)
if ($who -match 'invalid api key|not logged|401') { Fail "CLI 未登录。先在 /dashboard/keys 建 key，再 skillhub login --key <skh_xxx> --host https://api.skillhub.cn" }
Write-Host "✓ CLI: $((& skillhub --version 2>&1 | Out-String).Trim())"
Write-Host ($who.Trim() -replace '(?m)^', '  ')

# ② 读 SKILL.md 的 slug / version
$skillMd = Join-Path $root 'SKILL.md'
if (-not (Test-Path $skillMd)) { Fail "仓库根没有 SKILL.md" }
$head = Get-Content $skillMd -TotalCount 20 -Encoding UTF8
$slug = ($head | Select-String '^slug:' | Select-Object -First 1) -replace '^slug:\s*', ''
$ver = ($head | Select-String '^version:' | Select-Object -First 1) -replace '^version:\s*', ''
if (-not $slug) { Fail "SKILL.md frontmatter 缺 slug" }
if (-not $ver) { Fail "SKILL.md frontmatter 缺 version" }
$slug = $slug.Trim(); $ver = $ver.Trim()
Write-Host "✓ 目标: $slug@$ver"

# ③ 组装包：只收白名单扩展名
if (Test-Path $OutDir) { Remove-Item $OutDir -Recurse -Force }
New-Item -ItemType Directory -Path $OutDir | Out-Null

$allow = @('.md', '.js', '.mjs', '.json', '.txt', '.yml', '.yaml')
Copy-Item $skillMd $OutDir

$copied = @('SKILL.md')
$skipped = @()
$srcs = @(
  @{ Dir = 'plugin'; Files = @('README.md', 'CHANGELOG.md', 'package.json', 'NOTICE.md', 'cordis.patch.yml', 'index.js', 'srs-engine.mjs', 'srs-tools.mjs') },
  @{ Dir = 'plugin'; Rename = @{ 'LICENSE' = 'LICENSE.txt'; 'LICENSE-ASSETS' = 'LICENSE-ASSETS.txt' } }
)

foreach ($f in $srcs[0].Files) {
  $p = Join-Path $root "plugin\$f"
  if (Test-Path $p) { Copy-Item $p $OutDir; $copied += $f } else { $skipped += $f }
}
foreach ($k in $srcs[1].Rename.Keys) {
  $p = Join-Path $root "plugin\$k"
  if (Test-Path $p) { Copy-Item $p (Join-Path $OutDir $srcs[1].Rename[$k]); $copied += $srcs[1].Rename[$k] }
}

# 白名单校验：无扩展名 / 图片一律不进包
$bad = Get-ChildItem $OutDir -Recurse -File | Where-Object {
  $_.Extension -eq '' -or $_.Extension -notin $allow
}
if ($bad) {
  Fail ("包内出现不允许的类型（SkillHub 会 400）：" + (($bad | ForEach-Object { $_.Name }) -join ', '))
}

$sum = (Get-ChildItem $OutDir -Recurse -File | Measure-Object Length -Sum).Sum
Write-Host ("✓ 打包: {0} 文件 / {1:N0} KB → {2}" -f $copied.Count, ($sum / 1KB), $OutDir)
Write-Host ("  " + ($copied -join ', '))
if ($skipped.Count) { Write-Host ("  (缺: " + ($skipped -join ', ') + ")") -ForegroundColor Yellow }

if ($sum -gt 1MB) {
  Write-Host ("⚠ 包超过 1 MB，历史上 10 MB 会 RemoteDisconnected / 550") -ForegroundColor Yellow
}

# ④ 预检
Write-Host "`n— dry-run —"
& skillhub publish $OutDir --dry-run 2>&1 | Out-String | Write-Host
if ($LASTEXITCODE -ne 0) { Fail "dry-run 未通过" }

if ($DryRunOnly) { Write-Host "`n（-DryRunOnly，未正式发布）" -ForegroundColor Cyan; exit 0 }

# ⑤ 正式发布
if (-not $Changelog) { Fail "必须给 -Changelog \"本次改了什么\"" }
Write-Host "`n— publish —"
& skillhub publish $OutDir --changelog $Changelog 2>&1 | Out-String | Write-Host

if ($LASTEXITCODE -ne 0) {
  Write-Host "`n常见失败：" -ForegroundColor Yellow
  Write-Host "  · 发布频率过高 → 等 1–2 分钟重跑"
  Write-Host "  · RemoteDisconnected / 550 → 包太大，砍到 1 MB 内"
  Write-Host "  · 不允许的文件类型 → 该文件不在白名单（见下）"
  Write-Host "  白名单: $($allow -join ' ')"
  exit 1
}

Write-Host "`n✓ 已提交，状态「安全审核中」" -ForegroundColor Green
Write-Host "  看状态: https://skillhub.cn/dashboard  （我的 Skills → 卡片显示的版本号）"
Write-Host "  详情页: https://skillhub.cn/skills/indiv-cococo1ng/$slug"
Write-Host "  审核通过前详情页仍显示旧版本，属正常。"
Write-Host "`n提醒：SKILL.md 里的 version 下次要递增（当前 $ver）。"
