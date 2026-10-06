// 書き込み (ペン・図形・テキスト) の描画と当たり判定
// 点はコート座標で持つ (03_data_design 4.4)。描く時に画面座標へ変換する
// 線の太さ・文字の大きさはコートと一緒に拡大縮小する (100% の時の px × 倍率)
//
// stroke = { id, type, color, width, points, dashed?, text? }
//   type: 'pen'    フリーハンド (点の列)
//         'arrow'  矢印 [始点, 終点]。dashed = true で点線 (ラン)
//         'line'   直線 [始点, 終点]
//         'circle' 円 [中心, 円周上の点]
//         'text'   テキスト [位置 (文字の中心)]、text に文字

/** 太さ 1=細 / 2=中 / 3=太 の 100% 表示での px */
export const WIDTHS = { 1: 2, 2: 4, 3: 7 };

export const WIDTH_LABELS = { 1: '細', 2: '中', 3: '太' };

/** テキストの文字の大きさ (太さ 1/2/3 に対応、100% 表示での px) */
export const TEXT_SIZES = { 1: 14, 2: 18, 3: 26 };

/** 図形ツールの種類 */
export const SHAPES = [
  { id: 'arrow', icon: '➚', label: '矢印 (パス)', key: 'a' },
  { id: 'dashArrow', icon: '⇢', label: '点線矢印 (ラン)', key: 'd' },
  { id: 'line', icon: '╱', label: '直線', key: 'l' },
  { id: 'circle', icon: '◯', label: '円', key: 'o' },
  { id: 'text', icon: 'Ｔ', label: 'テキスト', key: 'x' },
];

/** ペンの点を間引く間隔 (画面 px) */
export const PEN_MIN_DISTANCE = 3;

export function lineWidthPx(width, viewport) {
  return (WIDTHS[width] ?? WIDTHS[2]) * viewport.zoom;
}

export function textSizePx(width, viewport) {
  return (TEXT_SIZES[width] ?? TEXT_SIZES[2]) * viewport.zoom;
}

/** 図形ツールの種類 → 書き込みの type / dashed */
export function shapeToStroke(shape) {
  if (shape === 'dashArrow') return { type: 'arrow', dashed: true };
  return { type: shape, dashed: false };
}

/** 保存用に小数第4位で丸める */
export function roundPoint(p) {
  return [Math.round(p.x * 10000) / 10000, Math.round(p.y * 10000) / 10000];
}

/**
 * @param {CanvasRenderingContext2D} ctx 変換は画面座標 × dpr にしておく
 */
export function drawStrokes(ctx, strokes, viewport) {
  for (const stroke of strokes) drawStroke(ctx, stroke, viewport);
}

export function drawStroke(ctx, stroke, viewport) {
  const points = stroke.points.map(([x, y]) => viewport.courtToScreen(x, y));
  if (points.length === 0) return;
  const lineWidth = lineWidthPx(stroke.width, viewport);
  const first = points[0];
  const last = points[points.length - 1];

  ctx.save();
  ctx.strokeStyle = stroke.color;
  ctx.fillStyle = stroke.color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (stroke.dashed) ctx.setLineDash([lineWidth * 2.5, lineWidth * 2]);

  switch (stroke.type) {
    case 'arrow':
      drawArrow(ctx, first, last, lineWidth);
      break;
    case 'line':
      ctx.beginPath();
      ctx.moveTo(first.x, first.y);
      ctx.lineTo(last.x, last.y);
      ctx.stroke();
      break;
    case 'circle':
      ctx.beginPath();
      ctx.arc(first.x, first.y, Math.hypot(last.x - first.x, last.y - first.y), 0, Math.PI * 2);
      ctx.stroke();
      break;
    case 'text':
      drawText(ctx, first, stroke.text ?? '', textSizePx(stroke.width, viewport), stroke.color);
      break;
    default:
      drawSmoothLine(ctx, points);
  }
  ctx.restore();
}

/** 点と点の中間を通る2次曲線でなめらかにつなぐ */
function drawSmoothLine(ctx, points) {
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  if (points.length === 1) {
    ctx.lineTo(points[0].x + 0.01, points[0].y); // 点 (round cap で丸になる)
  } else {
    for (let i = 1; i < points.length - 1; i++) {
      const mid = { x: (points[i].x + points[i + 1].x) / 2, y: (points[i].y + points[i + 1].y) / 2 };
      ctx.quadraticCurveTo(points[i].x, points[i].y, mid.x, mid.y);
    }
    const last = points[points.length - 1];
    ctx.lineTo(last.x, last.y);
  }
  ctx.stroke();
}

function drawArrow(ctx, from, to, lineWidth) {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  const head = Math.min(length * 0.6, Math.max(10, lineWidth * 3.5));
  // 線は矢じりの手前で止める (太い線の端が矢じりからはみ出さないように)
  const shaftEnd = {
    x: to.x - Math.cos(angle) * head * 0.6,
    y: to.y - Math.sin(angle) * head * 0.6,
  };
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(shaftEnd.x, shaftEnd.y);
  ctx.stroke();

  // 矢じりは点線にしない
  ctx.setLineDash([]);
  const spread = Math.PI / 7;
  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(to.x - Math.cos(angle - spread) * head, to.y - Math.sin(angle - spread) * head);
  ctx.lineTo(to.x - Math.cos(angle + spread) * head, to.y - Math.sin(angle + spread) * head);
  ctx.closePath();
  ctx.fill();
}

/** 文字は縁取りを付けて、どのコートの色でも読めるようにする */
function drawText(ctx, at, text, size, color) {
  ctx.font = `bold ${size}px system-ui, -apple-system, "Hiragino Sans", "Noto Sans JP", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = Math.max(2, size * 0.18);
  ctx.strokeStyle = isLight(color) ? 'rgba(0, 0, 0, 0.7)' : 'rgba(255, 255, 255, 0.85)';
  ctx.strokeText(text, at.x, at.y);
  ctx.fillStyle = color;
  ctx.fillText(text, at.x, at.y);
}

function isLight(hex) {
  const n = parseInt(hex.slice(1), 16);
  if (Number.isNaN(n)) return true;
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return r * 0.299 + g * 0.587 + b * 0.114 > 150;
}

// ---- 当たり判定 (消しゴム・テキストの編集) ----

function distanceToSegment(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** テキストのおおよその範囲 (画面座標)。全角1文字 ≒ 文字の大きさ、半角は半分 */
function textBox(stroke, viewport) {
  const size = textSizePx(stroke.width, viewport);
  const width = [...(stroke.text ?? '')].reduce((sum, ch) => sum + (ch.charCodeAt(0) > 0xff ? size : size * 0.6), 0);
  const center = viewport.courtToScreen(...stroke.points[0]);
  return { left: center.x - width / 2, right: center.x + width / 2, top: center.y - size * 0.6, bottom: center.y + size * 0.6 };
}

/**
 * 画面上の点 (sx, sy) が書き込みに触れているか
 * @param {number} tolerance 線の太さに加えて許す距離 (画面 px)
 */
export function hitStroke(stroke, sx, sy, viewport, tolerance = 8) {
  const p = { x: sx, y: sy };
  if (stroke.type === 'text') {
    const box = textBox(stroke, viewport);
    return sx >= box.left - tolerance && sx <= box.right + tolerance && sy >= box.top - tolerance && sy <= box.bottom + tolerance;
  }
  const limit = lineWidthPx(stroke.width, viewport) / 2 + tolerance;
  const screen = stroke.points.map(([x, y]) => viewport.courtToScreen(x, y));
  if (stroke.type === 'circle') {
    const [center, edge] = [screen[0], screen[screen.length - 1]];
    const radius = Math.hypot(edge.x - center.x, edge.y - center.y);
    return Math.abs(Math.hypot(p.x - center.x, p.y - center.y) - radius) <= limit;
  }
  const points = stroke.type === 'pen' ? screen : [screen[0], screen[screen.length - 1]];
  if (points.length === 1) return Math.hypot(p.x - points[0].x, p.y - points[0].y) <= limit;
  for (let i = 0; i < points.length - 1; i++) {
    if (distanceToSegment(p, points[i], points[i + 1]) <= limit) return true;
  }
  return false;
}
