# -*- coding: utf-8 -*-
"""把一张方形徽章图抠成插件图标（圆形透明底）。

用法：
  python tools/make_icon.py <源图> [输出目录]
  python tools/make_icon.py logo.jpg            # 默认写 plugin/
  python tools/make_icon.py logo.jpg --preview   # 额外出深/浅底预览到 _verify/

做法（不靠手调阈值）：
  ① 暗部掩膜求出徽章内圆（夜空比奶白底暗得多）→ 圆心与内半径
  ② 金环掩膜沿过圆心的横竖两行找最外金像素 → 外半径（圆环外沿）
  ③ 画布取外半径 + 2% 留白；圆形 alpha 在最外 1.2px 做线性羽化，避免锯齿与奶白毛边
  ④ 输出 256（icon.png / icon-256.png）与 128（icon-128.png），RGBA
"""
import os
import sys

import numpy as np
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
OUT = os.path.join(ROOT, "plugin")


def detect(im):
    a = np.asarray(im.convert("RGB")).astype(int)
    r, g, b = a[:, :, 0], a[:, :, 1], a[:, :, 2]
    dark = np.maximum(np.maximum(r, g), b) < 120
    ys, xs = np.where(dark)
    if not len(xs):
        raise SystemExit("没找到暗部：这张图可能不是深色徽章")
    cx = (xs.min() + xs.max()) / 2.0
    cy = (ys.min() + ys.max()) / 2.0
    r_in = max(xs.max() - xs.min(), ys.max() - ys.min()) / 2.0

    gold = (r > 135) & (g > 95) & (b < 155) & ((r - b) > 45)
    row = gold[int(round(cy)), :]
    col = gold[:, int(round(cx))]
    idx_r = np.where(row)[0]
    idx_c = np.where(col)[0]
    if not len(idx_r) or not len(idx_c):
        raise SystemExit("没找到金环：外半径退化，先看图对不对")
    r_out = max(idx_r.max() - cx, cx - idx_r.min(), idx_c.max() - cy, cy - idx_c.min())
    return cx, cy, r_in, r_out


def circle_alpha(size, center, radius, feather=1.2):
    """size×size 的圆形 alpha（0–255），边缘 linear 羽化。"""
    c = (size - 1) / 2.0
    yy, xx = np.mgrid[0:size, 0:size]
    dist = np.hypot(xx - c, yy - c)
    a = np.clip((radius - dist) / max(feather, 0.1), 0.0, 1.0)
    return (a * 255).round().astype(np.uint8)


def build(src, out_dir, preview=False):
    im = Image.open(src).convert("RGB")
    W, H = im.size
    cx, cy, r_in, r_out = detect(im)
    pad = r_out * 1.02                      # 2% 留白，圆边不顶格
    left = cx - pad
    top = cy - pad
    size = int(round(pad * 2))
    # 裁方形（超出原图的区域补奶白，最后都会被 alpha 切掉）
    canvas = Image.new("RGB", (size, size), (250, 246, 238))
    box = (int(round(left)), int(round(top)), int(round(left)) + size, int(round(top)) + size)
    src_crop = im.crop(box)
    canvas.paste(src_crop, (0, 0))
    alpha = Image.fromarray(circle_alpha(size, (size - 1) / 2.0, r_out), "L")
    icon = canvas.convert("RGBA")
    icon.putalpha(alpha)

    os.makedirs(out_dir, exist_ok=True)
    big = icon.resize((256, 256), Image.LANCZOS)
    small = icon.resize((128, 128), Image.LANCZOS)
    for name, img in (("icon.png", big), ("icon-256.png", big), ("icon-128.png", small)):
        path = os.path.join(out_dir, name)
        img.save(path, "PNG", optimize=True)
        print("写 " + path + "  " + str(img.size) + "  " + str(os.path.getsize(path) // 1024) + " KB")

    if preview:
        vdir = os.path.join(ROOT, "_verify")
        os.makedirs(vdir, exist_ok=True)
        for name, bg in (("logo-on-dark.png", (14, 20, 36)), ("logo-on-light.png", (245, 241, 232))):
            pv = Image.new("RGBA", (256, 256), bg + (255,))
            pv.alpha_composite(big)
            pv.convert("RGB").save(os.path.join(vdir, name))
            print("预览 " + os.path.join(vdir, name))
        # 大图预览（发给别人看 / 桌面留档）：512 透明 + 512 深底
        big512 = icon.resize((512, 512), Image.LANCZOS)
        big512.save(os.path.join(vdir, "logo-512.png"), "PNG", optimize=True)
        pv512 = Image.new("RGBA", (512, 512), (14, 20, 36, 255))
        pv512.alpha_composite(big512)
        pv512.convert("RGB").save(os.path.join(vdir, "logo-preview-512.png"))
        print("预览 " + os.path.join(vdir, "logo-preview-512.png"))
    return {"center": (cx, cy), "r_in": r_in, "r_out": r_out, "canvas": size}


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    preview = "--preview" in sys.argv
    if not args:
        raise SystemExit("用法：python tools/make_icon.py <源图> [输出目录] [--preview]")
    src = args[0]
    out = args[1] if len(args) > 1 else OUT
    info = build(src, out, preview)
    print("探测：圆心 %s · 内半径 %.1f · 外半径 %.1f · 画布 %d" % (info["center"], info["r_in"], info["r_out"], info["canvas"]))
