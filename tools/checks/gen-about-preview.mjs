#!/usr/bin/env node
// 从 src/client.template.js 的 aboutBody 生成两份交付物，避免页面与文档漂移：
//   ① docs/about-preview.html   —— 与插件同源 CSS 的静态预览
//   ② docs/关于-文案-v2.md       —— 关于页文案真源
// 用法：node tools/checks/gen-about-preview.mjs
import fs from 'node:fs'
import path from 'node:path'

const ROOT = 'E:/UserData/dsh-workspace/_tools/sorceress-widget'
const src = fs.readFileSync(path.join(ROOT, 'src/client.template.js'), 'utf8')
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'plugin/package.json'), 'utf8'))

// ── 设计令牌 + 整份 CSS（与插件同一套）──
const cs = src.indexOf('const css = [')
const ce = src.indexOf("].join('')", cs)
const arrText = src.slice(cs + 'const css = '.length, ce + 1)
const dc = { ink: '#0b0f1c', veil: 'rgba(10,14,26,.86)', navy: '#141a2c', gold: '#C9A45C', goldLit: '#E3C588', parch: '#EFE3CB', muted: '#9A907C' }
const df = [12, 15, 20, 34], ds = [4, 8, 12, 16]
const uiStub = new Proxy({}, { get: () => '' })
const css = new Function('DC', 'DF', 'DS', 'DESIGN', 'UI', 'VERSION', 'return ' + arrText)(
  dc, df, ds, { colors: dc, fonts: df, space: ds }, uiStub, pkg.version,
).join('')

// ── 抽取 aboutBody 的内容 ──
const start = src.indexOf('const aboutBody =')
const chunk = src.slice(start, src.indexOf('\n      );', start))
const heads = [...chunk.matchAll(/srs-about-h' \}, '([^']+)'/g)].map((m) => m[1])
const lead = (chunk.match(/className: 'lead' \}, '([^']+)'/) || [])[1] || ''
const plainPs = [...chunk.matchAll(/h\('p', null, '([^']+)'\)/g)].map((m) => m[1])

function grabArrays(text) {
  const out = []
  let i = 0
  while ((i = text.indexOf('aboutLi([', i)) >= 0) {
    const j = text.indexOf('[', i)
    let d = 0
    let inStr = null
    for (let k = j; k < text.length; k += 1) {
      const ch = text[k]
      if (inStr) { if (ch === inStr && text[k - 1] !== '\\') inStr = null; continue }
      if (ch === "'") { inStr = "'"; continue }
      if (ch === '[') d += 1
      else if (ch === ']') { d -= 1; if (!d) { out.push(text.slice(j + 1, k)); i = k; break } }
    }
  }
  return out
}
const parseItems = (block) => {
  const items = []
  const re = /\[\s*(?:'([^']*)'|null)\s*,\s*'((?:[^'\\]|\\.)*)'\s*\]/g
  let m
  while ((m = re.exec(block))) items.push([m[1] || '', m[2]])
  return items
}
const blocks = grabArrays(chunk).map(parseItems)

const qqSrc = 'about-assets/qq-group.webp'
const tipSrc = 'about-assets/tip.webp'
const shots = `<img class="srs-about-shot" src="${qqSrc}" alt="Sorceress 交流群二维码">
    <div class="srs-about-sep"></div>
    <div class="srs-about-h">赞赏</div>
    <p>挂件免费，功能不设门槛。想请我喝碗茶，扫这张；不扫，功能一点不少。</p>
    <img class="srs-about-shot" src="${tipSrc}" alt="赞赏码">`

// ── ① 预览 HTML ──
const ul = (items) => '<ul>' + items.map(([k, t]) => `<li>${k ? `<b>${k}</b>` : ''}${t}</li>`).join('') + '</ul>'
const body =
  `<p class="lead">${lead}</p>` +
  `<div class="srs-about-h">${heads[0]}</div><p>${plainPs[0] || ''}</p>` +
  `<div class="srs-about-h">${heads[1]}</div>${ul(blocks[0] || [])}` +
  `<div class="srs-about-h">${heads[2]}</div>${ul(blocks[1] || [])}` +
  `<div class="srs-about-h">${heads[3]}</div>${ul(blocks[2] || [])}` +
  `<div class="srs-about-h">${heads[4]}</div>${ul(blocks[3] || [])}` +
  `<div class="srs-about-h">${heads[5]}</div>${ul(blocks[4] || [])}` +
  `<div class="srs-about-sep"></div><div class="srs-about-h">${heads[6]}</div>` +
  `<p>${plainPs[1] || ''}</p>${shots}` +
  `<p class="srs-about-cap">赞赏不换功能、不解锁内容、不插队</p>` +
  `<div class="srs-about-sep"></div><div class="srs-about-h">${heads[7]}</div>` +
  `<p>当前 ${pkg.version}。素材全部内联，不依赖任何外部进程。</p>` +
  `<p class="note">没有工单系统。台词可以在「配置 → 编辑台词」里改，一行一句，改完保存；设置可以导出成 JSON 备份。</p>`

const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<title>Sorceress · 关于页预览（${pkg.version}）</title>
<!-- 由 tools/checks/gen-about-preview.mjs 从 src/client.template.js 生成，改页面请改代码后重跑 -->
<style>${css}
html,body{margin:0;background:#0b0f1c;padding:20px}
.panel{width:340px;box-sizing:border-box;background:rgba(20,26,44,.96);border:1px solid var(--srs-line);border-radius:10px;padding:12px}
</style></head>
<body>
<div class="srs-root srs-body" style="--srs-w:340px;position:static;width:340px;height:auto;padding:12px">
  <div class="panel">
    <div class="srs-title" style="margin-bottom:8px">关于</div>
    <div class="srs-about">${body}</div>
  </div>
</div>
</body></html>
`
fs.writeFileSync(path.join(ROOT, 'docs/about-preview.html'), html, 'utf8')

// ── ② 文案真源 ──
const mdUl = (items) => items.map(([k, t]) => '- ' + (k ? '**' + k + '**' : '') + t).join('\n')
const md = `# 关于 · Sorceress 塔罗挂件 —— 页面文案 v3

> 状态：**已接入插件（${pkg.version}）**，入口 = 面板页脚「关于」；本文为该页的文案真源。
> 由 \`tools/checks/gen-about-preview.mjs\` 从 \`aboutBody\` 反向生成——改页面请改代码，再重跑本脚本。
> 口径：19 立绘 / 78 牌 / 16 路音效（8 一次性 + 8 环境音景）/ PBKDF2 12 万次 / 冷启动零外网。

---

## 文案正文

### 关于

${lead}

---

**${heads[0]}**

${plainPs[0] || ''}

---

**${heads[1]}**

${mdUl(blocks[0] || [])}

---

**${heads[2]}**

${mdUl(blocks[1] || [])}

---

**${heads[3]}**

${mdUl(blocks[2] || [])}

---

**${heads[4]}**

${mdUl(blocks[3] || [])}

---

**${heads[5]}**

${mdUl(blocks[4] || [])}

---

**${heads[6]}**

${plainPs[1] || ''}

${plainPs[2] || ''}

两张图上下排列，宽度统一 230px（等比缩放不裁切）：\`${qqSrc}\` · \`${tipSrc}\`

> 赞赏不换功能、不解锁内容、不插队。

---

**${heads[7]}**

当前 ${pkg.version}。素材全部内联，不依赖任何外部进程。

没有工单系统。台词可以在「配置 → 编辑台词」里改，一行一句，改完保存；设置可以导出成 JSON 备份。

---

## 备注（不进页面）

- 交流与赞赏各占一节、上下排列；两张图统一宽度 230px（等比缩放不裁切），尺寸一致、手机扫码够清晰。
- 群二维码图自带宽幅标题与「扫一扫二维码，加入群聊」，所以页面里不再重复同一句。
- 关于页只写「现状」，不写版本演进史：旧版功能（占卜页、每日一签、双人牌、塔罗页的存图 / 小红书）已下线，不在页面上留痕。
`
fs.writeFileSync(path.join(ROOT, 'docs/关于-文案-v2.md'), md, 'utf8')

console.log('已生成：docs/about-preview.html（' + html.length + ' 字节）')
console.log('已生成：docs/关于-文案-v2.md（' + md.split('\n').length + ' 行）')
console.log('小节：' + heads.join(' | '))
