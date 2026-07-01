/**
 * Shared candidate classification — the single source of truth for how a
 * candidate is bucketed into surfaced / silenced. Used by both the Stay page
 * (per-watch) and the Overview page (global) so their numbers can never drift.
 *
 * Freshness is a moving target: an accepted candidate that was upcoming when
 * judged can go stale just from the clock advancing while it sits in the list.
 * `isExpired` is recomputed at read time (never mutates the stored judgment),
 * so an accepted item drops out of "surfaced" the moment its start passes.
 */

export function isExpired(cand) {
  if (cand.expired === true) return true;
  if (!cand.starts_at) return false;
  const dt = new Date(cand.starts_at);
  return !Number.isNaN(dt.getTime()) && dt.getTime() < Date.now();
}

/** One of: 'surfaced' | 'duplicate' | 'expired' | 'offtopic'. */
export function classify(cand) {
  if (cand.state === 'duplicate') return 'duplicate';
  if (cand.judgment === 'accepted') return isExpired(cand) ? 'expired' : 'surfaced';
  return 'offtopic';
}

/**
 * Tally an iterable of candidates into the standard buckets.
 * `silenced` = everything that did NOT surface (duplicates + off-topic + expired).
 */
export function tally(candidates) {
  let surfaced = 0;
  let dup = 0;
  let off = 0;
  let expired = 0;
  for (const cand of candidates) {
    switch (classify(cand)) {
      case 'surfaced': surfaced += 1; break;
      case 'duplicate': dup += 1; break;
      case 'expired': expired += 1; break;
      default: off += 1;
    }
  }
  const seen = surfaced + dup + off + expired;
  return { surfaced, dup, off, expired, silenced: dup + off + expired, seen };
}
