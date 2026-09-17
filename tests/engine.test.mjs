/**
 * ゲームエンジンのテスト。ブラウザなしで動く。
 *   node --test tests/
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, COLS, ROWS, HIDDEN_ROWS } from '../js/game.js';
import { SHAPES, PIECE_TYPES, getKicks } from '../js/pieces.js';

/** イベントを記録するゲームを作る。 */
function makeGame() {
  const events = [];
  const game = new Game({ emit: (type, data) => events.push({ type, data }) });
  game.start();
  return { game, events, last: (t) => events.filter((e) => e.type === t).pop() };
}

/** 消去演出が終わるまで進める。 */
function settle(game, ms = 600) {
  for (let i = 0; i < ms / 16.7; i++) game.update(16.7);
}

function fillRow(game, y, except = []) {
  for (let x = 0; x < COLS; x++) game.board[y][x] = 'J';
  for (const x of except) game.board[y][x] = 0;
}

test('ピース定義がすべて4セルで、回転状態を4つ持つ', () => {
  for (const type of PIECE_TYPES) {
    assert.equal(SHAPES[type].length, 4, `${type} の回転状態`);
    for (const cells of SHAPES[type]) {
      assert.equal(cells.length, 4, `${type} のセル数`);
    }
  }
});

test('Oミノは回転しても形が変わらない', () => {
  const key = (cells) => cells.map((c) => `${c.x},${c.y}`).sort().join('|');
  const base = key(SHAPES.O[0]);
  for (let r = 1; r < 4; r++) assert.equal(key(SHAPES.O[r]), base);
});

test('7bag: 7個ごとに全種類がちょうど1回ずつ出る', () => {
  const game = new Game({});
  game.bag = [];            // 袋の切れ目に揃えてから数える
  const drawn = [];
  for (let i = 0; i < 70; i++) drawn.push(game.pullFromBag());
  for (let i = 0; i < 10; i++) {
    const chunk = drawn.slice(i * 7, i * 7 + 7).sort();
    assert.deepEqual(chunk, PIECE_TYPES.slice().sort(), `${i}袋目`);
  }
});

test('1ライン消すと SINGLE として得点し、行が詰まる', () => {
  const { game, last } = makeGame();
  const y = ROWS - 1;
  fillRow(game, y, [4, 5]);
  game.piece = game.makePiece('O');
  game.piece.x = 4;
  game.hardDrop();
  assert.equal(game.state, 'clearing');
  settle(game);

  const cleared = last('cleared');
  assert.equal(cleared.data.count, 1);
  assert.equal(cleared.data.label, 'SINGLE');
  assert.equal(game.lines, 1);
  // 消えた行より上にあった O ミノの残り2セルが落ちてくる
  const bottom = game.board[y];
  assert.deepEqual(
    bottom.map((v) => (v ? 1 : 0)),
    [0, 0, 0, 0, 1, 1, 0, 0, 0, 0],
    '残ったブロックが1段落ちている'
  );
  assert.ok(game.board[y - 1].every((v) => v === 0), 'その上は空');
});

test('TETRIS を連続で決めると BACK-TO-BACK で 1.5 倍になる', () => {
  const { game, last } = makeGame();
  const digWell = () => {
    for (let y = ROWS - 4; y < ROWS; y++) fillRow(game, y, [0]);
  };
  const dropI = () => {
    game.state = 'playing';
    game.piece = game.makePiece('I');
    game.piece.rotation = 1;
    game.piece.x += 0 - game.cellsOf(game.piece)[0].x;
    game.hardDrop();
    settle(game);
  };

  digWell();
  dropI();
  const first = last('cleared').data;
  assert.equal(first.count, 4);
  assert.equal(first.label, 'TETRIS');
  assert.equal(first.b2b, 0, '1回目は B2B ではない');

  digWell();
  dropI();
  const second = last('cleared').data;
  assert.equal(second.b2b, 1, '2回目は B2B');
  assert.equal(second.combo, 1, 'コンボも継続する');
  assert.ok(second.score > first.score, 'B2B のほうが高得点');
});

test('コンボが途切れると combo が -1 に戻る', () => {
  const { game } = makeGame();
  fillRow(game, ROWS - 1, [4, 5]);
  game.piece = game.makePiece('O');
  game.piece.x = 4;
  game.hardDrop();
  settle(game);
  assert.equal(game.combo, 0, '1回目の消去でコンボ0（=1連鎖目）');

  // ラインを消さずに置く
  game.state = 'playing';
  game.piece = game.makePiece('O');
  game.piece.x = 0;
  game.hardDrop();
  settle(game);
  assert.equal(game.combo, -1);
});

test('盤面が空になれば PERFECT CLEAR', () => {
  const { game, last } = makeGame();
  for (const y of [ROWS - 1, ROWS - 2]) fillRow(game, y, [4, 5]);
  game.piece = game.makePiece('O');
  game.piece.x = 4;
  game.hardDrop();
  settle(game);

  const cleared = last('cleared').data;
  assert.equal(cleared.count, 2);
  assert.equal(cleared.perfect, true);
  assert.ok(game.board.every((row) => row.every((v) => v === 0)));
});

test('Tミノを回転でねじ込むと T-Spin と判定される', () => {
  const { game } = makeGame();
  const bottom = ROWS - 1;
  // 3隅が埋まった窪みを作る
  for (const y of [bottom, bottom - 1]) fillRow(game, y);
  game.board[bottom - 1][4] = 0;
  game.board[bottom - 1][3] = 'J';
  game.board[bottom - 1][5] = 'J';
  game.board[bottom - 2] = new Array(COLS).fill(0);
  game.board[bottom - 2][3] = 'J';
  game.board[bottom - 2][5] = 'J';

  game.piece = game.makePiece('T');
  game.piece.x = 3;
  game.piece.y = bottom - 2;
  game.piece.rotation = 2;
  game.lastAction = 'rotate';
  game.lastKickIndex = 4;

  const spin = game.detectTSpin();
  assert.equal(spin.tspin, true);
});

test('壁際でも SRS のキックで回転できる', () => {
  const game = new Game({});
  game.start();
  game.piece = game.makePiece('I');
  game.piece.x = 0;
  game.piece.rotation = 0;
  assert.equal(game.rotate(1), true, '左端でのI回転');

  game.piece = game.makePiece('T');
  game.piece.x = COLS - 3;
  assert.equal(game.rotate(-1), true, '右端でのT回転');
});

test('ホールドは1ピースにつき1回だけ', () => {
  const { game } = makeGame();
  const first = game.piece.type;
  assert.equal(game.holdPiece(), true);
  assert.equal(game.hold, first);
  assert.equal(game.holdPiece(), false, '同じピースで2回目は不可');

  // 固定すればまた使える
  game.hardDrop();
  settle(game);
  assert.equal(game.holdUsed, false);
});

test('ハードドロップは落下距離ぶん加点される', () => {
  const { game } = makeGame();
  game.piece = game.makePiece('O');
  const before = game.score;
  const startY = game.piece.y;
  game.hardDrop();
  const distance = ROWS - 2 - startY;
  assert.equal(game.score - before, distance * 2);
});

test('出現位置が埋まっているとゲームオーバー', () => {
  const { game, last } = makeGame();
  for (let y = HIDDEN_ROWS; y < ROWS; y++) fillRow(game, y);
  game.state = 'playing';
  game.spawnPiece();
  assert.equal(game.state, 'over');
  assert.ok(last('gameover'));
});

test('10ライン消すごとにレベルが上がる', () => {
  const { game } = makeGame();
  for (let i = 0; i < 10; i++) {
    game.state = 'playing';
    fillRow(game, ROWS - 1, [4, 5]);
    game.piece = game.makePiece('O');
    game.piece.x = 4;
    game.board[ROWS - 2][4] = 0;
    game.board[ROWS - 2][5] = 0;
    game.hardDrop();
    settle(game);
  }
  assert.equal(game.lines, 10);
  assert.equal(game.level, 2);
});

test('CHANCEゲージが満タンになると抽選が走る', () => {
  const { game, last } = makeGame();
  game.addChance(999);
  const lottery = last('lottery');
  assert.ok(lottery, 'lottery イベントが飛ぶ');
  assert.ok(['reg', 'big', 'premium'].includes(lottery.data.kind));
  assert.equal(game.chanceLocked, true, '演出が終わるまでゲージは止まる');
  assert.equal(game.bonus, null, 'ボーナスは演出側の合図で始まる');
});

test('確定演出は抽選済みでも上位ボーナスへ昇格させる', () => {
  const { game, last } = makeGame();
  game.addChance(999);
  game.pendingKind = 'reg';
  game.triggerLottery('premium');
  assert.equal(game.pendingKind, 'premium');
  assert.ok(last('lotteryUpgrade'));

  // 逆に下位へは落とさない
  game.triggerLottery('reg');
  assert.equal(game.pendingKind, 'premium');
});

test('ボーナス中はスコアが倍率ぶん増える', () => {
  const { game } = makeGame();
  const before = game.score;
  game.applyScore(100);
  const plain = game.score - before;

  game.startBonus('big');
  const b2 = game.score;
  game.applyScore(100);
  const boosted = game.score - b2;

  assert.equal(boosted, plain * 3, 'BIG は3倍');
  assert.equal(game.bonus.gained, boosted, '獲得枚数に積まれる');
});

test('ボーナスはミノ1個につき1G減り、0で終わる', () => {
  const { game, last } = makeGame();
  game.startBonus('reg');
  const total = game.bonus.games;
  for (let i = 0; i < total - 1; i++) game.consumeBonusGame();
  assert.equal(game.bonus.games, 1);
  game.consumeBonusGame();
  assert.equal(game.bonus, null);
  assert.ok(last('bonusEnd'), 'bonusEnd が飛ぶ');
});

test('ボーナス中のライン消しは上乗せになる', () => {
  const { game, last } = makeGame();
  game.startBonus('big');
  const before = game.bonus.games;

  // TETRIS を決める（全消しにならないよう上にブロックを1つ残す）
  for (let y = ROWS - 4; y < ROWS; y++) fillRow(game, y, [0]);
  game.board[ROWS - 6][3] = 'J';
  game.piece = game.makePiece('I');
  game.piece.rotation = 1;
  game.piece.x += 0 - game.cellsOf(game.piece)[0].x;
  game.hardDrop();
  settle(game);

  const add = last('bonusAdd');
  assert.ok(add, '上乗せイベントが飛ぶ');
  assert.equal(add.data.reason, 'tetris');
  // +30G から、消化した1G を引いた ぶんは増えている
  assert.ok(game.bonus.games > before, `${before} → ${game.bonus.games}`);
  assert.equal(game.chance, 0, 'ボーナス中はゲージが溜まらない');
});

test('パーフェクトクリアは PREMIUM 確定', () => {
  const { game } = makeGame();
  for (const y of [ROWS - 1, ROWS - 2]) fillRow(game, y, [4, 5]);
  game.piece = game.makePiece('O');
  game.piece.x = 4;
  game.hardDrop();
  settle(game);
  assert.equal(game.pendingKind, 'premium');
});

test('最後の1Gのライン消しにも倍率が乗ってから終了する', () => {
  const { game, last } = makeGame();
  game.startBonus('reg');       // 12G ×2
  game.bonus.games = 1;

  fillRow(game, ROWS - 1, [4, 5]);
  game.piece = game.makePiece('O');
  game.piece.x = 4;
  game.hardDrop();
  settle(game);

  // SINGLE = 100点。レベル1・REG(2倍) なので 200点入る
  assert.equal(last('cleared').data.score, 200, '評価はG消化より先');
  assert.equal(game.bonus, null, 'そのあと 1G 消化して終了');
  assert.ok(last('bonusEnd'));
});

test('シングルでは上乗せせず、ボーナスがきちんと終わる', () => {
  const { game } = makeGame();
  game.startBonus('reg');
  const start = game.bonus.games;

  // シングルを何度も決める
  for (let i = 0; i < start + 3 && game.bonus; i++) {
    game.state = 'playing';
    fillRow(game, ROWS - 1, [4, 5]);
    game.board[ROWS - 2][4] = 0;
    game.board[ROWS - 2][5] = 0;
    game.piece = game.makePiece('O');
    game.piece.x = 4;
    game.hardDrop();
    settle(game);
  }
  assert.equal(game.bonus, null, 'シングル連打でボーナスが無限に伸びない');
});

test('上乗せは上限で頭打ちになる', () => {
  const { game } = makeGame();
  game.startBonus('premium');
  game.addBonusGames(5000, 'test');
  assert.equal(game.bonus.games, 999);
  assert.equal(game.addBonusGames(50, 'test'), 0, '上限に達したら0を返す');
});

test('180度回転にもキック候補がある', () => {
  const kicks = getKicks('T', 0, 2);
  assert.ok(kicks.length > 1);
  assert.deepEqual(kicks[0], [0, 0]);
});

test('連続プレイしても状態が壊れない（ランダム操作1500手）', () => {
  const { game } = makeGame();
  let guard = 0;
  for (let i = 0; i < 1500 && game.state !== 'over'; i++) {
    const r = Math.random();
    if (r < 0.3) game.move(Math.random() < 0.5 ? -1 : 1);
    else if (r < 0.5) game.rotate(Math.random() < 0.5 ? 1 : -1);
    else if (r < 0.6) game.holdPiece();
    else if (r < 0.75) game.softDrop();
    else game.hardDrop();
    game.update(16.7);
    guard++;
  }
  assert.ok(guard > 0);
  assert.ok(['playing', 'clearing', 'spawning', 'over'].includes(game.state));
  // 盤面に不正な値が残っていない
  for (const row of game.board) {
    assert.equal(row.length, COLS);
    for (const v of row) assert.ok(v === 0 || PIECE_TYPES.includes(v));
  }
});
