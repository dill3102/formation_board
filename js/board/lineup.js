// 自チームの並び (board.home) を変える計算 (画面に依存しない)
// home = { templateId, slots: [{ position, x, y, playerId|null }], free: [{ playerId, x, y }], bench: [playerId] }
//
// 選手の場所 (location)
//   { kind: 'slot', index }   テンプレートの枠
//   { kind: 'free', x, y }    枠に関係なく自由に置いた位置
//   { kind: 'bench', index }  ベンチ
//   null                      未配置 (選手一覧にいるだけ)
import { assignPlayersToSlots } from './formation.js';

const clone = (home) => structuredClone(home);

/** 選手が今どこにいるか */
export function locate(home, playerId) {
  const slot = home.slots.findIndex((s) => s.playerId === playerId);
  if (slot >= 0) return { kind: 'slot', index: slot };
  const free = home.free.find((f) => f.playerId === playerId);
  if (free) return { kind: 'free', x: free.x, y: free.y };
  const bench = home.bench.indexOf(playerId);
  if (bench >= 0) return { kind: 'bench', index: bench };
  return null;
}

/** コート上 (枠 + 自由配置) にいる選手ID */
export function playersOnCourt(home) {
  return [...home.slots.filter((s) => s.playerId).map((s) => s.playerId), ...home.free.map((f) => f.playerId)];
}

/** 配置されている (コート or ベンチ) 選手ID */
export function placedPlayers(home) {
  return [...playersOnCourt(home), ...home.bench];
}

function take(home, playerId) {
  for (const s of home.slots) if (s.playerId === playerId) s.playerId = null;
  home.free = home.free.filter((f) => f.playerId !== playerId);
  home.bench = home.bench.filter((id) => id !== playerId);
}

function put(home, playerId, location) {
  if (!location) return;
  if (location.kind === 'slot') home.slots[location.index].playerId = playerId;
  else if (location.kind === 'free') home.free.push({ playerId, x: location.x, y: location.y });
  else if (location.kind === 'bench') {
    const index = Math.min(location.index ?? home.bench.length, home.bench.length);
    home.bench.splice(index, 0, playerId);
  }
}

/** 選手を外す (枠は空き枠として残す) */
export function removePlayer(home, playerId) {
  const next = clone(home);
  take(next, playerId);
  return next;
}

/**
 * 選手を target に動かす。target に別の選手がいれば入れ替える
 * (相手は動かした選手の元の場所へ。元の場所が無い = 一覧から来た場合、相手は未配置に戻る)
 * @param {{ kind: 'slot', index: number } | { kind: 'free', x: number, y: number } |
 *         { kind: 'bench', index?: number } | { kind: 'player', playerId: string }} target
 */
export function movePlayer(home, playerId, target) {
  const next = clone(home);
  const from = locate(next, playerId);
  let to = target;
  let other = null;

  if (target.kind === 'player') {
    if (target.playerId === playerId) return next;
    to = locate(next, target.playerId);
    other = target.playerId;
    if (!to) return next;
  } else if (target.kind === 'slot') {
    other = next.slots[target.index].playerId;
    if (other === playerId) return next;
  }

  // ベンチ同士の入れ替えはその場で交換
  if (other && from?.kind === 'bench' && to.kind === 'bench') {
    next.bench[from.index] = other;
    next.bench[to.index] = playerId;
    return next;
  }

  // ベンチの中での並べ替えは、取り除いた分だけ位置がずれるので補正
  if (to.kind === 'bench' && from?.kind === 'bench' && to.index !== undefined && from.index < to.index && !other) {
    to = { ...to, index: to.index - 1 };
  }

  take(next, playerId);
  if (other) take(next, other);
  put(next, playerId, to);
  if (other) put(next, other, from);
  return next;
}

/** 枠ごと動かす (枠に入っている選手をドラッグした時) */
export function moveSlot(home, index, x, y) {
  const next = clone(home);
  next.slots[index] = { ...next.slots[index], x, y };
  return next;
}

/**
 * テンプレートを当てる
 * コート上の選手を新しい枠に (可能ポジション優先で) 入れ直し、入りきらない選手はベンチへ
 * slots = null (テンプレートなし) の時は、枠に入っていた選手をその位置の自由配置にして枠を消す
 */
export function applyTemplate(home, templateId, slots, players, sportId) {
  const next = clone(home);
  if (!slots) {
    next.free.push(...next.slots.filter((s) => s.playerId).map((s) => ({ playerId: s.playerId, x: s.x, y: s.y })));
    next.slots = [];
    next.templateId = null;
    return next;
  }
  const byId = new Map(players.map((p) => [p.id, p]));
  const onCourt = playersOnCourt(next).map((id) => byId.get(id) ?? { id, sports: {} });
  const { slots: assigned, rest } = assignPlayersToSlots(slots, onCourt, sportId);
  next.slots = assigned.map(({ position, x, y, playerId }) => ({ position, x, y, playerId }));
  next.free = [];
  next.bench = [...rest.map((p) => p.id), ...next.bench];
  next.templateId = templateId;
  return next;
}

// ---- 仮の選手 (人数が足りない時の穴埋め) ----
// home.guests = [{ id: "guest-...", name: "仮1", position: "FW", number?: "10" }]  (number は共有から取り込んだ時だけ)
// その配置の中だけの選手 (選手名簿には入らない)。配置から外れたら消す (pruneGuests)

/** 足りない人数: テンプレートがあれば空き枠の数、無ければ 1チームの人数 - コート上の人数 */
export function guestsNeeded(home, teamSize) {
  if (home.slots.length > 0) return home.slots.filter((s) => !s.playerId).length;
  return Math.max(0, teamSize - playersOnCourt(home).length);
}

/**
 * 足りない人数を仮の選手で埋める
 * @param {object} options
 * @param {number} options.teamSize
 * @param {() => string} options.createId
 * @param {{ x: number, y: number }[]} [options.spots] テンプレートが無い時に置く場所 (足りない人数分)
 */
export function fillWithGuests(home, { teamSize, createId, spots = [] }) {
  const next = clone(home);
  next.guests = next.guests ?? [];
  let n = Math.max(0, ...next.guests.map((g) => Number(g.name.replace(/\D/g, '')) || 0));
  const make = (position) => {
    const guest = { id: `guest-${createId()}`, name: `仮${++n}`, position };
    next.guests.push(guest);
    return guest.id;
  };
  if (next.slots.length > 0) {
    for (const slot of next.slots) if (!slot.playerId) slot.playerId = make(slot.position);
  } else {
    const need = guestsNeeded(home, teamSize);
    for (let i = 0; i < need; i++) {
      const spot = spots[i] ?? { x: 0.25, y: 0.5 };
      next.free.push({ playerId: make(''), x: spot.x, y: spot.y });
    }
  }
  return next;
}

/** 配置から外れた仮の選手を消す */
export function pruneGuests(home) {
  if (!home.guests?.length) return home;
  const placed = new Set(placedPlayers(home));
  const guests = home.guests.filter((g) => placed.has(g.id));
  return guests.length === home.guests.length ? home : { ...home, guests };
}

/** 仮の選手を、画面で選手と同じように扱える形にする */
export function guestAsPlayer(guest, sportId) {
  return {
    id: guest.id,
    name: guest.name,
    handedness: null,
    hasPhoto: false,
    guest: true,
    sports: { [sportId]: { number: guest.number ?? '', positions: guest.position ? [guest.position] : [] } },
  };
}

/** 空き枠を候補の選手で埋める (おまかせ配置)。既にコート・ベンチにいる選手は使わない */
export function autoFill(home, candidates, sportId) {
  const next = clone(home);
  const placed = new Set(placedPlayers(next));
  const available = candidates.filter((p) => !placed.has(p.id));
  const emptyIndexes = next.slots.map((s, i) => (s.playerId ? -1 : i)).filter((i) => i >= 0);
  const { slots } = assignPlayersToSlots(emptyIndexes.map((i) => next.slots[i]), available, sportId);
  slots.forEach((s, k) => { next.slots[emptyIndexes[k]].playerId = s.playerId; });
  return next;
}
