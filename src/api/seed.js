/**
 * Seed data for the mock backend. Domain = events/hackathons (a swappable
 * placeholder noun). Shapes mirror the real Redis backend's `cand` hash so
 * swapping mock.js for real.js is a one-line change, not a rewrite.
 */

export const WATCHES = [
  {
    id: 'w_ml_hack',
    query_text:
      'Alert me when a new in-person ML/AI hackathon opens registration within 100mi of SF',
    status: 'watching',
    spec: {
      must_match: [
        'In-person event (not virtual-only)',
        'Theme is ML, AI, or data',
        'Located within ~100mi of San Francisco',
        'Registration currently open',
      ],
      reject_cases: [
        'Online / virtual-only events',
        'Pure Web3 / crypto hackathons',
        'Already-closed or past registration',
        'Career fairs or info sessions (not build events)',
      ],
    },
  },
  {
    id: 'w_grants',
    query_text:
      'Watch for new AI research grants or fellowships with rolling deadlines, open to early-career researchers',
    status: 'watching',
    spec: {
      must_match: [
        'Funding for AI / ML research',
        'Open to early-career or independent researchers',
        'Deadline is upcoming (not passed)',
      ],
      reject_cases: [
        'Requires tenured faculty status',
        'Corporate sponsorship deals (not grants)',
        'Deadline already passed',
      ],
    },
  },
];

/**
 * Candidate pool per watch. `dupGroup` marks near-duplicate events (same
 * event, different source/title) — the real backend collapses these via
 * RediSearch vector KNN; here we just surface the "deduped" note occasionally.
 */
export const CANDIDATE_POOL = {
  w_ml_hack: [
    {
      title: 'AI Berkeley Hackathon 2026',
      source: 'Devpost',
      url: 'https://example.com/ai-berkeley',
      location: 'Berkeley, CA',
      starts_at: '2026-07-11',
      status: 'open',
      judgment: 'accepted',
      reason: 'In-person ML hackathon, 12mi from SF, registration open.',
      reasoning:
        'Matches every must-match: it is an in-person build event (UC Berkeley campus), explicitly AI/ML themed, ~12 miles from San Francisco, and registration is currently open with 200+ spots. No reject cases triggered — not virtual, not crypto, not past deadline.',
      criteria: [
        { ok: true, text: 'In-person — UC Berkeley campus' },
        { ok: true, text: 'AI/ML theme confirmed' },
        { ok: true, text: '~12mi from SF (within 100mi)' },
        { ok: true, text: 'Registration open (200+ spots)' },
      ],
    },
    {
      title: 'Cal Hacks AI Edition — In Person',
      source: 'MLH',
      url: 'https://example.com/calhacks-ai',
      location: 'Berkeley, CA',
      starts_at: '2026-07-11',
      status: 'open',
      dupGroup: 'berkeley_ai',
      judgment: 'accepted',
      reason: 'Same Berkeley AI event re-listed on MLH — linked to existing candidate.',
      reasoning:
        'Semantically identical to "AI Berkeley Hackathon 2026" (cosine similarity 0.94) but posted on a different source under a different name. Exact-ID dedup would miss this; vector KNN catches it. Linked to the existing cluster rather than surfaced twice.',
      criteria: [
        { ok: true, text: 'Duplicate of an accepted candidate' },
        { ok: true, text: 'Linked via vector similarity (0.94)' },
      ],
    },
    {
      title: 'Bay Area Vision & Robotics Buildathon',
      source: 'Luma',
      url: 'https://example.com/vision-robotics',
      location: 'San Jose, CA',
      starts_at: '2026-08-02',
      status: 'open',
      judgment: 'accepted',
      reason: 'In-person ML/robotics build event in San Jose (~48mi), open.',
      reasoning:
        'In-person buildathon in San Jose (~48mi from SF) centered on computer vision and robotics — squarely within the ML theme. Registration open. No reject cases.',
      criteria: [
        { ok: true, text: 'In-person — San Jose' },
        { ok: true, text: 'Vision/robotics = ML theme' },
        { ok: true, text: '~48mi from SF' },
        { ok: true, text: 'Open' },
      ],
    },
    {
      title: 'Global Virtual AI Sprint',
      source: 'Devpost',
      url: 'https://example.com/virtual-ai-sprint',
      location: 'Online',
      starts_at: '2026-07-20',
      status: 'open',
      judgment: 'rejected',
      reason: 'Virtual-only — fails the in-person requirement.',
      reasoning:
        'AI-themed and registration is open, but it is virtual-only with no physical venue. The must-match list requires an in-person event, so this is rejected despite matching the topic.',
      criteria: [
        { ok: false, text: 'Virtual-only (must be in-person)' },
        { ok: true, text: 'AI theme confirmed' },
      ],
    },
    {
      title: 'ETHGlobal San Francisco',
      source: 'MLH',
      url: 'https://example.com/ethglobal-sf',
      location: 'San Francisco, CA',
      starts_at: '2026-09-05',
      status: 'open',
      judgment: 'rejected',
      reason: 'Web3/crypto focus — excluded by reject cases.',
      reasoning:
        'In-person and in SF, but the event is a Web3/Ethereum hackathon. The reject cases explicitly exclude pure crypto hackathons, so this fires a rejection even though location and format match.',
      criteria: [
        { ok: false, text: 'Web3/crypto focus (reject case)' },
        { ok: true, text: 'In-person, in SF' },
      ],
    },
    {
      title: 'Stanford TreeHacks',
      source: 'Devpost',
      url: 'https://example.com/treehacks',
      location: 'Stanford, CA',
      starts_at: '2026-02-14',
      status: 'closed',
      judgment: 'rejected',
      reason: 'Registration already closed.',
      reasoning:
        'In-person, AI tracks present, ~35mi from SF — but registration has already closed. The must-match requires open registration, so it is rejected as stale.',
      criteria: [
        { ok: false, text: 'Registration closed' },
        { ok: true, text: 'In-person, near SF' },
      ],
    },
    {
      title: 'SF Data Engineering Career Fair',
      source: 'Eventbrite',
      url: 'https://example.com/data-career-fair',
      location: 'San Francisco, CA',
      starts_at: '2026-07-09',
      status: 'open',
      judgment: 'rejected',
      reason: 'Career fair, not a build event.',
      reasoning:
        'Data-adjacent and in SF, but it is a recruiting career fair, not a hackathon/build event. Reject cases exclude career fairs and info sessions.',
      criteria: [
        { ok: false, text: 'Career fair, not a buildathon' },
        { ok: true, text: 'In SF, data-adjacent' },
      ],
    },
    {
      title: 'LA Generative AI Jam',
      source: 'Luma',
      url: 'https://example.com/la-genai-jam',
      location: 'Los Angeles, CA',
      starts_at: '2026-08-22',
      status: 'open',
      judgment: 'rejected',
      reason: 'Los Angeles is ~380mi — outside the 100mi radius.',
      reasoning:
        'In-person generative-AI hackathon with open registration — topic and format both match. But Los Angeles is ~380 miles from SF, well outside the 100mi radius the watch specifies.',
      criteria: [
        { ok: false, text: '~380mi from SF (>100mi)' },
        { ok: true, text: 'In-person GenAI event' },
      ],
    },
  ],
  w_grants: [
    {
      title: 'Open Philanthropy AI Safety Fellowship',
      source: 'Grants.gov',
      url: 'https://example.com/openphil-fellowship',
      location: 'Remote-friendly',
      starts_at: '2026-09-30',
      status: 'open',
      judgment: 'accepted',
      reason: 'AI research fellowship, early-career eligible, deadline upcoming.',
      reasoning:
        'Funds AI safety research, explicitly open to early-career and independent researchers, with a rolling deadline still months out. All must-match criteria satisfied; no reject cases.',
      criteria: [
        { ok: true, text: 'Funds AI/ML research' },
        { ok: true, text: 'Early-career eligible' },
        { ok: true, text: 'Deadline upcoming' },
      ],
    },
    {
      title: 'NSF Senior Faculty AI Initiative',
      source: 'NSF',
      url: 'https://example.com/nsf-senior',
      location: 'US institutions',
      starts_at: '2026-08-15',
      status: 'open',
      judgment: 'rejected',
      reason: 'Requires tenured faculty — fails early-career criterion.',
      reasoning:
        'A substantial AI research grant, but eligibility is restricted to tenured senior faculty. The watch targets early-career researchers, so this is rejected on eligibility.',
      criteria: [
        { ok: false, text: 'Requires tenured faculty' },
        { ok: true, text: 'Funds AI research' },
      ],
    },
    {
      title: 'BigCo AI Compute Sponsorship',
      source: 'Devpost',
      url: 'https://example.com/bigco-compute',
      location: 'Global',
      starts_at: '2026-07-25',
      status: 'open',
      judgment: 'rejected',
      reason: 'Corporate sponsorship, not a research grant.',
      reasoning:
        'Offers compute credits in exchange for branding — a corporate sponsorship deal rather than an open research grant. Reject cases exclude sponsorships.',
      criteria: [
        { ok: false, text: 'Sponsorship, not a grant' },
        { ok: true, text: 'AI-related' },
      ],
    },
    {
      title: 'EA Long-Term Future Fund — AI Track',
      source: 'Grants.gov',
      url: 'https://example.com/ltff-ai',
      location: 'Remote-friendly',
      starts_at: '2026-10-15',
      status: 'open',
      judgment: 'accepted',
      reason: 'Rolling AI research grant, open to independents.',
      reasoning:
        'Rolling-deadline grant funding AI/ML research, explicitly open to independent and early-career researchers. Matches all must-match criteria.',
      criteria: [
        { ok: true, text: 'Funds AI research' },
        { ok: true, text: 'Open to independents' },
        { ok: true, text: 'Rolling deadline' },
      ],
    },
  ],
};

/** Spec stub returned when a brand-new watch is created (no API key path). */
export function stubSpecFor(queryText) {
  const q = queryText.toLowerCase();
  const must_match = ['Matches the described intent'];
  const reject_cases = ['Clearly off-topic results'];

  if (q.includes('in person') || q.includes('in-person')) {
    must_match.push('In-person event (not virtual-only)');
    reject_cases.push('Online / virtual-only events');
  }
  if (q.match(/\bml\b|ai|machine learning|hackathon/)) {
    must_match.push('ML / AI / data themed');
    reject_cases.push('Pure Web3 / crypto events');
  }
  if (q.match(/\bsf\b|san francisco|mi\b|miles|within/)) {
    must_match.push('Within the specified radius');
    reject_cases.push('Outside the specified radius');
  }
  if (q.match(/open|registration|deadline/)) {
    must_match.push('Registration / deadline still open');
    reject_cases.push('Already closed or past deadline');
  }
  return { must_match, reject_cases };
}

/** Live-fire candidate — injected on demand to fire amber on cue during a demo. */
export const LIVE_FIRE_CANDIDATE = {
  title: 'NEW: SF In-Person LLM Agents Hackathon — Just Opened',
  source: 'Devpost',
  url: 'https://example.com/sf-llm-agents',
  location: 'San Francisco, CA',
  starts_at: '2026-07-18',
  status: 'open',
  judgment: 'accepted',
  reason: 'Brand-new in-person LLM hackathon in SF — registration just opened.',
  reasoning:
    'Detected on the most recent poll: an in-person LLM/agents hackathon in downtown SF whose registration opened minutes ago. Matches every must-match criterion and triggers no reject cases — surfaced immediately as a fresh, perishable match.',
  criteria: [
    { ok: true, text: 'In-person — downtown SF' },
    { ok: true, text: 'LLM/agents = ML theme' },
    { ok: true, text: '0mi (in SF)' },
    { ok: true, text: 'Registration just opened' },
  ],
};
