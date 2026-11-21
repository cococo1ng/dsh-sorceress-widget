/** 算法断言：从 client.template.js 抽出 Widget 之前的真实代码，在 Node 里跑。
 *  跑法：node tools/checks/algo_assert.mjs
 *  覆盖：随机/抽牌、牌义、本命牌、四柱、合婚、月相、逆行、星座、牌阵组合、
 *        周期日历、许愿瓶、回顾、穿搭、配置迁移、金额格式化。
 */
import fs from 'node:fs'
import path from 'node:path'

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
const ROOT = path.resolve(HERE, '..', '..')
const src = fs.readFileSync(path.join(ROOT, 'src', 'client.template.js'), 'utf8')
const readJson = (n) => JSON.parse(fs.readFileSync(path.join(ROOT, 'data', n), 'utf8'))

let fails = 0
const ok = (name, cond, extra) => {
  if (cond) console.log('✓ ' + name)
  else { fails += 1; console.log('✗ ' + name + (extra === undefined ? '' : '  → ' + JSON.stringify(extra))) }
}

// ── 抽取 Widget 之前的真实代码 ────────────────────────────────
const from = src.indexOf('factory(require) {')
const to = src.indexOf('function Widget() {')
if (from < 0 || to < 0) throw new Error('模板结构变了，找不到 factory / Widget')
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
  __DESIGN_TOKENS__: '{"colors":{},"fonts":[],"space":[]}',
}
for (const [k, v] of Object.entries(stubs)) region = region.split(k).join(v)

// 浏览器桩
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
  addEventListener() {},
  removeEventListener() {},
  getSelection: () => null,
  innerWidth: 1440,
  innerHeight: 900,
  Audio: class { constructor() {} },
  Image: class {},
  btoa: globalThis.btoa,
  atob: globalThis.atob,
}
globalThis.document = {
  body: { appendChild() {} },
  getElementById: () => null,
  createElement: () => ({ style: {}, appendChild() {}, setAttribute() {} }),
  querySelectorAll: () => [],
}
globalThis.Object.defineProperty(globalThis, 'localStorage', { value: globalThis.window.localStorage, configurable: true })

const expose = `
;globalThis.__M = { prng, meaningOf, birthCard, fourPillars, jieTime, sunLongitude,
  hepan, zhiPair, wxPair, wxCounts, strengthOf, moonInfo, moonDayKind, isNewMoonDay, isFullMoonDay,
  retroGrade, signOf, signFromBirthday, todayCard,
  strHash, combineSpread, readAt, cycleLenOf, cycleBled, cycleDayState, cycleCalendar, cycleInfo,
  cycleStrip, nextMoonDay, nextBirthdayDay, wishOpenDay, daysUntil, isoDay, localDayKey,
  richReading, readingSummary, reviewOf, wearPlan, detailLines, cardMeta, loadCfg, saveCfg,
  LINES, DEFAULT_CFG }
`
const requireStub = () => ({ createElement: () => null })
try {
  // eslint-disable-next-line no-new-func
  new Function('require', region + expose)(requireStub)
} catch (e) {
  console.error('抽取代码执行失败：' + e.message)
  process.exit(1)
}
const M = globalThis.__M
const { DECK, TAROT, HORO } = { DECK: readJson('deck.json'), TAROT: readJson('tarot.json'), HORO: readJson('horoscope.json') }
const cards = DECK.cards
const mk = (lines, reversed) => ({ meaning: { lines }, reversed })

// ── 1. PRNG / 抽牌 ─────────────────────────────────────────
{
  const a = M.prng(42); const b = M.prng(42)
  const va = [a(), a(), a()]; const vb = [b(), b(), b()]
  ok('同种子 PRNG 序列一致', JSON.stringify(va) === JSON.stringify(vb), va)
  ok('PRNG 输出在 [0,1)', va.every((v) => v >= 0 && v < 1), va)
  const c = M.prng(43)
  ok('不同种子序列不同', JSON.stringify([c(), c(), c()]) !== JSON.stringify(va))

  const d1 = M.prng(7); const d2 = M.prng(7)
  ok('同种子前三个数一致（抽牌可复现的前提）', [d1(), d1(), d1()].join() === [d2(), d2(), d2()].join())
  // 洗牌与「正逆」都只用 prng：这里直接验它的桶分布与 1/2 分割
  const bucket = new Array(78).fill(0)
  const r = M.prng(12345)
  let rev = 0
  for (let i = 0; i < 5000; i += 1) {
    bucket[Math.floor(r() * 78)] += 1
    if (r() < 0.5) rev += 1
  }
  const exp = 5000 / 78
  const mn = Math.min(...bucket); const mx = Math.max(...bucket)
  ok('prng 分 78 桶覆盖满', bucket.every((v) => v > 0), bucket.filter((v) => v === 0).length)
  ok('分桶不偏（' + mn + '–' + mx + '，期望 ' + exp.toFixed(1) + '）', mn > 20 && mx < 140, [mn, mx])
  ok('一半分割接近五五开（' + rev + '/5000）', rev > 2250 && rev < 2750, rev)
}

// ── 2. 牌义 ────────────────────────────────────────────────
{
  const up = M.meaningOf(cards.find((c) => c.id === 'major-00'), DECK, TAROT, false)
  const rev = M.meaningOf(cards.find((c) => c.id === 'major-00'), DECK, TAROT, true)
  ok('大阿卡纳正位 3 句', up.lines.length === 3 && up.lines.every((s) => s.trim()), up.lines)
  ok('大阿卡纳逆位 3 句且与正位不同', rev.lines.length === 3 && rev.lines.join() !== up.lines.join())
  const minor = M.meaningOf(cards.find((c) => c.id === 'wands-01'), DECK, TAROT, false)
  ok('小阿卡纳走逐张文案（3 句 + 关键词）', minor.lines.length === 3 && minor.keywords.length > 0, minor)
  const t2 = JSON.parse(JSON.stringify(TAROT)); delete t2.minor['wands-02']
  const fb = M.meaningOf(cards.find((c) => c.id === 'wands-02'), DECK, t2, true)
  ok('minor 缺项时退回三层合成且不为空', fb.lines.length >= 2 && fb.keywords.join('').includes('权杖'), fb)
  ok('牌义库缺条目时有兜底句', M.meaningOf({ id: 'major-99', kind: 'major' }, DECK, TAROT, false).lines[0].includes('还没写'))
}

// ── 3. 本命牌 ──────────────────────────────────────────────
{
  ok('1984-02-02 → 和 1988 → 8（力量）', M.birthCard('1984-02-02').number === 8, M.birthCard('1984-02-02'))
  ok('2000-01-01 → 4（皇帝）', M.birthCard('2000-01-01').number === 4)
  ok('2026-11-19 → 2056 → 13（死神）', M.birthCard('2026-11-19').number === 13)
  ok('坏生日返回 null', M.birthCard('abc') === null)
}

// ── 4. 四柱 ────────────────────────────────────────────────
{
  ok('日柱锚点 2000-01-01 = 戊午', M.fourPillars('2000-01-01').pillars[2] === '戊午')
  ok('日柱锚点 1900-01-01 = 甲戌', M.fourPillars('1900-01-01').pillars[2] === '甲戌', M.fourPillars('1900-01-01').pillars)
  ok('日柱锚点 1949-10-01 = 甲子', M.fourPillars('1949-10-01').pillars[2] === '甲子', M.fourPillars('1949-10-01').pillars)
  ok('年柱 1984 = 甲子', M.fourPillars('1984-06-01').pillars[0] === '甲子')
  ok('年柱 2026 = 丙午', M.fourPillars('2026-06-01').pillars[0] === '丙午')
  ok('立春前（1/1）年柱用前一年 = 乙巳', M.fourPillars('2026-01-01').pillars[0] === '乙巳')
  ok('立春后（2/5）年柱 = 丙午', M.fourPillars('2026-02-05').pillars[0] === '丙午')
  ok('时柱五鼠遁：甲日 00:30 = 甲子', M.fourPillars('1949-10-01', '00:30').pillars[3] === '甲子', M.fourPillars('1949-10-01', '00:30').pillars)
  ok('时柱午时：甲日 12:00 = 庚午', M.fourPillars('1949-10-01', '12:00').pillars[3] === '庚午')
  const late = M.fourPillars('1949-10-01', '23:30')
  const next = M.fourPillars('1949-10-02', '00:30')
  ok('晚子时日柱 = 次日（乙丑）', late.pillars[2] === '乙丑' && late.pillars[2] === next.pillars[2], [late.pillars[2], next.pillars[2]])
  ok('晚子时时柱按次日日干起（丙子）', late.pillars[3] === '丙子', late.pillars[3])
  ok('无时刻只有三柱', M.fourPillars('2000-01-01').pillars.length === 3)
  ok('坏生日返回 null', M.fourPillars('nope') === null)

  // 十二月节：都在当月 3–10 号之间，且逐月递增
  let mono = true
  for (let m = 0; m < 11; m += 1) if (M.jieTime(2026, m) >= M.jieTime(2026, m + 1)) mono = false
  ok('十二节的时刻逐月递增', mono)
  let dayOk = true
  for (let m = 0; m < 12; m += 1) {
    const d = new Date(M.jieTime(2026, m) + 8 * 3600 * 1000).getUTCDate()
    if (d < 3 || d > 10) dayOk = false
  }
  ok('十二节都落在当月 3–10 号（北京时）', dayOk)
  ok('月柱：小寒后（1/10）建丑', M.fourPillars('2026-01-10').pillars[1].slice(-1) === '丑', M.fourPillars('2026-01-10').pillars[1])
  ok('月柱：大雪后（12/10）建子', M.fourPillars('2025-12-10').pillars[1].slice(-1) === '子', M.fourPillars('2025-12-10').pillars[1])
  ok('月柱：立春后（2/10）建寅', M.fourPillars('2026-02-10').pillars[1].slice(-1) === '寅')
}

// ── 5. 合婚 ────────────────────────────────────────────────
{
  ok('六合：子丑', M.zhiPair('子', '丑').note === '六合')
  ok('三合：申子', M.zhiPair('申', '子').note === '三合')
  ok('相冲：子午', M.zhiPair('子', '午').delta === -10)
  ok('相刑：寅巳', M.zhiPair('寅', '巳').note === '相刑')
  ok('相害：子未', M.zhiPair('子', '未').note === '相害')
  ok('五行：木生火 +10', M.wxPair('木', '火').delta === 10)
  ok('五行：木克土 -8', M.wxPair('木', '土').delta === -8)
  const pm = M.fourPillars('1990-05-05'); const pf = M.fourPillars('1992-08-08')
  const h = M.hepan(pm, pf)
  ok('合婚：分数在 0–100', h.score >= 0 && h.score <= 100, h.score)
  ok('合婚：三个维度', h.items.length === 3 && h.items.map((x) => x.name).join('/') === '日主/夫妻宫/五行互补', h.items.map((x) => x.name))
  ok('合婚：明细层有四项', Array.isArray(h.detail) && h.detail.length === 4, h.detail && h.detail.length)
  ok('合婚：三条建议', h.tips.length === 3)
  ok('合婚：档位是四个之一', ['契合度较高', '中等偏顺', '需要磨合', '差异较大'].includes(h.level), h.level)
  // 分数 = ((三个维度之和 + 27) / 83) × 100，四舍五入后夹在 0–100
  ok('合婚：分项之和能推出分数', (() => {
    const raw = h.items.reduce((s, x) => s + x.delta, 0)
    const want = Math.max(0, Math.min(100, Math.round(((raw + 27) / 83) * 100)))
    return Math.abs(want - h.score) <= 1
  })(), h.score)
  ok('合婚：吉凶计数存在', h.tally && typeof h.tally.good === 'number' && typeof h.tally.bad === 'number', h.tally)
  // 日主双向平均 → 交换双方，三个维度都不变
  ok('合婚：交换双方维度不变', (() => {
    const sw = M.hepan(pf, pm)
    return sw.items[0].delta === h.items[0].delta && sw.items[1].delta === h.items[1].delta
  })())
  const wx = M.wxCounts(pm)
  ok('五行计数：三柱 6 个 / 四柱 8 个', [6, 8].includes(Object.values(wx).reduce((a, b) => a + b, 0)), wx)
}

// ── 6. 月相 / 逆行 / 星座 ─────────────────────────────────
{
  const nm = new Date('2000-01-06T18:14:00Z')
  ok('月相锚点 2000-01-06 18:14Z ≈ 新月（age≈0）', M.moonInfo(nm).age < 0.05 || M.moonInfo(nm).age > 29.4, M.moonInfo(nm).age)
  const fm = new Date('2024-04-23T23:49:00Z')
  ok('2024-04-23 满月 age ≈ 14.77', Math.abs(M.moonInfo(fm).age - 14.765) < 0.6, M.moonInfo(fm).age)
  ok('满月相位号 = 4', M.moonInfo(fm).phaseIdx === 4, M.moonInfo(fm).phaseIdx)
  const eclipse = new Date('2024-04-08T18:21:00Z')
  ok('2024-04-08 日食（新月）age ≈ 0', M.moonInfo(eclipse).age < 0.4 || M.moonInfo(eclipse).age > 29.1, M.moonInfo(eclipse).age)

  // W5：朔望判定必须能在真实工厂作用域里被调用（曾经因 SYN 是函数局部常量而整块崩掉）
  ok('moonDayKind 可调用且新月锚点判对', M.moonDayKind(nm) === 'newmoon', M.moonDayKind(nm))
  ok('moonDayKind 满月锚点判对', M.moonDayKind(fm) === 'fullmoon', M.moonDayKind(fm))
  ok('isNewMoonDay / isFullMoonDay 与 moonDayKind 同口径',
    M.isNewMoonDay(nm) === true && M.isFullMoonDay(fm) === true, [M.isNewMoonDay(nm), M.isFullMoonDay(fm)])
  ok('nextMoonDay 给的日子本身要命中同一判定',
    M.moonDayKind(new Date(M.nextMoonDay('newmoon') + 'T12:00:00')) === 'newmoon')

  ok('水逆 2024-04-10 = 是', M.retroGrade(new Date('2024-04-10T00:00:00Z')).mercury === true)
  ok('水星 2024-01-15 = 否', M.retroGrade(new Date('2024-01-15T00:00:00Z')).mercury === false)
  ok('火星逆行 2024-12-20 = 是', M.retroGrade(new Date('2024-12-20T00:00:00Z')).mars === true)
  ok('火星 2024-06-01 = 否', M.retroGrade(new Date('2024-06-01T00:00:00Z')).mars === false)
  ok('金星逆行 2025-03-20 = 是', M.retroGrade(new Date('2025-03-20T00:00:00Z')).venus === true)
  ok('金星 2024-06-01 = 否', M.retroGrade(new Date('2024-06-01T00:00:00Z')).venus === false)

  const cases = [[1, 19, 'capricorn'], [1, 20, 'aquarius'], [2, 18, 'aquarius'], [2, 19, 'pisces'],
    [3, 20, 'pisces'], [3, 21, 'aries'], [6, 21, 'gemini'], [6, 22, 'cancer'],
    [12, 21, 'sagittarius'], [12, 22, 'capricorn'], [11, 22, 'scorpio'], [11, 23, 'sagittarius']]
  ok('星座边界 12 例全对', cases.every(([m, d, s]) => M.signOf(m, d) === s), cases.map(([m, d, s]) => [m + '/' + d, M.signOf(m, d), s]))
  ok('signFromBirthday 取月日', M.signFromBirthday('1990-08-08') === 'leo')

  const c1 = M.todayCard('aries', HORO, new Date(2026, 10, 19))
  const c2 = M.todayCard('aries', HORO, new Date(2026, 10, 19))
  ok('同一天同星座，运势稳定', JSON.stringify(c1) === JSON.stringify(c2))
  const c3 = M.todayCard('pisces', HORO, new Date(2026, 10, 19))
  ok('换星座至少两项不同', ['mood', 'doIt', 'stars', 'witch'].filter((k) => JSON.stringify(c1[k]) !== JSON.stringify(c3[k])).length >= 2)
  ok('四维星级都在 1–5', c1.domains.every((d) => d.stars >= 1 && d.stars <= 5), c1.domains.map((d) => d.stars))
  ok('宜忌各两条且不重复', c1.doIt.length === 2 && c1.doIt[0] !== c1.doIt[1] && c1.avoid.length === 2 && c1.avoid[0] !== c1.avoid[1])
  ok('幸运色是 [名字, hex]', Array.isArray(c1.color) && /^#[0-9A-Fa-f]{6}$/.test(c1.color[1]), c1.color)
}

// ── 7. 牌阵组合 / 位置读法 ─────────────────────────────────
{
  const up3 = [mk(['a1', 'a2'], false), mk(['b1'], false), mk(['c1'], false)]
  const rev3 = [mk(['a1'], true), mk(['b1'], true), mk(['c1'], true)]
  // 三张走「现在与未来」分支（先判 past/now，再判 now/fut）
  ok('三张全正 → 现在与未来都正', M.combineSpread(up3, 'three').includes('现在与未来都正'), M.combineSpread(up3, 'three'))
  ok('三张全逆 → 现在和未来都逆', M.combineSpread(rev3, 'three').includes('现在和未来都逆'), M.combineSpread(rev3, 'three'))
  ok('三张组合必带首张第 1 句', M.combineSpread(up3, 'three').startsWith('a1'))
  const ten = Array.from({ length: 10 }, (_, i) => mk(['t' + i, 'x'], false))
  const c10 = M.combineSpread(ten, 'celtic')
  ok('十张全正 → 阻碍/目标/结果三句都在', c10.includes('阻碍位是正的') && c10.includes('目标位正着') && c10.includes('结果位正'), c10)
  const tenRev = ten.map((x, i) => (i === 9 ? mk(['t9'], true) : x))
  ok('十张结果位逆 → 结果位逆着', M.combineSpread(tenRev, 'celtic').includes('结果位逆'))
  // 现状提醒：three / celtic 之外的张数不再出组合结论，只留首句（0.55.5 清掉三条不可达尾巴）
  const deadFallback = M.combineSpread(up3, 'three').includes('三张全是正位') || M.combineSpread(ten, 'celtic').includes('十位里正的居多')
  ok('组合结论不再落到「数正逆」的兜底尾巴（说明主分支生效）', !deadFallback)
  ok('非 three/celtic 调用只回首句', M.combineSpread([mk(['only'], false)], 'one') === 'only')
  ok('readAt 带位置引导', M.readAt('过去', 'three', mk(['内容句'], false)).startsWith('（已经发生、还在牵着你的事）'))
  ok('readAt 未知位置只回原句', M.readAt('不存在', 'three', mk(['内容句'], false)) === '内容句')
}

// ── 8. 周期日历 / 许愿瓶 / 回顾 / 穿搭 / 双人 ───────────────
{
  ok('cycleLenOf：0 当未设 → 28', M.cycleLenOf(0) === 28)
  ok('cycleLenOf：-5 → 1', M.cycleLenOf(-5) === 1)
  ok('cycleLenOf：200 → 60', M.cycleLenOf(200) === 60)
  ok('cycleBled：28 → 6', M.cycleBled(28) === 6)
  ok('cycleBled：1 → 3', M.cycleBled(1) === 3)
  ok('cycleBled：60 → 7', M.cycleBled(60) === 7)

  const today = new Date()
  const at = (n) => {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + n)
    return d.getTime()
  }
  const starts = [at(-10)]
  ok('周期第 1–6 天是经期', [0, 1, 5].every((n) => M.cycleDayState(at(-10 + n), starts, 28) === 'period'))
  ok('第 7 天回到安全期', M.cycleDayState(at(-10 + 6), starts, 28) === 'safe')
  ok('第 14 天是排卵日', M.cycleDayState(at(-10 + 14), starts, 28) === 'ovu')
  ok('第 10 天落在易孕窗口', M.cycleDayState(at(-10 + 10), starts, 28) === 'fertile')
  ok('第 20 天进入黄体期', M.cycleDayState(at(-10 + 20), starts, 28) === 'luteal')

  const cal = M.cycleCalendar([{ start: '2026-11-03' }], 28, 2026, 10)
  ok('月历格子是 7 的倍数', cal.cells.length % 7 === 0, cal.cells.length)
  ok('2026-11 有 30 天', cal.cells.filter((c) => c.d).length === 30)
  ok('2026-11-01 是周日 → 前面空 6 格', cal.cells.slice(0, 6).every((c) => c.state === 'blank') && cal.cells[6].d === 1, cal.cells.slice(0, 7).map((c) => c.d))
  ok('11/3 标成经期', cal.cells.find((c) => c.d === 3).state === 'period')

  const ci = M.cycleInfo([{ start: M.isoDay(new Date(Date.now() - 5 * 86400000)) }], 28)
  ok('周期信息：第 6 天', ci.dayNo === 6, ci.dayNo)
  // 起点是 5 天前的 00:00，下次 = 起点 + 28 天 = 今天 00:00 + 23 天；从「现在」算 ceil 出来是 23
  ok('周期信息：还有 23 天', ci.toNext === 23, ci.toNext)

  const nmDay = M.nextMoonDay('newmoon')
  const nmAge = M.moonInfo(new Date(nmDay + 'T12:00:00')).age
  ok('下个新月日 age≈0', nmAge < 0.7 || nmAge > 28.9, nmAge)
  const fmDay = M.nextMoonDay('fullmoon')
  const fmAge = M.moonInfo(new Date(fmDay + 'T12:00:00')).age
  ok('下个满月日 age≈14.77', Math.abs(fmAge - 14.765) < 0.9, fmAge)

  const nb = M.nextBirthdayDay('1990-03-15')
  const expectYear = (new Date()).getTime() > new Date(new Date().getFullYear(), 2, 15).getTime() ? new Date().getFullYear() + 1 : new Date().getFullYear()
  ok('下个生日跨年正确', nb === expectYear + '-03-15', [nb, expectYear])
  ok('生日没填返回 null', M.nextBirthdayDay('') === null)

  ok('许愿 30 天 = 今天+30', M.wishOpenDay('d30') === M.isoDay(new Date(Date.now() + 30 * 86400000)))
  ok('daysUntil 今天 = 0', M.daysUntil(M.isoDay()) === 0)
  ok('daysUntil 明天 = 1', M.daysUntil(M.isoDay(new Date(Date.now() + 86400000))) === 1)

  const now = Date.now()
  const hist = [
    { t: now, id: 'major-00', name: '愚者', reversed: false, spread: 'one' },
    { t: now - 1000, id: 'major-00', name: '愚者', reversed: true, spread: 'three' },
    { t: now - 2000, id: 'major-00', name: '愚者', reversed: false, spread: 'three' },
    { t: now - 200 * 86400000, id: 'major-01', name: '魔术师', reversed: false, spread: 'one' },
  ]
  const rv = M.reviewOf(hist, new Date())
  ok('回顾：本月 3 次', rv.monthTotal === 3, rv.monthTotal)
  ok('回顾：最常出现是愚者 3 次', rv.monthTop[0].id === 'major-00' && rv.monthTop[0].n === 3, rv.monthTop)
  ok('回顾：近 90 天 ≥3 次命中愚者', rv.recent.some((x) => x.id === 'major-00' && x.n === 3), rv.recent)
  ok('回顾：牌阵分布 one/three 都有', rv.spreads.one === 1 && rv.spreads.three === 2, rv.spreads)

  const c = M.todayCard('aries', HORO, new Date())
  const w = M.wearPlan(c, HORO)
  ok('穿搭 1–3 项且主色=幸运色', w.length >= 1 && w.length <= 3 && w[0].name === c.color[0], w.map((x) => x.name))
}

// ── 9. 配置迁移 ────────────────────────────────────────────
{
  store.clear()
  const d = M.loadCfg()
  ok('空存储 → 默认（scale 1.0 / talk normal）', d.scale === 1.0 && d.talk === 'normal', [d.scale, d.talk])
  store.set('srs.cfg.v1', '{bad json')
  ok('坏 JSON → 默认', M.loadCfg().scale === 1.0)
  store.set('srs.cfg.v1', JSON.stringify({ sound: true, bubble: false, soundVol: 40, bubbleMs: 9000 }))
  const m = M.loadCfg()
  ok('老布尔 sound 迁成对象', m.sound.on === true && m.sound.volume === 40, m.sound)
  ok('老布尔 bubble 迁成对象', m.bubble.on === false && m.bubble.holdSec === 9, m.bubble)
  store.set('srs.cfg.v1', JSON.stringify({ remind: { on: true, hh: 99, mm: -3 }, bill: { warnLow: -5, budget: 999999 } }))
  const r = M.loadCfg()
  ok('提醒时间越界收回 21:00', r.remind.hh === 21 && r.remind.mm === 0, r.remind)
  ok('告急线越界收回 5，预算越界收回 10', r.bill.warnLow === 5 && r.bill.budget === 10, r.bill)
  const next = Object.assign({}, d, { scale: 1.3 })
  M.saveCfg(next)
  ok('保存后读回一致', JSON.parse(store.get('srs.cfg.v1')).scale === 1.3)

  // 0.58.0：出厂默认锁死在这一套，别被无意改回旧值
  const D = M.DEFAULT_CFG
  ok('出厂默认：音效开', D.sound.on === true)
  ok('出厂默认：环境音景开、音量 60、四路未选', D.amb.on === true && D.amb.volume === 60
    && Object.values(D.amb.tracks).every((v) => v === false), D.amb)
  ok('出厂默认：每日提醒开且 21:00', D.remind.on === true && D.remind.hh === 21 && D.remind.mm === 0, D.remind)
  ok('出厂默认：月相提醒开', D.remind.moon === true)
  ok('出厂默认：告急线 5 / 今日预算 10', D.bill.warnLow === 5 && D.bill.budget === 10, D.bill)
}

// ── 10. 金额格式（组件内工具）──────────────────────────────
{
  const grabConstArrow = (name) => {
    const i = src.indexOf('const ' + name + ' = ')
    if (i < 0) return null
    let j = src.indexOf('=>', i)
    let depth = 0; let q = ''
    for (let k = j; k < src.length; k += 1) {
      const ch = src[k]
      if (q) { if (ch === '\\') k += 1; else if (ch === q) q = ''; continue }
      if (ch === '"' || ch === "'" || ch === '`') { q = ch; continue }
      if (ch === '{' || ch === '(') depth += 1
      if (ch === '}' || ch === ')') { depth -= 1; if (depth === 0 && ch === '}') { j = k + 1; break } }
      if (ch === ';' && depth === 0) { j = k; break }
    }
    return src.slice(i, j).replace(/^const \w+ = /, '')
  }
  const mt = grabConstArrow('moneyTiny')
  // eslint-disable-next-line no-new-func
  const moneyTiny = new Function('return (' + mt + ')')()
  ok('moneyTiny 0 → ¥0.00', moneyTiny(0) === '¥0.00')
  ok('moneyTiny 0.0034 → ¥0.0034', moneyTiny(0.0034) === '¥0.0034')
  ok('moneyTiny 0.5 → ¥0.500', moneyTiny(0.5) === '¥0.500')
  ok('moneyTiny 2 → ¥2.00', moneyTiny(2) === '¥2.00')
}

console.log(fails ? '\n✗ ' + fails + ' 项没过' : '\n算法断言全绿')
process.exit(fails ? 1 : 0)
