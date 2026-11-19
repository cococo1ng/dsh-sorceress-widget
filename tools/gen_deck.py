"""生成 data/deck.json —— 78 张牌的固定牌序、花色、编号与素材映射

规则（立项书 §2 编号坑）：
  - 大阿卡纳：文件序号 == 牌义序号 0–21，牌面印阿拉伯数字
  - 小阿卡纳：文件序号 01=Ace / 02–10=数字 / 11=侍从 / 12=骑士 / 13=王后 / 14=国王，
              牌面印罗马数字 I–XIV（宝剑九 = IX）
  - 映射表进 JSON，运行时不许从图 OCR

用法：python _tools/sorceress-widget/tools/gen_deck.py
"""
import json
import os
import sys

SRC = r'D:\Users\Administrator\Desktop\统一版式塔罗牌'
ROOT = r'E:\UserData\dsh-workspace\_tools\sorceress-widget'
OUT = os.path.join(ROOT, 'data', 'deck.json')
DATA_VERSION = '2026.11.17.1'

MAJORS = [
    (0, '愚者'), (1, '魔术师'), (2, '女祭司'), (3, '皇后'), (4, '皇帝'), (5, '教皇'),
    (6, '恋人'), (7, '战车'), (8, '力量'), (9, '隐者'), (10, '命运之轮'), (11, '正义'),
    (12, '倒吊人'), (13, '死神'), (14, '节制'), (15, '恶魔'), (16, '高塔'),
    (17, '星星'), (18, '月亮'), (19, '太阳'), (20, '审判'), (21, '世界'),
]

SUITS = [
    ('wands', '权杖', '火', ['行动', '热情', '创造', '意志']),
    ('cups', '圣杯', '水', ['情感', '关系', '直觉', '滋养']),
    ('swords', '宝剑', '风', ['思维', '冲突', '沟通', '决断']),
    ('pentacles', '星币', '土', ['现实', '金钱', '身体', '积累']),
]

RANKS = [
    (1, 'ace', '首牌'),
    (2, '2', '二'), (3, '3', '三'), (4, '4', '四'), (5, '5', '五'),
    (6, '6', '六'), (7, '7', '七'), (8, '8', '八'), (9, '9', '九'), (10, '10', '十'),
    (11, 'page', '侍从'), (12, 'knight', '骑士'), (13, 'queen', '王后'), (14, 'king', '国王'),
]

ROMAN = ['0', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X',
         'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX', 'XXI']

# 牌面横幅实际印的字（2026-11-17 逐张抽样核实，覆盖 16 张）：
#   大阿卡纳 0 -> "0"；1–21 -> 罗马 I–XXI
#   小阿卡纳 Ace -> "ACE"；2–10 -> 罗马 II–X；11–14 -> 中文 侍从/骑士/王后/国王
RANK_BANNER = {'page': '侍从', 'knight': '骑士', 'queen': '王后', 'king': '国王'}


def build():
    cards = []
    missing = []

    for num, name in MAJORS:
        fname = f'{num:02d}-{name}.png'
        rel = f'大阿卡纳/{fname}'
        if not os.path.exists(os.path.join(SRC, rel)):
            missing.append(rel)
        cid = f'major-{num:02d}'
        cards.append({
            'id': cid,
            'order': len(cards),
            'kind': 'major',
            'suit': 'major',
            'index': num,
            'number': num,
            'rank': None,
            'numeral': ROMAN[num],
            'name_zh': name,
            'src': rel,
            'big': f'cards/big/{cid}.webp',
            'thumb': f'cards/thumb/{cid}.webp',
        })

    for sid, suit_zh, element, keys in SUITS:
        for idx, rank, rank_zh in RANKS:
            fname = f'{idx:02d}-{suit_zh}{rank_zh}.png'
            rel = f'{suit_zh}/{fname}'
            if not os.path.exists(os.path.join(SRC, rel)):
                missing.append(rel)
            cid = f'{sid}-{idx:02d}'
            if rank == 'ace':
                banner = 'ACE'
            elif rank in RANK_BANNER:
                banner = RANK_BANNER[rank]
            else:
                banner = ROMAN[idx]
            cards.append({
                'id': cid,
                'order': len(cards),
                'kind': 'minor',
                'suit': sid,
                'index': idx,
                'number': idx,
                'rank': rank,
                'numeral': banner,
                'name_zh': f'{suit_zh}{rank_zh}',
                'src': rel,
                'big': f'cards/big/{cid}.webp',
                'thumb': f'cards/thumb/{cid}.webp',
            })

    doc = {
        'deckVersion': '1.0.0',
        'dataVersion': DATA_VERSION,
        'total': len(cards),
        'suits': [
            {'id': sid, 'name_zh': sz, 'element': el, 'keywords': kw}
            for sid, sz, el, kw in SUITS
        ],
        'ranks': [{'index': i, 'id': r, 'name_zh': rz} for i, r, rz in RANKS],
        'roman': {str(i): ROMAN[i] for i in range(1, 15)},
        'major_titles': {str(n): t for n, t in MAJORS},
        'cards': cards,
    }
    return doc, missing


def validate(doc):
    errs = []
    ids = [c['id'] for c in doc['cards']]
    if len(ids) != 78:
        errs.append(f'牌数 {len(ids)} != 78')
    if len(set(ids)) != 78:
        errs.append('id 有重复')
    if [c['order'] for c in doc['cards']] != list(range(78)):
        errs.append('order 不连续')
    majors = [c for c in doc['cards'] if c['kind'] == 'major']
    if len(majors) != 22:
        errs.append(f'大阿卡纳 {len(majors)} != 22')
    for sid, _, _, _ in SUITS:
        n = len([c for c in doc['cards'] if c['suit'] == sid])
        if n != 14:
            errs.append(f'{sid} 数量 {n} != 14')
    # 牌面横幅逐项核对（按 2026-11-17 实测规则）
    banner = {c['id']: c['numeral'] for c in doc['cards']}
    spots = {
        'major-00': '0', 'major-01': 'I', 'major-11': 'XI', 'major-15': 'XV',
        'major-18': 'XVIII', 'major-21': 'XXI',
        'wands-01': 'ACE', 'wands-02': 'II', 'cups-10': 'X',
        'swords-09': 'IX', 'wands-11': '侍从', 'swords-12': '骑士',
        'wands-13': '王后', 'pentacles-14': '国王',
    }
    for cid, want in spots.items():
        if banner.get(cid) != want:
            errs.append(f'{cid} 横幅 {banner.get(cid)} != {want}')
    for c in doc['cards']:
        if c['kind'] == 'major' and c['index'] >= 1 and not c['numeral'].isascii():
            errs.append(f"{c['id']} 大阿卡纳横幅应为罗马数字")
    # 名称拼接抽查
    spot = {c['id']: c['name_zh'] for c in doc['cards']}
    for cid, want in [('major-00', '愚者'), ('major-21', '世界'),
                      ('swords-09', '宝剑九'), ('wands-01', '权杖首牌'),
                      ('cups-11', '圣杯侍从'), ('pentacles-14', '星币国王')]:
        if spot.get(cid) != want:
            errs.append(f'{cid} 名称 {spot.get(cid)} != {want}')
    return errs


def main():
    doc, missing = build()
    errs = validate(doc)
    if missing:
        errs.append('缺源文件 %d 个：%s' % (len(missing), '; '.join(missing[:5])))
    if errs:
        print('FAIL')
        for e in errs:
            print(' -', e)
        sys.exit(1)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(doc, f, ensure_ascii=False, indent=2)
    kb = os.path.getsize(OUT) / 1024
    print(f'OK -> {OUT}  {kb:.1f}KB  cards={doc["total"]}  dataVersion={doc["dataVersion"]}')
    print('大阿卡纳 22 / 权杖 14 / 圣杯 14 / 宝剑 14 / 星币 14')
    for cid in ('major-00', 'swords-09', 'wands-11', 'cups-14'):
        c = next(x for x in doc['cards'] if x['id'] == cid)
        print(f'  {c["id"]:12s} order={c["order"]:2d} numeral={c["numeral"]:4s} {c["name_zh"]}  src={c["src"]}')


if __name__ == '__main__':
    main()
