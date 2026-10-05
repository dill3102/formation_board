// 呼ばれてから wait ミリ秒、次の呼び出しが無ければ実行する (自動保存用)
// flush() で待たずにすぐ実行、cancel() で取り消し

export function debounce(fn, wait) {
  let timer = null;
  let lastArgs = null;

  function debounced(...args) {
    lastArgs = args;
    clearTimeout(timer);
    timer = setTimeout(run, wait);
  }

  function run() {
    timer = null;
    const args = lastArgs;
    lastArgs = null;
    fn(...args);
  }

  debounced.flush = () => {
    if (timer !== null) {
      clearTimeout(timer);
      run();
    }
  };
  debounced.cancel = () => {
    clearTimeout(timer);
    timer = null;
    lastArgs = null;
  };
  return debounced;
}
