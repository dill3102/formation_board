// ID 作成 (crypto.randomUUID は https / localhost でのみ使えるため予備を用意)

export function createId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}
