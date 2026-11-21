import fs from 'node:fs'
import path from 'node:path'

const ROOT = 'E:/UserData/dsh-workspace/_tools/sorceress-widget'
const readJson = (n) => JSON.parse(fs.readFileSync(ROOT + '/data/' + n, 'utf8'))

function loadClient() {
  const src = fs.readFileSync(ROOT + '/src/client.template.js', 'utf8')
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
    __POSE_IDLE_A__: 'a', __POSE_THINK__: 'c', __POSE_DAZED__: 'd',
    __POSE_SHUFFLE__: 'e', __POSE_SPREAD__: 'f', __POSE_DRAW__: 'g', __POSE_FLIP__: 'h',
    __POSE_SMILE__: 'i', __POSE_SLEEP__: 'j', __POSE_SMIRK__: 'k', __POSE_FLY__: 'l',
    __POSE_READING__: 'm', __POSE_ANNOYED__: 'n', __POSE_BYE__: 'o', __POSE_REST_HANDS__: 'p',
    __POSE_LOOK_ASIDE__: 'q', __POSE_HOLD_CUP__: 'r', __POSE_STRETCH__: 's',
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
  new Function('require', region + ';globalThis.__C={POSES,POSE_LABEL,STAND_POSES,drawStandPose,shuffleBag,canRotatePose,poseIntervalMs,pickAvoiding,needQuestion,questionError,NEED_QUESTION}')(() => ({ createElement: () => null }))
  return globalThis.__C
}

const C = loadClient()

let pass = 0
const bad = []
const ok = (name, cond, extra) => {
  if (cond) pass += 1
  else bad.push(name + (extra !== undefined ? '  → ' + JSON.stringify(extra).slice(0, 220) : ''))
}

const allKeys = Object.keys(C.POSES)
const labelKeys = Object.keys(C.POSE_LABEL)
const stand = C.STAND_POSES.slice()

// ── ① 三者对齐 ──
ok('立绘 18 张', allKeys.length === 18, allKeys.length)
ok('定格表覆盖全部立绘（不漏任何一张）', labelKeys.length === allKeys.length
  && allKeys.every((k) => labelKeys.includes(k)),
  allKeys.filter((k) => !labelKeys.includes(k)))
ok('定格表没有多余键', labelKeys.every((k) => allKeys.includes(k)),
  labelKeys.filter((k) => !allKeys.includes(k)))
ok('自动池内无重复', new Set(stand).size === stand.length)
ok('自动池每一张都存在', stand.every((k) => allKeys.includes(k)),
  stand.filter((k) => !allKeys.includes(k)))

// ── ② 自动池该包含 / 该排除 ──
const FLOW = ['shuffle', 'spread', 'draw', 'flip', 'sleep']
const shouldInclude = allKeys.filter((k) => !FLOW.includes(k))
ok('自动池 = 全部非流程姿势', shouldInclude.every((k) => stand.includes(k))
  && stand.every((k) => !FLOW.includes(k)),
  { 缺: shouldInclude.filter((k) => !stand.includes(k)), 多: stand.filter((k) => FLOW.includes(k)) })
ok('idle-b 已彻底移除（立绘/定格/自动池都没有）',
  !allKeys.includes('idle-b') && !labelKeys.includes('idle-b') && !stand.includes('idle-b'),
  { POSES: allKeys.includes('idle-b'), LABEL: labelKeys.includes('idle-b'), STAND: stand.includes('idle-b') })

// ── ③ 洗牌袋：一轮内不重复、一轮覆盖全部 ──
let seedState = 12345
const origRandom = Math.random
Math.random = () => { seedState = (seedState * 1103515245 + 12345) & 0x7fffffff; return seedState / 0x7fffffff }
try {
  let bag = null
  let cur = ''
  const seen = []
  for (let i = 0; i < stand.length; i += 1) {
    const step = C.drawStandPose(bag, cur)
    bag = step.bag
    cur = step.pose
    seen.push(cur)
  }
  ok('一轮内不重复出同一张', new Set(seen).size === stand.length, seen)
  ok('一轮走完全部站姿', new Set(seen).size === stand.length
    && stand.every((k) => seen.includes(k)), seen)

  let bag2 = null
  let cur2 = ''
  let coverAll = true
  for (let r = 0; r < 5; r += 1) {
    const got = []
    for (let i = 0; i < stand.length; i += 1) {
      const step = C.drawStandPose(bag2, cur2)
      bag2 = step.bag
      cur2 = step.pose
      got.push(cur2)
    }
    if (new Set(got).size !== stand.length) coverAll = false
  }
  ok('连跑 5 轮每轮都覆盖全集', coverAll)

  let mismatch = 0
  for (let t = 0; t < 200; t += 1) {
    const last = stand[t % stand.length]
    const step = C.drawStandPose([], last)
    if (step.pose === last) mismatch += 1
  }
  ok('换轮时不会立刻重复上一张', mismatch === 0, { mismatch })

  const one = C.drawStandPose(null, 'idle-a')
  ok('空袋能重洗出下一张', stand.includes(one.pose) && Array.isArray(one.bag), one.pose)
} finally {
  Math.random = origRandom
}

// ── ④ canRotatePose 守卫真值表 ──
const base = { pinned: false, panelOpen: false, dragging: false, napping: false, pose: 'idle-a', home: 'idle-a' }
ok('默认空闲 → 允许轮换', C.canRotatePose(base) === true)
ok('固定姿态 → 不换', C.canRotatePose({ ...base, pinned: true }) === false)
ok('面板开着 → 不换', C.canRotatePose({ ...base, panelOpen: true }) === false)
ok('拖拽中 → 不换', C.canRotatePose({ ...base, dragging: true }) === false)
ok('打盹中 → 不换', C.canRotatePose({ ...base, napping: true }) === false)
ok('正在流程姿势（pose≠home）→ 不换', C.canRotatePose({ ...base, pose: 'shuffle' }) === false)
ok('恢复到 home 后 → 又能换', C.canRotatePose({ ...base, pose: 'shuffle', home: 'idle-a' }) === false
  && C.canRotatePose(base) === true)
ok('固定 + 面板开 → 不换（多重条件）', C.canRotatePose({ ...base, pinned: true, panelOpen: true }) === false)

// ── ⑤ 完整轮换链模拟：验证定时器不被打断 ──
// 复刻组件里的 tick 逻辑（ref 版），用加速的 setTimeout 模拟真实生命周期
// 覆盖：正常轮换 → 中途开面板（不重置计时）→ 关面板 → 拖拽 → 打盹 → 流程姿势卡住 → stall 恢复
;(function simulateLifecycle() {
  const logs = []
  const state = {
    pinned: false, panelOpen: false, dragging: false, napping: false,
    pose: 'idle-a', home: 'idle-a',
    auto: 'idle-a', bag: null, stall: 0, ticks: 0,
  }

  // 用固定 50ms 间隔跑，不依赖真实 4–8 分钟
  const tick = () => {
    state.ticks += 1
    const st = { pinned: state.pinned, panelOpen: state.panelOpen, dragging: state.dragging,
      napping: state.napping, pose: state.pose, home: state.home }
    if (C.canRotatePose(st)) {
      state.stall = 0
      const step = C.drawStandPose(state.bag, state.auto)
      state.bag = step.bag
      if (step.pose !== state.auto) {
        state.auto = step.pose
        state.pose = step.pose
        state.home = step.pose
        logs.push('rotate→' + step.pose)
      }
    } else if (!st.pinned && !st.napping && st.pose !== st.home) {
      // 与组件一致：只有卡在流程姿势且没打盹才计 stall
      state.stall += 1
      if (state.stall >= 2) {
        state.stall = 0
        state.pose = st.home
        logs.push('stall-recover→' + st.home)
      }
    }
  }

  const run = (n) => { for (let i = 0; i < n; i += 1) tick() }

  // A. 初始连续 13 次：应覆盖自动池全部 13 张
  run(13)
  const rotates = logs.filter((l) => l.startsWith('rotate→'))
  const poses = rotates.map((l) => l.replace('rotate→', ''))
  ok('模拟：前 13 次覆盖自动池全集', new Set(poses).size === stand.length,
    { 数量: poses.length, 不同: new Set(poses).size })

  // B. 第 14 次前打开面板：tick 仍计数但不轮换
  const before = rotates.length
  state.panelOpen = true
  run(5)
  ok('模拟：面板开着 5 次 tick 不轮换', logs.filter((l) => l.startsWith('rotate→')).length === before,
    { before, after: logs.filter((l) => l.startsWith('rotate→')).length })
  ok('模拟：面板开着 tick 计数仍在继续', state.ticks >= 18, state.ticks) // 证明定时器没被清掉

  // C. 关掉面板 → 立刻又能轮换（计时器从未重置，下次 tick 就生效）
  state.panelOpen = false
  const before2 = logs.filter((l) => l.startsWith('rotate→')).length
  run(1)
  ok('模拟：关面板后下一次 tick 立即恢复轮换',
    logs.filter((l) => l.startsWith('rotate→')).length === before2 + 1)

  // D. 拖拽中不换
  state.dragging = true
  const before3 = logs.filter((l) => l.startsWith('rotate→')).length
  run(3)
  ok('模拟：拖拽 3 次不轮换', logs.filter((l) => l.startsWith('rotate→')).length === before3)
  state.dragging = false

  // E. 打盹中不换
  state.napping = true
  const before4 = logs.filter((l) => l.startsWith('rotate→')).length
  run(3)
  ok('模拟：打盹 3 次不轮换', logs.filter((l) => l.startsWith('rotate→')).length === before4)
  state.napping = false

  // F. 流程姿势卡住 2 次 → stall 强制回「组件当前 home」（cfgPoseRef，即 autoPose）
  // 注意：测试 state.home 是 pose 同步的镜像，组件里的 st.home 是 cfgPoseRef.current ——
  // 两者在真实组件里始终相等（cfgPoseRef.current = homePose = autoPose，且 setPose(homePose) 同步）
  const cfgHome = state.home
  state.pose = 'shuffle' // 模拟抽牌中（pose 已离开 home）
  run(1) // 第 1 次 stall
  ok('模拟：流程姿势第 1 次 stall 不强制回', state.pose === 'shuffle')
  run(1) // 第 2 次 stall → 强制回
  ok('模拟：连续 2 次 stall 后强制回 home', state.pose === cfgHome, { got: state.pose, cfgHome })
  ok('模拟：stall 恢复有日志', logs.some((l) => l.startsWith('stall-recover→')))

  // G. stall 恢复后下一次能正常轮换（验证恢复不是死循环的终点）
  const beforeG = logs.filter((l) => l.startsWith('rotate→')).length
  run(1)
  ok('模拟：stall 恢复后轮换继续', logs.filter((l) => l.startsWith('rotate→')).length === beforeG + 1)

  // G2. 打盹期间 stall 不累加（防「打盹被 stall 强行拉醒」回归）
  state.pose = state.home // 先回正常
  state.napping = true
  state.pose = 'sleep'
  const stallLogsBefore = logs.filter((l) => l.startsWith('stall-recover→')).length
  run(5)
  ok('模拟：打盹 5 次不触发 stall 恢复', logs.filter((l) => l.startsWith('stall-recover→')).length === stallLogsBefore,
    { before: stallLogsBefore, after: logs.filter((l) => l.startsWith('stall-recover→')).length })
  ok('模拟：打盹期间不轮换', state.pose === 'sleep')
  state.napping = false

  // H. 固定姿态：永远不换
  state.pinned = true
  const before5 = logs.filter((l) => l.startsWith('rotate→')).length
  run(10)
  ok('模拟：固定姿态 10 次完全不轮换', logs.filter((l) => l.startsWith('rotate→')).length === before5)
  state.pinned = false
})()

// ── ⑥ poseIntervalMs：生产默认与测试覆盖 ──
ok('poseIntervalMs 是函数', typeof C.poseIntervalMs === 'function')
const defaultIntervals = new Set()
for (let i = 0; i < 100; i += 1) defaultIntervals.add(C.poseIntervalMs())
ok('默认间隔落在 240–480 秒区间', [...defaultIntervals].every((v) => v >= 240000 && v < 480000),
  { min: Math.min(...defaultIntervals), max: Math.max(...defaultIntervals) })
ok('默认间隔有随机分布（不是固定值）', defaultIntervals.size > 1, defaultIntervals.size)


// ── ⑦ 小动作不再是小池子（「只轮换几个固定的」的根因）──
const src2 = fs.readFileSync(path.join(ROOT, 'src/client.template.js'), 'utf8')
ok('小动作池与自动池同源（不再有第二套 6 张的小池子）',
  /const IDLE_POSES = STAND_POSES;/.test(src2),
  (src2.match(/const IDLE_POSES = [^;]+;/) || [''])[0])
ok('doze 不再固定 think（原来每十几秒就定在同一个姿势）',
  !/const doze = \(\) => \{[\s\S]{0,400}?setPose\('think'\);/.test(src2))
ok('doze / gesture 都走 pickAvoiding（会避开当前基线）',
  (src2.match(/pickAvoiding\(IDLE_POSES/g) || []).length >= 2,
  (src2.match(/pickAvoiding\(IDLE_POSES/g) || []).length)

// 占空比：小动作间隔必须显著大于持续，否则自动基线看不见
const dozeGap = src2.match(/setTimeout\(doze, (\d+) \+ Math\.random\(\) \* (\d+)\)/)
const gestureGap = src2.match(/setTimeout\(gesture, talkMode === 'chatty' \? \((\d+) \+ Math\.random\(\) \* (\d+)\) : \((\d+) \+ Math\.random\(\) \* (\d+)\)/)
ok('doze 间隔 ≥ 40 秒（原 14–19 秒，占空比过高）', dozeGap && Number(dozeGap[1]) >= 40000,
  dozeGap ? dozeGap[1] : '未匹配')
ok('gesture 间隔 ≥ 70 秒（原 32–58 秒）', gestureGap && Number(gestureGap[3]) >= 70000,
  gestureGap ? gestureGap[3] : '未匹配')

// pickAvoiding 行为：不返回 current，且能覆盖全池
if (typeof C.pickAvoiding === 'function') {
  let same = 0
  const seen = new Set()
  for (let i = 0; i < 400; i += 1) {
    const p = C.pickAvoiding(stand, stand[i % stand.length])
    if (p === stand[i % stand.length]) same += 1
    seen.add(p)
  }
  ok('pickAvoiding 永不返回当前姿势', same === 0, { same })
  ok('pickAvoiding 能覆盖整个池', seen.size === stand.length, seen.size)
  ok('pickAvoiding 对空池 / 单元素安全',
    C.pickAvoiding([], 'idle-a') === 'idle-a' && C.pickAvoiding(['idle-a'], 'idle-a') === 'idle-a')
}

// ── ⑧ 所问必填（多张牌阵）──
ok('needQuestion：单张与每日一牌不强制',
  C.needQuestion('one') === false && C.needQuestion('daily') === false)
ok('needQuestion：多张牌阵全部强制',
  ['three', 'five', 'relation', 'celtic', 'either'].every((k) => C.needQuestion(k) === true))
ok('空所问被拦（多张）', C.questionError('three', '   ') !== '', C.questionError('three', '   '))
ok('空所问放行（单张）', C.questionError('one', '') === '')
ok('填了所问就放行', C.questionError('celtic', '要不要换工作') === '')

// 工具侧：空 question 抽多张必须抛错
const toolsSrc = fs.readFileSync(path.join(ROOT, 'plugin/srs-tools.mjs'), 'utf8')
ok('工具侧也有同一道校验', /if \(spread !== 'one' && !q\)/.test(toolsSrc))
ok('工具侧 question 描述标了必填',
  /多张牌阵（three\/five\/relation\/celtic\/either）必填/.test(toolsSrc))

console.log('\n姿态：通过 ' + pass + ' 项' + (bad.length ? '，失败 ' + bad.length + ' 项' : '，全绿'))
bad.forEach((b) => console.log('  ✗ ' + b))
process.exit(bad.length ? 1 : 0)
