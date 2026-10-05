// 選手データの操作 (03_data_design 4.2 / 7章)
// 画面 (DOM) には触らない
import * as storage from '../storage.js';
import { KEYS } from '../storage.js';
import { createId } from '../util/id.js';

export const HANDEDNESS = [
  { id: 'R', label: '右' },
  { id: 'L', label: '左' },
  { id: 'B', label: '両' },
];

export function handednessLabel(id) {
  return HANDEDNESS.find((h) => h.id === id)?.label ?? '';
}

export function listPlayers() {
  return storage.read(KEYS.players, []);
}

export function getPlayer(id) {
  return listPlayers().find((p) => p.id === id) ?? null;
}

export function newPlayer() {
  return { id: null, name: '', handedness: null, hasPhoto: false, sports: {} };
}

export function getPhoto(playerId) {
  return storage.read(KEYS.photo(playerId));
}

/**
 * 選手を保存する
 * @param {object} player
 * @param {string | null | undefined} photo 新しい写真 (data URL) / null = 削除 / undefined = 変更なし
 * @returns {object} 保存した選手
 * @throws {StorageFullError} 容量オーバー
 */
export function savePlayer(player, photo = undefined) {
  const now = new Date().toISOString();
  const saved = {
    ...player,
    id: player.id ?? createId(),
    name: player.name.trim(),
    createdAt: player.createdAt ?? now,
    updatedAt: now,
  };
  if (photo !== undefined) saved.hasPhoto = photo !== null;

  const photoKey = KEYS.photo(saved.id);
  const oldPhoto = photo !== undefined ? storage.read(photoKey) : null;
  if (photo) storage.write(photoKey, photo);
  else if (photo === null) storage.remove(photoKey);

  const players = listPlayers();
  const index = players.findIndex((p) => p.id === saved.id);
  if (index >= 0) players[index] = saved;
  else players.push(saved);

  try {
    storage.write(KEYS.players, players);
  } catch (err) {
    // 選手を保存できなかったら写真も元に戻す
    if (oldPhoto) storage.write(photoKey, oldPhoto);
    else if (photo) storage.remove(photoKey);
    throw err;
  }
  return saved;
}

/**
 * 複数の新しい選手をまとめて追加する (写真なし)。1回の書き込みで保存
 * @param {object[]} drafts
 * @returns {object[]} 保存した選手
 * @throws {StorageFullError} 容量オーバー (その場合は1人も追加されない)
 */
export function addPlayers(drafts) {
  const now = new Date().toISOString();
  const added = drafts.map((d) => ({
    ...newPlayer(),
    ...d,
    id: d.id ?? createId(),
    name: d.name.trim(),
    createdAt: now,
    updatedAt: now,
  }));
  storage.write(KEYS.players, [...listPlayers(), ...added]);
  return added;
}

/** 選手を削除し、写真・出欠・保存済み配置からも外す */
export function deletePlayer(playerId) {
  storage.write(KEYS.players, listPlayers().filter((p) => p.id !== playerId));
  storage.remove(KEYS.photo(playerId));

  const attendance = storage.read(KEYS.attendance);
  if (attendance) storage.write(KEYS.attendance, removeFromAttendance(attendance, playerId));

  const boards = storage.read(KEYS.boards);
  if (boards) storage.write(KEYS.boards, removeFromBoards(boards, playerId));
}

/** この選手が使われている保存済み配置の数 */
export function countBoardsUsing(playerId) {
  const boards = storage.read(KEYS.boards, []);
  return boards.filter((b) => boardUsesPlayer(b, playerId)).length;
}

// ---- ここから下は storage を使わない計算だけの関数 (tests/ でテスト) ----

export function boardUsesPlayer(board, playerId) {
  const home = board.home ?? {};
  return (home.slots ?? []).some((s) => s.playerId === playerId) ||
    (home.free ?? []).some((f) => f.playerId === playerId) ||
    (home.bench ?? []).includes(playerId);
}

/** 出欠からその選手を消す。誰もいなくなった日付は消す */
export function removeFromAttendance(attendance, playerId) {
  const result = {};
  for (const [date, entries] of Object.entries(attendance)) {
    const { [playerId]: _removed, ...rest } = entries;
    if (Object.keys(rest).length > 0) result[date] = rest;
  }
  return result;
}

/** 配置からその選手を外す (枠は空き枠に戻す、自由配置・ベンチからは削除) */
export function removeFromBoards(boards, playerId) {
  return boards.map((board) => {
    if (!boardUsesPlayer(board, playerId)) return board;
    const home = board.home;
    return {
      ...board,
      home: {
        ...home,
        slots: (home.slots ?? []).map((s) => (s.playerId === playerId ? { ...s, playerId: null } : s)),
        free: (home.free ?? []).filter((f) => f.playerId !== playerId),
        bench: (home.bench ?? []).filter((id) => id !== playerId),
      },
    };
  });
}

/**
 * 同じスポーツで背番号が重複している他の選手
 * @returns {Record<string, object[]>} スポーツID → 重複している選手の配列
 */
export function findDuplicateNumbers(player, players) {
  const result = {};
  for (const [sportId, info] of Object.entries(player.sports ?? {})) {
    const number = (info.number ?? '').trim();
    if (!number) continue;
    const others = players.filter((p) =>
      p.id !== player.id && (p.sports?.[sportId]?.number ?? '').trim() === number);
    if (others.length > 0) result[sportId] = others;
  }
  return result;
}

/**
 * 貼り付けたテキストを選手の行に分解する (まとめて追加用)
 * 1行 = 1人。「名前<区切り>背番号<区切り>背番号…」(区切り = タブ / カンマ / 全角カンマ)
 * 背番号は sportIds の順に対応させる
 * @returns {{ name: string, numbers: Record<string, string> }[]}
 */
export function parsePlayerLines(text, sportIds) {
  return text.split(/\r?\n/)
    .map((line) => line.split(/\t|,|，/).map((cell) => cell.trim()))
    .filter(([name]) => name)
    .map(([name, ...numbers]) => ({
      name,
      numbers: Object.fromEntries(sportIds.map((id, i) => [id, numbers[i] ?? ''])),
    }));
}

const collator = new Intl.Collator('ja');

function compareNumber(a, b) {
  // 空は最後。数字として比べ、同じなら文字列で比べる ("10" と "10A")
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  const diff = (parseInt(a, 10) || 0) - (parseInt(b, 10) || 0);
  return diff !== 0 ? diff : collator.compare(a, b);
}

/**
 * 並び替え
 * @param {'name' | 'number' | 'position' | 'created'} sort number / position はスポーツ指定時のみ
 * @param {object | null} sport スポーツ定義
 */
export function sortPlayers(players, sort, sport = null) {
  const list = [...players];
  const byName = (a, b) => collator.compare(a.name, b.name);
  if (sort === 'number' && sport) {
    list.sort((a, b) =>
      compareNumber(a.sports?.[sport.id]?.number, b.sports?.[sport.id]?.number) || byName(a, b));
  } else if (sort === 'position' && sport) {
    const order = (p) => {
      const first = p.sports?.[sport.id]?.positions?.[0];
      const i = sport.positions.findIndex((pos) => pos.id === first);
      return i < 0 ? Infinity : i;
    };
    list.sort((a, b) => order(a) - order(b) || byName(a, b));
  } else if (sort === 'created') {
    list.sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''));
  } else {
    list.sort(byName);
  }
  return list;
}

/**
 * 絞り込み
 * @param {string} sportFilter 'all' / 'none' (どのスポーツにも未登録) / スポーツID
 */
export function filterPlayers(players, sportFilter, query = '') {
  const q = query.trim().toLowerCase();
  return players.filter((p) => {
    const sportIds = Object.keys(p.sports ?? {});
    if (sportFilter === 'none' && sportIds.length > 0) return false;
    if (sportFilter !== 'all' && sportFilter !== 'none' && !sportIds.includes(sportFilter)) return false;
    return !q || p.name.toLowerCase().includes(q);
  });
}
