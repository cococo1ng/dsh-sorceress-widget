"""拍水晶球红光的对照图：悬停出球 → 3x 局部截图。"""
import os
import subprocess
import sys
import time

from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
PORT = 8897
URL = "http://127.0.0.1:%d/index.html" % PORT
OUT = os.path.join(ROOT, "_verify", "gear-glow.png")


def main():
    srv = subprocess.Popen([sys.executable, os.path.join(HERE, "serve.py"), str(PORT)],
                           stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    time.sleep(1.2)
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page(viewport={"width": 1440, "height": 900}, device_scale_factor=3)
            page.goto(URL)
            page.wait_for_selector(".srs-root", timeout=8000)
            time.sleep(0.6)
            page.hover(".srs-root")
            time.sleep(2.7)                      # 卡在呼吸最亮的那一档
            box = page.locator(".srs-gear").bounding_box()
            pad = 34
            page.screenshot(path=OUT, clip={"x": box["x"] - pad, "y": box["y"] - pad,
                                            "width": box["width"] + pad * 2, "height": box["height"] + pad * 2})
            print("写", OUT, os.path.getsize(OUT) // 1024, "KB")
            browser.close()
    finally:
        srv.terminate()
        try:
            srv.wait(timeout=5)
        except Exception:
            srv.kill()


if __name__ == "__main__":
    main()


