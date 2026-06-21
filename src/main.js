import './styles/theme.css';
import './styles/main.css';
import './styles/pages.css';

import { el } from './lib/dom.js';
import { createApi } from './api/index.js';
import { createRouter } from './lib/router.js';
import { Header } from './components/header.js';
import { SearchPage } from './components/searchPage.js';
import { StayPage } from './components/stayPage.js';
import { ReportPage } from './components/reportPage.js';

const api = createApi();

// Active topic the user is following (carried across Search → Stay → Report).
let scope = { watchId: null, title: 'your watch' };

// Map filter tokens to spec phrases so checkboxes refine the compiled query
// (and keep the backend scoped instead of firing on random noise).
const FILTER_PHRASES = {
  'where:near': 'in-person, within ~100mi of San Francisco',
  'where:online': 'online events are acceptable',
  'when:soon': 'registration or deadline is still open',
  'type:events': 'events / meetups',
  'type:funding': 'grants, funding or fellowships',
  'type:hackathons': 'hackathons',
};

function composeQuery(query, filters = []) {
  const phrases = filters.map((t) => FILTER_PHRASES[t]).filter(Boolean);
  if (!phrases.length) return query;
  return `${query} (must be: ${phrases.join('; ')})`;
}

// ---- Pages -------------------------------------------------------------
const header = Header({ onNavigate: (key) => router.navigate(key) });

const search = SearchPage({ onFollow: handleFollow });
const report = ReportPage({ onBack: (s) => goStay(s) });
const stay = StayPage({
  api,
  onReport: (s) => {
    scope = { ...scope, ...s };
    router.navigate('report');
  },
});

// ---- Layout ------------------------------------------------------------
const app = document.getElementById('app');
app.append(
  header.node,
  el('main', { class: 'app-main' }, [search.node, stay.node, report.node])
);

// ---- Router ------------------------------------------------------------
const router = createRouter({
  fallback: 'search',
  routes: [
    { key: 'search', node: search.node, onShow: () => header.setActive('search') },
    {
      key: 'stay',
      node: stay.node,
      onShow: () => {
        header.setActive('stay');
        stay.show(scope);
      },
    },
    {
      key: 'report',
      node: report.node,
      onShow: () => {
        header.setActive('report');
        report.show(scope);
      },
    },
  ],
});

function goStay(nextScope) {
  if (nextScope) scope = { watchId: nextScope.watchId ?? scope.watchId, title: nextScope.title ?? scope.title };
  router.navigate('stay');
}

async function handleFollow({ query, filters = [], watchId, title }) {
  if (watchId) {
    // Reuse an existing feed — instant, no new compile.
    scope = { watchId, title: title || query };
    goStay(scope);
    return;
  }
  // Custom search → compile a fresh feed from the query + filters.
  const composed = composeQuery(query, filters);
  scope = { watchId: null, title: query };
  goStay(scope);
  try {
    const { watch_id } = await api.createWatch(composed);
    scope = { watchId: watch_id, title: query };
    stay.show(scope);
  } catch (err) {
    console.error('[follow] createWatch failed', err);
  }
}

// ---- Live feed dispatch ------------------------------------------------
api.subscribe((msg) => {
  switch (msg.type) {
    case 'candidate':
      stay.handleCandidate(msg);
      break;
    case 'pipeline_stage':
      stay.handlePipeline(msg);
      break;
    case 'spec_ready':
    case 'curve_update':
      break;
    default:
      break;
  }
});

// ---- Bootstrap ---------------------------------------------------------
router.start();
api.start();

// Console demo hook: lookout.fire() injects a guaranteed match on cue.
window.lookout = {
  fire: (watchId) => api.injectLiveFire(watchId || scope.watchId),
  api,
};
