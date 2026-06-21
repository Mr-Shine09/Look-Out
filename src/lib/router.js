/**
 * Tiny hash-based router. One route = one full-screen page (one purpose).
 *
 * Routes are registered as { key, node, onShow(params) }. The router shows
 * exactly one page at a time and calls its onShow() hook with any params that
 * were passed via navigate(). State is held in-memory (params are not encoded
 * into the URL) so the flow stays simple for the demo.
 */
export function createRouter({ routes, fallback }) {
  const byKey = new Map(routes.map((r) => [r.key, r]));
  let current = null;
  let pendingParams = {};

  function show(key, params = {}) {
    const route = byKey.get(key) || byKey.get(fallback);
    if (!route) return;
    pendingParams = params;
    for (const r of byKey.values()) {
      const visible = r === route;
      r.node.hidden = !visible;
      r.node.classList.toggle('page--active', visible);
    }
    current = route.key;
    route.onShow?.(params);
    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  }

  function navigate(key, params = {}) {
    pendingParams = params;
    if (`#/${key}` === window.location.hash) {
      // Same hash → hashchange won't fire; show directly.
      show(key, params);
    } else {
      window.location.hash = `#/${key}`;
    }
  }

  function onHashChange() {
    const key = (window.location.hash.replace(/^#\//, '') || fallback).split('?')[0];
    show(key, pendingParams);
    pendingParams = {};
  }

  window.addEventListener('hashchange', onHashChange);

  function start() {
    onHashChange();
  }

  return {
    start,
    navigate,
    get current() {
      return current;
    },
  };
}
