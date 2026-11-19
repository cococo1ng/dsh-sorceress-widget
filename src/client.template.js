/* Sorceress · 塔罗挂件 —— Client 半身（v0.2 面板）
 * 常驻右下角 + 拖拽记忆 + 四档缩放 + 姿势状态机 + 抽牌面板（单张 / 正逆 / 判词 / 历史）
 * 由 build.py 从本模板生成 plugin/client.js（立绘内联成 data URI）。
 * 本文件不出英文版：全部文案中文。
 */

window.__ModuleLoader__.load({
  id: 'dsh-sorceress-widget',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const NS = 'sorceress-widget';
    const VERSION = '__SRS_VERSION__';

    // ── 立绘（build.py 内联成 data URI）─────────────────────────────
    const POSES = {
      'idle-a': '__POSE_IDLE_A__',
      'idle-b': '__POSE_IDLE_B__',
      'think': '__POSE_THINK__',
      'dazed': '__POSE_DAZED__',
      'shuffle': '__POSE_SHUFFLE__',
      'spread': '__POSE_SPREAD__',
      'draw': '__POSE_DRAW__',
      'flip': '__POSE_FLIP__',
      'smile': '__POSE_SMILE__',
      'sleep': '__POSE_SLEEP__',
      'smirk': '__POSE_SMIRK__',
      'fly': '__POSE_FLY__',
      'reading': '__POSE_READING__',
      'annoyed': '__POSE_ANNOYED__',
      'bye': '__POSE_BYE__',
      'rest-hands': '__POSE_REST_HANDS__',
      'look-aside': '__POSE_LOOK_ASIDE__',
      'hold-cup': '__POSE_HOLD_CUP__',
      'stretch': '__POSE_STRETCH__',
    };
    // 每张姿态的不透明包围盒（归一化）与宽高比，由 tools/make_hitboxes.py 生成
    const HIT_BOX = __HIT_BOXES__;
    // 立绘几何常量（唯一真源 src/layout.json）
    const LAYOUT = __LAYOUT__;
    // UI 材质（build.py 内联成 data URI）：面板底纹、四角角花、分隔线、按钮三态
    const UI = {
      bg: '__UI_BG__',
      divider: '__UI_DIVIDER__',
      cornerTL: '__UI_CORNER_TL__',
      cornerTR: '__UI_CORNER_TR__',
      cornerBL: '__UI_CORNER_BL__',
      cornerBR: '__UI_CORNER_BR__',
      orb: '__UI_ORB__',
    };
    // 「关于」页的两张码：build.py 内联成 data URI（与立绘同一套，离线可用、不发请求）
    const ABOUT_IMG = { qq: '__ABOUT_QQ__', tip: '__ABOUT_TIP__' };

    // ── 模块级音频登记表 ───────────────────────────────────────────
    // 覆盖层可能被挂载两次（StrictMode / 重挂载），组件内的 audioRef 只跟得住最后一次，
    // 前面那个实例建出来的 <audio> 会一直循环且拿不到引用 —— 所以统一登记，统一停。
    const AUDIO_REGISTRY = [];

    // kind：'sfx' 一次性音效 / 'amb' 环境音景。分开打标，才能「只停音效、放过音景」
    function makeAudio(src, kind) {
      const el = new window.Audio(src);
      // 必须挂进 DOM：游离（detached）的音频元素在页面刷新后不会被销毁，
      // 会一直在后台循环，而新文档拿不到它的引用，表现就是「怎么关都还有声音」。
      try {
        el.setAttribute('data-srs-audio', '1');
        if (kind) el.setAttribute('data-srs-kind', kind);
        el.style.display = 'none';
        el.preload = 'auto';
        if (document.body) document.body.appendChild(el);
      } catch (error) { /* 忽略 */ }
      AUDIO_REGISTRY.push(el);
      return el;
    }

    // kind 省略 = 全停（页面关闭 / 插件卸载）；传 'sfx' 就只停一次性音效，环境音景照放
    function stopEveryAudio(kind) {
      for (let i = 0; i < AUDIO_REGISTRY.length; i += 1) {
        const a = AUDIO_REGISTRY[i];
        if (kind) {
          let own = '';
          try { own = a.getAttribute('data-srs-kind') || ''; } catch (error) { own = ''; }
          if (own !== kind) continue;
        }
        try {
          a.loop = false;
          a.pause();
          a.currentTime = 0;
          a.volume = 0;
        } catch (error) { /* 忽略 */ }
      }
    }

    // 每次加载先把历史实例全停（插件热重载时上一份可能在响）
    try { stopEveryAudio(); } catch (error) { /* 忽略 */ }

    // 卸载前把音频节点从 DOM 摘掉，避免游离实例跨文档继续播放
    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener('pagehide', () => {
        stopEveryAudio();
        try {
          const nodes = document.querySelectorAll('audio[data-srs-audio]');
          for (let i = 0; i < nodes.length; i += 1) nodes[i].remove();
        } catch (error) { /* 忽略 */ }
      });
    }

    // 音效（build.py 内联成 data URI，全部本地、不联网）
    const SFX = {
      shuffle: '__SFX_SHUFFLE__',
      flip: '__SFX_FLIP__',
      draw: '__SFX_DRAW__',
      bell: '__SFX_BELL__',
      collect: '__SFX_COLLECT__',
      // 气泡播报三路：与塔罗五路刻意分家（干爽点数 / 上扬木琴 / 下沉敲门）
      cost: '__SFX_COST__',
      ask: '__SFX_ASK__',
      approve: '__SFX_APPROVE__',
    };

    // 姿态的中文名（配置页「人物」块用；键与 POSES 一致）
    const POSE_LABEL = {
      'idle-a': '静立', think: '想事', dazed: '发呆', shuffle: '洗牌', spread: '摊牌',
      draw: '抽牌', flip: '翻牌', smile: '笑', sleep: '打盹', smirk: '得意', fly: '骑帚',
      reading: '读牌', annoyed: '不高兴', bye: '告别',
      'rest-hands': '静候', 'look-aside': '远望', 'hold-cup': '捧杯', stretch: '伸腰',
    };

    // W19 环境音景：八套真实录音循环（Mixkit Free License），走 /srs/sfx 路由（不内联，省包体）
    const AMB = {
      rain: { label: '雨', file: 'amb-rain' },
      fire: { label: '壁炉', file: 'amb-fire' },
      wind: { label: '夜风', file: 'amb-wind' },
      pages: { label: '翻书', file: 'amb-pages' },
      night: { label: '夜虫', file: 'amb-night' },
      sea: { label: '海浪', file: 'amb-sea' },
      storm: { label: '雷雨', file: 'amb-storm' },
      birds: { label: '鸟鸣', file: 'amb-birds' },
    };
    function ambSrc(key) {
      const one = AMB[key];
      return one ? '/srs/sfx/' + one.file + '.mp3?v=' + VERSION : '';
    }

    // 牌库与判词：build.py 从 data/*.json 内联（立项书 §5「一切数据内置」）
    const DECK = __DECK_JSON__;
    const TAROT = __TAROT_JSON__;
    const HORO = __HORO_JSON__;
    const EMPATHY = __EMPATHY_JSON__;

    // ── 配置与本地存储 ─────────────────────────────────────────────
    const CFG_KEY = 'srs.cfg.v1';
    const HIST_KEY = 'srs.history.v1';
    const HIST_MAX = 200;
    const SCALES = [0.7, 1.0, 1.3, 1.6];
    const DEFAULT_CFG = {
      scale: 1.0,
      x: null,
      y: null,
      corner: 'br',
      bubbleMs: 6000,
      sound: {
        on: false,
        volume: 55,
        tracks: { shuffle: true, flip: true, draw: true, bell: true, collect: true, cost: true, ask: true, approve: true },
      },
      bubble: { on: true, holdSec: 6 },
      lines: {},          // 玩家改过的台词：{ group: [句子…] }
      // 播报（气泡里说账）：每轮花了多少 / 有件事在等你点头 / 有件事在等你答话
      notice: { turnCost: true, askWait: true, approveWait: true },
      // 说话档位：quiet 安静（只在被点/抽牌时说）/ normal 正常 / chatty 多话
      talk: 'normal',
      // 人物姿态：空 = 自动（闲置换姿势）；非空 = 固定成这一张（说话照旧，不再自己换）
      posePin: '',
      // C8 每日一牌提醒：到点看一眼今天抽没抽，没抽就冒一句。默认关，不打扰
      remind: { on: false, hh: 21, mm: 0 },
      // 计费提醒（仿青云剑仙）：余额告急阈值 / 今日预算，0 = 关；两种每天各只说一次
      bill: { warnLow: 10, budget: 0, lowNotice: true },
      // W19 环境音景：四套可分层混音（走路由，不内联）。默认全关，别一装就响
      amb: { on: false, volume: 45, tracks: { rain: false, fire: false, wind: false, pages: false } },
      reversed: true,
      spread: 'daily',
      detail: 'brief',                       // T14 牌义详略：brief 简三句 / full 全文
      anchor: { h: 'right', v: 'bottom' },   // 吸附边：left/right + top/bottom，null = 自由
      onlyPanel: false,                      // 只留水晶球：人物收起来（C4）
    };

    function loadCfg() {
      try {
        const raw = window.localStorage.getItem(CFG_KEY);
        if (!raw) return Object.assign({}, DEFAULT_CFG);
        const got = JSON.parse(raw);
        const cfg = Object.assign({}, DEFAULT_CFG, got && typeof got === 'object' ? got : {});
        // 老版本的 sound / bubble 是布尔值，这里迁成对象，别让人升级后设置丢失
        if (typeof cfg.sound === 'boolean') cfg.sound = Object.assign({}, DEFAULT_CFG.sound, { on: cfg.sound });
        if (typeof cfg.bubble === 'boolean') cfg.bubble = Object.assign({}, DEFAULT_CFG.bubble, { on: cfg.bubble });
        if (typeof got.soundVol === 'number' && cfg.sound) cfg.sound.volume = got.soundVol;
        if (typeof got.bubbleMs === 'number' && cfg.bubble) cfg.bubble.holdSec = Math.round(got.bubbleMs / 1000);
        cfg.sound = Object.assign({}, DEFAULT_CFG.sound, cfg.sound || {});
        cfg.sound.tracks = Object.assign({}, DEFAULT_CFG.sound.tracks, (cfg.sound || {}).tracks || {});
        cfg.bubble = Object.assign({}, DEFAULT_CFG.bubble, cfg.bubble || {});
        cfg.notice = Object.assign({}, DEFAULT_CFG.notice, cfg.notice || {});
        cfg.amb = Object.assign({}, DEFAULT_CFG.amb, cfg.amb || {});
        cfg.amb.tracks = Object.assign({}, DEFAULT_CFG.amb.tracks, (cfg.amb || {}).tracks || {});
        // C8 提醒：时分可能是字符串或越界值（手改过 localStorage），这里一律收回合法范围
        cfg.remind = Object.assign({}, DEFAULT_CFG.remind, cfg.remind || {});
        const rh = parseInt(cfg.remind.hh, 10);
        const rm = parseInt(cfg.remind.mm, 10);
        cfg.remind.hh = (rh >= 0 && rh <= 23) ? rh : 21;
        cfg.remind.mm = (rm >= 0 && rm <= 59) ? rm : 0;
        // 计费提醒：阈值与预算都收成 0–10000 的整数元，手改坏了也不至于把界面算崩
        cfg.bill = Object.assign({}, DEFAULT_CFG.bill, cfg.bill || {});
        const wl = parseInt(cfg.bill.warnLow, 10);
        const bg = parseInt(cfg.bill.budget, 10);
        cfg.bill.warnLow = (wl >= 0 && wl <= 10000) ? wl : 10;
        cfg.bill.budget = (bg >= 0 && bg <= 10000) ? bg : 0;
        cfg.bill.lowNotice = cfg.bill.lowNotice !== false;
        return cfg;
      } catch (error) { return Object.assign({}, DEFAULT_CFG); }
    }

    function saveCfg(next) {
      try { window.localStorage.setItem(CFG_KEY, JSON.stringify(next)); } catch (error) { /* 隐私模式忽略 */ }
    }

    // 启动静音（主人 2026-11-18 定）：客户端重启不自动放环境音景，要他亲手点开。
    // 只把「总开关」按下来，八路轨道与音量原样留着 —— 点一下总开关就恢复上次那几路。
    function silenceAmbOnBoot(cfg) {
      const amb = (cfg && cfg.amb) || {};
      if (amb.on !== true) return cfg;
      const next = Object.assign({}, cfg, { amb: Object.assign({}, amb, { on: false }) });
      saveCfg(next);
      return next;
    }

    function pushHistory(entry) {
      try {
        const raw = window.localStorage.getItem(HIST_KEY);
        const list = Array.isArray(JSON.parse(raw || '[]')) ? JSON.parse(raw || '[]') : [];
        list.unshift(entry);
        window.localStorage.setItem(HIST_KEY, JSON.stringify(list.slice(0, HIST_MAX)));
      } catch (error) { /* 存不下就算了，不挡抽牌 */ }
    }

    // ── 台词 ───────────────────────────────────────────────────────
    const LINES = {
      idle: [
        '我在。想抽牌就说一声。',
        '夜里的事，交给夜里。',
        '牌摊开着，不用急着问。',
        '不着急。先坐着。',
        '灯还亮着，我还没走。',
        '想问的那件事，你心里早有个大概。',
        '这里没有别人，说什么都行。',
        '手边的杯子，喝一口再说。',
      ],
      ask: [
        '想着那件事，心里说一遍。',
        '不用讲得很清楚，我知道。',
        '说半句也行，剩下的我猜。',
        '问之前先喘口气。',
        '你刚才想说又吞回去的那句，是它吗。',
        '这事你其实有答案，只是想要人陪你说一遍。',
        '说慢一点，我听着。',
      ],
      shuffle: [
        '先洗一洗。',
        '牌自己会找到位置。',
        '别急，牌比人沉得住气。',
        '洗牌的时候，想那件事。',
        '这一副用过很多次了，认得人。',
        '手别抖，牌不咬人。',
        '好了，位置都换过了。',
      ],
      spread: [
        '摊开了，挑一张。',
        '都在这儿。',
        '背面朝上，慢慢看。',
        '挑一张你看着顺眼的。',
        '手指停在哪张，就是哪张。',
        '不用多想，第一直觉最准。',
      ],
      draw: [
        '这一张。',
        '嗯，就是它。',
        '果然。',
        '你手停得挺准。',
        '这张牌今天话多。',
        '它一直在等你看它。',
      ],
      flip: [
        '翻过来了。',
        '看清楚了。',
        '正逆都不改它的意思，只改语气。',
        '先别急着定好坏。',
        '看一眼，再告诉我哪里扎心。',
        '这一面朝上，就是不藏着了。',
      ],
      done: [
        '牌说的是现在的你，不是命。',
        '记住这句就够了。',
        '别拿它当判决书，它只是一面镜子。',
        '剩下的，是你自己走过去。',
        '要是听着不舒服，就当我在多嘴。',
        '今天到这儿，明天再来也不迟。',
        '想问的没问到，可以再抽一张。',
        '这张牌的意思，过几天你会更懂。',
        '牌说完了，我说的不一定对。',
      ],
      // 自我关怀：不安慰、不打气，只是陪着。深夜与久坐时用得多。
      care: [
        '你已经撑很久了，先坐一下。',
        '累不是你的错，人都有电量见底的时候。',
        '这件事不用今晚就有答案。',
        '先把水喝了，别的等会儿。',
        '疼就疼着，不用马上振作。',
        '你今天做得够多了。',
        '不用跟谁交代，跟我说就行。',
        '睡不着就躺着，躺着也算休息。',
        '有件事你一直没跟人说，我知道。',
        '慢慢来，我不催你。',
        '天塌下来也是明天的事，先睡。',
        '你比你以为的耐得住，但没必要一直耐。',
      ],
    };

    // 可编辑台词：玩家改过的优先，没改过用内置
    const LINE_GROUPS = [['idle', '闲置自语'], ['ask', '被搭话'], ['shuffle', '洗牌'], ['spread', '摊牌'], ['draw', '抽牌'], ['flip', '翻牌'], ['done', '收尾'], ['care', '自我关怀']];

    function linesFor(cfg, group) {
      const custom = (cfg && cfg.lines && cfg.lines[group]) || null;
      if (Array.isArray(custom) && custom.length) return custom;
      return LINES[group] || LINES.idle;
    }

    function pickLine(cfg, kind) {
      const arr = linesFor(cfg, kind);
      try { (window.__srsSays = window.__srsSays || []).push(kind); } catch (error) { /* 实跑台探针，失败不影响 */ }
      return arr[Math.floor(Math.random() * arr.length)];
    }

    // ── 抽牌引擎：crypto 取种子 + Fisher–Yates ────────────────────
    function newSeed() {
      try {
        const buf = new Uint32Array(1);
        window.crypto.getRandomValues(buf);
        return buf[0] >>> 0;
      } catch (error) {
        return (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
      }
    }

    // mulberry32：同一种子必然同一副顺序，历史里存种子就能复现
    function prng(seed) {
      let a = seed >>> 0;
      return function next() {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), 1 | t);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }

    // ── 判词合成：大阿卡纳直取，小阿卡纳三层拼 ─────────────────────
    function meaningOf(deckCard, deck, tarot, reversed) {
      const side = reversed ? 'rev' : 'up';
      if (!tarot) return { keywords: [], lines: ['牌义库没读到。'] };
      if (deckCard.kind === 'major') {
        const m = (tarot.major || {})[deckCard.id];
        if (!m) return { keywords: [], lines: ['这张的判词还没写。'] };
        return { keywords: m.keywords || [], lines: m[side] || [] };
      }
      // 2026-11-18：56 张小阿卡纳改成逐张精写（tarot.minor，正逆各 3 句）。
      // minorTemplate 保留作兜底：minor 里缺某张时才退回「数字 × 花色 × 建议」三层合成。
      const own = ((tarot.minor || {})[deckCard.id]) || null;
      if (own) return { keywords: own.keywords || [], lines: own[side] || [] };
      const tpl = tarot.minorTemplate || {};
      const rank = (tpl.ranks || {})[deckCard.rank] || {};
      const suit = (tpl.suits || {})[deckCard.suit] || {};
      const suitMeta = ((deck && deck.suits) || []).find((s) => s.id === deckCard.suit) || {};
      const adviceArr = ((tpl.advice || {})[side]) || [];
      const pick = rank[side] || '';
      const suitLine = suit[side] || '';
      const advice = adviceArr.length ? adviceArr[deckCard.number % adviceArr.length] : '';
      const lines = [pick, suitLine, advice].filter(Boolean);
      // 花色标签：圣杯 · 水（而不是只丢一个「水」字出来）
      const keywords = [suitMeta.name_zh, suitMeta.element].filter(Boolean);
      return { keywords, lines };
    }

    // ── 样式（每个版本一个唯一 id）──────────────────────────────────
    // 为什么不用固定 id：页面里可能残留上一个版本注入的样式表，
    // 固定 id 会让新版本直接跳过注入，新规则永远进不了页面（2026-11-17 真机踩到：
    // 挂件本体有样式、面板整块没样式，诊断读到面板背景是透明的）
    // 视觉系统的唯一真源：src/design_tokens.json（build.py 注入）。
    // 色板 / 字号阶梯 / 间距档位只许从这里取，样式里不再写散 hex。
    const DESIGN = __DESIGN_TOKENS__;
    const DC = DESIGN.colors;
    const DF = DESIGN.fonts;
    const DS = DESIGN.space;

    const STYLE_ID = 'srs-style-' + String(VERSION).replace(/[^\w]/g, '_');

    function ensureStyle() {
      if (document.getElementById(STYLE_ID)) return;
      const css = [
        '.srs-root{position:fixed;z-index:60;pointer-events:none;-webkit-user-select:none;user-select:none;',
        'touch-action:none;',
        '--srs-ink:' + DC.ink + ';--srs-veil:' + DC.veil + ';--srs-navy:' + DC.navy + ';',
        '--srs-gold:' + DC.gold + ';--srs-gold-lit:' + DC.goldLit + ';--srs-parch:' + DC.parch + ';--srs-muted:' + DC.muted + ';',
        '--srs-f12:' + DF[0] + 'px;--srs-f15:' + DF[1] + 'px;--srs-f20:' + DF[2] + 'px;--srs-f34:' + DF[3] + 'px;',
        '--srs-s1:' + DS[0] + 'px;--srs-s2:' + DS[1] + 'px;--srs-s3:' + DS[2] + 'px;--srs-s4:' + (DS[3] || DS[2]) + 'px;',
        '--srs-line:rgba(177,146,106,.28);',
        '--srs-serif:"Songti SC",SimSun,"Noto Serif SC",serif;',
        'font-family:-apple-system,"Segoe UI","Microsoft YaHei",sans-serif;',
        'width:var(--srs-w);height:var(--srs-h);}',
        '.srs-stage{position:absolute;inset:0;display:flex;align-items:flex-end;justify-content:center;',
        'transform-origin:50% 92%;transition:transform .18s ease-out}',
        '.srs-sprite{position:absolute;bottom:0;left:50%;transform:translateX(-50%);',
        // 硬切：14 张立绘叠在同一位置，做 opacity 交叉会让两张同时半透明、互相透出，看着闪一下
        // 呼吸动画常驻在立绘上（不跟着姿态 class 增删走，否则切姿势时动画 restart、位置跳一下）；
        // 也不能挂到 .srs-stage —— hit 区是它的子节点，跟着浮动会让点击永远「元素不稳定」
        'height:100%;width:auto;pointer-events:none;opacity:0;',
        'animation:srs-breathe 4.6s ease-in-out infinite}',
        '.srs-sprite.is-on{opacity:1}',
        // 挂件在屏幕左侧（左下 / 左上吸附，或自由态落在左半屏）时，所有姿势统一水平镜像、面向屏幕中心。
        // 翻的是立绘本体（transform 叠在 translateX(-50%) 后面，视觉中心不动）；
        // 点击轮廓在下面按 1-x-w 一起翻 —— 0.44.0 的教训：只翻图不翻轮廓，点哪儿都错位。
        // 呼吸用的是独立的 translate 属性（见 srs-breathe），不受这条 transform 影响。
        '.srs-stage.srs-mirror .srs-sprite{transform:translateX(-50%) scaleX(-1)}',
        '.srs-hitwrap{position:absolute;bottom:0;left:50%;transform:translateX(-50%);height:100%;',
        'pointer-events:none}',
        '.srs-hit{position:absolute;pointer-events:auto;cursor:pointer;border-radius:44% 44% 28% 28%;z-index:1}',
        // 挂件贴左边界时整块 UI 跟人物一起镜像：气泡从「人物左侧」翻到「人物右侧」，
        // 不然它 right:100% 会整块飘出屏幕左边（左下角实测 x=-186..4，只剩 4px 露在屏里）。
        '.srs-root.srs-left .srs-bubble{right:auto;left:100%;margin-right:0;margin-left:10px}',
        // ── 气泡 · 面板同族小卡 + 四角花边（2026-11-18 第四版）────
        // 按主人要求：去掉左上那团金色光晕，跟菜单/面板保持同一套材质（深蓝底 + 淡金细边 + 8px 圆角），
        // 再加一层花边 —— 直接复用面板四角的金线角花（corner-*.webp），与面板框同一份素材、同一种笔触。
        '.srs-bubble{position:absolute;right:100%;margin-right:10px;bottom:56%;',
        'width:max-content;max-width:190px;box-sizing:border-box;',
        'padding:9px 13px 9px;',
        // 四角角花贴内缘（各 18px），底用面板同一档深蓝，不叠加任何光晕
        'background:',
        'url("' + UI.cornerTL + '") left 1px top 1px / 18px 18px no-repeat,',
        'url("' + UI.cornerTR + '") right 1px top 1px / 18px 18px no-repeat,',
        'url("' + UI.cornerBL + '") left 1px bottom 1px / 18px 18px no-repeat,',
        'url("' + UI.cornerBR + '") right 1px bottom 1px / 18px 18px no-repeat,',
        'rgba(20,27,45,.95);',
        // 与菜单 tab 卡同档：1px 淡金边（菜单未选 9%、选中 34%，气泡取中间）
        'border:1px solid rgba(201,164,92,.30);',
        'border-radius:8px;',
        'color:var(--srs-parch);',
        'font-size:12px;line-height:1.5;',
        'box-shadow:0 6px 16px rgba(3,7,16,.5);',
        'pointer-events:none;opacity:0;transform:translateY(4px);',
        'transition:opacity .2s ease-out,transform .2s ease-out;white-space:normal;word-break:break-word}',
        '.srs-bubble.is-on{opacity:1;transform:translateY(0)}',
        // 副行：账目数字压一档、淡一档
        '.srs-bubble-sub{margin-top:3px;font-size:10.5px;line-height:1.45;color:rgba(232,221,198,.62);letter-spacing:.01em}',
        // 万一走到「文本为空」的路径，别让 padding + 边框独自留在人物边上
        '.srs-bubble:empty{display:none}',
        
        // 面板
        '.srs-panel{position:absolute;bottom:calc(100% + 10px);width:332px;box-sizing:border-box;',
        'background-color:var(--srs-ink);background-image:url("' + UI.bg + '");background-size:cover;background-position:center;',
        'border:1px solid var(--srs-gold);border-radius:10px;display:flex;flex-direction:column;',
        'max-height:calc(100vh - 230px);',
        'box-shadow:0 18px 44px rgba(0,0,0,.5);pointer-events:none;visibility:hidden;color:var(--srs-parch);',
        'opacity:0;transform:translateY(6px);transition:opacity .2s ease-out,transform .2s ease-out,visibility .2s}',
        '.srs-panel.is-on{opacity:1;transform:translateY(0);pointer-events:auto;visibility:visible}',
        '.srs-panel.right{right:0}', '.srs-panel.left{left:0}',
        '.srs-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px;',
        'padding:16px 20px 6px}',
        '.srs-title{font-family:var(--srs-serif);font-size:16px;font-weight:600;',
        'color:var(--srs-parch);letter-spacing:.02em}',
        '.srs-x{font-family:inherit;font-size:16px;line-height:1;background:none;border:0;',
        'color:var(--srs-gold);cursor:pointer;padding:2px 4px}',
        '.srs-x:hover{color:var(--srs-gold-lit)}',
        '.srs-body{padding:14px 16px 16px;overflow-y:auto;flex:1 1 auto;min-height:0}',
        '.srs-slot{width:168px;height:252px;margin:0 auto;border:1px solid var(--srs-gold);',
        'border-radius:4px;background:var(--srs-veil);overflow:hidden;position:relative}',
        '.srs-slot img{width:100%;height:100%;object-fit:cover;display:block}',
        '.srs-slot img.is-rev{transform:rotate(180deg)}',
        '.srs-slot .back{opacity:.85}',
        '.srs-hint{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;',
        'font-size:13px;color:var(--srs-muted);background:rgba(18,24,41,.55)}',
        // 洗牌：6 张同款牌背在平面内滑入交错，末帧叠成一小叠带薄边
        // 牌位只有 168×252，AI 视频在这个尺寸下只剩一片金色杂点；CSS 每张都是原图，永远不变形
        '.srs-shuf{position:absolute;inset:0;overflow:hidden;pointer-events:none}',
        '.srs-shuf i{position:absolute;left:10%;top:10%;width:80%;height:80%;',
        'border-radius:4px;border:1px solid rgba(201,164,92,.62);background-color:var(--srs-veil);',
        'background-image:url("/srs/cards/back.webp?v=' + VERSION + '");background-size:cover;',
        'background-position:center;box-shadow:0 6px 14px rgba(0,0,0,.55);will-change:transform,opacity}',
        '.srs-shuf i:nth-child(1){animation:srs-shuf-a 1s cubic-bezier(.22,.62,.28,1) both;z-index:6}',
        '.srs-shuf i:nth-child(2){animation:srs-shuf-b 1s cubic-bezier(.22,.62,.28,1) .05s both;z-index:5}',
        '.srs-shuf i:nth-child(3){animation:srs-shuf-c 1s cubic-bezier(.22,.62,.28,1) .1s both;z-index:4}',
        '.srs-shuf i:nth-child(4){animation:srs-shuf-d 1s cubic-bezier(.22,.62,.28,1) .15s both;z-index:3}',
        '.srs-shuf i:nth-child(5){animation:srs-shuf-e 1s cubic-bezier(.22,.62,.28,1) .2s both;z-index:2}',
        '.srs-shuf i:nth-child(6){animation:srs-shuf-f 1s cubic-bezier(.22,.62,.28,1) .25s both;z-index:1}',
        '@keyframes srs-shuf-a{0%{transform:translate(-62%,-9%) rotate(-14deg);opacity:0}',
        '18%{opacity:1}55%{transform:translate(9%,4%) rotate(-4deg)}',
        '86%{transform:translate(-2%,-1%) rotate(1.2deg)}100%{transform:translate(0,0) rotate(0);opacity:.96}}',
        '@keyframes srs-shuf-b{0%{transform:translate(-66%,11%) rotate(-9deg);opacity:0}',
        '18%{opacity:1}55%{transform:translate(-11%,-4%) rotate(2deg)}',
        '86%{transform:translate(1%,1%) rotate(-1deg)}100%{transform:translate(-1.3%,.75%) rotate(-.5deg);opacity:.94}}',
        '@keyframes srs-shuf-c{0%{transform:translate(62%,9%) rotate(14deg);opacity:0}',
        '18%{opacity:1}55%{transform:translate(-9%,-4%) rotate(4deg)}',
        '86%{transform:translate(2%,1%) rotate(-1.2deg)}100%{transform:translate(1.3%,-.75%) rotate(.5deg);opacity:.94}}',
        '@keyframes srs-shuf-d{0%{transform:translate(66%,-11%) rotate(9deg);opacity:0}',
        '18%{opacity:1}55%{transform:translate(11%,4%) rotate(-2deg)}',
        '86%{transform:translate(-1%,-1%) rotate(1deg)}100%{transform:translate(-2.6%,1.5%) rotate(-1deg);opacity:.92}}',
        '@keyframes srs-shuf-e{0%{transform:translate(-20%,-72%) rotate(-6deg);opacity:0}',
        '20%{opacity:1}60%{transform:translate(6%,9%) rotate(2deg)}',
        '88%{transform:translate(-1%,-1%) rotate(-.6deg)}100%{transform:translate(2.6%,-1.5%) rotate(1deg);opacity:.9}}',
        '@keyframes srs-shuf-f{0%{transform:translate(20%,72%) rotate(6deg);opacity:0}',
        '20%{opacity:1}60%{transform:translate(-6%,-9%) rotate(-2deg)}',
        '88%{transform:translate(1%,1%) rotate(.6deg)}100%{transform:translate(-.9%,-.6%) rotate(-.4deg);opacity:.9}}',
        '.srs-shuf-hint{position:absolute;left:0;right:0;bottom:0;z-index:9;padding:5px 0 4px;text-align:center;',
        'font-size:11px;letter-spacing:.08em;color:var(--srs-muted);pointer-events:none;',
        'background:linear-gradient(to top,rgba(12,18,32,.9),rgba(12,18,32,0))}',
        '.srs-name{display:flex;align-items:baseline;gap:8px;margin-top:14px}',
        '.srs-name b{font-family:var(--srs-serif);font-size:16px;font-weight:600;color:#EFE3CB}',
        '.srs-flag{font-size:11px;color:var(--srs-gold);border:1px solid var(--srs-line);',
        'border-radius:4px;padding:0 5px;line-height:16px}',
        '.srs-kw{font-size:11px;color:#C4B89F;margin-top:6px;text-shadow:0 1px 2px rgba(4,8,18,.85)}',
        '.srs-lines{margin-top:12px;font-size:13px;line-height:1.7;color:#E6DAC0;text-shadow:0 1px 2px rgba(4,8,18,.85)}',
        '.srs-lines p{margin:0 0 6px}',
        '.srs-lines p:last-child{margin-bottom:0}',
        '.srs-empty{font-size:13px;line-height:1.7;color:#CFC4AC;text-align:center;text-shadow:0 1px 2px rgba(4,8,18,.85)}',
'.srs-empty-art{margin:32px 0 10px;text-align:center;line-height:0;padding:0 8%;box-sizing:border-box}',
        // 空态牌叠：三张 back.webp 错开叠着，替掉原来那张横放蓝牌图（与抽牌后的牌背同一张）
        '.srs-empty-deck{position:relative;width:104px;height:132px;margin:0 auto;line-height:0;',
'filter:drop-shadow(0 10px 18px rgba(2,6,14,.55))}',
'.srs-empty-deck i{position:absolute;left:13px;top:8px;width:78px;height:117px;border-radius:5px;',
'border:1px solid rgba(201,164,92,.62);background-image:url("/srs/cards/back.webp?v=' + VERSION + '");',
'background-size:cover;background-position:center;box-shadow:0 4px 10px rgba(0,0,0,.45)}',
'.srs-empty-deck i:nth-child(1){transform:translate(-9px,7px) rotate(-8deg)}',
'.srs-empty-deck i:nth-child(2){transform:translate(0,0) rotate(-1.5deg)}',
'.srs-empty-deck i:nth-child(3){transform:translate(9px,-7px) rotate(5deg)}',
'.srs-empty-orb{position:absolute;right:10px;bottom:-2px;width:66px;filter:drop-shadow(0 6px 14px rgba(2,6,14,.55))}',
        '.srs-foot{display:flex;gap:12px;margin-top:16px;padding-top:12px;border-top:1px solid var(--srs-line)}',
        // 「关于」入口：窄按钮，不抢主按钮的宽度
        '.srs-btn-about{flex:0 0 56px;font-size:12px}',
        // 「关于」正文：与面板同一套字号/颜色，长文在 body 里滚动
        '.srs-about{font-size:12.5px;line-height:1.8;color:#D6C7AA}',
        '.srs-about p{margin:0 0 8px}',
        '.srs-about p.lead{font-size:13px;color:var(--srs-parch)}',
        '.srs-about-h{font-size:15px;color:var(--srs-gold);margin:16px 0 6px;letter-spacing:.4px}',
        '.srs-about ul{margin:2px 0 8px;padding-left:16px}',
        '.srs-about li{margin-bottom:2px}',
        '.srs-about b{color:var(--srs-gold-lit);font-weight:600}',
        '.srs-about-sep{height:1px;margin:14px 0 0;background:linear-gradient(90deg,transparent,rgba(201,164,92,.24),transparent)}',
        '.srs-about-shot{display:block;margin:8px auto 4px;width:190px;border:1px solid rgba(201,164,92,.45);border-radius:6px;background:#fff}',
        '.srs-about-shot.tip{width:208px}',
        '.srs-about-cap{text-align:center;font-size:12px;color:var(--srs-muted);margin:0 0 6px}',
        '.srs-about p.note{font-size:12px;color:var(--srs-muted);margin:0 0 8px}',
        // .srs-btn 的样式统一在样式数组末尾的「底部动作条」块里，这里不再重复定义
        '.srs-corner{position:absolute;width:46px;height:46px;background-size:contain;background-repeat:no-repeat;pointer-events:none;opacity:.92}',
        '.srs-corner.tl{left:-3px;top:-3px}',
        '.srs-corner.tr{right:-3px;top:-3px}',
        '.srs-corner.bl{left:-3px;bottom:-3px}',
        '.srs-corner.br{right:-3px;bottom:-3px}',
        '.srs-modal{position:fixed;inset:0;z-index:10001;display:flex;align-items:center;justify-content:center;',
        'background:rgba(4,7,14,.62);pointer-events:auto}',
        '.srs-card{width:320px;max-width:calc(100vw - 24px);max-height:calc(100vh - 60px);overflow-y:auto;box-sizing:border-box;',
        'background:#121829;border:1px solid var(--srs-gold);border-radius:10px;padding:16px;color:#D6C1A6;',
        'box-shadow:0 22px 50px rgba(0,0,0,.6)}',
        '.srs-card h4{margin:0 0 4px;font-family:var(--srs-serif);font-size:15px;color:#EFE3CB;font-weight:600}',
        '.srs-card p.tip{margin:0 0 12px;font-size:11px;line-height:1.6;color:#94897A}',
        '.srs-field{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:8px 0;font-size:12px}',
        '.srs-field input,.srs-field select{font-family:inherit;font-size:12px;padding:4px 6px;color:#EFE3CB;',
        'background:rgba(30,39,64,.85);border:1px solid var(--srs-line);border-radius:4px;max-width:150px}',
        // 日期框：原生日历按钮默认又小又灰，放大 + 染成金色；color-scheme 让弹出的日历也走深色
        '.srs-field input[type="date"]{color-scheme:dark;font-size:13px;padding:5px 7px;max-width:176px;',
        'border-color:rgba(201,164,92,.45)}',
        '.srs-field input[type="date"]::-webkit-calendar-picker-indicator{width:18px;height:18px;',
        'padding:1px;margin-left:4px;cursor:pointer;opacity:.95;',
        // 先压成纯黑再反相染色，才能落到金色；直接 invert 半吊子会得到一块看不清的深褐
        'filter:brightness(0) invert(1) sepia(1) saturate(3.4) hue-rotate(352deg) brightness(.94)}',
        '.srs-field input[type="date"]::-webkit-calendar-picker-indicator:hover{opacity:1;',
        'filter:brightness(0) invert(1) sepia(1) saturate(4) hue-rotate(352deg) brightness(1.04)}',
        '.srs-field input[type="date"]::-webkit-datetime-edit-fields-wrapper{color:#F2E7CE}',
        // 点进日期框时浏览器默认拿蓝底黑字选中年/月/日，跟深色主题打架
        '.srs-field input[type="date"]::-webkit-datetime-edit-year-field:focus,',
        '.srs-field input[type="date"]::-webkit-datetime-edit-month-field:focus,',
        '.srs-field input[type="date"]::-webkit-datetime-edit-day-field:focus{',
        'background:rgba(201,164,92,.35);color:#FFF6E2;border-radius:2px}',
        '.srs-field input[type="date"]:focus{outline:none;border-color:var(--srs-gold-lit);',
        'box-shadow:0 0 0 1px rgba(227,197,136,.35)}',
        // 生日 + 出生时刻排成一行：两行各占一行太散，一排就够
        '.srs-birth-in{display:inline-flex;align-items:center;gap:5px;min-width:0}',
        '.srs-birth-in input[type="date"]{width:120px;max-width:120px;font-size:12px;padding:4px 5px}',
        '.srs-birth-in input[type="time"]{width:84px;max-width:84px;color-scheme:dark;font-size:12px;padding:4px 5px;',
        'border-color:rgba(201,164,92,.45)}',
        '.srs-birth-in input[type="time"]::-webkit-calendar-picker-indicator{width:15px;height:15px;',
        'padding:1px;margin-left:2px;cursor:pointer;opacity:.9;',
        'filter:brightness(0) invert(1) sepia(1) saturate(3.4) hue-rotate(352deg) brightness(.94)}',
        '.srs-birth-in input[type="time"]:focus{outline:none;border-color:var(--srs-gold-lit);',
        'box-shadow:0 0 0 1px rgba(227,197,136,.35)}',
        '.srs-row2{display:flex;gap:8px;margin-top:12px}',
        '.srs-row2 button{flex:1;font-family:inherit;font-size:12px;padding:7px 0;cursor:pointer;border-radius:6px;',
        'color:#EFE3CB;border:1px solid var(--srs-line);background:rgba(30,39,64,.7)}',
        '.srs-row2 button.p{border-color:var(--srs-gold)}',
        '.srs-row2 button.is-ok{border-color:var(--srs-gold-lit);color:#FFF6E2;',
        'background:rgba(201,164,92,.24);box-shadow:0 0 10px rgba(227,197,136,.25)}',
        '.srs-ok{font-size:11px;line-height:1.5;color:#E3C588;margin-top:6px;min-height:16px;',
        'text-shadow:0 1px 2px rgba(4,8,18,.85);transition:opacity .2s}',
        '.srs-err{color:#E0A38A;font-size:11px;margin-top:8px;min-height:14px}',
        '.srs-ring{display:block;margin:10px auto 4px}',
        '.srs-cyc{font-size:11px;line-height:1.6;color:#C4B89F;text-align:center}',
        // 水晶球入口：悬停人物才浮现，位置在人物右上角
        '.srs-spread{display:flex;gap:8px;justify-content:center;margin-top:6px}',
        '.srs-sp-cell{display:flex;flex-direction:column;align-items:center;gap:4px;width:82px}',
        '.srs-sp-img{width:82px;height:auto;border:1px solid var(--srs-gold);border-radius:4px;display:block}',
        '.srs-sp-lab{font-size:11px;color:var(--srs-gold);text-shadow:0 1px 2px rgba(4,8,18,.8)}',
        '.srs-sp-name{font-size:11px;color:#D6C1A6;text-align:center;text-shadow:0 1px 2px rgba(4,8,18,.8)}',
        // 翻牌动画：牌背先亮着 → 按序号错开翻成牌面（二选一 / 关系阵共用）
        '.srs-flip{position:relative;width:82px;perspective:760px}',
        '.srs-flip-in{position:relative;display:grid;transform-style:preserve-3d;',
        'animation:srs-flip-turns .64s cubic-bezier(.34,.74,.26,1) both;animation-delay:var(--fd,0s)}',
        '.srs-flip-face{grid-area:1/1;width:100%;display:block;border:1px solid var(--srs-gold);border-radius:4px;',
        'overflow:hidden;background:#0A1020;backface-visibility:hidden;-webkit-backface-visibility:hidden}',
        '.srs-flip-face img{width:100%;display:block;border-radius:3px}',
        '.srs-flip-front{transform:rotateY(180deg)}',
        '@keyframes srs-flip-turns{from{transform:rotateY(0)}to{transform:rotateY(180deg)}}',
        '.srs-fadein{animation:srs-fade .44s ease both;animation-delay:var(--fd,0s)}',
        '@keyframes srs-fade{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}',
        '.srs-gear{position:absolute;right:-4px;top:-12px;width:46px;height:46px;pointer-events:auto;cursor:pointer;',
        'opacity:0;transition:opacity .18s ease-out,transform .18s ease-out;filter:drop-shadow(0 4px 12px rgba(0,0,0,.55))}',
        '.srs-root:hover .srs-gear{opacity:.88}',
        '.srs-gear:hover{transform:translateY(-2px) scale(1.1);opacity:1}',
        '.srs-gear.on{opacity:1}',
        '.srs-gear img{width:100%;height:100%;object-fit:contain;display:block;pointer-events:none;',
        // 红色呼吸光效：与青云剑仙法宝同一套参数（9px → 21px、5.4s ease-in-out、rgba(220,90,90,.65)）。
        // 球比剑仙的立绘小得多，外面再叠一层紧贴的核心光，深色底上才看得出来。
        'filter:drop-shadow(0 0 6px rgba(220,90,90,.85)) drop-shadow(0 0 9px rgba(220,90,90,.65));',
        'animation:srs-gear-breathe 5.4s ease-in-out infinite}',
        '@keyframes srs-gear-breathe{',
        '0%,100%{filter:drop-shadow(0 0 6px rgba(220,90,90,.85)) drop-shadow(0 0 9px rgba(220,90,90,.65))}',
        '50%{filter:drop-shadow(0 0 9px rgba(220,90,90,.95)) drop-shadow(0 0 21px rgba(220,90,90,.65))}}',
        // 系统开了「减少动态效果」就停在中间档，不让她一直呼吸
        '@media (prefers-reduced-motion: reduce){.srs-gear img{animation:none;',
        'filter:drop-shadow(0 0 7px rgba(220,90,90,.9)) drop-shadow(0 0 14px rgba(220,90,90,.6))}}',
        // 「只留水晶球」（C4）：人整个撤掉，只留入口 —— 想安静干活时别让立绘挡着
        // 类名不能叫 srs-mini：那是计费页里小按钮的类，撞名会把面板按钮的内边距套到挂件根节点上
        '.srs-orb-only .srs-bubble{display:none}',
        '.srs-orb-only .srs-gear{opacity:.92;right:4px;top:4px}',
        // 贴左边界时水晶球也跟着镜像：从「人物右上」翻到「人物左上」，
        // 与人物的镜像方向一致（她朝右，球在她右侧肩膀那边就跑到屏幕中间去了）。
        // 只留水晶球时不适用：那颗球是整块挂件本身，贴在 root 里居中（46+4+4 = 54）就好。
        '.srs-root.srs-left:not(.srs-orb-only) .srs-gear{right:auto;left:-4px}',
        // ── 菜单栏（2026-11-17 第四版）：插画风 ──
        // 第三版是「纯文字 tab + 金色细边方框」，六个中文 tab 已把 340px 填满，没有放图标的余量。
        // 这一版把 tab 改成「图标在上、文字在下」的两行：栏高 40→56，每格 49px，图标 24px。
        // 选中态换成一枚水彩笔触（方案 A）：不占额外高度。
        // hover 只用 7% 圆角浅底 + 图标文字提亮，**不画笔** —— 两格相邻时两道笔会连成一条。
        // 分组不再画竖线，改成第 3、4 格之间留 8px（色差/留白优先于实线，见 UI 规范第六节）。
        // 图标是内联 SVG 线稿 + 手绘抖动滤镜（srs-wob），与立绘的水彩/金线同一套语言；
        // 不加任何位图素材，build.py 的 TOKENS 表与 client.js 体积都不受影响。
        '.srs-tabs{flex:0 0 auto;display:flex;align-items:stretch;gap:4px;width:100%;box-sizing:border-box;',
        'height:56px;min-height:56px;padding:0 8px;background:transparent;',
        'border-bottom:1px solid rgba(201,164,92,.14)}',
        '.srs-tab-group{display:flex;align-items:stretch;gap:4px;flex:1 1 0;min-width:0;box-sizing:border-box}',
        '.srs-tab-group + .srs-tab-group{margin-left:8px}',
        // 按钮本体也是插画的一部分：每格是一块压在星空上的小卡（5% 金底 + 1px 半透明金边），
        // 选中升到 15% 底 + 亮金边 + 底下那道笔；不用实心色块，六格排满才不会花。
        '.srs-tab{flex:1 1 0;min-width:0;box-sizing:border-box;display:flex;flex-direction:column;align-items:center;',
        'justify-content:center;gap:4px;padding:8px 4px;border:0;border-radius:8px;',
        'background:rgba(201,164,92,.035);box-shadow:inset 0 0 0 1px rgba(201,164,92,.08);',
        'position:relative;color:rgba(232,221,198,.58);font-family:inherit;font-size:var(--srs-f12);line-height:1;',
        'font-weight:400;letter-spacing:0;text-shadow:none;cursor:pointer;',
        'transition:background-color 150ms ease,color 150ms ease,box-shadow 150ms ease}',
        '.srs-tab-lab{font-size:var(--srs-f12);line-height:1;white-space:nowrap}',
        // 图标是多色小画，颜色写在数据表里 —— 这里一个 stroke/fill/stroke-width 都不许写，
        // CSS 会盖掉元素上的同名属性，一写就把六枚全刷成同色线稿（第五版初稿就是这么翻车的）。
        // 层次全靠整枚的 opacity + 选中的 brightness。
        '.srs-tab-ic{width:24px;height:24px;display:block;flex:0 0 auto;opacity:.82;',
        'filter:url(#srs-wob) drop-shadow(0 1px 2px rgba(6,10,20,.55));',
        'transition:opacity 150ms ease}',
        '.srs-tab:hover .srs-tab-ic{opacity:.95}',
        '.srs-tab.on .srs-tab-ic{opacity:1;',
        'filter:url(#srs-wob) brightness(1.14) drop-shadow(0 1px 3px rgba(6,10,20,.6))}',
        // 笔触是 replaced element（<svg> 带 viewBox）：只给 left/right 时按 CSS2.1 §10.3.8
        // 会退到固有比例（9px 高 × 100:12 → 75px 宽），right 直接失效、笔捅出格边界。
        // 必须显式给 width，笔宽才真的是格的 76%（左端 12% 起）。
        '.srs-tab-wash{position:absolute;left:12%;width:76%;bottom:0;height:10px;opacity:0;',
        'transition:opacity 150ms ease;pointer-events:none}',
        '.srs-tab:hover{background:rgba(201,164,92,.09);color:var(--srs-parch);',
        'box-shadow:inset 0 0 0 1px rgba(201,164,92,.18)}',
        '.srs-tab:focus-visible{outline:1px solid var(--srs-gold-lit);outline-offset:-3px;color:var(--srs-parch)}',
        '.srs-tab.on{background:rgba(201,164,92,.15);color:var(--srs-parch);font-weight:600;',
        'box-shadow:inset 0 0 0 1px rgba(227,197,136,.34)}',
        '.srs-tab.on .srs-tab-ic{color:var(--srs-gold-lit)}',
        '.srs-tab.on .srs-tab-wash{opacity:1}',
        '.srs-menu{position:fixed;z-index:10000;min-width:180px;max-width:calc(100vw - 16px);box-sizing:border-box;padding:8px;',
        'background:rgba(18,24,41,.97);border:1px solid var(--srs-gold);border-radius:8px;',
        'box-shadow:0 14px 34px rgba(0,0,0,.55);pointer-events:auto;font-size:12px;color:#D6C1A6}',
'.srs-menu-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:5px 2px;line-height:1.4}',
'.srs-menu-row>span{min-width:0;overflow-wrap:break-word}',
'.srs-seg{display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end;margin-left:auto}',
'.srs-seg button{font-family:inherit;font-size:11px;padding:2px 6px;cursor:pointer;',
        'background:transparent;color:#C9BBA0;border:1px solid var(--srs-line);border-radius:4px}',
'.srs-seg button.on{border-color:var(--srs-gold-lit);color:#FFF3DA}',
'.srs-menu-act{font-family:inherit;font-size:12px;width:100%;text-align:left;cursor:pointer;',
        'background:transparent;color:#D6C1A6;border:0;padding:5px 2px;border-radius:4px}',
'.srs-menu-act:hover{background:rgba(201,164,92,.14);color:#FFF3DA}',
'.srs-menu-sep{height:1px;background:var(--srs-line);margin:6px 0}',
'.srs-menu-ver{font-size:11px;color:#94897A;padding:4px 2px 0}',
'.srs-div{display:block;width:100%;height:auto;margin:8px 0 2px;opacity:.9;pointer-events:none}',

        // ── 视觉重做（2026-11-17 晚）：更紧的字阶、卡片化分块、少描边 ──
        '.srs-panel{width:340px;border-radius:12px;border-color:rgba(201,164,92,.55);box-shadow:0 22px 54px rgba(0,0,0,.6)}',
        '.srs-head{padding:13px 16px 7px;cursor:grab;user-select:none}',
        '.srs-head:active{cursor:grabbing}',
        '.srs-head-pin{font-family:inherit;font-size:11px;line-height:1;padding:3px 7px;margin-right:7px;',
        'color:rgba(232,221,198,.62);background:rgba(201,164,92,.05);border:1px solid rgba(201,164,92,.3);',
        'border-radius:5px;cursor:pointer}',
        '.srs-head-pin:hover{color:#FFF3DA;border-color:rgba(227,197,136,.55)}',
        '.srs-title{font-size:15px;letter-spacing:.04em}',
        '.srs-x{font-size:15px;opacity:.75}',
        '.srs-x:hover{opacity:1}',
        '.srs-body{padding:10px 12px 12px;font-size:12.5px;line-height:1.7;overflow-y:auto;overflow-x:hidden;box-sizing:border-box;overflow-wrap:break-word}',
        '.srs-block{background:rgba(9,14,26,.42);border:1px solid rgba(201,164,92,.18);border-radius:10px;',
        'padding:9px 11px;margin-bottom:8px}',
        '.srs-block:last-of-type{margin-bottom:6px}',
        // 区块标题：15px 图标 + 11px 字（2026-11-17）。图标只存几何、颜色在这里给；
        // 开口图形由 .ln 关掉填充，否则会自动闭合填成怪多边形。
        '.srs-block-cap{display:flex;align-items:center;gap:6px;font-size:11px;color:var(--srs-gold);',
        'letter-spacing:.06em;margin-bottom:7px}',
        '.srs-cap-ic{width:16px;height:16px;flex:0 0 auto;stroke:var(--srs-gold);',
        'fill:rgba(201,164,92,.26);stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round;',
        'filter:url(#srs-wob)}',
        '.srs-cap-ic .ln{fill:none}',
        // 「牌阵」「历史」这类行内区块标签也配图标，但它们是 flex 行的左半边，
        // 得用 inline-flex 包住图标与文字，不能直接用 .srs-block-cap（那是整行标题）
        '.srs-row-cap{display:inline-flex;align-items:center;gap:5px;font-size:11.5px;color:#9A907C}',        '.srs-row-cap .srs-cap-ic{width:14px;height:14px}',
        '.srs-row-cap .srs-cap-ic{stroke:rgba(201,164,92,.85);fill:rgba(201,164,92,.2)}',
        '.srs-empty-ic{display:block;width:44px;height:44px;margin:2px auto 10px;',
        'stroke:rgba(201,164,92,.55);fill:rgba(201,164,92,.14);stroke-width:1.7;',
        'stroke-linecap:round;stroke-linejoin:round;filter:url(#srs-wob)}',
        '.srs-empty-ic .ln{fill:none}',
        '.srs-row{display:flex;align-items:baseline;justify-content:space-between;gap:10px;padding:2px 0;flex-wrap:wrap}',
        '.srs-row .k{flex:0 0 auto;white-space:nowrap}',
        '.srs-row .k{font-size:11.5px;color:#9A907C;white-space:nowrap}',
        '.srs-row .v{font-size:12.5px;color:#E8DDC6;text-align:right}',
        '.srs-note{font-size:12.5px;line-height:1.7;color:#D6C7AA;margin-top:7px}',
        '.srs-dom{display:grid;grid-template-columns:28px 58px 1fr;gap:7px;align-items:baseline;padding:2px 0}',
        '.srs-dom .k{font-size:11.5px;color:#9A907C}',
        '.srs-stars{font-size:11px;color:var(--srs-gold-lit);letter-spacing:1px}',
        '.srs-dom-t{font-size:11px;line-height:1.55;color:#B9AC93}',
        '.srs-signs{display:grid;grid-template-columns:repeat(6,1fr);gap:4px;margin-top:9px}',
        '.srs-signs button{font-family:inherit;font-size:10px;padding:2px 0;cursor:pointer;border-radius:5px;',
        'background:rgba(23,32,56,.7);color:#9A907C;border:1px solid rgba(201,164,92,.14)}',
        '.srs-signs button.on{color:#F2E6C8;border-color:var(--srs-gold)}',
        '.srs-swatch{height:4px;border-radius:2px;margin-top:9px;opacity:.85}',
        '.srs-witch{font-size:12px;color:#B9AC93;text-align:center;padding:4px 0 2px}',
        '.srs-menu-row{display:flex;align-items:baseline;justify-content:space-between;gap:10px;padding:3px 0}',
        '.srs-menu-row span:first-child{font-size:11.5px;color:#9A907C}',
        '.srs-menu-sub{font-size:12.5px;color:#E8DDC6;font-variant-numeric:tabular-nums}',
        '.srs-menu-warn{font-size:11.5px;color:#D9A489}',
        // 计费明细搜索框（仿青云剑仙的账本搜索）
        '.srs-search{margin:6px 0 8px}',
        '.srs-search input{width:100%;box-sizing:border-box;font-family:inherit;font-size:11.5px;color:#EFE3CB;'
        + 'background:rgba(12,18,32,.55);border:1px solid rgba(201,164,92,.22);border-radius:6px;padding:5px 8px;outline:none}',
        '.srs-search input:focus{border-color:rgba(227,197,136,.6)}',
        '.srs-search input::placeholder{color:#7E7565}',
        '.srs-menu-act{font-size:12.5px;padding:6px 2px;color:#E0D3B8}',
        '.srs-menu-act:hover{background:rgba(201,164,92,.12);color:#FFF3DA}',
        '.srs-seg button{font-size:10.5px;padding:3px 7px;border-radius:5px}',
        '.srs-strip{display:grid;grid-template-columns:repeat(30,1fr);gap:2px;margin:6px 0 8px}',
        '.srs-strip-cell{height:14px;border-radius:2px;border:1px solid transparent}',
        '.srs-strip-cell.on{border-color:var(--srs-gold-lit);box-shadow:0 0 0 1px rgba(227,197,136,.35)}',
        '.srs-cyc-line{font-size:11px;line-height:1.65;color:#B9AC93;margin-top:4px}',
        // ── 周期日历（安全期 / 易孕 / 排卵 / 黄体 / 经期）──
        '.srs-len{display:inline-flex;align-items:center;gap:5px}',
        '.srs-len input{width:56px;padding:3px 5px;box-sizing:border-box;font-family:inherit;font-size:12px;',
        'text-align:center;color:#E8DDC6;background:rgba(12,18,34,.8);border:1px solid rgba(201,164,92,.28);',
        'border-radius:5px}',
        '.srs-len em{font-style:normal;font-size:10.5px;color:#94897A}',
        '.srs-fz{letter-spacing:0;font-family:var(--srs-serif);font-size:12.5px;color:#EFE3CB}',
        '.srs-cal-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:10px 0 6px}',
        '.srs-cal-title{font-size:12px;color:var(--srs-gold);letter-spacing:.02em}',
        '.srs-cal-nav{font-family:inherit;font-size:13px;line-height:1;padding:2px 8px;cursor:pointer;',
        'color:var(--srs-gold);background:rgba(12,18,34,.6);border:1px solid rgba(201,164,92,.3);border-radius:5px}',
        '.srs-cal-nav:hover{color:var(--srs-gold-lit)}',
        '.srs-cal{display:grid;grid-template-columns:repeat(7,1fr);gap:3px}',
        '.srs-cal-w{text-align:center;font-size:10px;color:#8E8474;padding-bottom:2px}',
        '.srs-cal-cell{aspect-ratio:1/1;display:flex;align-items:center;justify-content:center;',
        'font-size:10.5px;border-radius:4px;border:1px solid rgba(201,164,92,.14);color:#C8BBA1;',
        'background:rgba(12,18,34,.55)}',
        '.srs-cal-cell.is-blank{background:transparent;border-color:transparent}',
        '.srs-cal-cell.is-today{outline:1px solid var(--srs-gold-lit);outline-offset:-1px;color:#F2E6C8}',
        // 五个阶段各自一个色相：经期红、排卵橙、易孕橘棕、黄体紫、安全青绿
        '.srs-cal-cell.st-period{background:rgba(168,68,75,.62);border-color:rgba(214,120,124,.55);color:#FBE9E6}',
        '.srs-cal-cell.st-ovu{background:rgba(217,134,60,.66);border-color:rgba(240,176,110,.6);color:#2A1C0C}',
        '.srs-cal-cell.st-fertile{background:rgba(176,115,72,.5);border-color:rgba(210,158,112,.5);color:#F6E9DD}',
        '.srs-cal-cell.st-luteal{background:rgba(110,99,150,.55);border-color:rgba(150,138,190,.5);color:#EDE8F8}',
        '.srs-cal-cell.st-safe{background:rgba(78,127,104,.5);border-color:rgba(116,168,143,.45);color:#E4F1E9}',
        '.srs-cal-legend,.srs-day-legend{display:flex;flex-wrap:wrap;gap:8px 10px;margin-top:8px}',
        '.srs-lg{display:inline-flex;align-items:center;gap:4px;font-size:10px;color:#A2998A}',
        '.srs-cal-dot{width:8px;height:8px;border-radius:2px;display:block}',
        '.srs-cal-dot.st-period{background:rgba(168,68,75,.85)}',
        '.srs-cal-dot.st-ovu{background:rgba(217,134,60,.9)}',
        '.srs-cal-dot.st-fertile{background:rgba(176,115,72,.8)}',
        '.srs-cal-dot.st-luteal{background:rgba(110,99,150,.85)}',
        '.srs-cal-dot.st-safe{background:rgba(78,127,104,.8)}',
        // W8 近 30 天：月相亮度做底、情绪做柱、睡眠一条顶线
        '.srs-days{display:grid;grid-template-columns:repeat(30,1fr);gap:2px;margin:8px 0 6px;height:64px;align-items:end}',
        '.srs-day-cell{position:relative;height:100%;border-radius:2px;background:rgba(255,255,255,.04);overflow:hidden}',
        '.srs-day-cell.is-period{outline:1px solid rgba(214,120,124,.65);outline-offset:-1px}',
        '.srs-days-axis{display:flex;justify-content:space-between;font-size:10px;color:#8E8474;'
        + 'margin:-4px 0 6px;font-variant-numeric:tabular-nums}',
        '.srs-day-moon{position:absolute;left:0;right:0;bottom:0;background:rgba(226,214,186,.20);display:block}',
        '.srs-day-mood{position:absolute;left:1px;right:1px;bottom:0;border-radius:2px 2px 0 0;display:block}',
        '.srs-day-mood.m1{background:rgba(178,92,80,.9)}',
        '.srs-day-mood.m2{background:rgba(186,120,96,.85)}',
        '.srs-day-mood.m3{background:rgba(150,140,120,.8)}',
        '.srs-day-mood.m4{background:rgba(186,160,110,.85)}',
        '.srs-day-mood.m5{background:rgba(201,164,92,.92)}',
        '.srs-day-sleep{position:absolute;left:1px;right:1px;top:0;height:2px;display:block}',
        '.srs-day-sleep.s1{background:rgba(190,110,100,.85)}',
        '.srs-day-sleep.s2{background:rgba(150,140,120,.5)}',
        '.srs-day-sleep.s3{background:rgba(120,168,143,.75)}',
        '.srs-day-dot{width:8px;height:8px;border-radius:2px;display:block}',
        '.srs-day-dot.m1{background:rgba(178,92,80,.9)}',
        '.srs-day-dot.m5{background:rgba(201,164,92,.92)}',
        // ── 婚配（乾/坤 合盘）──
        // 婚配输入行：标签自己占一行，日期 + 时辰在下一行右对齐 —— 挤在一行会把「乾（男）」压成两行
        '.srs-match-row{flex-wrap:wrap}',
        '.srs-match-row>span:first-child{white-space:nowrap;flex:0 0 auto}',
        '.srs-match-in{display:inline-flex;align-items:center;gap:5px;width:100%;justify-content:flex-end;margin-top:2px}',
        '.srs-match-in input[type=date]{width:126px}',
        '.srs-match-in select{font-family:inherit;font-size:11.5px;padding:3px 3px;color:#E8DDC6;max-width:118px;',
        'background:rgba(12,18,34,.8);border:1px solid rgba(201,164,92,.28);border-radius:5px}',
        '.srs-match-out{margin-top:10px;border-top:1px solid rgba(201,164,92,.16);padding-top:9px}',
        '.srs-match-score{display:flex;align-items:baseline;gap:6px;font-size:11.5px;color:#B9AC93}',
        '.srs-match-score b{font-family:var(--srs-serif);font-size:26px;line-height:1;color:var(--srs-gold-lit)}',
        '.srs-match-bar{height:5px;border-radius:3px;background:rgba(12,18,34,.75);margin:6px 0 8px;overflow:hidden}',
        '.srs-match-bar i{display:block;height:100%;border-radius:3px;',
        'background:linear-gradient(90deg,rgba(94,127,180,.9),rgba(201,164,92,.95))}',
        '.srs-match-fz{font-family:var(--srs-serif);font-size:11.5px;letter-spacing:.06em;color:#CFC3A8;margin-bottom:2px}',
        '.srs-match-item{display:flex;align-items:baseline;gap:6px;font-size:11px;line-height:1.7;',
        'padding:2px 0;border-bottom:1px dashed rgba(201,164,92,.1)}',
        '.srs-match-item .k{flex:0 0 84px;color:#A79C86}',
        '.srs-match-item .n{flex:1 1 auto;color:#D6C7AA;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
        '.srs-match-item .d{flex:0 0 auto;font-variant-numeric:tabular-nums}',
        '.srs-match-item .d.good{color:#8FC9A8}',
        '.srs-match-item .d.bad{color:#D98A8E}',
        '.srs-match-item .d.flat{color:#9A907C}',
        '.srs-match-cap{font-size:11px;color:var(--srs-gold);margin:9px 0 2px}',
        '.srs-perlist{margin-top:10px;border-top:1px solid rgba(201,164,92,.14);padding-top:8px}',
        '.srs-per-row,.srs-day-row{display:flex;align-items:center;justify-content:space-between;padding:2px 0;font-size:11.5px}',
        '.srs-per-row .k,.srs-day-row .k{color:#D6C7AA;font-variant-numeric:tabular-nums}',
        '.srs-per-del{font-family:inherit;font-size:10.5px;color:#9A907C;background:transparent;border:1px solid rgba(201,164,92,.16);',
        'border-radius:4px;padding:1px 7px;cursor:pointer}',
        '.srs-per-del:hover{color:#E8A98C;border-color:rgba(232,169,140,.5)}',
        // W17 许愿瓶
        '.srs-wishlist{margin-top:10px;border-top:1px solid rgba(201,164,92,.14);padding-top:8px}',
        '.srs-wish{position:relative;padding:6px 52px 6px 0;border-bottom:1px dashed rgba(201,164,92,.10)}',
        '.srs-wish:last-child{border-bottom:0}',
        '.srs-wish-head{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:11px}',
        '.srs-wish-head .k{color:#C7B896}',
        '.srs-wish-head .v{color:#8E8474}',
        '.srs-wish-head .v.is-due{color:#6FF0C2}',
        '.srs-wish-text{margin-top:5px;font-size:11.5px;line-height:1.6;color:#EFE3CB;white-space:pre-wrap;word-break:break-word}',
        '.srs-wish-meta{margin-top:4px;font-size:10px;color:#7E7565}',
        '.srs-wish .srs-per-del{position:absolute;right:0;top:6px}',
        '.srs-spread-wrap{flex-wrap:wrap;gap:6px;justify-content:flex-start}',
        '.srs-spread-wrap .srs-sp-cell{width:calc((100% - 18px) / 4)}',
        // 凯尔特十字十张：5 列 × 2 行，正好铺满
        '.srs-celtic .srs-sp-cell{width:calc((100% - 24px) / 5)}',
        '.srs-celtic .srs-sp-name{font-size:10px}',
        // 牌库格子：button 元素要脱掉默认按钮皮，只留牌面 + 编号 + 牌名
        '.srs-deck-cell{background:none;border:0;padding:0;display:flex;flex-direction:column;align-items:center;gap:2px;cursor:pointer;color:inherit;font:inherit}',
        '.srs-deck-cell:hover .srs-sp-img{filter:brightness(1.1)}',
        '.srs-spread-wrap .srs-sp-img{width:100%}',
        '.srs-spread-wrap .srs-flip{width:100%}',
        '.srs-daily{display:flex;gap:10px;align-items:flex-start}',
        '.srs-daily-card{width:76px;height:auto;border:1px solid var(--srs-gold);border-radius:4px;flex:0 0 auto}',
        '.srs-daily-txt{flex:1 1 auto;min-width:0}',
        '.srs-daily-name{font-family:var(--srs-serif);font-size:13px;color:#EFE3CB;margin-bottom:4px}',
        '.srs-daily-lucky{display:flex;align-items:center;gap:6px;font-size:11px;color:#B9AC93;margin-top:6px}',
        '.srs-swatch-inl{width:14px;height:14px;border-radius:3px;margin:0}',
        '.srs-daily-tip{font-size:11px;color:#94897A;margin-top:6px}',
        '.srs-row-tight{padding:1px 0}',
        '.srs-seg-wrap{flex-wrap:wrap;gap:3px;justify-content:flex-end}',
        '.srs-seg-wrap button{font-size:var(--srs-f12);padding:3px 6px}',
        '.srs-area{width:100%;box-sizing:border-box;font-family:inherit;font-size:12px;line-height:1.7;padding:8px;',
        'color:#E8DDC6;background:rgba(12,18,34,.8);border:1px solid rgba(201,164,92,.22);border-radius:8px;resize:vertical}',
        // 用 translate 属性而不是 transform：舞台上的 transform 要留给 scale()
        // 睡觉时呼吸放慢：只改 duration，不换动画名，避免 restart
        '.srs-breathe-slow .srs-sprite{animation-duration:7.2s}',
        '@keyframes srs-breathe{0%,100%{translate:0 0}50%{translate:0 -2.5px}}',
        '.srs-hist-day{margin-bottom:2px}',
        '.srs-hist-row{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:2px 0}',
        '.srs-hist-name{font-size:12px;color:#D6C7AA;flex:1 1 auto}',
        '.srs-hist-num{font-size:11px;color:#9A907C;flex:0 0 auto}',
        '.srs-pickgrid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;justify-content:center;padding:4px 0 6px}',
        '.srs-pickcard{aspect-ratio:2/3;border:1px solid rgba(201,164,92,.55);border-radius:8px;cursor:pointer;',
        'background-color:#1B2340;background-size:cover;background-position:center;',
        'transition:transform .15s ease-out,border-color .15s}',
        '.srs-pickcard:hover{transform:translateY(-3px);border-color:var(--srs-gold-lit)}',
        // 三张牌阵：九张排成 5 列，给下面的等待区腾高度
        '.srs-pickgrid.is-three{grid-template-columns:repeat(5,1fr);gap:6px}',
        '.srs-pickcard{position:relative}',
        // 挑中的格子仍是牌背（牌面等「翻开」才出），只标序号 + 变亮描边
        '.srs-pickcard.is-picked{border-color:var(--srs-gold-lit);',
        'box-shadow:0 0 0 1px rgba(227,197,136,.55),0 6px 14px rgba(0,0,0,.55);cursor:default}',
        '.srs-pickcard.is-picked::after{content:attr(data-ord);position:absolute;right:5px;top:3px;',
        'font-size:12px;font-weight:600;color:#FFF3DA;text-shadow:0 1px 3px #000}',
        '.srs-pickcard.is-picked:hover{transform:none}',
        '.srs-pickcard.is-locked{filter:saturate(.4) brightness(.55);cursor:default}',
        '.srs-pickcard.is-locked:hover{transform:none}',
        '.srs-wait{margin-top:10px;padding-top:8px;border-top:1px solid rgba(201,164,92,.18)}',
        '.srs-wait-cap{font-size:11px;color:var(--srs-muted);letter-spacing:.06em}',
        '.srs-wait-row{display:flex;gap:10px;margin-top:6px}',
        '.srs-wait-cell{width:58px}',
        '.srs-wait-img{width:58px;height:87px;object-fit:cover;border-radius:4px;display:block;',
        'border:1px solid rgba(201,164,92,.5);background:#141A2C;box-shadow:0 4px 10px rgba(0,0,0,.5)}',
        '.srs-wait-lab{font-size:11px;color:#E7D9BC;text-align:center;margin-top:3px;letter-spacing:.04em}',
        '.srs-btn.is-reveal{color:#1A1206;background-image:none;',
        'background:linear-gradient(180deg,#EBD69F,#C9A45C);border:1px solid #F1E0B4;',
        'box-shadow:0 0 14px rgba(227,197,136,.35)}',
        '.srs-moods{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:8px}',
        '.srs-moods button{font-family:inherit;font-size:12px;padding:7px 0;cursor:pointer;border-radius:8px;',
        'background:rgba(23,32,56,.7);color:#C7BBA1;border:1px solid rgba(201,164,92,.18)}',
        '.srs-moods button:hover{border-color:rgba(201,164,92,.5);color:#F2E6C8}',
        '.srs-moods button.on{color:#F6EAD0;border-color:var(--srs-gold);background:rgba(201,164,92,.16)}',
        // ── 计费页：余额只作对照，钱按真实 usage 记 ──
        '.srs-bill-hero{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;padding:2px 0 8px}',
        '.srs-bill-left{min-width:0;flex:1 1 auto}',
        '.srs-bill-cap{font-size:10.5px;letter-spacing:.16em;color:#8E8474;margin-bottom:4px}',
        '.srs-bill-num{font-family:var(--srs-serif);font-size:27px;line-height:1;color:#F7EBD0;',
        'font-variant-numeric:tabular-nums;letter-spacing:.01em}',
        '.srs-bill-num small{font-size:14px;color:var(--srs-gold-lit);margin-right:2px;vertical-align:1px}',
        '.srs-bill-num.is-dim{opacity:.5}',
        '.srs-bill-sub{font-size:10.5px;line-height:1.55;color:#8E8474;font-variant-numeric:tabular-nums}',
        '.srs-mini{font-family:inherit;font-size:11px;padding:3px 9px;cursor:pointer;border-radius:6px;white-space:nowrap;',
        'color:#DCCBA8;background:rgba(201,164,92,.08);border:1px solid rgba(201,164,92,.30)}',
        '.srs-mini:hover{color:#FFF3DA;border-color:rgba(227,197,136,.6)}',
        '.srs-mini:disabled{opacity:.55;cursor:default}',
        '.srs-kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}',
        '.srs-kpi{padding:6px 7px 7px;border-radius:8px;background:rgba(9,14,26,.46);border:1px solid rgba(201,164,92,.16)}',
        '.srs-kpi .k{font-size:10px;color:#8E8474;letter-spacing:.04em}',
        '.srs-kpi .v{margin-top:3px;font-size:13.5px;color:#EBDCBE;font-variant-numeric:tabular-nums}',
        '.srs-bill-note{font-size:10.5px;line-height:1.6;color:#8E8474;margin-top:6px}',
        '.srs-bill-peak{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:9px}',
        '.srs-chip{display:inline-flex;align-items:center;font-size:10px;padding:2px 7px;border-radius:999px;',
        'color:#C9BBA0;background:rgba(201,164,92,.07);border:1px solid rgba(201,164,92,.26);white-space:nowrap}',
        // 峰谷那一枚要一眼看见：高峰用珊瑚橙、谷价用薄荷青（2026-11-18 主人：换成鲜艳的）
        '.srs-chip.is-peak{color:#FFB08A;background:rgba(255,122,74,.18);border-color:rgba(255,138,91,.68);',
        'text-shadow:0 0 10px rgba(255,138,91,.42)}',
        '.srs-chip.is-valley{color:#6FF0C2;background:rgba(63,224,176,.14);border-color:rgba(91,231,176,.56);',
        'text-shadow:0 0 10px rgba(91,231,176,.34)}',
        '.srs-bars{display:flex;align-items:flex-end;gap:5px;height:48px;margin:2px 0}',
        '.srs-bar{flex:1 1 0;min-width:0;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:3px}',
        '.srs-bar i{display:block;width:100%;border-radius:2px 2px 0 0;',
        'background:linear-gradient(180deg,rgba(227,197,136,.55),rgba(201,164,92,.18))}',
        '.srs-bar.today i{background:linear-gradient(180deg,#E9CB92,rgba(201,164,92,.45));',
        'box-shadow:0 0 10px rgba(227,197,136,.28)}',
        '.srs-bar span{font-size:9px;color:#7C7364;font-variant-numeric:tabular-nums}',
        '.srs-bill-caprow{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:11px 0 4px}',
        '.srs-head-right{display:flex;align-items:center;gap:7px;flex:0 0 auto}',
        '.srs-head-bill{font-family:inherit;font-size:10.5px;line-height:1;padding:4px 8px;border-radius:999px;cursor:pointer;',
        'color:#D9C8A6;background:rgba(201,164,92,.08);border:1px solid rgba(201,164,92,.28);white-space:nowrap;',
        'font-variant-numeric:tabular-nums;transition:color .16s ease-out,border-color .16s ease-out}',
        '.srs-head-bill:hover{color:#FFF3DA;border-color:rgba(227,197,136,.62)}',
        '.srs-mrow{display:flex;align-items:center;gap:8px;padding:3px 0;font-size:11px}',
        '.srs-mrow .n{flex:0 0 auto;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#CFC3A9}',
        '.srs-mrow .bar{flex:1 1 auto;height:4px;border-radius:2px;background:rgba(201,164,92,.12);overflow:hidden}',
        '.srs-mrow .bar i{display:block;height:100%;background:linear-gradient(90deg,rgba(201,164,92,.5),rgba(227,197,136,.95))}',
        '.srs-mrow .a{flex:0 0 auto;color:#E8DDC6;font-variant-numeric:tabular-nums}',
        '.srs-items{margin-top:2px}',
        '.srs-item{display:flex;align-items:baseline;gap:8px;padding:4px 0;border-bottom:1px dashed rgba(177,146,106,.13);font-size:11px}',
        '.srs-item:last-child{border-bottom:0}',
        '.srs-item .t{flex:0 0 52px;color:#7C7364;font-variant-numeric:tabular-nums}',
        '.srs-item .m{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#CFC3A9}',
        '.srs-item .a{flex:0 0 auto;color:#EBDCBE;font-variant-numeric:tabular-nums}',
        // ── 插画小卡按钮族（2026-11-17 第八版）───────────────────────
        // 面板里散着六种细边框透明小按钮（段选 / 星座格 / 心情 / 删除 / 副按钮组），
        // 各自定义过颜色，压在星空底上又细又淡，跟新菜单栏的卡不是一套语言。
        // 这一块必须写在样式数组末尾：前面同名规则特异性一样，只有靠后置才盖得住。
        // 规格与菜单栏 tab 卡同族：3.5% 金底 + 9% 金边 + 6px 圆角 + 一道 5% 的顶部纸光。
        '.srs-seg button,.srs-signs button,.srs-moods button,.srs-per-del,.srs-row2 button{',
        'font-family:inherit;cursor:pointer;border-radius:6px;color:rgba(232,221,198,.72);',
        'background:rgba(201,164,92,.035);border:1px solid rgba(201,164,92,.09);',
        'box-shadow:inset 0 1px 0 rgba(255,243,218,.05);',
        'transition:background-color 150ms ease,border-color 150ms ease,color 150ms ease}',
        '.srs-seg button:hover,.srs-signs button:hover,.srs-moods button:hover,',
        '.srs-row2 button:hover{background:rgba(201,164,92,.10);border-color:rgba(201,164,92,.24);',
        'color:var(--srs-parch)}',
        '.srs-seg button:disabled{opacity:.45;cursor:default}',
        // 选中：底提亮一档、边框转亮金、字转米白并加粗
        '.srs-seg button.on,.srs-signs button.on,.srs-moods button.on,.srs-row2 button.is-ok{',
        'background:rgba(201,164,92,.17);border-color:rgba(227,197,136,.4);',
        'color:#FFF3DA;font-weight:600}',
        // 副按钮组里的主选项（保存 / 设置密码这类）
        '.srs-row2 button.p{background:rgba(201,164,92,.13);border-color:rgba(227,197,136,.34);',
        'color:#FFF3DA}',
        '.srs-row2 button.p:hover{background:rgba(201,164,92,.2);border-color:rgba(227,197,136,.5)}',
        // 删除是危险动作，留在这一族里但用暖红——不跟着金卡走
        '.srs-per-del:hover{color:#E8A98C;border-color:rgba(232,169,140,.5);',
        'background:rgba(232,169,140,.08)}',
        // 尺寸沿用各自原来的字阶，只换皮
        '.srs-seg button{font-size:10.5px;padding:3px 7px}',
        // 塔罗页底部「N 条 / 牌库 / 存图 / 3:4」：这一行是页面级入口，比行内小开关重要，单独放大一档
        '.srs-seg-lg button{font-size:var(--srs-f12);padding:4px 9px;color:rgba(232,221,198,.82)}',
        '.srs-seg-lg button:disabled{opacity:.58}',
        '.srs-seg-wrap button{font-size:var(--srs-f12);padding:3px 6px}',
        // ── 整行动作：不套卡片框，做成「标签 + 铜开关」的行 ──────────
        // 第五版给整行按钮也套了边框，结果「音效总开关」变成一个右侧全空的大方框，
        // 像输入框 —— 这行本来要表达的是"开没开"，所以右侧该放一枚开关，不是一圈边框。
        '.srs-menu-act{font-family:inherit;cursor:pointer;width:100%;text-align:left;',
        'font-size:12.5px;padding:6px 8px;border-radius:6px;color:#E0D3B8;',
        'background:transparent;border:1px solid transparent;',
        'transition:background-color 150ms ease,border-color 150ms ease,color 150ms ease}',
        '.srs-menu-act:hover{background:rgba(201,164,92,.08);border-color:rgba(201,164,92,.16);',
        'color:var(--srs-parch)}',
        // 带图标的整行动作：图标 + 文字同一基线，给「编辑台词…」这类纯文字入口一个抓手
        '.srs-menu-act-ic{display:flex;align-items:center;gap:7px}',
        '.srs-menu-act-ic .srs-cap-ic{width:16px;height:16px}',
        '.srs-menu-act-ic .t{color:#EFE3CB}',
        // 说明文字的次级档：比 .srs-note 小一档、更淡，别跟正文抢注意力
        '.srs-note-s{font-size:11px;line-height:1.6;color:#A2998A;margin-top:4px}',
        '.srs-menu-act.srs-switch{display:flex;align-items:center;justify-content:space-between;gap:8px}',
        '.srs-switch .sw{flex:0 0 auto;width:34px;height:18px;border-radius:9px;',
        'background:rgba(201,164,92,.13);box-shadow:inset 0 1px 2px rgba(6,10,20,.45);',
        'position:relative;transition:background-color 150ms ease}',
        '.srs-switch .sw::after{content:"";position:absolute;top:2px;left:2px;width:14px;height:14px;',
        'border-radius:50%;background:linear-gradient(180deg,#B8965A,#8E7442);',
        'box-shadow:0 1px 2px rgba(6,10,20,.5);transition:transform 150ms ease}',
        '.srs-switch.on .sw{background:rgba(227,197,136,.34)}',
        '.srs-switch.on .sw::after{background:linear-gradient(180deg,#F6E9C6,#D9B978)}',
        '.srs-switch.on .sw::after{transform:translateX(16px)}',
        '.srs-switch .t{white-space:nowrap}',
        // ── 底部动作条（2026-11-17 第九版）───────────────────────────
        // 「抽三张 / 收起 / 抽七张 / 明天再来」一直没进插画族：它们靠一张 btn-normal.webp 位图，
        // 四颗长得一模一样 —— 没有主次，也没跟新 tab 卡同族。主人截图点名了这三种。
        // 现在分三层：次操作（3.5% 底 + 9% 边）、主操作（14% 底 + 38% 亮金边 + 米白 600）、
        // 待确认 reveal（满金渐变 + 深字，全界面唯一最强动作，必须排在最后才盖得住）。
        '.srs-btn{flex:1;font-family:inherit;font-size:13px;padding:9px 0;cursor:pointer;position:relative;',
        'color:rgba(232,221,198,.78);border:1px solid rgba(201,164,92,.12);border-radius:8px;',
        'background:rgba(201,164,92,.035);background-image:none;',
        'box-shadow:inset 0 1px 0 rgba(255,243,218,.05);',
        'transition:background-color 150ms ease,border-color 150ms ease,color 150ms ease}',
        '.srs-btn:hover{background:rgba(201,164,92,.10);border-color:rgba(201,164,92,.24);color:#FFF6E2}',
        '.srs-btn:active{background:rgba(201,164,92,.07)}',
        '.srs-btn.primary{background:rgba(201,164,92,.14);border-color:rgba(227,197,136,.38);',
        'color:#FFF3DA;font-weight:600}',
        '.srs-btn.primary:hover{background:rgba(201,164,92,.22);border-color:rgba(227,197,136,.55)}',
        '.srs-btn.is-reveal{color:#1A1206;font-weight:600;background-image:none;',
        'background:linear-gradient(180deg,#EBD69F,#C9A45C);border:1px solid #F1E0B4;',
        'box-shadow:0 0 14px rgba(227,197,136,.35)}',
        '.srs-btn.is-reveal:hover{background:linear-gradient(180deg,#F3E3B4,#D6B268)}',
        // 禁用必须写在最后，否则 .primary 的特异性更高会盖掉它（「明天再来」就是这条）
        '.srs-btn:disabled,.srs-btn.primary:disabled{opacity:.42;cursor:default;filter:none;',
        'background:rgba(201,164,92,.02);border-color:rgba(201,164,92,.08);',
        'color:rgba(232,221,198,.5);font-weight:400;box-shadow:none}',
        // ── 回顾 / 命名 / 穿搭 / 安神（2026-11-18 第十五版）─────────────
        // 全是同族材质：3.5% 金底 + 9% 金边，不新增色相；间距走 6/8/12 三档，与面板其余部分同节奏
        '.srs-review{margin-top:6px}',
        '.srs-review-row{display:flex;align-items:baseline;justify-content:space-between;gap:8px;',
        'padding:5px 0;border-bottom:1px solid rgba(201,164,92,.10)}',
        '.srs-review-row .k{font-size:12.5px;color:var(--srs-parch)}',
        '.srs-review-row .v{font-size:12px;color:var(--srs-gold);font-variant-numeric:tabular-nums}',
        '.srs-review-line{font-size:12.5px;line-height:1.7;color:#D6C1A6;padding:4px 0}',
        // 详版「另一向」：同一张牌的正/逆各三句，压一档色，别跟当前方向的判词抢
        '.srs-lines-alt{margin-top:2px}',
        '.srs-lines-alt p{color:#BDB096}',
        '.srs-lines-alt .srs-other-cap{color:var(--srs-gold);font-size:12px;margin-top:4px}',        '.srs-hist-rename{display:flex;align-items:center;gap:4px;min-width:0;flex:1 1 auto}',
        '.srs-inp-s{font-family:inherit;font-size:12px;color:var(--srs-parch);min-width:0;width:100%;',
        'background:rgba(12,18,33,.9);border:1px solid rgba(201,164,92,.34);border-radius:6px;padding:3px 6px}',
        '.srs-inp-s:focus{outline:none;border-color:var(--srs-gold-lit)}',
        '.srs-wear{display:flex;flex-direction:column;gap:6px;margin-top:4px}',
        '.srs-wear-row{display:grid;grid-template-columns:18px 1fr;gap:8px;align-items:center}',
        '.srs-wear-chip{width:18px;height:18px;border-radius:5px;grid-row:span 2;',
        'border:1px solid rgba(232,221,198,.28)}',
        '.srs-wear-row .k{font-size:12.5px;color:var(--srs-parch)}',
        '.srs-wear-how{grid-column:2;font-size:11px;line-height:1.6;color:#A2998A}',
        '.srs-breathe-box{display:flex;flex-direction:column;align-items:center;gap:10px;padding:8px 0}',
        '.srs-breathe-ring{width:132px;height:132px;border-radius:50%;display:flex;align-items:center;',
        'justify-content:center;position:relative;border:1px solid rgba(201,164,92,.34)}',
        '.srs-breathe-mid{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;',
        'justify-content:center;gap:2px;pointer-events:none}',
        '.srs-breathe-core{width:96px;height:96px;border-radius:50%;',
        'background:radial-gradient(circle at 50% 40%,rgba(227,197,136,.36),rgba(201,164,92,.10) 70%);',
        'transition:transform 3.2s ease-in-out}',
        '.srs-breathe-core.ph-in,.srs-breathe-core.ph-hold{transform:scale(1.18)}',
        '.srs-breathe-core.ph-out{transform:scale(.82)}',
        '.srs-breathe-phase{font-size:15px;color:var(--srs-parch)}',
        '.srs-breathe-left{font-size:12px;color:var(--srs-gold);font-variant-numeric:tabular-nums}',
        // 环境音景八套：两列小格，选中 17% 金底 + 亮金边（与牌阵/星座的小按钮同族）
        '.srs-amb-grid{display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-top:6px}',
        '.srs-amb-grid button{font-family:inherit;font-size:12px;padding:5px 6px;cursor:pointer;',
        'color:rgba(232,221,198,.78);background:rgba(201,164,92,.035);border:1px solid rgba(201,164,92,.10);',
        'border-radius:6px;transition:background-color 150ms ease,border-color 150ms ease,color 150ms ease}',
        '.srs-amb-grid button.on{background:rgba(201,164,92,.17);border-color:rgba(227,197,136,.40);color:#FFF6E2}',
        // 人物姿态 16 格（自动 + 14 张）：三列，名字短的也放得下
        '.srs-pose-grid{grid-template-columns:repeat(3,1fr)}',
        '.srs-pose-grid button{font-size:11.5px;padding:5px 4px;text-align:center}',
        '@media (prefers-reduced-motion: reduce){',
        '.srs-sprite,.srs-bubble,.srs-stage,.srs-panel,.srs-tab,.srs-tab-wash{transition:none!important;animation:none!important}',
        '.srs-shuf i{animation:none!important}',
        '.srs-breathe-core{transition:none!important}',
        '.srs-flip-in{animation:none!important;transform:rotateY(180deg)!important}',
        '.srs-fadein{animation:none!important}}',
      ].join('');
      const el = document.createElement('style');
      el.id = STYLE_ID;
      el.textContent = css;
      document.head.appendChild(el);
      // 旧版本残留的样式表顺手清掉，免得两套规则打架
      Array.prototype.slice.call(document.querySelectorAll('style[id^="srs-style"]')).forEach((old) => {
        if (old.id !== STYLE_ID && old.parentNode) old.parentNode.removeChild(old);
      });
    }


    // ── 计费：数字全部来自宿主账本（/srs/billing.json · /srs/usage.json）──
    // 上一版把「今日/本月已用」放在本地 localStorage 里按余额快照差算：
    // 快照会串进别的客户端、漏掉窗口，还看不出钱花在哪。现在宿主逐轮记真实 usage。
    // 旧键顺手清掉，免得界面里还留着一份会误导人的旧数字。
    try { window.localStorage.removeItem('srs.ledger.v1'); } catch (error) { /* 忽略 */ }

    // ── 私密数据：PBKDF2 派生 + AES-GCM ──────────────────────────────
    const PRIV_KEY = 'srs.private.v1';
    const PROFILE_KEY = 'srs.profile.v1';
    const MATCH_KEY = 'srs.match.v1';   // 婚配的双方输入（不是医疗数据，走普通存储）

    function b64(buf) {
      const bytes = new Uint8Array(buf);
      let str = '';
      for (let i = 0; i < bytes.length; i += 1) str += String.fromCharCode(bytes[i]);
      return window.btoa(str);
    }

    function unb64(str) {
      const raw = window.atob(str);
      const out = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
      return out;
    }

    async function deriveKey(pin, salt) {
      const enc = new window.TextEncoder();
      const base = await window.crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveKey']);
      return window.crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt: salt, iterations: 120000, hash: 'SHA-256' },
        base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
      );
    }

    async function encryptPrivate(pin, obj) {
      const salt = window.crypto.getRandomValues(new Uint8Array(16));
      const iv = window.crypto.getRandomValues(new Uint8Array(12));
      const key = await deriveKey(pin, salt);
      const enc = new window.TextEncoder();
      const buf = await window.crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, enc.encode(JSON.stringify(obj)));
      window.localStorage.setItem(PRIV_KEY, JSON.stringify({ v: 1, salt: b64(salt), iv: b64(iv), data: b64(buf) }));
    }

    async function decryptPrivate(pin) {
      const raw = window.localStorage.getItem(PRIV_KEY);
      if (!raw) return null;
      const box = JSON.parse(raw);
      const key = await deriveKey(pin, unb64(box.salt));
      const buf = await window.crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(box.iv) }, key, unb64(box.data));
      return JSON.parse(new window.TextDecoder().decode(buf));
    }

    function hasPrivate() { try { return !!window.localStorage.getItem(PRIV_KEY); } catch (error) { return false; } }

    // ── 本命牌：生日 → 大阿卡纳（0–21）──────────────────────────────
    function birthCard(birth) {
      if (!birth) return null;
      const parts = String(birth).split('-').map((x) => parseInt(x, 10));
      if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return null;
      let sum = parts[0] + parts[1] + parts[2];
      while (sum > 21) {
        sum = String(sum).split('').reduce((a, c) => a + parseInt(c, 10), 0);
      }
      const card = (DECK.cards || []).find((c) => c.kind === 'major' && c.number === sum);
      return card || null;
    }

    // ── 四柱（八字）：年按立春、月按节、日按儒略日、时按五鼠遁 ──────
    // 口径：节气由低精度太阳视黄经算（误差约 ±2 分钟），时区按东八区平太阳时，
    // 不做真太阳时校正；出生时刻没填就只有三柱。够自用参考，面板上会照实写清楚。
    const GAN = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
    const ZHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
    // 十二节：寅月起点是立春（黄经 315°），之后每 30° 一节
    const JIE = [
      ['立春', 315], ['惊蛰', 345], ['清明', 15], ['立夏', 45], ['芒种', 75], ['小暑', 105],
      ['立秋', 135], ['白露', 165], ['寒露', 195], ['立冬', 225], ['大雪', 255], ['小寒', 285],
    ];

    // 太阳视黄经（度）：NOAA 简化式，误差 < 0.05°，判节气日足够
    function sunLongitude(ms) {
      const jd = ms / 86400000 + 2440587.5;
      const n = jd - 2451545.0;
      const L = ((280.460 + 0.9856474 * n) % 360 + 360) % 360;
      const g = (((357.528 + 0.9856003 * n) % 360) + 360) % 360 * Math.PI / 180;
      const lambda = L + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g);
      return ((lambda % 360) + 360) % 360;
    }

    // 某年某月（monthIdx 0=一月）那个「节」的时刻（UTC ms）：二分求黄经到点
    function jieTime(year, monthIdx) {
      const target = JIE[(monthIdx + 11) % 12][1];   // 一月→小寒，二月→立春…
      let lo = Date.UTC(year, monthIdx, 1, 0, 0, 0);
      let hi = Date.UTC(year, monthIdx, 12, 0, 0, 0);
      const delta = (ms) => {
        let d = sunLongitude(ms) - target;
        while (d > 180) d -= 360;
        while (d < -180) d += 360;
        return d;
      };
      for (let i = 0; i < 42; i += 1) {
        const mid = (lo + hi) / 2;
        if (delta(mid) < 0) lo = mid; else hi = mid;
      }
      return lo;
    }

    // 公历 → 儒略日数（整数，中午基准）
    function jdnOf(y, m, d) {
      const a = Math.floor((14 - m) / 12);
      const yy = y + 4800 - a;
      const mm = m + 12 * a - 3;
      return d + Math.floor((153 * mm + 2) / 5) + 365 * yy
        + Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) - 32045;
    }

    // 生日（+ 可选时刻）→ 四柱。晚子时按次日算，与时柱口径一致
    function fourPillars(birth, timeStr) {
      if (!birth) return null;
      const p = String(birth).split('-').map((x) => parseInt(x, 10));
      if (p.length !== 3 || p.some((n) => !Number.isFinite(n))) return null;
      const y0 = p[0]; const m0 = p[1]; const d0 = p[2];
      let hh = null; let mi = 0;
      if (timeStr && /^\d{1,2}:\d{2}/.test(String(timeStr))) {
        hh = parseInt(String(timeStr).slice(0, 2), 10);
        mi = parseInt(String(timeStr).slice(3, 5), 10) || 0;
      }
      const lateZi = hh !== null && hh >= 23;
      // 年柱 / 月柱的节气分界必须按「真实出生时刻」比 —— 晚子时只把日柱推到次日（与时柱同口径），
      // 若把日期一起 +1 再比立春 / 节，出生在节气前几小时的晚子时会被误判进下一年 / 下一月
      const atReal = new Date(y0, m0 - 1, d0, hh === null ? 12 : hh, mi, 0, 0);
      // 年柱：立春分界
      const yearForPillar = atReal.getTime() < jieTime(y0, 1) ? y0 - 1 : y0;
      const yearIdx = (((yearForPillar - 4) % 60) + 60) % 60;
      // 月柱：本月节已过用本月建，没过还用上一个月建；寅=0 … 丑=11
      const passed = atReal.getTime() >= jieTime(y0, m0 - 1);
      const buildNow = ((m0 - 2) + 12) % 12;
      const build = passed ? buildNow : (buildNow + 11) % 12;
      const yearGan = yearIdx % 10;
      const yinGan = (yearGan % 5) * 2 + 2;          // 五虎遁：甲己丙作首
      const monthGan = (yinGan + build) % 10;
      // 日柱：儒略日数 + 49 起甲子
      const dayIdx = ((jdnOf(y0, m0, d0 + (lateZi ? 1 : 0)) + 49) % 60 + 60) % 60;
      const pillars = [
        GAN[yearIdx % 10] + ZHI[yearIdx % 12],
        GAN[monthGan] + ZHI[(build + 2) % 12],
        GAN[dayIdx % 10] + ZHI[dayIdx % 12],
      ];
      const ganIdx = [yearIdx % 10, monthGan, dayIdx % 10];
      const zhiIdx = [yearIdx % 12, (build + 2) % 12, dayIdx % 12];
      if (hh !== null) {
        const zhiIdxH = Math.floor(((hh + 1) % 24) / 2);
        const hourGan = (((dayIdx % 10) % 5) * 2 + zhiIdxH) % 10;
        pillars.push(GAN[hourGan] + ZHI[zhiIdxH]);
        ganIdx.push(hourGan);
        zhiIdx.push(zhiIdxH);
      }
      return { pillars, timeKnown: hh !== null, yearIdx, dayIdx, ganIdx, zhiIdx };
    }

    // ── 婚配（合婚）：只看双方八字的结构关系，只给倾向与建议 ──────────
    // 口径写死在这里，面板上照实写：年支看生肖、日支看配偶宫、日干看五行生克、
    // 年柱纳音按六十甲子、最后看五行互补。不出「他爱不爱你」这类判断。
    const NAYIN = ['海中金', '炉中火', '大林木', '路旁土', '剑锋金', '山头火', '涧下水', '城头土', '白蜡金', '杨柳木',
      '泉中水', '屋上土', '霹雳火', '松柏木', '长流水', '沙中金', '山下火', '平地木', '壁上土', '金箔金',
      '覆灯火', '天河水', '大驿土', '钗钏金', '桑柘木', '大溪水', '沙中土', '天上火', '石榴木', '大海水'];
    const GAN_WX = ['木', '木', '火', '火', '土', '土', '金', '金', '水', '水'];
    const ZHI_WX = ['水', '土', '木', '木', '土', '火', '火', '土', '金', '金', '土', '水'];
    // 相生：木→火→土→金→水→木；相克：木→土→水→火→金→木
    const WX_SHENG = { 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' };
    const WX_KE = { 木: '土', 土: '水', 水: '火', 火: '金', 金: '木' };
    const LIUHE = [['子', '丑'], ['寅', '亥'], ['卯', '戌'], ['辰', '酉'], ['巳', '申'], ['午', '未']];
    const SANHE = [['申', '子', '辰'], ['亥', '卯', '未'], ['寅', '午', '戌'], ['巳', '酉', '丑']];
    const LIUCHONG = [['子', '午'], ['丑', '未'], ['寅', '申'], ['卯', '酉'], ['辰', '戌'], ['巳', '亥']];
    const LIUHAI = [['子', '未'], ['丑', '午'], ['寅', '巳'], ['卯', '辰'], ['申', '亥'], ['酉', '戌']];
    // 三刑 + 自刑（只取两两相遇的那几对，够用）
    const XING = [['寅', '巳'], ['巳', '申'], ['申', '寅'], ['丑', '戌'], ['戌', '未'], ['未', '丑'],
      ['子', '卯'], ['卯', '子'], ['辰', '辰'], ['午', '午'], ['酉', '酉'], ['亥', '亥']];

    function hasPair(list, a, b) {
      return list.some((p) => (p[0] === a && p[1] === b) || (p[0] === b && p[1] === a));
    }

    // 两支相遇：合 > 三合 > 中性 > 刑 / 害 / 冲（数字是权重，面板上会逐条列出来）
    function zhiPair(a, b) {
      if (hasPair(LIUHE, a, b)) return { delta: 12, note: '六合', tag: 'good' };
      if (SANHE.some((g) => g.indexOf(a) >= 0 && g.indexOf(b) >= 0)) return { delta: 10, note: '三合', tag: 'good' };
      if (a === b) return { delta: 2, note: '同支（并列）', tag: 'flat' };
      if (hasPair(LIUCHONG, a, b)) return { delta: -10, note: '相冲', tag: 'bad' };
      if (hasPair(XING, a, b)) return { delta: -8, note: '相刑', tag: 'bad' };
      if (hasPair(LIUHAI, a, b)) return { delta: -6, note: '相害', tag: 'bad' };
      return { delta: 0, note: '无合无冲', tag: 'flat' };
    }

    // 日干五行：A 的五行对 B 的五行做了什么
    function wxPair(a, b) {
      if (a === b) return { delta: 6, note: '同五行', tag: 'flat' };
      if (WX_SHENG[a] === b) return { delta: 10, note: a + '生' + b, tag: 'good' };
      if (WX_SHENG[b] === a) return { delta: 8, note: b + '生' + a, tag: 'good' };
      if (WX_KE[a] === b) return { delta: -8, note: a + '克' + b, tag: 'bad' };
      if (WX_KE[b] === a) return { delta: -6, note: b + '克' + a, tag: 'bad' };
      return { delta: 0, note: '无生无克', tag: 'flat' };
    }

    function wxCounts(p) {
      const c = { 木: 0, 火: 0, 土: 0, 金: 0, 水: 0 };
      (p.ganIdx || []).forEach((g) => { c[GAN_WX[g]] += 1; });
      (p.zhiIdx || []).forEach((z) => { c[ZHI_WX[z]] += 1; });
      return c;
    }

    // 合婚打分：基准 60，五项加减，夹在 5–98
    function hepan(m, f) {
      const items = [];
      let score = 60;
      const push = (name, r, extra) => {
        score += r.delta;
        items.push({ name, note: r.note + (extra ? '（' + extra + '）' : ''), delta: r.delta, tag: r.tag });
      };
      // ① 生肖（年支）
      push('生肖（年支）', zhiPair(ZHI[m.zhiIdx[0]], ZHI[f.zhiIdx[0]]),
        ZHI[m.zhiIdx[0]] + ' · ' + ZHI[f.zhiIdx[0]]);
      // ② 配偶宫（日支）
      const r2 = zhiPair(ZHI[m.zhiIdx[2]], ZHI[f.zhiIdx[2]]);
      // 配偶宫更重：权重放大一半（取整不取巧）
      push('配偶宫（日支）', { delta: Math.round(r2.delta * 1.5), note: r2.note, tag: r2.tag },
        ZHI[m.zhiIdx[2]] + ' · ' + ZHI[f.zhiIdx[2]]);
      // ③ 日干五行
      const wa = GAN_WX[m.ganIdx[2]];
      const wb = GAN_WX[f.ganIdx[2]];
      push('日主五行', wxPair(wa, wb), GAN[m.ganIdx[2]] + wa + ' · ' + GAN[f.ganIdx[2]] + wb);
      // ④ 年柱纳音
      const na = NAYIN[Math.floor(m.yearIdx / 2)];
      const nb = NAYIN[Math.floor(f.yearIdx / 2)];
      const nA = na.slice(-1); const nB = nb.slice(-1);
      const r4 = (nA === nB)
        ? { delta: 2, note: '相同', tag: 'flat' }
        : (WX_SHENG[nA] === nB || WX_SHENG[nB] === nA
          ? { delta: 6, note: '相生', tag: 'good' }
          : (WX_KE[nA] === nB || WX_KE[nB] === nA
            ? { delta: -4, note: '相克', tag: 'bad' }
            : { delta: 0, note: '不生不克', tag: 'flat' }));
      push('年柱纳音', r4, na + ' · ' + nb);
      // ⑤ 五行互补：自己缺的，对方身上有没有
      const ca = wxCounts(m); const cb = wxCounts(f);
      const lacks = [];
      let bonus = 0;
      Object.keys(ca).forEach((k) => {
        if (ca[k] === 0 && cb[k] > 0) { bonus += 3; lacks.push('乾缺' + k + '·坤有'); }
        if (cb[k] === 0 && ca[k] > 0) { bonus += 3; lacks.push('坤缺' + k + '·乾有'); }
      });
      if (bonus > 9) bonus = 9;
      score += bonus;
      items.push({
        name: '五行互补',
        note: lacks.length ? lacks.join('，') : '两边分布接近，谁也没补到谁',
        delta: bonus,
        tag: bonus > 0 ? 'good' : 'flat',
      });
      score = Math.max(5, Math.min(98, Math.round(score)));
      const level = score >= 80 ? '合得顺' : (score >= 65 ? '大体合' : (score >= 50 ? '要磨合' : '费些劲'));
      const tips = score >= 80
        ? ['把想做的事说在前头：合得顺的时候最容易省掉沟通这一步', '一起办一件具体的小事，比反复确认关系有用', '各留一块自己的时间，别把「合」当成黏在一起']
        : (score >= 65
          ? ['先把分歧点写下来，别在气头上谈', '各自把「我最在意的三件事」说一遍，只说不解释', '每月留一次不谈问题的相处']
          : ['先看底线在哪儿：哪些事你绝不让步，写下来再看能不能对上', '把最常吵的那件事固定成一条规则，别每次重新吵', '别拿这张盘当判决书 —— 它说的是结构，不是结局']);
      return {
        score, level, items, tips,
        male: m, female: f,
        nayin: [na, nb],
        pillars: [m.pillars.join('　'), f.pillars.join('　')],
      };
    }

    // 时辰：按真实的 23–01 子、01–03 丑 这样分。
    // 子时跨两天（23–24 属次日、00–01 属当日），日柱不一样，所以拆成早晚两档
    const SHI_CHEN = [
      { t: '00:30', label: '子时 00–01（早）' },
      { t: '23:30', label: '子时 23–24（晚）' },
      { t: '02:00', label: '丑时 01–03' },
      { t: '04:00', label: '寅时 03–05' },
      { t: '06:00', label: '卯时 05–07' },
      { t: '08:00', label: '辰时 07–09' },
      { t: '10:00', label: '巳时 09–11' },
      { t: '12:00', label: '午时 11–13' },
      { t: '14:00', label: '未时 13–15' },
      { t: '16:00', label: '申时 15–17' },
      { t: '18:00', label: '酉时 17–19' },
      { t: '20:00', label: '戌时 19–21' },
      { t: '22:00', label: '亥时 21–23' },
    ];

    // 兼容老数据：以前存的是 0–11 的索引（子=0），按各时辰中点换算成时刻
    function shiChenToTime(v) {
      if (v === undefined || v === null || v === '') return '';
      const s = String(v);
      if (/^\d{1,2}:\d{2}$/.test(s)) return s;
      const idx = Number(s);
      if (!Number.isFinite(idx) || idx < 0 || idx > 11) return '';
      return String(idx * 2).padStart(2, '0') + ':00';
    }

    // ── 周期：从最近一次开始日推第几天 / 下次日期（只呈现，不下结论）──
    function cycleInfo(periods, avgLen) {
      const list = (periods || []).filter((x) => x && x.start).sort((a, b) => (a.start < b.start ? 1 : -1));
      if (!list.length) return null;
      const last = list[0];
      const startMs = new Date(last.start + 'T00:00:00').getTime();
      if (!Number.isFinite(startMs)) return null;
      const dayNo = Math.floor((Date.now() - startMs) / 86400000) + 1;
      const len = avgLen || 28;
      const nextMs = startMs + len * 86400000;
      const toNext = Math.ceil((nextMs - Date.now()) / 86400000);
      return { dayNo, next: new Date(nextMs), toNext, last, count: list.length, len };
    }

    // ── 周期日历：把「第几天」摊成一张月历（只按记录推算，不下结论）──────
    const CYCLE_STATE_LABEL = {
      period: '生理期', ovu: '排卵日', fertile: '易孕窗口', luteal: '黄体期', safe: '安全期',
    };

    function cycleLenOf(v) {
      const n = Math.round(Number(v) || 28);
      return Math.max(1, Math.min(60, n));
    }

    // 经期长度没有单独输入项：按周期长度给 3–7 天（28 天周期 → 5 天），只用来着色
    function cycleBled(len) {
      return Math.max(3, Math.min(7, Math.round(cycleLenOf(len) / 6) + 1));
    }

    function cycleDayState(dayMs, starts, len) {
      const list = (starts || []).slice().sort((a, b) => a - b);
      if (!list.length) return 'none';
      const bled = cycleBled(len);
      for (let i = 0; i < list.length; i += 1) {
        if (dayMs >= list[i] && dayMs < list[i] + bled * 86400000) return 'period';
      }
      const last = list[list.length - 1];
      if (dayMs < list[0]) return 'none';          // 早于第一条记录的不猜
      const diff = Math.floor((dayMs - last) / 86400000);
      const idx = Math.floor(diff / len);
      const dayNo = Math.floor((dayMs - (last + idx * len * 86400000)) / 86400000);
      // 黄体期约 14 天（下次月经前）；周期短于 21 天就按一半，别算出负数
      const luteal = len >= 21 ? 14 : Math.round(len / 2);
      const ovu = Math.max(bled + 1, len - luteal);
      // 只有一条记录时，下一次经期也得标出来，否则新周期那几天会被算成「安全期」
      if (dayNo < bled) return 'period';
      if (dayNo === ovu) return 'ovu';
      if (dayNo >= ovu - 5 && dayNo <= ovu + 1) return 'fertile';
      if (dayNo > ovu + 1) return 'luteal';
      return 'safe';
    }

    // 某个月（m 为 0–11）的月历格子，周一开头
    function cycleCalendar(periods, avgLen, y, m) {
      const len = cycleLenOf(avgLen);
      const starts = (periods || []).filter((x) => x && x.start)
        .map((x) => new Date(x.start + 'T00:00:00').getTime())
        .filter((t) => Number.isFinite(t));
      const days = new Date(y, m + 1, 0).getDate();
      const lead = (new Date(y, m, 1).getDay() + 6) % 7;
      const now = new Date();
      const todayMs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      const cells = [];
      for (let i = 0; i < lead; i += 1) cells.push({ d: 0, state: 'blank' });
      for (let d = 1; d <= days; d += 1) {
        const ms = new Date(y, m, d).getTime();
        cells.push({ d, state: cycleDayState(ms, starts, len), today: ms === todayMs });
      }
      while (cells.length % 7) cells.push({ d: 0, state: 'blank' });
      return { cells, len, bled: cycleBled(len), year: y, month: m + 1, hasData: starts.length > 0 };
    }

    // 三张牌阵的组合结论：三句各取第一条，再按正逆位给一句提醒
    // 合起来看：位置决定「读什么」，正逆决定「怎么读」。
    // 2026-11-18 补：原来只数正逆位（ups），十张牌只得到一个正逆比，
    // 位置名在界面上有、却没参与判断。现在按位序分组说话。
    function combineSpread(list, mode) {
      // 注释口径是「各取第一条」：这里取第 1 句（状态句），原来取的是第 2 句，错位了一句
      const first = (list[0] && list[0].meaning && (list[0].meaning.lines || [])[0]) || '';
      // at(i)：第 i 位是正（true）/ 逆（false）/ 没抽到（null）
      const at = (i) => (list[i] ? !list[i].reversed : null);
      let tail;
      if (mode === 'celtic' && list.length >= 10) {
        const block = at(1);    // 2 阻碍
        const goal = at(4);     // 5 目标
        const result = at(9);   // 10 结果
        const parts = [];
        if (block === false) parts.push('阻碍位是逆的，挡你的那个东西正在松。');
        else if (block === true) parts.push('阻碍位是正的，那个东西还实在那儿。');
        if (goal === true) parts.push('目标位正着，方向你自己是清楚的。');
        else if (goal === false) parts.push('目标位逆着，你还没想好到底要哪个。');
        if (result === true) parts.push('结果位正，顺着现在的走法，路是通的。');
        else if (result === false) parts.push('结果位逆，按现在这样走会绕一下。');
        tail = parts.join('');
        if (!tail) tail = '十位一起看，别只盯一张。';
      } else if (mode === 'three' && list.length >= 3) {
        const past = at(0);
        const now = at(1);
        const fut = at(2);
        if (past === false && now === true) tail = '过去那一段是逆的、现在正着 —— 你已经在往外走了。';
        else if (past === true && now === false) tail = '过去顺、现在逆 —— 卡的不是从前，是眼前。';
        else if (now === true && fut === true) tail = '现在与未来都正，接着往前推一步。';
        else if (now === false && fut === false) tail = '现在和未来都逆，先把手上没结的收个尾。';
        else tail = '一顺一逆之间，差的是你下一步怎么走。';
      } else {
        // 目前只有 three / celtic 两处调用；别的张数不出组合结论，只留首句，不猜张数
        tail = '';
      }
      return [first, tail].filter(Boolean).join(' ');
    }

    // 位置在问什么：一句话说明这一位该往哪儿读（不预测具体日期/婚丧/生死/疾病/投资，称呼只用「你」）
    const POS_GUIDE = {
      three: {
        过去: '已经发生、还在牵着你的事',
        现在: '此刻真实的处境',
        未来: '按现在的走法会抵达的地方',
      },
      celtic: {
        现状: '你此刻站在哪里',
        阻碍: '横在路上的那个东西',
        根基: '这件事底下压着的远因',
        过去: '刚过去、还在起作用的那一段',
        目标: '你希望抵达的位置',
        未来: '不改的话会去的地方',
        自己: '你自己的姿态',
        环境: '别人和外部条件',
        期待与恐惧: '你最想要又最怕的那件事',
        结果: '合起来会落到哪里',
      },
    };

    // 位置读法 = （位置在问什么）+ 这一张在这个位置说的话（正逆已由 meaningOf 决定该取哪句）
    function readAt(label, mode, item) {
      const guide = ((POS_GUIDE[mode] || {})[label]) || '';
      const line = (item && item.meaning && item.meaning.lines && item.meaning.lines[0]) || '';
      if (!guide) return line;
      return '（' + guide + '）' + line;
    }

    // ── 星座运势引擎 ────────────────────────────────────────────────
    function strHash(str) {
      let h = 2166136261;
      for (let i = 0; i < str.length; i += 1) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619);
      }
      return h >>> 0;
    }

    // 月相 + 月亮星座（近似：平均黄经 + 主异常项，误差约 ±10°，够做气氛）
    function moonInfo(date) {
      const SYN = 29.530588853;
      const ref = Date.UTC(2000, 0, 6, 18, 14) / 86400000;
      const d = date.getTime() / 86400000 - ref;
      const age = ((d % SYN) + SYN) % SYN;
      const phaseIdx = Math.round((age / SYN) * 8) % 8;
      const M = ((134.963 + 13.064993 * d) * Math.PI) / 180;
      const L = 218.316 + 13.176396 * d + 6.289 * Math.sin(M);
      const lon = ((L % 360) + 360) % 360;
      const moonSignIdx = Math.floor(lon / 30);
      return { phaseIdx, age, moonSignIdx };
    }

    // 逆行判定（水星 / 金星 / 火星）：低精度开普勒轨道 → 地心黄经，比今天与明天的黄经差。
    // 误差约 ±1°，只用来判「顺 / 逆」这个二值，够用（立项书 §6.3 N2 要求的三颗星）。
    const D2R = Math.PI / 180;
    const PLANET_EL = {
      mercury: { a: 0.38709843, e: 0.20563661, i: 7.00559432, L: 252.25166724, peri: 77.45771895, node: 48.33961819, n: 4.09233445 },
      venus: { a: 0.72332102, e: 0.00676399, i: 3.39777545, L: 181.97970850, peri: 131.76755713, node: 76.67261496, n: 1.60213034 },
      mars: { a: 1.52371243, e: 0.09336511, i: 1.85181869, L: -4.56813164, peri: -23.91744784, node: 49.71320984, n: 0.52402068 },
      earth: { a: 1.00000018, e: 0.01673163, i: -0.00054346, L: 100.46691572, peri: 102.93005885, node: -5.11260389, n: 0.98560912 },
    };

    // 日心黄道坐标（x, y）—— 只取投影面，判顺逆不需要 z
    function helioXY(key, days) {
      const el = PLANET_EL[key];
      const M = ((((el.L + el.n * days - el.peri) % 360) + 360) % 360) * D2R;
      let E = M;
      for (let k = 0; k < 6; k += 1) {
        E -= (E - el.e * Math.sin(E) - M) / (1 - el.e * Math.cos(E));
      }
      const xp = el.a * (Math.cos(E) - el.e);
      const yp = el.a * Math.sqrt(1 - el.e * el.e) * Math.sin(E);
      const w = (el.peri - el.node) * D2R;
      const om = el.node * D2R;
      const inc = el.i * D2R;
      return [
        xp * (Math.cos(w) * Math.cos(om) - Math.sin(w) * Math.sin(om) * Math.cos(inc))
          + yp * (-Math.sin(w) * Math.cos(om) - Math.cos(w) * Math.sin(om) * Math.cos(inc)),
        xp * (Math.cos(w) * Math.sin(om) + Math.sin(w) * Math.cos(om) * Math.cos(inc))
          + yp * (-Math.sin(w) * Math.sin(om) + Math.cos(w) * Math.cos(om) * Math.cos(inc)),
      ];
    }

    // 从地球看过去的地心黄经（度）
    function geoLon(key, days) {
      const p = helioXY(key, days);
      const e = helioXY('earth', days);
      return Math.atan2(p[1] - e[1], p[0] - e[0]) / D2R;
    }

    function retroGrade(date) {
      const days = (date || new Date()).getTime() / 86400000 + 2440587.5 - 2451545.0;
      const out = {};
      ['mercury', 'venus', 'mars'].forEach((k) => {
        let dl = geoLon(k, days + 1) - geoLon(k, days);
        while (dl > 180) dl -= 360;
        while (dl < -180) dl += 360;
        out[k] = dl < 0;
      });
      return out;
    }

    // 逆行的一句话解释（只给倾向，不吓人）
    function retroLine(retro) {
      const hit = [];
      if (retro.mercury) hit.push('水星逆行：话容易说岔，重要的约定写下来');
      if (retro.venus) hit.push('金星逆行：旧人旧喜好回流，别急着回应');
      if (retro.mars) hit.push('火星逆行：劲儿提不上来，把目标拆小一点');
      return hit.length ? hit.join('；') : '今天没有行星逆行。';
    }

    // 生日 → 星座：按「太阳进宫的近似日期」查最后一个不晚于它的起点。
    // 旧写法用「起月+起始日 / 止月+截止日」两头判，可 r[3] 是星座名不是月份，
    // 于是每个区间的**下半月**全部落空、一路掉到函数末尾的 return 'capricorn' ——
    // 这就是「星座页永远停在摩羯」的原因（2/10 判成摩羯、4/10 判成摩羯…）
    const SIGN_STARTS = [
      ['aquarius', 1, 20], ['pisces', 2, 19], ['aries', 3, 21], ['taurus', 4, 20],
      ['gemini', 5, 21], ['cancer', 6, 22], ['leo', 7, 23], ['virgo', 8, 23],
      ['libra', 9, 23], ['scorpio', 10, 24], ['sagittarius', 11, 23], ['capricorn', 12, 22],
    ];

    // 只认 (月, 日)：生日与「今天的太阳星座」共用同一套区间，别留两套表互相打架
    function signOf(m, d) {
      if (!m || !d) return null;
      const key = m * 100 + d;
      let hit = null;
      for (let i = 0; i < SIGN_STARTS.length; i += 1) {
        const row = SIGN_STARTS[i];
        if (key >= row[1] * 100 + row[2]) hit = row[0];
      }
      return hit || 'capricorn';   // 1/1–1/19 还留在摩羯那一格里（跨年）
    }

    function signFromBirthday(birthday) {
      if (!birthday) return null;
      const m = parseInt(String(birthday).slice(5, 7), 10);
      const d = parseInt(String(birthday).slice(8, 10), 10);
      if (!m || !d) return null;
      return signOf(m, d);
    }

    // 今日卡：hash(星座 + 本地日期 + 数据版本) → 文案与星级
    function todayCard(signId, horo, date) {
      if (!horo || !signId) return null;
      const day = date || new Date();
      const dk = day.getFullYear() + '-' + (day.getMonth() + 1) + '-' + day.getDate();
      const seed = strHash(signId + '|' + dk + '|' + horo.dataVersion);
      const sign = (horo.signs || []).find((x) => x.id === signId);
      if (!sign) return null;
      const core = (horo.core || {})[signId] || {};
      const tones = (horo.tone || {})[sign.element] || [];
      const moon = moonInfo(day);
      const retro = retroGrade(day);
      const phase = (horo.phase || [])[moon.phaseIdx] || {};
      const moonSign = (horo.signs || [])[moon.moonSignIdx] || {};
      const domains = [
        ['事业', 'career'],
        ['感情', 'love'],
        ['财运', 'money'],
        ['身心', 'body'],
      ].map(([label, key], i) => ({
        label,
        text: core[key] || '',
        stars: 1 + ((seed >>> (3 + i * 2)) % 5),
      }));
      const doPool = (horo.advice || {}).do || [];
      const avoidPool = (horo.advice || {}).avoid || [];
      // 宜 / 忌各取两条，撞了就把第二条顺延一格 —— 否则会印出「一口气接太多活 · 一口气接太多活」
      const pick2 = (pool, a, b) => {
        if (!pool.length) return [];
        const i = a % pool.length;
        let j = b % pool.length;
        if (pool.length > 1 && j === i) j = (i + 1) % pool.length;
        return pool.length === 1 ? [pool[i]] : [pool[i], pool[j]];
      };
      const colors = (horo.lucky || {}).colors || [];
      const numbers = (horo.lucky || {}).numbers || [];
      const slots = (horo.lucky || {}).slots || [];
      return {
        sign,
        mood: tones.length ? tones[seed % tones.length] : '',
        phaseName: phase.name || '',
        phaseLine: phase.line || '',
        moonSign,
        retro,
        retroLine: retroLine(retro),
        domains,
        doIt: pick2(doPool, seed >>> 5, seed >>> 11),
        avoid: pick2(avoidPool, seed >>> 7, seed >>> 13),
        color: colors.length ? colors[(seed >>> 9) % colors.length] : null,
        number: numbers.length ? numbers[seed % numbers.length] : null,
        slot: slots.length ? slots[(seed >>> 15) % slots.length] : '',
        witch: ((horo.witch || [])[(seed >>> 17) % Math.max(1, (horo.witch || []).length)]) || '',
      };
    }

    // 最近 30 天对照带：每天一格，亮度=月相照亮比例，描边=经期记录
    // bled 与周期日历同口径（cycleBled），否则同一天在日历里标红、在这条带子上不标
    function cycleStrip(periods, days, bled) {
      const n = days || 30;
      const span = Math.max(1, Number(bled) || 5) - 1;   // 起始日当天算第 1 天，跨度要减 1
      const list = (periods || []).filter((x) => x && x.start);
      const spans = list.map((x) => {
        const t = new Date(x.start + 'T00:00:00').getTime();
        return [t, t + span * 86400000];
      });
      const out = [];
      for (let i = n - 1; i >= 0; i -= 1) {
        const d = new Date(Date.now() - i * 86400000);
        const t = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
        const moon = moonInfo(d);
        const illum = 0.5 * (1 - Math.cos((2 * Math.PI * moon.age) / 29.530588853));
        const inPeriod = spans.some(([a, b]) => t >= a && t <= b);
        out.push({ t, illum, inPeriod, day: d.getDate() });
      }
      return out;
    }

    function cycleGaps(periods) {
      const list = (periods || []).filter((x) => x && x.start)
        .map((x) => new Date(x.start + 'T00:00:00').getTime())
        .sort((a, b) => b - a);
      const gaps = [];
      for (let i = 0; i + 1 < list.length; i += 1) {
        gaps.push(Math.round((list[i] - list[i + 1]) / 86400000));
      }
      const avg = gaps.length ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length) : null;
      return { gaps, avg };
    }

    // ── W8 每日情绪 / 睡眠：只记录与回看，不下任何结论 ─────────────
    const DAY_MOOD = ['很低', '偏低', '一般', '不错', '很好'];   // 1–5
    const DAY_SLEEP = ['不足', '一般', '充足'];                  // 1–3

    // 解密出来的私密数据补齐字段：老版本只有 periods / avgLen，没有 daily
    function normPriv(data) {
      const d = (data && typeof data === 'object') ? data : {};
      return {
        periods: Array.isArray(d.periods) ? d.periods : [],
        avgLen: d.avgLen || 28,
        daily: (d.daily && typeof d.daily === 'object') ? d.daily : {},
      };
    }

    // 近 N 天：月相带 + 当天的情绪 / 睡眠（经期描边天数跟周期日历一致）
    function dayRows(periods, daily, days, avgLen) {
      const rec = daily || {};
      const len = cycleLenOf(avgLen);
      return cycleStrip(periods, days, cycleBled(len)).map((r) => {
        const one = rec[localDayKey(new Date(r.t))] || null;
        return {
          t: r.t, illum: r.illum, inPeriod: r.inPeriod, day: r.day,
          mood: one && one.m ? one.m : 0,
          sleep: one && one.s ? one.s : 0,
        };
      });
    }

    // 满月前后（照亮 ≥85%）与其余天做对照。只回答「一致 / 反着 / 看不出差别 / 样本还少」
    function moonCompare(rows, field) {
      const isLow = (v) => (field === 'm' ? v <= 2 : v <= 1);
      let nearN = 0; let nearLow = 0; let farN = 0; let farLow = 0;
      (rows || []).forEach((r) => {
        const v = field === 'm' ? r.mood : r.sleep;
        if (!v) return;
        if (r.illum >= 0.85) { nearN += 1; if (isLow(v)) nearLow += 1; }
        else { farN += 1; if (isLow(v)) farLow += 1; }
      });
      let verdict = 'sample';
      if (nearN >= 3 && farN >= 3) {
        const a = nearLow / nearN;
        const b = farLow / farN;
        if (a - b >= 0.2) verdict = 'agree';
        else if (b - a >= 0.2) verdict = 'apart';
        else verdict = 'flat';
      }
      return { nearN, nearLow, farN, farLow, verdict };
    }

    const CMP_WORD = {
      agree: '对得上（满月附近更容易偏低）',
      apart: '反着（满月附近反而更稳）',
      flat: '看不出差别',
      sample: '样本还少，再看几天',
    };

    // ── W17 许愿瓶：写一件事封起来，到新月 / 满月 / 生日（或 30 天后）才开 ──
    const WISH_KEY = 'srs.wish.v1';
    const WISH_WHEN = { newmoon: '下一个新月', fullmoon: '下一个满月', birthday: '生日', d30: '30 天后' };
    const WISH_TAB = [['newmoon', '新月'], ['fullmoon', '满月'], ['birthday', '生日'], ['d30', '30 天']];

    function isoDay(d) {
      const x = d || new Date();
      return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
    }

    function loadWishes() {
      try {
        const got = JSON.parse(window.localStorage.getItem(WISH_KEY) || '[]');
        return Array.isArray(got) ? got.filter((w) => w && w.id && w.openAt) : [];
      } catch (error) { return []; }
    }

    function saveWishes(list) {
      try { window.localStorage.setItem(WISH_KEY, JSON.stringify(list.slice(0, 40))); } catch (error) { /* 忽略 */ }
    }

    // 下一个新月（age≈0）/ 满月（age≈14.77）：从明天起逐日找第一个对上的日子
    function nextMoonDay(kind) {
      const target = kind === 'newmoon' ? 0 : 14.765;
      for (let i = 1; i <= 32; i += 1) {
        const d = new Date(Date.now() + i * 86400000);
        const age = moonInfo(d).age;
        const diff = Math.min(Math.abs(age - target), Math.abs(age - 29.530588853 - target));
        if (diff <= 0.55) return isoDay(d);
      }
      return isoDay(new Date(Date.now() + 30 * 86400000));
    }

    // 生日只按「月-日」算下一个，跨年自动跳；档案里没填生日就返回 null
    function nextBirthdayDay(birthday) {
      const p = String(birthday || '').split('-').map(Number);
      if (p.length < 3 || !p[1] || !p[2]) return null;
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      let t = new Date(now.getFullYear(), p[1] - 1, p[2]);
      if (t.getTime() < today) t = new Date(now.getFullYear() + 1, p[1] - 1, p[2]);
      return isoDay(t);
    }

    function wishOpenDay(when, birthday) {
      if (when === 'birthday') return nextBirthdayDay(birthday);
      if (when === 'd30') return isoDay(new Date(Date.now() + 30 * 86400000));
      return nextMoonDay(when === 'fullmoon' ? 'fullmoon' : 'newmoon');
    }

    function daysUntil(iso) {
      const t = new Date(String(iso) + 'T00:00:00').getTime();
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      return Math.round((t - today) / 86400000);
    }

    // ── 每日一牌：当天首次抽完即锁（防刷到满意为止，立项书 T1）────
    const DAILY_CARD_KEY = 'srs.dailyCard.v1';

    function loadDailyCard() {
      try {
        const raw = window.localStorage.getItem(DAILY_CARD_KEY);
        const got = raw ? JSON.parse(raw) : null;
        return got && got.d ? got : null;
      } catch (error) { return null; }
    }

    function saveDailyCard(rec) {
      try { window.localStorage.setItem(DAILY_CARD_KEY, JSON.stringify(rec)); } catch (error) { /* 忽略 */ }
    }

    function localDayKey(d) {
      const day = d || new Date();
      return day.getFullYear() + '-' + (day.getMonth() + 1) + '-' + day.getDate();
    }

    // ── C8 每日一牌提醒：今天提醒过没有（单独一格，不混进 cfg 导出）──
    const REMIND_KEY = 'srs.remind.v1';

    function loadRemindState() {
      try {
        const raw = window.localStorage.getItem(REMIND_KEY);
        const got = raw ? JSON.parse(raw) : null;
        return got && got.d ? got : null;
      } catch (error) { return null; }
    }

    function saveRemindState(rec) {
      try { window.localStorage.setItem(REMIND_KEY, JSON.stringify(rec)); } catch (error) { /* 忽略 */ }
    }

    function hhmmLabel(hh, mm) {
      return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
    }

    // 计费提醒「今天已经说过」的标记：{ d, low, budget }。每天各一次，别一直吵
    const BILLWARN_KEY = 'srs.billwarn.v1';

    function loadBillWarn() {
      try {
        const got = JSON.parse(window.localStorage.getItem(BILLWARN_KEY) || 'null');
        return (got && typeof got === 'object') ? got : null;
      } catch (error) { return null; }
    }

    function saveBillWarn(rec) {
      try { window.localStorage.setItem(BILLWARN_KEY, JSON.stringify(rec)); } catch (error) { /* 忽略 */ }
    }

    // ── 结果卡导出：1080×1920 竖图 ────────────────────────────────
    function wrapText(ctx, text, maxWidth) {
      const out = [];
      let line = '';
      for (let i = 0; i < text.length; i += 1) {
        const next = line + text[i];
        if (ctx.measureText(next).width > maxWidth && line) {
          out.push(line);
          line = text[i];
        } else {
          line = next;
        }
      }
      if (line) out.push(line);
      return out;
    }

    function loadImage(src) {
      return new Promise((resolve, reject) => {
        const img = new window.Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('image load failed'));
        img.src = src;
      });
    }

    async function renderResultCard(opts) {
      // 两种规格（W14）：9:16 竖图 1080×1920（抖音/朋友圈）、3:4 小红书 1080×1440。
      // 纵向按 k 等比缩，字号与牌面跟着缩，版式不变形。
      const H = opts && opts.ratio === '34' ? 1440 : 1920;
      const W = 1080;
      const k = H / 1920;
      const S = (v) => Math.round(v * k);
      const canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext('2d');

      // 底：深蓝渐变
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#10182B');
      g.addColorStop(0.55, '#0E1424');
      g.addColorStop(1, '#0A1020');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);

      // 金色细边
      ctx.strokeStyle = 'rgba(201,164,92,.55)';
      ctx.lineWidth = 3;
      ctx.strokeRect(36, 36, W - 72, H - 72);

      // 顶部：小标 + 日期
      ctx.fillStyle = '#C9A45C';
      ctx.font = S(32) + 'px "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('SORCERESS · 今日一牌', W / 2, S(140));

      ctx.fillStyle = '#9A907C';
      ctx.font = S(30) + 'px "Microsoft YaHei", sans-serif';
      ctx.fillText(opts.date, W / 2, S(196));

      // 牌面
      const cardW = S(520);
      const cardH = S(780);
      const cx = (W - cardW) / 2;
      const cy = S(260);
      if (opts.cardSrc) {
        try {
          const img = await loadImage(opts.cardSrc);
          if (opts.reversed) {
            ctx.save();
            ctx.translate(W / 2, cy + cardH / 2);
            ctx.rotate(Math.PI);
            ctx.drawImage(img, -cardW / 2, -cardH / 2, cardW, cardH);
            ctx.restore();
          } else {
            ctx.drawImage(img, cx, cy, cardW, cardH);
          }
          ctx.strokeStyle = 'rgba(201,164,92,.8)';
          ctx.lineWidth = 2;
          ctx.strokeRect(cx, cy, cardW, cardH);
        } catch (error) { /* 图没加载出来就留空 */ }
      }

      // 牌名 + 正逆
      let y = cy + cardH + S(96);
      ctx.fillStyle = '#EFE3CB';
      ctx.font = 'bold ' + S(56) + 'px "Microsoft YaHei", serif';
      ctx.fillText(opts.name, W / 2, y);
      y += S(56);
      ctx.fillStyle = '#C9A45C';
      ctx.font = S(34) + 'px "Microsoft YaHei", sans-serif';
      ctx.fillText(opts.orientation + '　' + opts.numeral, W / 2, y);

      // 判词
      y += S(78);
      ctx.textAlign = 'left';
      ctx.fillStyle = '#D6C7AA';
      ctx.font = S(36) + 'px "Microsoft YaHei", sans-serif';
      const maxW = W - 220;
      (opts.lines || []).slice(0, 4).forEach((line) => {
        wrapText(ctx, line, maxW).forEach((seg) => {
          ctx.fillText(seg, 110, y);
          y += S(58);
        });
        y += S(10);
      });

      // 关键词
      if (opts.keywords && opts.keywords.length) {
        y += S(10);
        ctx.fillStyle = '#9A907C';
        ctx.font = S(30) + 'px "Microsoft YaHei", sans-serif';
        ctx.fillText(opts.keywords.join('　·　'), 110, y);
      }

      // 页脚
      ctx.textAlign = 'center';
      ctx.fillStyle = '#7E7666';
      ctx.font = S(28) + 'px "Microsoft YaHei", sans-serif';
      ctx.fillText('只给倾向，不预测结果　·　Sorceress', W / 2, H - S(110));

      return canvas;
    }

    function downloadDataUrl(dataUrl, name) {
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      try { window.__srsLastExport = { name: name, size: dataUrl.length }; } catch (error) { /* 忽略 */ }
    }

    // ── 星座运势卡导出（N5）：1080×1920 ─────────────────────────
    async function renderHoroCard(opts) {
      const W = 1080;
      const H = 1920;
      const canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext('2d');

      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#10182B');
      g.addColorStop(0.55, '#0E1424');
      g.addColorStop(1, '#0A1020');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = 'rgba(201,164,92,.55)';
      ctx.lineWidth = 3;
      ctx.strokeRect(36, 36, W - 72, H - 72);

      ctx.textAlign = 'center';
      ctx.fillStyle = '#C9A45C';
      ctx.font = '32px "Microsoft YaHei", sans-serif';
      ctx.fillText('SORCERESS · 今日运势', W / 2, 130);
      ctx.fillStyle = '#9A907C';
      ctx.font = '28px "Microsoft YaHei", sans-serif';
      ctx.fillText(opts.date, W / 2, 182);

      // 星座（不画 ♈ 这类符号：canvas 里会走 emoji 字体，印出来是个彩色方图）
      ctx.fillStyle = '#EFE3CB';
      ctx.font = 'bold 84px "Microsoft YaHei", serif';
      ctx.fillText(opts.sign, W / 2, 300);
      ctx.fillStyle = '#9A907C';
      ctx.font = '28px "Microsoft YaHei", sans-serif';
      ctx.fillText(opts.range + '　·　' + opts.element + ' · ' + opts.ruler, W / 2, 352);

      // 一句话总纲
      ctx.fillStyle = '#D6C7AA';
      ctx.font = '36px "Microsoft YaHei", sans-serif';
      let y = 432;
      wrapText(ctx, opts.mood || '', W - 220).slice(0, 3).forEach((seg) => {
        ctx.fillText(seg, W / 2, y);
        y += 56;
      });

      // 四维
      y += 26;
      ctx.textAlign = 'left';
      (opts.domains || []).forEach((d) => {
        ctx.fillStyle = '#C9A45C';
        ctx.font = '34px "Microsoft YaHei", sans-serif';
        ctx.fillText(d.label, 110, y);
        ctx.fillStyle = '#E3C588';
        ctx.fillText(d.stars, 250, y);
        ctx.fillStyle = '#B9AC93';
        ctx.font = '30px "Microsoft YaHei", sans-serif';
        wrapText(ctx, d.text, W - 460).slice(0, 2).forEach((seg, i) => {
          ctx.fillText(seg, 470, y + i * 44);
        });
        y += 118;
      });

      // 宜 / 忌
      y += 10;
      ctx.fillStyle = '#8FBF9A';
      ctx.font = '34px "Microsoft YaHei", sans-serif';
      ctx.fillText('宜　' + (opts.doIt || []).join(' · '), 110, y);
      y += 56;
      ctx.fillStyle = '#D9A489';
      ctx.fillText('忌　' + (opts.avoid || []).join(' · '), 110, y);

      // 幸运
      y += 78;
      ctx.fillStyle = '#C9A45C';
      ctx.font = '34px "Microsoft YaHei", sans-serif';
      ctx.fillText('幸运', 110, y);
      ctx.fillStyle = '#EFE3CB';
      ctx.fillText((opts.color ? opts.color[0] : '—') + '　·　' + (opts.number || '—') + '　·　' + (opts.slot || '—'), 250, y);
      if (opts.color) {
        ctx.fillStyle = opts.color[1];
        ctx.fillRect(110, y + 22, 860, 10);
      }

      // 天象
      y += 96;
      ctx.fillStyle = '#9A907C';
      ctx.font = '28px "Microsoft YaHei", sans-serif';
      ctx.fillText(opts.sky || '', 110, y);

      // 女巫一句话
      ctx.textAlign = 'center';
      ctx.fillStyle = '#E7D9BC';
      ctx.font = 'italic 36px "Microsoft YaHei", serif';
      let wy = H - 240;
      wrapText(ctx, opts.witch || '', W - 240).slice(0, 3).forEach((seg) => {
        ctx.fillText(seg, W / 2, wy);
        wy += 52;
      });

      ctx.fillStyle = '#7E7666';
      ctx.font = '28px "Microsoft YaHei", sans-serif';
      ctx.fillText('只给倾向，不预测结果　·　Sorceress', W / 2, H - 96);

      return canvas;
    }

    // ── 情绪打卡（W1）：8 档心情，按心情抽一张，用共情句回应 ──────
    const MOOD_KEY = 'srs.mood.v1';
    const MOODS = [
      ['happy', '挺好'],
      ['calm', '平静'],
      ['tired', '累'],
      ['anxious', '焦虑'],
      ['low', '低落'],
      ['angry', '生气'],
      ['empty', '空'],
      ['cry', '想哭'],
    ];

    function loadMood() {
      try {
        const raw = window.localStorage.getItem(MOOD_KEY);
        const got = raw ? JSON.parse(raw) : null;
        return got && got.d ? got : null;
      } catch (error) { return null; }
    }

    function empathyOf(cardId) {
      return ((EMPATHY && EMPATHY.lines) || {})[cardId] || '';
    }

    // ── T14 牌义详略：简 = 三句判词（牌义本来就是这个密度）；详 = 再给另一向的三句 + 牌面资料
    // 简不再砍句子：牌义本来就三句，砍到两句会把「建议层」丢掉，判词读起来半截
    function detailLines(meaning) {
      return (meaning && meaning.lines) || [];
    }

    // 牌面资料：花色 · 元素 · 横幅编号（详版底下一行）
    const SUIT_LINE = { wands: '权杖 · 火', cups: '圣杯 · 水', swords: '宝剑 · 风', pentacles: '星币 · 土' };
    function cardMeta(card) {
      if (!card) return '';
      return card.kind === 'major'
        ? '大阿卡纳 · 横幅 ' + (card.numeral || card.number)
        : (SUIT_LINE[card.suit] || '') + ' · 横幅 ' + (card.numeral || card.number);
    }

    // ── W9 月度回顾 / W10 反复出现的牌：只数抽过的牌，不做推断 ─────────
    const SPREAD_NAME = { daily: '今日一牌', one: '单张', three: '三张', celtic: '凯尔特十张' };

    function reviewOf(hist, now) {
      const day = now || new Date();
      const monthKey = day.getFullYear() + '-' + (day.getMonth() + 1);
      const rows = (hist || []).filter((x) => x && x.t);
      const thisMonth = rows.filter((x) => {
        const d = new Date(x.t);
        return d.getFullYear() + '-' + (d.getMonth() + 1) === monthKey;
      });
      const count = (list) => {
        const map = new Map();
        list.forEach((x) => {
          const key = x.id || x.name;
          if (!key) return;
          const cur = map.get(key) || { id: key, name: x.name || key, n: 0, rev: 0 };
          cur.n += 1;
          if (x.reversed) cur.rev += 1;
          map.set(key, cur);
        });
        return Array.from(map.values()).sort((a, b) => b.n - a.n);
      };
      const monthTop = count(thisMonth).slice(0, 3);
      const since = day.getTime() - 90 * 86400000;
      const recent = count(rows.filter((x) => new Date(x.t).getTime() >= since)).filter((x) => x.n >= 3).slice(0, 5);
      const spreads = {};
      thisMonth.forEach((x) => { const k = x.spread || 'one'; spreads[k] = (spreads[k] || 0) + 1; });
      return { total: rows.length, monthTotal: thisMonth.length, monthTop, recent, spreads, monthKey };
    }

    // ── W6 幸运穿搭：把今天的幸运色落到「怎么穿」，不评价身材外貌 ──────
    const WEAR_HOW = {
      '深蓝': '主色铺在外套或裙子上，其余都压下去。',
      '淡金': '落在耳饰、扣子、包扣这类小面积金属上。',
      '米白': '内搭或围巾用米白，脸色会干净一档。',
      '墨绿': '放在下装或针织上，比军绿更沉，显稳。',
      '月白': '衬衫或帆布鞋，冷天里最不容易出错。',
      '暖棕': '鞋与腰带同一档棕，包可以再深一度。',
    };

    function wearPlan(card, horo) {
      const pool = ((horo && horo.lucky) || {}).colors || [];
      if (!card || !card.color || !pool.length) return [];
      const main = card.color;
      const rest = pool.filter((c) => c[0] !== main[0]);
      const seed = strHash('wear|' + ((card.sign && card.sign.id) || '') + '|' + main[0]);
      const at = (arr, n) => (arr.length ? arr[Math.abs(seed + n) % arr.length] : null);
      const sub = at(rest, 1);
      const dotRaw = at(rest.slice().reverse(), 3);
      const out = [];
      const add = (label, c) => {
        if (!c) return;
        out.push({ label, name: c[0], hex: c[1], how: WEAR_HOW[c[0]] || '小面积带上就够，不用整身穿。' });
      };
      add('主色', main);
      add('副色', sub);
      if (dotRaw && (!sub || dotRaw[0] !== sub[0])) add('点缀', dotRaw);
      return out;
    }

    // ── W11 双人牌：一人一张，只写关系现状与可能 ────────────────────
    function duoReading(picks) {
      if (!picks || picks.length < 2) return null;
      const a = picks[0];
      const b = picks[1];
      const line = (r) => ((r.meaning && r.meaning.lines) || [])[0] || '';
      const bothUp = !a.reversed && !b.reversed;
      const bothRev = a.reversed && b.reversed;
      const tone = bothUp
        ? '两张都正着，关系在往前走，节奏是顺的。'
        : (bothRev
          ? '两张都逆着，此刻更像各自在原地打转，先别急着定义它。'
          : (a.reversed ? '你这边收着，对方那边开着，差的不是心意是表达。'
            : '你这边开着，对方那边收着，别用追问去要一个回应。'));
      return {
        tone,
        line: '你的牌说「' + line(a) + '」；对方的牌说「' + line(b) + '」',
        tips: [
          '把最想说的一句写下来，只留那一句，找机会说出来。',
          '这周留一件只属于你自己的事，不必报备。',
          '想确认关系时，先说自己的感受，再问他的想法。',
        ],
      };
    }

    // ── 主组件 ─────────────────────────────────────────────────────
    function Widget() {
      React.useEffect(ensureStyle, []);

      const [cfg, setCfg] = React.useState(() => silenceAmbOnBoot(loadCfg()));
      const [pose, setPose] = React.useState('idle-a');
      const poseRef = React.useRef('idle-a');       // 闲置定时器读它，不把 pose 放进依赖（否则每次换姿势都重置 5 分钟入睡计时）
      poseRef.current = pose;
      const [bubble, setBubble] = React.useState('');        // 台词文本：淡出期间也要留着
      const [bubbleSub, setBubbleSub] = React.useState('');   // 气泡第二行（账目：token / 模型 / 会话名）
      const [bubbleOn, setBubbleOn] = React.useState(false);  // 可见性：与文本分开，收起只关这一项
      const [dragging, setDragging] = React.useState(false);
      const [panelOpen, setPanelOpen] = React.useState(false);
      const [tab, setTab] = React.useState('tarot');
      // 星座页「现在看哪个星座」：只影响这一页的展示，绝不回写档案生日
      const [viewSign, setViewSign] = React.useState(null);
      // 周期日历看的月份（m 从 0 起）
      const [calYm, setCalYm] = React.useState(() => {
        const d = new Date();
        return { y: d.getFullYear(), m: d.getMonth() };
      });
      // 婚配：输入常驻，结果点了才算（改输入就撤掉旧结果）
      const [matchIn, setMatchIn] = React.useState(() => {
        try {
          const got = JSON.parse(window.localStorage.getItem(MATCH_KEY) || 'null');
          if (got && typeof got === 'object') return { m: got.m || {}, f: got.f || {} };
        } catch (error) { /* 读不出来就空着 */ }
        return { m: {}, f: {} };
      });
      const [matchOut, setMatchOut] = React.useState(null);
      // 点击处理器挂在 effect 里，闭包里的 matchIn 会是旧快照 —— 用 ref 拿最新值
      const matchInRef = React.useRef(matchIn);
      matchInRef.current = matchIn;
      const [billing, setBilling] = React.useState(null);      // {ok, balance, todayUsed, monthUsed, history, peak, ...}
      const [usage, setUsage] = React.useState(null);           // {ok, range, totals, byModel, days, items}
      const [usageRange, setUsageRange] = React.useState('today');   // today | 7d | all
      const [billBusy, setBillBusy] = React.useState(false);
      const [profileOpen, setProfileOpen] = React.useState(false);
      const [birthMsg, setBirthMsg] = React.useState('');   // 「已保存…」反馈，2.4 秒后自动清
      const birthMsgTimer = React.useRef(0);
      const [pinSet, setPinSet] = React.useState(hasPrivate);   // 是否已设过密码
      const [pinInput, setPinInput] = React.useState('');
      const [pinErr, setPinErr] = React.useState('');
      const [priv, setPriv] = React.useState(null);             // 解密后的私密数据
      const [billQ, setBillQ] = React.useState('');             // 明细搜索词（模型 / 日期 / 金额）
      const [wishes, setWishes] = React.useState(loadWishes);   // W17 许愿瓶
      const [wishWhen, setWishWhen] = React.useState('newmoon'); // 开启时机
      // 原生监听里的闭包读不到最新 state（铁律 14），另存 ref
      const wishesRef = React.useRef(wishes);
      wishesRef.current = wishes;
      const wishWhenRef = React.useRef(wishWhen);
      wishWhenRef.current = wishWhen;
      const billWarnRef = React.useRef(loadBillWarn());         // 计费提醒今天说过没有
      // W8 当天要记的情绪 / 睡眠（0 = 还没选）
      const [dayDraft, setDayDraft] = React.useState({ m: 0, s: 0 });
      // 原生监听里的闭包拿不到最新 state（铁律 14 的老坑），另存一份 ref 给保存用
      const dayDraftRef = React.useRef(dayDraft);
      dayDraftRef.current = dayDraft;
      const [profile, setProfile] = React.useState(() => {
        try { return JSON.parse(window.localStorage.getItem('srs.profile.v1') || '{}') || {}; } catch (error) { return {}; }
      });
      const [phase, setPhase] = React.useState('idle');   // idle | shuffling | shown | error
      const [result, setResult] = React.useState(null);
      const [results, setResults] = React.useState([]);   // 三张牌阵用
      // 三张牌阵：一张一张挑，已翻开的牌依次落到下面等待区（每项 { idx, card, reversed, meaning }）
      const [picked, setPicked] = React.useState([]);
      const [divineMode, setDivineMode] = React.useState('daily');
      const [bubbleEdit, setBubbleEdit] = React.useState(null);   // 非空 = 正在编辑某组台词
      const [dailyCard, setDailyCard] = React.useState(loadDailyCard);
      const [mood, setMood] = React.useState(loadMood);
      const [moodPick, setMoodPick] = React.useState(null);      // { card, reversed, empathy }
      const [histOpen, setHistOpen] = React.useState(false);
      const [deckOpen, setDeckOpen] = React.useState(false);     // T6 牌库图鉴：78 张全可查
      const [deckPick, setDeckPick] = React.useState(null);      // 正在看的那张牌 id
      const [deckSide, setDeckSide] = React.useState('up');      // up | rev
      const [deckGroup, setDeckGroup] = React.useState('major'); // 牌库当前花色
      const [histVer, setHistVer] = React.useState(0);            // 删/清空后自增，触发重读
      const [exporting, setExporting] = React.useState(false);   // daily | either | relation
      const [divineCards, setDivineCards] = React.useState([]);
      const [divineBusy, setDivineBusy] = React.useState(false);
      // 每次抽牌 +1，用来换掉卡片节点的 key —— key 变了才重挂载，翻牌动画才会从头再放一遍
      const [divineSeq, setDivineSeq] = React.useState(0);
      const [daily, setDaily] = React.useState(() => {
        try { return JSON.parse(window.localStorage.getItem('srs.daily.v1') || 'null'); } catch (error) { return null; }
      });
      const [openLeft, setOpenLeft] = React.useState(false);
      // 面板自由位置：把面板拖到任意地方就记下来；null = 还是跟随人物（贴在头顶上方）
      const PANEL_POS_KEY = 'srs.panel.v1';
      const [panelPos, setPanelPos] = React.useState(() => {
        try {
          const v = JSON.parse(window.localStorage.getItem('srs.panel.v1') || 'null');
          return v && typeof v.x === 'number' && typeof v.y === 'number' ? v : null;
        } catch (error) { return null; }
      });
      const panelPosRef = React.useRef(panelPos);
      panelPosRef.current = panelPos;
      const panelDrag = React.useRef(null);
      // 视口尺寸进 state：面板是 fixed + 绝对坐标，窗口缩放后必须重渲染才会重新算 left/bottom，
      // 不然最大化状态下打开的菜单栏一缩小窗口就停在原来的 x 上、跑到视口外看不见（2026-11-17 主人报）
      const [winSize, setWinSize] = React.useState(() => ({
        w: (typeof window !== 'undefined' ? window.innerWidth : 1400) || 1400,
        h: (typeof window !== 'undefined' ? window.innerHeight : 900) || 900,
      }));
      const [ioOpen, setIoOpen] = React.useState(false);      // 设置导入/导出面板
      const [aboutOpen, setAboutOpen] = React.useState(false); // 关于页（整块内容替换 body）
      const [wipeArm, setWipeArm] = React.useState(false);    // 清空全部：先按一次上膛，再按一次才真清
      const [reviewOpen, setReviewOpen] = React.useState(false);   // W9/W10 回顾子页
      const [renameKey, setRenameKey] = React.useState(null);      // T15 正在命名的历史条目（按 t 定位）
      const [breatheOpen, setBreatheOpen] = React.useState(false);  // W4 安神 3 分钟
      const [breatheLeft, setBreatheLeft] = React.useState(180);
      const breatheStart = React.useRef(0);
      const nameRef = React.useRef(null);

      const rootRef = React.useRef(null);
      const panelRef = React.useRef(null);
      const bodyRef = React.useRef(null);
      const menuRef = React.useRef(null);
      const dragRef = React.useRef(null);
      const bubbleTimer = React.useRef(null);
      // 播报去重：seq（结到第几轮）+ kind:id（哪一件挂起），跨轮记住上一次已经吵过什么
      const liveSeqRef = React.useRef(0);
      const waitSeenRef = React.useRef('');
      const specialUntilRef = React.useRef(0);   // 账目播报显示到什么时候，期间闲置自语与换姿势都让位
      const remindDoneRef = React.useRef(loadRemindState());   // C8：哪天已经提醒过/已抽过
      const poseTimer = React.useRef(null);
      const chatTimer = React.useRef(null);
      const gestureTimer = React.useRef(null);
      const loadedRef = React.useRef({});
      const dataRef = React.useRef(null);
      const busyRef = React.useRef(false);
      const pickRef = React.useRef(null);
      const pickedRef = React.useRef([]);   // 与 picked 同步：finishPick 里同步读，避免闭包过期

      // 固定姿态（空 = 自动）：所有「回到闲置」的路径都回到这一张，抽牌流程结束后也回这里
      const talkMode = (cfg.talk === 'quiet' || cfg.talk === 'chatty') ? cfg.talk : 'normal';
      const posePinned = !!POSE_LABEL[cfg.posePin];
      // 自动模式（2026-11-18 修）：原来恒等于 'idle-a'，于是静止时永远是同一张，
      // 只有小动作那 5 张在换 —— 主人报「自动还是固定的那几个」就是这个原因。
      // 现在自动 = 在这一组「站得住」的姿势之间每 4–8 分钟换一次；
      // 抽牌流程（洗牌/摊牌/抽牌/翻牌）、打盹、告别仍是流程姿势，不进这个池。
      const STAND_POSES = ['idle-a', 'rest-hands', 'think', 'look-aside', 'dazed',
        'hold-cup', 'stretch', 'reading', 'smile', 'smirk', 'annoyed'];
      const [autoPose, setAutoPose] = React.useState(
        () => STAND_POSES[Math.floor(Math.random() * STAND_POSES.length)]
      );
      const homePose = posePinned ? cfg.posePin : autoPose;
      const cfgPoseRef = React.useRef(homePose);
      cfgPoseRef.current = homePose;
      // 每日一牌：提醒定时器里要读「今天抽了没」，用 ref 拿最新值，不重建定时器
      const dailyCardRef = React.useRef(dailyCard);
      dailyCardRef.current = dailyCard;
      const pinnedRef = React.useRef(posePinned);
      pinnedRef.current = posePinned;

      // 固定姿态一变（含页面刚打开就有 posePin）立刻生效，别等 6 秒的「回闲置」定时器
      React.useEffect(() => { setPose(homePose); }, [homePose]);

      // 探针：实跑台要能验证「自动的站姿池有几张」，挂在 window 上（与 __srsSfx / __srsSays 同套路）
      React.useEffect(() => { window.__srsStandPoses = STAND_POSES.slice(); }, []);

      // 自动模式：每 4–8 分钟换一张站姿（抽到的和当前不一样才换）。
      // 护栏三条：固定姿态时不换；打盹 / 拖拽 / 面板开着时不换；她正在流程姿势（洗牌、摊牌、读牌）
      // 时也不换 —— 否则会把她从流程里硬拽出来，看着像卡了一下。
      React.useEffect(() => {
        if (posePinned) return undefined;
        let timer = null;
        const tick = () => {
          const idleNow = !panelOpen && !dragging && !napRef.current
            && poseRef.current === cfgPoseRef.current;
          if (idleNow) {
            let next = autoPose;
            // 最多试 8 次，池子 7 张时够跳出重复
            for (let k = 0; k < 8 && next === autoPose; k += 1) {
              next = STAND_POSES[Math.floor(Math.random() * STAND_POSES.length)];
            }
            if (next !== autoPose) setAutoPose(next);
          }
          timer = window.setTimeout(tick, 240000 + Math.random() * 240000);
        };
        timer = window.setTimeout(tick, 240000 + Math.random() * 240000);
        return () => window.clearTimeout(timer);
      }, [autoPose, posePinned, panelOpen]);
      const scale = SCALES.indexOf(cfg.scale) >= 0 ? cfg.scale : 1.0;
      const box = HIT_BOX[pose] || HIT_BOX['idle-a'] || { ar: 0.66, box: [0, 0, 1, 1] };

      // 预加载立绘
      React.useEffect(() => {
        let cancelled = false;
        const order = ['idle-a', 'rest-hands', 'think', 'look-aside', 'dazed', 'hold-cup',
          'stretch', 'draw', 'flip', 'smile', 'shuffle', 'spread', 'sleep', 'smirk',
          'fly', 'reading', 'annoyed', 'bye'];
        const step = () => {
          if (cancelled) return;
          const next = order.find((k) => !loadedRef.current[k]);
          if (!next) return;
          const img = new window.Image();
          img.onload = () => { loadedRef.current[next] = true; step(); };
          img.onerror = () => { loadedRef.current[next] = true; step(); };
          img.src = POSES[next];
        };
        step();
        return () => { cancelled = true; };
      }, []);

      const lastLineRef = React.useRef('');
      const say = React.useCallback((text) => {
        if (text && text === lastLineRef.current) return;   // 连着同一句就不重复说
        lastLineRef.current = text || '';
        if (!(cfg.bubble && cfg.bubble.on)) { setBubbleOn(false); return; }
        setBubble(text);
        setBubbleSub('');                                    // 普通台词不带副行
        setBubbleOn(true);
        window.clearTimeout(bubbleTimer.current);
        // 收起只关可见性、**不清文本**：清空会让 max-content 塌成 padding 宽度，
        // 气泡在 0.2s 里缩成一截 20px 小方块再淡出 —— 看着像人物边上留了个小尾巴
        bubbleTimer.current = window.setTimeout(() => setBubbleOn(false), ((cfg.bubble && cfg.bubble.holdSec) || 6) * 1000);
      }, [cfg.bubble]);

      // 账目的播报：两行（主行说事、副行给数），停留时长单独给，不受「台词停留」设置影响
      const saySpecial = React.useCallback((main, sub, ms) => {
        if (!(cfg.bubble && cfg.bubble.on)) return;
        const hold = Number(ms) || 8000;
        lastLineRef.current = main || '';
        specialUntilRef.current = Date.now() + hold;   // 这期间闲置自语/小动作让位，别把她刚说的话顶掉
        setBubble(main || '');
        setBubbleSub(sub || '');
        setBubbleOn(true);
        window.clearTimeout(bubbleTimer.current);
        bubbleTimer.current = window.setTimeout(() => setBubbleOn(false), hold);
      }, [cfg.bubble]);

      // 闲置自语专用：播报窗口内不说（9–16 秒就有一次小动作，不拦会把账目那句顶掉）
      const sayIdle = React.useCallback((text) => {
        if (Date.now() < specialUntilRef.current) return;
        say(text);
      }, [say]);

      // ── 闲置：时不时换一句台词、换一个姿势，别让挂件像张静态图 ──────
      // 四段行为（立项书 H6）：15s 发呆 → 60s 一句自语 → 5min 睡着 → 深夜多说一句催睡
      const poseIdleRef = React.useRef(null);
      const dozeTimer = React.useRef(null);
      const napTimer = React.useRef(null);
      const napRef = React.useRef(false);          // true = 已经坐着睡着了，别再换姿势吵她
      // 小动作池：比自动基线更活一点，含发呆
      const IDLE_POSES = ['think', 'dazed', 'smirk', 'reading', 'smile', 'annoyed'];
      const isLateNight = () => {
        const hour = new Date().getHours();
        return hour >= 23 || hour < 4;
      };

      React.useEffect(() => {
        const toIdle = () => setPose(cfgPoseRef.current);
        const calm = () => !panelOpen && !dragging && !napRef.current;

        // 15s：发呆 —— 定在 think 站一会儿再回 idle，这一档不说话
        const doze = () => {
          if (calm() && !pinnedRef.current && poseRef.current === cfgPoseRef.current) {
            setPose('think');
            window.clearTimeout(poseIdleRef.current);
            poseIdleRef.current = window.setTimeout(toIdle, 3200 + Math.random() * 1800);
          }
          dozeTimer.current = window.setTimeout(doze, 14000 + Math.random() * 5000);
        };

        // 60s：一句自语；深夜换成关怀句（催睡）
        const chat = () => {
          if (calm() && talkMode !== 'quiet') {
            if (isLateNight() && Math.random() < 0.55) sayIdle(pickLine(cfg, 'care'));
            else sayIdle(pickLine(cfg, 'idle'));
          }
          chatTimer.current = window.setTimeout(chat, talkMode === 'chatty' ? (24000 + Math.random() * 16000) : (48000 + Math.random() * 26000));
        };

        // 小动作：换一个姿势、说一句，几秒后回 idle
        const gesture = () => {
          // 播报窗口内不抢：她正说着账，这时候转个身、换句话，看起来像没说完就被打断
          if (calm() && Date.now() >= specialUntilRef.current && !pinnedRef.current) {
            // 原来按 Date.now() % 长度 顺序取，间隔均匀时老是同几张；改成随机，且避开当前基线
            let pick = IDLE_POSES[Math.floor(Math.random() * IDLE_POSES.length)];
            if (pick === cfgPoseRef.current) pick = IDLE_POSES[0] === pick ? IDLE_POSES[1] : IDLE_POSES[0];
            setPose(pick);
            if (talkMode !== 'quiet') sayIdle(pickLine(cfg, 'idle'));
            window.clearTimeout(poseIdleRef.current);
            poseIdleRef.current = window.setTimeout(toIdle, 4200 + Math.random() * 2600);
          }
          gestureTimer.current = window.setTimeout(gesture, talkMode === 'chatty' ? (20000 + Math.random() * 16000) : (32000 + Math.random() * 26000));
        };

        // 5min：睡着（sleep 姿势保持，等她被点或面板打开再醒）
        const nap = () => {
          if (!panelOpen && !dragging && !pinnedRef.current) {
            napRef.current = true;
            setPose('sleep');
            sayIdle(pickLine(cfg, 'care'));
          }
          napTimer.current = window.setTimeout(nap, 300000);
        };

        chatTimer.current = window.setTimeout(chat, (talkMode === 'chatty' ? 6000 : 12000) + Math.random() * 8000);
        gestureTimer.current = window.setTimeout(gesture, 9000 + Math.random() * 7000);
        dozeTimer.current = window.setTimeout(doze, 15000 + Math.random() * 4000);
        napTimer.current = window.setTimeout(nap, 300000);
        return () => {
          window.clearTimeout(chatTimer.current);
          window.clearTimeout(gestureTimer.current);
          window.clearTimeout(poseIdleRef.current);
          window.clearTimeout(dozeTimer.current);
          window.clearTimeout(napTimer.current);
        };
      }, [panelOpen, dragging, say, sayIdle, cfg]);

      // 她睡着时被叫醒：按一下、或开面板，都先坐起来
      React.useEffect(() => {
        if (!napRef.current) return;
        if (panelOpen) { napRef.current = false; return; }
        if (pose !== 'sleep') { napRef.current = false; setPose(cfgPoseRef.current); }
      }, [panelOpen, pose]);

      // 面板收起 / 抽完牌后，过一会儿回到闲置站姿（不然一直定格在笑）
      React.useEffect(() => {
        window.clearTimeout(poseTimer.current);
        if (pose !== homePose) {
          poseTimer.current = window.setTimeout(() => setPose(cfgPoseRef.current), panelOpen ? 12000 : 6000);
        }
        return () => window.clearTimeout(poseTimer.current);
      }, [pose, panelOpen, homePose]);


      // 气泡总开关关掉：立刻收起（文本留着，重新打开不用等她说下一句）
      React.useEffect(() => {
        if (!(cfg.bubble && cfg.bubble.on)) {
          window.clearTimeout(bubbleTimer.current);
          setBubbleOn(false);
        }
      }, [cfg.bubble]);

      React.useEffect(() => () => {
        window.clearTimeout(bubbleTimer.current);
        window.clearInterval(poseTimer.current);
      }, []);

      // ── 音效播放（Audio 元素复用，音量跟 cfg.soundVol）──────────
      const audioRef = React.useRef({});
      const ambRef = React.useRef({});          // W19 环境音景：四路循环各一个 Audio
      // 最新配置的 ref：playSfx 是稳定回调，不能靠闭包里的旧 cfg 判断开关
      const cfgRef = React.useRef(cfg);
      cfgRef.current = cfg;
      const scaleRef = React.useRef(scale);
      scaleRef.current = scale;

      const playSfx = React.useCallback((name, mul) => {
        const snd = (cfgRef.current && cfgRef.current.sound) || {};
        if (!snd.on) { stopEveryAudio('sfx'); return; }
        if (snd.tracks && snd.tracks[name] === false) return;
        try {
          const src = SFX[name];
          if (!src) return;
          // 实跑台用的探针：记「哪一路、多长」。Audio 对象是一次性创建的（缓存复用），
          // 只数 new Audio 会漏掉第二次播放，所以这里单独记一条
          try { (window.__srsSfx = window.__srsSfx || []).push(name + ':' + String(src).length); } catch (e1) { /* 忽略 */ }
          let el = audioRef.current[name];
          if (!el) {
            el = makeAudio(src);
            el.preload = 'auto';
            audioRef.current[name] = el;
          }
          el.volume = Math.min(1, Math.max(0, ((snd.volume == null ? 55 : snd.volume) / 100) * (mul == null ? 1 : mul)));
          try { el.currentTime = 0; } catch (error) { /* 未加载完 */ }
          const pr = el.play();
          if (pr && pr.catch) pr.catch(() => {});
        } catch (error) { /* 浏览器不让播就静默 */ }
      }, []);

      // 强制停某一路：pause + 复位 + 拆 loop，避免「关了还在响」
      const stopSfx = React.useCallback((name) => {
        const el = audioRef.current[name];
        if (!el) return;
        try {
          el.loop = false;
          el.pause();
          el.currentTime = 0;
          el.volume = 0;
        } catch (error) { /* 忽略 */ }
      }, []);

      // 一键全停：总开关关掉、组件卸载、页面隐藏时都用它兜底
      const stopAllSfx = React.useCallback(() => {
        Object.keys(audioRef.current).forEach((k) => stopSfx(k));
        Object.keys(ambRef.current).forEach((k) => {
          try {
            const el = ambRef.current[k];
            el.pause();
            el.currentTime = 0;
          } catch (error) { /* 忽略 */ }
        });
        stopEveryAudio();          // 连早期挂载实例留下的那些一起停
      }, [stopSfx]);

      // 只停一次性音效（塔罗五路 + 播报三路）：环境音景归它自己的总开关管，不跟着一起停
      const stopOneShots = React.useCallback(() => {
        Object.keys(audioRef.current).forEach((k) => stopSfx(k));
        stopEveryAudio('sfx');
      }, [stopSfx]);

      // 音效总开关关掉就停这一路；环境音景有独立开关，主人没关就继续放
      React.useEffect(() => {
        const snd = cfg.sound || {};
        if (!snd.on) stopOneShots();
      }, [cfg.sound, stopOneShots]);

      // 卸载时才全停（连音景一起）；页面切走照旧放，由主人自己关
      React.useEffect(() => () => stopAllSfx(), [stopAllSfx]);

      // C8 每日一牌提醒：30 秒看一眼表，到点且今天还没抽就冒一句；同一天只提醒一次
      React.useEffect(() => {
        const rem = cfg.remind || {};
        if (rem.on !== true) return undefined;
        const hh = (rem.hh >= 0 && rem.hh <= 23) ? rem.hh : 21;
        const mm = (rem.mm >= 0 && rem.mm <= 59) ? rem.mm : 0;
        const at = hh * 60 + mm;
        const tick = () => {
          const now = new Date();
          const day = localDayKey(now);
          const done = remindDoneRef.current;
          if (done && done.d === day) return;                  // 今天提醒过 / 今天已经抽过
          if (now.getHours() * 60 + now.getMinutes() < at) return;   // 还没到点
          // 正播着账目（这一轮花了多少 / 有件事在等你）就让一让：抢话会把她刚说的顶掉，
          // 下一轮 30 秒后再来，提醒不会丢
          if (Date.now() < specialUntilRef.current) return;
          const rec = { d: day, t: Date.now() };
          remindDoneRef.current = rec;
          saveRemindState(rec);
          const drawn = dailyCardRef.current && dailyCardRef.current.d === day;
          if (drawn) return;                                   // 今天的牌已经抽了，不吵
          // 放下手里的活、抬眼；气泡开着才说话，音效按「结果铃」那一路的开关走
          setPose('reading');
          playSfx('bell');
          saySpecial('今天的牌还没抽。', '每日一牌 · ' + hhmmLabel(hh, mm) + ' · 去抽一张？', 12000);
        };
        tick();
        const id = window.setInterval(tick, 30000);
        return () => window.clearInterval(id);
      }, [cfg.remind, playSfx, saySpecial]);

      // W4 安神 3 分钟：4 秒吸、2 秒停、6 秒呼，12 秒一圈；走到 0 自己收，姿势回 idle
      React.useEffect(() => {
        if (!breatheOpen) return undefined;
        breatheStart.current = Date.now();
        setBreatheLeft(180);
        const timer = window.setInterval(() => {
          const left = Math.max(0, 180 - Math.floor((Date.now() - breatheStart.current) / 1000));
          setBreatheLeft(left);
          if (left <= 0) {
            window.clearInterval(timer);
            setBreatheOpen(false);
            setPose(cfgPoseRef.current);
            playSfx('bell');
            sayIdle('三分钟到了。');
          }
        }, 500);
        return () => window.clearInterval(timer);
      }, [breatheOpen]);

      // W19 环境音景：按 cfg.amb 同步四路循环（可叠加混音：雨 + 壁炉 + 夜风 + 翻书）
      React.useEffect(() => {
        const amb = cfg.amb || {};
        const want = amb.on === true;
        const vol = Math.min(1, Math.max(0, ((amb.volume == null ? 45 : amb.volume) / 100) * 0.9));
        Object.keys(AMB).forEach((key) => {
          const on = want && ((amb.tracks || {})[key] === true);
          let el = ambRef.current[key];
          if (on) {
            if (!el) {
              el = makeAudio(ambSrc(key), 'amb');
              el.loop = true;
              el.preload = 'auto';
              ambRef.current[key] = el;
            }
            try {
              el.volume = vol;
              if (el.paused) {
                const pr = el.play();
                if (pr && pr.catch) pr.catch(() => {});
              }
            } catch (error) { /* 浏览器不让播就静默 */ }
          } else if (el) {
            try { el.pause(); el.currentTime = 0; el.volume = 0; } catch (error) { /* 忽略 */ }
          }
        });
      }, [cfg.amb]);

      // 页面切走不停：环境音景由配置页的开关说了算（主人 2026-11-18 定的口径）

      // 吸附边的边距：贴边留一点点，不蹭到窗口边框
      const EDGE_X = 14;
      const EDGE_Y = 10;
      const SNAP = 30;            // 松手时离边 30px 内就吸上去
      // 顶部安全区：DSH 是无边框窗口，最小化/最大化/关闭那三个按钮画在窗口最上面约 36–40px 里，
      // 面板钻进去就会被盖掉一个角（2026-11-17 主人截图：右上角 ¥ 与 × 全被压住）
      const SAFE_TOP = 44;

      const place = () => {
        const el = rootRef.current;
        if (!el) return;
        const w = el.offsetWidth || LAYOUT.rootW * scale;
        const hgt = el.offsetHeight || LAYOUT.rootH * scale;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const anc = cfg.anchor || {};
        let x;
        let y;
        if (anc.h === 'right') x = vw - w - EDGE_X;
        else if (anc.h === 'left') x = EDGE_X;
        else if (typeof cfg.x === 'number') x = cfg.x;
        else x = vw - w - EDGE_X;

        if (anc.v === 'bottom') y = vh - hgt - EDGE_Y;
        else if (anc.v === 'top') y = EDGE_Y;
        else if (typeof cfg.y === 'number') y = cfg.y;
        else y = vh - hgt - EDGE_Y;

        x = Math.min(Math.max(4, x), Math.max(4, vw - w - 4));
        y = Math.min(Math.max(4, y), Math.max(4, vh - hgt - 4));
        el.style.left = x + 'px';
        el.style.top = y + 'px';
        el.style.right = 'auto';
        el.style.bottom = 'auto';
        // 面板 332 宽：右边放不下就往右开
        setOpenLeft(x < 344);
      };

      React.useEffect(() => {
        place();
        const onResize = () => {
          place();
          setWinSize({ w: window.innerWidth, h: window.innerHeight });
          // 自由位置也要跟着夹回视口，否则窗口缩小后面板留在旧坐标上
          setPanelPos((prev) => {
            if (!prev) return prev;
            const pw = 340;
            const ph = panelRef.current ? panelRef.current.offsetHeight : 420;
            const nx = Math.min(Math.max(6, prev.x), Math.max(6, window.innerWidth - pw - 6));
            const ny = Math.min(Math.max(SAFE_TOP, prev.y), Math.max(SAFE_TOP, window.innerHeight - ph - 6));
            if (nx === prev.x && ny === prev.y) return prev;
            const next = { x: nx, y: ny };
            panelPosRef.current = next;
            try { window.localStorage.setItem(PANEL_POS_KEY, JSON.stringify(next)); } catch (error) { /* 忽略 */ }
            return next;
          });
        };
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
      }, [scale, cfg.x, cfg.y, cfg.anchor, cfg.onlyPanel]);

      const setAndSave = (patch) => {
        setCfg((prev) => {
          const next = Object.assign({}, prev, patch);
          saveCfg(next);
          return next;
        });
      };

      // 读改写的开关必须走这个：面板的 onClick 挂在 effect 里，闭包里的 cfg 是「上次重新挂监听时」的快照，
      // 用它去算新对象会把别的开关一起写回旧值（夜风一开、翻书被顶掉就是这么来的）。
      // 这里只在 React 的 updater 里读 prev，永远是最新值。
      const patchCfg = (fn) => {
        setCfg((prev) => {
          const next = fn(prev);
          saveCfg(next);
          return next;
        });
      };

      // 拖拽
      const onPointerDown = (e) => {
        if (e.button !== 0) return;
        const el = rootRef.current;
        if (!el) return;
        // 记下按下的真实目标：setPointerCapture 之后 pointerup 的 target 会变成 root，
        // 那时再判断「点的是不是水晶球」就晚了
        dragRef.current = { px: e.clientX, py: e.clientY, ox: el.offsetLeft, oy: el.offsetTop, moved: false, id: e.pointerId, target: e.target };
        try { el.setPointerCapture(e.pointerId); } catch (error) { /* 老浏览器 */ }
      };

      const onPointerMove = (e) => {
        const d = dragRef.current;
        if (!d || d.id !== e.pointerId) return;
        const dx = e.clientX - d.px;
        const dy = e.clientY - d.py;
        if (!d.moved && Math.abs(dx) + Math.abs(dy) < 4) return;
        d.moved = true;
        if (!dragging) setDragging(true);
        // 拖动时清掉文字选区，不然拖一次选中一片聊天记录
        try {
          const sel = window.getSelection && window.getSelection();
          if (sel && sel.rangeCount) sel.removeAllRanges();
        } catch (error) { /* 忽略 */ }
        const el = rootRef.current;
        if (!el) return;
        const w = el.offsetWidth;
        const hgt = el.offsetHeight;
        const x = Math.min(Math.max(4, d.ox + dx), Math.max(4, window.innerWidth - w - 4));
        const y = Math.min(Math.max(4, d.oy + dy), Math.max(4, window.innerHeight - hgt - 4));
        el.style.left = x + 'px';
        el.style.top = y + 'px';
      };

      const onPointerUp = (e) => {
        const d = dragRef.current;
        if (!d) return;
        dragRef.current = null;
        setDragging(false);
        const el = rootRef.current;
        if (!el) return;
        if (d.moved) {
          const w = el.offsetWidth;
          const hgt = el.offsetHeight;
          const vw = window.innerWidth;
          const vh = window.innerHeight;
          const left = el.offsetLeft;
          const top = el.offsetTop;
          const gapL = left;
          const gapR = vw - (left + w);
          const gapT = top;
          const gapB = vh - (top + hgt);

          let h = null;
          if (gapL <= SNAP && gapL <= gapR) h = 'left';
          else if (gapR <= SNAP) h = 'right';
          let v = null;
          if (gapT <= SNAP && gapT <= gapB) v = 'top';
          else if (gapB <= SNAP) v = 'bottom';

          // 吸上去就把坐标对齐边距，没吸住就记自由位置
          let nx = left;
          let ny = top;
          if (h === 'left') nx = EDGE_X;
          else if (h === 'right') nx = vw - w - EDGE_X;
          if (v === 'top') ny = EDGE_Y;
          else if (v === 'bottom') ny = vh - hgt - EDGE_Y;
          nx = Math.min(Math.max(4, nx), Math.max(4, vw - w - 4));
          ny = Math.min(Math.max(4, ny), Math.max(4, vh - hgt - 4));
          el.style.left = nx + 'px';
          el.style.top = ny + 'px';
          setAndSave({ x: nx, y: ny, anchor: { h: h, v: v } });
          setOpenLeft(nx < 344);
        } else {
          // 点到水晶球 = 开面板；点人物本体 = 只搭话（.srs-gear 在 root 内，得在这儿分流）
          const tg = d.target;
          const onGear = !!(tg && tg.closest && tg.closest('.srs-gear'));
          if (onGear) openPanel();
          else tapGreet();
        }
      };

      // 数据：牌序与判词都内联在产物里，不需要请求任何路由
      const loadData = () => {
        if (dataRef.current) return Promise.resolve(dataRef.current);
        dataRef.current = { deck: DECK, tarot: TAROT };
        return Promise.resolve(dataRef.current);
      };

      // 点她一下：只冒一句随机台词 + 换个姿势 —— **不打开面板**。
      // 面板入口只有一处：右上角水晶球（.srs-gear）。点人物就能开菜单的话，
      // 想摸摸她看反应时总会误开面板（2026-11-17 主人定的交互）。
      const greetTimer = React.useRef(null);
      const GREET_POSES = ['smile', 'smirk', 'think', 'reading', 'annoyed'];
      // 连点也要有反应：把上一句排掉再抽，否则 say() 的去重会让第二次点击"没反应"
      const pickOther = React.useCallback((kind) => {
        const arr = (linesFor(cfg, kind) || []).slice();
        if (arr.length <= 1) return arr[0] || '';
        const rest = arr.filter((x) => x !== lastLineRef.current);
        const pool = rest.length ? rest : arr;
        return pool[Math.floor(Math.random() * pool.length)];
      }, [cfg]);
      const tapGreet = React.useCallback(() => {
        napRef.current = false;        // 睡着了被点一下，先醒过来
        setPose(GREET_POSES[Math.floor(Math.random() * GREET_POSES.length)]);
        window.clearTimeout(greetTimer.current);
        greetTimer.current = window.setTimeout(() => setPose(cfgPoseRef.current), 2800);
        say(pickOther('ask'));
      }, [cfg, say, pickOther]);

      const wait = (ms) => new Promise((resolve) => { window.setTimeout(resolve, ms); });

      const doDraw = async (modeArg) => {
        if (busyRef.current) return;
        busyRef.current = true;
        const pick = modeArg || cfg.spread;
        const mode = (pick === 'three' || pick === 'daily' || pick === 'celtic') ? pick : 'one';
        const want = mode === 'celtic' ? 10 : (mode === 'three' ? 3 : 1);
        // 每日一牌：单张当天已锁 → 直接把她那天抽到的那张摆回来，不再重抽
        if (mode === 'daily' && dailyCard && dailyCard.d === localDayKey()) {
          const locked = (DECK.cards || []).find((c) => c.id === dailyCard.id);
          if (locked) {
            const meaning = meaningOf(locked, DECK, TAROT, !!dailyCard.reversed);
            setResults([{ card: locked, reversed: !!dailyCard.reversed, meaning }]);
            setResult({ card: locked, reversed: !!dailyCard.reversed, meaning, seed: dailyCard.seed, locked: true });
            setPhase('shown');
            setPose('smile');
            say('今天的牌已经定过了，明天再来。');
            busyRef.current = false;
            return;
          }
        }
        setPhase('shuffling');
        setResult(null);
        setResults([]);
        setPicked([]);
        pickedRef.current = [];
        let data;
        try {
          data = await loadData();
        } catch (error) {
          setPhase('error');
          busyRef.current = false;
          return;
        }
        const cards = (data.deck && data.deck.cards) || [];
        if (!cards.length) { setPhase('error'); busyRef.current = false; return; }

        setPose('shuffle');
        playSfx('shuffle');
        say(pickLine(cfg, 'shuffle'));
        // 洗牌动画：6 张牌背 1s + 末张 delay .25s = 1.25s 走完，末帧正好叠成一叠再切 spread
        await wait(1300);
        setPose('spread');
        say(pickLine(cfg, 'spread'));
        await wait(560);
        setPose('draw');
        await wait(420);

        playSfx('draw');
        // 摊牌后停下等她点一张（T5「点一张」），点击再落位
        const seed = newSeed();
        pickRef.current = { seed: seed, mode: mode, want: want };
        setPhase('pick');
        busyRef.current = false;
        return;
      };

      // 玩家点了第 idx 张背面 → 用同一颗种子把牌落位
      // 三张牌阵（want > 1）：一次只落一张，前两张进下面等待区，第三张落位后才出完整解读
      const finishPick = async (idx) => {
        if (busyRef.current) return;
        const info = pickRef.current;
        if (!info) return;
        busyRef.current = true;
        const mode = info.mode;
        const want = info.want;
        const multi = want > 1;
        const used = pickedRef.current || [];
        // 同一格不能点两次（多张模式下格子已标已选，这里再兜一层）
        if (multi && used.some((u) => u.idx === idx)) { busyRef.current = false; return; }
        let data;
        try {
          data = await loadData();
        } catch (error) {
          setPhase('error');
          busyRef.current = false;
          return;
        }
        const cards = (data.deck && data.deck.cards) || [];
        const rnd = prng(info.seed);
        const order = cards.map((c, i) => i);
        for (let i = order.length - 1; i > 0; i -= 1) {
          const j = Math.floor(rnd() * (i + 1));
          const tmp = order[i];
          order[i] = order[j];
          order[j] = tmp;
        }
        const start = Number(idx) || 0;
        const picks = [];
        if (multi) {
          // 位置由玩家点的那一格决定；逆位用第 used.length 个随机数，保证三张各自独立且可复现
          const card = cards[order[start % order.length]];
          for (let i = 0; i < used.length; i += 1) rnd();
          const reversed = cfg.reversed ? rnd() < 0.5 : false;
          picks.push({ card, reversed, meaning: meaningOf(card, data.deck, data.tarot, reversed) });
        } else {
          for (let k = 0; k < want; k += 1) {
            const card = cards[order[(start + k) % order.length]];
            const reversed = cfg.reversed ? rnd() < 0.5 : false;
            picks.push({ card, reversed, meaning: meaningOf(card, data.deck, data.tarot, reversed) });
          }
        }
        const seed = info.seed;

        // 抽牌那一下：先把「抽牌」组说出去，再走翻牌（这组以前没人用，2026-11-18 接上）
        say(pickLine(cfg, 'draw'));

        // ── 多张模式：只记下位置，牌面一律留在背面 ──
        if (multi) {
          const next = used.concat([Object.assign({ idx: start }, picks[0])]);
          pickedRef.current = next;
          setPicked(next);
          setPose('flip');
          playSfx('flip');
          await wait(300);
          // 挑满也不出结果：停在这里，等玩家点「翻开这三张」才一次性翻
          setPose(next.length >= want ? 'reading' : 'spread');
          busyRef.current = false;
          return;
        }

        const finalPicks = picks;
        pickRef.current = null;
        setPhase('flip');
        setPose('flip');
        playSfx('flip');
        say(pickLine(cfg, 'flip'));
        await wait(460);

        setResults(finalPicks);
        setResult(Object.assign({ seed }, finalPicks[0]));
        setPhase('shown');
        setPose('smile');
        playSfx('bell');
        say(pickLine(cfg, 'done'));
        if (mode === 'daily') {
          const rec = {
            d: localDayKey(),
            id: finalPicks[0].card.id,
            reversed: finalPicks[0].reversed,
            seed,
            name: finalPicks[0].card.name_zh,
            numeral: finalPicks[0].card.numeral,
          };
          saveDailyCard(rec);
          setDailyCard(rec);
        }
        // t 必须逐条递增：凯尔特十张是同一毫秒写进去的，时间戳相同会导致删一条删掉一整组
        finalPicks.forEach((p, hi) => pushHistory({
          t: Date.now() + hi,
          id: p.card.id,
          name: p.card.name_zh,
          numeral: p.card.numeral,
          reversed: p.reversed,
          seed,
          spread: mode,
        }));
        busyRef.current = false;
      };

      // 三张都挑好了 → 一键翻开：牌面到这一刻才出（挑的时候只看背面）
      const revealPicks = async () => {
        if (busyRef.current) return;
        const info = pickRef.current;
        const list = pickedRef.current || [];
        if (!info || list.length < (info.want || 1)) return;
        busyRef.current = true;
        const mode = info.mode;
        const seed = info.seed;
        setPhase('flip');
        setPose('flip');
        playSfx('flip');
        say(pickLine(cfg, 'flip'));
        await wait(560);
        pickRef.current = null;
        setResults(list);
        setResult(Object.assign({ seed }, list[0]));
        setPhase('shown');
        setPose('smile');
        playSfx('bell');
        say(pickLine(cfg, 'done'));
        list.forEach((p, hi) => pushHistory({
          t: Date.now() + hi,
          id: p.card.id,
          name: p.card.name_zh,
          numeral: p.card.numeral,
          reversed: p.reversed,
          seed,
          spread: mode,
        }));
        busyRef.current = false;
      };

      // T9 同种子重放：历史里存了 seed，按同一副顺序把当时那几张重摆一遍（逆位也一并复现）
      const replayEntry = async (entry) => {
        if (busyRef.current || !entry || entry.seed == null) return;
        let all = [];
        try { all = JSON.parse(window.localStorage.getItem(HIST_KEY) || '[]'); } catch (error) { all = []; }
        // 历史是 unshift 进来的（新的在前），同一颗种子的三条正好是倒序，reverse 回去就是当年的落位顺序
        const same = all.filter((x) => x.seed === entry.seed && x.spread === entry.spread).slice().reverse();
        const mode = entry.spread === 'three' ? 'three' : (entry.spread === 'celtic' ? 'celtic' : 'one');
        const want = mode === 'celtic' ? 10 : (mode === 'three' ? 3 : 1);
        const list = (mode === 'one' || mode === 'daily' ? [entry] : same).filter(Boolean);
        setHistOpen(false);
        setTab('tarot');
        setAndSave({ spread: mode });
        setResults([]);
        setPicked([]);
        pickedRef.current = [];
        setResult(null);
        setPhase('shuffling');
        setPose('shuffle');
        playSfx('shuffle');
        say('同一副牌，再摆一次。');
        await wait(900);

        const cards = (DECK && DECK.cards) || [];
        const rnd = prng(entry.seed >>> 0);
        const order = cards.map((c, i) => i);
        for (let i = order.length - 1; i > 0; i -= 1) {
          const j = Math.floor(rnd() * (i + 1));
          const tmp = order[i];
          order[i] = order[j];
          order[j] = tmp;
        }
        const idxOf = (id) => {
          const at = order.findIndex((ci) => cards[ci] && cards[ci].id === id);
          return at < 0 ? 0 : at;
        };
        pickRef.current = { seed: entry.seed >>> 0, mode: mode, want: want };
        setPose('spread');
        for (let i = 0; i < list.length; i += 1) {
          const info = pickRef.current;
          if (!info) break;
          await finishPick(idxOf(list[i].id));
          await wait(90);
        }
        if (mode === 'three') await revealPicks();
        if (mode === 'celtic') await revealPicks();
        busyRef.current = false;
      };

      // D4 快捷键：Alt+S 开合面板，Alt+Z 直接抽一张（不拦普通输入，只在带 Alt 时接）
      React.useEffect(() => {
        const onKey = (e) => {
          if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
          const key = String(e.key || '').toLowerCase();
          if (key !== 's' && key !== 'z') return;
          e.preventDefault();
          if (key === 's') {
            if (panelOpen) { playSfx('collect'); setPanelOpen(false); stopOneShots(); }
            else openPanel();
            return;
          }
          setTab('tarot');
          setHistOpen(false);
          setDeckOpen(false);
          setReviewOpen(false);
          setAndSave({ spread: 'one' });
          setResults([]);
          setPicked([]);
          pickedRef.current = [];
          setResult(null);
          setPhase('idle');
          doDraw('one');
        };
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
      }, [panelOpen, cfg.spread]);

      const hit = box.box || [0, 0, 1, 1];      // 根节点宽高已经按 scale 撑开，舞台只负责填满，不能再乘一次 scale（会双倍并溢出）
      const stageStyle = cfg.onlyPanel
        ? { display: 'none' }
        : {
          width: LAYOUT.rootW * scale + 'px',
          height: LAYOUT.rootH * scale + 'px',
        };

      const cardImg = result
        ? '/srs/cards/big/' + result.card.id + '.webp?v=' + VERSION
        : null;

      // 面板几何全部内联并锚到视口：DSH 覆盖层的父级带 transform，会把 absolute/fixed 的包含块换掉，
      // 依赖父元素定位就会被顶出可视区（2026-11-17 真机踩到）
      const vh = winSize.h;
      const vw = winSize.w;
      // 「只留水晶球」时整个挂件收缩成水晶球那么大：人物节点整块 display:none。
      // 只把 stage 设成 opacity:0 是不够的 —— 那块大矩形会留在页面上（hover 还能浮出水晶球），
      // 看着就像凭空多出一个方框、水晶球蹲在它右上角（2026-11-17 主人指出）
      const MINI_SIZE = 54;
      const rootH = cfg.onlyPanel ? MINI_SIZE : Math.round(LAYOUT.rootH * scale);
      const rootW = cfg.onlyPanel ? MINI_SIZE : Math.round(LAYOUT.rootW * scale);
      // 位置与 place() 走同一套算法：只留水晶球时挂件从 340 缩到 54，
      // 若还用记忆里的 x/y 当左上角，球会往左跳一大截、关回来时半个人跑出窗口
      const EDGE_X0 = 14;
      const EDGE_Y0 = 10;
      const anchorOf = () => cfg.anchor || {};
      const posOf = (size, isX) => {
        const anc = anchorOf();
        const vp = isX ? vw : vh;
        const edge = isX ? EDGE_X0 : EDGE_Y0;
        const saved = isX ? cfg.x : cfg.y;
        const key = isX ? anc.h : anc.v;
        const far = isX ? 'right' : 'bottom';
        const near = isX ? 'left' : 'top';
        let v;
        if (key === far) v = vp - size - edge;
        else if (key === near) v = edge;
        else if (typeof saved === 'number') v = saved;
        else v = vp - size - edge;
        return Math.min(Math.max(4, v), Math.max(4, vp - size - 4));
      };
      const rootTopY = posOf(rootH, false);
      const rootLeftX = posOf(rootW, true);
      // 挂在屏幕左侧就把所有姿势水平镜像，让她面向屏幕中心（主人 2026-11-18：放左下角要镜像）。
      // 判据：吸附到左 = 镜像；自由态按中心点在左半屏 = 镜像；只留水晶球时没有人物，不参与。
      const anchorH = (cfg.anchor || {}).h;
      // 挂件在左侧（与「只留水晶球」无关）：气泡、水晶球都要跟着翻到朝屏幕中心那一侧
      const leftSide = anchorH ? anchorH === 'left' : (rootLeftX + rootW / 2 < vw / 2);
      const mirrored = !cfg.onlyPanel && leftSide;
      // 面板底边贴在她头顶之上 10px，人物被拖到哪面板就跟到哪；拖过面板就按记忆位置走
      const panelBottom = Math.max(12, vh - rootTopY + 10);
      const panelMaxH = panelPos
        ? Math.max(280, vh - SAFE_TOP - 12)
        : Math.max(280, vh - panelBottom - SAFE_TOP);
      // 内容区固定高度：头(≈40)+分隔(≈18)+标签(≈56)+脚(≈64) 之外，剩下的全部给 body
      const PANEL_CHROME = 158;
      // 托底值不能写 240：窗口矮的时候（挂件贴近底边 / 小窗）panelMaxH-158 会小于 240，
      // 固定托底会让面板总高超过 maxHeight —— 内容顶出面板，「关闭」按钮下方多出一截空白（真机见过）
      const bodyH = Math.max(140, Math.min(430, panelMaxH - PANEL_CHROME));
      const panelStyle = panelPos
        ? {
          position: 'fixed',
          width: '340px',
          boxSizing: 'border-box',
          left: Math.min(Math.max(6, panelPos.x), Math.max(6, vw - 348)) + 'px',
          top: Math.min(Math.max(SAFE_TOP, panelPos.y), Math.max(SAFE_TOP, vh - 120)) + 'px',
          right: 'auto',
          bottom: 'auto',
          maxHeight: panelMaxH + 'px',
          zIndex: 9999,
        }
        : {
          position: 'fixed',
          width: '340px',
          boxSizing: 'border-box',
          left: Math.min(Math.max(8, rootLeftX + rootW - 340), Math.max(8, vw - 348)) + 'px',
          right: 'auto',
          bottom: panelBottom + 'px',
          maxHeight: panelMaxH + 'px',
          zIndex: 9999,
        };
      const slotStyle = { width: '168px', height: '252px', margin: '0 auto', overflow: 'hidden', position: 'relative' };
      const slotImgStyle = { width: '100%', height: '100%', objectFit: 'cover', display: 'block' };

      // DSH 覆盖层里 React 的合成点击不触发（elementFromPoint 指向自己的节点却收不到 onClick），
      // 所以面板内的交互全部用原生监听器接管：捕获阶段拦冒泡 + 按 data-act 分发。
      const handlersRef = React.useRef({});
      handlersRef.current = { draw: doDraw, close: () => { playSfx('collect'); setPanelOpen(false); stopOneShots(); } };
      // 换子页时把内容区滚回顶部：不然点进「回顾」还停在上一页滑到的位置，第一行（含返回）看不见
      const topBody = () => { const b = bodyRef.current; if (b) b.scrollTop = 0; };

      React.useEffect(() => {
        const el = panelRef.current;
        if (!el) return undefined;
        const swallow = (e) => { e.stopPropagation(); };
        const onClick = (e) => {
          const t = e.target && e.target.closest ? e.target.closest('[data-act]') : null;
          if (!t) return;
          const act = t.getAttribute('data-act');
          if (act === 'draw') handlersRef.current.draw(cfg.spread);
          else if (act === 'close') handlersRef.current.close();
          else if (act.indexOf('divine-') === 0 && act !== 'divine-draw') {
            setDivineMode(act.slice(7));
            setDivineCards([]);
          }
          else if (act === 'divine-draw') {
            doDivine(divineMode);
          }
          else if (act.indexOf('mood-') === 0) {
            const id = act.slice(5);
            const day = localDayKey();
            // 每个心情各自记当天点了几次：第 1 次用日种子（今天的心情牌可回看），第 2 次起每次重抽
            const rec = { d: day, mood: id, picks: {} };
            try {
              const prev = JSON.parse(window.localStorage.getItem(MOOD_KEY) || 'null');
              if (prev && prev.d === day && prev.picks && typeof prev.picks === 'object') rec.picks = prev.picks;
            } catch (error) { /* 忽略：读不出来就当今天第一次 */ }
            rec.picks[id] = (Number(rec.picks[id]) || 0) + 1;
            try { window.localStorage.setItem(MOOD_KEY, JSON.stringify(rec)); } catch (error) { /* 忽略 */ }
            setMood(rec);
            // 第 1 次：同一天同一心情稳定同一张（可回看）；第 2 次起：掺时间戳重抽，每次都不一样
            const nth = rec.picks[id];
            const seed = nth === 1
              ? strHash('mood|' + id + '|' + day)
              : ((strHash('mood|' + id + '|' + day + '|' + nth) ^ (Date.now() & 0xffffffff)) >>> 0);
            const rnd = prng(seed);
            const cards = (DECK && DECK.cards) || [];
            if (cards.length) {
              const card = cards[Math.floor(rnd() * cards.length)];
              const reversed = cfg.reversed ? rnd() < 0.5 : false;
              setMoodPick({ card: card, reversed: reversed, empathy: empathyOf(card.id) });
              setPose('smile');
              playSfx('bell');
              say('不用解释，我大概知道。');
            }
          }
          // 抽牌的「点第 N 张」：必须锚住纯数字，否则会把 pick-sign-* 一起吃掉
          // （`'pick-sign-capricorn'.indexOf('pick-') === 0`，所以以前点星座一路走到
          //  finishPick(parseInt('sign-capricorn')) = finishPick(NaN)，等于没反应）
          else if (/^pick-\d+$/.test(act)) { finishPick(parseInt(act.slice(5), 10)); }
          else if (act === 'reveal') { revealPicks(); }
          else if (act === 'hist-open') { setHistOpen(true); setDeckOpen(false); setReviewOpen(false); topBody(); }
          else if (act === 'deck-open') { setDeckOpen(true); setHistOpen(false); setReviewOpen(false); setDeckPick(null); topBody(); }
          else if (act === 'deck-back') { setDeckOpen(false); setDeckPick(null); topBody(); }
          else if (act === 'deck-clear') { setDeckPick(null); }
          else if (act.indexOf('deck-open-') === 0) { setDeckPick(act.slice(10)); setDeckSide('up'); }
          else if (act.indexOf('deck-group-') === 0) { setDeckGroup(act.slice(11)); setDeckPick(null); }
          else if (act === 'deck-up') { setDeckSide('up'); }
          else if (act === 'deck-rev') { setDeckSide('rev'); }
          else if (act === 'hist-back') { setHistOpen(false); topBody(); }
          // T15 牌阵收藏命名：只给这一局起个名字，不改牌、不改历史顺序
          else if (act === 'hist-rename-cancel') { setRenameKey(null); }
          else if (act === 'hist-rename-save') {
            const t = renameKey;
            const val = nameRef.current ? String(nameRef.current.value || '').trim().slice(0, 24) : '';
            if (t !== null) {
              try {
                const list = JSON.parse(window.localStorage.getItem(HIST_KEY) || '[]');
                const next = list.map((x) => (String(x.t) === String(t) ? Object.assign({}, x, { label: val }) : x));
                window.localStorage.setItem(HIST_KEY, JSON.stringify(next));
              } catch (error) { /* 忽略 */ }
              setHistVer((v) => v + 1);
              setRenameKey(null);
              say(val ? '记住了：' + val : '名字去掉了');
            }
          }
          else if (act.indexOf('hist-rename-') === 0) { setRenameKey(act.slice(12)); }
          // W9/W10 回顾子页
          else if (act === 'review-open') { setReviewOpen(true); setHistOpen(false); setDeckOpen(false); topBody(); }
          else if (act === 'review-back') { setReviewOpen(false); topBody(); }
          // T14 牌义详略
          else if (act === 'detail-brief' || act === 'detail-full') {
            setAndSave({ detail: act === 'detail-full' ? 'full' : 'brief' });
          }
          // W4 安神 3 分钟
          else if (act === 'breathe-open') {
            setBreatheOpen(true);
            setPose('reading');
            playSfx('bell');
            say('坐下，跟着圈走：吸 4 秒，停 2 秒，呼 6 秒。');
          }
          else if (act === 'breathe-stop') {
            setBreatheOpen(false);
            setPose(cfgPoseRef.current);
            say('就到这儿，慢慢来。');
          }
          // W17 许愿瓶：选时机 / 封存 / 到期打开 / 删
          else if (act.indexOf('wish-when-') === 0) {
            const k = act.slice(10);
            if (WISH_WHEN[k]) setWishWhen(k);
          }
          else if (act === 'wish-save') {
            const txt = wishRef.current ? wishRef.current.value.trim() : '';
            if (!txt) { say('瓶子里得有句话。'); return; }
            const openAt = wishOpenDay(wishWhenRef.current, profile.birthday);
            if (!openAt) { say('先去档案填生日，才排得出那天。'); return; }
            const list = [{
              id: Date.now(),
              text: txt.slice(0, 300),
              when: wishWhenRef.current,
              at: isoDay(),
              openAt,
              openedAt: '',
            }].concat(wishesRef.current);
            setWishes(list);
            saveWishes(list);
            if (wishRef.current) wishRef.current.value = '';
            const d = daysUntil(openAt);
            setPose('smile');
            playSfx('bell');
            say(d > 0 ? ('封好了。' + openAt + ' 那天再来看，还有 ' + d + ' 天。') : '封好了，今天就能开。');
          }
          else if (act.indexOf('wish-open-') === 0) {
            const id = act.slice(10);
            const one = wishesRef.current.find((w) => String(w.id) === id);
            if (!one || one.openedAt) return;
            if (daysUntil(one.openAt) > 0) { say('还没到日子，再等等。'); return; }
            const list = wishesRef.current.map((w) => (String(w.id) === id
              ? Object.assign({}, w, { openedAt: isoDay() }) : w));
            setWishes(list);
            saveWishes(list);
            setPose('reading');
            playSfx('bell');
            say('开了。');
          }
          else if (act.indexOf('wish-del-') === 0) {
            const id = act.slice(9);
            const list = wishesRef.current.filter((w) => String(w.id) !== id);
            setWishes(list);
            saveWishes(list);
          }
          // 人物姿态：固定某一张 / 回到自动
          else if (act === 'pose-auto') {
            setAndSave({ posePin: '' });
            setPose('idle-a');
            say('好，我自己换姿势。');
          }
          else if (act.indexOf('pose-') === 0) {
            const key = act.slice(5);
            if (!POSE_LABEL[key]) return;
            setAndSave({ posePin: key });
            setPose(key);
            say('就站这张。');
          }
          else if (act === 'hist-clear') {
            try { window.localStorage.removeItem(HIST_KEY); } catch (error) { /* 忽略 */ }
            setHistVer((v) => v + 1);
          }
          else if (act.indexOf('hist-del-') === 0) {
            const t = act.slice(9);
            try {
              const list = JSON.parse(window.localStorage.getItem(HIST_KEY) || '[]');
              window.localStorage.setItem(HIST_KEY, JSON.stringify(list.filter((x) => String(x.t) !== String(t))));
            } catch (error) { /* 忽略 */ }
            setHistVer((v) => v + 1);
          }
          else if (act === 'export-card' || act === 'export-card-34') {
            if (!result || exporting) return;
            setExporting(true);
            const isWide = act === 'export-card-34';
            renderResultCard({
              cardSrc: '/srs/cards/big/' + result.card.id + '.webp?v=' + VERSION,
              name: result.card.name_zh,
              numeral: result.card.numeral,
              orientation: result.reversed ? '逆位' : '正位',
              lines: (result.meaning && result.meaning.lines) || [],
              keywords: (result.meaning && result.meaning.keywords) || [],
              date: localDayKey(),
              ratio: isWide ? '34' : '916',
            }).then((canvas) => {
              // toBlob 在大画布上偶发不回调（实测 1080×1920 无响应），改用 toDataURL 一步到位
              const dataUrl = canvas.toDataURL('image/png');
              downloadDataUrl(dataUrl, 'sorceress-' + localDayKey() + '-' + result.card.id + (isWide ? '-34' : '') + '.png');
              say('图存好了');
            }).catch(() => {
              say('存图失败，可能浏览器拦了');
            }).then(() => setExporting(false));
          }
          else if (act === 'export-horo') {
            if (exporting) return;
            const horo = todayCard(signFromBirthday(profile.birthday) || 'aries', HORO, new Date());
            if (!horo) { say('运势还没读到'); return; }
            setExporting(true);
            renderHoroCard({
              date: localDayKey(),
              glyph: horo.sign.glyph,
              sign: horo.sign.name,
              range: horo.sign.range,
              element: horo.sign.element,
              ruler: horo.sign.ruler,
              mood: horo.mood,
              domains: horo.domains.map((d) => ({ label: d.label, stars: '★★★★★'.slice(0, d.stars) + '☆☆☆☆☆'.slice(0, 5 - d.stars), text: d.text })),
              doIt: horo.doIt,
              avoid: horo.avoid,
              color: horo.color,
              number: horo.number,
              slot: horo.slot,
              sky: horo.phaseName + ' · 月亮' + horo.moonSign.name + ' · ' + horo.retroLine,
              witch: horo.witch,
            }).then((canvas) => {
              downloadDataUrl(canvas.toDataURL('image/png'), 'sorceress-horo-' + localDayKey() + '-' + horo.sign.id + '.png');
              say('运势存好了');
            }).catch(() => {
              say('存图失败，可能浏览器拦了');
            }).then(() => setExporting(false));
          }
          else if (act === 'open-menu') {
            setPanelOpen(true);
            loadBilling();
            loadUsage(usageRange);
          }
          else if (act === 'about-open') { setAboutOpen(true); topBody(); }
          else if (act === 'about-back') { setAboutOpen(false); topBody(); }
          else if (act === 'goto-bill') { setTab('bill'); loadBilling(true); loadUsage(usageRange); }
          else if (act.indexOf('tab-') === 0) { setTab(act.slice(4)); setAboutOpen(false); }
          else if (act.indexOf('scale-') === 0) setAndSave({ scale: parseFloat(act.slice(6)) });
          else if (act === 'toggle-bubble') patchCfg((prev) => Object.assign({}, prev, {
            bubble: Object.assign({}, prev.bubble, { on: !((prev.bubble || {}).on !== false) }),
          }));
          else if (act.indexOf('notice-') === 0) {
            // 三个播报开关：默认都是开，关掉写 false（缺键当开，老配置不用迁移）
            const key = { 'notice-turn': 'turnCost', 'notice-ask': 'askWait', 'notice-approve': 'approveWait' }[act];
            if (key) {
              patchCfg((prev) => {
                const cur = prev.notice || {};
                return Object.assign({}, prev, { notice: Object.assign({}, cur, { [key]: cur[key] === false }) });
              });
            }
          }
          else if (act === 'toggle-sound') {
            // 读改写一律走 patchCfg（铁律 14）：面板监听挂在 effect 里，闭包里的 cfg 是旧快照
            const turningOn = !((cfgRef.current && cfgRef.current.sound) || {}).on;
            patchCfg((prev) => Object.assign({}, prev, {
              sound: Object.assign({}, prev.sound || {}, { on: turningOn }),
            }));
            // playSfx 读的是 cfgRef：本地先同步，点了开马上试听不会还是旧的「关」
            cfgRef.current = Object.assign({}, cfgRef.current, {
              sound: Object.assign({}, (cfgRef.current && cfgRef.current.sound) || {}, { on: turningOn }),
            });
            if (!turningOn) stopOneShots();   // 只停音效这一路，音景归音景的开关
          }
          else if (act.indexOf('track-') === 0) {
            const key = act.slice(6);
            const curSnd = (cfgRef.current && cfgRef.current.sound) || {};
            const wasOn = (curSnd.tracks || {})[key] !== false;
            patchCfg((prev) => {
              const snd = prev.sound || {};
              const tracks = Object.assign({}, snd.tracks || {}, { [key]: !wasOn });
              return Object.assign({}, prev, { sound: Object.assign({}, snd, { tracks: tracks }) });
            });
            cfgRef.current = Object.assign({}, cfgRef.current, {
              sound: Object.assign({}, curSnd, {
                tracks: Object.assign({}, curSnd.tracks || {}, { [key]: !wasOn }),
              }),
            });
            if (wasOn) stopSfx(key);
          }
          else if (act.indexOf('preview-') === 0) {
            const key = act.slice(8);
            if (!((cfgRef.current && cfgRef.current.sound) || {}).on) {
              patchCfg((prev) => Object.assign({}, prev, {
                sound: Object.assign({}, prev.sound || {}, { on: true }),
              }));
              // 试听要立刻出声：先把 ref 的开关抬起来，playSfx 读的就是它
              cfgRef.current = Object.assign({}, cfgRef.current, {
                sound: Object.assign({}, (cfgRef.current && cfgRef.current.sound) || {}, { on: true }),
              });
            }
            playSfx(key);
          }
          else if (act === 'talk-quiet' || act === 'talk-normal' || act === 'talk-chatty') {
            const level = act.slice(5);
            setAndSave({ talk: level });
            if (level === 'quiet') say('好，我不闲说了。');
            else if (level === 'chatty') say('那我多跟你说几句。');
          }
          else if (act === 'hold-3' || act === 'hold-6' || act === 'hold-10') {
            const sec = parseInt(act.slice(5), 10);
            patchCfg((prev) => Object.assign({}, prev, {
              bubble: Object.assign({}, prev.bubble || {}, { holdSec: sec }),
            }));
          }
          else if (act === 'open-edit') { setBubbleEdit('idle'); }
          else if (act === 'close-edit') { setBubbleEdit(null); }
          else if (act.indexOf('edit-group-') === 0) { setBubbleEdit(act.slice(11)); }
          else if (act === 'save-lines') {
            const txt = linesRef.current ? linesRef.current.value : '';
            const arr = txt.split('\n').map((x) => x.trim()).filter(Boolean);
            if (!arr.length) { say('至少留一句'); return; }
            const group = bubbleEdit || 'idle';
            patchCfg((prev) => {
              const next = Object.assign({}, prev.lines || {});
              next[group] = arr;
              return Object.assign({}, prev, { lines: next });
            });
            say('台词已保存');
          }
          else if (act === 'reset-lines') {
            const group = bubbleEdit || 'idle';
            patchCfg((prev) => {
              const next = Object.assign({}, prev.lines || {});
              delete next[group];
              return Object.assign({}, prev, { lines: next });
            });
            say('已恢复默认');
          }
          else if (act === 'vol-up' || act === 'vol-down') {
            const step = act === 'vol-up' ? 15 : -15;
            patchCfg((prev) => {
              const snd = prev.sound || {};
              const base = snd.volume == null ? 55 : snd.volume;
              const next = Math.max(0, Math.min(100, base + step));
              return Object.assign({}, prev, { sound: Object.assign({}, snd, { volume: next }) });
            });
          }
          // W19 环境音景：总开关 / 音量 / 四路各自开关（可叠加）—— 全部按最新 prev 计算
          else if (act === 'toggle-amb') {
            const turning = !(((cfgRef.current || {}).amb || {}).on === true);
            patchCfg((prev) => {
              const cur = prev.amb || {};
              return Object.assign({}, prev, { amb: Object.assign({}, cur, { on: turning }) });
            });
            say(turning ? '好，我给你放点声音。' : '安静下来。');
          }
          else if (act === 'amb-vol-up' || act === 'amb-vol-down') {
            patchCfg((prev) => {
              const cur = prev.amb || {};
              const base = cur.volume == null ? 45 : cur.volume;
              const next = Math.max(0, Math.min(100, base + (act === 'amb-vol-up' ? 15 : -15)));
              return Object.assign({}, prev, { amb: Object.assign({}, cur, { volume: next }) });
            });
          }
          else if (act.indexOf('amb-') === 0) {
            const key = act.slice(4);
            if (!AMB[key]) return;
            patchCfg((prev) => {
              const cur = prev.amb || {};
              const tracks = Object.assign({}, cur.tracks || {});
              tracks[key] = !(tracks[key] === true);
              return Object.assign({}, prev, { amb: Object.assign({}, cur, { tracks: tracks }) });
            });
          }
          // C8 每日一牌提醒：开关 / 时间 ±15 分钟 / 当场演示一次（演示不写提醒状态）
          else if (act === 'toggle-remind') {
            const turning = !(((cfgRef.current || {}).remind || {}).on === true);
            patchCfg((prev) => {
              const cur = prev.remind || {};
              return Object.assign({}, prev, { remind: Object.assign({}, cur, { on: turning }) });
            });
            say(turning ? '好，到点我叫你。' : '不叫了，你自己记得就好。');
          }
          else if (act === 'remind-plus' || act === 'remind-minus') {
            patchCfg((prev) => {
              const cur = prev.remind || {};
              const hh = (cur.hh >= 0 && cur.hh <= 23) ? cur.hh : 21;
              const mm = (cur.mm >= 0 && cur.mm <= 59) ? cur.mm : 0;
              const step = act === 'remind-plus' ? 15 : -15;
              const total = (((hh * 60 + mm + step) % 1440) + 1440) % 1440;
              return Object.assign({}, prev, {
                remind: Object.assign({}, cur, { hh: Math.floor(total / 60), mm: total % 60 }),
              });
            });
          }
          else if (act === 'remind-test') {
            setPose('reading');
            playSfx('bell');
            saySpecial('今天的牌还没抽。', '每日一牌 · 现在就说一遍', 8000);
          }
          // 计费提醒（仿青云剑仙）：告急线与今日预算各 ±5 元，0 = 关；开关只管余额告急那一路
          else if (act === 'bill-warn-up' || act === 'bill-warn-down') {
            patchCfg((prev) => {
              const cur = prev.bill || {};
              const next = Math.max(0, Math.min(1000, (Number(cur.warnLow) || 0) + (act === 'bill-warn-up' ? 5 : -5)));
              return Object.assign({}, prev, { bill: Object.assign({}, cur, { warnLow: next }) });
            });
          }
          else if (act === 'bill-budget-up' || act === 'bill-budget-down') {
            patchCfg((prev) => {
              const cur = prev.bill || {};
              const next = Math.max(0, Math.min(10000, (Number(cur.budget) || 0) + (act === 'bill-budget-up' ? 5 : -5)));
              return Object.assign({}, prev, { bill: Object.assign({}, cur, { budget: next }) });
            });
          }
          else if (act === 'bill-low-notice') {
            patchCfg((prev) => {
              const cur = prev.bill || {};
              return Object.assign({}, prev, { bill: Object.assign({}, cur, { lowNotice: !(cur.lowNotice !== false) }) });
            });
          }
          else if (act.indexOf('pick-sign-') === 0) {
            // 只是切换「现在在看哪个星座」，绝不回写档案生日
            setViewSign(act.slice(10));
          }
          else if (act === 'panel-reset') {
            setPanelPos(null);
            panelPosRef.current = null;
            try { window.localStorage.removeItem(PANEL_POS_KEY); } catch (error) { /* 忽略 */ }
          }
          else if (act === 'today-ask') {
            setTab('tarot');
            setHistOpen(false);
            setAndSave({ spread: 'one' });
            setResults([]);
            setPhase('idle');
            setResult(null);
            say('想问哪件事？心里说一遍。');
          }
          else if (act.indexOf('hist-replay-') === 0) {
            const t = act.slice(12);
            let entry = null;
            try {
              const list = JSON.parse(window.localStorage.getItem(HIST_KEY) || '[]');
              entry = list.find((x) => String(x.t) === String(t)) || null;
            } catch (error) { entry = null; }
            if (entry) replayEntry(entry);
          }
          else if (act === 'corner-left' || act === 'corner-right') {
            const h = act === 'corner-left' ? 'left' : 'right';
            patchCfg((prev) => Object.assign({}, prev, {
              anchor: Object.assign({}, prev.anchor || {}, { h: h }),
            }));
          }
          else if (act === 'toggle-only-panel') {
            // 文案要说「这次点完是什么状态」：闭包里的 cfg 可能是上一次渲染的快照
            const turning = !((cfgRef.current || {}).onlyPanel);
            patchCfg((prev) => Object.assign({}, prev, { onlyPanel: turning }));
            say(turning ? '好，我躲起来，水晶球留着。' : '我出来了。');
          }
          else if (act === 'cfg-export') {
            const payload = JSON.stringify({ v: 1, at: Date.now(), cfg: cfg }, null, 2);
            try {
              const blob = new Blob([payload], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = 'sorceress-cfg-' + localDayKey() + '.json';
              document.body.appendChild(a);
              a.click();
              a.remove();
              window.setTimeout(() => URL.revokeObjectURL(url), 2000);
              say('设置导出了');
            } catch (error) {
              try { window.__srsCfgExport = payload; } catch (e2) { /* 忽略 */ }
              say('导出被拦了，设置已放在 __srsCfgExport');
            }
          }
          else if (act === 'cfg-import-open') { setIoOpen(true); }
          else if (act === 'cfg-import-cancel') { setIoOpen(false); }
          else if (act === 'cfg-import') {
            const txt = ioRef.current ? ioRef.current.value : '';
            let obj = null;
            try { obj = JSON.parse(txt); } catch (error) { obj = null; }
            const patch = obj && obj.cfg ? obj.cfg : obj;
            if (!patch || typeof patch !== 'object') { say('这段不是设置'); return; }
            const merged = Object.assign({}, DEFAULT_CFG, patch);
            merged.sound = Object.assign({}, DEFAULT_CFG.sound, patch.sound || {});
            merged.bubble = Object.assign({}, DEFAULT_CFG.bubble, patch.bubble || {});
            merged.notice = Object.assign({}, DEFAULT_CFG.notice, patch.notice || {});
            merged.amb = Object.assign({}, DEFAULT_CFG.amb, patch.amb || {});
            merged.amb.tracks = Object.assign({}, DEFAULT_CFG.amb.tracks, (patch.amb || {}).tracks || {});
            merged.remind = Object.assign({}, DEFAULT_CFG.remind, patch.remind || {});
            merged.bill = Object.assign({}, DEFAULT_CFG.bill, patch.bill || {});
            setAndSave(merged);
            setIoOpen(false);
            say('设置已导入');
          }
          else if (act === 'wipe-all') { setWipeArm(true); say('再按一次就全清，清完没法找回。'); }
          else if (act === 'wipe-all-cancel') { setWipeArm(false); }
          else if (act === 'wipe-all-yes') {
            try {
              Object.keys(window.localStorage)
                .filter((k) => k.indexOf('srs.') === 0)
                .forEach((k) => window.localStorage.removeItem(k));
            } catch (error) { /* 忽略 */ }
            setWipeArm(false);
            setIoOpen(false);
            setCfg(Object.assign({}, DEFAULT_CFG));
            saveCfg(DEFAULT_CFG);
            setResults([]); setPicked([]); pickedRef.current = [];
            setResult(null); setPhase('idle'); setHistOpen(false);
            setDaily(null); setDailyCard(null); setMood(null); setMoodPick(null);
            remindDoneRef.current = null;
            setProfile({}); setPriv(null); setPinSet(false);
            say('都清干净了，重新开始。');
          }
          else if (act === 'spread-daily') { setAndSave({ spread: 'daily' }); setResults([]); setPhase('idle'); setResult(null); }
          else if (act === 'spread-one') { setAndSave({ spread: 'one' }); setResults([]); setPhase('idle'); setResult(null); }
          else if (act === 'spread-three') { setAndSave({ spread: 'three' }); setResults([]); setPicked([]); pickedRef.current = []; setPhase('idle'); setResult(null); }
          else if (act === 'spread-celtic') { setAndSave({ spread: 'celtic' }); setResults([]); setPicked([]); pickedRef.current = []; setPhase('idle'); setResult(null); }
          else if (act === 'refresh-billing') { loadBilling(true); loadUsage(usageRange); }
          else if (act.indexOf('usage-range-') === 0) {
            const r = act.slice(12);
            setUsageRange(r);
            loadUsage(r);
          }
        };
        el.addEventListener('pointerdown', swallow, true);
        el.addEventListener('pointerup', swallow, true);
        el.addEventListener('mousedown', swallow, true);
        el.addEventListener('mouseup', swallow, true);
        el.addEventListener('click', onClick, true);
        return () => {
          el.removeEventListener('pointerdown', swallow, true);
          el.removeEventListener('pointerup', swallow, true);
          el.removeEventListener('mousedown', swallow, true);
          el.removeEventListener('mouseup', swallow, true);
          el.removeEventListener('click', onClick, true);
        };
      }, [panelOpen, cfg.spread, cfg.bubble, cfg.sound, cfg.detail, divineMode, daily, divineCards, bubbleEdit, cfg.lines, result, reviewOpen, renameKey]);
      // 账目播报用的两个小工具：小额给足 4 位小数（¥0.0034 印成 ¥0.00 会被当成免费）
      const moneyTiny = (n) => {
        const v = Number(n) || 0;
        if (v === 0) return '¥0.00';
        if (v < 0.01) return '¥' + v.toFixed(4);
        if (v < 1) return '¥' + v.toFixed(3);
        return '¥' + v.toFixed(2);
      };
      const shortModel = (m) => String(m || '').replace(/^deepseek[-_]?/i, '') || '';
      // 记账起点的小时:分 —— 官方后台从 00:00 起算，本插件从自己启动那一刻起算
      const hhmm = (ts) => {
        const d = new Date(Number(ts) || 0);
        return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
      };

      // 拉账本：余额 + 今日/本月 + 峰谷 + 近 7 天（宿主代发，客户端直连会暴露 key）
      const loadBilling = React.useCallback((refresh) => {
        if (!window.fetch) return;
        setBillBusy(true);
        window.fetch('/srs/billing.json' + (refresh ? '?refresh=1' : ''), { cache: 'no-store' })
          .then((r) => r.json())
          .then((data) => setBilling(data))
          .catch(() => setBilling({ ok: false, error: '宿主没应答' }))
          .then(() => setBillBusy(false));
      }, []);

      // 用量窗口：今日 / 近 7 天 / 全部（模型占比 + 逐条明细）
      const loadUsage = React.useCallback((range) => {
        if (!window.fetch) return;
        window.fetch('/srs/usage.json?range=' + encodeURIComponent(range || 'today') + '&limit=40', { cache: 'no-store' })
          .then((r) => r.json())
          .then((data) => setUsage(data))
          .catch(() => setUsage({ ok: false }));
      }, []);

      // ── 计费提醒（仿青云剑仙）：余额低于告急线 / 今日到预算，每天各冒一句 ──
      React.useEffect(() => {
        if (!billing || billing.ok === false) return;
        const bill = cfg.bill || {};
        const day = billing.day || localDayKey();
        const prev = billWarnRef.current;
        const st = (prev && prev.d === day) ? prev : { d: day, low: false, budget: false };
        const warnLow = Number(bill.warnLow) || 0;
        const budget = Number(bill.budget) || 0;
        const bal = (typeof billing.balance === 'number') ? billing.balance : null;
        const used = Number(billing.todayUsed) || 0;
        const low = warnLow > 0 && bal !== null && bal < warnLow;
        const over = budget > 0 && used >= budget;
        let said = false;
        if (low && !st.low && bill.lowNotice !== false) {
          st.low = true;
          said = true;
          setPose('think');
          playSfx('ask');
          saySpecial('余额不多了。', '还剩 ¥' + bal.toFixed(2) + ' · 低于告急线 ¥' + warnLow, 12000);
        } else if (over && !st.budget) {
          st.budget = true;
          said = true;
          setPose('think');
          playSfx('cost');
          saySpecial('今天到预算了。', '已用 ¥' + used.toFixed(2) + ' / 预算 ¥' + budget, 12000);
        }
        if (said || st !== prev) { billWarnRef.current = st; saveBillWarn(st); }
      }, [billing, cfg.bill, playSfx, saySpecial]);

      // ── 记账播报：每轮花了多少 / 有件事在等你点头或答话（3 秒一轮，仿青云剑仙）──
      // 两条判据都不是「值变了」而是「序号变了」：seq 变大 = 又结了一轮；
      // kind+id 变化 = 新的一件挂起（同一件只吵一次，20 秒够你回来）
      React.useEffect(() => {
        const notice = cfg.notice || {};
        const wantTurn = notice.turnCost !== false;
        const wantAsk = notice.askWait !== false;
        const wantApprove = notice.approveWait !== false;
        if (!wantTurn && !wantAsk && !wantApprove) return undefined;
        let cancelled = false;
        const load = () => {
          if (!window.fetch) return;
          window.fetch('/srs/live.json', { cache: 'no-store' })
            .then((r) => r.json())
            .then((d) => {
              if (cancelled || !d || !d.ok) return;
              // ① 一轮账结完：seq 变大就报一次
              const seq = Number(d.seq) || 0;
              if (seq > liveSeqRef.current) {
                const first = liveSeqRef.current === 0 && seq > 1;   // 页面刚开先对齐基线，不补播历史
                liveSeqRef.current = seq;
                const lt = d.lastTurn;
                if (!first && lt && wantTurn) {
                  const unpriced = lt.amount === null || lt.amount === undefined;
                  const toks = (Number(lt.tokens) || 0).toLocaleString('en-US');
                  const mm = shortModel(lt.model);
                  saySpecial(
                    unpriced ? '这一轮没计价' : '这一轮 ' + moneyTiny(lt.amount),
                    toks + ' tok' + (mm ? ' · ' + mm : '') + (unpriced ? ' · 只记 token' : ''),
                    8000);
                  // 记账音：两声干爽点数。它本身比铃短得多，不能再压 0.7 倍——
                  // 那一下把 peak −3.8 dBFS 的脉冲又砍掉 3 个 dB，普通音箱上就没了（2026-11-18 主人报）
                  playSfx('cost', 1.0);
                }
              }
              // ② 有件事挂在那儿等你：同一件只说一次（它会盖掉上面那条，因为「等你决定」更要紧）
              const w = d.wait || null;
              const seen = w ? String(w.kind) + ':' + String(w.id) : '';
              if (seen !== waitSeenRef.current) {
                waitSeenRef.current = seen;
                const okKind = w && ((w.kind === 'approval' && wantApprove) || (w.kind === 'question' && wantAsk));
                if (okKind) {
                  const who = String(w.sessionName || '').trim().slice(0, 12) || '这边';
                  const isAsk = w.kind === 'question';
                  saySpecial(isAsk ? '等你说一句' : '等你点个头',
                    who + (isAsk ? ' 在等你答话。' : ' 在等你授权。'), 20000);
                  setPose(isAsk ? 'think' : 'reading');
                  // 三路分家：答话 = 上扬木琴（问句），授权 = 下沉双敲（请人开门），都不是结果铃
                  playSfx(isAsk ? 'ask' : 'approve');
                }
              }
            })
            .catch(() => {});
        };
        load();
        const id = window.setInterval(load, 3000);
        return () => { cancelled = true; window.clearInterval(id); };
      }, [cfg.notice, cfg.bubble, saySpecial, playSfx]);

      // 面板唯一入口：右上角水晶球。点人物只搭话，不进菜单（0.25.1 定的交互）
      const openPanel = React.useCallback(() => {
        // 开面板不说话了：水晶球是她的「法宝」，点它等于摸她的道具，不是搭话。
        // 之前这里 say('ask')，点水晶球会顺带冒一句气泡，看着像两颗按钮叠在一起互相触发（2026-11-17 主人指出）
        setPanelOpen(true);
        loadBilling();
        loadUsage(usageRange);
      }, [loadBilling, loadUsage, usageRange]);

      // 根节点交互：一律用「窗口捕获阶段」监听。
      // 原因：DSH 覆盖层里 React 合成事件收不到；实测事件到 root 的捕获阶段还在，
      // 但冒泡阶段的监听被中间层拦掉，所以只能在 window 捕获时抢下来，再自己判断归属。
      React.useEffect(() => {
        const el = rootRef.current;
        if (!el) return undefined;
        const inRoot = (node) => !!(el && node && (el === node || el.contains(node)));
        const inPanel = (node) => {
          const pnl = panelRef.current;
          return !!(pnl && node && pnl.contains(node));
        };
        const down = (e) => {
          if (!inRoot(e.target)) return;
          if (inPanel(e.target)) return;     // 面板里的按钮归面板自己的原生监听管
          onPointerDown(e);
        };
        const move = (e) => {
          if (!dragRef.current) return;          // 只有拖动中才接管移动
          onPointerMove(e);
        };
        const up = (e) => {
          if (!dragRef.current) return;
          onPointerUp(e);
        };
        const ctxMenu = (e) => {
          if (!inRoot(e.target)) return;
          if (inPanel(e.target)) return;
          e.preventDefault();
          e.stopPropagation();
          // 右键不开面板（菜单只走水晶球）：点在水晶球上算开面板，点人物只搭一句话
          const onGear = !!(e.target && e.target.closest && e.target.closest('.srs-gear'));
          if (onGear) openPanel();
          else tapGreet();
        };
        // ── 面板拖拽：按住标题栏（data-drag="panel"）把整块面板挪到任意位置 ──
        // 必须挂在 window 捕获上：面板自己在 el 捕获阶段 stopPropagation，挂在面板上收不到 move/up。
        const panelDown = (e) => {
          const tn = e.target;
          if (!tn || !tn.closest) return;
          if (!tn.closest('[data-drag="panel"]')) return;
          if (tn.closest('button')) return;            // 标题栏上的按钮不拖动
          const pnl = panelRef.current;
          if (!pnl) return;
          const r = pnl.getBoundingClientRect();
          panelDrag.current = {
            px: e.clientX, py: e.clientY, ox: r.left, oy: r.top,
            w: r.width, h: r.height, id: e.pointerId, moved: false,
          };
          e.stopPropagation();
        };
        const panelMove = (e) => {
          const d = panelDrag.current;
          if (!d || d.id !== e.pointerId) return;
          const dx = e.clientX - d.px;
          const dy = e.clientY - d.py;
          if (!d.moved && Math.abs(dx) + Math.abs(dy) < 3) return;   // 手抖不算拖
          d.moved = true;
          const nx = Math.min(Math.max(6, d.ox + dx), Math.max(6, window.innerWidth - d.w - 6));
          const ny = Math.min(Math.max(SAFE_TOP, d.oy + dy), Math.max(SAFE_TOP, window.innerHeight - d.h - 6));
          panelPosRef.current = { x: nx, y: ny };
          setPanelPos({ x: nx, y: ny });
          e.stopPropagation();
        };
        const panelUp = () => {
          const d = panelDrag.current;
          if (!d) return;
          panelDrag.current = null;
          if (!d.moved || !panelPosRef.current) return;
          try { window.localStorage.setItem(PANEL_POS_KEY, JSON.stringify(panelPosRef.current)); } catch (error) { /* 忽略 */ }
        };
        el.addEventListener('pointerdown', down, true);
        window.addEventListener('pointermove', move, true);
        window.addEventListener('pointerup', up, true);
        window.addEventListener('pointerdown', panelDown, true);
        window.addEventListener('pointermove', panelMove, true);
        window.addEventListener('pointerup', panelUp, true);
        window.addEventListener('contextmenu', ctxMenu, true);
        return () => {
          el.removeEventListener('pointerdown', down, true);
          window.removeEventListener('pointermove', move, true);
          window.removeEventListener('pointerup', up, true);
          window.removeEventListener('pointerdown', panelDown, true);
          window.removeEventListener('pointermove', panelMove, true);
          window.removeEventListener('pointerup', panelUp, true);
          window.removeEventListener('contextmenu', ctxMenu, true);
        };
      }, [onPointerDown, onPointerMove, onPointerUp, setAndSave, tapGreet]);

      // 面板一打开就拉一次账本（水晶球入口在面板之外，走不到面板监听里的 open-menu）
      React.useEffect(() => {
        if (!panelOpen) return;
        // 每次打开菜单都回到第一项：塔罗=每日、占卜=每日一签（不记上次选的牌阵/占卜法）
        setAndSave({ spread: 'daily' });
        setResults([]);
        setPicked([]);
        pickedRef.current = [];
        setPhase('idle');
        setResult(null);
        setDivineMode('daily');
        setDivineCards([]);
        // 子页与一次性状态一并归位：上次停在历史/牌库/回顾或正在安神，重开不该接着挂在那儿
        setHistOpen(false);
        setDeckOpen(false);
        setDeckPick(null);
        setReviewOpen(false);
        setRenameKey(null);
        setBreatheOpen(false);
        setAboutOpen(false);
        loadBilling();
        loadUsage(usageRange);
      }, [panelOpen, loadBilling, loadUsage, usageRange]);

      // 面板一关就锁档（公共场所用）：解密出来的内容与输入的密码都不留在内存里，
      // 下次打开菜单进档案页要重新输密码。走 panelOpen 而不是某几个按钮，免得漏路径
      React.useEffect(() => {
        if (panelOpen) return;
        setPriv(null);
        setPinInput('');
        setPinErr('');
      }, [panelOpen]);

      // 档案弹窗：原生监听 + 按 data-pact 分发
      React.useEffect(() => {
        const el = bodyRef.current;
        if (!el || !panelOpen || tab !== 'profile') return undefined;
        const swallow = (e) => { e.stopPropagation(); };
        const onClick = async (e) => {
          const t = e.target && e.target.closest ? e.target.closest('[data-pact]') : null;
          if (!t) return;
          const act = t.getAttribute('data-pact');
          const pin = pinRef.current ? pinRef.current.value.trim() : '';
          const dailyAll = normPriv(priv).daily;   // 改经期 / 生日时别说把每日记录冲掉
          if (act === 'close-profile') { setProfileOpen(false); setPinInput(''); setPinErr(''); setPriv(null); return; }
          if (act === 'setup') {
            const pin2 = pin2Ref.current ? pin2Ref.current.value.trim() : '';
            if (!/^\d{4,6}$/.test(pin)) { setPinErr('密码要 4–6 位数字'); return; }
            if (pin !== pin2) { setPinErr('两次输入不一致'); return; }
            try {
              await encryptPrivate(pin, { periods: [], avgLen: 28, daily: {} });
              setPinInput(pin);
              setPriv({ periods: [], avgLen: 28, daily: {} });
              setPinSet(true);
              setPinErr('');
            } catch (error) { setPinErr('设置失败：' + (error.message || '浏览器不支持')); }
            return;
          }
          if (act === 'unlock') {
            if (!pin) { setPinErr('先输密码'); return; }
            try {
              const data = await decryptPrivate(pin);
              setPinInput(pin);
              setPriv(normPriv(data));
              setPinErr('');
            } catch (error) { setPinErr('密码不对，或者数据已损坏'); }
            return;
          }
          if (act === 'cal-prev' || act === 'cal-next') {
            const step = act === 'cal-prev' ? -1 : 1;
            setCalYm((cur) => {
              const d = new Date(cur.y, cur.m + step, 1);
              return { y: d.getFullYear(), m: d.getMonth() };
            });
            return;
          }
          if (act === 'match-run') {
            const mi = matchInRef.current || {};
            const md = (mi.m || {}).d;
            const fd = (mi.f || {}).d;
            if (!md || !fd) { setPinErr('乾和坤的生日都要填'); return; }
            const pm = fourPillars(md, shiChenToTime((mi.m || {}).shi));
            const pf = fourPillars(fd, shiChenToTime((mi.f || {}).shi));
            if (!pm || !pf) { setPinErr('生日读不出来，检查一下格式'); return; }
            setPinErr('');
            setMatchOut(hepan(pm, pf));
            return;
          }
          if (act === 'add-period') {
            const start = pStartRef.current ? pStartRef.current.value : '';
            if (!start) { setPinErr('先选一个开始日期'); return; }
            const periods = ((priv && priv.periods) || []).slice();
            if (!periods.some((x) => x && x.start === start)) periods.push({ start });
            // 周期长度夹在 1–60 天：手输 0 或 200 都不该把日历算崩
            const len = cycleLenOf(pLenRef.current ? parseInt(pLenRef.current.value, 10) : ((priv && priv.avgLen) || 28));
            try {
              await encryptPrivate(pinInput, { periods, avgLen: len, daily: dailyAll });
              setPriv({ periods, avgLen: len, daily: dailyAll });
              setPinErr('');
            } catch (error) { setPinErr('加密保存失败'); }
            return;
          }
          if (act.indexOf('del-period-') === 0) {
            const target = act.slice(11);
            const periods = ((priv && priv.periods) || []).filter((x) => !(x && x.start === target));
            const len = (priv && priv.avgLen) || 28;
            try {
              await encryptPrivate(pinInput, { periods, avgLen: len, daily: dailyAll });
              setPriv({ periods, avgLen: len, daily: dailyAll });
              setPinErr('');
            } catch (error) { setPinErr('删除失败'); }
            return;
          }
          // ── W8 每天记一笔：情绪 / 睡眠，存在加密档案里 ──
          if (act.indexOf('day-mood-') === 0) {
            const v = parseInt(act.slice(9), 10);
            if (v >= 1 && v <= 5) setDayDraft((cur) => Object.assign({}, cur, { m: v }));
            return;
          }
          if (act.indexOf('day-sleep-') === 0) {
            const v = parseInt(act.slice(10), 10);
            if (v >= 1 && v <= 3) setDayDraft((cur) => Object.assign({}, cur, { s: v }));
            return;
          }
          if (act === 'save-day') {
            const key = (dDayRef.current && dDayRef.current.value) || localDayKey();
            const draft = dayDraftRef.current || { m: 0, s: 0 };
            if (!draft.m && !draft.s) { setPinErr('情绪和睡眠至少选一个'); return; }
            const nextDaily = Object.assign({}, dailyAll);
            nextDaily[key] = { m: draft.m || 0, s: draft.s || 0 };
            try {
              await encryptPrivate(pinInput, {
                periods: (priv && priv.periods) || [],
                avgLen: (priv && priv.avgLen) || 28,
                daily: nextDaily,
              });
              setPriv({
                periods: (priv && priv.periods) || [],
                avgLen: (priv && priv.avgLen) || 28,
                daily: nextDaily,
              });
              setDayDraft({ m: 0, s: 0 });
              setPinErr('');
            } catch (error) { setPinErr('保存失败'); }
            return;
          }
          if (act.indexOf('del-day-') === 0) {
            const key = act.slice(8);
            const nextDaily = Object.assign({}, dailyAll);
            delete nextDaily[key];
            try {
              await encryptPrivate(pinInput, {
                periods: (priv && priv.periods) || [],
                avgLen: (priv && priv.avgLen) || 28,
                daily: nextDaily,
              });
              setPriv({
                periods: (priv && priv.periods) || [],
                avgLen: (priv && priv.avgLen) || 28,
                daily: nextDaily,
              });
              setPinErr('');
            } catch (error) { setPinErr('删除失败'); }
            return;
          }
          if (act === 'save-profile') {
            const birth = birthRef.current ? birthRef.current.value : '';
            const btime = birthTimeRef.current ? birthTimeRef.current.value : '';
            const start = pStartRef.current ? pStartRef.current.value : '';
            const len = cycleLenOf(pLenRef.current ? parseInt(pLenRef.current.value, 10) : 28);
            const nextProfile = Object.assign({}, profile, { birthday: birth, birthTime: btime });
            try { window.localStorage.setItem(PROFILE_KEY, JSON.stringify(nextProfile)); } catch (error) { /* 忽略 */ }
            setProfile(nextProfile);
            // 点击必须有回音：按钮文字改成「✓ 已保存」，下面再给一行带本命牌的说明
            const bcard = birth ? birthCard(birth) : null;
            const bfz = fourPillars(birth, btime);
            window.clearTimeout(birthMsgTimer.current);
            setBirthMsg(birth
              ? '已保存 · ' + birth + (bcard ? ' · 本命牌 ' + bcard.name_zh + '（' + bcard.numeral + '）' : '')
                + (bfz ? ' · ' + bfz.pillars.join(' ') : '')
              : '还没选日期，选完会自动保存');
            birthMsgTimer.current = window.setTimeout(() => setBirthMsg(''), 2600);
            const periods = (priv && priv.periods) ? priv.periods.slice() : [];
            if (start) {
              const idx = periods.findIndex((x) => x && x.start === start);
              if (idx >= 0) periods[idx] = { start };
              else periods.unshift({ start });
            }
            try {
              await encryptPrivate(pinInput, { periods, avgLen: len, daily: dailyAll });
              setPriv({ periods, avgLen: len, daily: dailyAll });
              setPinErr('');
            } catch (error) { setPinErr('加密保存失败'); }
          }
        };
        el.addEventListener('pointerdown', swallow, true);
        el.addEventListener('pointerup', swallow, true);
        el.addEventListener('click', onClick, true);
        return () => {
          el.removeEventListener('pointerdown', swallow, true);
          el.removeEventListener('pointerup', swallow, true);
          el.removeEventListener('click', onClick, true);
        };
      }, [panelOpen, tab, priv, pinSet, pinInput, profile]);

      // 档案页用的输入引用（非受控：覆盖层里拿 value 比绑 onChange 稳）
      const pinRef = React.useRef(null);
      const pin2Ref = React.useRef(null);
      const birthRef = React.useRef(null);
      const birthTimeRef = React.useRef(null);
      const pStartRef = React.useRef(null);
      const pLenRef = React.useRef(null);
      const dDayRef = React.useRef(null);        // W8 每天记一笔的日期框
      const wishRef = React.useRef(null);        // W17 许愿瓶的输入框
      const linesRef = React.useRef(null);
      const ioRef = React.useRef(null);          // 设置导入框
      const cfgExportRef = React.useRef(null);   // 导出框（只读展示）

      const TABS = [['tarot', '塔罗'], ['divine', '占卜'], ['zodiac', '星座'], ['bill', '计费'], ['sound', '配置'], ['profile', '档案']];
      const money = (n) => (typeof n === 'number' ? '¥' + n.toFixed(2) : '—');
      const cycle = priv ? cycleInfo(priv.periods, priv.avgLen) : null;
      const bc = birthCard(profile.birthday);
      const ringR = 40;
      const ringC = 2 * Math.PI * ringR;
      const ringPct = cycle ? Math.min(1, Math.max(0, (cycle.dayNo - 1) / cycle.len)) : 0;
      const histRaw = (() => { try { return JSON.parse(window.localStorage.getItem(HIST_KEY) || '[]'); } catch (e) { return []; } })();
      const histCount = Array.isArray(histRaw) ? histRaw.length : 0;
      const histLast = Array.isArray(histRaw) && histRaw[0] ? (histRaw[0].name + '·' + (histRaw[0].reversed ? '逆位' : '正位')) : '还没抽过';

      // 六个标签分两组：占卜三页 / 账务与外观三页。
      // 分组只影响渲染顺序与组间留白，tab 取值与 data-act 一个没动。
      //
      // ── 插画风菜单栏：六枚内联 SVG 图标（2026-11-17 第五版：多色小画，不是线稿着色）──
      // 第四版纯线稿（1.55 灰线）、第五版初稿只加 13% currentColor 淡填——两版都被主人判「太丑」。
      // 根子在于「线稿再怎么提亮也只是通用图标库」，插画要的是**有色块、有明暗**：
      // 牌是深蓝的、收据是米白的、水晶球是玻璃的，每枚 2–3 色。
      // 所以这一版不再用 currentColor 统一上色，颜色写进数据表；层次改用整枚图标的 opacity
      // （未选 .82 / 悬停 .95 / 选中 1 + brightness 1.12），选中不靠改色。
      // 注意：CSS 里的 stroke/fill/stroke-width 会盖掉元素上的同名属性，所以这三样一律不准写进 CSS。
      const C = { gold: '#C9A45C', lit: '#E3C588', star: '#FFF3DA', parch: '#E8DDC6', ink: '#33406B', deep: '#8A7A5C' };
      const TAB_ICONS = {
        // 塔罗：深蓝牌面 + 金边 + 压在牌上的实心四角星
        tarot: [
          ['path', { d: 'M8.9 5.6l9.2 2.5a1.7 1.7 0 0 1 1.2 2.1l-2.3 8.3a1.7 1.7 0 0 1-2.1 1.2l-9.2-2.5a1.7 1.7 0 0 1-1.2-2.1L6.8 6.8a1.7 1.7 0 0 1 2.1-1.2z', fill: C.ink, stroke: C.gold, strokeWidth: 1.3 }],
          ['path', { d: 'M11.9 9.3l.85 2.35 2.35.85-2.35.85-.85 2.35-.85-2.35-2.35-.85 2.35-.85z', fill: C.lit, stroke: 'none' }],
        ],
        // 占卜：玻璃球（半透蓝）+ 金月牙 + 球面高光 + 底座弧
        divine: [
          ['circle', { cx: 12, cy: 10, r: 5.9, fill: '#BFD2EA', fillOpacity: 0.3, stroke: C.gold, strokeWidth: 1.3 }],
          ['path', { d: 'M13.5 7.4a2.7 2.7 0 1 0 .1 5.1 3.35 3.35 0 1 1-.1-5.1z', fill: C.lit, stroke: 'none' }],
          ['path', { d: 'M8.1 7.9a4.3 4.3 0 0 1 2.2-1.4', stroke: '#EAF2FF', strokeWidth: 1.1, opacity: 0.55 }],
          ['path', { d: 'M7.4 16.6c1.2 1.1 2.8 1.7 4.6 1.7s3.4-.6 4.6-1.7', stroke: C.gold, strokeWidth: 1.4 }],
        ],
        // 星座：三颗实心星（顶上一颗最亮最大）+ 淡金连线
        zodiac: [
          ['path', { d: 'M6.6 16.2L12 6.6l5.4 9.6', stroke: C.gold, strokeWidth: 1.2, opacity: 0.5 }],
          ['circle', { cx: 6.6, cy: 16.2, r: 1.7, fill: C.lit, stroke: 'none' }],
          ['circle', { cx: 12, cy: 6.6, r: 2.2, fill: C.star, stroke: 'none' }],
          ['circle', { cx: 17.4, cy: 16.2, r: 1.7, fill: C.lit, stroke: 'none' }],
        ],
        // 计费：米白收据（深色横线写在纸上）+ 金边 + 锯齿底
        bill: [
          ['path', { d: 'M6.9 4.4h10.2v15.1l-2.55-1.7-2.55 1.7-2.55-1.7L6.9 19.5z', fill: C.parch, stroke: C.gold, strokeWidth: 1.2 }],
          ['path', { d: 'M9.6 9h4.8M9.6 12.4h4.8', stroke: C.deep, strokeWidth: 1.2 }],
        ],
        // 配置：齿轮（金环 + 八枚圆头外齿 + 深色轴孔）—— 那一页不止音效，别再用音符
        sound: [
          ['circle', { cx: 12, cy: 12, r: 7.6, fill: 'none', stroke: C.lit, strokeWidth: 2.2 }],
          ['path', {
            d: 'M19.6 12H23M17.37 17.37l2.41 2.41M12 19.6V23M6.63 17.37L4.22 19.78M4.4 12H1M6.63 6.63L4.22 4.22M12 4.4V1M17.37 6.63l2.41-2.41',
            stroke: C.lit,
            strokeWidth: 2.2,
            strokeLinecap: 'round',
          }],
          ['circle', { cx: 12, cy: 12, r: 2.8, fill: C.deep, stroke: C.gold, strokeWidth: 1.2 }],
        ],
        // 档案：米白人像（头 + 肩都填实，肩是闭合半圆）
        profile: [
          ['circle', { cx: 12, cy: 8.8, r: 3.5, fill: C.parch, stroke: C.gold, strokeWidth: 1.1 }],
          ['path', { d: 'M5.6 19.6c.7-3.6 3.2-5.6 6.4-5.6s5.7 2 6.4 5.6z', fill: C.parch, fillOpacity: 0.88, stroke: C.gold, strokeWidth: 1.1 }],
        ],
      };
      // 六枚图标的视觉尺寸对齐：各自的墨迹外接框实测出来差得远
      // （塔罗 14.9 / 占卜 14.2 / 星座 14.2 / 计费 15.1 / 档案 14.3，齿轮 22 —— 大了一圈，看着像另一套图标）
      // 按「最大边统一到约 15」给每枚一个绕中心 (12,12) 的缩放，path 数据不动，只加容器变换
      const TAB_ICON_SCALE = { sound: 0.70 };
      const tabIconEls = (k) => {
        const parts = (TAB_ICONS[k] || []).map(
          (it, i) => h(it[0], Object.assign({ key: 'p' + i }, it[1])));
        const s = TAB_ICON_SCALE[k];
        if (!s) return parts;
        // 缩放后描边也会按比例变细，正好和另外五枚的线宽对齐
        return [h('g', { key: 'g', transform: 'translate(12 12) scale(' + s + ') translate(-12 -12)' }, parts)];
      };

      // ── 区块标题 / 空状态的小图标（2026-11-17 第十三版）─────────────
      // 与 tab 图标是两套：tab 是 24px 多色小画，这里的图标最小会缩到 15px（标题前缀）、
      // 最大 44px（空状态），所以只存几何、不存颜色，颜色交给 CSS 按尺寸调。
      // 开口图形（连线、横线、尾巴）标 className:'ln'，CSS 里 fill:none —— 不标会被自动闭合填成怪多边形。
      const CAP_ICONS = {
        cal: [ // 历史按天：日历
          ['rect', { x: 4.6, y: 6, width: 14.8, height: 13.4, rx: 2.4 }],
          ['path', { className: 'ln', d: 'M8.2 3.6v3M15.8 3.6v3M4.6 10.2h14.8' }],
          ['circle', { cx: 12, cy: 14.4, r: 1.5 }],
        ],
        bars: [ // 近 7 天：三根柱
          ['rect', { x: 5.2, y: 13.2, width: 3.1, height: 6.6, rx: 1.2 }],
          ['rect', { x: 10.4, y: 9.4, width: 3.1, height: 10.4, rx: 1.2 }],
          ['rect', { x: 15.6, y: 5.6, width: 3.1, height: 14.2, rx: 1.2 }],
        ],
        bars6: [ // 近 6 个月：六根细柱
          ['rect', { x: 4.4, y: 14.6, width: 1.9, height: 5.2, rx: 0.9 }],
          ['rect', { x: 7.6, y: 12.6, width: 1.9, height: 7.2, rx: 0.9 }],
          ['rect', { x: 10.8, y: 15.4, width: 1.9, height: 4.4, rx: 0.9 }],
          ['rect', { x: 14, y: 10.4, width: 1.9, height: 9.4, rx: 0.9 }],
          ['rect', { x: 17.2, y: 7.6, width: 1.9, height: 12.2, rx: 0.9 }],
        ],
        pie: [ // 模型占比：饼图
          ['circle', { cx: 12, cy: 12, r: 7.4 }],
          ['path', { className: 'ln', d: 'M12 12V4.6M12 12l6.4 3.7' }],
        ],
        chat: [ // 按会话：气泡方块 + 尾巴
          ['rect', { x: 4.4, y: 5, width: 15.2, height: 10.8, rx: 3 }],
          ['path', { className: 'ln', d: 'M9 15.8v3.6l3.8-3.6' }],
          ['circle', { cx: 9, cy: 10.4, r: 1.1 }],
          ['circle', { cx: 12.4, cy: 10.4, r: 1.1 }],
          ['circle', { cx: 15.8, cy: 10.4, r: 1.1 }],
        ],
        list: [ // 明细：三行
          ['circle', { cx: 6.4, cy: 7.4, r: 1.2 }],
          ['circle', { cx: 6.4, cy: 12, r: 1.2 }],
          ['circle', { cx: 6.4, cy: 16.6, r: 1.2 }],
          ['path', { className: 'ln', d: 'M9.4 7.4h9.2M9.4 12h9.2M9.4 16.6h6' }],
        ],
        heart: [ // 心情
          ['path', { d: 'M12 19.8S4.6 15.2 4.6 10.6A3.9 3.9 0 0 1 12 8.2a3.9 3.9 0 0 1 7.4 2.4c0 4.6-7.4 9.2-7.4 9.2z' }],
        ],
        seal: [ // 今日签：签筒 + 三根签
          ['rect', { x: 6.4, y: 9.6, width: 11.2, height: 9.8, rx: 2.2 }],
          ['path', { className: 'ln', d: 'M9.6 9.6V5.4M12 9.6V4M14.4 9.6V5.4' }],
        ],
        fork: [ // 两条路：一源两分
          ['path', { className: 'ln', d: 'M12 19.6V12.4M12 12.4c0-2 1.2-3.4 3.2-4.4M12 12.4c0-2-1.2-3.4-3.2-4.4' }],
          ['circle', { cx: 8.8, cy: 7.6, r: 1.6 }],
          ['circle', { cx: 15.2, cy: 7.6, r: 1.6 }],
          ['circle', { cx: 12, cy: 20.2, r: 1.4 }],
        ],
        seven: [ // 关系阵：七点
          ['circle', { cx: 12, cy: 6, r: 1.4 }],
          ['circle', { cx: 17.2, cy: 9, r: 1.4 }],
          ['circle', { cx: 17.2, cy: 15, r: 1.4 }],
          ['circle', { cx: 12, cy: 18, r: 1.4 }],
          ['circle', { cx: 6.8, cy: 15, r: 1.4 }],
          ['circle', { cx: 6.8, cy: 9, r: 1.4 }],
          ['circle', { cx: 12, cy: 12, r: 2 }],
        ],
        moon: [ // 今日天象
          ['path', { d: 'M15.6 4.4a8 8 0 1 0 0 15.2 6.4 6.4 0 1 1 0-15.2z' }],
        ],
        clock: [ // C8 每日一牌提醒：钟面 + 指针
          ['circle', { cx: 12, cy: 12, r: 7.6 }],
          ['path', { className: 'ln', d: 'M12 7.4V12l3.6 2.2' }],
        ],
        grid: [ // 四维：四格
          ['rect', { x: 4.8, y: 4.8, width: 6, height: 6, rx: 1.6 }],
          ['rect', { x: 13.2, y: 4.8, width: 6, height: 6, rx: 1.6 }],
          ['rect', { x: 4.8, y: 13.2, width: 6, height: 6, rx: 1.6 }],
          ['rect', { x: 13.2, y: 13.2, width: 6, height: 6, rx: 1.6 }],
        ],
        pen: [ // 编辑台词
          ['path', { d: 'M4.8 19.2l1-4.2L16.2 4.6a2.1 2.1 0 0 1 3 3L8.8 18.2z' }],
          ['path', { className: 'ln', d: 'M14.6 6.2l3 3' }],
        ],
        bubble: [ // 气泡
          ['ellipse', { cx: 12, cy: 10.2, rx: 7.2, ry: 5.6 }],
          ['path', { className: 'ln', d: 'M9.4 15.4l-1.2 3.8 4-2.6' }],
        ],
        eye: [ // 外观
          ['path', { d: 'M3.6 12S7 6.4 12 6.4 20.4 12 20.4 12 17 17.6 12 17.6 3.6 12 3.6 12z' }],
          ['circle', { cx: 12, cy: 12, r: 2.6 }],
        ],
        person: [ // 人物姿态：头 + 肩（开口肩线走 .ln，不闭合填色）
          ['circle', { cx: 12, cy: 8.6, r: 3.4 }],
          ['path', { className: 'ln', d: 'M5.6 19.8c.7-3.7 3.3-5.7 6.4-5.7s5.7 2 6.4 5.7' }],
        ],
        star: [ // 生日 / 本命牌
          ['path', { d: 'M12 3.4l1.9 5.5 5.5 1.9-5.5 1.9-1.9 5.5-1.9-5.5-5.5-1.9 5.5-1.9z' }],
        ],
        phase: [ // 月相带：圆 + 右半
          ['circle', { cx: 12, cy: 12, r: 7.4 }],
          ['path', { d: 'M12 4.6a7.4 7.4 0 0 1 0 14.8z' }],
        ],
        sound: [ // 音效（标题用，单色版；多色那枚在 TAB_ICONS 里）
          ['path', { className: 'ln', d: 'M10.6 16.9V6.7l6.6-1.5v10.2' }],
          ['ellipse', { cx: 8.4, cy: 17.3, rx: 2.4, ry: 1.9 }],
          ['ellipse', { cx: 15, cy: 15.5, rx: 2.4, ry: 1.9 }],
        ],
        lock: [ // 空状态：密码门
          ['rect', { x: 5.4, y: 10.6, width: 13.2, height: 9.4, rx: 2.4 }],
          ['path', { className: 'ln', d: 'M8.6 10.6V8a3.4 3.4 0 0 1 6.8 0v2.6' }],
          ['circle', { cx: 12, cy: 15.3, r: 1.5 }],
        ],
        log: [ // 空状态：还没有记录
          ['rect', { x: 5.4, y: 4.4, width: 13.2, height: 15.2, rx: 2.2 }],
          ['path', { className: 'ln', d: 'M8.6 9h6.8M8.6 12.6h6.8M8.6 16.2h4' }],
        ],
      };
      const capIconEls = (k) => (CAP_ICONS[k] || []).map(
        (it, i) => h(it[0], Object.assign({ key: 'c' + i }, it[1])));
      // 标题前缀图标
      const capIcon = (k) => h('svg', {
        key: 'ic', className: 'srs-cap-ic', viewBox: '0 0 24 24', 'aria-hidden': 'true',
      }, capIconEls(k));
      // 区块标题统一走这里：传了 key 才有图标，没传就保持纯文字（兼容动态标题）
      const cap = (label, key, style) => h('div', { className: 'srs-block-cap', style },
        key ? capIcon(key) : null, h('span', { key: 't' }, label));
      // 空状态图标（44px，同一份几何，颜色由 CSS 给）
      const emptyIcon = (k) => h('svg', {
        key: 'eic', className: 'srs-empty-ic', viewBox: '0 0 24 24', 'aria-hidden': 'true',
      }, capIconEls(k));
      // 笔触：两条同形路径叠——粗的一条 7px/55% 做水彩晕染，细的一条 2.6px 做笔芯，
      // 两端都走横向渐隐，所以看不出矩形边界。
      const brushLayer = (key, src, width, op) => h('path', {
        key,
        d: 'M4 8.4C22 6.4 41 6 59 6.7c13 .5 25 1 37 .5',
        stroke: src, strokeWidth: width, strokeLinecap: 'round', fill: 'none', opacity: op,
      });
      const tabWash = h('svg', {
        key: 'wash', className: 'srs-tab-wash', viewBox: '0 0 100 12',
        preserveAspectRatio: 'none', 'aria-hidden': 'true',
      },
        brushLayer('fade', 'url(#srs-brush-soft)', 7, 1),
        brushLayer('core', 'url(#srs-brush)', 2.6, 1));
      // defs：抖动滤镜 + 两条金色渐隐笔。0×0 绝对定位，不占 flex 空间。
      const tabDefs = h('svg', {
        key: 'defs', className: 'srs-ic-defs', width: 0, height: 0, 'aria-hidden': 'true',
        style: { position: 'absolute', width: 0, height: 0, overflow: 'hidden' },
      },
        h('defs', null,
          h('filter', { id: 'srs-wob', x: '-20%', y: '-20%', width: '140%', height: '140%' },
            h('feTurbulence', {
              type: 'fractalNoise', baseFrequency: '0.045', numOctaves: '2', seed: '7', result: 'n',
            }),
            h('feDisplacementMap', {
              in: 'SourceGraphic', in2: 'n', scale: '1.15', xChannelSelector: 'R', yChannelSelector: 'G',
            })),
          h('linearGradient', { id: 'srs-brush', x1: '0', y1: '0', x2: '1', y2: '0' },
            h('stop', { offset: '0', stopColor: '#C9A45C', stopOpacity: '0' }),
            h('stop', { offset: '.14', stopColor: '#C9A45C', stopOpacity: '.95' }),
            h('stop', { offset: '.5', stopColor: '#E3C588', stopOpacity: '1' }),
            h('stop', { offset: '.86', stopColor: '#C9A45C', stopOpacity: '.95' }),
            h('stop', { offset: '1', stopColor: '#C9A45C', stopOpacity: '0' })),
          h('linearGradient', { id: 'srs-brush-soft', x1: '0', y1: '0', x2: '1', y2: '0' },
            h('stop', { offset: '0', stopColor: '#C9A45C', stopOpacity: '0' }),
            h('stop', { offset: '.2', stopColor: '#C9A45C', stopOpacity: '.55' }),
            h('stop', { offset: '.8', stopColor: '#C9A45C', stopOpacity: '.55' }),
            h('stop', { offset: '1', stopColor: '#C9A45C', stopOpacity: '0' }))));

      const TAB_GROUPS = [TABS.slice(0, 3), TABS.slice(3)];
      const tabBtn = TAB_GROUPS.map((grp, gi) => h('div', { key: 'tg' + gi, className: 'srs-tab-group' },
        grp.map((t) => h('button', {
          key: 'tb' + t[0],
          className: 'srs-tab' + (tab === t[0] ? ' on' : ''),
          'data-act': 'tab-' + t[0],
          title: t[1],
        },
          h('svg', { key: 'ic', className: 'srs-tab-ic', viewBox: '0 0 24 24', 'aria-hidden': 'true' },
            tabIconEls(t[0])),
          h('span', { key: 'lab', className: 'srs-tab-lab' }, t[1]),
          tabWash))));

      // ── 塔罗页 ──────────────────────────────────────────────────
      const SPREAD_LABEL = ['过去', '现在', '未来'];
      // 凯尔特十字十位（T11）：按传统位序，第 9 位是「期待与恐惧」
      const CELTIC_LABEL = ['现状', '阻碍', '根基', '过去', '目标', '未来', '自己', '环境', '期待与恐惧', '结果'];
      // ── 占卜：抽 N 张（占卜页用，与塔罗页互不影响）─────────────
      const drawN = (n) => {
        const cards = (DECK && DECK.cards) || [];
        const seed = newSeed();
        const rnd = prng(seed);
        const order = cards.map((c, i) => i);
        for (let i = order.length - 1; i > 0; i -= 1) {
          const j = Math.floor(rnd() * (i + 1));
          const tmp = order[i];
          order[i] = order[j];
          order[j] = tmp;
        }
        const out = [];
        for (let k = 0; k < n; k += 1) {
          const card = cards[order[k]];
          const reversed = cfg.reversed ? rnd() < 0.5 : false;
          out.push({ card, reversed, meaning: meaningOf(card, DECK, TAROT, reversed) });
        }
        return { seed, picks: out };
      };

      const todayKey = () => {
        const d = new Date();
        return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
      };

      const doDivine = async (mode) => {
        if (divineBusy) return;
        if (mode === 'daily' && daily && daily.d === todayKey()) return;   // 每日一签当天锁定
        setDivineBusy(true);
        setPose('shuffle');
        playSfx('shuffle');
        await wait(620);
        setPose('draw');
        playSfx('draw');
        const n = mode === 'duo' ? 2 : (mode === 'either' ? 5 : (mode === 'relation' ? 7 : 1));
        const { picks } = drawN(n);
        setPose('flip');
        playSfx('flip');
        await wait(420);
        setDivineSeq((s) => s + 1);
        setDivineCards(picks);
        if (mode === 'daily') {
          const p0 = picks[0];
          const colors = (HORO.lucky || {}).colors || [];
          const rec = {
            d: todayKey(),
            id: p0.card.id,
            name: p0.card.name_zh,
            reversed: p0.reversed,
            line: (p0.meaning.lines || [])[0] || '',
            color: colors.length ? colors[strHash(p0.card.id) % colors.length] : null,
          };
          setDaily(rec);
          try { window.localStorage.setItem('srs.daily.v1', JSON.stringify(rec)); } catch (error) { /* 忽略 */ }
        }
        setPose('smile');
        playSfx('bell');
        setDivineBusy(false);
      };

      // 二选一：A路 / 关键 / A结局 / B路 / B结局 → 简易评分
      const eitherScore = (picks) => {
        if (picks.length < 5) return null;
        const s = (x) => (x.reversed ? 1 : 2);
        const a = s(picks[0]) + s(picks[2]) + s(picks[1]);
        const b = s(picks[3]) + s(picks[4]) + s(picks[1]);
        return { a, b, win: a === b ? 'both' : (a > b ? 'A' : 'B') };
      };

      const spreadSeg = h('div', { className: 'srs-menu-row' },
        h('span', { className: 'srs-row-cap' }, capIcon('grid'), h('span', null, '牌阵')),
        h('div', { className: 'srs-seg' },
          h('button', { 'data-act': 'spread-daily', className: cfg.spread === 'daily' ? 'on' : '' }, '每日'),
          h('button', { 'data-act': 'spread-one', className: (cfg.spread !== 'three' && cfg.spread !== 'daily' && cfg.spread !== 'celtic') ? 'on' : '' }, '单张'),
          h('button', { 'data-act': 'spread-three', className: cfg.spread === 'three' ? 'on' : '' }, '三张'),
          h('button', { 'data-act': 'spread-celtic', className: cfg.spread === 'celtic' ? 'on' : '', title: '凯尔特十字 · 十张' }, '十张')));

      const threeView = results.length === 3 ? h('div', null,
        h('div', { className: 'srs-spread' },
          results.map((r, i) => h('div', { key: 'sp' + i, className: 'srs-sp-cell' },
            h('img', {
              className: 'srs-sp-img',
              src: '/srs/cards/thumb/' + r.card.id + '.webp?v=' + VERSION,
              alt: '',
              draggable: false,
              style: r.reversed ? { transform: 'rotate(180deg)' } : null,
            }),
            h('div', { className: 'srs-sp-lab' }, SPREAD_LABEL[i]),
            h('div', { className: 'srs-sp-name' }, r.card.name_zh + (r.reversed ? '·逆' : '·正'))
          ))
        ),
        h('div', { className: 'srs-lines', style: { marginTop: '10px', paddingBottom: '4px' } },
          results.map((r, i) => h('p', { key: 'st' + i },
            h('b', { style: { color: '#E7D9BC' } }, SPREAD_LABEL[i] + '：'),
            readAt(SPREAD_LABEL[i], 'three', r))),
          h('p', null, h('b', { style: { color: '#E7D9BC' } }, '合起来看：'), combineSpread(results, 'three'))
        )
      ) : null;

      // ── 凯尔特十字（T11 · 十张）──────────────────────────────────
      const celticView = results.length === 10 ? h('div', null,
        h('div', { className: 'srs-note srs-note-s' },
          '凯尔特十字：1 现状 · 2 阻碍 · 3 根基 · 4 过去 · 5 目标 · 6 未来 · 7 自己 · 8 环境 · 9 期待与恐惧 · 10 结果'),
        h('div', { className: 'srs-spread srs-spread-wrap srs-celtic' },
          results.map((r, i) => h('div', { key: 'cl' + i, className: 'srs-sp-cell' },
            h('img', {
              className: 'srs-sp-img',
              src: '/srs/cards/thumb/' + r.card.id + '.webp?v=' + VERSION,
              alt: '',
              draggable: false,
              style: r.reversed ? { transform: 'rotate(180deg)' } : null,
            }),
            h('div', { className: 'srs-sp-lab' }, String(i + 1)),
            h('div', { className: 'srs-sp-name' }, r.card.name_zh + (r.reversed ? '·逆' : '·正'))))),
        h('div', { className: 'srs-lines', style: { marginTop: '10px', paddingBottom: '4px' } },
          results.map((r, i) => h('p', { key: 'cx' + i },
            h('b', { style: { color: '#E7D9BC' } }, CELTIC_LABEL[i] + '：'),
            readAt(CELTIC_LABEL[i], 'celtic', r))),
          h('p', null, h('b', { style: { color: '#E7D9BC' } }, '合起来看：'), combineSpread(results, 'celtic')))
      ) : null;

      // ── 历史子页 ───────────────────────────────────────────────
      const lockedToday = !!(dailyCard && dailyCard.d === localDayKey());      const histAll = (() => {
        try { return JSON.parse(window.localStorage.getItem(HIST_KEY) || '[]'); } catch (error) { return []; }
      })();
      void histVer;   // 依赖标记：删/清空后重读
      const histByDay = (() => {
        const map = new Map();
        histAll.forEach((h) => {
          const d = new Date(h.t || Date.now());
          const k = d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
          if (!map.has(k)) map.set(k, []);
          map.get(k).push(h);
        });
        return Array.from(map.entries()).slice(0, 12);
      })();

      const histBody = h('div', null,
        h('div', { className: 'srs-menu-row' },
          h('span', null, '共 ' + histAll.length + ' 条'),
          h('div', { className: 'srs-seg' },
            h('button', { 'data-act': 'hist-clear' }, '清空'),
            h('button', { 'data-act': 'hist-back' }, '返回'))),
        histAll.length === 0
          ? h('div', { className: 'srs-empty', style: { marginTop: '14px' } }, emptyIcon('log'), '还没有记录。抽一张就有了。')
          : histByDay.map(([day, items]) => h('div', { key: 'hd' + day, className: 'srs-hist-day' },
            cap(day + ' · ' + items.length + ' 次', 'cal', { marginTop: '10px' }),
            items.map((it, i) => h('div', { key: 'hi' + (it.t || '') + '-' + i, className: 'srs-hist-row' },
              renameKey !== null && String(renameKey) === String(it.t)
                ? h('span', { className: 'srs-hist-rename' },
                  h('input', {
                    key: 'rn' + (it.t || ''),
                    ref: nameRef,
                    className: 'srs-inp-s',
                    defaultValue: it.label || '',
                    placeholder: '给这一局起个名字',
                    maxLength: 24,
                  }),
                  h('button', { className: 'srs-per-del', 'data-act': 'hist-rename-save', title: '保存名字' }, '存'),
                  h('button', { className: 'srs-per-del', 'data-act': 'hist-rename-cancel', title: '不改了' }, '撤'))
                : h('span', { className: 'srs-hist-name' },
                  (it.label ? it.label + ' · ' : '') + (it.name || '?') + (it.reversed ? '·逆' : '·正')),
              h('span', { className: 'srs-hist-num' }, it.numeral || ''),
              h('button', {
                className: 'srs-per-del',
                'data-act': 'hist-replay-' + (it.t || ''),
                title: '同一副牌再摆一次',
                style: { color: '#E7D9BC', borderColor: 'rgba(201,164,92,.42)' },
              }, '重放'),
              h('button', {
                className: 'srs-per-del',
                'data-act': 'hist-rename-' + (it.t || ''),
                title: '给这一局起个名字',
              }, '命名'),
              h('button', { className: 'srs-per-del', 'data-act': 'hist-del-' + (it.t || '') }, '删')))))
      );

      // ── W9 月度回顾 / W10 反复出现的牌：只数她抽过的牌，不做推断 ──────
      const review = reviewOf(histAll, new Date());
      const reviewBody = h('div', null,
        h('div', { className: 'srs-menu-row' },
          h('span', null, '这个月 ' + review.monthTotal + ' 次 · 一共 ' + review.total + ' 次'),
          h('div', { className: 'srs-seg' }, h('button', { 'data-act': 'review-back' }, '返回'))),
        review.monthTotal === 0
          ? h('div', { className: 'srs-empty', style: { marginTop: '14px' } }, emptyIcon('log'), '这个月还没抽过。抽一张就有了。')
          : h('div', null,
            cap('这个月最常出现', 'star', { marginTop: '10px' }),
            h('div', { className: 'srs-review' }, review.monthTop.map((x) => h('div', { key: 'rt' + x.id, className: 'srs-review-row' },
              h('span', { className: 'k' }, x.name + (x.rev ? '（逆 ' + x.rev + '）' : '')),
              h('span', { className: 'v' }, x.n + ' 次')))),
            h('div', { className: 'srs-note' },
              '牌阵：' + Object.keys(review.spreads).map((k) => (SPREAD_NAME[k] || k) + ' ' + review.spreads[k]).join(' · '))),
        cap('反复出现的牌（近 90 天 ≥3 次）', 'seven', { marginTop: '12px' }),
        review.recent.length
          ? h('div', null, review.recent.map((x) => h('div', { key: 'rr' + x.id, className: 'srs-review-line' },
            '「' + x.name + '」' + x.n + ' 次' + (x.rev ? '，其中逆位 ' + x.rev + ' 次' : '')
            + ' —— 同一张反复来，通常是在说同一件事。')))
          : h('div', { className: 'srs-note' }, '还没有到 3 次的牌。多抽几次，重的东西会自己浮上来。'),
        h('div', { className: 'srs-note', style: { marginTop: '10px' } },
          '这里只是把你抽过的牌数一遍，不做推断，也不下结论。')
      );

      // 三张牌阵一张一张挑：点过的格子只翻成牌背并锁住，挑满三张才允许一键翻开
      const pickWant = (pickRef.current && pickRef.current.want) || 1;
      const pickReady = phase === 'pick' && pickWant > 1 && picked.length >= pickWant;
      // 张数要和列数整除：三张模式 5 列 × 2 行 = 10 张（9 张会剩个孤零零的缺口，很难看）；单张/每日 3×3 = 9 张
      const pickCount = pickWant > 1 ? 10 : 9;
      const pickGrid = h('div', { className: 'srs-pickgrid' + (pickWant > 1 ? ' is-three' : '') },
        Array.from({ length: pickCount }).map((_, i) => {
          const ord = picked.findIndex((p) => p.idx === i);
          const on = ord >= 0;
          const dead = on || pickReady;
          return h('button', {
            key: 'pk' + i,
            className: 'srs-pickcard' + (on ? ' is-picked' : '') + (pickReady && !on ? ' is-locked' : ''),
            'data-pick': String(i),
            'data-ord': on ? String(ord + 1) : '',
            'data-act': dead ? 'noop' : 'pick-' + i,
            title: on ? '已挑第 ' + (ord + 1) + ' 张' : (pickReady ? '已经挑满三张' : '点这张'),
            style: { backgroundImage: 'url("/srs/cards/back.webp?v=' + VERSION + '")' },
          });
        }));

      const pickWord = pickWant > 3 ? '十张' : '三张';
      const pickHint = pickWant <= 1
        ? '牌摊开了，挑一张。'
        : (pickReady
          ? pickWord + '都挑好了，翻开看看。'
          : (picked.length === 0 ? '牌摊开了，先挑第一张。'
            : (picked.length === 1 ? '收好了，再挑第二张。'
              : (picked.length + 1 >= pickWant ? '最后一张。' : '接着挑。'))));

      const waitZone = picked.length
        ? h('div', { className: 'srs-wait' },
          h('div', { className: 'srs-wait-cap' },
            pickReady ? '已挑 ' + picked.length + ' / ' + pickWant + ' · 待翻开' : '已挑 ' + picked.length + ' / ' + pickWant),
          h('div', { className: 'srs-wait-row' },
            picked.map((p, i) => h('div', { key: 'wp' + i, className: 'srs-wait-cell' },
              h('img', {
                className: 'srs-wait-img',
                // 挑的时候只看背面：牌面要等「翻开」那一下才出
                src: '/srs/cards/back.webp?v=' + VERSION,
                alt: '',
                draggable: false,
              }),
              h('div', { className: 'srs-wait-lab' }, (pickWant > 3 ? CELTIC_LABEL[i] : SPREAD_LABEL[i]) || '')
            ))))
        : null;

      // ── 牌库子页（T6）：78 张全可查可翻，正逆各一条 ──────────────
      const DECK_GROUPS = [['major', '大阿卡纳', 'star'], ['wands', '权杖', 'grid'], ['cups', '圣杯', 'grid'], ['swords', '宝剑', 'grid'], ['pentacles', '星币', 'grid']];
      const deckAll = (DECK && DECK.cards) || [];
      const deckSel = deckPick ? (deckAll.find((c) => c.id === deckPick) || null) : null;
      const deckSelMean = deckSel ? meaningOf(deckSel, DECK, TAROT, deckSide === 'rev') : null;

      const deckBody = h('div', null,
        h('div', { className: 'srs-menu-row' },
          h('span', null, deckSel ? '一张牌' : ('共 ' + deckAll.length + ' 张 · 点一张看牌义')),
          h('div', { className: 'srs-seg' },
            deckSel ? h('button', { 'data-act': 'deck-clear' }, '全部牌') : null,
            h('button', { 'data-act': 'deck-back' }, '返回'))),
        deckSel
          ? h('div', null,
            h('div', { className: 'srs-spread', style: { justifyContent: 'flex-start' } },
              h('div', { className: 'srs-sp-cell' },
                h('img', {
                  className: 'srs-sp-img',
                  src: '/srs/cards/big/' + deckSel.id + '.webp?v=' + VERSION,
                  alt: '',
                  draggable: false,
                  style: deckSide === 'rev' ? { transform: 'rotate(180deg)' } : null,
                }),
                h('div', { className: 'srs-sp-lab' }, deckSel.numeral || ''),
                h('div', { className: 'srs-sp-name' }, deckSel.name_zh))),
            h('div', { className: 'srs-menu-row', style: { marginTop: '8px' } },
              h('span', { className: 'srs-row-cap' }, capIcon('list'), h('span', null, '牌义')),
              h('div', { className: 'srs-seg' },
                h('button', { 'data-act': 'deck-up', className: deckSide !== 'rev' ? 'on' : '' }, '正位'),
                h('button', { 'data-act': 'deck-rev', className: deckSide === 'rev' ? 'on' : '' }, '逆位'))),
            deckSelMean && deckSelMean.keywords && deckSelMean.keywords.length
              ? h('div', { className: 'srs-kw' }, deckSelMean.keywords.join(' · ')) : null,
            h('div', { className: 'srs-lines', style: { paddingBottom: '6px' } },
              ((deckSelMean && deckSelMean.lines) || []).map((line, i) => h('p', { key: 'dl' + i }, line))),
            h('div', { className: 'srs-note' }, '这是牌义本身。落到你这件事上怎么讲，抽牌时我会说。'))
          : h('div', null,
            // 78 张一次铺开会把缩略图请求堆到一起（宿主静态服务是单线程的，会拒连），
            // 所以按花色分批：一次最多 22 张
            h('div', { className: 'srs-menu-row' },
              h('span', { className: 'srs-row-cap' }, capIcon('grid'), h('span', null, '花色')),
              h('div', { className: 'srs-seg' },
                DECK_GROUPS.map(([gid, gname]) => h('button', {
                  key: 'dgt' + gid,
                  'data-act': 'deck-group-' + gid,
                  className: deckGroup === gid ? 'on' : '',
                }, gid === 'major' ? '大牌' : gname)))),
            (() => {
              const g = DECK_GROUPS.find((x) => x[0] === deckGroup) || DECK_GROUPS[0];
              const list = deckAll.filter((c) => (g[0] === 'major' ? c.kind === 'major' : c.suit === g[0]));
              return h('div', null,
                cap(g[1] + ' · ' + list.length + ' 张', g[2], { marginTop: '8px' }),
                h('div', { className: 'srs-spread srs-spread-wrap' },
                  list.map((c) => h('button', {
                    key: 'dc' + c.id,
                    className: 'srs-sp-cell srs-deck-cell',
                    'data-act': 'deck-open-' + c.id,
                    title: c.name_zh,
                  },
                    h('img', {
                      className: 'srs-sp-img',
                      src: '/srs/cards/thumb/' + c.id + '.webp?v=' + VERSION,
                      alt: '',
                      draggable: false,
                      loading: 'lazy',
                      decoding: 'async',
                    }),
                    h('div', { className: 'srs-sp-lab' }, c.numeral || ''),
                    h('div', { className: 'srs-sp-name' }, c.name_zh)))));
            })())
      );

      // ── T14 牌义详略：简 = 前两段，详 = 全文（末尾补花色 / 元素 / 编号）──
      const detailFull = (cfg.detail || 'brief') === 'full';
      const resultLines = result ? detailLines(result.meaning) : [];
      const resultMeta = result ? cardMeta(result.card) : '';
      // 详版：同一张牌把另一向也写出来（正逆各三句），再加上牌面资料
      const resultOther = (result && detailFull && result.card)
        ? meaningOf(result.card, DECK, TAROT, !result.reversed)
        : null;
      const detailRow = h('div', { className: 'srs-menu-row', style: { marginTop: '6px' } },
        h('span', { className: 'srs-row-cap' }, capIcon('list'), h('span', null, '牌义')),
        h('div', { className: 'srs-seg' },
          h('button', { 'data-act': 'detail-brief', className: detailFull ? '' : 'on' }, '简'),
          h('button', { 'data-act': 'detail-full', className: detailFull ? 'on' : '' }, '详')));

      const tarotBody = h('div', null,
        deckOpen ? deckBody : (histOpen ? histBody : (reviewOpen ? reviewBody : h('div', null,
        spreadSeg,
        phase === 'pick' ? h('div', null,
          h('div', { className: 'srs-note', style: { margin: '10px 0 6px' } }, pickHint),
          pickGrid,
          waitZone
        ) : null,
        phase === 'pick'
          ? null
          : cfg.spread === 'celtic' && results.length === 10
          ? celticView
          : cfg.spread === 'three' && results.length === 3
          ? threeView
          : (phase === 'idle'
          ? h('div', { className: 'srs-empty-art' },
            // 空态不再贴一张成品牌叠图：直接用 back.webp 现场叠三张，跟抽牌后的牌背永远同一张
            h('div', { className: 'srs-empty-deck' },
              [0, 1, 2].map((n) => h('i', { key: 'dk' + n }))))
          : h('div', { className: 'srs-slot', style: slotStyle },
            phase === 'shuffling'
              ? h('div', { className: 'srs-shuf' }, [1, 2, 3, 4, 5, 6].map((n) => h('i', { key: 'sf' + n })))
              : (phase === 'shown' && cardImg
                ? h('img', {
                  src: cardImg,
                  alt: '',
                  draggable: false,
                  style: result.reversed ? Object.assign({}, slotImgStyle, { transform: 'rotate(180deg)' }) : slotImgStyle,
                })
                : h('img', { className: 'back', src: '/srs/cards/back.webp?v=' + VERSION, alt: '', draggable: false, style: slotImgStyle })),
            phase === 'shuffling' ? h('div', { className: 'srs-shuf-hint' }, '洗牌中…') : null)),
        phase === 'pick'
          // 挑牌阶段不显示引导文案：九宫格 + 等待区已经占满内容区，多这段就得滚动才看得见等待区
          ? null
          : (phase === 'shown' && result
            ? h('div', null,
              h('div', { className: 'srs-name' },
                h('b', null, result.card.name_zh),
                h('span', { className: 'srs-flag' }, result.reversed ? '逆位' : '正位'),
                h('span', { className: 'srs-flag' }, result.card.numeral)),
              result.meaning.keywords && result.meaning.keywords.length
                ? h('div', { className: 'srs-kw' }, result.meaning.keywords.join(' · ')) : null,
              detailRow,
              h('div', { className: 'srs-lines' },
                resultLines.map((line, i) => h('p', { key: 'l' + i }, line))),
              detailFull && resultOther
                ? h('div', { className: 'srs-lines srs-lines-alt' },
                  h('p', { className: 'srs-other-cap' }, result.reversed ? '若它是正位：' : '若它是逆位：'),
                  (resultOther.lines || []).map((line, i) => h('p', { key: 'o' + i }, line)))
                : null,
              detailFull ? h('div', { className: 'srs-note' }, resultMeta) : null)
            : h('div', { className: 'srs-empty', style: { marginTop: '12px' } },
              phase === 'error'
                ? '牌库没读到。检查插件是否装好，或者重启 DSH 再试。'
                : '心里想一件事，想着它就好，不用说得清楚。抽一张，看它说什么。')),
        h('div', { className: 'srs-menu-row', style: { marginTop: '10px' } },
          h('span', { className: 'srs-row-cap' }, capIcon('log'), h('span', null, '历史')),
          h('div', { className: 'srs-seg srs-seg-lg' },
            h('button', { 'data-act': 'hist-open' }, histCount + ' 条'),
            h('button', { 'data-act': 'review-open' }, '回顾'),
            h('button', { 'data-act': 'deck-open' }, '牌库'),
            h('button', { 'data-act': 'export-card', disabled: phase !== 'shown' || exporting }, exporting ? '画图中…' : '存图'),
            h('button', { 'data-act': 'export-card-34', disabled: phase !== 'shown' || exporting, title: '3:4 小红书竖图' }, '小红书')))
        )))
      );

      // ── 计费页（口径仿青云剑仙：余额只作对照，钱按真实 usage 逐轮记账）──
      const billCfg = cfg.bill || {};   // 计费提示：告急线 / 今日预算（配置页与计费页共用）
      const bq = billing && billing.ok ? billing : null;
      const uq = usage && usage.ok ? usage : null;
      const billErr = billing && !billing.ok ? (billing.error || '宿主没应答') : null;
      const usageErr = usage && usage.ok === false;
      const usageEmptyHint = usageErr ? '账本接口没应答（宿主重启后生效）' : '读取中…';
      const num2 = (n) => (typeof n === 'number' ? n.toFixed(2) : '—');
      const kTok = (n) => {
        const v = Number(n) || 0;
        if (v >= 1e6) return (v / 1e6).toFixed(v >= 1e7 ? 0 : 1) + 'M';
        if (v >= 1e3) return (v / 1e3).toFixed(v >= 1e4 ? 0 : 1) + 'k';
        return String(v);
      };
      const peakChip = bq && bq.peak
        ? h('span', { className: 'srs-chip ' + (bq.peak.peak ? 'is-peak' : 'is-valley') },
          bq.peak.label + ' · ' + bq.peak.window
          + (bq.peak.nextInMs > 0 ? ' · ' + Math.max(1, Math.round(bq.peak.nextInMs / 60000)) + ' 分钟后转' + bq.peak.next : ''))
        : null;
      const hist = (bq && Array.isArray(bq.history)) ? bq.history.slice(-7) : [];
      const histMax = hist.reduce((m, x) => Math.max(m, Number(x.used) || 0), 0) || 1;
      const modelRows = (uq && Array.isArray(uq.byModel)) ? uq.byModel : [];
      const modelMax = modelRows.reduce((m, x) => Math.max(m, Number(x.amount) || 0), 0) || 1;
      const monthRows = (uq && Array.isArray(uq.months)) ? uq.months : [];
      const monthMax = monthRows.reduce((m, x) => Math.max(m, Number(x.used) || 0), 0) || 1;
      const sessionRows = (uq && Array.isArray(uq.bySession)) ? uq.bySession : [];
      const sessionMax = sessionRows.reduce((m, x) => Math.max(m, Number(x.amount) || 0), 0) || 1;
      const items = (uq && Array.isArray(uq.items)) ? uq.items : [];
      // 明细搜索（仿青云剑仙的账本搜索）：模型 / 日期 / 金额都能搜，纯前端过滤
      const billQn = String(billQ || '').trim().toLowerCase();
      const itemsShown = billQn
        ? items.filter((it) => String(it.model || '').toLowerCase().indexOf(billQn) >= 0
          || String(it.date || '').indexOf(billQn) >= 0
          || (isFinite(Number(it.amount)) && Number(it.amount).toFixed(2).indexOf(billQn) >= 0))
        : items;
      // 告急线 / 今日预算：与配置页同一口径（0 = 关）
      const warnLow = Number(billCfg.warnLow) || 0;
      const budget = Number(billCfg.budget) || 0;
      const lowNow = warnLow > 0 && bq && typeof bq.balance === 'number' && bq.balance < warnLow;
      const todayUsedNow = Number(bq && bq.todayUsed) || 0;
      const budgetPct = (budget > 0) ? Math.min(100, Math.round((todayUsedNow / budget) * 100)) : 0;
      const billBody = h('div', null,
        // ① 余额（大数字）+ 刷新
        h('div', { className: 'srs-bill-hero' },
          h('div', { className: 'srs-bill-left' },
            h('div', { className: 'srs-bill-cap' }, '余额'),
            bq && typeof bq.balance === 'number'
              ? h('div', { className: 'srs-bill-num' }, h('small', null, '¥'), bq.balance.toFixed(2))
              : h('div', { className: 'srs-bill-num is-dim' }, billErr ? '—' : '…'),
            bq
              ? h('div', { className: 'srs-bill-sub' },
                '充值 ' + num2(bq.recharge) + ' · 赠送 ' + num2(bq.bonus)
                + ' · ' + (bq.source === 'account' ? '宿主账号' : (bq.source === 'api-key' ? 'API Key' : '—')))
              : null,
            billErr
              ? h('div', { className: 'srs-menu-warn', style: { fontSize: '11px', lineHeight: '1.55', marginTop: '4px' } }, billErr)
              : null),
          h('button', {
            className: 'srs-mini',
            'data-act': 'refresh-billing',
            disabled: billBusy,
          }, billBusy ? '刷新中' : '刷新')),
        // 余额低于告急线：照片顶摆一行，不必等气泡
        lowNow
          ? h('div', { className: 'srs-menu-warn', style: { marginTop: '6px', lineHeight: '1.55' } },
            '低于告急线 ¥' + warnLow + '：还剩 ¥' + bq.balance.toFixed(2) + '，省着点用。')
          : null,
        // ② 今日 / 轮次 / 本月
        h('div', { className: 'srs-kpis' },
          h('div', { className: 'srs-kpi' },
            h('div', { className: 'k' }, '今日已用'),
            h('div', { className: 'v' }, bq ? money(bq.todayUsed) : '—')),
          h('div', { className: 'srs-kpi' },
            h('div', { className: 'k' }, '今日轮次'),
            h('div', { className: 'v' }, bq ? String(bq.todayTurns || 0) : '—')),
          h('div', { className: 'srs-kpi' },
            h('div', { className: 'k' }, '本月已用'),
            h('div', { className: 'v' }, bq ? money(bq.monthUsed) : '—'))),
        bq && Number(bq.todayUnpriced) > 0
          ? h('div', { className: 'srs-bill-note' }, '有 ' + bq.todayUnpriced + ' 轮模型不在价目表里：只记 token，不记钱')
          : null,
        // 平均每轮 + 今日预算（预算 0 = 关；两项都是仿青云剑仙的数据页）
        bq && Number(bq.todayTurns) > 0
          ? h('div', { className: 'srs-bill-note' },
            '平均 ' + money(todayUsedNow / Number(bq.todayTurns)) + ' / 轮 · ' + bq.todayTurns + ' 轮')
          : null,
        budget > 0
          ? h('div', { className: 'srs-bill-note' + (budgetPct >= 100 ? ' srs-menu-warn' : '') },
            '今日预算 ¥' + budget + ' · 已用 ' + budgetPct + '%（¥' + todayUsedNow.toFixed(2) + '）')
          : null,
        // 起点：官方后台是 00:00 起，本插件是启动那一刻起 —— 不写清就会以为账少算了
        bq && bq.todaySince
          ? h('div', { className: 'srs-bill-note' },
            '本账自 ' + hhmm(bq.todaySince) + ' 起 · 官方后台从 00:00 起，两边的差额是插件启动前那段消费')
          : null,
        // 进行中那一轮：按轮结算，走完才入账 —— 但得能看见它在涨，否则像记账坏了
        bq && bq.live && Number(bq.live.turns) > 0
          ? h('div', { className: 'srs-bill-note' },
            '正在跑的这一轮：+' + moneyTiny(bq.live.cost) + ' · ' + bq.live.turns + ' 轮 · '
            + (Number(bq.live.tokens) || 0).toLocaleString('en-US') + ' tok（走完这一轮才入账）')
          : null,
        // 挂起等待：这一轮是不是正卡在等你点头
        bq && bq.wait
          ? h('div', { className: 'srs-bill-note' },
            (bq.wait.kind === 'approval' ? '在等你授权' : '在等你答话')
            + (bq.wait.sessionName ? '：' + bq.wait.sessionName : '') + ' —— 这一轮还没走完，金额会继续涨')
          : null,
        // ③ 峰谷价 + 最近一笔
        h('div', { className: 'srs-bill-peak' }, peakChip,
          bq && bq.lastTurn
            ? h('span', { className: 'srs-bill-sub' },
              '最近一笔 ' + (bq.lastTurn.amount === null ? '未计价' : money(bq.lastTurn.amount))
              + ' · ' + (bq.lastTurn.model || '—')
              + ' · ' + kTok(bq.lastTurn.tokens) + ' tok')
            : null),
        // ④ 近 7 天
        cap('近 7 天', 'bars', { marginTop: '12px' }),
        hist.length
          ? h('div', { className: 'srs-bars' },
            hist.map((d, i) => {
              const used = Number(d.used) || 0;
              const last = i === hist.length - 1;
              return h('div', {
                key: 'bd' + d.date,
                className: 'srs-bar' + (last ? ' today' : ''),
                title: d.date + ' · ' + money(used) + ' · ' + (d.turns || 0) + ' 轮',
              },
                h('i', { style: { height: Math.max(2, Math.round((used / histMax) * 34)) + 'px' } }),
                h('span', null, last ? '今' : String(d.date).slice(8)));
            }))
          : h('div', { className: 'srs-bill-note' }, '还没有账本记录。'),

        // ④b 近 6 个月（跨月趋势：daily 逐日汇总 + 今天）
        h('div', { className: 'srs-bill-caprow', style: { marginTop: '12px' } },
          cap('近 6 个月', 'bars6'),
          monthRows.length
            ? h('span', { className: 'srs-bill-sub' }, '本月 ' + money(monthRows[monthRows.length - 1].used))
            : null),
        monthRows.length
          ? h('div', { className: 'srs-bars', style: { height: '44px' } },
            monthRows.map((m, i) => {
              const used = Number(m.used) || 0;
              const last = i === monthRows.length - 1;
              return h('div', {
                key: 'mb' + m.month,
                className: 'srs-bar' + (last ? ' today' : ''),
                title: m.month + ' · ' + money(used) + ' · ' + (m.turns || 0) + ' 轮',
              },
                h('i', { style: { height: Math.max(2, Math.round((used / monthMax) * 30)) + 'px' } }),
                h('span', null, (last ? '本' : Number(String(m.month).slice(5)) + '月')));
            }))
          : h('div', { className: 'srs-bill-note' }, uq ? '还没有跨月记录。' : usageEmptyHint),

        // ⑤ 模型占比（跟随下面的范围）
        h('div', { className: 'srs-bill-caprow' },
          cap('模型占比', 'pie'),
          h('div', { className: 'srs-seg' },
            [['today', '今日'], ['7d', '7 天'], ['all', '全部']].map(([id, label]) => h('button', {
              key: 'ur' + id,
              className: usageRange === id ? 'on' : '',
              'data-act': 'usage-range-' + id,
            }, label)))),
        modelRows.length
          ? h('div', null, modelRows.slice(0, 4).map((m) => h('div', { key: 'mm' + m.model, className: 'srs-mrow' },
            h('span', { className: 'n', title: m.model }, m.model),
            h('span', { className: 'bar' }, h('i', { style: { width: Math.max(3, Math.round(((Number(m.amount) || 0) / modelMax) * 100)) + '%' } })),
            h('span', { className: 'a' }, money(Number(m.amount) || 0)))))
          : h('div', { className: 'srs-bill-note' }, uq ? '这个窗口没有记录。' : usageEmptyHint),

        // ⑤b 按会话（只算还留在账本里的明细；结转进日汇总的那部分没有会话信息）
        h('div', { className: 'srs-bill-caprow', style: { marginTop: '12px' } },
          cap('按会话', 'chat'),
          sessionRows.length
            ? h('span', { className: 'srs-bill-sub' }, sessionRows.length + ' 个会话')
            : null),
        sessionRows.length
          ? h('div', null, sessionRows.slice(0, 5).map((s) => h('div', { key: 'ss' + (s.sid || s.name), className: 'srs-mrow' },
            h('span', { className: 'n', title: (s.name || '') + (s.sid ? ' · ' + s.sid : '') }, s.name || '会话'),
            h('span', { className: 'bar' }, h('i', { style: { width: Math.max(3, Math.round(((Number(s.amount) || 0) / sessionMax) * 100)) + '%' } })),
            h('span', { className: 'a' }, money(Number(s.amount) || 0)))))
          : h('div', { className: 'srs-bill-note' }, uq ? '这个窗口没有可归属到会话的记录。' : usageEmptyHint),

        // ⑥ 逐条明细（仿剑仙：上面一条搜索框，模型 / 日期 / 金额都能搜）
        h('div', { className: 'srs-bill-caprow', style: { marginTop: '12px' } },
          cap('明细', 'list'),
          uq ? h('span', { className: 'srs-bill-sub' },
            (billQn ? '命中 ' + itemsShown.length + ' / ' : '共 ') + (uq.itemCount || 0) + ' 条 · '
            + kTok(uq.totals && uq.totals.tokens) + ' tok') : null),
        h('div', { className: 'srs-search' },
          h('input', {
            type: 'search',
            value: billQ,
            placeholder: '搜模型 / 日期 / 金额',
            onChange: (e) => setBillQ(e.target.value),
          })),
        itemsShown.length
          ? h('div', { className: 'srs-items' }, itemsShown.map((it, i) => h('div', { key: 'it' + i, className: 'srs-item' },
            h('span', { className: 't' }, it.date === (bq && bq.day) ? it.time : String(it.date).slice(5) + ' ' + it.time),
            h('span', { className: 'm', title: it.model + (it.provider ? ' @' + it.provider : '') },
              it.model || '未知模型'),
            h('span', { className: 'a' }, it.unpriced ? '未计价' : money(Number(it.amount) || 0)))))
          : h('div', { className: 'srs-bill-note' },
            billQn ? '没有匹配「' + billQ + '」的记录。' : (uq ? '这个窗口没有明细。' : usageEmptyHint)),
        uq && uq.retention
          ? h('div', { className: 'srs-bill-note', style: { marginTop: '8px' } },
            '明细保留 ' + uq.retention.turnDays + ' 天 / ' + uq.retention.turnsCap + ' 条（现 ' + uq.retention.turnsLive + ' 条，归档 ' + uq.retention.archived + ' 条）')
          : null
      );

      // ── 占卜页 ──────────────────────────────────────────────────
      const DIVINE_MODES = [['daily', '每日一签'], ['mood', '情绪'], ['either', '二选一'], ['duo', '双人牌'], ['relation', '关系阵']];
      const moodToday = mood && mood.d === localDayKey() ? mood.mood : null;
      const moodView = h('div', { className: 'srs-block', style: { marginTop: '10px' } },
        cap('今天心情怎么样', 'heart'),
        h('div', { className: 'srs-moods' },
          MOODS.map(([id, label]) => h('button', {
            key: 'md' + id,
            'data-act': 'mood-' + id,
            className: moodToday === id ? 'on' : '',
          }, label))),
        moodPick
          ? h('div', { className: 'srs-daily', style: { marginTop: '10px' } },
            h('img', {
              className: 'srs-daily-card',
              src: '/srs/cards/thumb/' + moodPick.card.id + '.webp?v=' + VERSION,
              alt: '',
              draggable: false,
              style: moodPick.reversed ? { transform: 'rotate(180deg)' } : null,
            }),
            h('div', { className: 'srs-daily-txt' },
              h('div', { className: 'srs-daily-name' }, moodPick.card.name_zh + (moodPick.reversed ? ' · 逆位' : ' · 正位')),
              h('div', { className: 'srs-note' }, moodPick.empathy || ''),
              h('div', { className: 'srs-daily-tip' }, '不解释吉凶，只回应你现在的心情。')))
          : h('div', { className: 'srs-note', style: { marginTop: '8px' } }, '选一个最接近的，我陪你抽一张。')
      );

      const divineSeg = h('div', { className: 'srs-menu-row' },
        h('span', null, '占法'),
        h('div', { className: 'srs-seg' },
          DIVINE_MODES.map((m) => h('button', {
            key: 'dm' + m[0],
            'data-act': 'divine-' + m[0],
            className: divineMode === m[0] ? 'on' : '',
          }, m[1]))));

      // 二选一 / 关系阵的牌：牌背先亮着，按序号错开翻成牌面（i 同时决定动画延迟）
      // 标签与牌名跟着翻牌一起淡入 —— 牌背还亮着就把答案写出来 = 剧透
      const miniCard = (r, label, key, i) => {
        const fd = ((i || 0) * 0.12);
        return h('div', { key, className: 'srs-sp-cell' },
          h('div', { className: 'srs-flip', style: { '--fd': fd + 's' } },
            h('div', { className: 'srs-flip-in' },
              h('div', { className: 'srs-flip-face srs-flip-front' },
                h('img', {
                  src: '/srs/cards/thumb/' + r.card.id + '.webp?v=' + VERSION,
                  alt: '',
                  draggable: false,
                  style: r.reversed ? { transform: 'rotate(180deg)' } : null,
                })),
              h('img', {
                className: 'srs-flip-face srs-flip-back',
                src: '/srs/cards/back.webp?v=' + VERSION,
                alt: '',
                draggable: false,
              }))),
          label ? h('div', { className: 'srs-sp-lab srs-fadein', style: { '--fd': (fd + 0.34) + 's' } }, label) : null,
          h('div', { className: 'srs-sp-name srs-fadein', style: { '--fd': (fd + 0.34) + 's' } },
            r.card.name_zh + (r.reversed ? '·逆' : '·正')));
      };

      const dailyLocked = daily && daily.d === todayKey();
      const eitherInfo = divineMode === 'either' ? eitherScore(divineCards) : null;
      const eitherKeyLine = divineCards[1] ? ((divineCards[1].meaning.lines || [])[0] || '') : '';
      let eitherVerdict = '';
      if (eitherInfo) {
        if (eitherInfo.win === 'both') eitherVerdict = '两条路差不多，看哪个代价你更愿意付。';
        else if (eitherInfo.win === 'A') eitherVerdict = '整体偏向 A：关键那张是「' + eitherKeyLine + '」。';
        else eitherVerdict = '整体偏向 B：关键那张是「' + eitherKeyLine + '」。';
      }

      const duo = divineMode === 'duo' ? duoReading(divineCards) : null;

      const modeBody = divineMode === 'mood'
          ? moodView
          : divineMode === 'daily'
          ? h('div', { className: 'srs-block', style: { marginTop: '10px' } },
            cap(dailyLocked ? '今天的签' : '还没抽今天的签', 'seal'),
            divineCards.length && divineCards[0]
              ? h('div', { className: 'srs-daily' },
                h('img', {
                  className: 'srs-daily-card',
                  src: '/srs/cards/thumb/' + divineCards[0].card.id + '.webp?v=' + VERSION,
                  alt: '',
                  draggable: false,
                  style: divineCards[0].reversed ? { transform: 'rotate(180deg)' } : null,
                }),
                h('div', { className: 'srs-daily-txt' },
                  h('div', { className: 'srs-daily-name' }, divineCards[0].card.name_zh + (divineCards[0].reversed ? ' · 逆位' : ' · 正位')),
                  h('div', { className: 'srs-note' }, (divineCards[0].meaning.lines || [])[0] || ''),
                  daily && daily.color
                    ? h('div', { className: 'srs-daily-lucky' },
                      h('span', { className: 'srs-swatch srs-swatch-inl', style: { background: daily.color[1] } }),
                      '幸运色 ' + daily.color[0])
                    : null,
                  h('div', { className: 'srs-daily-tip' }, dailyLocked ? '今天的已经定了，明天再来。' : '')
                )
              )
              : h('div', { className: 'srs-note' }, '抽一支今天的签，一句话就够了。'),
            h('div', { className: 'srs-foot', style: { marginTop: '10px', paddingTop: '10px' } },
              h('button', {
                className: 'srs-btn primary',
                'data-act': 'divine-draw',
                disabled: divineBusy || dailyLocked,
              }, dailyLocked ? '明天再来' : '抽一签')))
          : divineMode === 'either'
            ? h('div', { className: 'srs-block', style: { marginTop: '10px' } },
              cap('两条路，各抽三张', 'fork'),
              divineCards.length === 5
                ? h('div', null,
                  h('div', { className: 'srs-spread srs-spread-wrap' },
                    divineCards.map((r, i) => miniCard(r, ['A 路', '关键', 'A 结局', 'B 路', 'B 结局'][i], 'ec' + divineSeq + '-' + i, i))),
                  h('div', {
                    key: 'ec-txt-' + divineSeq,
                    className: 'srs-lines srs-fadein',
                    style: { marginTop: '8px', '--fd': (divineCards.length * 0.12 + 0.42) + 's' },
                  },
                    h('p', null, h('b', { style: { color: '#E7D9BC' } }, 'A 路：'), (divineCards[0].meaning.lines || [])[0] || ''),
                    h('p', null, h('b', { style: { color: '#E7D9BC' } }, 'B 路：'), (divineCards[3].meaning.lines || [])[0] || ''),
                    h('p', null, h('b', { style: { color: '#E7D9BC' } }, '结起来看：'), eitherVerdict)
                  ))
                : h('div', { className: 'srs-note' }, '想问两件事？先在心里分清 A 和 B。'),
              h('div', { className: 'srs-foot', style: { marginTop: '10px', paddingTop: '10px' } },
                h('button', { className: 'srs-btn primary', 'data-act': 'divine-draw', disabled: divineBusy },
                  divineCards.length === 5 ? '再抽五张' : '抽五张')))
            : divineMode === 'duo'
              ? h('div', { className: 'srs-block', style: { marginTop: '10px' } },
                cap('双人牌 · 你与他', 'heart'),
                divineCards.length === 2 && duo
                  ? h('div', null,
                    h('div', { className: 'srs-spread srs-spread-wrap' },
                      divineCards.map((r, i) => miniCard(r, ['你', '对方'][i], 'du' + divineSeq + '-' + i, i))),
                    h('div', {
                      key: 'du-txt-' + divineSeq,
                      className: 'srs-lines srs-fadein',
                      style: { marginTop: '8px', '--fd': (divineCards.length * 0.12 + 0.42) + 's' },
                    },
                      h('p', null, h('b', { style: { color: '#E7D9BC' } }, '现状：'), duo.tone),
                      h('p', null, duo.line),
                      h('p', null, h('b', { style: { color: '#E7D9BC' } }, '你现在能做的三件小事：')),
                      duo.tips.map((t, i) => h('p', { key: 'dt' + i }, '· ' + t))),
                    h('div', { className: 'srs-note' },
                      '只写关系的现状与可能。他到底爱不爱你，这副牌不回答，也不该由牌回答。'))
                  : h('div', { className: 'srs-note' }, '心里想一个人。一人一张，看的是你们之间。'),
                h('div', { className: 'srs-foot', style: { marginTop: '10px', paddingTop: '10px' } },
                  h('button', { className: 'srs-btn primary', 'data-act': 'divine-draw', disabled: divineBusy },
                    divineCards.length === 2 ? '再抽两张' : '抽两张')))
            : h('div', { className: 'srs-block', style: { marginTop: '10px' } },
              cap('关系阵 · 七张', 'seven'),
              divineCards.length === 7
                ? h('div', null,
                  h('div', { className: 'srs-spread srs-spread-wrap' },
                    divineCards.map((r, i) => miniCard(r, ['我', '对方', '现状', '阻碍', '过去', '建议', '走向'][i], 'rl' + divineSeq + '-' + i, i))),
                  h('div', {
                    key: 'rl-txt-' + divineSeq,
                    className: 'srs-lines srs-fadein',
                    style: { marginTop: '8px', '--fd': (divineCards.length * 0.12 + 0.42) + 's' },
                  },
                    h('p', null, h('b', { style: { color: '#E7D9BC' } }, '现状：'), (divineCards[2].meaning.lines || [])[0] || ''),
                    h('p', null, h('b', { style: { color: '#E7D9BC' } }, '阻碍：'), (divineCards[3].meaning.lines || [])[0] || ''),
                    h('p', null, h('b', { style: { color: '#E7D9BC' } }, '建议：'), (divineCards[5].meaning.lines || [])[0] || ''),
                    h('p', null, h('b', { style: { color: '#E7D9BC' } }, '走向：'), (divineCards[6].meaning.lines || [])[0] || ''))
                  )
                : h('div', { className: 'srs-note' }, '想一个人，再抽。只写关系现状与可能，不替你判断对方爱不爱你。'),
              h('div', { className: 'srs-foot', style: { marginTop: '10px', paddingTop: '10px' } },
                h('button', { className: 'srs-btn primary', 'data-act': 'divine-draw', disabled: divineBusy },
                  divineCards.length === 7 ? '再抽七张' : '抽七张')));

      // W4 安神 3 分钟：4 秒吸 / 2 秒停 / 6 秒呼，圈跟着放大缩小
      const breatheUsed = 180 - breatheLeft;
      const breathePhase = breatheUsed % 12 < 4 ? '吸气' : (breatheUsed % 12 < 6 ? '屏住' : '呼气');
      const breatheView = h('div', { className: 'srs-block', style: { marginTop: '10px' } },
        cap('安神 3 分钟', 'moon'),
        h('div', { className: 'srs-breathe-box' },
          h('div', { className: 'srs-breathe-ring' },
            h('div', { className: 'srs-breathe-core ph-' + (breathePhase === '吸气' ? 'in' : (breathePhase === '屏住' ? 'hold' : 'out')) }),
            // 阶段与剩余时间压在圈里：面板内容区矮的时候，放圈下面会被挤出可视区
            h('div', { className: 'srs-breathe-mid' },
              h('div', { className: 'srs-breathe-phase' }, breathePhase),
              h('div', { className: 'srs-breathe-left' },
                Math.floor(breatheLeft / 60) + ':' + String(breatheLeft % 60).padStart(2, '0'))))),
        h('div', { className: 'srs-note' }, '吸 4 秒、停 2 秒、呼 6 秒。随时可以停，不用坚持到最后一秒。'));

      const breatheRow = h('div', { className: 'srs-menu-row', style: { marginTop: '6px' } },
        h('span', { className: 'srs-row-cap' }, capIcon('moon'), h('span', null, '缓一缓')),
        h('div', { className: 'srs-seg' },
          h('button', { 'data-act': breatheOpen ? 'breathe-stop' : 'breathe-open' },
            breatheOpen ? '停下' : '安神 3 分钟')));

      // W17 许愿瓶：写一件封起来，到新月 / 满月 / 生日才开；封着时不显示内容
      const wishList = wishes.map((w) => {
        const left = daysUntil(w.openAt);
        const opened = !!w.openedAt;
        return h('div', { key: 'w' + w.id, className: 'srs-wish' + (opened ? ' is-open' : '') },
          h('div', { className: 'srs-wish-head' },
            h('span', { className: 'k' }, (WISH_WHEN[w.when] || '到日子') + ' · ' + w.openAt + ' 开'),
            h('span', { className: 'v' + (left <= 0 && !opened ? ' is-due' : '') },
              opened ? '已开' : (left > 0 ? '还封着 · 还有 ' + left + ' 天' : '可以开了'))),
          opened ? h('div', { className: 'srs-wish-text' }, w.text) : null,
          (left <= 0 && !opened)
            ? h('div', { className: 'srs-row2' }, h('button', { 'data-act': 'wish-open-' + w.id }, '打开'))
            : null,
          opened ? h('div', { className: 'srs-wish-meta' }, '写于 ' + w.at + ' · 开于 ' + w.openedAt) : null,
          h('button', { className: 'srs-per-del', 'data-act': 'wish-del-' + w.id }, '删'));
      });

      const wishView = h('div', { className: 'srs-block', style: { marginTop: '10px' } },
        cap('许愿瓶', 'seal'),
        h('textarea', { ref: wishRef, className: 'srs-area', rows: 3, placeholder: '写一件想封起来的事…' }),
        h('div', { className: 'srs-row' }, h('span', { className: 'k' }, '什么时候开'),
          h('div', { className: 'srs-seg srs-seg-wrap' },
            WISH_TAB.map(([k, label]) => h('button', {
              key: 'ww' + k,
              'data-act': 'wish-when-' + k,
              className: wishWhen === k ? 'on' : '',
            }, label)))),
        h('div', { className: 'srs-row2' },
          h('button', { className: 'p', 'data-act': 'wish-save' }, '封进瓶子')),
        h('div', { className: 'srs-note srs-note-s' },
          '封上就看不到内容，到日子才开；只存在这台机器上。生日要先去档案里填过，才排得出那天。'),
        wishList.length
          ? h('div', { className: 'srs-wishlist' }, wishList)
          : h('div', { className: 'srs-note' }, '瓶子还是空的。'));

      const divineBody = h('div', null, divineSeg, breatheRow, breatheOpen ? breatheView : modeBody, wishView);

      // ── 星座页 ──────────────────────────────────────────────────
      // 选中优先级：手动点过 > 档案生日 > 今天的太阳星座（没填生日也不该卡死在摩羯）
      const todayMd = new Date();
      const mySignId = viewSign
        || signFromBirthday(profile.birthday)
        || signOf(todayMd.getMonth() + 1, todayMd.getDate())
        || 'aries';
      const card = todayCard(mySignId, HORO, new Date());
      const wear = wearPlan(card, HORO);
      const starsOf = (n) => '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5 - n);
      const signPicker = h('div', { className: 'srs-signs' },
        (HORO.signs || []).map((sg) => h('button', {
          key: 'sg' + sg.id,
          'data-act': 'pick-sign-' + sg.id,
          className: (sg.id === mySignId ? 'on' : ''),
          title: sg.range,
        }, sg.glyph + sg.name)));

      const zodiacBody = card ? h('div', null,
        h('div', { className: 'srs-block' },
          cap('今日天象', 'moon'),
          h('div', { className: 'srs-row' }, h('span', { className: 'k' }, '月相'), h('span', { className: 'v' }, card.phaseName)),
          h('div', { className: 'srs-row' }, h('span', { className: 'k' }, '月亮星座'), h('span', { className: 'v' }, card.moonSign.glyph + ' ' + card.moonSign.name)),
          h('div', { className: 'srs-row' }, h('span', { className: 'k' }, '逆行'),
            h('span', { className: 'v' }, ['mercury', 'venus', 'mars'].filter((k) => card.retro && card.retro[k])
              .map((k) => ({ mercury: '水星', venus: '金星', mars: '火星' }[k])).join(' · ') || '无')),
          h('div', { className: 'srs-note' }, card.phaseLine),
          h('div', { className: 'srs-note' }, card.retroLine)),

        h('div', { className: 'srs-block' },
          h('div', { className: 'srs-block-cap' }, card.sign.glyph + ' ' + card.sign.name + ' · ' + card.sign.range),
          h('div', { className: 'srs-row' }, h('span', { className: 'k' }, '元素 / 守护'), h('span', { className: 'v' }, card.sign.element + ' · ' + card.sign.ruler)),
          h('div', { className: 'srs-note' }, card.mood),
          signPicker),

        h('div', { className: 'srs-block' },
          cap('四维', 'grid'),
          card.domains.map((d) => h('div', { key: 'dm' + d.label, className: 'srs-dom' },
            h('span', { className: 'k' }, d.label),
            h('span', { className: 'srs-stars' }, starsOf(d.stars)),
            h('span', { className: 'srs-dom-t' }, d.text)))),

        h('div', { className: 'srs-block' },
          h('div', { className: 'srs-row' }, h('span', { className: 'k' }, '宜'), h('span', { className: 'v' }, card.doIt.join(' · '))),
          h('div', { className: 'srs-row' }, h('span', { className: 'k' }, '忌'), h('span', { className: 'v' }, card.avoid.join(' · '))),
          h('div', { className: 'srs-row' }, h('span', { className: 'k' }, '幸运'),
            h('span', { className: 'v' }, (card.color ? card.color[0] : '') + ' · ' + card.number + ' · ' + card.slot)),
          card.color ? h('div', { className: 'srs-swatch', style: { background: card.color[1] } }) : null),

        // W6 幸运穿搭：把幸运色落到「怎么穿」，不评价身材外貌
        wear.length
          ? h('div', { className: 'srs-block' },
            cap('今天怎么穿', 'eye'),
            h('div', { className: 'srs-wear' }, wear.map((w) => h('div', { key: 'wr' + w.label, className: 'srs-wear-row' },
              h('span', { className: 'srs-wear-chip', style: { background: w.hex } }),
              h('span', { className: 'k' }, w.label + ' · ' + w.name),
              h('span', { className: 'srs-wear-how' }, w.how)))))
          : null,

        h('div', { className: 'srs-witch' }, card.witch),

        // N4 运势 → 抽牌入口：看完今天的走势，顺手问一件具体的事
        h('div', { className: 'srs-foot', style: { marginTop: '10px', paddingTop: '10px' } },
          h('button', { className: 'srs-btn', 'data-act': 'export-horo', disabled: exporting },
            exporting ? '画图中…' : '存图'),
          h('button', { className: 'srs-btn primary', 'data-act': 'today-ask' }, '今天想问什么？'))
      ) : h('div', { className: 'srs-empty' }, emptyIcon('moon'), '运势数据没读到。');

      // ── 配置页（音效 / 气泡 / 外观 / 设置与数据）──────────────────
      const sndCfg = cfg.sound || {};
      const ambCfg = cfg.amb || {};
      const sndTracks = sndCfg.tracks || {};
      const TRACKS = [['shuffle', '洗牌'], ['draw', '抽牌'], ['flip', '翻牌'], ['collect', '收牌'], ['bell', '结果铃']];
      // 播报音单独一组：这三路只在气泡报账时响，与上面塔罗五路不同源、不同听感
      const NOTICE_TRACKS = [['cost', '每轮记账'], ['ask', '等你答话'], ['approve', '等你授权']];
      const bubbleCfg = cfg.bubble || {};
      const noticeCfg = cfg.notice || {};
      const remCfg = cfg.remind || {};
      const editGroup = bubbleEdit || 'idle';
      const editText = (linesFor(cfg, editGroup) || []).join('\n');

      const trackRow = (key, label) => h('div', { key: 'tr' + key, className: 'srs-row srs-row-tight' },
        h('span', { className: 'k' }, label),
        h('div', { className: 'srs-seg' },
          h('button', { 'data-act': 'preview-' + key, title: '试听' }, '▶'),
          h('button', {
            'data-act': 'track-' + key,
            className: sndTracks[key] === false ? '' : 'on',
          }, sndTracks[key] === false ? '关' : '开')));

      const soundBody = bubbleEdit ? h('div', null,
        h('div', { className: 'srs-block' },
          cap('编辑台词 · ' + ((LINE_GROUPS.find((g) => g[0] === editGroup) || [])[1] || ''), 'pen'),
          h('div', { className: 'srs-menu-row' },
            h('span', null, '分组'),
            h('div', { className: 'srs-seg srs-seg-wrap' },
              LINE_GROUPS.map((g) => h('button', {
                key: 'lg' + g[0],
                'data-act': 'edit-group-' + g[0],
                className: g[0] === editGroup ? 'on' : '',
              }, g[1])))),
          h('textarea', {
            // key 必须跟分组走：textarea 用的是 defaultValue（非受控），React 复用同一个 DOM 节点时
            // 改 defaultValue 不会写进已有的 value —— 表现为「点了别的分组，下面还是原来那组台词」
            key: 'ta-' + editGroup,
            ref: linesRef,
            className: 'srs-area',
            defaultValue: editText,
            rows: 7,
            placeholder: '一行一句，空行会被忽略',
          }),
          h('div', { className: 'srs-note' }, '改完点保存，只影响这台机器；「恢复默认」会清掉这一组的改动。'),
          h('div', { className: 'srs-row2' },
            h('button', { className: 'p', 'data-act': 'save-lines' }, '保存'),
            h('button', { 'data-act': 'reset-lines' }, '恢复默认'),
            h('button', { 'data-act': 'close-edit' }, '返回'))
        )
      ) : h('div', null,
        h('div', { className: 'srs-block' },
          cap('音效', 'sound'),
          h('button', { className: 'srs-menu-act srs-switch' + (sndCfg.on ? ' on' : ''), 'data-act': 'toggle-sound' },
            h('span', { className: 't' }, '音效总开关'), h('i', { className: 'sw' })),
          h('div', { className: 'srs-row' }, h('span', { className: 'k' }, '音量'),
            h('div', { className: 'srs-seg' },
              h('button', { 'data-act': 'vol-down' }, '−'),
              h('span', { className: 'srs-menu-sub', style: { minWidth: '38px', textAlign: 'center' } }, (sndCfg.volume == null ? 55 : sndCfg.volume) + '%'),
              h('button', { 'data-act': 'vol-up' }, '＋'))),
          TRACKS.map(([k, label]) => trackRow(k, label)),
          cap('播报音', 'bubble', { marginTop: '8px' }),
          NOTICE_TRACKS.map(([k, label]) => trackRow(k, label)),
          h('div', { className: 'srs-note srs-note-s' }, '这三路只在气泡报账时响；与上面五路分开开关、分开试听。')),

        // W19 环境音景：四套循环，可叠加混音
        h('div', { className: 'srs-block' },
          cap('环境音景', 'moon'),
          h('button', { className: 'srs-menu-act srs-switch' + (ambCfg.on ? ' on' : ''), 'data-act': 'toggle-amb' },
            h('span', { className: 't' }, '总开关'), h('i', { className: 'sw' })),
          h('div', { className: 'srs-row' }, h('span', { className: 'k' }, '音量'),
            h('div', { className: 'srs-seg' },
              h('button', { 'data-act': 'amb-vol-down' }, '−'),
              h('span', { className: 'srs-menu-sub', style: { minWidth: '38px', textAlign: 'center' } },
                (ambCfg.volume == null ? 45 : ambCfg.volume) + '%'),
              h('button', { 'data-act': 'amb-vol-up' }, '＋'))),
          // 八套改成两列小格：一行一个太占版面（八个轨道会把整页撑到要滚两屏）
          h('div', { className: 'srs-amb-grid' },
            Object.keys(AMB).map((k) => h('button', {
              key: 'am' + k,
              'data-act': 'amb-' + k,
              className: ((ambCfg.tracks || {})[k] === true) ? 'on' : '',
            }, AMB[k].label + (((ambCfg.tracks || {})[k] === true) ? ' · 开' : '')))),
          h('div', { className: 'srs-note srs-note-s' }, '八套可以同时开，混着听；页面切走也照放，想停就在这里的开关关掉。')),

        h('div', { className: 'srs-block' },
          cap('气泡', 'bubble'),
          h('button', { className: 'srs-menu-act srs-switch' + ((bubbleCfg.on === false) ? '' : ' on'), 'data-act': 'toggle-bubble' },
            h('span', { className: 't' }, '气泡台词'), h('i', { className: 'sw' })),
          h('div', { className: 'srs-row' }, h('span', { className: 'k' }, '停留'),
            h('div', { className: 'srs-seg' },
              [3, 6, 10].map((sec) => h('button', {
                key: 'bh' + sec,
                'data-act': 'hold-' + sec,
                className: (Number(bubbleCfg.holdSec) || 6) === sec ? 'on' : '',
              }, sec + 's')))),
          h('div', { className: 'srs-row' }, h('span', { className: 'k' }, '说话'),
            h('div', { className: 'srs-seg' },
              [['quiet', '安静'], ['normal', '正常'], ['chatty', '多话']].map(([v, label]) => h('button', {
                key: 'talk' + v,
                'data-act': 'talk-' + v,
                className: talkMode === v ? 'on' : '',
              }, label)))),
          // 播报：气泡里说账（每轮结完报一次、有件要你决定的事也报一次）
          h('button', { className: 'srs-menu-act srs-switch' + (noticeCfg.turnCost !== false ? ' on' : ''), 'data-act': 'notice-turn' },
            h('span', { className: 't' }, '每轮消耗'), h('i', { className: 'sw' })),
          h('button', { className: 'srs-menu-act srs-switch' + (noticeCfg.askWait !== false ? ' on' : ''), 'data-act': 'notice-ask' },
            h('span', { className: 't' }, '等你答话'), h('i', { className: 'sw' })),
          h('button', { className: 'srs-menu-act srs-switch' + (noticeCfg.approveWait !== false ? ' on' : ''), 'data-act': 'notice-approve' },
            h('span', { className: 't' }, '等你授权'), h('i', { className: 'sw' })),
          h('button', { className: 'srs-menu-act srs-menu-act-ic', 'data-act': 'open-edit' },
            capIcon('pen'), h('span', { className: 't' }, '编辑台词…')),
          h('div', { className: 'srs-note srs-note-s' },
            '内置 ' + LINE_GROUPS.reduce((n, g) => n + (LINES[g[0]] || []).length, 0) + ' 句，可逐行改，也可整组恢复。')),

        // C8 每日一牌提醒：到点她还记着今天没抽，就冒一句；抽过了不打扰
        h('div', { className: 'srs-block' },
          cap('每日一牌提醒', 'clock'),
          h('button', { className: 'srs-menu-act srs-switch' + (remCfg.on === true ? ' on' : ''), 'data-act': 'toggle-remind' },
            h('span', { className: 't' }, '到点提醒'), h('i', { className: 'sw' })),
          h('div', { className: 'srs-row' }, h('span', { className: 'k' }, '提醒时间'),
            h('div', { className: 'srs-seg' },
              h('button', { 'data-act': 'remind-minus', title: '早 15 分钟' }, '−'),
              h('span', { className: 'srs-menu-sub', style: { minWidth: '52px', textAlign: 'center' } },
                hhmmLabel(remCfg.hh == null ? 21 : remCfg.hh, remCfg.mm == null ? 0 : remCfg.mm)),
              h('button', { 'data-act': 'remind-plus', title: '晚 15 分钟' }, '＋'))),
          h('div', { className: 'srs-row' }, h('span', { className: 'k' }, '试一下'),
            h('div', { className: 'srs-seg' },
              h('button', { 'data-act': 'remind-test' }, '现在就说一遍'))),
          h('div', { className: 'srs-note srs-note-s' },
            '到点时她还记着「今天还没抽」就冒一句 + 敲一声铃；当天已经抽过、或当天已经提醒过，就不再吵。关掉时既不说话也不响铃。')),

        // 计费提醒（仿青云剑仙）：余额告急线 + 今日预算，两项设成「关」就不提醒
        h('div', { className: 'srs-block' },
          cap('计费提醒', 'pie'),
          h('div', { className: 'srs-row' }, h('span', { className: 'k' }, '余额告急线'),
            h('div', { className: 'srs-seg' },
              h('button', { 'data-act': 'bill-warn-down', title: '减 5 元' }, '−'),
              h('span', { className: 'srs-menu-sub', style: { minWidth: '52px', textAlign: 'center' } },
                (Number(billCfg.warnLow) > 0 ? '¥' + billCfg.warnLow : '关')),
              h('button', { 'data-act': 'bill-warn-up', title: '加 5 元' }, '＋'))),
          h('button', {
            className: 'srs-menu-act srs-switch' + (billCfg.lowNotice !== false ? ' on' : ''),
            'data-act': 'bill-low-notice',
          }, h('span', { className: 't' }, '余额告急时冒一句'), h('i', { className: 'sw' })),
          h('div', { className: 'srs-row' }, h('span', { className: 'k' }, '今日预算'),
            h('div', { className: 'srs-seg' },
              h('button', { 'data-act': 'bill-budget-down', title: '减 5 元' }, '−'),
              h('span', { className: 'srs-menu-sub', style: { minWidth: '52px', textAlign: 'center' } },
                (Number(billCfg.budget) > 0 ? '¥' + billCfg.budget : '关')),
              h('button', { 'data-act': 'bill-budget-up', title: '加 5 元' }, '＋'))),
          h('div', { className: 'srs-note srs-note-s' },
            '余额低于告急线、或今天用满预算，她冒一句并敲一声；两种各一天只说一次。减到「关」就不提醒。')),

        h('div', { className: 'srs-block' },
          cap('外观', 'eye'),
          h('div', { className: 'srs-row' }, h('span', { className: 'k' }, '缩放'),
            h('div', { className: 'srs-seg' }, SCALES.map((v) => h('button', {
              key: 'sc' + v, 'data-act': 'scale-' + v,
              className: Math.abs(v - scale) < 0.01 ? 'on' : '',
            }, Math.round(v * 100) + '%')))),
          h('div', { className: 'srs-row' }, h('span', { className: 'k' }, '屏幕角'),
            h('div', { className: 'srs-seg' },
              h('button', { 'data-act': 'corner-left', className: ((cfg.anchor || {}).h === 'left') ? 'on' : '' }, '左下'),
              h('button', { 'data-act': 'corner-right', className: ((cfg.anchor || {}).h !== 'left') ? 'on' : '' }, '右下'))),
          h('div', { className: 'srs-row' }, h('span', { className: 'k' }, '牌义'),
            h('div', { className: 'srs-seg' },
              h('button', { 'data-act': 'detail-brief', className: detailFull ? '' : 'on' }, '简'),
              h('button', { 'data-act': 'detail-full', className: detailFull ? 'on' : '' }, '详'))),
          h('div', { className: 'srs-row' }, h('span', { className: 'k' }, '快捷键'),
            h('span', { className: 'v' }, 'Alt+S 面板 · Alt+Z 抽一张')),
          h('button', { className: 'srs-menu-act srs-switch' + (cfg.onlyPanel ? ' on' : ''), 'data-act': 'toggle-only-panel' },
            h('span', { className: 't' }, '只留水晶球'), h('i', { className: 'sw' })),
          h('div', { className: 'srs-note' }, '常驻她站在角上；「只留水晶球」把人收起来。')),

        // 人物姿态：固定某一张，或交回自动（闲置时自己换）
        h('div', { className: 'srs-block' },
          cap('人物姿态', 'person'),
          h('div', { className: 'srs-amb-grid srs-pose-grid' },
            h('button', {
              key: 'pose-auto',
              'data-act': 'pose-auto',
              className: posePinned ? '' : 'on',
            }, posePinned ? '自动' : '自动 · 开'),
            Object.keys(POSE_LABEL).map((k) => h('button', {
              key: 'pose-' + k,
              'data-act': 'pose-' + k,
              className: (cfg.posePin === k) ? 'on' : '',
            }, POSE_LABEL[k] + ((cfg.posePin === k) ? ' · 开' : '')))),
          h('div', { className: 'srs-note srs-note-s' },
            posePinned ? '固定在这一张：闲置不再换姿势、不发呆、不睡着；抽牌与播报仍会临时换一下，结束后回这一张。'
              : '自动：站姿在' + STAND_POSES.length + '张之间每隔几分钟慢慢换，另外还会小动一下、发呆、打盹；想定格就点上面任意一张。')),

        ioOpen
          ? h('div', { className: 'srs-block' },
            cap('导入设置', 'log'),
            h('textarea', { ref: ioRef, className: 'srs-area', rows: 6, placeholder: '把导出的 JSON 粘进来' }),
            h('div', { className: 'srs-row2' },
              h('button', { className: 'p', 'data-act': 'cfg-import' }, '导入'),
              h('button', { 'data-act': 'cfg-import-cancel' }, '取消')))
          : null,

        h('div', { className: 'srs-block' },
          cap('设置与数据', 'log'),
          h('div', { className: 'srs-row2' },
            h('button', { 'data-act': 'cfg-export' }, '导出设置'),
            h('button', { 'data-act': 'cfg-import-open' }, '导入设置')),
          h('div', { className: 'srs-row' }, h('span', { className: 'k' }, '本地数据'),
            h('div', { className: 'srs-seg' },
              wipeArm ? h('button', { className: 'on', 'data-act': 'wipe-all-yes' }, '确认清空') : h('button', { 'data-act': 'wipe-all' }, '清空'),
              wipeArm ? h('button', { 'data-act': 'wipe-all-cancel' }, '取消') : null)),
          h('div', { className: 'srs-note' }, '清空会删掉设置、历史、情绪与档案，不可找回。'))
      );

      // ── 档案页（密码门 → 内容）──────────────────────────────────
      const pinGate = h('div', null,
        h('div', { className: 'srs-empty', style: { marginBottom: '10px' } },
          emptyIcon('lock'),
          pinSet ? '输入 4–6 位数字密码解锁。' : '设一个 4–6 位数字密码，用来锁住下面的私人记录。'),
        h('div', { className: 'srs-field' }, h('span', null, '密码'),
          h('input', { ref: pinRef, type: 'password', inputMode: 'numeric', maxLength: 6, placeholder: '4–6 位数字' })),
        pinSet ? null : h('div', { className: 'srs-field' }, h('span', null, '再输一次'),
          h('input', { ref: pin2Ref, type: 'password', inputMode: 'numeric', maxLength: 6 })),
        h('div', { className: 'srs-row2' },
          h('button', { className: 'p', 'data-pact': pinSet ? 'unlock' : 'setup' }, pinSet ? '解锁' : '设置密码')),
        h('div', { className: 'srs-err' }, pinErr)
      );

      const perList = ((priv && priv.periods) || []).slice()
        .filter((x) => x && x.start)
        .sort((a, b) => (a.start < b.start ? 1 : -1));
      const gapsInfo = cycleGaps(perList);
      // 近 30 天：月相亮度 + 当天的情绪 / 睡眠（W8）
      const dailyMap = (priv && priv.daily) || {};
      const dRows = dayRows(perList, dailyMap, 30, (priv && priv.avgLen) || 28);
      const cmpM = moonCompare(dRows, 'm');
      const cmpS = moonCompare(dRows, 's');
      const dayList = Object.keys(dailyMap).sort().reverse();
      const cmpLine = (label, cmp) => {
        const near = cmp.nearN
          ? ('满月前后记了 ' + cmp.nearN + ' 天，其中 ' + cmp.nearLow + ' 天偏低')
          : '满月前后还没记';
        return label + '：' + near + '；其余 ' + cmp.farN + ' 天里 ' + cmp.farLow + ' 天偏低 · ' + CMP_WORD[cmp.verdict];
      };
      // 生日派生的三样：本命牌（bc）、星座、四柱
      const birthSign = (HORO.signs || []).find((s) => s.id === signFromBirthday(profile.birthday)) || null;
      const fz = fourPillars(profile.birthday, profile.birthTime);
      // 周期日历：看的是哪个月，就摊哪个月
      const cal = cycleCalendar(perList, (priv && priv.avgLen) || 28, calYm.y, calYm.m);

      // 生日改成改完即存：以前只有「保存生日」按钮能落盘，而那个按钮长在「周期记录」块里，
      // 用户改完日期直接关面板 = 什么都没存，下次打开就是空的（真机反馈「每次打开都不是自己设的那个」）
      const applyBirthday = (v) => {
        let prev = {};
        try { prev = JSON.parse(window.localStorage.getItem(PROFILE_KEY) || '{}') || {}; } catch (error) { prev = {}; }
        const next = Object.assign({}, prev, { birthday: v || '' });
        try { window.localStorage.setItem(PROFILE_KEY, JSON.stringify(next)); } catch (error) { /* 忽略 */ }
        setProfile(next);
        // 改了日期就把上一条「已保存」撤掉，别让旧提示挂在那儿
        window.clearTimeout(birthMsgTimer.current);
        setBirthMsg('');
      };

      // 出生时刻：只为时柱，缺了就是三柱（四柱排不出来不硬凑）
      const applyBirthTime = (v) => {
        let prev = {};
        try { prev = JSON.parse(window.localStorage.getItem(PROFILE_KEY) || '{}') || {}; } catch (error) { prev = {}; }
        const next = Object.assign({}, prev, { birthTime: v || '' });
        try { window.localStorage.setItem(PROFILE_KEY, JSON.stringify(next)); } catch (error) { /* 忽略 */ }
        setProfile(next);
        window.clearTimeout(birthMsgTimer.current);
        setBirthMsg('');
      };

      // ── 婚配：乾（男）/ 坤（女）各填生日 + 时辰，点一下出结果 ──
      const updateMatch = (key, field, v) => {
        setMatchIn((cur) => {
          const next = Object.assign({}, cur, {
            [key]: Object.assign({}, cur[key] || {}, { [field]: v }),
          });
          try { window.localStorage.setItem(MATCH_KEY, JSON.stringify(next)); } catch (error) { /* 忽略 */ }
          return next;
        });
        setMatchOut(null);   // 改了输入就撤掉旧结果，免得看着像已经按新输入算过
      };

      const personRow = (label, key) => h('div', { className: 'srs-field srs-match-row' },
        h('span', null, label),
        h('span', { className: 'srs-match-in' },
          h('input', {
            type: 'date',
            value: (matchIn[key] || {}).d || '',
            onChange: (e) => updateMatch(key, 'd', e.target.value),
          }),
          h('select', {
            value: ((matchIn[key] || {}).shi === undefined || (matchIn[key] || {}).shi === '')
              ? '' : String(matchIn[key].shi),
            onChange: (e) => updateMatch(key, 'shi', e.target.value),
          },
            h('option', { value: '' }, '时（不详）'),
            SHI_CHEN.map((c) => h('option', { key: 'sc' + c.t, value: c.t }, c.label)))));

      const matchView = h('div', { className: 'srs-block' },
        cap('婚配', 'heart'),
        personRow('乾（男）', 'm'),
        personRow('坤（女）', 'f'),
        h('div', { className: 'srs-row2', style: { marginTop: '6px' } },
          h('button', { className: 'p', 'data-pact': 'match-run' }, '匹配')),
        matchOut
          ? h('div', { className: 'srs-match-out' },
            h('div', { className: 'srs-match-score' },
              h('b', null, String(matchOut.score)),
              h('span', null, ' / 100 · ' + matchOut.level)),
            h('div', { className: 'srs-match-bar' },
              h('i', { style: { width: matchOut.score + '%' } })),
            h('div', { className: 'srs-match-fz' },
              '乾 ' + matchOut.pillars[0]),
            h('div', { className: 'srs-match-fz' },
              '坤 ' + matchOut.pillars[1]),
            matchOut.items.map((it, i) => h('div', { key: 'mi' + i, className: 'srs-match-item' },
              h('span', { className: 'k' }, it.name),
              h('span', { className: 'n' }, it.note),
              h('span', { className: 'd ' + it.tag }, (it.delta > 0 ? '+' : '') + it.delta))),
            h('div', { className: 'srs-match-cap' }, '现在能做的三件小事'),
            matchOut.tips.map((t, i) => h('div', { key: 'mt' + i, className: 'srs-cyc-line' }, (i + 1) + '. ' + t)))
          : h('div', { className: 'srs-cyc-line', style: { padding: '8px 0' } },
            '填双方生日（时辰不详就空着），点下面的「匹配」。'),
        h('div', { className: 'srs-note srs-note-s' },
          '时辰按 23–01 子、01–03 丑 这样排；子时跨两天，晚子（23–24）按次日算日柱，所以拆成早晚两档。'
          + '只看年支（生肖）、日支（配偶宫）、日干五行、年柱纳音、五行互补这五项结构；'
          + '分数是五项加权后的合成，单项相冲不等于整体不合，反过来也一样。'
          + '出的是倾向与建议，不是结局，也不回答「他爱不爱你」。'));

      const profileBody = priv ? h('div', null,
        h('div', { className: 'srs-block' },
          cap('生日 · 本命牌 · 星座 · 四柱', 'star'),
          h('div', { className: 'srs-field srs-birth-row' },
            h('span', null, '生日'),
            h('span', { className: 'srs-birth-in' },
              h('input', {
                ref: birthRef,
                type: 'date',
                defaultValue: profile.birthday || '',
                onChange: (e) => applyBirthday(e.target.value),
              }),
              h('input', {
                ref: birthTimeRef,
                type: 'time',
                defaultValue: profile.birthTime || '',
                onChange: (e) => applyBirthTime(e.target.value),
              }))),
          h('div', { className: 'srs-row' }, h('span', { className: 'k' }, '本命牌'),
            h('span', { className: 'v' }, bc ? (bc.name_zh + '（' + bc.numeral + '）') : '填生日后算')),
          h('div', { className: 'srs-row' }, h('span', { className: 'k' }, '星座'),
            h('span', { className: 'v' }, birthSign
              ? (birthSign.glyph + ' ' + birthSign.name + ' · ' + birthSign.element + '象 · ' + birthSign.range)
              : '填生日后算')),
          h('div', { className: 'srs-row' }, h('span', { className: 'k' }, '四柱'),
            h('span', { className: 'v srs-fz' }, fz
              ? (fz.pillars.join('　') + (fz.timeKnown ? '' : '　时柱待补'))
              : '填生日后算')),
          h('div', { className: 'srs-note srs-note-s' },
            '四柱按东八区平太阳时：年以立春、月以节为界，未做真太阳时校正；补上出生时刻才排时柱。'
            + '子时按 23–01 算，23 点之后归次日（晚子）。'),
          h('div', { className: 'srs-row2', style: { marginTop: '8px' } },
            h('button', { 'data-pact': 'save-profile', className: birthMsg ? 'is-ok' : '' },
              birthMsg ? '✓ 已保存' : '保存生日')),
          h('div', { className: 'srs-ok' }, birthMsg || '\u00A0')),

        h('div', { className: 'srs-block' },
          cap('周期日历', 'phase'),
          h('div', { className: 'srs-field' }, h('span', null, '开始日期'),
            h('input', { ref: pStartRef, type: 'date', defaultValue: '' })),
          h('div', { className: 'srs-field' }, h('span', null, '周期长度'),
            h('span', { className: 'srs-len' },
              h('input', {
                ref: pLenRef,
                type: 'number',
                min: 1,
                max: 60,
                defaultValue: String((priv && priv.avgLen) || 28),
              }),
              h('em', null, '天（1–60）'))),
          h('div', { className: 'srs-row2' },
            h('button', { className: 'p', 'data-pact': 'add-period' }, '添加这一次')),

          h('div', { className: 'srs-cal-head' },
            h('button', { className: 'srs-cal-nav', 'data-pact': 'cal-prev', title: '上一个月' }, '‹'),
            h('span', { className: 'srs-cal-title' }, cal.year + ' 年 ' + cal.month + ' 月'),
            h('button', { className: 'srs-cal-nav', 'data-pact': 'cal-next', title: '下一个月' }, '›')),
          h('div', { className: 'srs-cal' },
            ['一', '二', '三', '四', '五', '六', '日'].map((w) => h('div', { key: 'cw' + w, className: 'srs-cal-w' }, w)),
            cal.cells.map((c, i) => (c.state === 'blank'
              ? h('div', { key: 'cc' + i, className: 'srs-cal-cell is-blank' })
              : h('div', {
                key: 'cc' + i,
                className: 'srs-cal-cell' + (c.state !== 'none' ? ' st-' + c.state : '') + (c.today ? ' is-today' : ''),
                title: c.d + ' 日' + (CYCLE_STATE_LABEL[c.state] ? ' · ' + CYCLE_STATE_LABEL[c.state] : ''),
              }, String(c.d))))),
          h('div', { className: 'srs-cal-legend' },
            ['period', 'ovu', 'fertile', 'luteal', 'safe'].map((k) => h('span', { key: 'lg' + k, className: 'srs-lg' },
              h('i', { className: 'srs-cal-dot st-' + k }), CYCLE_STATE_LABEL[k]))),
          h('div', { className: 'srs-cyc-line' },
            cal.hasData
              ? ('按你的记录与 ' + cal.len + ' 天周期推算：经期按 ' + cal.bled + ' 天着色，排卵按下次月经前 '
                + (cal.len >= 21 ? 14 : Math.round(cal.len / 2)) + ' 天。只作自查，不当避孕或医学依据。')
              : '还没有记录。填一次开始日期，日历就会按 ' + cal.len + ' 天把各段标出来。'),

          cycle
            ? h('div', null,
              h('div', { className: 'srs-cyc-line' },
                '你的记录显示第 ' + cycle.dayNo + ' 天' +
                (cycle.toNext > 0 ? '，按 ' + cycle.len + ' 天算还有 ' + cycle.toNext + ' 天' : '，已过预估日期') +
                '；共 ' + cycle.count + ' 条记录。'),
              gapsInfo.avg
                ? h('div', { className: 'srs-cyc-line' }, '相邻两次间隔：' + gapsInfo.gaps.slice(0, 6).join(' / ') + ' 天，平均 ' + gapsInfo.avg + ' 天。')
                : null)
            : null,

          perList.length
            ? h('div', { className: 'srs-perlist' }, perList.slice(0, 8).map((x, i) => h('div', { key: 'pl' + i, className: 'srs-per-row' },
              h('span', { className: 'k' }, x.start),
              h('button', { className: 'srs-per-del', 'data-pact': 'del-period-' + x.start }, '删'))))
            : null),

        // ── W8 每天记一笔：只记录与回看，不下任何结论 ──
        h('div', { className: 'srs-block' },
          cap('每天记一笔', 'heart'),
          h('div', { className: 'srs-field' }, h('span', null, '日期'),
            h('input', { ref: dDayRef, type: 'date', 'data-w8': 'day', defaultValue: localDayKey() })),
          h('div', { className: 'srs-row' }, h('span', { className: 'k' }, '情绪'),
            h('div', { className: 'srs-seg' }, DAY_MOOD.map((label, i) => h('button', {
              key: 'dm' + i,
              'data-pact': 'day-mood-' + (i + 1),
              className: dayDraft.m === i + 1 ? 'on' : '',
            }, label)))),
          h('div', { className: 'srs-row' }, h('span', { className: 'k' }, '睡眠'),
            h('div', { className: 'srs-seg' }, DAY_SLEEP.map((label, i) => h('button', {
              key: 'ds' + i,
              'data-pact': 'day-sleep-' + (i + 1),
              className: dayDraft.s === i + 1 ? 'on' : '',
            }, label)))),
          h('div', { className: 'srs-row2' },
            h('button', { className: 'p', 'data-pact': 'save-day' }, '记下这一天')),
          h('div', { className: 'srs-note srs-note-s' },
            '同一天再记会覆盖上一次。只记你自己观察到的，不写任何结论。')),

        // ── W8 近 30 天：月相亮度 + 情绪柱 + 睡眠顶条，附一致性对照 ──
        h('div', { className: 'srs-block' },
          cap('近 30 天 · 月相对照', 'moon'),
          h('div', { className: 'srs-days' }, dRows.map((r, i) => h('div', {
            key: 'dy' + i,
            className: 'srs-day-cell' + (r.inPeriod ? ' is-period' : ''),
            title: (new Date(r.t)).getMonth() + 1 + '/' + r.day + ' · 月相 ' + Math.round(r.illum * 100) + '%'
              + (r.mood ? ' · 情绪 ' + DAY_MOOD[r.mood - 1] : '')
              + (r.sleep ? ' · 睡眠 ' + DAY_SLEEP[r.sleep - 1] : ''),
          },
            h('i', { key: 'mo', className: 'srs-day-moon', style: { height: Math.round(r.illum * 100) + '%' } }),
            r.mood
              ? h('i', { key: 'md', className: 'srs-day-mood m' + r.mood, style: { height: Math.round((r.mood / 5) * 100) + '%' } })
              : null,
            r.sleep ? h('i', { key: 'sl', className: 'srs-day-sleep s' + r.sleep }) : null))),
          // 日期轴：最左 30 天前、正中 15 天前、最右今天（单格太窄，全标会糊成一团；逐格日期在悬停里）
          h('div', { className: 'srs-days-axis' },
            h('span', null, dRows.length ? ((new Date(dRows[0].t)).getMonth() + 1) + '/' + dRows[0].day : ''),
            h('span', null, dRows.length
              ? ((new Date(dRows[Math.floor(dRows.length / 2)].t)).getMonth() + 1) + '/' + dRows[Math.floor(dRows.length / 2)].day
              : ''),
            h('span', null, '今天')),
          h('div', { className: 'srs-day-legend' },
            h('span', { className: 'srs-lg' }, h('i', { className: 'srs-cal-dot st-period' }), '经期'),
            h('span', { className: 'srs-lg' }, h('i', { className: 'srs-day-dot m1' }), '情绪低'),
            h('span', { className: 'srs-lg' }, h('i', { className: 'srs-day-dot m5' }), '情绪好'),
            h('span', { className: 'srs-lg' }, '柱子底色 = 月相亮度')),
          h('div', { className: 'srs-cyc-line' }, cmpLine('情绪', cmpM)),
          h('div', { className: 'srs-cyc-line' }, cmpLine('睡眠', cmpS)),
          h('div', { className: 'srs-note srs-note-s' },
            '只把你自己记的天数和月相对一对，看是一致还是反着；样本不够就直说。'
            + '不是规律，也不当生理、医疗或用药依据。'),
          dayList.length
            ? h('div', { className: 'srs-perlist srs-daylist' }, dayList.slice(0, 8).map((k) => {
              const one = dailyMap[k] || {};
              return h('div', { key: 'dl' + k, className: 'srs-day-row' },
                h('span', { className: 'k' }, k + ' · 情绪 ' + (one.m ? DAY_MOOD[one.m - 1] : '—')
                  + ' · 睡眠 ' + (one.s ? DAY_SLEEP[one.s - 1] : '—')),
                h('button', { className: 'srs-per-del', 'data-pact': 'del-day-' + k }, '删'));
            }))
            : null),

        matchView,

        h('div', { className: 'srs-err' }, pinErr)
      ) : pinGate;

      // ── 「关于」页 ─────────────────────────────────────────────
      // 内容口径见 docs/关于-文案-v2.md；两张码由 build.py 内联成 data URI
      const aboutLi = (items) => h('ul', null, items.map(([label, text], i) => h('li', { key: 'al' + i },
        label ? h('b', null, label) : null, text)));

      const aboutBody = h('div', { className: 'srs-about' },
        h('p', { className: 'lead' }, '我住在这块屏幕的角上。你点我，我就说话；你不点，我就待着。'),

        h('div', { className: 'srs-about-h' }, '这是什么'),
        h('p', null, '一个挂在 DSH 右下角的塔罗挂件。抽牌、看今天的星座、记一笔心情、看一眼这个月花了几块钱。不联网占卜，也不上传任何东西。'),

        h('div', { className: 'srs-about-h' }, '六个页面'),
        aboutLi([
          ['塔罗', '：每日一牌 / 单张 / 三张 / 凯尔特十张。每位先说这一位在问什么，再看这张牌是正是逆。'],
          ['占卜', '：每日一签、情绪打卡、二选一、双人牌、关系阵；另有安神三分钟与许愿瓶。'],
          ['星座', '：按生日或手动选星座。月相按真实月龄算，水星、金星、火星逆行按低精度轨道算。'],
          ['计费', '：数字只认宿主账本——逐轮读真实用量，按官方价目表算钱；价目表里没有的模型只记 token，标「未计价」。'],
          ['配置', '：音效、环境音景、气泡、说话档位、台词、人物姿态、每日提醒。'],
          ['档案', '：生日 → 本命牌 / 星座 / 四柱；周期日历；每天记一笔；婚配。全部加密存放。'],
        ]),

        h('div', { className: 'srs-about-h' }, '三条边界'),
        aboutLi([
          [null, '不预测生死、疾病、官司、投资涨跌、婚丧嫁娶。牌只给倾向，不给判决。'],
          [null, '不回答「他 / 她爱不爱你」。双人牌只写关系现状与可能。'],
          [null, '情绪、周期、月相对照都只是你自己的记录，不当医疗、避孕或用药依据。'],
        ]),

        h('div', { className: 'srs-about-h' }, '数据在哪'),
        aboutLi([
          [null, '全部存在这台机器的浏览器里（localStorage，键名以 srs. 开头）。没有账号，没有服务器，插件本身不向外发请求——断网冷启动实测 0 条外网请求。'],
          [null, '唯一对外的一处：打开计费页读余额时，由宿主代发一次请求，API Key 不出宿主进程。'],
          [null, '私密档案用密码加密：PBKDF2 迭代 12 万次 + AES-GCM；密码不落盘，关面板即锁档，重开要重新输。'],
        ]),

        h('div', { className: 'srs-about-h' }, '怎么算的'),
        aboutLi([
          ['牌序', '：crypto 取种子 → mulberry32 → Fisher–Yates。同一种子必然同一副顺序，所以历史能原样重放。'],
          ['四柱', '：年按立春、月按节（低精度太阳视黄经，误差约 ±2 分钟），日按儒略日，时按五鼠遁；东八区平太阳时，不做真太阳时校正。'],
          ['月相', '：平均黄经加主异常项，误差约 ±10°，只用来看气氛。'],
          ['逆行', '：三颗行星的低精度开普勒轨道，只看地心黄经的正负，不报度数。'],
          ['婚配', '：只比五项结构——年支（生肖）、日支（配偶宫）、日干五行、年柱纳音、五行互补。分数是加权合成，不是结局。'],
        ]),

        h('div', { className: 'srs-about-h' }, '素材与许可'),
        aboutLi([
          [null, '立绘 19 张，主人出图。'],
          [null, '牌面 78 张加牌背，Rider–Waite 体系。'],
          [null, '音效 16 路，Mixkit Free License 的真实录音，清单见 NOTICE.md。'],
          [null, '代码 MIT。'],
        ]),

        h('div', { className: 'srs-about-sep' }),
        h('div', { className: 'srs-about-h' }, '交流'),
        h('p', null, 'QQ 群 127879829。装插件、报问题、聊读牌都在里面，作者也在。群里不做付费算命。'),
        h('img', { className: 'srs-about-shot', src: ABOUT_IMG.qq, alt: 'Sorceress 交流群二维码', draggable: false }),

        h('div', { className: 'srs-about-sep' }),
        h('div', { className: 'srs-about-h' }, '赞赏'),
        h('p', null, '挂件免费，功能不设门槛。想请我喝碗茶，扫这张；不扫，功能一点不少。'),
        h('img', { className: 'srs-about-shot tip', src: ABOUT_IMG.tip, alt: '赞赏码', draggable: false }),
        h('p', { className: 'srs-about-cap' }, '赞赏不换功能、不解锁内容、不插队'),

        h('div', { className: 'srs-about-sep' }),
        h('div', { className: 'srs-about-h' }, '版本与反馈'),
        h('p', null, '当前 ' + VERSION + '。素材全部内联，不依赖任何外部进程。'),
        h('p', { className: 'note' }, '没有工单系统。台词可以在「配置 → 编辑台词」里改，一行一句，改完保存；设置可以导出成 JSON 备份。')
      );

      const bodyMap = { tarot: tarotBody, divine: divineBody, bill: billBody, zodiac: zodiacBody, sound: soundBody, profile: profileBody };
      // 标题跟着子页走：停在历史 / 牌库 / 回顾时别再写「这一张」
      const tarotTitle = reviewOpen
        ? '回顾'
        : (histOpen
          ? '抽牌历史'
          : (deckOpen
            ? (deckPick ? '牌义' : '牌库')
            : (cfg.spread === 'daily'
              ? '今日一牌'
              : (phase === 'shown'
                ? ((cfg.spread === 'three' || cfg.spread === 'celtic') ? '这一局' : '这一张')
                : (cfg.spread === 'three' ? '抽三张牌' : (cfg.spread === 'celtic' ? '抽十张牌' : '抽一张牌'))))));
      const titleMap = { tarot: tarotTitle, bill: '计费账单', divine: breatheOpen ? '安神' : '占卜', zodiac: '今日星座', sound: '配置', profile: '个人档案' };

      // ── 右上角水晶球入口（悬停人物才浮现，像剑仙的法宝）──────────
      const gearEl = h('div', {
        key: 'gear',
        className: 'srs-gear' + (panelOpen ? ' on' : ''),
        'data-act': 'open-menu',
        title: 'Sorceress 面板',
      }, h('img', { src: UI.orb, alt: '', draggable: false }));

      const panel = h('div', {
        ref: panelRef,
        className: 'srs-panel ' + (openLeft ? 'left' : 'right') + (panelOpen ? ' is-on' : ''),
        style: panelStyle,
      },
        h('div', { key: 'ctl', className: 'srs-corner tl', style: { backgroundImage: 'url("' + UI.cornerTL + '")' } }),
        h('div', { key: 'ctr', className: 'srs-corner tr', style: { backgroundImage: 'url("' + UI.cornerTR + '")' } }),
        h('div', { key: 'cbl', className: 'srs-corner bl', style: { backgroundImage: 'url("' + UI.cornerBL + '")' } }),
        h('div', { key: 'cbr', className: 'srs-corner br', style: { backgroundImage: 'url("' + UI.cornerBR + '")' } }),
        h('div', { className: 'srs-head', 'data-drag': 'panel', title: '按住这里可以把面板拖到别处' },
          h('div', { className: 'srs-title' }, aboutOpen ? '关于' : (titleMap[tab] || 'Sorceress')),
          h('div', { className: 'srs-head-right' },
            // 账本摘要：面板一打开就能看见今天花了多少，点一下进计费页
            bq && typeof bq.todayUsed === 'number' && tab !== 'bill'
              ? h('button', { className: 'srs-head-bill', 'data-act': 'goto-bill', title: '看计费账单' },
                '今日 ' + money(bq.todayUsed))
              : null,
            panelPos
              ? h('button', { className: 'srs-head-pin', 'data-act': 'panel-reset', title: '回到人物头顶上方' }, '复位')
              : null,
            h('button', { className: 'srs-x', 'data-act': 'close', title: '收起' }, '×'))),
        h('img', { key: 'div', className: 'srs-div', src: UI.divider, alt: '', draggable: false }),
        aboutOpen ? null : h('div', { className: 'srs-tabs' }, tabDefs, tabBtn),        h('div', { className: 'srs-body', ref: bodyRef, style: { height: bodyH + 'px' } },
          aboutOpen ? aboutBody : (bodyMap[tab] || null)),
        h('div', { className: 'srs-foot' },
          h('button', { className: 'srs-btn srs-btn-about', 'data-act': aboutOpen ? 'about-back' : 'about-open' },
            aboutOpen ? '返回' : '关于'),
          (tab === 'tarot' && !aboutOpen)
            ? h('button', {
              className: 'srs-btn primary' + (pickReady ? ' is-reveal' : ''),
              'data-act': pickReady ? 'reveal' : 'draw',
              disabled: phase === 'shuffling' || (cfg.spread === 'daily' && lockedToday && phase === 'shown'),
            },
              pickReady
                ? (pickWant > 3 ? '翻开这十张' : '翻开这三张')
                : (cfg.spread === 'celtic'
                  ? (phase === 'shown' ? '再抽十张' : '抽十张')
                  : (cfg.spread === 'three'
                    ? (phase === 'shown' ? '再抽三张' : '抽三张')
                    : (cfg.spread === 'daily'
                      ? (lockedToday ? (phase === 'shown' ? '今天已定' : '看今天的牌') : '抽今日一牌')
                      : (phase === 'shown' ? '再抽一张' : '抽一张')))))
            : null,
          h('button', { className: 'srs-btn', 'data-act': 'close' }, tab === 'tarot' ? '收起' : '关闭'))
      );

      return h('div', {
        ref: rootRef,
        className: 'srs-root' + (dragging ? ' srs-dragging' : '') + (cfg.onlyPanel ? ' srs-orb-only' : '')
          + (leftSide ? ' srs-left' : ''),
        style: Object.assign({
          position: 'fixed',
          zIndex: 9998,
          width: rootW + 'px',
          height: rootH + 'px',
          '--srs-w': rootW + 'px',
          '--srs-h': rootH + 'px',
        }),
        // 挂件根节点不要悬停提示：鼠标停在人物 / 面板上不该弹任何 tooltip
        // （2026-11-18 主人两次点名：先去掉版本号，再去掉「Sorceress（女巫）」本身）
      },
      panel,
      gearEl,
      h('div', {
          className: 'srs-stage'
            // 2026-11-18：原来只给 idle-a / idle-b 挂呼吸，其余姿势是僵图。
            // 自动模式现在会在 7 张站姿之间轮换，站姿若不动反而更假 —— 改成除打盹外全部常驻呼吸，
            // 打盹用慢档（srs-breathe-slow，7.2s）。
            + (pose === 'sleep' ? ' srs-breathe-slow' : ' srs-breathe')
            + (mirrored ? ' srs-mirror' : ''),
          style: stageStyle,
        },
        Object.keys(POSES).map((key) => h('img', {
          key,
          'data-pose': key,
          className: 'srs-sprite' + (key === pose ? ' is-on' : ''),
          src: POSES[key],
          alt: '',
          draggable: false,
        })),
        h('div', { className: 'srs-hitwrap', style: { width: (LAYOUT.rootH * scale * (box.ar || 0.66)) + 'px' } },
          h('div', {
            className: 'srs-hit',
            style: {
              // 镜像时点击轮廓跟着翻：左边界 = 1 - (x + w)，宽高不变
              left: ((mirrored ? (1 - hit[0] - hit[2]) : hit[0]) * 100) + '%',
              top: (hit[1] * 100) + '%',
              width: (hit[2] * 100) + '%',
              height: (hit[3] * 100) + '%',
            },
          })
        )
      ),
      h('div', { className: 'srs-bubble' + (bubbleOn ? ' is-on' : '') },
        bubble,
        bubbleSub ? h('div', { className: 'srs-bubble-sub' }, bubbleSub) : null)
      );
    }

    // ── 接入 DSH ───────────────────────────────────────────────────
    return {
      // 少这一行 ctx.slots 就不存在，apply 直接抛错、挂件静默不出现（2026-11-17 踩过）
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay',
          id: 'sorceress-widget',
          order: 40,
        }, Widget));
      },
    };
  },
});


