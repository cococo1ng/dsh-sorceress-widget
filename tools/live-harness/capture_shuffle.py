"""洗牌动画连拍：点「抽牌」之后按时间点连截 6 帧，拼成一条胶片图。

    python tools/live-harness/capture_shuffle.py

只验一件事：CSS 洗牌在 168×252 牌位里，0→1.25 秒的节奏和末帧叠齐的效果。
产物：_verify/shuffle-film.png（横排 6 格）
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
# 目标采样时刻（秒），覆盖滑入 / 交错 / 收拢 / 末帧
AT = [0.10, 0.35, 0.60, 0.85, 1.10, 1.24]


def main():
    py = sys.executable
    srv = subprocess.Popen([py, os.path.join(HERE, "serve.py"), str(PORT)],
                           stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    time.sleep(1.2)
    outs = []
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page(viewport={"width": 1440, "height": 900})
            page.goto(URL, wait_until="load")
            time.sleep(2.2)
            page.locator(".srs-gear").click()
            time.sleep(0.7)
            page.locator(".srs-tab", has_text="塔罗").click()
            time.sleep(0.4)

            # 洗牌态才有 .srs-slot；点完立刻抓框，再把 t0 对齐到这一刻
            page.locator("[data-act='draw']").click()
            page.wait_for_selector(".srs-slot .srs-shuf", timeout=4000)
            box = page.locator(".srs-slot").bounding_box()
            if not box:
                raise SystemExit("❌ 找不到 .srs-slot")
            clip = {"x": box["x"] - 4, "y": box["y"] - 4,
                    "width": box["width"] + 8, "height": box["height"] + 8}
            print("牌位", {k: round(v, 1) for k, v in clip.items()})

            t0 = time.time()

            for i, t in enumerate(AT):
                wait = t - (time.time() - t0)
                if wait > 0:
                    time.sleep(wait)
                path = os.path.join(SHOT, "shuffle-%02d.png" % i)
                page.screenshot(path=path, clip=clip)
                outs.append(path)
                has = page.locator(".srs-shuf i").count()
                print("  %.2fs  牌位内 .srs-shuf i = %d" % (t, has))
            browser.close()
    finally:
        srv.terminate()
        try:
            srv.wait(timeout=5)
        except Exception:
            srv.kill()

    if len(outs) == len(AT):
        from PIL import Image
        imgs = [Image.open(p) for p in outs]
        w, h = imgs[0].size
        sheet = Image.new("RGB", (w * len(imgs), h), (10, 10, 14))
        for i, im in enumerate(imgs):
            sheet.paste(im.convert("RGB"), (i * w, 0))
        out = os.path.join(SHOT, "shuffle-film.png")
        sheet.save(out)
        print("✓ 连拍完成 →", out)


if __name__ == "__main__":
    main()
