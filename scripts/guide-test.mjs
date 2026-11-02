// Local test of the guide endpoints with a fake Notion and a fake Resend. Sends nothing real.
//   node scripts/guide-test.mjs
import http from 'node:http';
import { spawn } from 'node:child_process';
import worker from '../worker/index.js';
import { unsubToken } from '../worker/quiz/guide.js';

const NOTION = 'http://127.0.0.1:8798';
const emails = [];
const resend = http.createServer((req, res) => {
  let b = '';
  req.on('data', (c) => (b += c));
  req.on('end', () => { emails.push(JSON.parse(b)); res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"id":"x"}'); });
}).listen(8811);
const notionProc = spawn('node', ['scripts/fake-notion.mjs'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 700));

const base = { ASSETS: { fetch: async () => new Response('asset') }, NOTION_TOKEN: 'x', NOTION_QUIZ_DB_ID: 'db', NOTION_BASE_URL: `${NOTION}/v1`, RESEND_API_KEY: 'x', LEAD_EMAIL_FROM: 'from@example.com', LEAD_EMAIL_TO: 'owner@example.com', RESEND_BASE_URL: 'http://127.0.0.1:8811' };
const on = { ...base, GUIDE_URL: 'https://example.com/guide.pdf', GUIDE_UNSUB_SECRET: 'test-secret', GUIDE_NOTION_PROPS: '1' };

let n = 0, bad = 0;
const ok = (name, cond, extra = '') => { n++; if (!cond) bad++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  ' + extra}`); };
async function call(env, method, path, body, ip = '1.1.1.1') {
  const pending = [];
  const res = await worker.fetch(new Request(`https://ensemble-ai.io${path}`, { method, headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip, origin: 'https://ensemble-ai.io' }, body: body ? JSON.stringify(body) : undefined }), env, { waitUntil: (p) => pending.push(p) });
  await Promise.all(pending);
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text };
}
const dump = async () => (await (await fetch(`${NOTION}/_dump`)).json());
const lead = (sid, guide_consent) => ({ stage: 'complete', session_id: sid, answers: { industry: 'retail', size: 'solo', channels: ['whatsapp'], acquisition: 'social', sink: 'repeat_questions', hours: '2_5' }, contact: { name: 'בדיקה', whatsapp: '', email: 'visitor@example.com', consent: true, guide_consent }, utm: { source: '', medium: '', campaign: '' }, device: 'desktop', website: '' });
const sid = (k) => `00000000-0000-4000-8000-00000000000${k}`;

// 1. off by default
let r = await call(base, 'GET', '/api/guide/config');
ok('config: off when GUIDE_URL is not set', r.json?.on === false && !('url' in r.json));
r = await call(base, 'POST', '/api/guide', { session_id: sid(1), consent: true });
ok('POST /api/guide: 404 when the feature is off', r.status === 404 && r.json?.error === 'guide_off');
r = await call(on, 'GET', '/api/guide/config');
ok('config: on with GUIDE_URL, the secret and the Notion properties', r.json?.on === true);
ok('config: never gives out the guide link', !JSON.stringify(r.json).includes('guide.pdf') && !('url' in r.json));
r = await call({ ...on, GUIDE_UNSUB_SECRET: undefined }, 'GET', '/api/guide/config');
ok('config: off without the unsubscribe secret', r.json?.on === false);
r = await call({ ...on, GUIDE_NOTION_PROPS: undefined }, 'GET', '/api/guide/config');
ok('config: off until GUIDE_NOTION_PROPS=1 (consent and unsubscribe need a place to be recorded)', r.json?.on === false);

// 2. a lead with the guide box ticked is stored with guide_consent
r = await call(on, 'POST', '/api/analyze', lead(sid(1), true));
ok('analyze: still works with guide_consent', r.status === 200 && r.json?.ok === true, JSON.stringify(r.json));
ok('notion: guide_consent saved when GUIDE_NOTION_PROPS=1', (await dump()).find((p) => p.guide_consent === true) !== undefined);
const emailsBeforeGuide = emails.length;

// 3. consent is required
r = await call(on, 'POST', '/api/guide', { session_id: sid(1), consent: false });
ok('guide: consent false is refused', r.status === 400 && r.json?.error === 'consent_required' && emails.length === emailsBeforeGuide);
r = await call(on, 'POST', '/api/guide', { session_id: 'nope', consent: true });
ok('guide: bad session id is refused', r.status === 400);
r = await call(on, 'POST', '/api/guide', { session_id: sid(9), consent: true });
ok('guide: unknown lead is refused, no email, no guide link', r.status === 404 && emails.length === emailsBeforeGuide && !r.text.includes('guide.pdf'));
r = await call(on, 'POST', '/api/guide', { session_id: sid(1), consent: false });
ok('guide: consent false gives no guide link', !r.text.includes('guide.pdf'));

// 4. consent true: one email, the url, the date in Notion
r = await call(on, 'POST', '/api/guide', { session_id: sid(1), consent: true });
const sent = emails.slice(emailsBeforeGuide);
ok('guide: consent true returns ok and the url', r.status === 200 && r.json?.ok && r.json?.url === 'https://example.com/guide.pdf', JSON.stringify(r.json));
ok('guide: exactly one email, to the visitor', sent.length === 1 && sent[0].to?.[0] === 'visitor@example.com', JSON.stringify(sent.map((e) => e.to)));
const mail = sent[0] || {};
ok('email: approved subject', mail.subject === 'המדריך שלכם: איך בונים את הסוכן הראשון');
ok('email: greeting uses the name', (mail.text || '').startsWith('שלום בדיקה,'));
ok('email: guide link and one booking link', (mail.text || '').includes('https://example.com/guide.pdf') && ((mail.text || '').match(/cal\.com/g) || []).length === 1);
ok('email: unsubscribe link with a token', /\/api\/guide\/unsubscribe\?t=/.test(mail.text || ''));
ok('email: no "free" / "חינם"', !/free|חינם/i.test(mail.text || ''));
ok('notion: guide_sent_at saved', (await dump()).find((p) => p.guide_sent_at) !== undefined);

// 5. a second call does not send again unless asked
r = await call(on, 'POST', '/api/guide', { session_id: sid(1), consent: true });
ok('guide: second call does not send a second email', r.json?.already_sent === true && emails.length === emailsBeforeGuide + 1);
r = await call(on, 'POST', '/api/guide', { session_id: sid(1), consent: true, resend: true });
ok('guide: resend:true sends again', emails.length === emailsBeforeGuide + 2);

// 6. unsubscribe
const token = await unsubToken(on, sid(1));
r = await call(on, 'GET', '/api/guide/unsubscribe?t=bad.token');
ok('unsubscribe: a bad token is refused', r.status === 400 && !(r.text || '').includes('הוסרתם'));
r = await call(on, 'GET', `/api/guide/unsubscribe?t=${token.slice(0, -2)}xx`);
ok('unsubscribe: a tampered signature is refused', r.status === 400);
r = await call(on, 'GET', `/api/guide/unsubscribe?t=${encodeURIComponent(token)}`);
ok('unsubscribe: a good token shows the approved line', r.status === 200 && r.text.includes('הוסרתם מהרשימה. לא אשלח לכם עוד מיילים.'));
const after = await dump();
ok('notion: guide_unsubscribed_at saved and guide_consent cleared', after.some((p) => p.guide_unsubscribed_at) && after.some((p) => p.guide_consent === false));

// 7. the feature is off when the Notion properties are not switched on: the unsubscribe endpoint is off too
const noProps = { ...on, GUIDE_NOTION_PROPS: undefined };
r = await call(noProps, 'GET', `/api/guide/unsubscribe?t=${encodeURIComponent(await unsubToken(noProps, sid(1)))}`);
ok('feature off without GUIDE_NOTION_PROPS: unsubscribe endpoint is off', r.status === 404);

// 7b. a record that cannot be stored is never dropped silently: Asaf gets a note
const beforeNote = emails.length;
await fetch(`${NOTION}/_reject?on=1`);
r = await call(on, 'GET', `/api/guide/unsubscribe?t=${encodeURIComponent(token)}`);
const note = emails.slice(beforeNote);
ok('unsubscribe when Notion rejects the record: the page still answers', r.status === 200 && r.text.includes('הוסרתם'));
ok('unsubscribe when Notion rejects the record: a note goes to Asaf', note.length === 1 && note[0].to?.[0] === 'owner@example.com' && note[0].subject.includes('לא נשמרה'), JSON.stringify(note.map((n) => n.subject)));
await fetch(`${NOTION}/_reject?on=0`);

// 8. lead saving survives a Notion without the properties
await fetch(`${NOTION}/_reject?on=1`);
r = await call(on, 'POST', '/api/analyze', lead(sid(2), true));
ok('notion rejects guide properties: the lead is still saved and answered', r.status === 200 && r.json?.ok === true);
ok('notion rejects guide properties: the lead row exists without them', (await dump()).some((p) => p.id && p.email === 'visitor@example.com' && p.guide_consent === undefined));
await fetch(`${NOTION}/_reject?on=0`);

// 9. email not configured
r = await call({ ...on, RESEND_API_KEY: undefined }, 'POST', '/api/guide', { session_id: sid(2), consent: true }, '2.2.2.2');
ok('guide: email not configured gives an error with the url, so the page can offer the download', r.status === 502 && r.json?.error === 'email_not_configured' && r.json?.url);

// 10. rate limit (5 per hour per IP)
let last;
for (let i = 0; i < 7; i++) last = await call(on, 'POST', '/api/guide', { session_id: sid(1), consent: true }, '9.9.9.9');
ok('guide: rate limited after 5 per hour per IP', last.status === 429);

console.log(`\n${n - bad}/${n} passed`);
notionProc.kill();
resend.close();
process.exit(bad ? 1 : 0);
