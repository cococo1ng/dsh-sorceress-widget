# -*- coding: utf-8 -*-
"""数据与素材完整性：牌库 / 牌义 / 共情 / 运势 / 素材文件 / 几何 / 设计令牌 / 镜像。
跑法：python tools/checks/data_integrity.py
"""
import hashlib
import json
import os
import re
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
DATA = os.path.join(ROOT, "data")
ASSETS = os.path.join(ROOT, "assets")
PLUGIN = os.path.join(ROOT, "plugin")
SRC = os.path.join(ROOT, "src")

fails = 0


def ok(name, cond, extra=None):
    global fails
    if cond:
        print("+ " + name)
    else:
        fails += 1
        print("X " + name + ("  -> " + repr(extra) if extra is not None else ""))


def load(p):
    with open(p, encoding="utf-8") as f:
        return json.load(f)


deck = load(os.path.join(DATA, "deck.json"))
tarot = load(os.path.join(DATA, "tarot.json"))
horo = load(os.path.join(DATA, "horoscope.json"))
emp = load(os.path.join(DATA, "empathy.json"))
cards = deck["cards"]

# ── 1. 牌库 ────────────────────────────────────────────────
ids = [c["id"] for c in cards]
ok("78 张", len(cards) == 78, len(cards))
ok("id 唯一", len(set(ids)) == 78)
ok("order 0..77 连续", sorted(c["order"] for c in cards) == list(range(78)))
major = [c for c in cards if c["kind"] == "major"]
minor = [c for c in cards if c["kind"] == "minor"]
ok("大阿卡纳 22 张、编号 0..21", len(major) == 22 and sorted(c["number"] for c in major) == list(range(22)))
ok("小阿卡纳 56 张", len(minor) == 56)
suits = {}
for c in minor:
    suits[c["suit"]] = suits.get(c["suit"], 0) + 1
ok("四花色各 14", suits == {"wands": 14, "cups": 14, "swords": 14, "pentacles": 14}, suits)
ranks = {}
for c in minor:
    ranks[c["rank"]] = ranks.get(c["rank"], 0) + 1
ok("每档位各 4 张", all(v == 4 for v in ranks.values()) and len(ranks) == 14, ranks)
ok("numeral / name_zh 都非空", all(c.get("numeral") and c.get("name_zh") for c in cards))
ok("big/thumb 路径与 id 一致", all(c["big"].endswith(c["id"] + ".webp") and c["thumb"].endswith(c["id"] + ".webp") for c in cards))
card_re = re.compile(r"^(?:big|thumb)/[a-z]+-\d{2}\.webp$")
ok("全部 id 能过宿主路由白名单", all(card_re.match(c["big"].split("cards/", 1)[1]) and card_re.match(c["thumb"].split("cards/", 1)[1]) for c in cards))

# ── 2. 牌义 ────────────────────────────────────────────────
ok("塔罗版本与牌库同源", tarot.get("dataVersion") == deck.get("dataVersion"), [tarot.get("dataVersion"), deck.get("dataVersion")])
major_t = tarot.get("major") or {}
minor_t = tarot.get("minor") or {}
ok("major 键集对齐", set(major_t) == {c["id"] for c in major}, [sorted(set(major_t) - {c["id"] for c in major}), sorted({c["id"] for c in major} - set(major_t))])
ok("minor 键集对齐", set(minor_t) == {c["id"] for c in minor})
bad = []
for key, row in list(major_t.items()) + list(minor_t.items()):
    for side in ("up", "rev"):
        lines = row.get(side) or []
        if len(lines) != 3 or any(not str(x).strip() for x in lines):
            bad.append((key, side, len(lines)))
    if not row.get("keywords"):
        bad.append((key, "keywords"))
ok("每张正逆各 3 句、关键词非空", not bad, bad[:6])
same = [k for k, v in list(major_t.items()) + list(minor_t.items()) if v.get("up") == v.get("rev")]
ok("正逆不是同一段话", not same, same[:5])
ok("minorTemplate 兜底表在位", all(k in (tarot.get("minorTemplate") or {}) for k in ("ranks", "suits", "advice")))
ok("小阿卡纳句数 = 56×6", sum(len(v["up"]) + len(v["rev"]) for v in minor_t.values()) == 336)
ok("大阿卡纳句数 = 22×6", sum(len(v["up"]) + len(v["rev"]) for v in major_t.values()) == 132)

# ── 3. 共情句 ──────────────────────────────────────────────
lines = emp.get("lines") or {}
ok("共情句覆盖 78 张", set(lines) == set(ids), [len(lines), len(set(ids) - set(lines))])
ok("没有空句", all(str(v).strip() for v in lines.values()))

# ── 4. 运势 ────────────────────────────────────────────────
signs = horo.get("signs") or []
sign_ids = [s["id"] for s in signs]
expect = ["aries", "taurus", "gemini", "cancer", "leo", "virgo", "libra", "scorpio", "sagittarius", "capricorn", "aquarius", "pisces"]
ok("12 星座且顺序是 Aries→Pisces（月亮星座按黄经 0° 索引）", sign_ids == expect, sign_ids)
ok("星座字段齐全", all(all(s.get(k) for k in ("name", "range", "element", "ruler", "glyph")) for s in signs))
ok("四元素合法", all(s["element"] in ("火", "土", "风", "水") for s in signs), [s["element"] for s in signs])
core = horo.get("core") or {}
ok("core 覆盖 12 星座", set(core) == set(sign_ids))
ok("每个星座四维都有话", all(all(str(core[s].get(k) or "").strip() for k in ("career", "love", "money", "body")) for s in sign_ids))
tone = horo.get("tone") or {}
ok("tone 四元素都有句子", set(tone) == {"火", "土", "风", "水"} and all(len(v) >= 3 for v in tone.values()), {k: len(v) for k, v in tone.items()})
phase = horo.get("phase") or []
ok("月相 8 档且都有名字与一句", len(phase) == 8 and all(p.get("name") and p.get("line") for p in phase))
adv = horo.get("advice") or {}
ok("宜忌各 >=2", len(adv.get("do") or []) >= 2 and len(adv.get("avoid") or []) >= 2, {k: len(adv.get(k) or []) for k in ("do", "avoid")})
lucky = horo.get("lucky") or {}
colors = lucky.get("colors") or []
ok("幸运色 >=3 且是 [名字, #hex]", len(colors) >= 3 and all(len(c) == 2 and re.match(r"^#[0-9A-Fa-f]{6}$", c[1]) for c in colors), colors)
ok("幸运数字 >=3", len(lucky.get("numbers") or []) >= 3)
ok("幸运时段 >=2", len(lucky.get("slots") or []) >= 2)
ok("女巫话 >=3", len(horo.get("witch") or []) >= 3)
ok("dataVersion 在（今日卡种子用它）", bool(horo.get("dataVersion")))

# ── 5. 素材文件 ────────────────────────────────────────────
def count(d, ext=None):
    if not os.path.isdir(d):
        return 0
    return len([f for f in os.listdir(d) if (ext is None or f.endswith(ext))])


carddir = os.path.join(ASSETS, "cards")
ok("大图 78", count(os.path.join(carddir, "big"), ".webp") == 78)
ok("缩略 78", count(os.path.join(carddir, "thumb"), ".webp") == 78)
ok("牌背在", os.path.exists(os.path.join(carddir, "back.webp")))
ok("每张牌两套图都在", all(
    os.path.exists(os.path.join(carddir, "big", c["id"] + ".webp")) and
    os.path.exists(os.path.join(carddir, "thumb", c["id"] + ".webp")) for c in cards))

poses_dir = os.path.join(ASSETS, "sorceress")
pose_files = [f for f in os.listdir(poses_dir) if f.endswith(".webp")]
ok("立绘 18 张", len(pose_files) == 18, len(pose_files))
ok("UI 素材 8 件", count(os.path.join(ASSETS, "ui"), ".webp") == 8, count(os.path.join(ASSETS, "ui"), ".webp"))
amb = sorted(f for f in os.listdir(os.path.join(ASSETS, "sfx")) if f.startswith("amb-"))
ok("音景 8 路", len(amb) == 8, amb)

# 模板里声明的 pose / sfx / ui 是否都有文件
tpl = open(os.path.join(SRC, "client.template.js"), encoding="utf-8").read()
pose_tokens = re.findall(r"'__POSE_([A-Z0-9_]+)__'", tpl)
ok("模板声明 18 个立绘占位符", len(pose_tokens) == 18, len(pose_tokens))
sfx_tokens = re.findall(r"'__SFX_([A-Z0-9_]+)__'", tpl)
ok("模板声明 8 路一次性音效", len(sfx_tokens) == 8, sfx_tokens)
sfx_names = [t.lower() + ".mp3" for t in sfx_tokens]
ok("一次性音效文件都在", all(os.path.exists(os.path.join(ASSETS, "sfx", n)) for n in sfx_names), [n for n in sfx_names if not os.path.exists(os.path.join(ASSETS, "sfx", n))])
ui_tokens = re.findall(r"'__UI_([A-Z0-9_]+)__'", tpl)
ok("UI 占位符 8 个", len(ui_tokens) == 8, ui_tokens)

# 音景八路与宿主白名单一致
host = open(os.path.join(PLUGIN, "index.js"), encoding="utf-8").read()
amb_set = set(re.findall(r"'(amb-[a-z]+)'", host))
ok("宿主音景白名单 8 路且与文件同名", amb_set == {f[:-4] for f in amb}, [sorted(amb_set), amb])

# ── 6. 几何与热区 ──────────────────────────────────────────
hit = load(os.path.join(SRC, "hitboxes.json"))
layout = load(os.path.join(SRC, "layout.json"))
pose_keys = [t.lower().replace("_", "-") for t in pose_tokens]
ok("每个姿态都有热区", set(hit) >= set(pose_keys), [p for p in pose_keys if p not in hit])
ok("热区数值合法", all(0 <= v <= 1 for h in hit.values() for v in h["box"]) and all(h["ar"] > 0 for h in hit.values()))
required = ("rootW", "rootH", "originY", "headGap", "gearBase", "gearMargin", "poseFit")
ok("layout 字段齐全", all(k in layout for k in required), [k for k in required if k not in layout])
ok("layout.poseFit 只含已有姿态", set(layout.get("poseFit") or {}) <= set(pose_keys), set(layout.get("poseFit") or {}) - set(pose_keys))

# ── 7. 设计令牌（与 build.py 守卫同口径）──────────────────
tok = load(os.path.join(SRC, "design_tokens.json"))
ok("令牌三段齐全", all(tok.get(k) for k in ("colors", "fonts", "space")))
ok("字号 3–7 档", 3 <= len(tok["fonts"]) <= 7, len(tok["fonts"]))
ok("间距 2–5 档", 2 <= len(tok["space"]) <= 5, len(tok["space"]))
f = [float(x) for x in tok["fonts"]]
ok("字号有断崖（max/min >= 2.5）", max(f) / min(f) >= 2.5, max(f) / min(f))
pure = [v for v in tok["colors"].values() if str(v).lower() in ("#000000", "#ffffff")]
ok("不用纯黑纯白", not pure, pure)

# 图标：三件同源、尺寸对齐、圆形透明底（四角 alpha=0）
from PIL import Image
for name, size in (("icon.png", (256, 256)), ("icon-256.png", (256, 256)), ("icon-128.png", (128, 128))):
    ip = os.path.join(PLUGIN, name)
    ok(name + " 存在", os.path.exists(ip))
    if os.path.exists(ip):
        im = Image.open(ip)
        ok(name + " 尺寸/通道", im.size == size and im.mode == "RGBA", (im.size, im.mode))
        alpha = im.split()[-1]
        ok(name + " 四角透明", all(alpha.getpixel(p) == 0 for p in ((0, 0), (size[0] - 1, 0), (0, size[1] - 1), (size[0] - 1, size[1] - 1))))
        ok(name + " 圆心不透明", alpha.getpixel((size[0] // 2, size[1] // 2)) > 200)

# ── 8. 镜像与产物 ──────────────────────────────────────────
def sha(p):
    with open(p, "rb") as f:
        return hashlib.sha256(f.read()).hexdigest()

for name in ("deck.json", "tarot.json", "horoscope.json", "empathy.json"):
    ok("plugin/data 镜像 = 源 " + name, sha(os.path.join(DATA, name)) == sha(os.path.join(PLUGIN, "data", name)))
ok("plugin/assets 牌数一致", count(os.path.join(PLUGIN, "assets", "cards", "big"), ".webp") == 78)

client = open(os.path.join(PLUGIN, "client.js"), encoding="utf-8").read()
version = load(os.path.join(PLUGIN, "package.json"))["version"]
ok("产物版本 = package.json", ("srs-style-" + version.replace(".", "_")) in client or version in client, version)
ok("18 张立绘已内联", client.count("data:image/webp;base64") >= 18 + 7, client.count("data:image/webp;base64"))
ok("8 路音效已内联", client.count("data:audio/mpeg;base64") == 8, client.count("data:audio/mpeg;base64"))
ok("产物不含未替换占位符", not re.search(r"__[A-Z_]+__", client))

# 宿主路由白名单与牌 id 对齐（大小写/位宽）
ok("宿主牌面白名单能匹配全部 id", all(card_re.match(c["big"].split("cards/", 1)[1]) for c in cards))

print("")
if fails:
    print("X %d 项不过" % fails)
    sys.exit(1)
print("数据完整性全绿")
