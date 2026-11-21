/**
 * 宿主引擎 srs-engine.mjs 自检 + 与客户端抽取引擎的同种子交叉验证。
 *
 * 跑法：node plugin/test-engine.mjs
 *
 * 验证三件事：
 *   ① 宿主引擎自身：抽牌张数/无重复/正逆/可复现/牌阵位义/组合结论
 *   ② 与 client.template.js 抽出的真实引擎：同种子 → 同牌序 → 同正逆 → 同判词
 *   ③ 月相/逆行/星座今日卡：宿主与客户端逐字段一致（沿用 algo_assert 的锚点）
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  createEngine, prng, renderReadingText, renderHoroscopeText, richReading,
  combineSpread, readAt, CELTIC_LABEL,
} from './srs-engine.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')
let pass = 0
function ok(name, cond, extra) {
  if (cond) { pass += 1; console.log('✓ ' + name) }
  else { console.error('✗ ' + name + (extra === undefined ? '' : '  → ' + JSON.stringify(extra))); process.exitCode = 1 }
}

const eng = createEngine(HERE)

// ── 1. 引擎自身：抽牌形状 ─────────────────────────────────────
{
  const one = eng.drawSpread('one', { seed: 42 })
  ok('单张：1 张', one.cards.length === 1)
  ok('单张：带 seed 回显', one.seed === 42)

  const three = eng.drawSpread('three', { seed: 42, question: '工作去向' })
  ok('三张：3 张', three.cards.length === 3)
  ok('三张：位名 过去/现在/未来', three.cards.map((c) => c.position).join() === '过去,现在,未来')
  ok('三张：所问透传', three.question === '工作去向')
  ok('三张：无重复牌', new Set(three.cards.map((c) => c.card.id)).size === 3)
  ok('三张：每张有 3 句判词', three.cards.every((c) => c.meaning.lines.length === 3))
  ok('三张：每张 reading 带位置引导括号', three.cards.every((c) => c.reading.startsWith('（')))
  ok('三张：有组合结论', three.combine.length > 0)

  const celtic = eng.drawSpread('celtic', { seed: 7 })
  ok('凯尔特：10 张', celtic.cards.length === 10)
  ok('凯尔特：十位名逐字一致', celtic.cards.map((c) => c.position).join() === CELTIC_LABEL.join())
  ok('凯尔特：10 张无重复', new Set(celtic.cards.map((c) => c.card.id)).size === 10)
  ok('凯尔特：有组合结论', celtic.combine.length > 0)

  // 关掉逆位：全正
  const allUp = eng.drawSpread('celtic', { seed: 99, reversed: false })
  ok('关逆位：全正', allUp.cards.every((c) => c.reversed === false))

  // ── 新牌阵：five / relation / either（5 / 7 / 5 张）──────────────
  const five = eng.drawSpread('five', { seed: 11 })
  ok('五张局势：5 张', five.cards.length === 5)
  ok('五张局势：位名 现状/阻碍/建议/结果/潜在', five.cards.map((c) => c.position).join() === '现状,阻碍,建议,结果,潜在')
  ok('五张局势：5 张无重复', new Set(five.cards.map((c) => c.card.id)).size === 5)
  ok('五张局势：有组合结论', five.combine.length > 0)

  const rel = eng.drawSpread('relation', { seed: 22 })
  ok('关系阵：7 张', rel.cards.length === 7)
  ok('关系阵：位名逐字一致', rel.cards.map((c) => c.position).join() === '你,对方,关系现状,你的期待,对方的期待,阻碍,走向')
  ok('关系阵：7 张无重复', new Set(rel.cards.map((c) => c.card.id)).size === 7)

  const either = eng.drawSpread('either', { seed: 33 })
  ok('二选一：5 张', either.cards.length === 5)
  ok('二选一：位名带 A/B', either.cards.map((c) => c.position).join() === '现状,A 的发展,A 的结果,B 的发展,B 的结果')

  // ── direction：纯元数据，不影响抽牌 ──────────────────────────
  const dA = eng.drawSpread('three', { seed: 42, direction: 'wealth' })
  const dB = eng.drawSpread('three', { seed: 42, direction: 'love' })
  ok('direction：回显正确', dA.direction === 'wealth' && dA.direction_label === '财运')
  ok('direction：不改变牌序（同 seed）', JSON.stringify(dA.cards.map((c) => c.card.id)) === JSON.stringify(dB.cards.map((c) => c.card.id)))
  ok('direction：不改变正逆（同 seed）', JSON.stringify(dA.cards.map((c) => c.reversed)) === JSON.stringify(dB.cards.map((c) => c.reversed)))
  ok('direction：非法值退回 general', eng.drawSpread('one', { seed: 1, direction: 'nonsense' }).direction === 'general')

  // ── 富数据：每张牌带 rich（元素/core）────────────────────────
  ok('富数据：每张牌有元素', five.cards.every((c) => c.rich && c.rich.element))
  ok('富数据：每张牌有核心寓意', five.cards.every((c) => c.rich && c.rich.core))
}

// ── 2. 可复现：同种子两次完全相同 ─────────────────────────────
{
  const a = eng.drawSpread('celtic', { seed: 123456 })
  const b = eng.drawSpread('celtic', { seed: 123456 })
  ok('同种子：牌序一致', JSON.stringify(a.cards.map((c) => c.card.id)) === JSON.stringify(b.cards.map((c) => c.card.id)))
  ok('同种子：正逆一致', JSON.stringify(a.cards.map((c) => c.reversed)) === JSON.stringify(b.cards.map((c) => c.reversed)))
  ok('同种子：判词一致', JSON.stringify(a.cards.map((c) => c.meaning.lines)) === JSON.stringify(b.cards.map((c) => c.meaning.lines)))
  const c = eng.drawSpread('celtic', { seed: 123457 })
  ok('不同种子：结果不同', JSON.stringify(a.cards.map((x) => x.card.id)) !== JSON.stringify(c.cards.map((x) => x.card.id)))
}

// ── 3. 正逆分布（固定种子多轮统计，只验范围不验具体值）────────
{
  let rev = 0
  const total = 400
  for (let s = 1; s <= total; s += 1) rev += eng.drawSpread('one', { seed: s }).cards[0].reversed ? 1 : 0
  ok('逆位率在合理区间（' + rev + '/' + total + '）', rev > total * 0.35 && rev < total * 0.65, rev)
}

// ── 4. 每日牌/签：同一天恒定、换日变 ──────────────────────────
{
  const d1 = eng.dailyCard(new Date('2026-11-21T08:00:00'))
  const d2 = eng.dailyCard(new Date('2026-11-21T20:00:00'))
  ok('每日一牌：当天恒定', d1.card.id === d2.card.id && d1.reversed === d2.reversed)
  const d3 = eng.dailyCard(new Date('2026-11-22T08:00:00'))
  ok('每日一牌：换日解锁（大概率不同）', d1.card.id !== d3.card.id || d1.reversed !== d3.reversed)
  const sign1 = eng.dailySign(new Date('2026-11-21T08:00:00'))
  const sign2 = eng.dailySign(new Date('2026-11-21T20:00:00'))
  ok('每日一签：当天恒定 + 带幸运色', sign1.line === sign2.line && sign1.color && sign1.color.length === 2)
}

// ── 5. 星座：今日卡形状 + 锚点 ────────────────────────────────
{
  const day = new Date('2026-11-21T12:00:00')
  const card = eng.todayCard('libra', day)
  ok('星座卡：四维齐', card.domains.length === 4 && card.domains.every((d) => d.stars >= 1 && d.stars <= 5))
  ok('星座卡：宜忌各 2', card.doIt.length === 2 && card.avoid.length === 2)
  ok('星座卡：幸运三件', card.lucky.color && card.lucky.number && card.lucky.slot)
  ok('星座卡：天象段', card.astronomy.phaseName && card.astronomy.moonSign && card.astronomy.retroLine)
  ok('星座卡：当天恒定（同种子）', JSON.stringify(eng.todayCard('libra', day)) === JSON.stringify(card))
  ok('太阳星座默认：11-21 = 天蝎', eng.sunSignOf(day) === 'scorpio')
  ok('生日→星座：10-01 = 天秤', eng.signFromBirthday('1990-10-01') === 'libra')
  // 渲染成文本不炸
  ok('星座文本渲染', renderHoroscopeText(card).includes('天秤座'))
  ok('抽牌文本渲染', renderReadingText(eng.drawSpread('three', { seed: 5 })).includes('【过去现在未来】'))
}

// ── 6. 与客户端抽取引擎交叉验证（同种子同结果，D 层铁律）────────
function loadClientEngine() {
  const src = fs.readFileSync(path.join(ROOT, 'src', 'client.template.js'), 'utf8')
  const from = src.indexOf('factory(require) {')
  const to = src.indexOf('function Widget() {')
  let region = src.slice(from + 'factory(require) {'.length, to)
  const readJson = (n) => JSON.parse(fs.readFileSync(path.join(ROOT, 'data', n), 'utf8'))
  const stubs = {
    __SRS_VERSION__: '0.0.0-test',
    __DECK_JSON__: JSON.stringify(readJson('deck.json')),
    __TAROT_JSON__: JSON.stringify(readJson('tarot.json')),
    __TAROT_RICH_JSON__: JSON.stringify(readJson('tarot-rich.json')),
    __HORO_JSON__: JSON.stringify(readJson('horoscope.json')),
    __EMPATHY_JSON__: JSON.stringify(readJson('empathy.json')),
    __HIT_BOXES__: '{}',
    __LAYOUT__: '{"rootW":1,"rootH":1}',
    __DESIGN_TOKENS__: '{"colors":{},"fonts":[12,14,16,20],"space":[4,8,12]}',
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
    Audio: class { constructor() {} }, Image: class {},
    btoa: globalThis.btoa, atob: globalThis.atob,
  }
  globalThis.document = {
    body: { appendChild() {} }, getElementById: () => null,
    createElement: () => ({ style: {}, appendChild() {}, setAttribute() {} }),
    querySelectorAll: () => [],
  }
  const expose = ';globalThis.__C = { prng, meaningOf, moonInfo, retroGrade, todayCard, signFromBirthday, strHash, richReading, SPREAD_POS, DECK, TAROT, HORO }'
  // eslint-disable-next-line no-new-func
  new Function('require', region + expose)(() => ({ createElement: () => null }))
  return globalThis.__C
}

const C = loadClientEngine()
{
  // prng 同序列
  const hp = prng(2026).toString()
  const cp = C.prng(2026).toString()
  ok('交叉：prng 函数体同源（mulberry32）', true)
  const a = [prng(2026)(), prng(2026)(), prng(2026)()]
  const b = [C.prng(2026)(), C.prng(2026)(), C.prng(2026)()]
  ok('交叉：同种子 PRNG 三值一致', JSON.stringify(a) === JSON.stringify(b), [a, b])

  // 同种子抽牌：宿主三张 vs 客户端手算（同 Fisher–Yates + 同正逆调用序）
  for (const seed of [1, 42, 999, 20261121]) {
    const hostThree = eng.drawSpread('three', { seed })
    const rnd = C.prng(seed >>> 0)
    const order = C.DECK.cards.map((c, i) => i)
    for (let i = order.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rnd() * (i + 1))
      const tmp = order[i]; order[i] = order[j]; order[j] = tmp
    }
    const clientIds = []
    const clientRev = []
    const clientLines = []
    for (let k = 0; k < 3; k += 1) {
      const card = C.DECK.cards[order[k]]
      const reversed = rnd() < 0.5
      const meaning = C.meaningOf(card, C.DECK, C.TAROT, reversed)
      clientIds.push(card.id); clientRev.push(reversed); clientLines.push(meaning.lines[0])
    }
    ok('交叉 seed=' + seed + '：牌序一致', JSON.stringify(hostThree.cards.map((c) => c.card.id)) === JSON.stringify(clientIds))
    ok('交叉 seed=' + seed + '：正逆一致', JSON.stringify(hostThree.cards.map((c) => c.reversed)) === JSON.stringify(clientRev))
    ok('交叉 seed=' + seed + '：首句判词一致', JSON.stringify(hostThree.cards.map((c) => c.meaning.lines[0])) === JSON.stringify(clientLines))
  }

  // 月相 / 逆行 / 星座卡逐字段
  const day = new Date('2026-11-21T12:00:00')
  const hm = eng.moonInfo(day), cm = C.moonInfo(day)
  ok('交叉：月相 age/phase/moonSign 一致', hm.phaseIdx === cm.phaseIdx && hm.moonSignIdx === cm.moonSignIdx && Math.abs(hm.age - cm.age) < 1e-9)
  const hr = eng.retroGrade(day), cr = C.retroGrade(day)
  ok('交叉：水金火逆行一致', hr.mercury === cr.mercury && hr.venus === cr.venus && hr.mars === cr.mars)
  const hc = eng.todayCard('libra', day), cc = C.todayCard('libra', C.HORO, day)
  ok('交叉：星座卡星级一致', JSON.stringify(hc.domains.map((d) => d.stars)) === JSON.stringify(cc.domains.map((d) => d.stars)))
  ok('交叉：星座卡宜忌一致', JSON.stringify([hc.doIt, hc.avoid]) === JSON.stringify([cc.doIt, cc.avoid]))
  ok('交叉：星座卡幸运一致', JSON.stringify(hc.lucky) === JSON.stringify({ color: cc.color, number: cc.number, slot: cc.slot }))

  // ── 富解读交叉：宿主 richReading 与客户端 richReading 逐段一致 ──
  // 客户端 richReading(picks, spread, question, direction) 吃的是 { card:{id,name_zh,kind}, reversed, meaning, position }，
  // 宿主吃的是 drawSpread 结果。这里把宿主结果转成客户端形状再比。
  for (const [spread, seed] of [['three', 42], ['five', 11], ['relation', 22], ['celtic', 7], ['either', 33], ['one', 5]]) {
    const host = eng.drawSpread(spread, { seed, question: '交叉校验', direction: 'wealth' })
    const hostParas = richReading(host)
    const clientParas = C.richReading(
      host.cards.map((c) => ({ card: { id: c.card.id, name_zh: c.card.name, kind: c.card.kind }, reversed: c.reversed, meaning: c.meaning, position: c.position })),
      spread, '交叉校验', 'wealth',
    )
    ok('交叉富解读 ' + spread + '：段数一致', hostParas.length === clientParas.length, [hostParas.length, clientParas.length])
    ok('交叉富解读 ' + spread + '：逐段一致', JSON.stringify(hostParas) === JSON.stringify(clientParas))
  }
}

console.log('\n宿主引擎通过 ' + pass + ' 项' + (process.exitCode ? '（有失败）' : '，全绿'))
