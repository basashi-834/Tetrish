/** localStorage の薄いラッパ。プライベートブラウジングでも落ちないように握り潰す。 */

const KEY = 'tetrish.v1';

const DEFAULTS = {
  best: 0,
  bestLines: 0,
  plays: 0,
  settings: {
    music: true,
    sfx: true,
    vibrate: true,
    ghost: true,
    shake: true,
    quality: 'high',
    das: 133,
    arr: 20,
    swipe: 1,
    startLevel: 1,
  },
};

/** 既定値の複製（古い Safari でも動くよう structuredClone は使わない）。 */
const clone = (o) => JSON.parse(JSON.stringify(o));

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return clone(DEFAULTS);
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULTS,
      ...parsed,
      settings: { ...DEFAULTS.settings, ...(parsed.settings || {}) },
    };
  } catch (e) {
    return clone(DEFAULTS);
  }
}

function write(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch (e) { /* 容量オーバーや無効化時は諦める */ }
}

export const store = {
  data: read(),
  save() { write(this.data); },
  get settings() { return this.data.settings; },
  setSetting(key, value) {
    this.data.settings[key] = value;
    this.save();
  },
  recordGame(score, lines) {
    this.data.plays++;
    let isBest = false;
    if (score > this.data.best) {
      this.data.best = score;
      isBest = true;
    }
    if (lines > this.data.bestLines) this.data.bestLines = lines;
    this.save();
    return isBest;
  },
  clearBest() {
    this.data.best = 0;
    this.data.bestLines = 0;
    this.save();
  },
};
