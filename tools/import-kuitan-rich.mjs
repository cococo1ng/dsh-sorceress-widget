#!/usr/bin/env node
// 一次性迁移脚本：把 dsh-kuitan-tianji 的塔罗逐张富数据（CARD_LIB + MAJOR/MINOR 正逆关键词）
// 导出成 sorceress-widget 的 plugin/data/tarot-rich.json，键用本仓库 deck.json 的 name_zh。
//
// 用法：node tools/import-kuitan-rich.mjs [kuitan 引擎目录]
//   默认：E:/UserData/dsh-workspace/dsh-kuitan-tianji/engine
//
// 口径：只读导入，不改 kuitan 任何文件；本仓库只新增数据文件，不动 deck.json / tarot.json。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const WIDGET = path.resolve(HERE, '..')
const KUITAN = process.argv[2] || 'E:/UserData/dsh-workspace/dsh-kuitan-tianji/engine'

const kuitanTarot = await import('file://' + KUITAN.replace(/\\/g, '/') + '/tarot.js')
const kuitanCards = await import('file://' + KUITAN.replace(/\\/g, '/') + '/tarot-cards.js')

// kuitan 的牌名（中文）→ 本仓库 deck.json 的 name_zh
// kuitan：愚者…世界、权杖一…权杖十、权杖侍从/骑士/王后/国王
// 本仓库：愚者…世界、权杖首牌、权杖二…权杖十、权杖侍从/骑士/王后/国王
const SUIT_ZH = { 权杖: 'wands', 圣杯: 'cups', 宝剑: 'swords', 星币: 'pentacles' }
const RANK_ZH = { 一: 'ace', 二: '2', 三: '3', 四: '4', 五: '5', 六: '6', 七: '7', 八: '8', 九: '9', 十: '10', 侍从: 'page', 骑士: 'knight', 王后: 'queen', 国王: 'king' }

/** kuitan 牌名 → 本仓库 name_zh */
function toWidgetName(kuitanName) {
  // 大牌：同名
  if (kuitanTarot.MAJOR.some((m) => m[0] === kuitanName)) return kuitanName
  for (const suitZh of Object.keys(SUIT_ZH)) {
    if (!kuitanName.startsWith(suitZh)) continue
    const rest = kuitanName.slice(suitZh.length)
    const rank = RANK_ZH[rest]
    if (!rank) throw new Error('未知牌阶：' + kuitanName)
    // 本仓库 ace 叫「首牌」，其余「二/三/…/侍从…」
    const rankLabel = rank === 'ace' ? '首牌' : rest
    return suitZh + rankLabel
  }
  throw new Error('未知牌名：' + kuitanName)
}

// 本仓库 deck.json 的 78 张，按 name_zh 建索引
const deck = JSON.parse(fs.readFileSync(path.join(WIDGET, 'plugin', 'data', 'deck.json'), 'utf8'))
const byName = new Map(deck.cards.map((c) => [c.name_zh, c]))

// kuitan 正逆关键词：大牌在 MAJOR，小牌在 MINOR
const updown = new Map()
for (const [name, numeral, up, down] of kuitanTarot.MAJOR) updown.set(name, { up, down })
for (const suit of Object.keys(kuitanTarot.MINOR)) {
  for (const [rankCn, up, down] of kuitanTarot.MINOR[suit]) updown.set(suit + rankCn, { up, down })
}

const out = {
  source: 'dsh-kuitan-tianji/engine/tarot.js + tarot-cards.js',
  importedAt: new Date().toISOString(),
  note: 'RWS 牌名/编号；元素与占星对应取黄金黎明口径；宫廷牌无占星（公开表互相冲突）。键为本仓库 deck.json 的 name_zh。',
  cards: {},
}

// 大牌的「元素 + 核心寓意」在 tarot.js 的 MAJOR_EXT（与 MAJOR 同序），CARD_ROWS 里是空的。
// MAJOR_EXT 未导出，从源码里按注释行精确切出这 22 条（每行 ['元素', '核心寓意'],）。
const tarotSrc = fs.readFileSync(path.join(KUITAN, 'tarot.js'), 'utf8')
const extStart = tarotSrc.indexOf('const MAJOR_EXT = [')
const extEnd = tarotSrc.indexOf('];', extStart)
const extBlock = tarotSrc.slice(extStart, extEnd)
const MAJOR_EXT = [...extBlock.matchAll(/\[\s*'([^']*)'\s*,\s*'([^']*)'\s*\]/g)].map((m) => [m[1], m[2]])
if (MAJOR_EXT.length !== 22) throw new Error('MAJOR_EXT 解析出 ' + MAJOR_EXT.length + ' 条，应为 22')
const majorIndex = new Map(kuitanTarot.MAJOR.map((m, i) => [m[0], i]))

let missing = []
for (const row of kuitanCards.CARD_ROWS) {
  const [kName, en, el, planet, sign, seph, img, core] = row
  const mi = majorIndex.get(kName)
  const isMajor = mi !== undefined
  const ext = isMajor ? MAJOR_EXT[mi] : null
  const finalEl = ext ? ext[0] : (el || '')
  const finalCore = ext ? ext[1] : (core || '')
  const nameZh = toWidgetName(kName)
  const card = byName.get(nameZh)
  if (!card) { missing.push(kName + '→' + nameZh); continue }
  const tree = seph ? kuitanCards.SEPHIROTH[seph - 1] : ''
  const decan = seph >= 2 && seph <= 10 ? kuitanCards.DECAN_CN[(seph - 2) % 3] : ''
  const astro = planet && sign ? `${planet}在${sign}${decan ? `（${decan}）` : ''}` : (planet || '')
  const kw = updown.get(kName) || {}
  out.cards[card.id] = {
    name_zh: nameZh,
    en, element: finalEl, planet: planet || '', sign: sign || '',
    sephira: tree, decan, image: img || '', core: finalCore, astro,
    up: kw.up || '', down: kw.down || '',
  }
}

if (missing.length) {
  console.error('映射失败：', missing)
  process.exit(1)
}
const want = deck.cards.length
const got = Object.keys(out.cards).length
if (got !== want) {
  console.error(`数量不符：deck=${want} rich=${got}`)
  process.exit(1)
}

const outPath = path.join(WIDGET, 'plugin', 'data', 'tarot-rich.json')
fs.writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf8')
// 同时镜像一份给 client 模板用（build.py 会拷 data/ 到 plugin/）
const mirror = path.join(WIDGET, 'data', 'tarot-rich.json')
fs.writeFileSync(mirror, JSON.stringify(out, null, 2), 'utf8')

console.log('已写入', outPath)
console.log('已镜像', mirror)
console.log('卡牌数', got, '| 大牌', deck.cards.filter((c) => c.kind === 'major').length, '| 小牌', deck.cards.filter((c) => c.kind === 'minor').length)
