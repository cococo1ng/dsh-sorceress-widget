import { registerSorceressTools } from '../../plugin/srs-tools.mjs'

const regs = []
const ctx = { tools: { register: (d) => { regs.push(d); return () => {} } } }
registerSorceressTools(ctx)
const draw = regs.find((r) => r.name === 'sorceress_draw')
if (!draw) { console.log('✗ 未注册到 sorceress_draw'); process.exit(1) }

let pass = 0
const bad = []
const ok = (n, c, e) => { if (c) { pass += 1; console.log('✓ ' + n) } else { bad.push(n); console.log('✗ ' + n + '  ' + JSON.stringify(e)) } }

// 多张牌阵 + 空所问 → 必须抛错
for (const spread of ['three', 'five', 'relation', 'celtic', 'either']) {
  for (const q of ['', '   ', undefined, null]) {
    let threw = false
    let msg = ''
    try { await draw.execute({ spread, question: q }) } catch (e) { threw = true; msg = e.message }
    ok(spread + ' 空所问被拒（' + JSON.stringify(q) + '）', threw && msg.includes('question'), msg.slice(0, 60))
  }
}

// 单张 + 空所问 → 放行
for (const q of ['', '   ', undefined]) {
  let res = null
  let err = ''
  try { res = await draw.execute({ spread: 'one', question: q }) } catch (e) { err = e.message }
  ok('one 空所问放行（' + JSON.stringify(q) + '）', !!res && res.cards.length === 1, err || '无结果')
}

// 填了所问 → 多张也放行，且问题原样进解读
const withQ = await draw.execute({ spread: 'three', question: '  要不要换工作  ' })
ok('three 填了所问能抽', withQ && withQ.cards.length === 3)
ok('所问被 trim 后带入', (withQ.text || '').includes('要不要换工作') && !(withQ.text || '').includes('  要不要'))

// 默认 spread（不传）行为：默认 three → 空所问必须被拒
let defaultThrew = false
try { await draw.execute({}) } catch (e) { defaultThrew = true }
ok('不传 spread（默认 three）空所问也被拒', defaultThrew)

// 描述里写明必填
ok('question 参数描述标了必填', String(draw.parameters.question.description).includes('必填'))

console.log('\n工具侧所问校验：通过 ' + pass + ' 项' + (bad.length ? '，失败 ' + bad.length : '，全绿'))
process.exit(bad.length ? 1 : 0)
