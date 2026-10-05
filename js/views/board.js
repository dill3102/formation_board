// 配置ボード (02_wireframe 4章)
// M2: 操作感の試作。サッカーの選手をテンプレート (4-4-2) に並べて、ズーム・パン・ドラッグを試す
//     配置は保存しない (保存・選手一覧パネル・敵チームは M4、書き込みは M3)
// URL: #/board/<配置ID>
import { h } from '../util/dom.js';
import { getSport } from '../sports.js';
import { listPlayers } from '../models/players.js';
import { Viewport } from '../board/viewport.js';
import { drawCourt, courtSize } from '../board/court.js';
import { PieceLayer } from '../board/pieces.js';
import { attachStageInput } from '../board/input.js';
import { assignPlayersToSlots } from '../board/formation.js';

const SPORT_ID = 'soccer';
const ZOOM_STEP = 1.25;

export function render(root, [boardId]) {
  if (boardId) {
    root.append(h('section', { class: 'card' },
      h('h1', {}, '配置ボード'),
      h('p', { class: 'empty' }, '保存した配置を開く機能は M4 で作ります'),
    ));
    return;
  }

  const sport = getSport(SPORT_ID);
  const [courtLength, courtWidth] = courtSize(sport);
  const viewport = new Viewport(courtLength / courtWidth);

  // ---- 画面 ----
  const canvas = h('canvas', { class: 'board-court', 'aria-hidden': 'true' });
  const pieceContainer = h('div', { class: 'board-pieces' });
  const zoomLabel = h('button', { class: 'zoom-button zoom-label', type: 'button', title: '100% に戻す' }, '100%');
  const zoomControls = h('div', { class: 'zoom-controls', dataset: { stageIgnore: '' } },
    h('button', { class: 'zoom-button', type: 'button', 'aria-label': '拡大', onclick: () => zoomStep(ZOOM_STEP) }, '＋'),
    zoomLabel,
    h('button', { class: 'zoom-button', type: 'button', 'aria-label': '縮小', onclick: () => zoomStep(1 / ZOOM_STEP) }, '−'),
    h('button', { class: 'zoom-button', type: 'button', 'aria-label': '全体表示', title: '全体表示', onclick: fitAll }, '⛶'),
  );
  const stage = h('div', { class: 'board-stage' }, canvas, pieceContainer, zoomControls);
  const note = h('p', { class: 'board-note' });

  root.append(h('div', { class: 'board' },
    h('div', { class: 'board-topbar' },
      h('h1', {}, `試作ボード (${sport.icon} ${sport.name})`),
      note,
    ),
    stage,
  ));

  // ---- 駒 ----
  const pieces = new PieceLayer(pieceContainer, viewport);
  setupPieces();

  function setupPieces() {
    const formation = sport.formations[0];
    let players = listPlayers().filter((p) => SPORT_ID in p.sports);
    let message = `${formation.name} に並べています。配置は保存されません`;
    if (players.length === 0) {
      players = formation.slots.map((_, i) => ({
        id: `dummy-${i + 1}`, name: `選手${i + 1}`, hasPhoto: false,
        sports: { [SPORT_ID]: { number: String(i + 1), positions: [] } },
      }));
      message = 'サッカーに登録された選手がいないため、仮の選手を並べています';
    }
    const byId = new Map(players.map((p) => [p.id, p]));
    const { slots, rest } = assignPlayersToSlots(formation.slots, players, SPORT_ID);
    slots.forEach((slot, i) => {
      if (slot.playerId) pieces.addPlayer(slot.playerId, byId.get(slot.playerId), SPORT_ID, slot.x, slot.y);
      else pieces.addSlot(`slot-${i}`, slot.position, slot.x, slot.y);
    });
    if (rest.length > 0) message += ` (ほか ${rest.length}人はベンチ機能 (M4) で表示予定)`;
    note.textContent = message;
  }

  // ---- 描画 ----
  const ctx = canvas.getContext('2d');
  let dpr = window.devicePixelRatio || 1;
  let renderQueued = false;

  function draw() {
    renderQueued = false;
    drawCourt(ctx, sport, viewport, dpr);
    pieces.layout();
    zoomLabel.textContent = `${Math.round(viewport.zoom * 100)}%`;
  }

  // requestAnimationFrame でまとめて描く。タブが裏にある等で rAF が止まっている時のために setTimeout も併用
  function requestDraw() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => renderQueued && draw());
    setTimeout(() => renderQueued && draw(), 50);
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

  function zoomStep(factor) {
    viewport.zoomBy(factor);
    requestDraw();
  }

  function fitAll() {
    viewport.fit();
    requestDraw();
  }

  zoomLabel.addEventListener('click', () => {
    viewport.setZoom(1);
    requestDraw();
  });

  // ---- 操作 ----
  const COURT_MARGIN = 0.03; // コートの外に少しだけ出せる
  const clampCourt = (v) => Math.min(1 + COURT_MARGIN, Math.max(-COURT_MARGIN, v));

  const detach = attachStageInput(stage, {
    hitPiece: (target) => pieces.pieceIdFrom(target),
    pieceScreenPosition: (id) => {
      const item = pieces.get(id);
      return viewport.courtToScreen(item.x, item.y);
    },
    onPieceDragStart: (id) => {
      pieces.select(id);
      pieces.setDragging(id, true);
    },
    onPieceDrag: (id, sx, sy) => {
      const c = viewport.screenToCourt(sx, sy);
      pieces.move(id, clampCourt(c.x), clampCourt(c.y));
    },
    onPieceDragEnd: (id) => pieces.setDragging(id, false),
    onTap: (id) => pieces.select(id),
    onPan: (dx, dy) => {
      viewport.panBy(dx, dy);
      requestDraw();
    },
    onZoom: (factor, x, y) => {
      viewport.zoomBy(factor, x, y);
      requestDraw();
    },
  });

  const observer = new ResizeObserver(resize);
  observer.observe(stage);
  resize();

  return () => {
    observer.disconnect();
    detach();
  };
}
