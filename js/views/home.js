// ホーム: 新しい配置を作る / 保存済みの配置を開く (02_wireframe 1章)
import { h } from '../util/dom.js';
import { formatShort } from '../util/date.js';
import * as storage from '../storage.js';
import { KEYS, StorageFullError } from '../storage.js';
import { listSports, getSport } from '../sports.js';
import { listBoards, sortBoards, createBoard, duplicateBoard, deleteBoard } from '../models/boards.js';
import { templateName } from '../models/templates.js';
import { placedPlayers } from '../board/lineup.js';
import { confirmDialog } from '../ui/modal.js';
import { showToast } from '../ui/toast.js';

export function render(root) {
  let sportFilter = storage.read(KEYS.settings, {}).homeSportFilter ?? 'all';
  let query = '';

  const sportSelect = h('select', { class: 'input', 'aria-label': 'スポーツで絞り込み' },
    h('option', { value: 'all' }, 'すべて'),
    listSports().map((s) => h('option', { value: s.id }, `${s.icon} ${s.name}`)),
  );
  sportSelect.value = getSport(sportFilter) ? sportFilter : 'all';
  const search = h('input', { type: 'search', class: 'input', placeholder: '🔍 名前で検索', 'aria-label': '名前で検索' });
  const list = h('ul', { class: 'board-list' });
  const listTitle = h('h2', {});

  function open(boardId) {
    location.hash = `#/board/${encodeURIComponent(boardId)}`;
  }

  function create(sport) {
    try {
      open(createBoard(sport).id);
    } catch (err) {
      showToast(err instanceof StorageFullError ? '保存容量がいっぱいです。古い配置を削除してください' : '作成できませんでした', 'error', 4000);
    }
  }

  function renderList() {
    const all = sortBoards(listBoards());
    const q = query.trim().toLowerCase();
    const boards = all.filter((b) =>
      (sportSelect.value === 'all' || b.sportId === sportSelect.value) &&
      (!q || b.name.toLowerCase().includes(q)));
    listTitle.textContent = `保存済みの配置 (${all.length})`;

    if (all.length === 0) {
      list.replaceChildren(h('li', { class: 'empty' }, 'まだ配置はありません。上のスポーツから作成してください'));
      return;
    }
    if (boards.length === 0) {
      list.replaceChildren(h('li', { class: 'empty' }, '条件に合う配置がありません'));
      return;
    }
    list.replaceChildren(...boards.map((board) => {
      const sport = getSport(board.sportId);
      const template = sport && templateName(board.home.templateId, sport);
      const count = placedPlayers(board.home).length;
      const meta = [formatShort(board.date), sport?.name, template, `${count}人`].filter(Boolean).join(' ・ ');
      return h('li', { class: 'board-row' },
        h('button', { class: 'board-open', type: 'button', onclick: () => open(board.id) },
          h('span', { class: 'board-row-icon', 'aria-hidden': 'true' }, sport?.icon ?? '❓'),
          h('span', { class: 'board-row-text' },
            h('span', { class: 'board-row-name' }, board.name),
            h('span', { class: 'board-row-meta' }, meta),
          ),
        ),
        h('div', { class: 'board-row-actions' },
          h('button', { class: 'icon-button', type: 'button', title: '複製', 'aria-label': `${board.name} を複製`, onclick: () => duplicate(board) }, '⧉'),
          h('button', { class: 'icon-button', type: 'button', title: '削除', 'aria-label': `${board.name} を削除`, onclick: () => remove(board) }, '🗑'),
        ),
      );
    }));
  }

  function duplicate(board) {
    try {
      const copy = duplicateBoard(board.id);
      showToast('複製しました');
      open(copy.id);
    } catch {
      showToast('複製できませんでした (保存容量がいっぱいの可能性があります)', 'error', 4000);
    }
  }

  async function remove(board) {
    if (!(await confirmDialog(`「${board.name}」を削除しますか?\nこの操作は元に戻せません。`, { title: '配置を削除', okLabel: '削除', danger: true }))) return;
    deleteBoard(board.id);
    showToast('削除しました');
    renderList();
  }

  sportSelect.addEventListener('change', () => {
    sportFilter = sportSelect.value;
    storage.write(KEYS.settings, { ...storage.read(KEYS.settings, {}), homeSportFilter: sportFilter });
    renderList();
  });
  search.addEventListener('input', () => {
    query = search.value;
    renderList();
  });

  root.append(
    h('a', { class: 'help-link', href: '#/help' }, '📖 使い方'),
    h('section', { class: 'card' },
      h('h1', {}, '新しい配置を作る'),
      h('div', { class: 'sport-buttons' },
        listSports().map((sport) =>
          h('button', { class: 'btn sport-button', type: 'button', onclick: () => create(sport) },
            h('span', { class: 'sport-icon', 'aria-hidden': 'true' }, sport.icon),
            sport.name,
          ),
        ),
      ),
    ),
    h('section', { class: 'card' },
      listTitle,
      h('div', { class: 'toolbar' }, sportSelect, search),
      list,
    ),
  );
  renderList();
}
