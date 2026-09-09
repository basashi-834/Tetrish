/**
 * 全体の司令塔。エンジンのイベントを受けて、描画・音・振動・DOM演出へ配る。
 */
import { Game, COLS, VISIBLE_ROWS, HIDDEN_ROWS, CONFIG } from './game.js';
import { PIECE_COLORS } from './pieces.js';
import { Renderer } from './renderer.js';
import { Effects } from './effects.js';
import { AudioEngine } from './audio.js';
import { InputManager } from './input.js';
import { store } from './storage.js';

const $ = (id) => document.getElementById(id);

const el = {
  app: $('app'),
  stage: $('stage'),
  boardWrap: $('boardWrap'),
  board: $('board'),
  overlay: $('overlay'),
  touchLayer: $('touchLayer'),
  hold: $('holdCanvas'),
  nextList: $('nextList'),
  score: $('scoreValue'),
  best: $('bestValue'),
  level: $('levelValue'),
  lines: $('linesValue'),
  time: $('timeValue'),
  pps: $('ppsValue'),
  feverMeter: $('feverMeter'),
  feverFill: $('feverFill'),
  combo: $('comboDisplay'),
  comboCount: $('comboCount'),
  comboCheer: $('comboCheer'),
  b2b: $('b2bDisplay'),
  b2bCount: $('b2bCount'),
  feverBanner: $('feverBanner'),
  readyGo: $('readyGo'),
  pad: $('pad'),
  toast: $('toast'),
  titleScreen: $('titleScreen'),
  pauseScreen: $('pauseScreen'),
  overScreen: $('overScreen'),
  howtoScreen: $('howtoScreen'),
  settingsScreen: $('settingsScreen'),
  titleBest: $('titleBest'),
  lvlValue: $('lvlValue'),
  finalScore: $('finalScore'),
  resultGrid: $('resultGrid'),
  recordBadge: $('recordBadge'),
  rankValue: $('rankValue'),
  deviceHint: $('deviceHint'),
};

const nextCanvases = Array.from(el.nextList.querySelectorAll('canvas'));

// --- 状態 --------------------------------------------------------------------

const effects = new Effects();
const renderer = new Renderer(el.board, effects);
const audio = new AudioEngine();
const settings = store.settings;

let game;
let input;
let running = false;
let lastTime = 0;
let displayScore = 0;      // スコア表示のロール用
let lastNextKey = '';
let lastHold = null;
let startLevel = settings.startLevel || 1;
let countdown = 0;         // READY/GO 演出中は入力を止める
let moveSoundThrottle = 0;

// --- ユーティリティ ------------------------------------------------------------

function vibrate(pattern) {
  if (!settings.vibrate) return;
  if (navigator.vibrate) {
    try { navigator.vibrate(pattern); } catch (e) { /* 無視 */ }
  }
}

function toast(msg, ms = 1600) {
  el.toast.textContent = msg;
  el.toast.classList.add('is-on');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.toast.classList.remove('is-on'), ms);
}

function formatTime(ms) {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function showScreen(id) {
  for (const s of document.querySelectorAll('.screen')) s.classList.remove('is-active');
  if (id) $(id).classList.add('is-active');
}

function hideScreens() { showScreen(null); }

/** 盤面に浮かぶテキストを出す。 */
function popText(text, sub, tier, yPercent = 45) {
  const div = document.createElement('div');
  div.className = `pop pop--t${tier}`;
  div.style.top = `${yPercent}%`;
  div.innerHTML = sub ? `${text}<small>${sub}</small>` : text;
  el.overlay.appendChild(div);
  setTimeout(() => div.remove(), 1500);
}

// --- レイアウト ---------------------------------------------------------------

/** 画面サイズから盤面の実寸を決めて CSS 変数に流し込む。 */
const mobileQuery = window.matchMedia(
  '(max-width: 760px), (pointer: coarse) and (max-width: 1024px)'
);
const landscapeQuery = window.matchMedia('(pointer: coarse) and (orientation: landscape)');

/** HUD を盤面の上段に置くレイアウトかどうか（縦持ちスマホ）。 */
function usesTopHud() {
  return mobileQuery.matches && !landscapeQuery.matches;
}

function layout() {
  const stage = el.stage.getBoundingClientRect();
  const leftEl = document.querySelector('.side--left');
  const rightEl = document.querySelector('.side--right');

  /** サイドが実際に使っている横幅（グリッドの余った領域は数えない）。 */
  const sideWidth = (root) => {
    let w = 0;
    for (const panel of root.querySelectorAll('.panel')) {
      w = Math.max(w, panel.getBoundingClientRect().width);
    }
    return w;
  };
  const gap = parseFloat(getComputedStyle(el.stage).gap) || 10;
  const meterH = 18;   // ドパミンゲージ＋余白

  let availW;
  let availH;

  if (usesTopHud()) {
    // HUD は盤面の上段。サイドの高さは盤面サイズに依存しないので測ってよい
    const hudH = Math.max(
      leftEl.getBoundingClientRect().height,
      rightEl.getBoundingClientRect().height
    );
    availW = stage.width - 12;
    availH = stage.height - hudH - gap - meterH - 4;
  } else {
    availW = stage.width - sideWidth(leftEl) - sideWidth(rightEl) - gap * 2 - 16;
    availH = stage.height - meterH - (landscapeQuery.matches ? 2 : 8);
  }

  availW = Math.max(100, availW);
  availH = Math.max(180, availH);

  let h = Math.min(availH, availW * (VISIBLE_ROWS / COLS));
  let w = h * (COLS / VISIBLE_ROWS);
  if (w > availW) { w = availW; h = w * (VISIBLE_ROWS / COLS); }

  // セルを整数にすると格子がにじまない
  const cell = Math.max(6, Math.floor(w / COLS));
  w = cell * COLS;
  h = cell * VISIBLE_ROWS;

  document.documentElement.style.setProperty('--board-w', `${w}px`);
  document.documentElement.style.setProperty('--board-h', `${h}px`);
  renderer.resize();
  drawSidePanels(true);
}

let layoutRaf = 0;
function scheduleLayout() {
  cancelAnimationFrame(layoutRaf);
  layoutRaf = requestAnimationFrame(layout);
}

window.addEventListener('resize', scheduleLayout);
window.addEventListener('orientationchange', () => setTimeout(scheduleLayout, 260));
if (window.visualViewport) window.visualViewport.addEventListener('resize', scheduleLayout);

// --- HOLD / NEXT の描画 --------------------------------------------------------

function drawSidePanels(force = false) {
  if (!game) return;
  const fever = game.feverActive;
  const holdKey = `${game.hold}|${game.holdUsed}|${fever}`;
  if (force || holdKey !== lastHold) {
    Renderer.drawMini(el.hold, game.hold, {
      dim: game.holdUsed, quality: settings.quality, fever,
    });
    lastHold = holdKey;
  }
  const nextKey = game.nextQueue.slice(0, nextCanvases.length).join(',') + `|${fever}`;
  if (force || nextKey !== lastNextKey) {
    nextCanvases.forEach((c, i) => {
      Renderer.drawMini(c, game.nextQueue[i], { quality: settings.quality, fever });
    });
    lastNextKey = nextKey;
  }
}

// --- エンジンイベント → 演出 ----------------------------------------------------

/** 盤面セルの中心座標（キャンバスバッファpx）。 */
function cellCenter(x, y) {
  return {
    px: renderer.cellX(x) + renderer.cell / 2,
    py: renderer.cellY(y) + renderer.cell / 2,
  };
}

function shakeIf(amount) {
  if (settings.shake) effects.addShake(amount);
}

function handleEvent(type, data) {
  switch (type) {
    case 'move':
      if (performance.now() - moveSoundThrottle > 18) {
        audio.sfxMove();
        moveSoundThrottle = performance.now();
      }
      break;

    case 'rotate': {
      audio.sfxRotate();
      if (game.piece) {
        const { px, py } = cellCenter(game.piece.x + 1.5, game.piece.y + 1.5);
        effects.burst(px, py, PIECE_COLORS[game.piece.type].glow, {
          count: 5, speedMin: 0.05, speedMax: 0.2, life: 260, size: 2.5, kind: 'spark', gravity: 0,
        });
      }
      break;
    }

    case 'rotateFail':
      audio.sfxRotateFail();
      break;

    case 'hold':
      audio.sfxHold();
      effects.pulseZoom(0.012);
      break;

    case 'softdrop':
      audio.sfxSoftDrop();
      break;

    case 'harddrop': {
      const p = game.piece;
      if (p) {
        const cells = game.cellsOf(p);
        const minX = Math.min(...cells.map((c) => c.x));
        const maxX = Math.max(...cells.map((c) => c.x));
        const color = PIECE_COLORS[p.type].glow;
        // 落下軌跡のビーム
        for (let x = minX; x <= maxX; x++) {
          const top = renderer.cellY(p.y - data.distance);
          const bottom = renderer.cellY(p.y + 2);
          effects.addBeam(renderer.cellX(x) + renderer.cell / 2, top, bottom, renderer.cell * 0.7, color);
        }
      }
      audio.sfxHardDrop(data.distance);
      shakeIf(2.5 + Math.min(data.distance, 20) * 0.42);
      effects.addChroma(2);
      vibrate(Math.min(26, 6 + data.distance));
      break;
    }

    case 'lock': {
      audio.sfxLock();
      const color = PIECE_COLORS[data.type].base;
      // 着地の粉塵：最下段のセルだけ
      const bottoms = new Map();
      for (const c of data.cells) {
        if (!bottoms.has(c.x) || c.y > bottoms.get(c.x)) bottoms.set(c.x, c.y);
      }
      for (const [x, y] of bottoms) {
        const { px, py } = cellCenter(x, y + 0.5);
        effects.burst(px, py, color, {
          count: data.hardDrop ? 8 : 4,
          angle: -Math.PI / 2, spread: 1.15,
          speedMin: 0.04, speedMax: data.hardDrop ? 0.34 : 0.16,
          life: 420, size: 3, gravity: 0.0022,
        });
      }
      if (data.hardDrop) {
        const { px, py } = cellCenter(
          data.cells.reduce((a, c) => a + c.x, 0) / data.cells.length,
          Math.max(...data.cells.map((c) => c.y))
        );
        effects.addWave(px, py + renderer.cell / 2, {
          color: PIECE_COLORS[data.type].glow, vr: 0.9, life: 380, width: 5, squash: 0.35,
        });
      }
      break;
    }

    case 'clearStart':
      onClearStart(data);
      break;

    case 'levelup': {
      audio.sfxLevelUp();
      popText(`LEVEL ${data.level}`, 'スピードアップ！', 3, 88);
      effects.addFlash(0.22, '#7fd8ff');
      shakeIf(6);
      effects.pulseZoom(0.03);
      vibrate([0, 30, 40, 30]);
      bump(el.level);
      break;
    }

    case 'bonus':
      popText(data.label, `+${data.score.toLocaleString()}`, data.tier, 42);
      audio.sfxClear(1, game.combo, true);
      shakeIf(5);
      break;

    case 'feverStart':
      onFeverStart();
      break;

    case 'feverEnd':
      document.body.classList.remove('is-fever');
      el.feverMeter.classList.remove('is-fever');
      audio.setIntensity(game.level, false);
      break;

    case 'gameover':
      onGameOver(data);
      break;

    case 'spawn':
      drawSidePanels();
      break;
  }
}

function bump(node) {
  node.classList.remove('is-bump');
  void node.offsetWidth;
  node.classList.add('is-bump');
}

/** ライン消去の瞬間の大盛り演出。 */
function onClearStart(info) {
  const { count, label, tier, score, combo, b2b, tspin, perfect } = info;

  // 消える行のセルを爆散させる
  const rowsPx = [];
  for (const y of info.rows) {
    const py = renderer.cellY(y);
    rowsPx.push(py);
    effects.addRowFlash(py, renderer.cell, renderer.cell * COLS,
      tspin ? 'rgba(224,163,255,0.95)' : count === 4 ? 'rgba(255,220,35,0.95)' : 'rgba(255,255,255,0.9)');

    for (let x = 0; x < COLS; x++) {
      const v = game.board[y][x];
      const colors = PIECE_COLORS[v] || PIECE_COLORS.G;
      const { px, py: cy } = cellCenter(x, y);
      effects.burst(px, cy, colors.glow, {
        count: 4 + count * 2,
        speedMin: 0.06, speedMax: 0.16 + count * 0.09,
        life: 520 + count * 90,
        size: renderer.cell * 0.14,
        gravity: 0.0018,
      });
    }
  }

  const midY = rowsPx.reduce((a, b) => a + b, 0) / rowsPx.length;
  effects.addWave(renderer.cellX(COLS / 2), midY + renderer.cell / 2, {
    color: count === 4 ? '#ffdc23' : '#8fe8ff',
    vr: 1.1 + count * 0.25, life: 460 + count * 60, width: 3 + count * 1.6, squash: 0.45,
  });

  // 揺れ・光・寄り：段数と難易度で強度を変える
  const power = count + (tspin ? 2 : 0) + (perfect ? 4 : 0) + Math.min(combo, 8) * 0.4;
  shakeIf(3 + power * 2.1);
  effects.addFlash(0.06 + power * 0.035, tspin ? '#e5c2ff' : '#ffffff');
  effects.pulseZoom(0.012 + power * 0.006);
  effects.addChroma(power);

  // テキスト
  const yPct = ((midY - renderer.originY) / (renderer.cell * VISIBLE_ROWS)) * 100;
  const bigTier = perfect ? 5 : tier;
  popText(label, `+${score.toLocaleString()}`, bigTier, Math.max(12, Math.min(78, yPct)));

  if (perfect) {
    popText('PERFECT CLEAR!!', 'かんぺき！', 5, 22);
    effects.confetti(renderer.cellX(COLS / 2), renderer.originY + renderer.cell * 3,
      renderer.cell * COLS, 110);
    effects.addFlash(0.55, '#ffffff');
    shakeIf(22);
    audio.sfxPerfect();
    vibrate([0, 40, 60, 40, 60, 90]);
  } else if (count === 4) {
    effects.confetti(renderer.cellX(COLS / 2), midY, renderer.cell * COLS, 46);
    vibrate([0, 26, 40, 40]);
  } else {
    vibrate(count * 9);
  }

  // B2B は右上のバッジで表現する（テキストを重ねると読めなくなる）
  if (b2b > 0) {
    el.b2bCount.textContent = `×${b2b + 1}`;
    el.b2b.classList.add('is-on');
  } else if (!(count === 4 || tspin)) {
    el.b2b.classList.remove('is-on');
  }

  // コンボ表示
  if (combo > 0) {
    el.comboCount.textContent = combo + 1;
    el.combo.classList.remove('is-on');
    void el.combo.offsetWidth;
    el.combo.classList.add('is-on');
    clearTimeout(onClearStart._comboT);
    onClearStart._comboT = setTimeout(() => el.combo.classList.remove('is-on'), 1100);
    audio.sfxCombo(combo);
    el.comboCheer.textContent = CHEERS[Math.min(combo, CHEERS.length - 1)];
  } else {
    el.combo.classList.remove('is-on');
  }

  audio.sfxClear(count, combo, tspin);
  bump(el.score);
}

/** コンボ数に応じた煽り文句。 */
const CHEERS = [
  '', 'いいね！', 'ナイス！', 'ノッてきた！', '止まらない！',
  'すごい！', 'ヤバい！', '無双！', '神！！', '神！！！', 'ドパドパ！！！',
];

function onFeverStart() {
  document.body.classList.add('is-fever');
  el.feverMeter.classList.add('is-fever');
  el.feverBanner.classList.remove('is-on');
  void el.feverBanner.offsetWidth;
  el.feverBanner.classList.add('is-on');
  setTimeout(() => el.feverBanner.classList.remove('is-on'), 1500);

  effects.addFlash(0.7, '#ffffff');
  shakeIf(26);
  effects.pulseZoom(0.09);
  effects.confetti(renderer.cellX(COLS / 2), renderer.originY + renderer.cell,
    renderer.cell * COLS, 140);
  for (let i = 0; i < 5; i++) {
    setTimeout(() => {
      effects.addWave(renderer.cellX(COLS / 2), renderer.originY + renderer.cell * 10, {
        color: `hsl(${i * 70}, 100%, 65%)`, vr: 1.4, life: 700, width: 6, squash: 0.6,
      });
    }, i * 90);
  }
  popText('スコア2倍！', '', 4, 70);
  audio.sfxFever();
  audio.setIntensity(game.level, true);
  vibrate([0, 60, 50, 60, 50, 120]);
}

function onGameOver(data) {
  running = false;
  audio.stopMusic();
  audio.sfxGameOver();
  document.body.classList.remove('is-fever', 'is-danger');
  shakeIf(24);
  effects.addFlash(0.5, '#ff3465');
  vibrate([0, 80, 60, 80, 60, 200]);

  const isBest = store.recordGame(data.score, data.lines);
  el.finalScore.textContent = data.score.toLocaleString();
  el.recordBadge.classList.toggle('is-on', isBest);

  const pps = game.pieceCount / Math.max(data.time / 1000, 0.001);
  const cells = [
    ['LINES', data.lines],
    ['LEVEL', data.level],
    ['TIME', formatTime(data.time)],
    ['MAX COMBO', data.maxCombo > 0 ? data.maxCombo + 1 : 0],
    ['TETRIS', data.stats.tetris],
    ['T-SPIN', data.stats.tspin],
    ['PERFECT', data.stats.pc],
    ['PIECES', game.pieceCount],
    ['PPS', pps.toFixed(2)],
  ];
  el.resultGrid.innerHTML = cells
    .map(([k, v]) => `<div class="result-cell"><b>${v}</b><span>${k}</span></div>`)
    .join('');

  el.rankValue.textContent = rankOf(data.score);
  el.best.textContent = store.data.best.toLocaleString();
  el.titleBest.textContent = store.data.best.toLocaleString();

  // 全部消えた後に結果を出したいので少し待つ
  setTimeout(() => showScreen('overScreen'), 700);

  if (isBest) {
    setTimeout(() => {
      effects.confetti(renderer.cellX(COLS / 2), renderer.originY, renderer.cell * COLS, 160);
    }, 750);
  }
}

function rankOf(score) {
  if (score >= 300000) return 'SSS';
  if (score >= 150000) return 'SS';
  if (score >= 80000) return 'S';
  if (score >= 40000) return 'A';
  if (score >= 18000) return 'B';
  if (score >= 6000) return 'C';
  return 'D';
}

// --- ゲームループ ---------------------------------------------------------------

let dangerOn = false;

function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(now - lastTime, 100);   // タブ復帰時の巨大 dt を抑える
  lastTime = now;
  if (!game) return;

  if (countdown > 0) {
    countdown -= dt;
  } else if (running) {
    input.update(dt);
    game.update(dt);
  }

  effects.update(dt);

  const danger = game.stackDanger();
  const wantDanger = running && danger > 0.45;
  if (wantDanger !== dangerOn) {
    dangerOn = wantDanger;
    document.body.classList.toggle('is-danger', dangerOn);
    if (dangerOn) audio.sfxDanger();
  }

  renderer.render(game, dt, {
    danger: running ? danger : 0,
    ghost: settings.ghost,
  });

  updateHud(dt);
}

function updateHud(dt) {
  // スコアはカウントアップさせて気持ちよく
  if (displayScore !== game.score) {
    const diff = game.score - displayScore;
    const step = Math.max(1, Math.ceil(Math.abs(diff) * 0.24));
    displayScore += diff > 0 ? Math.min(step, diff) : diff;
    el.score.textContent = Math.round(displayScore).toLocaleString();
  }
  el.level.textContent = game.level;
  el.lines.textContent = game.lines;
  el.time.textContent = formatTime(game.elapsed);
  const pps = game.pieceCount / Math.max(game.elapsed / 1000, 0.5);
  el.pps.textContent = pps.toFixed(2);

  const pct = (game.fever / CONFIG.FEVER_MAX) * 100;
  el.feverFill.style.width = `${pct}%`;
  el.feverMeter.classList.toggle('is-full', pct >= 99 && !game.feverActive);

  drawSidePanels();
}

// --- 操作の橋渡し ---------------------------------------------------------------

const actions = {
  move: (dx) => (running && countdown <= 0 ? game.move(dx) : false),
  rotate: (dir) => {
    if (!running || countdown > 0) return false;
    return game.rotate(dir === 2 ? 2 : dir);
  },
  softDrop: () => (running && countdown <= 0 ? game.softDrop() : false),
  setSoftDrop: () => {},
  hardDrop: () => (running && countdown <= 0 ? game.hardDrop() : false),
  hold: () => (running && countdown <= 0 ? game.holdPiece() : false),
  pause: () => togglePause(),
  restart: () => { if (game.state !== 'ready') startGame(); },
};

function togglePause() {
  if (!game || game.state === 'over' || game.state === 'ready') return;
  if (game.state === 'paused') {
    game.togglePause();
    running = true;
    hideScreens();
    if (settings.music) audio.startMusic();
  } else {
    game.togglePause();
    running = false;
    audio.stopMusic();
    showScreen('pauseScreen');
  }
}

// --- ゲーム開始 -----------------------------------------------------------------

function startGame() {
  hideScreens();
  audio.init();
  effects.reset();
  document.body.classList.remove('is-fever', 'is-danger');
  el.b2b.classList.remove('is-on');
  el.combo.classList.remove('is-on');
  el.overlay.querySelectorAll('.pop').forEach((n) => n.remove());

  game.reset();
  game.level = startLevel;
  game.state = 'ready';
  displayScore = 0;
  el.score.textContent = '0';
  dangerOn = false;
  lastNextKey = '';
  lastHold = null;
  drawSidePanels(true);

  audio.setIntensity(startLevel, false);
  audio.sfxStart();

  // READY? → GO!
  countdown = 1250;
  running = false;
  showCue('READY?');
  setTimeout(() => showCue('GO!'), 700);
  setTimeout(() => {
    game.state = 'playing';
    game.spawnPiece();
    running = true;
    countdown = 0;
    if (settings.music) audio.startMusic();
  }, 1250);
}

function showCue(text) {
  el.readyGo.textContent = text;
  el.readyGo.classList.remove('is-on');
  void el.readyGo.offsetWidth;
  el.readyGo.classList.add('is-on');
}

function quitToTitle() {
  running = false;
  audio.stopMusic();
  game.state = 'ready';
  game.reset();
  displayScore = 0;
  el.score.textContent = '0';
  document.body.classList.remove('is-fever', 'is-danger');
  el.titleBest.textContent = store.data.best.toLocaleString();
  showScreen('titleScreen');
}

// --- 設定 UI ---------------------------------------------------------------------

function applySettings() {
  audio.setMusic(settings.music);
  audio.setSfx(settings.sfx);
  effects.setQuality(settings.quality);
  renderer.setQuality(settings.quality);
  if (input) {
    input.settings.das = settings.das;
    input.settings.arr = settings.arr;
    input.settings.swipeSensitivity = settings.swipe;
  }
  $('musicBtn').setAttribute('aria-pressed', String(settings.music));
  $('sfxBtn').setAttribute('aria-pressed', String(settings.sfx));
  renderer.resize();
}

function bindSettingsUI() {
  const toggles = [
    ['setMusic', 'music'],
    ['setSfx', 'sfx'],
    ['setVibe', 'vibrate'],
    ['setGhost', 'ghost'],
    ['setShake', 'shake'],
  ];
  for (const [id, key] of toggles) {
    const node = $(id);
    node.checked = settings[key];
    node.addEventListener('change', () => {
      store.setSetting(key, node.checked);
      applySettings();
      if (key === 'music') {
        audio.init();
        if (node.checked && running) audio.startMusic();
        else audio.stopMusic();
      }
      if (key === 'vibrate' && node.checked) vibrate(20);
    });
  }

  const quality = $('setQuality');
  quality.value = settings.quality;
  quality.addEventListener('change', () => {
    store.setSetting('quality', quality.value);
    applySettings();
    layout();
  });

  const ranges = [
    ['setDas', 'das', 'dasLabel', (v) => `${v}ms`],
    ['setArr', 'arr', 'arrLabel', (v) => `${v}ms`],
    ['setSwipe', 'swipe', 'swipeLabel', (v) => Number(v).toFixed(1)],
  ];
  for (const [id, key, labelId, fmt] of ranges) {
    const node = $(id);
    node.value = settings[key];
    $(labelId).textContent = fmt(settings[key]);
    node.addEventListener('input', () => {
      const v = key === 'swipe' ? parseFloat(node.value) : parseInt(node.value, 10);
      store.setSetting(key, v);
      $(labelId).textContent = fmt(v);
      applySettings();
    });
  }

  $('resetBestBtn').addEventListener('click', () => {
    store.clearBest();
    el.best.textContent = '0';
    el.titleBest.textContent = '0';
    toast('ハイスコアを消しました');
  });
}

function bindUI() {
  $('startBtn').addEventListener('click', () => { audio.init(); startGame(); });
  $('retryBtn').addEventListener('click', startGame);
  $('resumeBtn').addEventListener('click', togglePause);
  $('restartBtn').addEventListener('click', startGame);
  $('quitBtn').addEventListener('click', quitToTitle);
  $('toTitleBtn').addEventListener('click', quitToTitle);
  $('pauseBtn').addEventListener('click', togglePause);
  $('howtoBtn').addEventListener('click', () => showScreen('howtoScreen'));
  $('settingsBtn').addEventListener('click', () => showScreen('settingsScreen'));

  for (const btn of document.querySelectorAll('[data-close-screen]')) {
    btn.addEventListener('click', () => {
      const back = game && game.state === 'paused' ? 'pauseScreen' : 'titleScreen';
      showScreen(back);
    });
  }

  $('musicBtn').addEventListener('click', () => {
    audio.init();
    const on = !settings.music;
    store.setSetting('music', on);
    $('setMusic').checked = on;
    applySettings();
    if (on && running) audio.startMusic(); else audio.stopMusic();
    toast(on ? 'BGM ON' : 'BGM OFF', 900);
  });

  $('sfxBtn').addEventListener('click', () => {
    audio.init();
    const on = !settings.sfx;
    store.setSetting('sfx', on);
    $('setSfx').checked = on;
    applySettings();
    toast(on ? '効果音 ON' : '効果音 OFF', 900);
  });

  // スタートレベル
  const setLevel = (v) => {
    startLevel = Math.max(1, Math.min(15, v));
    el.lvlValue.textContent = startLevel;
    store.setSetting('startLevel', startLevel);
  };
  $('lvlUp').addEventListener('click', () => setLevel(startLevel + 1));
  $('lvlDown').addEventListener('click', () => setLevel(startLevel - 1));
  setLevel(startLevel);

  $('shareBtn').addEventListener('click', async () => {
    const text = `TETRISH で ${el.finalScore.textContent} 点！`
      + ` (RANK ${el.rankValue.textContent} / LV ${game.level} / ${game.lines} LINES)`;
    try {
      if (navigator.share) {
        await navigator.share({ text, title: 'TETRISH' });
      } else {
        await navigator.clipboard.writeText(text);
        toast('結果をコピーしました');
      }
    } catch (e) {
      toast('コピーできませんでした');
    }
  });

  // ページを離れたら自動ポーズ
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && running) togglePause();
  });

  // ダブルタップでの拡大を抑止
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('dblclick', (e) => e.preventDefault());
}

// --- 起動 ------------------------------------------------------------------------

function init() {
  game = new Game({ emit: handleEvent });
  input = new InputManager(actions, {
    das: settings.das, arr: settings.arr, swipeSensitivity: settings.swipe,
  });
  input.attach({
    boardEl: el.boardWrap,
    touchEl: el.touchLayer,
    buttonsRoot: document.body,
    getCellSize: () => renderer.cell / renderer.dpr,
  });

  bindUI();
  bindSettingsUI();
  applySettings();

  el.best.textContent = store.data.best.toLocaleString();
  el.titleBest.textContent = store.data.best.toLocaleString();

  const coarse = window.matchMedia('(pointer: coarse)').matches;
  el.deviceHint.textContent = coarse
    ? '左右ドラッグで移動 / 下フリックで一気落とし / タップで回転'
    : '←→ 移動・Space 一気落とし・↑ 回転・C ホールド';

  // デバッグ／自動テスト用のフック
  window.__tetrish = { game, effects, renderer, audio, input, store, startGame, actions };

  layout();
  drawSidePanels(true);
  showScreen('titleScreen');
  lastTime = performance.now();
  requestAnimationFrame(loop);

  // Service Worker（オフラインでも遊べるように）
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => { /* 失敗しても遊べる */ });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
