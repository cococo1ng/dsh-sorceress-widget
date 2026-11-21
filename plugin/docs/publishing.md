# 发布到 npm

> 状态（2026-11-19 23:35）：**已发布**
>
> - npm：`dsh-sorceress-widget@0.56.0`（latest）· tgz shasum `cdf9ec7283d80fb40f445fb4a21f1a57d5801948` · 226 文件 / 10.3 MB
>   https://www.npmjs.com/package/dsh-sorceress-widget
> - GitHub：https://github.com/cococo1ng/dsh-sorceress-widget （Release `v0.56.0`，README 与 Release 都带群码/赞赏码）
> - 本次走 npm 12 的 staged 流程：bypass-2FA 令牌上传 → 先公开 `0.0.0-stage` 占位 → 校验通过后 0.56.0 转 Published；令牌已当场吊销（whoami 401），本地 token 文件已删。
> - `0.0.0-stage` 会一直留在版本列表里（npm 的占位行为），不影响安装；`latest` 已指向 0.56.0。

## 一次性准备（网页）

1. 打开 https://www.npmjs.com/settings/~/tokens/new （或 Settings → Access Tokens → Generate New Token）
2. 选 **Granular Access Token**，参数：
   - Bypass 2FA：勾上（会弹一次密码）
   - Permissions：**Read and write**
   - Packages：**All packages**
   - Expiration：7 天
3. 生成后复制 `npm_...`，**只在本机环境变量里用，不写进任何提交文件**。

## 发布（本机一条命令）

```powershell
# 1) 写入用户级环境变量（新进程可见；当前 DSH 里的我会从 User 作用域读）
setx NODE_AUTH_TOKEN "npm_xxxxxxxx"

# 2) 发布（脚本会写临时 npmrc、发完删掉；不打印 token）
powershell -NoProfile -File scripts\publish-npm.ps1
```

或者把 token 设好之后直接叫我「发 npm」，我用同一个脚本执行。

## 发布后（必做）

1. 网页吊销这个 token：Settings → Access Tokens → 删掉刚建的那条（页面会回显 `deleted 1 token`）。
2. 清掉环境变量：`setx NODE_AUTH_TOKEN ""`。
3. 验证：

```powershell
npm view dsh-sorceress-widget version --registry=https://registry.npmjs.org
npm view dsh-sorceress-widget dist-tags --registry=https://registry.npmjs.org
```

## 已知坑

- **tarball 铺开慢**：刚发完头几分钟，`https://registry.npmjs.org/<pkg>/-/<pkg>-0.56.0.tgz` 可能 404，但 `npm view` 已报新版本；加 `?t=<时间戳>` 可立刻取到，`npm install` 几十秒内自愈。
- **本机 registry 是 npmmirror**：发布命令必须显式 `--registry=https://registry.npmjs.org`，否则会尝试往镜像发。
- **2FA**：账号若是 App/短信双因素，granular token 的 Bypass 2FA 是唯一能过的路径（剑仙那次也是这么发的）。

## 包内容

`npm pack ./plugin --dry-run`：**226 文件 / 10.3 MB tgz / 11.1 MB 解包**，含 `docs/about-assets/qq-group.png`、`tip.jpg`（README 里的两张码），不含 `_verify` / `node_modules` / `_tmp*`。

## 版本号约定

- 改前端 → patch；加功能 → minor。上次发布 `0.56.0`，本地已到 `0.59.0`（尚未发布）。
- 发版顺序固定：改 `plugin/package.json` → `python build.py` → 跑自检 → 提交 + tag → GitHub Release → npm。
