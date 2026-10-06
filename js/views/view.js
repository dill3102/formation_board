// 共有された配置を見る (#/view/<共有文字列>)。見るだけ (拡大縮小・移動はできる)
// 「自分の配置として保存」で、自分のボードに取り込める
//   共有された選手は、自分の選手名簿に同じ名前の選手 (そのスポーツに登録済み) がいればその選手に、
//   いなければ「仮の選手」(その配置の中だけ) にする
import { h } from '../util/dom.js';
import { createId } from '../util/id.js';
import { formatShort, todayKey } from '../util/date.js';
import { getSport } from '../sports.js';
import { listPlayers } from '../models/players.js';
import { newBoard, saveBoard } from '../models/boards.js';
import { decodeShare, fromShareData } from '../share.js';
import { showToast } from '../ui/toast.js';
import { Viewport } from '../board/viewport.js';
import { drawCourt, courtSize } from '../board/court.js';
import { PieceLayer } from '../board/pieces.js';
import { attachStageInput } from '../board/input.js';
import { drawStrokes } from '../board/drawing.js';
import * as storage from '../storage.js';
import { KEYS } from '../storage.js';

const ZOOM_STEP = 1.25;

export function render(root, [code]) {
  let cleanup = null;
  let cancelled = false;
  const loading = h('section', { class: 'card' }, h('p', { class: 'empty' }, '読み込み中…'));
  root.append(loading);

  (async () => {
    let shared;
    let sport;
    try {
      if (!code) throw new Error('共有データがありません');
      const data = await decodeShare(code);
      sport = getSport(data.s);
      if (!sport) throw new Error('対応していないスポーツです');
      shared = fromShareData(data, sport);
    } catch (err) {
      if (cancelled) return;
      loading.replaceChildren(
        h('h1', {}, '共有された配置を開けませんでした'),
        h('p', {}, err.message),
        h('p', { class: 'note' }, 'URL が途中で切れていないか確認してください。'),
        h('a', { class: 'btn btn-primary', href: '#/home' }, 'ホームへ'),
      );
      return;
    }
    if (cancelled) return;
    loading.remove();
    cleanup = showBoard(root, shared, sport);
  })();

  return () => {
    cancelled = true;
    cleanup?.();
  };
}

function showBoard(root, shared, sport) {
  const [courtLength, courtWidth] = courtSize(sport);
  const viewport = new Viewport(courtLength / courtWidth);
  const settings = storage.read(KEYS.settings, {});
  viewport.orientation = settings.boardOrientation ?? 'auto';
  viewport.flipped = settings.boardFlipped ?? false;
  const playersById = new Map(shared.players.map((p) => [p.id, p]));
  let drawingsHidden = false;

  const canvas = h('canvas', { class: 'board-court', 'aria-hidden': 'true' });
  const pieceContainer = h('div', { class: 'board-pieces' });
  const zoomLabel = h('button', { class: 'zoom-button zoom-label', type: 'button', title: '100% に戻す' }, '100%');
  const zoomControls = h('div', { class: 'zoom-controls', dataset: { stageIgnore: '' } },
    h('button', { class: 'zoom-button', type: 'button', 'aria-label': '拡大', onclick: () => { viewport.zoomBy(ZOOM_STEP); requestDraw(); } }, '＋'),
    zoomLabel,
    h('button', { class: 'zoom-button', type: 'button', 'aria-label': '縮小', onclick: () => { viewport.zoomBy(1 / ZOOM_STEP); requestDraw(); } }, '−'),
    h('button', { class: 'zoom-button', type: 'button', 'aria-label': '全体表示', title: '全体表示', onclick: () => { viewport.fit(); requestDraw(); } }, '⛶'),
    h('button', {
      class: 'zoom-button', type: 'button', 'aria-label': '回転', title: '回転 (横長 ⇔ 縦長・自陣が手前)',
      onclick: () => { viewport.setOrientation(viewport.portrait ? 'landscape' : 'portrait'); requestDraw(); },
    }, '⟳'),
    h('button', {
      class: 'zoom-button', type: 'button', 'aria-label': '書き込みを隠す / 表示する', title: '書き込みを隠す / 表示する',
      onclick: (e) => { drawingsHidden = !drawingsHidden; e.currentTarget.classList.toggle('is-off', drawingsHidden); requestDraw(); },
    }, '👁'),
    h('button', {
      class: 'zoom-button', type: 'button', 'aria-label': '反転', title: '反転 (自陣を反対側に)',
      onclick: () => { viewport.setFlipped(!viewport.flipped); requestDraw(); },
    }, '⇅'),
  );
  zoomLabel.addEventListener('click', () => { viewport.setZoom(1); requestDraw(); });
  const stage = h('div', { class: 'board-stage', dataset: { mode: 'hand' } }, canvas, pieceContainer, zoomControls);

  const benchPlayers = shared.home.bench.map((id) => playersById.get(id)).filter(Boolean);
  const bench = benchPlayers.length > 0 && h('div', { class: 'bench' },
    h('span', { class: 'bench-label' }, 'ベンチ'),
    h('div', { class: 'bench-list' }, benchPlayers.map((p) => h('span', { class: 'bench-item' },
      avatarText(p, sport), h('span', { class: 'bench-name' }, p.name)))),
  );

  const saveButton = h('button', { class: 'btn btn-primary btn-small', type: 'button' }, '自分の配置として保存');
  saveButton.addEventListener('click', () => importBoard(shared, sport));

  root.append(h('div', { class: 'board' },
    h('div', { class: 'board-header' },
      h('div', { class: 'board-title-row' },
        h('span', { class: 'board-sport', title: sport.name }, sport.icon),
        h('strong', { class: 'view-title' }, shared.name || '共有された配置'),
        shared.date && h('span', { class: 'save-status' }, formatShort(shared.date)),
        h('span', { class: 'view-badge' }, '共有・見るだけ'),
      ),
      h('div', { class: 'board-settings' }, saveButton),
    ),
    h('div', { class: 'board-body' },
      h('div', { class: 'board-main' }, stage, bench),
    ),
  ));

  // ---- 駒 ----
  const pieces = new PieceLayer(pieceContainer, viewport);
  shared.home.slots.forEach((s, i) => pieces.addSlot(`s:${i}`, s.position, s.x, s.y));
  for (const f of shared.home.free) {
    const p = playersById.get(f.playerId);
    if (p) pieces.addPlayer(`p:${p.id}`, p, sport.id, f.x, f.y);
  }
  for (const m of shared.away.markers) pieces.addMarker(`m:${m.id}`, m.position, m.x, m.y);
  if (shared.ball) pieces.addBall('b:ball', shared.ball.x, shared.ball.y);

  // ---- 描画 ----
  const ctx = canvas.getContext('2d');
  let dpr = window.devicePixelRatio || 1;
  let queued = false;

  function draw() {
    queued = false;
    drawCourt(ctx, sport, viewport, dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!drawingsHidden) drawStrokes(ctx, shared.drawings, viewport);
    pieces.layout();
    zoomLabel.textContent = `${Math.round(viewport.zoom * 100)}%`;
  }

  function requestDraw() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => queued && draw());
    setTimeout(() => queued && draw(), 50);
  }

  function resize() {
    const rect = stage.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    viewport.resize(rect.width, rect.height);
    draw();
  }

  // 見るだけ: どこをドラッグしても表示範囲の移動、2本指・ホイールで拡大縮小
  const detach = attachStageInput(stage, {
    getMode: () => 'hand',
    hitPiece: () => null,
    pieceScreenPosition: () => ({ x: 0, y: 0 }),
    onPieceDragStart() {},
    onPieceDrag() {},
    onPieceDragEnd() {},
    onTap() {},
    onDrawStart() {},
    onDrawMove() {},
    onDrawEnd() {},
    onDrawCancel() {},
    onPan: (dx, dy) => { viewport.panBy(dx, dy); requestDraw(); },
    onZoom: (factor, x, y) => { viewport.zoomBy(factor, x, y); requestDraw(); },
  });

  const observer = new ResizeObserver(resize);
  observer.observe(stage);
  resize();

  return () => {
    observer.disconnect();
    detach();
  };
}

function avatarText(player, sport) {
  const number = player.sports?.[sport.id]?.number;
  return h('span', { class: 'avatar', style: '--avatar-size:36px', 'aria-hidden': 'true' }, number || [...player.name][0] || '?');
}

/** 自分の配置として保存 */
function importBoard(shared, sport) {
  const roster = listPlayers().filter((p) => sport.id in (p.sports ?? {}));
  const byName = new Map(roster.map((p) => [p.name, p]));
  const used = new Set();
  const idMap = new Map();
  const guests = [];
  let matched = 0;
  for (const p of shared.players) {
    const own = byName.get(p.name);
    if (own && !used.has(own.id)) {
      used.add(own.id);
      idMap.set(p.id, own.id);
      matched++;
    } else {
      const info = p.sports[sport.id];
      const guest = { id: `guest-${createId()}`, name: p.name, number: info.number, position: info.positions[0] ?? '' };
      guests.push(guest);
      idMap.set(p.id, guest.id);
    }
  }

  const board = newBoard(sport, shared.date || todayKey());
  if (shared.name) board.name = shared.name;
  board.home = {
    templateId: null,
    slots: shared.home.slots.map((s) => ({ ...s })),
    free: shared.home.free.map((f) => ({ ...f, playerId: idMap.get(f.playerId) })),
    bench: shared.home.bench.map((id) => idMap.get(id)),
    guests,
  };
  board.away = { templateId: null, markers: shared.away.markers.map((m) => ({ ...m, id: createId() })) };
  board.ball = shared.ball;
  board.drawings = shared.drawings.map((d) => ({ ...d, id: createId() }));

  try {
    const saved = saveBoard(board);
    showToast(guests.length
      ? `保存しました (名簿にいない ${guests.length}人は仮の選手になっています)`
      : `保存しました (${matched}人を名簿の選手につなげました)`, 'info', 4000);
    location.hash = `#/board/${encodeURIComponent(saved.id)}`;
  } catch {
    showToast('保存できませんでした (保存容量がいっぱいの可能性があります)', 'error', 4000);
  }
}
