// 数据层审计：牌堆结构、牌义可解析性、富解读、图片资源
import fs from 'node:fs'
import path from 'node:path'

const ROOT = 'E:/UserData/dsh-workspace/_tools/sorceress-widget'
const readJson = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'))

const deck = readJson('data/deck.json')
const tarot = readJson('data/tarot.json')
const rich = readJson('data/tarot-rich.json')

let pass = 0
const bad = []
const ok = (name, cond, extra) => {
  if (cond) pass += 1
  else bad.push(name + (extra !== undefined ? '  → ' + JSON.stringify(extra) : ''))
}

const cards = deck.cards || []
ok('deck 总数 = 78', cards.length === 78, cards.length)
ok('id 唯一', new Set(cards.map((c) => c.id)).size === cards.length)
ok('name_zh 唯一', new Set(cards.map((c) => c.name_zh)).size === cards.length)
ok('order 是 0..77 的排列',
  cards.map((c) => c.order).sort((a, b) => a - b).every((v, i) => v === i))

const majors = cards.filter((c) => c.kind === 'major')
const minors = cards.filter((c) => c.kind === 'minor')
ok('大阿卡纳 22 张', majors.length === 22, majors.length)
ok('小阿卡纳 56 张', minors.length === 56, minors.length)

const SUITS = ['wands', 'cups', 'swords', 'pentacles']
ok('花色集合正确', [...new Set(cards.map((c) => c.suit))].sort().join(',') === 'cups,major,pentacles,swords,wands')
for (const s of SUITS) {
  const rows = minors.filter((c) => c.suit === s)
  ok('花色 ' + s + ' 有 14 张', rows.length === 14, rows.length)
  const idx = rows.map((c) => Number(c.index)).sort((a, b) => a - b)
  ok('花色 ' + s + ' index 为 1..14', idx.every((v, i) => v === i + 1), idx)
}

// ── 牌义可解析性：每张牌都要能取到「关键词 + 正位 3 句 + 逆位 3 句」──
const M = tarot.major || {}
const TPL = tarot.minorTemplate || {}
const RANKS = TPL.ranks || {}
const SUITT = TPL.suits || {}

ok('tarot.major 有 22 条', Object.keys(M).length === 22, Object.keys(M).length)
ok('ranks 覆盖 14 档', Object.keys(RANKS).length === 14, Object.keys(RANKS))
ok('suits 覆盖 4 花色', Object.keys(SUITT).length === 4, Object.keys(SUITT))
ok('advice 有 up/rev', !!(TPL.advice && TPL.advice.up && TPL.advice.rev))

const unresolved = []
const thinUp = []
const thinRev = []
const sameUpRev = []

for (const c of cards) {
  let up = null
  let rev = null
  let kw = null
  if (c.kind === 'major') {
    const m = M[c.id]
    if (!m) { unresolved.push(c.id + '(大牌缺条)'); continue }
    kw = m.keywords
    up = m.up
    rev = m.rev
  } else {
    const r = RANKS[c.rank]
    const s = SUITT[c.suit]
    if (!r || !s) { unresolved.push(c.id + '(缺 rank/suit 模板)'); continue }
    // 小牌是三层合成：数字层 up/rev + 花色层 up/rev + 建议层
    up = [r.up, s.up]
    rev = [r.rev, s.rev]
    kw = []
  }
  if (!Array.isArray(kw) || kw.length === 0) {
    if (c.kind === 'major') thinUp.push(c.id + '(无关键词)')
  }
  if (!Array.isArray(up) || up.length === 0 || up.every((x) => !String(x || '').trim())) thinUp.push(c.id)
  if (!Array.isArray(rev) || rev.length === 0 || rev.every((x) => !String(x || '').trim())) thinRev.push(c.id)
  if (Array.isArray(up) && Array.isArray(rev) && up.join('|') === rev.join('|')) sameUpRev.push(c.id)
  if (c.kind === 'major' && Array.isArray(up) && up.length < 3) thinUp.push(c.id + '(正位不足3句)')
  if (c.kind === 'major' && Array.isArray(rev) && rev.length < 3) thinRev.push(c.id + '(逆位不足3句)')
}
ok('78 张都能解析出牌义', unresolved.length === 0, unresolved.slice(0, 6))
ok('正位文案不为空', thinUp.length === 0, thinUp.slice(0, 6))
ok('逆位文案不为空', thinRev.length === 0, thinRev.slice(0, 6))
ok('正位与逆位文案不相同', sameUpRev.length === 0, sameUpRev.slice(0, 6))

// 小牌三层合成必须真的有三层可用
let tplBad = []
for (const rk of Object.keys(RANKS)) {
  const r = RANKS[rk]
  if (!r.up || !r.rev) tplBad.push('rank ' + rk)
}
for (const s of Object.keys(SUITT)) {
  const x = SUITT[s]
  if (!x.up || !x.rev || !x.element) tplBad.push('suit ' + s)
}
ok('小牌模板每档都有正逆位与元素', tplBad.length === 0, tplBad)

// ── 富解读 ──
const RC = (rich.cards) || {}
ok('富解读有 78 条', Object.keys(RC).length === 78, Object.keys(RC).length)
const needRich = ['name_zh', 'en', 'element', 'core', 'up', 'down']
const missRich = []
for (const c of cards) {
  const r = RC[c.id]
  if (!r) { missRich.push(c.id + '(缺)'); continue }
  for (const f of needRich) {
    if (!r[f] || !String(r[f]).trim()) missRich.push(c.id + '.' + f)
  }
}
ok('富解读字段齐全', missRich.length === 0, missRich.slice(0, 8))

const nameMismatch = cards.filter((c) => RC[c.id] && RC[c.id].name_zh !== c.name_zh)
ok('富解读牌名与 deck 一致', nameMismatch.length === 0,
  nameMismatch.slice(0, 5).map((c) => c.name_zh + ' ≠ ' + RC[c.id].name_zh))

const ELEMS = new Set(['火', '土', '风', '水'])
const badEl = cards.filter((c) => RC[c.id] && !ELEMS.has(RC[c.id].element))
ok('元素都在火土风水内', badEl.length === 0, badEl.slice(0, 5).map((c) => c.id + ':' + RC[c.id].element))

// 元素归属必须与花色一致（小牌）：权杖火 / 圣杯水 / 宝剑风 / 星币土
const SUIT_ELEM = { wands: '火', cups: '水', swords: '风', pentacles: '土' }
const elMismatch = minors.filter((c) => RC[c.id] && SUIT_ELEM[c.suit] !== RC[c.id].element)
ok('小牌元素与花色对应', elMismatch.length === 0,
  elMismatch.slice(0, 6).map((c) => c.suit + '→' + RC[c.id].element))

// ── 图片资源 ──
const listImg = (sub) => {
  try { return new Set(fs.readdirSync(path.join(ROOT, 'assets/cards', sub)).map((f) => f.replace(/\.webp$/, ''))) }
  catch (e) { return new Set() }
}
const thumb = listImg('thumb')
const big = listImg('big')
const missThumb = cards.filter((c) => !thumb.has(c.id)).map((c) => c.id)
const missBig = cards.filter((c) => !big.has(c.id)).map((c) => c.id)
ok('78 张都有 thumb', missThumb.length === 0, missThumb.slice(0, 6))
ok('78 张都有 big', missBig.length === 0, missBig.slice(0, 6))
ok('有牌背图', fs.existsSync(path.join(ROOT, 'assets/cards/back.webp')))
const ids = new Set(cards.map((c) => c.id))
ok('没有多余 thumb', [...thumb].every((t) => ids.has(t)), [...thumb].filter((t) => !ids.has(t)).slice(0, 6))
ok('没有多余 big', [...big].every((t) => ids.has(t)), [...big].filter((t) => !ids.has(t)).slice(0, 6))

console.log('数据层：通过 ' + pass + ' 项' + (bad.length ? '，失败 ' + bad.length + ' 项' : '，全绿'))
bad.forEach((b) => console.log('  ✗ ' + b))
process.exit(bad.length ? 1 : 0)
