// 設定 (02_wireframe 5章)
// データの注意書き・使用容量・アプリとして使う (PWA)・マイテンプレートの管理・全データ削除
import { h } from '../util/dom.js';
import { usageBytes, clearAll, LIMIT_BYTES, WARNING_RATIO } from '../storage.js';
import { getSport } from '../sports.js';
import { listPlayers } from '../models/players.js';
import { listBoards } from '../models/boards.js';
import { listMyTemplates, deleteMyTemplate } from '../models/templates.js';
import { datesWithData } from '../models/attendance.js';
import { confirmDialog } from '../ui/modal.js';
import { showToast } from '../ui/toast.js';
import { dataNotice } from '../ui/notice.js';
import { canInstall, install, onInstallChange, isIos, isStandalone } from '../pwa.js';
import { APP_VERSION } from '../version.js';

export function render(root) {
  const usageSection = h('section', { class: 'card' });
  const persistSection = h('div', { class: 'settings-row' });
  const installSection = h('section', { class: 'card' });
  const templateSection = h('section', { class: 'card' });

  function renderUsage() {
    const used = usageBytes();
    const ratio = used / LIMIT_BYTES;
    const players = listPlayers();
    usageSection.replaceChildren(...[
      h('h2', {}, '保存しているデータ'),
      h('div', { class: `usage-bar${ratio >= WARNING_RATIO ? ' is-warning' : ''}`, role: 'meter', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.round(ratio * 100), 'aria-label': '使用容量' },
        h('span', { class: 'usage-fill', style: `width:${Math.min(100, ratio * 100).toFixed(1)}%` })),
      h('p', { class: 'note' }, `使用容量: ${formatBytes(used)} / 約${formatBytes(LIMIT_BYTES)} (${Math.round(ratio * 100)}%)`),
      ratio >= WARNING_RATIO && h('p', { class: 'field-warning' }, '⚠ 容量が少なくなっています。使わない配置や選手の写真を削除してください'),
      h('ul', { class: 'stats' },
        h('li', {}, `選手 ${players.length}人 (写真 ${players.filter((p) => p.hasPhoto).length}枚)`),
        h('li', {}, `配置 ${listBoards().length}件`),
        h('li', {}, `マイテンプレート ${listMyTemplates().length}件`),
        h('li', {}, `出欠を記録した日 ${datesWithData().size}日`),
      ),
      persistSection,
    ].filter(Boolean));
    renderPersist();
  }

  // ブラウザにデータを消さないよう頼む (対応ブラウザのみ。許可されるかはブラウザ次第)
  async function renderPersist() {
    if (!navigator.storage?.persist) {
      persistSection.replaceChildren();
      return;
    }
    const persisted = await navigator.storage.persisted();
    const button = h('button', { class: 'btn btn-small', type: 'button' }, 'データを消えにくくする');
    button.addEventListener('click', async () => {
      const ok = await navigator.storage.persist();
      showToast(ok ? 'ブラウザがデータを消さないよう設定しました' : 'このブラウザでは設定できませんでした (ホーム画面に追加すると消えにくくなります)', ok ? 'info' : 'error', 4000);
      renderPersist();
    });
    persistSection.replaceChildren(persisted
      ? h('p', { class: 'note' }, '✓ ブラウザの容量が足りなくなっても、このサイトのデータは自動では消されません')
      : h('div', {}, button, h('p', { class: 'note' }, 'ブラウザの容量が足りなくなった時に、このサイトのデータを自動で消さないようお願いします')));
  }

  function renderInstall() {
    let body;
    if (isStandalone()) {
      body = h('p', {}, '✓ ホーム画面から起動しています');
    } else if (canInstall()) {
      const button = h('button', { class: 'btn btn-primary', type: 'button' }, 'ホーム画面に追加 (インストール)');
      button.addEventListener('click', async () => {
        if (await install()) showToast('インストールしました');
      });
      body = h('div', {}, button);
    } else if (isIos()) {
      body = h('ol', {},
        h('li', {}, 'Safari で開く'),
        h('li', {}, '画面下の共有ボタン (□↑) を押す'),
        h('li', {}, '「ホーム画面に追加」を選ぶ'),
      );
    } else {
      body = h('p', {}, 'ブラウザのメニューから「アプリをインストール」または「ホーム画面に追加」を選んでください。');
    }
    installSection.replaceChildren(
      h('h2', {}, 'アプリとして使う'),
      h('p', { class: 'note' }, 'ホーム画面に追加すると、アプリのように全画面で開けて、電波が無い所でも使えます。iPhone ではデータも消えにくくなります。'),
      body,
    );
  }

  function renderTemplates() {
    const templates = listMyTemplates();
    templateSection.replaceChildren(
      h('h2', {}, 'マイテンプレート'),
      templates.length === 0
        ? h('p', { class: 'note' }, 'まだありません。配置ボードの ⋮ メニュー「テンプレートとして保存」で作れます')
        : h('ul', { class: 'template-list' }, templates.map((t) => {
          const sport = getSport(t.sportId);
          return h('li', {},
            h('span', { 'aria-hidden': 'true' }, sport?.icon ?? '❓'),
            h('span', { class: 'template-name' }, t.name),
            h('span', { class: 'note' }, `${t.slots.length}人`),
            h('button', {
              class: 'icon-button', type: 'button', 'aria-label': `${t.name} を削除`, title: '削除',
              onclick: async () => {
                if (!(await confirmDialog(`マイテンプレート「${t.name}」を削除しますか?\n(このテンプレートを使った配置はそのまま残ります)`, { okLabel: '削除', danger: true }))) return;
                deleteMyTemplate(t.id);
                showToast('削除しました');
                renderTemplates();
                renderUsage();
              },
            }, '🗑'),
          );
        })),
    );
  }

  async function deleteAll() {
    if (!(await confirmDialog('すべてのデータ (選手・写真・出欠・配置・マイテンプレート・設定) を削除しますか?', { title: '全データを削除', okLabel: '次へ', danger: true }))) return;
    if (!(await confirmDialog('本当に削除しますか?\nこの操作は元に戻せません。', { title: '最終確認', okLabel: 'すべて削除', danger: true }))) return;
    clearAll();
    showToast('すべてのデータを削除しました');
    location.hash = '#/home';
    location.reload();
  }

  root.append(
    h('section', { class: 'card' },
      h('h1', {}, '設定'),
      h('h2', {}, 'データについて'),
      dataNotice(),
    ),
    usageSection,
    installSection,
    templateSection,
    h('section', { class: 'card' },
      h('h2', {}, '全データの削除'),
      h('p', { class: 'note' }, 'この端末のこのブラウザに保存されている、このサイトのデータをすべて削除します。'),
      h('button', { class: 'btn btn-danger', type: 'button', onclick: deleteAll }, '全データを削除'),
    ),
    h('p', { class: 'note version' }, `Formation Board バージョン ${APP_VERSION}`),
  );

  renderUsage();
  renderInstall();
  renderTemplates();
  return onInstallChange(renderInstall);
}

function formatBytes(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  return `${Math.max(0.1, bytes / 1024).toFixed(1)}KB`;
}
