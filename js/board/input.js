// ステージ上のポインター操作 (マウス / タッチ / ペン) を振り分ける
//
// 1本指 (左ボタン) の動きはモードで変わる
//   move   : 駒を押してドラッグ → 駒の移動 / 何もない所をドラッグ → パン / 動かさずに離す → タップ
//   pen / arrow / eraser : 書き込み (押した瞬間から)
//   hand   : どこを押してもパン
// どのモードでも共通
//   2本指 → ピンチで拡大縮小 + 2本指の移動でパン (書き込み中に2本目が来たら書き込みは取り消し)
//   マウスの中ボタンドラッグ → パン
//   ホイール → パン、Ctrl (Mac は ⌘) + ホイール / トラックパッドのピンチ → 拡大縮小
// data-stage-ignore を付けた要素 (ズームボタン等) の上で押した時は何もしない

// これ以上動いたらタップではなくドラッグとみなす (px)
const DRAG_THRESHOLD = { mouse: 4, pen: 6, touch: 10 };

const DRAW_MODES = new Set(['pen', 'arrow', 'eraser']);

/**
 * @param {HTMLElement} stage
 * @param {object} handlers
 * @param {() => 'move' | 'pen' | 'arrow' | 'eraser' | 'hand'} handlers.getMode
 * @param {(target: EventTarget) => string | null} handlers.hitPiece 押した要素の駒ID
 * @param {(id: string) => {x: number, y: number}} handlers.pieceScreenPosition
 * @param {(id: string, x: number, y: number) => void} handlers.onPieceDragStart
 * @param {(id: string, x: number, y: number) => void} handlers.onPieceDrag x, y = 駒の中心の画面座標 (駒のどこを掴んだかは補正済み)
 * @param {(id: string) => void} handlers.onPieceDragEnd
 * @param {(id: string | null) => void} handlers.onTap
 * @param {(x: number, y: number) => void} handlers.onDrawStart
 * @param {(x: number, y: number) => void} handlers.onDrawMove
 * @param {() => void} handlers.onDrawEnd
 * @param {() => void} handlers.onDrawCancel
 * @param {(dx: number, dy: number) => void} handlers.onPan
 * @param {(factor: number, x: number, y: number) => void} handlers.onZoom
 * @returns {() => void} 解除する関数
 */
export function attachStageInput(stage, handlers) {
  const pointers = new Map(); // pointerId → { x, y }
  let gesture = null;

  function local(e) {
    const rect = stage.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function pinchInfo() {
    const [a, b] = [...pointers.values()];
    return {
      dist: Math.hypot(a.x - b.x, a.y - b.y),
      mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
    };
  }

  /** 1本指の操作を途中で終わらせる (2本目の指が来た時など) */
  function interrupt() {
    if (gesture?.type === 'piece') handlers.onPieceDragEnd(gesture.id);
    if (gesture?.type === 'draw') handlers.onDrawCancel();
  }

  function onPointerDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 1) return;
    if (e.target.closest?.('[data-stage-ignore]')) return;
    const p = local(e);
    pointers.set(e.pointerId, p);
    stage.setPointerCapture(e.pointerId);
    e.preventDefault();

    if (pointers.size === 1) {
      const mode = handlers.getMode();
      const threshold = DRAG_THRESHOLD[e.pointerType] ?? 6;
      if (e.button === 1 || mode === 'hand') {
        gesture = { type: 'pan', last: p };
      } else if (DRAW_MODES.has(mode)) {
        gesture = { type: 'draw' };
        handlers.onDrawStart(p.x, p.y);
      } else {
        const id = handlers.hitPiece(e.target);
        if (id) {
          const center = handlers.pieceScreenPosition(id);
          gesture = { type: 'pending-piece', id, start: p, threshold, grab: { x: center.x - p.x, y: center.y - p.y } };
        } else {
          gesture = { type: 'pending-pan', start: p, threshold };
        }
      }
    } else if (pointers.size === 2) {
      interrupt();
      gesture = { type: 'pinch', ...pinchInfo() };
    }
  }

  function onPointerMove(e) {
    if (!pointers.has(e.pointerId)) return;
    const p = local(e);
    pointers.set(e.pointerId, p);
    if (!gesture) return;

    if (gesture.type === 'pending-piece' || gesture.type === 'pending-pan') {
      if (Math.hypot(p.x - gesture.start.x, p.y - gesture.start.y) < gesture.threshold) return;
      if (gesture.type === 'pending-piece') {
        gesture = { type: 'piece', id: gesture.id, grab: gesture.grab };
        handlers.onPieceDragStart(gesture.id, p.x + gesture.grab.x, p.y + gesture.grab.y);
      } else {
        gesture = { type: 'pan', last: gesture.start };
      }
    }

    switch (gesture.type) {
      case 'piece':
        handlers.onPieceDrag(gesture.id, p.x + gesture.grab.x, p.y + gesture.grab.y);
        break;
      case 'draw':
        handlers.onDrawMove(p.x, p.y);
        break;
      case 'pan':
        handlers.onPan(p.x - gesture.last.x, p.y - gesture.last.y);
        gesture.last = p;
        break;
      case 'pinch': {
        if (pointers.size < 2) break;
        const { dist, mid } = pinchInfo();
        if (gesture.dist > 0) handlers.onZoom(dist / gesture.dist, mid.x, mid.y);
        handlers.onPan(mid.x - gesture.mid.x, mid.y - gesture.mid.y);
        gesture.dist = dist;
        gesture.mid = mid;
        break;
      }
    }
  }

  function onPointerUp(e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    if (!gesture) return;

    if (gesture.type === 'pinch') {
      // 1本指が残ったらそのままパンを続ける
      const rest = [...pointers.values()][0];
      gesture = rest ? { type: 'pan', last: rest } : null;
      return;
    }
    if (pointers.size > 0) return;

    const cancelled = e.type === 'pointercancel';
    if (gesture.type === 'pending-piece' && !cancelled) handlers.onTap(gesture.id);
    else if (gesture.type === 'pending-pan' && !cancelled) handlers.onTap(null);
    else if (gesture.type === 'piece') handlers.onPieceDragEnd(gesture.id);
    else if (gesture.type === 'draw') cancelled ? handlers.onDrawCancel() : handlers.onDrawEnd();
    gesture = null;
  }

  function onWheel(e) {
    if (e.target.closest?.('[data-stage-ignore]')) return;
    e.preventDefault();
    const p = local(e);
    // deltaMode 1 = 行単位 (Firefox のマウスホイール)
    const unit = e.deltaMode === 1 ? 16 : 1;
    if (e.ctrlKey || e.metaKey) {
      handlers.onZoom(Math.exp(-e.deltaY * unit * 0.01), p.x, p.y);
    } else {
      handlers.onPan(-e.deltaX * unit, -e.deltaY * unit);
    }
  }

  stage.addEventListener('pointerdown', onPointerDown);
  stage.addEventListener('pointermove', onPointerMove);
  stage.addEventListener('pointerup', onPointerUp);
  stage.addEventListener('pointercancel', onPointerUp);
  stage.addEventListener('wheel', onWheel, { passive: false });

  return () => {
    stage.removeEventListener('pointerdown', onPointerDown);
    stage.removeEventListener('pointermove', onPointerMove);
    stage.removeEventListener('pointerup', onPointerUp);
    stage.removeEventListener('pointercancel', onPointerUp);
    stage.removeEventListener('wheel', onWheel);
  };
}
