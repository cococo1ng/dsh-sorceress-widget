// Sorceress · agent 工具注册（D1 / D2 / D7）
//
// 三个工具都用「裸工具定义」交给 ctx.tools.register（与 dsh-subagent 结构化工具同款形状：
// name / description / parameters / output{schema,render} / execute），不 import 宿主包，
// 沙箱与真实 ESM 两种装载方式都能跑。结果经 output.render 进对话工具卡（D5 回注）。
//
// 算法全部来自 srs-engine.mjs，与挂件客户端同种子同结果。
import {
  createEngine, renderReadingText, renderHoroscopeText, readingSummary,
  SPREAD_KEYS, SPREADS, DIRECTIONS, DIRECTION_LABEL,
} from './srs-engine.mjs'

const SPREAD_ENUM = SPREAD_KEYS

function textRender(text) {
  return [{ type: 'text', text: String(text) }]
}

// 输出 schema 用宽松 object + 业务字段，render 负责给模型/用户可读文本
const READING_SCHEMA = {
  type: 'object',
  additionalProperties: true,
  properties: {
    spread: { type: 'string' },
    spread_label: { type: 'string' },
    question: { type: 'string' },
    direction: { type: 'string' },
    direction_label: { type: 'string' },
    seed: { type: 'integer' },
    cards: { type: 'array', items: { type: 'object', additionalProperties: true } },
    combine: { type: 'string' },
    text: { type: 'string' },
    summary: { type: 'string' },
  },
  required: ['spread', 'seed', 'cards', 'text'],
}

const SIGN_SCHEMA = {
  type: 'object',
  additionalProperties: true,
  properties: {
    day: { type: 'string' },
    sign: { type: 'object', additionalProperties: true },
    domains: { type: 'array', items: { type: 'object', additionalProperties: true } },
    text: { type: 'string' },
  },
  required: ['day', 'text'],
}

const DAILY_SCHEMA = {
  type: 'object',
  additionalProperties: true,
  properties: {
    day: { type: 'string' },
    kind: { type: 'string' },
    card: { type: 'object', additionalProperties: true },
    line: { type: 'string' },
    text: { type: 'string' },
  },
  required: ['day', 'kind', 'text'],
}

function asDate(value) {
  if (!value) return new Date()
  const d = new Date(value)
  return Number.isFinite(d.getTime()) ? d : new Date()
}

export function registerSorceressTools(ctx) {
  if (!ctx || typeof ctx.tools !== 'object' || typeof ctx.tools.register !== 'function') return []
  const engine = createEngine()
  const disposers = []

  // ── D1：sorceress_draw —— agent 帮用户抽牌 ─────────────────────
  disposers.push(ctx.tools.register({
    name: 'sorceress_draw',
    description: '让 Sorceress 女巫抽一组塔罗牌并给出按牌阵位置组织的中文解读。用于用户说「帮我抽塔罗/抽牌/算一卦/看看这件事」时。'
      + 'spread 选 one（1 张·单张指引）、three（3 张·过去现在未来，默认）、five（5 张·五张局势）、relation（7 张·关系阵）、celtic（10 张·凯尔特十字）、either（5 张·二选一 A/B）。'
      + 'direction 可选 general/wealth/career/love/health/study/travel（综合/财运/事业/感情/健康/学业/出行），只影响解读侧重，不改变抽到的牌。'
      + '同一颗 seed 必然复现同一副牌与正逆位；不传 seed 则随机出一颗并在结果里回显。'
      + '返回每张牌的牌位、正逆位、关键词、元素/占星、三句判词，以及富解读全文与短摘要。塔罗是自省工具，不预测具体日期、不下医疗/法律/投资断言。',
    parameters: {
      spread: {
        type: 'string',
        enum: SPREAD_ENUM,
        description: '牌阵：one=单张指引 / three=过去现在未来 / five=五张局势 / relation=关系阵(7) / celtic=凯尔特十字(10) / either=二选一(5)。',
      },
      direction: {
        type: 'string',
        enum: DIRECTIONS,
        description: '询问方向：general 综合（默认）/ wealth 财运 / career 事业 / love 感情 / health 健康 / study 学业 / travel 出行。只影响解读侧重，不改变牌面。',
      },
      question: {
        type: 'string',
        description: '用户所问之事，原样带进解读开头。多张牌阵（three/five/relation/celtic/either）必填，'
          + '空着会被拒；one（单张指引）可留空。先用一句话问清，别拿空问题抽 7 张、10 张。',
      },
      seed: {
        type: 'integer',
        description: '随机种子（0~4294967295 无符号整数）。要复现某一副牌时传同一颗；省略则随机。',
      },
      reversed: {
        type: 'boolean',
        description: '是否允许逆位，默认 true。新手或要求全正位时传 false。',
      },
    },
    output: {
      schema: READING_SCHEMA,
      render: (_args, value) => textRender(value.text),
    },
    async execute(args) {
      const spread = SPREAD_ENUM.includes(args.spread) ? args.spread : 'three'
      // 与客户端同一口径：单张不强制，多张牌阵必须有「所问」。
      // 空问题抽 7 张、10 张，解读只能泛泛而谈，等于白抽。
      const q = String(args.question || '').trim()
      if (spread !== 'one' && !q) {
        throw new Error('sorceress_draw：' + spread + ' 牌阵需要 question（用户所问之事）。'
          + '先问清「想问什么」再抽；若只是随手看一眼，用 spread=one 单张指引。')
      }
      const opts = { question: q.slice(0, 200) }
      if (Number.isInteger(args.seed)) opts.seed = args.seed >>> 0
      if (args.reversed === false) opts.reversed = false
      if (DIRECTIONS.includes(args.direction)) opts.direction = args.direction
      const result = engine.drawSpread(spread, opts)
      return Object.assign({}, result, {
        text: renderReadingText(result),
        summary: readingSummary(result),
      })
    },
  }))

  // ── D2：sorceress_daily —— 读今日已锁的牌 / 每日一签 ───────────
  disposers.push(ctx.tools.register({
    name: 'sorceress_daily',
    description: '取 Sorceress 的「今日」内容：当天恒定、次日自动更换。kind=card（默认）给每日一牌（单张，含正逆与三句判词），'
      + 'kind=sign 给每日一签（一句话 + 幸运色）。用于「今天的牌/今日运势/每日一签」。日期由本地时区决定，可传 date 覆盖（YYYY-MM-DD）。',
    parameters: {
      kind: {
        type: 'string',
        enum: ['card', 'sign'],
        description: 'card=每日一牌（默认），sign=每日一签。',
      },
      date: {
        type: 'string',
        description: '可选日期 YYYY-MM-DD，省略=今天。',
      },
    },
    output: {
      schema: DAILY_SCHEMA,
      render: (_args, value) => textRender(value.text),
    },
    async execute(args) {
      const date = asDate(args.date)
      const kind = args.kind === 'sign' ? 'sign' : 'card'
      if (kind === 'sign') {
        const s = engine.dailySign(date)
        return {
          day: s.day, kind, line: s.line, color: s.color, seed: s.seed,
          card: s.card,
          text: '【每日一签 · ' + s.day + '】\n' + s.card.name + '（' + s.card.orientation + '）\n'
            + s.line + '\n幸运色：' + (s.color ? s.color[0] : '—'),
        }
      }
      const c = engine.dailyCard(date)
      return {
        day: c.day, kind, card: c.card, reversed: c.reversed, orientation: c.orientation,
        keywords: c.meaning.keywords, lines: c.meaning.lines, seed: c.seed,
        text: '【每日一牌 · ' + c.day + '】\n' + c.card.name + '（' + c.card.numeral + '·' + c.orientation + '）\n'
          + (c.meaning.lines || []).map((l) => '· ' + l).join('\n'),
      }
    },
  }))

  // ── D7 / N6：sorceress_horoscope —— 今日星座运势 ───────────────
  disposers.push(ctx.tools.register({
    name: 'sorceress_horoscope',
    description: '取某星座今天的运势卡：真实月相/月亮星座/水金火逆行（本地低精度开普勒轨道自算）+ 事业感情财运身心四维星级 + 宜忌 + 幸运色/数字/时段 + 一句女巫提醒。'
      + 'sign 传星座 id（aries 白羊/taurus 金牛/gemini 双子/cancer 巨蟹/leo 狮子/virgo 处女/libra 天秤/scorpio 天蝎/sagittarius 射手/capricorn 摩羯/aquarius 水瓶/pisces 双鱼）；'
      + '省略则按今天的太阳星座。可传 date（YYYY-MM-DD）。同一天同一星座结果恒定。',
    parameters: {
      sign: {
        type: 'string',
        enum: ['aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo', 'libra', 'scorpio', 'sagittarius', 'capricorn', 'aquarius', 'pisces'],
        description: '星座 id；省略=今天的太阳星座。',
      },
      date: {
        type: 'string',
        description: '可选日期 YYYY-MM-DD，省略=今天。',
      },
    },
    output: {
      schema: SIGN_SCHEMA,
      render: (_args, value) => textRender(value.text),
    },
    async execute(args) {
      const date = asDate(args.date)
      const signId = args.sign || engine.sunSignOf(date)
      const card = engine.todayCard(signId, date)
      if (!card) {
        return { day: engine.dayKey(date), sign: null, domains: [], text: '星座 id 看不懂，给一个 12 星座 id（如 libra）。' }
      }
      return Object.assign({}, card, { text: renderHoroscopeText(card) })
    },
  }))

  return disposers
}
