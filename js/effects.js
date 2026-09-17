/**
 * 演出レイヤー：パーティクル、衝撃波、画面シェイク、スローモーション、
 * 背景のビートなど「気持ちよさ」担当。すべて盤面キャンバス座標(px)で扱う。
 */

const TAU = Math.PI * 2;

/** 0..1 の乱数を範囲に写す。 */
function rand(min, max) {
  return min + Math.random() * (max - min);
}

export class Effects {
  constructor() {
    this.particles = [];
    this.waves = [];
    this.beams = [];
    this.rowFlashes = [];
    this.rays = [];
    this.shake = 0;
    this.shakeDecay = 0.88;
    this.shakeX = 0;
    this.shakeY = 0;
    this.shakeRot = 0;
    this.rotAmp = 0;          // 回転方向の揺れ量
    this.zoom = 1;
    this.zoomTarget = 1;
    this.punch = 0;           // 弾けるようなズーム（減衰振動）
    this.punchT = 0;
    this.flash = 0;
    this.flashColor = '#ffffff';
    this.white = 0;           // ホワイトアウト（自然減衰しない）
    this.whiteDecay = 0;
    this.chroma = 0;
    this.time = 0;
    this.timeScale = 1;       // スロー演出用
    this.maxParticles = 560;
  }

  reset() {
    this.particles.length = 0;
    this.waves.length = 0;
    this.beams.length = 0;
    this.rowFlashes.length = 0;
    this.rays.length = 0;
    this.shake = 0;
    this.rotAmp = 0;
    this.shakeRot = 0;
    this.zoom = 1;
    this.zoomTarget = 1;
    this.punch = 0;
    this.flash = 0;
    this.white = 0;
    this.whiteDecay = 0;
    this.chroma = 0;
    this.timeScale = 1;
  }

  /** 端末性能に応じたパーティクル上限。 */
  setQuality(level) {
    this.maxParticles = level === 'low' ? 180 : level === 'mid' ? 360 : 560;
    this.quality = level;
  }

  /**
   * 画面を揺らす。rot を渡すと回転方向にも揺れて、より「殴られた」感じになる。
   */
  addShake(amount, rot = 0) {
    this.shake = Math.min(70, this.shake + amount);
    if (rot) this.rotAmp = Math.min(0.09, this.rotAmp + rot);
  }

  /** 弾けるズーム。減衰振動なので「ドンッ」と入って戻る。 */
  addPunch(amount) {
    this.punch = Math.max(this.punch, amount);
    this.punchT = 0;
  }

  /** 画面を白く飛ばす。decay=0 なら明示的に消すまで白いまま（白セカイ）。 */
  whiteOut(alpha, decayPerSec = 2.2) {
    this.white = Math.max(this.white, alpha);
    this.whiteDecay = decayPerSec;
  }

  clearWhite(decayPerSec = 3.5) {
    this.whiteDecay = decayPerSec;
  }

  /** 集中線。激アツ演出の定番。 */
  addRays(opts = {}) {
    this.rays.push({
      life: opts.life ?? 700,
      max: opts.life ?? 700,
      color: opts.color ?? '#ffffff',
      count: opts.count ?? 26,
      spin: opts.spin ?? 0.0006,
      width: opts.width ?? 0.028,
      inner: opts.inner ?? 0.22,
      phase: Math.random() * Math.PI * 2,
    });
  }

  addFlash(alpha, color = '#ffffff') {
    this.flash = Math.max(this.flash, alpha);
    this.flashColor = color;
  }

  pulseZoom(amount) {
    this.zoomTarget = 1 + amount;
  }

  addChroma(amount) {
    this.chroma = Math.min(14, this.chroma + amount);
  }

  spawn(p) {
    if (this.particles.length >= this.maxParticles) return;
    this.particles.push(p);
  }

  /** 破片を撒き散らす。 */
  burst(x, y, color, opts = {}) {
    const count = Math.round((opts.count ?? 14) * (this.maxParticles / 560));
    for (let i = 0; i < count; i++) {
      const a = opts.angle !== undefined
        ? opts.angle + rand(-(opts.spread ?? 0.6), opts.spread ?? 0.6)
        : rand(0, TAU);
      const speed = rand(opts.speedMin ?? 0.08, opts.speedMax ?? 0.5);
      this.spawn({
        x, y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        g: opts.gravity ?? 0.0016,
        drag: opts.drag ?? 0.994,
        life: opts.life ?? rand(420, 900),
        max: opts.life ?? 900,
        size: opts.size ?? rand(2, 6),
        color,
        spin: rand(-0.02, 0.02),
        rot: rand(0, TAU),
        kind: opts.kind ?? 'shard',
        glow: opts.glow ?? true,
      });
    }
  }

  /** 上に舞い上がる紙吹雪。パーフェクトクリアなどのご褒美用。 */
  confetti(x, y, width, count = 60) {
    const colors = ['#ff3465', '#ffdc23', '#2bdd6e', '#22e0ff', '#c04dff', '#ff9312'];
    const n = Math.round(count * (this.maxParticles / 560));
    for (let i = 0; i < n; i++) {
      this.spawn({
        x: x + rand(-width / 2, width / 2),
        y,
        vx: rand(-0.18, 0.18),
        vy: rand(-0.75, -0.3),
        g: 0.0012,
        drag: 0.995,
        life: rand(900, 1800),
        max: 1800,
        size: rand(3, 8),
        color: colors[(Math.random() * colors.length) | 0],
        spin: rand(-0.06, 0.06),
        rot: rand(0, TAU),
        kind: 'confetti',
        glow: false,
      });
    }
  }

  /** 消えるラインの光の帯。 */
  addRowFlash(y, height, width, color) {
    this.rowFlashes.push({ y, height, width, color, t: 0, life: 280 });
  }

  /** 広がる衝撃波リング。 */
  addWave(x, y, opts = {}) {
    this.waves.push({
      x, y,
      r: opts.r0 ?? 6,
      vr: opts.vr ?? 0.55,
      life: opts.life ?? 520,
      max: opts.life ?? 520,
      color: opts.color ?? '#ffffff',
      width: opts.width ?? 4,
      squash: opts.squash ?? 1,
    });
  }

  /** ハードドロップの残像ビーム。 */
  addBeam(x, y0, y1, width, color) {
    this.beams.push({ x, y0, y1, width, color, t: 0, life: 260 });
  }

  update(dt) {
    this.time += dt;

    // シェイク：減衰しながらランダムオフセット＋回転
    if (this.shake > 0.05) {
      const s = this.shake;
      this.shakeX = rand(-s, s);
      this.shakeY = rand(-s, s) * 0.8;
      this.shake *= Math.pow(this.shakeDecay, dt / 16.67);
    } else {
      this.shake = 0;
      this.shakeX = 0;
      this.shakeY = 0;
    }
    if (this.rotAmp > 0.0004) {
      this.shakeRot = rand(-this.rotAmp, this.rotAmp);
      this.rotAmp *= Math.pow(0.86, dt / 16.67);
    } else {
      this.rotAmp = 0;
      this.shakeRot = 0;
    }

    // パンチズーム：減衰する振動
    if (this.punch > 0.001) {
      this.punchT += dt;
      this.punch *= Math.pow(0.9, dt / 16.67);
      if (this.punch < 0.001) this.punch = 0;
    }

    this.zoom += (this.zoomTarget - this.zoom) * Math.min(1, dt / 90);
    this.zoomTarget += (1 - this.zoomTarget) * Math.min(1, dt / 130);
    this.flash *= Math.pow(0.86, dt / 16.67);
    this.chroma *= Math.pow(0.9, dt / 16.67);
    if (this.whiteDecay > 0) {
      this.white = Math.max(0, this.white - this.whiteDecay * (dt / 1000));
    }

    for (let i = this.rays.length - 1; i >= 0; i--) {
      const r = this.rays[i];
      r.life -= dt;
      r.phase += r.spin * dt;
      if (r.life <= 0) this.rays.splice(i, 1);
    }

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) { this.particles.splice(i, 1); continue; }
      const step = dt;
      p.vy += p.g * step;
      p.vx *= Math.pow(p.drag, step / 16.67);
      p.vy *= Math.pow(p.drag, step / 16.67);
      p.x += p.vx * step;
      p.y += p.vy * step;
      p.rot += p.spin * step;
    }

    for (let i = this.waves.length - 1; i >= 0; i--) {
      const w = this.waves[i];
      w.life -= dt;
      w.r += w.vr * dt;
      if (w.life <= 0) this.waves.splice(i, 1);
    }

    for (let i = this.rowFlashes.length - 1; i >= 0; i--) {
      const f = this.rowFlashes[i];
      f.t += dt;
      if (f.t >= f.life) this.rowFlashes.splice(i, 1);
    }

    for (let i = this.beams.length - 1; i >= 0; i--) {
      const b = this.beams[i];
      b.t += dt;
      if (b.t >= b.life) this.beams.splice(i, 1);
    }
  }

  /** シェイクとパンチを合成した実効ズーム。 */
  get effectiveZoom() {
    const p = this.punch > 0
      ? Math.cos(this.punchT * 0.032) * this.punch
      : 0;
    return this.zoom + p;
  }

  /** 背面（盤面の下）に描くもの：ラインフラッシュ、ビーム。 */
  drawBack(ctx) {
    ctx.save();
    for (const b of this.beams) {
      const k = 1 - b.t / b.life;
      ctx.globalAlpha = k * 0.55;
      const grad = ctx.createLinearGradient(0, b.y0, 0, b.y1);
      grad.addColorStop(0, 'transparent');
      grad.addColorStop(1, b.color);
      ctx.fillStyle = grad;
      const w = b.width * (0.35 + k * 0.65);
      ctx.fillRect(b.x - w / 2, b.y0, w, b.y1 - b.y0);
    }
    ctx.restore();
  }

  /** 前面（盤面の上）に描くもの：破片、衝撃波、行の閃光。 */
  drawFront(ctx) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    // 集中線
    if (this.rays.length) {
      const cx = this.centerX ?? 0;
      const cy = this.centerY ?? 0;
      const R = this.radius ?? 400;
      for (const r of this.rays) {
        const k = r.life / r.max;
        // 出はじめに一番濃く、すぐ落ち着く。盤面が見えなくならない程度に抑える
        ctx.globalAlpha = Math.min(1, k * 1.6) * 0.26;
        ctx.fillStyle = r.color;
        for (let i = 0; i < r.count; i++) {
          const a = r.phase + (i / r.count) * TAU;
          const w = r.width * (0.5 + ((i * 7919) % 100) / 100);
          const inner = R * (r.inner + (1 - k) * 0.5);
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
          ctx.lineTo(cx + Math.cos(a - w) * R * 1.6, cy + Math.sin(a - w) * R * 1.6);
          ctx.lineTo(cx + Math.cos(a + w) * R * 1.6, cy + Math.sin(a + w) * R * 1.6);
          ctx.closePath();
          ctx.fill();
        }
      }
    }

    for (const f of this.rowFlashes) {
      const k = 1 - f.t / f.life;
      const ease = k * k;
      ctx.globalAlpha = ease;
      const grad = ctx.createLinearGradient(0, f.y, 0, f.y + f.height);
      grad.addColorStop(0, 'rgba(255,255,255,0)');
      grad.addColorStop(0.5, f.color);
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grad;
      const expand = (1 - ease) * f.height * 1.2;
      ctx.fillRect(-20, f.y - expand / 2, f.width + 40, f.height + expand);
    }

    for (const w of this.waves) {
      const k = w.life / w.max;
      ctx.globalAlpha = k * 0.8;
      ctx.strokeStyle = w.color;
      ctx.lineWidth = w.width * k;
      ctx.beginPath();
      ctx.ellipse(w.x, w.y, w.r, w.r * w.squash, 0, 0, TAU);
      ctx.stroke();
    }

    // 数が多い破片は回転させずに描く（3〜6px では回転はほぼ見えない上に高価）
    for (const p of this.particles) {
      const k = Math.min(1, p.life / (p.max * 0.6));
      ctx.globalAlpha = k;
      ctx.fillStyle = p.color;
      if (p.kind === 'spark') {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * k, 0, TAU);
        ctx.fill();
      } else if (p.kind === 'confetti') {
        // 紙吹雪はひらひら感が肝心なので回転させる
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
      } else {
        const s = p.size * (0.4 + k * 0.6);
        ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
      }
    }
    ctx.restore();
  }
}
