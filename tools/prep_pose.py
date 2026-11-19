# -*- coding: utf-8 -*-
"""立绘抠图流水线（三步 + 裁紧），与 0.44.0 做 sorceress-dazed 那次同一套口径。

① isnet-anime 出前景 alpha（rembg）
② pymatting alpha matting 去白边（在长边 1024 上解，再上采样，快且够）
③ 泛洪清白：白底图必然有纯白连通区，isnet 常漏掉大块留白 → 从四边泛洪标记为背景，
   再对 alpha 做 1px 腐蚀，避免留下半透明白边
④ 按 alpha 包围盒裁紧 → 缩到高 520（LANCZOS）→ webp

用法：python tools/prep_pose.py <输入图> <输出名>
例：  python tools/prep_pose.py _tmp_poses/stretch.jpg stretch
"""
import os
import sys
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(HERE, "..", "assets", "sorceress")
TARGET_H = 520
MATTE_LONG = 1024


def step1_isnet(img: Image.Image) -> np.ndarray:
    from rembg import new_session, remove
    sess = new_session("isnet-anime")
    cut = remove(img, session=sess, only_mask=False)
    a = np.asarray(cut.split()[-1]).astype(np.float32) / 255.0
    return a


def step2_matte(img: Image.Image, alpha: np.ndarray) -> np.ndarray:
    """pymatting 细化：trimap 由 isnet alpha 阈值化得到。降采样到长边 1024 再解。"""
    from pymatting import estimate_alpha_cf
    h, w = alpha.shape
    scale = min(1.0, MATTE_LONG / max(h, w))
    if scale < 1.0:
        nw, nh = max(1, int(w * scale)), max(1, int(h * scale))
        rgb_small = np.asarray(img.convert("RGB").resize((nw, nh), Image.LANCZOS), dtype=np.float64) / 255.0
        a_small = np.asarray(Image.fromarray((alpha * 255).astype(np.uint8)).resize((nw, nh), Image.BILINEAR),
                             dtype=np.float32) / 255.0
    else:
        rgb_small = np.asarray(img.convert("RGB"), dtype=np.float64) / 255.0
        a_small = alpha
    trimap = np.full(a_small.shape, 0.5, dtype=np.float64)
    trimap[a_small > 0.95] = 1.0
    trimap[a_small < 0.05] = 0.0
    try:
        out = estimate_alpha_cf(rgb_small, trimap)
    except Exception as e:
        print("   pymatting 失败，退回 isnet alpha：", e)
        return alpha
    out = np.clip(out, 0, 1).astype(np.float32)
    if scale < 1.0:
        out = np.asarray(Image.fromarray((out * 255).astype(np.uint8)).resize((w, h), Image.LANCZOS),
                         dtype=np.float32) / 255.0
    return out


def step3_flood_white(img: Image.Image, alpha: np.ndarray) -> np.ndarray:
    """从四边泛洪：接边且接近纯白的区域判为背景（isnet 漏掉的留白在这里补）。"""
    import cv2
    rgb = np.asarray(img.convert("RGB"))
    whiteish = (rgb.min(axis=2) > 243).astype(np.uint8)
    h, w = whiteish.shape
    mask = np.zeros((h + 2, w + 2), np.uint8)
    filled = whiteish.copy()
    for seed in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)] + \
                [(x, 0) for x in range(0, w, max(1, w // 12))] + \
                [(x, h - 1) for x in range(0, w, max(1, w // 12))] + \
                [(0, y) for y in range(0, h, max(1, h // 12))] + \
                [(w - 1, y) for y in range(0, h, max(1, h // 12))]:
        if whiteish[seed[1], seed[0]]:
            cv2.floodFill(filled, mask, seed, 2, loDiff=0, upDiff=0)
    bg = (filled == 2) | (whiteish == 1) & (filled == 2)
    out = alpha.copy()
    out[bg] = 0.0
    # 1px 腐蚀：把半透明白边削掉一圈（只削 alpha 边缘，不动内部）
    k = np.ones((3, 3), np.uint8)
    er = cv2.erode((out * 255).astype(np.uint8), k, iterations=1).astype(np.float32) / 255.0
    band = (out > 0) & (er < out)
    out[band] = np.minimum(out[band], er[band] + 0.35)
    return np.clip(out, 0, 1)


def step4_crop(img: Image.Image, alpha: np.ndarray, dst: str) -> dict:
    ys, xs = np.where(alpha > 0.08)
    if not len(ys):
        raise SystemExit("抠图失败：alpha 全空")
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    rgb = np.asarray(img.convert("RGB"))[y0:y1, x0:x1]
    a = alpha[y0:y1, x0:x1]
    rgba = np.dstack([rgb, (a * 255).astype(np.uint8)])
    im = Image.fromarray(rgba, "RGBA")
    w, h = im.size
    nh = TARGET_H
    nw = max(1, round(w * nh / h))
    im = im.resize((nw, nh), Image.LANCZOS)
    im.save(dst, "WEBP", quality=88, method=6)
    return {"w": nw, "h": nh, "ar": round(nw / nh, 4), "kb": round(os.path.getsize(dst) / 1024, 1)}


def main(argv):
    if len(argv) < 3:
        print(__doc__)
        return 1
    src, name = argv[1], argv[2]
    img = Image.open(src).convert("RGB")
    print("源", img.size)
    a1 = step1_isnet(img)
    print("  isnet 前景像素 %.1f%%" % ((a1 > 0.5).mean() * 100))
    a2 = step2_matte(img, a1)
    a3 = step3_flood_white(img, a2)
    print("  matte 后前景 %.1f%% → 泛洪后 %.1f%%" % ((a2 > 0.5).mean() * 100, (a3 > 0.5).mean() * 100))
    dst = os.path.join(OUT_DIR, "sorceress-%s.webp" % name)
    info = step4_crop(img, a3, dst)
    print("✅ %s → %s  %dx%d  ar=%.4f  %.1fKB" % (name, dst, info["w"], info["h"], info["ar"], info["kb"]))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
