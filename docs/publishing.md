# 发布记录：npm / GitHub / SkillHub

> 状态（2026-11-21）
>
> | 平台 | 版本 | 状态 |
> |---|---|---|
> | **GitHub** | commit `beb6d6d` | ✅ 已推送；About 描述与 10 个 topics 已更新 |
> | **npm** | `0.59.0`（latest） | ✅ 已发布（11.2 MB 解包 / 236 文件） |
> | **SkillHub · Skill** | `1.0.3` | ✅ 已上传，`skillId=327398`，状态「安全审核中」 |
> | **SkillHub · Plugin 广场** | v0.56.0（旧） | ⏳ 自动索引，等它下一轮抓取 |
>
> 三个平台的发布方式完全不同，见下。

---

## 一、平台认知（先看这里，别猜）

SkillHub 有**两套互不相通的东西**，名字很像，入口不同：

| | Plugin 广场 | Skill |
|---|---|---|
| 地址 | `/plugins/<owner>/<repo>` | `/skills/indiv-<handle>/<slug>` |
| 怎么来 | **自动抓 GitHub 仓库**，无手动入口 | **手动发布**（网页或 CLI） |
| 数据源 | 仓库 About 描述 + README + npm 版本 | 你上传的 `SKILL.md` 与文件 |
| 更新方式 | 等它定时抓（实测「1 天前更新」） | 主动 `publish` |
| 能不能改 | 改 GitHub 的 About/topics/README | 改 `SKILL.md` 后重发 |

- 域名是 **`skillhub.cn`**，不是 `skillhub.tencent.com`。
- 我们的仓库 `cococo1ng/dsh-sorceress-widget` **早就被 Plugin 广场自动收录**了，不需要上传；它显示 v0.56.0 只是因为还没到下一轮抓取。
- 真正需要手动更新的，是 `/dashboard` 里「我的 Skills」那条 `sorceress-widget`。

---

## 二、SkillHub「我的 Skills」发布（CLI，唯一推荐路径）

### 0. 先查环境，别从零摸

```powershell
skillhub --version          # 已装：2026.8.5，路径 C:\Users\<你>\.local\bin\skillhub.cmd
skillhub auth whoami        # userId / handle / role，有输出就是已登录
```

CLI 本来就在 PATH 里，装着、登录着。**先跑这两条**，别去网页点表单。

### 1. `SKILL.md` 的 frontmatter 是硬要求

```yaml
---
slug: sorceress-widget          # 全网唯一，更新时保持不变
displayName: 女巫 Sorceress · 塔罗挂件
version: 1.0.3                  # 每次更新递增
summary: 一句话说清这个 Skill 干什么
license: MIT
name: sorceress-widget          # 兼容 Claude Skill 规范，可留
description: 触发条件（给 agent 看）
---
```

版本号是 **SkillHub 自己的**（1.0.x），与 npm 的 `0.59.0` 无关。

### 2. 打包：文件类型和体积有硬限制

实测边界（都是 400/550 换来的）：

| 尝试 | 结果 |
|---|---|
| 全量 `plugin/`（10.24 MB，含 78 张牌 + 18 立绘 + 音效） | `RemoteDisconnected`，重试 `550` |
| 含 `LICENSE`（无扩展名） | 400 `不允许的文件类型: LICENSE` |
| 含 `icon-128.png` | 400 `不允许的文件类型: icon-128.png` |
| **纯文本 + 脚本，268 KB / 8 文件** | ✅ `✓ Published: skillId=327398` |

**结论：**

- **不能有**无扩展名文件（`LICENSE`、`LICENSE-ASSETS` → 改名为 `.txt`）
- **不能有** PNG/图片（`.png` `.jpg` `.webp` 全拒，图标也不行）
- **能过**的：`.md` `.js` `.mjs` `.json` `.txt` `.yml`
- 体积控制在 **1 MB 以内**最稳；素材（assets/）不要进包——素材由 npm 分发

推荐包内容（8 个文件）：

```
SKILL.md          ← 必需
README.md
CHANGELOG.md
package.json
LICENSE.txt       ← 原名 LICENSE，必须加 .txt
index.js
srs-engine.mjs
srs-tools.mjs
```

### 3. 发布

```powershell
# 预检（不发布，几秒出结果）
skillhub publish <目录> --dry-run
# → ✓ Dry-run passed: sorceress-widget@1.0.3

# 正式发布
skillhub publish <目录> --changelog "本次改了什么"
# → ✓ Published: skillId=327398 status=None
```

`<目录>` 里的 `SKILL.md` 必须在根。也可以直接给 `.zip`。

### 4. 发布后

- `https://skillhub.cn/dashboard` → 「我的 Skills」→ 卡片显示 **`V 1.0.3` / 安全审核中 / 取消更新**
- 审核**通过前**，详情页 `/skills/indiv-cococo1ng/sorceress-widget` 仍显示旧版本（`v1.0.2`），这是正常的，不是失败
- 审核通过后详情页自动切到新版本

### 5. 已知坑

| 现象 | 原因 / 处理 |
|---|---|
| `发布频率过高: 请求过于频繁` | 限频，等 **1–2 分钟**再发 |
| `RemoteDisconnected` / `550` | 包太大，砍到 1 MB 内 |
| `400 不允许的文件类型: xxx` | 该文件类型不在白名单，删掉或改名 |
| `409 slug 已被其他用户占用` | `SKILL.md` 里换 slug |
| `403 请先完成实名认证` | 网页完成实名后重试 |
| `401 invalid api key` | `/dashboard/keys` 重建 API key 后 `skillhub login --key <新> --host https://api.skillhub.cn` |

### 6. 别再走的弯路（2026-11-21 实测教训）

- ❌ 从 `skillhub.tencent.com` 猜域名 → 实际 `skillhub.cn`
- ❌ 在 Plugin 广场详情页找「更新」按钮 → 那里没有，管理入口在 `/dashboard`
- ❌ 用浏览器点「更新 Skill」表单 → 坐标点击与 DOM click 都不触发提交，只有抓 fetch 才看到 `400 不允许的文件类型`；**排查要在浏览器，发布用 CLI**
- ❌ 以为要手动建 token → CLI 已登录，`skillhub auth whoami` 一查就知道

---

## 三、npm 发布

### 一次性准备（网页）

1. https://www.npmjs.com/settings/~/tokens/new
2. 选 **Granular Access Token**：
   - **Bypass 2FA：必须勾**（本包已被设为「2FA required」，不勾必然 403）
   - Permissions：**Read and write**
   - Packages：**All packages**
   - Expiration：7 天
3. 复制 `npm_...`，只在本机环境变量/临时 `.npmrc` 里用。

### 发布

```powershell
# 临时 .npmrc（发布后立刻删除）
# registry=https://registry.npmjs.org/
# //registry.npmjs.org/:_authToken=npm_xxx

cd plugin
npm publish --access public --registry=https://registry.npmjs.org/
```

### 已知坑（2026-11-21 实测）

- **本机 registry 是 npmmirror**，发布必须显式 `--registry=https://registry.npmjs.org`，否则会尝试往镜像发。
- **403 `Two-factor authentication or granular access token with bypass 2fa enabled is required`**：token 没勾 Bypass 2FA。这个包被设了 2FA required，即使账号本身没开 2FA 也必须勾。
- **publish 报 `+ pkg@0.59.0` 但注册表 404**：不是失败，是进了 **Validating（npm 自动审核）**。去 `https://www.npmjs.com/package/<pkg>?activeTab=versions` 看，`Status` 会是 `Validating`；约 5 分钟后转 Published，`dist-tags` 跟着变。
- **tarball 铺开慢**：刚发完头几分钟 tgz 可能 404，`npm view` 已报新版本，等几十秒自愈。
- **npmmirror 同步**：官方发布后镜像不会立即跟上。可主动触发：
  ```powershell
  Invoke-WebRequest -Uri 'https://registry.npmmirror.com/dsh-sorceress-widget/sync?write=true' -Method Put
  # → {"ok":true,"logId":"..."}
  ```
  DSH 的 dsh-market 用的就是 profile 里的镜像源，所以**插件市场显示旧版本通常就是镜像没同步**。

---

## 四、GitHub

### 推送

```powershell
git add -A
git commit -m "feat(0.59.0): ..."
git push origin main
```

### 仓库 About 描述与 topics（SkillHub Plugin 广场抓的就是这两个）

在仓库首页 → About 旁齿轮 → 填 Description、加 Topics。实测 API 确认：

```powershell
Invoke-WebRequest https://api.github.com/repos/cococo1ng/dsh-sorceress-widget -Headers @{'User-Agent'='dsh'}
```

⚠️ `git add` 时会提示 `LF will be replaced by CRLF`，属正常；CI 在 Linux 上按 LF 校验，`build.py --no-assets` 的结果要与提交一致。

---

## 五、发版固定顺序

1. 改代码 → `python build.py`
2. 跑全套自检（十四套审计 + 引擎/路由/计费 + 两个 Playwright 用例）
3. 改 `plugin/package.json` 版本 + `CHANGELOG.md`
4. 同步 `docs/` 与 `plugin/docs/`、`locale/`、`package.json` description
5. `git add -A && git commit && git push`
6. 更新 GitHub About 描述与 topics
7. `npm publish`（临时 `.npmrc`，发完删）
8. `skillhub publish`（纯文本包，见上）
9. 触发 npmmirror 同步
10. 验证三个平台，吊销 npm token

## 六、版本号约定

- npm/插件：改前端 → patch；加功能 → minor。当前 `0.59.0`。
- SkillHub Skill：每次更新 +0.0.1。当前 `1.0.3`。
