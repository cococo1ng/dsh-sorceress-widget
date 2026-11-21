"""验证「所问」必填：多张牌阵空着抽不动，单张/每日一牌放行，填了就能抽。"""
import os
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
PORT = 8879
URL = "http://127.0.0.1:%d/index.html" % PORT
fails = []


def ok(name, cond, extra=""):
    print(("✓ " if cond else "✗ ") + name + (("  " + str(extra)) if extra and not cond else ""))
    if not cond:
        fails.append(name)


def pick_spread(page, key):
    """点牌阵选项（data-act=spread-<key>）"""
    page.evaluate("""(()=>{
      const b=document.querySelector('.srs-body');
      const t=[...document.querySelectorAll('.srs-block-cap')].find(x=>x.innerText.indexOf('所问')>=0)
           || [...document.querySelectorAll('.srs-form-label')].find(x=>x.innerText.indexOf('所问')>=0);
      if(b&&t){b.scrollTop += t.getBoundingClientRect().top - b.getBoundingClientRect().top - 10;}
    })()""")
    time.sleep(0.3)
    sel = "[data-act='spread-%s']" % key
    if page.locator(sel).count():
        page.locator(sel).first.click()
        time.sleep(0.4)
        return True
    return False


def main():
    srv = subprocess.Popen([sys.executable, os.path.join(HERE, "serve.py"), str(PORT)],
                           stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    time.sleep(1.0)
    try:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page(viewport={"width": 420, "height": 820})
            page.goto(URL)
            page.wait_for_selector(".srs-root", timeout=10000)
            page.locator(".srs-gear").first.click()
            page.wait_for_selector("[data-act='tab-tarot']", timeout=6000)
            time.sleep(0.6)

            # ① 默认（daily）时占位文案是「可留空」
            ph = page.locator(".srs-q-input").get_attribute("placeholder") or ""
            ok("每日一牌：占位提示可留空", "可留空" in ph, ph)

            # ② 切到 celtic（多张）→ 占位变「必填」
            got = pick_spread(page, "celtic")
            ok("能切到凯尔特牌阵", got)
            ph2 = page.locator(".srs-q-input").get_attribute("placeholder") or ""
            ok("多张牌阵：占位提示必填", "必填" in ph2, ph2)

            # ③ 空着点抽牌 → 被拦，出现红字，且没有进入洗牌
            page.locator("[data-act='draw']").first.click()
            time.sleep(1.2)
            err = page.locator(".srs-q-err")
            ok("空所问：出现红字提示", err.count() == 1,
               err.first.inner_text() if err.count() else "无")
            ok("空所问：提示文案正确",
               err.count() == 1 and "先写一句" in err.first.inner_text(),
               err.first.inner_text() if err.count() else "")
            ok("空所问：输入框标红", page.locator(".srs-q-input.is-err").count() == 1)
            phase_txt = page.inner_text(".srs-body")
            ok("空所问：没有进入洗牌/出牌", "洗牌" not in phase_txt and "选一张" not in phase_txt)

            # ④ 填上字 → 红字消失
            page.locator(".srs-q-input").fill("要不要换工作")
            time.sleep(0.3)
            ok("填了字之后红字消失", page.locator(".srs-q-err").count() == 0)
            ok("填了字之后边框恢复正常", page.locator(".srs-q-input.is-err").count() == 0)

            # ⑤ 再点抽牌 → 真的进洗牌流程
            page.locator("[data-act='draw']").first.click()
            time.sleep(1.6)
            phase_txt2 = page.inner_text(".srs-body")
            ok("填了所问就能抽（进入洗牌或待选）",
               ("洗牌" in phase_txt2) or ("选一张" in phase_txt2) or page.locator(".srs-pickcard").count() > 0,
               phase_txt2[-120:])

            # ⑥ 只输入空格也算空
            page.evaluate("location.reload()")
            page.wait_for_selector(".srs-root", timeout=10000)
            page.locator(".srs-gear").first.click()
            page.wait_for_selector("[data-act='tab-tarot']", timeout=6000)
            time.sleep(0.5)
            pick_spread(page, "relation")
            page.locator(".srs-q-input").fill("   ")
            time.sleep(0.2)
            page.locator("[data-act='draw']").first.click()
            time.sleep(1.0)
            ok("全空格也算空（照样拦）", page.locator(".srs-q-err").count() == 1)

            # ⑦ 单张指引空着能抽
            page.evaluate("location.reload()")
            page.wait_for_selector(".srs-root", timeout=10000)
            page.locator(".srs-gear").first.click()
            page.wait_for_selector("[data-act='tab-tarot']", timeout=6000)
            time.sleep(0.5)
            pick_spread(page, "one")
            page.locator("[data-act='draw']").first.click()
            time.sleep(1.8)
            ok("单张指引空着可以直接抽", page.locator(".srs-q-err").count() == 0,
               page.locator(".srs-q-err").first.inner_text() if page.locator(".srs-q-err").count() else "")

            page.screenshot(path=os.path.join(HERE, "..", "..", "_verify", "q-required.png"))
            browser.close()
    finally:
        srv.terminate()

    total = 12
    print("\n所问必填：" + ("全绿（%d 项）" % (total - len(fails)) if not fails
          else "失败 %d 项：%s" % (len(fails), fails)))
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
