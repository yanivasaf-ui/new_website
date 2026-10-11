// @ts-check
// Placeholder until the analysis engine lands (step 2).

/**
 * @typedef {Object} AnalysisResult
 * @property {string} what_i_saw
 * @property {string} biggest_leak
 * @property {string} estimate_note
 * @property {{ solution_id: string, title: string, description: string, week1: string }} first_step
 * @property {string} next_step
 *
 * @typedef {Object} Analysis
 * @property {'llm'|'template'} source
 * @property {AnalysisResult} result
 * @property {string[]} shortlist
 * @property {string} [reason]
 * @property {string} [error]
 */

/** @param {import('../index.js').Env} _env @param {import('./validate.js').Submission} _sub @returns {Promise<Analysis>} */
export async function analyze(_env, _sub) {
  return {
    source: 'template',
    shortlist: ['map_first'],
    result: {
      what_i_saw: '',
      biggest_leak: '',
      estimate_note: '',
      first_step: { solution_id: 'map_first', title: '', description: '', week1: '' },
      next_step: '',
    },
  };
}

/** Flattens a result into plain text for the Notion `analysis` field. @param {AnalysisResult} r */
export function analysisToText(r) {
  return [
    `מה ראיתי: ${r.what_i_saw}`,
    `המקום הכי יקר: ${r.biggest_leak} (${r.estimate_note})`,
    `הצעד הראשון: ${r.first_step.title}. ${r.first_step.description} שבוע ראשון: ${r.first_step.week1}`,
    `ומה אחר כך: ${r.next_step}`,
  ].join('\n');
}
