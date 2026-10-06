// 表示範囲 (ズーム・パン・縦横回転) とコート座標 ⇔ 画面座標の変換
// 座標の計算はすべてここに集める (04_implementation_plan 2章)
//
// 3つの座標系
//   コート座標: x = 自ゴール 0 → 敵ゴール 1、y = 0 → 1 (03_data_design 2章)。保存するのはこれ
//   ワールド座標: コートの短辺 = 1。横長表示なら 幅 aspect × 高さ 1、縦長表示なら 幅 1 × 高さ aspect
//   画面座標: ステージ (コート表示エリア) 左上からの CSS px
// 縦長表示では 自陣 = 下、敵陣 = 上 になるよう 90度回転する

export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 4;
const PADDING = 24; // 全体表示の時のコート周りの余白 (px)

export class Viewport {
  /** @param {number} aspect コートの長辺 / 短辺 */
  constructor(aspect) {
    this.aspect = aspect;
    this.width = 0;
    this.height = 0;
    this.portrait = false;
    /** 'auto' = 画面の形で決める / 'landscape' = 横長 (自陣が左) / 'portrait' = 縦長 (自陣が手前=下) */
    this.orientation = 'auto';
    this.fitScale = 1; // 全体表示の時の scale (= 100%)
    this.scale = 1; // ワールド 1 あたりの px
    this.offsetX = 0;
    this.offsetY = 0;
  }

  get worldWidth() { return this.portrait ? 1 : this.aspect; }
  get worldHeight() { return this.portrait ? this.aspect : 1; }
  get zoom() { return this.scale / this.fitScale; }

  /** 向きを指定する (回転ボタン)。変わったら全体表示にし直す */
  setOrientation(orientation) {
    this.orientation = orientation;
    if (this.width > 0 && this.height > 0) this.resize(this.width, this.height);
  }

  /**
   * ステージの大きさが変わった時に呼ぶ。縦長/横長は orientation (auto なら画面の形) で決める
   * @returns {boolean} 向き (縦長/横長) が変わったら true
   */
  resize(width, height) {
    const first = this.width === 0 || this.height === 0;
    const portrait = this.orientation === 'auto' ? height > width : this.orientation === 'portrait';
    const orientationChanged = !first && portrait !== this.portrait;
    const center = first ? null : this.screenToWorld(this.width / 2, this.height / 2);
    const zoom = this.zoom;

    this.width = width;
    this.height = height;
    this.portrait = portrait;
    this.fitScale = Math.max(0.0001, Math.min(
      (width - PADDING * 2) / this.worldWidth,
      (height - PADDING * 2) / this.worldHeight,
    ));

    if (first || orientationChanged) {
      this.fit();
    } else {
      // 倍率と画面中央に見えている場所はそのまま
      this.scale = this.fitScale * zoom;
      this.offsetX = width / 2 - center.x * this.scale;
      this.offsetY = height / 2 - center.y * this.scale;
      this.clamp();
    }
    return orientationChanged;
  }

  /** 全体表示 (100%・コートを中央に) */
  fit() {
    this.scale = this.fitScale;
    this.offsetX = (this.width - this.worldWidth * this.scale) / 2;
    this.offsetY = (this.height - this.worldHeight * this.scale) / 2;
  }

  /** 画面上の (sx, sy) の位置を動かさずに倍率を変える。省略時は画面中央 */
  setZoom(zoom, sx = this.width / 2, sy = this.height / 2) {
    const anchor = this.screenToWorld(sx, sy);
    this.scale = this.fitScale * Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
    this.offsetX = sx - anchor.x * this.scale;
    this.offsetY = sy - anchor.y * this.scale;
    this.clamp();
  }

  zoomBy(factor, sx, sy) {
    this.setZoom(this.zoom * factor, sx, sy);
  }

  panBy(dx, dy) {
    this.offsetX += dx;
    this.offsetY += dy;
    this.clamp();
  }

  /** コートが画面の外に行き過ぎないよう制限 (画面中央に必ずコートのどこかがある = 端は画面中央まで) */
  clamp() {
    const w = this.worldWidth * this.scale;
    const h = this.worldHeight * this.scale;
    const cx = this.width / 2;
    const cy = this.height / 2;
    this.offsetX = Math.min(cx, Math.max(cx - w, this.offsetX));
    this.offsetY = Math.min(cy, Math.max(cy - h, this.offsetY));
  }

  // ---- 座標変換 ----

  worldToScreen(wx, wy) {
    return { x: wx * this.scale + this.offsetX, y: wy * this.scale + this.offsetY };
  }

  screenToWorld(sx, sy) {
    return { x: (sx - this.offsetX) / this.scale, y: (sy - this.offsetY) / this.scale };
  }

  courtToWorld(x, y) {
    return this.portrait
      ? { x: y, y: (1 - x) * this.aspect }
      : { x: x * this.aspect, y };
  }

  worldToCourt(wx, wy) {
    return this.portrait
      ? { x: 1 - wy / this.aspect, y: wx }
      : { x: wx / this.aspect, y: wy };
  }

  courtToScreen(x, y) {
    const w = this.courtToWorld(x, y);
    return this.worldToScreen(w.x, w.y);
  }

  screenToCourt(sx, sy) {
    const w = this.screenToWorld(sx, sy);
    return this.worldToCourt(w.x, w.y);
  }

  /**
   * コートをメートル単位で描くための canvas 変換行列 [a, b, c, d, e, f]
   * メートル座標: mx = 自ゴールから 0〜lengthM、my = 0〜widthM
   */
  meterTransform(lengthM, widthM) {
    const k = this.scale / widthM;
    return this.portrait
      ? [0, -k, k, 0, this.offsetX, this.offsetY + k * lengthM]
      : [k, 0, 0, k, this.offsetX, this.offsetY];
  }
}
