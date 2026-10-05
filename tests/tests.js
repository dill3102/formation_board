// ライブラリなしの簡易テスト。tests/index.html をブラウザで開くと実行される
import { parseHash } from '../js/router.js';
import { toDateKey, fromDateKey, formatShort } from '../js/util/date.js';
import { debounce } from '../js/util/debounce.js';
import * as storage from '../js/storage.js';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

function assertEqual(actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`期待値: ${e}\n実際:   ${a}`);
}

// --- router ---
test('parseHash: 空なら home', () => {
  assertEqual(parseHash(''), { name: 'home', params: [] });
  assertEqual(parseHash('#/'), { name: 'home', params: [] });
});
test('parseHash: 画面名とパラメータ', () => {
  assertEqual(parseHash('#/board/abc-123'), { name: 'board', params: ['abc-123'] });
  assertEqual(parseHash('#/players'), { name: 'players', params: [] });
});

// --- date ---
test('toDateKey: ゼロ埋め', () => {
  assertEqual(toDateKey(new Date(2026, 0, 5)), '2026-01-05');
});
test('fromDateKey ⇔ toDateKey', () => {
  assertEqual(toDateKey(fromDateKey('2026-10-12')), '2026-10-12');
});
test('formatShort', () => {
  assertEqual(formatShort('2026-10-05'), '10/5');
});

// --- debounce ---
test('debounce: flush で最後の引数だけ実行', () => {
  const calls = [];
  const fn = debounce((v) => calls.push(v), 1000);
  fn(1); fn(2); fn(3);
  fn.flush();
  assertEqual(calls, [3]);
});
test('debounce: cancel で実行しない', () => {
  const calls = [];
  const fn = debounce((v) => calls.push(v), 1000);
  fn(1);
  fn.cancel();
  fn.flush();
  assertEqual(calls, []);
});

// --- storage (テスト用のキーで読み書きして最後に消す) ---
test('storage: 書いて読める', () => {
  storage.write('__test', { a: 1 });
  assertEqual(storage.read('__test'), { a: 1 });
  storage.remove('__test');
  assertEqual(storage.read('__test', 'none'), 'none');
});
test('storage: keys は sp: を除いた形', () => {
  storage.write('__test2', 1);
  if (!storage.keys().includes('__test2')) throw new Error('__test2 が無い');
  storage.remove('__test2');
});

// --- 実行 ---
const list = document.getElementById('results');
let failed = 0;
for (const { name, fn } of tests) {
  const li = document.createElement('li');
  try {
    await fn();
    li.className = 'pass';
    li.textContent = `✓ ${name}`;
  } catch (err) {
    failed++;
    li.className = 'fail';
    li.textContent = `✗ ${name}`;
    const pre = document.createElement('pre');
    pre.textContent = err.message;
    li.append(pre);
  }
  list.append(li);
}
const summary = document.getElementById('summary');
summary.textContent = failed ? `${failed} / ${tests.length} 件 失敗` : `${tests.length} 件 すべて成功`;
summary.className = failed ? 'fail' : 'pass';
