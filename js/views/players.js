// 選手管理 (02_wireframe 2章)
import { h } from '../util/dom.js';
import * as storage from '../storage.js';
import { KEYS } from '../storage.js';
import { listSports, getSport } from '../sports.js';
import { listPlayers, sortPlayers, filterPlayers, handednessLabel } from '../models/players.js';
import { createAvatar } from '../ui/avatar.js';
import { openPlayerEditor } from './player-edit.js';

const SORTS_ALL = [
  { id: 'name', label: '名前順' },
  { id: 'created', label: '登録順' },
];
const SORTS_SPORT = [
  { id: 'number', label: '背番号順' },
  { id: 'name', label: '名前順' },
  { id: 'position', label: 'ポジション順' },
];

function loadViewSettings() {
  const settings = storage.read(KEYS.settings, {});
  return {
    sportFilter: settings.playerSportFilter ?? 'all',
    sort: settings.playerSort ?? 'name',
  };
}

function saveViewSettings({ sportFilter, sort }) {
  const settings = storage.read(KEYS.settings, {});
  storage.write(KEYS.settings, { ...settings, playerSportFilter: sportFilter, playerSort: sort });
}

export function render(root) {
  const view = { ...loadViewSettings(), query: '' };
  if (view.sportFilter !== 'all' && view.sportFilter !== 'none' && !getSport(view.sportFilter)) {
    view.sportFilter = 'all';
  }

  const title = h('h1', {});
  const sportSelect = h('select', { class: 'input', 'aria-label': 'スポーツで絞り込み' },
    h('option', { value: 'all' }, 'すべて'),
    listSports().map((s) => h('option', { value: s.id }, `${s.icon} ${s.name}`)),
    h('option', { value: 'none' }, 'スポーツ未登録'),
  );
  const sortSelect = h('select', { class: 'input', 'aria-label': '並び順' });
  const search = h('input', { type: 'search', class: 'input', placeholder: '🔍 名前で検索', 'aria-label': '名前で検索' });
  const addButton = h('button', { class: 'btn btn-primary', type: 'button' }, '＋ 選手を追加');
  const list = h('ul', { class: 'player-list' });

  sportSelect.value = view.sportFilter;

  function renderSortOptions() {
    const sorts = getSport(view.sportFilter) ? SORTS_SPORT : SORTS_ALL;
    if (!sorts.some((s) => s.id === view.sort)) view.sort = sorts[0].id;
    sortSelect.replaceChildren(...sorts.map((s) => h('option', { value: s.id }, s.label)));
    sortSelect.value = view.sort;
  }

  function renderList() {
    const all = listPlayers();
    const sport = getSport(view.sportFilter);
    const players = sortPlayers(filterPlayers(all, view.sportFilter, view.query), view.sort, sport);

    title.textContent = `選手一覧 (${all.length}人)`;
    if (all.length === 0) {
      list.replaceChildren(h('li', { class: 'empty' }, 'まだ選手が登録されていません。「＋ 選手を追加」から登録してください'));
      return;
    }
    if (players.length === 0) {
      list.replaceChildren(h('li', { class: 'empty' }, '条件に合う選手がいません'));
      return;
    }
    list.replaceChildren(...players.map((p) => createRow(p, sport)));
  }

  function createRow(player, sport) {
    // スポーツで絞り込み中はそのスポーツだけ、それ以外は参加スポーツすべてを表示
    const sports = sport ? [sport] : listSports().filter((s) => s.id in player.sports);
    const tags = sports.map((s) => {
      const info = player.sports[s.id];
      const number = info.number ? `#${info.number}` : '';
      return h('span', { class: 'sport-tag' },
        h('span', { 'aria-hidden': 'true' }, s.icon),
        h('span', { class: 'visually-hidden' }, s.name),
        `${number} ${info.positions.join(',')}`.trim() || '—');
    });

    return h('li', {},
      h('button', { class: 'player-row', type: 'button', onclick: () => edit(player.id) },
        createAvatar(player, { sportId: sport?.id ?? null }),
        h('span', { class: 'player-name' }, player.name),
        h('span', { class: 'player-sports' }, tags.length ? tags : h('span', { class: 'note' }, 'スポーツ未登録')),
        h('span', { class: 'player-hand' }, handednessLabel(player.handedness)),
      ),
    );
  }

  async function edit(playerId = null) {
    if (await openPlayerEditor(playerId)) renderList();
  }

  sportSelect.addEventListener('change', () => {
    view.sportFilter = sportSelect.value;
    renderSortOptions();
    saveViewSettings(view);
    renderList();
  });
  sortSelect.addEventListener('change', () => {
    view.sort = sortSelect.value;
    saveViewSettings(view);
    renderList();
  });
  search.addEventListener('input', () => {
    view.query = search.value;
    renderList();
  });
  addButton.addEventListener('click', () => edit());

  root.append(
    h('section', { class: 'card' },
      h('div', { class: 'page-header' }, title, addButton),
      h('div', { class: 'toolbar' }, sportSelect, sortSelect, search),
      list,
    ),
  );
  renderSortOptions();
  renderList();
}
