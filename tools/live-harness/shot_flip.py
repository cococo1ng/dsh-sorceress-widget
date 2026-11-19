"""翻牌动画的过程截图：抽牌后连拍四帧，看牌背是不是真的翻成牌面。

用法：python tools/live-harness/shot_flip.py [either|relation]
落盘：_verify/flip-<mode>-<序号>.png + flip-<mode>-final.png
"""
import os
import subprocess
import sys
import time

from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = r"E:\UserData\dsh-workspace\_tools\sorceress-widget\_verify"
PORT = 8901
URL = "http://127.0.0.1:%d/index.html" % PORT


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "relation"
    os.makedirs(OUT, exist_ok=True)
    py = sys.executable
    srv = subprocess.Popen([py, os.path.join(HERE, "serve.py"), str(PORT)],
                           stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    time.sleep(1.2)
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page(viewport={"width": 1440, "height": 900})
            page.goto(URL)
            page.wait_for_selector(".srs-root", timeout=8000)
            time.sleep(0.5)
            page.locator(".srs-gear").click()
            time.sleep(0.6)
            page.locator(".srs-tab", has_text="占卜").click()
            time.sleep(0.4)
            page.locator("[data-act='divine-%s']" % mode).click()
            time.sleep(0.4)
            page.locator("[data-act='divine-draw']").click()

            # 洗牌 620ms + 抽牌 420ms 之后才 setDivineCards，翻牌从那一刻开始
            time.sleep(1.06)
            for i in range(4):
                page.screenshot(path=os.path.join(OUT, "flip-%s-%d.png" % (mode, i)))
                time.sleep(0.18)
            time.sleep(1.6)
            box = page.locator(".srs-panel").bounding_box()
            page.screenshot(path=os.path.join(OUT, "flip-%s-final.png" % mode), clip=box)
            info = page.evaluate(
                "(()=>{const el=document.querySelector('.srs-flip-in');"
                "return el?{a:getComputedStyle(el).animationName,"
                "d:getComputedStyle(el).animationDuration,"
                "t:getComputedStyle(el).transform,"
                "n:document.querySelectorAll('.srs-sp-cell .srs-flip-in').length}:null;})()")
            print(info)
            browser.close()
    finally:
        srv.terminate()


if __name__ == "__main__":
    main()
