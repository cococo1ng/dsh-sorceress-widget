import fs from 'node:fs'
import path from 'node:path'
import { buildHepan } from '../../../../dsh-kuitan-tianji/engine/hepan.js'
import { buildBazi } from '../../../../dsh-kuitan-tianji/engine/bazi.js'

const ROOT = 'E:/UserData/dsh-workspace/_tools/sorceress-widget'
const readJson = (n) => JSON.parse(fs.readFileSync(path.join(ROOT, 'data', n), 'utf8'))

function loadClient() {
  const src = fs.readFileSync(path.join(ROOT, 'src', 'client.template.js'), 'utf8')
  const from = src.indexOf('factory(require) {')
  const to = src.indexOf('function Widget() {')
  let region = src.slice(from + 'factory(require) {'.length, to)
  const stubs = {
    __SRS_VERSION__: 'test',
    __DECK_JSON__: JSON.stringify(readJson('deck.json')),
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
  new Function('require', region + ';globalThis.__C={fourPillars,strengthOf}')(() => ({ createElement: () => null }))
  return globalThis.__C
}

const C = loadClient()

// 伪随机但可复现
let seed = 20261121
const rnd = () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff
  return seed / 0x7fffffff
}

const rows = []
for (let i = 0; i < 300; i += 1) {
  const y = 1960 + Math.floor(rnd() * 60)
  const m = 1 + Math.floor(rnd() * 12)
  const d = 1 + Math.floor(rnd() * 28)
  const hh = Math.floor(rnd() * 24)
  const iso = y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0')
  const tm = String(hh).padStart(2, '0') + ':00'
  const p = C.fourPillars(iso, tm)
  const st = C.strengthOf(p)
  let kitLevel = null
  try {
    const b = buildBazi({ year: y, month: m, day: d, hour: hh, minute: 0, gender: 'male' })
    kitLevel = b.strength && b.strength.level
  } catch (e) { continue }
  if (!kitLevel) continue
  rows.push({ points: st.points, ours: st.strong, kit: kitLevel === '身强' || kitLevel === '偏强' })
}

console.log('样本 ' + rows.length + ' 组')
// 各分值的 kuitan 判定分布
const byPoint = {}
for (const r of rows) {
  if (!byPoint[r.points]) byPoint[r.points] = { n: 0, strong: 0 }
  byPoint[r.points].n += 1
  if (r.kit) byPoint[r.points].strong += 1
}
console.log('\n分值 → kuitan 判为身强的比例：')
Object.keys(byPoint).map(Number).sort((a, b) => a - b).forEach((k) => {
  const v = byPoint[k]
  console.log('  ' + String(k).padStart(2) + ' 分  n=' + String(v.n).padStart(3)
    + '  强占比 ' + ((v.strong / v.n) * 100).toFixed(0) + '%')
})

console.log('\n阈值一致率：')
let best = { t: 5, acc: 0 }
for (let t = 2; t <= 8; t += 1) {
  let hit = 0
  for (const r of rows) if ((r.points >= t) === r.kit) hit += 1
  const acc = hit / rows.length
  if (acc > best.acc) best = { t, acc }
  console.log('  ≥' + t + ' 判强  → 一致率 ' + (acc * 100).toFixed(1) + '%')
}
console.log('\n最佳阈值：≥' + best.t + '（一致率 ' + (best.acc * 100).toFixed(1) + '%）')
