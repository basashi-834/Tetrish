/**
 * WebAudio によるサウンド。音声ファイルは一切使わず、すべてその場で合成する。
 * - SFX: 操作音・消去音・フィーバー音など
 * - BGM: 16分音符グリッドのチップチューン。レベルとフィーバーでテンポと厚みが変わる。
 */

const MIDI_A4 = 69;
const freq = (n) => 440 * Math.pow(2, (n - MIDI_A4) / 12);

// --- BGM パターン ------------------------------------------------------------
// 音名は MIDI ノート番号。null は休符。1小節=16ステップ。

const BASS = [
  [45, null, 45, null, 45, null, 45, null, 43, null, 43, null, 43, null, 43, null],
  [41, null, 41, null, 41, null, 41, null, 40, null, 40, null, 40, null, 43, 44],
  [45, null, 45, null, 48, null, 45, null, 43, null, 43, null, 46, null, 43, null],
  [41, null, 41, null, 44, null, 41, null, 40, null, 40, null, 40, 42, 43, 44],
];

const LEAD = [
  [69, 72, 76, 72, 69, 72, 76, 79, 76, 72, 69, 72, 74, 71, 67, 71],
  [65, 69, 72, 69, 65, 69, 72, 76, 72, 69, 65, 69, 68, 71, 64, 68],
  [69, 76, 81, 76, 69, 76, 81, 84, 81, 76, 72, 76, 74, 78, 81, 78],
  [65, 72, 77, 72, 68, 71, 76, 71, 67, 71, 76, 71, 68, 71, 64, 68],
];

const ARP = [
  [57, 60, 64, 60, 57, 60, 64, 67, 64, 60, 57, 60, 62, 59, 55, 59],
  [53, 57, 60, 57, 53, 57, 60, 64, 60, 57, 53, 57, 56, 59, 52, 56],
  [57, 64, 69, 64, 57, 64, 69, 72, 69, 64, 60, 64, 62, 66, 69, 66],
  [53, 60, 65, 60, 56, 59, 64, 59, 55, 59, 64, 59, 56, 59, 52, 56],
];

const KICK = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0];
const SNARE = [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1];
const HAT = [1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1];

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
    this.fever = false;
    this.playing = false;
    this.noiseBuffer = null;
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

  setIntensity(level, fever) {
    this.intensity = Math.min(1, (level - 1) / 14);
    this.fever = fever;
    this.bpm = 142 + this.intensity * 34 + (fever ? 26 : 0);
  }

  scheduler() {
    if (!this.ready || !this.playing) return;
    const stepDur = 60 / this.bpm / 4;
    while (this.nextNoteTime < this.now + 0.12) {
      this.playStep(this.step, this.nextNoteTime, stepDur);
      this.nextNoteTime += stepDur;
      this.step = (this.step + 1) % 64;
    }
  }

  playStep(step, t, stepDur) {
    const bar = (step >> 4) & 3;
    const i = step & 15;
    const g = this.musicGain;
    const inten = this.intensity;

    const b = BASS[bar][i];
    if (b !== null) {
      this.tone({
        f0: freq(b - 12), type: 'sawtooth', dur: stepDur * 1.9,
        gain: 0.3 + inten * 0.08, t0: t, dest: g,
      });
      this.tone({
        f0: freq(b - 24), type: 'sine', dur: stepDur * 2.1,
        gain: 0.26, t0: t, dest: g,
      });
    }

    const a = ARP[bar][i];
    if (a !== null && (inten > 0.12 || this.fever)) {
      this.tone({
        f0: freq(a), type: 'square', dur: stepDur * 0.85,
        gain: 0.09 + inten * 0.05, t0: t, dest: g,
      });
    }

    const l = LEAD[bar][i];
    if (l !== null) {
      this.tone({
        f0: freq(l), type: this.fever ? 'sawtooth' : 'square',
        dur: stepDur * 1.15, gain: 0.13 + inten * 0.05, t0: t, dest: g,
      });
      if (this.fever) {
        this.tone({
          f0: freq(l + 12), type: 'square', dur: stepDur * 0.9,
          gain: 0.07, t0: t, dest: g, detune: 8,
        });
      }
    }

    if (KICK[i]) {
      this.tone({ f0: 150, f1: 42, type: 'sine', dur: 0.14, gain: 0.5, t0: t, dest: g });
    }
    if (SNARE[i]) {
      this.noise({ t0: t, dur: 0.12, gain: 0.24, freq: 2200, q: 0.9, type: 'bandpass', dest: g });
    }
    if (HAT[i] && (inten > 0.05 || this.fever)) {
      this.noise({
        t0: t, dur: 0.035, gain: this.fever ? 0.14 : 0.09,
        freq: 9000, q: 1.4, type: 'highpass', dest: g,
      });
    }
  }
}
