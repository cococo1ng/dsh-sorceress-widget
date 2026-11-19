"""星座页点选自检：点一个星座，看选中态有没有跟着走、档案生日有没有被动到。

用法：python tools/live-harness/shot_sign.py
"""
import os
import subprocess
import time

from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
SHOT = r"E:\UserData\dsh-workspace\_tools\sorceress-widget\_verify"
PORT = 8909
URL = "http://127.0.0.1:%d/index.html" % PORT

ON = ("(()=>{const b=document.querySelector('.srs-signs button.on');"
      "return b?b.getAttribute('data-act'):'(none)'})()")


def main():
    srv = subprocess.Popen([os.sys.executable, os.path.join(HERE, "serve.py"), str(PORT)],
                           stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    time.sleep(1.2)
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page(viewport={"width": 1440, "height": 900})
            page.goto(URL)
            page.wait_for_selector(".srs-root", timeout=8000)
            time.sleep(0.6)
            page.evaluate("localStorage.removeItem('srs.profile.v1'); location.reload()")
            time.sleep(1.6)
            page.wait_for_selector(".srs-root", timeout=8000)
            page.locator(".srs-gear").click()
            time.sleep(0.6)
            page.locator(".srs-tab", has_text="星座").click()
            time.sleep(0.5)
            print("初始选中:", page.evaluate(ON))
            page.locator("[data-act='pick-sign-capricorn']").click()
            time.sleep(0.5)
            print("点摩羯后:", page.evaluate(ON))
            print("按钮总数:", page.locator(".srs-signs button").count())
            print("带 on 的按钮:", page.locator(".srs-signs button.on").count())
            print("档案:", page.evaluate("localStorage.getItem('srs.profile.v1')"))
            box = page.locator(".srs-panel").bounding_box()
            page.screenshot(path=os.path.join(SHOT, "sign-pick.png"), clip=box)
            browser.close()
    finally:
        srv.terminate()


if __name__ == "__main__":
    main()
