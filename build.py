# -*- coding: utf-8 -*-
"""Sorceress · 塔罗挂件构建

    python build.py                → 出 plugin/client.js + 把 assets/ data/ 镜像进 plugin/
    python build.py --no-assets    → 只出 client.js，不镜像（改前端时快）

做的事：
  ① 把 8 张立绘内联成 data URI（挂件必须离线可用，不能依赖路由去取自己的立绘）
  ② 注入 src/hitboxes.json（每个姿态的可点击轮廓）与 src/layout.json（几何常量）
  ③ 版本号从 plugin/package.json 盖进模板，末尾校验没有残留占位符
  ④ 把 assets/ 与 data/ 镜像进 plugin/（npm pack 只能打到包目录里的东西）

牌面 78×2 张不内联：由 index.js 的 /srs/cards 前缀路由按需发，带 immutable 缓存头。
"""
import base64
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, "src", "client.template.js")
SRC_HIT = os.path.join(ROOT, "src", "hitboxes.json")
SRC_LAYOUT = os.path.join(ROOT, "src", "layout.json")
SRC_TOK = os.path.join(ROOT, "src", "design_tokens.json")
ASSETS = os.path.join(ROOT, "assets")
DATA = os.path.join(ROOT, "data")
PLUGIN = os.path.join(ROOT, "plugin")
PKG = os.path.join(PLUGIN, "package.json")
OUT_DSH = os.path.join(PLUGIN, "client.js")

# 姿态 → 立绘文件（assets/sorceress/ 下）
TOKENS = {
    "__POSE_IDLE_A__": "sorceress-idle-a.webp",
    "__POSE_IDLE_B__": "sorceress-idle-b.webp",
    "__POSE_THINK__": "sorceress-think.webp",
    "__POSE_DAZED__": "sorceress-dazed.webp",
    "__POSE_SHUFFLE__": "sorceress-shuffle.webp",
    "__POSE_SPREAD__": "sorceress-spread.webp",
    "__POSE_DRAW__": "sorceress-draw.webp",
    "__POSE_FLIP__": "sorceress-flip.webp",
    "__POSE_SMILE__": "sorceress-smile.webp",
    "__POSE_SLEEP__": "sorceress-sleep.webp",
    "__POSE_SMIRK__": "sorceress-smirk.webp",
    "__POSE_FLY__": "sorceress-fly.webp",
    "__POSE_READING__": "sorceress-reading.webp",
    "__POSE_ANNOYED__": "sorceress-annoyed.webp",
    "__POSE_BYE__": "sorceress-bye.webp",
    "__POSE_REST_HANDS__": "sorceress-rest-hands.webp",
    "__POSE_LOOK_ASIDE__": "sorceress-look-aside.webp",
    "__POSE_HOLD_CUP__": "sorceress-hold-cup.webp",
    "__POSE_STRETCH__": "sorceress-stretch.webp",
    # UI 素材（assets/ui/，全部内联：总量约 300KB，比走路由省一次宿主重启）
    "__UI_BG__": "ui/panel-bg.webp",
    "__UI_DIVIDER__": "ui/divider.webp",
    "__UI_CORNER_TL__": "ui/corner-tl.webp",
    "__UI_CORNER_TR__": "ui/corner-tr.webp",
    "__UI_CORNER_BL__": "ui/corner-bl.webp",
    "__UI_CORNER_BR__": "ui/corner-br.webp",
    "__UI_ORB__": "ui/orb.webp",
    # 音效（assets/sfx/，脚本合成，内联成 data URI）
    "__SFX_SHUFFLE__": "sfx/shuffle.mp3",
    "__SFX_FLIP__": "sfx/flip.mp3",
    "__SFX_DRAW__": "sfx/draw.mp3",
    "__SFX_BELL__": "sfx/bell.mp3",
    "__SFX_COLLECT__": "sfx/collect.mp3",
    # 气泡播报三路（与塔罗五路分家）：每轮记账 / 等你答话 / 等你授权
    "__SFX_COST__": "sfx/cost.mp3",
    "__SFX_ASK__": "sfx/ask.mp3",
    "__SFX_APPROVE__": "sfx/approve.mp3",
}

POSE_RE = re.compile(r"['\"]?([\w-]+)['\"]?\s*:\s*'(__POSE_[A-Z0-9_]+__)'")

# 只内联进 client.js、不镜像进 plugin/assets 的图（关于页的两张码）
# 放 docs/about-assets 下：它们是 content 不是插件运行时素材，复制一份到包里反而多占体积
EXTRA_INLINE = {
    "__ABOUT_QQ__": os.path.join("docs", "about-assets", "qq-group.webp"),
    "__ABOUT_TIP__": os.path.join("docs", "about-assets", "tip.webp"),
}


def fail(msg):
    raise SystemExit("❌ " + msg)


def atomic_write(path, text):
    """先写临时文件、fsync，再 os.replace 顶上去：构建中途崩掉不会留下半截 client.js。"""
    d = os.path.dirname(os.path.abspath(path))
    os.makedirs(d, exist_ok=True)
    tmp = "%s.%d.%s.tmp" % (path, os.getpid(), os.urandom(4).hex())
    try:
        with open(tmp, "w", encoding="utf-8", newline="\n") as f:
            f.write(text)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, path)
    except BaseException:
        try:
            os.remove(tmp)
        except OSError:
            pass
        raise


def read_version():
    if not os.path.exists(PKG):
        fail("缺 plugin/package.json")
    pkg = json.load(open(PKG, encoding="utf-8"))
    version = str(pkg.get("version") or "").strip()
    if not re.match(r"^\d+\.\d+\.\d+$", version):
        fail("plugin/package.json 的 version 不是 x.y.z：" + version)
    return version


def load_template():
    template = open(SRC, encoding="utf-8").read()
    poses = [m.group(1) for m in POSE_RE.finditer(template)]
    if len(set(poses)) != len(poses):
        fail("模板里姿态名有重复：" + ", ".join(poses))

    sizes = {}
    for token, name in TOKENS.items():
        path = os.path.join(ASSETS, name) if (name.startswith("ui/") or name.startswith("sfx/")) else os.path.join(ASSETS, "sorceress", name)
        if not os.path.exists(path):
            fail("缺立绘：" + name)
        raw = open(path, "rb").read()
        if not raw:
            fail("立绘是空文件：" + name)
        if token not in template:
            fail("模板里找不到占位符 " + token)
        mime = "audio/mpeg" if name.endswith(".mp3") else "image/webp"
        template = template.replace(token, "data:" + mime + ";base64," + base64.b64encode(raw).decode("ascii"))
        sizes[name] = len(raw)

    # 关于页的两张码：只内联，不镜像
    for token, rel in EXTRA_INLINE.items():
        path = os.path.join(ROOT, rel)
        if not os.path.exists(path):
            fail("缺关于页素材：" + rel)
        raw = open(path, "rb").read()
        if not raw:
            fail("关于页素材是空文件：" + rel)
        if token not in template:
            fail("模板里找不到占位符 " + token)
        if rel.endswith(".webp"):
            mime = "image/webp"
        elif rel.endswith((".jpg", ".jpeg")):
            mime = "image/jpeg"
        else:
            mime = "image/png"
        template = template.replace(token, "data:" + mime + ";base64," + base64.b64encode(raw).decode("ascii"))
        sizes[rel] = len(raw)

    left = re.findall(r"__(?:POSE|ABOUT)_[A-Z0-9_]+__", template)
    if left:
        fail("还有没替换的占位符：" + ", ".join(left))

    template = inject_hitboxes(template, poses)
    template = inject_layout(template, poses)
    return template, sizes


def inject_hitboxes(template, poses):
    if not os.path.exists(SRC_HIT):
        fail("缺 src/hitboxes.json —— 先跑 python tools/make_hitboxes.py")
    boxes = json.load(open(SRC_HIT, encoding="utf-8"))
    missing = [p for p in poses if p not in boxes]
    if missing:
        fail("这些姿态没有点击轮廓（重跑 tools/make_hitboxes.py）：" + ", ".join(missing))
    if "__HIT_BOXES__" not in template:
        fail("模板里找不到 __HIT_BOXES__ 占位符")
    return template.replace("__HIT_BOXES__", json.dumps(boxes, ensure_ascii=False))


def inject_layout(template, poses):
    if not os.path.exists(SRC_LAYOUT):
        fail("缺 src/layout.json —— 几何常量的唯一真源没了")
    layout = json.load(open(SRC_LAYOUT, encoding="utf-8"))
    for key in ("rootW", "rootH", "originY", "headGap", "gearBase", "gearMargin", "poseFit"):
        if key not in layout:
            fail("src/layout.json 缺字段：" + key)
    layout = {k: v for k, v in layout.items() if not str(k).startswith("_")}
    unknown = [p for p in (layout.get("poseFit") or {}) if p not in poses]
    if unknown:
        fail("src/layout.json 的 poseFit 里有不存在的姿态：" + ", ".join(unknown))
    if "__LAYOUT__" not in template:
        fail("模板里找不到 __LAYOUT__ 占位符")
    return template.replace("__LAYOUT__", json.dumps(layout, ensure_ascii=False))


def stamp_version(text, version):
    if "__SRS_VERSION__" not in text:
        fail("模板里没有 __SRS_VERSION__（版本号必须从 package.json 来）")
    return text.replace("__SRS_VERSION__", version)


def mirror(src_dir, dst_dir):
    """把目录镜像过去，返回 (文件数, 字节数, 改动数, 清掉的孤儿数)。同大小同 mtime 的跳过，别每次都重写 5MB。

    2026-11-19 加「清孤儿」：原来只复制不删除，换素材会留残留 ——
    结果铃换源留下 `bell.mp3.old`、音景把「时钟 / 猫呼噜」换成「雷雨 / 鸟鸣」留下
    `amb-clock.mp3` / `amb-purr.mp3`，这些都被一起打进 npm 包（实测多出 6 个文件 / 372 KB）。
    """
    count = changed = 0
    total = 0
    want = set()
    for base, _dirs, files in os.walk(src_dir):
        for name in files:
            src = os.path.join(base, name)
            rel = os.path.relpath(src, src_dir)
            want.add(rel)
            dst = os.path.join(dst_dir, rel)
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            st = os.stat(src)
            total += st.st_size
            count += 1
            if os.path.exists(dst):
                dt = os.stat(dst)
                if dt.st_size == st.st_size and dt.st_mtime >= st.st_mtime:
                    continue
            shutil.copy2(src, dst)
            changed += 1
    removed = 0
    for base, _dirs, files in os.walk(dst_dir):
        for name in files:
            path = os.path.join(base, name)
            rel = os.path.relpath(path, dst_dir)
            if rel not in want:
                os.remove(path)
                removed += 1
    return count, total, changed, removed


def inject_data(template):
    """把 deck.json / tarot.json 内联进产物。

    立项书 §5 要求「一切数据内置」，牌序与判词都是静态数据：
    内联之后面板不依赖任何路由，改文案只需重载页面（不必重启宿主）。
    牌面图太大不内联，仍走 /srs/cards 前缀路由。
    """
    for token, name in (("__DECK_JSON__", "deck.json"), ("__TAROT_JSON__", "tarot.json"), ("__HORO_JSON__", "horoscope.json"), ("__EMPATHY_JSON__", "empathy.json")):
        path = os.path.join(DATA, name)
        if not os.path.exists(path):
            fail("缺数据文件：" + name)
        raw = open(path, encoding="utf-8").read()
        check = json.loads(raw)  # 坏 JSON 不进产物
        if not isinstance(check, dict):
            fail(name + " 不是对象")
        body = json.dumps(check, ensure_ascii=False, separators=(",", ":"))
        if token not in template:
            fail("模板里找不到 " + token)
        template = template.replace(token, body)
        if name == "tarot.json":
            check_minor(check)
    left = re.findall(r"__[A-Z]+_JSON__", template)
    if left:
        fail("还有没替换的数据占位符：" + ", ".join(left))
    return template


def check_minor(tarot):
    """小阿卡纳逐张精写的守卫（2026-11-18）。

    56 张按 id 全覆盖、正逆各 3 句。缺一条就判红 —— 否则某张静默退回三层合成，
    界面上看着一样、读起来同质，只有翻到那一张才发现。
    """
    minor = tarot.get("minor") or {}
    deck_path = os.path.join(DATA, "deck.json")
    deck = json.loads(open(deck_path, encoding="utf-8").read())
    ids = {c["id"] for c in deck.get("cards") or [] if c.get("kind") == "minor"}
    if not minor:
        fail("tarot.json 缺 minor 字段（小阿卡纳逐张文案）")
    got = set(minor)
    if got != ids:
        fail("minor 键集与 deck 的小阿卡纳对不上：多 %s / 少 %s"
             % (sorted(got - ids), sorted(ids - got)))
    for key, val in minor.items():
        for side in ("up", "rev"):
            lines = val.get(side) or []
            if len(lines) != 3:
                fail("minor[%s].%s 不是 3 句（实 %d）" % (key, side, len(lines)))
            if any(not str(x).strip() for x in lines):
                fail("minor[%s].%s 有空句" % (key, side))


def inject_tokens(template):
    """把 src/design_tokens.json 注入 __DESIGN_TOKENS__。

    纪律来自 塔罗牌-月亮/build_card.py：色板 / 字号阶梯 / 间距档位只能有一个真源，
    模板里不许再出现散落的 hex。R40 判的是「视觉系统有没有被离散化并落进文件」，
    这条链就是它的落地：json → build.py → client.js 里的 CSS 变量。
    """
    if not os.path.exists(SRC_TOK):
        fail("缺 src/design_tokens.json —— 色板/字号/间距的唯一真源没了")
    tok = json.load(open(SRC_TOK, encoding="utf-8"))
    for key in ("colors", "fonts", "space"):
        if not tok.get(key):
            fail("design_tokens.json 缺 " + key + " 段")
    if not (3 <= len(tok["fonts"]) <= 7):
        fail("design_tokens.json 的字号阶梯应为 3–7 档，现在 %d 档" % len(tok["fonts"]))
    if not (2 <= len(tok["space"]) <= 5):
        fail("design_tokens.json 的间距应为 2–5 档，现在 %d 档" % len(tok["space"]))
    f = [float(x) for x in tok["fonts"]]
    if min(f) > 0 and max(f) / min(f) < 2.5:
        fail("design_tokens.json 字号 max/min=%.2f < 2.5，没有断崖＝没有层级" % (max(f) / min(f)))
    bw = {"#000000", "#ffffff"}
    pure = [c for c in tok["colors"].values() if str(c).strip().lower() in bw]
    if pure:
        fail("design_tokens.json 用了纯黑/纯白：" + ", ".join(pure))
    if "__DESIGN_TOKENS__" not in template:
        fail("模板里找不到 __DESIGN_TOKENS__ 占位符")
    return template.replace("__DESIGN_TOKENS__", json.dumps(tok, ensure_ascii=False))


def syntax_check(path):
    """build 只做字符串替换，写坏了它不报错 —— 让 Node 真解析一遍再落盘。

    2026-11-17 踩到：CSS 数组里一行注释少了个收尾引号，
    `build.py` 照样输出「成功」，真机挂件整个不出现（.srs-root 都没有）。
    """
    node = shutil.which("node")
    if not node:
        print("⚠ 没找到 node，跳过语法检查")
        return
    with open(path, encoding="utf-8") as f:
        r = subprocess.run([node, "--input-type=module", "--check"],
                           stdin=f, capture_output=True, text=True)
    if r.returncode != 0:
        fail("产物语法没过（Node 解析失败）：\n" + (r.stderr or "")[:2000])


def main(argv):
    no_assets = "--no-assets" in argv
    version = read_version()
    template, sizes = load_template()
    template = inject_tokens(template)
    template = inject_data(template)
    text = stamp_version(template, version)
    atomic_write(OUT_DSH, text)
    syntax_check(OUT_DSH)

    report = {
        "version": version,
        "client": OUT_DSH,
        "clientKB": round(os.path.getsize(OUT_DSH) / 1024, 1),
        "poses": len([k for k in TOKENS if k.startswith("__POSE_")]),
        "inlineKB": round(sum(sizes.values()) / 1024, 1),
        "sha256": hashlib.sha256(text.encode("utf-8")).hexdigest()[:16],
    }
    if not no_assets:
        n1, b1, c1, r1 = mirror(ASSETS, os.path.join(PLUGIN, "assets"))
        n2, b2, c2, r2 = mirror(DATA, os.path.join(PLUGIN, "data"))
        report["assets"] = {"files": n1 + n2, "MB": round((b1 + b2) / 1048576, 2),
                            "copied": c1 + c2, "pruned": r1 + r2}
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main(sys.argv[1:])
