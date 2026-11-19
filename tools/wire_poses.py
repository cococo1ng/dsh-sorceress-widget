# -*- coding: utf-8 -*-
"""一次性接线：把 4 张新站姿接进 POSES / POSE_LABEL / STAND_POSES / 预加载 / build 占位符 / hitboxes 表。

新姿势（0.54.0）：
  rest-hands 静候 · look-aside 远望 · hold-cup 捧杯 · stretch 伸腰
跑法：python tools/wire_poses.py（幂等：已经接过就跳过）
"""
import io
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent

NEW = [
    ("rest-hands", "静候", "REST_HANDS"),
    ("look-aside", "远望", "LOOK_ASIDE"),
    ("hold-cup", "捧杯", "HOLD_CUP"),
    ("stretch", "伸腰", "STRETCH"),
]


def patch(path: pathlib.Path, old: str, new: str, label: str) -> bool:
    t = path.read_text(encoding="utf-8")
    if new in t and old not in t:
        print("   跳过（已接）", label)
        return False
    if old not in t:
        raise SystemExit("❌ 找不到锚点：%s → %s" % (path.name, label))
    path.write_text(t.replace(old, new, 1), encoding="utf-8")
    print("   ✅", label)
    return True


def main() -> int:
    # 1) build.py 占位符表
    p = ROOT / "build.py"
    anchor = '    "__POSE_BYE__": "sorceress-bye.webp",\n'
    add = "".join('    "__POSE_%s__": "sorceress-%s.webp",\n' % (up, key) for key, _, up in NEW)
    patch(p, anchor, anchor + add, "build.py 占位符表")

    # 2) make_hitboxes.py 姿态表
    p = ROOT / "tools" / "make_hitboxes.py"
    anchor = '    "bye": "sorceress-bye.webp",\n'
    add = "".join('    "%s": "sorceress-%s.webp",\n' % (key, key) for key, _, _ in NEW)
    patch(p, anchor, anchor + add, "make_hitboxes.py 姿态表")

    # 3) 模板 POSES
    p = ROOT / "src" / "client.template.js"
    anchor = "      'bye': '__POSE_BYE__',\n"
    add = "".join("      '%s': '__POSE_%s__',\n" % (key, up) for key, _, up in NEW)
    patch(p, anchor, anchor + add, "模板 POSES")

    # 4) POSE_LABEL（中文名，配置页格子用）
    anchor = "      reading: '读牌', annoyed: '不高兴', bye: '告别',\n"
    add = "      'rest-hands': '静候', 'look-aside': '远望', 'hold-cup': '捧杯', stretch: '伸腰',\n"
    patch(p, anchor, anchor + add, "模板 POSE_LABEL")

    # 5) 站姿池
    anchor = "const STAND_POSES = ['idle-a', 'think', 'dazed', 'reading', 'smile', 'smirk', 'annoyed'];"
    new = ("const STAND_POSES = ['idle-a', 'rest-hands', 'think', 'look-aside', 'dazed',\n"
           "        'hold-cup', 'stretch', 'reading', 'smile', 'smirk', 'annoyed'];")
    patch(p, anchor, new, "模板 STAND_POSES（7 → 11 张）")

    # 6) 预加载顺序
    anchor = ("const order = ['idle-a', 'think', 'dazed', 'draw', 'flip', 'smile', 'shuffle', "
              "'spread', 'sleep', 'smirk', 'fly', 'reading', 'annoyed', 'bye'];")
    new = ("const order = ['idle-a', 'rest-hands', 'think', 'look-aside', 'dazed', 'hold-cup',\n"
           "          'stretch', 'draw', 'flip', 'smile', 'shuffle', 'spread', 'sleep', 'smirk',\n"
           "          'fly', 'reading', 'annoyed', 'bye'];")
    patch(p, anchor, new, "模板 预加载顺序")
    print("完成。接着跑：python tools/make_hitboxes.py && python build.py")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
