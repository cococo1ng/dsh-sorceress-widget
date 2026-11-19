# -*- coding: utf-8 -*-
"""底部动作条三个状态各截一张：三张模式 / 每日已抽（明天再来，disabled）/ 单张。

    python shot_footer.py v3211
"""
import os
import subprocess
import sys
import time

from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
SHOT = r"E:\UserData\dsh-workspace\_tools\sorceress-widget\_verify"
PORT = "8908"


def main():
    prefix = sys.argv[1] if len(sys.argv) > 1 else "footer"
    srv = subprocess.Popen([sys.executable, os.path.join(HERE, "serve.py"), PORT],
                           stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    time.sleep(1.2)
    try:
        with sync_playwright() as p:
            b = p.chromium.launch()
            page = b.new_page(viewport={"width": 1440, "height": 900}, device_scale_factor=2)
            page.goto("http://127.0.0.1:%s/index.html" % PORT)
            page.wait_for_selector(".srs-root", timeout=8000)
            page.evaluate("localStorage.clear()")
            page.reload()
            page.wait_for_selector(".srs-root", timeout=8000)
            time.sleep(0.5)
            page.locator(".srs-root").hover()
            page.locator("[data-act='open-menu']").click(force=True)
            page.wait_for_selector(".srs-panel.is-on", timeout=5000)
            time.sleep(0.5)

            def foot(name):
                page.locator(".srs-foot").screenshot(path=os.path.join(SHOT, "%s-%s.png" % (prefix, name)))

            # 三张模式
            page.locator("[data-act='spread-three']").click()
            time.sleep(0.5)
            foot("three")

            # 单张模式
            page.locator("[data-act='spread-one']").click()
            time.sleep(0.5)
            foot("one")

            # 每日一签：抽完 → 主按钮变「明天再来」且 disabled
            page.locator("[data-act='spread-daily']").click()
            time.sleep(0.4)
            page.locator("[data-act='draw']").click()
            time.sleep(2.2)
            # daily 模式没有「翻开这三张」这一步（一张牌直接翻），有就点、没有就跳过
            try:
                page.locator("[data-act='reveal']").first.click(timeout=1500)
                time.sleep(1.6)
            except Exception:
                pass
            time.sleep(1.0)
            foot("done")
            b.close()
    finally:
        srv.terminate()
    print("done → " + SHOT)


if __name__ == "__main__":
    main()
