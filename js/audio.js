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

/**
 * コード。ハ長調で明るく。
 * E7 のような借用和音を挟むと、同じ明るさのまま響きが締まる。
 */
const CHORD = {
  // --- Aメロ／通常時。声部が2半音以内で動くように積んである ---
  C:  [60, 64, 67],   // C4 E4 G4
  E7: [59, 64, 68],   // B3 E4 G#4  … G# が借用音。ここが効く
  Am: [60, 64, 69],   // C4 E4 A4
  F:  [60, 65, 69],   // C4 F4 A4
  G:  [59, 62, 67],   // B3 D4 G4
  Em: [59, 64, 67],   // B3 E4 G4
  Dm: [62, 65, 69],   // D4 F4 A4

  // --- サビ。高く広い配置 ---
  Fo:  [60, 65, 72],  // C4 F4 C5
  Go:  [62, 67, 71],  // D4 G4 B4
  Emo: [64, 67, 71],  // E4 G4 B4
  Amo: [64, 69, 72],  // E4 A4 C5
  Dmo: [62, 69, 74],  // D4 A4 D5
  Co:  [64, 67, 72],  // E4 G4 C5

  // --- チャンス（前兆）。半音ずつせり上がる不安定な和音 ---
  Tn1: [57, 60, 64],  // A3 C4 E4   … Am
  Tn2: [58, 61, 64],  // A#3 C#4 E4 … A#dim
  Tn3: [59, 62, 65],  // B3 D4 F4   … Bdim
  Tn4: [60, 64, 70],  // C4 E4 A#4  … C7。解決したがるまま放置する
};

const ROOT = {
  C: 48, E7: 40, Am: 45, F: 41, G: 43, Em: 40, Dm: 38,
  Fo: 41, Go: 43, Emo: 40, Amo: 45, Dmo: 38, Co: 48,
  // 半音ずつ上がって、ループで元に戻る＝永遠に登り続けて聞こえる
  Tn1: 45, Tn2: 46, Tn3: 47, Tn4: 48,
};

// --- 通常時 ------------------------------------------------------------------
// 全部を拍頭の4分音符に置くと行進曲になって間延びする。
// 裏拍から入り、小節ごとに音数を変えてメリハリをつける。

const NORMAL = {
  bpm: 160,
  bpmScale: 24,             // レベルで 160 → 184
  bars: 8,
  prog: ['C', 'Am', 'F', 'G', 'C', 'Am', 'Dm', 'G'],
  lead: [
    [ _,  _, 76,  _, 79,  _,  _,  _, 84,  _,  _,  _,  _,  _,  _,  _],  // 空ける
    [ _,  _, 81, 79, 76,  _, 72,  _, 76,  _,  _,  _,  _,  _,  _,  _],  // 詰める
    [ _,  _, 77,  _, 81,  _, 84,  _,  _,  _, 81,  _,  _,  _,  _,  _],
    [ _,  _, 79, 81, 83,  _, 79,  _, 74,  _,  _,  _,  _,  _,  _,  _],
    [ _,  _, 76,  _, 79,  _,  _,  _, 84,  _, 83,  _, 84,  _,  _,  _],
    [ _,  _, 88,  _, 84,  _, 81,  _, 79,  _, 76,  _,  _,  _,  _,  _],  // 駆け下りる
    [ _,  _, 77,  _, 74,  _, 77,  _, 81,  _,  _,  _,  _,  _,  _,  _],
    [ _,  _, 79,  _, 83,  _, 86,  _, 88,  _,  _,  _, 86,  _, 83,  _],
  ],
  bass: [0, _, _, 0, _, _, 7, _, 12, _, _, 7, _, _, 0, _],
  arpMask: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
  arpPattern: [0, 1, 2, 3, 2, 1, 0, 1],
  arpDuty: 'pulse12',
  leadDuty: 'pulse25',
  kick:  [1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0],
  snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1],
  hat:   [1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 1],
  gain: 0.98,
  leadHold: 0.75,
  leadTie: true,
  vibrato: 14,
  bassGain: 0.66,
  drumGain: 1.05,
};

// --- チャンス（前兆）---------------------------------------------------------
// 「何かが起こりそう」を作る4つの仕掛け。
//   ・ベースが半音ずつ上がり、ループで戻る（終わらない上昇に聞こえる）
//   ・和音を減七・属七で放置して解決させない
//   ・キックを心音のリズムにする
//   ・時計の秒針のような短いチクタクを置いて、あとは空ける

const TENSION = {
  bpm: 158,                 // 通常(160)とほぼ同じ。落とすと失速して聞こえる
  bpmScale: 22,
  bars: 4,
  prog: ['Tn1', 'Tn2', 'Tn3', 'Tn4'],
  lead: [
    [_, _, _, _, 69, _, _, _, 69, _, _, _, 72, _, _, _],
    [_, _, _, _, 70, _, _, _, 70, _, _, _, 73, _, _, _],
    [_, _, _, _, 71, _, _, _, 71, _, _, _, 74, _, _, _],
    [_, _, _, _, 72, _, _, _, 72, _, _, _, 75, _, 76, _],
  ],
  bass: [0, _, _, _, _, _, _, _, 0, _, _, _, _, _, 0, _],
  arpMask: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  arpPattern: [0, 1, 2, 1],
  arpDuty: 'pulse12',
  leadDuty: 'pulse25',
  kick:  [1, 0, 1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0],   // 心音
  snare: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  hat:   [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  tick:  [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],   // 秒針
  toms:  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1],
  tomBars: [3],
  drone: true,
  riser: true,
  gain: 0.9,
  leadHold: 0.4,
  vibrato: 0,
  bassGain: 0.7,
  drumGain: 1.1,
};

// --- ボーナス ----------------------------------------------------------------
// 196 BPM から。Aメロは同音の連打をやめ、裏拍から入って跳ねる形にした。
// E7（借用和音）を挟むと、明るいまま響きが締まって垢抜ける。
// サビはメロディを8音/小節まで詰め、同じリズムを繰り返してフックにする。

const BONUS = {
  bpm: 196,
  bpmScale: 18,             // レベルで 196 → 214
  bars: 16,
  prog: [
    'C', 'E7', 'Am', 'F', 'C', 'E7', 'F', 'G',                 // Aメロ
    'Fo', 'Go', 'Emo', 'Amo', 'Dmo', 'Go', 'Co', 'Go',         // サビ
  ],
  lead: [
    // --- Aメロ：裏拍から入って跳ぶ。同じ音の連打はしない ---
    [ _,  _, 79,  _, 76, 72,  _, 76,  _, 79,  _, 84,  _,  _, 83,  _],
    [ _,  _, 80,  _, 76, 71,  _, 76,  _, 80,  _, 83,  _,  _, 80,  _],  // G#(80)が借用音
    [ _,  _, 81,  _, 76, 72,  _, 76,  _, 81,  _, 84,  _,  _, 88,  _],
    [ _,  _, 86,  _, 84,  _, 81,  _, 77,  _, 81,  _, 84,  _,  _,  _],
    [ _,  _, 79,  _, 76, 72,  _, 76,  _, 79,  _, 84,  _,  _, 83,  _],
    [ _,  _, 80,  _, 76, 71,  _, 76,  _, 80,  _, 83,  _,  _, 80,  _],
    [ _,  _, 84,  _, 81, 77,  _, 81,  _, 84,  _, 89,  _,  _, 88,  _],
    [ _,  _, 86,  _, 83,  _, 86,  _, 88,  _, 89,  _, 91,  _, 93,  _],  // 音階でサビへ
    // --- サビ：8音/小節。同じリズムを繰り返して叩き込む ---
    [ _,  _, 93, 93,  _, 91,  _, 89,  _, 88,  _, 89, 91,  _, 89,  _],
    [ _,  _, 91, 91,  _, 89,  _, 88,  _, 86,  _, 88, 89,  _, 88,  _],
    [ _,  _, 88, 88,  _, 86,  _, 84,  _, 83,  _, 84, 86,  _, 88,  _],
    [ _,  _, 93,  _, 91,  _, 88,  _, 84,  _, 88,  _, 91,  _, 93,  _],
    [ _,  _, 89, 89,  _, 88,  _, 86,  _, 84,  _, 86, 88,  _, 86,  _],
    [ _,  _, 91, 91,  _, 89,  _, 88,  _, 86,  _, 88, 91,  _, 93,  _],
    [ _,  _, 96,  _, 95,  _, 93,  _, 91,  _, 88,  _, 91,  _, 93,  _],  // 最高音 C7
    [ _,  _, 93,  _, 91,  _, 89,  _, 88,  _, 86,  _, 83,  _, 79,  _],
  ],
  // 4つ打ちの隙間を突く16分のガロップ。最後だけ5度を挟んで動かす
  bass: [_, _, 0, 12, _, _, 0, 12, _, _, 0, 12, _, _, 7, 12],
  arpMask: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  arpPattern: [0, 1, 2, 3, 2, 1, 0, 1],
  arpDuty: 'pulse12',
  leadDuty: 'pulse25',
  kick:    [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
  snare:   [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
  hat:     [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  // 表拍を弱く、裏拍を強く叩く。均一に鳴らすとのっぺりする
  hatAccent: [0.5, 0.35, 1, 0.35, 0.5, 0.35, 1, 0.35, 0.5, 0.35, 1, 0.35, 0.5, 0.35, 1, 0.55],
  openHat: [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0],
  sub: true,
  crashBars: [0, 8],
  fillBars: [15],
  density: [1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2],
  gain: 0.96,
  leadHold: 0.7,
  vibrato: 16,
  bassGain: 0.78,
  drumGain: 1.2,
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
    const scale = t.bpmScale !== undefined ? t.bpmScale : 24;
    this.bpm = t.bpm + this.intensity * scale;
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
    // サビでも音量はほぼ据え置き。「ドン！」ではなく抜けで開けたいので、
    // 上がるのは高域の粒（ハット）と和音の音域だけにする
    const vol = track.gain * (density === 2 ? 1.02 : 1);

    this.playDrums(track, i, bar, t, density, vol);
    this.playBassLine(track, bar, i, root, t, stepDur, density, vol);
    this.playArp(track, i, chord, t, stepDur, density, vol);
    this.playLead(track, bar, i, t, stepDur, density, vol);
  }

  /** ノイズチャンネル担当。ファミコンらしく短く乾いた音にする。 */
  playDrums(track, i, bar, t, density, vol) {
    const g = this.musicGain;

    // ブレイクの小節はキックを抜いて、スネアのロールだけ残す
    const dv = vol * (track.drumGain ?? 1);

    if (track.kick[i] && density > 0) {
      // 三角波を一気に落とすのが実機のキックの作り方。
      // 落としきる手前で止めて胴を残し、アタックのクリックを重ねて前に出す
      this.tone({ f0: 170, f1: 46, type: 'triangle', dur: 0.15, gain: 0.85 * dv, t0: t, dest: g });
      this.tone({ f0: 62, type: 'sine', dur: 0.1, gain: 0.5 * dv, t0: t, dest: g, hold: 0.4 });
      this.noise({ t0: t, dur: 0.018, gain: 0.2 * dv, freq: 3400, q: 1, type: 'bandpass', dest: g });
    }

    // 区切りの小節末はスネアを連打して煽る
    const fill = track.fillBars && track.fillBars.includes(bar) && i >= 12;
    if (track.snare[i] || fill) {
      const power = fill ? 0.18 + (i - 12) * 0.035 : 0.3;
      this.noise({ t0: t, dur: 0.09, gain: power * dv, freq: 1700, q: 0.7, type: 'bandpass', dest: g });
      this.noise({ t0: t, dur: 0.04, gain: power * 0.8 * dv, freq: 6000, q: 0.7, type: 'highpass', dest: g });
      this.tone({ f0: 210, f1: 150, type: 'triangle', dur: 0.06, gain: 0.22 * dv, t0: t, dest: g });
    }
    // 薄い区間はハットを4分に間引き、厚い区間だけ16分で刻む
    // サビだけ16分で刻む。増えるのは高域の粒だけなので、
    // 音圧を上げずに「抜けた」印象をつくれる
    const hatOn = density === 2 ? 1 : track.hat[i];
    if (hatOn) {
      // 均一に鳴らすとのっぺりするので、表拍を弱く裏拍を強く叩く
      const accent = track.hatAccent ? track.hatAccent[i] : 1;
      this.noise({
        t0: t, dur: density === 2 ? 0.026 : 0.022,
        gain: (density === 2 ? 0.09 : 0.075) * accent * dv,
        freq: density === 2 ? 12500 : 11000, q: 1.5, type: 'highpass', dest: g,
      });
    }

    // 秒針のようなチクタク。空いた場所に置くと不安になる
    if (track.tick && track.tick[i]) {
      this.noise({ t0: t, dur: 0.012, gain: 0.13 * dv, freq: 9000, q: 3, type: 'bandpass', dest: g });
      this.tone({ f0: 2400, f1: 1800, type: 'pulse12', dur: 0.02, gain: 0.07 * dv, t0: t, dest: g });
    }
    if (track.openHat && track.openHat[i]) {
      this.noise({ t0: t, dur: 0.11, gain: 0.1 * dv, freq: 8500, q: 1.1, type: 'highpass', dest: g });
    }
    if (track.toms && track.toms[i] && (!track.tomBars || track.tomBars.includes(bar))) {
      this.tone({ f0: 180 + i * 14, f1: 90, type: 'triangle', dur: 0.15, gain: 0.4 * vol, t0: t, dest: g });
    }
    if (track.crashBars && track.crashBars.includes(bar) && i === 0) {
      this.noise({ t0: t, dur: 0.7, gain: 0.15 * dv, freq: 7000, q: 0.6, type: 'highpass', dest: g });
    }
    if (track.drone && i === 0) {
      const stepDur = 60 / this.bpm / 4;
      // A1 のペダル音。ベースが半音ずつ上がるので、小節が進むほど
      // このAとぶつかって不協和が増していく
      this.tone({
        f0: freq(33), type: 'triangle', dur: stepDur * 16,
        gain: 0.24 * dv, t0: t, dest: g, hold: 0.9,
      });
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

    const n = root + offset;
    const bv = vol * (track.bassGain ?? 0.42);
    // 三角波だけだと小さいスピーカーで消える。
    // 同じ高さに 25% パルスを重ねて輪郭を出し、1オクターブ下のサイン波で下を支える。
    // 「ベースが効く」は音量より、この3枚重ねの帯域の広さで決まる
    this.tone({
      f0: freq(n), type: 'triangle', dur: stepDur * 1.6,
      gain: bv, t0: t, dest: g, hold: 0.65,
    });
    this.tone({
      f0: freq(n), type: 'pulse25', dur: stepDur * 0.85,
      gain: bv * 0.34, t0: t, dest: g, hold: 0.4,
    });
    this.tone({
      f0: freq(n - 12), type: 'sine', dur: stepDur * 1.4,
      gain: bv * 0.5, t0: t, dest: g, hold: 0.6,
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

    // サビは下に重ねない。低い方を足すと濁って、開けた感じが消えてしまう。
    // 代わりに1オクターブ上をうっすら添えて、きらめきだけを足す
    if (density === 2) {
      this.tone({
        f0: freq(n + 12), type: 'pulse12', dur: dur * 0.9,
        gain: 0.035 * vol, t0: t, dest: this.leadBus,
        hold: track.leadHold, attack: 0.006,
      });
    }
  }
}
