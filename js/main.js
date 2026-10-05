// 起動処理: データ準備 → スポーツ定義読み込み → 画面表示
import * as storage from './storage.js';
import { loadSports } from './sports.js';
import { startRouter } from './router.js';
import * as home from './views/home.js';
import * as players from './views/players.js';
import * as attendance from './views/attendance.js';
import * as board from './views/board.js';
import * as settings from './views/settings.js';

async function main() {
  const root = document.getElementById('view');
  try {
    storage.init();
    await loadSports();
  } catch (err) {
    console.error(err);
    root.innerHTML = '<div class="card"><h1>読み込みに失敗しました</h1><p>ページを再読み込みしてください。</p></div>';
    return;
  }
  startRouter(root, { home, players, attendance, board, settings });
}

main();
