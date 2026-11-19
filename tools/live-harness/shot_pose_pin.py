"""把某个站姿钉住后拍挂件本体：python shot_pose_pin.py look-aside"""
import os
import subprocess
import sys
import time

from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
PORT = 8896
URL = "http://127.0.0.1:%d/index.html" % PORT


def main():
    pose = sys.argv[1] if len(sys.argv) > 1 else "look-aside"
    out = os.path.join(ROOT, "_verify", "pose-%s.png" % pose)
    srv = subprocess.Popen([sys.executable, os.path.join(HERE, "serve.py"), str(PORT)],
                           stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    time.sleep(1.2)
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page(viewport={"width": 1440, "height": 900}, device_scale_factor=2)
            page.add_init_script(
                "localStorage.setItem('srs.cfg.v1', JSON.stringify({posePin:'%s'}))" % pose)
            page.goto(URL)
            page.wait_for_selector(".srs-root", timeout=8000)
            time.sleep(1.4)
            page.locator(".srs-root").screenshot(path=out)
            print("写", out, os.path.getsize(out) // 1024, "KB")
            browser.close()
    finally:
        srv.terminate()
        try:
            srv.wait(timeout=5)
        except Exception:
            srv.kill()


if __name__ == "__main__":
    main()
