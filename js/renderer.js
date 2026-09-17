/**
 * 盤面描画。Canvas2D で「ネオン＋発光」なブロックを描く。
 * 座標系はセル単位ではなく px。cell サイズはリサイズ時に再計算する。
 */
import { COLS, VISIBLE_ROWS, HIDDEN_ROWS, ROWS, CONFIG } from './game.js';
import { PIECE_COLORS, SHAPES, MATRICES } from './pieces.js';

/** #rrggbb を {r,g,b} に。 */
function hexToRgb(hex) {
  const v = parseInt(hex.slice(1), 16);
  return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
}

function rgba(hex, a) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

/** 2色を t の割合で混ぜる。ボーナス中の色被せに使う。 */
function mixHex(a, b, t) {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  const m = (p, q) => Math.round(p + (q - p) * t);
  return `rgb(${m(x.r, y.r)},${m(x.g, y.g)},${m(x.b, y.b)})`;
}

/** ボーナス種別ごとのブロック着色。REG は青寄り、BIG は金寄り。 */
const BONUS_TINT = {
  1: { hex: '#2ea8ff', amount: 0.4, edge: '#cfeeff' },
  2: { hex: '#ffb020', amount: 0.5, edge: '#fff0c8' },
};

/** 角丸矩形パス。 */
function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/**
 * ブロックのスプライトキャッシュ。
 * 毎フレーム全ブロックにグラデーションと shadowBlur をかけると重すぎるので、
 * セルサイズごとに一度だけ描いた canvas を使い回す。
 */
const SPRITES = new Map();
const FEVER_BUCKETS = 24;

function buildSprite(size, colors) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  const pad = Math.min(Math.max(1, size * 0.05), size * 0.2);
  const bw = size - pad * 2;
  const bh = size - pad * 2;
  const r = Math.max(2, size * 0.16);

  const grad = ctx.createLinearGradient(pad, pad, pad, pad + bh);
  grad.addColorStop(0, colors.glow);
  grad.addColorStop(0.45, colors.base);
  grad.addColorStop(1, colors.shade || colors.base);
  ctx.fillStyle = grad;
  roundRect(ctx, pad, pad, bw, bh, r);
  ctx.fill();

  // 上面ハイライト
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = colors.edge;
  roundRect(ctx, pad + bw * 0.14, pad + bh * 0.1, bw * 0.72, bh * 0.2, r * 0.6);
  ctx.fill();

  // 内側の縁
  ctx.globalAlpha = 0.7;
  ctx.strokeStyle = colors.edge;
  ctx.lineWidth = Math.max(1, size * 0.045);
  roundRect(ctx, pad, pad, bw, bh, r);
  ctx.stroke();

  return c;
}

/** キャッシュから（無ければ作って）スプライトを返す。 */
function getSprite(key, size, colorsFn) {
  const id = `${key}@${size}`;
  let sprite = SPRITES.get(id);
  if (!sprite) {
    sprite = buildSprite(size, colorsFn());
    SPRITES.set(id, sprite);
    // サイズ変更を繰り返しても際限なく増えないように
    if (SPRITES.size > 200) {
      for (const k of SPRITES.keys()) {
        SPRITES.delete(k);
        if (SPRITES.size <= 120) break;
      }
    }
  }
  return sprite;
}

/** フィーバー時の虹色（24段階に量子化してキャッシュを効かせる）。 */
function feverColors(bucket) {
  const h = (bucket / FEVER_BUCKETS) * 360;
  return {
    base: `hsl(${h}, 100%, 60%)`,
    glow: `hsl(${(h + 30) % 360}, 100%, 72%)`,
    shade: `hsl(${(h + 340) % 360}, 90%, 44%)`,
    edge: '#ffffff',
  };
}

export class Renderer {
  constructor(canvas, effects) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.effects = effects;
    this.cell = 24;
    this.width = 0;
    this.height = 0;
    this.dpr = 1;
    this.quality = 'high';
    this.time = 0;
  }

  setQuality(q) { this.quality = q; }

  /** CSS サイズに合わせて内部バッファを更新。 */
  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, this.quality === 'low' ? 1.25 : 2);
    const w = Math.max(1, Math.round(rect.width * dpr));
    const h = Math.max(1, Math.round(rect.height * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.dpr = dpr;
    this.width = w;
    this.height = h;
    this.cell = Math.min(w / COLS, h / VISIBLE_ROWS);
    this.originX = (w - this.cell * COLS) / 2;
    this.originY = (h - this.cell * VISIBLE_ROWS) / 2;
  }

  /** 盤面セル座標 → キャンバス px。row は絶対行(0..ROWS-1)。 */
  cellX(col) { return this.originX + col * this.cell; }
  cellY(row) { return this.originY + (row - HIDDEN_ROWS) * this.cell; }

  /** フィーバー時の虹色（枠や背景用）。 */
  feverColor(seed, alpha = 1) {
    const h = (this.time * 0.18 + seed * 26) % 360;
    return `hsla(${h}, 100%, 62%, ${alpha})`;
  }

  /** 1ブロック描画。スプライトを貼るだけなので安い。 */
  drawBlock(x, y, size, colors, opts = {}) {
    const ctx = this.ctx;
    const { alpha = 1, glow = 0, scale = 1, rank = 0, seed = 0 } = opts;
    const s = size * scale;
    if (s < 1) return;                       // 非表示サイズなら描かない

    const px = Math.round(size);
    let sprite;
    if (rank >= 3) {
      // PREMIUM は虹。セルごとに位相をずらして流れるように見せる
      const b = ((Math.floor(this.time * 0.024 + seed * 1.7) % FEVER_BUCKETS) + FEVER_BUCKETS) % FEVER_BUCKETS;
      sprite = getSprite(`p${b}`, px, () => feverColors(b));
    } else if (rank > 0) {
      const tint = BONUS_TINT[rank];
      sprite = getSprite(`${colors.base}~${rank}`, px, () => ({
        base: mixHex(colors.base, tint.hex, tint.amount),
        glow: mixHex(colors.glow, tint.hex, tint.amount * 0.6),
        shade: mixHex(colors.base, tint.hex, tint.amount + 0.15),
        edge: tint.edge,
      }));
    } else {
      sprite = getSprite(colors.base, px, () => ({
        base: colors.base,
        glow: colors.glow,
        shade: colors.base,
        edge: colors.edge,
      }));
    }

    ctx.save();
    ctx.globalAlpha = alpha;
    // 発光は操作中のピースなど数個だけに限る（全ブロックにかけると激重）
    if (glow > 0 && this.quality !== 'low') {
      ctx.shadowColor = rank >= 3 ? '#ffffff' : colors.glow;
      ctx.shadowBlur = glow * size * 0.5;
    }
    ctx.drawImage(sprite, x + (size - s) / 2, y + (size - s) / 2, s, s);
    ctx.restore();
  }

  /** ボーナス種別ごとの配色。REG=青、BIG=赤金、PREMIUM=虹。 */
  bonusTheme(game) {
    if (!game.bonus) return null;
    const t = this.time;
    switch (game.bonus.kind) {
      case 'reg':
        return {
          top: `hsl(205, 80%, ${16 + Math.sin(t * 0.006) * 5}%)`,
          bottom: 'hsl(225, 85%, 9%)',
          accent: '#35b6ff',
          stripe: 'rgba(60, 190, 255, 0.10)',
        };
      case 'big':
        return {
          top: `hsl(${12 + Math.sin(t * 0.008) * 8}, 90%, ${20 + Math.sin(t * 0.01) * 6}%)`,
          bottom: 'hsl(345, 85%, 10%)',
          accent: '#ff9d1f',
          stripe: 'rgba(255, 170, 40, 0.13)',
        };
      default:
        return {
          top: `hsl(${(t * 0.22) % 360}, 75%, 20%)`,
          bottom: `hsl(${(t * 0.22 + 120) % 360}, 75%, 11%)`,
          accent: `hsl(${(t * 0.4) % 360}, 100%, 65%)`,
          stripe: 'rgba(255, 255, 255, 0.13)',
        };
    }
  }

  /** 背景（グリッド・ネオンの霧・危険時の赤み）。 */
  drawBackground(game, opts) {
    const ctx = this.ctx;
    const { width: w, height: h, cell } = this;
    const danger = opts.danger;
    const theme = this.bonusTheme(game);
    const beat = opts.beat ?? 0;

    ctx.fillStyle = '#05060e';
    ctx.fillRect(0, 0, w, h);

    const bx = this.originX;
    const by = this.originY;
    const bw = cell * COLS;
    const bh = cell * VISIBLE_ROWS;

    // 盤面ベース
    const g = ctx.createLinearGradient(bx, by, bx, by + bh);
    if (theme) {
      g.addColorStop(0, theme.top);
      g.addColorStop(1, theme.bottom);
    } else {
      g.addColorStop(0, '#0b1024');
      g.addColorStop(1, `rgb(${8 + danger * 40}, ${10 - danger * 4}, ${24 - danger * 8})`);
    }
    ctx.fillStyle = g;
    ctx.fillRect(bx, by, bw, bh);

    // ボーナス中は斜めのストライプを流す（パチスロ液晶の定番）
    if (theme && this.quality !== 'low') {
      ctx.save();
      ctx.beginPath();
      ctx.rect(bx, by, bw, bh);
      ctx.clip();
      ctx.fillStyle = theme.stripe;
      const sw = cell * 1.1;
      const offset = (this.time * 0.12) % (sw * 2);
      for (let x = -bh; x < bw + bh; x += sw * 2) {
        ctx.beginPath();
        ctx.moveTo(bx + x + offset, by);
        ctx.lineTo(bx + x + offset + sw, by);
        ctx.lineTo(bx + x + offset + sw - bh, by + bh);
        ctx.lineTo(bx + x + offset - bh, by + bh);
        ctx.closePath();
        ctx.fill();
      }
      // ビートに合わせて盤面全体が光る
      if (beat > 0.001) {
        ctx.fillStyle = `rgba(255,255,255,${beat * 0.13})`;
        ctx.fillRect(bx, by, bw, bh);
      }
      ctx.restore();
    }

    // グリッド
    ctx.save();
    ctx.strokeStyle = theme ? 'rgba(255,255,255,0.14)' : 'rgba(120,160,255,0.09)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let c = 1; c < COLS; c++) {
      const x = Math.round(bx + c * cell) + 0.5;
      ctx.moveTo(x, by);
      ctx.lineTo(x, by + bh);
    }
    for (let r = 1; r < VISIBLE_ROWS; r++) {
      const y = Math.round(by + r * cell) + 0.5;
      ctx.moveTo(bx, y);
      ctx.lineTo(bx + bw, y);
    }
    ctx.stroke();
    ctx.restore();

    // ビートに合わせて走る光のライン
    if (this.quality !== 'low' && !theme) {
      const sweep = (this.time * 0.00035) % 1;
      const ly = by + sweep * bh;
      const lg = ctx.createLinearGradient(0, ly - cell, 0, ly + cell);
      lg.addColorStop(0, 'rgba(120,200,255,0)');
      lg.addColorStop(0.5, 'rgba(120,200,255,0.1)');
      lg.addColorStop(1, 'rgba(120,200,255,0)');
      ctx.fillStyle = lg;
      ctx.fillRect(bx, ly - cell, bw, cell * 2);
    }

    // 危険域ライン（上から4行）
    if (danger > 0.02) {
      ctx.save();
      ctx.globalAlpha = 0.15 + danger * 0.35 + Math.sin(this.time * 0.008) * 0.08 * danger;
      ctx.fillStyle = '#ff2b4d';
      ctx.fillRect(bx, by, bw, cell * 4);
      ctx.restore();
    }

    // 枠
    ctx.save();
    const edge = theme ? theme.accent : 'rgba(120,190,255,1)';
    ctx.globalAlpha = 0.22 + beat * 0.5;
    ctx.strokeStyle = edge;
    ctx.lineWidth = Math.max(5, cell * 0.3);
    ctx.strokeRect(bx - 1, by - 1, bw + 2, bh + 2);
    ctx.globalAlpha = 0.7;
    ctx.lineWidth = Math.max(2, cell * 0.08);
    ctx.strokeRect(bx - 1, by - 1, bw + 2, bh + 2);
    ctx.restore();
  }

  /** メイン描画。 */
  render(game, dt, opts = {}) {
    this.time += dt;
    const ctx = this.ctx;
    const fx = this.effects;
    const cell = this.cell;
    const danger = opts.danger ?? 0;
    const beat = opts.beat ?? 0;
    const bonusRank = game.bonus ? game.bonus.rank : 0;

    // 集中線の中心と半径を教えておく
    fx.centerX = this.originX + cell * COLS / 2;
    fx.centerY = this.originY + cell * VISIBLE_ROWS / 2;
    fx.radius = Math.hypot(cell * COLS, cell * VISIBLE_ROWS) / 2;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.drawBackground(game, { danger, beat });

    ctx.save();
    // シェイク＆ズーム＆回転
    const cx = this.width / 2;
    const cy = this.height / 2;
    ctx.translate(cx + fx.shakeX * this.dpr, cy + fx.shakeY * this.dpr);
    if (fx.shakeRot) ctx.rotate(fx.shakeRot);
    const zoom = fx.effectiveZoom;
    ctx.scale(zoom, zoom);
    ctx.translate(-cx, -cy);

    // クリップして盤面外にはみ出さないように
    ctx.save();
    ctx.beginPath();
    ctx.rect(this.originX, this.originY, cell * COLS, cell * VISIBLE_ROWS);
    ctx.clip();

    fx.drawBack(ctx);

    const clearing = new Set(game.clearingRows);
    const clearProgress = game.state === 'clearing'
      ? 1 - game.phaseTimer / CONFIG.CLEAR_DELAY
      : 0;

    // 固定ブロック
    for (let y = HIDDEN_ROWS - 1; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const v = game.board[y][x];
        if (!v) continue;
        const colors = PIECE_COLORS[v] || PIECE_COLORS.G;
        if (clearing.has(y)) {
          // 消去中は加算合成で白く光らせ、膨らみながら消す
          const t = clearProgress;
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          this.drawBlock(this.cellX(x), this.cellY(y), cell,
            { base: '#ffffff', glow: '#ffffff', edge: '#ffffff' },
            { alpha: Math.max(0, 1 - t * t * 1.15), scale: 1 + t * 0.4, glow: 1.6 });
          ctx.restore();
        } else {
          this.drawBlock(this.cellX(x), this.cellY(y), cell, colors, {
            rank: bonusRank,
            seed: x + y,
          });
        }
      }
    }

    // ゴースト＆操作中ピース
    if (game.piece && (game.state === 'playing')) {
      const p = game.piece;
      const colors = PIECE_COLORS[p.type];
      const gy = game.ghostY();
      const cells = SHAPES[p.type][p.rotation];

      if (opts.ghost !== false && gy !== p.y) {
        ctx.save();
        ctx.globalAlpha = 0.28 + Math.sin(this.time * 0.005) * 0.06;
        for (const c of cells) {
          const x = this.cellX(p.x + c.x);
          const y = this.cellY(gy + c.y);
          if (gy + c.y < HIDDEN_ROWS) continue;
          ctx.strokeStyle = colors.glow;
          ctx.lineWidth = Math.max(1.5, cell * 0.07);
          roundRect(ctx, x + cell * 0.12, y + cell * 0.12, cell * 0.76, cell * 0.76, cell * 0.14);
          ctx.stroke();
          ctx.fillStyle = rgba(colors.base, 0.12);
          ctx.fill();
        }
        ctx.restore();
      }

      // 接地中は脈動させて「そろそろ固まる」を伝える
      const lockRatio = game.grounded ? Math.min(1, game.lockTimer / 500) : 0;
      const pulse = game.grounded ? 0.7 + Math.sin(this.time * 0.02) * 0.3 : 1;
      for (const c of cells) {
        const row = p.y + c.y;
        if (row < HIDDEN_ROWS - 1) continue;
        this.drawBlock(this.cellX(p.x + c.x), this.cellY(row), cell, colors, {
          glow: 0.5 + lockRatio * 0.9,
          scale: 1 - lockRatio * 0.04,
          alpha: 0.85 + pulse * 0.15,
          rank: bonusRank,
          seed: c.x + c.y,
        });
      }
    }

    fx.drawFront(ctx);
    ctx.restore();

    // 白フラッシュとホワイトアウト
    const white = Math.max(fx.flash, fx.white);
    if (white > 0.01) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, white);
      ctx.fillStyle = fx.white > fx.flash ? '#ffffff' : fx.flashColor;
      ctx.fillRect(0, 0, this.width, this.height);
      ctx.restore();
    }
    ctx.restore();
  }

  /** HOLD / NEXT 用のミニ盤面描画。 */
  static drawMini(canvas, type, options = {}) {
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    // CSS で隠されている（サイズ 0）ときは何もしない
    if (rect.width < 4 || rect.height < 4) return;
    const w = Math.max(1, Math.round(rect.width * dpr));
    const h = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    ctx.clearRect(0, 0, w, h);
    if (!type) return;

    const matrix = MATRICES[type][0];
    // 実際に埋まっている範囲でトリミングして中央寄せ
    let minX = 99, maxX = -1, minY = 99, maxY = -1;
    for (let y = 0; y < matrix.length; y++) {
      for (let x = 0; x < matrix[y].length; x++) {
        if (matrix[y][x]) {
          minX = Math.min(minX, x); maxX = Math.max(maxX, x);
          minY = Math.min(minY, y); maxY = Math.max(maxY, y);
        }
      }
    }
    const cw = maxX - minX + 1;
    const chh = maxY - minY + 1;
    const cell = Math.min(w / (cw + 0.6), h / (chh + 0.6));
    const ox = (w - cell * cw) / 2;
    const oy = (h - cell * chh) / 2;
    const colors = PIECE_COLORS[type];
    const dim = options.dim;

    const r = new Renderer(canvas, null);
    r.ctx = ctx;
    r.quality = options.quality || 'high';
    r.time = performance.now();
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        if (!matrix[y][x]) continue;
        r.drawBlock(ox + (x - minX) * cell, oy + (y - minY) * cell, cell,
          dim ? PIECE_COLORS.G : colors,
          { glow: dim ? 0 : 0.3, alpha: dim ? 0.5 : 1, rank: options.rank || 0, seed: x + y });
      }
    }
  }
}
