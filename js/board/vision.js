// 目線 (ライト) の表示: 選手・敵マーカーの向いている方へ、扇形の光を描く
// 向きは度 (コートの実寸で測る。0 = 相手ゴールの方向、90 = 相手ゴールを向いて右)。frames.js の目線を参照
// 光の長さもコートの実寸 (メートル) で決めるので、回転・反転・拡大しても形が変わらない

/** 光の広がり (度) */
export const VISION_SPREAD = 70;

/** 光の長さ (メートル): コートの長さの 16% (最低 3m)。サッカー 約17m / バスケ 約4.5m */
export function visionLength(courtLength) {
  return Math.max(3, courtLength * 0.16);
}

const COLORS = {
  home: [255, 236, 140], // 黄色っぽい光
  away: [255, 130, 120], // 赤っぽい光
};

/** (x, y) から deg の方向へ meters 進んだ所 (コート座標) */
export function facingPoint(x, y, deg, meters, [L, W]) {
  const rad = (deg * Math.PI) / 180;
  return { x: x + (Math.cos(rad) * meters) / L, y: y + (Math.sin(rad) * meters) / W };
}

/** from から to への向き (度、コート座標の2点) */
export function angleBetween(from, to, [L, W]) {
  const deg = (Math.atan2((to.y - from.y) * W, (to.x - from.x) * L) * 180) / Math.PI;
  return ((Math.round(deg) % 360) + 360) % 360;
}

/**
 * @param {CanvasRenderingContext2D} ctx 変換は画面座標 × dpr にしておく
 * @param {{ x: number, y: number, deg: number, away: boolean, selected?: boolean }[]} cones
 * @param {import('./viewport.js').Viewport} viewport
 * @param {[number, number]} size コートの [長さ, 幅] (メートル)
 */
export function drawVision(ctx, cones, viewport, size) {
  const meters = visionLength(size[0]);
  const half = (VISION_SPREAD / 2) * (Math.PI / 180);
  for (const cone of cones) {
    const c = viewport.courtToScreen(cone.x, cone.y);
    const tip = facingPoint(cone.x, cone.y, cone.deg, meters, size);
    const t = viewport.courtToScreen(tip.x, tip.y);
    const radius = Math.hypot(t.x - c.x, t.y - c.y);
    if (radius < 1) continue;
    const angle = Math.atan2(t.y - c.y, t.x - c.x);
    const [r, g, b] = cone.away ? COLORS.away : COLORS.home;
    const alpha = cone.selected ? 0.75 : 0.55;

    ctx.save();
    const gradient = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, radius);
    gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${alpha})`);
    gradient.addColorStop(0.6, `rgba(${r}, ${g}, ${b}, ${alpha * 0.45})`);
    gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(c.x, c.y);
    ctx.arc(c.x, c.y, radius, angle - half, angle + half);
    ctx.closePath();
    ctx.fill();
    // 真ん中に細い線 (向きがひと目で分かるように)
    ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
    ctx.lineWidth = cone.selected ? 2 : 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(c.x, c.y);
    ctx.lineTo(c.x + Math.cos(angle) * radius * 0.75, c.y + Math.sin(angle) * radius * 0.75);
    ctx.stroke();
    ctx.restore();
  }
}

/** 向きを変えるつまみの位置 (画面座標): 光の向きに、駒から少し離れた所 */
export function handlePosition(cone, viewport, size, { min = 46, max = 110 } = {}) {
  const c = viewport.courtToScreen(cone.x, cone.y);
  const tip = facingPoint(cone.x, cone.y, cone.deg, visionLength(size[0]), size);
  const t = viewport.courtToScreen(tip.x, tip.y);
  const radius = Math.hypot(t.x - c.x, t.y - c.y);
  const angle = Math.atan2(t.y - c.y, t.x - c.x);
  const d = Math.min(max, Math.max(min, radius * 0.8));
  return { x: c.x + Math.cos(angle) * d, y: c.y + Math.sin(angle) * d };
}
