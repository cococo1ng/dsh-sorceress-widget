// 文案生成层审计：每位读法 / 牌义详略 / 牌卡元信息 / 穿搭 / 回顾
import fs from 'node:fs'
import path from 'node:path'
import { createEngine, SPREAD_KEYS, POS_GUIDE } from '../../plugin/srs-engine.mjs'

const ROOT = 'E:/UserData/dsh-workspace/_tools/sorceress-widget'
const readJson = (n) => JSON.parse(fs.readFileSync(path.join(ROOT, 'data', n), 'utf8'))

function loadClient() {
  const src = fs.readFileSync(path.join(ROOT, 'src', 'client.template.js'), 'utf8')
  const from = src.indexOf('factory(require) {')
  const to = src.indexOf('function Widget() {')
  let region = src.slice(from + 'factory(require) {'.length, to)
  const stubs = {
    __SRS_VERSION__: 'test', __DECK_JSON__: JSON.stringify(readJson('deck.json')),
    __TAROT_JSON__: JSON.stringify(readJson('tarot.json')),
    __TAROT_RICH_JSON__: JSON.stringify(readJson('tarot-rich.json')),
    __HORO_JSON__: JSON.stringify(readJson('horoscope.json')),
    __EMPATHY_JSON__: JSON.stringify(readJson('empathy.json')),
    __HIT_BOXES__: '{}', __LAYOUT__: '{"rootW":1,"rootH":1}',
    __DESIGN_TOKENS__: '{"colors":{},"fonts":[12],"space":[4]}',
  }
  for (const [k, v] of Object.entries(stubs)) region = region.split(k).join(v)
  const store = new Map()
  globalThis.window = {
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k), key: (i) => [...store.keys()][i],
      get length() { return store.size },
    },
    crypto: globalThis.crypto, addEventListener() {}, removeEventListener() {},
    getSelection: () => null, innerWidth: 1440, innerHeight: 900,
    Audio: class {}, Image: class {}, btoa: globalThis.btoa, atob: globalThis.atob,
  }
  globalThis.document = {
    body: { appendChild() {} }, getElementById: () => null,
    createElement: () => ({ style: {}, appendChild() {}, setAttribute() {} }),
    querySelectorAll: () => [],
  }
  const expose = ';globalThis.__C = { readAt, detailLines, cardMeta, wearPlan, reviewOf, POS_GUIDE, SPREAD_POS, DECK, TAROT, meaningOf, todayCard, HORO }'
  // eslint-disable-next-line no-new-func
  new Function('require', region + expose)(() => ({ createElement: () => null }))
  return globalThis.__C
}

const C = loadClient()
const eng = createEngine()

let pass = 0
const bad = []
const ok = (name, cond, extra) => {
  if (cond) pass += 1
  else bad.push(name + (extra !== undefined ? '  → ' + JSON.stringify(extra).slice(0, 240) : ''))
}

const WANT = { one: 1, three: 3, five: 5, relation: 7, celtic: 10, either: 5 }

// ── ① 多张牌阵的每位都要有位置说明（单张不渲染这一行，允许没有）──
const guideBad = []
for (const spread of SPREAD_KEYS) {
  const positions = C.SPREAD_POS[spread] || []
  ok('位置标签数量与张数一致 ' + spread, positions.length === WANT[spread], [positions.length, WANT[spread]])
  if (spread === 'one') continue
  const g = C.POS_GUIDE[spread] || {}
  for (const p of positions) {
    if (!g[p] || !String(g[p]).trim()) guideBad.push(spread + ':' + p)
  }
}
ok('多张牌阵每位都有位置说明', guideBad.length === 0, guideBad.slice(0, 8))

// 客户端 POS_GUIDE 与宿主逐字一致
const hostGuideBad = []
for (const spread of Object.keys(POS_GUIDE)) {
  for (const [pos, txt] of Object.entries(POS_GUIDE[spread])) {
    if ((C.POS_GUIDE[spread] || {})[pos] !== txt) hostGuideBad.push(spread + ':' + pos)
  }
}
ok('客户端与宿主的位置说明逐字一致', hostGuideBad.length === 0, hostGuideBad.slice(0, 6))

// ── ② readAt：非空；正逆位要给出不同读法（meaning 按方向重算）──
const readBad = []
const revSame = []
for (const spread of SPREAD_KEYS) {
  const host = eng.drawSpread(spread, { seed: 314 })
  host.cards.forEach((hc) => {
    const upM = C.meaningOf(hc.card, C.DECK, C.TAROT, false)
    const downM = C.meaningOf(hc.card, C.DECK, C.TAROT, true)
    const up = C.readAt(hc.position, spread, { card: hc.card, reversed: false, meaning: upM })
    const down = C.readAt(hc.position, spread, { card: hc.card, reversed: true, meaning: downM })
    if (!up || !String(up).trim()) readBad.push(spread + ':' + hc.position)
    if (up === down) revSame.push(spread + ':' + hc.position)
  })
}
ok('每位读法都非空', readBad.length === 0, readBad.slice(0, 8))
ok('正逆位给出不同读法', revSame.length === 0, revSame.slice(0, 8))

// ├ 多张牌阵的读法必须带位置说明前缀
const prefixMissing = []
for (const spread of SPREAD_KEYS.filter((s) => s !== 'one')) {
  const host = eng.drawSpread(spread, { seed: 88 })
  host.cards.forEach((hc) => {
    const txt = C.readAt(hc.position, spread, { card: hc.card, reversed: hc.reversed, meaning: hc.meaning })
    if (!txt.startsWith('（')) prefixMissing.push(spread + ':' + hc.position)
  })
}
ok('多张牌阵的读法都带位置说明', prefixMissing.length === 0, prefixMissing.slice(0, 6))

// ── ③ 牌义详略：detailLines 收的是 meaning ──
const detBad = []
for (const card of C.DECK.cards) {
  for (const rev of [false, true]) {
    const m = C.meaningOf(card, C.DECK, C.TAROT, rev)
    const lines = C.detailLines(m)
    if (!Array.isArray(lines) || !lines.length) detBad.push(card.id + (rev ? '逆(空)' : '正(空)'))
    else if (lines.some((l) => /undefined|NaN|\[object/.test(String(l)))) detBad.push(card.id + '(脏值)')
  }
}
ok('78 张 × 2 向的牌义都干净且非空', detBad.length === 0, detBad.slice(0, 8))
// 同一张牌正逆位的牌义必须不同
const sameTR = C.DECK.cards.filter((c) => {
  const a = C.meaningOf(c, C.DECK, C.TAROT, false).lines.join('|')
  const b = C.meaningOf(c, C.DECK, C.TAROT, true).lines.join('|')
  return a === b
})
ok('78 张正逆位牌义都不同', sameTR.length === 0, sameTR.slice(0, 5).map((c) => c.id))

// ── ④ cardMeta 返回字符串，含大牌/花色标识与横幅号 ──
const metaBad = []
for (const card of C.DECK.cards) {
  const meta = C.cardMeta(card)
  if (typeof meta !== 'string' || !meta) { metaBad.push(card.id + '(空)'); continue }
  if (!meta.includes('横幅')) metaBad.push(card.id + '(缺横幅)')
  if (card.kind === 'major' && !meta.includes('大阿卡纳')) metaBad.push(card.id + '(缺大牌标识)')
  if (card.kind === 'minor' && !/权杖|圣杯|宝剑|星币/.test(meta)) metaBad.push(card.id + '(缺花色)')
}
ok('78 张牌卡元信息文案齐全', metaBad.length === 0, metaBad.slice(0, 8))

// ── ⑤ 穿搭：1–3 项，主色=幸运色 ──
const day = new Date('2026-11-21T12:00:00')
const wearBad = []
for (const sg of C.HORO.signs) {
  const card = C.todayCard(sg.id, C.HORO, day)
  const w = C.wearPlan(card, C.HORO)
  if (!Array.isArray(w) || w.length < 1 || w.length > 3) wearBad.push(sg.id + '(项数' + (w && w.length) + ')')
  else if (card.color && w[0] && w[0].name !== card.color[0]) wearBad.push(sg.id + '(主色不符)')
}
ok('12 星座穿搭 1–3 项且主色=幸运色', wearBad.length === 0, wearBad.slice(0, 5))

// ── ⑥ 回顾 ──
const rvEmpty = C.reviewOf([])
ok('空历史回顾不崩', rvEmpty && rvEmpty.total === 0, rvEmpty && rvEmpty.total)
const now = new Date()
const fakeHist = []
for (let i = 0; i < 5; i += 1) {
  fakeHist.push({ t: now.getTime() - i * 86400000, id: 'major-00', name: '愚者', numeral: '0', reversed: false, spread: i % 2 ? 'three' : 'one' })
}
const rv = C.reviewOf(fakeHist)
ok('回顾统计总次数', rv && rv.total === 5, rv && rv.total)
ok('回顾统计牌阵分布', rv && rv.spreads && rv.spreads.one === 3 && rv.spreads.three === 2, rv && rv.spreads)

console.log('文案层：通过 ' + pass + ' 项' + (bad.length ? '，失败 ' + bad.length + ' 项' : '，全绿'))
bad.slice(0, 20).forEach((b) => console.log('  ✗ ' + b))
process.exit(bad.length ? 1 : 0)
