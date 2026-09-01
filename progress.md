# Lookout — Progress Log

> Running log of what's shipped, session by session. See `handoff.md` for the
> full onboarding doc (stack, run instructions, architecture); this file is
> just the chronological "what changed and why."

## 2026-07-02 (Session 6) — closed out issues #12, #14, #15, #16, #17 + real bugs found live

Working from Oak's live review of the Session 5 redesign — several things
were marked "shipped" in the handoff but weren't actually done yet. Verified
each live in the mock preview before calling it done; nothing here is closed
on GitHub until Oak reviews it running for real.

1. **[#12] Animated logo, redone twice.** First pass replaced the plain
   magnifying-glass-and-eye mark with a fuller character (hair, hand, jaw) but
   Oak called it out as not matching the reference sketch. Rebuilt the SVG a
   second time to track the reference art directly (three-tuft hair, gripping
   hand, orange handle/eyebrow) at a `0 0 100 100` viewBox for precision.
   Also changed the *motion* to match the reference's 5-frame diagram
   exactly — previously the whole mark bobbed; now only the eye (iris +
   eyebrow, `.eye-move`) floats up, blinks, floats down, and returns, while
   the glass/hair/hand stay still. `prefers-reduced-motion` still disables
   both. Favicon regenerated to match.
2. **[#14] Search page.** Advanced Controls panel and the two seeded example
   cards ("New AI/ML events near me", "AI research funds & fellowships") are
   gone — page is prompt + bar + event strip only. Added the missing piece:
   after the spec compiles, must-match/reject-case chips render editable
   (add/remove), with Confirm (`PATCH .../spec`) / Cancel (`DELETE`) before a
   watch goes live.
3. **No default watch on boot.** Root-caused: `LOOKOUT_SEED_DEFAULT_WATCH`
   defaulted to `"1"` in `settings.py`, and the mock's `seed.js` pre-populated
   two watches — both explain why a fresh boot was never actually empty.
   Flipped the backend default to off and emptied the mock seed.
4. **Concurrent-watch cap (new, not previously filed).** Oak flagged 19
   simultaneously "watching" entries straining local Ollama/Redis. Added a
   hard cap of 3 active watches, enforced server-side (`create_watch` /
   `PATCH .../status` return 409 past the limit) and mirrored in mock mode
   with a readable error on the Search page.
5. **[#15/#16] Precision curve relocated, and a real layout bug fixed.** The
   curve is now dev-only (`#/dev`), removed from Stay entirely. While
   reproducing Oak's "vertical font" screenshot, found the actual cause: at
   certain widths `.stay-head-actions` (5 pill buttons) didn't wrap, so
   flexbox squeezed the title container down to one word per line with dead
   space on the right. Fixed with `flex-wrap` + a `min-width` floor on the
   title so actions wrap to their own line instead of crushing the title.
6. **[#17] Notify page.** Email / generic-webhook / dashboard toggles and the
   AI-agent-connector section are gone — Discord is the only option. Added
   `POST /api/watches/{id}/notify`, which relays the watch's surfaced,
   non-expired candidates through the existing Discord embed formatter
   (`notify.py`); the UI shows a real success/error result, not a fake
   confirmation.
7. **Found and fixed while testing, not previously known:** any element
   toggled via the `hidden` attribute could be silently overridden by a
   component's own `display` CSS (bit the "compiling spec" spinner, which
   stayed visible forever because `.compiling { display: flex }` beat
   `[hidden]`). Added a global `[hidden] { display: none !important }` rule
   in `theme.css` so this class of bug can't recur elsewhere in the app.

**Verified:** `vite build` clean, backend files parse clean, full
Search → Stay → Notify → Dev flow walked live in the mock preview at several
viewport widths. **Not yet verified against the real backend** — that's next
session's first step, along with Oak's live approval before closing
#12/#14/#15/#16/#17 on GitHub.

**Files touched:** `lookout/{app,engine,notify,settings}.py`;
`src/main.js`; `src/components/{header,searchPage,stayPage,devPage,reportPage}.js`;
`src/api/{mock,real,seed}.js`; `src/styles/{theme,main,pages}.css`;
`public/favicon.svg`.
