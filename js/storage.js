// localStorage の読み書きはすべてこのファイルを通す (03_data_design 4章・6章)
// キーの先頭に "sp:" を付けて、同じ github.io 配下の他サイトとぶつからないようにする

export const SCHEMA_VERSION = 1;

/** localStorage の上限の目安 (ブラウザにより 5MB 前後) */
export const LIMIT_BYTES = 5 * 1024 * 1024;
/** これを超えたら容量の警告を出す */
export const WARNING_RATIO = 0.8;

const PREFIX = 'sp:';

export const KEYS = {
  meta: 'meta',
  players: 'players',
  attendance: 'attendance',
  boards: 'boards',
  templates: 'templates',
  settings: 'settings',
  photo: (playerId) => `photo:${playerId}`,
};

/** 容量オーバーで保存できなかった時のエラー */
export class StorageFullError extends Error {
  constructor(cause) {
    super('保存容量がいっぱいです');
    this.name = 'StorageFullError';
    this.cause = cause;
  }
}

function isQuotaError(err) {
  return err instanceof DOMException &&
    (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED');
}

export function read(key, fallback = null) {
  const raw = localStorage.getItem(PREFIX + key);
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    console.warn(`[storage] ${key} を読み込めませんでした`);
    return fallback;
  }
}

export function write(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch (err) {
    if (isQuotaError(err)) throw new StorageFullError(err);
    throw err;
  }
}

export function remove(key) {
  localStorage.removeItem(PREFIX + key);
}

/** このサイトが使っているキー (先頭の "sp:" は除いた形) */
export function keys() {
  const result = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(PREFIX)) result.push(k.slice(PREFIX.length));
  }
  return result;
}

/** このサイトの使用量 (バイト。localStorage は UTF-16 なので 1文字 = 2バイトで概算) */
export function usageBytes() {
  let total = 0;
  for (const k of keys()) {
    total += (PREFIX.length + k.length + (localStorage.getItem(PREFIX + k)?.length ?? 0)) * 2;
  }
  return total;
}

/** このサイトのデータをすべて削除 */
export function clearAll() {
  for (const k of keys()) remove(k);
}

/** 起動時に呼ぶ。meta が無ければ作り、古いスキーマなら変換する */
export function init() {
  const meta = read(KEYS.meta);
  if (!meta) {
    write(KEYS.meta, {
      schemaVersion: SCHEMA_VERSION,
      noticeShown: false,
      createdAt: new Date().toISOString(),
    });
    return;
  }
  if (meta.schemaVersion < SCHEMA_VERSION) {
    migrate(meta);
  }
}

function migrate(meta) {
  // スキーマを変える時はここにバージョンごとの変換を足す
  write(KEYS.meta, { ...meta, schemaVersion: SCHEMA_VERSION });
}
