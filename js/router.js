// URL の # 部分で画面を切り替える (例: #/players, #/board/<id>)

const DEFAULT_ROUTE = 'home';

/** "#/board/abc" → { name: "board", params: ["abc"] } */
export function parseHash(hash) {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  const [name = DEFAULT_ROUTE, ...params] = parts;
  return { name, params };
}

/**
 * @param {HTMLElement} root 画面を差し込む要素
 * @param {Record<string, { render: (root: HTMLElement, params: string[]) => (void | (() => void)) }>} views
 */
export function startRouter(root, views) {
  let cleanup = null;

  function show() {
    let { name, params } = parseHash(location.hash);
    if (!views[name]) {
      name = DEFAULT_ROUTE;
      params = [];
      history.replaceState(null, '', `#/${DEFAULT_ROUTE}`);
    }

    if (typeof cleanup === 'function') cleanup();
    root.replaceChildren();
    cleanup = views[name].render(root, params);

    for (const link of document.querySelectorAll('[data-route]')) {
      link.classList.toggle('is-active', link.dataset.route === name);
    }
    root.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }

  window.addEventListener('hashchange', show);
  show();
}
