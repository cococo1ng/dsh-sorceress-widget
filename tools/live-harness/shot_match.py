"""婚配自检 + 截图：填乾/坤生日 → 匹配 → 读分数/分项，并对比「六合」与「相冲」两组。

用法：python tools/live-harness/shot_match.py
落盘：_verify/match-1.png / match-2.png
"""
import os
import subprocess
import time

from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
SHOT = r"E:\UserData\dsh-workspace\_tools\sorceress-widget\_verify"
PORT = 8914
URL = "http://127.0.0.1:%d/index.html" % PORT


def fill(page, key, d, shi="00:30"):
    sel = ".srs-match-row:nth-of-type(%d)" % (1 if key == "m" else 2)
    rows = page.locator(".srs-match-row")
    idx = 0 if key == "m" else 1
    row = rows.nth(idx)
    row.locator("input[type=date]").fill(d)
    row.locator("select").select_option(shi)


def score_of(page):
    cnt = page.locator("[data-pact='match-run']").count()
    page.locator("[data-pact='match-run']").click()
    time.sleep(0.6)
    if page.locator(".srs-match-score b").count() == 0:
        print("   [debug] 按钮数:", cnt,
              " 错误位:", repr(page.inner_text(".srs-err") if page.locator(".srs-err").count() else "无"),
              " 收到日期的输入:", page.evaluate(
                  "Array.from(document.querySelectorAll('.srs-match-in input')).map(i=>i.value)"))
        return None
    return int(page.locator(".srs-match-score b").inner_text())


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
            time.sleep(0.4)
            page.evaluate("(()=>{const i=document.querySelectorAll('.srs-body input[type=password]');"
                          "i[0].value='1234'; if(i[1]) i[1].value='1234';})()")
            page.locator("[data-pact='setup']").click()
            time.sleep(0.9)

            # ① 六合：子（1984）配 丑（1985）
            fill(page, "m", "1984-05-01", "00:30")
            fill(page, "f", "1985-05-01", "02:00")
            page.locator(".srs-match-row").first.scroll_into_view_if_needed()
            time.sleep(0.3)
            page.locator(".srs-panel").screenshot(path=os.path.join(SHOT, "match-0.png"))
            liuhe = score_of(page)
            body = page.inner_text(".srs-body")
            print("六合组分数:", liuhe)
            print("  分项:", page.evaluate(
                "Array.from(document.querySelectorAll('.srs-match-item')).map(r=>r.textContent)"))
            print("  有分项:", page.locator(".srs-match-item").count())
            print("  有建议:", "现在能做的三件小事" in body)
            page.locator(".srs-body").evaluate("b => b.scrollTop = b.scrollHeight")
            time.sleep(0.3)
            page.locator(".srs-panel").screenshot(path=os.path.join(SHOT, "match-1.png"))

            # ② 相冲：午（1990）配 子（1984）
            fill(page, "m", "1990-02-10", "00:30")
            fill(page, "f", "1984-05-01", "00:30")
            chong = score_of(page)
            print("相冲组分数:", chong)
            print("  分项:", page.evaluate(
                "Array.from(document.querySelectorAll('.srs-match-item')).map(r=>r.textContent)"))
            page.locator(".srs-body").evaluate("b => b.scrollTop = b.scrollHeight")
            time.sleep(0.3)
            page.locator(".srs-panel").screenshot(path=os.path.join(SHOT, "match-2.png"))

            # ③ 确定性：同一输入再算一次
            again = score_of(page)
            print("同输入再算:", again, "一致" if again == chong else "不一致！")
            browser.close()
    finally:
        srv.terminate()


if __name__ == "__main__":
    main()


