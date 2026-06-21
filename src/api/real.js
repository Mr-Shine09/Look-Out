const DEFAULT_API_BASE = 'http://localhost:8000';

export function createRealApi(baseUrl = '') {
  const apiBase = normalizeBase(baseUrl || import.meta.env.VITE_API_BASE || DEFAULT_API_BASE);
  const handlers = new Set();
  let socket = null;

  async function request(path, options = {}) {
    const res = await fetch(`${apiBase}${path}`, {
      ...options,
      headers: {
        Accept: 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {}),
      },
    });
    const data = await readResponse(res);
    if (!res.ok) throw new Error(errorMessage(res, data));
    return data;
  }

  function emit(rawMessage) {
    const message = normalizeFeedMessage(rawMessage);
    if (!message) return;
    for (const handler of handlers) {
      try {
        handler(message);
      } catch (err) {
        console.error('[realApi] handler error', err);
      }
    }
  }

  function ensureSocket() {
    if (socket && (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN)) return socket;
    socket = new WebSocket(wsUrl(apiBase, '/ws/feed'));
    socket.addEventListener('message', (event) => {
      try {
        emit(JSON.parse(event.data));
      } catch (err) {
        console.error('[realApi] invalid feed message', err);
      }
    });
    socket.addEventListener('error', (err) => {
      console.error('[realApi] websocket error', err);
    });
    socket.addEventListener('close', () => {
      socket = null;
    });
    return socket;
  }

  return {
    subscribe(handler) {
      handlers.add(handler);
      ensureSocket();
      return () => handlers.delete(handler);
    },

    async getWatches() {
      return asArray(await request('/api/watches')).map(normalizeWatch);
    },

    async createWatch(queryText) {
      return normalizeCreateWatch(await request('/api/watches', {
        method: 'POST',
        body: JSON.stringify({ query_text: queryText }),
      }));
    },

    async sendFeedback(candId, label, watchId) {
      return request(`/api/candidates/${encodeURIComponent(candId)}/feedback`, {
        method: 'POST',
        body: JSON.stringify(watchId ? { label, watch_id: watchId } : { label }),
      });
    },

    async getCandidates(watchId) {
      const qs = watchId ? `?watch_id=${encodeURIComponent(watchId)}` : '';
      return asArray(await request(`/api/candidates${qs}`)).map(normalizeCandidate);
    },

    async getCurve() {
      return asArray(await request('/api/curve')).map(normalizeCurvePoint);
    },

    async triggerPipeline(candId) {
      return request(`/api/candidates/${encodeURIComponent(candId)}/pipeline`, {
        method: 'POST',
      });
    },

    async injectLiveFire(watchId) {
      return request('/api/scout/run', {
        method: 'POST',
        body: watchId ? JSON.stringify({ watch_id: watchId }) : undefined,
      });
    },

    start() {
      ensureSocket();
    },

    stop() {
      if (socket) socket.close();
      socket = null;
    },
  };
}

async function readResponse(res) {
  if (res.status === 204) return null;
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function errorMessage(res, data) {
  const detail = data && typeof data === 'object' ? data.detail || data.message : data;
  return `${res.status} ${res.statusText}${detail ? `: ${detail}` : ''}`;
}

function normalizeBase(baseUrl) {
  return String(baseUrl || '').trim().replace(/\/+$/, '');
}

function wsUrl(baseUrl, path) {
  const url = new URL(path, baseUrl || window.location.origin);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
}

function normalizeFeedMessage(message) {
  if (!message || typeof message !== 'object') return null;
  switch (message.type) {
    case 'candidate':
      return normalizeCandidate(message);
    case 'spec_ready':
      return normalizeSpecReady(message);
    case 'curve_update':
      return { type: 'curve_update', ...normalizeCurvePoint(message) };
    case 'pipeline_stage':
      return normalizePipelineStage(message);
    default:
      return message;
  }
}

function normalizeWatch(watch) {
  const spec = watch?.spec || {};
  return {
    ...watch,
    id: stringValue(watch?.id ?? watch?.watch_id ?? watch?.watchId),
    query_text: stringValue(watch?.query_text ?? watch?.queryText ?? watch?.query, 'watch'),
    spec: {
      must_match: normalizeStringList(spec.must_match ?? watch?.must_match),
      reject_cases: normalizeStringList(spec.reject_cases ?? watch?.reject_cases),
    },
    status: stringValue(watch?.status, 'watching'),
  };
}

function normalizeCreateWatch(data) {
  const watchId = data?.watch_id ?? data?.watchId ?? data?.id;
  return {
    ...(data || {}),
    accepted: data?.accepted ?? true,
    watch_id: stringValue(watchId),
  };
}

function normalizeCandidate(candidate) {
  return {
    ...candidate,
    type: 'candidate',
    watch_id: stringValue(candidate.watch_id ?? candidate.watchId ?? candidate.watch?.id),
    id: stringValue(candidate.id ?? candidate.candidate_id ?? candidate.cid, `c_${Date.now()}`),
    title: stringValue(candidate.title ?? candidate.name, 'Untitled opportunity'),
    source: stringValue(candidate.source ?? candidate.site, 'Unknown source'),
    url: stringValue(candidate.url),
    location: stringValue(candidate.location),
    starts_at: stringValue(candidate.starts_at ?? candidate.startsAt ?? candidate.date),
    status: stringValue(candidate.status),
    judgment: normalizeJudgment(candidate.judgment),
    reason: stringValue(candidate.reason ?? candidate.summary),
    reasoning: stringValue(candidate.reasoning ?? candidate.explanation ?? candidate.reason),
    criteria: normalizeCriteria(candidate.criteria),
    state: stringValue(candidate.state, 'new'),
    timestamp: stringValue(candidate.timestamp ?? candidate.first_seen ?? candidate.created_at, new Date().toISOString()),
  };
}

function normalizeSpecReady(message) {
  return {
    ...message,
    type: 'spec_ready',
    watch_id: stringValue(message.watch_id ?? message.watchId),
    must_match: normalizeStringList(message.must_match),
    reject_cases: normalizeStringList(message.reject_cases),
  };
}

function normalizeCurvePoint(point) {
  const rate = Number(point?.false_alarm_rate ?? point?.falseAlarmRate ?? point?.rate ?? 0);
  return {
    timestamp: stringValue(point?.timestamp ?? point?.created_at, new Date().toISOString()),
    false_alarm_rate: Number.isFinite(rate) ? rate : 0,
  };
}

function normalizePipelineStage(message) {
  return {
    ...message,
    type: 'pipeline_stage',
    stage: stringValue(message.stage),
    status: stringValue(message.status, 'running'),
    output_snippet: stringValue(message.output_snippet ?? message.outputSnippet ?? message.output),
  };
}

function normalizeJudgment(judgment) {
  if (judgment === true) return 'accepted';
  const value = String(judgment || '').toLowerCase();
  return value === 'accepted' || value === 'match' || value === 'relevant' ? 'accepted' : 'rejected';
}

function normalizeCriteria(criteria) {
  const value = parseMaybeJson(criteria);
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'string') return { ok: true, text: item };
        return {
          ok: Boolean(item?.ok ?? item?.passed ?? item?.match),
          text: stringValue(item?.text ?? item?.label ?? item?.reason),
        };
      })
      .filter((item) => item.text);
  }
  if (value && typeof value === 'object') {
    return Object.entries(value).map(([text, ok]) => ({ ok: Boolean(ok), text }));
  }
  return [];
}

function normalizeStringList(value) {
  return asArray(value).map((item) => stringValue(item)).filter(Boolean);
}

function asArray(value) {
  const parsed = parseMaybeJson(value);
  if (Array.isArray(parsed)) return parsed;
  if (parsed == null || parsed === '') return [];
  return [parsed];
}

function parseMaybeJson(value) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return value;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function stringValue(value, fallback = '') {
  if (value == null || value === '') return fallback;
  return String(value);
}
