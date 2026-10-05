// モーダル (<dialog> を使う)。スマホでは全画面表示 (components.css)
import { h } from '../util/dom.js';

/**
 * @param {object} options
 * @param {string} options.title
 * @param {Node} options.body
 * @param {Node[]} [options.footer] 下部のボタン
 * @param {boolean} [options.fullscreenOnMobile]
 * @param {() => void} [options.onClose]
 */
export function openModal({ title, body, footer = [], fullscreenOnMobile = false, onClose }) {
  const closeButton = h('button', { class: 'modal-close', type: 'button', 'aria-label': '閉じる' }, '✕');
  const dialog = h('dialog', { class: fullscreenOnMobile ? 'modal modal-full' : 'modal' },
    h('header', { class: 'modal-header' }, h('h2', {}, title), closeButton),
    h('div', { class: 'modal-body' }, body),
    footer.length > 0 && h('footer', { class: 'modal-footer' }, footer),
  );

  let closed = false;
  // 後片付け。close() と Esc キー (close イベント) のどちらから呼ばれても1回だけ実行
  function finish() {
    if (closed) return;
    closed = true;
    dialog.remove();
    onClose?.();
  }

  function close() {
    if (dialog.open) dialog.close();
    finish();
  }

  closeButton.addEventListener('click', close);
  // 背景 (dialog の外側) をクリックしたら閉じる
  // 中で押して外で離した場合 (文字選択など) は閉じない
  let downOnBackdrop = false;
  dialog.addEventListener('pointerdown', (e) => { downOnBackdrop = e.target === dialog; });
  dialog.addEventListener('click', (e) => {
    if (downOnBackdrop && e.target === dialog) close();
  });
  dialog.addEventListener('close', finish);

  document.body.append(dialog);
  dialog.showModal();
  return { dialog, close };
}

/** 確認ダイアログ。OK なら true */
export function confirmDialog(message, { title = '確認', okLabel = 'OK', danger = false } = {}) {
  return new Promise((resolve) => {
    let result = false;
    const ok = h('button', { class: danger ? 'btn btn-danger-fill' : 'btn btn-primary', type: 'button' }, okLabel);
    const cancel = h('button', { class: 'btn', type: 'button' }, 'キャンセル');
    const body = h('div', {}, message.split('\n').map((line) => h('p', {}, line)));
    const modal = openModal({ title, body, footer: [cancel, ok], onClose: () => resolve(result) });
    ok.addEventListener('click', () => { result = true; modal.close(); });
    cancel.addEventListener('click', () => modal.close());
    cancel.focus();
  });
}
