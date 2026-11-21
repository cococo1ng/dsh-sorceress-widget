import fs from 'node:fs'
import path from 'node:path'
import { buildHepan } from '../../../../dsh-kuitan-tianji/engine/hepan.js'

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
  new Function('require', region + ';globalThis.__C={fourPillars,hepan,strengthOf}')(() => ({ createElement: () => null }))
  return globalThis.__C
}

const C = loadClient()
const pad = (n) => String(n).padStart(2, '0')

const PAIRS = [
  [{ y: 1990, m: 6, d: 15, hh: 12, mm: 0, g: 'male' }, { y: 1992, m: 9, d: 8, hh: 8, mm: 30, g: 'female' }],
  [{ y: 1988, m: 2, d: 29, hh: 6, mm: 0, g: 'male' }, { y: 1993, m: 11, d: 3, hh: 20, mm: 0, g: 'female' }],
  [{ y: 1985, m: 12, d: 31, hh: 23, mm: 30, g: 'male' }, { y: 1987, m: 7, d: 7, hh: 14, mm: 0, g: 'female' }],
  [{ y: 2000, m: 1, d: 1, hh: 0, mm: 30, g: 'male' }, { y: 2000, m: 1, d: 1, hh: 12, mm: 0, g: 'female' }],
  [{ y: 1979, m: 4, d: 18, hh: 9, mm: 0, g: 'male' }, { y: 1982, m: 8, d: 25, hh: 17, mm: 0, g: 'female' }],
  [{ y: 1995, m: 3, d: 12, hh: 10, mm: 0, g: 'male' }, { y: 1996, m: 10, d: 20, hh: 15, mm: 0, g: 'female' }],
  [{ y: 1970, m: 5, d: 5, hh: 7, mm: 0, g: 'male' }, { y: 1971, m: 6, d: 6, hh: 19, mm: 0, g: 'female' }],
]

console.log('生日A        生日B        我们  分档        kuitan 分档         身强弱(我们/kuitan)')
console.log('─'.repeat(96))
let sameBand = 0
let sameStrength = 0
let sumDelta = 0
for (const [A, B] of PAIRS) {
  const iso = (p) => p.y + '-' + pad(p.m) + '-' + pad(p.d)
  const tm = (p) => pad(p.hh) + ':' + pad(p.mm)
  const pm = C.fourPillars(iso(A), tm(A))
  const pf = C.fourPillars(iso(B), tm(B))
  const ours = C.hepan(pm, pf)
  const kit = buildHepan({
    a: { year: A.y, month: A.m, day: A.d, hour: A.hh, minute: A.mm, gender: A.g },
    b: { year: B.y, month: B.m, day: B.d, hour: B.hh, minute: B.mm, gender: B.g },
  })
  const sA = C.strengthOf(pm)
  const sB = C.strengthOf(pf)
  const ourStr = (sA.strong ? '强' : '弱') + '/' + (sB.strong ? '强' : '弱')
  const kitStr = (kit.a.strength === '身强' || kit.a.strength === '偏强' ? '强' : '弱')
    + '/' + (kit.b.strength === '身强' || kit.b.strength === '偏强' ? '强' : '弱')
  const d = ours.score - kit.score.total
  sumDelta += d
  if (Math.abs(d) <= 8) sameBand += 1
  if (ourStr === kitStr) sameStrength += 1
  console.log(
    (iso(A) + ' ').padEnd(13) + (iso(B) + ' ').padEnd(13)
    + String(ours.score).padStart(4) + '  ' + ours.level.padEnd(10)
    + String(kit.score.total).padStart(6) + '  ' + String(kit.score.level).padEnd(12)
    + ourStr + ' / ' + kitStr + (ourStr === kitStr ? '  ✓' : '  ✗'),
  )
}
console.log('─'.repeat(96))
console.log('总分接近（差 ≤8）: ' + sameBand + '/' + PAIRS.length
  + ' ｜ 身强弱判定同侧: ' + sameStrength + '/' + PAIRS.length
  + ' ｜ 平均分差: ' + (sumDelta / PAIRS.length).toFixed(1))
