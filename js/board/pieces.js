// コート上の選手アイコン・ポジション枠 (DOM)
// ズームしてもアイコンの大きさは変えない。位置だけ「コート座標 → 画面座標」で更新する
import { h } from '../util/dom.js';
import { createAvatar } from '../ui/avatar.js';

export const PIECE_SIZE = 44; // アイコンの直径 (px)

export class PieceLayer {
  /**
   * @param {HTMLElement} container
   * @param {import('./viewport.js').Viewport} viewport
   */
  constructor(container, viewport) {
    this.container = container;
    this.viewport = viewport;
    /** @type {Map<string, { el: HTMLElement, x: number, y: number }>} */
    this.items = new Map();
    this.selectedId = null;
  }

  /** 選手アイコンを追加。id はコート上で一意 (選手ID) */
  addPlayer(id, player, sportId, x, y) {
    const el = h('div', { class: 'piece', dataset: { pieceId: id }, title: player.name },
      createAvatar(player, { sportId, size: PIECE_SIZE }),
      h('span', { class: 'piece-label' }, player.name),
    );
    this.add(id, el, x, y);
  }

  /** 敵マーカー (ポジション名だけ) */
  addMarker(id, position, x, y) {
    const el = h('div', { class: 'piece piece-away', dataset: { pieceId: id }, title: `敵 ${position}` },
      h('span', { class: 'marker' }, position),
    );
    this.add(id, el, x, y);
  }

  /** 画面上の (sx, sy) から radius 以内で一番近いもの。filter で対象を絞る */
  nearest(sx, sy, radius, filter) {
    let best = null;
    let bestDist = radius;
    for (const [id, item] of this.items) {
      if (!filter(id)) continue;
      const p = this.viewport.courtToScreen(item.x, item.y);
      const d = Math.hypot(p.x - sx, p.y - sy);
      if (d <= bestDist) {
        best = id;
        bestDist = d;
      }
    }
    return best;
  }

  /** 空きのポジション枠 (点線の丸) */
  addSlot(id, position, x, y) {
    const el = h('div', { class: 'slot', dataset: { slotId: id } }, position);
    this.add(id, el, x, y);
  }

  add(id, el, x, y) {
    el.style.setProperty('--piece-size', `${PIECE_SIZE}px`);
    this.container.append(el);
    this.items.set(id, { el, x, y });
  }

  get(id) {
    return this.items.get(id) ?? null;
  }

  /** 要素から駒の ID を探す (枠は対象外) */
  pieceIdFrom(target) {
    return target?.closest?.('[data-piece-id]')?.dataset.pieceId ?? null;
  }

  move(id, x, y) {
    const item = this.items.get(id);
    if (!item) return;
    item.x = x;
    item.y = y;
    this.place(item);
  }

  select(id) {
    this.selectedId = id;
    for (const [itemId, item] of this.items) {
      item.el.classList.toggle('is-selected', itemId === id);
    }
  }

  setDragging(id, dragging) {
    this.items.get(id)?.el.classList.toggle('is-dragging', dragging);
  }

  /** 全部の位置を画面に合わせて更新 (ズーム・パン・回転の後) */
  layout() {
    for (const item of this.items.values()) this.place(item);
  }

  place(item) {
    const p = this.viewport.courtToScreen(item.x, item.y);
    item.el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%)`;
  }

  clear() {
    this.container.replaceChildren();
    this.items.clear();
    this.selectedId = null;
  }
}
