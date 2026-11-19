import os, json
from PIL import Image, ImageDraw
root = r"E:\UserData\dsh-workspace\_tools\sorceress-widget"
big = os.path.join(root, "assets", "cards", "big")
ver = os.path.join(root, "_verify")
deck = json.load(open(os.path.join(root, "data", "deck.json"), encoding="utf-8"))
cards = deck["cards"]
# 横幅区域（600x900 大图）：米色卷轴在 y≈735..830
BOX = (140, 725, 460, 840)
CW, CH = 320, 115
SCALE = 1.6
ids = [c["id"] for c in cards]
LOOKUP = {c["id"]: c for c in cards}
for part in range(3):
    chunk = ids[part*26:(part+1)*26]
    cols, rows = 4, 7
    w = int(CW*SCALE); h = int(CH*SCALE)
    sheet = Image.new("RGB", (cols*w + 10, rows*(h+18) + 10), (25, 25, 25))
    dr = ImageDraw.Draw(sheet)
    for i, cid in enumerate(chunk):
        im = Image.open(os.path.join(big, cid + ".webp")).convert("RGB")
        c = im.crop(BOX).resize((w, h), Image.LANCZOS)
        x = 5 + (i % cols) * w
        y = 5 + (i // cols) * (h + 18)
        sheet.paste(c, (x, y + 16))
        dr.text((x + 2, y + 3), cid + "  expect:" + LOOKUP[cid]["numeral"], fill=(255, 220, 120))
    p = os.path.join(ver, "banner-check-%d.png" % (part + 1))
    sheet.save(p)
    print(p, sheet.size, len(chunk))
