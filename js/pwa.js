// PWA: Service Worker の登録と「ホーム画面に追加 (インストール)」
// Android / PC の Chrome・Edge は beforeinstallprompt でボタンからインストールできる
// iPhone / iPad の Safari はボタンが使えないので、共有メニューからの手順を案内する

let installPrompt = null;
const listeners = new Set();

export function setupPwa() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('[pwa] Service Worker を登録できませんでした', err));
  }
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installPrompt = e;
    listeners.forEach((fn) => fn());
  });
  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    listeners.forEach((fn) => fn());
  });
}

/** インストールボタンを出せるか */
export function canInstall() {
  return installPrompt !== null;
}

export async function install() {
  if (!installPrompt) return false;
  installPrompt.prompt();
  const { outcome } = await installPrompt.userChoice;
  installPrompt = null;
  listeners.forEach((fn) => fn());
  return outcome === 'accepted';
}

/** canInstall が変わった時に呼ばれる。解除する関数を返す */
export function onInstallChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** ホーム画面に追加して起動しているか */
export function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
}

export function isIos() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}
