import './styles/theme.css';
import './styles/main.css';

import { el } from './lib/dom.js';
import { createApi } from './api/index.js';
import { Header } from './components/header.js';
import { WatchCreator } from './components/watchCreator.js';
import { Board } from './components/board.js';
import { PrecisionCurve } from './components/precisionCurve.js';
import { Pipeline } from './components/pipeline.js';

const api = createApi();

// ---- Components ---------------------------------------------------------
const board = Board({
  handlers: {
    onFeedback: (candId, label) => api.sendFeedback(candId, label),
    onAct: (candId) => {
      pipeline.reset();
      api.triggerPipeline(candId);
      pipeline.node.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    },
  },
});

const curve = PrecisionCurve();
const pipeline = Pipeline();

const watchCreator = WatchCreator({
  onCreate: async (queryText) => {
    const { watch_id } = await api.createWatch(queryText);
    // Add a lane immediately so candidates have somewhere to land.
    board.addWatch({ id: watch_id, query_text: queryText, status: 'compiling' });
  },
});

// ---- Layout ------------------------------------------------------------
const app = document.getElementById('app');
app.append(
  Header(),
  el('main', { class: 'app-main' }, [
    el('div', { class: 'col-left' }, [watchCreator.node]),
    el('div', { class: 'col-right' }, [board.node, pipeline.node]),
    el('div', { class: 'col-full' }, [curve.node]),
  ])
);

// ---- Wire the WebSocket-style feed -------------------------------------
// The real backend swap replaces createApi() internals; this dispatch stays.
api.subscribe((msg) => {
  switch (msg.type) {
    case 'candidate':
      board.routeCandidate(msg);
      break;
    case 'spec_ready':
      watchCreator.showSpec(
        { must_match: msg.must_match, reject_cases: msg.reject_cases },
        null
      );
      break;
    case 'curve_update':
      curve.addPoint({ timestamp: msg.timestamp, false_alarm_rate: msg.false_alarm_rate });
      break;
    case 'pipeline_stage':
      pipeline.update(msg);
      break;
    default:
      console.warn('[feed] unknown message type', msg);
  }
});

// ---- Bootstrap ---------------------------------------------------------
(async function init() {
  const watches = await api.getWatches();
  for (const w of watches) board.addWatch(w);
  // Show the first watch's compiled spec in the creator panel as a sample.
  if (watches[0]) watchCreator.showSpec(watches[0].spec, watches[0].query_text);

  const existingCurve = await api.getCurve();
  if (existingCurve.length) curve.setPoints(existingCurve);

  api.start();
})();

// ---- Live-fire demo hook ----------------------------------------------
// In the browser console: lookout.fire()  -> injects a guaranteed match on cue.
window.lookout = {
  fire: (watchId) => api.injectLiveFire(watchId),
  api,
};
