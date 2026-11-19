# -*- coding: utf-8 -*-
"""冷启动验收：断外网 + 空 localStorage + 全新 context（等价新 profile）。

验四件事：
  ① 外网全断的情况下挂件能起来、面板能开（不依赖任何外部请求）
  ② 六个 tab 都能打开，不报 JS 错误
  ③ 没有任何 4xx/5xx/失败请求（除被我们主动 abort 的外网请求）
  ④ 首次访问没有历史数据时，塔罗页/星座页/计费页都能给出可读内容（不是白屏或报错）

    python coldstart.py
"""
import os
import subprocess
import sys
import time

from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
PORT = 8909
TABS = ["tarot", "divine", "zodiac", "bill", "sound", "profile"]
fails = []


def ok(name, cond, extra=""):
    if cond:
        print("✓ " + name)
    else:
        fails.append(name)
        print("✗ " + name + (("  " + str(extra)) if extra else ""))


def main():
    srv = subprocess.Popen([sys.executable, os.path.join(HERE, "serve.py"), str(PORT)],
                           stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    time.sleep(1.2)
    console_errors, bad_requests, blocked = [], [], []
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            # 全新 context = 空 localStorage / 空 IndexedDB / 无缓存，等价新 profile
            ctx = browser.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=1)
            page = ctx.new_page()

            def route(r):
                url = r.request.url
                if "127.0.0.1" in url or url.startswith("data:") or url.startswith("blob:"):
                    r.continue_()
                else:
                    blocked.append(url)
                    r.abort()          # 外网一律断掉

            page.route("**/*", route)
            page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
            page.on("requestfailed", lambda r: bad_requests.append(
                "%s %s" % (r.method, r.url[-80:])) if "127.0.0.1" in r.url else None)
            page.on("response", lambda r: bad_requests.append(
                "HTTP %d %s" % (r.status, r.url[-80:])) if r.status >= 400 else None)

            page.goto("http://127.0.0.1:%d/index.html" % PORT)
            page.wait_for_selector(".srs-root", timeout=10000)
            time.sleep(1.2)
            ok("断网下挂件能起来", page.locator(".srs-sprite.is-on").count() >= 1)
            ok("立绘是内联 data URI（不走外网）", page.evaluate(
                "Array.from(document.querySelectorAll('.srs-sprite')).every(i=>i.src.startsWith('data:image/webp;base64,'))"))

            page.locator(".srs-root").hover()
            page.locator("[data-act='open-menu']").click(force=True)
            page.wait_for_selector(".srs-panel.is-on", timeout=6000)
            time.sleep(0.5)
            ok("面板能打开", page.locator(".srs-panel.is-on").count() == 1)

            for t in TABS:
                page.locator("[data-act='tab-%s']" % t).click()
                time.sleep(0.45)
                body = page.inner_text(".srs-body")
                ok("tab「%s」有内容（空 localStorage）" % t, len(body.strip()) > 10, len(body.strip()))

            # 首访抽一张：牌库与牌义都是内联的，断网也该出结果
            page.locator("[data-act='tab-tarot']").click()
            time.sleep(0.4)
            page.locator("[data-act='spread-one']").click()
            time.sleep(0.3)
            page.locator("[data-act='draw']").click()
            time.sleep(2.6)
            page.locator("[data-act='pick-0']").click()
            time.sleep(2.4)      # 单张模式点完即刻翻牌，没有「翻开」按钮
            ok("首访能抽出一张并给判词", page.locator(".srs-name").count() >= 1
               and len(page.inner_text(".srs-lines").strip()) > 8,
               page.locator(".srs-name").count())

            ok("无 JS 报错", not console_errors, console_errors[:3])
            ok("无 4xx/5xx/失败请求", not bad_requests, bad_requests[:3])
            print("\n（被主动断掉的外网请求 %d 条，断网验收本就要断）" % len(blocked))
            for u in blocked[:5]:
                print("   -", u[:100])
            browser.close()
    finally:
        srv.terminate()
    print()
    if fails:
        print("❌ %d 项没过：%s" % (len(fails), " / ".join(fails)))
        return 1
    print("✅ 冷启动全绿（断网 + 空 localStorage + 新 context）")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
