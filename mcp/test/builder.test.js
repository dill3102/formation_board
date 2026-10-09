import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadSports, buildBoard, createShareUrl, readShareUrl, decodeShareCode, shareUrlFor } from '../builder.js';
import { fromShareData } from '../../js/share.js';

const sports = loadSports();
const soccer = sports.find((s) => s.id === 'soccer');

const SPEC = {
  sport: 'soccer',
  name: '右CK 攻撃',
  date: '2026-10-07',
  home: {
    formation: '4-4-2',
    players: [
      { name: '山田', number: 1, position: 'GK' },
      { name: '佐藤', number: 10, position: 'FW', x: 0.95, y: 0.4 },
      { name: '鈴木', number: 9, position: 'FW' },
      { name: '田中', number: 5, position: 'DF' },
    ],
    bench: [{ name: '高橋', number: 12 }],
  },
  away: { formation: '4-4-2' },
  ball: { x: 1, y: 1 },
  drawings: [
    { type: 'arrow', points: [[1, 1], [0.9, 0.5]], color: 'red' },
    { type: 'dashArrow', points: [[0.8, 0.6], [0.92, 0.45]] },
    { type: 'text', points: [[0.7, 0.2]], text: 'ニア' },
  ],
  routes: [
    { name: '案1', note: 'ニアに速いボール', frames: [{ moves: [{ target: 'ball', x: 0.95, y: 0.42 }, { target: '#10', x: 0.96, y: 0.43 }] }] },
    { name: '案2', note: 'ファーへ', frames: [{ moves: [{ target: 'ボール', x: 0.94, y: 0.65 }, { target: '鈴木', x: 0.93, y: 0.66 }] }] },
  ],
};

test('buildBoard: 座標あり → 自由配置、なし → テンプレートの枠 (ポジション優先)', () => {
  const { board, warnings } = buildBoard(SPEC, sports);
  assert.deepEqual(warnings, []);
  assert.equal(board.home.templateId, 'soccer:4-4-2');
  assert.equal(board.home.free.length, 1);
  assert.equal(board.home.free[0].x, 0.95);
  const filled = board.home.slots.filter((s) => s.playerId);
  assert.equal(filled.length, 3);
  assert.equal(board.home.slots.find((s) => s.position === 'GK').playerId, 'm1');
  assert.equal(board.home.bench.length, 1);
  assert.equal(board.away.markers.length, 11);
  assert.ok(board.away.markers.every((m) => m.x > 0.5 || m.position !== 'GK'));
  assert.equal(board.drawings[1].type, 'arrow');
  assert.equal(board.drawings[1].dashed, true);
  assert.equal(board.drawings[0].color, '#e53935');
  assert.equal(board.plays.length, 2);
  assert.deepEqual(board.plays[0].steps[0], { b: [0.95, 0.42], 'p:m2': [0.96, 0.43] });
  assert.deepEqual(board.plays[1].steps[0], { b: [0.94, 0.65], 'p:m3': [0.93, 0.66] });
});

test('buildBoard: 見つからない対象・フォーメーション・スポーツは警告 / エラー', () => {
  const { warnings } = buildBoard({
    sport: 'soccer', home: { formation: '9-9-9', players: [{ name: 'A' }] },
    frames: [{ moves: [{ target: '#99', x: 0.5, y: 0.5 }] }],
  }, sports);
  assert.equal(warnings.length, 3);
  assert.throws(() => buildBoard({ sport: 'rugby' }, sports), /rugby/);
});

test('buildBoard: テンプレートの枠より多い選手はベンチ', () => {
  const players = Array.from({ length: 13 }, (_, i) => ({ name: `P${i}` }));
  const { board, warnings } = buildBoard({ sport: 'soccer', home: { formation: '4-3-3', players } }, sports);
  assert.equal(board.home.slots.filter((s) => s.playerId).length, 11);
  assert.equal(board.home.bench.length, 2);
  assert.equal(warnings.length, 1);
});

test('createShareUrl → サイトの fromShareData で読める', () => {
  const { url } = createShareUrl(SPEC, { baseUrl: 'http://localhost:8000/', sports });
  assert.match(url, /^http:\/\/localhost:8000\/#\/view\/z[\w-]+$/);
  const shared = fromShareData(decodeShareCode(url.split('#/view/')[1]), soccer);
  assert.equal(shared.name, '右CK 攻撃');
  assert.equal(shared.players.length, 5);
  assert.equal(shared.plays.length, 2);
  assert.equal(shared.plays[1].note, 'ファーへ');
  assert.deepEqual(shared.ball, { x: 1, y: 1 });
  assert.equal(shared.drawings[2].text, 'ニア');
});

test('readShareUrl: 読みやすい形に戻す', () => {
  const { url } = createShareUrl(SPEC, { sports });
  const read = readShareUrl(url, sports);
  assert.equal(read.sport, 'soccer');
  assert.equal(read.home.players.length, 4);
  assert.ok(read.home.players.some((p) => p.name === '佐藤' && p.number === '10' && p.x === 0.95));
  assert.equal(read.bench[0].name, '高橋');
  assert.equal(read.away.markers.length, 11);
  assert.equal(read.drawings[1].type, 'dashArrow');
  assert.equal(read.routes[0].frameCount, 2);
  assert.deepEqual(read.routes[0].frames[0].moves.find((m) => m.target === 'ball'), { target: 'ball', x: 0.95, y: 0.42 });
  assert.deepEqual(read.routes[1].finalPositions['鈴木'], [0.93, 0.66]);
});

test('shareUrlFor: 末尾の / や index.html を扱う', () => {
  assert.equal(shareUrlFor('zA', 'https://a.example/app'), 'https://a.example/app/#/view/zA');
  assert.equal(shareUrlFor('zA', 'https://a.example/index.html#/home'), 'https://a.example/index.html#/view/zA');
});

test('全スポーツでテンプレートから作れる', () => {
  for (const sport of sports) {
    const formation = sport.formations[0];
    const players = formation.slots.map((s, i) => ({ name: `${sport.id}${i}`, position: s.position }));
    const { url, warnings } = createShareUrl({ sport: sport.id, home: { formation: formation.id, players }, away: { formation: formation.id } }, { sports });
    assert.deepEqual(warnings, [], sport.id);
    const read = readShareUrl(url, sports);
    assert.equal(read.home.players.length, players.length, sport.id);
  }
});

test("目線: 数字・ball・全員・コマごと、読み戻し", () => {
  const spec = {
    sport: "soccer",
    home: { facing: "ball", players: [
      { name: "A", x: 0.5, y: 0.5 },
      { name: "B", x: 0.4, y: 0.5, facing: 90 },
    ] },
    away: { markers: [{ position: "GK", x: 0.9, y: 0.5 }], facing: 180 },
    ball: { x: 0.6, y: 0.5 },
    frames: [{ moves: [{ target: "ball", x: 0.5, y: 0.6 }, { target: "A", facing: "ball" }, { target: "B", facing: null }] }],
  };
  const { board, warnings } = buildBoard(spec, sports);
  assert.deepEqual(warnings, []);
  assert.deepEqual(board.facing, { "p:m1": 0, "p:m2": 90, "m:a0": 180 });
  assert.deepEqual(board.plays[0].steps[0], { b: [0.5, 0.6], "v:p:m1": 90, "v:p:m2": null });
  const read = readShareUrl(createShareUrl(spec, { sports }).url, sports);
  assert.equal(read.home.players.find((p) => p.name === "B").facing, 90);
  assert.equal(read.away.markers[0].facing, 180);
  assert.deepEqual(read.routes[0].frames[0].moves.find((m) => m.target === "A"), { target: "A", facing: 90 });
  assert.deepEqual(read.routes[0].finalFacing, { A: 90, "away:0": 180 });
});

test("目線: ボールが無いのに ball は警告", () => {
  const { board, warnings } = buildBoard({ sport: "soccer", home: { players: [{ name: "A", x: 0.5, y: 0.5, facing: "ball" }] } }, sports);
  assert.deepEqual(board.facing, {});
  assert.equal(warnings.length, 1);
});
