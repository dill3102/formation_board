// コマ送りの再生 (配置ボードと共有の見るだけ画面で共通)
// コマ i → i+1 の間を、駒の位置を少しずつ動かして見せる
import { positionsAt, facingAt, frameCount, interpolate, interpolateFacing } from './frames.js';

export const SPEEDS = [
  { id: 'slow', label: 'ゆっくり', ms: 1600 },
  { id: 'normal', label: 'ふつう', ms: 1000 },
  { id: 'fast', label: 'はやい', ms: 550 },
];
const PAUSE_MS = 250; // コマとコマの間の止まる時間

/** コマのキー ("b" = ボール) → 駒の ID ("b:ball") */
export const pieceIdOf = (key) => (key === 'b' ? 'b:ball' : key);
/** 駒の ID → コマのキー */
export const frameKeyOf = (pieceId) => (pieceId === 'b:ball' ? 'b' : pieceId);

// requestAnimationFrame が止まっている時 (タブが裏など) も進むよう setTimeout も併用
function nextTick(fn) {
  let done = false;
  const run = () => {
    if (done) return;
    done = true;
    fn();
  };
  requestAnimationFrame(run);
  setTimeout(run, 40);
}

/**
 * @param {object} options
 * @param {() => object} options.getBoard 再生する配置 (home / away / ball / steps)
 * @param {(positions: Record<string, [number, number]>, facing: Record<string, number>) => void} options.apply 駒を動かす (facing = 目線)
 * @param {(index: number) => void} options.onFrame コマが変わった時
 * @param {(playing: boolean) => void} options.onStateChange 再生 / 停止が変わった時
 * @param {() => number} options.getSpeedMs
 */
export function createPlayback({ getBoard, apply, onFrame, onStateChange, getSpeedMs }) {
  let token = 0;
  let playing = false;

  function setPlaying(value) {
    playing = value;
    onStateChange(value);
  }

  const stateAt = (board, index) => ({ positions: positionsAt(board, index), facing: facingAt(board, index) });

  function animate(from, to, ms, myToken) {
    return new Promise((resolve) => {
      const start = performance.now();
      const step = () => {
        if (myToken !== token) return resolve(false);
        const t = Math.min(1, (performance.now() - start) / ms);
        apply(interpolate(from.positions, to.positions, t), interpolateFacing(from.facing, to.facing, t));
        if (t < 1) nextTick(step);
        else setTimeout(() => resolve(myToken === token), PAUSE_MS);
      };
      nextTick(step);
    });
  }

  return {
    get playing() { return playing; },

    /** current から最後まで再生 (最後のコマにいる時は最初から) */
    async play(current) {
      const board = getBoard();
      const count = frameCount(board);
      if (count < 2) return false;
      const myToken = ++token;
      setPlaying(true);
      let index = current >= count - 1 ? 0 : current;
      if (index !== current) {
        onFrame(index);
        const state = stateAt(board, index);
        apply(state.positions, state.facing);
        await new Promise((r) => setTimeout(r, PAUSE_MS));
      }
      while (index < count - 1) {
        const ok = await animate(stateAt(board, index), stateAt(board, index + 1), getSpeedMs(), myToken);
        if (!ok) return false;
        index++;
        onFrame(index);
      }
      if (myToken === token) setPlaying(false);
      return true;
    },

    stop() {
      if (!playing) return;
      token++;
      setPlaying(false);
    },
  };
}
