// Lead-status regression test: autosave and re-submits must never move a lead backwards
// (partial < complete < booked-click). Needs the Worker running against scripts/fake-notion.mjs:
//   node scripts/fake-notion.mjs &
//   wrangler dev --port 8787 --var NOTION_TOKEN:x --var NOTION_QUIZ_DB_ID:db --var NOTION_BASE_URL:http://127.0.0.1:8798/v1 \
//     --var ANTHROPIC_API_KEY:sk-test --var ANTHROPIC_BASE_URL:http://127.0.0.1:8799     (any LLM stand-in, or none: template result)
//   node scripts/quiz-status-test.mjs
const BASE = process.env.BASE || 'http://localhost:8787';
const DUMP = process.env.NOTION_DUMP || 'http://127.0.0.1:8798/_dump';
const ip = `10.9.${Math.floor(Math.random() * 200)}.${Math.floor(Math.random() * 200)}`;
const sid = crypto.randomUUID();
const answers = { industry: 'construction', size: '6_15', channels: ['phone'], acquisition: 'referrals', sink: 'scheduling', hours: '5_10', pain: 'TEST' };

const post = (path, body) =>
  fetch(BASE + path, { method: 'POST', headers: { 'content-type': 'application/json', origin: BASE, 'cf-connecting-ip': ip }, body: JSON.stringify(body) }).then((r) => r.status);
const lookup = async () => { const all = await (await fetch(DUMP)).json(); return all[all.length - 1]; };
const settle = async (pred) => { for (let i = 0; i < 40; i++) { const r = await lookup(); if (r && pred(r)) return r; await new Promise((r) => setTimeout(r, 150)); } return lookup(); };

const rowsBefore = (await (await fetch(DUMP)).json()).length; // the store may already hold other rows
let failed = 0;
const check = (name, ok, detail) => { if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  → ${detail}`); };
const partial = (a) => post('/api/analyze', { stage: 'partial', session_id: sid, answers: a, utm: {}, device: 'mobile', website: '' });
const complete = (a) => post('/api/analyze', { stage: 'complete', session_id: sid, answers: a, contact: { name: 'TEST', whatsapp: '', email: 'test@example.com', consent: true }, utm: {}, device: 'mobile', website: '' });

await partial({ ...answers, pain: '' });
let r = await settle((x) => x.status === 'partial');
check('1. first autosave creates a partial row', r.status === 'partial' && r.name?.startsWith('anon-'), JSON.stringify(r));

await complete(answers);
r = await settle((x) => x.status === 'complete' && x.has_analysis);
check('2. submit upgrades it to complete, with analysis', r.status === 'complete' && r.has_analysis && r.name === 'TEST', JSON.stringify(r));

await partial({ ...answers, size: '2_5' }); // user went back from the result and autosave fires
await new Promise((x) => setTimeout(x, 600));
r = await lookup();
check('3. autosave after completion does NOT downgrade it, answers untouched', r.status === 'complete' && r.has_analysis && r.size === '6_15', JSON.stringify(r));

await post('/api/analyze/click', { session_id: sid });
r = await settle((x) => x.status === 'booked-click');
check('4. booking click upgrades it to booked-click', r.status === 'booked-click' && r.booking_clicked === true, JSON.stringify(r));

await partial({ ...answers, size: 'solo' });
await new Promise((x) => setTimeout(x, 600));
r = await lookup();
check('5. autosave after booked-click leaves it alone', r.status === 'booked-click' && r.size === '6_15', JSON.stringify(r));

await complete({ ...answers, size: '16_50' }); // re-submit after going back
await new Promise((x) => setTimeout(x, 1200));
r = await lookup();
check('6. re-submit keeps booked-click but updates the answers', r.status === 'booked-click' && r.size === '16_50' && r.has_analysis, JSON.stringify(r));

const all = await (await fetch(DUMP)).json();
check('7. one row for the whole session (no duplicates)', all.length === rowsBefore + 1, `rows added: ${all.length - rowsBefore}`);
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
