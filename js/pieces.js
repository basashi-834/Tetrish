/**
 * ピース定義とSRS(Super Rotation System)のキックテーブル。
 * グリッドは y が下向きに増える座標系。古典的なSRS表は y が上向きなので、
 * キックの y 成分は符号を反転して保持している。
 */

export const PIECE_TYPES = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'];

/** 各ピースの基準形（回転状態0）。1 がブロック。 */
const BASE_SHAPES = {
  I: [
    [0, 0, 0, 0],
    [1, 1, 1, 1],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ],
  J: [
    [1, 0, 0],
    [1, 1, 1],
    [0, 0, 0],
  ],
  L: [
    [0, 0, 1],
    [1, 1, 1],
    [0, 0, 0],
  ],
  O: [
    [1, 1],
    [1, 1],
  ],
  S: [
    [0, 1, 1],
    [1, 1, 0],
    [0, 0, 0],
  ],
  T: [
    [0, 1, 0],
    [1, 1, 1],
    [0, 0, 0],
  ],
  Z: [
    [1, 1, 0],
    [0, 1, 1],
    [0, 0, 0],
  ],
};

/** ネオン配色。glow は発光色、edge はハイライト。 */
export const PIECE_COLORS = {
  I: { base: '#22e0ff', glow: '#8ff6ff', edge: '#d6fbff' },
  J: { base: '#3b6bff', glow: '#8fa8ff', edge: '#d3ddff' },
  L: { base: '#ff9312', glow: '#ffc178', edge: '#ffe4c4' },
  O: { base: '#ffdc23', glow: '#fff08a', edge: '#fff9cf' },
  S: { base: '#2bdd6e', glow: '#8ff5b6', edge: '#d6ffe6' },
  T: { base: '#c04dff', glow: '#e0a3ff', edge: '#f4dcff' },
  Z: { base: '#ff3465', glow: '#ff92aa', edge: '#ffd4dd' },
  G: { base: '#5a6478', glow: '#8894ab', edge: '#c3ccdb' }, // お邪魔ブロック用
};

/** 行列を時計回りに90度回転する。 */
function rotateCW(matrix) {
  const n = matrix.length;
  const out = [];
  for (let y = 0; y < n; y++) {
    out.push(new Array(n).fill(0));
    for (let x = 0; x < n; x++) {
      out[y][x] = matrix[n - 1 - x][y];
    }
  }
  return out;
}

/** 行列から埋まっているセルの相対座標配列を作る。 */
function toCells(matrix) {
  const cells = [];
  for (let y = 0; y < matrix.length; y++) {
    for (let x = 0; x < matrix[y].length; x++) {
      if (matrix[y][x]) cells.push({ x, y });
    }
  }
  return cells;
}

/**
 * 各ピースの回転状態0〜3のセル座標。
 * SHAPES[type][rotation] = [{x, y}, ...]
 */
export const SHAPES = {};
/** 行列そのもの（プレビュー描画で使う）。 */
export const MATRICES = {};

for (const type of PIECE_TYPES) {
  let m = BASE_SHAPES[type];
  SHAPES[type] = [];
  MATRICES[type] = [];
  for (let r = 0; r < 4; r++) {
    SHAPES[type].push(toCells(m));
    MATRICES[type].push(m);
    m = rotateCW(m);
  }
}

/** ピースの出現位置（行列左上の座標）。 */
export const SPAWN = {
  I: { x: 3, y: -1 },
  J: { x: 3, y: 0 },
  L: { x: 3, y: 0 },
  O: { x: 4, y: 0 },
  S: { x: 3, y: 0 },
  T: { x: 3, y: 0 },
  Z: { x: 3, y: 0 },
};

// --- SRS キックテーブル -----------------------------------------------------
// キーは "from>to"。値は試行順の [dx, dy]。y は下向き正に変換済み。

export const KICKS_JLSTZ = {
  '0>1': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '1>0': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '1>2': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '2>1': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '2>3': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '3>2': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '3>0': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '0>3': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
};

export const KICKS_I = {
  '0>1': [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
  '1>0': [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
  '1>2': [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
  '2>1': [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
  '2>3': [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
  '3>2': [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
  '3>0': [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
  '0>3': [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
};

/** 180度回転用の簡易キック（ガイドラインには無いが操作感のために採用）。 */
export const KICKS_180 = [
  [0, 0], [0, -1], [1, -1], [-1, -1], [1, 0], [-1, 0],
  [0, 1], [1, 1], [-1, 1], [0, -2], [0, 2],
];

/** from/to の回転状態からキック候補を返す。 */
export function getKicks(type, from, to) {
  if (type === 'O') return [[0, 0]];
  if ((from + 2) % 4 === to) return KICKS_180;
  const table = type === 'I' ? KICKS_I : KICKS_JLSTZ;
  return table[`${from}>${to}`] || [[0, 0]];
}
