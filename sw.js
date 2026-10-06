// Service Worker: オフラインでも開けるようにする
// 方針: ネットワーク優先 → 取れなければキャッシュ
//   オンラインの時は常に最新のファイルを使う (更新がすぐ反映される)
//   ブラウザの HTTP キャッシュも毎回サーバーに確認させる (no-cache)。古いファイルと新しいファイルが混ざって動かなくなるのを防ぐ
//   取れたファイルはキャッシュに入れておき、オフラインの時はそれを返す
// 起動に必要なファイルはインストール時に先にキャッシュする
// ※ ファイルを増やしたら PRECACHE に足す。キャッシュの作り直しが必要な時は VERSION を上げる

const VERSION = 'v2';
const CACHE = `formation-board-${VERSION}`;

const PRECACHE = [
  './',
  './index.html',
  './manifest.json',
  './css/base.css',
  './css/layout.css',
  './css/components.css',
  './css/board.css',
  './js/main.js',
  './js/router.js',
  './js/storage.js',
  './js/sports.js',
  './js/version.js',
  './js/pwa.js',
  './js/models/players.js',
  './js/models/attendance.js',
  './js/models/boards.js',
  './js/models/templates.js',
  './js/views/home.js',
  './js/views/players.js',
  './js/views/player-edit.js',
  './js/views/player-bulk-add.js',
  './js/views/attendance.js',
  './js/views/board.js',
  './js/views/settings.js',
  './js/views/help.js',
  './js/views/view.js',
  './js/share.js',
  './js/board/viewport.js',
  './js/board/court.js',
  './js/board/pieces.js',
  './js/board/input.js',
  './js/board/formation.js',
  './js/board/lineup.js',
  './js/board/frames.js',
  './js/board/playback.js',
  './js/board/drawing.js',
  './js/board/history.js',
  './js/board/toolbar.js',
  './js/board/detail-card.js',
  './js/board/drag-ghost.js',
  './js/ui/modal.js',
  './js/ui/toast.js',
  './js/ui/avatar.js',
  './js/ui/calendar.js',
  './js/ui/photo-cropper.js',
  './js/ui/notice.js',
  './js/util/dom.js',
  './js/util/id.js',
  './js/util/date.js',
  './js/util/debounce.js',
  './data/sports/soccer.json',
  './data/sports/futsal.json',
  './data/sports/basketball.json',
  './data/sports/volleyball.json',
  './assets/app-icon/icon-192.png',
  './assets/app-icon/icon-512.png',
  './assets/app-icon/apple-touch-icon.png',
  './assets/app-icon/favicon-32.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  // 古いバージョンのキャッシュを消す
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('formation-board-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(
    fetch(request, { cache: 'no-cache' })
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request, { ignoreSearch: true });
        if (cached) return cached;
        // 画面遷移 (HTML) はトップページを返す (# で画面を切り替えるので index.html で足りる)
        if (request.mode === 'navigate') return caches.match('./index.html');
        return Response.error();
      }),
  );
});
