import { el } from '../lib/dom.js';
import { Lane } from './lane.js';

/**
 * The multi-lane live board. Holds one Lane per watch and routes incoming
 * candidate messages to the right lane by `watch_id`. New watches created at
 * runtime get a lane on the fly.
 */
export function Board({ handlers }) {
  const lanes = new Map(); // watch_id -> Lane
  const track = el('div', { class: 'board' });

  function addWatch(watch) {
    if (lanes.has(watch.id)) return;
    const lane = Lane(watch, handlers);
    lanes.set(watch.id, lane);
    track.append(lane.node);
  }

  function routeCandidate(cand) {
    if (!cand.watch_id) return;
    if (!lanes.has(cand.watch_id)) addWatch({ id: cand.watch_id, query_text: cand.watch_id, status: 'watching' });
    const lane = lanes.get(cand.watch_id);
    if (lane) lane.addCandidate(cand);
  }

  const node = el('section', { class: 'board-wrap' }, [
    el('h2', { class: 'section-title', text: 'Live board' }),
    track,
  ]);

  return { node, addWatch, routeCandidate };
}
