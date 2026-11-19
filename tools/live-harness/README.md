# 本地实跑台（不装进 DSH 也能验前端）

用真 `plugin/client.js` 在真浏览器里跑挂件：`__ModuleLoader__` 与 `ctx.slots` 是桩，其余逻辑一行没改。

## 一次性准备

```powershell
cd E:\UserData\dsh-workspace\_tools\sorceress-widget\tools\live-harness
pnpm add react@18 react-dom@18
```

## 每次改完前端

```powershell
python E:\UserData\dsh-workspace\_tools\sorceress-widget\build.py --no-assets
python E:\UserData\dsh-workspace\_tools\sorceress-widget\tools\live-harness\run.py
```

截图落 `_verify/live-1-idle.png` … `live-5-small.png`。

## 覆盖的检查

ModuleLoader / apply / shell.overlay 注入与注册 · 8 张立绘在 DOM · 只有一张 is-on ·
data URI 内联 · 立绘原生 520 高 · 可点击区有尺寸 · 初始贴右下角 · 点击换姿态 + 气泡出字 ·
双击放大 · 拖拽抓取点跟手 · 拖完不误触 · 配置进 localStorage · 窗口变小仍夹在可视区 · 无 JS 报错。
