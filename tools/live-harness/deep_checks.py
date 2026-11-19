"""深层实跑：多张牌阵挑牌/翻开、历史同种子重放、每日锁牌跨刷新、连点开关、档案四柱、许愿瓶、安神。
跑法：python tools/live-harness/deep_checks.py
"""
import json
import os
import re
import subprocess
import sys
import time

from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
PORT = 8898
URL = "http://127.0.0.1:%d/index.html" % PORT

fails = []


def ok(name, cond, extra=""):
    if cond:
        print("✓ " + name)
    else:
        fails.append(name)
        print("✗ " + name + (("  " + str(extra)) if extra else ""))


def cfg(page):
    return page.evaluate("JSON.parse(localStorage.getItem('srs.cfg.v1')||'{}')")


def open_panel(page):
    page.locator(".srs-gear").click()
    page.wait_for_selector(".srs-panel.is-on", timeout=4000)
    time.sleep(0.4)


def main():
    srv = subprocess.Popen([sys.executable, os.path.join(HERE, "serve.py"), str(PORT)],
                           stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    time.sleep(1.2)
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page(viewport={"width": 1440, "height": 900})
            errors = []
            bad = []
            page.on("pageerror", lambda e: errors.append(str(e)))
            page.on("console", lambda m: errors.append("console:" + m.text) if m.type == "error" else None)
            page.on("response", lambda r: bad.append(r.url) if r.status >= 400 else None)
            page.goto(URL)
            page.wait_for_selector(".srs-root", timeout=8000)
            time.sleep(0.6)

            # ── 1. 三张牌阵：一张一张挑 → 翻开 ──────────────────
            open_panel(page)
            page.locator("[data-act='spread-three']").click()
            time.sleep(0.3)
            page.locator("[data-act='draw']").click()
            time.sleep(2.8)
            ok("三张：摊开 10 格", page.locator(".srs-pickcard").count() == 10, page.locator(".srs-pickcard").count())
            for _ in range(3):
                page.locator(".srs-pickcard:not(.is-picked)").first.click()
                time.sleep(1.1)
            ok("三张：挑满 3 张后出现「翻开这三张」", page.locator("[data-act='reveal']").count() == 1
               and "翻开这三张" in page.locator("[data-act='reveal']").inner_text())
            ok("三张：等待区 3 张、标签是过去/现在/未来",
               page.locator(".srs-wait-cell").count() == 3
               and [x.strip() for x in page.locator(".srs-wait-lab").all_inner_texts()] == ["过去", "现在", "未来"],
               page.locator(".srs-wait-lab").all_inner_texts())

            page.locator("[data-act='reveal']").click()
            time.sleep(2.6)
            hist = page.evaluate("JSON.parse(localStorage.getItem('srs.history.v1')||'[]')")
            ok("三张：翻开后历史写入 3 条", len(hist) == 3, len(hist))
            shown = [s.split("/thumb/")[1].split(".webp")[0] if "/thumb/" in s else s
                     for s in page.locator(".srs-spread .srs-sp-img").evaluate_all("els=>els.map(e=>e.src)")]
            ok("三张：翻开后 3 张牌面", len(shown) == 3, shown)
            seed0 = hist[0]["seed"]
            group = [h for h in hist if h.get("seed") == seed0 and h.get("spread") == "three"][:3]
            expect = [h["id"] for h in group][::-1]
            ok("三张：牌面顺序 = 历史顺序（过去/现在/未来）", [s.rsplit("-", 1)[0] + "-" + s.rsplit("-", 1)[1] for s in shown] == expect, [shown, expect])
            body = page.locator(".srs-body").inner_text()
            ok("三张：判词带位置名与「合起来看」", all(k in body for k in ("过去：", "现在：", "未来：", "合起来看")))

            # ── 2. 历史同种子重放：牌面必须一模一样 ─────────────
            page.locator("[data-act='hist-open']").click()
            time.sleep(0.5)
            page.locator("[data-act^='hist-replay-']").first.click()
            time.sleep(6.0)
            replayed = [s.split("/thumb/")[1].split(".webp")[0] if "/thumb/" in s else s
                        for s in page.locator(".srs-spread .srs-sp-img").evaluate_all("els=>els.map(e=>e.src)")]
            ok("重放：牌面与历史完全一致（含顺序）", [s.rsplit("-", 1)[0] + "-" + s.rsplit("-", 1)[1] for s in replayed] == expect, [replayed, expect])

            # ── 3. 凯尔特：等待区位名 + 挑牌提示按十张走 ──────────
            page.locator("[data-act='spread-celtic']").click()
            time.sleep(0.3)
            page.locator("[data-act='draw']").click()
            time.sleep(2.8)
            ok("凯尔特：摊开 10 格", page.locator(".srs-pickcard").count() == 10)
            page.locator(".srs-pickcard:not(.is-picked)").first.click()
            time.sleep(1.2)
            labs = [x.strip() for x in page.locator(".srs-wait-lab").all_inner_texts()]
            ok("凯尔特：等待区位名是「现状」", labs and labs[0] == "现状", labs)
            hint = page.locator(".srs-note").first.inner_text()
            ok("凯尔特：提示不再写「三张」", "三张" not in hint, hint)
            page.locator("[data-act='close']").first.click()
            time.sleep(0.4)

            # ── 4. 每日锁牌：刷新后还是同一张 ───────────────────
            open_panel(page)
            page.locator("[data-act='spread-daily']").click()
            time.sleep(0.2)
            page.locator("[data-act='draw']").click()
            time.sleep(2.8)
            page.locator(".srs-pickcard:not(.is-picked)").first.click()
            time.sleep(3.0)
            locked = page.evaluate("JSON.parse(localStorage.getItem('srs.dailyCard.v1')||'null')")
            ok("每日：抽完写入锁定记录", bool(locked and locked.get("id")), locked)
            page.reload()
            page.wait_for_selector(".srs-root", timeout=8000)
            time.sleep(0.6)
            open_panel(page)
            page.locator("[data-act='draw']").click()
            time.sleep(1.2)
            src = page.locator(".srs-slot img").first.get_attribute("src") or ""
            ok("每日：刷新后重开还是锁定那张", locked["id"] in src, [src, locked and locked.get("id")])
            ok("每日：按钮写「今天已定/看今天的牌」", ("今天已定" in page.inner_text(".srs-foot")) or ("看今天的牌" in page.inner_text(".srs-foot")), page.inner_text(".srs-foot"))

            # ── 5. 连点开关（同一任务里点两下，闭包旧值坑）─────────
            page.locator("[data-act='tab-sound']").click()
            time.sleep(0.4)
            n1 = page.locator("[data-act='track-shuffle']").count()
            page.evaluate("""() => {
              document.querySelector("[data-act='track-shuffle']").click();
              document.querySelector("[data-act='track-draw']").click();
            }""")
            time.sleep(0.5)
            c = cfg(page)
            ok("连点：两个轨道都关掉（不互相顶掉）",
               (c.get("sound") or {}).get("tracks", {}).get("shuffle") is False
               and (c.get("sound") or {}).get("tracks", {}).get("draw") is False,
               (c.get("sound") or {}).get("tracks"))
            page.evaluate("""() => {
              document.querySelector("[data-act='vol-up']").click();
              document.querySelector("[data-act='vol-up']").click();
              document.querySelector("[data-act='hold-3']").click();
              document.querySelector("[data-act='corner-left']").click();
            }""")
            time.sleep(0.5)
            c = cfg(page)
            ok("连点：音量 +15×2 = 85", (c.get("sound") or {}).get("volume") == 85, (c.get("sound") or {}).get("volume"))
            ok("连点：气泡停留 3s 写进配置", (c.get("bubble") or {}).get("holdSec") == 3, c.get("bubble"))
            ok("连点：屏幕角 = 左下", (c.get("anchor") or {}).get("h") == "left", c.get("anchor"))

            # ── 6. 档案：本命牌 + 四柱（2000-01-01 = 皇帝 / 戊午）──
            page.locator("[data-act='tab-profile']").click()
            time.sleep(0.4)
            page.locator("[data-pact='setup']").count()
            page.locator("input[type='password']").first.fill("1234")
            page.locator("input[type='password']").nth(1).fill("1234")
            page.locator("[data-pact='setup']").click()
            time.sleep(1.2)
            block = page.locator(".srs-block", has_text="生日 · 本命牌").first
            block.locator("input[type='date']").fill("2000-01-01")
            time.sleep(0.6)
            txt = block.inner_text()
            ok("档案：本命牌算成皇帝", "皇帝" in txt, txt)
            ok("档案：四柱日柱 = 戊午", "戊午" in txt, txt)

            # ── 7. 许愿瓶：封 30 天，列表显示还有 30 天 ───────────
            page.locator("[data-act='tab-divine']").click()
            time.sleep(0.4)
            page.locator("[data-act='wish-when-d30']").click()
            page.locator("textarea.srs-area").first.fill("等一个回音")
            page.locator("[data-act='wish-save']").click()
            time.sleep(0.6)
            wl = page.locator(".srs-wish").first.inner_text()
            ok("许愿：封存后显示「还封着 · 还有 29/30 天」", bool(re.search(r"还封着 · 还有 (29|30) 天", wl)), wl)

            # ── 8. 安神：阶段与倒计时在圈心 ─────────────────────
            page.locator("[data-act='breathe-open']").click()
            time.sleep(0.8)
            ph = page.locator(".srs-breathe-phase").inner_text().strip()
            left = page.locator(".srs-breathe-left").inner_text().strip()
            ok("安神：阶段是 吸气/屏住/呼气", ph in ("吸气", "屏住", "呼气"), ph)
            ok("安神：倒计时 m:ss", bool(re.match(r"^\d:\d\d$", left)), left)
            page.locator("[data-act='breathe-stop']").click()
            time.sleep(0.4)

            ok("全程无 JS 报错", not errors, errors[:4])
            ok("全程无 4xx/5xx", not bad, bad[:4])
            page.screenshot(path=os.path.join(r"E:\UserData\dsh-workspace\_tools\sorceress-widget\_verify", "deep-final.png"))
            browser.close()
    finally:
        srv.terminate()
        try:
            srv.wait(timeout=5)
        except Exception:
            srv.kill()

    if fails:
        print("\n✗ %d 项没过" % len(fails))
        sys.exit(1)
    print("\n深层实跑全绿")


if __name__ == "__main__":
    main()
