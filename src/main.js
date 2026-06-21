import './styles/theme.css';
import './styles/main.css';
import './styles/pages.css';

import { el } from './lib/dom.js';
import { createApi } from './api/index.js';
import { createRouter } from './lib/router.js';
import { mountBackdrop } from './lib/backdrop.js';
import { Header } from './components/header.js';
import { SearchPage } from './components/searchPage.js';
import { StayPage } from './components/stayPage.js';
import { ReportPage } from './components/reportPage.js';

const api = createApi();

// Active topic the user is following (carried across Search → Stay → Report).
let scope = { watchId: null, title: 'your watch' };

const TIME_PHRASES = {
  week: 'opening within the next week',
  month: 'opening within the next month',
  quarter: 'opening within the next quarter',
  any: null,
};

// Turn the structured searchSpec from the Search page into a single, richer
// query string. Keeps createWatch's signature unchanged (mock/real parity);
// the structured spec stays frontend-local and constrains the compiled query.
function composeQuery(query, spec) {
  if (!spec) return query;
  const clauses = [];
  const loc = spec.location || {};
  if (loc.text) {
    clauses.push(
      loc.radiusMi ? `within ~${loc.radiusMi}mi of ${loc.text}` : `in or near ${loc.text}`
    );
  }
  if (loc.onlineOk) clauses.push('online events are acceptable');
  const timePhrase = TIME_PHRASES[spec.timeWindow];
  if (timePhrase) clauses.push(timePhrase);
  if (spec.types?.length) clauses.push(`type is one of: ${spec.types.join(', ')}`);
  if (spec.sources?.length) clauses.push(`only from sources: ${spec.sources.join(', ')}`);
  if (spec.include?.length) clauses.push(`must mention: ${spec.include.join(', ')}`);
  if (spec.exclude?.length) clauses.push(`never about: ${spec.exclude.join(', ')}`);
  if (typeof spec.strictness === 'number') {
    const band = spec.strictness <= 33 ? 'loose' : spec.strictness <= 66 ? 'balanced' : 'strict';
    clauses.push(`suppression strictness: ${band}`);
  }
  if (!clauses.length) return query;
  return `${query} (constraints — ${clauses.join('; ')})`;
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

async function handleFollow({ query, spec, watchId, title }) {
  if (watchId) {
    // Reuse an existing feed — instant, no new compile.
    scope = { watchId, title: title || query, spec };
    goStay(scope);
    return;
  }
  // Custom search → compile a fresh feed from the query + structured spec.
  const composed = composeQuery(query, spec);
  scope = { watchId: null, title: query, spec };
  goStay(scope);
  try {
    const { watch_id } = await api.createWatch(composed, spec);
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
    case 'curve_update':
      stay.handleCurve(msg);
      break;
    case 'spec_ready':
      break;
    default:
      break;
  }
});

// ---- Scroll-triggered wash-in reveals ----------------------------------
// Below-fold blocks tagged `.reveal` dissolve in as they enter the viewport.
const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const revealObserver = prefersReduced
  ? null
  : new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('reveal--in');
            revealObserver.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -6% 0px' }
    );

function registerReveals() {
  document.querySelectorAll('.reveal:not([data-rev])').forEach((node) => {
    node.setAttribute('data-rev', '');
    if (revealObserver) revealObserver.observe(node);
    else node.classList.add('reveal--in');
  });
}

// ---- Bootstrap ---------------------------------------------------------
mountBackdrop();
router.start();
api.start();
registerReveals();

// Console demo hook: lookout.fire() injects a guaranteed match on cue.
window.lookout = {
  fire: (watchId) => api.injectLiveFire(watchId || scope.watchId),
  api,
};
