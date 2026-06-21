# Project — working title: Lookout (rename open, see §10)

**Created:** 2026-06-20 (Saturday) · Berkeley AI Hackathon 2026 prep
**Status:** Concept locked, pre-code. **Solo build** (no teammate).
**Supersedes:** the watcher-only framing in `Lookout.html` v0.2 and `Lookout.md` (Session 0). Where they conflict, this file wins.

---

## 1. One-liner
A tireless watcher that silently monitors the live web for opportunities you describe in plain English — and when something genuinely matches, runs an agent pipeline to *act* on it (assess, draft, plan), not just ping you.

---

## 2. What it is, and what it is NOT
Two separate claims — keep them distinct, because they tell you where to spend effort:

- **It watches** → this is what separates it from an *on-demand finder*. It catches perishable things the moment they appear, including the 2am posting a "run it now" tool would miss.
- **It judges and learns** → this is what separates it from a *generic scraper*. A cron job that scrapes every five minutes and forwards everything is still a scraper; it watches constantly and has zero intelligence. The intelligence is the filtering, not the polling: a spec with explicit reject-cases, new/seen/changed memory, and a relevance bar that learns your taste live.
- **It acts** → this is what makes it more than a pinger. On a real match it scouts → judges fit → strategizes → drafts a deliverable → self-critiques → you approve. It never auto-submits.

> The trap to avoid: conflating "it watches" with "it's smart." They're two different claims, and we want both.

---

## 3. Demo domain
**Events / hackathons.** Chosen because it feels niche, is concrete, and — critically — is self-suppliable for a live demo (see §7).

---

## 4. The architecture insight (why no prior work is wasted)
The watcher and the on-demand "doer" are the **same engine**:
- Doer = `profile → scout → judge → act`
- Watcher = that same pipeline on a scheduler loop with dedup in front

So build the doer pipeline first, then wrap it in the loop to make it a watcher. Keeping the watcher adds a shell; it does not change the build order.

---

## 5. The agents (role specialization must be genuine)
Each agent earns its seat by using different tools/data — otherwise it's just five sequential Claude calls in a trenchcoat (= a wrapper).

- **Scout** — reads live sources. APIs for the easy ones; Browserbase for pages that need a real browser. Real tool use.
- **Fit judge** — Claude's judgment combined with a small relevance model that learns from your in-session feedback. *This is the live-training requirement (see §11).*
- **Strategist** — track/prize EV and feasibility analysis for a chosen opportunity.
- **Drafter** — produces the deliverable (tailored application draft + prep/build plan), staged for approval.
- **Critic** — red-teams the drafter's output before you ever see it. Self-correction loop; beats single-pass.

> Guardrail: the learned model + the critic loop + real tool use are what make this not a wrapper. They must be **visible in the demo**, or it collapses to "Devpost reader + Claude writes your application."

---

## 6. Build order (thin slice first)
- **V0** — `profile → scout (one source) → static Claude fit-judge with reject cases → ranked shortlist + one-line reasons`. Tracks: Anthropic + Browserbase. **Prove this end-to-end in the first few hours.**
- **V1** — fit model learns from thumbs up/down; precision curve shown. Tracks: Redis + the live-training rule.
- **V2** — drafter + critic produce the staged deliverable you approve. Track: Anthropic depth.
- **V3** — wrap the pipeline in Agentspan (durable steps, auto-retries, human-approval gate) + Sentry. Tracks: Orkes + reliability.
- **Watcher loop** (APScheduler + dedup) goes on once V0–V1 are solid — it's the shell over the same engine.

> V0–V2 is the project. V3 and the loop are upside. Solo + 24h = scope is the #1 risk; do **not** build V3/the loop before V2 is polished and rehearsed.

---

## 7. The demo arc (solo, ~90s, no manufactured external event needed)
1. **Input** — type an interest + constraints in plain English. Compiles live.
2. **Scout reads the live web** on screen (Browserbase).
3. **Fit judge ranks; you correct it** — thumbs up/down 2–3 results, model retrains, list visibly re-sorts. ← the live-training moment.
4. **The live catch** — *you* post the matching item yourself to a watched source you can write to (a test subreddit, a Discord channel, or a Luma event). The watcher catches it within a poll; the action layer fires.
5. **Act + prove** — pick it → strategist + drafter → critic's fixes → you approve. Then the proof panels: the Agentspan orchestration view + the learning curve.

- Ambient lanes show the honest "watching… nothing new yet" → reinforces patient, not spammy.
- **Solo self-supply:** there is no teammate, so you do the posting that triggers the catch. Pick a source you can reliably write to *and* read back from.

---

## 8. Sponsor tracks
- **Secured credits:** Redis, Browserbase, Sentry.
- **Targeting:**
  - **Redis** — vector memory for new/seen/changed dedup + learned thresholds. Lean on the vector angle, not key-value.
  - **Anthropic** — Claude as the judgment/draft/critic brain; meaningful problem = opportunity access; build with Claude Code.
  - **Browserbase** — the scout's live-web engine.
  - **Orkes / Agentspan** — orchestrate the agent pipeline: durable steps, automatic tool-call retries, human-in-the-loop approval. Prize: Ray-Ban Metas.
- **Sentry** — backend error monitoring; the "reliability from day one" story.
- **Arize / Phoenix** — status open (not on the latest target image). The precision/false-fit curve runs in Phoenix regardless (it's OSS), so the live-training proof survives whether or not the Arize track is chased.

> Overlap warning: Agentspan, Sentry, and Arize all want "observability/reliability" airtime in a 90s demo. Scope each to a distinct beat — Agentspan = agent runtime, Sentry = backend errors, Phoenix = the learning curve.

---

## 9. Decision log (what we rejected, and why)
- **News / market / price alerts** — saturated. Amazon, news apps, Keepa, CamelCamelCamel already own this.
- **Jobs (opportunity-as-jobs)** — Indeed / Handshake / LinkedIn are the incumbents. Only the *un-indexed* long tail (micro-grants, one-off gigs, "looking for" posts) is defensible, and that's a harder live demo.
- **Value-finding / secondhand deals as the headline** — Keepa / CamelCamelCamel own price tracking. Defensible only as *secondhand + judgment*, but it forces you to out-argue an incumbent instead of impressing.
- **eBay as a source** — was only ever a *mechanism* (free API + self-listing for an unriggable live fire), never the mission. Superseded: in the events domain the live fire is self-posting to a writable source, so eBay is dropped.
- **ICE / law-enforcement alerts** (a mentor suggestion) — hard no. Politically radioactive in front of unknown judges; the exact app category (ICEBlock and similar) was pulled from app stores under DOJ pressure in Oct 2025 and is in active litigation; and the demo would require staging fake sighting reports, which directly undercuts the "we suppress false alarms" thesis.
- **Pure on-demand doer (no watcher)** — cleaner to demo, but loses the watcher soul that differentiates from a finder. Rejected in favor of watcher + action layer.

---

## 10. Open / to-confirm
- **Name** — "Lookout" fit a pure watcher; the watcher+doer hybrid may want a new name.
- **Arize track** — in or out (see §8).
- **Live-fire source** — which writable source is the demo lane (test subreddit vs Discord vs Luma); pick the most reliable to post to and read back from.
- **Scope realism** — solo build in 24h. V0–V2 is the target; protect it ruthlessly.

---

## 11. Live-training requirement (the hackathon rule), preserved
The fit judge's relevance model retrains on *your* in-session thumbs up/down — data (your taste + this session's candidates) that could not exist before the event starts. Shown as a rising-precision / falling-false-fit curve. This is simultaneously the core differentiator and the "train on data collected during the event" rule, satisfied natively rather than bolted on.
