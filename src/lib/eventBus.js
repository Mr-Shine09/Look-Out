/**
 * Minimal pub/sub. Used by the mock API to imitate a WebSocket feed:
 * the real backend will replace this with `new WebSocket('/ws/feed')`,
 * dispatching the same `{ type, ... }` messages to the same handlers.
 */
export function createEventBus() {
  const handlers = new Set();

  return {
    /** Subscribe to every message. Returns an unsubscribe fn. */
    subscribe(handler) {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
    /** Emit a message to all subscribers. */
    emit(message) {
      for (const handler of handlers) {
        try {
          handler(message);
        } catch (err) {
          console.error('[eventBus] handler error', err);
        }
      }
    },
  };
}
