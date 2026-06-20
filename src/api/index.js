/**
 * API selector — the single seam between mock and real backend.
 *
 * Today: returns the mock implementation.
 * On demo day: implement `createRealApi()` (a thin wrapper over `fetch()` +
 * `new WebSocket('/ws/feed')` that exposes the same method names) and flip the
 * import below. Nothing else in the app changes.
 */
import { createMockApi } from './mock.js';
// import { createRealApi } from './real.js';

export function createApi() {
  return createMockApi();
  // return createRealApi(import.meta.env.VITE_API_BASE ?? '');
}
