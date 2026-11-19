"""档案页生日持久化诊断：设生日 → 保存 → 关面板重开 → 重载页面，看 input 到底显示什么。

    python tools/live-harness/diagnose_profile.py
"""
import os
import subprocess
import sys
import time

from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
SHOT = r"E:\UserData\dsh-workspace\_tools\sorceress-widget\_verify"
PORT = 8899
URL = "http://127.0.0.1:%d/index.html" % PORT


def dump(page, tag):
    st = page.evaluate("""() => {
      const i = document.querySelector('.srs-field input[type=date]');
      const cs = i ? getComputedStyle(i) : null;
      return {
        domValue: i ? i.value : null,
        domDefault: i ? i.defaultValue : null,
        attrValue: i ? i.getAttribute('value') : null,
        width: i ? Math.round(i.getBoundingClientRect().width) : null,
        fontPx: cs ? cs.fontSize : null,
        stored: localStorage.getItem('srs.profile.v1'),
        pin: localStorage.getItem('srs.pin.v1') || localStorage.getItem('srs.profile.pin'),
      };
    }""")
    print("[%s] %s" % (tag, st))
    return st


def main():
    py = sys.executable
    srv = subprocess.Popen([py, os.path.join(HERE, "serve.py"), str(PORT)],
                           stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    time.sleep(1.2)
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page(viewport={"width": 1440, "height": 900})
            errs = []
            page.on("pageerror", lambda e: errs.append(str(e)))

            page.goto(URL, wait_until="load")
            time.sleep(2.0)
            page.evaluate("localStorage.clear(); location.reload()")
            time.sleep(1.8)
            page.wait_for_selector(".srs-root", timeout=8000)
            time.sleep(0.4)

            # 打开面板 → 档案
            page.locator(".srs-gear").click()
            time.sleep(0.6)
            page.locator(".srs-tab", has_text="档案").click()
            time.sleep(0.4)

            # 首次：设 PIN
            pins = page.locator(".srs-field input[type=password]")
            pins.nth(0).fill("1234")
            pins.nth(1).fill("1234")
            page.locator("[data-pact='setup']").click()
            time.sleep(0.8)

            dump(page, "解锁后")
            page.screenshot(path=os.path.join(SHOT, "profile-1.png"))

            # 填生日：**故意不点保存按钮**，验证「改完即存」
            bd = page.locator(".srs-field input[type=date]").first
            bd.fill("1990-03-21")
            time.sleep(0.6)
            print("填入后 DOM value =", bd.input_value())
            dump(page, "填入但没点保存")
            # 失焦后再截，才是用户平时看到的常态（fill 会让整段处于选中高亮）
            page.locator(".srs-block-cap").first.click()
            time.sleep(0.4)
            page.screenshot(path=os.path.join(SHOT, "profile-2.png"))

            # 关面板 → 重开（同页面内，priv 还留着，不用再解锁）
            page.locator("[data-act='close']").first.click()
            time.sleep(0.5)
            page.locator(".srs-gear").click()
            time.sleep(0.6)
            page.locator(".srs-tab", has_text="档案").click()
            time.sleep(0.5)
            if page.locator(".srs-field input[type=password]").count():
                page.locator(".srs-field input[type=password]").nth(0).fill("1234")
                page.locator("[data-pact='unlock']").click()
                time.sleep(0.8)
            dump(page, "重开面板后")
            page.screenshot(path=os.path.join(SHOT, "profile-3.png"))

            # 整体重载页面再看
            page.reload(wait_until="load")
            time.sleep(2.0)
            page.wait_for_selector(".srs-root", timeout=8000)
            time.sleep(0.4)
            page.locator(".srs-gear").click()
            time.sleep(0.6)
            page.locator(".srs-tab", has_text="档案").click()
            time.sleep(0.4)
            page.locator(".srs-field input[type=password]").nth(0).fill("1234")
            page.locator("[data-pact='unlock']").click()
            time.sleep(0.8)
            dump(page, "重载页面后")
            page.screenshot(path=os.path.join(SHOT, "profile-4.png"))

            # 点「保存生日」必须有回音：按钮变「✓ 已保存」+ 下面一行说明，2.6 秒后收
            page.locator("[data-pact='save-profile']").click()
            time.sleep(0.4)
            btn_txt = page.locator("[data-pact='save-profile']").inner_text().strip()
            ok_txt = page.inner_text(".srs-ok").strip()
            print("点保存后：按钮 = %r | 提示 = %r" % (btn_txt, ok_txt))
            page.screenshot(path=os.path.join(SHOT, "profile-5.png"))
            time.sleep(2.8)
            print("2.8 秒后提示 = %r" % page.inner_text(".srs-ok").strip())

            if errs:
                print("JS 报错：", errs[:2])
            browser.close()
    finally:
        srv.terminate()
        try:
            srv.wait(timeout=5)
        except Exception:
            srv.kill()


if __name__ == "__main__":
    main()
