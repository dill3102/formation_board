// 配置ボードのツールバー (モード・色・太さ・元に戻す/やり直し/全消去)
// 色と太さは PC では横に並べ、スマホでは ● ボタンで開くパネルにまとめる (components は board.css)
import { h } from '../util/dom.js';
import { WIDTHS, WIDTH_LABELS } from './drawing.js';

export const MODES = [
  { id: 'move', icon: '👆', label: '移動', key: 'v' },
  { id: 'pen', icon: '✏️', label: 'ペン', key: 'p' },
  { id: 'arrow', icon: '➚', label: '矢印', key: 'a' },
  { id: 'eraser', icon: '🧽', label: '消しゴム', key: 'e' },
  { id: 'hand', icon: '✋', label: '手のひら', key: 'h' },
];

/**
 * @param {object} options
 * @param {string[]} options.colors プリセット4色
 * @param {{ mode: string, color: string, width: number }} options.initial
 * @param {(state: { mode: string, color: string, width: number }) => void} options.onChange
 * @param {() => void} options.onUndo
 * @param {() => void} options.onRedo
 * @param {() => void} options.onClear
 */
export function createToolbar({ colors, initial, onChange, onUndo, onRedo, onClear }) {
  const state = { ...initial };

  // ---- モード ----
  const modeButtons = MODES.map((m) => {
    const button = h('button', {
      class: 'tool-button', type: 'button', title: `${m.label} (${m.key.toUpperCase()})`,
      'aria-label': m.label, dataset: { mode: m.id },
    }, h('span', { class: 'tool-icon', 'aria-hidden': 'true' }, m.icon), h('span', { class: 'tool-label' }, m.label));
    button.addEventListener('click', () => setMode(m.id));
    return button;
  });

  // ---- 色 ----
  const swatches = colors.map((color) => {
    const button = h('button', {
      class: 'swatch', type: 'button', style: `--swatch:${color}`, 'aria-label': `色 ${color}`, dataset: { color },
    });
    button.addEventListener('click', () => setStyle({ color }));
    return button;
  });
  const customInput = h('input', { type: 'color', value: colors.includes(state.color) ? '#ff00ff' : state.color });
  const customSwatch = h('label', { class: 'swatch swatch-custom', title: '色を選ぶ' },
    customInput, h('span', { class: 'visually-hidden' }, '色を選ぶ'));
  customInput.addEventListener('input', () => setStyle({ color: customInput.value }));

  // ---- 太さ ----
  const widthButtons = Object.keys(WIDTHS).map(Number).map((width) => {
    const button = h('button', {
      class: 'width-button', type: 'button', 'aria-label': `太さ ${WIDTH_LABELS[width]}`, title: WIDTH_LABELS[width],
      dataset: { width: String(width) },
    }, h('span', { class: 'width-sample', style: `height:${WIDTHS[width]}px` }));
    button.addEventListener('click', () => setStyle({ width }));
    return button;
  });

  // スマホ用: 現在の色・太さを表示して、押すとパネルを開くボタン
  const styleToggle = h('button', { class: 'tool-button style-toggle', type: 'button', 'aria-label': '色と太さ', 'aria-expanded': 'false' },
    h('span', { class: 'style-preview' }));
  const stylePanel = h('div', { class: 'style-panel' },
    h('div', { class: 'swatches', role: 'group', 'aria-label': '色' }, swatches, customSwatch),
    h('div', { class: 'widths', role: 'group', 'aria-label': '太さ' }, widthButtons),
  );
  const styleGroup = h('div', { class: 'tool-group style-group' }, styleToggle, stylePanel);
  styleToggle.addEventListener('click', () => {
    const open = !styleGroup.classList.contains('is-open');
    styleGroup.classList.toggle('is-open', open);
    styleToggle.setAttribute('aria-expanded', String(open));
  });

  // ---- 元に戻す / やり直し / 全消去 ----
  const undoButton = h('button', { class: 'tool-button', type: 'button', 'aria-label': '元に戻す', title: '元に戻す (Ctrl+Z)' }, '↶');
  const redoButton = h('button', { class: 'tool-button', type: 'button', 'aria-label': 'やり直し', title: 'やり直し (Ctrl+Y)' }, '↷');
  const clearButton = h('button', { class: 'tool-button', type: 'button', 'aria-label': '書き込みを全消去', title: '書き込みを全消去' }, '🗑');
  undoButton.addEventListener('click', onUndo);
  redoButton.addEventListener('click', onRedo);
  clearButton.addEventListener('click', onClear);

  const el = h('div', { class: 'board-toolbar', role: 'toolbar', 'aria-label': 'ツール' },
    h('div', { class: 'tool-group', role: 'group', 'aria-label': 'モード' }, modeButtons),
    styleGroup,
    h('div', { class: 'tool-group' }, undoButton, redoButton, clearButton),
  );

  function render() {
    for (const b of modeButtons) b.setAttribute('aria-pressed', String(b.dataset.mode === state.mode));
    const isPreset = colors.includes(state.color);
    for (const s of swatches) s.setAttribute('aria-pressed', String(s.dataset.color === state.color));
    customSwatch.classList.toggle('is-selected', !isPreset);
    if (!isPreset) customInput.value = state.color;
    for (const b of widthButtons) b.setAttribute('aria-pressed', String(Number(b.dataset.width) === state.width));
    styleToggle.style.setProperty('--swatch', state.color);
    styleToggle.querySelector('.style-preview').style.height = `${WIDTHS[state.width]}px`;
  }

  function setMode(mode) {
    state.mode = mode;
    render();
    onChange({ ...state });
  }

  /** 色・太さを変えたら、移動・消しゴム等のモードからペンに切り替える */
  function setStyle(change) {
    Object.assign(state, change);
    if (state.mode !== 'pen' && state.mode !== 'arrow') state.mode = 'pen';
    render();
    onChange({ ...state });
  }

  render();

  return {
    el,
    setMode,
    /** キーボードショートカットのキー → モード */
    modeForKey: (key) => MODES.find((m) => m.key === key.toLowerCase())?.id ?? null,
    setHistoryState(canUndo, canRedo, canClear) {
      undoButton.disabled = !canUndo;
      redoButton.disabled = !canRedo;
      clearButton.disabled = !canClear;
    },
    closePanel() {
      styleGroup.classList.remove('is-open');
      styleToggle.setAttribute('aria-expanded', 'false');
    },
  };
}
