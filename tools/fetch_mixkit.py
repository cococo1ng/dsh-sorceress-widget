# -*- coding: utf-8 -*-
"""从 Mixkit 取真实音效替换/扩充插件音轨（Mixkit Free License：可商用、免署名）。

- SFX 5 路（洗牌/抽牌/翻牌/收牌/结果铃）＋播报 3 路（记账/答话/授权）：取 preview mp3 → 裁静音 →
  峰值归一到 −4 dBFS → 96kbps
- 环境音景 8 套（雨/壁炉/夜风/翻书/夜虫/海浪/时钟/猫呼噜）：取 preview → 截 ≤24s → 尾淡首做无缝环 →
  RMS 归一到 −20 dBFS → 56kbps
输出：assets/sfx/<name>.mp3（覆盖同名文件）

用法：
  python tools/fetch_mixkit.py                      # 全量重下（16 路）
  python tools/fetch_mixkit.py --only bell,cost     # 只换指定的几路（换音色时用这个，别把音景一起重下）

短音效默认按「柔音」处理：loudnorm −18 LUFS、6kHz 以上轻微压低 2dB（0.48.1 起，
原来 −16 LUFS 那版听感偏亮，主人说结果铃与记账声有嘈杂感）。
"""
import os
import subprocess
import sys
import tempfile
import wave

import numpy as np
import requests

SR = 44100
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets", "sfx")
FFMPEG = r"D:\Tools\ffmpeg\ffmpeg.exe"
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131 Safari/537.36"}

# name → (mixkit id, 中文名/用途, 类型)
PICKS = {
    # 环境音景（循环）
    "amb-rain": (2394, "Rain long loop · 雨"),
    "amb-fire": (1330, "Campfire crackles · 壁炉"),
    "amb-wind": (2658, "Wind blowing ambience · 夜风"),
    "amb-pages": (1099, "Browsing book by pages · 翻书"),
    "amb-night": (1789, "Summer night crickets loop · 夜虫"),
    "amb-sea": (1196, "Sea waves loop · 海浪"),
    "amb-storm": (2415, "Calm thunderstorm in the jungle · 丛林雷雨"),
    "amb-birds": (2472, "Morning birds · 清晨鸟鸣"),
    # 塔罗五路
    "shuffle": (3175, "Thin metal card deck shuffle · 洗牌"),
    "draw": (2002, "Poker card flick · 抽牌"),
    "flip": (1104, "Page turn single · 翻牌"),
    "collect": (1103, "Stiff paper book paging · 收牌"),
    "bell": (931, "Service bell · 结果铃（服务铃一声叮）"),
    # 播报三路
    "cost": (3000, "Liquid bubble · 每轮记账（水泡轻点）"),
    "ask": (2820, "Magic marimba · 等你答话（木琴）"),
    "approve": (2332, "Nylon guitar single note · 等你授权（尼龙弦单音）"),
}

AMB_KEYS = [k for k in PICKS if k.startswith("amb-")]

# 短音效时长上限（秒）：铃与木琴留余韵，记账只留一下点
SHORT_CAP = {"bell": 0.9, "cost": 1.2, "ask": 2.4, "approve": 2.2}


def download(sid, dst):
    # 2026-11-18：固定走 preview.mp3，失败重试两次再退 .wav。
    # 原来 preview 偶尔超时就落到 .wav，两个源内容不同（同一条 bell 出过 0.56s 与 0.86s 两种成品），
    # 同一参数两次生成不一致 —— 素材必须可复现。
    for attempt in range(2):
        url = "https://assets.mixkit.co/active_storage/sfx/%d/%d-preview.mp3" % (sid, sid)
        try:
            r = requests.get(url, headers=UA, timeout=120)
            if r.status_code == 200 and len(r.content) > 5000:
                open(dst, "wb").write(r.content)
                return len(r.content)
        except Exception:
            continue
    try:
        url = "https://assets.mixkit.co/active_storage/sfx/%d/%d.wav" % (sid, sid)
        r = requests.get(url, headers=UA, timeout=120)
        if r.status_code == 200 and len(r.content) > 5000:
            open(dst, "wb").write(r.content)
            print("   ! preview 两次失败，退到 wav（成品可能与 preview 源不一致）")
            return len(r.content)
    except Exception:
        pass
    return 0


def decode(src):
    """任意音频 → mono float32 @44.1k"""
    wav = tempfile.mktemp(suffix=".wav")
    subprocess.run([FFMPEG, "-y", "-loglevel", "error", "-i", src, "-ac", "1", "-ar", str(SR), wav], check=True)
    with wave.open(wav, "rb") as w:
        frames = w.readframes(w.getnframes())
    os.remove(wav)
    a = np.frombuffer(frames, dtype="<i2").astype(np.float32) / 32768.0
    return a


def encode(data, dst, kbps, loud=-16.0, tp=-3.0, lra=8.0, soft=False, lowpass_hz=None, peak_norm=False):
    """写 wav → 一次 ffmpeg 过 loudnorm（EBU R128）+ 峰值限制 → mp3。

    单靠「按 RMS 缩放」会被瞬态峰值带偏：实测壁炉 RMS 掉到 −51 dBFS、雨 −31，
    同一堆音景音量差出 20 dB。loudnorm 按感知响度归一，八套才在同一档。

    soft=True：再压一点 6kHz 以上（−2dB），去掉短音效的「齿音感」。
    """
    data = np.clip(data, -1, 1)
    pcm = (data * 32767).astype("<i2")
    wav = tempfile.mktemp(suffix=".wav")
    with wave.open(wav, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    # peak_norm 的素材已经在 numpy 里按峰值归一过，再过 alimiter 会把瞬态峰抹掉
    # （实测目标 −3dBFS，加了 alimiter 只剩 −7.3），所以 peak_norm 时不接任何动态处理。
    af = "anull" if peak_norm else "loudnorm=I=%.1f:TP=%.1f:LRA=%.1f,alimiter=limit=0.9" % (loud, tp, lra)
    if soft:
        af += ",treble=g=-2:f=6000:width_type=o:width=2"
    if lowpass_hz:                      # 真低通（2 极点 −12dB/oct）：treble 是 shelf，压不住 4kHz 以上
        af += ",lowpass=f=%d:poles=2,highpass=f=200:poles=1" % lowpass_hz
    subprocess.run([FFMPEG, "-y", "-loglevel", "error", "-i", wav, "-af", af,
                    "-ac", "1", "-ar", str(SR), "-b:a", "%dk" % kbps, dst], check=True)
    os.remove(wav)


def trim_silence(a, thresh=0.008, pad=0.04):
    env = np.abs(a)
    idx = np.where(env > thresh * env.max())[0]
    if not len(idx):
        return a
    s = max(0, idx[0] - int(pad * SR))
    e = min(len(a), idx[-1] + int(pad * SR))
    return a[s:e]


def fade_edges(a, ms=6):
    n = int(SR * ms / 1000)
    if n * 2 >= len(a):
        return a
    ramp = np.linspace(0, 1, n)
    a = a.copy()
    a[:n] *= ramp
    a[-n:] *= ramp[::-1]
    return a


def prefilter(data, lowpass_hz):
    """先过滤波、把结果读回 numpy，再交给后面按峰值归一。

    为什么要两遍：低通会削掉敲击类音效的高频瞬态峰，实测同一条服务铃
    滤波前峰值 −3dBFS、滤波后只剩 −8.8dBFS；先滤波再归一，峰值才准。
    """
    t1 = tempfile.mktemp(suffix=".wav")
    t2 = tempfile.mktemp(suffix=".wav")
    pcm = (np.clip(data, -1, 1) * 32767).astype("<i2")
    with wave.open(t1, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    subprocess.run([FFMPEG, "-y", "-loglevel", "error", "-i", t1,
                    "-af", "lowpass=f=%d:poles=2,highpass=f=200:poles=1" % lowpass_hz,
                    "-ac", "1", "-ar", str(SR), t2], check=True)
    out = decode(t2)
    for p in (t1, t2):
        try:
            os.remove(p)
        except OSError:
            pass
    return out


def loopify(a, fade=1.2):
    n = int(SR * fade)
    if n * 2 >= len(a):
        n = max(1, len(a) // 5)
    ramp = np.linspace(0, 1, n)
    head, tail = a[:n].copy(), a[-n:].copy()
    out = a[:-n].copy()
    out[:n] = head * ramp + tail * (1 - ramp)
    return out


def norm_peak(a, target):
    peak = float(np.abs(a).max()) or 1.0
    return a / peak * target


def norm_rms(a, target_db=-20.0, peak_cap=0.55):
    rms = float(np.sqrt(np.mean(a ** 2))) or 1e-6
    a = a * (10 ** (target_db / 20.0) / rms)
    peak = float(np.abs(a).max()) or 1e-6
    if peak > peak_cap:
        a = a / peak * peak_cap
    return a


def main():
    only = None
    if "--only" in sys.argv:
        i = sys.argv.index("--only")
        only = [x.strip() for x in (sys.argv[i + 1] if i + 1 < len(sys.argv) else "").split(",") if x.strip()]
    os.makedirs(OUT, exist_ok=True)
    tmp = tempfile.mkdtemp(prefix="mixkit-")
    total = 0
    for name, (sid, desc) in PICKS.items():
        if only and name not in only:
            continue
        raw = os.path.join(tmp, "%s.mp3" % name)
        size = download(sid, raw)
        if not size:
            print("!! 下载失败 %s (id %d)" % (name, sid))
            continue
        a = decode(raw)
        dur0 = len(a) / SR
        if name in AMB_KEYS:
            a = a[: int(24 * SR)]                       # 最长 24 秒，控体积
            # 源太短就自身拼接（接缝处先做短交叉淡化），再整体 loopify，避免 3 秒一循环
            while len(a) / SR < 20.0 and len(a) > 0:
                a = loopify(np.concatenate([a, a]), fade=min(0.8, len(a) / SR * 0.08))
                a = a[: int(24 * SR)]
            a = loopify(a, fade=min(1.5, len(a) / SR * 0.12))
            encode(a, os.path.join(OUT, name + ".mp3"), 56, loud=-23.0, tp=-4.0, lra=10.0)
        else:
            a = trim_silence(a)
            a = a[: int(SHORT_CAP.get(name, 3.0) * SR)]
            a = fade_edges(a, 6)
            # 2026-11-18：结果铃 919 → 931。919 是柔和钟 + countdown，拖尾 2.28s、谱重心 714Hz 偏闷；
            # 931 服务铃 0.9s、尾巴 0.20s，过 3kHz 低通后 centroid 3554 / hi4k 22.6%（亮而不刺）。
            # 0.9 秒的短音效 loudnorm 统计窗太短（实测峰值只到 −8dBFS，听感偏小），
            # bell 改成「先滤波 → 按峰值归一 → 不再动态处理」：0.708 ≈ −3dBFS，跟另外三路同档。
            peak_norm = name == "bell"
            lp = None
            if peak_norm:
                a = prefilter(a, 3000)
                a = fade_edges(a, 6)
                mx = float(np.abs(a).max()) or 1.0
                a = a / mx * 0.708
            encode(a, os.path.join(OUT, name + ".mp3"), 80, loud=-18.0, tp=-3.0, lra=6.0,
                   soft=True, lowpass_hz=lp, peak_norm=peak_norm)
        out_size = os.path.getsize(os.path.join(OUT, name + ".mp3"))
        total += out_size
        print("%-10s 源 %5.1fs 下载 %6.0fKB → 成品 %5.2fs %6.0fKB  %s"
              % (name, dur0, size / 1024, len(a) / SR, out_size / 1024, desc))
    print("合计 %.0fKB" % (total / 1024))


if __name__ == "__main__":
    main()
