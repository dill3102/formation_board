// 配置ボード (02_wireframe 4章)
// 試作: サッカーの選手をテンプレート (4-4-2) に並べて、ズーム・パン・ドラッグ・書き込みを試す
//       配置は保存しない (保存・選手一覧パネル・敵チームは M4)
// URL: #/board/<配置ID>
import { h } from '../util/dom.js';
import { createId } from '../util/id.js';
import * as storage from '../storage.js';
import { KEYS } from '../storage.js';
import { getSport } from '../sports.js';
import { listPlayers } from '../models/players.js';
import { showToast } from '../ui/toast.js';
import { Viewport } from '../board/viewport.js';
import { drawCourt, courtSize } from '../board/court.js';
import { PieceLayer } from '../board/pieces.js';
import { attachStageInput } from '../board/input.js';
import { assignPlayersToSlots } from '../board/formation.js';
import { drawStrokes, drawStroke, hitStroke, roundPoint, PEN_MIN_DISTANCE } from '../board/drawing.js';
import { History } from '../board/history.js';
import { createToolbar } from '../board/toolbar.js';

const SPORT_ID = 'soccer';
const ZOOM_STEP = 1.25;
const MIN_ARROW_LENGTH = 8; // これより短い矢印 (px) はクリックとみなして描かない

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
  const history = new History();

  /** 書き込み (03_data_design 4.4 drawings) */
  let drawings = [];
  /** 描いている途中の書き込み */
  let current = null;
  let lastPenPoint = null; // ペンの最後の点 (画面座標)
  let eraseRecorded = false; // 消しゴムの1回のドラッグで履歴を1つだけ積む
  let spaceHeld = false;

  // ---- ツールバー ----
  const settings = storage.read(KEYS.settings, {});
  const tool = {
    mode: 'move',
    color: settings.lastPenColor ?? sport.penColors[1],
    width: settings.lastPenWidth ?? 2,
  };
  const toolbar = createToolbar({
    colors: sport.penColors,
    initial: tool,
    onChange: (state) => {
      const styleChanged = state.color !== tool.color || state.width !== tool.width;
      Object.assign(tool, state);
      updateCursor();
      if (styleChanged) {
        storage.write(KEYS.settings, { ...storage.read(KEYS.settings, {}), lastPenColor: tool.color, lastPenWidth: tool.width });
      }
    },
    onUndo: undo,
    onRedo: redo,
    onClear: clearDrawings,
  });

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
    toolbar.el,
    stage,
  ));

  // ---- 駒 ----
  const pieces = new PieceLayer(pieceContainer, viewport);
  setupPieces();

  function setupPieces() {
    const formation = sport.formations[0];
    let players = listPlayers().filter((p) => SPORT_ID in p.sports);
    let message = `${formation.name} に並べています。配置・書き込みは保存されません`;
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
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawStrokes(ctx, drawings, viewport);
    if (current) drawStroke(ctx, current, viewport);
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

  // ---- 元に戻す / やり直し ----
  function snapshot() {
    return {
      drawings,
      pieces: [...pieces.items].map(([id, item]) => [id, item.x, item.y]),
    };
  }

  function restore(state) {
    drawings = state.drawings;
    for (const [id, x, y] of state.pieces) pieces.move(id, x, y);
    requestDraw();
    updateHistoryButtons();
  }

  function record() {
    history.push(snapshot());
    updateHistoryButtons();
  }

  function undo() {
    const state = history.undo(snapshot());
    if (state) restore(state);
  }

  function redo() {
    const state = history.redo(snapshot());
    if (state) restore(state);
  }

  function updateHistoryButtons() {
    toolbar.setHistoryState(history.canUndo, history.canRedo, drawings.length > 0);
  }

  function clearDrawings() {
    if (drawings.length === 0) return;
    record();
    drawings = [];
    requestDraw();
    updateHistoryButtons();
    showToast('書き込みを全消去しました (↶ で戻せます)');
  }

  // ---- 書き込み ----
  function startDrawing(sx, sy) {
    if (tool.mode === 'eraser') {
      eraseRecorded = false;
      eraseAt(sx, sy);
      return;
    }
    const point = roundPoint(viewport.screenToCourt(sx, sy));
    current = {
      id: createId(),
      type: tool.mode === 'arrow' ? 'arrow' : 'pen',
      color: tool.color,
      width: tool.width,
      points: tool.mode === 'arrow' ? [point, point] : [point],
    };
    lastPenPoint = { x: sx, y: sy };
    requestDraw();
  }

  function continueDrawing(sx, sy) {
    if (tool.mode === 'eraser') {
      eraseAt(sx, sy);
      return;
    }
    if (!current) return;
    const point = roundPoint(viewport.screenToCourt(sx, sy));
    if (current.type === 'arrow') {
      current.points[1] = point;
    } else {
      if (Math.hypot(sx - lastPenPoint.x, sy - lastPenPoint.y) < PEN_MIN_DISTANCE) return;
      current.points.push(point);
      lastPenPoint = { x: sx, y: sy };
    }
    requestDraw();
  }

  function finishDrawing() {
    if (!current) return;
    const stroke = current;
    current = null;
    if (stroke.type === 'arrow') {
      const [a, b] = stroke.points.map(([x, y]) => viewport.courtToScreen(x, y));
      if (Math.hypot(b.x - a.x, b.y - a.y) < MIN_ARROW_LENGTH) {
        requestDraw();
        return;
      }
    }
    record();
    drawings = [...drawings, stroke];
    requestDraw();
    updateHistoryButtons();
  }

  function cancelDrawing() {
    current = null;
    requestDraw();
  }

  function eraseAt(sx, sy) {
    const remaining = drawings.filter((s) => !hitStroke(s, sx, sy, viewport));
    if (remaining.length === drawings.length) return;
    if (!eraseRecorded) {
      record();
      eraseRecorded = true;
    }
    drawings = remaining;
    requestDraw();
    updateHistoryButtons();
  }

  // ---- 操作 ----
  const COURT_MARGIN = 0.03; // コートの外に少しだけ出せる
  const clampCourt = (v) => Math.min(1 + COURT_MARGIN, Math.max(-COURT_MARGIN, v));

  function currentMode() {
    return spaceHeld ? 'hand' : tool.mode;
  }

  function updateCursor() {
    stage.dataset.mode = currentMode();
  }

  const detach = attachStageInput(stage, {
    getMode: currentMode,
    hitPiece: (target) => pieces.pieceIdFrom(target),
    pieceScreenPosition: (id) => {
      const item = pieces.get(id);
      return viewport.courtToScreen(item.x, item.y);
    },
    onPieceDragStart: (id) => {
      record();
      pieces.select(id);
      pieces.setDragging(id, true);
    },
    onPieceDrag: (id, sx, sy) => {
      const c = viewport.screenToCourt(sx, sy);
      pieces.move(id, clampCourt(c.x), clampCourt(c.y));
    },
    onPieceDragEnd: (id) => pieces.setDragging(id, false),
    onTap: (id) => pieces.select(id),
    onDrawStart: startDrawing,
    onDrawMove: continueDrawing,
    onDrawEnd: finishDrawing,
    onDrawCancel: cancelDrawing,
    onPan: (dx, dy) => {
      viewport.panBy(dx, dy);
      requestDraw();
    },
    onZoom: (factor, x, y) => {
      viewport.zoomBy(factor, x, y);
      requestDraw();
    },
  });

  // キーボード: Ctrl+Z / Ctrl+Y (Ctrl+Shift+Z)、スペースを押している間は手のひら、V/P/A/E/H でモード切替
  function onKeyDown(e) {
    if (e.target.closest?.('input, textarea, select, [contenteditable]') || document.querySelector('dialog[open]')) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    } else if (mod && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      redo();
    } else if (e.key === ' ') {
      e.preventDefault();
      if (!spaceHeld) {
        spaceHeld = true;
        updateCursor();
      }
    } else if (!mod && !e.altKey) {
      const mode = toolbar.modeForKey(e.key);
      if (mode) toolbar.setMode(mode);
    }
  }

  function onKeyUp(e) {
    if (e.key === ' ') {
      spaceHeld = false;
      updateCursor();
    }
  }

  // スマホの色・太さパネルは、外を触ったら閉じる
  function onDocumentPointerDown(e) {
    if (!e.target.closest?.('.style-group')) toolbar.closePanel();
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  document.addEventListener('pointerdown', onDocumentPointerDown);

  const observer = new ResizeObserver(resize);
  observer.observe(stage);
  updateCursor();
  updateHistoryButtons();
  resize();

  return () => {
    observer.disconnect();
    detach();
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    document.removeEventListener('pointerdown', onDocumentPointerDown);
  };
}
