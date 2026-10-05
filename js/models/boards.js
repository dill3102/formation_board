// 配置 (Board) の保存・複製・削除 (03_data_design 4.4 / 6章 / 7章)
import * as storage from '../storage.js';
import { KEYS } from '../storage.js';
import { createId } from '../util/id.js';
import { todayKey, formatShort } from '../util/date.js';

export function listBoards() {
  return storage.read(KEYS.boards, []);
}

export function getBoard(id) {
  return listBoards().find((b) => b.id === id) ?? null;
}

export function newBoard(sport, date = todayKey()) {
  const now = new Date().toISOString();
  return {
    id: createId(),
    name: `${formatShort(date)} ${sport.name}`,
    date,
    sportId: sport.id,
    home: { templateId: null, slots: [], free: [], bench: [] },
    away: { templateId: null, markers: [] },
    ball: null,
    drawings: [],
    createdAt: now,
    updatedAt: now,
  };
}

/** @throws {StorageFullError} */
export function createBoard(sport, date) {
  const board = newBoard(sport, date);
  storage.write(KEYS.boards, [...listBoards(), board]);
  return board;
}

/** @throws {StorageFullError} */
export function saveBoard(board) {
  const saved = { ...board, updatedAt: new Date().toISOString() };
  const boards = listBoards();
  const index = boards.findIndex((b) => b.id === board.id);
  if (index >= 0) boards[index] = saved;
  else boards.push(saved);
  storage.write(KEYS.boards, boards);
  return saved;
}

export function deleteBoard(id) {
  storage.write(KEYS.boards, listBoards().filter((b) => b.id !== id));
}

/** @throws {StorageFullError} */
export function duplicateBoard(id) {
  const original = getBoard(id);
  if (!original) return null;
  const now = new Date().toISOString();
  const copy = {
    ...structuredClone(original),
    id: createId(),
    name: `${original.name} (コピー)`,
    createdAt: now,
    updatedAt: now,
  };
  storage.write(KEYS.boards, [...listBoards(), copy]);
  return copy;
}

/** 何も設定されていない配置か (離れる時に自動で削除する。03_data_design 6章) */
export function isEmptyBoard(board) {
  return board.home.slots.length === 0 &&
    board.home.free.length === 0 &&
    board.home.bench.length === 0 &&
    !board.home.templateId &&
    !board.away.templateId &&
    board.away.markers.length === 0 &&
    !board.ball &&
    board.drawings.length === 0;
}

/** 新しい順 (日付 → 更新日時) */
export function sortBoards(boards) {
  return [...boards].sort((a, b) =>
    b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt));
}
