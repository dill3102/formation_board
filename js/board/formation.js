// テンプレート (フォーメーション) まわりの計算

/**
 * テンプレートの枠に選手を割り当てる
 * 枠のポジションが選手の可能ポジションに含まれる選手を優先し (先頭のポジションほど優先)、
 * 余った枠には残りの選手を順に入れる
 * @param {{ position: string, x: number, y: number }[]} slots
 * @param {object[]} players
 * @param {string} sportId
 * @returns {{ slots: (object & { playerId: string | null })[], rest: object[] }} rest = 枠に入らなかった選手
 */
export function assignPlayersToSlots(slots, players, sportId) {
  const remaining = [...players];
  const result = slots.map((slot) => ({ ...slot, playerId: null }));
  const positionsOf = (p) => p.sports?.[sportId]?.positions ?? [];

  // 第1希望 → 第2希望 … の順に、ポジションが合う選手を入れる
  const maxRank = Math.max(0, ...players.map((p) => positionsOf(p).length));
  for (let rank = 0; rank < maxRank; rank++) {
    for (const slot of result) {
      if (slot.playerId) continue;
      const i = remaining.findIndex((p) => positionsOf(p)[rank] === slot.position);
      if (i >= 0) slot.playerId = remaining.splice(i, 1)[0].id;
    }
  }
  for (const slot of result) {
    if (!slot.playerId && remaining.length > 0) slot.playerId = remaining.shift().id;
  }
  return { slots: result, rest: remaining };
}

/** 敵チーム用に反転 (点対称) */
export function mirrorSlots(slots) {
  return slots.map((s) => ({ ...s, x: 1 - s.x, y: 1 - s.y }));
}
