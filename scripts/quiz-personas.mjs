// Runs 12 test personas (industry x size x sink) through the analysis engine and prints
// the full Hebrew output for review. Live LLM when ANTHROPIC_API_KEY is set (env or .dev.vars),
// otherwise the template fallback.
//   node scripts/quiz-personas.mjs            all personas
//   node scripts/quiz-personas.mjs 2 5        only personas #2 and #5
//   node scripts/quiz-personas.mjs --template force template output
import { readFileSync, existsSync } from 'node:fs';
import { analyze } from '../worker/quiz/analysis.js';
import { checkResult } from '../worker/quiz/check.js';
import { optionLabel } from '../quiz/questions.js';

const PERSONAS = [
  { industry: 'professional', size: 'solo', channels: ['whatsapp', 'email'], acquisition: 'referrals', sink: 'repeat_questions', hours: '5_10', pain: 'לקוחות שולחים לי שאלות על מסמכים בכל שעה, גם בשבת' },
  { industry: 'construction', size: '6_15', channels: ['whatsapp', 'phone'], acquisition: 'referrals', sink: 'scheduling', hours: '5_10', pain: 'אני מתאם את אותו סיור באתר שלוש פעמים כי הלקוח לא עונה' },
  { industry: 'retail', size: '2_5', channels: ['whatsapp'], acquisition: 'social', sink: 'repeat_questions', hours: '10_plus', pain: '' },
  { industry: 'hospitality', size: '16_50', channels: ['internal_chat', 'phone'], acquisition: 'google', sink: 'team', hours: '10_plus', pain: 'כל משמרת מתחילה בעשרה טלפונים של מי מגיע ומי מחליף את מי' },
  { industry: 'health_beauty', size: 'solo', channels: ['whatsapp'], acquisition: 'social', sink: 'scheduling', hours: '2_5', pain: 'מטופלות מבטלות ברגע האחרון ואני נשארת עם חור ביומן' },
  { industry: 'realestate_finance', size: '2_5', channels: ['phone', 'whatsapp'], acquisition: 'google', sink: 'lead_followup', hours: '5_10', pain: 'מגיעים לידים מהפרסום ואני לא מספיק לחזור לכולם באותו יום' },
  { industry: 'education', size: '6_15', channels: ['email'], acquisition: 'website', sink: 'documents', hours: '2_5', pain: '' },
  { industry: 'other', industry_other: 'סטודיו לעיצוב גרפי', size: 'solo', channels: ['email'], acquisition: 'referrals', sink: 'other', hours: '5_10', pain: 'אני מנהל את הכל מהראש ושוכח לשלוח דברים בזמן' },
  { industry: 'professional', size: '16_50', channels: ['email', 'crm'], acquisition: 'referrals', sink: 'reporting', hours: '5_10', pain: 'כל סוף חודש אני יושב יומיים לבנות דוח לשותפים' },
  { industry: 'construction', size: '2_5', channels: ['whatsapp', 'phone'], acquisition: 'referrals', sink: 'documents', hours: '5_10', pain: 'הצעות מחיר לוקחות לי ערבים שלמים' },
  { industry: 'retail', size: '50_plus', channels: ['email', 'internal_chat'], acquisition: 'social', sink: 'content', hours: '10_plus', pain: 'צריך פוסט כל יום ואין מי שיכתוב' },
  { industry: 'health_beauty', size: '6_15', channels: ['phone'], acquisition: 'referrals', sink: 'other', hours: 'lt2', pain: '' },
];

const env = { ...process.env };
if (existsSync('.dev.vars')) {
  for (const line of readFileSync('.dev.vars', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && m[2] && !env[m[1]]) env[m[1]] = m[2];
  }
}
const args = process.argv.slice(2);
if (args.includes('--template')) delete env.ANTHROPIC_API_KEY;
const only = args.filter((x) => /^\d+$/.test(x)).map(Number);

console.log(`mode: ${env.ANTHROPIC_API_KEY ? `live LLM (${env.ANTHROPIC_MODEL || 'claude-opus-5-5'})` : 'template only (no ANTHROPIC_API_KEY)'}\n`);

for (const [i, answers] of PERSONAS.entries()) {
  const n = i + 1;
  if (only.length && !only.includes(n)) continue;
  const an = await analyze(env, { stage: 'complete', session_id: '00000000-0000-4000-8000-000000000000', answers, contact: null, utm: { source: '', medium: '', campaign: '' }, device: 'test' });
  if (!an.ok) { console.log(`━━━━━━━━ #${n} FAILED: ${an.errors.join(' | ')}\n`); continue; }
  const r = an.result;
  const check = checkResult(r, an.shortlist);
  console.log(`━━━━━━━━ #${n} ${optionLabel('industry', answers.industry)}${answers.industry_other ? ` (${answers.industry_other})` : ''} · ${optionLabel('size', answers.size)} · ${optionLabel('sink', answers.sink)} · ${optionLabel('hours', answers.hours)} ש׳`);
  console.log(`channels: ${answers.channels.map((c) => optionLabel('channels', c)).join(', ')} · acquisition: ${optionLabel('acquisition', answers.acquisition)}`);
  console.log(`pain: ${answers.pain || '—'}`);
  console.log(`shortlist: [${an.shortlist.join(', ')}]  (${an.trace.join(' | ')})`);
  console.log(`source: ${an.source} · ${an.ms}ms · ${check.words} words · checks: ${check.ok ? 'pass' : check.errors.join('; ')}`);
  if (an.reason) console.log(`reason: ${an.reason}`);
  if (an.errors?.length && an.source === 'template') console.log(`llm: ${an.errors.join(' | ')}`);
  console.log(`\nמה ראיתי\n  ${r.what_i_saw}`);
  console.log(`המקום הכי יקר שלך\n  ${r.biggest_leak}\n  ${r.estimate_note}`);
  console.log(`מה הייתי בונה לכם: ${r.product.name} [${r.product.solution_id}]\n  ${r.product.does}\n  זמן בנייה: ${r.product.days} ימים\n  בשבוע הראשון: ${r.product.week1}\n`);
}
