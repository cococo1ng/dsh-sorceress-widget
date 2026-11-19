# -*- coding: utf-8 -*-
"""逐页截整面板（看按钮族是否统一）。

    python shot_pages.py v033        → _verify/v033-<tab>.png × 6

每页都截 `.srs-panel`（含面板外框与角花），2x。
"""
import os
import subprocess
import sys
import time

from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
SHOT = r"E:\UserData\dsh-workspace\_tools\sorceress-widget\_verify"
PORT = 8907
TABS = ["tarot", "divine", "zodiac", "bill", "sound", "profile"]


def main():
    prefix = sys.argv[1] if len(sys.argv) > 1 else "pages"
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
            time.sleep(0.5)
            for t in TABS:
                page.locator("[data-act='tab-%s']" % t).click()
                time.sleep(0.45)
                page.locator(".srs-panel").screenshot(path=os.path.join(SHOT, "%s-%s.png" % (prefix, t)))
            # 编辑台词子页（分组按钮那一行最容易挤，单独截一张）
            page.locator("[data-act='tab-sound']").click()
            time.sleep(0.4)
            page.locator("[data-act='open-edit']").scroll_into_view_if_needed()
            page.locator("[data-act='open-edit']").click(force=True)
            time.sleep(0.5)
            page.locator(".srs-panel").screenshot(path=os.path.join(SHOT, "%s-edit-lines.png" % prefix))
            # 牌库子页
            page.locator("[data-act='tab-tarot']").click()
            time.sleep(0.4)
            page.locator("[data-act='deck-open']").scroll_into_view_if_needed()
            page.locator("[data-act='deck-open']").click(force=True)
            time.sleep(0.7)
            page.locator(".srs-panel").screenshot(path=os.path.join(SHOT, "%s-deck.png" % prefix))
            browser.close()
    finally:
        srv.terminate()
    print("done → " + SHOT)


if __name__ == "__main__":
    main()
