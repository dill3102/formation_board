// 出欠・現着 (02_wireframe 3章) ※ M5 で作成
import { h } from '../util/dom.js';
import { todayKey, formatShort } from '../util/date.js';

export function render(root) {
  root.append(
    h('section', { class: 'card' },
      h('h1', {}, '出欠・現着'),
      h('p', { class: 'note' }, `今日: ${formatShort(todayKey())}`),
      h('p', { class: 'empty' }, '出欠の登録・現着チェックはここに作ります (M5)'),
    ),
  );
}
