"""菜单栏（面板顶部 tab 栏）局部截图：真 client.js + 真浏览器。

    python shot_menubar.py menubar-before.png
    python shot_menubar.py menubar-after.png

输出到 _verify/ 下；同时给一张整面板大图 <名>-panel.png（2x 缩放，便于肉眼看字重与金线）。
可加 tab 序号参数，逐个切 tab 各截一张：
    python shot_menubar.py menubar-after.png 1   → 只截第 1 个 tab 选中态
"""
import os
import subprocess
import sys
import time

from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
SHOT = r"E:\UserData\dsh-workspace\_tools\sorceress-widget\_verify"
PORT = 8901


def main():
    name = sys.argv[1] if len(sys.argv) > 1 else "menubar.png"
    only = int(sys.argv[2]) if len(sys.argv) > 2 else None
    srv = subprocess.Popen([sys.executable, os.path.join(HERE, "serve.py"), str(PORT)],
                           stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    time.sleep(1.2)
    os.makedirs(SHOT, exist_ok=True)
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page(viewport={"width": 1440, "height": 900}, device_scale_factor=2)
            page.goto("http://127.0.0.1:%d/index.html" % PORT)
            page.wait_for_selector(".srs-root", timeout=8000)
            time.sleep(0.4)
            page.locator(".srs-root").hover()
            page.locator("[data-act='open-menu']").click(force=True)
            page.wait_for_selector(".srs-panel.is-on", timeout=5000)
            time.sleep(0.55)

            def grab(suffix=""):
                page.locator(".srs-tabs").screenshot(path=os.path.join(SHOT, name.replace(".png", suffix + ".png")))

            if only is None:
                grab()
                page.locator(".srs-panel").screenshot(path=os.path.join(SHOT, name.replace(".png", "-panel.png")))
                for i in range(6):
                    page.locator(".srs-tabs .srs-tab").nth(i).click()
                    time.sleep(0.32)
                    grab("-t%d" % i)
                # 未选中项的悬停态（与选中态对比看层次）
                page.locator(".srs-tabs .srs-tab").nth(4).hover()
                time.sleep(0.32)
                grab("-hover")
            else:
                page.locator(".srs-tabs .srs-tab").nth(only).click()
                time.sleep(0.32)
                grab()
            browser.close()
    finally:
        srv.terminate()
    print("done → " + SHOT)


if __name__ == "__main__":
    main()
