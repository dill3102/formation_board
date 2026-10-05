// 選手をまとめて追加するモーダル
// 参加スポーツは全員共通。1行に1人ずつ 名前・背番号 (スポーツごと) を入力する
// 写真・ポジション・利き足は追加後に1人ずつ編集する
import { h } from '../util/dom.js';
import { createId } from '../util/id.js';
import { listSports, getSport } from '../sports.js';
import { listPlayers, addPlayers, findDuplicateNumbers, parsePlayerLines } from '../models/players.js';
import { StorageFullError } from '../storage.js';
import { openModal } from '../ui/modal.js';
import { showToast } from '../ui/toast.js';

const INITIAL_ROWS = 5;

/**
 * @param {object} [options]
 * @param {string | null} [options.sportId] 最初から選んでおく参加スポーツ (一覧で絞り込み中のスポーツ)
 * @returns {Promise<boolean>} 追加したら true
 */
export function openPlayerBulkAdd({ sportId = null } = {}) {
  const existing = listPlayers();
  const state = {
    sportIds: sportId && getSport(sportId) ? [sportId] : [],
    rows: Array.from({ length: INITIAL_ROWS }, () => newRow()),
  };
  let added = false;

  function newRow(name = '', numbers = {}) {
    return { id: createId(), name, numbers: { ...numbers } };
  }

  function namedRows() {
    return state.rows.filter((r) => r.name.trim());
  }

  function toDraft(row) {
    return {
      id: row.id,
      name: row.name,
      sports: Object.fromEntries(state.sportIds.map((id) => [id, { number: (row.numbers[id] ?? '').trim(), positions: [] }])),
    };
  }

  return new Promise((resolve) => {
    // ---- 参加スポーツ ----
    const sportChips = h('div', { class: 'chips' },
      listSports().map((sport) => {
        const chip = h('button', {
          class: 'chip', type: 'button', 'aria-pressed': String(state.sportIds.includes(sport.id)),
        }, `${sport.icon} ${sport.name}`);
        chip.addEventListener('click', () => {
          const on = state.sportIds.includes(sport.id);
          state.sportIds = on
            ? state.sportIds.filter((id) => id !== sport.id)
            : listSports().map((s) => s.id).filter((id) => id === sport.id || state.sportIds.includes(id));
          chip.setAttribute('aria-pressed', String(!on));
          renderTable();
        });
        return chip;
      }),
    );

    // ---- 入力表 ----
    const table = h('div', { class: 'bulk-table-wrap' });
    const warnings = h('ul', { class: 'bulk-warnings' });
    const addRowButton = h('button', { class: 'btn btn-small', type: 'button' }, '＋ 行を追加');
    const submitButton = h('button', { class: 'btn btn-primary', type: 'button' });

    function renderTable() {
      const sports = state.sportIds.map(getSport);
      table.replaceChildren(h('table', { class: 'bulk-table' },
        h('thead', {}, h('tr', {},
          h('th', { class: 'bulk-index' }, '#'),
          h('th', {}, '名前'),
          sports.map((s) => h('th', { class: 'bulk-number' }, `${s.icon} 背番号`)),
          h('th', { class: 'bulk-remove' }, h('span', { class: 'visually-hidden' }, '削除')),
        )),
        h('tbody', {}, state.rows.map((row, i) => createRow(row, i, sports))),
      ));
      update();
    }

    function createRow(row, index, sports) {
      const nameInput = h('input', {
        type: 'text', class: 'input', value: row.name, maxlength: 40, autocomplete: 'off',
        'aria-label': `${index + 1}人目の名前`, dataset: { row: row.id, field: 'name' },
      });
      nameInput.addEventListener('input', () => { row.name = nameInput.value; update(); });
      // Enter で次の行の名前へ (最後の行なら行を足す)
      nameInput.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' || e.isComposing) return;
        e.preventDefault();
        if (index === state.rows.length - 1) {
          state.rows.push(newRow());
          renderTable();
        }
        focusName(state.rows[index + 1].id);
      });

      const numberInputs = sports.map((sport) => {
        const input = h('input', {
          type: 'text', class: 'input input-number', value: row.numbers[sport.id] ?? '', maxlength: 4,
          inputmode: 'numeric', autocomplete: 'off', 'aria-label': `${index + 1}人目の${sport.name}の背番号`,
          dataset: { row: row.id, sport: sport.id },
        });
        input.addEventListener('input', () => { row.numbers[sport.id] = input.value; update(); });
        return h('td', { class: 'bulk-number' }, input);
      });

      const removeButton = h('button', {
        class: 'icon-button', type: 'button', 'aria-label': `${index + 1}行目を削除`, title: '行を削除',
      }, '✕');
      removeButton.addEventListener('click', () => {
        state.rows = state.rows.filter((r) => r !== row);
        if (state.rows.length === 0) state.rows.push(newRow());
        renderTable();
      });

      return h('tr', {},
        h('td', { class: 'bulk-index' }, String(index + 1)),
        h('td', {}, nameInput),
        numberInputs,
        h('td', { class: 'bulk-remove' }, removeButton),
      );
    }

    function focusName(rowId) {
      table.querySelector(`input[data-row="${rowId}"][data-field="name"]`)?.focus();
    }

    // 人数表示と背番号の重複チェック (既存の選手 + この表の中)
    function update() {
      const drafts = namedRows().map(toDraft);
      const count = drafts.length;
      submitButton.textContent = count ? `${count}人を追加` : '追加';
      submitButton.disabled = count === 0;

      const all = [...existing, ...drafts];
      const messages = new Map();
      for (const input of table.querySelectorAll('input[data-sport]')) {
        input.classList.remove('is-warning');
        input.removeAttribute('title');
      }
      for (const draft of drafts) {
        for (const [sportId, others] of Object.entries(findDuplicateNumbers(draft, all))) {
          const number = draft.sports[sportId].number;
          const input = table.querySelector(`input[data-row="${draft.id}"][data-sport="${sportId}"]`);
          input?.classList.add('is-warning');
          input?.setAttribute('title', `${others.map((p) => p.name).join('、')} と重複`);
          const key = `${sportId}:${number}`;
          const names = new Set([draft.name.trim(), ...others.map((p) => p.name)]);
          messages.set(key, `⚠ ${getSport(sportId).name} ${number}番: ${[...names].join('、')}`);
        }
      }
      warnings.replaceChildren(...[...messages.values()].map((m) => h('li', {}, m)));
    }

    // ---- 貼り付け ----
    const pasteArea = h('textarea', {
      class: 'input bulk-paste', rows: 5,
      placeholder: '山田 太郎, 10\n佐藤 次郎, 4\n鈴木 三郎, 9',
      'aria-label': '貼り付けるテキスト',
    });
    const pasteButton = h('button', { class: 'btn btn-small', type: 'button' }, '表に反映');
    pasteButton.addEventListener('click', () => {
      const parsed = parsePlayerLines(pasteArea.value, state.sportIds);
      if (parsed.length === 0) {
        showToast('名前が見つかりませんでした', 'error');
        return;
      }
      // 空の行を除いて、貼り付けた分を後ろに足す
      state.rows = [...namedRows(), ...parsed.map((p) => newRow(p.name, p.numbers))];
      pasteArea.value = '';
      paste.open = false;
      renderTable();
      showToast(`${parsed.length}人分を表に反映しました`);
    });
    const paste = h('details', { class: 'bulk-paste-box' },
      h('summary', {}, 'テキストを貼り付けて入力'),
      h('p', { class: 'note' }, '1行に1人。「名前, 背番号」の形 (Excel からのコピーも可)。背番号は上で選んだスポーツの順に対応します'),
      pasteArea,
      pasteButton,
    );

    addRowButton.addEventListener('click', () => {
      state.rows.push(newRow());
      renderTable();
      focusName(state.rows.at(-1).id);
    });

    const cancelButton = h('button', { class: 'btn', type: 'button' }, 'キャンセル');

    const modal = openModal({
      title: '選手をまとめて追加',
      body: h('div', { class: 'form' },
        h('div', { class: 'field' },
          h('span', { class: 'field-label' }, '参加スポーツ (全員共通・複数可)'),
          sportChips,
        ),
        table,
        h('div', { class: 'bulk-actions' }, addRowButton),
        warnings,
        paste,
        h('p', { class: 'note' }, '写真・ポジション・利き足は、追加したあと一覧から1人ずつ設定できます'),
      ),
      footer: [cancelButton, submitButton],
      fullscreenOnMobile: true,
      wide: true,
      onClose: () => resolve(added),
    });

    cancelButton.addEventListener('click', () => modal.close());
    submitButton.addEventListener('click', () => {
      const drafts = namedRows().map(toDraft);
      if (drafts.length === 0) return;
      try {
        addPlayers(drafts);
      } catch (err) {
        if (err instanceof StorageFullError) {
          showToast('保存容量がいっぱいです。写真や古い配置を削除してください', 'error', 4000);
        } else {
          console.error(err);
          showToast('保存できませんでした', 'error');
        }
        return;
      }
      const hasDuplicates = warnings.children.length > 0;
      added = true;
      modal.close();
      showToast(`${drafts.length}人を追加しました${hasDuplicates ? ' (背番号の重複があります)' : ''}`);
    });

    renderTable();
    focusName(state.rows[0].id);
  });
}
