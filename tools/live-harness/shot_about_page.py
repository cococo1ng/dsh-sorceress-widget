"""拍插件里真正的「关于」页：开面板 → 点关于 → 顶部/底部两张图。"""
import os
import subprocess
import sys
import time

from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
PORT = 8895
URL = "http://127.0.0.1:%d/index.html" % PORT


def main():
    srv = subprocess.Popen([sys.executable, os.path.join(HERE, "serve.py"), str(PORT)],
                           stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    time.sleep(1.2)
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page(viewport={"width": 1440, "height": 900}, device_scale_factor=2)
            page.goto(URL)
            page.wait_for_selector(".srs-root", timeout=8000)
            time.sleep(0.6)
            page.locator(".srs-gear").click()
            page.wait_for_selector(".srs-panel.is-on", timeout=4000)
            time.sleep(0.5)
            page.locator("[data-act='about-open']").click()
            time.sleep(0.5)
            panel = page.locator(".srs-panel")
            panel.screenshot(path=os.path.join(ROOT, "_verify", "about-page-top.png"))
            # 滚到底看两张码
            page.eval_on_selector(".srs-body", "el => el.scrollTop = el.scrollHeight")
            time.sleep(0.4)
            panel.screenshot(path=os.path.join(ROOT, "_verify", "about-page-bottom.png"))
            print("写 _verify/about-page-top.png / about-page-bottom.png")
            browser.close()
    finally:
        srv.terminate()
        try:
            srv.wait(timeout=5)
        except Exception:
            srv.kill()


if __name__ == "__main__":
    main()
