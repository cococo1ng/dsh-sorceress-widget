"""UI 素材派生：角花切四格、底纹缩图、分隔线裁白、按钮切三条

输入：D:\\Users\\Administrator\\Desktop\\统一版式塔罗牌\\
输出：assets/ui/*.webp
用法：python tools/prep_ui.py
"""
import os
import sys

import numpy as np
from PIL import Image

SRC = r'D:\Users\Administrator\Desktop\统一版式塔罗牌'
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'ui')


def trim_white(im, thresh=246, pad=2):
    a = np.array(im.convert('RGB'))
    mask = ~(a.min(axis=2) > thresh)
    ys, xs = np.where(mask)
    if len(ys) == 0:
        return None
    x0, x1 = max(0, int(xs.min()) - pad), min(a.shape[1], int(xs.max()) + 1 + pad)
    y0, y1 = max(0, int(ys.min()) - pad), min(a.shape[0], int(ys.max()) + 1 + pad)
    return im.crop((x0, y0, x1, y1))



def key_white(im, lo=205, hi=240):
    """白色→透明：minRGB ≤ lo 全不透明，≥ hi 全透明，中间线性过渡。
    源图底色其实是 248~255 的近白（还带纸纹），按 246 当阈值会留下灰色方块。"""
    arr = np.array(im.convert('RGBA'))
    mn = arr[..., :3].astype(np.float32).min(axis=2)
    alpha = np.clip((hi - mn) * 255.0 / float(hi - lo), 0, 255)
    arr[..., 3] = np.minimum(arr[..., 3], alpha.astype(np.uint8))
    return Image.fromarray(arr, 'RGBA')


def main():
    os.makedirs(OUT, exist_ok=True)
    report = []

    # ① 角花：1536² 的 2×2，切四格后各自裁白
    src = Image.open(os.path.join(SRC, '四角花纹样表.png')).convert('RGB')
    w, h = src.size
    cells = {'corner-tl': (0, 0), 'corner-tr': (1, 0), 'corner-bl': (0, 1), 'corner-br': (1, 1)}
    for name, (col, row) in cells.items():
        cell = src.crop((col * w // 2, row * h // 2, (col + 1) * w // 2, (row + 1) * h // 2))
        cropped = trim_white(cell)
        if cropped is None:
            sys.exit('角花格是空的：' + name)
        # 角花要带透明底：白色 → alpha 0
        out_im = key_white(cropped)
        scale = 200 / max(out_im.size)
        if scale < 1:
            out_im = out_im.resize((round(out_im.width * scale), round(out_im.height * scale)), Image.LANCZOS)
        path = os.path.join(OUT, name + '.webp')
        out_im.save(path, 'WEBP', quality=86, method=6)
        report.append((name + '.webp', out_im.size, os.path.getsize(path)))

    # ② 底纹：缩到 768，cover 用不平铺
    src = Image.open(os.path.join(SRC, '深蓝星夜无缝纹理.png')).convert('RGB')
    bg = src.resize((768, 768), Image.LANCZOS)
    path = os.path.join(OUT, 'panel-bg.webp')
    bg.save(path, 'WEBP', quality=80, method=6)
    report.append(('panel-bg.webp', bg.size, os.path.getsize(path)))

    # ③ 分隔线：裁白后按 11:1 存到 1200 宽（面板里按宽度自适应，不拉伸变形）
    src = Image.open(os.path.join(SRC, '生成塔罗牌图片.png')).convert('RGB')
    cropped = trim_white(src, pad=6)
    ratio_h = round(1200 * cropped.height / cropped.width)
    dv = key_white(cropped.resize((1200, ratio_h), Image.LANCZOS))
    path = os.path.join(OUT, 'divider.webp')
    dv.save(path, 'WEBP', quality=88, method=6)
    report.append(('divider.webp', dv.size, os.path.getsize(path)))

    # ④ 按钮三态：1536 均分三行，逐行裁白后统一到同一画布（否则三态切换会跳）
    src = Image.open(os.path.join(SRC, '三态按钮底板.png')).convert('RGB')
    w, h = src.size
    names = ['btn-normal', 'btn-hover', 'btn-press']
    crops = []
    for i, name in enumerate(names):
        cell = src.crop((0, i * h // 3, w, (i + 1) * h // 3))
        cropped = trim_white(cell, pad=4)
        if cropped is None:
            sys.exit('按钮行是空的：' + name)
        crops.append((name, cropped))
    cw = max(c.width for _, c in crops)
    ch = max(c.height for _, c in crops)
    for name, cropped in crops:
        canvas = Image.new('RGBA', (cw, ch), (0, 0, 0, 0))
        canvas.paste(key_white(cropped), ((cw - cropped.width) // 2, (ch - cropped.height) // 2))
        # 显示尺寸只有约 150×40，1447 宽纯属浪费（三张 base64 要 240KB）
        target_w = 420
        canvas = canvas.resize((target_w, round(canvas.height * target_w / canvas.width)), Image.LANCZOS)
        path = os.path.join(OUT, name + '.webp')
        canvas.save(path, 'WEBP', quality=88, method=6)
        report.append((name + '.webp', canvas.size, os.path.getsize(path)))


    # ⑤ 空态小物：水晶球 —— 白底转透明，按显示尺寸出图
    #    牌叠那两张（cards-h / cards-v）已废弃：空态改成用 back.webp 现场叠三张，不吃图片
    smalls = [
        ('orb', '星尘水晶球.png', 200),
    ]
    for name, fname, target_w in smalls:
        src = Image.open(os.path.join(SRC, fname)).convert('RGB')
        cropped = trim_white(src, pad=6)
        if cropped is None:
            sys.exit('空态小物是空图：' + fname)
        keyed = key_white(cropped, lo=200, hi=242)
        w = min(target_w, keyed.width)
        keyed = keyed.resize((w, round(keyed.height * w / keyed.width)), Image.LANCZOS)
        path = os.path.join(OUT, name + '.webp')
        keyed.save(path, 'WEBP', quality=88, method=6)
        report.append((name + '.webp', keyed.size, os.path.getsize(path)))

    total = 0
    for name, size, b in report:
        total += b
        print('%-18s %-12s %6.1fKB' % (name, '%dx%d' % size, b / 1024))
    print('合计 %.1fKB -> %s' % (total / 1024, OUT))


if __name__ == '__main__':
    main()
