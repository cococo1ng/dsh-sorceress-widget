"""气泡收起过程截图：淡出那 0.2 秒里连拍，看是整块淡出还是缩成小方块。

用法：python tools/live-harness/shot_bubble.py
落盘：_verify/bubble-on.png / bubble-fade-<i>.png / bubble-after.png / bubble-old-bug.png
"""
import os
import subprocess
import time

from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = r"E:\UserData\dsh-workspace\_tools\sorceress-widget\_verify"
PORT = 8907
URL = "http://127.0.0.1:%d/index.html" % PORT

Q = "(()=>{const b=document.querySelector('.srs-bubble');if(!b)return null;" \
    "const r=b.getBoundingClientRect();const cs=getComputedStyle(b);" \
    "return {w:Math.round(r.width),h:Math.round(r.height),op:cs.opacity," \
    "txt:b.textContent.trim().slice(0,10),cls:b.className}})()"


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
            page.evaluate("localStorage.setItem('srs.cfg.v1', JSON.stringify("
                          "{scale:1,bubble:{on:true,holdSec:1}})); location.reload()")
            time.sleep(1.4)
            page.wait_for_selector(".srs-root", timeout=8000)
            time.sleep(0.4)

            root = page.locator(".srs-root").bounding_box()
            clip = {"x": max(0, root["x"] - 210), "y": max(0, root["y"] - 30),
                    "width": root["width"] + 240, "height": root["height"] + 70}

            page.locator(".srs-hit").first.click(position={"x": 30, "y": 60})
            time.sleep(0.5)
            # 主行 + 副行（账目数字）一起摆出来看：只点她一下只有主行，副行材质要借播报气泡看
            page.evaluate("(()=>{const b=document.querySelector('.srs-bubble');"
                          "if(!b)return;b.classList.add('is-on');"
                          "b.innerHTML='这一轮 ¥0.0321<div class=\\'srs-bubble-sub\\'>12,438 tok · chat</div>';})()")
            time.sleep(0.2)
            print("显示中:", page.evaluate(Q))
            page.screenshot(path=os.path.join(OUT, "bubble-on.png"), clip=clip)

            # holdSec=1 → 1.0s 后开始收起，连拍淡出那几帧
            time.sleep(0.52)
            for i in range(4):
                page.screenshot(path=os.path.join(OUT, "bubble-fade-%d.png" % i), clip=clip)
                print("淡出第 %d 帧:" % i, page.evaluate(Q))
                time.sleep(0.06)

            time.sleep(0.5)
            after = page.evaluate(Q)
            print("收完后:", after)
            page.screenshot(path=os.path.join(OUT, "bubble-after.png"), clip=clip)

            # 对照：还原旧形态 —— 文本被清空、只剩 padding + 边框 + 投影，宽度塌成 22px
            page.locator(".srs-hit").first.click(position={"x": 30, "y": 60})
            time.sleep(0.35)
            page.evaluate("(()=>{const b=document.querySelector('.srs-bubble');if(!b)return;"
                          "b.textContent='';b.className='srs-bubble is-on';"
                          "b.style.display='block';b.style.minWidth='22px';b.style.minHeight='29px';"
                          "b.style.opacity='.85';})()")
            time.sleep(0.05)
            print("旧写法（清空文本，保留 padding/边框）:", page.evaluate(Q))
            page.screenshot(path=os.path.join(OUT, "bubble-old-bug.png"), clip=clip)
            browser.close()
    finally:
        srv.terminate()


if __name__ == "__main__":
    main()
