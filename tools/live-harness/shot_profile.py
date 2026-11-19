"""档案页截图：生日 → 星座 / 四柱，以及周期日历（两屏）。

用法：python tools/live-harness/shot_profile.py
落盘：_verify/profile-1.png / profile-2.png
"""
import os
import subprocess
import time

from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
SHOT = r"E:\UserData\dsh-workspace\_tools\sorceress-widget\_verify"
PORT = 8912
URL = "http://127.0.0.1:%d/index.html" % PORT


def main():
    os.makedirs(SHOT, exist_ok=True)
    srv = subprocess.Popen([os.sys.executable, os.path.join(HERE, "serve.py"), str(PORT)],
                           stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    time.sleep(1.2)
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page(viewport={"width": 1440, "height": 1000})
            page.goto(URL)
            page.wait_for_selector(".srs-root", timeout=8000)
            time.sleep(0.5)
            page.evaluate("localStorage.clear(); location.reload()")
            time.sleep(1.6)
            page.wait_for_selector(".srs-root", timeout=8000)
            page.locator(".srs-gear").click()
            time.sleep(0.6)
            page.locator(".srs-tab", has_text="档案").click()
            time.sleep(0.5)
            page.evaluate("(()=>{const i=document.querySelectorAll('.srs-body input[type=password]');"
                          "i[0].value='1234'; if(i[1]) i[1].value='1234';})()")
            page.locator("[data-pact='setup']").click()
            time.sleep(0.8)
            page.evaluate("(()=>{const d=document.querySelectorAll('.srs-body input[type=date]');"
                          "d[0].value='1994-03-21'; if(d[1]) d[1].value='2026-11-01';})()")
            page.evaluate("(()=>{const t=document.querySelector('.srs-body input[type=time]');"
                          "if(t){t.value='08:00';t.dispatchEvent(new Event('input',{bubbles:true}));}})()")
            time.sleep(0.3)
            page.locator("[data-pact='save-profile']").click()
            time.sleep(1.0)
            box = page.locator(".srs-panel").bounding_box()
            page.locator(".srs-panel").screenshot(path=os.path.join(SHOT, "profile-1.png"))
            page.evaluate("(()=>{const b=document.querySelector('.srs-body'); b.scrollTop = b.scrollHeight;})()")
            time.sleep(0.4)
            page.locator(".srs-panel").screenshot(path=os.path.join(SHOT, "profile-2.png"))
            print("panel box:", box)
            browser.close()
    finally:
        srv.terminate()


if __name__ == "__main__":
    main()
