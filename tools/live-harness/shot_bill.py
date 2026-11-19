"""计费页局部截图（真 client.js + 账本桩数据）。

    python shot_bill.py bill.png          → _verify/bill.png（整面板）+ bill-a/b/c（分屏滚动）

用途：计费页比一屏高，必须滚着看才知道模型占比与明细有没有落地。
"""
import os
import subprocess
import sys
import time

from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
SHOT = r"E:\UserData\dsh-workspace\_tools\sorceress-widget\_verify"
PORT = 8902


def main():
    name = (sys.argv[1] if len(sys.argv) > 1 else "bill.png").replace(".png", "")
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
            page.locator(".srs-tab", has_text="计费").click()
            time.sleep(1.1)
            page.locator(".srs-panel").screenshot(path=os.path.join(SHOT, name + "-top.png"))
            # 头部「今日 ¥x」摘要（只在非计费页出现）
            page.locator(".srs-tab", has_text="塔罗").click()
            time.sleep(0.8)
            page.locator(".srs-head").screenshot(path=os.path.join(SHOT, name + "-head.png"))
            page.locator(".srs-tab", has_text="计费").click()
            time.sleep(1.0)
            body = page.locator(".srs-body")
            body.evaluate("el => { el.scrollTop = el.scrollHeight }")
            time.sleep(0.35)
            page.locator(".srs-panel").screenshot(path=os.path.join(SHOT, name + "-bottom.png"))
            print("scrollHeight", body.evaluate("el => el.scrollHeight"), "clientHeight", body.evaluate("el => el.clientHeight"))
            browser.close()
    finally:
        srv.terminate()
    print("done → " + SHOT)


if __name__ == "__main__":
    main()
