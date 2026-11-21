// 抽牌链审计：prng → 洗牌 → 选牌 → 逆位
// 统计口径说明：
//   df=77 卡方 3σ ≈ 77+3·sqrt(154) ≈ 114 → 阈值 116
//   df=719 卡方 3σ ≈ 719+3·sqrt(1438) ≈ 833 → 阈值 850
import { createEngine, prng, SPREAD_KEYS } from '../../plugin/srs-engine.mjs'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = 'E:/UserData/dsh-workspace/_tools/sorceress-widget'
const deck = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/deck.json'), 'utf8')).cards
const eng = createEngine()

let pass = 0
const bad = []
const ok = (name, cond, extra) => {
  if (cond) pass += 1
  else bad.push(name + (extra !== undefined ? '  → ' + JSON.stringify(extra) : ''))
}

const CHI_DF77 = 116
const CHI_DF719 = 850

// ── ① 洗牌后每张牌出现频率均匀（78 张 × 大样本）──
const N = 78000
const firstCount = new Map()
const revCount = new Map()
for (const c of deck) { firstCount.set(c.id, 0); revCount.set(c.id, 0) }
let revTotal = 0
let cardTotal = 0

for (let s = 1; s <= N; s += 1) {
  const r = eng.drawSpread('one', { seed: s })
  const c = r.cards[0]
  firstCount.set(c.card.id, firstCount.get(c.card.id) + 1)
  cardTotal += 1
  if (c.reversed) { revTotal += 1; revCount.set(c.card.id, revCount.get(c.card.id) + 1) }
}
const expect = N / 78
let chi = 0
for (const v of firstCount.values()) chi += ((v - expect) ** 2) / expect
ok('78 张出现频率均匀', chi < CHI_DF77, { chi: +chi.toFixed(2), threshold: CHI_DF77, expect: +expect.toFixed(1) })
ok('每张牌都出现过', [...firstCount.values()].every((v) => v > 0),
  [...firstCount.entries()].filter(([, v]) => v === 0).map(([k]) => k))

// ── ② 逆位率 ≈ 50% ──
const revRate = revTotal / cardTotal
ok('逆位率接近 50%', Math.abs(revRate - 0.5) < 0.012, { rate: +revRate.toFixed(4) })

// ── ③ 逆位不偏向任何特定牌（初始值必须设成 0.5，否则永远选不出最偏的）──
let worst = { id: null, rate: 0.5 }
for (const [id, rv] of revCount) {
  const rate = rv / firstCount.get(id)
  if (Math.abs(rate - 0.5) > Math.abs(worst.rate - 0.5)) worst = { id, rate, n: firstCount.get(id) }
}
ok('逆位不偏向任何特定牌', Math.abs(worst.rate - 0.5) < 0.12, worst)

// ── ④ 同种子完全可复现 ──
const sig = (seed) => JSON.stringify(eng.drawSpread('five', { seed }).cards.map((c) => [c.card.id, c.reversed]))
ok('同种子逐张完全复现', [1, 42, 999, 2111721996, 4294967295].every((s) => sig(s) === sig(s)))

// ── ⑤ 不同种子不撞车 ──
const seen = new Set()
let dup = 0
for (let s = 1; s <= 500; s += 1) {
  const k = sig(s)
  if (seen.has(k)) dup += 1
  seen.add(k)
}
ok('不同种子结果不重复', dup <= 2, { dup })

// ── ⑥ 同一副内不重复出牌 ──
let dupInSpread = 0
for (let s = 1; s <= 3000; s += 1) {
  const ids = eng.drawSpread('celtic', { seed: s }).cards.map((c) => c.card.id)
  if (new Set(ids).size !== ids.length) dupInSpread += 1
}
ok('同一牌阵内无重复牌', dupInSpread === 0, { dupInSpread })

// ── ⑦ 牌阵张数（引擎认知的 6 档；daily 由客户端锁成 one，不在引擎牌阵里）──
const WANT = { one: 1, three: 3, five: 5, relation: 7, celtic: 10, either: 5 }
const countBad = []
for (const [k, n] of Object.entries(WANT)) {
  const r = eng.drawSpread(k, { seed: 7 })
  if (!r || !Array.isArray(r.cards) || r.cards.length !== n) {
    countBad.push(k + ' 期望 ' + n + ' 实际 ' + (r && r.cards ? r.cards.length : 'null'))
  }
}
ok('6 档牌阵张数都对', countBad.length === 0, countBad)
ok('SPREAD_KEYS 为 6 档', SPREAD_KEYS.length === 6, SPREAD_KEYS)
// 未知名要有确定行为（当前回落到 three），不能抛错也不能返回空
const unknown = eng.drawSpread('__nope__', { seed: 1 })
ok('未知牌阵有确定回落且不抛错', unknown && Array.isArray(unknown.cards) && unknown.cards.length > 0,
  unknown && unknown.cards && unknown.cards.length)

// ── ⑧ 位置标签非空且不重复 ──
const labelBad = []
for (const k of SPREAD_KEYS) {
  const labs = eng.drawSpread(k, { seed: 11 }).cards.map((c) => c.position)
  if (labs.some((x) => !x || !String(x).trim())) labelBad.push(k + '(空标签)')
  if (new Set(labs).size !== labs.length) labelBad.push(k + '(重复:' + labs.join('/') + ')')
}
ok('每位都有独立位置标签', labelBad.length === 0, labelBad)

// ── ⑨ reversed:false 时全正 ──
const noRev = eng.drawSpread('celtic', { seed: 3, reversed: false })
ok('reversed:false 时全为正位', noRev.cards.every((c) => !c.reversed),
  noRev.cards.filter((c) => c.reversed).length)

// ── ⑩ 6 张洗牌的 720 种排列均匀 ──
const six = [0, 1, 2, 3, 4, 5]
const permCount = new Map()
const ITER = 720 * 60
for (let s = 1; s <= ITER; s += 1) {
  const rnd = prng(s)
  const a = six.slice()
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1))
    const t = a[i]; a[i] = a[j]; a[j] = t
  }
  const key = a.join('')
  permCount.set(key, (permCount.get(key) || 0) + 1)
}
ok('6 张能洗出全部 720 种排列', permCount.size === 720, permCount.size)
const expPerm = ITER / 720
let chiPerm = 0
for (const v of permCount.values()) chiPerm += ((v - expPerm) ** 2) / expPerm
ok('720 种排列等概率', chiPerm < CHI_DF719, { chi: +chiPerm.toFixed(2), threshold: CHI_DF719, df: 719 })

// ── ⑪ 牌在各位置上的平均落点接近中位（10 位 → 4.5）──
const posSum = new Map()
const POS_N = 5000
for (let s = 1; s <= POS_N; s += 1) {
  eng.drawSpread('celtic', { seed: s }).cards.forEach((c, i) => {
    const cur = posSum.get(c.card.id) || { sum: 0, n: 0 }
    cur.sum += i; cur.n += 1
    posSum.set(c.card.id, cur)
  })
}
let worstPos = { id: null, avg: 4.5 }
for (const [id, v] of posSum) {
  const a = v.sum / v.n
  if (Math.abs(a - 4.5) > Math.abs(worstPos.avg - 4.5)) worstPos = { id, avg: a }
}
ok('牌在 10 个位置上的平均落点接近 4.5', Math.abs(worstPos.avg - 4.5) < 0.45,
  { id: worstPos.id, avg: +worstPos.avg.toFixed(3) })

// ── ⑫ 前 N 张就是洗牌序列的前 N 张（不是重新随机）──
const r10 = eng.drawSpread('celtic', { seed: 2026 })
const r1 = eng.drawSpread('one', { seed: 2026 })
ok('多张牌阵的前 1 张与单张一致（同一副顺序取前缀）',
  r10.cards[0].card.id === r1.cards[0].card.id && r10.cards[0].reversed === r1.cards[0].reversed,
  [r10.cards[0].card.id, r1.cards[0].card.id])

console.log('抽牌链：通过 ' + pass + ' 项' + (bad.length ? '，失败 ' + bad.length + ' 项' : '，全绿'))
bad.forEach((b) => console.log('  ✗ ' + b))
process.exit(bad.length ? 1 : 0)
