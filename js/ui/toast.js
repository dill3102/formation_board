// 画面下に短いメッセージを出す (「保存しました」等)
import { h } from '../util/dom.js';

/** @param {'info' | 'error'} type */
export function showToast(message, type = 'info', duration = 2500) {
  // モーダルが開いている時は、その中に出さないと背景の下に隠れてしまう
  const host = [...document.querySelectorAll('dialog[open]')].at(-1) ?? document.body;
  let container = host.querySelector(':scope > .toast-container');
  if (!container) {
    container = h('div', { class: 'toast-container', role: 'status', 'aria-live': 'polite' });
    host.append(container);
  }
  const toast = h('div', { class: `toast toast-${type}` }, message);
  container.append(toast);
  setTimeout(() => toast.remove(), duration);
}
