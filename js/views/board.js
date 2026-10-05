// 配置ボード (02_wireframe 4章) ※ M2〜M4 で作成
// URL: #/board/<配置ID>
import { h } from '../util/dom.js';

export function render(root, [boardId]) {
  root.append(
    h('section', { class: 'card' },
      h('h1', {}, '配置ボード'),
      boardId
        ? h('p', { class: 'note' }, `配置ID: ${boardId}`)
        : h('p', { class: 'note' }, 'ホームから配置を選ぶか、新しく作ってください'),
      h('p', { class: 'empty' }, 'コート・選手配置・ホワイトボードはここに作ります (M2〜M4)'),
    ),
  );
}
