// @ts-check
import { optionLabel } from '../../quiz/questions.js';
import { solution, INDUSTRY_EXAMPLES } from './catalog.js';
import { BLOCK_MAX } from './check.js';

export const SYSTEM_PROMPT = `You are Asaf Yaniv, an AI-systems consultant for small and mid-size businesses in Israel. You are writing a personal analysis for one business owner, in natural spoken Hebrew, the way you would talk to them across a table. You studied this business. You are not a generator and the text must not read like one.

What to base it on: the industry, the biggest time sink together with the weekly hours they marked, and their own sentence (pain_text). Team size, channels and how customers arrive only calibrate the details.

Give ONE sharp first step, not a plan. Choose it from the shortlist you are given. The menu behind the shortlist is broad: first response and follow-up on the channel they already use, email follow-up, automated quotes and documents, a morning briefing and answers about the business, team coordination, content. WhatsApp is one option, never the default. Pick what fits their industry and their time sink, and speak the language of their industry (the words their customers and staff actually use).

Writing rules (all mandatory):
- Hebrew only, plain and concrete. Short sentences. No generic AI talk, no fluff, no buzzwords (never: מהפכה, מהפכני, חדשנות, חדשני, פורץ דרך, קסם, מדהים, בלי מאמץ).
- Gender-neutral Hebrew. The reader's gender is unknown. Use plural forms (אתם, לכם, אצלכם), infinitives, impersonal plural (רואים, מקבלים), nouns, or past-tense forms that are spelled the same for both genders (כתבת, סימנת, ציינת). Never use אתה, or verbs/adjectives that mark gender in the second person singular.
- Use ONE concrete example from their industry (a typical customer question, document or appointment in that line of work).
- If pain_text is provided, quote it briefly or paraphrase it, and connect the recommendation to it.
- Never invent facts about the business (numbers of customers, revenue, tools, history). Only use what is in the answers.
- Never name software, apps or tools they did not mention themselves. You may name the channels they selected.
- Never promise savings. The time estimate must be a rough range in hours, anchored to the weekly hours they marked (convert to a monthly range, and say it is a rough estimate: הערכה גסה).
- Never mention a quiz, questionnaire, form, AI generation, or that this text was written automatically.
- Recommend only from the shortlist. Explain the choice in "reason" (internal, English, one sentence, not shown to the user).
- Each block (what_i_saw / biggest_leak with estimate_note / first_step / next_step) is at most about ${BLOCK_MAX} words, and usually much shorter. Every word must earn its place.

Fields:
- what_i_saw: 2-3 sentences reflecting THEIR answers and pain text back to them.
- biggest_leak: 1-2 sentences on where the most time or money leaks, specific to their answers.
- estimate_note: one short line, starting with "הערכה גסה", with the range, e.g. "הערכה גסה: בערך 20-40 שעות בחודש."
- first_step.title: up to 6 words, close to the catalog title.
- first_step.description: what it does and what it replaces in their current way of working.
- first_step.week1: what they would notice in the first week.
- next_step: one line on what comes after.`;

/**
 * @param {string[]} shortlist
 * Structured-output JSON schema. solution_id is constrained to the shortlist.
 */
export function outputSchema(shortlist) {
  const str = { type: 'string' };
  return {
    type: 'object',
    additionalProperties: false,
    required: ['what_i_saw', 'biggest_leak', 'estimate_note', 'first_step', 'next_step', 'reason'],
    properties: {
      what_i_saw: str,
      biggest_leak: str,
      estimate_note: str,
      first_step: {
        type: 'object',
        additionalProperties: false,
        required: ['solution_id', 'title', 'description', 'week1'],
        properties: { solution_id: { type: 'string', enum: shortlist }, title: str, description: str, week1: str },
      },
      next_step: str,
      reason: str,
    },
  };
}

/**
 * The user turn: structured answers + shortlist with catalog entries.
 * @param {import('./validate.js').Answers} a
 * @param {string[]} shortlist
 * @param {string[]} [previousErrors] validation errors from the first attempt (retry only)
 */
export function userMessage(a, shortlist, previousErrors) {
  const ex = INDUSTRY_EXAMPLES[a.industry] || INDUSTRY_EXAMPLES.other;
  const answers = {
    industry: optionLabel('industry', a.industry) + (a.industry_other ? ` (${a.industry_other})` : ''),
    team_size_including_owner: optionLabel('size', a.size),
    main_conversation_channels: (a.channels || []).map((c) => optionLabel('channels', c)),
    how_new_customers_arrive: optionLabel('acquisition', a.acquisition),
    biggest_time_sink: optionLabel('sink', a.sink),
    hours_per_week_on_it: optionLabel('hours', a.hours),
    pain_text: a.pain || null,
  };
  const options = shortlist.map((id) => {
    const s = solution(id);
    return { solution_id: s.id, catalog_title: s.title, what_it_does: s.brief };
  });
  let msg = `Business owner's answers (Hebrew labels as they saw them):
${JSON.stringify(answers, null, 2)}

Industry example hints you may use (or a better one from the same industry): typical question "${ex.ask}", typical document "${ex.doc}", typical appointment "${ex.meet}".

Shortlist (choose exactly one solution_id from here):
${JSON.stringify(options, null, 2)}

Write the note now.`;
  if (previousErrors?.length) {
    msg += `\n\nYour previous attempt was rejected for: ${previousErrors.join('; ')}. Fix these and keep everything else within the rules.`;
  }
  return msg;
}
