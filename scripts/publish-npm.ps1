# 发布 dsh-sorceress-widget 到 npmjs（临时 token，不落盘、不发打印）
# 用法：
#   setx NODE_AUTH_TOKEN "npm_xxx"      # 或用 User 作用域已设的值
#   powershell -NoProfile -File scripts\publish-npm.ps1
param([string]$PackageDir = "plugin")

$token = $env:NODE_AUTH_TOKEN
if (-not $token) { $token = [Environment]::GetEnvironmentVariable('NODE_AUTH_TOKEN', 'User') }
if (-not $token) {
    Write-Error "缺少 NODE_AUTH_TOKEN：先在 npmjs 生成 granular token，再 setx NODE_AUTH_TOKEN `"npm_...`""
    exit 1
}
if (-not $token.StartsWith('npm_')) {
    Write-Error "NODE_AUTH_TOKEN 看起来不是 npm token（应以 npm_ 开头）"
    exit 1
}

$root = Split-Path $PSScriptRoot -Parent
$pkgJson = Join-Path $root (Join-Path $PackageDir 'package.json')
if (-not (Test-Path $pkgJson)) { Write-Error "找不到 $pkgJson"; exit 1 }
$name = (Get-Content $pkgJson -Raw | ConvertFrom-Json).name
$version = (Get-Content $pkgJson -Raw | ConvertFrom-Json).version

$tmpRc = Join-Path $env:TEMP ("srs-pub-{0}.npmrc" -f [guid]::NewGuid().ToString('N').Substring(0, 8))
@(
    "registry=https://registry.npmjs.org/",
    "//registry.npmjs.org/:_authToken=$token"
) | Set-Content -Path $tmpRc -Encoding ascii

try {
    Push-Location $root
    Write-Host "发布 $name@$version → https://registry.npmjs.org/"
    npm publish (Join-Path $root $PackageDir) --access public --userconfig $tmpRc --registry https://registry.npmjs.org --provenance=false
    $code = $LASTEXITCODE
    if ($code -eq 0) {
        Write-Host "验证 dist-tags..."
        npm view $name version --registry=https://registry.npmjs.org
        npm view $name dist-tags --registry=https://registry.npmjs.org
    }
    exit $code
}
finally {
    Pop-Location
    Remove-Item $tmpRc -Force -ErrorAction SilentlyContinue
    Write-Host "临时 npmrc 已删除：$tmpRc"
    Write-Host "发完记得在 npmjs 网页吊销这个 token，并 setx NODE_AUTH_TOKEN `"`""
}

