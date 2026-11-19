"""换姿势过程截图：看是不是硬切，还是两张半透明叠着（会闪）。

用法：python tools/live-harness/shot_pose.py
落盘：_verify/pose-idle.png / pose-cut.png / pose-flash.png（旧行为对照）
"""
import os
import subprocess
import time

from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = r"E:\UserData\dsh-workspace\_tools\sorceress-widget\_verify"
PORT = 8908
URL = "http://127.0.0.1:%d/index.html" % PORT

OPS = ("(()=>Array.from(document.querySelectorAll('.srs-sprite'))"
       ".filter(i=>Number(getComputedStyle(i).opacity)>0.01)"
       ".map(i=>i.dataset.pose+':'+Number(getComputedStyle(i).opacity).toFixed(2)))()")


def main():
    os.makedirs(OUT, exist_ok=True)
    py = os.sys.executable
    srv = subprocess.Popen([py, os.path.join(HERE, "serve.py"), str(PORT)],
                           stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    time.sleep(1.2)
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page(viewport={"width": 1440, "height": 900})
            page.goto(URL)
            page.wait_for_selector(".srs-root", timeout=8000)
            time.sleep(0.6)

            root = page.locator(".srs-root").bounding_box()
            clip = {"x": max(0, root["x"] - 40), "y": max(0, root["y"] - 20),
                    "width": root["width"] + 80, "height": root["height"] + 40}
            page.screenshot(path=os.path.join(OUT, "pose-idle.png"), clip=clip)
            print("待机:", page.evaluate(OPS))

            # 换姿势：30ms 就取，处于过渡中段的话会看到两张半透明
            page.locator(".srs-hit").first.click(position={"x": 30, "y": 60})
            time.sleep(0.03)
            print("换姿势 +30ms:", page.evaluate(OPS))
            page.screenshot(path=os.path.join(OUT, "pose-cut.png"), clip=clip)

            # 对照：把旧的 opacity 过渡加回去，再换一次
            page.evaluate("(()=>{const s=document.createElement('style');"
                          "s.id='old-fade';s.textContent='.srs-sprite{transition:opacity .22s ease-out}';"
                          "document.head.appendChild(s);})()")
            time.sleep(1.2)
            page.locator(".srs-hit").first.click(position={"x": 30, "y": 60})
            time.sleep(0.11)
            print("旧写法（0.22s 过渡）+110ms:", page.evaluate(OPS))
            page.screenshot(path=os.path.join(OUT, "pose-flash.png"), clip=clip)
            browser.close()
    finally:
        srv.terminate()


if __name__ == "__main__":
    main()
