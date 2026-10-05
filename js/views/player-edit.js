// 選手の登録/編集モーダル (02_wireframe 2-1)
import { h } from '../util/dom.js';
import { listSports } from '../sports.js';
import {
  HANDEDNESS, newPlayer, getPlayer, getPhoto, listPlayers, savePlayer, deletePlayer,
  countBoardsUsing, findDuplicateNumbers,
} from '../models/players.js';
import { StorageFullError } from '../storage.js';
import { openModal, confirmDialog } from '../ui/modal.js';
import { showToast } from '../ui/toast.js';
import { createAvatar } from '../ui/avatar.js';
import { cropPhoto } from '../ui/photo-cropper.js';

/**
 * @param {string | null} playerId null なら新規登録
 * @returns {Promise<boolean>} 保存・削除したら true
 */
export function openPlayerEditor(playerId = null) {
  const original = playerId ? getPlayer(playerId) : newPlayer();
  if (!original) return Promise.resolve(false);

  const isNew = !original.id;
  const draft = structuredClone(original);
  // 参加スポーツを OFF → ON にした時に入力内容が戻るよう、OFF にしたスポーツの設定も残しておく
  const sportDrafts = structuredClone(original.sports);
  let photo = undefined; // undefined = 変更なし / null = 削除 / string = 新しい写真
  let changed = false;

  return new Promise((resolve) => {
    // ---- 写真 ----
    const photoPreview = h('div', { class: 'photo-preview' });
    const fileInput = h('input', { type: 'file', accept: 'image/*', hidden: true });
    const removePhotoButton = h('button', { class: 'btn btn-small', type: 'button' }, '写真を削除');

    function currentPhoto() {
      if (photo !== undefined) return photo;
      return draft.hasPhoto && draft.id ? getPhoto(draft.id) : null;
    }
    function renderPhoto() {
      photoPreview.replaceChildren(createAvatar(draft, { photo: currentPhoto(), size: 88 }));
      removePhotoButton.hidden = !currentPhoto();
    }

    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      fileInput.value = '';
      if (!file) return;
      try {
        const cropped = await cropPhoto(file);
        if (cropped) {
          photo = cropped;
          renderPhoto();
        }
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
    removePhotoButton.addEventListener('click', () => {
      photo = null;
      renderPhoto();
    });

    // ---- 名前・利き ----
    const nameInput = h('input', {
      type: 'text', class: 'input', id: 'player-name', value: draft.name,
      maxlength: 40, autocomplete: 'off', required: true,
    });
    const nameError = h('p', { class: 'field-error', hidden: true }, '名前を入力してください');
    nameInput.addEventListener('input', () => {
      draft.name = nameInput.value;
      nameError.hidden = true;
      renderPhoto();
    });

    const handedness = h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': '利き足(腕)' },
      [{ id: null, label: '未設定' }, ...HANDEDNESS].map((opt) => {
        const input = h('input', {
          type: 'radio', name: 'handedness', value: opt.id ?? '', checked: draft.handedness === opt.id,
        });
        input.addEventListener('change', () => { draft.handedness = opt.id; });
        return h('label', {}, input, h('span', {}, opt.label));
      }),
    );

    // ---- 参加スポーツ・スポーツごとの設定 ----
    const sportSections = h('div', { class: 'sport-sections' });
    const sportChips = h('div', { class: 'chips' },
      listSports().map((sport) => {
        const chip = h('button', {
          class: 'chip', type: 'button', 'aria-pressed': String(sport.id in draft.sports),
        }, `${sport.icon} ${sport.name}`);
        chip.addEventListener('click', () => {
          if (sport.id in draft.sports) {
            sportDrafts[sport.id] = draft.sports[sport.id];
            delete draft.sports[sport.id];
          } else {
            draft.sports[sport.id] = sportDrafts[sport.id] ?? { number: '', positions: [] };
          }
          chip.setAttribute('aria-pressed', String(sport.id in draft.sports));
          renderSportSections();
        });
        return chip;
      }),
    );

    function renderSportSections() {
      const sports = listSports().filter((s) => s.id in draft.sports);
      sportSections.replaceChildren(...sports.map(createSportSection));
      if (sports.length === 0) {
        sportSections.append(h('p', { class: 'note' }, '参加スポーツを選ぶと、背番号と可能ポジションを設定できます'));
      }
      updateDuplicateWarnings();
    }

    const warningEls = new Map();

    function createSportSection(sport) {
      const info = draft.sports[sport.id];
      const numberInput = h('input', {
        type: 'text', class: 'input input-number', value: info.number ?? '', maxlength: 4,
        inputmode: 'numeric', autocomplete: 'off', 'aria-label': `${sport.name}の背番号`,
      });
      numberInput.addEventListener('input', () => {
        info.number = numberInput.value.trim();
        updateDuplicateWarnings();
      });
      const warning = h('span', { class: 'field-warning', hidden: true });
      warningEls.set(sport.id, warning);

      const positions = h('div', { class: 'chips', role: 'group', 'aria-label': `${sport.name}の可能ポジション` },
        sport.positions.map((pos) => {
          const chip = h('button', {
            class: 'chip', type: 'button', title: pos.name,
            'aria-pressed': String(info.positions.includes(pos.id)),
          }, pos.short);
          chip.addEventListener('click', () => {
            // 選んだ順に並ぶ (先頭ほど優先。v2 の優先順に使う)
            const i = info.positions.indexOf(pos.id);
            if (i >= 0) info.positions.splice(i, 1);
            else info.positions.push(pos.id);
            chip.setAttribute('aria-pressed', String(i < 0));
          });
          return chip;
        }),
      );

      return h('fieldset', { class: 'sport-section' },
        h('legend', {}, `${sport.icon} ${sport.name}`),
        h('div', { class: 'field-row' },
          h('span', { class: 'field-label' }, '背番号'), numberInput, warning),
        h('div', { class: 'field-row field-row-top' },
          h('span', { class: 'field-label' }, 'ポジション'), positions),
      );
    }

    function updateDuplicateWarnings() {
      const duplicates = findDuplicateNumbers(draft, listPlayers());
      for (const [sportId, el] of warningEls) {
        const others = duplicates[sportId];
        el.hidden = !others;
        if (others) {
          el.textContent = `⚠ ${draft.sports[sportId].number}番は ${others.map((p) => p.name).join('、')} と重複`;
        }
      }
    }

    // ---- ボタン ----
    const saveButton = h('button', { class: 'btn btn-primary', type: 'submit', form: 'player-form' }, '保存');
    const cancelButton = h('button', { class: 'btn', type: 'button' }, 'キャンセル');
    const deleteButton = isNew ? null : h('button', { class: 'btn btn-danger', type: 'button' }, '削除');

    const form = h('form', { id: 'player-form', class: 'form', novalidate: true },
      h('div', { class: 'photo-field' },
        photoPreview,
        h('div', { class: 'photo-actions' },
          h('button', { class: 'btn btn-small', type: 'button', onclick: () => fileInput.click() }, '写真を選ぶ'),
          removePhotoButton,
          fileInput,
          h('p', { class: 'note' }, '正方形に切り抜いて保存します'),
        ),
      ),
      h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'player-name' }, '名前'), nameInput, nameError),
      h('div', { class: 'field' }, h('span', { class: 'field-label' }, '利き足(腕)'), handedness),
      h('div', { class: 'field' }, h('span', { class: 'field-label' }, '参加スポーツ (複数可)'), sportChips),
      sportSections,
    );

    const modal = openModal({
      title: isNew ? '選手を追加' : '選手を編集',
      body: form,
      footer: [deleteButton, h('span', { class: 'spacer' }), cancelButton, saveButton].filter(Boolean),
      fullscreenOnMobile: true,
      onClose: () => resolve(changed),
    });

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!draft.name.trim()) {
        nameError.hidden = false;
        nameInput.focus();
        return;
      }
      try {
        const saved = savePlayer(draft, photo);
        const dupCount = Object.keys(findDuplicateNumbers(saved, listPlayers())).length;
        showToast(dupCount ? '保存しました (背番号の重複があります)' : '保存しました');
        changed = true;
        modal.close();
      } catch (err) {
        if (err instanceof StorageFullError) {
          showToast('保存容量がいっぱいです。写真や古い配置を削除してください', 'error', 4000);
        } else {
          console.error(err);
          showToast('保存できませんでした', 'error');
        }
      }
    });
    cancelButton.addEventListener('click', () => modal.close());
    deleteButton?.addEventListener('click', async () => {
      const used = countBoardsUsing(draft.id);
      const message = `「${original.name}」を削除しますか?` +
        (used ? `\n${used}件の配置で使われています。配置からも外されます。` : '') +
        '\nこの操作は元に戻せません。';
      if (!(await confirmDialog(message, { title: '選手を削除', okLabel: '削除', danger: true }))) return;
      deletePlayer(draft.id);
      showToast('削除しました');
      changed = true;
      modal.close();
    });

    renderPhoto();
    renderSportSections();
    if (isNew) nameInput.focus();
  });
}

