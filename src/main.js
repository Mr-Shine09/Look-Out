import './styles/theme.css';
import './styles/main.css';
import './styles/pages.css';

import { el } from './lib/dom.js';
import { createApi } from './api/index.js';
import { pingSurfaced, requestNotifyPermission } from './lib/notify.js';
import { createRouter } from './lib/router.js';
import { Header } from './components/header.js';
import { SearchPage } from './components/searchPage.js';
import { StayPage } from './components/stayPage.js';
import { ReportPage } from './components/reportPage.js';
import { OverviewPage } from './components/overviewPage.js';
import { DevPage } from './components/devPage.js';

const api = createApi();

// Active topic the user is following (carried across Search → Stay → Report).
let scope = { watchId: null, title: 'your watch' };

// ---- Developer window flag ----------------------------------------------
// The dev window is friction-gated, not secured (static bundle): visiting
// #/dev?key=oak once sets a local flag; only then does the Dev nav item and
// route exist. Clear localStorage.lookoutDev to hide it again.
if (/^#\/dev\?key=oak$/.test(window.location.hash)) {
  localStorage.setItem('lookoutDev', '1');
  window.location.hash = '#/dev';
}
const devEnabled = localStorage.getItem('lookoutDev') === '1';

// ---- Pages -------------------------------------------------------------
const header = Header({ onNavigate: (key) => router.navigate(key), showDev: devEnabled });

const overview = OverviewPage({
  api,
  onOpenWatch: ({ watchId, title }) => {
    scope = { watchId, title: title || 'your watch' };
    router.navigate('stay');
  },
  onNewSearch: () => goSearch(),
});
const dev = devEnabled ? DevPage({ api }) : null;
const search = SearchPage({ api, onFollow: handleFollow });
const report = ReportPage({ api, onBack: (s) => goStay(s) });
const stay = StayPage({
  api,
  onReport: (s) => {
    scope = { ...scope, ...s };
    router.navigate('report');
  },
  onNewSearch: () => goSearch(),
  onDeleted: (watchId) => {
    overview.dropWatch(watchId);
    if (scope.watchId === watchId) scope = { watchId: null, title: 'your watch' };
    router.navigate('overview');
  },
});

// ---- Layout ------------------------------------------------------------
const app = document.getElementById('app');
app.append(
  header.node,
  el('main', { class: 'app-main' }, [overview.node, search.node, stay.node, report.node, dev?.node])
);

// ---- Router ------------------------------------------------------------
const router = createRouter({
  fallback: 'search',
  routes: [
    {
      key: 'overview',
      node: overview.node,
      onShow: () => {
        header.setActive('overview');
        dev?.hide();
        overview.show();
      },
    },
    { key: 'search', node: search.node, onShow: () => { header.setActive('search'); overview.hide(); dev?.hide(); } },
    {
      key: 'stay',
      node: stay.node,
      onShow: () => {
        header.setActive('stay');
        overview.hide();
        dev?.hide();
        stay.show(scope);
      },
    },
    {
      key: 'report',
      node: report.node,
      onShow: () => {
        header.setActive('report');
        overview.hide();
        dev?.hide();
        report.show(scope);
      },
    },
    ...(dev
      ? [
          {
            key: 'dev',
            node: dev.node,
            onShow: () => {
              header.setActive('dev');
              overview.hide();
              dev.show();
            },
          },
        ]
      : []),
  ],
});

function goStay(nextScope) {
  if (nextScope) scope = { watchId: nextScope.watchId ?? scope.watchId, title: nextScope.title ?? scope.title };
  router.navigate('stay');
}

// "New search" stops the active watch's polling (it isn't deleted — just
// paused, same as the explicit Stop button) before handing the user a clean
// Search page.
async function goSearch() {
  if (scope.watchId) {
    try {
      await api.setWatchStatus?.(scope.watchId, 'stopped');
    } catch (err) {
      console.warn('[new search] stop watch failed', err);
    }
  }
  search.reset?.();
  router.navigate('search');
}

// SearchPage owns the whole create → compile → confirm flow itself; by the
// time onFollow fires the watch already exists and its spec is saved.
function handleFollow({ query, watchId, title }) {
  scope = { watchId, title: title || query };
  goStay(scope);
}

// ---- Live feed dispatch ------------------------------------------------
api.subscribe((msg) => {
  switch (msg.type) {
    case 'candidate':
      stay.handleCandidate(msg);
      overview.handleCandidate(msg);
      dev?.handleCandidate(msg);
      // Live surfaced match (flagged server-side) -> ping. Backfill never sets notify.
      if (msg.notify && msg.judgment === 'accepted') pingSurfaced(msg);
      break;
    case 'pipeline_stage':
      stay.handlePipeline(msg);
      break;
    case 'curve_update':
      dev?.handleCurve(msg);
      break;
    case 'watch_deleted':
      overview.dropWatch(msg.watch_id);
      dev?.dropWatch(msg.watch_id);
      break;
    case 'spec_ready':
      search.handleSpecReady(msg);
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
router.start();
api.start();
registerReveals();
// Best-effort: ask for native notification permission on first interaction.
window.addEventListener('pointerdown', () => requestNotifyPermission(), { once: true });

// Console demo hook: lookout.fire() injects a guaranteed match on cue.
window.lookout = {
  fire: (watchId) => api.injectLiveFire(watchId || scope.watchId),
  api,
};
