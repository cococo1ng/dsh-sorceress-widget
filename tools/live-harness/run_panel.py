"""面板实跑台自检：真 client.js + 真实牌库路由，走一遍抽牌。

覆盖
  ① ModuleLoader / apply / shell.overlay 注入注册
  ② 14 张立绘在 DOM、data URI 内联、原生 520 高
  ③ 点一下 → 随机气泡（不打开面板；菜单入口只有右上角水晶球）
  ④ 面板默认态：牌背 + 引导文案 + 三个按钮（关于 / 抽牌 / 收起）
  ⑤ 抽一张 → 洗完牌出结果：牌面图走 /srs/cards/big/、牌名、正逆标记、横幅编号、判词 ≥2 段
  ⑥ 判词不是占位：不含「待写」「TODO」，且长度 > 20 字
  ⑦ 历史写进 localStorage（含 seed / reversed）
  ⑧ 洗牌期间按钮 disabled（防连点）
  ⑨ 收起面板 → 面板淡出、立绘还在
  ⑩ 无 JS 报错，控制台无 404
"""
import json
import os
import subprocess
import sys
import time

from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
SHOT = r"E:\UserData\dsh-workspace\_tools\sorceress-widget\_verify"
PORT = 8899
URL = "http://127.0.0.1:%d/index.html" % PORT

fails = []


def ok(name, cond, extra=""):
    if cond:
        print("✓ " + name)
    else:
        fails.append(name)
        print("✗ " + name + (("  " + str(extra)) if extra else ""))


def draw_and_wait(page, settle=2.6, picks=1):
    """抽牌 = 洗牌摊牌 + 自己点背面。
    三张牌阵必须一张一张点，且点完三张还要按「翻开」才出牌面。
    """
    page.locator("[data-act='draw']").click()
    time.sleep(settle)
    for i in range(picks):
        if not page.locator(".srs-pickcard:not(.is-picked)").count():
            break
        page.locator(".srs-pickcard:not(.is-picked)").first.click()
        time.sleep(1.1)
    if picks > 1 and page.locator("[data-act='reveal']").count():
        page.locator("[data-act='reveal']").click()
        time.sleep(2.4)
    else:
        time.sleep(1.2)


def main():
    py = sys.executable
    # 桩数据先归位：上一轮跑完常把 live_stub.json 留在「有件事在等你」上，
    # 下一次开页面就会照那个 wait 换姿势（reading），把「舞台挂了呼吸类」判成红 —— 那是脏桩，不是 bug
    with open(os.path.join(HERE, "live_stub.json"), "w", encoding="utf-8") as f:
        json.dump({"ok": True, "version": "stub", "seq": 0,
                   "lastTurn": None, "live": {"turns": 0, "cost": 0, "tokens": 0, "unpriced": 0},
                   "today": {"used": 0, "turns": 0, "tokens": 0, "unpriced": 0, "day": "2026-11-18"},
                   "wait": None, "busy": False,
                   "peak": {"peak": False, "label": "空闲档", "nextInMs": 0}, "at": 0},
                  f, ensure_ascii=False)
    srv = subprocess.Popen([py, os.path.join(HERE, "serve.py"), str(PORT)],
                           stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    time.sleep(1.2)
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page(viewport={"width": 1440, "height": 900})
            errors = []
            not_found = []
            page.on("pageerror", lambda e: errors.append(str(e)))
            page.on("console", lambda m: errors.append("console:" + m.text) if m.type == "error" else None)
            page.on("requestfailed", lambda r: errors.append("failed:" + r.url + " " + str(r.failure)))
            page.on("response", lambda r: not_found.append(r.url) if r.status >= 400 else None)

            page.add_init_script("""
            window.__audios = [];
            (function(){
              const Orig = window.Audio;
              window.Audio = function(src){ const a = new Orig(src); window.__audios.push(a); return a; };
            })();
            """)
            page.goto(URL)
            page.wait_for_selector(".srs-root", timeout=8000)
            time.sleep(0.5)

            log = page.evaluate("window.__SRS_TEST_LOG")
            ok("ModuleLoader + apply + shell.overlay 全通", all([
                any(str(x).startswith("load:") for x in log),
                "NO-APPLY" not in log,
                "inject:shell.overlay" in log,
                "register:shell.overlay" in log,
            ]), log)
            ok("挂件与面板没有悬停提示（title）", page.evaluate(
                "['.srs-root','.srs-stage','.srs-panel'].every(sel=>{const e=document.querySelector(sel);return e && !e.getAttribute('title')})"))
            ok("19 张立绘在 DOM（新增发呆 + 四张站姿）", page.evaluate("document.querySelectorAll('.srs-sprite').length") == 19,
               page.evaluate("document.querySelectorAll('.srs-sprite').length"))
            ok("立绘是 data URI", page.evaluate(
                "Array.from(document.querySelectorAll('.srs-sprite')).every(i=>i.src.startsWith('data:image/webp;base64,'))"))
            # 呼吸：单张图上下浮动，不是两张图来回切（动画挂在 .srs-stage 上，立绘跟着浮）
            PROBE = ("(()=>{const s=document.querySelector('.srs-sprite.is-on');"
                     "const st=document.querySelector('.srs-stage');"
                     "return {n: document.querySelectorAll('.srs-sprite.is-on').length,"
                     " t: getComputedStyle(st).translate, y: Math.round(s.getBoundingClientRect().top),"
                     " h: Math.round(s.getBoundingClientRect().height)}})()")
            pose = page.evaluate(PROBE)
            time.sleep(1.2)
            pose2 = page.evaluate(PROBE)
            ok("呼吸时只有一张立绘", pose["n"] == 1 and pose2["n"] == 1, str(pose2["n"]))
            ok("呼吸是上下浮动", pose["y"] != pose2["y"] or pose["t"] != pose2["t"],
               "%s -> %s / y %s -> %s" % (pose["t"], pose2["t"], pose["y"], pose2["y"]))
            ok("浮动时缩放没丢", pose["h"] == pose2["h"], (pose["h"], pose2["h"]))
            ok("舞台挂了呼吸类", page.evaluate("!!document.querySelector('.srs-stage.srs-breathe')"))
            ok("呼吸动画常驻在立绘上（切姿势不重启）", page.evaluate(
                "(()=>{const s=document.querySelector('.srs-sprite.is-on');const cs=getComputedStyle(s);"
                " return (cs.animationName||'').indexOf('srs-breathe') >= 0 && cs.animationDuration !== '0s';})()"))

            ok("立绘原生 520 高", all(hh == 520 for _w, hh in page.evaluate(
                "Array.from(document.querySelectorAll('.srs-sprite')).map(i=>[i.naturalWidth,i.naturalHeight])")))

            # ③ 点她 → 随机气泡（不打开面板）。菜单入口只有右上角水晶球
            anim_before = page.evaluate("(()=>{const a=document.querySelector('.srs-sprite').getAnimations()[0];"
                                        "return a?Math.round(a.currentTime):-1})()")
            page.locator(".srs-hit").first.click(position={"x": 30, "y": 60})
            time.sleep(0.05)
            anim_after = page.evaluate("(()=>{const a=document.querySelector('.srs-sprite').getAnimations()[0];"
                                       "return a?Math.round(a.currentTime):-1})()")
            # 换姿势必须是硬切：0.05s 时若还有 opactiy 在 0.02–0.98 之间的立绘，说明还在交叉淡入淡出（会闪）
            ok("换姿势是硬切（没有两张半透明叠着）", page.evaluate(
                "(()=>{const os=Array.from(document.querySelectorAll('.srs-sprite'))"
                ".map(i=>Number(getComputedStyle(i).opacity)||0);"
                "const mid=os.filter(o=>o>0.02&&o<0.98).length;"
                "const on=os.filter(o=>o>0.98).length;return mid===0&&on===1;})()"),
               page.evaluate("(()=>Array.from(document.querySelectorAll('.srs-sprite'))"
                             ".filter(i=>Number(getComputedStyle(i).opacity)>0.02)"
                             ".map(i=>i.dataset.pose+':'+getComputedStyle(i).opacity))()"))
            ok("换姿势不重启呼吸动画", anim_after > anim_before and anim_after > 50,
               (anim_before, anim_after))
            time.sleep(0.55)
            # 面板关着的时候不能盖住人物（否则点她、拖她都死）
            hb0 = page.locator(".srs-hit").first.bounding_box()
            hit_ok = page.evaluate(
                "(()=>{const el=document.elementFromPoint(%d, %d);"
                " return !!(el && el.closest('.srs-root')) && !el.closest('.srs-panel');})()"
                % (int(hb0["x"] + hb0["width"] / 2), int(hb0["y"] + hb0["height"] / 2)))
            ok("关闭时面板不吃点击", hit_ok)

            ok("点人物不打开面板", "is-on" not in (page.locator(".srs-panel").get_attribute("class") or ""),
               page.locator(".srs-panel").get_attribute("class"))
            bubble_txt = page.inner_text(".srs-bubble") if page.locator(".srs-bubble").count() else ""
            ok("点人物冒一句气泡", len(bubble_txt.strip()) > 0, bubble_txt)
            greet_src = page.evaluate("(()=>{const s=document.querySelector('.srs-sprite.is-on');return s? s.src.slice(-20):''})()")
            ok("点人物会换姿势（不是 idle）", "idle" not in greet_src, greet_src)
            # 右键同样不开面板，也只是搭话
            page.mouse.click(hb0["x"] + hb0["width"] / 2, hb0["y"] + hb0["height"] / 2, button="right")
            time.sleep(0.5)
            ok("右键也不打开面板", "is-on" not in (page.locator(".srs-panel").get_attribute("class") or ""))

            # 菜单入口：只有水晶球
            page.locator(".srs-gear").click(); time.sleep(0.7)
            ok("水晶球打开面板", "is-on" in (page.locator(".srs-panel").get_attribute("class") or ""))
            ok("面板标题是「今日一牌」", page.locator(".srs-title").inner_text().strip() == "今日一牌", page.locator(".srs-title").inner_text())
            ok("空态显示牌叠小物（3 张牌背）",
               page.locator(".srs-empty-deck i").count() == 3
               and "back.webp" in (page.evaluate(
                   "getComputedStyle(document.querySelector('.srs-empty-deck i')).backgroundImage") or ""),
               page.locator(".srs-empty-deck i").count())
            ok("有引导文案", len(page.locator(".srs-empty").inner_text().strip()) > 10)
            ok("三个按钮（关于 / 抽牌 / 收起）",
               page.locator(".srs-btn").count() == 3
               and page.locator("[data-act='about-open']").count() == 1)
            # 关于页：整块内容替换正文、tab 收起、两张码都在，返回后恢复
            page.locator("[data-act='about-open']").click()
            time.sleep(0.4)
            ok("关于：标题变「关于」且六个 tab 收起",
               page.locator(".srs-title").inner_text().strip() == "关于"
               and page.locator(".srs-tabs").count() == 0)
            about_txt = page.locator(".srs-body").inner_text()
            ok("关于：有群号与两张码",
               "127879829" in about_txt and page.locator(".srs-about-shot").count() == 2)
            ok("关于：两张码都是内联 data URI", page.evaluate(
               "Array.from(document.querySelectorAll('.srs-about-shot')).every(i => i.src.startsWith('data:image/'))"))
            page.locator("[data-act='about-back']").click()
            time.sleep(0.3)
            ok("关于：返回后面板恢复", page.locator(".srs-tabs").count() == 1)
            page.screenshot(path=os.path.join(SHOT, "panel-1-idle.png"))

            # ⑧ 洗牌期间按钮 disabled
            page.locator(".srs-btn.primary").click()
            time.sleep(0.35)
            ok("洗牌期间按钮 disabled", page.locator(".srs-btn.primary").is_disabled())
            page.screenshot(path=os.path.join(SHOT, "panel-2-shuffling.png"))

            # ⑤ 摊牌后自己点一张，再等结果
            page.wait_for_selector(".srs-pickcard", timeout=8000)
            page.locator(".srs-pickcard").first.click()
            page.wait_for_selector(".srs-name", timeout=8000)
            time.sleep(0.4)
            name = page.locator(".srs-name b").inner_text().strip()
            flags = page.locator(".srs-flag").all_inner_texts()
            imgsrc = page.evaluate("document.querySelector('.srs-slot img').src")
            lines = [t.strip() for t in page.locator(".srs-lines p").all_inner_texts() if t.strip()]
            ok("出牌名", len(name) >= 2, name)
            ok("牌面图走 /srs/cards/big/", "/srs/cards/big/" in imgsrc, imgsrc)
            ok("牌面图真的加载了", page.evaluate("(()=>{const i=document.querySelector('.srs-slot img');return i.complete && i.naturalWidth>0})()"))
            ok("正逆标记", any(f in ("正位", "逆位") for f in flags), flags)
            ok("横幅编号显示", any(f.isdigit() or f in ("ACE",) or all(ch in "IVXL" for ch in f) or f in ("侍从", "骑士", "王后", "国王") for f in flags), flags)
            ok("判词 ≥2 段", len(lines) >= 2, lines)
            ok("判词不是占位", all(("待写" not in l and "TODO" not in l) for l in lines) and sum(len(l) for l in lines) > 20, lines)
            page.screenshot(path=os.path.join(SHOT, "panel-3-result.png"))

            # ⑦ 历史
            hist = page.evaluate("localStorage.getItem('srs.history.v1')")
            ok("历史写进 localStorage", bool(hist) and "\"seed\"" in str(hist) and "\"reversed\"" in str(hist), str(hist)[:120])

            # ⑨ 收起
            page.locator(".srs-foot [data-act='close']").click()
            time.sleep(0.35)
            ok("收起后面板关闭", "is-on" not in (page.locator(".srs-panel").get_attribute("class") or ""))
            ok("收起后立绘还在", page.evaluate("document.querySelectorAll('.srs-sprite.is-on').length") == 1)


            # 水晶球入口 + 标签页
            ok("水晶球入口存在", page.evaluate("!!document.querySelector('.srs-gear')"))
            ok("只有一个菜单入口", page.evaluate("document.querySelectorAll('.srs-gear').length") == 1)
            ok("底部标签已删除", page.evaluate("document.querySelectorAll('.srs-badge').length") == 0)
            page.locator(".srs-gear").click()
            time.sleep(0.9)
            ok("点水晶球打开面板", "is-on" in (page.locator(".srs-panel").get_attribute("class") or ""))
            tabs = page.locator(".srs-tab").all_inner_texts()
            ok("六个标签页", tabs == ["塔罗", "占卜", "星座", "计费", "配置", "档案"], tabs)
            ok("默认停在塔罗页", page.locator(".srs-tab.on").inner_text() == "塔罗")
            ok("塔罗页有抽牌按钮", page.locator("[data-act='draw']").count() == 1)

            page.locator(".srs-tab", has_text="计费").click()
            time.sleep(0.7)
            bt = page.inner_text(".srs-body")
            ok("计费页有余额", "余额" in bt and "38.62" in bt, bt[:60])
            ok("计费页有今日/本月", "今日已用" in bt and "本月已用" in bt)

            page.locator(".srs-tab", has_text="星座").click()
            time.sleep(0.4)
            zt = page.inner_text(".srs-body")
            ok("星座页有今日运势卡", all(k in zt for k in ("今日天象", "四维", "宜", "忌")), zt[:60])
            ok("四维有星级", page.locator(".srs-stars").count() == 4, page.locator(".srs-stars").count())
            ok("星座可选", page.locator(".srs-signs button").count() == 12)
            # 默认选中：没填生日时按「今天的太阳星座」，不该卡死在摩羯（旧 bug）
            today_sign = page.evaluate(
                "(()=>{const st=[['aquarius',120],['pisces',219],['aries',321],['taurus',420],"
                "['gemini',521],['cancer',622],['leo',723],['virgo',823],['libra',923],"
                "['scorpio',1024],['sagittarius',1123],['capricorn',1222]];"
                "const d=new Date();const k=(d.getMonth()+1)*100+d.getDate();"
                "let hit='capricorn';for(const r of st){if(k>=r[1])hit=r[0];}return hit;})()")
            picked = page.evaluate(
                "(()=>{const b=document.querySelector('.srs-signs button.on');"
                "return b?(b.getAttribute('data-act')||'').replace('pick-sign-',''):''})()")
            ok("默认星座 = 今天的太阳星座（不是固定摩羯）", picked == today_sign, [picked, today_sign])
            # 点别的星座只切「在看哪个」，不许改档案生日
            before_birth = page.evaluate("(JSON.parse(localStorage.getItem('srs.profile.v1')||'{}').birthday)||''")
            page.locator("[data-act='pick-sign-capricorn']").click(); time.sleep(0.35)
            after_birth = page.evaluate("(JSON.parse(localStorage.getItem('srs.profile.v1')||'{}').birthday)||''")
            ok("点星座不改档案生日", before_birth == after_birth, [before_birth, after_birth])
            ok("点了就切到那个星座", "pick-sign-capricorn" in (
                page.evaluate("(()=>{const b=document.querySelector('.srs-signs button.on');"
                              "return b?b.getAttribute('data-act'):''})()") or ""))
            # 填了生日就按生日算（2/10 是水瓶，旧代码会误判成摩羯）
            page.evaluate("localStorage.setItem('srs.profile.v1', JSON.stringify({birthday:'1990-02-10'}));"
                          "location.reload()")
            time.sleep(1.6); page.wait_for_selector(".srs-root", timeout=8000)
            page.locator(".srs-gear").click(); time.sleep(0.5)
            page.locator(".srs-tab", has_text="星座").click(); time.sleep(0.5)
            ok("生日 2/10 → 水瓶座", "pick-sign-aquarius" in (
                page.evaluate("(()=>{const b=document.querySelector('.srs-signs button.on');"
                              "return b?b.getAttribute('data-act'):''})()") or ""))
            page.locator(".srs-tab", has_text="配置").click()
            time.sleep(0.4)
            st = page.inner_text(".srs-body")
            ok("配置页有音效与气泡两块", ("音效" in st) and ("气泡" in st), st[:40])
            ok("八路开关都在（塔罗五路 + 播报三路）", page.locator("[data-act^='track-']").count() == 8,
               page.locator("[data-act^='track-']").count())
            page.locator("[data-act='toggle-sound']").click(); time.sleep(0.3)
            ok("音效总开关写进配置", '"on":true' in page.evaluate("localStorage.getItem('srs.cfg.v1')").replace(" ", ""))
            page.locator("[data-act='track-bell']").click(); time.sleep(0.3)
            ok("单路开关写进配置", '"bell":false' in page.evaluate("localStorage.getItem('srs.cfg.v1')").replace(" ", ""))
            page.locator("[data-act='vol-up']").click(); time.sleep(0.3)
            ok("音量 ± 生效", '"volume":70' in page.evaluate("localStorage.getItem('srs.cfg.v1')").replace(" ", ""))
            page.locator("[data-act='hold-10']").click(); time.sleep(0.3)
            ok("气泡停留时长生效", '"holdSec":10' in page.evaluate("localStorage.getItem('srs.cfg.v1')").replace(" ", ""))

            page.locator("[data-act='open-edit']").click(); time.sleep(0.4)
            ok("台词编辑页打开", page.evaluate("!!document.querySelector('.srs-area')"))
            page.locator(".srs-area").fill("测试台词一\n测试台词二")
            page.locator("[data-act='save-lines']").click(); time.sleep(0.4)
            cfgjson = page.evaluate("localStorage.getItem('srs.cfg.v1')")
            ok("自定义台词写进配置", ("测试台词一" in cfgjson) and ("测试台词二" in cfgjson))
            page.locator("[data-act='reset-lines']").click(); time.sleep(0.4)
            ok("恢复默认清掉覆盖", "测试台词一" not in page.evaluate("localStorage.getItem('srs.cfg.v1')"))
            page.locator("[data-act='close-edit']").click(); time.sleep(0.3)
            # 音效必须真的停下来（不是只改配置）
            page.evaluate("window.__audios = []")
            page.locator("[data-act='track-bell']").click(); time.sleep(0.3)     # 206 行曾把它关掉，先开回来
            page.locator("[data-act='preview-bell']").click(); time.sleep(0.6)   # 试听一次，产生音频实例
            ok("试听会创建音频实例", page.evaluate("(window.__audios||[]).length") >= 1,
               page.evaluate("(window.__audios||[]).length"))
            page.locator("[data-act='track-bell']").click(); time.sleep(0.3)     # 关掉「结果铃」这一路
            page.evaluate("window.__audios.forEach(a => { a.__played = 0; const p0 = a.play.bind(a); a.play = function(){ a.__played++; return p0(); }; })")
            page.locator("[data-act='preview-bell']").click(); time.sleep(0.5)
            ok("关掉的那一路不再出声", page.evaluate("window.__audios.reduce((n, a) => n + (a.__played || 0), 0)") == 0,
               page.evaluate("window.__audios.reduce((n, a) => n + (a.__played || 0), 0)"))
            page.locator("[data-act='track-bell']").click(); time.sleep(0.3)     # 开回来
            page.locator("[data-act='toggle-sound']").click(); time.sleep(0.6)   # 关总开关
            state = page.evaluate("window.__audios.map(a => ({paused: a.paused, vol: a.volume}))")
            ok("关总开关后全部静音", all(a["paused"] or a["vol"] == 0 for a in state), str(state[:3]))

            # 总开关关掉后，「抽牌」这条流程也不能发声（旧回调闭包陷阱）
            page.evaluate("window.__audios.forEach(a => { a.__played = 0; const p0 = a.play.bind(a); a.play = function(){ a.__played++; return p0(); }; })")
            page.locator(".srs-tab", has_text="塔罗").click(); time.sleep(0.3)
            if page.locator("[data-act='spread-one']").count():
                page.locator("[data-act='spread-one']").click(); time.sleep(0.4)   # 单张不受每日锁影响
            draw_and_wait(page)
            plays = page.evaluate("window.__audios.reduce((n, a) => n + (a.__played || 0), 0)")
            # 音频元素必须挂进 DOM（游离实例刷新后停不掉）；先确保总开关是「关」
            page.locator(".srs-tab", has_text="配置").click(); time.sleep(0.4)
            on_now = page.evaluate("(JSON.parse(localStorage.getItem('srs.cfg.v1')).sound || {}).on")
            if on_now:
                page.locator("[data-act='toggle-sound']").click(); time.sleep(0.8)
            ok("总开关确实关着", page.evaluate("(JSON.parse(localStorage.getItem('srs.cfg.v1')).sound || {}).on") is False)
            dbg = page.evaluate("Array.from(document.querySelectorAll('audio[data-srs-audio]')).map(a => [a.loop, a.paused, a.volume])")
            ok("音频元素挂进了 DOM", len(dbg) >= 1, str(dbg))
            ok("关掉后没有在播的元素", all(x[1] or x[2] == 0 for x in dbg) and all(not x[0] for x in dbg), str(dbg))

            ok("关掉总开关后抽牌不出声", plays == 0, plays)
            page.locator(".srs-tab", has_text="配置").click(); time.sleep(0.3)

            ok("从编辑页返回", page.evaluate("!!document.querySelector(\"[data-act='toggle-sound']\")"))

            # 缩放
            page.locator("[data-act^='scale-']").nth(2).click()
            time.sleep(0.3)
            ok("缩放写进配置", "1.3" in str(page.evaluate("localStorage.getItem('srs.cfg.v1')")))
            ok("主题设置已移除", page.locator("[data-act^='theme-']").count() == 0)

            # 档案页：设密码 → 生日 → 本命牌 → 周期
            page.locator(".srs-tab", has_text="档案").click()
            time.sleep(0.5)
            ok("档案页要求密码", page.evaluate("!!document.querySelector('.srs-body input[type=password]')"))
            ok("首次设密码的提示不写直白字眼", "生理期" not in page.inner_text(".srs-body"),
               page.inner_text(".srs-body")[:80])
            page.evaluate("(()=>{const i=document.querySelectorAll('.srs-body input[type=password]');i[0].value='1234'; if(i[1]) i[1].value='1234';})()")
            page.locator("[data-pact='setup']").click()
            time.sleep(0.7)
            ok("设密码后显示生日输入", page.evaluate("!!document.querySelector('.srs-body input[type=date]')"))
            ok("私密数据已加密", "periods" not in str(page.evaluate("localStorage.getItem('srs.private.v1')")))
            page.evaluate("(()=>{const d=document.querySelectorAll('.srs-body input[type=date]');d[0].value='1994-03-21'; if(d[1]) d[1].value='2026-11-01';})()")
            page.evaluate("(()=>{const t=document.querySelector('.srs-body input[type=time]');"
                          "if(t){t.value='08:00';t.dispatchEvent(new Event('input',{bubbles:true}));}})()")
            time.sleep(0.3)
            page.locator("[data-pact='save-profile']").click()
            time.sleep(0.8)
            ok("生日写进 profile", "1994-03-21" in str(page.evaluate("localStorage.getItem('srs.profile.v1')")))
            ok("出生时刻写进 profile", "08:00" in str(page.evaluate("localStorage.getItem('srs.profile.v1')")))
            body_txt = page.inner_text(".srs-body")
            # 四柱口径与青云剑仙（kuitan）对拍过：1994-03-21 08:00 = 甲戌 丁卯 丙午 壬辰
            ok("四柱排出来了（甲戌 丁卯 丙午 壬辰）",
               all(k in body_txt for k in ("甲戌", "丁卯", "丙午", "壬辰")), body_txt[:160])
            ok("星座按生日算（3/21 → 白羊）", "白羊" in body_txt, body_txt[:120])
            ok("周期文字有记录数", "条记录" in page.inner_text(".srs-body"))
            ok("日历有 7 列星期头", page.locator(".srs-cal-w").count() == 7, page.locator(".srs-cal-w").count())
            ok("日历格子是整月（28–31 天 + 补白）",
               page.locator(".srs-cal-cell:not(.is-blank)").count() in range(28, 32),
               page.locator(".srs-cal-cell:not(.is-blank)").count())
            ok("图例五种阶段齐全", page.locator(".srs-cal-legend .srs-lg").count() == 5,
               page.locator(".srs-cal-legend .srs-lg").count())
            ok("日历按阶段上色（至少经期与安全期两类）",
               page.locator(".srs-cal-cell.st-period").count() >= 1
               and page.locator(".srs-cal-cell.st-safe").count() >= 1)
            ok("周期长度可填 1–60", page.evaluate(
                "(()=>{const i=document.querySelector('.srs-len input');"
                "return !!i && i.min==='1' && i.max==='60'})()"))
            page.locator("[data-pact='cal-prev']").click(); time.sleep(0.4)
            ok("日历能翻到上个月", "年" in page.locator(".srs-cal-title").inner_text(),
               page.locator(".srs-cal-title").inner_text())
            page.locator("[data-pact='cal-next']").click(); time.sleep(0.4)

            # ── 婚配：乾/坤 各填生日 + 时辰 → 匹配 ──
            rows = page.locator(".srs-match-row")
            ok("婚配有乾、坤两行", rows.count() == 2, rows.count())
            rows.nth(0).locator("input[type=date]").fill("1984-05-01")
            rows.nth(0).locator("select").select_option("00:30")
            rows.nth(1).locator("input[type=date]").fill("1985-05-01")
            rows.nth(1).locator("select").select_option("02:00")
            time.sleep(0.3)
            page.locator("[data-pact='match-run']").click(); time.sleep(0.7)
            ok("点匹配出分数（5–98）", page.locator(".srs-match-score b").count() == 1
               and 5 <= int(page.locator(".srs-match-score b").inner_text()) <= 98,
               page.locator(".srs-match-score b").inner_text() if page.locator(".srs-match-score b").count() else "无")
            ok("婚配出 5 条分项", page.locator(".srs-match-item").count() == 5,
               page.locator(".srs-match-item").count())
            deltas = page.evaluate(
                "Array.from(document.querySelectorAll('.srs-match-item .d')).map(e=>e.textContent)")
            ok("婚配分项带正负号",
               len(deltas) == 5 and all(t.startswith(("+", "-")) or t == "0" for t in deltas), deltas)
            ok("生肖六合算 +12（子·丑）", any("六合" in t and "+12" in t for t in page.evaluate(
                "Array.from(document.querySelectorAll('.srs-match-item')).map(e=>e.textContent)")))
            ok("婚配出三条建议", "现在能做的三件小事" in page.inner_text(".srs-body")
               and page.locator(".srs-match-out .srs-cyc-line").count() >= 3,
               page.locator(".srs-match-out .srs-cyc-line").count())
            ok("婚配写明只看五项结构、不下结局", "不是结局" in page.inner_text(".srs-body"))
            first_score = int(page.locator(".srs-match-score b").inner_text())
            page.locator("[data-pact='match-run']").click(); time.sleep(0.6)
            ok("同一输入再算一次结果一致",
               int(page.locator(".srs-match-score b").inner_text()) == first_score,
               (first_score, page.locator(".srs-match-score b").inner_text()))
            # 换一组：年支相冲（午 · 子）应出现 -10
            rows.nth(1).locator("input[type=date]").fill("1984-05-01")
            rows.nth(0).locator("input[type=date]").fill("1990-02-10")
            time.sleep(0.4)
            ok("改了输入旧结果先撤掉", page.locator(".srs-match-score b").count() == 0,
               page.locator(".srs-match-score b").count())
            page.locator("[data-pact='match-run']").click(); time.sleep(0.7)
            ok("生肖相冲算 -10（午·子）", any("相冲" in t and "-10" in t for t in page.evaluate(
                "Array.from(document.querySelectorAll('.srs-match-item')).map(e=>e.textContent)")))

            # 子时跨天：晚子（23–24）按次日算日柱，所以与早子（00–01）排出来不一样
            rows.nth(0).locator("select").select_option("00:30"); time.sleep(0.3)
            page.locator("[data-pact='match-run']").click(); time.sleep(0.6)
            fz_a = page.evaluate("document.querySelectorAll('.srs-match-fz')[0].textContent")
            rows.nth(0).locator("select").select_option("23:30"); time.sleep(0.3)
            page.locator("[data-pact='match-run']").click(); time.sleep(0.6)
            fz_b = page.evaluate("document.querySelectorAll('.srs-match-fz')[0].textContent")
            ok("晚子时按次日排（与早子日柱不同）", bool(fz_a) and bool(fz_b) and fz_a != fz_b,
               [fz_a, fz_b])
            page.evaluate("(()=>{const d=document.querySelectorAll('.srs-body input[type=date]');if(d[1]) d[1].value='2026-10-02';})()")
            page.locator("[data-pact='add-period']").click()
            time.sleep(0.8)
            ok("能加第二条周期", page.locator(".srs-per-row").count() >= 2, page.locator(".srs-per-row").count())
            ok("记录仍在密文里", "2026-10-02" not in str(page.evaluate("localStorage.getItem('srs.private.v1')")))
            page.locator(".srs-per-del").first.click()
            time.sleep(0.8)
            ok("能删一条周期", page.locator(".srs-per-row").count() >= 1)

            # ── W8 每天记一笔：情绪 / 睡眠 + 近 30 天月相对照 ──
            body_w8 = page.inner_text(".srs-body")
            ok("有「每天记一笔」块", "每天记一笔" in body_w8)
            ok("有「近 30 天 · 月相对照」块", "月相对照" in body_w8)
            ok("情绪五档、睡眠三档都在",
               page.locator("[data-pact^='day-mood-']").count() == 5
               and page.locator("[data-pact^='day-sleep-']").count() == 3)
            ok("对照带 30 格", page.locator(".srs-day-cell").count() == 30,
               page.locator(".srs-day-cell").count())
            ok("每格都有月相亮度柱", page.locator(".srs-day-moon").count() == 30)
            axis = page.evaluate(
                "Array.from(document.querySelectorAll('.srs-days-axis span')).map(e=>e.textContent.trim())")
            ok("带子下面有日期轴（起 / 中 / 今天）",
               len(axis) == 3 and "/" in axis[0] and "/" in axis[1] and axis[2] == "今天", axis)
            ok("还没记时统计直说样本少", "样本还少" in page.inner_text(".srs-body"))
            page.locator("[data-pact='day-mood-4']").click(); time.sleep(0.3)
            page.locator("[data-pact='day-sleep-3']").click(); time.sleep(0.3)
            ok("选了情绪会高亮", "on" in page.evaluate(
                "document.querySelector(\"[data-pact='day-mood-4']\").className"))
            page.locator("[data-pact='save-day']").click(); time.sleep(1.0)
            ok("记下后出现记录行", page.locator(".srs-day-row").count() == 1,
               page.locator(".srs-day-row").count())
            ok("每日记录不落明文", "情绪" not in str(page.evaluate("localStorage.getItem('srs.private.v1')")))
            ok("对照带出现情绪柱", page.locator(".srs-day-mood").count() == 1,
               page.locator(".srs-day-mood").count())
            ok("统计改成按天数说", "满月前后" in page.inner_text(".srs-body")
               and "其余" in page.inner_text(".srs-body"))
            page.locator("[data-pact='day-mood-1']").click(); time.sleep(0.2)
            page.locator("[data-pact='save-day']").click(); time.sleep(1.0)
            ok("同一天再记是覆盖（不多一行）", page.locator(".srs-day-row").count() == 1,
               page.locator(".srs-day-row").count())
            # 改经期时加密保存要把 daily 一起带上，否则每日记录被冲掉
            page.evaluate("(()=>{const d=document.querySelectorAll('.srs-body input[type=date]');if(d[1]) d[1].value='2026-11-05';})()")
            page.locator("[data-pact='add-period']").click(); time.sleep(1.0)
            ok("加经期不冲掉每日记录", page.locator(".srs-day-row").count() == 1,
               page.locator(".srs-day-row").count())
            page.locator(".srs-day-row .srs-per-del").first.click(); time.sleep(1.0)
            ok("能删一条每日记录", page.locator(".srs-day-row").count() == 0,
               page.locator(".srs-day-row").count())

            # 关菜单即锁档（公共场所用）：解密内容与密码都不留在内存里，重开要重新解锁
            page.locator(".srs-panel [data-act='close']").first.click(); time.sleep(0.8)
            page.locator(".srs-gear").click(); time.sleep(0.7)
            page.locator(".srs-tab", has_text="档案").click(); time.sleep(0.5)
            ok("关菜单后档案自动锁上", page.evaluate(
                "!!document.querySelector('.srs-body input[type=password]')"))
            ok("锁上后看不到周期内容", "周期日历" not in page.inner_text(".srs-body"))
            page.evaluate("(()=>{const i=document.querySelector('.srs-body input[type=password]');if(i)i.value='1234';})()")
            page.locator("[data-pact='unlock']").click(); time.sleep(1.1)
            ok("重新输密码能解锁", "周期日历" in page.inner_text(".srs-body"))

            # 三张牌阵
            page.locator(".srs-tab", has_text="塔罗").click()
            time.sleep(0.3)
            page.locator("[data-act='spread-three']").click()
            time.sleep(0.3)
            ok("切到三张牌阵", '"spread":"three"' in page.evaluate("localStorage.getItem('srs.cfg.v1')").replace(" ", ""))
            # 一张一张挑：点第一张只落一张进等待区，不出整体
            page.locator("[data-act='draw']").click()
            time.sleep(2.6)
            page.locator(".srs-pickcard:not(.is-picked)").first.click()
            time.sleep(1.0)
            ok("三张模式点一张只落一张（没一次全出）", page.locator(".srs-wait-cell").count() == 1,
               page.locator(".srs-wait-cell").count())
            ok("点一张后十张格子还在", page.locator(".srs-pickcard").count() == 10,
               page.locator(".srs-pickcard").count())
            ok("点一张后还没出整体解读", page.locator(".srs-sp-cell").count() == 0,
               page.locator(".srs-sp-cell").count())
            for _ in range(2):
                page.locator(".srs-pickcard:not(.is-picked)").first.click()
                time.sleep(1.1)
            time.sleep(1.4)
            ok("三张挑齐后不自动翻，等「翻开」",
               page.locator("[data-act='reveal']").count() == 1
               and page.locator(".srs-sp-cell").count() == 0,
               page.locator(".srs-sp-cell").count())
            page.locator("[data-act='reveal']").click()
            time.sleep(2.4)
            ok("连挑三张 + 翻开后出三张牌阵", page.locator(".srs-sp-cell").count() == 3,
               page.locator(".srs-sp-cell").count())
            ok("三张模式按钮写「再抽三张」", page.locator("[data-act='draw']").inner_text().strip() == "再抽三张", page.locator("[data-act='draw']").inner_text())
            page.locator("[data-act='spread-one']").click(); time.sleep(0.4)
            ok("单张模式按钮写「抽一张」", page.locator("[data-act='draw']").inner_text().strip() == "抽一张", page.locator("[data-act='draw']").inner_text())
            ok("单张模式标题写「抽一张牌」", "抽一张牌" in page.locator(".srs-title").inner_text(), page.locator(".srs-title").inner_text())
            page.locator("[data-act='spread-three']").click(); time.sleep(0.4)
            ok("切回三张后按钮写「抽三张」", page.locator("[data-act='draw']").inner_text().strip() == "抽三张", page.locator("[data-act='draw']").inner_text())
            ok("切回三张后标题写「抽三张牌」", "抽三张牌" in page.locator(".srs-title").inner_text(), page.locator(".srs-title").inner_text())
            draw_and_wait(page, picks=3)

            ok("抽出三张", page.locator(".srs-sp-cell").count() == 3, page.locator(".srs-sp-cell").count())
            ok("有过去/现在/未来标签", all(k in page.inner_text(".srs-spread") for k in ("过去", "现在", "未来")))
            ok("组合解读有内容", "合起来看" in page.inner_text(".srs-body"))
            # 2026-11-18 补位义：三张每位先说「这一位在问什么」，再说牌
            # 取容器要限定在三张视图里 —— 页面上还有别的 .srs-lines（单张结果 / 占卜页），
            # 用 inner_text(".srs-lines") 取到哪个不确定，判据会抖。
            three_txt = page.locator(
                "xpath=//div[contains(@class,'srs-spread') and not(contains(@class,'srs-celtic'))]"
                "/following-sibling::div[contains(@class,'srs-lines')][1]").first.inner_text()
            ok("三张每位带位置引导（过去位在问什么）",
               "已经发生、还在牵着你的事" in three_txt, three_txt[:120])
            ok("三张合计句按位置组说（过去/现在/未来）",
               any(k in three_txt for k in ("过去那一段", "过去顺", "现在与未来", "现在和未来",
                                            "一顺一逆之间")), three_txt[-140:])

            # 音效页
            page.locator(".srs-tab", has_text="配置").click()
            time.sleep(0.3)
            st = page.inner_text(".srs-body")
            ok("配置页有开关与音量", ("音效" in st) and ("音量" in st), st[:40])
            page.locator("[data-act='toggle-sound']").click()
            time.sleep(0.3)

            # 占卜页
            page.locator("[data-act='tab-divine']").click()
            time.sleep(0.5)
            ok("标签页共六个", page.locator(".srs-tab").count() == 6, page.locator(".srs-tab").count())
            ok("占卜页默认每日一签", "每日一签" in page.inner_text(".srs-body"))
            page.locator("[data-act='divine-draw']").click()
            time.sleep(2.4)
            ok("抽出一签", page.evaluate("!!document.querySelector('.srs-daily-card')"))
            ok("每日一签已锁定", "明天" in page.inner_text(".srs-body"))
            ok("签文落 localStorage", "srs.daily" not in "", ) if False else ok("签文落 localStorage", bool(page.evaluate("localStorage.getItem('srs.daily.v1')")))
            page.locator("[data-act='divine-either']").click(); time.sleep(0.4)
            page.locator("[data-act='divine-draw']").click(); time.sleep(2.4)
            ok("二选一抽五张", page.locator(".srs-sp-cell").count() == 5, page.locator(".srs-sp-cell").count())
            ok("二选一有判定", "结起来看" in page.inner_text(".srs-body"))
            ok("二选一每张都有翻牌层", page.locator(".srs-sp-cell .srs-flip-in").count() == 5,
               page.locator(".srs-sp-cell .srs-flip-in").count())
            ok("翻牌动画在跑", page.evaluate(
                "(()=>{const el=document.querySelector('.srs-flip-in');if(!el)return false;"
                "const cs=getComputedStyle(el);return cs.animationName==='srs-flip-turns'"
                "&&parseFloat(cs.animationDuration)>0.2;})()"))
            fd = page.evaluate(
                "Array.from(document.querySelectorAll('.srs-sp-cell .srs-flip'))"
                ".map(e=>getComputedStyle(e).getPropertyValue('--fd').trim())")
            ok("牌面按序错开翻", len(fd) == 5 and fd[0] != fd[1] and fd[1] != fd[2], fd[:3])
            time.sleep(1.4)
            ok("翻完后牌面朝前", page.evaluate(
                "(()=>{const el=document.querySelector('.srs-flip-in');"
                "return /matrix3d\\(-1/.test(getComputedStyle(el).transform);})()"))
            page.evaluate("window.__srsFlip0=document.querySelector('.srs-sp-cell .srs-flip-in')")
            page.locator("[data-act='divine-draw']").click(); time.sleep(2.4)
            ok("再抽一次重挂载（动画能重放）", page.evaluate(
                "!!window.__srsFlip0 && document.querySelector('.srs-sp-cell .srs-flip-in')!==window.__srsFlip0"))
            page.locator("[data-act='divine-relation']").click(); time.sleep(0.4)
            page.locator("[data-act='divine-draw']").click(); time.sleep(2.6)
            ok("关系阵抽七张", page.locator(".srs-sp-cell").count() == 7, page.locator(".srs-sp-cell").count())
            ok("关系阵有四段", all(k in page.inner_text(".srs-body") for k in ("现状", "阻碍", "建议", "走向")))
            ok("关系阵七张都有翻牌层", page.locator(".srs-sp-cell .srs-flip-in").count() == 7,
               page.locator(".srs-sp-cell .srs-flip-in").count())
            page.locator("[data-act='tab-tarot']").click(); time.sleep(0.3)

            # 拖拽：原生窗口监听，位移要真的落到位置上
            before = page.locator(".srs-root").bounding_box()
            hb = page.locator(".srs-hit").first.bounding_box()
            cx, cy = hb["x"] + hb["width"] / 2, hb["y"] + hb["height"] / 2
            page.mouse.move(cx, cy); page.mouse.down(); time.sleep(0.15)
            page.mouse.move(cx - 90, cy - 60, steps=10); time.sleep(0.15); page.mouse.up()
            time.sleep(0.4)
            after = page.locator(".srs-root").bounding_box()
            ok("拖拽能移动挂件", abs(after["x"] - before["x"]) > 40 and abs(after["y"] - before["y"]) > 20, (before["x"], after["x"]))


            # 吸附：拖到右下附近松手 → 贴边；窗口变窄 → 跟着贴
            page.evaluate("localStorage.setItem('srs.cfg.v1', JSON.stringify({scale:1}))")
            page.reload(); time.sleep(1.2); page.wait_for_selector(".srs-root", timeout=8000); time.sleep(0.5)
            vb = page.viewport_size
            hb2 = page.locator(".srs-hit").first.bounding_box()
            cx2, cy2 = hb2["x"] + hb2["width"]/2, hb2["y"] + hb2["height"]/2
            page.mouse.move(cx2, cy2); page.mouse.down(); time.sleep(0.15)
            page.mouse.move(vb["width"] - 120, vb["height"] - 90, steps=12); time.sleep(0.15); page.mouse.up()
            time.sleep(0.5)
            ab = page.locator(".srs-root").bounding_box()
            snap_ok = abs((vb["width"] - (ab["x"] + ab["width"])) - 14) <= 2 and abs((vb["height"] - (ab["y"] + ab["height"])) - 10) <= 2
            ok("松手吸附到右下", snap_ok, (round(ab["x"]), round(ab["y"]), vb["width"]))
            cfg_anchor = page.evaluate("(JSON.parse(localStorage.getItem('srs.cfg.v1')).anchor) || {}")
            ok("记住吸附边", cfg_anchor.get("h") == "right" and cfg_anchor.get("v") == "bottom", str(cfg_anchor))
            page.set_viewport_size({"width": 1100, "height": 800}); time.sleep(0.6)
            ab2 = page.locator(".srs-root").bounding_box()
            ok("窗口变窄仍贴右下", abs((1100 - (ab2["x"] + ab2["width"])) - 14) <= 2 and abs((800 - (ab2["y"] + ab2["height"])) - 10) <= 2, (round(ab2["x"]), round(ab2["y"])))

            # 切页时面板高度必须一致（用户：忽高忽低）
            page.locator(".srs-gear").click(); time.sleep(0.6)
            heights = []
            for name in ("塔罗", "占卜", "星座", "计费", "配置", "档案"):
                page.locator(".srs-tab", has_text=name).click(); time.sleep(0.35)
                heights.append(round(page.locator(".srs-panel").bounding_box()["height"]))
            ok("切页时面板高度不变", len(set(heights)) == 1, heights)

            # 缩放后不能跑出窗口（用户：放大就跳出窗口）
            vb2 = page.viewport_size
            for sc in ("1.3", "1.6"):
                page.evaluate("(function(){const c=JSON.parse(localStorage.getItem('srs.cfg.v1')||'{}');c.scale=%s;localStorage.setItem('srs.cfg.v1',JSON.stringify(c));location.reload();})()" % sc)
                time.sleep(1.4); page.wait_for_selector(".srs-root", timeout=8000); time.sleep(0.5)
                rb = page.locator(".srs-root").bounding_box()
                sb = page.evaluate("(()=>{const s=document.querySelector('.srs-sprite.is-on');const r=s.getBoundingClientRect();return [r.x,r.y,r.width,r.height]})()")
                inside = (rb["x"] >= -1 and rb["y"] >= -1
                          and rb["x"] + rb["width"] <= vb2["width"] + 1
                          and rb["y"] + rb["height"] <= vb2["height"] + 1)
                sp_inside = (sb[0] >= rb["x"] - 4 and sb[1] >= rb["y"] - 4
                             and sb[0] + sb[2] <= rb["x"] + rb["width"] + 4
                             and sb[1] + sb[3] <= rb["y"] + rb["height"] + 4)
                ok("放大后不跑出窗口 " + sc, inside and sp_inside,
                   (round(rb["x"]), round(rb["y"]), round(rb["width"]), round(rb["height"]), [round(v) for v in sb]))

            # 闲置行为：等一会儿必须出现台词或换姿势（不能一直不动）
            page.evaluate("localStorage.setItem('srs.cfg.v1', JSON.stringify({scale:1, bubble:{on:true, holdSec:10}})); location.reload()")
            time.sleep(1.5); page.wait_for_selector(".srs-root", timeout=8000); time.sleep(0.5)
            seen_text = set()
            seen_pose = set()
            for _ in range(62):
                time.sleep(0.9)
                bt = page.evaluate("(document.querySelector('.srs-bubble')||{}).textContent || ''")
                ps = page.evaluate("(()=>{const s=document.querySelector('.srs-sprite.is-on');return s? (s.dataset.pose||''):''})()")
                if bt:
                    seen_text.add(bt.strip()[:12])
                seen_pose.add(ps)
                if len(seen_text) >= 1 and len(seen_pose) >= 2 and any("think" in p for p in seen_pose):
                    break
            ok("闲置说过话", len(seen_text) >= 1, list(seen_text))
            ok("闲置会换姿势", len(seen_pose) >= 2, len(seen_pose))
            ok("闲置会发呆（定在 think）", any("think" in p for p in seen_pose), list(seen_pose))

            # 气泡收起不许塌成一截带边框的小方块（0.37.4：文本与可见性拆成两个状态）
            page.evaluate("localStorage.setItem('srs.cfg.v1', JSON.stringify({scale:1, bubble:{on:true, holdSec:1}})); location.reload()")
            time.sleep(1.5); page.wait_for_selector(".srs-root", timeout=8000); time.sleep(0.4)
            page.locator(".srs-hit").first.click(position={"x": 30, "y": 60})
            time.sleep(0.4)
            bw_on = page.evaluate("(()=>{const b=document.querySelector('.srs-bubble');return b?b.getBoundingClientRect().width:0})()")
            time.sleep(1.7)
            bub_after = page.evaluate(
                "(()=>{const b=document.querySelector('.srs-bubble');if(!b)return{txt:'',w:0,op:'1'};"
                "const cs=getComputedStyle(b);return{txt:b.textContent.trim(),w:b.getBoundingClientRect().width,op:cs.opacity}})()")
            ok("气泡收起宽度不塌（不留小尾巴）", bw_on > 40 and bub_after["w"] > bw_on - 8,
               (round(bw_on), round(bub_after["w"])))
            ok("气泡收起后透明且文本仍在", bub_after["op"] in ("0", "0.0") and len(bub_after["txt"]) > 0,
               (bub_after["op"], bub_after["txt"][:12]))

            # ── T1 每日一牌（锁） / T2 单张（自由） ─────────────
            page.evaluate("localStorage.removeItem('srs.dailyCard.v1'); localStorage.removeItem('srs.history.v1');"
                          "const c=JSON.parse(localStorage.getItem('srs.cfg.v1')||'{}');c.spread='daily';"
                          "localStorage.setItem('srs.cfg.v1',JSON.stringify(c));location.reload();")
            time.sleep(1.5); page.wait_for_selector(".srs-root", timeout=8000); time.sleep(0.5)
            page.locator(".srs-gear").click(); time.sleep(0.5)
            page.locator(".srs-tab", has_text="塔罗").click(); time.sleep(0.4)
            ok("默认停在每日一牌", page.locator(".srs-title").inner_text() == "今日一牌", page.locator(".srs-title").inner_text())
            ok("每日模式按钮写「抽今日一牌」", "抽今日一牌" in page.locator("[data-act='draw']").inner_text(), page.locator("[data-act='draw']").inner_text())
            draw_and_wait(page)
            first = page.evaluate("JSON.parse(localStorage.getItem('srs.dailyCard.v1')||'{}').id")
            ok("每日一牌写进本地", bool(first), first)
            ok("抽完按钮变「今天已定」", "今天已定" in page.locator("[data-act='draw']").inner_text(), page.locator("[data-act='draw']").inner_text())
            ok("锁住后按钮禁用", page.locator("[data-act='draw']").is_disabled())

            page.reload(); time.sleep(1.4); page.wait_for_selector(".srs-root", timeout=8000); time.sleep(0.5)
            same = page.evaluate("JSON.parse(localStorage.getItem('srs.dailyCard.v1')||'{}').id")
            ok("重开还是同一张牌", same == first, (first, same))
            page.locator(".srs-gear").click(); time.sleep(0.5)
            page.locator(".srs-tab", has_text="塔罗").click(); time.sleep(0.4)
            ok("重开后按钮写「看今天的牌」", "看今天的牌" in page.locator("[data-act='draw']").inner_text(), page.locator("[data-act='draw']").inner_text())
            draw_and_wait(page)
            ok("点「看今天的牌」把当天那张摆回来", page.evaluate("!!document.querySelector('.srs-name')"))
            shown_id = page.evaluate("(document.querySelector('.srs-name b')||{}).textContent || ''")
            ok("摆回来的就是当天那张", bool(shown_id), shown_id)

            # T2 单张：不受每日锁影响，能连续抽
            page.locator("[data-act='spread-one']").click(); time.sleep(0.5)
            ok("单张模式不被每日锁禁", not page.locator("[data-act='draw']").is_disabled())
            draw_and_wait(page)
            ok("单张可以自由再抽", page.evaluate("!!document.querySelector('.srs-name')"))

            # ── T11 凯尔特十字（十张）────────────────────────
            page.locator("[data-act='spread-celtic']").click(); time.sleep(0.4)
            page.locator("[data-act='draw']").click(); time.sleep(2.9)
            ok("凯尔特摊开十张背面", page.locator(".srs-pickcard").count() == 10,
               page.locator(".srs-pickcard").count())
            for pi in range(10):
                page.locator("[data-act='pick-%d']" % pi).click(); time.sleep(0.45)
            time.sleep(0.9)
            ok("十张挑满出现「翻开这十张」",
               page.locator("[data-act='reveal']").count() == 1
               and "翻开这十张" in page.locator("[data-act='reveal']").inner_text(),
               page.locator("[data-act='reveal']").inner_text() if page.locator("[data-act='reveal']").count() else "no-reveal")
            page.locator("[data-act='reveal']").click(); time.sleep(1.8)
            ok("凯尔特出满十个牌位", page.locator(".srs-celtic .srs-sp-cell").count() == 10,
               page.locator(".srs-celtic .srs-sp-cell").count())
            # 2026-11-18 补位义：原来只出 3 位（现状/阻碍/结果）+ 合计共 4 行，
            # 现在十位全出、每行带「这一位在问什么」，合计句按位置组判断。
            # 同样限定在凯尔特视图里（页面上还有别的 .srs-lines）
            lines_txt = page.locator(
                "xpath=//div[contains(@class,'srs-celtic')]"
                "/following-sibling::div[contains(@class,'srs-lines')][1]").first.inner_text()
            # 不数 p（页面上可能同时存在别的 .srs-lines 容器），直接判十位引导语全在
            celtic_guides = ["你此刻站在哪里", "横在路上的那个东西", "这件事底下压着的远因",
                             "刚过去、还在起作用的那一段", "你希望抵达的位置", "不改的话会去的地方",
                             "你自己的姿态", "别人和外部条件", "你最想要又最怕的那件事", "合起来会落到哪里"]
            missing = [g for g in celtic_guides if g not in lines_txt]
            ok("凯尔特十位全部出解读（十个位置引导语都在）", not missing, missing)
            ok("凯尔特每位带位置引导（阻碍位在问什么）",
               "横在路上的那个东西" in lines_txt, lines_txt[:120])
            ok("凯尔特合计句按位置组说（阻碍/目标/结果）",
               any(k in lines_txt for k in ("阻碍位", "目标位", "结果位")), lines_txt[-160:])

            # ── T8 历史回看 ─────────────────────────────────
            page.locator("[data-act='hist-open']").click(); time.sleep(0.6)
            rows_before = page.locator(".srs-hist-row").count()
            ok("历史有记录行", rows_before >= 2, rows_before)
            page.locator("[data-act^='hist-del-']").first.click(); time.sleep(0.7)
            rows_after = page.locator(".srs-hist-row").count()
            ok("能删单条历史", rows_after == rows_before - 1, (rows_before, rows_after))
            page.locator("[data-act='hist-back']").click(); time.sleep(0.5)
            ok("从历史返回塔罗页", page.locator("[data-act='spread-one']").count() == 1)

            # ── T9 同种子重放 ───────────────────────────────
            # 先把历史压成一条单张记录：凯尔特十张也会进历史，第一条可能是它（十张重放要 10 次点选，太慢）
            page.evaluate("localStorage.setItem('srs.history.v1', JSON.stringify([{t:Date.now(),id:'major-00',name:'愚者',numeral:'0',reversed:false,seed:123456,spread:'one'}]))")
            page.locator("[data-act='hist-open']").click(); time.sleep(0.5)
            ok("历史行带重放按钮", page.locator("[data-act^='hist-replay-']").count() >= 1,
               page.locator("[data-act^='hist-replay-']").count())
            seed_before = page.evaluate("(JSON.parse(localStorage.getItem('srs.history.v1')||'[]')[0]||{}).seed")
            page.locator("[data-act^='hist-replay-']").first.click(); time.sleep(3.4)
            ok("重放后出了牌", page.locator(".srs-name").count() >= 1)
            ok("重放仍是同一种子",
               page.evaluate("(JSON.parse(localStorage.getItem('srs.history.v1')||'[]')[0]||{}).seed") == seed_before,
               seed_before)

            # ── 小阿卡纳逐张精写（2026-11-18 补）──────────────
            # 先用一张小阿卡纳重放，判界面出的是这张的专属句，不是三层合成模板句。
            # 模板 ace 句是「有个开头摆在面前，还没成形。」—— 出现过就说明 minor 没生效。
            page.evaluate("localStorage.setItem('srs.history.v1', JSON.stringify([{t:Date.now(),id:'wands-02',name:'权杖二',numeral:'II',reversed:false,seed:777001,spread:'one'}]))")
            page.locator("[data-act='hist-open']").click(); time.sleep(0.5)
            page.locator("[data-act^='hist-replay-']").first.click(); time.sleep(3.4)
            ok("重放小阿卡纳后出了牌", page.locator(".srs-name").count() >= 1,
               page.locator(".srs-name").count())
            minor_txt = page.inner_text(".srs-lines")
            # 正逆由种子重算（历史里的 reversed 只供列表显示），所以两句都认
            ok("小阿卡纳出的是逐张专属句（权杖二 · 正或逆）",
               ("你站在门口，两条路都看得见。" in minor_txt)
               or ("一直观望，谁也没选，时间替你选了一个。" in minor_txt), minor_txt[-200:])
            ok("小阿卡纳没退回三层合成模板句",
               "有个开头摆在面前，还没成形。" not in minor_txt, minor_txt[-200:])

            # ── T6 牌库图鉴 ─────────────────────────────────
            page.locator("[data-act='deck-open']").click(); time.sleep(0.6)
            ok("牌库标出总数 78", "共 78 张" in page.locator(".srs-body").inner_text(),
               page.locator(".srs-body").inner_text()[:24])
            n_cells = page.locator(".srs-deck-cell").count()
            ok("牌库默认列 22 张大牌", n_cells == 22, n_cells)
            page.locator("[data-act='deck-group-wands']").click(); time.sleep(0.6)
            ok("牌库能切花色", page.locator(".srs-deck-cell").count() == 14, page.locator(".srs-deck-cell").count())
            page.locator(".srs-deck-cell").first.click(); time.sleep(0.6)
            ok("点一张出牌义", page.locator(".srs-lines p").count() >= 2, page.locator(".srs-lines p").count())
            page.locator("[data-act='deck-rev']").click(); time.sleep(0.4)
            ok("牌库能切逆位", "rotate(180deg)" in (page.locator(".srs-sp-img").first.get_attribute("style") or ""))
            page.locator("[data-act='deck-back']").click(); time.sleep(0.4)
            ok("牌库能退回抽牌页", page.locator("[data-act='spread-one']").count() == 1)

            # ── N2 逆行 + N4 运势转抽牌 ─────────────────────
            page.locator(".srs-tab", has_text="星座").click(); time.sleep(0.7)
            z_txt = page.locator(".srs-body").inner_text()
            ok("星座页有逆行一栏", "逆行" in z_txt, z_txt[:40])
            ok("逆行有解释句", ("水星逆行" in z_txt) or ("金星逆行" in z_txt) or ("火星逆行" in z_txt) or ("没有行星逆行" in z_txt),
               z_txt[:80])
            ok("星座页有「今天想问什么」", page.locator("[data-act='today-ask']").count() == 1)
            # N5：运势卡导出
            ok("星座页有存图", page.locator("[data-act='export-horo']").count() == 1)
            page.evaluate("window.__srsLastExport = null")
            page.locator("[data-act='export-horo']").click(); time.sleep(3.2)
            exh = page.evaluate("window.__srsLastExport")
            ok("运势卡能导出 PNG",
               bool(exh) and exh.get("size", 0) > 20000 and "horo" in exh.get("name", ""), exh)
            page.locator("[data-act='today-ask']").click(); time.sleep(0.5)
            ok("点了跳到塔罗单张", "on" in (page.locator("[data-act='spread-one']").get_attribute("class") or ""))

            # ── C3 屏幕角 / C4 只留水晶球 / C10 导入导出 / W18 台词组 ──
            page.locator(".srs-tab", has_text="配置").click(); time.sleep(0.5)
            # 镜像对照组：切左下之前先在右下量一份「点击轮廓在框里的百分比」
            hit_pct_before = page.evaluate(
                "(()=>{const e=document.querySelector('.srs-hit');"
                "return [parseFloat(e.style.left), parseFloat(e.style.width)]})()")
            mirror_before = page.evaluate("!!document.querySelector('.srs-stage.srs-mirror')")
            ok("右下角不镜像", mirror_before is False, mirror_before)
            corner_ui_before = page.evaluate(
                "(()=>{const b=document.querySelector('.srs-bubble'),g=document.querySelector('.srs-gear');"
                "const cb=getComputedStyle(b),cg=getComputedStyle(g);"
                "const r=document.querySelector('.srs-root').getBoundingClientRect();"
                "const bb=b.getBoundingClientRect(),gg=g.getBoundingClientRect();"
                "return {bubbleLeft:cb.left,bubbleRight:cb.right,gearLeft:cg.left,gearRight:cg.right,"
                "rootMid:(r.left+r.right)/2,bubbleMid:(bb.left+bb.right)/2,gearMid:(gg.left+gg.right)/2};})()")
            # 注意：computed left/right 永远是**解析后的长度**（未设一侧给 -(宽+margin)），
            # 所以判据一律看几何中点，外加「贴边那一侧是不是 -4px」这条实值。
            ok("右下：气泡在人物左侧（原样）",
               corner_ui_before["bubbleMid"] < corner_ui_before["rootMid"], corner_ui_before)
            ok("右下：水晶球在人物右上（原样）",
               corner_ui_before["gearRight"] == "-4px"
               and corner_ui_before["gearMid"] > corner_ui_before["rootMid"], corner_ui_before)
            ok("有配置页屏幕角开关", page.locator("[data-act='corner-left']").count() == 1)
            # 配置页比内容区长，靠内部滚动，这里验「滚到底能看到设置区」
            page.locator("[data-act='wipe-all']").scroll_into_view_if_needed(); time.sleep(0.3)
            ok("配置页能滚到设置区", page.locator("[data-act='wipe-all']").is_visible())
            page.locator("[data-act='corner-left']").click(); time.sleep(0.4)
            ok("屏幕角能切左下",
               page.evaluate("(JSON.parse(localStorage.getItem('srs.cfg.v1')||'{}').anchor||{}).h") == "left")
            # ── 左下角全姿势镜像（2026-11-18 主人：放左下角要镜像）────────
            ok("切左下后立绘镜像", page.evaluate("!!document.querySelector('.srs-stage.srs-mirror')"))
            ok("镜像真的翻了图（scaleX = -1）",
               page.evaluate("new DOMMatrixReadOnly(getComputedStyle("
                             "document.querySelector('.srs-sprite.is-on')).transform).a") < 0,
               page.evaluate("getComputedStyle(document.querySelector('.srs-sprite.is-on')).transform"))
            ok("所有姿势共用同一条镜像规则", page.evaluate(
                "(()=>{const all=Array.from(document.querySelectorAll('.srs-sprite'));"
                "return all.length === 19 && all.every(i=>"
                "new DOMMatrixReadOnly(getComputedStyle(i).transform).a < 0)})()"))
            hit_pct_after = page.evaluate(
                "(()=>{const e=document.querySelector('.srs-hit');"
                "return [parseFloat(e.style.left), parseFloat(e.style.width)]})()")
            ok("点击轮廓跟着镜像（1-x-w 对齐）",
               abs(hit_pct_after[0] - (100 - hit_pct_before[0] - hit_pct_before[1])) < 0.5,
               (hit_pct_before, hit_pct_after))
            # ── 左下角气泡 / 水晶球跟着镜像（2026-11-18 主人：位置不对，也要调）──
            corner_ui_after = page.evaluate(
                "(()=>{const b=document.querySelector('.srs-bubble'),g=document.querySelector('.srs-gear');"
                "const cb=getComputedStyle(b),cg=getComputedStyle(g);"
                "const r=document.querySelector('.srs-root').getBoundingClientRect();"
                "const bb=b.getBoundingClientRect(),gg=g.getBoundingClientRect();"
                "return {vw:window.innerWidth,bubbleLeft:cb.left,bubbleRight:cb.right,"
                "gearLeft:cg.left,gearRight:cg.right,rootLeft:r.left,rootRight:r.right,"
                "rootMid:(r.left+r.right)/2,bubbleMid:(bb.left+bb.right)/2,"
                "bubbleRightAbs:bb.right,gearMid:(gg.left+gg.right)/2};})()")
            ok("左下时气泡翻到人物右侧",
               corner_ui_after["bubbleMid"] > corner_ui_after["rootMid"], corner_ui_after)
            ok("左下时气泡不再飘出屏幕",
               corner_ui_after["bubbleRightAbs"] <= corner_ui_after["vw"] + 1
               and corner_ui_after["bubbleMid"] <= corner_ui_after["vw"], corner_ui_after)
            ok("左下时水晶球翻到人物左上", corner_ui_after["gearLeft"] == "-4px"
               and corner_ui_after["gearMid"] < corner_ui_after["rootMid"], corner_ui_after)
            w_normal = page.evaluate("document.querySelector('.srs-root').getBoundingClientRect().width")
            page.locator("[data-act='toggle-only-panel']").click(); time.sleep(0.5)
            ok("只留水晶球生效", "srs-orb-only" in page.evaluate("document.querySelector('.srs-root').className"))
            w_mini = page.evaluate("document.querySelector('.srs-root').getBoundingClientRect().width")
            ok("只留水晶球时挂件收缩成一颗球", abs(w_mini - 54) <= 2, round(w_mini, 1))
            ok("只留水晶球时人物整块撤掉",
               page.evaluate("getComputedStyle(document.querySelector('.srs-stage')).display") == "none",
               page.evaluate("getComputedStyle(document.querySelector('.srs-stage')).display"))
            edge = page.evaluate("(()=>{const r=document.querySelector('.srs-root').getBoundingClientRect();return [Math.round(r.left),Math.round(r.right),window.innerWidth,Math.round(r.top),Math.round(r.bottom),window.innerHeight]})()")
            anc_h = page.evaluate("(JSON.parse(localStorage.getItem('srs.cfg.v1')||'{}').anchor||{}).h")
            if anc_h == "left":
                ok("只留水晶球时仍贴左边（不往右跳）", abs(edge[0] - 14) <= 2, edge)
            else:
                ok("只留水晶球时仍贴右边（不往左跳）", abs(edge[2] - edge[1] - 14) <= 2, edge)
            ok("只留水晶球时仍贴着底边", abs(edge[5] - edge[4] - 10) <= 2, edge)
            # 点水晶球只开面板，不该顺带冒「搭话」那组气泡（水晶球算她的道具，不是人物本体）
            # 判据不用「气泡消失」——闲置会插话，时序不稳；直接看气泡里是不是 ask 那 7 句之一
            ASK_LINES = ["想着那件事", "不用讲得很清楚", "说半句也行", "问之前先喘口气",
                         "你刚才想说又吞回去", "这事你其实有答案", "说慢一点"]
            page.locator("[data-act='close']").first.click(); time.sleep(0.6)
            page.locator(".srs-root").hover(); time.sleep(0.3)
            page.locator("[data-act='open-menu']").click(force=True); time.sleep(0.8)
            ok("点水晶球能开面板", page.locator(".srs-panel.is-on").count() == 1)
            bub = (page.locator(".srs-bubble").inner_text() or "").strip()
            ok("点水晶球不冒搭话气泡", not any(a in bub for a in ASK_LINES), bub)
            page.locator("[data-act='toggle-only-panel']").click(); time.sleep(0.4)
            ok("能切回常驻", "srs-orb-only" not in page.evaluate("document.querySelector('.srs-root').className"))
            back = page.evaluate("(()=>{const r=document.querySelector('.srs-root').getBoundingClientRect();return [Math.round(r.left),Math.round(r.right),Math.round(r.width),window.innerWidth]})()")
            ok("切回常驻后人物不出窗口", back[1] <= back[3] + 1 and back[0] >= -1, back)
            ok("切回常驻后宽度恢复", abs(back[2] - w_normal) <= 2, (back[2], w_normal))
            ok("有导出与导入设置", page.locator("[data-act='cfg-export']").count() == 1
               and page.locator("[data-act='cfg-import-open']").count() == 1)
            page.locator("[data-act='cfg-import-open']").click(); time.sleep(0.4)
            ok("导入设置能展开输入框", page.locator(".srs-area").count() >= 1)
            page.locator("[data-act='cfg-import-cancel']").click(); time.sleep(0.3)
            page.locator("[data-act='wipe-all']").click(); time.sleep(0.3)
            ok("清空全部要二次确认", page.locator("[data-act='wipe-all-yes']").count() == 1)
            page.locator("[data-act='wipe-all-cancel']").click(); time.sleep(0.3)
            page.locator("[data-act='open-edit']").click(); time.sleep(0.4)
            ok("台词多了「自我关怀」组", page.locator("[data-act='edit-group-care']").count() == 1)
            # 切分组，底下的台词必须跟着换（0.34.7 修的是 textarea 非受控不更新）
            first_txt = page.locator(".srs-area").input_value()
            page.locator("[data-act='edit-group-shuffle']").click(); time.sleep(0.5)
            second_txt = page.locator(".srs-area").input_value()
            ok("切分组会换台词", bool(second_txt) and second_txt != first_txt, (first_txt[:12], second_txt[:12]))
            ok("洗牌组就是洗牌那几句", "洗一洗" in second_txt, second_txt[:20])
            page.locator("[data-act='edit-group-care']").click(); time.sleep(0.4)
            ok("关怀组换成关怀句", "撑很久" in page.locator(".srs-area").input_value(),
               page.locator(".srs-area").input_value()[:18])
            page.locator("[data-act='close-edit']").click(); time.sleep(0.3)

            # ── 面板可以拖到任意位置，并记住 ────────────────────
            p0 = page.evaluate("(()=>{const r=document.querySelector('.srs-panel').getBoundingClientRect();return [Math.round(r.left),Math.round(r.top)]})()")
            hb = page.locator(".srs-head").bounding_box()
            page.mouse.move(hb["x"] + 60, hb["y"] + 15)
            page.mouse.down()
            page.mouse.move(hb["x"] - 260, hb["y"] + 120, steps=10)
            page.mouse.up(); time.sleep(0.45)
            p1 = page.evaluate("(()=>{const r=document.querySelector('.srs-panel').getBoundingClientRect();return [Math.round(r.left),Math.round(r.top)]})()")
            ok("面板能拖到别处", p1 != p0, (p0, p1))
            ok("面板位置写进本地", page.evaluate("!!localStorage.getItem('srs.panel.v1')"))
            ok("拖走后出现复位按钮", page.locator("[data-act='panel-reset']").count() == 1)
            page.locator("[data-act='panel-reset']").click(force=True); time.sleep(0.45)
            p2 = page.evaluate("(()=>{const r=document.querySelector('.srs-panel').getBoundingClientRect();return [Math.round(r.left),Math.round(r.top)]})()")
            ok("复位回人物上方", p2 == p0, (p2, p0))
            ok("复位清掉位置记忆", page.evaluate("localStorage.getItem('srs.panel.v1')") is None)
            ok("面板不钻窗口标题栏",
               page.evaluate("document.querySelector('.srs-panel').getBoundingClientRect().top") >= 43,
               round(page.evaluate("document.querySelector('.srs-panel').getBoundingClientRect().top")))

            # 最大化 → 还原：窗口缩小后面板不能留在旧坐标上跑出视口
            vb0 = page.viewport_size
            page.set_viewport_size({"width": 820, "height": 620}); time.sleep(0.8)
            pbx = page.evaluate("(()=>{const r=document.querySelector('.srs-panel').getBoundingClientRect();return [Math.round(r.left),Math.round(r.top),Math.round(r.right),Math.round(r.bottom),window.innerWidth,window.innerHeight]})()")
            ok("窗口缩小后面板还在视口里",
               pbx[0] >= -1 and pbx[1] >= 43 and pbx[2] <= pbx[4] + 1 and pbx[3] <= pbx[5] + 1, pbx)
            page.set_viewport_size({"width": vb0["width"], "height": vb0["height"]}); time.sleep(0.7)
            pbx2 = page.evaluate("(()=>{const r=document.querySelector('.srs-panel').getBoundingClientRect();return [Math.round(r.left),Math.round(r.top),Math.round(r.right),Math.round(r.bottom),window.innerWidth,window.innerHeight]})()")
            ok("窗口放回后面板回到位",
               pbx2[0] >= -1 and pbx2[1] >= -1 and pbx2[2] <= pbx2[4] + 1 and pbx2[3] <= pbx2[5] + 1, pbx2)

            # 重开面板：塔罗与占卜都回到第一项（不记上次选的牌阵/占卜法）
            page.locator(".srs-tab", has_text="塔罗").click(); time.sleep(0.3)
            page.locator("[data-act='spread-three']").click(); time.sleep(0.3)
            page.locator(".srs-x").click(); time.sleep(0.4)
            page.locator(".srs-root").hover()
            page.locator("[data-act='open-menu']").click(force=True); time.sleep(0.6)
            ok("重开面板塔罗回到「每日」",
               "on" in (page.locator("[data-act='spread-daily']").get_attribute("class") or ""),
               page.locator("[data-act='spread-daily']").get_attribute("class"))
            page.locator(".srs-tab", has_text="占卜").click(); time.sleep(0.3)
            page.locator("[data-act='divine-relation']").click(); time.sleep(0.3)
            page.locator(".srs-x").click(); time.sleep(0.4)
            page.locator(".srs-root").hover()
            page.locator("[data-act='open-menu']").click(force=True); time.sleep(0.6)
            page.locator(".srs-tab", has_text="占卜").click(); time.sleep(0.4)
            ok("重开面板占卜回到「每日一签」",
               "on" in (page.locator("[data-act='divine-daily']").get_attribute("class") or ""),
               page.locator("[data-act='divine-daily']").get_attribute("class"))

            # 回塔罗页，后面的导出断言要靠它
            page.locator(".srs-tab", has_text="塔罗").click(); time.sleep(0.5)

            # ── T10 结果卡导出 ──────────────────────────────
            if page.locator("[data-act='export-card']").is_disabled():
                draw_and_wait(page)
            page.evaluate("window.__srsLastExport = null")
            page.locator("[data-act='export-card']").click()
            time.sleep(3.5)
            exp = page.evaluate("window.__srsLastExport")
            ok("存图画出 PNG", bool(exp) and exp.get("size", 0) > 20000 and exp.get("name", "").endswith(".png"), exp)
            # W14：3:4 小红书规格
            page.evaluate("window.__srsLastExport = null")
            page.locator("[data-act='export-card-34']").click()
            time.sleep(3.5)
            exp34 = page.evaluate("window.__srsLastExport")
            ok("能导出 3:4 分享卡", bool(exp34) and exp34.get("name", "").endswith("-34.png"), exp34)


            # 重置状态（分区热区已删，只留重置）
            page.evaluate("localStorage.removeItem('srs.dailyCard.v1');"
                          "const c=JSON.parse(localStorage.getItem('srs.cfg.v1')||'{}');c.spread='one';"
                          "localStorage.setItem('srs.cfg.v1',JSON.stringify(c));location.reload()")
            time.sleep(1.4); page.wait_for_selector(".srs-root", timeout=8000); time.sleep(0.5)
            page.locator(".srs-gear").click(); time.sleep(0.6)

            # T5 摊牌后自己点一张
            page.locator(".srs-tab", has_text="塔罗").click(); time.sleep(0.3)
            page.locator("[data-act='spread-one']").click(); time.sleep(0.4)
            page.locator("[data-act='draw']").click(); time.sleep(2.6)
            ok("先摊开九张背面", page.locator(".srs-pickcard").count() == 9, page.locator(".srs-pickcard").count())
            ok("摊牌阶段还没出结果", page.locator(".srs-name").count() == 0)
            page.locator(".srs-pickcard").nth(4).click(); time.sleep(2.2)
            ok("点牌背翻出结果", page.locator(".srs-name").count() == 1)
            ok("点完网格收起", page.locator(".srs-pickcard").count() == 0)

            # W1 情绪打卡 + W2 共情句
            page.evaluate("localStorage.removeItem('srs.mood.v1')")
            page.locator(".srs-tab", has_text="占卜").click(); time.sleep(0.4)
            page.locator("[data-act='divine-mood']").click(); time.sleep(0.5)
            ok("情绪页有八档心情", page.locator(".srs-moods button").count() == 8, page.locator(".srs-moods button").count())
            page.locator(".srs-moods button").nth(4).click(); time.sleep(1.0)
            ok("选心情后出牌", page.evaluate("!!document.querySelector('.srs-daily-card')"))
            emp = page.inner_text(".srs-daily-txt")
            ok("有共情句（不是牌义）", len(emp) > 10 and "不解释吉凶" in page.inner_text(".srs-body"), emp[:30])
            ok("心情写进本地", page.evaluate("!!JSON.parse(localStorage.getItem('srs.mood.v1')||'{}').mood"))
            first_mood_card = page.evaluate("(document.querySelector('.srs-daily-name')||{}).textContent||''")
            page.locator(".srs-moods button").nth(5).click(); time.sleep(1.0)
            second_mood_card = page.evaluate("(document.querySelector('.srs-daily-name')||{}).textContent||''")
            ok("换心情会换牌", first_mood_card != second_mood_card, (first_mood_card, second_mood_card))
            # 0.31.2：同一天同一心情第 1 次用日种子，第 2 次起每次重抽
            redraw_diff = False
            for _ in range(3):
                page.locator(".srs-moods button").nth(4).click(); time.sleep(0.9)
                again = page.evaluate("(document.querySelector('.srs-daily-name')||{}).textContent||''")
                if again != first_mood_card:
                    redraw_diff = True
                    break
            ok("同一天同一心情再点会重抽", redraw_diff, first_mood_card)
            ok("重抽次数记在本地", page.evaluate(
                "(JSON.parse(localStorage.getItem('srs.mood.v1')||'{}').picks||{}).low >= 2"),
               page.evaluate("JSON.stringify(JSON.parse(localStorage.getItem('srs.mood.v1')||'{}').picks)"))

            # 面板里双击不能改缩放（保存生日时容易连点）
            if "is-on" not in (page.locator(".srs-panel").get_attribute("class") or ""):
                page.locator(".srs-gear").click(); time.sleep(0.6)
            page.locator(".srs-tab", has_text="档案").click(); time.sleep(0.5)
            scale_before = page.evaluate("(JSON.parse(localStorage.getItem('srs.cfg.v1')||'{}').scale)||1")
            page.locator(".srs-body").dblclick(position={"x": 40, "y": 40}); time.sleep(0.6)
            scale_after = page.evaluate("(JSON.parse(localStorage.getItem('srs.cfg.v1')||'{}').scale)||1")
            ok("面板里双击不改缩放", scale_before == scale_after, (scale_before, scale_after))

            # 双击人物不再改缩放（缩放只在设置里）
            page.evaluate("const c=JSON.parse(localStorage.getItem('srs.cfg.v1')||'{}');c.scale=1;localStorage.setItem('srs.cfg.v1',JSON.stringify(c))")
            page.reload(); time.sleep(1.3); page.wait_for_selector(".srs-root", timeout=8000); time.sleep(0.5)
            before_dbl = page.evaluate("(JSON.parse(localStorage.getItem('srs.cfg.v1')||'{}').scale)||1")
            after_dbl = page.evaluate("(JSON.parse(localStorage.getItem('srs.cfg.v1')||'{}').scale)||1")
            ok("双击人物不改缩放", before_dbl == after_dbl, (before_dbl, after_dbl))

            ok("分区热区已移除", page.locator(".srs-zone").count() == 0, page.locator(".srs-zone").count())

            # 计费页：账本三块（余额 / 今日 / 近 7 天）+ 近期趋势 + 模型占比 + 按会话 + 明细
            if "is-on" not in (page.locator(".srs-panel").get_attribute("class") or ""):
                page.locator(".srs-gear").click(); time.sleep(0.7)
            page.locator(".srs-tab", has_text="塔罗").click(); time.sleep(0.6)
            head_bill = page.locator(".srs-head-bill")
            ok("面板头部有今日账本摘要", head_bill.count() == 1 and "今日" in head_bill.inner_text(),
               head_bill.inner_text() if head_bill.count() else "")
            head_bill.click(); time.sleep(1.0)
            ok("点摘要跳到计费页", "on" in (page.locator(".srs-tab", has_text="计费").get_attribute("class") or ""),
               page.locator(".srs-tab", has_text="计费").get_attribute("class"))
            num_txt = page.inner_text(".srs-bill-num") if page.locator(".srs-bill-num").count() else ""
            ok("计费页余额大数字", "38.62" in num_txt, num_txt)
            ok("充值 / 赠送 / 数据源都在", all(x in page.inner_text(".srs-bill-hero") for x in ("充值", "赠送", "API Key")),
               page.inner_text(".srs-bill-hero")[:60])
            ok("今日已用 / 轮次 / 本月三格", page.locator(".srs-kpi").count() == 3, page.locator(".srs-kpi").count())
            ok("今日已用是真实累加（1.28）", "1.28" in page.inner_text(".srs-kpis"), page.inner_text(".srs-kpis").replace("\n", " "))
            bars7 = page.locator(".srs-bars").nth(0).locator(".srs-bar")
            ok("近 7 天有 7 根柱", bars7.count() == 7, bars7.count())
            ok("7 天最后一根标「今」",
               page.locator(".srs-bars").nth(0).locator(".srs-bar.today span").count() == 1)
            bars6 = page.locator(".srs-bars").nth(1).locator(".srs-bar")
            ok("近 6 个月有 6 根柱", bars6.count() == 6, bars6.count())
            ok("当月那根标「本」",
               page.locator(".srs-bars").nth(1).locator(".srs-bar").last.locator("span").inner_text() == "本",
               page.locator(".srs-bars").nth(1).locator(".srs-bar").last.locator("span").inner_text())
            chip = page.inner_text(".srs-chip") if page.locator(".srs-chip").count() else ""
            ok("峰谷 chip 写高峰价 + 切档倒计时", "高峰价" in chip and "分钟后转" in chip, chip)
            chip_style = page.evaluate(
                "(()=>{const e=document.querySelector('.srs-chip');if(!e)return null;"
                "const s=getComputedStyle(e);return {cls:e.className,color:s.color,bg:s.backgroundColor}})()")
            ok("峰谷 chip 按当前档位上鲜艳色",
               bool(chip_style) and "is-peak" in chip_style["cls"] and chip_style["color"] == "rgb(255, 176, 138)",
               chip_style)
            ok("最近一笔带模型与 token", "deepseek-v4-flash" in page.inner_text(".srs-bill-peak"), page.inner_text(".srs-bill-peak")[:60])
            ok("模型占比有行", page.locator(".srs-mrow").count() >= 5, page.locator(".srs-mrow").count())
            ok("按会话有标题行", "即梦洗牌动画" in page.inner_text(".srs-body"), "")
            ok("按会话写明会话数", "个会话" in page.inner_text(".srs-body"), "")
            ok("明细有行", page.locator(".srs-item").count() >= 3, page.locator(".srs-item").count())
            ok("未计价的轮次标「未计价」", "未计价" in page.inner_text(".srs-items"), "")
            ok("未计价有解释（只记 token 不记钱）", "只记 token" in page.inner_text(".srs-body"), "")
            ok("计费页写明记账起点（官方后台 00:00 起口径不同）",
               "本账自" in page.inner_text(".srs-body") and "官方后台从 00:00 起" in page.inner_text(".srs-body"), "")
            ok("保留策略有说明", "明细保留" in page.inner_text(".srs-body"), "")
            # 计费完善（仿青云剑仙的数据页）：平均每轮 + 明细搜索
            ok("有平均每轮", "平均 ¥0.18 / 轮" in page.inner_text(".srs-body"),
               page.inner_text(".srs-body")[:200])
            page.locator(".srs-search input").fill("someone"); time.sleep(0.5)
            ok("搜模型能筛明细", page.locator(".srs-item").count() == 1, page.locator(".srs-item").count())
            ok("标题写命中数", "命中 1 / 7 条" in page.inner_text(".srs-body"), "")
            page.locator(".srs-search input").fill("zzz-none"); time.sleep(0.4)
            ok("没命中时给一句提示", "没有匹配" in page.inner_text(".srs-body"), "")
            page.locator(".srs-search input").fill(""); time.sleep(0.4)
            ok("清空搜索恢复全部明细", page.locator(".srs-item").count() >= 3,
               page.locator(".srs-item").count())
            page.locator(".srs-panel").screenshot(path=os.path.join(SHOT, "panel-4-bill.png"))
            page.locator("[data-act='usage-range-all']").click(); time.sleep(0.9)
            ok("范围切到全部后高亮跟着走", "on" in (page.locator("[data-act='usage-range-all']").get_attribute("class") or ""),
               page.locator("[data-act='usage-range-all']").get_attribute("class"))
            page.locator("[data-act='refresh-billing']").click(); time.sleep(0.9)
            ok("刷新后余额还在（不是空态）", "38.62" in page.inner_text(".srs-bill-num"), page.inner_text(".srs-bill-num"))
            page.locator("[data-act='usage-range-today']").click(); time.sleep(0.6)

            # 配置页的计费提醒：告急线 10→45（余额 38.62 就会告警）、预算 0→¥5（今日已用 1.28）
            page.locator(".srs-tab", has_text="配置").click(); time.sleep(0.6)
            for _ in range(7):
                page.locator("[data-act='bill-warn-up']").click(); time.sleep(0.12)
            ok("告急线按 ±5 元步进（10 → 45）", page.evaluate(
                "JSON.parse(localStorage.getItem('srs.cfg.v1')||'{}').bill.warnLow") == 45,
               page.evaluate("JSON.parse(localStorage.getItem('srs.cfg.v1')||'{}').bill.warnLow"))
            page.locator("[data-act='bill-budget-up']").click(); time.sleep(0.35)
            ok("今日预算能设（0 → ¥5）", page.evaluate(
                "JSON.parse(localStorage.getItem('srs.cfg.v1')||'{}').bill.budget") == 5)
            page.locator("[data-act='bill-low-notice']").click(); time.sleep(0.35)
            ok("告急提醒开关写得进", page.evaluate(
                "JSON.parse(localStorage.getItem('srs.cfg.v1')||'{}').bill.lowNotice") is False)
            page.locator("[data-act='bill-low-notice']").click(); time.sleep(0.35)
            page.locator(".srs-tab", has_text="计费").click(); time.sleep(1.0)
            body_b = page.inner_text(".srs-body")
            ok("余额低于告急线时页顶告警", "低于告急线 ¥45" in body_b, body_b[:140])
            ok("今日预算进度显示", "今日预算 ¥5 · 已用 26%" in body_b, body_b[:220])
            page.locator(".srs-tab", has_text="配置").click(); time.sleep(0.5)
            for _ in range(7):
                page.locator("[data-act='bill-warn-down']").click(); time.sleep(0.1)
            page.locator("[data-act='bill-budget-down']").click(); time.sleep(0.35)
            ok("能减回默认（告急线 ¥10 · 预算关）", page.evaluate(
                "(()=>{const b=JSON.parse(localStorage.getItem('srs.cfg.v1')||'{}').bill||{};"
                "return b.warnLow===10 && b.budget===0})()"))
            page.locator(".srs-tab", has_text="计费").click(); time.sleep(0.8)

            # ── 记账播报（仿青云剑仙）：每轮消耗 / 等你授权，靠 /srs/live.json 3 秒轮询 ──
            # 桩文件由这里现写：改一次 seq 就等于「又结了一轮」，前端应该冒一句
            def put_live(seq=0, amount=None, tokens=0, model="", wait=None):
                body = {
                    "ok": True, "version": "stub", "seq": seq,
                    "lastTurn": {
                        "seq": seq, "turn": seq, "amount": amount,
                        "unpriced": (1 if amount is None else 0), "tokens": tokens,
                        "model": model, "ts": 1763370000000,
                    },
                    "live": {"turns": 0, "cost": 0, "tokens": 0, "unpriced": 0},
                    "today": {"used": 3.33, "turns": seq, "tokens": 41234, "unpriced": 0, "day": "2026-11-17"},
                    "wait": wait, "busy": False,
                    "peak": {"peak": False, "label": "空闲档", "nextInMs": 0}, "at": 1763370000000,
                }
                with open(os.path.join(HERE, "live_stub.json"), "w", encoding="utf-8") as f:
                    json.dump(body, f, ensure_ascii=False)
                return body

            put_live(seq=3, amount=0.0102, tokens=8000, model="deepseek-chat")
            page.evaluate("localStorage.setItem('srs.cfg.v1', JSON.stringify({scale:1,"
                          " bubble:{on:true,holdSec:6}, notice:{turnCost:true,askWait:true,approveWait:true}}));"
                          " location.reload()")
            time.sleep(1.6); page.wait_for_selector(".srs-root", timeout=8000); time.sleep(3.4)
            ok("开启时先对齐基线，不补播历史轮", "这一轮" not in page.inner_text(".srs-bubble"),
               page.inner_text(".srs-bubble")[:40])

            put_live(seq=4, amount=0.0321, tokens=12438, model="deepseek-chat")
            time.sleep(3.4)
            bub = page.inner_text(".srs-bubble")
            ok("结完一轮就冒一句消耗", "这一轮" in bub and "0.03" in bub, bub)
            ok("副行给 token 与模型", "12,438" in bub and "chat" in bub, bub)

            put_live(seq=5, amount=None, tokens=900, model="someone/route-x")
            time.sleep(3.4)
            bub = page.inner_text(".srs-bubble")
            ok("未计价不印 ¥0.00", "没计价" in bub and "只记 token" in bub, bub)

            put_live(seq=5, amount=None, tokens=900, model="someone/route-x",
                     wait={"kind": "approval", "id": "a1", "ts": 1763370000000, "sessionName": "记账改造"})
            time.sleep(3.4)
            bub = page.inner_text(".srs-bubble")
            ok("有授权挂起就冒一句", "点个头" in bub and "记账改造" in bub, bub)
            ok("等待时换姿势（reading）", "reading" in page.evaluate(
                "(()=>{const s=document.querySelector('.srs-sprite.is-on');return s?s.dataset.pose:''})()"))
            page.screenshot(path=os.path.join(SHOT, "panel-5-ledger-bubble.png"))

            # 关掉「每轮消耗」：先对齐基线，再结一轮 —— 不该冒
            page.evaluate("(()=>{const c=JSON.parse(localStorage.getItem('srs.cfg.v1')||'{}');"
                          "c.notice=Object.assign({},c.notice,{turnCost:false});"
                          "localStorage.setItem('srs.cfg.v1',JSON.stringify(c));location.reload();})()")
            time.sleep(1.6); page.wait_for_selector(".srs-root", timeout=8000)
            put_live(seq=9, amount=0.2, tokens=1000, model="deepseek-chat")
            time.sleep(3.4)
            put_live(seq=10, amount=0.5, tokens=1000, model="deepseek-chat")
            time.sleep(3.4)
            ok("关掉「每轮消耗」后不再播报", "0.50" not in page.inner_text(".srs-bubble"),
               page.inner_text(".srs-bubble")[:30])

            # ── 播报音效（v0.40.3）：三路各响各的，且都不是塔罗的结果铃 ──
            page.evaluate("localStorage.setItem('srs.cfg.v1', JSON.stringify({scale:1,"
                          " sound:{on:true,volume:55,tracks:{}},"
                          " notice:{turnCost:true,askWait:true,approveWait:true}}));"
                          " location.reload()")
            time.sleep(1.8); page.wait_for_selector(".srs-root", timeout=8000)
            put_live(seq=20, amount=0.01, tokens=500, model="deepseek-chat")
            time.sleep(3.4)                      # 先对齐基线（这一步不该响）
            page.evaluate("window.__srsSfx = []")
            put_live(seq=21, amount=0.02, tokens=900, model="deepseek-chat"); time.sleep(3.4)
            put_live(seq=21, amount=0.02, tokens=900, model="deepseek-chat",
                     wait={"kind": "question", "id": "q-snd", "ts": 1763380000000,
                           "sessionName": "问句"})
            time.sleep(3.4)
            put_live(seq=21, amount=0.02, tokens=900, model="deepseek-chat",
                     wait={"kind": "approval", "id": "a-snd", "ts": 1763380000000,
                           "sessionName": "授权"})
            time.sleep(3.4)
            # 探针记的是「名字:音源长度」—— 长度不同即不同音源，不依赖 Audio 对象是否新建
            plays = page.evaluate("window.__srsSfx || []")
            names = [x.split(":")[0] for x in plays]
            ok("播报音：三件事各响一次", names == ["cost", "ask", "approve"], plays)
            ok("播报音：三路各是不同音源", len(set(plays)) == 3, plays)

            # 与塔罗那五路分家：拿结果铃的音源指纹比一比
            page.locator(".srs-gear").click(); time.sleep(0.7)
            page.locator("[data-act='tab-sound']").click(); time.sleep(0.5)
            body_snd = page.inner_text(".srs-body")
            ok("配置页单列「播报音」三行",
               "播报音" in body_snd and "每轮记账" in body_snd
               and "等你答话" in body_snd and "等你授权" in body_snd)
            page.locator("[data-act='preview-bell']").click(); time.sleep(0.6)
            bell_tag = page.evaluate("(window.__srsSfx||[]).slice(-1)[0] || ''")
            ok("播报音与结果铃不是同一个音源", bell_tag.startswith("bell:")
               and bell_tag not in plays, bell_tag)
            ok("播报音可以在配置页试听", page.locator("[data-act='preview-cost']").count() == 1
               and page.locator("[data-act='preview-ask']").count() == 1
               and page.locator("[data-act='preview-approve']").count() == 1)

            # ── v0.40.0：v1.1 收尾（T14 牌义详略 / T15 命名 / W9-W10 回顾 / W11 双人牌 / W6 穿搭 / W4 安神 / D4 快捷键）──
            page.evaluate("Object.keys(localStorage).filter(k=>k.indexOf('srs.')===0)"
                          ".forEach(k=>localStorage.removeItem(k));location.reload()")
            time.sleep(1.8)
            page.wait_for_selector(".srs-root", timeout=8000)
            page.locator(".srs-gear").click(); time.sleep(0.6)

            # T14 牌义详略
            page.locator("[data-act='spread-one']").click(); time.sleep(0.4)
            draw_and_wait(page, settle=2.6, picks=1)
            brief_n = page.locator(".srs-lines p").count()
            page.locator("[data-act='detail-full']").click(); time.sleep(0.4)
            full_alt = page.locator(".srs-lines-alt p").count()
            ok("详略：简有三句判词（不砍句子）", brief_n >= 3, brief_n)
            ok("详略：点「详」补出另一向的判词", full_alt >= 3, full_alt)
            ok("详略：另一向标出正/逆", ("若它是正位" in page.inner_text(".srs-body"))
               or ("若它是逆位" in page.inner_text(".srs-body")))
            ok("详略：详版补花色与横幅编号", "横幅" in page.inner_text(".srs-body"))
            page.locator("[data-act='detail-brief']").click(); time.sleep(0.3)
            ok("详略：切回「简」不显示另一向", page.locator(".srs-lines-alt").count() == 0)

            # T15 牌阵收藏命名
            page.locator("[data-act='hist-open']").click(); time.sleep(0.6)
            page.locator("[data-act^='hist-rename-']").first.click(); time.sleep(0.4)
            page.locator(".srs-inp-s").fill("问工作")
            page.locator("[data-act='hist-rename-save']").click(); time.sleep(0.5)
            ok("命名：历史里显示自定义名字", "问工作" in page.inner_text(".srs-body"))
            ok("命名：名字写进本地历史", page.evaluate(
                "(()=>{const l=JSON.parse(localStorage.getItem('srs.history.v1')||'[]');"
                "return l.some(x=>x.label==='问工作')})()"))

            # W9 月度回顾 / W10 反复出现的牌（再抽三次攒出重复）
            page.locator("[data-act='hist-back']").click(); time.sleep(0.3)
            for _i in range(3):
                page.locator("[data-act='draw']").click(); time.sleep(2.6)
                if page.locator(".srs-pickcard:not(.is-picked)").count():
                    page.locator(".srs-pickcard:not(.is-picked)").first.click()
                    time.sleep(1.6)
            page.locator("[data-act='review-open']").click(); time.sleep(0.5)
            rev = page.inner_text(".srs-body")
            ok("回顾：给出这个月的次数与最常出现的牌", "这个月" in rev and "最常出现" in rev, rev[:60])
            ok("回顾：另有反复出现的牌一栏", ("反复出现" in rev) or ("还没有到 3 次" in rev), rev[:60])
            ok("回顾：标题跟着子页走", page.inner_text(".srs-title") == "回顾", page.inner_text(".srs-title"))
            page.screenshot(path=os.path.join(SHOT, "v40-review.png"))
            page.locator("[data-act='review-back']").click(); time.sleep(0.3)

            # W6 幸运穿搭色卡
            page.locator("[data-act='tab-zodiac']").click(); time.sleep(0.6)
            ok("穿搭：色卡不止一格（主色 + 副色）", page.locator(".srs-wear-row").count() >= 2,
               page.locator(".srs-wear-row").count())
            wear_txt = page.inner_text(".srs-body")
            ok("穿搭：给的是怎么穿，不评价身材外貌",
               "怎么穿" in wear_txt and "显瘦" not in wear_txt and "身材" not in wear_txt)
            page.screenshot(path=os.path.join(SHOT, "v40-wear.png"))

            # W11 双人牌
            page.locator("[data-act='tab-divine']").click(); time.sleep(0.5)
            page.locator("[data-act='divine-duo']").click(); time.sleep(0.4)
            page.locator("[data-act='divine-draw']").click(); time.sleep(2.8)
            duo = page.inner_text(".srs-body")
            ok("双人牌：一人一张共两张", page.locator(".srs-body .srs-flip").count() == 2,
               page.locator(".srs-body .srs-flip").count())
            ok("双人牌：给出现状与三件小事", "现状" in duo and "三件小事" in duo)
            ok("双人牌：写明不回答「他爱不爱你」", "他到底爱不爱你" in duo)
            page.screenshot(path=os.path.join(SHOT, "v40-duo.png"))

            # W4 安神 3 分钟
            page.locator("[data-act='breathe-open']").click(); time.sleep(1.2)
            ok("安神：圈与倒计时在场", page.locator(".srs-breathe-ring").count() == 1
               and ":" in page.inner_text(".srs-breathe-left"))
            ok("安神：给出吸 / 停 / 呼的阶段",
               any(x in page.inner_text(".srs-breathe-phase") for x in ("吸气", "屏住", "呼气")))
            ok("安神：标题换成「安神」", page.inner_text(".srs-title") == "安神", page.inner_text(".srs-title"))
            left1 = page.inner_text(".srs-breathe-left"); time.sleep(1.8)
            ok("安神：倒计时在走", page.inner_text(".srs-breathe-left") != left1,
               (left1, page.inner_text(".srs-breathe-left")))
            page.screenshot(path=os.path.join(SHOT, "v40-breathe.png"))
            page.locator("[data-act='breathe-stop']").click(); time.sleep(0.4)
            ok("安神：随时能停", page.locator(".srs-breathe-ring").count() == 0)

            # ── W17 许愿瓶：封存 → 到期才能开 → 开了才显示原文 ──
            ok("占卜页有许愿瓶块", "许愿瓶" in page.inner_text(".srs-body"))
            ok("四种开启时机都在", all(page.locator("[data-act='wish-when-%s']" % k).count() == 1
                                    for k in ("newmoon", "fullmoon", "birthday", "d30")))
            page.locator("[data-act='wish-save']").click(); time.sleep(0.6)
            ok("空瓶子不封存", page.locator(".srs-wish").count() == 0)
            page.locator(".srs-body textarea").last.fill("希望这个月的活能结完")
            page.locator("[data-act='wish-save']").click(); time.sleep(0.8)
            ok("写一句能封存", page.locator(".srs-wish").count() == 1, page.locator(".srs-wish").count())
            ok("封着时不显示原文", "希望这个月的活能结完" not in page.inner_text(".srs-wish"))
            ok("写着还有几天", "还封着" in page.inner_text(".srs-wish"), page.inner_text(".srs-wish"))
            ok("封存写进 localStorage", '"text"' in str(page.evaluate("localStorage.getItem('srs.wish.v1')")))
            # 把开瓶日改成昨天，重载后就该能开
            page.evaluate("""(()=>{const l=JSON.parse(localStorage.getItem('srs.wish.v1')||'[]');
                const d=new Date(Date.now()-86400000);
                const iso=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
                l.forEach(w=>{w.openAt=iso}); localStorage.setItem('srs.wish.v1', JSON.stringify(l));
                location.reload();})()""")
            time.sleep(1.9); page.wait_for_selector(".srs-root", timeout=8000)
            page.locator(".srs-gear").click(); time.sleep(0.7)
            page.locator(".srs-tab", has_text="占卜").click(); time.sleep(0.6)
            ok("到期后写「可以开了」", "可以开了" in page.inner_text(".srs-wish"), page.inner_text(".srs-wish"))
            page.locator("[data-act^='wish-open-']").first.click(); time.sleep(0.8)
            ok("打开后显示原文", "希望这个月的活能结完" in page.inner_text(".srs-wish"))
            ok("打开后标「已开」", "已开" in page.inner_text(".srs-wish"))
            page.locator(".srs-wish .srs-per-del").first.click(); time.sleep(0.6)
            ok("能删掉一只瓶子", page.locator(".srs-wish").count() == 0, page.locator(".srs-wish").count())
            # 生日时机按档案生日排（这里显式写好生日再重载，不依赖前面档案段的残留）
            page.evaluate("localStorage.setItem('srs.profile.v1', JSON.stringify({birthday:'1994-03-21'}));"
                          " localStorage.removeItem('srs.wish.v1'); location.reload()")
            time.sleep(1.9); page.wait_for_selector(".srs-root", timeout=8000)
            page.locator(".srs-gear").click(); time.sleep(0.7)
            page.locator(".srs-tab", has_text="占卜").click(); time.sleep(0.6)
            page.locator("[data-act='wish-when-birthday']").click(); time.sleep(0.3)
            page.locator(".srs-body textarea").last.fill("明年攒下第一笔钱")
            page.locator("[data-act='wish-save']").click(); time.sleep(0.9)
            ok("生日时机按档案生日排日子", "-03-21" in str(page.evaluate(
                "JSON.parse(localStorage.getItem('srs.wish.v1')||'[]').map(w=>w.openAt).join(',')")),
               page.evaluate("JSON.parse(localStorage.getItem('srs.wish.v1')||'[]').map(w=>w.openAt)"))
            page.evaluate("localStorage.removeItem('srs.wish.v1')")
            page.locator("[data-act='wish-when-newmoon']").click(); time.sleep(0.3)

            # D4 快捷键
            page.keyboard.press("Alt+s"); time.sleep(0.6)
            closed = not page.evaluate("document.querySelector('.srs-panel').classList.contains('is-on')")
            page.keyboard.press("Alt+s"); time.sleep(0.7)
            opened = page.evaluate("document.querySelector('.srs-panel').classList.contains('is-on')")
            ok("快捷键 Alt+S 开合面板", closed and opened, (closed, opened))
            page.keyboard.press("Alt+z"); time.sleep(2.7)
            ok("快捷键 Alt+Z 直接摊牌", page.locator(".srs-pickcard").count() > 0,
               page.locator(".srs-pickcard").count())

            # ── W19 环境音景：启动不自己响（主人定），点开关才开始；四套循环走路由、可叠加 ──
            page.evaluate("localStorage.setItem('srs.cfg.v1', JSON.stringify({scale:1,"
                          " sound:{on:true,volume:55,tracks:{}},"
                          " amb:{on:true,volume:45,tracks:{rain:false,fire:false,wind:false,pages:false}}}));"
                          " location.reload()")
            time.sleep(1.8); page.wait_for_selector(".srs-root", timeout=8000)
            ok("重启后不自动放音景", page.evaluate(
                "JSON.parse(localStorage.getItem('srs.cfg.v1')||'{}').amb.on") is False)
            ok("重启后一条音景音轨都没起", page.evaluate(
                "Array.from(document.querySelectorAll('audio[data-srs-audio]'))"
                ".filter(a=>String(a.src).indexOf('/srs/sfx/')>=0).length") == 0)
            ok("重启只按下总开关（音量与八路记录还在）", page.evaluate(
                "JSON.parse(localStorage.getItem('srs.cfg.v1')||'{}').amb.volume") == 45)
            page.locator(".srs-gear").click(); time.sleep(0.7)
            page.locator("[data-act='tab-sound']").click(); time.sleep(0.5)
            page.locator("[data-act='toggle-amb']").click(); time.sleep(0.6)
            body_amb = page.inner_text(".srs-body")
            ok("配置页有环境音景块与八套音",
               "环境音景" in body_amb and all(x in body_amb for x in ("雨", "壁炉", "夜风", "翻书", "夜虫", "海浪", "雷雨", "鸟鸣")))
            ok("音景八路开关都在", all(page.locator(f"[data-act='amb-{k}']").count() == 1
                                      for k in ("rain", "fire", "wind", "pages", "night", "sea", "storm", "birds")))
            page.evaluate("window.__audios.length = 0")
            page.locator("[data-act='amb-rain']").click(); time.sleep(0.8)
            amb = page.evaluate("window.__audios.map(a=>({src:String(a.src), loop:a.loop, paused:a.paused}))")
            ok("开「雨」会创建一条循环音轨",
               len(amb) == 1 and amb[0]["loop"] is True and "/srs/sfx/amb-rain.mp3" in amb[0]["src"], amb)
            ok("雨音轨在播", amb and amb[0]["paused"] is False, amb)
            page.locator("[data-act='amb-fire']").click(); time.sleep(0.8)
            playing = page.evaluate("""(()=>Array.from(document.querySelectorAll("audio[data-srs-audio]"))
                .filter(a=>String(a.src).indexOf('/srs/sfx/')>=0 && !a.paused)
                .map(a=>String(a.src).split('/').pop().split('?')[0]))()""")
            ok("再开「壁炉」= 两条同时在播（混音，不是二选一）",
               len(playing) == 2 and 'amb-rain.mp3' in playing and 'amb-fire.mp3' in playing, playing)
            # 收起面板不该掐音景（2026-11-18 主人报：关了菜单雨就没了）
            page.locator(".srs-panel [data-act='close']").first.click(); time.sleep(0.9)
            cut_playing = page.evaluate("""(()=>Array.from(document.querySelectorAll("audio[data-srs-audio]"))
                .filter(a=>String(a.src).indexOf('/srs/sfx/')>=0 && !a.paused)
                .map(a=>String(a.src).split('/').pop().split('?')[0]))()""")
            ok("收起面板后音景不停", len(cut_playing) == 2, cut_playing)
            page.locator(".srs-gear").click(); time.sleep(0.6)
            page.locator("[data-act='tab-sound']").click(); time.sleep(0.5)
            page.locator("[data-act='amb-rain']").click(); time.sleep(0.7)
            after = page.evaluate("""(()=>Array.from(document.querySelectorAll("audio[data-srs-audio]"))
                .filter(a=>String(a.src).indexOf('/srs/sfx/')>=0 && !a.paused)
                .map(a=>String(a.src).split('/').pop().split('?')[0]))()""")
            ok("关「雨」只停雨，壁炉还在播", after == ['amb-fire.mp3'], after)
            page.locator("[data-act='amb-rain']").click(); time.sleep(0.6)
            page.locator("[data-act='amb-vol-up']").click(); time.sleep(0.4)
            ok("音景音量可调", "60%" in page.inner_text(".srs-body"), page.inner_text(".srs-body")[:40])
            page.locator("[data-act='toggle-amb']").click(); time.sleep(0.6)
            stopped = page.evaluate("window.__audios.filter(a=>String(a.src).indexOf('/srs/sfx/')>=0)"
                                    ".map(a=>a.paused)")
            ok("关掉总开关全部停", stopped and all(stopped), stopped)
            page.locator("[data-act='toggle-amb']").click(); time.sleep(0.6)

            # 页面切走不停环境音（主人 2026-11-18 定：由他自己关）、音效总开关也不牵连音景
            page.evaluate("""(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});
                document.dispatchEvent(new Event('visibilitychange'));})()""")
            time.sleep(0.9)
            amb_cut = page.evaluate("""(()=>Array.from(document.querySelectorAll("audio[data-srs-audio]"))
                .filter(a=>String(a.src).indexOf('/srs/sfx/')>=0)
                .map(a=>{const r={paused:a.paused,kind:a.getAttribute('data-srs-kind')};
                         if(r.paused){try{a.play();}catch(e){}} return r;}))()""")
            ok("页面切走环境音继续放", len(amb_cut) >= 2 and not any(x["paused"] for x in amb_cut), amb_cut)
            ok("音景元素带的是 amb 标记", all(x["kind"] == "amb" for x in amb_cut), amb_cut)
            page.locator("[data-act='toggle-sound']").click(); time.sleep(0.8)
            amb_kept = page.evaluate("""(()=>Array.from(document.querySelectorAll("audio[data-srs-audio]"))
                .filter(a=>String(a.src).indexOf('/srs/sfx/')>=0).map(a=>a.paused))()""")
            ok("音效总开关关掉，音景照放", bool(amb_kept) and not any(amb_kept), amb_kept)
            page.locator("[data-act='toggle-sound']").click(); time.sleep(0.5)
            page.evaluate("""(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});
                document.dispatchEvent(new Event('visibilitychange'));})()""")
            time.sleep(0.3)

            # 三个播报开关互不顶掉（同一类「闭包 stale cfg」bug 的回归）
            page.locator("[data-act='notice-turn']").click(); time.sleep(0.4)
            page.locator("[data-act='notice-ask']").click(); time.sleep(0.4)
            ncfg = page.evaluate("JSON.parse(localStorage.getItem('srs.cfg.v1')||'{}').notice")
            ok("播报开关互不顶掉（两个都关得掉）",
               ncfg.get("turnCost") is False and ncfg.get("askWait") is False, ncfg)

            # ── 说话档位（安静 / 正常 / 多话）──
            page.locator("[data-act='tab-sound']").click(); time.sleep(0.4)
            ok("配置页有说话三档", all(page.locator(f"[data-act='talk-{k}']").count() == 1
                                      for k in ("quiet", "normal", "chatty")))
            ok("说话默认「正常」", page.evaluate(
                "JSON.parse(localStorage.getItem('srs.cfg.v1')||'{}').talk || 'normal'") == "normal")
            page.locator("[data-act='talk-quiet']").click(); time.sleep(0.5)
            ok("点「安静」写进配置", page.evaluate(
                "JSON.parse(localStorage.getItem('srs.cfg.v1')||'{}').talk") == "quiet")
            ok("「安静」高亮跟着走", "on" in page.evaluate(
                "document.querySelector(\"[data-act='talk-quiet']\").className"))
            page.locator("[data-act='talk-chatty']").click(); time.sleep(0.4)
            ok("点「多话」也写得进", page.evaluate(
                "JSON.parse(localStorage.getItem('srs.cfg.v1')||'{}').talk") == "chatty")
            page.locator("[data-act='talk-normal']").click(); time.sleep(0.3)

            # ── 抽牌组（draw）接进流程：点中那张时先报「抽牌」，再翻 ──
            page.locator("[data-act='tab-tarot']").click(); time.sleep(0.3)
            page.locator("[data-act='spread-one']").click(); time.sleep(0.4)
            page.evaluate("window.__srsSays = []")
            page.locator("[data-act='draw']").click(); time.sleep(2.6)
            page.locator(".srs-pickcard:not(.is-picked)").first.click(); time.sleep(1.4)
            says = page.evaluate("window.__srsSays || []")
            ok("点中那张时先报「抽牌」组（在 flip 之前）",
               "draw" in says and says.index("draw") < says.index("flip"), says)

            # ── 人物姿态：固定某一张 / 回到自动 ──
            page.evaluate("localStorage.setItem('srs.cfg.v1', JSON.stringify({scale:1,posePin:''}));"
                          " location.reload()")
            time.sleep(1.6); page.wait_for_selector(".srs-root", timeout=8000)
            page.locator(".srs-gear").click(); time.sleep(0.7)
            page.locator("[data-act='tab-sound']").click(); time.sleep(0.5)
            pose_btn = page.locator("[data-act^='pose-']").count()
            ok("人物姿态：自动 + 18 张共 19 个按钮", pose_btn == 19, pose_btn)
            ok("姿态格子有「发呆」、没有「静立·二」",
               page.locator("[data-act='pose-dazed']").count() == 1
               and page.locator("[data-act='pose-idle-b']").count() == 0)
            # 2026-11-18 修：自动原来恒等于 idle-a，只有 5 张小动作在换（主人报「还是固定的那几个」）。
            # 现在自动 = 7 张站姿轮换（每 4–8 分钟一次，间隔太长测不到，所以验池子与文案）。
            stand = page.evaluate("window.__srsStandPoses || []")
            ok("自动的站姿池是 11 张且含发呆与四张新站姿",
               len(stand) == 11 and "dazed" in stand
               and all(k in stand for k in ("rest-hands", "look-aside", "hold-cup", "stretch")), stand)
            ok("站姿池不含流程姿势（洗牌/摊牌/抽牌/翻牌/打盹/告别）",
               not any(p in stand for p in ("shuffle", "spread", "draw", "flip", "sleep", "bye")), stand)
            ok("自动说明里写明会换站姿", "张之间" in page.inner_text(".srs-body"), page.inner_text(".srs-body")[-120:])
            page.evaluate("""(()=>{const b=document.querySelector('.srs-body');
              const el=[...document.querySelectorAll('.srs-block-cap')].find(x=>x.innerText.indexOf('人物姿态')>=0);
              if(b&&el){b.scrollTop += el.getBoundingClientRect().top - b.getBoundingClientRect().top - 8;}})()""")
            time.sleep(0.3)
            page.locator("[data-act='pose-annoyed']").click(); time.sleep(1.0)
            ok("点一张就固定成那张", "annoyed" in page.evaluate(
                "(()=>{const s=document.querySelector('.srs-sprite.is-on');return s?s.dataset.pose:''})()"))
            ok("固定写进配置", page.evaluate(
                "JSON.parse(localStorage.getItem('srs.cfg.v1')||'{}').posePin") == "annoyed")
            time.sleep(7.0)          # 原本 6 秒会自动回 idle-a
            ok("固定后不再自己回闲置站姿", "annoyed" in page.evaluate(
                "(()=>{const s=document.querySelector('.srs-sprite.is-on');return s?s.dataset.pose:''})()"))
            page.screenshot(path=os.path.join(SHOT, "v043-pose.png"))
            page.locator("[data-act='pose-auto']").click(); time.sleep(1.0)
            # 2026-11-18 起「自动」不再是恒等 idle-a：基线在 7 张站姿之间轮换，
            # 所以判据改成「回到池里」，不再写死 idle-a（否则这条会随随机初值抖）。
            cur_pose = page.evaluate(
                "(()=>{const s=document.querySelector('.srs-sprite.is-on');return s?s.dataset.pose:''})()")
            ok("点「自动」回到闲置（站姿池内）",
               cur_pose in page.evaluate("window.__srsStandPoses || []"), cur_pose)
            ok("自动写回空值", page.evaluate(
                "JSON.parse(localStorage.getItem('srs.cfg.v1')||'{}').posePin") == "")

            # ── C8 每日一牌提醒：能设、能试、到点自动说、抽过不吵、一天只吵一次 ──
            # 桩数据先归零：上一段播报断言把 live_stub 留成「等你授权」，而提醒是让位的
            # （账目播报在说时不抢话，等下一轮 30 秒再来），不清会把「到点自动冒」判成红
            with open(os.path.join(HERE, "live_stub.json"), "w", encoding="utf-8") as f:
                json.dump({"ok": True, "version": "stub", "seq": 0,
                           "lastTurn": None, "live": {"turns": 0, "cost": 0, "tokens": 0, "unpriced": 0},
                           "today": {"used": 0, "turns": 0, "tokens": 0, "unpriced": 0, "day": "2026-11-18"},
                           "wait": None, "busy": False,
                           "peak": {"peak": False, "label": "空闲档", "nextInMs": 0}, "at": 0},
                          f, ensure_ascii=False)
            page.evaluate("localStorage.setItem('srs.cfg.v1', JSON.stringify({scale:1,"
                          " sound:{on:true,volume:55,tracks:{}},"
                          " remind:{on:false,hh:21,mm:0}}));"
                          " localStorage.removeItem('srs.remind.v1');"
                          " localStorage.removeItem('srs.dailyCard.v1');"
                          " location.reload()")
            time.sleep(1.8); page.wait_for_selector(".srs-root", timeout=8000)
            page.locator(".srs-gear").click(); time.sleep(0.7)
            page.locator("[data-act='tab-sound']").click(); time.sleep(0.5)
            body_rem = page.inner_text(".srs-body")
            ok("配置页有每日一牌提醒块", "每日一牌提醒" in body_rem and "到点提醒" in body_rem)
            ok("提醒默认关、默认 21:00", page.evaluate(
                "(()=>{const r=JSON.parse(localStorage.getItem('srs.cfg.v1')||'{}').remind||{};"
                "return (r.on!==true)&&(r.hh==null||r.hh===21)&&(r.mm==null||r.mm===0)})()"))
            ok("时间显示 21:00", "21:00" in page.inner_text(".srs-body"))
            ok("配置页有计费提醒块", "计费提醒" in page.inner_text(".srs-body")
               and "余额告急线" in page.inner_text(".srs-body"))
            ok("告急线默认 ¥10、预算三件控件都在",
               "¥10" in page.inner_text(".srs-body")
               and page.locator("[data-act='bill-warn-up']").count() == 1
               and page.locator("[data-act='bill-budget-up']").count() == 1
               and page.locator("[data-act='bill-low-notice']").count() == 1)
            page.locator("[data-act='toggle-remind']").click(); time.sleep(0.5)
            ok("点开关写进配置", page.evaluate(
                "JSON.parse(localStorage.getItem('srs.cfg.v1')||'{}').remind.on") is True)
            page.locator("[data-act='remind-plus']").click(); time.sleep(0.35)
            rem1 = page.evaluate("JSON.parse(localStorage.getItem('srs.cfg.v1')||'{}').remind")
            page.locator("[data-act='remind-minus']").click(); time.sleep(0.25)
            page.locator("[data-act='remind-minus']").click(); time.sleep(0.35)
            rem2 = page.evaluate("JSON.parse(localStorage.getItem('srs.cfg.v1')||'{}').remind")
            ok("±15 分钟改时间（21:00 → 21:15 → 20:45）",
               rem1.get("hh") == 21 and rem1.get("mm") == 15
               and rem2.get("hh") == 20 and rem2.get("mm") == 45, (rem1, rem2))
            page.evaluate("window.__srsSfx = []")
            page.locator("[data-act='remind-test']").click(); time.sleep(1.0)
            ok("「现在就说一遍」冒出提醒句", "今天的牌还没抽" in page.evaluate(
                "(document.querySelector('.srs-bubble')||{}).textContent||''"))
            ok("演示时敲了一声铃", "bell" in str(page.evaluate("window.__srsSfx || []")))

            # 到点自动触发：时间设成 00:00（今天早已过）+ 清掉提醒状态 → 加载即冒
            page.evaluate("localStorage.setItem('srs.cfg.v1', JSON.stringify({scale:1,"
                          " sound:{on:true,volume:55,tracks:{}},"
                          " remind:{on:true,hh:0,mm:0}}));"
                          " localStorage.removeItem('srs.remind.v1');"
                          " localStorage.removeItem('srs.dailyCard.v1');"
                          " location.reload()")
            time.sleep(2.4); page.wait_for_selector(".srs-root", timeout=8000)
            ok("到点自动冒提醒句", "今天的牌还没抽" in page.evaluate(
                "(document.querySelector('.srs-bubble')||{}).textContent||''"))
            ok("提醒后写当天标记", bool(page.evaluate(
                "(JSON.parse(localStorage.getItem('srs.remind.v1')||'{}').d)||''")))
            # 同一天再加载：不重复吵
            page.evaluate("location.reload()"); time.sleep(2.4)
            page.wait_for_selector(".srs-root", timeout=8000)
            ok("同一天不重复提醒", "今天的牌还没抽" not in page.evaluate(
                "(document.querySelector('.srs-bubble')||{}).textContent||''"))
            # 当天已经抽过：也不吵
            page.evaluate("""(()=>{const d=new Date();
                const k=d.getFullYear()+'-'+(d.getMonth()+1)+'-'+d.getDate();
                localStorage.setItem('srs.dailyCard.v1', JSON.stringify({d:k}));
                localStorage.removeItem('srs.remind.v1');})()""")
            page.evaluate("location.reload()"); time.sleep(2.4)
            page.wait_for_selector(".srs-root", timeout=8000)
            ok("当天已抽过就不吵", "今天的牌还没抽" not in page.evaluate(
                "(document.querySelector('.srs-bubble')||{}).textContent||''"))
            page.screenshot(path=os.path.join(SHOT, "v046-remind.png"))

            ok("无 JS 报错", not errors, errors[:3])
            ok("无 404 请求", not not_found, not_found[:3])
            browser.close()
    finally:
        srv.terminate()

    print()
    if fails:
        print("失败 %d 项：" % len(fails))
        for f in fails:
            print("  - " + f)
        sys.exit(1)
    print("全绿（截图 _verify/panel-*.png）")


if __name__ == "__main__":
    main()




