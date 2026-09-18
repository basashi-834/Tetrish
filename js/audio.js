/**
 * WebAudio によるサウンド。音声ファイルは一切使わず、すべてその場で合成する。
 * - SFX: 操作音・消去音・フィーバー音など
 * - BGM: 16分音符グリッドのチップチューン。レベルとフィーバーでテンポと厚みが変わる。
 */

const MIDI_A4 = 69;
const freq = (n) => 440 * Math.pow(2, (n - MIDI_A4) / 12);

/**
 * デューティ比つきのパルス波。ファミコン風の音色の肝はこれ。
 * 矩形波(50%)だけだと「ピコピコ」の幅が出ない。12.5%は細く鼻にかかった音、
 * 25%は芯のある音、50%は中空な音になる。
 *
 * 矩形パルスのフーリエ級数は cos 項のみで、n次の係数が
 *   (2 / (n * PI)) * sin(n * PI * duty)
 * になる。これを PeriodicWave に渡すと折り返しノイズの出ない波が作れる。
 */
const PULSE_DUTY = { pulse12: 0.125, pulse25: 0.25, pulse50: 0.5 };

function makePulseWave(ctx, duty, harmonics = 32) {
  const real = new Float32Array(harmonics + 1);
  const imag = new Float32Array(harmonics + 1);
  for (let n = 1; n <= harmonics; n++) {
    real[n] = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * duty);
  }
  return ctx.createPeriodicWave(real, imag, { disableNormalization: false });
}

// --- BGM ---------------------------------------------------------------------
// ファミコン風。実機の4チャンネル構成にならって声部を割り当てている。
//   パルス1(25%) … メロディ
//   パルス2(12.5%) … 分散和音／疑似和音
//   三角波        … ベース
//   ノイズ        … ドラム
// 声部を増やしすぎると「8bit風」ではなく、ただの多重奏になってしまう。

const _ = null;

/** コードは隣同士で共通音を残す積み方。 */
const CHORD = {
  Am: [57, 60, 64],   // A3 C4 E4
  Em: [55, 59, 64],   // G3 B3 E4  … Am から 2,1,0 半音
  F:  [57, 60, 65],   // A3 C4 F4  … Em から 2,1,1 半音
  C:  [55, 60, 64],   // G3 C4 E4  … F  から 2,0,1 半音
  G:  [55, 59, 62],   // G3 B3 D4
  E:  [56, 59, 64],   // G#3 B3 E4 … ハーモニックマイナーの緊張
};

const ROOT = { Am: 45, Em: 40, F: 41, C: 48, G: 43, E: 40 };

// --- 通常時 ------------------------------------------------------------------
// やさしいチップチューン。分散和音を敷いて、その上をメロディがゆっくり歩く。
// ボーナスとの落差を作るため、ドラムはキックだけに絞る。

const NORMAL = {
  bpm: 138,
  bars: 8,
  prog: ['Am', 'Em', 'F', 'C', 'Am', 'Em', 'F', 'E'],
  lead: [
    [76,  _,  _,  _, 74,  _, 72,  _, 69,  _,  _,  _, 72,  _,  _,  _],
    [71,  _,  _,  _, 72,  _,  _,  _, 71,  _, 67,  _,  _,  _,  _,  _],
    [69,  _,  _,  _, 72,  _, 74,  _, 77,  _,  _,  _, 74,  _,  _,  _],
    [76,  _,  _,  _, 74,  _,  _,  _, 72,  _,  _,  _,  _,  _, 71,  _],
    [76,  _,  _,  _, 74,  _, 72,  _, 69,  _,  _,  _, 72,  _,  _,  _],  // 主題の再提示
    [71,  _,  _,  _, 72,  _,  _,  _, 74,  _, 76,  _,  _,  _,  _,  _],
    [77,  _,  _,  _, 76,  _, 74,  _, 72,  _,  _,  _, 69,  _, 72,  _],
    [72,  _,  _,  _, 71,  _,  _,  _, 68,  _,  _,  _, 71,  _,  _,  _],  // 68=G# が A へ引っ張る
  ],
  // ルートからの半音差。三角波でゆったり支える
  bass: [0, _, _, _, 7, _, _, _, 0, _, _, _, 7, _, _, _],
  // 8分の分散和音
  arpMask: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
  arpPattern: [0, 1, 2, 1],
  arpDuty: 'pulse12',
  leadDuty: 'pulse25',
  kick:  [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
  snare: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  hat:   [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  gain: 0.9,
  leadHold: 0.8,
  leadTie: true,
  vibrato: 14,
};

// --- 前兆 --------------------------------------------------------------------

const TENSION = {
  bpm: 150,
  bars: 4,
  prog: ['Am', 'Am', 'E', 'E'],
  lead: [
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  ],
  bass: [0, _, _, _, 0, _, _, _, 0, _, _, _, 0, _, 0, 0],
  arpMask: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  arpPattern: [0, 1, 2, 1, 0, 1, 2, 1],
  arpDuty: 'pulse12',
  leadDuty: 'pulse25',
  kick:  [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
  snare: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  hat:   [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 1, 1],
  toms:  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1],
  riser: true,
  gain: 0.8,
  leadHold: 0,
  vibrato: 0,
};

// --- ボーナス ----------------------------------------------------------------
// 16小節。前半8小節(A)で押して、7小節目の駆け上がりから
// 後半8小節(B)で平行調のCに開けて1オクターブ上へ。最後はEでAmへ引き戻す。

const BONUS = {
  bpm: 180,
  bars: 16,
  prog: [
    'Am', 'F', 'G', 'Am', 'Am', 'F', 'G', 'G',          // A：押していく
    'C', 'G', 'Am', 'F', 'F', 'G', 'E', 'E',            // B：明るく開けて、頂点へ
  ],
  lead: [
    // --- A ---
    [ _,  _, 81,  _, 81,  _, 79,  _, 76,  _,  _,  _, 74,  _, 76,  _],
    [77,  _,  _,  _, 76,  _,  _,  _, 74,  _,  _,  _, 72,  _, 74,  _],
    [ _,  _, 79,  _, 79,  _, 77,  _, 74,  _,  _,  _, 71,  _, 74,  _],
    [76,  _,  _,  _, 74,  _,  _,  _, 72,  _, 69,  _, 72,  _, 74,  _],
    [ _,  _, 81,  _, 81,  _, 79,  _, 76,  _,  _,  _, 74,  _, 76,  _],  // 主題の再提示
    [77,  _,  _,  _, 76,  _,  _,  _, 74,  _,  _,  _, 72,  _, 76,  _],
    [ _,  _, 79,  _, 81,  _, 83,  _, 84,  _,  _,  _, 83,  _, 81,  _],
    [79,  _,  _,  _, 81,  _, 83,  _, 84,  _, 86,  _, 88,  _,  _,  _],  // 駆け上がり
    // --- B：ここで世界が開ける ---
    [ _,  _, 88,  _, 88,  _, 86,  _, 84,  _,  _,  _, 83,  _, 84,  _],  // 主題を1オクターブ上で
    [86,  _,  _,  _, 83,  _,  _,  _, 79,  _,  _,  _, 83,  _, 86,  _],
    [ _,  _, 88,  _, 88,  _, 86,  _, 84,  _,  _,  _, 81,  _, 84,  _],
    [86,  _,  _,  _, 84,  _,  _,  _, 81,  _,  _,  _, 77,  _, 81,  _],
    [ _,  _, 81,  _, 84,  _, 86,  _, 88,  _,  _,  _, 86,  _, 84,  _],
    [ _,  _, 83,  _, 86,  _, 88,  _, 89,  _,  _,  _, 88,  _, 86,  _],  // 頂点
    [ _,  _, 88,  _, 86,  _, 84,  _, 80,  _,  _,  _, 83,  _, 86,  _],
    [88,  _,  _,  _,  _,  _, 83,  _, 80,  _, 83,  _, 86,  _, 88,  _],  // 頭へ戻す
  ],
  // 8分でルートとオクターブを往復する、ファミコンらしい走るベース
  bass: [0, _, 12, _, 0, _, 12, _, 0, _, 12, _, 0, _, 12, _],
  // 16分の分散和音。上でメロディが歌う土台になる
  arpMask: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  arpPattern: [0, 1, 2, 3, 2, 1, 0, 1],
  arpDuty: 'pulse12',
  leadDuty: 'pulse25',
  kick:  [1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0],
  snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
  hat:   [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
  sub: true,
  fillBars: [7, 15],          // 区切りの小節末でスネアを連打して煽る
  crashBars: [0, 8],
  /**
   * 小節ごとの厚み。メロディを上げるだけでは盛り上がらないので、
   * 編曲そのものを段階的に変える。
   *   1 … 薄い（分散和音は8分、ハットは4分）
   *   0 … ブレイク（ドラムと分散和音を抜いて穴をあける）
   *   2 … 厚い（分散和音は16分、ハットも16分、メロディをオクターブ重ね）
   */
  density: [1, 1, 1, 1, 1, 1, 1, 0, 2, 2, 2, 2, 2, 2, 2, 2],
  gain: 1.05,
  leadHold: 0.78,
  vibrato: 18,
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

    // リードとコードはローパスを通す。生のノコギリ波は倍音がきつく、
    // 高い音域で耳に刺さる
    this.leadBus = this.ctx.createGain();
    this.leadBus.gain.value = 1;
    this.leadFilter = this.ctx.createBiquadFilter();
    this.leadFilter.type = 'lowpass';
    this.leadFilter.frequency.value = 10000;   // チップチューンは生に近いほうが締まる
    this.leadFilter.Q.value = 0.7;
    this.leadBus.connect(this.leadFilter);
    this.leadFilter.connect(this.musicGain);

    this.musicGain.connect(this.comp);
    this.sfxGain.connect(this.comp);
    this.sfxGain.connect(this.delay);
    this.comp.connect(this.master);
    this.master.connect(this.ctx.destination);

    // パルス波は使い回すので、最初に1回だけ作る
    this.waves = {};
    for (const [name, duty] of Object.entries(PULSE_DUTY)) {
      this.waves[name] = makePulseWave(this.ctx, duty);
    }

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

  /**
   * エンベロープ付きオシレータ。
   * hold に 0..1 を渡すと、その割合だけ音量を保ってから減衰する。
   * 0 のままだと全部が「ポン」と減衰するだけの撥弦音になり、
   * 伸ばすべきメロディが歌わない。
   */
  tone(opts) {
    if (!this.ready) return;
    const {
      f0, f1, type = 'square', t0 = this.now, dur = 0.12,
      gain = 0.3, attack = 0.004, dest = this.sfxGain, detune = 0, hold = 0,
      vibrato = 0,
    } = opts;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    if (this.waves && this.waves[type]) osc.setPeriodicWave(this.waves[type]);
    else osc.type = type;
    osc.detune.value = detune;
    osc.frequency.setValueAtTime(f0, t0);
    if (f1 && f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);

    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
    if (hold > 0) {
      const sustainUntil = t0 + Math.max(attack + 0.005, dur * hold);
      g.gain.setValueAtTime(gain, sustainUntil);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    } else {
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    }

    // 伸ばす音にだけビブラートをかける。チップチューンで音が痩せないための定石
    let lfo = null;
    if (vibrato > 0 && dur > 0.22) {
      lfo = this.ctx.createOscillator();
      const lfoGain = this.ctx.createGain();
      lfo.frequency.value = 5.5;
      lfoGain.gain.setValueAtTime(0, t0);
      lfoGain.gain.setValueAtTime(0, t0 + 0.12);       // 出だしは揺らさない
      lfoGain.gain.linearRampToValueAtTime(vibrato, t0 + Math.min(dur, 0.3));
      lfo.connect(lfoGain);
      lfoGain.connect(osc.detune);
      lfo.start(t0);
      lfo.stop(t0 + dur + 0.03);
    }

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
      // 4/8/16小節どれでも位相が合うよう 256 ステップで回す
      this.step = (this.step + 1) % 256;
    }
  }

  playStep(step, t, stepDur) {
    const track = TRACKS[this.track] || NORMAL;
    const bar = (step >> 4) % track.bars;
    const i = step & 15;
    const name = track.prog[bar];
    const chord = CHORD[name];
    const root = ROOT[name];
    const density = track.density ? track.density[bar] : 1;
    // 薄い→厚いで音量も動かす。これだけでも起伏になる
    const vol = track.gain * (density === 0 ? 0.8 : density === 2 ? 1.12 : 0.88);

    this.playDrums(track, i, bar, t, density, vol);
    this.playBassLine(track, bar, i, root, t, stepDur, density, vol);
    this.playArp(track, i, chord, t, stepDur, density, vol);
    this.playLead(track, bar, i, t, stepDur, density, vol);
  }

  /** ノイズチャンネル担当。ファミコンらしく短く乾いた音にする。 */
  playDrums(track, i, bar, t, density, vol) {
    const g = this.musicGain;

    // ブレイクの小節はキックを抜いて、スネアのロールだけ残す
    if (track.kick[i] && density > 0) {
      // 三角波を一気に落とすのが実機のキックの作り方
      this.tone({ f0: 150, f1: 42, type: 'triangle', dur: 0.13, gain: 0.7 * vol, t0: t, dest: g });
      this.noise({ t0: t, dur: 0.02, gain: 0.16 * vol, freq: 3000, q: 1, type: 'bandpass', dest: g });
    }

    // 区切りの小節末はスネアを連打して煽る
    const fill = track.fillBars && track.fillBars.includes(bar) && i >= 12;
    if (track.snare[i] || fill) {
      const power = fill ? 0.16 + (i - 12) * 0.035 : 0.24;
      this.noise({ t0: t, dur: 0.07, gain: power * vol, freq: 2000, q: 0.8, type: 'bandpass', dest: g });
      this.noise({ t0: t, dur: 0.03, gain: power * 0.7 * vol, freq: 6000, q: 0.7, type: 'highpass', dest: g });
    }
    // 薄い区間はハットを4分に間引き、厚い区間だけ16分で刻む
    const hatOn = density === 2 ? track.hat[i] : density === 1 ? (i % 4 === 0 && track.hat[i]) : 0;
    if (hatOn) {
      this.noise({ t0: t, dur: 0.022, gain: 0.07 * vol, freq: 11000, q: 1.5, type: 'highpass', dest: g });
    }
    if (track.toms && track.toms[i]) {
      this.tone({ f0: 180 + i * 14, f1: 90, type: 'triangle', dur: 0.15, gain: 0.4 * vol, t0: t, dest: g });
    }
    if (track.crashBars && track.crashBars.includes(bar) && i === 0) {
      this.noise({ t0: t, dur: 0.7, gain: 0.15 * vol, freq: 7000, q: 0.6, type: 'highpass', dest: g });
    }
    if (track.riser && i === 0) {
      this.noise({
        t0: t, dur: (60 / this.bpm / 4) * 16, gain: 0.13 * vol,
        freq: 300, sweepTo: 6000, q: 1.4, type: 'bandpass', dest: g,
      });
    }
  }

  /** 三角波チャンネル担当。 */
  playBassLine(track, bar, i, root, t, stepDur, density, vol) {
    const g = this.musicGain;
    const row = Array.isArray(track.bass[0]) ? track.bass[bar % track.bass.length] : track.bass;
    const offset = row[i];

    // 実機には無いが、スマホのスピーカーで痩せないようサブを薄く敷く
    if (track.sub && i === 0) {
      this.tone({
        f0: freq(root - 24), type: 'sine', dur: stepDur * 15,
        gain: 0.26 * vol, t0: t, dest: g, hold: 0.85,
      });
    }
    if (offset === null || offset === undefined) return;

    this.tone({
      f0: freq(root + offset), type: 'triangle', dur: stepDur * 1.5,
      gain: 0.42 * vol, t0: t, dest: g, hold: 0.55,
    });
  }

  /**
   * パルス2チャンネル担当の分散和音。
   * 和音を同時に鳴らさず1音ずつ回すのが、この音楽の手触りそのもの。
   */
  playArp(track, i, chord, t, stepDur, density, vol) {
    if (!track.arpMask || !track.arpMask[i]) return;
    if (density === 0) return;                    // ブレイクでは抜く
    if (density === 1 && i % 2 === 1) return;     // 薄い区間は8分に間引く
    // 何番目に鳴る音かを数えてパターンを進める（拍から外れないように）
    let slot = 0;
    for (let k = 0; k < i; k++) if (track.arpMask[k]) slot++;
    const idx = track.arpPattern[slot % track.arpPattern.length];
    const n = (idx < 3 ? chord[idx] : chord[0] + 12) + 12;
    this.tone({
      f0: freq(n), type: track.arpDuty, dur: stepDur * (density === 1 ? 1.6 : 0.9),
      gain: 0.075 * vol, t0: t, dest: this.leadBus, attack: 0.002,
    });
  }

  /** パルス1チャンネル担当のメロディ。 */
  playLead(track, bar, i, t, stepDur, density, vol) {
    const rows = track.lead;
    const row = rows[bar % rows.length];
    const n = row[i];
    if (n === null) return;

    // 次の音までの長さを測って、そのぶん伸ばす
    const nextRow = rows[(bar + 1) % rows.length];
    const limit = track.leadTie ? 32 : 16;
    let len = 1;
    for (let k = i + 1; k < limit && len < 12; k++) {
      const v = k < 16 ? row[k] : nextRow[k - 16];
      if (v !== null) break;
      len++;
    }
    const dur = stepDur * len * 0.95;

    this.tone({
      f0: freq(n), type: track.leadDuty, dur,
      gain: 0.2 * vol, t0: t, dest: this.leadBus,
      hold: track.leadHold, vibrato: track.vibrato, attack: 0.003,
    });

    // 厚い区間はメロディをオクターブ下で重ねて太くする
    if (density === 2) {
      this.tone({
        f0: freq(n - 12), type: 'pulse50', dur,
        gain: 0.085 * vol, t0: t, dest: this.leadBus,
        hold: track.leadHold, vibrato: track.vibrato, attack: 0.004,
      });
    }
  }
}
