/**
 * パチスロ風の演出ディレクター。
 *
 * エンジンのイベントを受けて「前兆 → レバーON → フリーズ → リール →
 * テンパイ → 昇格 → ボーナス」という一連の流れを組み立てる。
 * ゲーム進行を止める必要がある演出（フリーズ）と、一瞬だけ止める
 * ヒットストップの2種類を持つ。
 */

/** リール帯。滑る（スベる）と 青7 → 赤7 → 虹7 と昇格するように並べてある。 */
export const REEL_STRIP = [
  'cherry', 'blue7', 'red7', 'rainbow7', 'bell', 'melon', 'bar', 'replay',
];

export const SYMBOL_LABEL = {
  blue7: '7', red7: '7', rainbow7: '7',
  bar: 'BAR', bell: '🔔', cherry: '🍒', melon: '🍉', replay: 'RE',
};

const IDX = Object.fromEntries(REEL_STRIP.map((s, i) => [s, i]));

/** ボーナス種別ごとの、中リールが最終的に止まる図柄。 */
const GOAL_SYMBOL = { reg: 'blue7', big: 'red7', premium: 'rainbow7' };

/** 保留（NEXTの予告）ランク。数字が大きいほど期待度が高い。 */
export const HOLD_RANKS = ['white', 'blue', 'green', 'red', 'rainbow'];
const HOLD_COLORS = ['#9fb3d9', '#3aa0ff', '#2bdd6e', '#ff3465', '#ffdc23'];

/** コンボ数に応じたステップアップ予告の段数。 */
function stepOf(combo) {
  if (combo >= 7) return 4;
  if (combo >= 5) return 3;
  if (combo >= 3) return 2;
  if (combo >= 1) return 1;
  return 0;
}

export class Director {
  constructor(deps) {
    this.game = deps.game;
    this.fx = deps.effects;
    this.audio = deps.audio;
    this.ui = deps.ui;                  // DOM 操作をまとめたヘルパー
    this.settings = deps.settings;
    this.vibrate = deps.vibrate || (() => {});
    this.reset();
  }

  reset() {
    this.timeline = [];
    this.clock = 0;
    this.blocking = false;     // フリーズ中（操作も落下も止まる）
    this.hitStop = 0;          // ヒットストップ残り(ms)
    this.slow = 1;             // スロー演出の倍率
    this.holds = [];
    this.lastStep = 0;
    this.zenchou = false;      // 前兆中か
    this.reels = [0, 1, 2].map(() => ({ pos: 0, speed: 0, state: 'idle', target: 0 }));
    this.reelVisible = false;
    this.pendingKind = null;
    this.ui.hideAll();
    this.syncHolds();     // NEXT の本数ぶん保留を用意しておく
  }

  // --- タイムライン ----------------------------------------------------------

  /** delay ミリ秒後に fn を実行する。 */
  at(delay, fn) {
    this.timeline.push({ at: this.clock + delay, fn });
    return this;
  }

  clearTimeline() {
    this.timeline.length = 0;
  }

  /** 画面を止める。ヒットストップはゲームだけ止めて演出は少し動かす。 */
  stop(ms) {
    if (!this.settings.hitstop) return;
    this.hitStop = Math.max(this.hitStop, ms);
  }

  get paused() { return this.blocking || this.hitStop > 0; }

  update(dt) {
    this.clock += dt;
    if (this.hitStop > 0) this.hitStop = Math.max(0, this.hitStop - dt);

    // 予約された演出を実行
    if (this.timeline.length) {
      const due = [];
      for (let i = this.timeline.length - 1; i >= 0; i--) {
        if (this.timeline[i].at <= this.clock) due.push(...this.timeline.splice(i, 1));
      }
      due.sort((a, b) => a.at - b.at);
      for (const item of due) item.fn();
    }

    if (this.reelVisible) this.updateReels(dt);
    this.updateZenchou();
  }

  // --- 前兆 -----------------------------------------------------------------

  /** ゲージが溜まってくると告知ランプが点滅し、BGM が前兆に変わる。 */
  updateZenchou() {
    const g = this.game;
    const hot = !g.bonus && !g.chanceLocked && g.chance >= 62;
    if (hot !== this.zenchou) {
      this.zenchou = hot;
      this.ui.setLamp(hot ? 'zenchou' : 'off');
      if (!g.bonus) this.audio.setTrack(hot ? 'tension' : 'normal');
      if (hot) {
        this.ui.showCutIn('チャンス', 'sub');
        this.audio.sfxStepUp(1);
      }
    }
  }

  // --- 保留（NEXT の予告） ---------------------------------------------------

  /** 新しく積まれるミノの保留ランクを抽選する。ゲージが高いほど熱い。 */
  rollHold() {
    const boost = this.game.chance / 100;
    const r = Math.random();
    if (r < 0.006 + boost * 0.012) return 4;   // 虹＝ボーナス確定
    if (r < 0.03 + boost * 0.06) return 3;     // 赤
    if (r < 0.09 + boost * 0.12) return 2;     // 緑
    if (r < 0.22 + boost * 0.18) return 1;     // 青
    return 0;                                   // 白
  }

  syncHolds() {
    const need = this.game.nextQueue.length;
    while (this.holds.length < need) this.holds.push(this.rollHold());
    this.holds.length = need;
    this.ui.setHolds(this.holds, HOLD_COLORS);
  }

  /** ミノが出てきたので保留をひとつ進める。 */
  advanceHold() {
    const used = this.holds.shift() ?? 0;
    const added = this.rollHold();
    this.holds.push(added);
    this.ui.setHolds(this.holds, HOLD_COLORS);
    this.ui.setActiveHold(used, HOLD_COLORS[used]);

    if (added >= 1) {
      this.audio.sfxHoldChange(added);
      this.ui.flashHoldSlot(this.holds.length - 1, HOLD_COLORS[added]);
    }
    if (added >= 3) {
      this.fx.addShake(6, 0.006);
      this.fx.addFlash(0.16, HOLD_COLORS[added]);
      this.vibrate(18);
    }
    // 虹保留はボーナス確定
    if (added === 4) {
      this.ui.showCutIn('虹保留 確定！', 'rainbow');
      this.fx.addRays({ color: '#ffffff', life: 900, count: 30 });
      this.audio.sfxKakutei(3);
      this.game.triggerLottery('premium');
    } else if (used >= 3) {
      // 赤保留のミノが降りてきたらゲージを大きく押し上げる
      this.game.addChance(28);
      this.ui.showCutIn('激アツ', 'hot');
      this.audio.sfxCutIn();
      this.fx.addShake(10, 0.012);
    }
  }

  // --- リール ---------------------------------------------------------------

  updateReels(dt) {
    const N = REEL_STRIP.length;
    for (const r of this.reels) {
      if (r.state === 'spin') {
        r.pos = (r.pos + r.speed * dt) % N;
      } else if (r.state === 'stopping') {
        // 目標へ寄せて、行き過ぎてから戻る（機械っぽさ）
        const diff = r.target - r.pos;
        r.pos += diff * Math.min(1, dt / 55);
        if (Math.abs(diff) < 0.004) { r.pos = r.target; r.state = 'stopped'; }
      }
    }
    this.ui.setReels(this.reels.map((r) => r.pos));
  }

  /** そのリールを図柄 symbol で止める。周回ぶんを足して自然に見せる。 */
  stopReel(i, symbol, extraTurns = 1) {
    const N = REEL_STRIP.length;
    const r = this.reels[i];
    const base = Math.floor(r.pos / N) * N;
    let target = base + IDX[symbol];
    while (target < r.pos + N * extraTurns) target += N;
    r.target = target;
    r.state = 'stopping';
  }

  /** 止まっているリールを1コマだけ滑らせる（スベリ＝昇格演出）。 */
  slipReel(i, symbol) {
    const N = REEL_STRIP.length;
    const r = this.reels[i];
    const base = Math.floor(r.pos / N) * N;
    let target = base + IDX[symbol];
    while (target <= r.pos + 0.01) target += N;
    r.target = target;
    r.state = 'stopping';
  }

  // --- ボーナス抽選の演出本体 -------------------------------------------------

  /**
   * ゲージ満タン → フリーズ → リール → 昇格 → ボーナス開始。
   * 最低保証は REG。中リールがスベるほど上位になる。
   */
  runLottery(kind) {
    if (this.blocking) return;
    this.pendingKind = kind;
    this.clearTimeline();
    this.blocking = true;
    this.clock = 0;
    const goal = GOAL_SYMBOL[kind] || 'blue7';
    const rank = kind === 'premium' ? 3 : kind === 'big' ? 2 : 1;

    // --- 0ms: フリーズ ---
    this.audio.setTrack('tension');
    this.audio.stopMusic();
    this.audio.sfxFreeze();
    this.fx.whiteOut(1, 0);
    this.fx.addShake(34, 0.05);
    this.fx.addPunch(0.22);
    this.vibrate([0, 90, 40, 140]);
    this.ui.setLamp('hit');

    this.at(260, () => {
      this.fx.clearWhite(4);
      this.fx.addRays({ color: '#8fd8ff', life: 1200, count: 24 });
      this.ui.showReels();
      this.reelVisible = true;
      this.audio.sfxLever();
      this.ui.setReelCaption('レバーON！');
    });

    this.at(460, () => {
      for (const r of this.reels) { r.state = 'spin'; r.speed = 0.022 + Math.random() * 0.004; }
      this.audio.sfxReelSpin();
      this.ui.setReelCaption('');
    });

    // --- 左・右が止まってテンパイ ---
    this.at(1250, () => {
      this.stopReel(0, 'blue7', 1);
      this.audio.sfxReelStop(0);
      this.fx.addShake(7, 0.006);
      this.stop(70);
    });

    this.at(1720, () => {
      this.stopReel(2, 'blue7', 1);
      this.audio.sfxReelStop(1);
      this.fx.addShake(11, 0.01);
      this.stop(110);
    });

    this.at(1960, () => {
      // テンパイ！ここから溜める
      this.ui.setReelCaption('テンパイ！');
      this.audio.sfxTenpai();
      this.fx.addRays({ color: '#ffd166', life: 2200, count: 34, spin: 0.0012 });
      this.fx.addShake(6, 0.004);
      this.ui.setLamp('tenpai');
      this.vibrate([0, 30, 60, 30, 60, 30]);
      for (const r of this.reels) if (r.state === 'spin') r.speed = 0.012;
    });

    // --- 中リール停止 ---
    const stopAt = 3100;
    this.at(stopAt, () => {
      this.stopReel(1, 'blue7', 1);
      this.audio.sfxReelStop(2);
      this.fx.addShake(16, 0.016);
      this.fx.addFlash(0.3, '#8fd8ff');
      this.stop(160);
      this.ui.setReelCaption(rank === 1 ? '' : '');
    });

    if (rank === 1) {
      // REG 確定
      this.at(stopAt + 420, () => this.finishLottery('reg', 1));
    } else {
      // スベって赤7へ昇格
      this.at(stopAt + 460, () => {
        this.ui.setReelCaption('…！？');
        this.audio.sfxStepUp(3);
        this.fx.addShake(9, 0.008);
      });
      this.at(stopAt + 760, () => {
        this.slipReel(1, 'red7');
        this.audio.sfxReelStop(3);
        this.audio.sfxCutIn();
        this.ui.showCutIn('昇格！', 'hot');
        this.fx.addShake(26, 0.03);
        this.fx.addPunch(0.14);
        this.fx.addFlash(0.5, '#ff6a3c');
        this.stop(220);
        this.vibrate([0, 60, 40, 90]);
      });

      if (rank === 2) {
        this.at(stopAt + 1320, () => this.finishLottery('big', 2));
      } else {
        // さらにもう1コマ滑って虹7（ロングフリーズ）
        this.at(stopAt + 1380, () => {
          this.ui.setReelCaption('まだ止まらない…');
          this.fx.addRays({ color: '#ffffff', life: 1600, count: 40, spin: 0.002 });
          this.audio.sfxTenpai();
          this.fx.addShake(12, 0.014);
        });
        this.at(stopAt + 1980, () => {
          this.slipReel(1, 'rainbow7');
          this.audio.sfxReelStop(5);
          this.audio.sfxKakutei(3);
          this.ui.showCutIn('虹 確定', 'rainbow');
          this.fx.whiteOut(1, 0);
          this.fx.addShake(52, 0.07);
          this.fx.addPunch(0.3);
          this.stop(320);
          this.vibrate([0, 120, 50, 200]);
        });
        this.at(stopAt + 2420, () => {
          this.fx.clearWhite(2.4);
          this.finishLottery('premium', 3);
        });
      }
    }
  }

  /** リールが揃った。確定音を鳴らしてボーナスへ。 */
  finishLottery(kind, rank) {
    this.audio.sfxKakutei(rank);
    this.ui.setReelCaption(kind === 'reg' ? 'REGULAR BONUS' : kind === 'big' ? 'BIG BONUS' : 'PREMIUM BONUS');
    this.fx.addFlash(0.7, '#ffffff');
    this.fx.addShake(30 + rank * 10, 0.03 + rank * 0.012);
    this.fx.addPunch(0.18 + rank * 0.05);
    this.fx.addRays({ color: '#ffffff', life: 1100, count: 30 + rank * 8 });
    this.stop(240);

    this.at(900, () => {
      this.reelVisible = false;
      this.ui.hideReels();
      this.blocking = false;
      this.game.startBonus(kind);
    });
  }

  // --- エンジンイベント -------------------------------------------------------

  handle(type, data) {
    switch (type) {
      case 'start':
        this.holds = [];
        this.syncHolds();
        this.audio.setTrack('normal');
        break;

      case 'spawn':
        this.advanceHold();
        break;

      case 'lottery':
        this.runLottery(data.kind);
        break;

      case 'lotteryUpgrade':
        this.pendingKind = data.kind;
        break;

      case 'harddrop':
        // 毎回起きる操作なので短く。長いと操作がもたつく
        this.stop(Math.min(45, 12 + data.distance * 1.7));
        break;

      case 'clearStart':
        this.onClear(data);
        break;

      case 'bonusStart':
        this.onBonusStart(data);
        break;

      case 'bonusAdd':
        this.onUwanose(data);
        break;

      case 'bonusGame':
        this.ui.setBonusGames(data.games, this.game.bonus);
        if (data.games <= 5 && data.games > 0) {
          this.ui.pulseBonusGames();
          this.audio.sfxStepUp(1);
        }
        break;

      case 'bonusEnd':
        this.onBonusEnd(data);
        break;

      case 'gameover':
        this.clearTimeline();
        this.blocking = false;
        this.hitStop = 0;
        this.reelVisible = false;
        this.ui.hideAll();
        break;
    }
  }

  /** ライン消去時：ヒットストップとステップアップ予告。 */
  onClear(info) {
    const { count, tspin, perfect, combo } = info;
    // 派手さに応じて画面を止める
    let ms = 40 + count * 26;
    if (tspin) ms += 70;
    if (count === 4) ms += 60;
    if (perfect) ms = 340;
    this.stop(ms);

    this.fx.addPunch(0.05 + count * 0.022 + (perfect ? 0.14 : 0));

    // ステップアップ予告（通常時のみ。ボーナス中は上乗せが主役）
    if (!this.game.bonus) {
      const step = stepOf(combo);
      if (step > 0 && step !== this.lastStep) {
        this.lastStep = step;
        this.ui.showStepUp(step);
        this.audio.sfxStepUp(step);
        this.fx.addShake(4 + step * 3, 0.004 * step);
        if (step >= 3) {
          this.fx.addRays({ color: step >= 4 ? '#ff3465' : '#2bdd6e', life: 800, count: 22 });
          this.vibrate([0, 30, 30, 50]);
        }
      }
      if (combo === 0) this.lastStep = 0;
    }
  }

  onBonusStart(b) {
    this.audio.setTrack('bonus');
    if (this.settings.music) this.audio.startMusic();
    this.audio.sfxPayout(14);
    this.ui.showBonusHud(b);
    this.ui.setLamp(b.kind);
    this.ui.showCutIn(b.label, b.kind === 'premium' ? 'rainbow' : b.kind === 'big' ? 'hot' : 'sub');
    this.fx.addRays({ color: '#ffffff', life: 1400, count: 36 });
    this.fx.addShake(26, 0.028);
    this.vibrate([0, 80, 50, 80, 50, 160]);
  }

  /** 上乗せ。G数が乗るほど派手にする。 */
  onUwanose(data) {
    const big = data.amount >= 30;
    const huge = data.amount >= 80;
    this.ui.showUwanose(data.amount, huge ? 'rainbow' : big ? 'hot' : 'normal');
    this.ui.setBonusGames(data.games, this.game.bonus);
    this.audio.sfxUwanose(data.amount);
    this.fx.addShake(6 + Math.min(30, data.amount), 0.004 + Math.min(0.03, data.amount * 0.0008));
    this.fx.addPunch(0.04 + Math.min(0.18, data.amount * 0.004));
    if (big) {
      this.fx.addRays({ color: huge ? '#ffffff' : '#ffd166', life: 900, count: 26 });
      this.fx.addFlash(0.3, '#ffd166');
      this.stop(huge ? 260 : 150);
      this.vibrate(huge ? [0, 80, 40, 120] : [0, 40, 30, 60]);
    }
  }

  onBonusEnd(result) {
    this.audio.setTrack(this.zenchou ? 'tension' : 'normal');
    this.audio.sfxBonusEnd();
    this.audio.sfxPayout(Math.min(26, result.medals / 40));
    this.ui.hideBonusHud();
    this.ui.setLamp('off');
    this.ui.showResultBanner(result);
    this.fx.addFlash(0.35, '#ffdc23');
    this.stop(180);
  }
}
