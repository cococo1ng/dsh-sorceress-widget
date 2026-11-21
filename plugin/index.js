/**
 * Sorceress · 塔罗挂件 —— Host 半身（骨架 v0.1）
 *
 * 只做三件事：
 *   ① /srs/ping.json     —— 自检：版本、姿态数、牌数
 *   ② /srs/deck.json     —— 78 张牌的牌序 / 花色 / 横幅编号映射
 *   ③ /srs/cards/...     —— 一条前缀路由发 78×2 张牌面与牌背（immutable 缓存）
 *
 * 硬约束（立项书 §5，2026-11-17 计费改造后按现状修订）：只做自身相对路由；
 * 外网只出一处 —— 计费用余额接口（宿主代发，key 不出宿主）；
 * 磁盘只写一处 —— DSH_HOME 下的用量账本 `.srs-usage.json`（明细 / 逐日 / 归档）；
 * 不调外部进程，路径一律从 fileURLToPath(import.meta.url) 推，代码里不出现盘符。
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { registerSorceressTools } from './srs-tools.mjs'

const PLUGIN_DIR = path.dirname(fileURLToPath(import.meta.url))
const CARDS_DIR = path.join(PLUGIN_DIR, 'assets', 'cards')
const DECK_FILE = path.join(PLUGIN_DIR, 'data', 'deck.json')
const TAROT_FILE = path.join(PLUGIN_DIR, 'data', 'tarot.json')

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
}

// 只允许这两种形态的牌面路径，别的一律 404（挡目录穿越）
const CARD_RE = /^(?:big|thumb)\/[a-z]+-\d{2}\.webp$|^back\.webp$/

// 环境音景（W19）：4 个白名单名，其余一律 404
const SFX_DIR = path.join(PLUGIN_DIR, 'assets', 'sfx')
const AMB_SET = new Set(['amb-rain', 'amb-fire', 'amb-wind', 'amb-pages',
  'amb-night', 'amb-sea', 'amb-storm', 'amb-birds'])

// ── 计费：读凭据 → 官方余额接口；失败再退到宿主账号服务 ──────────────
const BALANCE_URL = 'https://api.deepseek.com/user/balance'

function balanceUrl() {
  const base = String(process.env.DEEPSEEK_BASE_URL || '').trim()
  if (!base) return BALANCE_URL
  try { return new URL(base).origin + '/user/balance' } catch (error) { return BALANCE_URL }
}

function numOrNull(v) {
  const n = typeof v === 'number' ? v : parseFloat(v)
  return Number.isFinite(n) ? n : null
}

async function balanceFromApiKey(creds) {
  if (!creds || typeof creds.resolve !== 'function') return { ok: false, code: 'NO_CREDS', error: '凭据服务不可用' }
  let cred = null
  try { cred = await creds.resolve('DEEPSEEK_API_KEY') } catch (error) { return { ok: false, code: 'CRED_ERROR', error: '读凭据失败' } }
  const key = cred && cred.value ? String(cred.value) : ''
  if (!key) return { ok: false, code: 'NO_KEY', error: '没有 API Key' }
  try {
    const res = await fetch(balanceUrl(), {
      headers: { Authorization: 'Bearer ' + key },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return { ok: false, code: 'HTTP', error: '余额接口返回 ' + res.status, status: res.status }
    const data = await res.json()
    if (data && data.is_available === false) return { ok: false, code: 'UNAVAILABLE', error: '账户当前不可用' }
    const infos = Array.isArray(data && data.balance_infos) ? data.balance_infos : []
    const info = infos.find((i) => String(i && i.currency).toUpperCase() === 'CNY') || infos[0]
    if (!info) return { ok: false, code: 'EMPTY', error: '余额信息为空' }
    const total = numOrNull(info.total_balance)
    if (total === null) return { ok: false, code: 'SHAPE', error: '余额字段看不懂' }
    return {
      ok: true,
      balance: total,
      recharge: numOrNull(info.topped_up_balance),
      bonus: numOrNull(info.granted_balance),
      currency: String(info.currency || 'CNY').toUpperCase(),
      source: 'api-key',
      at: Date.now(),
    }
  } catch (error) {
    const timedOut = !!(error && (error.name === 'TimeoutError' || error.name === 'AbortError'))
    return { ok: false, code: timedOut ? 'TIMEOUT' : 'NETWORK', error: timedOut ? '余额接口超时' : '余额接口连不上' }
  }
}

async function balanceFromAccount(account) {
  if (!account || typeof account.getBalance !== 'function') return { ok: false, code: 'NO_ACCOUNT', error: '宿主没有账号服务' }
  try {
    const result = await account.getBalance({
      version: String(process.env.DSH_CLIENT_VERSION || 'unknown'),
      locale: String(process.env.DSH_LOCALE || 'zh_CN'),
      timezoneOffsetSeconds: -new Date().getTimezoneOffset() * 60,
    })
    if (!result || result.status !== 'ready') return { ok: false, code: 'NOT_READY', error: '账号余额未就绪' }
    const wallets = Array.isArray(result.wallets) ? result.wallets : []
    const pick = wallets.find((w) => String(w && w.currency).toUpperCase() === 'CNY') || wallets[0]
    const total = pick ? numOrNull(pick.balance != null ? pick.balance : pick.total_balance) : null
    if (total === null) return { ok: false, code: 'SHAPE', error: '余额字段看不懂' }
    return { ok: true, balance: total, currency: String(pick.currency || 'CNY').toUpperCase(), source: 'account', at: Date.now() }
  } catch (error) {
    return { ok: false, code: 'ACCOUNT_ERR', error: '账号余额读取失败' }
  }
}

// ── 计费账本（口径同青云剑仙 v4.x）────────────────────────────────
// 为什么不再用「余额快照差」：快照会串进别的客户端、漏掉窗口，而且看不出钱花在哪。
// 现在按 DSH 的 session/event 逐轮聚合真实 usage，按官方价目表算钱；余额只作对照。
const DSH_HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const USAGE_FILE = path.join(DSH_HOME, '.srs-usage.json')
const ARCHIVE_FILE = path.join(DSH_HOME, '.srs-usage-archive.json')
const MAX_TURNS = 500          // 明细最多留多少条（再多写盘太频繁）
const TURN_KEEP_DAYS = 90      // 明细保留天数
const DAILY_KEEP_DAYS = 365    // 逐日汇总保留天数
const ARCHIVE_MAX = 20000      // 归档上限

const pad2 = (n) => String(n).padStart(2, '0')

// 北京时间：不依赖宿主时区，账本跨天、峰谷判定都用它
function bjNow(ms) {
  const d = new Date((ms === undefined ? Date.now() : ms) + 8 * 3600 * 1000)
  return {
    day: d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate()),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    dow: d.getUTCDay(), // 0 = 周日
    minutes: d.getUTCHours() * 60 + d.getUTCMinutes(),
  }
}

// 峰谷：工作日 9:00–12:00、14:00–18:00 高峰，其余空闲；周末与法定节假日全天谷价（官方口径）
const PEAK_WINDOWS = [[9 * 60, 12 * 60], [14 * 60, 18 * 60]]

// 法定节假日按谷价。写成「区间 + 出处」，补下一年只动这张表和下面的年份常量。
// 来源：国务院办公厅《关于2026年部分节假日安排的通知》国办发明电〔2025〕7号
const HOLIDAY_RANGES = [
  ['2026-01-01', '2026-01-03'], // 元旦
  ['2026-02-15', '2026-02-23'], // 春节
  ['2026-04-04', '2026-04-06'], // 清明
  ['2026-05-01', '2026-05-05'], // 劳动节
  ['2026-06-19', '2026-06-21'], // 端午
  ['2026-09-25', '2026-09-27'], // 中秋
  ['2026-10-01', '2026-10-07'], // 国庆
]
// 放假表覆盖到哪一年（含）。不能靠"表里有没有这一天"判断：只补一条元旦就会误判通过。
const HOLIDAY_TABLE_THROUGH_YEAR = 2026

function expandHolidayRanges(ranges) {
  const set = new Set()
  const DAY = 24 * 60 * 60 * 1000
  for (const [from, to] of ranges) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(from)) || !/^\d{4}-\d{2}-\d{2}$/.test(String(to))) continue
    const start = Date.parse(from + 'T00:00:00Z')
    const end = Date.parse(to + 'T00:00:00Z')
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) continue
    // 非法日期（如 2027-02-30 会被 Date 滚到 03-02）直接跳过，不把不存在的日子变成假日
    if (new Date(start).toISOString().slice(0, 10) !== from) continue
    if (new Date(end).toISOString().slice(0, 10) !== to) continue
    for (let t = start; t <= end; t += DAY) set.add(new Date(t).toISOString().slice(0, 10))
  }
  return set
}

const PEAK_HOLIDAYS = expandHolidayRanges(HOLIDAY_RANGES)

// 当前年份是否已被放假表覆盖（覆盖不到 → 节假日会被当工作日算，界面要说一声）
export function hasHolidayCoverage(ms) {
  const year = new Date((ms === undefined ? Date.now() : ms) + 8 * 3600 * 1000).getUTCFullYear()
  return year <= HOLIDAY_TABLE_THROUGH_YEAR
}

function isPeakAt(dow, minutes, day) {
  if (dow === 0 || dow === 6) return false            // 周末全天谷价
  if (day && PEAK_HOLIDAYS.has(day)) return false     // 法定节假日全天谷价
  return PEAK_WINDOWS.some(([a, b]) => minutes >= a && minutes < b)
}

// 峰谷状态 + 下一次切换：逐日扫描状态变化点，不靠边界数组猜
function peakState(ms) {
  const base = ms === undefined ? Date.now() : ms
  const t = bjNow(base)
  const nowMin = t.minutes
  const peak = isPeakAt(t.dow, nowMin, t.day)
  const BOUNDS = [0, 9 * 60, 12 * 60, 14 * 60, 18 * 60]
  let nextAt = null
  let nextPeak = !peak
  for (let d = 0; d <= 8 && nextAt === null; d += 1) {
    const dow = (t.dow + d) % 7
    const day = bjNow(base + d * 86400000).day
    for (const b of BOUNDS) {
      const abs = d * 1440 + b
      if (abs <= nowMin) continue
      if (isPeakAt(dow, b, day) !== peak) { nextAt = abs; nextPeak = !peak; break }
    }
  }
  if (nextAt === null) nextAt = nowMin + 1440
  return {
    peak,
    label: peak ? '高峰价' : '谷价',
    next: nextPeak ? '高峰价' : '谷价',
    nextInMs: (nextAt - nowMin) * 60000,
    window: (t.dow === 0 || t.dow === 6) ? '周末全天谷价' : (peak ? '工作日高峰 9–12 / 14–18' : '工作日空闲'),
  }
}

// 价目（元 / 百万 token），数组是 [谷价, 高峰价]。只收表里明确有价的模型：
// 查不到就只记 token、不记钱（宁可显示「未计价」，也不猜一个价）。
const PRICE_TABLE = {
  'deepseek-flash': { hit: [0.02, 0.04], miss: [1, 2], out: [4, 8] },
  'deepseek-v4-pro': { hit: [0.15, 0.3], miss: [4.5, 9.0], out: [13.5, 27.0] },
}
const MODEL_ALIASES = {
  'deepseek-v4-flash': 'deepseek-flash',
  'deepseek-v4-flash-vision-exp': 'deepseek-flash',
}
// 官方路由不标尾巴；第三方网关挂着同名模型时标 "模型 @路由"，同一模型不同入口金额分得开
const OFFICIAL_PROVIDERS = ['deepseek-official', 'deepseek-account']

function canonicalModel(model) {
  const id = String(model || '').trim().toLowerCase()
  return MODEL_ALIASES[id] || id
}

export function priceFor(model) {
  return PRICE_TABLE[canonicalModel(model)] || null
}

function providerTag(provider) {
  const p = String(provider || '').trim()
  if (!p) return ''
  return OFFICIAL_PROVIDERS.indexOf(p.toLowerCase()) >= 0 ? '' : ' @' + p
}

function addMoney(a, b) { return Math.round((a + b) * 1e8) / 1e8 }

function readJson(file, fallback) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (parsed && typeof parsed === 'object') return parsed
  } catch (error) { /* 文件不存在或坏：用默认值 */ }
  return fallback
}

function writeJson(file, value) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    const tmp = file + '.tmp'
    fs.writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8')
    fs.renameSync(tmp, file)
    return true
  } catch (error) { return false }
}

function emptyLedger() {
  return {
    version: 1,
    date: bjNow().day,
    todayUsed: 0, todayTurns: 0, todayTokens: 0, todayUnpriced: 0, todayByModel: {},
    turns: [], daily: {}, turnSeq: 0,
    startBalance: null, lastBalance: null, todayUsedByBalance: 0,
    // 今天这笔账从什么时候开始记：插件是中午才装的，官方后台是 00:00 起，
    // 不标起点就会让人以为账本少算了（差的那段正是装插件之前的消费）
    sinceTs: null,
  }
}

// 跨天：把昨日今日数搬进 daily，再清零。只在真的跨天时改，不做无谓写盘。
function rollLedger(led) {
  const today = bjNow().day
  if (!led.date) led.date = today
  if (led.date === today) return false
  const day = led.date
  const used = Number(led.todayUsed) || 0
  const turns = Number(led.todayTurns) || 0
  if (used || turns) {
    led.daily = led.daily || {}
    const cur = led.daily[day] || { used: 0, turns: 0, tokens: 0, byModel: {} }
    cur.used = addMoney(Number(cur.used) || 0, used)
    cur.turns = Number(cur.turns || 0) + turns
    cur.tokens = Number(cur.tokens || 0) + (Number(led.todayTokens) || 0)
    const bm = led.todayByModel && typeof led.todayByModel === 'object' ? led.todayByModel : {}
    cur.byModel = cur.byModel || {}
    for (const k of Object.keys(bm)) {
      const v = bm[k] || {}
      const row = cur.byModel[k] || { amount: 0, turns: 0, tokens: 0 }
      row.amount = addMoney(Number(row.amount) || 0, Number(v.amount) || 0)
      row.turns = Number(row.turns || 0) + (Number(v.turns) || 0)
      row.tokens = Number(row.tokens || 0) + (Number(v.tokens) || 0)
      cur.byModel[k] = row
    }
    led.daily[day] = cur
  }
  // 逐日汇总按天数裁：太老的直接丢（明细本来也只留 90 天）
  const days = Object.keys(led.daily || {}).sort()
  if (days.length > DAILY_KEEP_DAYS) {
    for (const d of days.slice(0, days.length - DAILY_KEEP_DAYS)) delete led.daily[d]
  }
  led.date = today
  led.sinceTs = null            // 新一天重新记起点
  // 跨天后「余额差」要从这一刻重新起算：startBalance 不重置的话，
  // 明天的 todayUsedByBalance 会把今天的扣款一起算进来（只作对照用，但对照也得对得上）
  if (typeof led.lastBalance === 'number') led.startBalance = led.lastBalance
  led.todayUsedByBalance = 0
  led.todayUsed = 0
  led.todayTurns = 0
  led.todayTokens = 0
  led.todayUnpriced = 0
  led.todayByModel = {}
  return true
}

function readLedger() {
  const raw = readJson(USAGE_FILE, null) || {}
  const led = Object.assign(emptyLedger(), raw)
  // 老账本 / 手改坏的字段：按类型兜一遍，别让 NaN 顺着算下去
  led.turns = Array.isArray(led.turns) ? led.turns : []
  led.daily = led.daily && typeof led.daily === 'object' ? led.daily : {}
  led.todayByModel = led.todayByModel && typeof led.todayByModel === 'object' ? led.todayByModel : {}
  led.todayUsed = Number(led.todayUsed) || 0
  led.todayTurns = Number(led.todayTurns) || 0
  led.todayTokens = Number(led.todayTokens) || 0
  led.todayUnpriced = Number(led.todayUnpriced) || 0
  led.turnSeq = Number(led.turnSeq) || 0
  rollLedger(led)
  return led
}

function writeLedger(led) { return writeJson(USAGE_FILE, led) }

// 被挤出的明细进归档（自己留一份，别直接丢）
function pushArchive(list) {
  try {
    const cur = readJson(ARCHIVE_FILE, null)
    const turns = cur && Array.isArray(cur.turns) ? cur.turns : []
    for (const t of list) if (t && Number.isFinite(Number(t.ts))) turns.push(t)
    turns.sort((a, b) => Number(a.ts) - Number(b.ts))
    const cut = turns.length > ARCHIVE_MAX ? turns.length - ARCHIVE_MAX : 0
    writeJson(ARCHIVE_FILE, { version: 1, turns: cut ? turns.slice(cut) : turns, updatedAt: new Date().toISOString() })
  } catch (error) { /* 归档失败不影响记账 */ }
}

function archiveCount() {
  const cur = readJson(ARCHIVE_FILE, null)
  return cur && Array.isArray(cur.turns) ? cur.turns.length : 0
}

// —— 每轮消耗：按 (session, turn) 聚合 assistant/message 上的真实 usage ——
const turnAggs = new Map()
// 会话标题：session/title 事件里带，只活在内存；落账时把标题快照进那条明细
const sessionTitles = new Map()
let lastTurn = { seq: 0, turn: null, amount: null, tokens: null, model: null, ts: null }

// —— 提问 / 授权挂起 + 忙碌态（账本之外的第二类「现在发生什么」，来源对齐青云剑仙）——
// 事件契约：提问 = tool/call(name=ask_user_question)，tool/result 解除；
// 授权 = approval/asked，之后任何 approval/* 解除；turn/start、turn/end 兜底清空
// （兜底很重要：挂起期间那一轮正卡着，不会有别的 tool/result，但异常中断时不能把气泡挂死）
const waitState = { pending: null }
let runningAgents = 0
let busySince = 0

// —— D3 会话情绪态 + D5 女巫工具留痕（只活内存，前端经 live.json 3 秒轮询取）——
// mood：开工 working / 收工 done / 报错 error，挂件据此换姿势、冒一句；同态不重复吵
const moodState = { kind: null, ts: 0, detail: '' }
// 最近一次 sorceress_* 工具调用：挂件看到 seq 变大就翻牌/笑一下（D5 面板联动）
let srsToolState = { seq: 0, name: '', ts: 0, spread: '', cards: 0, ok: false }

function markMood(kind, detail = '') {
  moodState.kind = kind
  moodState.ts = Date.now()
  moodState.detail = String(detail || '').slice(0, 120)
}

function restoreLastTurn(saved) {
  const list = saved && Array.isArray(saved.turns) ? saved.turns : []
  const last = list.length ? list[list.length - 1] : null
  if (!last || !Number.isFinite(Number(last.ts))) return null
  if (bjNow(Number(last.ts)).day !== bjNow().day) return null   // 不拿昨天的冒充今天
  const amount = last.amount === null || last.amount === undefined ? null : Number(last.amount)
  return {
    seq: Number(saved.turnSeq) || 0,
    turn: Number.isFinite(Number(last.turn)) ? Number(last.turn) : null,
    amount: Number.isFinite(amount) ? amount : null,
    unpriced: Number(last.unpriced) || 0,
    tokens: Number.isFinite(Number(last.tokens)) ? Number(last.tokens) : null,
    model: last.model || null,
    ts: Number(last.ts),
  }
}

{
  const saved = readJson(USAGE_FILE, {})
  if (saved && Number.isFinite(Number(saved.turnSeq))) lastTurn.seq = Number(saved.turnSeq)
  const fromSaved = restoreLastTurn(saved)
  if (fromSaved) lastTurn = fromSaved
}

function rollLiveInto(led) {
  // 进行中没走到 turn/end 的一轮：账本不动（按轮结算），但面板要能看到它在涨
  let turns = 0
  let cost = 0
  let tokens = 0
  let unpriced = 0
  for (const agg of turnAggs.values()) {
    if (!agg) continue
    turns += 1
    cost = addMoney(cost, Number(agg.cost) || 0)
    tokens += Number(agg.tokens) || 0
    unpriced += Number(agg.unpriced) || 0
  }
  return { turns, cost, tokens, unpriced }
}

function finalizeTurn(sessionId) {
  const agg = turnAggs.get(sessionId)
  if (!agg) return
  turnAggs.delete(sessionId)
  if (!agg.tokens && !agg.cost) return
  const unpriced = Number(agg.unpriced) || 0
  lastTurn = {
    seq: lastTurn.seq + 1,
    turn: agg.turn,
    // 未计价给 null：显示「未计价」而不是 ¥0.00（0 会被当成"这轮免费"）
    amount: agg.cost > 0 ? agg.cost : (unpriced ? null : 0),
    unpriced,
    tokens: agg.tokens,
    model: agg.model || null,
    ts: Date.now(),
  }
  const led = readLedger()
  led.todayUsed = addMoney(Number(led.todayUsed) || 0, agg.cost)
  led.todayTurns = Number(led.todayTurns || 0) + 1
  led.todayTokens = Number(led.todayTokens || 0) + Number(agg.tokens || 0)
  if (unpriced) led.todayUnpriced = Number(led.todayUnpriced || 0) + unpriced
  const mkey = (agg.model || '未知模型') + providerTag(agg.provider)
  const mrow = led.todayByModel[mkey] || { amount: 0, turns: 0, tokens: 0 }
  led.todayByModel[mkey] = {
    amount: addMoney(Number(mrow.amount) || 0, agg.cost),
    turns: Number(mrow.turns || 0) + 1,
    tokens: Number(mrow.tokens || 0) + Number(agg.tokens || 0),
  }
  led.turns.push({
    ts: lastTurn.ts,
    turn: agg.turn,
    amount: agg.cost,
    tokens: agg.tokens,
    model: agg.model || null,
    sid: String(sessionId || ''),
    ...(sessionTitles.get(String(sessionId || '')) ? { name: sessionTitles.get(String(sessionId || '')) } : {}),
    ...(agg.provider ? { provider: agg.provider } : {}),
    ...(unpriced ? { unpriced } : {}),
  })
  // 明细保留：90 天 + MAX_TURNS 条，挤出去的进归档
  const cutoff = Date.now() - TURN_KEEP_DAYS * 86400000
  const keep = []
  const dropped = []
  for (const t of led.turns) {
    if (!t || !Number.isFinite(Number(t.ts)) || Number(t.ts) < cutoff) dropped.push(t)
    else keep.push(t)
  }
  const over = keep.length - MAX_TURNS
  if (over > 0) dropped.push(...keep.splice(0, over))
  if (dropped.length) pushArchive(dropped)
  led.turns = keep
  led.turnSeq = lastTurn.seq
  if (!led.sinceTs) led.sinceTs = lastTurn.ts   // 今天这笔账的起点 = 本轮结算时刻
  writeLedger(led)
}

function callIdOf(d) {
  if (!d) return ''
  const pick = (v) => (v === undefined || v === null ? '' : String(v))
  const direct = pick(d.callId || d.toolCallId || d.tool_call_id || d.id)
  if (direct) return direct
  const msg = d.message
  if (msg && typeof msg === 'object') return pick(msg.callId || msg.toolCallId || msg.tool_call_id)
  return ''
}

function noteWaitEvent(sid, type, d) {
  try {
    if (type === 'turn/start' || type === 'turn/end') { waitState.pending = null; return }
    if (type === 'tool/call' && String(d.name || d.toolName || '') === 'ask_user_question') {
      waitState.pending = { kind: 'question', id: callIdOf(d) || ('q' + Date.now()), ts: Date.now(), session: sid }
      return
    }
    if (type === 'tool/result') {
      if (waitState.pending && waitState.pending.kind === 'question') {
        const cid = callIdOf(d)
        if (!cid || cid === waitState.pending.id) waitState.pending = null
      }
      return
    }
    if (type === 'approval/asked') {
      waitState.pending = { kind: 'approval', id: String(d.id || ('a' + Date.now())), ts: Date.now(), session: sid }
      return
    }
    if (type.indexOf('approval/') === 0) {
      if (waitState.pending && waitState.pending.kind === 'approval') {
        const id2 = String(d.id || '')
        if (!id2 || id2 === waitState.pending.id) waitState.pending = null
      }
    }
  } catch (error) { /* 提醒失败绝不能影响宿主 */ }
}

function handleBillingEvent(session, event) {
  try {
    const sid = session && session.id ? String(session.id) : 'default'
    const type = String((event && event.type) || '')
    const d = event && event.data
    if (!d || typeof d !== 'object') return
    // 提问 / 授权 / 轮次边界：与记账共用同一条事件流，先记挂起态再算钱
    noteWaitEvent(sid, type, d)
    // D5：女巫三工具被调用 / 出结果 → 记一笔，前端 live 轮询看到 seq 变大就有反应。
    // 并进这条唯一的 session/event 监听，不再单挂一条（单槽 mock 与早期宿主更稳）。
    if (type === 'tool/call' && typeof d.name === 'string' && d.name.indexOf('sorceress_') === 0) {
      let spread = ''
      try {
        const args = typeof d.arguments === 'string' ? JSON.parse(d.arguments) : d.arguments
        spread = String((args && args.spread) || (d.name === 'sorceress_horoscope' ? 'horoscope' : 'daily'))
      } catch (error) { /* 坏参数不影响留痕 */ }
      srsToolState = { seq: srsToolState.seq + 1, name: d.name, ts: Date.now(), spread, cards: 0, ok: false }
    } else if (type === 'tool/result') {
      const nm = String(d.name || d.toolName || (d.message && d.message.name) || '')
      if (nm.indexOf('sorceress_') === 0) {
        const isErr = !!(d.error || (d.message && d.message.isError))
        srsToolState = Object.assign({}, srsToolState, { ts: Date.now(), ok: !isErr })
        if (isErr) markMood('error', nm + ' 没跑成')
      }
      if (d.error) markMood('error', String((d.error && d.error.code) || '工具出错'))   // D3：任意工具报错她皱眉
    }
    // 会话标题：只作按会话统计的显示名，不进账
    if (type === 'session/title') {
      const t = String(d.title === undefined ? '' : d.title).trim()
      if (t) sessionTitles.set(sid, t.slice(0, 60))
      return
    }
    if (type === 'turn/end') { finalizeTurn(sid); return }
    // 压缩摘要同样是真调用、真扣钱，以前只认 assistant/message 会漏账
    const isMsg = type === 'assistant/message'
    const isCompact = type === 'compaction/summary'
    if (!isMsg && !isCompact) return
    const usage = d.usage
    if (!usage || typeof usage !== 'object') return
    const turn = isMsg ? Number(d.turn) : null
    if (isMsg && !Number.isFinite(turn)) return
    let agg = turnAggs.get(sid)
    if (isMsg && (!agg || agg.turn !== turn)) {
      if (agg) finalizeTurn(sid)
      agg = { turn, tokens: 0, cost: 0, model: '', provider: '' }
      turnAggs.set(sid, agg)
    } else if (!agg) {
      // 轮首压缩：摘要先于本轮任何 assistant/message 到达，单开一个槽先把钱记上
      agg = { turn: null, tokens: 0, cost: 0, model: '', provider: '' }
      turnAggs.set(sid, agg)
    }
    const input = Number(usage.inputTokens) || 0
    const cached = Number(usage.cacheReadTokens) || 0
    const cacheWrite = Number(usage.cacheWriteTokens) || 0   // 缓存写入也要计（按未命中价）
    const output = Number(usage.outputTokens) || 0           // 已含 reasoning
    const source = isMsg ? ((d.message && d.message.source) || {}) : { model: d.model, provider: d.provider }
    const model = source.model || ''
    const provider = source.provider || source.route || ''
    const price = priceFor(model)
    agg.tokens += input + cached + cacheWrite + output
    if (model) agg.model = model
    if (provider) agg.provider = provider
    if (!price) { agg.unpriced = (agg.unpriced || 0) + 1; return }   // 价表没有：只记 token
    const off = peakState(Date.now()).peak ? 1 : 0
    const cost = (cached / 1e6) * price.hit[off]
      + ((input + cacheWrite) / 1e6) * price.miss[off]
      + (output / 1e6) * price.out[off]
    agg.cost = addMoney(agg.cost, cost)
  } catch (error) { /* 账目出问题不能影响宿主 */ }
}

function dayOfTs(ts) {
  const t = Number(ts)
  return Number.isFinite(t) ? bjNow(t).day : ''
}

function turnsByDay(led) {
  const out = new Map()
  for (const t of (led.turns || [])) {
    const d = dayOfTs(t && t.ts)
    if (!d) continue
    const cur = out.get(d) || { used: 0, turns: 0, tokens: 0, byModel: {} }
    cur.used = addMoney(cur.used, Number(t.amount) || 0)
    cur.turns += 1
    cur.tokens += Number(t.tokens) || 0
    const mk = String(t.model || '未知模型')
    const row = cur.byModel[mk] || { amount: 0, turns: 0, tokens: 0 }
    row.amount = addMoney(row.amount, Number(t.amount) || 0)
    row.turns += 1
    row.tokens += Number(t.tokens) || 0
    cur.byModel[mk] = row
    out.set(d, cur)
  }
  return out
}

// —— 按会话：只统计还在账本里的逐轮明细（90 天 / 500 条以内），
//    跨天结转进 daily 之后那部分没有会话信息，如实只算留下的。 ——
function bySessionOf(led, set) {
  const sess = new Map()
  for (const t of (led.turns || [])) {
    if (!t || !set.has(dayOfTs(t.ts))) continue
    const sid = String(t.sid || '') || 'unknown'
    const cur = sess.get(sid) || { sid, name: '', amount: 0, turns: 0, tokens: 0, lastAt: 0 }
    cur.amount = addMoney(cur.amount, Number(t.amount) || 0)
    cur.turns += 1
    cur.tokens += Number(t.tokens) || 0
    if (t.name) cur.name = String(t.name).slice(0, 60)
    cur.lastAt = Math.max(cur.lastAt, Number(t.ts) || 0)
    sess.set(sid, cur)
  }
  return Array.from(sess.values())
    .map((x) => ({
      sid: x.sid === 'unknown' ? '' : x.sid.slice(0, 12),
      name: x.name || (x.sid === 'unknown' ? '未知会话' : '会话 ' + x.sid.slice(0, 6)),
      amount: x.amount,
      turns: x.turns,
      tokens: x.tokens,
      lastAt: x.lastAt,
    }))
    .sort((a, b) => b.amount - a.amount || b.lastAt - a.lastAt)
}

// —— 近 6 个月：daily 逐日汇总 + 今天；缺月补 0，月份连续，不因没记账而跳月 ——
function monthsView(led) {
  const monthly = new Map()
  const add = (key, used, turns, tokens) => {
    const cur = monthly.get(key) || { used: 0, turns: 0, tokens: 0 }
    cur.used = addMoney(cur.used, Number(used) || 0)
    cur.turns += Number(turns) || 0
    cur.tokens += Number(tokens) || 0
    monthly.set(key, cur)
  }
  const daily = led.daily || {}
  for (const d of Object.keys(daily)) {
    const row = daily[d] || {}
    add(String(d).slice(0, 7), row.used, row.turns, row.tokens)
  }
  const today = led.date || bjNow().day
  add(String(today).slice(0, 7), led.todayUsed, led.todayTurns, led.todayTokens)
  const [y0, m0] = String(today).slice(0, 7).split('-').map(Number)
  const out = []
  for (let i = 5; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(y0, (m0 - 1) - i, 1))
    const key = d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1)
    const row = monthly.get(key) || { used: 0, turns: 0, tokens: 0 }
    out.push({ month: key, used: Number(row.used) || 0, turns: Number(row.turns) || 0, tokens: Number(row.tokens) || 0 })
  }
  return out
}

// —— 用量记录窗口：今日 / 近 7 天 / 全部；按模型占比 + 逐条明细 ——
// —— 「现在发生什么」：最近一轮账 / 进行中那一轮 / 挂起等待 / 忙碌态 ——
// 前端每 3 秒拉一次，靠 seq 变大判「又结了一轮」，靠 wait.kind+id 判「新的一件挂起」
function liveView() {
  const now = Date.now()
  const peak = peakState(now)
  const wait = waitState.pending
  const led = readLedger()
  return {
    ok: true,
    version: readVersion(),
    seq: Number(lastTurn.seq) || 0,
    lastTurn: lastTurn && lastTurn.ts
      ? {
        seq: Number(lastTurn.seq) || 0,
        turn: lastTurn.turn,
        amount: lastTurn.amount,      // null = 未计价（不是 0，别在前端印成「免费」）
        unpriced: Number(lastTurn.unpriced) || 0,
        tokens: lastTurn.tokens,
        model: lastTurn.model,
        ts: lastTurn.ts,
      }
      : null,
    live: rollLiveInto(),
    today: {
      used: Number(led.todayUsed) || 0,
      turns: Number(led.todayTurns) || 0,
      tokens: Number(led.todayTokens) || 0,
      unpriced: Number(led.todayUnpriced) || 0,
      day: led.date,
    },
    wait: wait
      ? {
        kind: wait.kind,              // 'question' | 'approval'
        id: wait.id,
        ts: wait.ts,
        sessionName: sessionTitles.get(String(wait.session || '')) || '',
      }
      : null,
    busy: runningAgents > 0,
    busySince,
    // D3 情绪态 + D5 女巫工具留痕：前端按 mood.ts / srsTool.seq 的变化触发一次反应
    mood: { kind: moodState.kind, ts: moodState.ts, detail: moodState.detail },
    srsTool: { seq: srsToolState.seq, name: srsToolState.name, ts: srsToolState.ts, spread: srsToolState.spread, ok: srsToolState.ok },
    peak: { peak: peak.peak, label: peak.label, nextInMs: peak.nextInMs },
    at: now,
  }
}

function usageView(range, q, limit) {
  const led = readLedger()
  const daily = led.daily || {}
  const today = led.date || bjNow().day
  const fromTurns = turnsByDay(led)
  const dayRow = (d) => (d === today
    ? { used: led.todayUsed, turns: led.todayTurns, tokens: led.todayTokens, byModel: led.todayByModel }
    : (daily[d] || fromTurns.get(d) || {}))
  let dates
  if (range === 'today') dates = [today]
  else if (range === '7d') {
    // 连续 7 个日历日（含今天）：没记账的那天显示 0，日期轴不因缺天往前跳
    const nowMs = Date.now()
    dates = []
    for (let i = 6; i >= 0; i -= 1) dates.push(bjNow(nowMs - i * 86400000).day)
  } else {
    const all = new Set(Object.keys(daily))
    for (const d of fromTurns.keys()) all.add(d)
    all.delete(today)
    dates = Array.from(all).sort()
    dates.push(today)
  }
  const set = new Set(dates)
  const byModel = new Map()
  let amount = 0
  let turns = 0
  let tokens = 0
  const add = (model, a, t, tok) => {
    const key = String(model || '未知模型') || '未知模型'
    const cur = byModel.get(key) || { model: key, amount: 0, turns: 0, tokens: 0 }
    cur.amount = addMoney(cur.amount, Number(a) || 0)
    cur.turns += Number(t) || 0
    cur.tokens += Number(tok) || 0
    byModel.set(key, cur)
  }
  for (const d of dates) {
    if (d === today) continue
    const row = dayRow(d)
    amount = addMoney(amount, Number(row.used) || 0)
    turns += Number(row.turns) || 0
    tokens += Number(row.tokens) || 0
    const bm = row.byModel && typeof row.byModel === 'object' ? row.byModel : null
    if (bm && Object.keys(bm).length) {
      for (const k of Object.keys(bm)) add(k, (bm[k] || {}).amount, (bm[k] || {}).turns, (bm[k] || {}).tokens)
    } else if (Number(row.used)) {
      add('未分模型（升级前）', Number(row.used) || 0, Number(row.turns) || 0, Number(row.tokens) || 0)
    }
  }
  amount = addMoney(amount, Number(led.todayUsed) || 0)
  turns += Number(led.todayTurns) || 0
  tokens += Number(led.todayTokens) || 0
  const tbm = led.todayByModel && typeof led.todayByModel === 'object' ? led.todayByModel : {}
  const tkeys = Object.keys(tbm)
  if (tkeys.length) {
    for (const k of tkeys) add(k, (tbm[k] || {}).amount, (tbm[k] || {}).turns, (tbm[k] || {}).tokens)
  } else if (Number(led.todayUsed)) {
    add('未分模型', Number(led.todayUsed) || 0, Number(led.todayTurns) || 0, Number(led.todayTokens) || 0)
  }

  let items = (led.turns || [])
    .filter((t) => t && set.has(dayOfTs(t.ts)))
    .map((t) => ({
      ts: Number(t.ts),
      date: dayOfTs(t.ts),
      time: new Date(Number(t.ts) + 8 * 3600 * 1000).toISOString().slice(11, 16),
      amount: Number(t.amount) || 0,
      unpriced: Number(t.unpriced) || 0,
      tokens: Number(t.tokens) || 0,
      model: String(t.model || ''),
      provider: String(t.provider || ''),
      turn: Number(t.turn) || 0,
    }))
    .sort((a, b) => b.ts - a.ts)
  if (q) {
    const needle = String(q).toLowerCase()
    items = items.filter((t) => (t.model + ' ' + t.date + ' ' + t.time + ' ' + t.amount.toFixed(2)).toLowerCase().indexOf(needle) >= 0)
  }
  return {
    ok: true,
    range,
    q: q || '',
    totals: { amount, turns, tokens },
    byModel: Array.from(byModel.values()).sort((a, b) => b.amount - a.amount),
    bySession: bySessionOf(led, set),
    months: monthsView(led),
    days: dates.map((d) => {
      const row = dayRow(d) || {}
      return { date: d, used: Number(row.used) || 0, turns: Number(row.turns) || 0 }
    }),
    items: items.slice(0, limit || 40),
    itemCount: items.length,
    retention: {
      turnsLive: (led.turns || []).length,
      turnsCap: MAX_TURNS,
      turnDays: TURN_KEEP_DAYS,
      dailyDays: Object.keys(daily).length,
      dailyCap: DAILY_KEEP_DAYS,
      archived: archiveCount(),
      archiveCap: ARCHIVE_MAX,
    },
    now: new Date().toISOString(),
  }
}

// 余额差只作对照，不再当作「今日已用」的真相（它会串别的客户端、也会漏窗口）
function applyBalanceToLedger(led, balance) {
  if (typeof balance !== 'number') return led
  if (typeof led.startBalance !== 'number') led.startBalance = balance
  if (typeof led.lastBalance === 'number' && balance < led.lastBalance) {
    led.todayUsedByBalance = Number(((led.todayUsedByBalance || 0) + (led.lastBalance - balance)).toFixed(8))
  }
  led.lastBalance = balance
  return led
}

export const inject = ['webServer', 'tools']


function readVersion() {
  try {
    return JSON.parse(fs.readFileSync(path.join(PLUGIN_DIR, 'package.json'), 'utf8')).version || '0.0.0'
  } catch (error) {
    return '0.0.0'
  }
}

// 立绘张数按目录实点，别写死（2026-11-19 修：原来 ping 里硬编码 poses: 14，
// 加到 19 张之后仍报 14）
function countPoses() {
  try {
    return fs.readdirSync(path.join(PLUGIN_DIR, 'assets', 'sorceress'))
      .filter((f) => f.toLowerCase().endsWith('.webp')).length
  } catch (error) {
    return 0
  }
}

const VERSION = readVersion()
const routeQuery = '/?v=' + VERSION // 缓存键跟着版本走：升级即失效

let deckCache = null
function readDeck() {
  if (deckCache) return deckCache
  deckCache = JSON.parse(fs.readFileSync(DECK_FILE, 'utf8'))
  return deckCache
}

let tarotCache = null
function readTarot() {
  if (tarotCache) return tarotCache
  tarotCache = JSON.parse(fs.readFileSync(TAROT_FILE, 'utf8'))
  return tarotCache
}

// 牌面字节读一次就留在内存里；5.3MB 上限，够用且不碰磁盘
const cardCache = new Map()

function resolveCard(rel) {
  if (cardCache.has(rel)) return cardCache.get(rel)
  const file = path.join(CARDS_DIR, rel)
  const root = path.resolve(CARDS_DIR)
  if (!path.resolve(file).startsWith(root + path.sep)) return null
  if (!fs.existsSync(file)) return null
  const buf = fs.readFileSync(file)
  cardCache.set(rel, buf)
  return buf
}

function sendJson(res, body, status) {
  res.writeHead(status || 200, JSON_HEADERS)
  res.end(JSON.stringify(body))
}

// 读 POST body：限 8KB，够一句对话；超时/超限直接判坏请求
function readBody(req, limit = 8192) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (c) => {
      size += c.length
      if (size > limit) { reject(new Error('too large')); req.destroy(); return }
      chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

// D6：造一条 user 消息。优先用宿主官方 createUserMessage（带 id/冻结），
// bare import 在某些装载方式下解析不到时，手造同形对象兜底（inbox 只存引用，不强求工厂）。
async function makeUserMessage(text) {
  const content = [{ type: 'text', text }]
  try {
    const llm = await import('@deepseek-ai/dsh-llm')
    if (llm && typeof llm.createUserMessage === 'function') {
      return llm.createUserMessage({ content, source: { kind: 'user' } })
    }
  } catch (error) { /* 落到手造 */ }
  const id = 'srs-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10)
  return Object.freeze({ id, role: 'user', content, source: { kind: 'user' } })
}

function serveCard(req, res) {
  let rel = ''
  try {
    // 不用 new URL()：它需要一个 base 才能解析相对路径，代码里就会留一个假域名
    const raw = String(req.url || '')
    const cut = raw.indexOf('?')
    const p = cut < 0 ? raw : raw.slice(0, cut)
    rel = decodeURIComponent(p.replace(/^\/srs\/cards\/?/, ''))
  } catch (error) {
    res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('bad request')
    return
  }
  if (!CARD_RE.test(rel)) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('not found')
    return
  }
  const buf = resolveCard(rel)
  if (!buf) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('not found')
    return
  }
  res.writeHead(200, {
    'content-type': 'image/webp',
    'content-length': String(buf.length),
    'cache-control': 'public, max-age=31536000, immutable',
  })
  if (req.method === 'HEAD') {
    res.end()
    return
  }
  res.end(buf)
}

// 环境音景：只服务 assets/sfx/amb-*.mp3 四个白名单文件，其余 404（挡穿越）
const ambCache = new Map()

function serveAmb(req, res) {
  let rel = ''
  try {
    const raw = String(req.url || '')
    const cut = raw.indexOf('?')
    const p = cut < 0 ? raw : raw.slice(0, cut)
    rel = decodeURIComponent(p.replace(/^\/srs\/sfx\/?/, '')).replace(/\.mp3$/, '')
  } catch (error) {
    res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('bad request')
    return
  }
  if (!AMB_SET.has(rel)) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('not found')
    return
  }
  let buf = ambCache.get(rel)
  if (!buf) {
    const file = path.join(SFX_DIR, rel + '.mp3')
    const root = path.resolve(SFX_DIR)
    if (!path.resolve(file).startsWith(root + path.sep) || !fs.existsSync(file)) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
      res.end('not found')
      return
    }
    buf = fs.readFileSync(file)
    ambCache.set(rel, buf)
  }
  res.writeHead(200, {
    'content-type': 'audio/mpeg',
    'content-length': String(buf.length),
    'cache-control': 'public, max-age=31536000, immutable',
  })
  if (req.method === 'HEAD') {
    res.end()
    return
  }
  res.end(buf)
}

export function apply(ctx) {
  // D1/D2/D7：注册三个 agent 工具。老宿主没有 tools 服务时静默跳过，路由与挂件照常工作。
  ctx.effect(() => {
    const disposers = registerSorceressTools(ctx)
    return () => { for (const off of disposers) { try { if (typeof off === 'function') off() } catch (error) { /* 卸载容错 */ } } }
  })

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/srs/ping.json',
    handler(req, res) {
      let deck = null
      try { deck = readDeck() } catch (error) { /* 缺 data 时不炸服务 */ }
      sendJson(res, {
        ok: true,
        version: readVersion(),          // 每次读 package.json：别用加载时固化的常量，
        poses: countPoses(),             // 否则宿主跑着跑着版本号就停在启动那一刻
        cards: deck ? deck.total : 0,
        dataVersion: deck ? deck.dataVersion : null,
      })
    },
  }))

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/srs/deck.json',
    handler(req, res) {
      try {
        sendJson(res, readDeck())
      } catch (error) {
        sendJson(res, { ok: false, error: 'deck.json 读不到' }, 500)
      }
    },
  }))

  // 前缀路由：一条吃掉 78 张大图 + 78 张缩略 + 牌背
  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: '/srs/cards',
    handler: serveCard,
  }))

  // 前缀路由：环境音景 4 套（W19）。循环音轨不进 client.js，走路由省包体积
  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: '/srs/sfx',
    handler: serveAmb,
  }))

  // 牌义数据：大阿卡纳逐张 + 小阿卡纳三层模板
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/srs/tarot.json',
    handler(req, res) {
      try {
        sendJson(res, readTarot())
      } catch (error) {
        sendJson(res, { ok: false, error: 'tarot.json 读不到' }, 500)
      }
    },
  }))

  // 计费：余额（API Key → 宿主账号兜底）+ 账本汇总 + 近 7 天 + 峰谷
  const CACHE_MS = 55000
  let billCache = null // { at, payload }

  function getService(name) {
    try { return typeof ctx.get === 'function' ? ctx.get(name) : null } catch (error) { return null }
  }

  async function computeBilling(force) {
    const now = Date.now()
    if (!force && billCache && now - billCache.at < CACHE_MS) {
      return Object.assign({}, billCache.payload, { live: rollLiveInto(readLedger()) })
    }
    let bal = await balanceFromApiKey(getService('credentials'))
    if (!bal.ok) {
      const alt = await balanceFromAccount(getService('deepseekAccount'))
      if (alt.ok) bal = alt
      else bal.error = '余额读不出来：' + (bal.error || 'API Key 失败') + '；' + (alt.error || '账号失败')
    }
    const led = readLedger()
    if (bal.ok) {
      applyBalanceToLedger(led, bal.balance)
      writeLedger(led)
    }
    const peak = peakState(now)
    // 近 7 天：历史日（daily）+ 今天（实时）。今天只从实时值取，避免与 daily 重复
    const dailyMap = led.daily || {}
    const history = Object.keys(dailyMap)
      .filter((d) => d !== led.date)
      .sort()
      .slice(-6)
      .map((d) => ({ date: d, used: Number((dailyMap[d] || {}).used) || 0, turns: Number((dailyMap[d] || {}).turns) || 0 }))
    history.push({ date: led.date, used: Number(led.todayUsed) || 0, turns: Number(led.todayTurns) || 0 })
    // 本月已用：daily 里同月 + 今天
    const month = String(led.date || bjNow().day).slice(0, 7)
    let monthUsed = Number(led.todayUsed) || 0
    let monthTurns = Number(led.todayTurns) || 0
    for (const d of Object.keys(dailyMap)) {
      if (String(d).slice(0, 7) !== month) continue
      monthUsed = addMoney(monthUsed, Number((dailyMap[d] || {}).used) || 0)
      monthTurns += Number((dailyMap[d] || {}).turns) || 0
    }
    // 今天这笔账的起点：新账本用 sinceTs，老账本没这字段就退回今天第一条明细的时间
    let todaySince = Number(led.sinceTs) || null
    if (!todaySince) {
      for (const t of led.turns || []) {
        const ts = Number(t && t.ts) || 0
        if (ts && bjNow(ts).day === led.date) { todaySince = ts; break }
      }
    }
    const payload = {
      ok: true,
      balance: bal.ok ? bal.balance : null,
      recharge: bal.ok && bal.recharge !== undefined ? bal.recharge : null,
      bonus: bal.ok && bal.bonus !== undefined ? bal.bonus : null,
      currency: bal.ok ? bal.currency : 'CNY',
      source: bal.ok ? bal.source : null,
      balanceError: bal.ok ? null : String(bal.error || '余额读不出来'),
      balanceErrorCode: bal.ok ? null : String(bal.code || 'UNKNOWN'),
      todayUsed: Number(led.todayUsed) || 0,
      todayUsedByBalance: Number(led.todayUsedByBalance) || 0,
      todayTurns: Number(led.todayTurns) || 0,
      todayTokens: Number(led.todayTokens) || 0,
      todayUnpriced: Number(led.todayUnpriced) || 0,
      monthUsed,
      monthTurns,
      history,
      lastTurn: lastTurn && lastTurn.ts
        ? { amount: lastTurn.amount, unpriced: Number(lastTurn.unpriced) || 0, tokens: lastTurn.tokens, model: lastTurn.model, ts: lastTurn.ts }
        : null,
      todayStart: led.startBalance,
      todaySince,
      day: led.date,
      peak: {
        peak: peak.peak, label: peak.label, next: peak.next, window: peak.window, nextInMs: peak.nextInMs,
        holidayThrough: HOLIDAY_TABLE_THROUGH_YEAR, holidayOk: hasHolidayCoverage(now),
      },
      // 挂起与忙碌：计费页要能一眼看出「这一轮是不是正卡在等授权」
      wait: waitState.pending
        ? {
          kind: waitState.pending.kind,
          id: waitState.pending.id,
          ts: waitState.pending.ts,
          sessionName: sessionTitles.get(String(waitState.pending.session || '')) || '',
        }
        : null,
      busy: runningAgents > 0,
      updatedAt: new Date(now).toISOString(),
    }
    billCache = { at: now, payload }
    return Object.assign({}, payload, { live: rollLiveInto(led) })
  }

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/srs/billing.json',
    handler: async (req, res) => {
      try {
        const raw = String(req.url || '')
        const refresh = /[?&]refresh=1\b/.test(raw)
        if (refresh) billCache = null
        sendJson(res, await computeBilling(refresh))
      } catch (error) {
        sendJson(res, { ok: false, code: 'THROW', error: '计费接口异常' })
      }
    },
  }))

  // 用量窗口：range=today|7d|all，q=搜索词，limit=明细条数
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/srs/usage.json',
    handler: (req, res) => {
      try {
        const raw = String(req.url || '')
        const qs = raw.indexOf('?') >= 0 ? raw.slice(raw.indexOf('?') + 1) : ''
        const params = new URLSearchParams(qs)
        const range = params.get('range') === 'today' ? 'today' : (params.get('range') === 'all' ? 'all' : '7d')
        const q = String(params.get('q') || '').trim()
        const limit = Math.min(500, Math.max(1, Number(params.get('limit')) || 40))
        sendJson(res, usageView(range, q, limit))
      } catch (error) {
        sendJson(res, { ok: false, error: '用量接口异常' }, 500)
      }
    },
  }))

  // 现在发生什么：一场账结完 / 进行中金额 / 挂起等待 / 忙碌（前端气泡播报，3 秒一轮）
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/srs/live.json',
    handler: (req, res) => {
      try { sendJson(res, liveView()) } catch (error) { sendJson(res, { ok: false, code: 'THROW', error: '播报接口异常' }) }
    },
  }))

  // 只回最近一轮 + 今日：细粒度读取，给外部工具与路由自检用（前端播报统一走 live.json）
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/srs/turn.json',
    handler: (req, res) => {
      try {
        const v = liveView()
        sendJson(res, { ok: true, seq: v.seq, lastTurn: v.lastTurn, live: v.live, today: v.today })
      } catch (error) {
        sendJson(res, { ok: false, error: '轮次接口异常' })
      }
    },
  }))

  // D6 面板内对话入口：前端把一句话 POST 进来，宿主塞进当前会话的下一轮并唤起 agent。
  // 服务用 ctx.get 动态取，取不到就回明确错误 —— 不静态注入，老宿主少服务也不会把整个插件 park 住。
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/srs/chat-prompt',
    handler: async (req, res) => {
      if (String(req.method || '').toUpperCase() !== 'POST') {
        sendJson(res, { ok: false, error: 'only POST' }, 405)
        return
      }
      let payload
      try {
        payload = JSON.parse(await readBody(req))
      } catch (error) {
        sendJson(res, { ok: false, error: '请求体不是合法 JSON' }, 400)
        return
      }
      // 面板「送进对话」：一句话通常很短，但「把整段解读送进对话」会带 6–8 段富解读，
      // 上限放宽到 12000 字（够凯尔特十张全文），仍做长度截断防滥用。
      const text = String((payload && payload.text) || '').trim().slice(0, 12000)
      if (!text) { sendJson(res, { ok: false, error: '没有要发送的话' }, 400); return }
      try {
        const agents = typeof ctx.get === 'function' ? ctx.get('agents') : null
        const sessions = typeof ctx.get === 'function' ? ctx.get('sessions') : null
        if (!agents || typeof agents.get !== 'function') {
          sendJson(res, { ok: false, code: 'NO_AGENTS', error: '宿主没有 agents 服务，面板对话不可用' }, 503)
          return
        }
        // 目标会话：前端给的 sessionId 优先；没有就取最近一个活会话
        let sid = String((payload && payload.sessionId) || '').trim()
        let agent = sid ? agents.get(sid) : null
        if (!agent && sessions && typeof sessions.list === 'function') {
          const all = sessions.list()
          const last = all && all.length ? all[all.length - 1] : null
          if (last && last.id) { sid = String(last.id); agent = agents.get(sid) }
        }
        if (!agent || typeof agent.followup !== 'function') {
          sendJson(res, { ok: false, code: 'NO_SESSION', error: '没有可投递的活会话，先在主界面开一个对话' }, 409)
          return
        }
        const msg = await makeUserMessage(text)
        // followup：进 next-turn 收件箱并唤醒驱动，等价于用户在输入框发了一句
        agent.followup(msg)
        markMood('working', '面板来话')
        sendJson(res, { ok: true, sessionId: sid, delivered: true, at: Date.now() })
      } catch (error) {
        sendJson(res, { ok: false, code: 'THROW', error: '对话投递失败：' + String((error && error.message) || error).slice(0, 160) }, 500)
      }
    },
  }))

  // 会话事件：逐轮聚合 usage（宿主事件契约：assistant/message · compaction/summary · turn/end）
  ctx.effect(() => {
    if (typeof ctx.on !== 'function') return undefined
    const offEvent = ctx.on('session/event', handleBillingEvent)
    const offDisposed = ctx.on('session/disposed', (session) => {
      if (session && session.id) turnAggs.delete(String(session.id))
    })
    // D3 情绪态走 agent/status（与 session/event 不同事件，单槽 mock 不会互相顶）
    const offStatus = ctx.on('agent/status', (payload) => {
      const status = payload && payload.status
      if (status === 'running') {
        runningAgents += 1
        if (!busySince) busySince = Date.now()
        markMood('working')                       // D3：开工
      } else if (status === 'idle') {
        runningAgents = Math.max(0, runningAgents - 1)
        if (!runningAgents) {
          busySince = 0
          markMood('done')                        // D3：收工
        }
      }
    })
    return () => {
      if (typeof offEvent === 'function') offEvent()
      if (typeof offDisposed === 'function') offDisposed()
      if (typeof offStatus === 'function') offStatus()
    }
  })
}

// 给测试用：不启服务也能验路由表
export const _internal = { CARD_RE, VERSION, routeQuery, moodState: () => moodState, srsToolState: () => srsToolState }
