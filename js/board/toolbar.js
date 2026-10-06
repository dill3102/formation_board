// 配置ボードのツールバー (モード・図形・色・太さ・ボール・元に戻す/やり直し/全消去)
// 色と太さは PC では横に並べ、スマホでは ● ボタンで開くパネルにまとめる (components は board.css)
// 図形 (矢印・点線矢印・直線・円・テキスト) は ▾ で開くパネルから選ぶ
import { h } from '../util/dom.js';
import { WIDTHS, WIDTH_LABELS, SHAPES } from './drawing.js';

export const MODES = [
  { id: 'move', icon: '👆', label: '移動', key: 'v' },
  { id: 'pen', icon: '✏️', label: 'ペン', key: 'p' },
  { id: 'shape', label: '図形' }, // アイコンは選んでいる図形
  { id: 'eraser', icon: '🧽', label: '消しゴム', key: 'e' },
  { id: 'hand', icon: '✋', label: '手のひら', key: 'h' },
];

/**
 * @param {object} options
 * @param {string[]} options.colors プリセット4色
 * @param {{ mode: string, shape: string, color: string, width: number }} options.initial
 * @param {(state: { mode: string, shape: string, color: string, width: number }) => void} options.onChange
 * @param {() => void} options.onUndo
 * @param {() => void} options.onRedo
 * @param {() => void} options.onClear
 * @param {() => void} [options.onToggleBall]
 */
export function createToolbar({ colors, initial, onChange, onUndo, onRedo, onClear, onToggleBall }) {
  const state = { shape: 'arrow', ...initial };
  const shapeOf = (id) => SHAPES.find((s) => s.id === id) ?? SHAPES[0];

  // ---- モード ----
  const shapeIcon = h('span', { class: 'tool-icon', 'aria-hidden': 'true' });
  const shapeLabel = h('span', { class: 'tool-label' });
  const modeButtons = MODES.map((m) => {
    if (m.id === 'shape') {
      const button = h('button', { class: 'tool-button', type: 'button', dataset: { mode: m.id } }, shapeIcon, shapeLabel);
      button.addEventListener('click', () => setMode('shape'));
      return button;
    }
    const button = h('button', {
      class: 'tool-button', type: 'button', title: `${m.label} (${m.key.toUpperCase()})`,
      'aria-label': m.label, dataset: { mode: m.id },
    }, h('span', { class: 'tool-icon', 'aria-hidden': 'true' }, m.icon), h('span', { class: 'tool-label' }, m.label));
    button.addEventListener('click', () => setMode(m.id));
    return button;
  });
  const shapeButton = modeButtons.find((b) => b.dataset.mode === 'shape');

  // ---- 図形の選択 (▾) ----
  const shapeCaret = h('button', { class: 'tool-button tool-caret', type: 'button', 'aria-label': '図形を選ぶ', title: '図形を選ぶ', 'aria-expanded': 'false' }, '▾');
  const shapeChoices = SHAPES.map((s) => {
    const button = h('button', { class: 'shape-choice', type: 'button', dataset: { shape: s.id }, title: `${s.label} (${s.key.toUpperCase()})` },
      h('span', { class: 'shape-choice-icon', 'aria-hidden': 'true' }, s.icon), s.label);
    button.addEventListener('click', () => {
      setShape(s.id);
      closeShapePanel();
    });
    return button;
  });
  const shapePanel = h('div', { class: 'shape-panel', role: 'menu' }, shapeChoices);
  const shapeGroup = h('div', { class: 'shape-group' }, shapeCaret, shapePanel);
  shapeCaret.addEventListener('click', () => {
    const open = !shapeGroup.classList.contains('is-open');
    shapeGroup.classList.toggle('is-open', open);
    shapeCaret.setAttribute('aria-expanded', String(open));
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

  // ---- 太さ (テキストでは文字の大きさ) ----
  const widthButtons = Object.keys(WIDTHS).map(Number).map((width) => {
    const button = h('button', {
      class: 'width-button', type: 'button', 'aria-label': `太さ ${WIDTH_LABELS[width]}`, title: `${WIDTH_LABELS[width]} (テキストは文字の大きさ)`,
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

  // ---- ボール / 元に戻す / やり直し / 全消去 ----
  const undoButton = h('button', { class: 'tool-button', type: 'button', 'aria-label': '元に戻す', title: '元に戻す (Ctrl+Z)' }, '↶');
  const redoButton = h('button', { class: 'tool-button', type: 'button', 'aria-label': 'やり直し', title: 'やり直し (Ctrl+Y)' }, '↷');
  const clearButton = h('button', { class: 'tool-button', type: 'button', 'aria-label': '書き込みを全消去', title: '書き込みを全消去' }, '🗑');
  const ballButton = h('button', {
    class: 'tool-button', type: 'button', 'aria-label': 'ボールを出す / しまう', title: 'ボールを出す / しまう (B)', 'aria-pressed': 'false',
  }, h('span', { class: 'tool-icon', 'aria-hidden': 'true' }, h('span', { class: 'ball-icon' })), h('span', { class: 'tool-label' }, 'ボール'));
  ballButton.addEventListener('click', () => onToggleBall?.());
  undoButton.addEventListener('click', onUndo);
  redoButton.addEventListener('click', onRedo);
  clearButton.addEventListener('click', onClear);

  const el = h('div', { class: 'board-toolbar', role: 'toolbar', 'aria-label': 'ツール' },
    h('div', { class: 'tool-group', role: 'group', 'aria-label': 'モード' }, modeButtons),
    styleGroup,
    h('div', { class: 'tool-group' }, ballButton, undoButton, redoButton, clearButton),
  );
  // 図形ボタンの右に ▾ を置く
  shapeButton.after(shapeGroup);

  function render() {
    for (const b of modeButtons) b.setAttribute('aria-pressed', String(b.dataset.mode === state.mode));
    const shape = shapeOf(state.shape);
    shapeIcon.textContent = shape.icon;
    shapeLabel.textContent = shape.label.replace(/ \(.*\)$/, '');
    shapeButton.title = `${shape.label} (${shape.key.toUpperCase()})`;
    shapeButton.setAttribute('aria-label', `図形: ${shape.label}`);
    for (const c of shapeChoices) c.setAttribute('aria-pressed', String(c.dataset.shape === state.shape));
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

  function setShape(shape) {
    state.shape = shape;
    state.mode = 'shape';
    render();
    onChange({ ...state });
  }

  /** 色・太さを変えたら、移動・消しゴム等のモードからペンに切り替える */
  function setStyle(change) {
    Object.assign(state, change);
    if (state.mode !== 'pen' && state.mode !== 'shape') state.mode = 'pen';
    render();
    onChange({ ...state });
  }

  function closeShapePanel() {
    shapeGroup.classList.remove('is-open');
    shapeCaret.setAttribute('aria-expanded', 'false');
  }

  function closeStylePanel() {
    styleGroup.classList.remove('is-open');
    styleToggle.setAttribute('aria-expanded', 'false');
  }

  render();

  return {
    el,
    setMode,
    /** キーボードショートカット (モード・図形)。処理したら true */
    handleKey(key) {
      const k = key.toLowerCase();
      const mode = MODES.find((m) => m.key === k);
      if (mode) {
        setMode(mode.id);
        return true;
      }
      const shape = SHAPES.find((s) => s.key === k);
      if (shape) {
        setShape(shape.id);
        return true;
      }
      return false;
    },
    setBallState(on) {
      ballButton.setAttribute('aria-pressed', String(on));
    },
    setHistoryState(canUndo, canRedo, canClear) {
      undoButton.disabled = !canUndo;
      redoButton.disabled = !canRedo;
      clearButton.disabled = !canClear;
    },
    /** パネルの外を触ったら閉じる */
    closePanelsOutside(target) {
      if (!target.closest?.('.style-group')) closeStylePanel();
      if (!target.closest?.('.shape-group')) closeShapePanel();
    },
    closePanel() {
      closeStylePanel();
      closeShapePanel();
    },
  };
}
