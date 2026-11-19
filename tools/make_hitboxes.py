"""生成 src/hitboxes.json —— 每个姿态的可点击轮廓 + 宽高比。

立绘已经是按 alpha 包围盒紧裁过的（_tools/sorceress_prep_sprites.py 那一步），
所以这里的 box 只要按 alpha>96 再收一次，把 2px 透明边去掉即可。

用法：python tools/make_hitboxes.py
"""
import json
import os
import sys

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SPRITES = os.path.join(ROOT, "assets", "sorceress")
OUT = os.path.join(ROOT, "src", "hitboxes.json")
ALPHA = 96

POSES = {
    "idle-a": "sorceress-idle-a.webp",
    "idle-b": "sorceress-idle-b.webp",
    "think": "sorceress-think.webp",
    "dazed": "sorceress-dazed.webp",
    "shuffle": "sorceress-shuffle.webp",
    "spread": "sorceress-spread.webp",
    "draw": "sorceress-draw.webp",
    "flip": "sorceress-flip.webp",
    "smile": "sorceress-smile.webp",
    "sleep": "sorceress-sleep.webp",
    "smirk": "sorceress-smirk.webp",
    "fly": "sorceress-fly.webp",
    "reading": "sorceress-reading.webp",
    "annoyed": "sorceress-annoyed.webp",
    "bye": "sorceress-bye.webp",
    "rest-hands": "sorceress-rest-hands.webp",
    "look-aside": "sorceress-look-aside.webp",
    "hold-cup": "sorceress-hold-cup.webp",
    "stretch": "sorceress-stretch.webp",
}


def main():
    if not os.path.isdir(SPRITES):
        sys.exit("❌ 缺立绘目录：" + SPRITES)
    boxes = {}
    for pose, name in POSES.items():
        path = os.path.join(SPRITES, name)
        if not os.path.exists(path):
            sys.exit("❌ 缺立绘：" + name)
        im = Image.open(path).convert("RGBA")
        w, h = im.size
        al = np.array(im.getchannel("A"))
        ys, xs = np.where(al > ALPHA)
        if len(ys) == 0:
            sys.exit("❌ 全透明：" + name)
        x0, x1 = int(xs.min()), int(xs.max()) + 1
        y0, y1 = int(ys.min()), int(ys.max()) + 1
        boxes[pose] = {
            "ar": round(w / h, 4),
            "box": [round(x0 / w, 4), round(y0 / h, 4), round((x1 - x0) / w, 4), round((y1 - y0) / h, 4)],
        }
        print("%-8s %dx%d ar=%.4f box=%s" % (pose, w, h, boxes[pose]["ar"], boxes[pose]["box"]))

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(boxes, f, ensure_ascii=False, indent=2)
    print("OK ->", OUT, len(boxes), "poses")


if __name__ == "__main__":
    main()
