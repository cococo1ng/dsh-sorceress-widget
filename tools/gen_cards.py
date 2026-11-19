"""牌面派生：78 张 PNG → 大图 600×900 webp + 缩略 240×360 webp，另出牌背 back.webp

输入：D:\\Users\\Administrator\\Desktop\\统一版式塔罗牌\\
依赖：data/deck.json 里的 cards[].src
输出：assets/cards/big/*.webp  assets/cards/thumb/*.webp  assets/cards/back.webp
用法：python _tools/sorceress-widget/tools/gen_cards.py
"""
import json
import os
import sys
import time
from PIL import Image

SRC = r'D:\Users\Administrator\Desktop\统一版式塔罗牌'
ROOT = r'E:\UserData\dsh-workspace\_tools\sorceress-widget'
DECK = os.path.join(ROOT, 'data', 'deck.json')
CARDS = os.path.join(ROOT, 'assets', 'cards')
BIG = os.path.join(CARDS, 'big')
THUMB = os.path.join(CARDS, 'thumb')
BACK_SRC = os.path.join(SRC, '新牌背-深蓝玫瑰.png')

BIG_SIZE = (600, 900)
THUMB_SIZE = (200, 300)
Q_BIG = 66
Q_THUMB = 76


def save_webp(im, dst, quality):
    im.save(dst, 'WEBP', quality=quality, method=6)
    return os.path.getsize(dst)


def main():
    t0 = time.time()
    os.makedirs(BIG, exist_ok=True)
    os.makedirs(THUMB, exist_ok=True)
    deck = json.load(open(DECK, encoding='utf-8'))
    cards = deck['cards']

    miss = [c['src'] for c in cards if not os.path.exists(os.path.join(SRC, c['src']))]
    if miss:
        print('FAIL 缺源文件', miss[:5])
        sys.exit(1)

    tot_big = tot_thumb = 0
    bad = []
    for i, c in enumerate(cards, 1):
        im = Image.open(os.path.join(SRC, c['src'])).convert('RGB')
        if im.size[0] * 3 != im.size[1] * 2:
            bad.append(f"{c['id']} 源比例 {im.size} 不是 2:3")
        b = save_webp(im.resize(BIG_SIZE, Image.LANCZOS), os.path.join(BIG, c['id'] + '.webp'), Q_BIG)
        t = save_webp(im.resize(THUMB_SIZE, Image.LANCZOS), os.path.join(THUMB, c['id'] + '.webp'), Q_THUMB)
        tot_big += b
        tot_thumb += t
        if i % 13 == 0:
            print(f'  {i}/78  big={tot_big/1048576:.2f}MB thumb={tot_thumb/1048576:.2f}MB', flush=True)

    # 牌背
    back = Image.open(BACK_SRC).convert('RGB')
    back_kb = save_webp(back.resize(BIG_SIZE, Image.LANCZOS), os.path.join(CARDS, 'back.webp'), Q_BIG)

    # 校验
    errs = list(bad)
    for sub, size in ((BIG, BIG_SIZE), (THUMB, THUMB_SIZE)):
        files = [f for f in os.listdir(sub) if f.endswith('.webp')]
        if len(files) != 78:
            errs.append(f'{sub} 文件数 {len(files)} != 78')
        for f in files[:0]:
            pass
    for c in cards:
        for sub, size in ((BIG, BIG_SIZE), (THUMB, THUMB_SIZE)):
            p = os.path.join(sub, c['id'] + '.webp')
            if not os.path.exists(p):
                errs.append(f'缺 {p}')
                continue
            if os.path.getsize(p) < 2000:
                errs.append(f'{os.path.basename(p)} 体积异常 {os.path.getsize(p)}B')
        # 尺寸抽查（每 10 张）
        if c['order'] % 10 == 0:
            for sub, size in ((BIG, BIG_SIZE), (THUMB, THUMB_SIZE)):
                with Image.open(os.path.join(sub, c['id'] + '.webp')) as im:
                    if im.size != size:
                        errs.append(f'{c["id"]} {sub} 尺寸 {im.size} != {size}')

    if errs:
        print('FAIL')
        for e in errs:
            print(' -', e)
        sys.exit(1)

    print(f'\nOK  big 78 × {BIG_SIZE} = {tot_big/1048576:.2f}MB')
    print(f'    thumb 78 × {THUMB_SIZE} = {tot_thumb/1048576:.2f}MB')
    print(f'    back.webp {BIG_SIZE} = {back_kb/1024:.1f}KB')
    print(f'    合计 {(tot_big+tot_thumb+back_kb)/1048576:.2f}MB  （预算 4.8MB）')
    print(f'    平均 大图 {tot_big/78/1024:.1f}KB / 缩略 {tot_thumb/78/1024:.1f}KB')
    print(f'    耗时 {time.time()-t0:.1f}s')


if __name__ == '__main__':
    main()
