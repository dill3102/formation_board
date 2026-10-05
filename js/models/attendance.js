// 出欠・現着 (03_data_design 4.3)
// ※ 登録・現着チェックの画面は M5。ここでは配置ボードで使う読み取りだけ
import * as storage from '../storage.js';
import { KEYS } from '../storage.js';

export const STATUS_LABELS = { yes: '参加', no: '不参加', maybe: '未定' };

/** その日の出欠 { playerId: { status, arrived, arrivedAt } } */
export function getDay(date) {
  return storage.read(KEYS.attendance, {})[date] ?? {};
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
