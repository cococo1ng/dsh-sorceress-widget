"""把关于页预览渲染成长图（2x），供审阅。"""
import os
import sys

from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
PAGE = "file:///" + os.path.join(ROOT, "docs", "about-preview.html").replace("\\", "/")
OUT = os.path.join(ROOT, "_verify", "about-preview.png")


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 400, "height": 900}, device_scale_factor=2)
        page.goto(PAGE)
        page.wait_for_timeout(400)
        el = page.locator(".panel")
        el.screenshot(path=OUT)
        box = el.bounding_box()
        print("panel:", box)
        browser.close()
    print("写", OUT, os.path.getsize(OUT) // 1024, "KB")


if __name__ == "__main__":
    main()
