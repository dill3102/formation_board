// コマ送り (アニメーション) の計算 (画面に依存しない)
//
// 1つの配置の中にコマを持つ
//   コマ1 = 配置そのもの (board.home / away / ball の位置)
//   コマ2 以降 = board.steps[0], [1], … に「位置が変わった駒」だけを持つ
//     step = { "p:<選手ID>": [x, y], "m:<マーカーID>": [x, y], "b": [x, y] }
//   書いていない駒は、前のコマの位置のまま
// 空き枠 (点線の丸) は動かさない

/** コマの数 (1 以上) */
export function frameCount(board) {
  return 1 + (board.steps?.length ?? 0);
}

/** コマ1 の位置 (配置そのもの) */
export function basePositions(board) {
  const map = {};
  for (const s of board.home.slots) if (s.playerId) map[`p:${s.playerId}`] = [s.x, s.y];
  for (const f of board.home.free) map[`p:${f.playerId}`] = [f.x, f.y];
  for (const m of board.away.markers) map[`m:${m.id}`] = [m.x, m.y];
  if (board.ball) map.b = [board.ball.x, board.ball.y];
  return map;
}

/** コマ index (0 始まり) での全部の駒の位置 */
export function positionsAt(board, index) {
  const map = basePositions(board);
  const steps = board.steps ?? [];
  for (let i = 0; i < Math.min(index, steps.length); i++) {
    for (const [key, pos] of Object.entries(steps[i])) {
      if (key in map) map[key] = pos; // 配置から外れた駒の位置は無視
    }
  }
  return map;
}

/** コマ index (1 以上) での駒の位置を変える。前のコマと同じ位置なら記録を消す */
export function setStepPosition(board, index, key, x, y) {
  const steps = (board.steps ?? []).map((s) => ({ ...s }));
  const step = steps[index - 1];
  if (!step) return steps;
  const prev = positionsAt({ ...board, steps }, index - 1)[key];
  if (prev && Math.abs(prev[0] - x) < 1e-6 && Math.abs(prev[1] - y) < 1e-6) delete step[key];
  else step[key] = [x, y];
  return steps;
}

/** コマ index の後ろに新しいコマを足す (位置は index のコマと同じ = 空の step) */
export function insertFrame(board, index) {
  const steps = [...(board.steps ?? [])];
  steps.splice(index, 0, {});
  return steps;
}

/**
 * コマ index (1 以上) を消す。消したコマで動かした分は次のコマに引き継ぐ
 * (次のコマ以降の位置が変わらないように)
 */
export function removeFrame(board, index) {
  const steps = (board.steps ?? []).map((s) => ({ ...s }));
  if (index < 1 || index > steps.length) return steps;
  const [removed] = steps.splice(index - 1, 1);
  const next = steps[index - 1];
  if (next) for (const [key, pos] of Object.entries(removed)) if (!(key in next)) next[key] = pos;
  return steps;
}

/** 配置から外れた駒の記録と、空になった step の中身を整理する (コマの数は変えない) */
export function pruneSteps(board) {
  if (!board.steps?.length) return board.steps ?? [];
  const valid = basePositions(board);
  return board.steps.map((s) => Object.fromEntries(Object.entries(s).filter(([key]) => key in valid)));
}

/** 2つのコマの間 (t = 0〜1) の位置。なめらかに加速・減速 (ease in-out) */
export function interpolate(from, to, t) {
  const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
  const result = {};
  for (const key of Object.keys(from)) {
    const a = from[key];
    const b = to[key] ?? a;
    result[key] = [a[0] + (b[0] - a[0]) * e, a[1] + (b[1] - a[1]) * e];
  }
  return result;
}

/** コマ index (1 以上) で、前のコマから動いた駒 [key, 前の位置, 今の位置] */
export function movesInto(board, index) {
  if (index < 1) return [];
  const before = positionsAt(board, index - 1);
  const after = positionsAt(board, index);
  return Object.keys(after)
    .filter((key) => before[key] && (before[key][0] !== after[key][0] || before[key][1] !== after[key][1]))
    .map((key) => [key, before[key], after[key]]);
}
