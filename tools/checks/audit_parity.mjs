// 客户端 ↔ 宿主 一致性审计
// 同一颗种子、同一牌阵，两边必须逐字段一致：牌序 / 正逆 / 位置标签 / 牌义 / 组合结论 / 富解读
import fs from 'node:fs'
import path from 'node:path'
import { createEngine, SPREAD_KEYS, richReading, readingSummary, combineSpread } from '../../plugin/srs-engine.mjs'

const ROOT = 'E:/UserData/dsh-workspace/_tools/sorceress-widget'
const readJson = (n) => JSON.parse(fs.readFileSync(path.join(ROOT, 'data', n), 'utf8'))

function loadClient() {
  const src = fs.readFileSync(path.join(ROOT, 'src', 'client.template.js'), 'utf8')
  const from = src.indexOf('factory(require) {')
  const to = src.indexOf('function Widget() {')
  let region = src.slice(from + 'factory(require) {'.length, to)
  const stubs = {
    __SRS_VERSION__: '0.0.0-test',
    __DECK_JSON__: JSON.stringify(readJson('deck.json')),
    __TAROT_JSON__: JSON.stringify(readJson('tarot.json')),
    __TAROT_RICH_JSON__: JSON.stringify(readJson('tarot-rich.json')),
    __HORO_JSON__: JSON.stringify(readJson('horoscope.json')),
    __EMPATHY_JSON__: JSON.stringify(readJson('empathy.json')),
    __HIT_BOXES__: '{}',
    __LAYOUT__: '{"rootW":1,"rootH":1}',
    __DESIGN_TOKENS__: '{"colors":{},"fonts":[12],"space":[4]}',
  }
  for (const [k, v] of Object.entries(stubs)) region = region.split(k).join(v)
  const store = new Map()
  globalThis.window = {
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
      key: (i) => [...store.keys()][i],
      get length() { return store.size },
    },
    crypto: globalThis.crypto,
    addEventListener() {}, removeEventListener() {},
    getSelection: () => null, innerWidth: 1440, innerHeight: 900,
    Audio: class {}, Image: class {},
    btoa: globalThis.btoa, atob: globalThis.atob,
  }
  globalThis.document = {
    body: { appendChild() {} }, getElementById: () => null,
    createElement: () => ({ style: {}, appendChild() {}, setAttribute() {} }),
    querySelectorAll: () => [],
  }
  const expose = ';globalThis.__C = { prng, DECK, TAROT, meaningOf, richReading, readingSummary, combineSpread, SPREAD_POS, SPREAD_WANT, readingFullText }'
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
  else bad.push(name + (extra !== undefined ? '  → ' + JSON.stringify(extra).slice(0, 260) : ''))
}

// 客户端口径复刻：同一 Fisher–Yates，从第 0 格起逐张取，逆位按「跳过已用随机数」规则
function clientDraw(seed, n, reversedEnabled) {
  const rnd = C.prng(seed >>> 0)
  const order = C.DECK.cards.map((_, i) => i)
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1))
    const t = order[i]; order[i] = order[j]; order[j] = t
  }
  const picks = []
  for (let k = 0; k < n; k += 1) {
    const card = C.DECK.cards[order[k]]
    const reversed = reversedEnabled ? rnd() < 0.5 : false
    picks.push({ card, reversed, meaning: C.meaningOf(card, C.DECK, C.TAROT, reversed) })
  }
  return picks
}

const SEEDS = [1, 7, 42, 999, 20261121, 2111721996, 4294967295]
const WANT = { one: 1, three: 3, five: 5, relation: 7, celtic: 10, either: 5 }

for (const spread of SPREAD_KEYS) {
  const n = WANT[spread]
  for (const seed of SEEDS) {
    const host = eng.drawSpread(spread, { seed, question: '测试问题', direction: 'career' })
    const cli = clientDraw(seed, n, true)
    const tag = spread + '/seed=' + seed

    ok(tag + ' 牌序一致',
      JSON.stringify(host.cards.map((c) => c.card.id)) === JSON.stringify(cli.map((c) => c.card.id)),
      [host.cards.map((c) => c.card.id), cli.map((c) => c.card.id)])
    ok(tag + ' 正逆一致',
      JSON.stringify(host.cards.map((c) => c.reversed)) === JSON.stringify(cli.map((c) => c.reversed)))
    ok(tag + ' 牌义三句一致',
      JSON.stringify(host.cards.map((c) => c.meaning.lines)) === JSON.stringify(cli.map((c) => c.meaning.lines)))
    ok(tag + ' 关键词一致',
      JSON.stringify(host.cards.map((c) => c.meaning.keywords)) === JSON.stringify(cli.map((c) => c.meaning.keywords)))
    ok(tag + ' 位置标签一致',
      JSON.stringify(host.cards.map((c) => c.position)) === JSON.stringify(C.SPREAD_POS[spread]),
      [host.cards.map((c) => c.position), C.SPREAD_POS[spread]])

    // 组合结论
    const hostCombine = combineSpread(host.cards, spread) || ''
    const cliCombine = C.combineSpread(cli, spread) || ''
    ok(tag + ' 组合结论一致', hostCombine === cliCombine, [hostCombine.slice(0, 60), cliCombine.slice(0, 60)])

    // 富解读逐段
    const hostRich = richReading(host)
    const cliRich = C.richReading(cli, spread, '测试问题', 'career')
    ok(tag + ' 富解读段数一致', hostRich.length === cliRich.length, [hostRich.length, cliRich.length])
    let firstDiff = -1
    for (let i = 0; i < Math.min(hostRich.length, cliRich.length); i += 1) {
      if (hostRich[i] !== cliRich[i]) { firstDiff = i; break }
    }
    ok(tag + ' 富解读逐段一致', firstDiff < 0,
      firstDiff < 0 ? undefined : { at: firstDiff, host: hostRich[firstDiff].slice(0, 90), client: cliRich[firstDiff].slice(0, 90) })

    // 摘要
    const hostSum = readingSummary(host)
    const cliSum = C.readingSummary(cli, spread, '测试问题', 'career')
    ok(tag + ' 摘要一致', hostSum === cliSum, [hostSum.slice(0, 60), cliSum.slice(0, 60)])
  }
}

// 全正位口径也要一致
for (const spread of ['three', 'celtic']) {
  const host = eng.drawSpread(spread, { seed: 5, reversed: false })
  const cli = clientDraw(5, WANT[spread], false)
  ok('reversed:false 口径一致 ' + spread,
    JSON.stringify(host.cards.map((c) => [c.card.id, c.reversed])) === JSON.stringify(cli.map((c) => [c.card.id, c.reversed])))
}

// readingFullText（客户端「送进对话」用的整段）不得有 undefined / NaN 泄漏
for (const spread of SPREAD_KEYS) {
  const cli = clientDraw(88, WANT[spread], true)
  const txt = C.readingFullText(cli, spread, '测试问题', 'career', 88)
  ok('全文无 undefined/NaN 泄漏 ' + spread,
    !/undefined|NaN|\[object Object\]/.test(txt), txt.match(/undefined|NaN|\[object Object\]/g))
}

console.log('一致性：通过 ' + pass + ' 项' + (bad.length ? '，失败 ' + bad.length + ' 项' : '，全绿'))
bad.slice(0, 20).forEach((b) => console.log('  ✗ ' + b))
if (bad.length > 20) console.log('  …还有 ' + (bad.length - 20) + ' 项')
process.exit(bad.length ? 1 : 0)
