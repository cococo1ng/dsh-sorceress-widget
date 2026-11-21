// 算法审计：月相 / 逆行 / 星座 / 四柱 / 婚配 / 周期 / 心情牌
// 对照已知天文与历法锚点，而不是「看起来对」。
import fs from 'node:fs'
import path from 'node:path'
import { createEngine } from '../../plugin/srs-engine.mjs'

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
  const expose = ';globalThis.__C = { birthCard, jieTime, fourPillars, hepan, cycleLenOf, cycleDayState, signOf, empathyOf, signFromBirthday, DECK, EMPATHY, moonInfo, retroGrade, strHash }'
  // eslint-disable-next-line no-new-func
  new Function('require', region + expose)(() => ({ createElement: () => null }))
  return globalThis.__C
}

const eng = createEngine()
const C = loadClient()

let pass = 0
const bad = []
const ok = (name, cond, extra) => {
  if (cond) pass += 1
  else bad.push(name + (extra !== undefined ? '  → ' + JSON.stringify(extra) : ''))
}

// ── ① 月相：已知朔望锚点（UTC）──
const moonAnchors = [
  ['2000-01-06T18:14:00Z', 'new'],   // 天文历元基准新月
  ['2024-04-08T18:21:00Z', 'new'],   // 日全食（新月）
  ['2024-04-23T23:49:00Z', 'full'],  // 满月
  ['2026-01-03T10:03:00Z', 'full'],  // 2026 首个月圆附近
]
for (const [iso, kind] of moonAnchors) {
  const m = eng.moonInfo(new Date(iso))
  if (kind === 'new') {
    ok('月相锚点 ' + iso + ' ≈ 新月', m.age < 0.6 || m.age > 29.0, +m.age.toFixed(2))
  } else {
    ok('月相锚点 ' + iso + ' ≈ 满月', Math.abs(m.age - 14.765) < 0.7, +m.age.toFixed(2))
  }
}

// 月龄推进速率：约 1 天 → 0.984 天月亮周期分摊
const a1 = eng.moonInfo(new Date('2026-06-01T00:00:00Z')).age
const a2 = eng.moonInfo(new Date('2026-06-11T00:00:00Z')).age
let dAge = a2 - a1
if (dAge < 0) dAge += 29.530588853
ok('10 天月龄推进 ≈ 10 天（实测 ' + dAge.toFixed(2) + '）', Math.abs(dAge - 10) < 0.05, dAge)

// 周期回归：相隔一个朔望月应回到同一相位
const p1 = eng.moonInfo(new Date('2026-03-01T00:00:00Z')).age
const p2 = eng.moonInfo(new Date('2026-03-30T16:44:00Z')).age
let drift = Math.abs(p2 - p1)
if (drift > 14.7) drift = 29.530588853 - drift
ok('相隔一个朔望月相位回归（偏差 ' + drift.toFixed(2) + ' 天）', drift < 0.5, drift)

// ── ② 逆行：真实水逆区间 ──
const mercuryRetro = [
  ['2024-04-10', true], ['2024-04-25', true], ['2024-05-05', false],
  ['2024-08-10', true], ['2024-09-01', false],
  ['2024-12-01', true], ['2025-01-10', false],
]
for (const [d, want] of mercuryRetro) {
  const r = eng.retroGrade(new Date(d + 'T00:00:00Z')).mercury
  ok('水逆 ' + d + ' = ' + (want ? '是' : '否'), r === want, r)
}
// 火星/金星逆行区间（2025 火星逆行约 12/6–2/23；金星 2025-03 逆行）
ok('火星 2025-01-15 逆行', eng.retroGrade(new Date('2025-01-15T00:00:00Z')).mars === true,
  eng.retroGrade(new Date('2025-01-15T00:00:00Z')).mars)
ok('火星 2025-06-01 不逆行', eng.retroGrade(new Date('2025-06-01T00:00:00Z')).mars === false)
ok('金星 2025-03-15 逆行', eng.retroGrade(new Date('2025-03-15T00:00:00Z')).venus === true,
  eng.retroGrade(new Date('2025-03-15T00:00:00Z')).venus)

// ── ③ 星座边界：每个星座首末日必须落在对应座 ──
const BOUND = [
  ['aries', 3, 21], ['taurus', 4, 20], ['gemini', 5, 21], ['cancer', 6, 22],
  ['leo', 7, 23], ['virgo', 8, 23], ['libra', 9, 23], ['scorpio', 10, 24],
  ['sagittarius', 11, 23], ['capricorn', 12, 22], ['aquarius', 1, 20], ['pisces', 2, 19],
]
const signBad = []
for (const [id, m, d] of BOUND) {
  const got = eng.signOf(m, d)
  if (got !== id) signBad.push(id + ' ' + m + '/' + d + ' → ' + got)
  // 前一天应属于上一个星座
  const prev = new Date(2026, m - 1, d)
  prev.setDate(prev.getDate() - 1)
  const gotPrev = eng.signOf(prev.getMonth() + 1, prev.getDate())
  if (gotPrev === id) signBad.push(id + ' 前一日 ' + (prev.getMonth() + 1) + '/' + prev.getDate() + ' 也被判成本座')
}
ok('12 星座起点边界正确且不跨日重叠', signBad.length === 0, signBad.slice(0, 6))

// ── ④ 四柱：已知八字锚点 ──
const fp = C.fourPillars('1990-06-15', '12:00')
ok('四柱 1990-06-15 12:00 = 庚午 壬午 辛亥 甲午',
  fp && fp.pillars.join(' ') === '庚午 壬午 辛亥 甲午', fp && fp.pillars)
// 立春换年：2024-02-03 属癸卯年，2024-02-05 属甲辰年
const beforeLichun = C.fourPillars('2024-02-03', '12:00')
const afterLichun = C.fourPillars('2024-02-05', '12:00')
ok('立春前（2024-02-03）年柱为癸卯', beforeLichun && beforeLichun.pillars[0] === '癸卯', beforeLichun && beforeLichun.pillars[0])
ok('立春后（2024-02-05）年柱为甲辰', afterLichun && afterLichun.pillars[0] === '甲辰', afterLichun && afterLichun.pillars[0])
// 没填时辰 → 只有三柱
const noTime = C.fourPillars('1990-06-15', '')
ok('无时辰时只有三柱', noTime && noTime.pillars.length === 3 && noTime.timeKnown === false,
  noTime && [noTime.pillars.length, noTime.timeKnown])

// ── ⑤ 婚配：分数区间、对称性、不崩 ──
const pm = C.fourPillars('1990-06-15', '12:00')
const pf = C.fourPillars('1992-09-08', '08:30')
const hp1 = C.hepan(pm, pf)
const hp2 = C.hepan(pf, pm)
ok('婚配分数夹在 0–100', hp1 && typeof hp1.score === 'number' && hp1.score >= 0 && hp1.score <= 100, hp1 && hp1.score)
ok('婚配三维结构齐全', hp1 && hp1.items && hp1.items.length === 3, hp1 && hp1.items && hp1.items.length)
ok('婚配结果稳定（同输入同输出）', C.hepan(pm, pf).score === hp1.score)
// 日主改成双向平均后，交换双方总分应当完全一致（与 kuitan 同口径）
ok('婚配交换双方分数完全一致', hp1.score === hp2.score, [hp1.score, hp2.score])

// ── ⑥ 周期：长度归一与状态判定 ──
// 长度夹在 1–60（代码口径 Math.max(1, Math.min(60, n))）
ok('周期长度 0 视为没填 → 默认 28', C.cycleLenOf(0) === 28, C.cycleLenOf(0))
ok('周期长度负值归一（-5 → 1）', C.cycleLenOf(-5) === 1, C.cycleLenOf(-5))
ok('周期长度上限归一（99 → 60）', C.cycleLenOf(99) === 60, C.cycleLenOf(99))
ok('周期长度合法值保持（28）', C.cycleLenOf(28) === 28)
const DAY = 86400000
const start0 = new Date('2026-05-01T00:00:00').getTime()
const st = C.cycleDayState(start0 + 2 * DAY, [start0], 28)
ok('周期第 3 天判为经期', st === 'period', st)
const st2 = C.cycleDayState(start0 + 10 * DAY, [start0], 28)
ok('周期第 11 天不再是经期', st2 !== 'period', st2)
ok('无记录时返回 none', C.cycleDayState(start0, [], 28) === 'none')
ok('早于第一条记录不猜', C.cycleDayState(start0 - 5 * DAY, [start0], 28) === 'none')

// ── ⑦ 心情牌共情句：78 张都要有 ──
const empathy = C.EMPATHY || {}
const lackEmp = C.DECK.cards.filter((c) => !C.empathyOf(c.id))
ok('78 张都有心情共情句', lackEmp.length === 0, lackEmp.slice(0, 6).map((c) => c.id))

// ── ⑧ 本命牌：每张牌都能被某个日期取到，且不同日期分布合理 ──
const seenBirth = new Set()
for (let i = 0; i < 400; i += 1) {
  const d = new Date(2026, 0, 1)
  d.setDate(d.getDate() + i * 3)
  const iso = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
  const bc = C.birthCard(iso)
  if (bc && bc.id) seenBirth.add(bc.id)
}
// 本命牌按「年月日数位归约到 ≤21 再取大牌」，值域 1–21，天然到不了全部 22 张
ok('本命牌取到大阿卡纳且分布不止几种（' + seenBirth.size + ' 种）', seenBirth.size >= 8, seenBirth.size)
const allMajor = [...seenBirth].every((id) => id.startsWith('major-'))
ok('本命牌只会是大阿卡纳', allMajor)
ok('本命牌同日期稳定', (() => {
  const a = C.birthCard('1990-06-15'); const b = C.birthCard('1990-06-15')
  return a && b && a.id === b.id
})())

console.log('算法：通过 ' + pass + ' 项' + (bad.length ? '，失败 ' + bad.length + ' 项' : '，全绿'))
bad.slice(0, 25).forEach((b) => console.log('  ✗ ' + b))
process.exit(bad.length ? 1 : 0)
