/**
 * 入力管理。
 * - キーボード: DAS/ARR 付きの横移動、ソフトドロップのリピート
 * - タッチ: 盤面のドラッグで移動、下フリックでハードドロップ、タップで回転
 * - 画面ボタン: 押しっぱなしでリピート
 * - ゲームパッド: 方向キーとボタン
 */

export const DEFAULT_SETTINGS = {
  das: 133,     // 横溜め(ms)
  arr: 20,      // 横リピート間隔(ms)
  sdr: 28,      // ソフトドロップ間隔(ms)
  swipeSensitivity: 1,
};

const KEY_MAP = {
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ArrowDown: 'softDrop', KeyS: 'softDrop',
  ArrowUp: 'rotateCW', KeyX: 'rotateCW', KeyW: 'rotateCW',
  KeyZ: 'rotateCCW', ControlLeft: 'rotateCCW', ControlRight: 'rotateCCW',
  KeyQ: 'rotate180',
  Space: 'hardDrop',
  ShiftLeft: 'hold', ShiftRight: 'hold', KeyC: 'hold',
  Escape: 'pause', KeyP: 'pause',
  KeyR: 'restart',
};

export class InputManager {
  constructor(actions, settings = {}) {
    this.actions = actions;
    this.settings = { ...DEFAULT_SETTINGS, ...settings };
    this.held = new Set();
    this.dir = 0;           // -1 / 0 / 1
    this.dasTimer = 0;
    this.arrTimer = 0;
    this.sdTimer = 0;
    this.softHeld = false;
    this.enabled = true;
    this.gamepadPrev = {};
  }

  attach(opts) {
    this.boardEl = opts.boardEl;
    this.getCellSize = opts.getCellSize || (() => 30);

    this.onKeyDown = this.onKeyDown.bind(this);
    this.onKeyUp = this.onKeyUp.bind(this);
    window.addEventListener('keydown', this.onKeyDown, { passive: false });
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', () => this.releaseAll());

    this.attachTouch(opts.touchEl || opts.boardEl);
    this.attachButtons(opts.buttonsRoot);
  }

  releaseAll() {
    this.held.clear();
    this.dir = 0;
    this.softHeld = false;
    this.actions.setSoftDrop(false);
  }

  // --- キーボード -------------------------------------------------------------

  onKeyDown(e) {
    const action = KEY_MAP[e.code];
    if (!action) return;
    // ページのスクロールや検索などを止める
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
      e.preventDefault();
    }
    if (e.repeat) return;
    if (!this.enabled) return;
    this.press(action);
  }

  onKeyUp(e) {
    const action = KEY_MAP[e.code];
    if (!action) return;
    this.release(action);
  }

  press(action) {
    if (this.held.has(action)) return;
    this.held.add(action);
    switch (action) {
      case 'left':
        this.dir = -1;
        this.dasTimer = 0;
        this.arrTimer = 0;
        this.actions.move(-1);
        break;
      case 'right':
        this.dir = 1;
        this.dasTimer = 0;
        this.arrTimer = 0;
        this.actions.move(1);
        break;
      case 'softDrop':
        this.softHeld = true;
        this.sdTimer = 0;
        this.actions.setSoftDrop(true);
        this.actions.softDrop();
        break;
      case 'rotateCW': this.actions.rotate(1); break;
      case 'rotateCCW': this.actions.rotate(-1); break;
      case 'rotate180': this.actions.rotate(2); break;
      case 'hardDrop': this.actions.hardDrop(); break;
      case 'hold': this.actions.hold(); break;
      case 'pause': this.actions.pause(); break;
      case 'restart': this.actions.restart(); break;
    }
  }

  release(action) {
    this.held.delete(action);
    if (action === 'left' && this.dir === -1) {
      this.dir = this.held.has('right') ? 1 : 0;
      this.dasTimer = 0;
    }
    if (action === 'right' && this.dir === 1) {
      this.dir = this.held.has('left') ? -1 : 0;
      this.dasTimer = 0;
    }
    if (action === 'softDrop') {
      this.softHeld = false;
      this.actions.setSoftDrop(false);
    }
  }

  /** 毎フレーム呼んで DAS/ARR を進める。 */
  update(dt) {
    if (this.dir !== 0) {
      this.dasTimer += dt;
      if (this.dasTimer >= this.settings.das) {
        this.arrTimer += dt;
        const arr = Math.max(this.settings.arr, 1);
        while (this.arrTimer >= arr) {
          this.arrTimer -= arr;
          if (!this.actions.move(this.dir)) break;
        }
      }
    }
    if (this.softHeld) {
      this.sdTimer += dt;
      const sdr = Math.max(this.settings.sdr, 1);
      while (this.sdTimer >= sdr) {
        this.sdTimer -= sdr;
        if (!this.actions.softDrop()) break;
      }
    }
    this.pollGamepad();
  }

  // --- タッチ -----------------------------------------------------------------

  attachTouch(el) {
    if (!el) return;
    let active = false;
    let id = null;
    let startX = 0, startY = 0, lastX = 0, lastY = 0;
    let startTime = 0;
    let movedCells = 0;
    let droppedCells = 0;
    let moved = false;
    let hardDropped = false;

    const down = (e) => {
      if (!this.enabled) return;
      if (active) return;
      const t = e.changedTouches ? e.changedTouches[0] : e;
      active = true;
      id = t.identifier ?? 'mouse';
      startX = lastX = t.clientX;
      startY = lastY = t.clientY;
      startTime = performance.now();
      movedCells = 0;
      droppedCells = 0;
      moved = false;
      hardDropped = false;
      e.preventDefault();
    };

    const move = (e) => {
      if (!active) return;
      const t = this.findTouch(e, id);
      if (!t) return;
      e.preventDefault();
      const cell = this.getCellSize();
      const stepX = Math.max(14, cell * 0.62 / this.settings.swipeSensitivity);
      const stepY = Math.max(16, cell * 0.75 / this.settings.swipeSensitivity);

      const dx = t.clientX - startX;
      const dy = t.clientY - startY;

      // 横移動：累積量からセル単位で追従させる
      const targetCells = Math.trunc(dx / stepX);
      while (movedCells !== targetCells) {
        const step = targetCells > movedCells ? 1 : -1;
        this.actions.move(step);
        movedCells += step;
        moved = true;
      }

      // 下方向：ゆっくり下げればソフトドロップ
      if (dy > 0 && Math.abs(dx) < Math.abs(dy)) {
        const targetDrop = Math.trunc(dy / stepY);
        while (droppedCells < targetDrop) {
          this.actions.softDrop();
          droppedCells++;
          moved = true;
        }
      }

      lastX = t.clientX;
      lastY = t.clientY;
    };

    const up = (e) => {
      if (!active) return;
      const t = this.findTouch(e, id) || { clientX: lastX, clientY: lastY };
      active = false;
      e.preventDefault();
      const dt = performance.now() - startTime;
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      const dist = Math.hypot(dx, dy);
      const cell = this.getCellSize();

      // 素早い下フリック → ハードドロップ
      if (!hardDropped && dy > cell * 1.6 && dt < 260 && Math.abs(dx) < Math.abs(dy)) {
        this.actions.hardDrop();
        return;
      }
      // 上フリック → ホールド
      if (dy < -cell * 1.4 && dt < 320 && Math.abs(dx) < Math.abs(dy)) {
        this.actions.hold();
        return;
      }
      // 動いていない短いタップ → 回転
      if (!moved && dist < cell * 0.5 && dt < 300) {
        const rect = el.getBoundingClientRect();
        const leftSide = (t.clientX - rect.left) < rect.width * 0.32;
        this.actions.rotate(leftSide ? -1 : 1);
      }
    };

    el.addEventListener('touchstart', down, { passive: false });
    el.addEventListener('touchmove', move, { passive: false });
    el.addEventListener('touchend', up, { passive: false });
    el.addEventListener('touchcancel', up, { passive: false });
    // マウスでも同じ操作を試せるように
    el.addEventListener('pointerdown', (e) => { if (e.pointerType === 'mouse') down(e); });
    el.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') move(e); });
    el.addEventListener('pointerup', (e) => { if (e.pointerType === 'mouse') up(e); });
  }

  findTouch(e, id) {
    if (!e.changedTouches) return e;
    for (const t of e.changedTouches) {
      if ((t.identifier ?? 'mouse') === id) return t;
    }
    return null;
  }

  // --- 画面ボタン -------------------------------------------------------------

  attachButtons(root) {
    if (!root) return;
    const buttons = root.querySelectorAll('[data-action]');
    for (const btn of buttons) {
      const action = btn.dataset.action;
      const repeat = btn.dataset.repeat === 'true';
      let timer = null;
      let delay = null;

      const start = (e) => {
        e.preventDefault();
        if (!this.enabled) return;
        btn.classList.add('is-pressed');
        this.fire(action);
        if (repeat) {
          delay = setTimeout(() => {
            timer = setInterval(() => this.fire(action), action === 'softDrop' ? 45 : 55);
          }, 170);
        }
      };
      const end = (e) => {
        if (e) e.preventDefault();
        btn.classList.remove('is-pressed');
        if (delay) { clearTimeout(delay); delay = null; }
        if (timer) { clearInterval(timer); timer = null; }
      };

      btn.addEventListener('pointerdown', start);
      btn.addEventListener('pointerup', end);
      btn.addEventListener('pointerleave', end);
      btn.addEventListener('pointercancel', end);
      btn.addEventListener('contextmenu', (e) => e.preventDefault());
    }
  }

  fire(action) {
    switch (action) {
      case 'left': this.actions.move(-1); break;
      case 'right': this.actions.move(1); break;
      case 'softDrop': this.actions.softDrop(); break;
      case 'hardDrop': this.actions.hardDrop(); break;
      case 'rotateCW': this.actions.rotate(1); break;
      case 'rotateCCW': this.actions.rotate(-1); break;
      case 'hold': this.actions.hold(); break;
      case 'pause': this.actions.pause(); break;
      case 'restart': this.actions.restart(); break;
    }
  }

  // --- ゲームパッド -----------------------------------------------------------

  pollGamepad() {
    if (!navigator.getGamepads) return;
    const pads = navigator.getGamepads();
    for (const pad of pads) {
      if (!pad) continue;
      const b = pad.buttons;
      const axH = pad.axes[0] || 0;
      const map = {
        left: (b[14] && b[14].pressed) || axH < -0.5,
        right: (b[15] && b[15].pressed) || axH > 0.5,
        softDrop: (b[13] && b[13].pressed) || (pad.axes[1] || 0) > 0.5,
        hardDrop: b[12] && b[12].pressed,
        rotateCW: (b[0] && b[0].pressed) || (b[3] && b[3].pressed),
        rotateCCW: (b[1] && b[1].pressed) || (b[2] && b[2].pressed),
        hold: (b[4] && b[4].pressed) || (b[5] && b[5].pressed),
        pause: b[9] && b[9].pressed,
      };
      for (const [action, pressed] of Object.entries(map)) {
        const key = `${pad.index}:${action}`;
        const was = this.gamepadPrev[key];
        if (pressed && !was) this.press(action);
        if (!pressed && was) this.release(action);
        this.gamepadPrev[key] = pressed;
      }
      break; // 1台目のみ
    }
  }
}
