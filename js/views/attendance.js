// 出欠・現着 (02_wireframe 3章)
// 左のカレンダーで日付を選ぶ → 右にその日の全選手の出欠。タップした瞬間に自動保存
import { h } from '../util/dom.js';
import { todayKey, fromDateKey, formatShort } from '../util/date.js';
import * as storage from '../storage.js';
import { KEYS, StorageFullError } from '../storage.js';
import { listSports, getSport } from '../sports.js';
import { listPlayers, sortPlayers, filterPlayers } from '../models/players.js';
import {
  STATUSES, getDay, datesWithData, setStatus, setArrived, countDay, filterByAttendance,
} from '../models/attendance.js';
import { createAvatar } from '../ui/avatar.js';
import { createCalendar } from '../ui/calendar.js';
import { showToast } from '../ui/toast.js';

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];
const VIEWS = [
  { id: 'all', label: '全員' },
  { id: 'yes', label: '参加のみ' },
  { id: 'arrived', label: '現着のみ' },
];
const isPhone = () => window.matchMedia('(max-width: 767px)').matches;

export function render(root) {
  const settings = storage.read(KEYS.settings, {});
  const state = {
    date: todayKey(),
    view: 'all',
    sportFilter: getSport(settings.attendanceSportFilter) ? settings.attendanceSportFilter : 'all',
    checked: new Set(),
  };

  // ---- カレンダー ----
  const calendar = createCalendar({
    selected: state.date,
    marks: datesWithData(),
    mode: isPhone() ? 'week' : 'month',
    onSelect: (date) => {
      state.date = date;
      state.checked.clear();
      renderDay();
    },
  });
  let monthOpen = !isPhone();
  const modeToggle = h('button', { class: 'btn btn-small calendar-mode', type: 'button' });
  function renderModeToggle() {
    modeToggle.textContent = monthOpen ? '週表示にする' : '月表示にする';
  }
  modeToggle.addEventListener('click', () => {
    monthOpen = !monthOpen;
    calendar.setMode(monthOpen ? 'month' : 'week');
    renderModeToggle();
  });
  const todayButton = h('button', { class: 'btn btn-small', type: 'button', onclick: () => calendar.select(todayKey()) }, '今日へ');

  // ---- 日付ごとの表示 ----
  const dayTitle = h('h1', { class: 'attendance-title' });
  const summary = h('p', { class: 'attendance-summary' });

  const sportSelect = h('select', { class: 'input', 'aria-label': 'スポーツで絞り込み' },
    h('option', { value: 'all' }, 'すべての選手'),
    listSports().map((s) => h('option', { value: s.id }, `${s.icon} ${s.name}`)),
  );
  sportSelect.value = state.sportFilter;
  sportSelect.addEventListener('change', () => {
    state.sportFilter = sportSelect.value;
    storage.write(KEYS.settings, { ...storage.read(KEYS.settings, {}), attendanceSportFilter: state.sportFilter });
    state.checked.clear();
    renderDay();
  });

  const viewButtons = h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': '表示' },
    VIEWS.map((v) => {
      const input = h('input', { type: 'radio', name: 'attendance-view', value: v.id, checked: state.view === v.id });
      input.addEventListener('change', () => {
        state.view = v.id;
        state.checked.clear();
        renderDay();
      });
      return h('label', {}, input, h('span', {}, v.label));
    }),
  );

  const checkAll = h('input', { type: 'checkbox', 'aria-label': '全員を選択' });
  const checkedCount = h('span', { class: 'bulk-count' });
  const bulkButtons = [...STATUSES, { id: null, label: '未入力に戻す' }].map((s) =>
    h('button', { class: `btn btn-small status-${s.id ?? 'none'}`, type: 'button', onclick: () => applyBulk(s.id) }, s.label));
  const bulkBar = h('div', { class: 'bulk-bar' },
    h('label', { class: 'check-all' }, checkAll, h('span', {}, '全選択')),
    checkedCount,
    h('div', { class: 'bulk-buttons' }, bulkButtons),
  );
  checkAll.addEventListener('change', () => {
    const ids = visiblePlayers().map((p) => p.id);
    if (checkAll.checked) ids.forEach((id) => state.checked.add(id));
    else state.checked.clear();
    renderList();
  });

  const list = h('ul', { class: 'attendance-list' });

  // ---- データ ----
  function sportPlayers() {
    const sport = getSport(state.sportFilter);
    const players = filterPlayers(listPlayers(), sport ? sport.id : 'all');
    return sortPlayers(players, sport ? 'number' : 'name', sport);
  }

  function visiblePlayers() {
    return filterByAttendance(sportPlayers(), getDay(state.date), state.view);
  }

  function save(fn) {
    try {
      fn();
    } catch (err) {
      showToast(err instanceof StorageFullError ? '保存容量がいっぱいです' : '保存できませんでした', 'error', 4000);
    }
    calendar.setMarks(datesWithData());
    renderDay();
  }

  function applyBulk(status) {
    const ids = [...state.checked];
    if (ids.length === 0) {
      showToast('選手を選んでください');
      return;
    }
    save(() => setStatus(state.date, ids, status));
    state.checked.clear();
    renderList();
    showToast(`${ids.length}人を「${status ? STATUSES.find((s) => s.id === status).label : '未入力'}」にしました`);
  }

  // ---- 表示 ----
  function renderDay() {
    const d = fromDateKey(state.date);
    const isToday = state.date === todayKey();
    dayTitle.replaceChildren(`${formatShort(state.date)} (${WEEKDAYS[d.getDay()]})`);
    if (isToday) dayTitle.append(h('span', { class: 'today-badge' }, '今日'));
    const counts = countDay(getDay(state.date), sportPlayers());
    summary.replaceChildren(
      h('span', { class: 'count count-yes' }, `参加 ${counts.yes}`),
      h('span', { class: 'count count-no' }, `不参加 ${counts.no}`),
      h('span', { class: 'count count-maybe' }, `未定 ${counts.maybe}`),
      h('span', { class: 'count count-none' }, `未入力 ${counts.none}`),
      h('span', { class: 'count count-arrived' }, `現着 ${counts.arrived} / ${counts.yes}`),
    );
    root.querySelector('.attendance')?.classList.toggle('is-today', isToday);
    renderList();
  }

  function renderList() {
    const day = getDay(state.date);
    const players = visiblePlayers();
    const sport = getSport(state.sportFilter);

    // 表示されていない選手のチェックは外す
    const visibleIds = new Set(players.map((p) => p.id));
    for (const id of state.checked) if (!visibleIds.has(id)) state.checked.delete(id);

    checkAll.checked = players.length > 0 && state.checked.size === players.length;
    checkAll.indeterminate = state.checked.size > 0 && state.checked.size < players.length;
    checkedCount.textContent = state.checked.size > 0 ? `${state.checked.size}人を →` : '選んだ人を →';
    for (const b of bulkButtons) b.disabled = state.checked.size === 0;

    if (listPlayers().length === 0) {
      list.replaceChildren(h('li', { class: 'empty' }, h('span', {}, 'まだ選手が登録されていません。'), h('a', { href: '#/players' }, '選手を登録する')));
      return;
    }
    if (players.length === 0) {
      list.replaceChildren(h('li', { class: 'empty' }, '条件に合う選手がいません'));
      return;
    }
    list.replaceChildren(...players.map((player) => createRow(player, day[player.id], sport)));
  }

  function createRow(player, entry, sport) {
    const check = h('input', { type: 'checkbox', checked: state.checked.has(player.id), 'aria-label': `${player.name}を選択` });
    check.addEventListener('change', () => {
      if (check.checked) state.checked.add(player.id);
      else state.checked.delete(player.id);
      renderList();
    });

    // 出欠: 押したものに切り替え。同じものをもう一度押すと未入力に戻す
    const statusButtons = h('div', { class: 'status-buttons', role: 'group', 'aria-label': `${player.name}の出欠` },
      STATUSES.map((s) => h('button', {
        class: `status-button status-${s.id}`, type: 'button', 'aria-pressed': String(entry?.status === s.id),
        onclick: () => save(() => setStatus(state.date, [player.id], entry?.status === s.id ? null : s.id)),
      }, s.label)),
    );

    const arrived = entry?.status === 'yes'
      ? h('button', {
        class: `arrived-button${entry.arrived ? ' is-arrived' : ''}`, type: 'button', 'aria-pressed': String(!!entry.arrived),
        onclick: () => save(() => setArrived(state.date, player.id, !entry.arrived)),
      }, entry.arrived ? '✓ 現着' : '未着')
      : h('span', { class: 'arrived-none', 'aria-hidden': 'true' }, '—');

    const number = sport ? player.sports?.[sport.id]?.number : '';
    return h('li', { class: 'attendance-row' },
      h('label', { class: 'row-check' }, check),
      createAvatar(player, { sportId: sport?.id ?? null, size: 36 }),
      h('span', { class: 'attendance-name' }, number ? `#${number} ${player.name}` : player.name),
      statusButtons,
      arrived,
    );
  }

  root.append(h('section', { class: 'card attendance' },
    h('div', { class: 'attendance-layout' },
      h('aside', { class: 'attendance-calendar' },
        calendar.el,
        h('div', { class: 'calendar-actions' }, todayButton, modeToggle),
        h('p', { class: 'note' }, '● = 出欠の記録がある日'),
      ),
      h('div', { class: 'attendance-day' },
        dayTitle,
        summary,
        h('div', { class: 'toolbar' }, sportSelect, viewButtons),
        bulkBar,
        list,
      ),
    ),
  ));

  renderModeToggle();
  renderDay();
}
