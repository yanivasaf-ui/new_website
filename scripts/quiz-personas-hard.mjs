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
  { industry: 'professional', size: 'solo', channels: ['email', 'phone'], acquisition: 'referrals', sink: 'documents', hours: 'lt2', pain: 'לפעמים שוכח לשלוח חשבונית' },
  { industry: 'other', industry_other: 'תוכנת CRM לניהול משרדי ביטוח', size: '6_15', channels: ['email', 'crm'], acquisition: 'outbound', sink: 'lead_followup', hours: '5_10', pain: 'לידים מגיעים מדמואים ואף אחד לא עוקב' },
  { industry: 'retail', size: '2_5', channels: ['whatsapp', 'phone'], acquisition: 'social', sink: 'reporting', hours: '2_5', pain: 'הכל' },
  { industry: 'health_beauty', size: '2_5', channels: ['phone', 'whatsapp'], acquisition: 'referrals', sink: 'scheduling', hours: '5_10', pain: 'Patients cancel last minute and I lose the slot' },
  { industry: 'professional', size: '50_plus', channels: ['email', 'internal_chat'], acquisition: 'referrals', sink: 'reporting', hours: '10_plus', pain: 'כל חודש בונים דוחות ידנית מארבע מערכות' },
  { industry: 'realestate_finance', size: 'solo', channels: ['whatsapp', 'phone'], acquisition: 'google', sink: 'lead_followup', hours: '10_plus', pain: 'לידים מגוגל נעלמים אחרי השיחה הראשונה' },
  { industry: 'education', size: 'solo', channels: ['whatsapp'], acquisition: 'referrals', sink: 'documents', hours: '2_5', pain: 'גביית כספים מהורים' },
  { industry: 'hospitality', size: '6_15', channels: ['phone', 'in_person'], acquisition: 'google', sink: 'other', hours: '5_10', pain: '' },
  { industry: 'construction', size: '16_50', channels: ['phone', 'email'], acquisition: 'repeat', sink: 'team', hours: '10_plus', pain: 'אני לא מאמין שזה באמת יעזור, אבל בוא נראה' },
  { industry: 'retail', size: 'solo', channels: ['internal_chat'], acquisition: 'website', sink: 'team', hours: '2_5', pain: 'אין לי עובדים אבל הרבה דברים לעקוב' },
  { industry: 'other', industry_other: 'מפיק אירועים', size: '2_5', channels: ['whatsapp', 'email'], acquisition: 'referrals', sink: 'documents', hours: '5_10', pain: 'כל אירוע עם הצעה, חוזה, ספקים, לוחות זמנים בכל מיני מקומות' },
  { industry: 'professional', size: '6_15', channels: ['crm', 'phone'], acquisition: 'repeat', sink: 'repeat_questions', hours: '2_5', pain: 'לקוחות שואלים אותי "איפה זה עומד" כל שבוע' },
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

console.log(`mode: ${env.ANTHROPIC_API_KEY ? `live LLM (${env.ANTHROPIC_MODEL || 'claude-sonnet-5-5'})` : 'template only (no ANTHROPIC_API_KEY)'}\n`);

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
