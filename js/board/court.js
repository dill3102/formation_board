// コートの描画 (canvas)
// ラインはメートル単位で描く。mx = 自ゴールから長辺方向、my = 短辺方向
// スポーツ定義の court.lines でライン描画関数を選ぶ。court.size = [長辺m, 短辺m]

const LINE_COLOR = 'rgba(255, 255, 255, 0.9)';

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} sport スポーツ定義
 * @param {import('./viewport.js').Viewport} viewport
 * @param {number} dpr devicePixelRatio
 */
export function drawCourt(ctx, sport, viewport, dpr) {
  const background = sport.court.background;
  const [L, W] = courtSize(sport);

  // コートの外側 (少し暗い色)
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = shade(background, -0.25);
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  const [a, b, c, d, e, f] = viewport.meterTransform(L, W);
  ctx.setTransform(a * dpr, b * dpr, c * dpr, d * dpr, e * dpr, f * dpr);

  const px = W / viewport.scale; // 画面 1px が何メートルか
  const margin = Math.max(L, W) * 0.04;
  ctx.fillStyle = background;
  ctx.fillRect(-margin, -margin, L + margin * 2, W + margin * 2);

  ctx.strokeStyle = LINE_COLOR;
  ctx.fillStyle = LINE_COLOR;
  ctx.lineWidth = Math.max(1.5 * px, L * 0.0012);
  ctx.lineJoin = 'round';

  (LINES[sport.court.lines] ?? drawGeneric)(ctx, L, W, px, background);
}

export function courtSize(sport) {
  return sport.court.size ?? [sport.court.aspect * 10, 10];
}

// ---- ライン ----

function drawGeneric(ctx, L, W) {
  ctx.strokeRect(0, 0, L, W);
  line(ctx, L / 2, 0, L / 2, W);
}

function drawSoccer(ctx, L, W, px, background) {
  // 芝の縞模様
  const stripes = 12;
  ctx.save();
  ctx.fillStyle = shade(background, 0.06);
  for (let i = 0; i < stripes; i += 2) {
    ctx.fillRect((L / stripes) * i, 0, L / stripes, W);
  }
  ctx.restore();

  const cy = W / 2;
  ctx.strokeRect(0, 0, L, W);
  line(ctx, L / 2, 0, L / 2, W);
  circle(ctx, L / 2, cy, 9.15);
  dot(ctx, L / 2, cy, Math.max(0.25, 2 * px));

  for (const side of [0, 1]) {
    // side 0 = 自陣 (左)、1 = 敵陣 (右)。敵陣は左右反転して同じ形を描く
    const x = (v) => (side === 0 ? v : L - v);
    rect(ctx, x(0), cy - 20.16, x(16.5), cy + 20.16); // ペナルティエリア
    rect(ctx, x(0), cy - 9.16, x(5.5), cy + 9.16); // ゴールエリア
    rect(ctx, x(0), cy - 3.66, x(-2), cy + 3.66); // ゴール
    dot(ctx, x(11), cy, Math.max(0.25, 2 * px)); // ペナルティマーク
    // ペナルティアーク (エリアの外側だけ)
    const angle = Math.acos((16.5 - 11) / 9.15);
    ctx.beginPath();
    if (side === 0) ctx.arc(x(11), cy, 9.15, -angle, angle);
    else ctx.arc(x(11), cy, 9.15, Math.PI - angle, Math.PI + angle);
    ctx.stroke();
    // コーナーアーク
    for (const y of [0, W]) {
      ctx.beginPath();
      const start = side === 0 ? (y === 0 ? 0 : -Math.PI / 2) : (y === 0 ? Math.PI / 2 : Math.PI);
      ctx.arc(x(0), y, 1, start, start + Math.PI / 2);
      ctx.stroke();
    }
  }
}

const LINES = {
  soccer: drawSoccer,
};

// ---- 描画の小道具 ----

function line(ctx, x1, y1, x2, y2) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function rect(ctx, x1, y1, x2, y2) {
  ctx.strokeRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
}

function circle(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
}

function dot(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

/** 色を明るく (amount > 0) / 暗く (amount < 0) する。"#rrggbb" のみ */
export function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const channel = (v) => Math.round(amount >= 0 ? v + (255 - v) * amount : v * (1 + amount));
  const r = channel((n >> 16) & 255);
  const g = channel((n >> 8) & 255);
  const b = channel(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}
