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
import {
  locate, movePlayer, moveSlot, removePlayer, applyTemplate, autoFill,
  guestsNeeded, fillWithGuests, pruneGuests, guestAsPlayer,
} from '../js/board/lineup.js';
import { newBoard, isEmptyBoard, sortBoards } from '../js/models/boards.js';
import { applyStatus, applyArrived, countDay, filterByAttendance, describe } from '../js/models/attendance.js';
import { toShareData, fromShareData, encodeShare, decodeShare } from '../js/share.js';

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

// --- board/lineup ---
const lineupHome = () => ({
  templateId: 't',
  slots: [
    { position: 'GK', x: 0.05, y: 0.5, playerId: 'a' },
    { position: 'DF', x: 0.2, y: 0.3, playerId: 'b' },
    { position: 'FW', x: 0.4, y: 0.5, playerId: null },
  ],
  free: [{ playerId: 'c', x: 0.3, y: 0.7 }],
  bench: ['d', 'e', 'f'],
});

test('lineup.locate', () => {
  const home = lineupHome();
  assertEqual(locate(home, 'b'), { kind: 'slot', index: 1 });
  assertEqual(locate(home, 'c'), { kind: 'free', x: 0.3, y: 0.7 });
  assertEqual(locate(home, 'e'), { kind: 'bench', index: 1 });
  assertEqual(locate(home, 'z'), null);
});
test('lineup.movePlayer: 空き枠へ / 元の枠は空く / 元のデータは変えない', () => {
  const home = lineupHome();
  const next = movePlayer(home, 'b', { kind: 'slot', index: 2 });
  assertEqual(next.slots.map((s) => s.playerId), ['a', null, 'b']);
  assertEqual(home.slots[1].playerId, 'b');
});
test('lineup.movePlayer: 枠の選手同士は入れ替え', () => {
  const next = movePlayer(lineupHome(), 'a', { kind: 'player', playerId: 'b' });
  assertEqual(next.slots.map((s) => s.playerId), ['b', 'a', null]);
});
test('lineup.movePlayer: ベンチの選手をコートの選手に重ねると交代', () => {
  const next = movePlayer(lineupHome(), 'e', { kind: 'player', playerId: 'a' });
  assertEqual(next.slots[0].playerId, 'e');
  assertEqual(next.bench, ['d', 'a', 'f']);
});
test('lineup.movePlayer: 自由配置の選手と枠の選手の入れ替え (位置も交換)', () => {
  const next = movePlayer(lineupHome(), 'c', { kind: 'player', playerId: 'b' });
  assertEqual(next.slots[1].playerId, 'c');
  assertEqual(next.free, [{ playerId: 'b', x: 0.3, y: 0.7 }]);
});
test('lineup.movePlayer: 一覧から来た選手に場所を取られた選手は未配置に', () => {
  const next = movePlayer(lineupHome(), 'new', { kind: 'player', playerId: 'a' });
  assertEqual(next.slots[0].playerId, 'new');
  assertEqual(locate(next, 'a'), null);
});
test('lineup.movePlayer: ベンチ内の並べ替え・入れ替え', () => {
  assertEqual(movePlayer(lineupHome(), 'd', { kind: 'bench', index: 2 }).bench, ['e', 'd', 'f']);
  assertEqual(movePlayer(lineupHome(), 'd', { kind: 'player', playerId: 'f' }).bench, ['f', 'e', 'd']);
});
test('lineup.movePlayer: コートからベンチの末尾へ', () => {
  const next = movePlayer(lineupHome(), 'a', { kind: 'bench' });
  assertEqual(next.slots[0].playerId, null);
  assertEqual(next.bench, ['d', 'e', 'f', 'a']);
});
test('lineup.moveSlot / removePlayer', () => {
  assertEqual(moveSlot(lineupHome(), 1, 0.25, 0.35).slots[1], { position: 'DF', x: 0.25, y: 0.35, playerId: 'b' });
  const removed = removePlayer(lineupHome(), 'c');
  assertEqual(removed.free, []);
});
test('lineup.applyTemplate: コート上の選手をポジション優先で入れ直し、溢れはベンチへ', () => {
  const players = [
    { id: 'a', sports: { soccer: { positions: ['GK'] } } },
    { id: 'b', sports: { soccer: { positions: ['FW'] } } },
    { id: 'c', sports: { soccer: { positions: ['DF'] } } },
  ];
  const slots = [{ position: 'FW', x: 0.4, y: 0.5 }, { position: 'GK', x: 0.05, y: 0.5 }];
  const next = applyTemplate(lineupHome(), 'soccer:x', slots, players, 'soccer');
  assertEqual(next.slots.map((s) => s.playerId), ['b', 'a']);
  assertEqual(next.free, []);
  assertEqual(next.bench, ['c', 'd', 'e', 'f']);
  assertEqual(next.templateId, 'soccer:x');
});
test('lineup.applyTemplate: なし → 枠の選手はその位置の自由配置に', () => {
  const next = applyTemplate(lineupHome(), null, null, [], 'soccer');
  assertEqual(next.slots, []);
  assertEqual(next.free.map((f) => f.playerId), ['c', 'a', 'b']);
  assertEqual(next.templateId, null);
});
test('lineup.autoFill: 空き枠だけ、まだ置かれていない選手で埋める', () => {
  const candidates = [
    { id: 'd', sports: { soccer: { positions: ['FW'] } } }, // ベンチにいるので使わない
    { id: 'x', sports: { soccer: { positions: ['MF'] } } },
    { id: 'y', sports: { soccer: { positions: ['FW'] } } },
  ];
  assertEqual(autoFill(lineupHome(), candidates, 'soccer').slots.map((s) => s.playerId), ['a', 'b', 'y']);
});

test('lineup.fillWithGuests: 空き枠を仮の選手で埋める (番号は続きから)', () => {
  let id = 0;
  const home = { ...lineupHome(), guests: [{ id: 'guest-old', name: '仮2', position: 'MF' }] };
  home.free.push({ playerId: 'guest-old', x: 0.3, y: 0.3 });
  const next = fillWithGuests(home, { teamSize: 11, createId: () => `n${++id}` });
  assertEqual(next.slots[2].playerId, 'guest-n1');
  assertEqual(next.guests.map((g) => [g.name, g.position]), [['仮2', 'MF'], ['仮3', 'FW']]);
  assertEqual(guestsNeeded(next, 11), 0);
});
test('lineup.fillWithGuests: テンプレートなしなら 1チームの人数まで自由配置で足す', () => {
  const home = { templateId: null, slots: [], free: [{ playerId: 'a', x: 0.1, y: 0.1 }], bench: [], guests: [] };
  assertEqual(guestsNeeded(home, 5), 4);
  let id = 0;
  const next = fillWithGuests(home, { teamSize: 5, createId: () => `${++id}`, spots: [{ x: 0.2, y: 0.2 }, { x: 0.3, y: 0.3 }] });
  assertEqual(next.free.length, 5);
  assertEqual(next.free[1], { playerId: 'guest-1', x: 0.2, y: 0.2 });
  assertEqual(next.guests.map((g) => g.name), ['仮1', '仮2', '仮3', '仮4']);
});
test('lineup.pruneGuests: 配置から外れた仮の選手は消える', () => {
  const home = { ...lineupHome(), guests: [{ id: 'g1', name: '仮1', position: 'FW' }, { id: 'g2', name: '仮2', position: 'GK' }] };
  home.slots[2].playerId = 'g1';
  assertEqual(pruneGuests(home).guests.map((g) => g.id), ['g1']);
  assertEqual(guestAsPlayer(home.guests[0], 'soccer').sports.soccer.positions, ['FW']);
});

// --- models/boards ---
test('boards: 新しい配置は空 / 何か置くと空ではない', () => {
  const board = newBoard({ id: 'soccer', name: 'サッカー' }, '2026-10-12');
  assertEqual(board.name, '10/12 サッカー');
  assertEqual(isEmptyBoard(board), true);
  assertEqual(isEmptyBoard({ ...board, drawings: [{}] }), false);
  assertEqual(isEmptyBoard({ ...board, away: { templateId: null, markers: [{}] } }), false);
  assertEqual(isEmptyBoard({ ...board, home: { ...board.home, bench: ['a'] } }), false);
  assertEqual(isEmptyBoard({ ...board, ball: { x: 0.5, y: 0.5 } }), false);
  assertEqual(board.ball, null);
});
test('boards: 新しい順 (日付 → 更新日時)', () => {
  const list = [
    { id: '1', date: '2026-10-01', updatedAt: '2' },
    { id: '2', date: '2026-10-12', updatedAt: '1' },
    { id: '3', date: '2026-10-12', updatedAt: '3' },
  ];
  assertEqual(sortBoards(list).map((b) => b.id), ['3', '2', '1']);
});

// --- models/attendance ---
const D = '2026-10-12';
test('attendance.applyStatus: まとめて登録・未入力に戻すと日付ごと消える', () => {
  let att = applyStatus({}, D, ['a', 'b'], 'yes');
  assertEqual(att, { [D]: { a: { status: 'yes', arrived: false }, b: { status: 'yes', arrived: false } } });
  att = applyStatus(att, D, ['b'], 'no');
  assertEqual(att[D].b, { status: 'no' });
  att = applyStatus(att, D, ['a', 'b'], null);
  assertEqual(att, {});
});
test('attendance.applyStatus: 参加のまま再登録しても現着は消えない / 参加以外にすると現着は消える', () => {
  let att = applyArrived({}, D, 'a', true, new Date('2026-10-12T00:00:00Z'));
  att = applyStatus(att, D, ['a'], 'yes');
  assertEqual(att[D].a.arrived, true);
  att = applyStatus(att, D, ['a'], 'maybe');
  assertEqual(att[D].a, { status: 'maybe' });
});
test('attendance.applyArrived: 未入力の選手を現着にすると参加になる / 戻すと未着', () => {
  let att = applyArrived({}, D, 'a', true, new Date('2026-10-12T00:45:00Z'));
  assertEqual(att[D].a, { status: 'yes', arrived: true, arrivedAt: '2026-10-12T00:45:00.000Z' });
  att = applyArrived(att, D, 'a', false);
  assertEqual(att[D].a, { status: 'yes', arrived: false });
});
test('attendance.countDay / filterByAttendance / describe', () => {
  const day = { a: { status: 'yes', arrived: true }, b: { status: 'yes', arrived: false }, c: { status: 'no' }, d: { status: 'maybe' } };
  const ps = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id }));
  assertEqual(countDay(day, ps), { yes: 2, no: 1, maybe: 1, none: 1, arrived: 1 });
  assertEqual(filterByAttendance(ps, day, 'yes').map((p) => p.id), ['a', 'b']);
  assertEqual(filterByAttendance(ps, day, 'arrived').map((p) => p.id), ['a']);
  assertEqual([describe(day.a), describe(day.b), describe(day.c), describe(undefined)], ['参加 / ✓現着', '参加 / 未着', '不参加', '未入力']);
});

// --- share ---
const shareSport = { id: 'soccer', penColors: ['#ffffff', '#e53935', '#1e88e5', '#fdd835'] };
function shareBoard() {
  const players = {
    a: { id: 'a', name: '山田', sports: { soccer: { number: '10', positions: ['FW'] } } },
    b: { id: 'b', name: '佐藤', sports: { soccer: { number: '4', positions: ['DF'] } } },
    c: { id: 'c', name: '鈴木', sports: { soccer: { number: '', positions: [] } } },
  };
  return {
    board: {
      name: '10/12 練習試合', date: '2026-10-12',
      home: {
        slots: [{ position: 'FW', x: 0.43, y: 0.5, playerId: 'a' }, { position: 'GK', x: 0.04, y: 0.5, playerId: null }],
        free: [{ playerId: 'b', x: 0.2, y: 0.3 }],
        bench: ['c'],
      },
      away: { markers: [{ id: 'm', position: 'GK', x: 0.96, y: 0.5 }] },
      ball: { x: 0.5, y: 0.5 },
      drawings: [
        { type: 'arrow', color: '#e53935', width: 2, points: [[0.43, 0.5], [0.6, 0.4]] },
        { type: 'pen', color: '#123456', width: 3, points: [[0.1, 0.1], [0.12, 0.11], [0.15, 0.13]] },
      ],
    },
    playerOf: (id) => players[id] ?? null,
  };
}
test('share: 文字列にして戻すと同じ配置になる', async () => {
  const { board, playerOf } = shareBoard();
  const code = await encodeShare(toShareData(board, shareSport, playerOf));
  if (!/^[zj][A-Za-z0-9_-]+$/.test(code)) throw new Error(`URL に使えない文字がある: ${code}`);
  const shared = fromShareData(await decodeShare(code), shareSport);
  assertEqual([shared.sportId, shared.name, shared.date], ['soccer', '10/12 練習試合', '2026-10-12']);
  assertEqual(shared.players.map((p) => [p.name, p.sports.soccer.number, p.sports.soccer.positions]),
    [['山田', '10', ['FW']], ['佐藤', '4', ['DF']], ['鈴木', '', []]]);
  assertEqual(shared.home.slots, [{ position: 'GK', x: 0.04, y: 0.5, playerId: null }]);
  assertEqual(shared.home.free, [{ playerId: 's0', x: 0.43, y: 0.5 }, { playerId: 's1', x: 0.2, y: 0.3 }]);
  assertEqual(shared.home.bench, ['s2']);
  assertEqual(shared.away.markers.map((m) => [m.position, m.x, m.y]), [['GK', 0.96, 0.5]]);
  assertEqual(shared.ball, { x: 0.5, y: 0.5 });
  assertEqual(shared.drawings.map((d) => [d.type, d.color, d.width, d.points]), [
    ['arrow', '#e53935', 2, [[0.43, 0.5], [0.6, 0.4]]],
    ['pen', '#123456', 3, [[0.1, 0.1], [0.12, 0.11], [0.15, 0.13]]],
  ]);
});
test('share: 11対11 + 矢印5本 + ペン2本 で URL が短い (1000文字未満)', async () => {
  const players = {};
  const slots = [];
  for (let i = 0; i < 11; i++) {
    players[`p${i}`] = { id: `p${i}`, name: `選手${i + 1}`, sports: { soccer: { number: String(i + 1), positions: ['MF'] } } };
    slots.push({ position: 'MF', x: 0.05 + i * 0.04, y: (i % 4) * 0.25 + 0.1, playerId: `p${i}` });
  }
  const markers = slots.map((s, i) => ({ id: `m${i}`, position: 'MF', x: 1 - s.x, y: 1 - s.y }));
  const pen = (k) => ({ type: 'pen', color: '#e53935', width: 2, points: Array.from({ length: 40 }, (_, i) => [0.3 + i * 0.005, 0.3 + Math.sin(i / 5 + k) * 0.05]) });
  const arrows = Array.from({ length: 5 }, (_, i) => ({ type: 'arrow', color: '#ffffff', width: 2, points: [[0.2 + i * 0.05, 0.2], [0.4 + i * 0.05, 0.4]] }));
  const board = {
    name: '10/12 練習試合 前半', date: '2026-10-12',
    home: { slots, free: [], bench: [] }, away: { markers }, ball: { x: 0.5, y: 0.5 },
    drawings: [...arrows, pen(0), pen(1)],
  };
  const code = await encodeShare(toShareData(board, shareSport, (id) => players[id]));
  if (code.length >= 1000) throw new Error(`${code.length}文字`);
});
test('share: 壊れた文字列はエラー', async () => {
  let failed = false;
  try {
    fromShareData(await decodeShare('zこわれた'), shareSport);
  } catch {
    failed = true;
  }
  assertEqual(failed, true);
});

// --- PWA ---
test('sw.js: 先にキャッシュするファイルがすべて存在する (1つでも無いとオフライン用キャッシュが作られない)', async () => {
  const source = await (await fetch('../sw.js', { cache: 'no-store' })).text();
  const paths = [...source.matchAll(/'(\.\/[^']*)'/g)].map((m) => m[1]);
  if (paths.length < 10) throw new Error(`PRECACHE が読み取れない (${paths.length}件)`);
  const missing = [];
  for (const path of paths) {
    const res = await fetch(new URL(path, new URL('../', location.href)), { method: 'HEAD', cache: 'no-store' });
    if (!res.ok) missing.push(path);
  }
  assertEqual(missing, []);
});
test('manifest.json: 必要な項目とアイコン', async () => {
  const manifest = await (await fetch('../manifest.json', { cache: 'no-store' })).json();
  assertEqual([manifest.name, manifest.start_url, manifest.display], ['Formation Board', './#/home', 'standalone']);
  const sizes = manifest.icons.map((i) => i.sizes);
  if (!sizes.includes('192x192') || !sizes.includes('512x512')) throw new Error('192 / 512 のアイコンが無い');
  if (!manifest.icons.some((i) => i.purpose === 'maskable')) throw new Error('maskable アイコンが無い');
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
