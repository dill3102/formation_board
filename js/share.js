// URL での共有
// 配置 (選手の名前・背番号・ポジション・座標、ベンチ、敵マーカー、ボール、書き込み) を
// 短い JSON にまとめ → 圧縮 (deflate) → URL に使える文字 (base64url) にする
// URL: <サイト>#/view/<文字列>  ※ # 以降はサーバーに送られない
// 写真・出欠は含めない。サーバーが無いので、URL そのものにデータが入っている
//
// 文字列の先頭 1文字 = 形式: "z" = 圧縮あり / "j" = 圧縮なし (CompressionStream が無いブラウザ用)

const FORMAT_VERSION = 1;
const SCALE = 1000; // 座標は 0〜1 を 0〜1000 の整数にする (サッカーで約 10cm 単位)

// 書き込みの種類の番号 (0 = ペン / 1 = 矢印 は最初の形式と同じ)
const STROKE_CODES = { pen: 0, arrow: 1, dashArrow: 2, line: 3, circle: 5, text: 6 };
const strokeKey = (stroke) => (stroke.type === 'arrow' && stroke.dashed ? 'dashArrow' : stroke.type);

const q = (v) => Math.round(v * SCALE);
const uq = (v) => v / SCALE;

// ---- 配置 ⇔ 共有データ (短いキーの JSON) ----

/**
 * @param {object} board
 * @param {object} sport
 * @param {(id: string) => object | null} playerOf 選手 ID → 選手 (仮の選手も)
 */
export function toShareData(board, sport, playerOf) {
  const person = (id) => {
    const p = playerOf(id);
    const info = p?.sports?.[sport.id];
    return [p?.name ?? '?', info?.number ?? '', info?.positions?.[0] ?? ''];
  };
  const home = [
    // 枠: 選手がいれば [名前, 背番号, 枠のポジション, x, y]、空き枠は [ "", "", ポジション, x, y ]
    ...board.home.slots.map((s) => (s.playerId
      ? [...person(s.playerId).slice(0, 2), s.position, q(s.x), q(s.y)]
      : ['', '', s.position, q(s.x), q(s.y)])),
    ...board.home.free.map((f) => [...person(f.playerId), q(f.x), q(f.y)]),
  ];
  const data = {
    v: FORMAT_VERSION,
    s: sport.id,
    n: board.name,
    d: board.date,
    h: home,
  };
  if (board.home.bench.length) data.e = board.home.bench.map((id) => person(id));
  if (board.away.markers.length) data.a = board.away.markers.map((m) => [m.position, q(m.x), q(m.y)]);
  if (board.ball) data.b = [q(board.ball.x), q(board.ball.y)];
  if (board.drawings.length) {
    data.w = board.drawings.map((stroke) => {
      const color = sport.penColors.indexOf(stroke.color);
      // 点は1つ目を絶対座標、2つ目以降は前の点との差 (数字が小さくなり圧縮が効く)
      const points = [];
      let px = 0;
      let py = 0;
      for (const [x, y] of stroke.points) {
        const qx = q(x);
        const qy = q(y);
        points.push(qx - px, qy - py);
        px = qx;
        py = qy;
      }
      const row = [STROKE_CODES[strokeKey(stroke)] ?? 0, color >= 0 ? color : stroke.color, stroke.width, ...points];
      if (stroke.type === 'text') row.push(stroke.text ?? '');
      return row;
    });
  }
  // コマ送り: 各コマ = [種類, 番号, x, y, …] (種類 0 = h の行 / 1 = 敵マーカー a / 2 = ボール)
  const refs = {};
  board.home.slots.forEach((s, i) => { if (s.playerId) refs[`p:${s.playerId}`] = [0, i]; });
  board.home.free.forEach((f, j) => { refs[`p:${f.playerId}`] = [0, board.home.slots.length + j]; });
  board.away.markers.forEach((m, k) => { refs[`m:${m.id}`] = [1, k]; });
  refs.b = [2, 0];
  const encodeSteps = (steps) => steps.map((step) => Object.entries(step)
    .filter(([key]) => refs[key])
    .flatMap(([key, [x, y]]) => [...refs[key], q(x), q(y)]));
  // 案 (ルート) が複数ある・説明がある時は r = [[名前, 説明, コマ], …]、ri = 表示中の案の番号
  const plays = board.plays?.length
    ? board.plays.map((p) => (p.id === board.activePlayId ? { ...p, steps: board.steps ?? [] } : p))
    : [{ name: '案1', note: '', steps: board.steps ?? [] }];
  if (plays.length > 1 || plays.some((p) => p.note)) {
    data.r = plays.map((p) => [p.name, p.note ?? '', encodeSteps(p.steps ?? [])]);
    data.ri = Math.max(0, plays.findIndex((p) => p.id === board.activePlayId));
  } else if (board.steps?.length) {
    data.f = encodeSteps(board.steps);
  }
  return data;
}

/**
 * 共有データ → 表示用の配置
 * @returns {{ sportId, name, date, players: object[], home: object, away: object, ball, drawings, steps, plays, activePlayId }}
 *   players = 共有された選手 (id は "s0", "s1" …)。home は slots / free / bench (players の id を参照)
 */
export function fromShareData(data, sport) {
  if (!data || data.v !== FORMAT_VERSION || !Array.isArray(data.h)) throw new Error('共有データの形式が違います');
  const players = [];
  const addPlayer = ([name, number, position]) => {
    const id = `s${players.length}`;
    players.push({
      id, name, handedness: null, hasPhoto: false, shared: true,
      sports: { [data.s]: { number: String(number ?? ''), positions: position ? [position] : [] } },
    });
    return id;
  };
  const home = { templateId: null, slots: [], free: [], bench: [] };
  const rowKeys = []; // h の行 → コマ送りのキー
  for (const row of data.h) {
    const [name, number, position, x, y] = row;
    if (name === '' && number === '') {
      home.slots.push({ position, x: uq(x), y: uq(y), playerId: null });
      rowKeys.push(null);
    } else {
      const id = addPlayer([name, number, position]);
      home.free.push({ playerId: id, x: uq(x), y: uq(y) });
      rowKeys.push(`p:${id}`);
    }
  }
  home.bench = (data.e ?? []).map(addPlayer);
  const away = {
    templateId: null,
    markers: (data.a ?? []).map(([position, x, y], i) => ({ id: `m${i}`, position, x: uq(x), y: uq(y) })),
  };
  const drawings = (data.w ?? []).map(([code, color, width, ...deltas], i) => {
    const text = code === STROKE_CODES.text && typeof deltas[deltas.length - 1] === 'string' ? deltas.pop() : null;
    const points = [];
    let x = 0;
    let y = 0;
    for (let k = 0; k + 1 < deltas.length; k += 2) {
      x += deltas[k];
      y += deltas[k + 1];
      points.push([uq(x), uq(y)]);
    }
    const key = Object.keys(STROKE_CODES).find((k) => STROKE_CODES[k] === code) ?? 'pen';
    const stroke = {
      id: `d${i}`,
      type: key === 'dashArrow' ? 'arrow' : key,
      color: typeof color === 'number' ? (sport?.penColors[color] ?? '#e53935') : color,
      width,
      points,
    };
    if (key === 'dashArrow') stroke.dashed = true;
    if (text !== null) stroke.text = text;
    return stroke;
  });
  const decodeSteps = (list) => (list ?? []).map((flat) => {
    const step = {};
    for (let k = 0; k + 3 < flat.length; k += 4) {
      const [type, index, x, y] = flat.slice(k, k + 4);
      const key = type === 0 ? rowKeys[index] : type === 1 ? `m:m${index}` : 'b';
      if (key) step[key] = [uq(x), uq(y)];
    }
    return step;
  });
  const plays = data.r
    ? data.r.map(([name, note, steps], i) => ({ id: `play-${i + 1}`, name, note: note ?? '', steps: decodeSteps(steps) }))
    : [{ id: 'play-1', name: '案1', note: '', steps: decodeSteps(data.f) }];
  const active = plays[data.ri ?? 0] ?? plays[0];
  return {
    sportId: data.s,
    name: data.n ?? '',
    date: data.d ?? '',
    players,
    home,
    away,
    ball: data.b ? { x: uq(data.b[0]), y: uq(data.b[1]) } : null,
    drawings,
    plays,
    activePlayId: active.id,
    steps: active.steps,
  };
}

// ---- 文字列にする / 戻す ----

function toBase64Url(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text) {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

async function transform(bytes, stream) {
  const result = await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer();
  return new Uint8Array(result);
}

const canCompress = () => typeof CompressionStream === 'function';

/** 共有データ → URL に入れる文字列 */
export async function encodeShare(data) {
  const bytes = new TextEncoder().encode(JSON.stringify(data));
  if (canCompress()) return `z${toBase64Url(await transform(bytes, new CompressionStream('deflate-raw')))}`;
  return `j${toBase64Url(bytes)}`;
}

/** URL の文字列 → 共有データ */
export async function decodeShare(code) {
  const kind = code[0];
  const bytes = fromBase64Url(code.slice(1));
  let json;
  if (kind === 'z') {
    if (typeof DecompressionStream !== 'function') throw new Error('このブラウザでは開けません (ブラウザを最新にしてください)');
    json = new TextDecoder().decode(await transform(bytes, new DecompressionStream('deflate-raw')));
  } else if (kind === 'j') {
    json = new TextDecoder().decode(bytes);
  } else {
    throw new Error('共有データの形式が違います');
  }
  return JSON.parse(json);
}

/** 共有 URL (今開いているサイトの場所を基準にする) */
export function shareUrl(code) {
  return `${location.origin}${location.pathname}#/view/${code}`;
}
