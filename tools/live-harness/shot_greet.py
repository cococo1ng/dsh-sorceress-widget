"""点人物 → 随机气泡 的截图（真 client.js）。

    python shot_greet.py greet      → _verify/greet-1.png / greet-2.png / greet-3.png

每次点一下都会换姿势 + 冒一句「被搭话」台词；面板必须保持关闭（菜单只走水晶球）。
"""
import os
import subprocess
import sys
import time

from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
SHOT = r"E:\UserData\dsh-workspace\_tools\sorceress-widget\_verify"
PORT = 8903


def main():
    name = (sys.argv[1] if len(sys.argv) > 1 else "greet").replace(".png", "")
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
            time.sleep(0.5)
            hit = page.locator(".srs-hit").first
            for i in range(3):
                hit.click(position={"x": 30, "y": 60})
                time.sleep(0.85)
                box = page.locator(".srs-root").bounding_box()
                clip = {
                    "x": max(0, box["x"] - 250), "y": max(0, box["y"] - 10),
                    "width": box["width"] + 260, "height": min(box["height"] + 20, 900 - max(0, box["y"] - 10)),
                }
                page.screenshot(path=os.path.join(SHOT, "%s-%d.png" % (name, i + 1)), clip=clip)
                panel_on = "is-on" in (page.locator(".srs-panel").get_attribute("class") or "")
                bubble = page.inner_text(".srs-bubble") if page.locator(".srs-bubble").count() else ""
                print("第 %d 下：面板%s · 气泡=%r" % (i + 1, "开着（错）" if panel_on else "关着（对）", bubble))
            browser.close()
    finally:
        srv.terminate()
    print("done → " + SHOT)


if __name__ == "__main__":
    main()
