// ライブラリなしの簡易テスト。tests/index.html をブラウザで開くと実行される
import { parseHash } from '../js/router.js';
import { toDateKey, fromDateKey, formatShort } from '../js/util/date.js';
import { debounce } from '../js/util/debounce.js';
import * as storage from '../js/storage.js';
import {
  findDuplicateNumbers, sortPlayers, filterPlayers, removeFromAttendance, removeFromBoards, parsePlayerLines,
} from '../js/models/players.js';
import { Viewport } from '../js/board/viewport.js';
import { assignPlayersToSlots } from '../js/board/formation.js';
import { History } from '../js/board/history.js';
import { hitStroke, roundPoint, lineWidthPx } from '../js/board/drawing.js';

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

test('parsePlayerLines: カンマ・タブ・全角カンマ、空行は無視', () => {
  const text = '山田 太郎, 10, 7\n\n佐藤\t4\n鈴木，9\n  \n田中';
  assertEqual(parsePlayerLines(text, ['soccer', 'basketball']), [
    { name: '山田 太郎', numbers: { soccer: '10', basketball: '7' } },
    { name: '佐藤', numbers: { soccer: '4', basketball: '' } },
    { name: '鈴木', numbers: { soccer: '9', basketball: '' } },
    { name: '田中', numbers: { soccer: '', basketball: '' } },
  ]);
});
test('parsePlayerLines: スポーツ未選択なら背番号は無視', () => {
  assertEqual(parsePlayerLines('山田, 10', []), [{ name: '山田', numbers: {} }]);
});

// --- board/viewport ---
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
function assertPoint(actual, expected) {
  if (!near(actual.x, expected.x) || !near(actual.y, expected.y)) {
    throw new Error(`期待値: ${JSON.stringify(expected)}\n実際:   ${JSON.stringify(actual)}`);
  }
}

test('viewport: 横長 = 自陣が左、全体表示で中央', () => {
  const v = new Viewport(2);
  v.resize(848, 448); // 余白 24px を除くと 800 x 400 → ちょうど収まる
  assertEqual(v.portrait, false);
  assertPoint(v.courtToScreen(0, 0), { x: 24, y: 24 });
  assertPoint(v.courtToScreen(1, 1), { x: 824, y: 424 });
  assertPoint(v.courtToScreen(0.5, 0.5), { x: 424, y: 224 });
});
test('viewport: 縦長 = 自陣が下・敵陣が上', () => {
  const v = new Viewport(2);
  v.resize(448, 848);
  assertEqual(v.portrait, true);
  assertPoint(v.courtToScreen(0, 0), { x: 24, y: 824 }); // 自ゴール側 = 下
  assertPoint(v.courtToScreen(1, 0), { x: 24, y: 24 }); // 敵ゴール側 = 上
});
test('viewport: 画面 ⇔ コートの往復', () => {
  for (const [w, hgt] of [[800, 500], [400, 900]]) {
    const v = new Viewport(1.54);
    v.resize(w, hgt);
    v.setZoom(2.3, 100, 120);
    v.panBy(-37, 15);
    const s = v.courtToScreen(0.3, 0.8);
    assertPoint(v.screenToCourt(s.x, s.y), { x: 0.3, y: 0.8 });
  }
});
test('viewport: ズームは 50%〜400% で、指定した点は動かない', () => {
  const v = new Viewport(2);
  v.resize(848, 448);
  const before = v.screenToCourt(300, 200);
  v.zoomBy(1.5, 300, 200);
  assertPoint(v.screenToCourt(300, 200), before);
  v.setZoom(10);
  assertEqual(v.zoom, 4);
  v.setZoom(0.1);
  assertEqual(v.zoom, 0.5);
});
test('viewport: パンしてもコートの端は画面中央まで', () => {
  const v = new Viewport(2);
  v.resize(848, 448);
  v.setZoom(4);
  v.panBy(100000, 100000);
  assertPoint(v.courtToScreen(0, 0), { x: 424, y: 224 });
});
test('viewport: メートル変換行列がコート座標と一致', () => {
  for (const [w, hgt] of [[848, 448], [448, 848]]) {
    const v = new Viewport(105 / 68);
    v.resize(w, hgt);
    const [a, b, c, d, e, f] = v.meterTransform(105, 68);
    const mx = 30, my = 50;
    const s = v.courtToScreen(mx / 105, my / 68);
    assertPoint({ x: a * mx + c * my + e, y: b * mx + d * my + f }, s);
  }
});

// --- board/formation ---
test('assignPlayersToSlots: ポジション優先、余りは空き枠へ、溢れは rest', () => {
  const slots = [{ position: 'GK' }, { position: 'DF' }, { position: 'FW' }];
  const players = [
    { id: 'a', sports: { soccer: { positions: ['FW'] } } },
    { id: 'b', sports: { soccer: { positions: ['MF', 'DF'] } } },
    { id: 'c', sports: { soccer: { positions: ['GK'] } } },
    { id: 'd', sports: { soccer: { positions: [] } } },
  ];
  const { slots: result, rest } = assignPlayersToSlots(slots, players, 'soccer');
  assertEqual(result.map((s) => s.playerId), ['c', 'b', 'a']);
  assertEqual(rest.map((p) => p.id), ['d']);
});
test('assignPlayersToSlots: 人数が足りなければ空き枠 (null)', () => {
  const { slots } = assignPlayersToSlots([{ position: 'GK' }, { position: 'DF' }], [{ id: 'x', sports: {} }], 'soccer');
  assertEqual(slots.map((s) => s.playerId), ['x', null]);
});

// --- board/history ---
test('History: undo / redo と、新しい変更で redo が消える', () => {
  const hst = new History();
  let state = { n: 0 };
  hst.push(state); state = { n: 1 };
  hst.push(state); state = { n: 2 };
  state = hst.undo(state); assertEqual(state, { n: 1 });
  state = hst.undo(state); assertEqual(state, { n: 0 });
  assertEqual(hst.undo(state), null);
  state = hst.redo(state); assertEqual(state, { n: 1 });
  hst.push(state); state = { n: 9 };
  assertEqual(hst.canRedo, false);
});
test('History: 積んだ後に元のオブジェクトを変えても影響しない', () => {
  const hst = new History();
  const state = { list: [1] };
  hst.push(state);
  state.list.push(2);
  assertEqual(hst.undo(state), { list: [1] });
});
test('History: 上限を超えたら古いものから消える', () => {
  const hst = new History(2);
  hst.push(1); hst.push(2); hst.push(3);
  assertEqual(hst.undoStack, [2, 3]);
});

// --- board/drawing ---
test('roundPoint: 小数第4位で丸める', () => {
  assertEqual(roundPoint({ x: 0.123456, y: 0.98765 }), [0.1235, 0.9877]);
});
test('hitStroke: 線の近くだけ当たる (太さ・ズームを考慮)', () => {
  const v = new Viewport(2);
  v.resize(848, 448); // 100%: コート (0,0) = 画面 (24,24)、(1,1) = (824,424)
  const pen = { type: 'pen', width: 2, points: [[0, 0.5], [0.5, 0.5]] }; // 画面 y = 224, x = 24〜424
  if (!hitStroke(pen, 200, 230, v)) throw new Error('近くなのに当たらない');
  if (hitStroke(pen, 200, 260, v)) throw new Error('遠いのに当たる');
  if (hitStroke(pen, 600, 224, v)) throw new Error('線の延長上なのに当たる');
  v.setZoom(4, 200, 224);
  assertEqual(lineWidthPx(2, v), 16);
});
test('hitStroke: 矢印は始点と終点を結ぶ線で判定', () => {
  const v = new Viewport(2);
  v.resize(848, 448);
  const arrow = { type: 'arrow', width: 1, points: [[0, 0], [1, 1]] }; // (24,24) → (824,424)
  if (!hitStroke(arrow, 424, 224, v)) throw new Error('中点に当たらない');
  if (hitStroke(arrow, 424, 300, v)) throw new Error('離れているのに当たる');
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
