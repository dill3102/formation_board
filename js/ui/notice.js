// データの保存についての注意書き (初回表示と設定画面で共通)
import { h } from '../util/dom.js';
import * as storage from '../storage.js';
import { KEYS } from '../storage.js';
import { openModal } from './modal.js';
import { isIos, isStandalone } from '../pwa.js';

/** 注意書きの本文 */
export function dataNotice() {
  return h('div', { class: 'notice' },
    h('p', {}, 'データ (選手・写真・出欠・配置) は、この端末のこのブラウザの中にだけ保存されます。サーバーには送られません。'),
    h('ul', {},
      h('li', {}, 'ブラウザの履歴・サイトデータを消すと、データも消えます'),
      h('li', {}, '別の端末・別のブラウザ・機種変更では引き継がれません'),
      h('li', {}, 'プライベートブラウズ (シークレットモード) では、閉じると消えます'),
      isIos() && !isStandalone() &&
        h('li', {}, h('strong', {}, 'iPhone / iPad: '), 'しばらく (7日ほど) 開かないとデータが消されることがあります。共有ボタン (□↑) →「ホーム画面に追加」で使うと消えにくくなります'),
    ),
  );
}

/** 初めて開いた時に1回だけ注意書きを出す */
export function showFirstRunNotice() {
  const meta = storage.read(KEYS.meta, {});
  if (meta.noticeShown) return;
  const ok = h('button', { class: 'btn btn-primary', type: 'button' }, 'わかりました');
  const modal = openModal({
    title: 'Formation Board へようこそ',
    body: h('div', {},
      h('p', {}, '選手を登録して、試合・練習ごとの配置と作戦をホワイトボード感覚で作れます。'),
      h('h3', { class: 'notice-heading' }, 'データの保存について'),
      dataNotice(),
      h('p', { class: 'note' }, 'この内容は「設定」画面でいつでも確認できます。'),
    ),
    footer: [ok],
    onClose: () => storage.write(KEYS.meta, { ...storage.read(KEYS.meta, {}), noticeShown: true }),
  });
  ok.addEventListener('click', () => modal.close());
  ok.focus();
}
