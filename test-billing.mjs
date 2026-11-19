/**
 * 计费账本自检（口径对齐青云剑仙 v4.x）
 * 跑法：node test-billing.mjs
 *
 * 覆盖
 *   ① 缓存写入按「未命中输入」价计（漏算是老账本最典型的错）
 *   ② 缓存命中按 hit 价
 *   ③ 今日已用按真实 usage 累加，不被余额差改写
 *   ④ turnSeq / lastTurn 重启后不丢
 *   ⑤ 法定节假日按谷价、工作日 10 点按高峰价
 *   ⑥ 跨天：昨日今日数搬进 daily，今日清零
 *   ⑦ 价表里没有的模型：只记 token，标「未计价」
 *   ⑧ /srs/usage.json 的 today / 7d / all 三个窗口与模型占比
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'srs-bill-'))
process.env.DSH_HOME = home
const STATE = path.join(home, '.srs-usage.json')

const { apply } = await import(new URL('./plugin/index.js', import.meta.url).href)

let fails = 0
const ok = (cond, label, extra) => {
  if (cond) console.log('  PASS  ' + label + (extra !== undefined ? '   ' + JSON.stringify(extra) : ''))
  else { fails += 1; console.log('  FAIL  ' + label + '   ' + JSON.stringify(extra)) }
}

const routes = new Map()
const handlers = {}
const ctx = {
  get: () => null,                      // 没有凭据 / 账号服务：余额走失败分支，正好不联网
  effect(fn) { const off = fn(); return () => { if (typeof off === 'function') off() } },
  on(name, h) { handlers[name] = h; return () => { delete handlers[name] } },
  webServer: { register(route) { routes.set(route.path, route); return () => routes.delete(route.path) } },
}
apply(ctx)

function call(pathname) {
  const route = routes.get(pathname.split('?')[0])
  return new Promise((resolve) => {
    const out = { status: 0, body: null }
    const res = { writeHead(status) { out.status = status }, end(chunk) { out.body = chunk; resolve(out) } }
    route.handler({ url: pathname, method: 'GET' }, res)
  })
}

const state = () => JSON.parse(fs.readFileSync(STATE, 'utf8'))
const SID = { id: 'S1' }
const msg = (turn, usage, model) => handlers['session/event'](SID, {
  type: 'assistant/message',
  data: { turn, usage, message: { source: { model } } },
})
const endTurn = () => handlers['session/event'](SID, { type: 'turn/end', data: {} })

// 固定「现在是工作日 10 点」（高峰）：价格断言不依赖跑测试的时刻
const realNow = Date.now
Date.now = () => Date.parse('2026-11-17T10:00:00+08:00')

console.log('DSH_HOME =', home)
const billing = async () => JSON.parse((await call('/srs/billing.json?refresh=1')).body)
const usage = async (q) => JSON.parse((await call('/srs/usage.json' + (q || ''))).body)

// 高峰价：flash miss 2 / hit 0.04（元每百万）
const MISS = 2
const HIT = 0.04

console.log('\n[1] 缓存写入计入')
msg(1, { inputTokens: 1_000_000, cacheReadTokens: 0, cacheWriteTokens: 1_000_000, outputTokens: 0 }, 'deepseek-v4-flash')
endTurn()
let st = state()
ok(Math.abs(st.todayUsed - 2 * MISS) < 1e-9, 'todayUsed = ' + 2 * MISS + ' 元（含缓存写入）', st.todayUsed)
ok(st.todayTurns === 1, 'todayTurns = 1', st.todayTurns)
ok(Array.isArray(st.turns) && st.turns.length === 1, '明细落了一条', (st.turns || []).length)
ok(st.todayUsedByBalance === 0, '余额差口径不混进今日已用', st.todayUsedByBalance)

console.log('\n[2] 缓存命中按 hit 价')
msg(2, { inputTokens: 0, cacheReadTokens: 1_000_000, cacheWriteTokens: 0, outputTokens: 0 }, 'deepseek-v4-flash')
endTurn()
st = state()
ok(Math.abs(st.todayUsed - (2 * MISS + HIT)) < 1e-9, '命中 1M 只加 ' + HIT + ' 元', st.todayUsed)

console.log('\n[3] 输出 token 按 out 价')
msg(3, { inputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 1_000_000 }, 'deepseek-v4-flash')
endTurn()
st = state()
ok(Math.abs(st.todayUsed - (2 * MISS + HIT + 8)) < 1e-9, '输出 1M 加 8 元（高峰）', st.todayUsed)

console.log('\n[4] turnSeq 不丢')
const seqBefore = state().turnSeq
const b4 = await billing()          // 走 computeBilling：会 readLedger，不能把 seq 抹掉
ok(state().turnSeq === seqBefore && seqBefore > 0, 'computeBilling 后 turnSeq 不变', [seqBefore, state().turnSeq])
ok(b4.todayUsed === st.todayUsed, 'billing 里的今日已用与账本一致', b4.todayUsed)
ok(b4.lastTurn && b4.lastTurn.model === 'deepseek-v4-flash', '最近一笔带模型名', b4.lastTurn && b4.lastTurn.model)

console.log('\n[5] 峰谷与节假日')
ok(b4.peak.peak === true && b4.peak.label === '高峰价', '工作日 10:00 = 高峰价', b4.peak.label)
ok(b4.peak.next === '谷价' && b4.peak.nextInMs > 0, '下一档是谷价且有倒计时', b4.peak.nextInMs)
Date.now = () => Date.parse('2026-10-01T10:00:00+08:00')   // 国庆 10 点
const hol = await billing()
ok(hol.peak.peak === false && hol.peak.label === '谷价', '国庆 10:00 = 谷价', hol.peak.label)
msg(4, { inputTokens: 1_000_000, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0 }, 'deepseek-v4-flash')
endTurn()
Date.now = () => Date.parse('2026-10-01T10:01:00+08:00')
const oct = state()
// 换日了：10-01 是一份新的一天，今日已用从 0 起算，只该是这 1M 未命中（谷价 1 元）
ok(Math.abs(oct.todayUsed - 1) < 1e-9, '节假日这 1M 未命中按谷价 1 元', oct.todayUsed)
ok(oct.daily['2026-11-17'] && oct.daily['2026-11-17'].turns === 3, '原来那天整份搬进 daily（前三轮）', oct.daily['2026-11-17'] && oct.daily['2026-11-17'].turns)
ok(Math.abs((oct.daily['2026-11-17'] || {}).used - 12.04) < 1e-9, '搬过去的金额对得上（12.04）', (oct.daily['2026-11-17'] || {}).used)
Date.now = () => Date.parse('2026-11-17T10:00:00+08:00')

console.log('\n[6] 价表没有的模型 → 未计价')
msg(5, { inputTokens: 1234, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 567 }, 'someone-else-model')
endTurn()
const un = state()
ok(un.todayUnpriced === 1, 'todayUnpriced = 1', un.todayUnpriced)
const unItem = un.turns[un.turns.length - 1]
ok(unItem.unpriced === 1 && unItem.amount === 0, '明细那条标了 unpriced 且金额 0', unItem)
ok(un.todayTokens >= 1801, 'token 仍然记下来了', un.todayTokens)

console.log('\n[7] 跨天归档')
const before = JSON.parse(fs.readFileSync(STATE, 'utf8'))
before.date = '2026-11-16'
before.todayUsed = 3.5
before.todayTurns = 2
before.todayByModel = { 'deepseek-flash': { amount: 3.5, turns: 2, tokens: 1000 } }
before.startBalance = 40
before.lastBalance = 36.5
before.todayUsedByBalance = 3.5
fs.writeFileSync(STATE, JSON.stringify(before), 'utf8')
const rolled = await billing()
ok(rolled.day === '2026-11-17', '跨天后 date = 今天', rolled.day)
ok(rolled.todayUsed === 0 && rolled.todayTurns === 0, '今日数已清零', [rolled.todayUsed, rolled.todayTurns])
ok(rolled.todayUsedByBalance === 0, '跨天后余额差归零（不把昨天的扣款算进今天）', rolled.todayUsedByBalance)
ok('todaySince 字段在（口径起点）', 'todaySince' in rolled, rolled.todaySince)
ok(rolled.history.some((h) => h.date === '2026-11-16' && Math.abs(h.used - 3.5) < 1e-9), '昨天进了 history', rolled.history)

console.log('\n[8] 用量窗口')
const today = await usage('?range=today')
ok(today.ok === true && today.days.length === 1, 'today 只有一天', today.days.length)
const d7 = await usage('?range=7d')
ok(d7.days.length === 7, '7d 是连续 7 个日历日（不因缺天往前跳）', d7.days.length)
const d16 = d7.days.find((d) => d.date === '2026-11-16')
ok(!!d16 && Math.abs(d16.used - 3.5) < 1e-9 && d16.turns === 2, '昨天那 3.5 元 / 2 轮在 7d 窗口里', d16)
ok(d7.days[d7.days.length - 1].date === '2026-11-17' && d7.days[d7.days.length - 1].used === 0, '今天从 0 起算', d7.days[d7.days.length - 1])
const all = await usage('?range=all')
ok(all.ok === true && Array.isArray(all.byModel), 'all 带模型占比')
ok(all.retention.turnsLive >= 4, 'retention 报出明细条数', all.retention.turnsLive)
const q = await usage('?range=all&q=flash')
ok(q.itemCount >= 3 && q.items.every((it) => it.model.indexOf('flash') >= 0 || it.date.indexOf('flash') >= 0), 'q 搜索命中', q.itemCount)
const lim = await usage('?range=all&limit=2')
ok(lim.items.length <= 2, 'limit 生效', lim.items.length)

console.log('\n[9] 按会话（会话标题 + 逐轮累加）')
fs.rmSync(STATE, { force: true })          // 重新起一份干净账本
const S2 = { id: 'S2' }
handlers['session/event'](S2, { type: 'session/title', data: { title: '即梦洗牌动画' } })
handlers['session/event'](S2, {
  type: 'assistant/message',
  data: { turn: 1, usage: { inputTokens: 1_000_000 }, message: { source: { model: 'deepseek-v4-flash' } } },
})
handlers['session/event'](S2, { type: 'turn/end', data: {} })
msg(9, { inputTokens: 1_000_000 }, 'deepseek-v4-flash')
endTurn()
const u9 = await usage('?range=today')
ok(u9.bySession.length === 2, '两个会话各一行', u9.bySession.map((s) => s.name))
const rowS2 = u9.bySession.find((s) => s.name === '即梦洗牌动画')
ok(!!rowS2 && Math.abs(rowS2.amount - 2) < 1e-9 && rowS2.turns === 1, 'S2 记到标题与金额', rowS2)
ok(!u9.bySession.find((s) => s.sid === 'S2' && !s.name) && u9.bySession.length === 2, '标题不会丢成裸 sid', u9.bySession.map((s) => s.sid))
ok(u9.bySession[0].amount >= u9.bySession[1].amount, '按金额倒序', u9.bySession.map((s) => s.amount))

console.log('\n[10] 近 6 个月')
const led10 = JSON.parse(fs.readFileSync(STATE, 'utf8'))
led10.daily = Object.assign({}, led10.daily, {
  '2026-09-30': { used: 1.5, turns: 3, tokens: 1000, byModel: {} },
  '2026-10-02': { used: 2.5, turns: 4, tokens: 2000, byModel: {} },
  '2026-11-16': { used: 3.0, turns: 5, tokens: 3000, byModel: {} },
})
fs.writeFileSync(STATE, JSON.stringify(led10), 'utf8')
const u10 = await usage('?range=today')
ok(u10.months.length === 6, '固定 6 个月（含当月）', u10.months.length)
ok(u10.months[5].month === '2026-11', '最后一格是当月', u10.months[5].month)
ok(Math.abs(u10.months[5].used - 7) < 1e-9, '当月 = 历史日 3 + 今天 4', u10.months[5].used)
ok(u10.months[4].month === '2026-10' && Math.abs(u10.months[4].used - 2.5) < 1e-9, '上月只算上月', u10.months[4])
ok(u10.months[3].month === '2026-09' && Math.abs(u10.months[3].used - 1.5) < 1e-9, '隔月对得上', u10.months[3])
ok(u10.months[0].month === '2026-06' && u10.months[0].used === 0, '缺月补 0 不跳月', u10.months[0])

Date.now = realNow
console.log('\n' + (fails ? fails + ' 项失败' : '全绿'))
process.exitCode = fails ? 1 : 0
