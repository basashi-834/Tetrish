/**
 * WebAudio によるサウンド。音声ファイルは一切使わず、すべてその場で合成する。
 * - SFX: 操作音・消去音・フィーバー音など
 * - BGM: 16分音符グリッドのチップチューン。レベルとフィーバーでテンポと厚みが変わる。
 */

const MIDI_A4 = 69;
const freq = (n) => 440 * Math.pow(2, (n - MIDI_A4) / 12);

// --- BGM ---------------------------------------------------------------------
// 1小節 = 16ステップ（16分音符）。曲は「通常」「前兆」「ボーナス」の3トラック。
// 音名は MIDI ノート番号、null は休符。

/** Am - F - C - G。上がる進行なので素直に気持ちいい。 */
const PROG_ROOTS = [45, 41, 48, 43];
const PROG_CHORDS = [
  [57, 60, 64],   // Am
  [53, 57, 60],   // F
  [48, 52, 55],   // C
  [55, 59, 62],   // G
];

/** 通常時：控えめに転がすグルーヴ。 */
const NORMAL = {
  bpm: 148,
  swing: 0,
  bass: [
    [45, null, 45, null, 45, null, 45, null, 43, null, 43, null, 43, null, 43, null],
    [41, null, 41, null, 41, null, 41, null, 40, null, 40, null, 40, null, 43, 44],
    [45, null, 45, null, 48, null, 45, null, 43, null, 43, null, 46, null, 43, null],
    [41, null, 41, null, 44, null, 41, null, 40, null, 40, null, 40, 42, 43, 44],
  ],
  lead: [
    [69, 72, 76, 72, 69, 72, 76, 79, 76, 72, 69, 72, 74, 71, 67, 71],
    [65, 69, 72, 69, 65, 69, 72, 76, 72, 69, 65, 69, 68, 71, 64, 68],
    [69, 76, 81, 76, 69, 76, 81, 84, 81, 76, 72, 76, 74, 78, 81, 78],
    [65, 72, 77, 72, 68, 71, 76, 71, 67, 71, 76, 71, 68, 71, 64, 68],
  ],
  kick: [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0],
  snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1],
  hat: [1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1],
  openHat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  gain: 0.9,
};

/** 前兆：通常曲を半分に間引き、代わりに緊張を積む。 */
const TENSION = {
  bpm: 152,
  bass: [
    [45, null, null, null, 45, null, null, null, 45, null, null, null, 45, null, 45, 45],
    [44, null, null, null, 44, null, null, null, 44, null, null, null, 44, null, 44, 44],
    [43, null, null, null, 43, null, null, null, 43, null, null, null, 43, null, 43, 43],
    [42, null, null, null, 42, null, null, null, 42, null, null, null, 42, 42, 42, 42],
  ],
  lead: [
    [null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
    [null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
    [null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
    [null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
  ],
  kick: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
  snare: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  hat: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 1, 1],
  openHat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  toms: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1],
  riser: true,
  gain: 0.85,
};

/**
 * ボーナス：4つ打ち＋オフビートベース＋スーパーソウのコード刻み。
 * いわゆるユーロビート/トランスの構成で、これが「ドパドパ」の正体。
 */
const BONUS = {
  bpm: 174,
  // ベースは4分のキックを避けて走る（ガロップ）
  bassStep: (i) => i % 4 !== 0,
  bassOctave: (i) => (i % 4 === 2 ? 12 : 0),
  lead: [
    [81, null, 81, 79, 76, null, 79, 81, 84, null, 81, 79, 76, null, 72, 74],
    [77, null, 77, 76, 72, null, 76, 77, 81, null, 77, 76, 72, null, 69, 71],
    [79, null, 79, 76, 72, null, 76, 79, 84, null, 83, 79, 76, null, 79, 83],
    [86, 84, 83, 79, 76, 79, 83, 86, 88, 86, 83, 79, 83, 86, 88, 91],
  ],
  kick: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
  clap: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
  hat: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  openHat: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0],
  chord: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 1],
  arp: true,
  gain: 1.15,
};

const TRACKS = { normal: NORMAL, tension: TENSION, bonus: BONUS };

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.musicOn = true;
    this.sfxOn = true;
    this.step = 0;
    this.nextNoteTime = 0;
    this.timer = null;
    this.bpm = 148;
    this.intensity = 0;   // 0..1 レベルによる盛り上がり
    this.track = 'normal';
    this.playing = false;
    this.noiseBuffer = null;
    this.beatAt = 0;      // 直近の4分音符が鳴った時刻（描画のビート同期用）
    this.beatLen = 0.4;
  }

  /** ユーザー操作の中から呼ぶこと（自動再生ポリシー対策）。 */
  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();

    this.master = this.ctx.createGain();
    this.master.gain.value = 1.0;

    this.comp = this.ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14;
    this.comp.knee.value = 24;
    this.comp.ratio.value = 8;
    this.comp.attack.value = 0.003;
    this.comp.release.value = 0.2;

    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.5;
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 0.72;

    // 軽いリバーブ代わりのディレイ
    this.delay = this.ctx.createDelay(0.6);
    this.delay.delayTime.value = 0.16;
    this.feedback = this.ctx.createGain();
    this.feedback.gain.value = 0.28;
    this.delayMix = this.ctx.createGain();
    this.delayMix.gain.value = 0.22;
    this.delay.connect(this.feedback);
    this.feedback.connect(this.delay);
    this.delay.connect(this.delayMix);
    this.delayMix.connect(this.comp);

    this.musicGain.connect(this.comp);
    this.sfxGain.connect(this.comp);
    this.sfxGain.connect(this.delay);
    this.comp.connect(this.master);
    this.master.connect(this.ctx.destination);

    // ノイズ源（ドラム・ハードドロップ用）
    const len = this.ctx.sampleRate * 1;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuffer = buf;

    this.ready = true;
  }

  get now() { return this.ctx ? this.ctx.currentTime : 0; }

  setMusic(on) {
    this.musicOn = on;
    if (!this.ctx) return;
    this.musicGain.gain.setTargetAtTime(on ? 0.5 : 0, this.now, 0.05);
  }

  setSfx(on) {
    this.sfxOn = on;
    if (!this.ctx) return;
    this.sfxGain.gain.setTargetAtTime(on ? 0.72 : 0, this.now, 0.05);
  }

  // --- 汎用ボイス ------------------------------------------------------------

  /** 単純なエンベロープ付きオシレータ。 */
  tone(opts) {
    if (!this.ready) return;
    const {
      f0, f1, type = 'square', t0 = this.now, dur = 0.12,
      gain = 0.3, attack = 0.004, dest = this.sfxGain, detune = 0,
    } = opts;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.detune.value = detune;
    osc.frequency.setValueAtTime(f0, t0);
    if (f1 && f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(dest);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }

  /** フィルタ付きノイズ。 */
  noise(opts) {
    if (!this.ready) return;
    const {
      t0 = this.now, dur = 0.12, gain = 0.3, freq: f = 1800,
      q = 1, type = 'bandpass', sweepTo = null, dest = this.sfxGain,
    } = opts;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(f, t0);
    filter.Q.value = q;
    if (sweepTo) filter.frequency.exponentialRampToValueAtTime(Math.max(20, sweepTo), t0 + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(dest);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  // --- SFX -------------------------------------------------------------------

  sfxMove() { this.tone({ f0: 320, f1: 300, type: 'square', dur: 0.035, gain: 0.1 }); }
  sfxRotate() { this.tone({ f0: 520, f1: 700, type: 'square', dur: 0.05, gain: 0.13 }); }
  sfxRotateFail() { this.tone({ f0: 150, f1: 110, type: 'sawtooth', dur: 0.06, gain: 0.09 }); }
  sfxHold() {
    const t = this.now;
    this.tone({ f0: 660, f1: 990, type: 'triangle', dur: 0.1, gain: 0.16, t0: t });
    this.tone({ f0: 990, f1: 660, type: 'triangle', dur: 0.1, gain: 0.1, t0: t + 0.04 });
  }
  sfxSoftDrop() { this.tone({ f0: 200, f1: 180, type: 'square', dur: 0.02, gain: 0.05 }); }

  sfxHardDrop(distance = 10) {
    const t = this.now;
    const d = Math.min(1, distance / 18);
    this.noise({ t0: t, dur: 0.14 + d * 0.1, gain: 0.32, freq: 900 + d * 900, sweepTo: 90, q: 0.7, type: 'lowpass' });
    this.tone({ f0: 220 + d * 120, f1: 46, type: 'sawtooth', dur: 0.16, gain: 0.3, t0: t });
  }

  sfxLock() { this.tone({ f0: 190, f1: 130, type: 'square', dur: 0.05, gain: 0.12 }); }

  /** ライン消去。段数とコンボで派手さが変わる。 */
  sfxClear(lines, combo = 0, tspin = false) {
    if (!this.ready) return;
    const t = this.now;
    const root = 60 + Math.min(combo, 12) * 1 + (tspin ? 3 : 0);
    const chords = {
      1: [0, 4, 7],
      2: [0, 4, 7, 11],
      3: [0, 5, 9, 12],
      4: [0, 4, 7, 12, 16],
    };
    const notes = chords[Math.min(4, Math.max(1, lines))];
    notes.forEach((n, i) => {
      const t0 = t + i * (lines === 4 ? 0.045 : 0.055);
      this.tone({ f0: freq(root + n), type: 'square', dur: 0.24, gain: 0.2, t0 });
      this.tone({ f0: freq(root + n + 12), type: 'triangle', dur: 0.2, gain: 0.12, t0 });
    });
    this.noise({ t0: t, dur: 0.25, gain: 0.16, freq: 4000, sweepTo: 700, q: 0.8, type: 'bandpass' });
    if (lines === 4 || tspin) {
      this.tone({ f0: 110, f1: 55, type: 'sawtooth', dur: 0.4, gain: 0.3, t0: t });
      for (let i = 0; i < 6; i++) {
        this.tone({
          f0: freq(root + 24 + i * 2), type: 'square',
          dur: 0.12, gain: 0.08, t0: t + 0.05 + i * 0.03,
        });
      }
    }
  }

  /** コンボの度に音程が上がるお馴染みのやつ。 */
  sfxCombo(combo) {
    const n = 64 + Math.min(combo, 20) * 2;
    const t = this.now;
    this.tone({ f0: freq(n), type: 'square', dur: 0.1, gain: 0.2, t0: t });
    this.tone({ f0: freq(n + 7), type: 'square', dur: 0.12, gain: 0.14, t0: t + 0.06 });
  }

  sfxPerfect() {
    const t = this.now;
    const scale = [0, 4, 7, 12, 16, 19, 24, 28];
    scale.forEach((n, i) => {
      this.tone({ f0: freq(60 + n), type: 'triangle', dur: 0.5, gain: 0.22, t0: t + i * 0.055 });
      this.tone({ f0: freq(72 + n), type: 'square', dur: 0.3, gain: 0.1, t0: t + i * 0.055 });
    });
  }

  sfxLevelUp() {
    const t = this.now;
    [0, 4, 7, 12].forEach((n, i) => {
      this.tone({ f0: freq(67 + n), type: 'square', dur: 0.18, gain: 0.22, t0: t + i * 0.07 });
    });
  }

  sfxFever() {
    const t = this.now;
    // ライザー
    this.noise({ t0: t, dur: 0.9, gain: 0.25, freq: 300, sweepTo: 9000, q: 1.2, type: 'bandpass' });
    for (let i = 0; i < 14; i++) {
      this.tone({
        f0: freq(48 + i * 3), type: 'sawtooth',
        dur: 0.1, gain: 0.12, t0: t + i * 0.06,
      });
    }
    this.tone({ f0: 60, f1: 30, type: 'sine', dur: 1.0, gain: 0.4, t0: t + 0.85 });
    [0, 7, 12, 16].forEach((n, i) => {
      this.tone({ f0: freq(72 + n), type: 'square', dur: 0.6, gain: 0.2, t0: t + 0.85 + i * 0.02 });
    });
  }

  sfxDanger() {
    const t = this.now;
    this.tone({ f0: 440, f1: 330, type: 'sawtooth', dur: 0.18, gain: 0.12, t0: t });
  }

  sfxGameOver() {
    const t = this.now;
    [72, 67, 63, 60, 55, 51, 48].forEach((n, i) => {
      this.tone({ f0: freq(n), type: 'square', dur: 0.35, gain: 0.22, t0: t + i * 0.11 });
    });
    this.noise({ t0: t + 0.7, dur: 1.2, gain: 0.2, freq: 1200, sweepTo: 60, q: 0.6, type: 'lowpass' });
  }

  sfxStart() {
    const t = this.now;
    [60, 64, 67, 72].forEach((n, i) => {
      this.tone({ f0: freq(n), type: 'square', dur: 0.14, gain: 0.2, t0: t + i * 0.06 });
    });
  }

  // --- パチスロ系 SFX ---------------------------------------------------------

  /** レバーON。「カシャッ」という機械音。 */
  sfxLever() {
    const t = this.now;
    this.noise({ t0: t, dur: 0.05, gain: 0.5, freq: 3200, q: 1.2, type: 'bandpass' });
    this.noise({ t0: t + 0.03, dur: 0.09, gain: 0.35, freq: 900, sweepTo: 200, q: 0.8, type: 'lowpass' });
    this.tone({ f0: 180, f1: 70, type: 'square', dur: 0.1, gain: 0.3, t0: t });
  }

  /** フリーズ。低音が沈んで無音に吸い込まれる感じ。 */
  sfxFreeze() {
    const t = this.now;
    this.tone({ f0: 320, f1: 28, type: 'sine', dur: 0.75, gain: 0.55, t0: t });
    this.tone({ f0: 160, f1: 24, type: 'sawtooth', dur: 0.8, gain: 0.3, t0: t });
    this.noise({ t0: t, dur: 0.9, gain: 0.3, freq: 9000, sweepTo: 120, q: 0.7, type: 'lowpass' });
  }

  /** リール回転の始まり。 */
  sfxReelSpin() {
    const t = this.now;
    this.noise({ t0: t, dur: 0.5, gain: 0.22, freq: 400, sweepTo: 2600, q: 1.5, type: 'bandpass' });
    this.tone({ f0: 110, f1: 330, type: 'sawtooth', dur: 0.4, gain: 0.14, t0: t });
  }

  /** リール停止。「ガコンッ」。止まるたびに少し高くする。 */
  sfxReelStop(index = 0) {
    const t = this.now;
    const p = 1 + index * 0.18;
    this.tone({ f0: 240 * p, f1: 60 * p, type: 'square', dur: 0.13, gain: 0.42, t0: t });
    this.noise({ t0: t, dur: 0.07, gain: 0.4, freq: 2400 * p, q: 1.1, type: 'bandpass' });
    this.tone({ f0: 70, f1: 40, type: 'sine', dur: 0.18, gain: 0.45, t0: t });
  }

  /** テンパイ音。震えるような不安定な持続音。 */
  sfxTenpai() {
    if (!this.ready) return;
    const t = this.now;
    for (let i = 0; i < 18; i++) {
      const t0 = t + i * 0.075;
      this.tone({ f0: freq(64 + (i % 2 ? 1 : 0)), type: 'square', dur: 0.07, gain: 0.16, t0 });
      this.tone({ f0: freq(71 + (i % 2 ? 1 : 0)), type: 'square', dur: 0.07, gain: 0.12, t0 });
    }
    this.tone({ f0: 55, type: 'sine', dur: 1.4, gain: 0.3, t0: t });
  }

  /** 確定音。「ジャキーン！」 */
  sfxKakutei(rank = 2) {
    if (!this.ready) return;
    const t = this.now;
    const root = rank >= 3 ? 72 : rank === 2 ? 69 : 65;
    this.noise({ t0: t, dur: 0.6, gain: 0.4, freq: 1200, sweepTo: 11000, q: 0.8, type: 'bandpass' });
    [0, 4, 7, 12, 16, 19].forEach((n, i) => {
      this.tone({ f0: freq(root + n), type: 'square', dur: 0.7, gain: 0.2, t0: t + i * 0.012 });
      this.tone({ f0: freq(root + n + 12), type: 'triangle', dur: 0.5, gain: 0.12, t0: t + i * 0.012 });
    });
    this.tone({ f0: 90, f1: 40, type: 'sine', dur: 0.9, gain: 0.55, t0: t });
  }

  /** コイン1枚。「チャリン」 */
  sfxCoin(pitch = 0) {
    const t = this.now;
    this.tone({ f0: freq(88 + pitch), type: 'square', dur: 0.05, gain: 0.14, t0: t });
    this.tone({ f0: freq(95 + pitch), type: 'square', dur: 0.08, gain: 0.1, t0: t + 0.015 });
  }

  /** 払い出し。コインが雪崩れる「ジャラジャラ」。 */
  sfxPayout(amount = 12) {
    if (!this.ready) return;
    const t = this.now;
    const n = Math.min(26, 6 + Math.floor(amount));
    for (let i = 0; i < n; i++) {
      const t0 = t + i * 0.035 + Math.random() * 0.02;
      const p = Math.floor(Math.random() * 6);
      this.tone({ f0: freq(86 + p), type: 'square', dur: 0.05, gain: 0.1, t0 });
      this.tone({ f0: freq(93 + p), type: 'square', dur: 0.07, gain: 0.07, t0: t0 + 0.012 });
    }
  }

  /** ステップアップ予告。段が上がるほど高く、派手に。 */
  sfxStepUp(step = 1) {
    const t = this.now;
    const base = 64 + step * 4;
    this.tone({ f0: freq(base), f1: freq(base + 12), type: 'square', dur: 0.14, gain: 0.22, t0: t });
    this.tone({ f0: freq(base + 7), type: 'triangle', dur: 0.2, gain: 0.14, t0: t + 0.05 });
    this.noise({ t0: t, dur: 0.2, gain: 0.14, freq: 2000, sweepTo: 7000, q: 1, type: 'bandpass' });
  }

  /** カットイン。殴り込んでくる音。 */
  sfxCutIn() {
    const t = this.now;
    this.noise({ t0: t, dur: 0.22, gain: 0.45, freq: 7000, sweepTo: 300, q: 0.8, type: 'bandpass' });
    this.tone({ f0: 420, f1: 70, type: 'sawtooth', dur: 0.24, gain: 0.4, t0: t });
    this.tone({ f0: 62, type: 'sine', dur: 0.4, gain: 0.5, t0: t + 0.02 });
  }

  /** 保留変化。「キュイン」 */
  sfxHoldChange(rank = 1) {
    const t = this.now;
    const base = 68 + rank * 3;
    this.tone({ f0: freq(base), f1: freq(base + 14), type: 'triangle', dur: 0.18, gain: 0.2, t0: t });
    this.tone({ f0: freq(base + 12), f1: freq(base + 24), type: 'square', dur: 0.14, gain: 0.1, t0: t + 0.04 });
    if (rank >= 3) this.noise({ t0: t, dur: 0.3, gain: 0.16, freq: 3000, sweepTo: 9000, q: 1.2, type: 'bandpass' });
  }

  /** 上乗せ。G数が乗るたびの「ジャキン」。量が多いほど分厚い。 */
  sfxUwanose(amount = 10) {
    const t = this.now;
    const big = amount >= 30;
    const root = big ? 74 : 69;
    [0, 5, 9].forEach((n, i) => {
      this.tone({ f0: freq(root + n), type: 'square', dur: big ? 0.3 : 0.16, gain: 0.2, t0: t + i * 0.02 });
    });
    this.noise({ t0: t, dur: 0.18, gain: 0.2, freq: 5000, sweepTo: 1200, q: 1, type: 'bandpass' });
    if (big) this.tone({ f0: 80, f1: 42, type: 'sine', dur: 0.4, gain: 0.45, t0: t });
  }

  /** ボーナス終了のファンファーレ。 */
  sfxBonusEnd() {
    const t = this.now;
    [72, 76, 79, 84].forEach((n, i) => {
      this.tone({ f0: freq(n), type: 'square', dur: 0.5, gain: 0.2, t0: t + i * 0.1 });
    });
    this.tone({ f0: 110, f1: 55, type: 'sine', dur: 1.0, gain: 0.4, t0: t + 0.3 });
  }

  // --- BGM シーケンサ ---------------------------------------------------------

  startMusic() {
    if (!this.ready || this.playing) return;
    this.playing = true;
    this.step = 0;
    this.nextNoteTime = this.now + 0.1;
    this.timer = setInterval(() => this.scheduler(), 25);
  }

  stopMusic() {
    this.playing = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** 演奏中のトラックを切り替える。ボーナス突入は小節を待たず即座に。 */
  setTrack(name) {
    if (this.track === name) return;
    this.track = name;
    if (name === 'bonus' || name === 'normal') this.step = 0;
    this.applyTempo();
  }

  setIntensity(level, danger = false) {
    this.intensity = Math.min(1, (level - 1) / 14);
    this.applyTempo();
  }

  applyTempo() {
    const t = TRACKS[this.track] || NORMAL;
    this.bpm = t.bpm + this.intensity * (this.track === 'bonus' ? 14 : 30);
  }

  /** 直近の4分音符からの経過を 0..1 で返す。描画のビート同期に使う。 */
  beatPulse() {
    if (!this.ready || !this.playing) return 0;
    const since = this.now - this.beatAt;
    if (since < 0 || since > this.beatLen) return 0;
    return Math.pow(1 - since / this.beatLen, 3);
  }

  scheduler() {
    if (!this.ready || !this.playing) return;
    const stepDur = 60 / this.bpm / 4;
    while (this.nextNoteTime < this.now + 0.12) {
      this.playStep(this.step, this.nextNoteTime, stepDur);
      if (this.step % 4 === 0) {
        this.beatAt = this.nextNoteTime;
        this.beatLen = stepDur * 4;
      }
      this.nextNoteTime += stepDur;
      this.step = (this.step + 1) % 64;
    }
  }

  playStep(step, t, stepDur) {
    const track = TRACKS[this.track] || NORMAL;
    if (this.track === 'bonus') this.playBonusStep(track, step, t, stepDur);
    else this.playGrooveStep(track, step, t, stepDur);
  }

  /** 通常／前兆トラック。 */
  playGrooveStep(track, step, t, stepDur) {
    const bar = (step >> 4) & 3;
    const i = step & 15;
    const g = this.musicGain;
    const inten = this.intensity;
    const vol = track.gain;

    const b = track.bass[bar][i];
    if (b !== null) {
      this.tone({ f0: freq(b - 12), type: 'sawtooth', dur: stepDur * 1.9, gain: (0.3 + inten * 0.08) * vol, t0: t, dest: g });
      this.tone({ f0: freq(b - 24), type: 'sine', dur: stepDur * 2.1, gain: 0.26 * vol, t0: t, dest: g });
    }

    const l = track.lead[bar][i];
    if (l !== null) {
      this.tone({ f0: freq(l), type: 'square', dur: stepDur * 1.15, gain: (0.13 + inten * 0.05) * vol, t0: t, dest: g });
    }

    if (track.kick[i]) this.tone({ f0: 150, f1: 42, type: 'sine', dur: 0.14, gain: 0.5 * vol, t0: t, dest: g });
    if (track.snare && track.snare[i]) {
      this.noise({ t0: t, dur: 0.12, gain: 0.24 * vol, freq: 2200, q: 0.9, type: 'bandpass', dest: g });
    }
    if (track.hat[i] && inten > 0.05) {
      this.noise({ t0: t, dur: 0.035, gain: 0.09 * vol, freq: 9000, q: 1.4, type: 'highpass', dest: g });
    }
    if (track.toms && track.toms[i]) {
      this.tone({ f0: 180 + i * 14, f1: 90, type: 'sine', dur: 0.16, gain: 0.4 * vol, t0: t, dest: g });
    }
    // 前兆は小節ごとに上がっていくライザーを重ねる
    if (track.riser && i === 0) {
      this.noise({ t0: t, dur: stepDur * 16, gain: 0.13 * vol, freq: 300, sweepTo: 6000, q: 1.4, type: 'bandpass', dest: g });
    }
  }

  /** ボーナストラック。4つ打ち＋オフビートベース＋スーパーソウ。 */
  playBonusStep(track, step, t, stepDur) {
    const bar = (step >> 4) & 3;
    const i = step & 15;
    const g = this.musicGain;
    const vol = track.gain;
    const root = PROG_ROOTS[bar];
    const chord = PROG_CHORDS[bar];

    // 4つ打ちキック
    if (track.kick[i]) {
      this.tone({ f0: 180, f1: 44, type: 'sine', dur: 0.16, gain: 0.72 * vol, t0: t, dest: g });
      this.noise({ t0: t, dur: 0.03, gain: 0.22 * vol, freq: 4000, q: 1, type: 'bandpass', dest: g });
    }

    // オフビートで走るベース
    if (track.bassStep(i)) {
      const n = root - 12 + track.bassOctave(i);
      this.tone({ f0: freq(n), type: 'sawtooth', dur: stepDur * 0.82, gain: 0.34 * vol, t0: t, dest: g });
      this.tone({ f0: freq(n - 12), type: 'sine', dur: stepDur * 0.9, gain: 0.22 * vol, t0: t, dest: g });
    }

    // スーパーソウのコード刻み（3声をデチューンして重ねる）
    if (track.chord[i]) {
      for (const n of chord) {
        for (const d of [-11, 0, 11]) {
          this.tone({
            f0: freq(n + 12), type: 'sawtooth', dur: stepDur * 1.5,
            gain: 0.075 * vol, t0: t, dest: g, detune: d,
          });
        }
      }
    }

    // 16分のアルペジオ
    if (track.arp) {
      const n = chord[i % chord.length] + 24;
      this.tone({ f0: freq(n), type: 'square', dur: stepDur * 0.5, gain: 0.07 * vol, t0: t, dest: g });
    }

    // リード
    const l = track.lead[bar][i];
    if (l !== null) {
      this.tone({ f0: freq(l), type: 'sawtooth', dur: stepDur * 1.2, gain: 0.17 * vol, t0: t, dest: g });
      this.tone({ f0: freq(l), type: 'square', dur: stepDur * 1.2, gain: 0.09 * vol, t0: t, dest: g, detune: 7 });
    }

    if (track.clap[i]) {
      for (let k = 0; k < 3; k++) {
        this.noise({ t0: t + k * 0.011, dur: 0.06, gain: 0.2 * vol, freq: 1800, q: 1.1, type: 'bandpass', dest: g });
      }
      this.noise({ t0: t, dur: 0.16, gain: 0.16 * vol, freq: 3000, q: 0.7, type: 'bandpass', dest: g });
    }
    if (track.hat[i]) {
      this.noise({ t0: t, dur: 0.028, gain: 0.08 * vol, freq: 10000, q: 1.5, type: 'highpass', dest: g });
    }
    if (track.openHat[i]) {
      this.noise({ t0: t, dur: 0.13, gain: 0.12 * vol, freq: 8000, q: 1.1, type: 'highpass', dest: g });
    }
  }
}
