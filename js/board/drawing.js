// 書き込み (ペン・矢印) の描画と当たり判定
// 点はコート座標で持つ (03_data_design 4.4)。描く時に画面座標へ変換する
// 線の太さはコートと一緒に拡大縮小する (100% の時の px × 倍率)

/** 太さ 1=細 / 2=中 / 3=太 の 100% 表示での px */
export const WIDTHS = { 1: 2, 2: 4, 3: 7 };

export const WIDTH_LABELS = { 1: '細', 2: '中', 3: '太' };

/** ペンの点を間引く間隔 (画面 px) */
export const PEN_MIN_DISTANCE = 3;

export function lineWidthPx(width, viewport) {
  return (WIDTHS[width] ?? WIDTHS[2]) * viewport.zoom;
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

  ctx.save();
  ctx.strokeStyle = stroke.color;
  ctx.fillStyle = stroke.color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (stroke.type === 'arrow') {
    drawArrow(ctx, points[0], points[points.length - 1], lineWidth);
  } else {
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

  const spread = Math.PI / 7;
  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(to.x - Math.cos(angle - spread) * head, to.y - Math.sin(angle - spread) * head);
  ctx.lineTo(to.x - Math.cos(angle + spread) * head, to.y - Math.sin(angle + spread) * head);
  ctx.closePath();
  ctx.fill();
}

// ---- 当たり判定 (消しゴム) ----

function distanceToSegment(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/**
 * 画面上の点 (sx, sy) が書き込みに触れているか
 * @param {number} tolerance 線の太さに加えて許す距離 (画面 px)
 */
export function hitStroke(stroke, sx, sy, viewport, tolerance = 8) {
  const points = stroke.type === 'arrow'
    ? [stroke.points[0], stroke.points[stroke.points.length - 1]]
    : stroke.points;
  const screen = points.map(([x, y]) => viewport.courtToScreen(x, y));
  const limit = lineWidthPx(stroke.width, viewport) / 2 + tolerance;
  const p = { x: sx, y: sy };
  if (screen.length === 1) return Math.hypot(p.x - screen[0].x, p.y - screen[0].y) <= limit;
  for (let i = 0; i < screen.length - 1; i++) {
    if (distanceToSegment(p, screen[i], screen[i + 1]) <= limit) return true;
  }
  return false;
}
