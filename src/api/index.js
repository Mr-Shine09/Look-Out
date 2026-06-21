/**
 * API selector — the single seam between mock and real backend.
 *
 * Today: returns the mock implementation.
 * On demo day: implement `createRealApi()` (a thin wrapper over `fetch()` +
 * `new WebSocket('/ws/feed')` that exposes the same method names) and flip the
 * import below. Nothing else in the app changes.
 */
import { createMockApi } from './mock.js';
import { createRealApi } from './real.js';

// Mock by default (safe for public/static deploys). Local dev opts into the
// real backend with VITE_USE_REAL_BACKEND=true.
const USE_REAL_BACKEND = (import.meta.env.VITE_USE_REAL_BACKEND ?? 'false') === 'true';

export function createApi() {
  return USE_REAL_BACKEND ? createRealApi(import.meta.env.VITE_API_BASE ?? '') : createMockApi();
}
