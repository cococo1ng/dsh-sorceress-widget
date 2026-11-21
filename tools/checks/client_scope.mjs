#!/usr/bin/env node
// 客户端「作用域 + 口径」回归测试
//
// 起因：W5 月相提醒上线后，点配置开关整个挂件消失。
// 根因是 `const SYN` 原本是 moonInfo 内部的局部常量，新加的 moonDayKind 在工厂作用域引用它，
// 一点开关就 ReferenceError，React 直接把根节点卸载。
//
// 这个测试的做法：从 client.template.js 里原样抽出这一段代码，**不额外补任何声明**，
// 直接 eval 后调用。任何「跨作用域引用未声明变量」都会立刻抛 ReferenceError。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const SRC = path.join(ROOT, 'src', 'client.template.js')
const src = fs.readFileSync(SRC, 'utf8')

let pass = 0
const fails = []
function ok(name, cond, extra) {
  if (cond) { pass += 1; console.log('  ✓ ' + name) }
  else { fails.push(name + (extra ? '  → ' + JSON.stringify(extra) : '')); console.log('  ✗ ' + name) }
}

// 按大括号配平抽出一段函数源码
function grab(marker) {
  const i = src.indexOf(marker)
  if (i < 0) throw new Error('找不到 ' + marker)
  let j = src.indexOf('{', i)
  let d = 0
  for (let k = j; k < src.length; k += 1) {
    if (src[k] === '{') d += 1
    else if (src[k] === '}') { d -= 1; if (!d) return src.slice(i, k + 1) }
  }
  throw new Error('括号不配平：' + marker)
}

// 只抽取，不补声明——这正是本测试的意义
const chunk = [
  grab('const SYN ='),
  grab('function moonInfo('),
  grab('function moonDayKind('),
  grab('function nextMoonDay('),
  grab('function isoDay('),
].join('\n')

let api = null
try {
  api = new Function(chunk + '\nreturn { moonInfo, moonDayKind, nextMoonDay, isoDay, SYN }')()
  ok('抽取段能在无外部声明的情况下求值（作用域自洽）', true)
} catch (error) {
  ok('抽取段能在无外部声明的情况下求值（作用域自洽）', false, String(error && error.message))
}

if (api) {
  const { moonInfo, moonDayKind, nextMoonDay, isoDay, SYN } = api
  ok('SYN 是模块级常量，可被各函数看到', typeof SYN === 'number' && Math.abs(SYN - 29.530588853) < 1e-9, SYN)

  // 调用不抛错
  let threw = null
  try {
    moonInfo(new Date())
    moonDayKind(new Date())
    nextMoonDay('newmoon')
  } catch (error) { threw = String(error && error.message) }
  ok('moonInfo / moonDayKind / nextMoonDay 都能正常调用', threw === null, threw)

  // 口径一致性：nextMoonDay 给出的那天，moonDayKind 必须认成同一类
  for (const kind of ['newmoon', 'fullmoon']) {
    const day = nextMoonDay(kind)
    const at = new Date(day + 'T12:00:00')
    ok('nextMoonDay(' + kind + ') = ' + day + ' 与 moonDayKind 同口径', moonDayKind(at) === kind, moonDayKind(at))
  }

  // 朔望窗口应当窄：未来 60 天里每种各命中 2 次左右（周期 29.53 天）
  let newN = 0
  let fullN = 0
  for (let i = 0; i < 60; i += 1) {
    const k = moonDayKind(new Date(Date.now() + i * 86400000))
    if (k === 'newmoon') newN += 1
    else if (k === 'fullmoon') fullN += 1
  }
  ok('未来 60 天新月命中 1–2 天（窗口不宽）', newN >= 1 && newN <= 2, newN)
  ok('未来 60 天满月命中 1–2 天（窗口不宽）', fullN >= 1 && fullN <= 2, fullN)

  // phaseIdx 只做展示：确认它比朔望窗口宽，说明两者不能混用
  let wide = 0
  for (let i = 0; i < 30; i += 1) {
    if (moonInfo(new Date(Date.now() + i * 86400000)).phaseIdx === 4) wide += 1
  }
  ok('phaseIdx===4 的覆盖天数明显宽于满月窗口（不可混用）', wide >= 2, wide)

  // isoDay 形状
  ok('isoDay 输出 YYYY-MM-DD', /^\d{4}-\d{2}-\d{2}$/.test(isoDay(new Date())), isoDay(new Date()))
}

console.log('\n通过 ' + pass + ' 项' + (fails.length ? '，失败 ' + fails.length + ' 项' : '，全绿'))
fails.forEach((f) => console.log('  · ' + f))
process.exit(fails.length ? 1 : 0)
