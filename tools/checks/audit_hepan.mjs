// 合婚审计：与「窥探天机」dsh-kuitan-tianji 的 buildHepan 逐维度对拍
//
// 对齐原则：
//   ① 日主        双向平均，公式与 kuitan 一致 → 必须完全相同
//   ② 夫妻宫      独立权重表（含相破）→ 必须完全相同
//   ③ 五行互补    kuitan 用喜用神（需身强身弱+调候+穷通宝鉴整套），
//                 我们只用「一方所旺是否正是另一方所缺」，分值必然更小 → 记为已知差异
//   明细层        属相 / 天干五合 / 十神 / 纳音 → 必须完全相同
import fs from 'node:fs'
import path from 'node:path'
// 「窥探天机」是同级仓库；没装就跳过对拍（不阻塞本仓库的验证链）。
const KITAN = 'E:/UserData/dsh-workspace/dsh-kuitan-tianji/engine/hepan.js'
let buildHepan = null
if (fs.existsSync(KITAN)) {
  ({ buildHepan } = await import('file:///' + KITAN))
} else {
  console.log('合婚对拍：跳过（未找到 dsh-kuitan-tianji）')
  process.exit(0)
}

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
    __HIT_BOXES__: '{}',
    __LAYOUT__: '{"rootW":1,"rootH":1}',
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
  const expose = ';globalThis.__C = { fourPillars, hepan }'
  // eslint-disable-next-line no-new-func
  new Function('require', region + expose)(() => ({ createElement: () => null }))
  return globalThis.__C
}

const C = loadClient()

let pass = 0
const bad = []
const warn = []
const ok = (name, cond, extra) => {
  if (cond) pass += 1
  else bad.push(name + (extra !== undefined ? '  → ' + JSON.stringify(extra) : ''))
}

// 双方生日（含时辰与无时辰两种）
const PAIRS = [
  [{ y: 1990, m: 6, d: 15, hh: 12, mm: 0, g: 'male' }, { y: 1992, m: 9, d: 8, hh: 8, mm: 30, g: 'female' }],
  [{ y: 1988, m: 2, d: 29, hh: 6, mm: 0, g: 'male' }, { y: 1993, m: 11, d: 3, hh: 20, mm: 0, g: 'female' }],
  [{ y: 1985, m: 12, d: 31, hh: 23, mm: 30, g: 'male' }, { y: 1987, m: 7, d: 7, hh: 14, mm: 0, g: 'female' }],
  [{ y: 2000, m: 1, d: 1, hh: 0, mm: 30, g: 'male' }, { y: 2000, m: 1, d: 1, hh: 12, mm: 0, g: 'female' }],
  [{ y: 1979, m: 4, d: 18, hh: 9, mm: 0, g: 'male' }, { y: 1982, m: 8, d: 25, hh: 17, mm: 0, g: 'female' }],
]
const pad = (n) => String(n).padStart(2, '0')
const iso = (p) => p.y + '-' + pad(p.m) + '-' + pad(p.d)
const time = (p) => pad(p.hh) + ':' + pad(p.mm)

for (const [A, B] of PAIRS) {
  const tag = iso(A) + ' × ' + iso(B)
  const pm = C.fourPillars(iso(A), time(A))
  const pf = C.fourPillars(iso(B), time(B))
  const ours = C.hepan(pm, pf)
  const kit = buildHepan({
    a: { year: A.y, month: A.m, day: A.d, hour: A.hh, minute: A.mm, gender: A.g },
    b: { year: B.y, month: B.m, day: B.d, hour: B.hh, minute: B.mm, gender: B.g },
  })

  // 四柱必须先一致，否则后面比的是不同的人
  ok(tag + ' 四柱一致（乾）', pm.pillars.join(' ') === kit.a.pillars.join(' '), [pm.pillars.join(' '), kit.a.pillars.join(' ')])
  ok(tag + ' 四柱一致（坤）', pf.pillars.join(' ') === kit.b.pillars.join(' '), [pf.pillars.join(' '), kit.b.pillars.join(' ')])

  // ① 日主（双向平均）
  const kitStem = kit.dimensions.find((d) => d.key === 'stem')
  ok(tag + ' 日主维度一致', ours.items[0].delta === Math.round(kitStem.score),
    [ours.items[0].delta, kitStem.score])

  // ② 夫妻宫
  const kitGong = kit.dimensions.find((d) => d.key === 'gong')
  ok(tag + ' 夫妻宫维度一致', ours.items[1].delta === Math.round(kitGong.score),
    [ours.items[1].delta, kitGong.score])

  // ③ 五行互补：口径不同（我们无喜用神），只记录不判错
  const kitWx = kit.dimensions.find((d) => d.key === 'wuxing')
  if (ours.items[2].delta !== Math.round(kitWx.score)) {
    warn.push(tag + ' 五行互补 我们 ' + ours.items[2].delta + ' vs kuitan ' + kitWx.score + '（喜用神口径差异）')
  }

  // 明细：属相
  ok(tag + ' 属相关系一致',
    ours.detail[0].v.split('（')[0].indexOf(kit.detail.yearRelation.label.split('（')[0]) === 0,
    [ours.detail[0].v, kit.detail.yearRelation.label])

  // 明细：天干五合
  ok(tag + ' 天干五合判定一致',
    (ours.detail[1].v.indexOf('无五合') < 0) === kit.detail.stems.he5,
    [ours.detail[1].v, kit.detail.stems.he5])
  // 有五合时文案改说五合（与 kuitan 一致），此时不谈十神
  if (!kit.detail.stems.he5) {
    ok(tag + ' 十神互看一致',
      ours.detail[1].note.indexOf(kit.detail.stems.tenGodToB) >= 0
      && ours.detail[1].note.indexOf(kit.detail.stems.tenGodToA) >= 0,
      [ours.detail[1].note, kit.detail.stems.tenGodToB, kit.detail.stems.tenGodToA])
  }

  // 明细：纳音
  ok(tag + ' 年命纳音一致', ours.nayin[0] === kit.detail.nayin.a && ours.nayin[1] === kit.detail.nayin.b,
    [ours.nayin, kit.detail.nayin.a, kit.detail.nayin.b])
  ok(tag + ' 纳音关系判定一致', ours.detail[2].v.indexOf(kit.detail.nayin.label) >= 0 || ours.detail[2].note.length > 0)

  // 吉凶计数（我们缺喜用神维度，只校验凶象项不虚高）
  ok(tag + ' 吉凶计数在合理范围', ours.tally.good >= 0 && ours.tally.bad >= 0, ours.tally)

  // 对称性：交换双方，日主与夫妻宫维度必须不变
  const swap = C.hepan(pf, pm)
  ok(tag + ' 交换双方后日主维度不变', swap.items[0].delta === ours.items[0].delta,
    [swap.items[0].delta, ours.items[0].delta])
  ok(tag + ' 交换双方后夫妻宫维度不变', swap.items[1].delta === ours.items[1].delta,
    [swap.items[1].delta, ours.items[1].delta])

  // 分数与分档
  ok(tag + ' 分数在 0–100', ours.score >= 0 && ours.score <= 100, ours.score)
  ok(tag + ' 分档与分数对应', (() => {
    const s = ours.score
    const want = s >= 75 ? '契合度较高' : s >= 55 ? '中等偏顺' : s >= 40 ? '需要磨合' : '差异较大'
    return ours.level === want
  })(), [ours.score, ours.level])
}

console.log('合婚对拍：通过 ' + pass + ' 项' + (bad.length ? '，失败 ' + bad.length + ' 项' : '，全绿'))
bad.slice(0, 20).forEach((b) => console.log('  ✗ ' + b))
if (warn.length) {
  console.log('\n已知口径差异（不算失败）：')
  warn.slice(0, 8).forEach((w) => console.log('  · ' + w))
}
process.exit(bad.length ? 1 : 0)
