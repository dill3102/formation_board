// 選手の丸アイコン
// 写真があれば写真、無ければ スポーツ指定時 = 背番号 / それ以外 = 名前の1文字目
import { h } from '../util/dom.js';
import { getPhoto } from '../models/players.js';

/**
 * @param {object} player
 * @param {object} [options]
 * @param {string | null} [options.sportId]
 * @param {string | null} [options.photo] 写真を直接指定 (編集中のプレビュー用)。undefined なら保存済みの写真
 * @param {number} [options.size] px
 */
export function createAvatar(player, { sportId = null, photo = undefined, size = 40 } = {}) {
  const src = photo !== undefined ? photo : (player.hasPhoto ? getPhoto(player.id) : null);
  const el = h('span', { class: 'avatar', style: `--avatar-size:${size}px`, 'aria-hidden': 'true' });
  if (src) {
    el.append(h('img', { src, alt: '' }));
  } else {
    const number = sportId ? (player.sports?.[sportId]?.number ?? '') : '';
    el.textContent = number || [...(player.name || '?')][0];
  }
  return el;
}
