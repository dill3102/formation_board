// 写真を正方形に切り抜いて 128px の JPEG (data URL) にする
// ドラッグで位置、スライダー / ホイールで拡大率を調整
import { h } from '../util/dom.js';
import { openModal } from './modal.js';

const OUTPUT_SIZE = 128;
const OUTPUT_QUALITY = 0.85;
const VIEW_SIZE = 240; // 切り抜き枠の表示サイズ (CSS px)
const MAX_ZOOM = 4;

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('画像を読み込めませんでした'));
    img.src = url;
  });
}

/**
 * @param {File} file
 * @returns {Promise<string | null>} 切り抜いた写真の data URL。キャンセルなら null
 */
export async function cropPhoto(file) {
  const img = await loadImage(file);
  URL.revokeObjectURL(img.src);

  // 枠いっぱいに収まる拡大率 (短い辺を枠に合わせる) を 1倍とする
  const baseScale = VIEW_SIZE / Math.min(img.naturalWidth, img.naturalHeight);
  const state = { zoom: 1, x: 0, y: 0 }; // x, y = 画像中心の枠中心からのずれ (表示 px)

  const dpr = window.devicePixelRatio || 1;
  const canvas = h('canvas', {
    class: 'cropper-canvas',
    width: VIEW_SIZE * dpr,
    height: VIEW_SIZE * dpr,
    style: `width:${VIEW_SIZE}px;height:${VIEW_SIZE}px`,
  });
  const ctx = canvas.getContext('2d');
  const slider = h('input', {
    type: 'range', min: 1, max: MAX_ZOOM, step: 0.01, value: 1, 'aria-label': '拡大率',
  });

  function clamp() {
    // 枠の中に余白ができないように位置を制限
    const scale = baseScale * state.zoom;
    const maxX = Math.max(0, (img.naturalWidth * scale - VIEW_SIZE) / 2);
    const maxY = Math.max(0, (img.naturalHeight * scale - VIEW_SIZE) / 2);
    state.x = Math.min(maxX, Math.max(-maxX, state.x));
    state.y = Math.min(maxY, Math.max(-maxY, state.y));
  }

  function drawTo(context, size) {
    const ratio = size / VIEW_SIZE;
    const scale = baseScale * state.zoom * ratio;
    const w = img.naturalWidth * scale;
    const hgt = img.naturalHeight * scale;
    context.fillStyle = '#fff';
    context.fillRect(0, 0, size, size);
    context.drawImage(img, size / 2 + state.x * ratio - w / 2, size / 2 + state.y * ratio - hgt / 2, w, hgt);
  }

  function draw() {
    clamp();
    drawTo(ctx, canvas.width);
  }

  function setZoom(zoom) {
    state.zoom = Math.min(MAX_ZOOM, Math.max(1, zoom));
    slider.value = String(state.zoom);
    draw();
  }

  // ドラッグで移動
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag || drag.id !== e.pointerId) return;
    state.x += e.clientX - drag.x;
    state.y += e.clientY - drag.y;
    drag.x = e.clientX;
    drag.y = e.clientY;
    draw();
  });
  const endDrag = () => { drag = null; };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    setZoom(state.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1));
  }, { passive: false });
  slider.addEventListener('input', () => setZoom(Number(slider.value)));

  return new Promise((resolve) => {
    let result = null;
    const ok = h('button', { class: 'btn btn-primary', type: 'button' }, 'この範囲で決定');
    const cancel = h('button', { class: 'btn', type: 'button' }, 'キャンセル');
    const modal = openModal({
      title: '写真の切り抜き',
      body: h('div', { class: 'cropper' },
        h('div', { class: 'cropper-frame' }, canvas),
        h('label', { class: 'cropper-zoom' }, h('span', {}, '拡大'), slider),
        h('p', { class: 'note' }, 'ドラッグで位置を調整できます'),
      ),
      footer: [cancel, ok],
      onClose: () => resolve(result),
    });
    ok.addEventListener('click', () => {
      const out = h('canvas', { width: OUTPUT_SIZE, height: OUTPUT_SIZE });
      drawTo(out.getContext('2d'), OUTPUT_SIZE);
      result = out.toDataURL('image/jpeg', OUTPUT_QUALITY);
      modal.close();
    });
    cancel.addEventListener('click', () => modal.close());
    draw();
  });
}
