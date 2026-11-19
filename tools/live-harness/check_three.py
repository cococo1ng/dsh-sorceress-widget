"""三张牌阵「一张一张挑」验证：点第一张进等待区、点第二张进等待区、第三张才出整体解读。

    python tools/live-harness/check_three.py

断言的正是主人提的那条：不许点一下就三张全出来。
产物：_verify/three-1.png（挑了一张）、_verify/three-2.png（挑了两张）、_verify/three-3.png（出结果）
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

fails = []


def ok(name, cond, extra=""):
    if cond:
        print("✓ " + name)
    else:
        fails.append(name)
        print("✗ " + name + (("  " + str(extra)) if extra else ""))


def main():
    py = sys.executable
    srv = subprocess.Popen([py, os.path.join(HERE, "serve.py"), str(PORT)],
                           stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    time.sleep(1.2)
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page(viewport={"width": 1440, "height": 900})
            errors = []
            page.on("pageerror", lambda e: errors.append(str(e)))
            page.on("console", lambda m: errors.append("console:" + m.text) if m.type == "error" else None)

            page.goto(URL, wait_until="load")
            time.sleep(2.2)
            page.evaluate("localStorage.removeItem('srs.dailyCard.v1');"
                          "const c=JSON.parse(localStorage.getItem('srs.cfg.v1')||'{}');c.spread='three';"
                          "localStorage.setItem('srs.cfg.v1',JSON.stringify(c));location.reload()")
            time.sleep(1.4)
            page.wait_for_selector(".srs-root", timeout=8000)
            time.sleep(0.5)
            page.locator(".srs-gear").click()
            time.sleep(0.6)
            page.locator(".srs-tab", has_text="塔罗").click()
            time.sleep(0.3)
            page.locator("[data-act='spread-three']").click()
            time.sleep(0.4)

            def shot(name):
                page.screenshot(path=os.path.join(SHOT, name))

            # ① 摊开
            page.locator("[data-act='draw']").click()
            time.sleep(2.8)
            ok("三张模式摊开十张（5×2 齐整）", page.locator(".srs-pickcard").count() == 10,
               page.locator(".srs-pickcard").count())
            ok("十张格子是 5 列紧凑版", page.locator(".srs-pickgrid.is-three").count() == 1)

            # ② 点第一张
            page.locator(".srs-pickcard:not(.is-picked)").nth(0).click()
            time.sleep(1.0)
            ok("点第一张后网格还在（没一次全出）", page.locator(".srs-pickcard").count() == 10,
               page.locator(".srs-pickcard").count())
            ok("等待区出现 1 张", page.locator(".srs-wait-cell").count() == 1,
               page.locator(".srs-wait-cell").count())
            ok("点过的那格标了序号", page.locator(".srs-pickcard.is-picked").count() == 1)
            ok("挑中的格子仍是牌背（不漏牌面）",
               "back.webp" in page.evaluate(
                   "getComputedStyle(document.querySelector('.srs-pickcard.is-picked')).backgroundImage"))
            ok("等待区显示的也是牌背",
               all("back.webp" in (s or "") for s in page.eval_on_selector_all(
                   ".srs-wait-img", "els => els.map(e => e.getAttribute('src'))")))
            ok("第一张还没出解读", page.locator(".srs-sp-name").count() == 0)
            ok("第一张标签是「过去」",
               (page.inner_text(".srs-wait-lab") if page.locator(".srs-wait-lab").count() else "") == "过去")
            shot("three-1.png")

            # ③ 点第二张
            page.locator(".srs-pickcard:not(.is-picked)").nth(1).click()
            time.sleep(1.0)
            ok("点第二张后等待区 2 张", page.locator(".srs-wait-cell").count() == 2,
               page.locator(".srs-wait-cell").count())
            ok("第二张还没出解读", page.locator(".srs-sp-name").count() == 0)
            shot("three-2.png")

            # ④ 点第三张：三张齐了也不翻，等「翻开」
            page.locator(".srs-pickcard:not(.is-picked)").nth(2).click()
            time.sleep(1.4)
            ok("三张齐了等待区 3 张", page.locator(".srs-wait-cell").count() == 3,
               page.locator(".srs-wait-cell").count())
            ok("三张齐了网格还在", page.locator(".srs-pickcard").count() == 10,
               page.locator(".srs-pickcard").count())
            ok("三张齐了还不翻牌面", page.locator(".srs-sp-name").count() == 0,
               page.locator(".srs-sp-name").count())
            ok("主按钮变成「翻开这三张」",
               page.locator("[data-act='reveal']").count() == 1
               and page.locator("[data-act='reveal']").inner_text().strip() == "翻开这三张")
            shot("three-3.png")

            # ⑤ 一键翻开
            page.locator("[data-act='reveal']").click()
            time.sleep(2.4)
            ok("翻开后网格收起", page.locator(".srs-pickcard").count() == 0,
               page.locator(".srs-pickcard").count())
            ok("出三张牌阵", page.locator(".srs-sp-cell").count() == 3,
               page.locator(".srs-sp-cell").count())
            ok("三张都有牌名", page.locator(".srs-sp-name").count() == 3)
            ok("三段判词 + 合起来看", page.locator(".srs-lines p").count() >= 4,
               page.locator(".srs-lines p").count())
            ok("翻完后按钮回到「再抽三张」",
               page.locator("[data-act='draw']").inner_text().strip() == "再抽三张")
            shot("three-4.png")

            # ⑤ 历史写了 3 条
            hist = page.evaluate("JSON.parse(localStorage.getItem('srs.history.v1')||'[]').length")
            ok("历史里记了 3 条", hist >= 3, hist)

            ok("无 JS 报错", len(errors) == 0, errors[:2])
            browser.close()
    finally:
        srv.terminate()
        try:
            srv.wait(timeout=5)
        except Exception:
            srv.kill()

    if fails:
        print("\n❌ 红了 %d 项：%s" % (len(fails), "、".join(fails)))
        sys.exit(1)
    print("\n全绿")


if __name__ == "__main__":
    main()
