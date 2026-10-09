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
import { frameCount, positionsAt, facingAt } from '../board/frames.js';
import { drawVision } from '../board/vision.js';
import { createPlayback, SPEEDS, pieceIdOf } from '../board/playback.js';
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
  let visionHidden = settings.visionHidden ?? false;
  let facing = facingAt(shared, 0); // 表示中の目線 (再生中は回っている途中の向き)
  const hasVision = Object.keys(shared.facing ?? {}).length > 0 ||
    (shared.plays ?? []).some((p) => p.steps.some((s) => Object.keys(s).some((k) => k.startsWith('v:'))));

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
    hasVision && h('button', {
      class: `zoom-button${visionHidden ? ' is-off' : ''}`, type: 'button', 'aria-label': '目線を隠す / 表示する', title: '目線を隠す / 表示する',
      onclick: (e) => { visionHidden = !visionHidden; e.currentTarget.classList.toggle('is-off', visionHidden); requestDraw(); },
    }, '🔦'),
    h('button', {
      class: 'zoom-button', type: 'button', 'aria-label': '反転', title: '反転 (自陣を反対側に)',
      onclick: () => { viewport.setFlipped(!viewport.flipped); requestDraw(); },
    }, '⇅'),
  );
  zoomLabel.addEventListener('click', () => { viewport.setZoom(1); requestDraw(); });
  const routeCaption = h('div', { class: 'route-caption', hidden: true });
  const stage = h('div', { class: 'board-stage', dataset: { mode: 'hand' } }, canvas, pieceContainer, routeCaption, zoomControls);

  const benchPlayers = shared.home.bench.map((id) => playersById.get(id)).filter(Boolean);
  const bench = benchPlayers.length > 0 && h('div', { class: 'bench' },
    h('span', { class: 'bench-label' }, 'ベンチ'),
    h('div', { class: 'bench-list' }, benchPlayers.map((p) => h('span', { class: 'bench-item' },
      avatarText(p, sport), h('span', { class: 'bench-name' }, p.name)))),
  );

  // ---- コマ送り (コマがある時だけ) ----
  const plays = shared.plays ?? [{ id: 'play-1', name: '案1', note: '', steps: shared.steps ?? [] }];
  let count = frameCount(shared);
  let frame = 0;
  const routeSelect = plays.length > 1 && h('select', { class: 'input frame-route', 'aria-label': '案 (ルート)' },
    plays.map((p) => h('option', { value: p.id }, p.name)));
  if (routeSelect) {
    routeSelect.value = shared.activePlayId;
    routeSelect.addEventListener('change', () => {
      playback.stop();
      const play = plays.find((p) => p.id === routeSelect.value);
      shared.activePlayId = play.id;
      shared.steps = play.steps;
      count = frameCount(shared);
      showFrame(0);
    });
  }
  const routeNote = h('div', { class: 'frame-note', hidden: true });
  let speedId = settings.animSpeed ?? 'normal';
  const framePrev = h('button', { class: 'frame-button', type: 'button', 'aria-label': '前のコマ', onclick: () => showFrame(frame - 1) }, '◀');
  const frameNext = h('button', { class: 'frame-button', type: 'button', 'aria-label': '次のコマ', onclick: () => showFrame(frame + 1) }, '▶');
  const frameLabel = h('span', { class: 'frame-label' });
  const framePlay = h('button', { class: 'frame-button frame-play', type: 'button', onclick: () => (playback.playing ? playback.stop() : playback.play(frame)) });
  const speedSelect = h('select', { class: 'input frame-speed', 'aria-label': '再生の速さ' }, SPEEDS.map((s) => h('option', { value: s.id }, s.label)));
  speedSelect.value = SPEEDS.some((s) => s.id === speedId) ? speedId : 'normal';
  speedSelect.addEventListener('change', () => { speedId = speedSelect.value; });
  const hasFrames = plays.some((p) => (p.steps?.length ?? 0) > 0);
  const frameBar = (hasFrames || plays.length > 1) && h('div', { class: 'frame-bar', role: 'group', 'aria-label': 'コマ送り' },
    routeSelect && h('div', { class: 'frame-group frame-routes' }, routeSelect),
    h('div', { class: 'frame-group' },
      h('span', { class: 'frame-title' }, '🎬', h('span', { class: 'frame-text' }, ' コマ')),
      framePrev, frameLabel, frameNext, framePlay, speedSelect),
    routeNote,
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
      h('div', { class: 'board-main' }, stage, frameBar, bench),
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

  const applyPositions = (positions, nextFacing) => {
    for (const [key, [x, y]] of Object.entries(positions)) pieces.move(pieceIdOf(key), x, y);
    facing = nextFacing;
    requestDraw();
  };
  const playback = createPlayback({
    getBoard: () => shared,
    apply: applyPositions,
    onFrame: (index) => { frame = index; updateFrameBar(); },
    onStateChange: () => updateFrameBar(),
    getSpeedMs: () => (SPEEDS.find((s) => s.id === speedId) ?? SPEEDS[1]).ms,
  });

  function showFrame(index) {
    playback.stop();
    frame = Math.max(0, Math.min(count - 1, index));
    applyPositions(positionsAt(shared, frame), facingAt(shared, frame));
    updateFrameBar();
  }

  function updateFrameBar() {
    const play = plays.find((p) => p.id === shared.activePlayId) ?? plays[0];
    const caption = play && (plays.length > 1 || play.note) ? `${play.name}${play.note ? `：${play.note}` : ''}` : '';
    routeCaption.textContent = caption;
    routeCaption.hidden = !caption;
    routeNote.textContent = play?.note ? `${play.name}：${play.note}` : '';
    routeNote.hidden = !play?.note;
    if (!frameBar) return;
    frameLabel.textContent = `${frame + 1} / ${count}`;
    framePlay.disabled = count < 2 && !playback.playing;
    framePrev.disabled = frame === 0 || playback.playing;
    frameNext.disabled = frame >= count - 1 || playback.playing;
    framePlay.textContent = playback.playing ? '■ 停止' : '▶ 再生';
  }
  updateFrameBar();

  // ---- 描画 ----
  const ctx = canvas.getContext('2d');
  let dpr = window.devicePixelRatio || 1;
  let queued = false;

  function draw() {
    queued = false;
    drawCourt(ctx, sport, viewport, dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!visionHidden) {
      const cones = Object.entries(facing).map(([key, deg]) => {
        const item = pieces.get(key);
        return item && { x: item.x, y: item.y, deg, away: key.startsWith('m:') };
      }).filter(Boolean);
      drawVision(ctx, cones, viewport, [courtLength, courtWidth]);
    }
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
    playback.stop();
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
  const markerIds = new Map(shared.away.markers.map((m) => [m.id, createId()]));
  board.away = { templateId: null, markers: shared.away.markers.map((m) => ({ ...m, id: markerIds.get(m.id) })) };
  board.ball = shared.ball;
  board.drawings = shared.drawings.map((d) => ({ ...d, id: createId() }));
  // コマ送り・案・目線: 共有の ID を自分の配置の ID に付け替える ("v:" は目線)
  const mapKey = (key) => {
    if (key.startsWith('v:')) return `v:${mapKey(key.slice(2))}`;
    if (key.startsWith('p:')) return `p:${idMap.get(key.slice(2))}`;
    if (key.startsWith('m:')) return `m:${markerIds.get(key.slice(2))}`;
    return key;
  };
  const mapEntries = (obj) => Object.fromEntries(Object.entries(obj ?? {}).map(([key, value]) => [mapKey(key), value]));
  const mapSteps = (steps) => (steps ?? []).map(mapEntries);
  board.facing = mapEntries(shared.facing);
  const sharedPlays = shared.plays ?? [{ id: 'play-1', name: '案1', note: '', steps: shared.steps ?? [] }];
  const playIds = new Map(sharedPlays.map((p) => [p.id, createId()]));
  board.plays = sharedPlays.map((p) => ({ id: playIds.get(p.id), name: p.name, note: p.note ?? '', steps: mapSteps(p.steps) }));
  board.activePlayId = playIds.get(shared.activePlayId) ?? board.plays[0].id;
  board.steps = board.plays.find((p) => p.id === board.activePlayId).steps.map((s) => ({ ...s }));

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
