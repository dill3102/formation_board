// 起動処理: データ準備 → スポーツ定義読み込み → 画面表示 → 初回の注意書き
import * as storage from './storage.js';
import { loadSports } from './sports.js';
import { startRouter } from './router.js';
import { setupPwa } from './pwa.js';
import { showFirstRunNotice } from './ui/notice.js';
import { showToast } from './ui/toast.js';
import * as home from './views/home.js';
import * as players from './views/players.js';
import * as attendance from './views/attendance.js';
import * as board from './views/board.js';
import * as settings from './views/settings.js';
import * as help from './views/help.js';

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
  startRouter(root, { home, players, attendance, board, settings, help });
  showFirstRunNotice();
  if (storage.usageBytes() >= storage.LIMIT_BYTES * storage.WARNING_RATIO) {
    showToast('保存容量が少なくなっています。設定画面で確認してください', 'error', 5000);
  }
}

setupPwa();

main();
