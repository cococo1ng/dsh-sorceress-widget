# NOTICE

本包内含的原创素材（塔罗牌面 78 张、牌背、桌布、Sorceress 立绘）均为本项目自行生成的资产，
不适用代码的 MIT 授权，使用与再分发条件见 LICENSE-ASSETS。

代码部分版权归本项目作者，按 MIT 授权分发。

包内不含任何第三方字体文件；界面文字使用系统字体栈。
包内不内联任何第三方脚本库；React 由宿主 DSH 运行时提供。

---

## 第三方音效（Mixkit Free License）

`assets/sfx/` 下除早年脚本合成的短音效外，以下 8 套环境音景与 8 段短音效（塔罗五路 + 播报三路）取样自
**Mixkit（https://mixkit.co/free-sound-effects/）**，按
[Mixkit Free License](https://mixkit.co/license/#sfxFree) 使用：可免费用于商业与非商业项目、无需署名，
不可把音效本身作为独立素材再分发。

| 包内文件 | 原始条目（Mixkit） | 条目 id |
|---|---|---|
| `amb-rain.mp3` | Rain long loop | 2394 |
| `amb-fire.mp3` | Campfire crackles | 1330 |
| `amb-wind.mp3` | Wind blowing ambience | 2658 |
| `amb-pages.mp3` | Browsing book by pages | 1099 |
| `amb-night.mp3` | Summer night crickets loop | 1789 |
| `amb-sea.mp3` | Sea waves loop | 1196 |
| `amb-storm.mp3` | Calm thunderstorm in the jungle | 2415 |
| `amb-birds.mp3` | Morning birds | 2472 |
| `shuffle.mp3` | Thin metal card deck shuffle | 3175 |
| `draw.mp3` | Poker card flick | 2002 |
| `flip.mp3` | Page turn single | 1104 |
| `collect.mp3` | Stiff paper book paging | 1103 |
| `bell.mp3` | Service bell | 931 |
| `cost.mp3` | Liquid bubble | 3000 |
| `ask.mp3` | Magic marimba | 2820 |
| `approve.mp3` | Nylon guitar single note | 2332 |

处理方式（`tools/fetch_mixkit.py`）：转单声道 44.1k → 环境音截 ≤24 秒并做首尾交叉淡化成本地无缝环、
`loudnorm` 统一到 I=−23 LUFS；短音效裁掉首尾静音、峰值限制到 TP=−3 dBFS、`loudnorm` I=−18 LUFS，
再编码为 mp3（环境音 56kbps、短音效 80kbps；0.48.1 起短音效按「柔音」处理：`loudnorm` I=−18 LUFS、6kHz 以上压低 2dB）。
0.52.0 起结果铃 `bell.mp3` 走单独一条链：源换 931 服务铃、截 0.9 秒、先过 3kHz 真低通（2 极点）
再按峰值归一（0.708 ≈ −3dBFS），不再接 `loudnorm`/`alimiter` —— 短于 1 秒的音效响度统计窗太短，
实测会被压到 −8dBFS，且 alimiter 会把敲击瞬态峰抹平。
