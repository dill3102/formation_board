// ライブラリなしの簡易テスト。tests/index.html をブラウザで開くと実行される
import { parseHash } from '../js/router.js';
import { toDateKey, fromDateKey, formatShort } from '../js/util/date.js';
import { debounce } from '../js/util/debounce.js';
import * as storage from '../js/storage.js';
import {
  findDuplicateNumbers, sortPlayers, filterPlayers, removeFromAttendance, removeFromBoards,
} from '../js/models/players.js';

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

// --- models/players ---
const p1 = { id: 'p1', name: '山田', createdAt: '1', sports: { soccer: { number: '10', positions: ['FW'] } } };
const p2 = { id: 'p2', name: '佐藤', createdAt: '2', sports: { soccer: { number: '2', positions: ['GK'] }, basketball: { number: '10', positions: [] } } };
const p3 = { id: 'p3', name: '鈴木', createdAt: '3', sports: { soccer: { number: '', positions: [] } } };
const p4 = { id: 'p4', name: '田中', createdAt: '4', sports: {} };
const soccer = { id: 'soccer', positions: [{ id: 'GK' }, { id: 'DF' }, { id: 'MF' }, { id: 'FW' }] };

test('findDuplicateNumbers: 同じスポーツの同じ番号だけ重複', () => {
  const draft = { id: 'new', sports: { soccer: { number: '10' }, basketball: { number: '7' } } };
  const dup = findDuplicateNumbers(draft, [p1, p2, p3]);
  assertEqual(Object.keys(dup), ['soccer']);
  assertEqual(dup.soccer.map((p) => p.id), ['p1']);
});
test('findDuplicateNumbers: 自分自身・空の番号は対象外', () => {
  assertEqual(findDuplicateNumbers(p1, [p1, p3]), {});
  assertEqual(findDuplicateNumbers(p3, [p1, p3, { id: 'x', sports: { soccer: { number: '' } } }]), {});
});
test('sortPlayers: 背番号順 (数字として比較・空は最後)', () => {
  assertEqual(sortPlayers([p3, p1, p2], 'number', soccer).map((p) => p.id), ['p2', 'p1', 'p3']);
});
test('sortPlayers: ポジション順 (未設定は最後)', () => {
  assertEqual(sortPlayers([p3, p1, p2], 'position', soccer).map((p) => p.id), ['p2', 'p1', 'p3']);
});
test('sortPlayers: 登録順', () => {
  assertEqual(sortPlayers([p3, p1, p2], 'created').map((p) => p.id), ['p1', 'p2', 'p3']);
});
test('filterPlayers: スポーツ・未登録・名前', () => {
  const all = [p1, p2, p3, p4];
  assertEqual(filterPlayers(all, 'basketball').map((p) => p.id), ['p2']);
  assertEqual(filterPlayers(all, 'none').map((p) => p.id), ['p4']);
  assertEqual(filterPlayers(all, 'all', '佐').map((p) => p.id), ['p2']);
});
test('removeFromAttendance: 誰もいなくなった日付は消える', () => {
  const att = { '2026-10-12': { p1: { status: 'yes' }, p2: { status: 'no' } }, '2026-10-13': { p1: { status: 'yes' } } };
  assertEqual(removeFromAttendance(att, 'p1'), { '2026-10-12': { p2: { status: 'no' } } });
});
test('removeFromBoards: 枠は空き枠に、自由配置・ベンチからは削除', () => {
  const board = {
    id: 'b1',
    home: {
      slots: [{ position: 'GK', x: 0, y: 0, playerId: 'p1' }, { position: 'DF', x: 0, y: 0, playerId: 'p2' }],
      free: [{ playerId: 'p1', x: 0, y: 0 }],
      bench: ['p1', 'p3'],
    },
  };
  const [result] = removeFromBoards([board], 'p1');
  assertEqual(result.home.slots.map((s) => s.playerId), [null, 'p2']);
  assertEqual(result.home.free, []);
  assertEqual(result.home.bench, ['p3']);
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
