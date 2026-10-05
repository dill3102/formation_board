// 選手管理 (02_wireframe 2章) ※ M1 で作成
import { h } from '../util/dom.js';

export function render(root) {
  root.append(
    h('section', { class: 'card' },
      h('h1', {}, '選手'),
      h('p', { class: 'empty' }, '選手の登録・一覧はここに作ります (M1)'),
    ),
  );
}
