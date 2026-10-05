// カレンダー (月表示 / 週表示)。日曜始まり
// 記録がある日に ● を付ける。選んだ日・今日を強調
import { h } from '../util/dom.js';
import { toDateKey, fromDateKey, todayKey } from '../util/date.js';

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

/**
 * @param {object} options
 * @param {string} options.selected "YYYY-MM-DD"
 * @param {Set<string>} options.marks ● を付ける日付
 * @param {'month' | 'week'} [options.mode]
 * @param {(date: string) => void} options.onSelect
 */
export function createCalendar({ selected, marks, mode = 'month', onSelect }) {
  const state = { selected, marks, mode, cursor: fromDateKey(selected) };

  const title = h('span', { class: 'calendar-title', 'aria-live': 'polite' });
  const prev = h('button', { class: 'icon-button', type: 'button' }, '◀');
  const next = h('button', { class: 'icon-button', type: 'button' }, '▶');
  const grid = h('div', { class: 'calendar-grid', role: 'grid' });
  const el = h('div', { class: 'calendar' },
    h('div', { class: 'calendar-head' }, prev, title, next),
    grid,
  );

  prev.addEventListener('click', () => move(-1));
  next.addEventListener('click', () => move(1));

  function move(step) {
    const c = state.cursor;
    state.cursor = state.mode === 'week'
      ? new Date(c.getFullYear(), c.getMonth(), c.getDate() + step * 7)
      : new Date(c.getFullYear(), c.getMonth() + step, 1);
    render();
  }

  function days() {
    const c = state.cursor;
    if (state.mode === 'week') {
      const start = new Date(c.getFullYear(), c.getMonth(), c.getDate() - c.getDay());
      return Array.from({ length: 7 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
    }
    const first = new Date(c.getFullYear(), c.getMonth(), 1);
    const start = new Date(first.getFullYear(), first.getMonth(), 1 - first.getDay());
    const last = new Date(c.getFullYear(), c.getMonth() + 1, 0);
    const count = Math.ceil((first.getDay() + last.getDate()) / 7) * 7;
    return Array.from({ length: count }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  }

  function render() {
    const c = state.cursor;
    prev.setAttribute('aria-label', state.mode === 'week' ? '前の週' : '前の月');
    next.setAttribute('aria-label', state.mode === 'week' ? '次の週' : '次の月');
    title.textContent = `${c.getFullYear()}年${c.getMonth() + 1}月`;
    const today = todayKey();
    grid.replaceChildren(
      ...WEEKDAYS.map((w, i) => h('span', { class: `calendar-weekday${i === 0 ? ' is-sun' : i === 6 ? ' is-sat' : ''}` }, w)),
      ...days().map((date) => {
        const key = toDateKey(date);
        const outside = state.mode === 'month' && date.getMonth() !== c.getMonth();
        const classes = ['calendar-day',
          outside && 'is-outside',
          key === today && 'is-today',
          key === state.selected && 'is-selected',
          date.getDay() === 0 && 'is-sun',
          date.getDay() === 6 && 'is-sat',
        ].filter(Boolean).join(' ');
        return h('button', {
          class: classes, type: 'button', 'aria-pressed': String(key === state.selected),
          'aria-label': `${date.getMonth() + 1}月${date.getDate()}日${state.marks.has(key) ? ' 記録あり' : ''}`,
          onclick: () => select(key),
        },
        h('span', {}, String(date.getDate())),
        state.marks.has(key) && h('span', { class: 'calendar-mark', 'aria-hidden': 'true' }),
        );
      }),
    );
  }

  function select(key) {
    state.selected = key;
    state.cursor = fromDateKey(key);
    render();
    onSelect(key);
  }

  render();

  return {
    el,
    select,
    setMarks(marks) {
      state.marks = marks;
      render();
    },
    setMode(mode) {
      state.mode = mode;
      state.cursor = fromDateKey(state.selected);
      render();
    },
  };
}
