// ホーム: 新しい配置を作る / 保存済みの配置を開く (02_wireframe 1章)
import { h } from '../util/dom.js';
import { listSports } from '../sports.js';

export function render(root) {
  root.append(
    h('section', { class: 'card' },
      h('h1', {}, '新しい配置を作る'),
      h('div', { class: 'sport-buttons' },
        listSports().map((sport) =>
          h('button', { class: 'btn sport-button', type: 'button', disabled: true, title: 'M4 で作成' },
            h('span', { class: 'sport-icon', 'aria-hidden': 'true' }, sport.icon),
            sport.name,
          ),
        ),
      ),
    ),
    h('section', { class: 'card' },
      h('h2', {}, '保存済みの配置'),
      h('p', { class: 'empty' }, 'まだ配置はありません'),
    ),
  );
}
