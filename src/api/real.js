const DEFAULT_API_BASE = 'http://localhost:8000';

export function createRealApi(baseUrl = '') {
  const apiBase = normalizeBase(baseUrl || import.meta.env.VITE_API_BASE || DEFAULT_API_BASE);
  const handlers = new Set();
  let socket = null;

  async function request(path, options = {}) {
    const res = await fetch(`${apiBase}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    if (res.status === 204) return null;
    return res.json();
  }

  function emit(message) {
    for (const handler of handlers) {
      try {
        handler(message);
      } catch (err) {
        console.error('[realApi] handler error', err);
      }
    }
  }

  return {
    subscribe(handler) {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },

    async getWatches() {
      return request('/api/watches');
    },

    async createWatch(queryText) {
      return request('/api/watches', {
        method: 'POST',
        body: JSON.stringify({ query_text: queryText }),
      });
    },

    async sendFeedback(candId, label) {
      return request(`/api/candidates/${encodeURIComponent(candId)}/feedback`, {
        method: 'POST',
        body: JSON.stringify({ label }),
      });
    },

    async getCurve() {
      return request('/api/curve');
    },

    async triggerPipeline(candId) {
      return request(`/api/candidates/${encodeURIComponent(candId)}/pipeline`, {
        method: 'POST',
      });
    },

    async injectLiveFire() {
      return request('/api/scout/run', { method: 'POST' });
    },

    start() {
      if (socket && socket.readyState <= 1) return;
      socket = new WebSocket(wsUrl(apiBase, '/ws/feed'));
      socket.addEventListener('message', (event) => emit(JSON.parse(event.data)));
      socket.addEventListener('close', () => {
        socket = null;
      });
    },

    stop() {
      if (socket) socket.close();
      socket = null;
    },
  };
}

function normalizeBase(baseUrl) {
  return baseUrl.replace(/\/$/, '');
}

function wsUrl(baseUrl, path) {
  const url = new URL(path, baseUrl || window.location.origin);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
}
