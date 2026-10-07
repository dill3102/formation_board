// AI (MCP クライアント) から受け取った指示を、サイトの「配置」データに組み立てる
// サイト側の計算 (js/) をそのまま使うので、共有 URL の形はサイトと必ず一致する
import { readFileSync } from 'node:fs';
import { deflateRawSync, inflateRawSync } from 'node:zlib';
import { SPORT_IDS } from '../js/sports.js';
import { toShareData, fromShareData } from '../js/share.js';
import { assignPlayersToSlots, mirrorSlots } from '../js/board/formation.js';
import { positionsAt, frameCount } from '../js/board/frames.js';

const SPORTS_DIR = new URL('../data/sports/', import.meta.url);

export const DEFAULT_BASE_URL = 'https://dill3102.github.io/formation_board/';

/** 色の名前 → コード (それ以外は "#rrggbb" をそのまま使う) */
const COLOR_NAMES = {
  white: '#ffffff', black: '#111111', red: '#e53935', blue: '#1e88e5', yellow: '#fdd835', green: '#43a047', orange: '#fb8c00',
  白: '#ffffff', 黒: '#111111', 赤: '#e53935', 青: '#1e88e5', 黄: '#fdd835', 緑: '#43a047', オレンジ: '#fb8c00',
};

export function loadSports() {
  return SPORT_IDS.map((id) => JSON.parse(readFileSync(new URL(`${id}.json`, SPORTS_DIR), 'utf8')));
}

const round = (v) => Math.round(v * 1000) / 1000;
const clamp = (v) => Math.min(1.03, Math.max(-0.03, Number(v)));

function findFormation(sport, name) {
  if (!name) return null;
  const key = String(name).trim().toLowerCase();
  return sport.formations.find((f) => f.id.toLowerCase() === key || f.name.toLowerCase() === key ||
    f.name.toLowerCase().startsWith(`${key} `)) ?? null;
}

function resolveColor(color, sport) {
  if (color === undefined || color === null || color === '') return sport.penColors[1] ?? sport.penColors[0];
  if (typeof color === 'number') return sport.penColors[color] ?? sport.penColors[0];
  if (/^#[0-9a-f]{6}$/i.test(color)) return color.toLowerCase();
  return COLOR_NAMES[String(color).toLowerCase()] ?? COLOR_NAMES[color] ?? sport.penColors[1];
}

/**
 * 指示 (spec) → { board, sport, playerOf, warnings }
 * spec の形は server.js の create_board の inputSchema を参照
 */
export function buildBoard(spec, sports = loadSports()) {
  const warnings = [];
  const sport = sports.find((s) => s.id === spec.sport);
  if (!sport) throw new Error(`スポーツ "${spec.sport}" はありません (${sports.map((s) => s.id).join(' / ')})`);

  // ---- 自チーム ----
  const people = new Map(); // ID → 選手 (名前・背番号・ポジション)
  let seq = 0;
  const addPerson = (p) => {
    const id = `m${++seq}`;
    people.set(id, {
      id, name: String(p.name ?? `選手${seq}`), hasPhoto: false,
      sports: { [sport.id]: { number: p.number === undefined ? '' : String(p.number), positions: p.position ? [String(p.position)] : [] } },
    });
    return id;
  };

  const homeSpec = spec.home ?? {};
  const formation = findFormation(sport, homeSpec.formation);
  if (homeSpec.formation && !formation) {
    warnings.push(`フォーメーション "${homeSpec.formation}" が見つからないので、テンプレートなしにしました (使えるもの: ${sport.formations.map((f) => f.id).join(', ') || 'なし'})`);
  }
  const home = { templateId: formation ? `${sport.id}:${formation.id}` : null, slots: [], free: [], bench: [] };
  const players = (homeSpec.players ?? []).map((p) => ({ spec: p, id: addPerson(p) }));

  // 座標を指定した選手は自由配置、それ以外はテンプレートの枠へ (ポジション優先)
  const withPos = players.filter(({ spec: p }) => Number.isFinite(p.x) && Number.isFinite(p.y));
  const withoutPos = players.filter((p) => !withPos.includes(p));
  for (const { spec: p, id } of withPos) home.free.push({ playerId: id, x: round(clamp(p.x)), y: round(clamp(p.y)) });
  if (formation) {
    const candidates = withoutPos.map(({ id }) => people.get(id));
    const { slots, rest } = assignPlayersToSlots(formation.slots, candidates, sport.id);
    home.slots = slots.map(({ position, x, y, playerId }) => ({ position, x, y, playerId }));
    home.bench.push(...rest.map((p) => p.id));
    if (rest.length) warnings.push(`テンプレートの枠に入らなかった ${rest.length}人はベンチにしました`);
  } else if (withoutPos.length) {
    home.bench.push(...withoutPos.map((p) => p.id));
    warnings.push(`座標 (x, y) が無くテンプレートも無い ${withoutPos.length}人はベンチにしました`);
  }
  for (const p of homeSpec.bench ?? []) home.bench.push(addPerson(p));

  // ---- 敵チーム ----
  const awaySpec = spec.away ?? {};
  const awayFormation = findFormation(sport, awaySpec.formation);
  if (awaySpec.formation && !awayFormation) warnings.push(`敵のフォーメーション "${awaySpec.formation}" が見つかりません`);
  const markers = [];
  if (awayFormation) {
    for (const s of mirrorSlots(awayFormation.slots)) markers.push({ id: `a${markers.length}`, position: s.position, x: round(s.x), y: round(s.y) });
  }
  for (const m of awaySpec.markers ?? []) {
    markers.push({ id: `a${markers.length}`, position: String(m.position ?? '?'), x: round(clamp(m.x)), y: round(clamp(m.y)) });
  }
  const away = { templateId: awayFormation ? `${sport.id}:${awayFormation.id}` : null, markers };

  // ---- ボール・書き込み ----
  const ball = spec.ball ? { x: round(clamp(spec.ball.x)), y: round(clamp(spec.ball.y)) } : null;
  const drawings = (spec.drawings ?? []).map((d, i) => {
    const kind = d.type ?? 'arrow';
    const stroke = {
      id: `d${i}`,
      type: kind === 'dashArrow' ? 'arrow' : kind,
      color: resolveColor(d.color, sport),
      width: [1, 2, 3].includes(d.width) ? d.width : 2,
      points: (d.points ?? []).map(([x, y]) => [round(clamp(x)), round(clamp(y))]),
    };
    if (kind === 'dashArrow') stroke.dashed = true;
    if (kind === 'text') stroke.text = String(d.text ?? '');
    const need = kind === 'pen' ? 1 : kind === 'text' ? 1 : 2;
    if (stroke.points.length < need) warnings.push(`書き込み ${i + 1} (${kind}) の点が足りません (${need}点以上)`);
    return stroke;
  }).filter((s) => s.points.length > 0);

  // ---- コマ送り・案 ----
  const allPlayers = [...people.values()];
  const keyForTarget = (target) => {
    const t = String(target).trim();
    if (t === 'ball' || t === 'ボール') return ball ? 'b' : null;
    const awayMatch = /^away:(\d+)$/i.exec(t) ?? /^敵:(\d+)$/.exec(t);
    if (awayMatch) return markers[Number(awayMatch[1])] ? `m:${markers[Number(awayMatch[1])].id}` : null;
    const number = /^#(.+)$/.exec(t)?.[1];
    const player = number !== undefined
      ? allPlayers.find((p) => p.sports[sport.id].number === number)
      : allPlayers.find((p) => p.name === t);
    return player ? `p:${player.id}` : null;
  };
  const buildSteps = (frames, label) => (frames ?? []).map((frame, i) => {
    const step = {};
    for (const move of frame.moves ?? []) {
      const key = keyForTarget(move.target);
      if (!key) {
        warnings.push(`${label} コマ${i + 2}: 動かす対象 "${move.target}" が見つかりません`);
        continue;
      }
      step[key] = [round(clamp(move.x)), round(clamp(move.y))];
    }
    return step;
  });
  const routeSpecs = spec.routes?.length ? spec.routes : spec.frames?.length ? [{ name: '案1', note: '', frames: spec.frames }] : [];
  const plays = routeSpecs.map((r, i) => ({
    id: `play-${i + 1}`, name: r.name || `案${i + 1}`, note: r.note ?? '', steps: buildSteps(r.frames, r.name || `案${i + 1}`),
  }));

  const board = {
    name: spec.name || `${sport.name}の配置`,
    date: spec.date || new Date().toISOString().slice(0, 10),
    sportId: sport.id,
    home, away, ball, drawings,
    plays: plays.length ? plays : [{ id: 'play-1', name: '案1', note: '', steps: [] }],
    activePlayId: 'play-1',
  };
  board.steps = board.plays[0].steps;
  return { board, sport, playerOf: (id) => people.get(id) ?? null, warnings };
}

// ---- 共有 URL ----

/** 共有データ → URL の文字列 (サイトと同じ形式: "z" + deflate-raw + base64url) */
export function encodeShareCode(data) {
  return `z${deflateRawSync(Buffer.from(JSON.stringify(data), 'utf8')).toString('base64url')}`;
}

export function decodeShareCode(code) {
  const body = code.slice(1);
  if (code[0] === 'z') return JSON.parse(inflateRawSync(Buffer.from(body, 'base64url')).toString('utf8'));
  if (code[0] === 'j') return JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  throw new Error('共有 URL の形式が違います');
}

export function shareUrlFor(code, baseUrl = DEFAULT_BASE_URL) {
  const base = baseUrl.split('#')[0];
  return `${base.endsWith('/') || base.endsWith('.html') ? base : `${base}/`}#/view/${code}`;
}

export function createShareUrl(spec, { baseUrl, sports } = {}) {
  const { board, sport, playerOf, warnings } = buildBoard(spec, sports);
  const code = encodeShareCode(toShareData(board, sport, playerOf));
  return { url: shareUrlFor(code, baseUrl), board, sport, warnings };
}

/** 共有 URL (or #/view/ 以降の文字列) → 読みやすい形の配置 */
export function readShareUrl(urlOrCode, sports = loadSports()) {
  const code = String(urlOrCode).trim().replace(/^.*#\/view\//, '');
  const data = decodeShareCode(code);
  const sport = sports.find((s) => s.id === data.s);
  const shared = fromShareData(data, sport);
  const players = new Map(shared.players.map((p) => [p.id, p]));
  const info = (id) => {
    const p = players.get(id);
    const s = p?.sports?.[shared.sportId] ?? {};
    return { name: p?.name ?? '?', number: s.number ?? '', position: s.positions?.[0] ?? '' };
  };
  const markerIndex = new Map(shared.away.markers.map((m, i) => [m.id, i]));
  const targetName = (key) => {
    if (key === 'b') return 'ball';
    if (key.startsWith('m:')) return `away:${markerIndex.get(key.slice(2))}`;
    return info(key.slice(2)).name;
  };
  return {
    sport: shared.sportId,
    name: shared.name,
    date: shared.date,
    home: {
      players: shared.home.free.map((f) => ({ ...info(f.playerId), x: f.x, y: f.y })),
      emptySlots: shared.home.slots.map((s) => ({ position: s.position, x: s.x, y: s.y })),
    },
    bench: shared.home.bench.map((id) => info(id)),
    away: { markers: shared.away.markers.map((m) => ({ position: m.position, x: m.x, y: m.y })) },
    ball: shared.ball,
    drawings: shared.drawings.map((d) => ({
      type: d.type === 'arrow' && d.dashed ? 'dashArrow' : d.type, color: d.color, width: d.width, points: d.points,
      ...(d.text !== undefined ? { text: d.text } : {}),
    })),
    routes: (shared.plays ?? []).map((play) => ({
      name: play.name,
      note: play.note,
      frames: play.steps.map((step) => ({
        moves: Object.entries(step).map(([key, [x, y]]) => ({ target: targetName(key), x, y })),
      })),
      frameCount: frameCount({ ...shared, steps: play.steps }),
      finalPositions: Object.fromEntries(Object.entries(positionsAt({ ...shared, steps: play.steps }, play.steps.length))
        .map(([key, pos]) => [targetName(key), pos])),
    })),
  };
}
