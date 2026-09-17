/**
 * テトリス風ゲームのコアエンジン。描画・入力・音には一切依存しない。
 * 演出レイヤーへは emit() 経由のイベントで通知する。
 */
import { PIECE_TYPES, SHAPES, SPAWN, getKicks } from './pieces.js';

export const COLS = 10;
export const VISIBLE_ROWS = 20;
export const HIDDEN_ROWS = 20;          // 盤面上部の見えないバッファ
export const ROWS = VISIBLE_ROWS + HIDDEN_ROWS;

const LOCK_DELAY = 500;                 // ms
const MAX_LOCK_RESETS = 15;
const CLEAR_DELAY = 280;                // ライン消去演出の長さ(ms)
const SPAWN_DELAY = 70;                 // ARE(ms)
const CHANCE_MAX = 100;                 // 抽選ゲージ満タン値

/**
 * ボーナスの種別。パチスロにならい、継続は時間ではなく「残りゲーム数(G)」で管理する。
 * 1G = ミノ1個。ライン消しで上乗せされる。
 */
const BONUS_TYPES = {
  reg: { label: 'REGULAR BONUS', short: 'REG', games: 12, mult: 2, rank: 1 },
  big: { label: 'BIG BONUS', short: 'BIG', games: 30, mult: 3, rank: 2 },
  premium: { label: 'PREMIUM BONUS', short: 'PREMIUM', games: 60, mult: 5, rank: 3 },
};

/**
 * 上乗せG数。シングルでは乗らない。
 * シングルでも乗せると「消化1G < 上乗せ」になってボーナスが永久に終わらない。
 */
const UWANOSE = [0, 0, 3, 8, 25];

/** 上乗せの上限。青天井にすると倍率が破綻する。 */
const MAX_BONUS_GAMES = 999;

/** レベルごとの落下速度(1マスあたりのms)。ガイドライン準拠の式。 */
function gravityMs(level) {
  const lv = Math.min(level, 20);
  const sec = Math.pow(0.8 - (lv - 1) * 0.007, lv - 1);
  return Math.max(sec * 1000, 16.67);
}

/** 消去ライン数ごとの基本得点。 */
const LINE_SCORE = [0, 100, 300, 500, 800];
const TSPIN_SCORE = [400, 800, 1200, 1600];
const TSPIN_MINI_SCORE = [100, 200, 400, 400];
const PERFECT_CLEAR_SCORE = [0, 800, 1200, 1800, 2000];

/** 空の盤面を作る。0 は空、文字列はピース種。 */
function createBoard() {
  const board = [];
  for (let y = 0; y < ROWS; y++) board.push(new Array(COLS).fill(0));
  return board;
}

export class Game {
  constructor(options = {}) {
    this.emit = options.emit || (() => {});
    this.reset();
  }

  reset() {
    this.board = createBoard();
    this.bag = [];
    this.nextQueue = [];
    for (let i = 0; i < 6; i++) this.nextQueue.push(this.pullFromBag());

    this.piece = null;
    this.hold = null;
    this.holdUsed = false;

    this.score = 0;
    this.lines = 0;
    this.level = 1;
    this.combo = -1;
    this.backToBack = 0;
    this.maxCombo = 0;
    this.pieceCount = 0;
    this.elapsed = 0;

    this.chance = 0;              // 抽選ゲージ 0..CHANCE_MAX
    this.chanceLocked = false;    // ボーナス確定〜演出中はゲージを止める
    this.bonus = null;            // { kind, games, gamesMax, mult, gained, label }
    this.bonusCount = 0;
    this.pendingKind = null;      // 抽選結果（演出が終わるまで保持）

    this.state = 'ready';         // ready | playing | clearing | spawning | paused | over
    this.gravityTimer = 0;
    this.lockTimer = 0;
    this.lockResets = 0;
    this.grounded = false;
    this.phaseTimer = 0;
    this.clearingRows = [];
    this.pendingClear = null;
    this.lastAction = null;       // 'rotate' などT-Spin判定用
    this.lastKickIndex = 0;
    this.softDropping = false;
    this.stats = { single: 0, double: 0, triple: 0, tetris: 0, tspin: 0, pc: 0 };
  }

  start() {
    this.reset();
    this.state = 'playing';
    this.spawnPiece();
    this.emit('start', {});
  }

  // --- 7bag ランダマイザ ---------------------------------------------------

  pullFromBag() {
    if (this.bag.length === 0) {
      this.bag = PIECE_TYPES.slice();
      for (let i = this.bag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
      }
    }
    return this.bag.pop();
  }

  // --- ピース生成と衝突判定 -------------------------------------------------

  makePiece(type) {
    const spawn = SPAWN[type];
    return {
      type,
      rotation: 0,
      x: spawn.x,
      // 出現直後から見えていたほうが遊びやすいので可視領域の最上段に置く
      y: spawn.y + HIDDEN_ROWS,
    };
  }

  cellsOf(piece, rotation = piece.rotation, x = piece.x, y = piece.y) {
    return SHAPES[piece.type][rotation].map((c) => ({ x: c.x + x, y: c.y + y }));
  }

  collides(piece, rotation = piece.rotation, x = piece.x, y = piece.y) {
    for (const c of SHAPES[piece.type][rotation]) {
      const cx = c.x + x;
      const cy = c.y + y;
      if (cx < 0 || cx >= COLS || cy >= ROWS) return true;
      if (cy < 0) continue;
      if (this.board[cy][cx]) return true;
    }
    return false;
  }

  spawnPiece(type) {
    const next = type || this.nextQueue.shift();
    if (!type) this.nextQueue.push(this.pullFromBag());
    const piece = this.makePiece(next);

    // 出現位置が埋まっていればゲームオーバー（ブロックアウト）
    if (this.collides(piece)) {
      this.piece = piece;
      this.gameOver();
      return;
    }
    // 1マス上に余裕があれば持ち上げない標準的な挙動
    this.piece = piece;
    this.gravityTimer = 0;
    this.lockTimer = 0;
    this.lockResets = 0;
    this.grounded = false;
    this.lastAction = 'spawn';
    this.pieceCount++;
    this.emit('spawn', { type: next });
  }

  // --- 操作 ----------------------------------------------------------------

  canPlay() {
    return this.state === 'playing' && this.piece;
  }

  move(dx) {
    if (!this.canPlay()) return false;
    if (this.collides(this.piece, this.piece.rotation, this.piece.x + dx, this.piece.y)) return false;
    this.piece.x += dx;
    this.lastAction = 'move';
    this.onPieceMoved();
    this.emit('move', { dx });
    return true;
  }

  rotate(dir) {
    if (!this.canPlay()) return false;
    const from = this.piece.rotation;
    const to = (from + dir + 4) % 4;
    if (from === to) return false;
    const kicks = getKicks(this.piece.type, from, to);
    for (let i = 0; i < kicks.length; i++) {
      const [dx, dy] = kicks[i];
      const nx = this.piece.x + dx;
      const ny = this.piece.y + dy;
      if (!this.collides(this.piece, to, nx, ny)) {
        this.piece.rotation = to;
        this.piece.x = nx;
        this.piece.y = ny;
        this.lastAction = 'rotate';
        this.lastKickIndex = i;
        this.onPieceMoved();
        this.emit('rotate', { dir, kick: i });
        return true;
      }
    }
    this.emit('rotateFail', {});
    return false;
  }

  /** 移動・回転が成功したときのロックディレイ再セット。 */
  onPieceMoved() {
    if (this.isGrounded()) {
      if (this.lockResets < MAX_LOCK_RESETS) {
        this.lockTimer = 0;
        this.lockResets++;
      }
      this.grounded = true;
    } else {
      this.grounded = false;
      this.lockTimer = 0;
    }
  }

  isGrounded() {
    return this.collides(this.piece, this.piece.rotation, this.piece.x, this.piece.y + 1);
  }

  softDrop() {
    if (!this.canPlay()) return false;
    if (this.collides(this.piece, this.piece.rotation, this.piece.x, this.piece.y + 1)) {
      return false;
    }
    this.piece.y++;
    this.score += 1;
    this.lastAction = 'move';
    this.gravityTimer = 0;
    this.emit('softdrop', {});
    return true;
  }

  hardDrop() {
    if (!this.canPlay()) return false;
    const startY = this.piece.y;
    while (!this.collides(this.piece, this.piece.rotation, this.piece.x, this.piece.y + 1)) {
      this.piece.y++;
    }
    const dist = this.piece.y - startY;
    this.score += dist * 2;
    this.emit('harddrop', { distance: dist, x: this.piece.x, y: this.piece.y });
    this.lockPiece(true);
    return true;
  }

  holdPiece() {
    if (!this.canPlay() || this.holdUsed) return false;
    const current = this.piece.type;
    const swap = this.hold;
    this.hold = current;
    this.holdUsed = true;
    if (swap) {
      const piece = this.makePiece(swap);
      if (this.collides(piece)) {
        this.piece = piece;
        this.gameOver();
        return true;
      }
      this.piece = piece;
      this.gravityTimer = 0;
      this.lockTimer = 0;
      this.lockResets = 0;
      this.lastAction = 'spawn';
    } else {
      this.spawnPiece();
    }
    this.emit('hold', { type: current });
    return true;
  }

  // --- ゴースト -------------------------------------------------------------

  ghostY() {
    if (!this.piece) return 0;
    let y = this.piece.y;
    while (!this.collides(this.piece, this.piece.rotation, this.piece.x, y + 1)) y++;
    return y;
  }

  // --- T-Spin 判定 ----------------------------------------------------------

  /** 直前の動作が回転で、Tピースの3隅が埋まっていれば T-Spin。 */
  detectTSpin() {
    if (this.piece.type !== 'T' || this.lastAction !== 'rotate') {
      return { tspin: false, mini: false };
    }
    // Tの中心はマトリクス(1,1)
    const cx = this.piece.x + 1;
    const cy = this.piece.y + 1;
    const corners = [
      { x: cx - 1, y: cy - 1 }, // 左上
      { x: cx + 1, y: cy - 1 }, // 右上
      { x: cx - 1, y: cy + 1 }, // 左下
      { x: cx + 1, y: cy + 1 }, // 右下
    ];
    const filled = corners.map((c) => this.isBlocked(c.x, c.y));
    const count = filled.filter(Boolean).length;
    if (count < 3) return { tspin: false, mini: false };

    // 回転状態ごとの「正面2隅」のインデックス
    const FRONT = { 0: [0, 1], 1: [1, 3], 2: [2, 3], 3: [0, 2] };
    const [a, b] = FRONT[this.piece.rotation];
    const frontFilled = filled[a] && filled[b];
    // 5番目のキック(インデックス4)を使った場合はミニ扱いしない
    const mini = !frontFilled && this.lastKickIndex !== 4;
    return { tspin: true, mini };
  }

  isBlocked(x, y) {
    if (x < 0 || x >= COLS || y >= ROWS) return true;
    if (y < 0) return false;
    return !!this.board[y][x];
  }

  // --- 固定とライン消去 -----------------------------------------------------

  lockPiece(fromHardDrop = false) {
    const cells = this.cellsOf(this.piece);
    const spin = this.detectTSpin();

    let lockedOut = true;
    for (const c of cells) {
      if (c.y >= 0) {
        this.board[c.y][c.x] = this.piece.type;
        if (c.y >= HIDDEN_ROWS) lockedOut = false;
      }
    }

    const cleared = [];
    for (let y = 0; y < ROWS; y++) {
      if (this.board[y].every((v) => v !== 0)) cleared.push(y);
    }

    this.emit('lock', {
      cells,
      type: this.piece.type,
      hardDrop: fromHardDrop,
      lines: cleared.length,
    });

    // 可視領域に一切乗らなかった＝ロックアウト
    if (lockedOut && cleared.length === 0) {
      this.piece = null;
      this.gameOver();
      return;
    }

    this.piece = null;
    this.holdUsed = false;

    if (cleared.length > 0) {
      this.pendingClear = this.evaluateClear(cleared, spin);
      this.consumeBonusGame();   // 評価してから1G消化する
      this.clearingRows = cleared;
      this.state = 'clearing';
      this.phaseTimer = CLEAR_DELAY;
      // 演出は消える瞬間に出したいので、詰める前に通知する
      this.emit('clearStart', this.pendingClear);
    } else {
      if (spin.tspin) {
        // ライン無しT-Spinもボーナス
        const gain = this.applyScore(spin.mini ? 100 : 400);
        this.emit('bonus', {
          label: spin.mini ? 'T-SPIN MINI' : 'T-SPIN',
          score: gain,
          tier: 3,
        });
        this.addChance(spin.mini ? 4 : 10);
        this.stats.tspin++;
      } else {
        this.combo = -1;
      }
      this.consumeBonusGame();
      this.state = 'spawning';
      this.phaseTimer = SPAWN_DELAY;
    }
  }

  /** 消去内容から得点・コンボ・B2Bを計算し、演出用の情報を返す。 */
  evaluateClear(cleared, spin) {
    const n = cleared.length;
    this.combo++;
    this.maxCombo = Math.max(this.maxCombo, this.combo);

    const isDifficult = n === 4 || spin.tspin;
    const b2bActive = isDifficult && this.backToBack > 0;

    let base;
    let label;
    let tier;
    if (spin.tspin && spin.mini) {
      base = TSPIN_MINI_SCORE[n];
      label = `T-SPIN MINI ${['', 'SINGLE', 'DOUBLE', 'TRIPLE'][n] || ''}`.trim();
      tier = 3;
    } else if (spin.tspin) {
      base = TSPIN_SCORE[n];
      label = `T-SPIN ${['', 'SINGLE', 'DOUBLE', 'TRIPLE'][n] || ''}`.trim();
      tier = 4;
    } else {
      base = LINE_SCORE[n];
      label = ['', 'SINGLE', 'DOUBLE', 'TRIPLE', 'TETRIS'][n];
      tier = n === 4 ? 4 : n;
    }

    if (b2bActive) base = Math.floor(base * 1.5);
    if (isDifficult) this.backToBack++;
    else this.backToBack = 0;

    // パーフェクトクリア判定（消える行を除いて盤面が空か）
    const clearedSet = new Set(cleared);
    let perfect = true;
    for (let y = 0; y < ROWS && perfect; y++) {
      if (clearedSet.has(y)) continue;
      for (let x = 0; x < COLS; x++) {
        if (this.board[y][x]) { perfect = false; break; }
      }
    }
    if (perfect) base += PERFECT_CLEAR_SCORE[n];

    const comboBonus = this.combo > 0 ? 50 * this.combo : 0;
    const gain = this.applyScore(base + comboBonus);

    this.lines += n;
    if (n === 1) this.stats.single++;
    if (n === 2) this.stats.double++;
    if (n === 3) this.stats.triple++;
    if (n === 4) this.stats.tetris++;
    if (spin.tspin) this.stats.tspin++;
    if (perfect) this.stats.pc++;

    // 抽選ゲージと上乗せ
    if (this.bonus) {
      // ボーナス中はゲージではなくG数が増える（上乗せ）
      let add = UWANOSE[n] || 0;
      if (spin.tspin) add += 20;
      if (perfect) add += 100;
      if (add > 0 && this.combo >= 3) add = Math.floor(add * (1 + this.combo * 0.15));
      if (add > 0) {
        this.addBonusGames(add, spin.tspin ? 'tspin' : perfect ? 'perfect' : n === 4 ? 'tetris' : 'line');
      }
    } else {
      let gain = n * 6 + this.combo * 3;
      if (spin.tspin) gain += 14;
      if (n === 4) gain += 16;
      this.addChance(gain);
      // パーフェクトクリアはボーナス確定（虹）
      if (perfect) this.triggerLottery('premium');
      // T-Spin トリプルは BIG 以上確定
      else if (spin.tspin && n === 3) this.triggerLottery(Math.random() < 0.3 ? 'premium' : 'big');
    }

    const newLevel = Math.floor(this.lines / 10) + 1;
    let leveledUp = false;
    if (newLevel > this.level) {
      this.level = newLevel;
      leveledUp = true;
    }

    return {
      rows: cleared,
      count: n,
      label,
      tier,
      score: gain,
      combo: this.combo,
      b2b: b2bActive ? this.backToBack - 1 : 0,
      tspin: spin.tspin,
      mini: spin.mini,
      perfect,
      leveledUp,
    };
  }

  /** ボーナス倍率を掛けて加点し、実際の加算量を返す。 */
  applyScore(raw) {
    const mult = this.bonus ? this.bonus.mult : 1;
    const gain = raw * this.level * mult;
    this.score += gain;
    if (this.bonus) this.bonus.gained += gain;
    return gain;
  }

  get bonusActive() { return this.bonus !== null; }

  /**
   * 抽選ゲージを加算する。満タンになったら演出側へ通知するだけで、
   * ボーナス開始は startBonus() を呼ばれるまで待つ（リール演出を挟むため）。
   */
  addChance(amount) {
    if (this.bonus || this.chanceLocked) return;
    this.chance = Math.min(CHANCE_MAX, this.chance + amount);
    if (this.chance >= CHANCE_MAX) this.triggerLottery();
  }

  /** ゲージ満タン。内部抽選を行い、演出側に結果を渡す。 */
  triggerLottery(forced = null) {
    if (this.bonus) return;
    if (this.chanceLocked) {
      // すでに抽選済みでも、確定演出なら上位へ昇格させる
      if (forced && BONUS_TYPES[forced].rank > BONUS_TYPES[this.pendingKind].rank) {
        this.pendingKind = forced;
        this.emit('lotteryUpgrade', { kind: forced });
      }
      return;
    }
    this.chanceLocked = true;
    this.chance = CHANCE_MAX;
    this.pendingKind = forced || this.drawBonusKind();
    this.emit('lottery', { kind: this.pendingKind, forced: !!forced });
  }

  /** どのボーナスを引いたか。レベルが上がるほど上位が出やすい。 */
  drawBonusKind() {
    const lucky = Math.min(0.22, this.level * 0.012);
    const r = Math.random();
    if (r < 0.06 + lucky * 0.5) return 'premium';
    if (r < 0.42 + lucky) return 'big';
    return 'reg';
  }

  /** 演出が終わったタイミングで演出側から呼ばれる。 */
  startBonus(kind) {
    const type = BONUS_TYPES[kind] || BONUS_TYPES.reg;
    this.bonus = {
      kind,
      label: type.label,
      short: type.short,
      rank: type.rank,
      mult: type.mult,
      games: type.games,
      gamesMax: type.games,
      gained: 0,
    };
    this.bonusCount++;
    this.chance = 0;
    this.chanceLocked = false;
    this.pendingKind = null;
    this.emit('bonusStart', { ...this.bonus, count: this.bonusCount });
  }

  /** 上乗せ。ボーナス中のライン消しで残りGが増える。 */
  addBonusGames(amount, reason) {
    if (!this.bonus || amount <= 0) return 0;
    const before = this.bonus.games;
    this.bonus.games = Math.min(MAX_BONUS_GAMES, this.bonus.games + amount);
    const added = this.bonus.games - before;
    if (added <= 0) return 0;
    this.bonus.gamesMax = Math.max(this.bonus.gamesMax, this.bonus.games);
    this.emit('bonusAdd', { amount: added, reason, games: this.bonus.games });
    return added;
  }

  /** 1G消化。ミノを固定するたびに呼ぶ。 */
  consumeBonusGame() {
    if (!this.bonus) return;
    this.bonus.games--;
    this.emit('bonusGame', { games: this.bonus.games });
    if (this.bonus.games <= 0) this.endBonus();
  }

  endBonus() {
    if (!this.bonus) return;
    const result = { ...this.bonus, medals: Math.floor(this.bonus.gained / 10) };
    this.bonus = null;
    this.emit('bonusEnd', result);
  }

  /** 消去行を実際に取り除いて詰める。 */
  collapseRows(rows) {
    const set = new Set(rows);
    const kept = [];
    for (let y = 0; y < ROWS; y++) {
      if (!set.has(y)) kept.push(this.board[y]);
    }
    while (kept.length < ROWS) kept.unshift(new Array(COLS).fill(0));
    this.board = kept;
  }

  // --- 状態 -----------------------------------------------------------------

  gameOver() {
    this.state = 'over';
    this.emit('gameover', {
      score: this.score,
      lines: this.lines,
      level: this.level,
      maxCombo: this.maxCombo,
      time: this.elapsed,
      stats: this.stats,
    });
  }

  togglePause() {
    if (this.state === 'playing' || this.state === 'clearing' || this.state === 'spawning') {
      this.pausedFrom = this.state;
      this.state = 'paused';
      this.emit('pause', {});
      return true;
    }
    if (this.state === 'paused') {
      this.state = this.pausedFrom || 'playing';
      this.emit('resume', {});
      return true;
    }
    return false;
  }

  /** 積み上がりの高さ（0..1）。ピンチ演出用。 */
  stackDanger() {
    for (let y = HIDDEN_ROWS; y < ROWS; y++) {
      if (this.board[y].some((v) => v !== 0)) {
        const height = ROWS - y;
        return Math.min(1, Math.max(0, (height - 10) / 9));
      }
    }
    return 0;
  }

  // --- 毎フレーム更新 -------------------------------------------------------

  update(dt) {
    if (this.state === 'over' || this.state === 'ready' || this.state === 'paused') return;
    this.elapsed += dt;

    if (this.state === 'clearing') {
      this.phaseTimer -= dt;
      if (this.phaseTimer <= 0) {
        const info = this.pendingClear;
        this.collapseRows(this.clearingRows);
        this.clearingRows = [];
        this.pendingClear = null;
        this.emit('cleared', info);
        if (info.leveledUp) this.emit('levelup', { level: this.level });
        this.state = 'spawning';
        this.phaseTimer = SPAWN_DELAY;
      }
      return;
    }

    if (this.state === 'spawning') {
      this.phaseTimer -= dt;
      if (this.phaseTimer <= 0) {
        this.state = 'playing';
        this.spawnPiece();
      }
      return;
    }

    if (!this.piece) return;

    // 落下
    const interval = gravityMs(this.level);
    this.gravityTimer += dt;
    while (this.gravityTimer >= interval) {
      this.gravityTimer -= interval;
      if (!this.collides(this.piece, this.piece.rotation, this.piece.x, this.piece.y + 1)) {
        this.piece.y++;
        this.lastAction = 'move';
      } else {
        break;
      }
    }

    // ロックディレイ
    if (this.isGrounded()) {
      this.grounded = true;
      this.lockTimer += dt;
      if (this.lockTimer >= LOCK_DELAY) this.lockPiece(false);
    } else {
      this.grounded = false;
      this.lockTimer = 0;
    }
  }
}

export const CONFIG = { LOCK_DELAY, CLEAR_DELAY, CHANCE_MAX, BONUS_TYPES, UWANOSE };
export { gravityMs };
