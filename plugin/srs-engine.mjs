// Sorceress · 宿主确定性引擎（D 层）
//
// 把 client.template.js 里的纯算法在宿主侧重写一份，供注册的 agent 工具调用：
//   prng(mulberry32) / Fisher–Yates / meaningOf / 牌阵位义 / 组合结论 /
//   月相 / 逆行 / 星座 / 今日卡。
//
// 铁律：与客户端「同种子 → 同副顺序 → 同正逆 → 同判词」。
// 任何一处随机数调用顺序都不许改，否则历史重放（T9）和工具结果会对不上。
// 本文件零外部依赖，只用 node:fs 读内置 data/*.json，不联网、不写盘。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))

function readJson(name) {
  return JSON.parse(fs.readFileSync(path.join(HERE, 'data', name), 'utf-8'))
}

// ── 随机：mulberry32（kuitan 版，与 dsh-kuitan-tianji/engine/random.js 逐字一致）──
// 与旧版差异：状态初始值不是裸 `seed >>> 0`，而是把高 32 位与小数位一起折进状态，
// 避免「相差 2^32 的种子跑出同一串数」（拿毫秒时间戳当种子时，隔 49.7 天会撞）。
// 整数种子的低 32 位仍原样参与，所以 0…2^31 的种子行为与普通 mulberry32 一致。
export function prng(seed) {
  const n = Number(seed)
  const lo = n >>> 0
  const hi = Math.floor(Math.abs(n) / 4294967296) >>> 0
  const frac = Math.round((n - Math.trunc(n)) * 4294967296) >>> 0
  let a = (lo ^ Math.imul(hi + 1, 0x85ebca6b) ^ frac) >>> 0
  if (!a) a = 0x9e3779b9
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// 无偏随机种子（工具未显式给 seed 时用）。Node 18+ 有全局 crypto。
export function newSeed() {
  if (globalThis.crypto && typeof globalThis.crypto.getRandomValues === 'function') {
    const buf = new Uint32Array(1)
    globalThis.crypto.getRandomValues(buf)
    return buf[0] >>> 0
  }
  return (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0
}

// ── 位置在问什么：与客户端 POS_GUIDE 逐字一致 ────────────────────
export const POS_GUIDE = {
  three: {
    过去: '已经发生、还在牵着你的事',
    现在: '此刻真实的处境',
    未来: '按现在的走法会抵达的地方',
  },
  five: {
    现状: '眼下真实的地形与手上的资源',
    阻碍: '卡住进程、还没被命名的那个结',
    建议: '可以主动调整的方向与做法',
    结果: '按当前路径走下去的大致落点',
    潜在: '尚未浮出水面、却在暗中推动的部分',
  },
  relation: {
    你: '你在这段关系里的位置与状态',
    对方: '对方此刻的位置与状态',
    关系现状: '两个人之间正在发生的事',
    你的期待: '你嘴上没说、心里想要的那件事',
    对方的期待: '对方没说出口、在等的那件事',
    阻碍: '卡在两个人之间、谁都没先提的那层',
    走向: '维持现状会滑向的位置',
  },
  either: {
    现状: '做选择之前，先看清脚下站的是什么',
    'A 的发展': '选这一条，过程会怎么走',
    'A 的结果': '选这一条，最后停在哪里',
    'B 的发展': '选另一条，过程会怎么走',
    'B 的结果': '选另一条，最后停在哪里',
  },
  celtic: {
    现状: '你此刻站在哪里',
    阻碍: '横在路上的那个东西',
    根基: '这件事底下压着的远因',
    过去: '刚过去、还在起作用的那一段',
    目标: '你希望抵达的位置',
    未来: '不改的话会去的地方',
    自己: '你自己的姿态',
    环境: '别人和外部条件',
    期待与恐惧: '你最想要又最怕的那件事',
    结果: '合起来会落到哪里',
  },
}

export const THREE_LABEL = ['过去', '现在', '未来']
export const FIVE_LABEL = ['现状', '阻碍', '建议', '结果', '潜在']
export const RELATION_LABEL = ['你', '对方', '关系现状', '你的期待', '对方的期待', '阻碍', '走向']
export const EITHER_LABEL = ['现状', 'A 的发展', 'A 的结果', 'B 的发展', 'B 的结果']
export const CELTIC_LABEL = ['现状', '阻碍', '根基', '过去', '目标', '未来', '自己', '环境', '期待与恐惧', '结果']

export const SPREADS = {
  one: { label: '单张指引', want: 1, labels: ['当下指引'] },
  three: { label: '过去现在未来', want: 3, labels: THREE_LABEL },
  five: { label: '五张局势', want: 5, labels: FIVE_LABEL },
  relation: { label: '关系阵', want: 7, labels: RELATION_LABEL },
  celtic: { label: '凯尔特十字', want: 10, labels: CELTIC_LABEL },
  either: { label: '二选一', want: 5, labels: EITHER_LABEL },
}

// 牌阵选择器用的有序列表（客户端与工具共用同一份口径）
export const SPREAD_KEYS = ['one', 'three', 'five', 'relation', 'celtic', 'either']

// 询问方向（纯解读维度，不参与抽牌随机；与 kuitan index.js 的 direction 枚举逐字一致）
export const DIRECTIONS = ['general', 'wealth', 'career', 'love', 'health', 'study', 'travel']
export const DIRECTION_LABEL = {
  general: '综合', wealth: '财运', career: '事业', love: '感情',
  health: '健康', study: '学业', travel: '出行',
}
// 每个方向在富解读里要落到的落点句
export const DIRECTION_FOCUS = {
  general: '不限方向，先看整盘的走势与关节',
  wealth: '看钱的进与出、时机与风险的配比',
  career: '看位置、推力与接下来该主动的那一步',
  love: '看两个人之间的力与期待是否对得上',
  health: '看身心节律；具体病痛请找医生，牌只照状态',
  study: '看专注与方法的走向，别只看努力程度',
  travel: '看动身的时机与路上的变数',
}

// 位置读法 = （位置在问什么）+ 这一张在这个位置说的话
export function readAt(label, mode, item) {
  const guide = ((POS_GUIDE[mode] || {})[label]) || ''
  const line = (item && item.meaning && item.meaning.lines && item.meaning.lines[0]) || ''
  if (!guide) return line
  return '（' + guide + '）' + line
}

// 组合结论：与客户端 combineSpread 逐字一致（取第 1 句状态句 + 按位置组判断）
export function combineSpread(list, mode) {
  const first = (list[0] && list[0].meaning && (list[0].meaning.lines || [])[0]) || ''
  const at = (i) => (list[i] ? !list[i].reversed : null)
  let tail
  if (mode === 'celtic' && list.length >= 10) {
    const block = at(1)
    const goal = at(4)
    const result = at(9)
    const parts = []
    if (block === false) parts.push('阻碍位是逆的，挡你的那个东西正在松。')
    else if (block === true) parts.push('阻碍位是正的，那个东西还实在那儿。')
    if (goal === true) parts.push('目标位正着，方向你自己是清楚的。')
    else if (goal === false) parts.push('目标位逆着，你还没想好到底要哪个。')
    if (result === true) parts.push('结果位正，顺着现在的走法，路是通的。')
    else if (result === false) parts.push('结果位逆，按现在这样走会绕一下。')
    tail = parts.join('')
    if (!tail) tail = '十位一起看，别只盯一张。'
  } else if (mode === 'three' && list.length >= 3) {
    const past = at(0)
    const now = at(1)
    const fut = at(2)
    if (past === false && now === true) tail = '过去那一段是逆的、现在正着 —— 你已经在往外走了。'
    else if (past === true && now === false) tail = '过去顺、现在逆 —— 卡的不是从前，是眼前。'
    else if (now === true && fut === true) tail = '现在与未来都正，接着往前推一步。'
    else if (now === false && fut === false) tail = '现在和未来都逆，先把手上没结的收个尾。'
    else tail = '一顺一逆之间，差的是你下一步怎么走。'
  } else if (mode === 'five' && list.length >= 5) {
    const block = at(1)
    const advice = at(2)
    const result = at(3)
    const hidden = at(4)
    const parts = []
    if (block === true) parts.push('阻碍位正着，那个结还实实在在卡在那儿。')
    else if (block === false) parts.push('阻碍位逆着，挡路的东西正在松。')
    if (advice === true) parts.push('建议位正，牌给的做法可以直接试。')
    else if (advice === false) parts.push('建议位逆着，先别照字面做，换个方式再来。')
    if (result === true) parts.push('结果位正，顺着当前走法落点不差。')
    else if (result === false) parts.push('结果位逆，按现在这样走会绕一下。')
    if (hidden === false) parts.push('潜在位逆着，暗处那部分正在冒头，值得留意。')
    tail = parts.join('') || '五位一起看，重点在阻碍与建议这一对。'
  } else if (mode === 'relation' && list.length >= 7) {
    const you = at(0)
    const other = at(1)
    const block = at(5)
    const trend = at(6)
    const parts = []
    if (you === true && other === true) parts.push('两边都是正的，气场是对得上的。')
    else if (you === false && other === false) parts.push('两边都逆着，各自都有没收好的部分。')
    else if (you === true && other === false) parts.push('你这边是正的、对方逆着，推力主要在你。')
    else if (you === false && other === true) parts.push('对方正着、你这边逆着，先照顾自己的位置。')
    if (block === true) parts.push('阻碍位正着，那层窗户纸还没被戳破。')
    else if (block === false) parts.push('阻碍位逆着，卡着的东西正在化解。')
    if (trend === true) parts.push('走向位正，维持现在这样会往好的方向滑。')
    else if (trend === false) parts.push('走向位逆，维持现状会往下走，得主动调。')
    tail = parts.join('')
  } else if (mode === 'either' && list.length >= 5) {
    const aEnd = at(2)
    const bEnd = at(4)
    if (aEnd === true && bEnd === false) tail = 'A 的结果正、B 的结果逆 —— 这一次偏向 A。'
    else if (aEnd === false && bEnd === true) tail = 'B 的结果正、A 的结果逆 —— 这一次偏向 B。'
    else if (aEnd === true && bEnd === true) tail = '两条路的结果都正，差别在过程里你更愿意走哪一种。'
    else tail = '两条路的结果都偏逆，先别急着选，等一个更清楚的信号。'
  } else {
    tail = ''
  }
  return [first, tail].filter(Boolean).join(' ')
}

export function createEngine(dataDir = HERE) {
  const deck = JSON.parse(fs.readFileSync(path.join(dataDir, 'data', 'deck.json'), 'utf-8'))
  const tarot = JSON.parse(fs.readFileSync(path.join(dataDir, 'data', 'tarot.json'), 'utf-8'))
  const horo = JSON.parse(fs.readFileSync(path.join(dataDir, 'data', 'horoscope.json'), 'utf-8'))
  // 逐张富数据（core/element/astro/image，来自 dsh-kuitan-tianji 的 RWS 库）——
  // 只用于解读呈现，不参与抽牌；缺文件时优雅退化，抽牌照常。
  let rich = { cards: {} }
  try {
    rich = JSON.parse(fs.readFileSync(path.join(dataDir, 'data', 'tarot-rich.json'), 'utf-8'))
  } catch {
    rich = { cards: {} }
  }
  const cards = (deck.cards || []).slice()
  const richOf = (id) => (rich.cards && rich.cards[id]) || null

  // ── 判词合成：与客户端 meaningOf 逐字一致 ───────────────────────
  function meaningOf(deckCard, reversed) {
    const side = reversed ? 'rev' : 'up'
    if (!tarot) return { keywords: [], lines: ['牌义库没读到。'] }
    if (deckCard.kind === 'major') {
      const m = (tarot.major || {})[deckCard.id]
      if (!m) return { keywords: [], lines: ['这张的判词还没写。'] }
      return { keywords: m.keywords || [], lines: m[side] || [] }
    }
    const own = ((tarot.minor || {})[deckCard.id]) || null
    if (own) return { keywords: own.keywords || [], lines: own[side] || [] }
    // minorTemplate 兜底：minor 缺项时才走「数字 × 花色 × 建议」三层
    const tpl = tarot.minorTemplate || {}
    const rank = (tpl.ranks || {})[deckCard.rank] || {}
    const suit = (tpl.suits || {})[deckCard.suit] || {}
    const suitMeta = ((deck.suits) || []).find((s) => s.id === deckCard.suit) || {}
    const adviceArr = ((tpl.advice || {})[side]) || []
    const pick = rank[side] || ''
    const suitLine = suit[side] || ''
    const advice = adviceArr.length ? adviceArr[deckCard.number % adviceArr.length] : ''
    const lines = [pick, suitLine, advice].filter(Boolean)
    const keywords = [suitMeta.name_zh, suitMeta.element].filter(Boolean)
    return { keywords, lines }
  }

  // Fisher–Yates：返回洗牌后的牌库下标序列（与客户端 finishPick 同调用序）
  function shuffledOrder(seed) {
    const rnd = prng(seed)
    const order = cards.map((c, i) => i)
    for (let i = order.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rnd() * (i + 1))
      const tmp = order[i]
      order[i] = order[j]
      order[j] = tmp
    }
    return { rnd, order }
  }

  // 主入口：抽一个牌阵。start 固定 0（工具无交互点击，等价于点第 0 格连续落位）
  // ⚠ 抽牌算法铁律：先整副 Fisher–Yates 洗牌，再按序取前 want 张，每张一次 rnd()<0.5 定逆位。
  //   随机调用次数与顺序不许改，否则同 seed 复现全断。direction 只在抽完之后挂元数据。
  function drawSpread(spread, opts = {}) {
    const cfg = SPREADS[spread] || SPREADS.three
    const want = cfg.want
    const allowReversed = opts.reversed !== false
    const seed = Number.isInteger(opts.seed) ? (opts.seed >>> 0) : newSeed()
    const { rnd, order } = shuffledOrder(seed)
    const picks = []
    for (let k = 0; k < want; k += 1) {
      const card = cards[order[k % order.length]]
      const reversed = allowReversed ? rnd() < 0.5 : false
      const meaning = meaningOf(card, reversed)
      const position = cfg.labels[k] || ('第' + (k + 1) + '张')
      const r = richOf(card.id)
      picks.push({
        position,
        card: {
          id: card.id,
          name: card.name_zh,
          numeral: card.numeral,
          suit: card.suit,
          kind: card.kind,
          big: card.big,
          thumb: card.thumb,
        },
        reversed,
        orientation: reversed ? '逆位' : '正位',
        meaning,
        reading: readAt(position, spread, { meaning }),
        // 富数据（只读展示）：元素、占星、牌面图像、核心寓意；缺库时为空对象
        rich: r
          ? {
              en: r.en, element: r.element, planet: r.planet, sign: r.sign,
              sephira: r.sephira, decan: r.decan, image: r.image, core: r.core, astro: r.astro,
            }
          : null,
      })
    }
    const direction = DIRECTIONS.includes(opts.direction) ? opts.direction : 'general'
    return {
      spread,
      spread_label: cfg.label,
      question: String(opts.question || '').slice(0, 200),
      direction,
      direction_label: DIRECTION_LABEL[direction],
      seed,
      reversed_enabled: allowReversed,
      cards: picks,
      combine: spread === 'one' ? '' : combineSpread(picks, spread),
      at: new Date().toISOString(),
    }
  }

  // ── 每日一牌 / 每日一签：按本地日期确定性出，当天恒定、换日变 ──────
  function dayKey(d = new Date()) {
    const day = d instanceof Date ? d : new Date(d)
    return day.getFullYear() + '-' + (day.getMonth() + 1) + '-' + day.getDate()
  }

  // 每日一牌（单张，锁牌语义由 seed 含日期保证）
  function dailyCard(date = new Date()) {
    const dk = dayKey(date)
    const seed = strHash('srs-daily-card|' + dk + '|' + (deck.dataVersion || ''))
    const one = drawSpread('one', { seed, reversed: true })
    return { day: dk, ...one.cards[0], seed, combine: one.combine }
  }

  // 每日一签：一张牌的第一句 + 幸运色（与客户端 doDivine('daily') 同口径）
  function dailySign(date = new Date()) {
    const dk = dayKey(date)
    const seed = strHash('srs-daily-sign|' + dk + '|' + (deck.dataVersion || ''))
    const one = drawSpread('one', { seed, reversed: true })
    const p0 = one.cards[0]
    const colors = (horo.lucky || {}).colors || []
    const color = colors.length ? colors[strHash(p0.card.id) % colors.length] : null
    return {
      day: dk,
      card: { id: p0.card.id, name: p0.card.name, numeral: p0.card.numeral, orientation: p0.orientation },
      line: (p0.meaning.lines || [])[0] || '',
      color,
      seed,
    }
  }

  // ── 星座引擎：与客户端逐字一致 ─────────────────────────────────
  function strHash(str) {
    let h = 2166136261
    for (let i = 0; i < str.length; i += 1) {
      h ^= str.charCodeAt(i)
      h = Math.imul(h, 16777619)
    }
    return h >>> 0
  }

  const SYN = 29.530588853
  function moonInfo(date) {
    const ref = Date.UTC(2000, 0, 6, 18, 14) / 86400000
    const d = date.getTime() / 86400000 - ref
    const age = ((d % SYN) + SYN) % SYN
    const phaseIdx = Math.round((age / SYN) * 8) % 8
    const M = ((134.963 + 13.064993 * d) * Math.PI) / 180
    const L = 218.316 + 13.176396 * d + 6.289 * Math.sin(M)
    const lon = ((L % 360) + 360) % 360
    const moonSignIdx = Math.floor(lon / 30)
    return { phaseIdx, age, moonSignIdx }
  }

  const D2R = Math.PI / 180
  const PLANET_EL = {
    mercury: { a: 0.38709843, e: 0.20563661, i: 7.00559432, L: 252.25166724, peri: 77.45771895, node: 48.33961819, n: 4.09233445 },
    venus: { a: 0.72332102, e: 0.00676399, i: 3.39777545, L: 181.97970850, peri: 131.76755713, node: 76.67261496, n: 1.60213034 },
    mars: { a: 1.52371243, e: 0.09336511, i: 1.85181869, L: -4.56813164, peri: -23.91744784, node: 49.71320984, n: 0.52402068 },
    earth: { a: 1.00000018, e: 0.01673163, i: -0.00054346, L: 100.46691572, peri: 102.93005885, node: -5.11260389, n: 0.98560912 },
  }

  function helioXY(key, days) {
    const el = PLANET_EL[key]
    const M = ((((el.L + el.n * days - el.peri) % 360) + 360) % 360) * D2R
    let E = M
    for (let k = 0; k < 6; k += 1) {
      E -= (E - el.e * Math.sin(E) - M) / (1 - el.e * Math.cos(E))
    }
    const xp = el.a * (Math.cos(E) - el.e)
    const yp = el.a * Math.sqrt(1 - el.e * el.e) * Math.sin(E)
    const w = (el.peri - el.node) * D2R
    const om = el.node * D2R
    const inc = el.i * D2R
    return [
      xp * (Math.cos(w) * Math.cos(om) - Math.sin(w) * Math.sin(om) * Math.cos(inc))
        + yp * (-Math.sin(w) * Math.cos(om) - Math.cos(w) * Math.sin(om) * Math.cos(inc)),
      xp * (Math.cos(w) * Math.sin(om) + Math.sin(w) * Math.cos(om) * Math.cos(inc))
        + yp * (-Math.sin(w) * Math.sin(om) + Math.cos(w) * Math.cos(om) * Math.cos(inc)),
    ]
  }

  function geoLon(key, days) {
    const p = helioXY(key, days)
    const e = helioXY('earth', days)
    return Math.atan2(p[1] - e[1], p[0] - e[0]) / D2R
  }

  function retroGrade(date) {
    const days = (date || new Date()).getTime() / 86400000 + 2440587.5 - 2451545.0
    const out = {}
    for (const k of ['mercury', 'venus', 'mars']) {
      let dl = geoLon(k, days + 1) - geoLon(k, days)
      while (dl > 180) dl -= 360
      while (dl < -180) dl += 360
      out[k] = dl < 0
    }
    return out
  }

  function retroLine(retro) {
    const hit = []
    if (retro.mercury) hit.push('水星逆行：话容易说岔，重要的约定写下来')
    if (retro.venus) hit.push('金星逆行：旧人旧喜好回流，别急着回应')
    if (retro.mars) hit.push('火星逆行：劲儿提不上来，把目标拆小一点')
    return hit.length ? hit.join('；') : '今天没有行星逆行。'
  }

  const SIGN_STARTS = [
    ['aquarius', 1, 20], ['pisces', 2, 19], ['aries', 3, 21], ['taurus', 4, 20],
    ['gemini', 5, 21], ['cancer', 6, 22], ['leo', 7, 23], ['virgo', 8, 23],
    ['libra', 9, 23], ['scorpio', 10, 24], ['sagittarius', 11, 23], ['capricorn', 12, 22],
  ]

  function signOf(m, d) {
    if (!m || !d) return null
    const key = m * 100 + d
    let hit = null
    for (let i = 0; i < SIGN_STARTS.length; i += 1) {
      const row = SIGN_STARTS[i]
      if (key >= row[1] * 100 + row[2]) hit = row[0]
    }
    return hit || 'capricorn'
  }

  function signFromBirthday(birthday) {
    if (!birthday) return null
    const m = parseInt(String(birthday).slice(5, 7), 10)
    const d = parseInt(String(birthday).slice(8, 10), 10)
    if (!m || !d) return null
    return signOf(m, d)
  }

  // 今天的太阳星座（没给生日时的默认）
  function sunSignOf(date = new Date()) {
    return signOf(date.getMonth() + 1, date.getDate())
  }

  function todayCard(signId, date = new Date()) {
    if (!signId) return null
    const day = date instanceof Date ? date : new Date(date)
    const dk = dayKey(day)
    const seed = strHash(signId + '|' + dk + '|' + horo.dataVersion)
    const sign = (horo.signs || []).find((x) => x.id === signId)
    if (!sign) return null
    const core = (horo.core || {})[signId] || {}
    const tones = (horo.tone || {})[sign.element] || []
    const moon = moonInfo(day)
    const retro = retroGrade(day)
    const phase = (horo.phase || [])[moon.phaseIdx] || {}
    const moonSign = (horo.signs || [])[moon.moonSignIdx] || {}
    const domains = [
      ['事业', 'career'],
      ['感情', 'love'],
      ['财运', 'money'],
      ['身心', 'body'],
    ].map(([label, key], i) => ({
      label,
      key,
      text: core[key] || '',
      stars: 1 + ((seed >>> (3 + i * 2)) % 5),
    }))
    const doPool = (horo.advice || {}).do || []
    const avoidPool = (horo.advice || {}).avoid || []
    const pick2 = (pool, a, b) => {
      if (!pool.length) return []
      const i = a % pool.length
      let j = b % pool.length
      if (pool.length > 1 && j === i) j = (i + 1) % pool.length
      return pool.length === 1 ? [pool[i]] : [pool[i], pool[j]]
    }
    const colors = (horo.lucky || {}).colors || []
    const numbers = (horo.lucky || {}).numbers || []
    const slots = (horo.lucky || {}).slots || []
    return {
      day: dk,
      sign,
      seed,
      mood: tones.length ? tones[seed % tones.length] : '',
      astronomy: {
        phaseName: phase.name || '',
        phaseLine: phase.line || '',
        moonSign: moonSign.name || '',
        retro,
        retroLine: retroLine(retro),
      },
      domains,
      doIt: pick2(doPool, seed >>> 5, seed >>> 11),
      avoid: pick2(avoidPool, seed >>> 7, seed >>> 13),
      lucky: {
        color: colors.length ? colors[(seed >>> 9) % colors.length] : null,
        number: numbers.length ? numbers[seed % numbers.length] : null,
        slot: slots.length ? slots[(seed >>> 15) % slots.length] : '',
      },
      witchLine: ((horo.witch || [])[(seed >>> 17) % Math.max(1, (horo.witch || []).length)]) || '',
    }
  }

  return {
    dataVersion: { deck: deck.dataVersion, tarot: tarot.dataVersion, horo: horo.dataVersion },
    deck, tarot, horo, rich,
    meaningOf, drawSpread, dailyCard, dailySign, richReading,
    strHash, moonInfo, retroGrade, retroLine, signOf, signFromBirthday, sunSignOf, todayCard,
    dayKey,
  }
}

// ── 富解读（移植自 kuitan engine/tarot.js 的 tarotReading，6–8 段固定结构）──
// 输入是 drawSpread 的结果；每张牌用 card.rich（元素/占星/牌面/核心）+ meaning（三句判词）。
// 确定性：同样的 cards+direction 必得同样的段落，不引入任何随机。
const ELEMENT_ORDER = ['火', '水', '风', '土']
const ELEM_NAME = { 火: '热情与行动', 水: '情感与关系', 风: '思维与沟通', 土: '现实与资源' }
const ELEM_TIP = {
  火: '先做一件让自己动起来的小事，别等状态',
  水: '给情绪留出说话的时间，别急着讲道理',
  风: '把想法写下来再判断，别只在脑子里绕',
  土: '落成一个可执行的步骤，写明时间和预算',
}
const ELEM_WARN = {
  火: '容易过火，别把热情变成压人',
  水: '别被情绪淹没，先分清哪部分是自己的',
  风: '想得太多，记得回到事实和身体',
  土: '别太保守到错过窗口',
}
const COURT_NAMES = ['侍从', '骑士', '王后', '国王']

/** 富解读：返回段落数组（开场 / 逐张 / 结构 / 关键牌 / 建议 / 收尾） */
export function richReading(result) {
  const list = (result.cards || []).filter((c) => c && c.card)
  const n = list.length
  if (!n) return ['没有抽到牌面，无法解读。']
  const q = String(result.question || '').trim()
  const dir = result.direction && DIRECTION_LABEL[result.direction] ? result.direction : 'general'
  const dirLabel = DIRECTION_LABEL[dir]
  const dirFocus = DIRECTION_FOCUS[dir]
  const names = list.map((c) => c.card.name).join(' / ')
  const paras = []

  // ① 开场：所问 + 方向 + 象征系统声明
  const head = q ? `你问的是「${q}」` : '这次没有具体提问'
  paras.push(`${head}，方向落在「${dirLabel}」（${dirFocus}）。抽到的是 ${n} 张牌阵（${names}）。`
    + '塔罗是一套象征系统而不是判决：这里按 RWS（韦特）牌名与黄金黎明的元素对应来读，请把下面的话当作镜子，对照自己的处境取用。')

  // ② 逐张：位义 + 牌名/正逆 + 关键词 + 核心 + 元素占星
  //    1-3 张每张一段；≥4 张按前后两段分组（同 kuitan 口径：总段数落 6-8）
  const idx = list.map((_, i) => i)
  const groups = n <= 3 ? idx.map((i) => [i]) : [idx.slice(0, Math.ceil(n / 2)), idx.slice(Math.ceil(n / 2))]
  for (const group of groups) {
    const lines = group.map((i) => {
      const c = list[i]
      const r = c.rich || {}
      const kws = (c.meaning && c.meaning.keywords && c.meaning.keywords.length ? c.meaning.keywords : []).join('、')
      const core = r.core ? `它的核心是「${r.core}」。` : ''
      const img = r.image ? `牌面上${r.image}，` : ''
      const ast = r.astro ? `它对应的占星位置是${r.astro}，` : ''
      const el = r.element ? `${r.element}元素（${ELEM_NAME[r.element] || ''}）` : ''
      const oriNote = c.reversed
        ? '逆位并不等于凶，更像这股力量还没顺过来，或用力过了头'
        : '正位，这股力量目前是通的'
      const guide = (POS_GUIDE[result.spread] || {})[c.position] || ''
      const posHint = guide ? `（${guide}）` : ''
      return `${c.position}${posHint}是「${c.card.name}」${c.orientation}：${kws}。${img}${ast}${el ? `落在${el}，` : ''}${core}${oriNote}。`
    })
    paras.push(lines.join(''))
  }

  // ③ 结构分析：大牌占比、元素分布、宫廷牌、正逆比例
  const majorCount = list.filter((c) => c.card.kind === 'major').length
  const revCount = list.filter((c) => c.reversed).length
  const upCount = n - revCount
  const elementCount = {}
  for (const c of list) {
    const e = (c.rich && c.rich.element) || ''
    if (e) elementCount[e] = (elementCount[e] || 0) + 1
  }
  const present = ELEMENT_ORDER.filter((e) => elementCount[e])
  const missing = ELEMENT_ORDER.filter((e) => !elementCount[e])
  const dominant = present.slice().sort((a, b) => elementCount[b] - elementCount[a])[0]
  const heavy = dominant && elementCount[dominant] * 2 >= n
  const majorHalf = majorCount * 2 >= n
  const courtCount = list.filter((c) => COURT_NAMES.some((k) => c.card.name.endsWith(k))).length
  const pct = Math.round((majorCount / n) * 100)
  const distribution = present.map((e) => `${e}×${elementCount[e]}`).join('、')
  paras.push([
    `${n} 张里有 ${majorCount} 张大阿卡纳（占 ${pct}%），${majorHalf
      ? '达到或超过半数，说明这是「主题层面的大事」，牵动的多半是方向与阶段，而不是细节执行'
      : '不到半数，重点更偏日常层面的推进，先看具体的人与事'}。`,
    `元素分布：${distribution || '无'}（大牌按黄金黎明的元素归属计入，仅作象征参考）；${missing.length
      ? `缺${missing.map((e) => `${e}（${ELEM_NAME[e]}）`).join('、')}，这一块容易被忽略`
      : '四种元素都在，配比还算均衡'}${heavy ? `。${dominant}偏旺，这股力量用得过头会压住别的部分` : ''}。`,
    `宫廷牌 ${courtCount} 张，${courtCount
      ? '说明局面里有具体的人（也可能是你某个侧面的状态）在推动'
      : '没有明显人格化的角色，事情更靠情势本身在走'}；正逆位 ${upCount} 正 ${revCount} 逆，${upCount > revCount
      ? '整体偏顺，逆位那张是全盘的关节'
      : upCount === revCount ? '顺逆各半，正处在拉扯与转换中' : '阻力偏多，先把卡住的部分读透，再谈推进'}。`,
  ].join(''))

  // ④ 关键牌：第一张大阿卡纳；否则第一张逆位；否则第一张
  const majorCard = list.find((c) => c.card.kind === 'major')
  const revCard = list.find((c) => c.reversed)
  const key = majorCard || revCard || list[0]
  const keyReason = majorCard
    ? '它出现的地方，往往就是这件事真正被牵动的层级'
    : revCard
      ? '全盘没有大阿卡纳，关节就落在第一张逆位上——那股还没顺过来的力量'
      : '全盘既没有大阿卡纳也没有逆位，走势平顺，就以第一张为参照'
  const keyCore = (key.rich && key.rich.core) ? `，${key.rich.core}` : ''
  paras.push(`全盘的关节是「${key.card.name}」（${key.position}·${key.orientation}）${keyCore}。${keyReason}；其余几张可以看作它在不同位置上的回声。`)

  // ⑤ 建议：2-3 条可执行
  const tips = []
  if (revCard) tips.push(`先把「${revCard.card.name}」逆位指出的卡点处理掉（${(revCard.meaning && revCard.meaning.keywords || []).join('、')}），暂时不要加码推进`)
  if (majorHalf) tips.push('把问题从「怎么办」换成「要不要」：先定方向，方法再慢慢补')
  else tips.push('把注意力放回能立刻做的小事上，先动一件，再看牌面怎么变')
  if (missing.length) tips.push(`补一点${missing[0]}的力量：${ELEM_TIP[missing[0]]}`)
  else if (heavy) tips.push(`${dominant}已经偏旺，${ELEM_WARN[dominant]}`)
  const adviceCard = list.find((c) => c.position === '建议')
  if (adviceCard) tips.push(`把「${adviceCard.card.name}」${adviceCard.orientation}的关键词（${(adviceCard.meaning && adviceCard.meaning.keywords || []).join('、')}）当作接下来一周的小练习`)
  const picked = tips.slice(0, 3)
  paras.push(`建议：其一，${picked[0]}；其二，${picked[1]}${picked[2] ? `；其三，${picked[2]}` : ''}。`)

  // ⑥ 收尾：免责
  paras.push('牌是镜子，照出的是你此刻的状态与盲点，不是命运的判决书。涉及医疗、法律、财务等重大决定，请务必咨询对应的专业人士，牌面只用来帮你把问题问清楚。')

  return paras
}

// 短摘要：按段位确定性取（开场 + 关键牌段 + 建议段），供卡片折叠态用；
// 与富解读同源，展开前后是同一份数据，不另造文本。
export function readingSummary(result) {
  const paras = richReading(result)
  if (paras.length <= 3) return paras.join('\n\n')
  // paras[0]=开场，倒数第二=建议，倒数第一=免责；关键牌段在「结构」之后，用长度兜底取中间段
  const keyIdx = Math.max(1, paras.length - 3)
  return [paras[0], paras[keyIdx], paras[paras.length - 2]].filter(Boolean).join('\n\n')
}

// 把一次抽牌结果渲染成模型/对话可读的纯文本（D5 回注、工具 render 共用）
// 走 kuitan 富解读：6–8 段固定结构 + 种子凭证。
export function renderReadingText(result) {
  const lines = []
  const head = '【' + result.spread_label + '】'
    + (result.direction_label ? ' · ' + result.direction_label : '')
    + (result.question ? ' 所问：' + result.question : '')
  lines.push(head)
  const paras = richReading(result)
  for (const p of paras) lines.push(p)
  if (result.combine) lines.push('合起来看：' + result.combine)
  // 存档号便于核对；同时给出「怎么再看一次」的可执行路径
  lines.push('（存档号 ' + result.seed + ' · 想复现这一局：女巫面板 → 历史 → 重放）')
  return lines.join('\n\n')
}

export function renderHoroscopeText(card) {
  if (!card) return '星座参数看不懂，给一个 12 星座 id（如 libra）。'
  const lines = []
  lines.push('【' + card.sign.name + '座 · ' + card.day + '】')
  lines.push('今日基调：' + card.mood)
  lines.push('天象：' + card.astronomy.phaseName + '（' + card.astronomy.phaseLine + '）· 月亮在' + card.astronomy.moonSign + ' · ' + card.astronomy.retroLine)
  for (const d of card.domains) lines.push(d.label + ' ' + '★'.repeat(d.stars) + '☆'.repeat(5 - d.stars) + '：' + d.text)
  lines.push('宜：' + card.doIt.join(' / '))
  lines.push('忌：' + card.avoid.join(' / '))
  const lk = card.lucky
  lines.push('幸运：' + (lk.color ? lk.color[0] + '（' + lk.color[1] + '）' : '—') + ' · 数字 ' + (lk.number || '—') + ' · ' + (lk.slot || '—'))
  lines.push('一句：' + card.witchLine)
  return lines.join('\n')
}
