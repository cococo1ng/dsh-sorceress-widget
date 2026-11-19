# -*- coding: utf-8 -*-
"""拍插件市场的预览图（进 plugin/docs/preview/，写进 screenshots.json）。

与 shot_pages.py 的区别：那个是内部逐页体检（空态、含禁用按钮），
这个是给商店页看的 —— 要有抽牌结果、要有挂件本体、要能一眼看出功能。

    python shot_store.py

输出 6 张 680 宽的 PNG（设备像素比 2x），另存一份到 _verify/store-* 备查。
"""
import os
import subprocess
import sys
import time

from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
OUT = os.path.join(ROOT, "plugin", "docs", "preview")
VERIFY = os.path.join(ROOT, "_verify")
PORT = 8908


def shot_panel(page, name):
    page.locator(".srs-panel").screenshot(path=os.path.join(OUT, name + ".png"))


def main():
    os.makedirs(OUT, exist_ok=True)
    os.makedirs(VERIFY, exist_ok=True)
    srv = subprocess.Popen([sys.executable, os.path.join(HERE, "serve.py"), str(PORT)],
                           stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    time.sleep(1.2)
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page(viewport={"width": 1440, "height": 900}, device_scale_factor=2)
            page.goto("http://127.0.0.1:%d/index.html" % PORT)
            page.wait_for_selector(".srs-root", timeout=8000)
            time.sleep(1.0)

            # ① 挂件本体：先点她一下冒气泡、再悬停让水晶球浮现，然后裁右下角一块
            page.locator(".srs-hit").first.click(position={"x": 30, "y": 60})
            time.sleep(1.0)
            page.locator(".srs-root").hover()
            time.sleep(0.5)
            # 裁切范围 = 挂件本体 ∪ 气泡（气泡是绝对定位、会超出 root 边界），各留 20px 呼吸
            boxes = [page.locator(".srs-root").bounding_box()]
            if page.locator(".srs-bubble").count():
                boxes.append(page.locator(".srs-bubble").bounding_box())
            boxes = [b for b in boxes if b]
            x0 = min(b["x"] for b in boxes) - 20
            y0 = min(b["y"] for b in boxes) - 20
            x1 = max(b["x"] + b["width"] for b in boxes) + 20
            y1 = max(b["y"] + b["height"] for b in boxes) + 20
            page.screenshot(path=os.path.join(OUT, "widget.png"),
                            clip={"x": x0, "y": y0, "width": x1 - x0, "height": y1 - y0})
            print("① widget.png（含气泡与水晶球）")

            page.locator(".srs-root").hover()
            page.locator("[data-act='open-menu']").click(force=True)
            page.wait_for_selector(".srs-panel.is-on", timeout=5000)
            time.sleep(0.6)

            # ② 三张牌阵结果（带位义）
            page.locator("[data-act='tab-tarot']").click()
            time.sleep(0.4)
            page.locator("[data-act='spread-three']").click()
            time.sleep(0.4)
            page.locator("[data-act='draw']").click()
            time.sleep(2.8)
            for i in range(3):
                page.locator("[data-act='pick-%d']" % i).click()
                time.sleep(0.45)
            page.locator("[data-act='reveal']").click()
            time.sleep(2.0)
            shot_panel(page, "tarot-three")
            print("② tarot-three.png")

            # ③ 星座页
            page.locator("[data-act='tab-zodiac']").click()
            time.sleep(0.6)
            shot_panel(page, "zodiac")
            print("③ zodiac.png")

            # ④ 计费页
            page.locator("[data-act='tab-bill']").click()
            time.sleep(0.9)
            shot_panel(page, "bill")
            print("④ bill.png")

            # ⑤ 配置页人物姿态块（19 格是这一版的重点）
            page.locator("[data-act='tab-sound']").click()
            time.sleep(0.6)
            page.evaluate("""(()=>{const b=document.querySelector('.srs-body');
              const el=[...document.querySelectorAll('.srs-block-cap')].find(x=>x.innerText.indexOf('人物姿态')>=0);
              if(b&&el){b.scrollTop += el.getBoundingClientRect().top - b.getBoundingClientRect().top - 10;}})()""")
            time.sleep(0.5)
            shot_panel(page, "config-pose")
            print("⑤ config-pose.png")

            # ⑥ 占卜页（许愿瓶）
            page.locator("[data-act='tab-divine']").click()
            time.sleep(0.8)
            page.evaluate("""(()=>{const b=document.querySelector('.srs-body');
              const el=[...document.querySelectorAll('.srs-block-cap, .srs-sec-cap')].find(x=>x.innerText.indexOf('许愿')>=0);
              if(b&&el){b.scrollTop += el.getBoundingClientRect().top - b.getBoundingClientRect().top - 10;}})()""")
            time.sleep(0.5)
            shot_panel(page, "wish")
            print("⑥ wish.png")

            browser.close()
    finally:
        srv.terminate()
    # 拷一份到 _verify 备查
    for f in os.listdir(OUT):
        if f.endswith(".png"):
            src = os.path.join(OUT, f)
            with open(src, "rb") as r, open(os.path.join(VERIFY, "store-" + f), "wb") as w:
                w.write(r.read())
    print("done → " + OUT)


if __name__ == "__main__":
    main()
