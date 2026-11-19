"""合成 6 路音效（不依赖任何素材、不联网）

  shuffle  洗牌：滤波噪声的快速摩擦，0.55s
  flip     翻牌：一声短促的气流 + 轻扣，0.26s
  draw     抽牌：纸面滑动 + 轻点，0.32s
  bell     结果铃：三partial 衰减，1.4s
  collect  收牌：三下轻拍，0.42s

输出：assets/sfx/{name}.mp3（mono 44.1k 64kbps）+ 打印体积
用法：python tools/gen_sfx.py
"""
import os
import subprocess
import sys
import wave

import numpy as np

SR = 44100
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'sfx')
FFMPEG = r'D:\Tools\ffmpeg\ffmpeg.exe'
RNG = np.random.default_rng(20261117)


def env(n, attack=0.005, decay=0.2, power=2.0):
    a = max(1, int(attack * SR))
    d = max(1, int(decay * SR))
    e = np.ones(n)
    e[:a] = np.linspace(0, 1, a)
    tail = np.linspace(1, 0, min(d, n)) ** power
    e[n - len(tail):] = tail
    return e


def lowpass(x, alpha=0.25):
    y = np.empty_like(x)
    acc = 0.0
    for i, v in enumerate(x):
        acc += alpha * (v - acc)
        y[i] = acc
    return y


def noise(n):
    return RNG.normal(0, 1, n)


def shuffle(dur=0.55):
    n = int(dur * SR)
    base = lowpass(noise(n), 0.5) * 0.5 + lowpass(noise(n), 0.15) * 0.5
    # 三到四下摩擦
    out = np.zeros(n)
    for start, amp in ((0.02, 0.7), (0.16, 1.0), (0.31, 0.8), (0.44, 0.55)):
        s = int(start * SR)
        seg = int(0.11 * SR)
        if s + seg > n:
            seg = n - s
        out[s:s + seg] += base[:seg] * amp * env(seg, 0.004, 0.09)
    return out * 0.55


def flip_sfx(dur=0.26):
    n = int(dur * SR)
    whoosh = lowpass(noise(n), 0.35)
    ramp = np.linspace(0.2, 1.0, n) ** 1.5
    tick = np.zeros(n)
    t0 = int(0.16 * SR)
    m = min(n - t0, int(0.02 * SR))
    tick[t0:t0 + m] = RNG.normal(0, 1, m) * np.linspace(1, 0, m)
    return (whoosh * ramp * 0.35 + tick * 0.5) * env(n, 0.003, 0.08)


def draw_sfx(dur=0.32):
    n = int(dur * SR)
    slide = lowpass(noise(n), 0.08)
    slide *= np.linspace(0.3, 1.0, n)
    tap = np.zeros(n)
    t0 = int(0.2 * SR)
    m = min(n - t0, int(0.03 * SR))
    tap[t0:t0 + m] = RNG.normal(0, 1, m) * np.linspace(1, 0, m) ** 2
    return (slide * 0.3 + tap * 0.45) * env(n, 0.004, 0.1)



def bell(dur=1.4):
    n = int(dur * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    for f, a, d in ((880.0, 1.0, 0.9), (1320.0, 0.45, 0.6), (1760.0, 0.22, 0.4)):
        out += a * np.sin(2 * np.pi * f * t) * np.exp(-t / d)
    return out * 0.32 * env(n, 0.002, 0.25)


def collect(dur=0.42):
    n = int(dur * SR)
    out = np.zeros(n)
    for start, amp in ((0.0, 0.9), (0.13, 0.7), (0.26, 0.5)):
        s = int(start * SR)
        seg = min(n - s, int(0.05 * SR))
        out[s:s + seg] += RNG.normal(0, 1, seg) * env(seg, 0.002, 0.04) * amp
    return lowpass(out, 0.6) * 0.55


def cost_tick(dur=0.4):
    """每轮记账：两声干爽的点数声（玻璃点数），0.4s。

    电平对齐说明（2026-11-18 主人报「没有声音」）：第一版整体 0.30、衰减 τ=0.012，
    实测 peak −12.9 dBFS / RMS −31.8 dBFS，再乘客户端 0.7 倍与 55% 主音量后，
    两声 12ms 就没的脉冲在普通音箱上等于不存在。现在 τ 放到 0.028（有声体）、
    整体 0.62，peak ≈ −4 dBFS，比结果铃（−6.7）略轻一点、但同属「听得见」档。
    """
    n = int(dur * SR)
    out = np.zeros(n)
    for start, amp, f in ((0.0, 0.95, 2400.0), (0.115, 0.65, 1800.0)):
        s = int(start * SR)
        seg = min(n - s, int(0.12 * SR))
        t = np.arange(seg) / SR
        body = (np.sin(2 * np.pi * f * t) + 0.25 * np.sin(2 * np.pi * f * 2.7 * t)) * np.exp(-t / 0.028)
        out[s:s + seg] += body * amp * env(seg, 0.0015, 0.06)
    return out * 0.62


def ask_pip(dur=0.62):
    """等你答话：两句上行的木琴（587 → 880Hz），末尾上扬 = 在问你。

    电平对齐：第一版整体 0.26（peak −13.3 dBFS）太轻，提到 0.55 ≈ −7 dBFS，与铃同档。
    """
    n = int(dur * SR)
    out = np.zeros(n)
    for start, f, a in ((0.0, 587.33, 0.8), (0.20, 880.0, 0.6)):
        s = int(start * SR)
        seg = min(n - s, int(0.34 * SR))
        t = np.arange(seg) / SR
        tone = (np.sin(2 * np.pi * f * t) + 0.3 * np.sin(2 * np.pi * f * 2 * t)) * np.exp(-t / 0.12)
        out[s:s + seg] += tone * a * env(seg, 0.004, 0.16)
    return out * 0.55


def approve_knock(dur=0.78):
    """等你授权：同一个低音连敲两下（敲门），392 / 196Hz。

    三路里最沉、最有催促感；电平对齐：0.34 → 0.58（peak ≈ −8 dBFS），仍比铃轻半档。
    """
    n = int(dur * SR)
    out = np.zeros(n)
    for start in (0.0, 0.26):
        s = int(start * SR)
        seg = min(n - s, int(0.30 * SR))
        t = np.arange(seg) / SR
        tone = (np.sin(2 * np.pi * 392.0 * t) + 0.4 * np.sin(2 * np.pi * 196.0 * t)) * np.exp(-t / 0.07)
        out[s:s + seg] += tone * 0.7 * env(seg, 0.003, 0.12)
    return out * 0.58


def loopify(x, fade=0.6):
    """把尾段淡入首段，做成可无缝循环的环（W19 环境音景用）。"""
    n = int(fade * SR)
    if n * 2 >= len(x):
        return x
    head = x[:n].copy()
    tail = x[-n:].copy()
    ramp = np.linspace(0, 1, n)
    x = x[:-n].copy()
    x[:n] = head * ramp + tail * (1 - ramp)
    return x


def amb_rain(dur=8.5):
    """雨：底噪雨幕（带通嘶声）+ 稀疏雨滴。"""
    n = int(dur * SR)
    base = lowpass(noise(n), 0.045) * 0.55                      # 低频雨幕嗡
    hiss = lowpass(noise(n), 0.35) - lowpass(noise(n), 0.06)    # 高频嘶声
    out = base + hiss * 0.42
    # 雨滴：每秒 30±10 颗，短促衰减
    t = 0.0
    while t < dur:
        s = int(t * SR)
        seg = min(n - s, int(0.05 * SR))
        if seg <= 0:
            break
        f = RNG.uniform(1400, 4200)
        tt = np.arange(seg) / SR
        out[s:s + seg] += np.sin(2 * np.pi * f * tt) * np.exp(-tt / 0.008) * RNG.uniform(0.05, 0.16)
        t += RNG.uniform(0.018, 0.055)
    out = loopify(out)
    peak = np.abs(out).max() or 1
    return out / peak * 0.26


def amb_fire(dur=8.5):
    """壁炉：低频火床 + 随机爆裂（噼啪）。"""
    n = int(dur * SR)
    bed = lowpass(noise(n), 0.018) * 0.9
    out = bed * 0.7
    t = 0.05
    while t < dur:
        s = int(t * SR)
        seg = min(n - s, int(0.06 * SR))
        if seg <= 0:
            break
        amp = RNG.uniform(0.12, 0.5) ** 1.6
        burst = RNG.normal(0, 1, seg) * np.exp(-np.arange(seg) / SR / RNG.uniform(0.004, 0.014))
        out[s:s + seg] += burst * amp
        t += RNG.uniform(0.05, 0.5)
    out = lowpass(out, 0.55)
    out = loopify(out)
    peak = np.abs(out).max() or 1
    return out / peak * 0.30


def amb_wind(dur=9.0):
    """夜风：慢速起伏的风声，带一点呼啸。"""
    n = int(dur * SR)
    t = np.arange(n) / SR
    # 两层噪声：低频风体 + 被慢 LFO 调制的呼啸
    body = lowpass(noise(n), 0.012)
    gust = lowpass(noise(n), 0.05)
    lfo = 0.45 + 0.55 * (0.5 + 0.5 * np.sin(2 * np.pi * 0.055 * t + 0.7))
    lfo2 = 0.4 + 0.6 * (0.5 + 0.5 * np.sin(2 * np.pi * 0.031 * t + 2.1))
    out = body * 0.8 * lfo + gust * 0.5 * lfo2
    # 一点高频细啸，像风穿过缝隙
    whistle = np.sin(2 * np.pi * (620 + 40 * np.sin(2 * np.pi * 0.021 * t)) * t) * 0.05
    out = out + whistle * lfo
    out = loopify(out, fade=1.2)
    peak = np.abs(out).max() or 1
    return out / peak * 0.27


def amb_pages(dur=9.0):
    """翻书：间歇的纸页翻动，中间留安静的空白。"""
    n = int(dur * SR)
    out = np.zeros(n)
    t = 0.3
    while t < dur - 0.3:
        s = int(t * SR)
        seg = min(n - s, int(0.42 * SR))
        if seg <= 0:
            break
        # 一次翻页 = 气流（上升再落下）+ 落页轻扣
        ramp = np.sin(np.linspace(0, np.pi, seg)) ** 1.6
        page = lowpass(noise(seg), 0.12) * ramp * RNG.uniform(0.5, 1.0)
        tap_at = int(seg * RNG.uniform(0.55, 0.8))
        m = min(seg - tap_at, int(0.03 * SR))
        if m > 0:
            page[tap_at:tap_at + m] += RNG.normal(0, 1, m) * np.linspace(1, 0, m) ** 2 * 0.5
        out[s:s + seg] += page * 0.5
        t += RNG.uniform(1.6, 3.2)
    out = loopify(out, fade=0.5)
    peak = np.abs(out).max() or 1
    return out / peak * 0.24


TRACKS = {
    'shuffle': shuffle,
    'flip': flip_sfx,
    'draw': draw_sfx,
    'bell': bell,
    'collect': collect,
    # 气泡播报用的三路（2026-11-18）：与塔罗那五路刻意分家 —— 记干爽、答话上扬、授权下沉
    'cost': cost_tick,
    'ask': ask_pip,
    'approve': approve_knock,
    # W19 环境音景 4 套（循环，走路由不进 client）：雨 / 壁炉 / 夜风 / 翻书
    'amb-rain': amb_rain,
    'amb-fire': amb_fire,
    'amb-wind': amb_wind,
    'amb-pages': amb_pages,
}


def write_wav(path, data):
    data = np.clip(data, -1, 1)
    pcm = (data * 32767).astype('<i2')
    with wave.open(path, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


def main():
    os.makedirs(OUT, exist_ok=True)
    if not os.path.exists(FFMPEG):
        sys.exit('缺 ffmpeg：' + FFMPEG)
    total = 0
    for name, fn in TRACKS.items():
        wav = os.path.join(OUT, name + '.wav')
        mp3 = os.path.join(OUT, name + '.mp3')
        write_wav(wav, fn())
        subprocess.run([FFMPEG, '-y', '-loglevel', 'error', '-i', wav,
                        '-ac', '1', '-ar', str(SR), '-b:a', '64k', mp3], check=True)
        os.remove(wav)
        size = os.path.getsize(mp3)
        total += size
        print('%-9s %6.1fKB' % (name + '.mp3', size / 1024))
    print('合计 %.1fKB -> %s' % (total / 1024, OUT))


if __name__ == '__main__':
    main()
