// 選手一覧・ベンチからのドラッグ (ステージの外から持ってくる)
// ドラッグ中は指 (マウス) に「ゴースト」(アイコンの複製) を付けて動かす
// タッチでは一覧のスクロールとぶつからないよう、少し長押ししてからドラッグ開始
import { h } from '../util/dom.js';

const MOVE_THRESHOLD = 6; // マウス・ペン: これだけ動いたらドラッグ開始 (px)
const LONG_PRESS_MS = 250; // タッチ: これだけ押し続けたらドラッグ開始
const TOUCH_SLOP = 10; // タッチ: 長押し前にこれ以上動いたらスクロールとみなす (px)

/**
 * @param {HTMLElement} el ドラッグできる要素
 * @param {object} options
 * @param {() => Node} options.createGhost
 * @param {() => void} [options.onStart]
 * @param {(clientX: number, clientY: number) => void} [options.onMove]
 * @param {(clientX: number, clientY: number) => void} options.onDrop
 * @param {() => void} [options.onTap] 動かさずに離した時
 */
export function makeDraggable(el, { createGhost, onStart, onMove, onDrop, onTap }) {
  el.addEventListener('pointerdown', (down) => {
    if (down.pointerType === 'mouse' && down.button !== 0) return;
    const isTouch = down.pointerType === 'touch';
    const start = { x: down.clientX, y: down.clientY };
    let ghost = null;
    let timer = null;

    function begin(x, y) {
      ghost = h('div', { class: 'drag-ghost' }, createGhost());
      document.body.append(ghost);
      position(x, y);
      el.classList.add('is-drag-source');
      onStart?.();
    }

    function position(x, y) {
      ghost.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
    }

    function onPointerMove(e) {
      if (e.pointerId !== down.pointerId) return;
      const moved = Math.hypot(e.clientX - start.x, e.clientY - start.y);
      if (!ghost) {
        if (isTouch) {
          // 長押し前に動いた = スクロール
          if (moved > TOUCH_SLOP) cleanup();
          return;
        }
        if (moved < MOVE_THRESHOLD) return;
        begin(e.clientX, e.clientY);
      }
      position(e.clientX, e.clientY);
      onMove?.(e.clientX, e.clientY);
    }

    function onPointerUp(e) {
      if (e.pointerId !== down.pointerId) return;
      const wasDragging = !!ghost;
      cleanup();
      if (e.type !== 'pointerup') return;
      if (wasDragging) onDrop(e.clientX, e.clientY);
      else onTap?.();
    }

    // ドラッグ中はページのスクロールを止める (iOS は touchmove で止める必要がある)
    function onTouchMove(e) {
      if (ghost) e.preventDefault();
    }

    function cleanup() {
      clearTimeout(timer);
      ghost?.remove();
      ghost = null;
      el.classList.remove('is-drag-source');
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      window.removeEventListener('touchmove', onTouchMove);
    }

    if (isTouch) {
      timer = setTimeout(() => {
        begin(start.x, start.y);
        navigator.vibrate?.(10);
      }, LONG_PRESS_MS);
    }
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    window.addEventListener('touchmove', onTouchMove, { passive: false });
  });
}
