// 設定 (02_wireframe 5章) ※ 注意書き・全削除の仕上げは M7
import { h } from '../util/dom.js';
import { usageBytes } from '../storage.js';

const LIMIT_BYTES = 5 * 1024 * 1024;

export function render(root) {
  const used = usageBytes();
  root.append(
    h('section', { class: 'card' },
      h('h1', {}, '設定'),
      h('h2', {}, 'データについて'),
      h('p', {}, 'データはこのブラウザ内 (localStorage) にのみ保存されます。ブラウザのデータ削除・機種変更・別のブラウザでは引き継がれません。'),
      h('p', { class: 'note' }, `使用容量: ${(used / 1024).toFixed(1)}KB / 約${LIMIT_BYTES / 1024 / 1024}MB`),
    ),
  );
}
