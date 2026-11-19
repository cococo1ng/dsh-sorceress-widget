# -*- coding: utf-8 -*-
"""渲染插画风菜单栏候选样张。

    python shot.py            → 整页 2x 截图 → preview.png
"""
import os

from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
HTML = "file:///" + os.path.join(HERE, "preview.html").replace("\\", "/")
OUT = os.path.join(HERE, "preview.png")


def main():
    with sync_playwright() as p:
        b = p.chromium.launch()
        page = b.new_page(viewport={"width": 460, "height": 900}, device_scale_factor=2)
        page.goto(HTML)
        page.wait_for_timeout(400)
        page.screenshot(path=OUT, full_page=True)
        b.close()
    print("ok", OUT, os.path.getsize(OUT), "bytes")


if __name__ == "__main__":
    main()
