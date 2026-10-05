// 出欠・現着 (03_data_design 4.3)
// attendance = { "YYYY-MM-DD": { playerId: { status: 'yes' | 'no' | 'maybe', arrived?, arrivedAt? } } }
// 記録が無い選手 = 未入力 (未定とは区別)。誰の記録も無くなった日付は消す
import * as storage from '../storage.js';
import { KEYS } from '../storage.js';

export const STATUSES = [
  { id: 'yes', label: '参加' },
  { id: 'no', label: '不参加' },
  { id: 'maybe', label: '未定' },
];

export const STATUS_LABELS = Object.fromEntries(STATUSES.map((s) => [s.id, s.label]));

function readAll() {
  return storage.read(KEYS.attendance, {});
}

/** その日の出欠 { playerId: { status, arrived, arrivedAt } } */
export function getDay(date) {
  return readAll()[date] ?? {};
}

/** 記録がある日付 */
export function datesWithData() {
  return new Set(Object.keys(readAll()));
}

/**
 * 出欠をまとめて登録
 * @param {'yes' | 'no' | 'maybe' | null} status null = 未入力に戻す
 * @throws {StorageFullError}
 */
export function setStatus(date, playerIds, status) {
  storage.write(KEYS.attendance, applyStatus(readAll(), date, playerIds, status));
}

/** @throws {StorageFullError} */
export function setArrived(date, playerId, arrived, now = new Date()) {
  storage.write(KEYS.attendance, applyArrived(readAll(), date, playerId, arrived, now));
}

// ---- ここから下は storage を使わない計算だけの関数 (tests/ でテスト) ----

export function applyStatus(attendance, date, playerIds, status) {
  const day = { ...(attendance[date] ?? {}) };
  for (const id of playerIds) {
    if (!status) {
      delete day[id];
    } else if (status === 'yes') {
      // 参加のまま変えない時は現着の記録を残す
      day[id] = day[id]?.status === 'yes' ? day[id] : { status: 'yes', arrived: false };
    } else {
      day[id] = { status };
    }
  }
  const result = { ...attendance };
  if (Object.keys(day).length > 0) result[date] = day;
  else delete result[date];
  return result;
}

/** 現着にする / 戻す。参加以外の選手を現着にした時は参加にする (当日来た = 参加) */
export function applyArrived(attendance, date, playerId, arrived, now = new Date()) {
  const day = { ...(attendance[date] ?? {}) };
  day[playerId] = arrived
    ? { status: 'yes', arrived: true, arrivedAt: now.toISOString() }
    : { status: 'yes', arrived: false };
  return { ...attendance, [date]: day };
}

/** 人数 { yes, no, maybe, none, arrived } */
export function countDay(day, players) {
  const counts = { yes: 0, no: 0, maybe: 0, none: 0, arrived: 0 };
  for (const p of players) {
    const entry = day[p.id];
    if (!entry) counts.none++;
    else counts[entry.status]++;
    if (entry?.status === 'yes' && entry.arrived) counts.arrived++;
  }
  return counts;
}

/** 表示用の文字 (例: "参加 / ✓現着")。未入力なら "未入力" */
export function describe(entry) {
  if (!entry) return '未入力';
  const label = STATUS_LABELS[entry.status] ?? '未入力';
  if (entry.status !== 'yes') return label;
  return `${label} / ${entry.arrived ? '✓現着' : '未着'}`;
}

/**
 * 出欠で絞り込む
 * @param {'all' | 'yes' | 'arrived'} filter
 */
export function filterByAttendance(players, day, filter) {
  if (filter === 'yes') return players.filter((p) => day[p.id]?.status === 'yes');
  if (filter === 'arrived') return players.filter((p) => day[p.id]?.status === 'yes' && day[p.id]?.arrived);
  return players;
}
