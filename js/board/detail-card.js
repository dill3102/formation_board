// 選手詳細カード / 敵マーカーのカード (02_wireframe 4-2)
// PC はコート右上、スマホはコート上部に出す (board.css)。ドラッグ中はボタンを出さない
import { h } from '../util/dom.js';
import { createAvatar } from '../ui/avatar.js';
import { handednessLabel } from '../models/players.js';
import { describe } from '../models/attendance.js';
import { formatShort } from '../util/date.js';

export function createDetailCard() {
  const el = h('div', { class: 'detail-card', hidden: true, dataset: { stageIgnore: '' }, role: 'dialog', 'aria-label': '詳細' });

  function hide() {
    el.hidden = true;
    el.replaceChildren();
  }

  function frame(title, rows, actions, leading = null) {
    el.replaceChildren(...[
      h('div', { class: 'detail-head' },
        leading,
        h('strong', { class: 'detail-title' }, title),
        actions && h('button', { class: 'icon-button', type: 'button', 'aria-label': '閉じる', onclick: hide }, '✕'),
      ),
      h('dl', { class: 'detail-rows' }, rows.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)])),
      actions?.length > 0 && h('div', { class: 'detail-actions' },
        actions.map((a) => h('button', { class: 'btn btn-small', type: 'button', onclick: a.onClick }, a.label))),
    ].filter(Boolean));
    el.hidden = false;
  }

  return {
    el,
    hide,
    /**
     * @param {object} options
     * @param {object} options.player
     * @param {object} options.sport
     * @param {string} options.date
     * @param {object} [options.attendance] その日のその選手の出欠
     * @param {{ label: string, onClick: () => void }[] | null} options.actions null = ドラッグ中 (ボタンなし)
     */
    showPlayer({ player, sport, date, attendance, actions }) {
      const info = player.sports?.[sport.id] ?? { number: '', positions: [] };
      const positions = info.positions
        .map((id) => sport.positions.find((p) => p.id === id)?.name ?? id)
        .join('、') || '未設定';
      const title = `${info.number ? `#${info.number} ` : ''}${player.name}`;
      const rows = player.guest
        ? [['ポジション', positions], ['', '仮の選手 (この配置の中だけ。外すと消えます)']]
        : [
          ['ポジション', positions],
          ['利き', handednessLabel(player.handedness) || '未設定'],
          [formatShort(date), describe(attendance)],
        ];
      frame(title, rows, actions, createAvatar(player, { sportId: sport.id, size: 36 }));
    },
    /** @param {{ position: string }} marker */
    showMarker({ marker, sport, actions }) {
      const name = sport.positions.find((p) => p.id === marker.position)?.name ?? marker.position;
      frame(`敵 ${marker.position}`, [['ポジション', name]], actions,
        h('span', { class: 'marker-dot', 'aria-hidden': 'true' }, marker.position));
    },
  };
}
