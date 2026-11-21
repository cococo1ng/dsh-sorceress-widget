import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

const ROOT = 'E:/UserData/dsh-workspace/_tools/sorceress-widget'
const P = (p) => path.join(ROOT, p)
const read = (p) => fs.readFileSync(P(p), 'utf8')
const exists = (p) => fs.existsSync(P(p))
const rows = []
const ok = (name, cond, detail = '') => rows.push({ name, cond: !!cond, detail })

// ── 1. 版本一致性 ──
const rootPkg = JSON.parse(read('package.json'))
const plugPkg = JSON.parse(read('plugin/package.json'))
ok('版本号 root = plugin', rootPkg.version === plugPkg.version, rootPkg.version + ' / ' + plugPkg.version)
ok('版本号出现在 CHANGELOG 顶部', read('CHANGELOG.md').includes('## ' + plugPkg.version))
ok('client.js 注入的版本 = package.json', read('plugin/client.js').includes(plugPkg.version))

// ── 2. 双份文件一致性 ──
for (const f of ['README.md', 'CHANGELOG.md']) {
  ok(f + ' 根与 plugin 一致',
    fs.readFileSync(P(f)).equals(fs.readFileSync(P('plugin/' + f))))
}

// ── 3. locale ──
for (const lang of ['en', 'zh']) {
  const j = JSON.parse(read('plugin/locale/' + lang + '.json'))
  ok('locale/' + lang + '.json 有 meta.title 与 description',
    !!(j.meta && j.meta.title && j.meta.description), lang)
}
const zhDesc = JSON.parse(read('plugin/locale/zh.json')).meta.description
ok('locale 描述含「所问」新口径', zhDesc.includes('所问'), zhDesc.slice(0, 30))
ok('locale 描述含「13 张站姿」', zhDesc.includes('13 张站姿'))
ok('package.json description = locale(en) + locale(zh)',
  plugPkg.description.includes(JSON.parse(read('plugin/locale/en.json')).meta.description)
  && plugPkg.description.includes(zhDesc))

// ── 4. docs 同步（根 ↔ plugin）──
const docFiles = ['关于-文案-v2.md', '群介绍-v1.md', '群公告-v2.md', 'publishing.md', 'about-preview.html']
for (const f of docFiles) {
  const a = P('docs/' + f)
  const b = P('plugin/docs/' + f)
  ok('docs/' + f + ' 根与 plugin 一致',
    fs.existsSync(a) && fs.existsSync(b) && fs.readFileSync(a).equals(fs.readFileSync(b)))
}

// ── 5. 文档内容口径 ──
ok('README 含「所问」必填', read('README.md').includes('多张牌阵必须先写'))
ok('关于页文案含「所问」', read('docs/关于-文案-v2.md').includes('所问'))
ok('群介绍含「所问」', read('docs/群介绍-v1.md').includes('所问'))
ok('群介绍版本号已对齐', read('docs/群介绍-v1.md').includes(plugPkg.version))

// ── 6. 素材计数一致（文件系统 vs 各处文案）──
const count = (dir, ext) => fs.readdirSync(P(dir)).filter((f) => f.endsWith(ext)).length
const poses = count('plugin/assets/sorceress', '.webp')
const ui = count('plugin/assets/ui', '.webp')
const cards = count('plugin/assets/cards/big', '.webp')
const sfx = count('plugin/assets/sfx', '.mp3')
ok('立绘 18 张', poses === 18, poses)
ok('UI 素材 8 件', ui === 8, ui)
ok('牌面 78 张', cards === 78, cards)
ok('音效 16 路', sfx === 16, sfx)
ok('LICENSE-ASSETS 写 18 张立绘', read('plugin/LICENSE-ASSETS').includes('18 张立绘'))
ok('LICENSE-ASSETS 写 8 张界面素材', read('plugin/LICENSE-ASSETS').includes('8 张界面素材'))
ok('NOTICE 列了 16 路音效', (read('plugin/NOTICE.md').match(/\.mp3/g) || []).length >= 16)

// ── 7. 根 assets 与 plugin/assets 清单一致 ──
const listFiles = (dir) => fs.readdirSync(P(dir), { recursive: true })
  .filter((f) => fs.statSync(P(path.join(dir, f))).isFile()).sort()
const aAssets = listFiles('assets')
const pAssets = listFiles('plugin/assets')
ok('根 assets 与 plugin/assets 文件清单一致',
  aAssets.length === pAssets.length && aAssets.every((f, i) => f === pAssets[i]),
  aAssets.length + ' vs ' + pAssets.length)

// ── 8. 垃圾文件 ──
const junk = []
const walk = (dir) => {
  for (const e of fs.readdirSync(P(dir), { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '_verify' || e.name.startsWith('_tmp')) continue
    const rel = path.join(dir, e.name)
    if (e.isDirectory()) walk(rel)
    else if (/\.(80|90|tmp|orig|bak|copy)$/.test(e.name) || /\.(webp|jpg|png)\.\d+$/.test(e.name)) junk.push(rel)
  }
}
walk('.')
ok('无临时/垃圾文件', junk.length === 0, junk.slice(0, 5).join(', '))

// ── 9. npm pack 实际内容 ──
let packInfo = null
try {
  const raw = execSync('npm pack --dry-run --json', { cwd: P('plugin'), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  const parsed = JSON.parse(raw)
  packInfo = Array.isArray(parsed) ? parsed[0] : Object.values(parsed)[0]
} catch (e) {
  ok('npm pack 可执行', false, e.message.slice(0, 80))
}
if (packInfo) {
  const paths = packInfo.files.map((f) => f.path)
  const need = [
    'index.js', 'srs-engine.mjs', 'srs-tools.mjs', 'client.js', 'package.json',
    'README.md', 'CHANGELOG.md', 'NOTICE.md', 'LICENSE', 'LICENSE-ASSETS',
    'cordis.patch.yml', 'icon.png', 'icon-128.png', 'icon-256.png', 'screenshots.json',
    'locale/en.json', 'locale/zh.json',
    'docs/关于-文案-v2.md', 'docs/群介绍-v1.md', 'docs/群公告-v2.md',
    'docs/publishing.md', 'docs/about-preview.html',
  ]
  const missing = need.filter((k) => !paths.includes(k))
  ok('npm 包含全部关键文件（' + need.length + ' 项）', missing.length === 0, missing.join(', '))
  const bad = paths.filter((p) => /(^|\/)(_verify|node_modules|src|tools)\//.test(p) || /\.(80|tmp|bak)$/.test(p))
  ok('npm 包无多余文件', bad.length === 0, bad.slice(0, 5).join(', '))
  ok('screenshots.json 引用的图都在包内', (() => {
    const shots = JSON.parse(read('plugin/screenshots.json'))
    return shots.every((s) => paths.includes(s))
  })())
  rows.push({ name: 'npm 包规模', cond: true, detail: packInfo.files.length + ' 文件 / ' + (packInfo.size / 1024 / 1024).toFixed(2) + ' MB' })
}

// ── 10. git 状态 ──
try {
  const porcelain = execSync('git status --porcelain', { cwd: ROOT, encoding: 'utf8' }).trim()
  const n = porcelain ? porcelain.split('\n').length : 0
  rows.push({ name: 'git 待提交', cond: true, detail: n + ' 项' })
  const untracked = porcelain.split('\n').filter((l) => l.startsWith('??')).map((l) => l.slice(3))
  if (untracked.length) rows.push({ name: 'git 未跟踪（前 8）', cond: true, detail: untracked.slice(0, 8).join(', ') })
} catch (e) { /* 非 git 仓库 */ }

// ── 输出 ──
const bad = rows.filter((r) => !r.cond)
console.log('')
rows.forEach((r) => {
  console.log((r.cond ? '✓ ' : '✗ ') + r.name + (r.detail && (!r.cond || /规模|待提交|未跟踪/.test(r.name)) ? '  → ' + r.detail : ''))
})
console.log('\n共 ' + rows.length + ' 项，' + (bad.length ? '失败 ' + bad.length + ' 项' : '全部通过'))
process.exit(bad.length ? 1 : 0)
