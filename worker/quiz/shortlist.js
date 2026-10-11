// @ts-check
// Deterministic shortlist: which 1-2 catalog entries the LLM may choose from.
// Edit the tables below; rules are evaluated top to bottom.

/** @typedef {import('./validate.js').Answers} Answers */

const LARGER_TEAM = ['6_15', '16_50', '50_plus'];

/** sink -> primary candidate */
export const PRIMARY_BY_SINK = {
  repeat_questions: 'inquiry_responder', // S1
  scheduling: 'scheduling_followup', // S2
  documents: 'quote_docs', // S3
  lead_followup: 'lead_followup_engine', // S4
  reporting: 'owner_briefing', // S5
  team: 'team_coordination', // S6
  content: 'content_assistant', // S7
  other: 'map_first', // S9
};

/** Hard guard: S9 is the only default. S1/S8 are never used as a fallback. */
export const FALLBACK = 'map_first';

/** Overrides of the primary. First match wins. */
export const PRIMARY_OVERRIDES = [
  {
    why: 'sink=other, solo owner, wrote a pain text -> personal assistant',
    when: (/** @type {Answers} */ a) => a.sink === 'other' && a.size === 'solo' && Boolean(a.pain),
    solution: 'personal_ops_assistant', // S8
  },
];

/**
 * Second-candidate rules. First rule whose candidate differs from the primary wins.
 * `lock: true` keeps the primary alone (no alternative offered to the LLM).
 */
export const SECOND_RULES = [
  {
    why: 'WhatsApp + repeat questions: S1 stays',
    when: (/** @type {Answers} */ a) => a.sink === 'repeat_questions' && (a.channels || []).includes('whatsapp'),
    lock: true,
  },
  {
    why: 'team of 6+ wasting time on team coordination -> also consider owner briefing',
    when: (/** @type {Answers} */ a) => LARGER_TEAM.includes(a.size) && a.sink === 'team',
    solution: 'owner_briefing', // S5
  },
  {
    why: 'team of 6+ wasting time on reporting -> also consider team coordination',
    when: (/** @type {Answers} */ a) => LARGER_TEAM.includes(a.size) && a.sink === 'reporting',
    solution: 'team_coordination', // S6
  },
  {
    why: 'solo owner -> personal assistant',
    when: (/** @type {Answers} */ a) => a.size === 'solo',
    solution: 'personal_ops_assistant', // S8
  },
  {
    why: 'leads arrive from social / Google / website -> lead follow-up',
    when: (/** @type {Answers} */ a) => ['social', 'google', 'website'].includes(a.acquisition),
    solution: 'lead_followup_engine', // S4
  },
];

/**
 * @param {Answers} a
 * @returns {{ ids: string[], trace: string[] }}
 */
export function buildShortlist(a) {
  const trace = [];
  let primary = PRIMARY_BY_SINK[a.sink] || FALLBACK;
  trace.push(`primary ${primary} (sink=${a.sink})`);
  const override = PRIMARY_OVERRIDES.find((r) => r.when(a));
  if (override) {
    primary = override.solution;
    trace.push(`override -> ${primary}: ${override.why}`);
  }

  let second = null;
  for (const rule of SECOND_RULES) {
    if (!rule.when(a)) continue;
    if (rule.lock) {
      trace.push(`lock: ${rule.why}`);
      return { ids: [primary], trace };
    }
    if (rule.solution !== primary) {
      second = rule.solution;
      trace.push(`second ${second}: ${rule.why}`);
      break;
    }
  }
  if (!second) {
    second = FALLBACK;
    trace.push(`second ${FALLBACK}: fallback`);
  }
  return { ids: second === primary ? [primary] : [primary, second], trace };
}
