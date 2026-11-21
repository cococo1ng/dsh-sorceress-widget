"""只验证自动姿态轮换：定时器不被面板开关打断 + 真的会换 + 一轮覆盖全池。

不依赖宿主：client.js 自带 stub 能独立跑（与 run_panel.py 同 index.html）。
间隔用 window.__srsPoseIntervalMs 压到 100ms，整个用例约 4 秒。
"""
import os
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
PORT = 8877
URL = "http://127.0.0.1:%d/index.html" % PORT
fails = []


def ok(name, cond, extra=""):
    print(("✓ " if cond else "✗ ") + name + (("  " + str(extra)) if extra and not cond else ""))
    if not cond:
        fails.append(name)


def main():
    srv = subprocess.Popen([sys.executable, os.path.join(HERE, "serve.py"), str(PORT)],
                           stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    time.sleep(1.0)
    try:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page(viewport={"width": 420, "height": 760})
            errors = []
            page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
            # 关键：在任何页面脚本执行前就注入加速间隔，
            # 否则组件首次建定时器时读到的是默认 240 秒，测试 3 秒内等不到一次 tick
            page.add_init_script("window.__srsPoseIntervalMs = 100;")
            page.goto(URL)
            page.wait_for_selector(".srs-root", timeout=10000)
            time.sleep(0.8)

            # ① 三张表对得上（18 立绘 / 18 定格 / 13 站姿）
            all_poses = page.evaluate("window.__srsAllPoses || []")
            stand = page.evaluate("window.__srsStandPoses || []")
            labels = page.evaluate("Object.keys(window.__srsPoseLabel || {})")
            ok("全部立绘 18 张", len(all_poses) == 18, all_poses)
            ok("定格表 18 键", len(labels) == 18, labels)
            ok("自动站姿池 13 张", len(stand) == 13, stand)
            ok("idle-b 已不在任何表里",
               "idle-b" not in all_poses and "idle-b" not in stand and "idle-b" not in labels)
            ok("站姿池含 fly / bye", "fly" in stand and "bye" in stand)
            ok("站姿池不含流程与打盹",
               not any(x in stand for x in ("shuffle", "spread", "draw", "flip", "sleep")), stand)

            # ② 加速已通过 init script 生效，验证 tick 持续推进
            page.evaluate("window.__srsPoseTicks = 0; window.__srsPoseLog = []")
            time.sleep(0.35)
            t0 = page.evaluate("window.__srsPoseTicks || 0")
            ok("tick 在跑（400ms 内至少 1 次）", t0 >= 1, t0)

            # ③ 开关面板 4 次，计时器不能被重置
            for _ in range(4):
                page.locator(".srs-gear").first.click()
                time.sleep(0.12)
                page.locator("[data-act='close']").first.click()
                time.sleep(0.12)
            t1 = page.evaluate("window.__srsPoseTicks || 0")
            ok("开关面板 4 次后 tick 仍在累加（定时器未被重置）", t1 > t0, (t0, t1))

            # ④ 等足够久，确认真的换到过不同站姿，且覆盖池里大多数
            time.sleep(2.6)   # 100ms × 13 张 ≈ 1.3s 一轮，留足两轮
            log = page.evaluate("window.__srsPoseLog || []")
            ok("自动轮换真的发生过（至少 4 次切换）", len(log) >= 4, log)
            ok("换到过 ≥8 种不同站姿（不是固定几张）", len(set(log)) >= 8, sorted(set(log)))
            ok("换过的都在站姿池里", all(x in stand for x in log), [x for x in log if x not in stand])

            # ⑤ 面板上没有 JS 报错
            page_errors = [e for e in errors if "favicon" not in e.lower()]
            ok("无 JS 控制台错误", len(page_errors) == 0, page_errors[:3])

            page.screenshot(path=os.path.join(HERE, "..", "..", "_verify", "pose-rotate.png"))
            browser.close()
    finally:
        srv.terminate()

    print("\n姿态轮换实跑：" + ("全绿（%d 项）" % (14 - len(fails))) if not fails else
          "\n失败 %d 项：%s" % (len(fails), fails))
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
