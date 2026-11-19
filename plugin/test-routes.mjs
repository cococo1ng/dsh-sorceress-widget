/**
 * 骨架自检：不用 DSH，直接把 index.js 的路由挂到假 ctx 上跑一遍。
 *   ① /srs/ping.json 返回 ok 且牌数 78
 *   ② /srs/deck.json 返回 78 条
 *   ③ /srs/cards/big/major-00.webp 发出 WebP 字节 + immutable 缓存头
 *   ④ /srs/cards/thumb/swords-09.webp、back.webp 都在
 *   ⑤ 目录穿越 / 未知路径一律 404
 *
 * 用法：node plugin/_test-routes.mjs
 */
import assert from 'node:assert/strict'
import { apply } from './index.js'
import fs from 'node:fs'
const pkgVersion = JSON.parse(fs.readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version

const routes = new Map()
const ctx = {
  effect(fn) { const off = fn(); return () => { if (typeof off === 'function') off() } },
  webServer: {
    register(route) {
      const key = route.kind + ' ' + route.path
      if (routes.has(key)) throw new Error('重复路由 ' + key)
      routes.set(key, route)
      return () => routes.delete(key)
    },
  },
}

apply(ctx)

function find(pathname) {
  const exact = routes.get('exact ' + pathname)
  if (exact) return exact
  let best = null
  for (const [key, route] of routes) {
    if (!key.startsWith('prefix ')) continue
    const prefix = route.path
    if (pathname !== prefix && !pathname.startsWith(prefix + '/')) continue
    if (!best || prefix.length > best.path.length) best = route
  }
  return best
}

function call(pathname, method = 'GET') {
  const route = find(pathname)
  return new Promise((resolve) => {
    const out = { status: 0, headers: {}, body: null }
    const res = {
      writeHead(status, headers) { out.status = status; Object.assign(out.headers, headers || {}) },
      end(chunk) { out.body = chunk === undefined ? null : chunk; resolve(out) },
    }
    const req = { url: pathname, method }
    if (!route) { resolve({ status: 404, headers: {}, body: 'no route' }); return }
    const r = route.handler(req, res, undefined, undefined)
    if (r && typeof r.then === 'function') r.catch(() => resolve({ status: 599, headers: {}, body: 'rejected' }))
  })
}

let pass = 0
function ok(name, cond) {
  if (!cond) { console.error('❌ ' + name); process.exitCode = 1; return }
  pass += 1
  console.log('✓ ' + name)
}

// ① ping
const ping = await call('/srs/ping.json')
const pingBody = JSON.parse(ping.body)
ok('ping 200', ping.status === 200)
ok('ping ok=true', pingBody.ok === true)
ok('ping 版本与 package.json 一致', pingBody.version === pkgVersion, pingBody.version)
ok('ping 牌数 78', pingBody.cards === 78)
// 姿态数按目录实点（2026-11-19：原来写死 14，加到 19 张后这条一直红）
const poseCount = (await import('node:fs')).readdirSync(
  (await import('node:path')).join((await import('node:url')).fileURLToPath(new URL('.', import.meta.url)), 'assets', 'sorceress')
).filter((f) => f.toLowerCase().endsWith('.webp')).length
ok('ping 姿态数与立绘目录一致（' + poseCount + ' 张）', pingBody.poses === poseCount, pingBody.poses)

// ② deck
const deck = await call('/srs/deck.json')
const deckBody = JSON.parse(deck.body)
ok('deck 200', deck.status === 200)
ok('deck 78 张', Array.isArray(deckBody.cards) && deckBody.cards.length === 78)
ok('deck 首张愚者', deckBody.cards[0].id === 'major-00' && deckBody.cards[0].numeral === '0')

// ③ 大图
const big = await call('/srs/cards/big/major-00.webp')
ok('大图 200', big.status === 200)
ok('大图 content-type webp', /image\/webp/.test(big.headers['content-type'] || ''))
ok('大图 immutable', /immutable/.test(big.headers['cache-control'] || ''))
ok('大图 是 RIFF/WEBP 头', big.body && big.body.slice(0, 4).toString() === 'RIFF' && big.body.slice(8, 12).toString() === 'WEBP')
ok('大图 体积 > 20KB', big.body && big.body.length > 20000)

// ④ 缩略 + 牌背
const thumb = await call('/srs/cards/thumb/swords-09.webp')
ok('缩略 200', thumb.status === 200 && thumb.body.length > 4000)
const back = await call('/srs/cards/back.webp')
ok('牌背 200', back.status === 200 && back.body.length > 20000)

// ⑤ 挡穿越 / 未知
for (const bad of ['/srs/cards/../../package.json', '/srs/cards/big/../index.js', '/srs/cards/big/major-00.png', '/srs/cards/big/MAJOR-00.webp', '/srs/nope.json']) {
  const r = await call(bad)
  ok('404: ' + bad, r.status === 404)
}

// HEAD 不带 body
const head = await call('/srs/cards/back.webp', 'HEAD')
ok('HEAD 200 且无 body', head.status === 200 && head.body === null)

// ⑥ 记账播报：live.json（前端 3 秒轮询的口）与 turn.json（细粒度）
const live = await call('/srs/live.json')
const liveBody = JSON.parse(live.body)
ok('live 200', live.status === 200)
ok('live ok=true', liveBody.ok === true)
ok('live 六件齐：seq/lastTurn/live/today/wait/busy',
  ['seq', 'lastTurn', 'live', 'today', 'wait', 'busy'].every((k) => k in liveBody))
ok('live today.used 是数字', typeof liveBody.today.used === 'number')
ok('live 无挂起时 wait=null', liveBody.wait === null)
ok('live 带峰谷与版本', typeof liveBody.peak.peak === 'boolean' && liveBody.version === pkgVersion)
const turn = await call('/srs/turn.json')
const turnBody = JSON.parse(turn.body)
ok('turn 200 且 seq 是数字', turn.status === 200 && typeof turnBody.seq === 'number')
ok('turn 带 lastTurn/live/today', ['lastTurn', 'live', 'today'].every((k) => k in turnBody))

// ⑦ 环境音景（W19）：八套真实录音循环走 /srs/sfx 路由，路径白名单
for (const name of ['amb-rain', 'amb-fire', 'amb-wind', 'amb-pages',
                    'amb-night', 'amb-sea', 'amb-storm', 'amb-birds']) {
  const r = await call('/srs/sfx/' + name + '.mp3')
  ok('音景 200: ' + name, r.status === 200 && r.body.length > 15000, r.status + ' / ' + (r.body ? r.body.length : 0))
}
const rain = await call('/srs/sfx/amb-rain.mp3')
ok('音景 content-type 是 audio/mpeg', (rain.headers['content-type'] || '').indexOf('audio/mpeg') === 0, rain.headers['content-type'])
ok('音景带 immutable 缓存头', String(rain.headers['cache-control'] || '').indexOf('immutable') >= 0)
for (const bad of ['/srs/sfx/amb-nope.mp3', '/srs/sfx/../index.js', '/srs/sfx/amb-rain.wav', '/srs/sfx/']) {
  const r = await call(bad)
  ok('音景 404: ' + bad, r.status === 404, r.status)
}
const ambHead = await call('/srs/sfx/amb-fire.mp3', 'HEAD')
ok('音景 HEAD 200 且无 body', ambHead.status === 200 && ambHead.body === null)

console.log('\n通过 ' + pass + ' 项' + (process.exitCode ? '（有失败）' : '，全绿'))

