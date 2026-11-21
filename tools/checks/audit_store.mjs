// 状态与存储审计：配置迁移 / 导出导入 / 历史与许愿上限 / 每日锁牌 / 月相提醒状态
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
  const expose = `;globalThis.__C = { loadCfg, saveCfg, DEFAULT_CFG, pushHistory, loadWishes, saveWishes,
    loadMoonRemind, saveMoonRemind, strHash, isoDay, localDayKey, daysUntil, wishOpenDay, nextMoonDay,
    moonDayKind, isNewMoonDay, isFullMoonDay, HIST_KEY, HIST_MAX, WISH_KEY, CFG_KEY }`
  // eslint-disable-next-line no-new-func
  new Function('require', region + expose)(() => ({ createElement: () => null }))
  return { C: globalThis.__C, store }
}

const { C, store } = loadClient()
const eng = createEngine()

let pass = 0
const bad = []
const ok = (name, cond, extra) => {
  if (cond) pass += 1
  else bad.push(name + (extra !== undefined ? '  → ' + JSON.stringify(extra).slice(0, 240) : ''))
}
const reset = () => store.clear()

// ── ① 配置：默认 / 坏数据 / 往返 ──
reset()
const d0 = C.loadCfg()
ok('空存储读出厂默认', d0 && d0.scale === 1.0 && d0.talk === 'normal', d0 && [d0.scale, d0.talk])
ok('默认值全部就位', JSON.stringify(Object.keys(d0).sort()) === JSON.stringify(Object.keys(C.DEFAULT_CFG).sort()),
  [Object.keys(d0).sort(), Object.keys(C.DEFAULT_CFG).sort()])

reset()
store.set(C.CFG_KEY, '{坏 JSON')
ok('坏 JSON 回落到默认', C.loadCfg().scale === 1.0)

reset()
store.set(C.CFG_KEY, JSON.stringify({ sound: true, bubble: false, soundVol: 40, bubbleMs: 9000 }))
const mig = C.loadCfg()
ok('老布尔 sound 迁成对象', mig.sound.on === true && mig.sound.volume === 40, mig.sound)
ok('老布尔 bubble 迁成对象', mig.bubble.on === false && mig.bubble.holdSec === 9, mig.bubble)

reset()
store.set(C.CFG_KEY, JSON.stringify({ remind: { on: true, hh: 99, mm: -3 }, bill: { warnLow: -5, budget: 999999 } }))
const oor = C.loadCfg()
ok('提醒时间越界收回 21:00', oor.remind.hh === 21 && oor.remind.mm === 0, oor.remind)
ok('计费越界收回默认', oor.bill.warnLow === C.DEFAULT_CFG.bill.warnLow && oor.bill.budget === C.DEFAULT_CFG.bill.budget, oor.bill)

// 往返：改完保存再读回，深层结构不能丢
reset()
const cfg = C.loadCfg()
cfg.scale = 1.3
cfg.sound.tracks.shuffle = false
cfg.amb.tracks.rain = true
cfg.react.tool = false
C.saveCfg(cfg)
const back = C.loadCfg()
ok('保存后读回：标量一致', back.scale === 1.3)
ok('保存后读回：嵌套 sound 一致', back.sound.tracks.shuffle === false)
ok('保存后读回：嵌套 amb 一致', back.amb.tracks.rain === true)
ok('保存后读回：react 一致', back.react.tool === false)

// ── ② 历史：上限与结构 ──
reset()
ok('HIST_MAX 为 200', C.HIST_MAX === 200, C.HIST_MAX)
for (let i = 0; i < 230; i += 1) {
  C.pushHistory({ t: 1000 + i, id: 'major-00', name: '愚者', spread: 'one', seed: i, reversed: false })
}
const hist = JSON.parse(store.get(C.HIST_KEY))
ok('历史超过 200 条自动截断', hist.length === 200, hist.length)
ok('历史保留的是最新的（头部为最后写入）', hist[0].t === 1000 + 229, hist[0].t)
ok('历史条目结构完整', hist.every((x) => x && x.t !== undefined && x.id && x.spread), hist[0])

// ── ③ 许愿瓶：上限与结构 ──
reset()
const big = []
for (let i = 0; i < 60; i += 1) big.push({ id: i, text: 'w' + i, when: 'newmoon', at: '2026-11-01', openAt: '2026-12-09', openedAt: '', fate: null })
C.saveWishes(big)
const wl = C.loadWishes()
ok('许愿最多存 40 条', wl.length === 40, wl.length)
ok('缺少 openAt 的记录被过滤', C.loadWishes().every((w) => w.openAt))
reset()
store.set(C.WISH_KEY, JSON.stringify([{ id: 1, text: 'a', openAt: '2026-12-09', at: '2026-11-01' }]))
const migW = C.loadWishes()
ok('老愿望补 fate=null（不猜收下/放下）', migW[0].fate === null, migW[0].fate)
ok('老愿望补 reviewedAt=null', migW[0].reviewedAt === null, migW[0].reviewedAt)
// id=0 也是合法记录，不能被真值判断丢掉（曾经会被 filter 误删）
reset()
store.set(C.WISH_KEY, JSON.stringify([{ id: 0, text: 'zero', openAt: '2026-12-09', at: '2026-11-01' }]))
ok('id=0 的愿望不会被丢', C.loadWishes().length === 1, C.loadWishes().length)

// ── ④ 月相提醒状态独立于每日提醒 ──
reset()
C.saveMoonRemind({ d: '2026-11-21', t: 1, kind: 'fullmoon' })
ok('月相提醒状态能存能读', (C.loadMoonRemind() || {}).kind === 'fullmoon', C.loadMoonRemind())
ok('月相提醒用独立键，不污染每日提醒', store.get('srs.moonremind.v1') !== undefined && store.get('srs.remind.v1') === undefined)

// ── ⑤ 每日锁牌：同一天恒定、跨天变化（宿主 dailyCard）──
const dayA = new Date('2026-11-21T09:00:00')
const dayA2 = new Date('2026-11-21T23:00:00')
const dayB = new Date('2026-11-22T09:00:00')
const dA = eng.dailyCard(dayA)
const dA2 = eng.dailyCard(dayA2)
const dB = eng.dailyCard(dayB)
ok('每日一牌同一天恒定', dA.card.id === dA2.card.id && dA.reversed === dA2.reversed, [dA.card.id, dA2.card.id])
ok('每日一牌跨天会变', dA.card.id !== dB.card.id || dA.reversed !== dB.reversed, [dA.card.id, dB.card.id])
ok('每日一牌 day 键为日期', /^\d{4}-\d{2}-\d{2}$/.test(dA.day), dA.day)

// ── ⑥ 许愿到期日：必须晚于今天、且落在正确月相 ──
const openNew = C.wishOpenDay('newmoon')
const openFull = C.wishOpenDay('fullmoon')
ok('新月到期日晚于今天', C.daysUntil(openNew) > 0, openNew)
ok('满月到期日晚于今天', C.daysUntil(openFull) > 0, openFull)
ok('新月到期日命中新月判定', C.moonDayKind(new Date(openNew + 'T12:00:00')) === 'newmoon', openNew)
ok('满月到期日命中满月判定', C.moonDayKind(new Date(openFull + 'T12:00:00')) === 'fullmoon', openFull)
ok('30 天档 = 今天 +30', C.daysUntil(C.wishOpenDay('d30')) === 30, C.wishOpenDay('d30'))
ok('没填生日时生日档返回 null', C.wishOpenDay('birthday', '') === null, C.wishOpenDay('birthday', ''))

// ── ⑦ strHash 稳定性与分布 ──
ok('strHash 同输入同输出', C.strHash('abc') === C.strHash('abc'))
ok('strHash 输出为 32 位无符号', C.strHash('abc') >>> 0 === C.strHash('abc'))
const buckets = new Array(16).fill(0)
for (let i = 0; i < 16000; i += 1) buckets[C.strHash('k' + i) % 16] += 1
const mn = Math.min(...buckets); const mx = Math.max(...buckets)
ok('strHash 16 桶分布不偏（' + mn + '–' + mx + '，期望 1000）', mn > 850 && mx < 1150, [mn, mx])

console.log('状态层：通过 ' + pass + ' 项' + (bad.length ? '，失败 ' + bad.length + ' 项' : '，全绿'))
bad.slice(0, 20).forEach((b) => console.log('  ✗ ' + b))
process.exit(bad.length ? 1 : 0)
