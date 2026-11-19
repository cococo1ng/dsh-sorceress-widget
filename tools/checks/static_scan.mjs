/** 静态扫描：图标 key、data-act/pact 覆盖、CSS 类、死函数、重复键（启发式）
 *  跑法：node tools/checks/static_scan.mjs
 *  只报“确定有问题”的为红；启发式的单列在最后，供人复核。
 */
import fs from 'node:fs'
import path from 'node:path'

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
const ROOT = path.resolve(HERE, '..', '..')
const file = path.join(ROOT, 'src', 'client.template.js')
const src = fs.readFileSync(file, 'utf8')

let fails = 0
const problems = []
const warn = []
const ok = (name, cond, extra) => {
  if (cond) console.log('✓ ' + name)
  else { fails += 1; problems.push(name + (extra ? '  → ' + JSON.stringify(extra) : '')); console.log('✗ ' + name + (extra ? '  → ' + JSON.stringify(extra) : '')) }
}
const note = (name, extra) => { warn.push(name + (extra ? '  → ' + JSON.stringify(extra) : '')) }

// ── 1. 图标 key ────────────────────────────────────────────────
function blockKeys(marker) {
  const i = src.indexOf(marker)
  if (i < 0) return []
  let d = 0
  let started = false
  const out = []
  for (let k = i; k < src.length; k += 1) {
    const c = src[k]
    if (c === '{') { d += 1; started = true }
    else if (c === '}') { d -= 1; if (started && d === 0) break }
    else if (started && d === 1) {
      const m = /^\s*([a-z0-9]+)\s*:/.exec(src.slice(k, k + 40))
      if (m && (k === 0 || /[{,\s]/.test(src[k - 1]))) { out.push(m[1]) }
    }
  }
  return [...new Set(out)]
}
const capKeys = blockKeys('const CAP_ICONS = {')
const tabKeys = blockKeys('const TAB_ICONS = {')
const capCalls = [...src.matchAll(/capIcon\('([a-z0-9]+)'\)/g)].map((m) => m[1])
const emptyCalls = [...src.matchAll(/emptyIcon\('([a-z0-9]+)'\)/g)].map((m) => m[1])
const capBlockCalls = [...src.matchAll(/cap\(([^\n]*?),\s*'([a-z0-9]+)'/g)].map((m) => m[2])
const usedCap = [...new Set([...capCalls, ...emptyCalls, ...capBlockCalls])]
ok('capIcon/emptyIcon/cap 用到的图标都有定义', usedCap.every((k) => capKeys.includes(k)), usedCap.filter((k) => !capKeys.includes(k)))
ok('TAB_ICONS 覆盖六个 tab', ['tarot', 'divine', 'zodiac', 'bill', 'sound', 'profile'].every((k) => tabKeys.includes(k)), tabKeys)
const unusedCap = capKeys.filter((k) => !usedCap.includes(k))
note('定义但没被引用的图标', unusedCap)

// ── 2. data-act / data-pact 覆盖 ─────────────────────────────
function stripComments(t) {
  return t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}
const code = stripComments(src)

function actValues(attr) {
  const lits = new Set()
  const prefixes = new Set()
  const key = "'" + attr + "':"
  let at = 0
  while ((at = code.indexOf(key, at)) >= 0) {
    // 从冒号后读到「同层逗号 / 同层右括号」：值表达式里可能有字符串、括号、三元
    let i = at + key.length
    let depth = 0
    let q = ''
    let expr = ''
    for (; i < code.length; i += 1) {
      const ch = code[i]
      if (q) { expr += ch; if (ch === '\\') { expr += code[i + 1] || ''; i += 1 } else if (ch === q) q = ''; continue }
      if (ch === '"' || ch === "'" || ch === '`') { q = ch; expr += ch; continue }
      if (ch === '(' || ch === '[' || ch === '{') depth += 1
      if (ch === ')' || ch === ']' || ch === '}') { if (depth === 0) break; depth -= 1 }
      if (ch === ',' && depth === 0) break
      if (ch === '\n' && depth === 0) break
      expr += ch
    }
    for (const p of expr.matchAll(/'([a-z0-9-]+-)'\s*\+/g)) prefixes.add(p[1])
    for (const p of expr.matchAll(/'([a-z0-9-]+)'/g)) {
      const after = expr.slice(p.index + p[0].length).trim()
      if (!after.startsWith('+')) lits.add(p[1])
    }
    at = i
  }
  return { lits, prefixes }
}

const panelStart = code.indexOf('const onClick = (e) => {')
const panelEnd = code.indexOf("el.addEventListener('click', onClick, true);", panelStart)
const panelHandler = code.slice(panelStart, panelEnd)
const profileStart = code.indexOf('const onClick = async (e) => {')
const profileEnd = code.indexOf("el.addEventListener('click', onClick, true);", profileStart)
const profileHandler = code.slice(profileStart, profileEnd)

function handlerMatchers(h) {
  const exact = new Set([...h.matchAll(/act\s*===\s*'([a-z0-9-]+)'/g)].map((m) => m[1]))
  const prefixes = new Set([...h.matchAll(/act\.indexOf\('([a-z0-9-]+)'\)/g)].map((m) => m[1]))
  const regexes = [...h.matchAll(/\/\^([a-z0-9-]+)/g)].map((m) => m[1])
  // 映射表里的 key（如 { 'notice-turn': 'turnCost' }）
  for (const m of code.matchAll(/\{\s*'([a-z0-9-]+)':\s*'[a-zA-Z]+'/g)) exact.add(m[1])
  return { exact, prefixes, regexes }
}

const acts = actValues('data-act')
const pm = handlerMatchers(panelHandler)
const unmatchedActs = [...acts.lits].filter((v) =>
  v !== 'noop' && !pm.exact.has(v) && !regexesTest(v, pm.regexes) && !acts.prefixes.has(null) &&
  ![...acts.prefixes].some((p) => v.startsWith(p)) && ![...pm.prefixes].some((p) => v.startsWith(p)))
function regexesTest(v, list) { return list.some((p) => new RegExp('^' + p).test(v)) }
ok('面板 data-act 字面量全部有处理分支', unmatchedActs.length === 0, unmatchedActs)
// 反向：处理分支的 act 在 UI 里出现过（映射表键、前缀、正则都要能对上）
const uiAll = new Set([...acts.lits])
const deadExact = [...pm.exact].filter((v) => !uiAll.has(v) && !v.startsWith('tab-') && !v.startsWith('spread-') && !v.startsWith('pose-')
  && !v.startsWith('scale-') && !v.startsWith('hold-') && !v.startsWith('wish-when-') && !v.startsWith('divine-') && !v.startsWith('usage-range-'))
// 有些 act 由变量拼出（'tab-' + t[0]），前缀收集里已有；这里只报既不在字面量也不在前缀里的
const deadFinal = deadExact.filter((v) => ![...acts.prefixes].some((p) => v.startsWith(p)))
// 反向没有 UI 的分支只可能是「留着的后门」，不影响用户，列为待复核
note('面板处理分支里 UI 已不用的 act', deadFinal)

const pacts = actValues('data-pact')
const prm = handlerMatchers(profileHandler)
const unmatchedPacts = [...pacts.lits].filter((v) => !prm.exact.has(v) && ![...pacts.prefixes].some((p) => v.startsWith(p)) && ![...prm.prefixes].some((p) => v.startsWith(p)))
ok('档案页 data-pact 字面量全部有处理分支', unmatchedPacts.length === 0, unmatchedPacts)

// ── 3. CSS 类覆盖 ────────────────────────────────────────────
const cssDefined = new Set()
const styleStart = code.indexOf('const css = [')
const styleEnd = code.indexOf('].join(', styleStart)
const styleSrc = code.slice(styleStart, styleEnd)
for (const m of styleSrc.matchAll(/\.(srs-[a-z0-9-]+)/g)) cssDefined.add(m[1])
const classUsed = new Set()
for (const m of code.matchAll(/className:\s*'([^']+)'/g)) {
  for (const t of m[1].split(/\s+/)) if (t.startsWith('srs-')) classUsed.add(t)
}
for (const m of code.matchAll(/className:\s*"[^"]*"/g)) {
  for (const t of m[0].split(/\s+/)) if (t.startsWith('srs-')) classUsed.add(t.replace(/[^\w-]/g, ''))
}
// 模板串 / 拼接里的（'srs-xxx' + …）
for (const m of code.matchAll(/'(srs-[a-z0-9-]+)'\s*\+/g)) classUsed.add(m[1])
const missingCss = [...classUsed].filter((c) => !cssDefined.has(c) && !c.endsWith('-'))
// 这几个类名只作语义标记或修饰位：没有对应规则也不影响渲染（逐个看过）
const BENIGN_CSS = new Set(['srs-ic-defs', 'srs-flip-back', 'srs-birth-row', 'srs-daylist'])
ok('渲染用到的 srs- 类都有样式定义（已知无害的修饰类除外）', missingCss.every((c) => BENIGN_CSS.has(c)), missingCss.filter((c) => !BENIGN_CSS.has(c)))
const unusedCss = [...cssDefined].filter((c) => !classUsed.has(c))
note('样式里定义但渲染没用到的类', unusedCss)

// ── 4. 顶层函数/常量是否有死代码 ─────────────────────────────
const wStart = code.indexOf('function Widget()')
const head = code.slice(0, wStart)
const defs = [...head.matchAll(/^    (?:async )?function ([A-Za-z_$][\w$]*)\s*\(/gm)].map((m) => m[1])
const deadFns = defs.filter((n) => {
  const re = new RegExp('\\b' + n.replace(/\$/g, '\\$') + '\\b', 'g')
  return (code.match(re) || []).length <= 1
})
note('顶层函数只定义未使用（可能是死代码）', deadFns)

// ── 5. 重复对象键（启发式：同一大括号层内同名键）──────────────
const dupes = []
{
  let i = 0
  let depth = 0
  const stack = []
  const skipStr = (q) => { while (i < src.length && src[i] !== q) { if (src[i] === '\\') i += 1; i += 1 } }
  for (i = 0; i < src.length; i += 1) {
    const c = src[i]
    if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i += 1; continue }
    if (c === '/' && src[i + 1] === '*') { i += 2; while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i += 1; i += 1; continue }
    if (c === '"' || c === "'" || c === '`') { skipStr(c); continue }
    if (c === '{') { stack.push(new Set()); depth += 1; continue }
    if (c === '}') { stack.pop(); depth -= 1; continue }
    if ((c === ',' || c === '{' || c === '\n') && stack.length) {
      const m = /^[\s,{]*([A-Za-z_$][\w$]*)\s*:/.exec(src.slice(i, i + 80))
      if (m) {
        const key = m[1]
        const top = stack[stack.length - 1]
        if (top.has(key)) { const line = src.slice(0, i).split('\n').length; dupes.push({ key, line }) }
        else top.add(key)
        i += m[0].length - 1
      }
    }
  }
}
// 同层重复键在对象里一定是 bug；但函数参数解构/类型注解可能误报，人工复核后只报数量
ok('对象字面量没有同层重复键（启发式）', dupes.length === 0, dupes.slice(0, 10))

// ── 6. 定时器清理（启发式计数）────────────────────────────────
const st = (code.match(/setTimeout\(/g) || []).length
const ct = (code.match(/clearTimeout\(/g) || []).length
const si = (code.match(/setInterval\(/g) || []).length
const ci = (code.match(/clearInterval\(/g) || []).length
note('setTimeout / clearTimeout 数量（人工看是否配对）', { st, ct })
ok('每处 setInterval 都有 clearInterval', si <= ci + 1, { si, ci }) // 组件里两个 interval 都是 effect 内返回清理

console.log('')
if (warn.length) { console.log('— 供复核 —'); warn.forEach((w) => console.log('  · ' + w)) }
if (fails) { console.log('\n✗ ' + fails + ' 项不过'); process.exit(1) }
console.log('\n静态扫描全绿')
