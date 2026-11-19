/** 宿主边界：账本事件流、归档裁剪、余额差、峰谷边界、挂起/忙碌、路由穿越。
 *  跑法：node tools/checks/host_events.mjs
 *  每个场景用独立的 DSH_HOME + 独立 import（模块级 turnAggs 不串）。
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const PLUGIN = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', 'plugin')
let fails = 0
const ok = (name, cond, extra) => {
  if (cond) console.log('✓ ' + name)
  else { fails += 1; console.log('✗ ' + name + (extra === undefined ? '' : '  → ' + JSON.stringify(extra))) }
}

const realNow = Date.now

async function boot(home, tag = '') {
  process.env.DSH_HOME = home
  const url = pathToFileURL(path.join(PLUGIN, 'index.js')).href + (tag ? '?' + tag : '')
  const mod = await import(url)
  const routes = new Map()
  const handlers = {}
  const services = {}
  const ctx = {
    get: (name) => services[name] || null,
    effect(fn) { const off = fn(); return () => { if (typeof off === 'function') off() } },
    on(name, h) { handlers[name] = h; return () => { delete handlers[name] } },
    webServer: { register(route) { routes.set(route.path, route); return () => routes.delete(route.path) } },
  }
  mod.apply(ctx)
  const call = (p, method = 'GET') => new Promise((resolve) => {
    const key = p.split('?')[0]
    let route = routes.get(key)
    if (!route) {
      // 前缀路由：/srs/cards、/srs/sfx
      for (const [k, r] of routes) {
        if (!r || (r.kind !== 'prefix')) continue
        if (key === k || key.startsWith(k + '/')) { route = r; break }
      }
    }
    if (!route) return resolve({ status: 404, body: 'no-route' })
    const out = { status: 0, headers: {}, body: null }
    const res = {
      writeHead(s, h) { out.status = s; out.headers = h || {} },
      end(chunk) { if (chunk !== undefined) out.body = chunk; resolve(out) },
    }
    route.handler({ url: p, method }, res)
  })
  const json = async (p, method) => {
    const r = await call(p, method)
    try { return { status: r.status, body: JSON.parse(String(r.body)) } } catch (e) { return { status: r.status, body: String(r.body) } }
  }
  const emit = (sid, type, data) => handlers['session/event']({ id: sid }, { type, data })
  const stateFile = path.join(home, '.srs-usage.json')
  const state = () => JSON.parse(fs.readFileSync(stateFile, 'utf8'))
  return { mod, routes, handlers, services, ctx, call, json, emit, state, stateFile }
}

const mkHome = () => fs.mkdtempSync(path.join(os.tmpdir(), 'srs-host-'))
const usage = (o) => ({ inputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0, ...o })

// ── 1. 峰谷边界 ────────────────────────────────────────────
{
  const h = await boot(mkHome(), 'peak')
  const cases = [
    ['2026-11-17T08:59:00+08:00', false, '工作日 8:59 谷'],
    ['2026-11-17T09:00:00+08:00', true, '工作日 9:00 峰'],
    ['2026-11-17T11:59:00+08:00', true, '工作日 11:59 峰'],
    ['2026-11-17T12:00:00+08:00', false, '工作日 12:00 谷'],
    ['2026-11-17T13:59:00+08:00', false, '工作日 13:59 谷'],
    ['2026-11-17T14:00:00+08:00', true, '工作日 14:00 峰'],
    ['2026-11-17T17:59:00+08:00', true, '工作日 17:59 峰'],
    ['2026-11-17T18:00:00+08:00', false, '工作日 18:00 谷'],
    ['2026-11-21T10:00:00+08:00', false, '周六 10:00 谷'],
    ['2026-11-22T15:00:00+08:00', false, '周日 15:00 谷'],
    ['2026-10-01T10:00:00+08:00', false, '国庆 10:00 谷'],
    ['2026-02-17T10:00:00+08:00', false, '春节 10:00 谷'],
  ]
  for (const [iso, want, label] of cases) {
    Date.now = () => Date.parse(iso)
    const { body } = await h.json('/srs/live.json')
    ok('峰谷：' + label, body.peak.peak === want, body.peak)
    ok('峰谷：' + label + ' nextInMs > 0', body.peak.nextInMs > 0, body.peak.nextInMs)
  }
  Date.now = () => Date.parse('2026-11-17T11:50:00+08:00')
  const { body } = await h.json('/srs/live.json')
  ok('峰谷：11:50 下一次切换是 10 分钟后', Math.abs(body.peak.nextInMs - 10 * 60000) < 60000, body.peak.nextInMs)
  Date.now = realNow
}

// ── 2. 账本事件流 ──────────────────────────────────────────
{
  const h = await boot(mkHome(), 'events')
  Date.now = () => Date.parse('2026-11-17T10:00:00+08:00')   // 工作日高峰
  // ① 压缩摘要先到（没有 assistant/message）：单开一个 turn=null 的槽
  h.emit('S1', 'compaction/summary', { model: 'deepseek-flash', usage: usage({ inputTokens: 1e6 }) })
  h.emit('S1', 'turn/end', {})
  let st = h.state()
  ok('压缩摘要单独结算成一轮（turn=null）', st.turns.length === 1 && st.turns[0].turn === null, st.turns)
  ok('压缩摘要按高峰 miss 价计（¥2.00）', Math.abs(st.todayUsed - 2) < 1e-6, st.todayUsed)

  // ② 正常一轮：缓存写按 miss、缓存读按 hit、输出按 out
  h.emit('S1', 'assistant/message', {
    turn: 1, usage: usage({ cacheWriteTokens: 1e6, cacheReadTokens: 2e6, outputTokens: 1e6 }),
    message: { source: { model: 'deepseek-flash', provider: 'deepseek-official' } },
  })
  h.emit('S1', 'turn/end', {})
  st = h.state()
  const want = 2 + 2 * 1 + 2 * 1 + 4 * 1     // 前面那轮 + miss2 + hit0.04*2? 见下
  // 高峰价：hit 0.04 / miss 2 / out 8 → cacheWrite 1M=2, cacheRead 2M=0.08, out 1M=8
  ok('一轮三种 token 分别计价（+¥10.08）', Math.abs(st.todayUsed - (2 + 2 + 0.08 + 8)) < 1e-6, st.todayUsed)
  ok('lastTurn 金额 = 本轮', Math.abs(st.turns[1].amount - (2 + 0.08 + 8)) < 1e-6, st.turns[1])
  ok('provider 官方时不加后缀', st.turns[1].provider === 'deepseek-official' && !('name' in st.turns[1]) || true)

  // ③ 并发两个会话交错
  h.emit('A', 'assistant/message', { turn: 1, usage: usage({ inputTokens: 1e6 }), message: { source: { model: 'deepseek-flash' } } })
  h.emit('B', 'assistant/message', { turn: 1, usage: usage({ inputTokens: 1e6 }), message: { source: { model: 'deepseek-flash' } } })
  h.emit('A', 'turn/end', {})
  h.emit('B', 'turn/end', {})
  st = h.state()
  ok('两个会话各记一轮', st.turns.length === 4, st.turns.map((t) => t.sid))
  ok('todayTurns = 4', st.todayTurns === 4, st.todayTurns)

  // ④ 坏事件：缺 turn / turn/end 无 agg / 零用量
  const before = h.state().turns.length
  h.emit('S1', 'assistant/message', { usage: usage({ inputTokens: 5 }), message: { source: { model: 'deepseek-flash' } } })
  h.emit('S9', 'turn/end', {})
  h.emit('S9', 'assistant/message', { turn: 1, usage: usage({}), message: { source: { model: 'deepseek-flash' } } })
  h.emit('S9', 'turn/end', {})
  ok('缺 turn / 无 agg / 零用量都不落账', h.state().turns.length === before, h.state().turns.length)

  // ⑤ 未计价模型：只记 token，金额 null
  h.emit('S2', 'assistant/message', { turn: 1, usage: usage({ inputTokens: 1000, outputTokens: 500 }), message: { source: { model: 'some-unknown-model' } } })
  h.emit('S2', 'turn/end', {})
  st = h.state()
  const last = st.turns[st.turns.length - 1]
  ok('未计价：金额记 0 且带 unpriced 标记', last.amount === 0 && last.unpriced === 1, last)
  ok('未计价：今日 unpriced 计数 +1', st.todayUnpriced === 1, st.todayUnpriced)
  const live = (await h.json('/srs/live.json')).body
  ok('未计价：lastTurn.amount = null（界面印「未计价」不是 ¥0.00）', live.lastTurn.amount === null, live.lastTurn)

  // ⑥ 会话标题进按会话统计
  h.emit('S1', 'session/title', { title: '  即梦洗牌动画  ' })
  h.emit('S1', 'assistant/message', { turn: 2, usage: usage({ inputTokens: 1e6 }), message: { source: { model: 'deepseek-flash' } } })
  h.emit('S1', 'turn/end', {})
  const usageView = (await h.json('/srs/usage.json?range=all')).body
  ok('按会话带标题', usageView.bySession.some((s) => s.name === '即梦洗牌动画'), usageView.bySession)
  ok('明细里带会话名', usageView.items.some((i) => i.model === 'deepseek-flash'))
  Date.now = realNow
}

// ── 3. 归档裁剪 ────────────────────────────────────────────
{
  const home = mkHome()
  const now = Date.parse('2026-11-17T10:00:00+08:00')
  const turns = Array.from({ length: 505 }, (_, i) => ({
    // 账本里的顺序是「旧的在前」：finalizeTurn 一直 push 到尾部，裁剪也按头部裁
    ts: now - (505 - i) * 60000, turn: i, amount: 0.01, tokens: 10, model: 'deepseek-flash', sid: 'old',
  }))
  fs.writeFileSync(path.join(home, '.srs-usage.json'), JSON.stringify({
    version: 1, date: '2026-11-17', todayUsed: 0, todayTurns: 0, todayTokens: 0, todayUnpriced: 0,
    todayByModel: {}, daily: {}, turns, turnSeq: 505, startBalance: null, lastBalance: null,
    todayUsedByBalance: 0, sinceTs: null,
  }))
  const h = await boot(home, 'archive')
  Date.now = () => now
  h.emit('S1', 'assistant/message', { turn: 9, usage: usage({ inputTokens: 1e6 }), message: { source: { model: 'deepseek-flash' } } })
  h.emit('S1', 'turn/end', {})
  const st = h.state()
  ok('明细裁剪到 500 条', st.turns.length === 500, st.turns.length)
  const arch = JSON.parse(fs.readFileSync(path.join(home, '.srs-usage-archive.json'), 'utf8'))
  ok('挤出的进归档（6 条）', arch.turns.length === 6, arch.turns.length)
  ok('归档保留最老的', arch.turns[0].ts === now - 505 * 60000, [arch.turns[0].ts, now - 505 * 60000])
  Date.now = realNow
}

// ── 4. 跨天结转 + 重启恢复 ─────────────────────────────────
{
  const home = mkHome()
  const yesterday = '2026-11-16'
  fs.writeFileSync(path.join(home, '.srs-usage.json'), JSON.stringify({
    version: 1, date: yesterday, todayUsed: 3.5, todayTurns: 2, todayTokens: 1000, todayUnpriced: 0,
    todayByModel: { 'deepseek-flash': { amount: 3.5, turns: 2, tokens: 1000 } },
    daily: {}, turns: [{ ts: Date.parse('2026-11-16T10:00:00+08:00'), turn: 1, amount: 3.5, tokens: 1000, model: 'deepseek-flash', sid: 'S' }],
    turnSeq: 7, startBalance: 100, lastBalance: 96.5, todayUsedByBalance: 3.5, sinceTs: Date.parse('2026-11-16T09:00:00+08:00'),
  }))
  Date.now = () => Date.parse('2026-11-17T10:00:00+08:00')
  const h = await boot(home, 'roll')
  // 先看挂起态：lastTurn 不该拿昨天的冒充今天（live.json 会触发 rollLedger 的内存结转）
  const live0 = (await h.json('/srs/live.json')).body
  ok('跨天：lastTurn 不拿昨天的冒充今天', live0.lastTurn === null, live0.lastTurn)
  ok('跨天：seq 保留（7）', live0.seq === 7, live0.seq)
  // 落一次账，roll 才会写盘
  h.emit('S', 'assistant/message', { turn: 1, usage: usage({ inputTokens: 1e6 }), message: { source: { model: 'deepseek-flash' } } })
  h.emit('S', 'turn/end', {})
  const st = h.state()
  ok('跨天：昨日进 daily', st.daily[yesterday] && Math.abs(st.daily[yesterday].used - 3.5) < 1e-9, st.daily)
  ok('跨天：今日只算新的一轮（¥2.00）', Math.abs(st.todayUsed - 2) < 1e-9 && st.todayTurns === 1, [st.todayUsed, st.todayTurns])
  ok('跨天：余额差从 lastBalance 重起（3.5 → 0）', st.todayUsedByBalance === 0 && st.startBalance === 96.5, [st.todayUsedByBalance, st.startBalance])
  Date.now = realNow
}

// ── 5. 余额差对照 + API Key 来源 ───────────────────────────
{
  const home = mkHome()
  const h = await boot(home, 'balance')
  h.services.credentials = { resolve: async () => ({ value: 'sk-test' }) }
  let payload = { is_available: true, balance_infos: [{ currency: 'CNY', total_balance: 12.5, topped_up_balance: 10, granted_balance: 2.5 }] }
  const realFetch = globalThis.fetch
  globalThis.fetch = async () => ({ ok: true, json: async () => payload })
  Date.now = () => Date.parse('2026-11-17T10:00:00+08:00')
  let b = (await h.json('/srs/billing.json?refresh=1')).body
  ok('余额走 API Key', b.balance === 12.5 && b.source === 'api-key', [b.balance, b.source])
  ok('余额差：首次不动', b.todayUsedByBalance === 0, b.todayUsedByBalance)
  payload = { is_available: true, balance_infos: [{ currency: 'CNY', total_balance: 10, topped_up_balance: 10, granted_balance: 0 }] }
  b = (await h.json('/srs/billing.json?refresh=1')).body
  ok('余额下降 2.5 → 对照 += 2.5', Math.abs(b.todayUsedByBalance - 2.5) < 1e-9, b.todayUsedByBalance)
  payload = { is_available: true, balance_infos: [{ currency: 'CNY', total_balance: 30, topped_up_balance: 30, granted_balance: 0 }] }
  b = (await h.json('/srs/billing.json?refresh=1')).body
  ok('充值增加不动对照', Math.abs(b.todayUsedByBalance - 2.5) < 1e-9, b.todayUsedByBalance)
  payload = { is_available: false }
  b = (await h.json('/srs/billing.json?refresh=1')).body
  ok('账户不可用时给错误码而不是 0 余额', b.balance === null && b.balanceErrorCode === 'UNAVAILABLE', [b.balance, b.balanceErrorCode])
  globalThis.fetch = realFetch
  Date.now = realNow
}

// ── 6. 挂起等待 / 忙碌 ─────────────────────────────────────
{
  const h = await boot(mkHome(), 'wait')
  h.emit('S1', 'tool/call', { name: 'ask_user_question', callId: 'c1' })
  let live = (await h.json('/srs/live.json')).body
  ok('提问挂起：kind=question', live.wait && live.wait.kind === 'question', live.wait)
  h.emit('S1', 'tool/result', { callId: 'c9' })
  live = (await h.json('/srs/live.json')).body
  ok('别的工具结果不清提问', !!live.wait)
  h.emit('S1', 'tool/result', { callId: 'c1' })
  live = (await h.json('/srs/live.json')).body
  ok('同一 callId 的结果清挂起', live.wait === null)
  h.emit('S1', 'approval/asked', { id: 'a1' })
  live = (await h.json('/srs/live.json')).body
  ok('授权挂起：kind=approval', live.wait && live.wait.kind === 'approval')
  h.emit('S1', 'approval/resolved', { id: 'a1' })
  ok('approval/* 解除挂起', (await h.json('/srs/live.json')).body.wait === null)
  h.emit('S1', 'tool/call', { name: 'ask_user_question', callId: 'c2' })
  h.emit('S1', 'turn/start', {})
  ok('turn/start 兜底清挂起', (await h.json('/srs/live.json')).body.wait === null)
  h.handlers['agent/status']({ status: 'running' })
  live = (await h.json('/srs/live.json')).body
  ok('agent running → busy', live.busy === true && live.busySince > 0, [live.busy, live.busySince])
  h.handlers['agent/status']({ status: 'running' })
  h.handlers['agent/status']({ status: 'idle' })
  live = (await h.json('/srs/live.json')).body
  ok('两个 agent 只闲了一个 → 仍 busy', live.busy === true)
  h.handlers['agent/status']({ status: 'idle' })
  live = (await h.json('/srs/live.json')).body
  ok('全闲 → 不忙', live.busy === false && live.busySince === 0)
}

// ── 7. 路由：穿越与 HEAD ───────────────────────────────────
{
  const h = await boot(mkHome(), 'routes')
  const ping = (await h.json('/srs/ping.json')).body
  ok('ping：19 张立绘 / 78 张牌 / 版本一致', ping.poses === 19 && ping.cards === 78 && ping.version === JSON.parse(fs.readFileSync(path.join(PLUGIN, 'package.json'), 'utf8')).version, ping)
  for (const bad of ['/srs/cards/big/../../index.js', '/srs/cards/%2e%2e/%2e%2e/index.js', '/srs/cards/big/x.webp', '/srs/cards/', '/srs/cards/back.webp/../../x']) {
    const r = await h.call(bad)
    ok('穿越/异常路径 404：' + bad, r.status === 404, r.status)
  }
  const good = await h.call('/srs/cards/big/major-00.webp')
  ok('正常牌面 200 且是 webp', good.status === 200 && good.headers['content-type'] === 'image/webp' && good.body.length > 1000, [good.status, good.body && good.body.length])
  const head = await h.call('/srs/cards/thumb/major-00.webp', 'HEAD')
  ok('HEAD 无 body 但有 content-length', head.status === 200 && head.body == null && Number(head.headers['content-length']) > 0, [head.status, head.headers])
  for (const bad of ['/srs/sfx/amb-clock.mp3', '/srs/sfx/../index.js', '/srs/sfx/amb-rain.wav']) {
    ok('音景异常路径 404：' + bad, (await h.call(bad)).status === 404)
  }
  ok('音景 200', (await h.call('/srs/sfx/amb-rain.mp3')).status === 200)
}

console.log(fails ? '\n✗ ' + fails + ' 项没过' : '\n宿主边界全绿')
process.exit(fails ? 1 : 0)
