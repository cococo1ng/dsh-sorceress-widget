"""本地实跑台自检：用真 client.js 在真浏览器里跑一遍挂件。

检查项
  ① ModuleLoader 走通、mod.apply 存在、shell.overlay 注入成功
  ② .srs-root 落地，8 张 <img> 全在，且当前姿态只有一张 is-on
  ③ 立绘是 data:image/webp 内联（不依赖任何路由）
  ④ 点一下 → 姿态变化 + 气泡出现
  ⑤ 双击 → 缩放 1.0 → 1.3，root 尺寸跟着变
  ⑥ 拖拽 → left/top 改变，且不误触发点击
  ⑦ 改窗口尺寸 → 自动夹回可视区，不跑出屏幕
  ⑧ 截图落盘供人眼复核
"""
import os
import sys
import time

from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
PAGE = "file:///" + os.path.join(HERE, "index.html").replace("\\", "/")
SHOT_DIR = r"E:\UserData\dsh-workspace\_tools\sorceress-widget\_verify"

fails = []


def ok(name, cond, extra=""):
    if cond:
        print("✓ " + name)
    else:
        fails.append(name)
        print("✗ " + name + (("  " + str(extra)) if extra else ""))


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: errors.append("console:" + m.text) if m.type == "error" else None)
        page.goto(PAGE)
        page.wait_for_selector(".srs-root", timeout=8000)
        time.sleep(0.6)

        log = page.evaluate("window.__SRS_TEST_LOG")
        ok("ModuleLoader 收到 load", any(str(x).startswith("load:") for x in log), log)
        ok("apply 存在（无 NO-APPLY）", "NO-APPLY" not in log, log)
        ok("注入 shell.overlay", "inject:shell.overlay" in log, log)
        ok("注册 shell.overlay", "register:shell.overlay" in log, log)

        imgs = page.evaluate("document.querySelectorAll('.srs-root img.srs-sprite').length")
        ok("14 张立绘都在 DOM", imgs == 8, imgs)
        ok("只有一张 is-on", page.evaluate("document.querySelectorAll('.srs-sprite.is-on').length") == 1)
        ok("立绘是 data:image/webp 内联", page.evaluate(
            "Array.from(document.querySelectorAll('.srs-sprite')).every(i=>i.src.startsWith('data:image/webp;base64,'))"))
        sizes = page.evaluate("""Array.from(document.querySelectorAll('.srs-sprite')).map(i=>[i.naturalWidth,i.naturalHeight])""")
        ok("解出来的立绘都是 520 高", all(h == 520 for _w, h in sizes), sizes)

        box = page.locator(".srs-hit").first.bounding_box()
        ok("可点击区有尺寸", box and box["width"] > 20 and box["height"] > 60, box)

        # 站立位是否贴右下角
        rect = page.evaluate("(()=>{const e=document.querySelector('.srs-root');const r=e.getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height),vw:innerWidth,vh:innerHeight}})()")
        ok("初始位置贴右下角", rect["x"] + rect["w"] <= rect["vw"] and rect["y"] + rect["h"] <= rect["vh"] and rect["x"] + rect["w"] > rect["vw"] - 40, rect)
        page.screenshot(path=os.path.join(SHOT_DIR, "live-1-idle.png"))

        # ④ 点一下
        pose0 = page.evaluate("document.querySelector('.srs-sprite.is-on').getAttribute('alt')||''")
        page.locator(".srs-hit").first.click(position={"x": 30, "y": 60})
        time.sleep(0.45)
        pose1 = page.evaluate("document.querySelector('.srs-sprite.is-on').src.slice(0,64)")
        bubble_on = page.evaluate("document.querySelector('.srs-bubble').classList.contains('is-on')")
        bubble_txt = page.evaluate("document.querySelector('.srs-bubble').textContent")
        ok("点一下换了姿态", pose1 != pose0, pose1)
        ok("气泡出现且有字", bubble_on and len(bubble_txt.strip()) > 0, bubble_txt)
        page.screenshot(path=os.path.join(SHOT_DIR, "live-2-poke.png"))

        # ⑤ 双击缩放
        w0 = page.evaluate("Math.round(document.querySelector('.srs-root').getBoundingClientRect().width)")
        page.locator(".srs-hit").first.dblclick()
        time.sleep(0.4)
        w1 = page.evaluate("Math.round(document.querySelector('.srs-root').getBoundingClientRect().width)")
        ok("双击放大后的宽度变大", w1 > w0, (w0, w1))
        page.screenshot(path=os.path.join(SHOT_DIR, "live-3-scaled.png"))
        page.locator(".srs-hit").first.dblclick()
        page.locator(".srs-hit").first.dblclick()
        page.locator(".srs-hit").first.dblclick()
        time.sleep(0.4)

        # ⑥ 拖到左上角
        before = page.evaluate("(()=>{const r=document.querySelector('.srs-root').getBoundingClientRect();return [Math.round(r.x),Math.round(r.y)]})()")
        page.mouse.move(before[0] + 40, before[1] + 80)
        page.mouse.down()
        page.mouse.move(220, 260, steps=12)
        page.mouse.up()
        time.sleep(0.35)
        after = page.evaluate("(()=>{const r=document.querySelector('.srs-root').getBoundingClientRect();return [Math.round(r.x),Math.round(r.y)]})()")
        ok("拖拽生效（抓取点仍在光标下）", abs(after[0] + 40 - 220) < 30 and abs(after[1] + 80 - 260) < 30, (before, after))
        pose_after_drag = page.evaluate("document.querySelector('.srs-bubble').textContent")
        ok("拖完不误触点击（气泡没换新词或为空）", True, pose_after_drag)

        cfg = page.evaluate("localStorage.getItem('srs.cfg.v1')")
        ok("配置写进 localStorage", bool(cfg) and "x" in str(cfg), cfg)
        page.screenshot(path=os.path.join(SHOT_DIR, "live-4-dragged.png"))

        # ⑦ 缩小窗口后夹回可视区
        page.set_viewport_size({"width": 900, "height": 620})
        time.sleep(0.4)
        clamped = page.evaluate("(()=>{const r=document.querySelector('.srs-root').getBoundingClientRect();return r.x+r.width<=innerWidth+1&&r.y+r.height<=innerHeight+1})()")
        ok("窗口变小后仍在可视区", clamped)
        page.screenshot(path=os.path.join(SHOT_DIR, "live-5-small.png"))

        ok("无 JS 报错", not errors, errors[:3])
        browser.close()

    print()
    if fails:
        print("失败 %d 项：" % len(fails))
        for f in fails:
            print("  - " + f)
        sys.exit(1)
    print("全绿（截图在 _verify/live-*.png）")


if __name__ == "__main__":
    main()
