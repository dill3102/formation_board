// 日付は "YYYY-MM-DD" (端末のローカル日付) で扱う

const pad = (n) => String(n).padStart(2, '0');

export function toDateKey(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function todayKey() {
  return toDateKey(new Date());
}

/** "2026-10-12" → Date (ローカル時刻の 0:00) */
export function fromDateKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** "2026-10-12" → "10/12" */
export function formatShort(key) {
  const date = fromDateKey(key);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}
