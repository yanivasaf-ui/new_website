// @ts-check
// Quiz page. Vanilla JS, no dependencies. All text is set with textContent (never innerHTML).
import { question, LIMITS } from './questions.js';
import { normalizeIlMobile } from './phone.js';

const CAL_URL = 'https://cal.com/asaf-yaniv-hlwofj/30min';
const SITE_URL = 'https://ensemble-ai.io/he/';
const STORE_KEY = 'ensemble-quiz-v1';
const TYPING_MS = 650; // dots shown before each question
const ANALYZING_MIN_MS = 4000; // dots shown while the analysis loads (never shorter than this)
const REQUEST_TIMEOUT_MS = 40_000;
const ADVANCE_MS = 180; // pause so the tapped option is seen before moving on
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
/** answer field -> question step, for recovering from a server-side "invalid option" */
const FIELD_STEP = { industry: 1, size: 2, channels: 3, acquisition: 4, sink: 5, hours: 5 };

const app = /** @type {HTMLElement} */ (document.getElementById('app'));

/* ------------------------------------------------------------------ helpers */

/**
 * Tiny element builder. `text` sets textContent; `on*` adds listeners; value/checked/disabled are props.
 * @param {string} tag @param {Record<string, any>} [props] @param {...any} kids
 * @returns {HTMLElement}
 */
function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'value' || k === 'checked' || k === 'disabled') /** @type {any} */ (el)[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

const sleep = (/** @type {number} */ ms) => new Promise((r) => setTimeout(r, ms));

function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const x = [...b].map((n) => n.toString(16).padStart(2, '0')).join('');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}

/* -------------------------------------------------------------------- state */

/**
 * @typedef {Object} State
 * @property {string} sid
 * @property {number|'result'} step  0 hero, 1-6 questions, 7 contact, 'result'
 * @property {Record<string, any>} a answers
 * @property {{ name: string, whatsapp: string, email: string, consent: boolean }} c
 * @property {{ source: string, medium: string, campaign: string }} utm
 * @property {any} result
 */

/** @returns {State} */
const blank = () => ({ sid: uuid(), step: 0, a: {}, c: { name: '', whatsapp: '', email: '', consent: false }, utm: { source: '', medium: '', campaign: '' }, result: null });

function load() {
  const fresh = blank();
  try {
    if (new URLSearchParams(location.search).has('reset')) {
      localStorage.removeItem(STORE_KEY);
      history.replaceState(null, '', location.pathname);
    } else {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
      if (saved?.v === 1 && saved.s?.sid) Object.assign(fresh, saved.s, { c: { ...fresh.c, ...saved.s.c }, a: saved.s.a || {} });
    }
  } catch {
    /* storage unavailable or corrupt: start fresh */
  }
  const q = new URLSearchParams(location.search);
  if (!fresh.utm.source && !fresh.utm.medium && !fresh.utm.campaign) {
    fresh.utm = { source: q.get('utm_source') || '', medium: q.get('utm_medium') || '', campaign: q.get('utm_campaign') || '' };
  }
  if (fresh.step === 'result' && !fresh.result) fresh.step = 7;
  return fresh;
}

let S = load();

function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ v: 1, s: S }));
  } catch {
    /* private mode / quota: the quiz still works, it just won't survive a refresh */
  }
}

/* ------------------------------------------------------------------ network */

/** @param {'partial'|'complete'} stage */
function payload(stage) {
  const hp = /** @type {HTMLInputElement|null} */ (document.querySelector('input[name="website"]'));
  const device = innerWidth < 768 ? 'mobile' : innerWidth < 1100 ? 'tablet' : 'desktop';
  return {
    stage,
    session_id: S.sid,
    answers: S.a,
    contact: stage === 'complete' ? S.c : undefined,
    utm: S.utm,
    device,
    website: hp ? hp.value : '',
  };
}

/** @param {string} path @param {any} body @param {AbortSignal} [signal] */
const post = (path, body, signal) => fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal });

/** Anonymous progress saves run one at a time so the server never creates duplicate rows. */
let partialQueue = Promise.resolve();
function sendPartial() {
  if (!(S.a.industry && S.a.size && S.a.channels?.length)) return;
  const body = payload('partial');
  partialQueue = partialQueue.then(() => post('/api/analyze', body).then(() => {}, () => {}));
}

/** @returns {Promise<{ kind: 'ok', data: any } | { kind: 'busy', retryAfter: number } | { kind: 'invalid', field: string } | { kind: 'error' }>} */
async function requestAnalysis() {
  await Promise.race([partialQueue, sleep(3000)]);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await post('/api/analyze', payload('complete'), ctrl.signal);
    if (res.status === 429) {
      const j = await res.json().catch(() => ({}));
      return { kind: 'busy', retryAfter: Number(j.retry_after) || Number(res.headers.get('retry-after')) || 60 };
    }
    if (res.status === 400) {
      const j = await res.json().catch(() => ({}));
      return { kind: 'invalid', field: String(j.field || '') };
    }
    if (!res.ok) return { kind: 'error' };
    const data = await res.json().catch(() => null);
    return data?.ok && validResult(data.result) ? { kind: 'ok', data } : { kind: 'error' };
  } catch {
    return { kind: 'error' };
  } finally {
    clearTimeout(timer);
  }
}

/** @param {any} r */
function validResult(r) {
  const s = (/** @type {any} */ x) => typeof x === 'string' && x.trim() !== '';
  return Boolean(r && s(r.what_i_saw) && s(r.biggest_leak) && s(r.estimate_note) && s(r.next_step) && r.first_step && s(r.first_step.title) && s(r.first_step.description) && s(r.first_step.week1));
}

/* -------------------------------------------------------------- navigation */

let nav = 0; // bumped on every navigation so a pending "typing" timer from an older screen is ignored

/** @param {number|'result'} step @param {{ typing?: boolean }} [opts] */
function go(step, { typing = false } = {}) {
  S.step = step;
  save();
  if (typeof step === 'number' && step >= 4 && step <= 7) sendPartial();
  const mine = ++nav;
  if (typing && typeof step === 'number' && step >= 1) {
    mount(header(step), h('main', { class: 'screen' }, h('div', { class: 'typing', 'aria-label': 'השאלה הבאה בדרך' }, h('i'), h('i'), h('i'))));
    setTimeout(() => {
      if (mine === nav) render();
    }, TYPING_MS);
  } else {
    render();
  }
}

/** @param {...Node} nodes */
function mount(...nodes) {
  app.replaceChildren(...nodes);
}

/** Re-render the current screen in place, keeping scroll and focus-free state. */
function refresh() {
  const sc = app.querySelector('.screen');
  const top = sc ? sc.scrollTop : 0;
  render({ focus: false });
  const next = app.querySelector('.screen');
  if (next) next.scrollTop = top;
}

/**
 * @param {number} n step number: 1-6 question, 7 contact. `back: false` hides the arrow.
 * @param {{ back?: boolean, dots?: boolean, backTo?: number }} [opts] backTo: where the arrow goes (default: previous step)
 */
function header(n, { back = true, dots = true, backTo = n - 1 } = {}) {
  const hideBack = !back || n <= 1;
  return h(
    'header',
    { class: 'bar' },
    h(
      'button',
      {
        class: 'bar__back',
        type: 'button',
        'aria-label': 'חזרה',
        disabled: hideBack,
        onclick: () => go(backTo),
      },
      backIcon(),
    ),
    h('img', { class: 'bar__logo', src: '/quiz/ensemble-lockup-ink.svg', alt: 'ensemble' }),
    h('span', { 'aria-hidden': 'true' }),
    dots ? h('div', { class: 'dots', 'aria-hidden': 'true' }, [1, 2, 3, 4, 5, 6].map((i) => h('i', { class: i < n ? 'on' : i === n ? 'now' : '' }))) : null,
  );
}

function backIcon() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2.2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M5 12h14M13 6l6 6-6 6');
  svg.append(path);
  return svg;
}

/** Question headline: the question is the hero of its screen. @param {string} text */
const headline = (text) => h('h2', { class: 'q', tabindex: '-1' }, text);

/**
 * One answer option. @param {string} label @param {boolean} pressed @param {() => void} onclick
 * @param {{ check?: boolean, disabled?: boolean, latin?: string }} [o]
 */
function opt(label, pressed, onclick, { check = false, disabled = false } = {}) {
  return h(
    'button',
    { class: 'opt', type: 'button', 'aria-pressed': String(pressed), 'aria-disabled': disabled ? 'true' : null, onclick: disabled ? null : onclick },
    check ? h('span', { class: 'opt__check' }) : null,
    h('span', {}, ...latinSpans(label)),
  );
}

/** Wrap Latin words (Slack/Teams, CRM) in the Latin face, and "10+" in an LTR run so the plus stays on the right. @param {string} text */
function latinSpans(text) {
  return text.split(/([A-Za-z][A-Za-z/]*|\d+\+)/).map((part) => {
    if (/^\d+\+$/.test(part)) return h('bdi', { dir: 'ltr' }, part);
    return /^[A-Za-z]/.test(part) ? h('span', { class: 'lat' }, part) : part;
  });
}

/** Tap an option, show it selected, then move on. @param {() => void} set @param {number} step */
function chooseAndAdvance(set, step) {
  set();
  save();
  refresh();
  const mine = ++nav;
  setTimeout(() => {
    if (mine === nav) go(step + 1, { typing: true });
  }, ADVANCE_MS);
}

/* ------------------------------------------------------------------ screens */

function heroScreen() {
  return h(
    'section',
    { class: 'hero' },
    h('a', { class: 'hero__nav', href: SITE_URL, 'aria-label': 'Ensemble' }, h('img', { src: '/ensemble-lockup-dark.svg', alt: 'ensemble' })),
    h(
      'div',
      { class: 'hero__body' },
      h('h1', { tabindex: '-1' }, 'מה בעסק שלך יכול לרוץ בלעדיך?'),
      h('p', { class: 'hero__sub' }, '6 שאלות, ניתוח אישי, ותדעו בדיוק איפה'),
      h('div', { 'data-slot': 'hero-video-v2', hidden: true }),
      h('button', { class: 'btn btn--block', type: 'button', onclick: () => go(1, { typing: true }) }, 'מתחילים'),
      h(
        'div',
        { class: 'hero__cred' },
        h('span', { class: 'avatar', 'aria-hidden': 'true' }, 'א'),
        h('span', {}, h('b', {}, 'אסף יניב, Ensemble AI.'), ' בונה מערכות AI לעסקים. לפני זה הוביל צוותי קריאייטיב ותפעול בקלטורה ובארטליסט.'),
      ),
    ),
  );
}

/** Q1: industry. "אחר" opens a required free-text field. */
function industryScreen() {
  const q = /** @type {NonNullable<ReturnType<typeof question>>} */ (question('industry'));
  const isOther = S.a.industry === 'other';
  const text = String(S.a.industry_other || '');
  const cont = h('button', { class: 'btn btn--block', type: 'button', disabled: !text.trim(), onclick: () => go(2, { typing: true }) }, 'המשך');
  const options = (q.options || []).map((o) =>
    opt(o.label, S.a.industry === o.id, () => {
      if (o.id === 'other') {
        S.a.industry = 'other';
        save();
        refresh();
        /** @type {HTMLInputElement|null} */ (app.querySelector('#industry-other'))?.focus();
      } else {
        chooseAndAdvance(() => {
          S.a.industry = o.id;
          delete S.a.industry_other;
        }, 1);
      }
    }),
  );
  const children = [h('main', { class: 'screen' }, headline(q.text), h('div', { class: 'opts', role: 'group', 'aria-label': q.text }, options), isOther ? otherInput(text, cont) : null)];
  if (isOther) children.push(h('div', { class: 'dock' }, cont));
  return [header(1), ...children];
}

/** @param {string} text @param {HTMLElement} cont */
function otherInput(text, cont) {
  return h('input', {
    class: 'input',
    id: 'industry-other',
    maxlength: LIMITS.industryOther,
    placeholder: 'במילה או שתיים',
    'aria-label': 'סוג העסק',
    'aria-required': 'true',
    enterkeyhint: 'next',
    value: text,
    oninput: (/** @type {Event} */ e) => {
      S.a.industry_other = /** @type {HTMLInputElement} */ (e.target).value;
      save();
      /** @type {HTMLButtonElement} */ (cont).disabled = !String(S.a.industry_other).trim();
    },
    onkeydown: (/** @type {KeyboardEvent} */ e) => {
      if (e.key === 'Enter' && String(S.a.industry_other || '').trim()) go(2, { typing: true });
    },
  });
}

/** Single-select question that advances on tap. @param {string} qid @param {number} step */
function singleScreen(qid, step) {
  const q = /** @type {NonNullable<ReturnType<typeof question>>} */ (question(qid));
  const options = (q.options || []).map((o) => opt(o.label, S.a[qid] === o.id, () => chooseAndAdvance(() => (S.a[qid] = o.id), step)));
  return [header(step), h('main', { class: 'screen' }, headline(q.text), h('div', { class: 'opts', role: 'group', 'aria-label': q.text }, options))];
}

/** Q3: multi-select, up to 2. */
function channelsScreen() {
  const q = /** @type {NonNullable<ReturnType<typeof question>>} */ (question('channels'));
  const chosen = /** @type {string[]} */ (S.a.channels || []);
  const max = q.max || 2;
  const options = (q.options || []).map((o) => {
    const on = chosen.includes(o.id);
    return opt(
      o.label,
      on,
      () => {
        S.a.channels = on ? chosen.filter((c) => c !== o.id) : [...chosen, o.id];
        save();
        refresh();
      },
      { check: true, disabled: !on && chosen.length >= max },
    );
  });
  return [
    header(3),
    h('main', { class: 'screen' }, headline(q.text), h('p', { class: 'q__hint' }, 'אפשר לבחור עד 2'), h('div', { class: 'opts', role: 'group', 'aria-label': q.text }, options)),
    h('div', { class: 'dock' }, h('button', { class: 'btn btn--block', type: 'button', disabled: chosen.length < 1, onclick: () => go(4, { typing: true }) }, 'המשך')),
  ];
}

/** Q5 (time sink) + Q5b (hours) on one screen. */
function sinkScreen() {
  const q = /** @type {NonNullable<ReturnType<typeof question>>} */ (question('sink'));
  const hq = /** @type {NonNullable<ReturnType<typeof question>>} */ (question('hours'));
  const pick = (/** @type {string} */ key, /** @type {string} */ id) => () => {
    S.a[key] = id;
    save();
    refresh();
  };
  // The hours row lives in the bottom dock next to המשך, so it is always on screen
  // while the (long) list of time sinks scrolls above it.
  return [
    header(5),
    h(
      'main',
      { class: 'screen' },
      headline(q.text),
      h('div', { class: 'opts', role: 'group', 'aria-label': q.text }, (q.options || []).map((o) => opt(o.label, S.a.sink === o.id, pick('sink', o.id)))),
    ),
    h(
      'div',
      { class: 'dock' },
      h('p', { class: 'q__sub' }, hq.text),
      h('div', { class: 'opts opts--wrap', role: 'group', 'aria-label': hq.text }, (hq.options || []).map((o) => opt(o.label, S.a.hours === o.id, pick('hours', o.id)))),
      h('button', { class: 'btn btn--block', type: 'button', disabled: !(S.a.sink && S.a.hours), onclick: () => go(6, { typing: true }) }, 'המשך'),
    ),
  ];
}

/** Q6: optional free text with counter and skip. */
function painScreen() {
  const q = /** @type {NonNullable<ReturnType<typeof question>>} */ (question('pain'));
  const max = LIMITS.pain;
  const text = String(S.a.pain || '');
  const counter = h('div', { class: 'counter', 'aria-hidden': 'true' }, `${text.length}/${max}`);
  const cont = h('button', { class: 'btn btn--block', type: 'button', disabled: !text.trim(), onclick: () => go(7, { typing: true }) }, 'המשך');
  const area = h('textarea', {
    class: 'input',
    rows: '3',
    maxlength: max,
    'aria-label': q.text,
    value: text,
    oninput: (/** @type {Event} */ e) => {
      const v = /** @type {HTMLTextAreaElement} */ (e.target).value;
      S.a.pain = v;
      save();
      counter.textContent = `${v.length}/${max}`;
      /** @type {HTMLButtonElement} */ (cont).disabled = !v.trim();
    },
  });
  const skip = h('button', { class: 'opt opt--skip', type: 'button', onclick: () => { S.a.pain = ''; go(7, { typing: true }); } }, 'דלג');
  return [header(6), h('main', { class: 'screen' }, headline(q.text), area, counter), h('div', { class: 'dock' }, cont, skip)];
}

/** Contact step. */
function contactScreen() {
  /** @type {Record<string, HTMLElement>} */
  const errEls = {};
  /** @param {string} name @param {string} label @param {Record<string, any>} attrs @param {string} [hint] */
  const field = (name, label, attrs, hint) => {
    const err = h('span', { class: 'field__error', id: `err-${name}`, hidden: true });
    errEls[name] = err;
    const input = h('input', {
      id: `f-${name}`,
      name,
      'aria-describedby': `err-${name}`,
      value: /** @type {any} */ (S.c)[name] || '',
      oninput: (/** @type {Event} */ e) => {
        /** @type {any} */ (S.c)[name] = /** @type {HTMLInputElement} */ (e.target).value;
        save();
        clearError(name);
      },
      ...attrs,
    });
    return h('div', { class: 'field', 'data-field': name }, h('label', { for: `f-${name}` }, label, hint ? h('small', {}, ` (${hint})`) : null), input, err);
  };
  /** @param {string} name */
  const clearError = (name) => {
    errEls[name].hidden = true;
    errEls[name].closest('.field')?.classList.remove('field--error');
    document.getElementById(`f-${name}`)?.removeAttribute('aria-invalid');
  };
  /** @param {string} name @param {string} msg */
  const showError = (name, msg) => {
    errEls[name].textContent = msg;
    errEls[name].hidden = false;
    errEls[name].closest('.field')?.classList.add('field--error');
    document.getElementById(`f-${name}`)?.setAttribute('aria-invalid', 'true');
  };

  const form = h(
    'form',
    {
      class: 'form',
      id: 'contact-form',
      novalidate: true,
      onsubmit: (/** @type {Event} */ e) => {
        e.preventDefault();
        /** @type {string[]} */
        const bad = [];
        const name = S.c.name.trim();
        if (name.length < 2) (showError('name', 'צריך להכניס שם'), bad.push('name'));
        if (!normalizeIlMobile(S.c.whatsapp)) (showError('whatsapp', 'צריך מספר נייד ישראלי, למשל 050-1234567'), bad.push('whatsapp'));
        if (S.c.email.trim() && !EMAIL_RE.test(S.c.email.trim())) (showError('email', 'כתובת המייל לא נראית תקינה'), bad.push('email'));
        if (bad.length) return document.getElementById(`f-${bad[0]}`)?.focus();
        S.c.name = name;
        S.c.email = S.c.email.trim();
        submit();
      },
    },
    field('name', 'שם', { autocomplete: 'name', enterkeyhint: 'next' }),
    field('whatsapp', 'מספר וואטסאפ', { type: 'tel', inputmode: 'tel', autocomplete: 'tel', dir: 'ltr', placeholder: '050-1234567', enterkeyhint: 'next' }),
    field('email', 'מייל', { type: 'email', inputmode: 'email', autocomplete: 'email', dir: 'ltr', enterkeyhint: 'done' }, 'לא חובה'),
    h('div', { class: 'hp', 'aria-hidden': 'true' }, h('label', {}, 'Website ', h('input', { name: 'website', tabindex: '-1', autocomplete: 'off' }))),
    h(
      'label',
      { class: 'consent' },
      h('input', { type: 'checkbox', name: 'consent', checked: S.c.consent, onchange: (/** @type {Event} */ e) => { S.c.consent = /** @type {HTMLInputElement} */ (e.target).checked; save(); } }),
      'מאשרים שאפשר לחזור אליכם בנוגע לניתוח',
    ),
  );
  // a server-side rejection (rare) is shown on the field it names
  if (pendingFieldError) {
    const { field: f, message } = pendingFieldError;
    pendingFieldError = null;
    queueMicrotask(() => errEls[f] && showError(f, message));
  }
  return [
    header(7),
    h('main', { class: 'screen' }, headline('מעולה. לאן לשלוח את הניתוח?'), form),
    h('div', { class: 'dock' }, h('button', { class: 'btn btn--block', type: 'submit', form: 'contact-form' }, 'לקבלת הניתוח'), h('p', { class: 'privacy' }, 'הפרטים משמשים רק כדי לחזור אליכם בנוגע לניתוח.')),
  ];
}

/** @type {{ field: string, message: string } | null} */
let pendingFieldError = null;

function analyzingScreen() {
  return [header(7, { back: false }), h('main', { class: 'screen' }, headline('עובר על התשובות'), h('div', { class: 'typing', 'aria-label': 'מנתח' }, h('i'), h('i'), h('i')))];
}

/** @param {string} title @param {string} text */
function stateScreen(title, text) {
  return [
    header(7, { backTo: 7 }),
    h('main', { class: 'screen' }, h('h2', { class: 'q', tabindex: '-1' }, title), h('p', { class: 'lead' }, text)),
    h(
      'div',
      { class: 'dock' },
      h('button', { class: 'btn btn--block', type: 'button', onclick: submit }, 'לנסות שוב'),
      h('a', { class: 'btn btn--ghost btn--block', href: CAL_URL }, 'או לקבוע שיחה ישר'),
    ),
  ];
}

/** @param {any} r */
function resultScreen(r) {
  const note = String(r.estimate_note).replace(/^\s*הערכה גסה\s*[:,\-–]?\s*/, '');
  const block = (/** @type {string} */ title, /** @type {any[]} */ ...kids) => h('section', { class: 'block' }, h('h2', {}, title), ...kids);
  return [
    header(7, { dots: false, backTo: 7 }),
    h(
      'main',
      { class: 'screen' },
      headline('ככה זה נראה מהצד שלי'),
      h(
        'div',
        { class: 'result' },
        block('מה ראיתי', h('p', {}, r.what_i_saw)),
        block('המקום הכי יקר שלך', h('p', {}, r.biggest_leak), h('div', { class: 'estimate' }, h('b', {}, 'הערכה גסה'), ' ', note)),
        h(
          'section',
          { class: 'block block--main' },
          h('h2', {}, 'הצעד הראשון שהייתי עושה'),
          h('p', { class: 'block__title' }, r.first_step.title),
          h('p', {}, r.first_step.description),
          h('dl', {}, h('dt', {}, 'בשבוע הראשון'), h('dd', {}, r.first_step.week1)),
        ),
        block('ומה אחר כך', h('p', {}, r.next_step)),
      ),
      h('footer', { class: 'foot' }, 'Ensemble AI · בונים AI לתוך הדרך שבה העסק כבר עובד.', h('br'), h('a', { href: SITE_URL }, 'ensemble-ai.io')),
    ),
    h(
      'div',
      { class: 'dock' },
      h('a', { class: 'btn btn--block', href: CAL_URL, onclick: trackBookingClick }, 'בואו נדבר 30 דקות ונבנה את זה'),
      h('small', {}, 'קובעים ישר ביומן של אסף'),
    ),
  ];
}

/** Marks the lead as "clicked booking". keepalive lets the request finish while the page navigates. */
function trackBookingClick() {
  try {
    fetch('/api/analyze/click', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ session_id: S.sid }), keepalive: true }).catch(() => {});
  } catch {
    /* never block the booking link */
  }
}

/* ------------------------------------------------------------------- submit */

async function submit() {
  const mine = ++nav;
  mount(...analyzingScreen());
  focusHeading();
  const started = Date.now();
  const out = await requestAnalysis();
  if (out.kind === 'ok') await sleep(ANALYZING_MIN_MS - (Date.now() - started));
  if (mine !== nav) return;

  if (out.kind === 'ok') {
    S.result = out.data.result;
    S.step = 'result';
    save();
    return render();
  }
  S.step = 7;
  save();
  if (out.kind === 'busy') {
    const mins = Math.max(1, Math.ceil(out.retryAfter / 60));
    mount(...stateScreen('יש כרגע עומס', `אפשר לנסות שוב ${mins === 1 ? 'בעוד דקה' : `בעוד ${mins} דקות`}.`));
  } else if (out.kind === 'invalid') {
    const contact = { name: 'צריך להכניס שם', whatsapp: 'צריך מספר נייד ישראלי, למשל 050-1234567', email: 'כתובת המייל לא נראית תקינה' };
    if (out.field in contact) {
      pendingFieldError = { field: out.field, message: /** @type {any} */ (contact)[out.field] };
      return render();
    }
    // a stored answer no longer matches the questions (e.g. after an update): ask that question again
    const step = /** @type {any} */ (FIELD_STEP)[out.field] || 1;
    delete S.a[out.field];
    return go(step);
  } else {
    mount(...stateScreen('משהו נתקע בדרך', 'הניתוח לא הגיע. התשובות שמורות כאן, אפשר לנסות שוב.'));
  }
  focusHeading();
}

/* ------------------------------------------------------------------- render */

/** @param {{ focus?: boolean }} [opts] */
function render({ focus = true } = {}) {
  const step = S.step;
  /** @type {Node[]} */
  let nodes;
  if (step === 'result') nodes = resultScreen(S.result);
  else if (step === 0) nodes = [heroScreen()];
  else if (step === 1) nodes = industryScreen();
  else if (step === 2) nodes = singleScreen('size', 2);
  else if (step === 3) nodes = channelsScreen();
  else if (step === 4) nodes = singleScreen('acquisition', 4);
  else if (step === 5) nodes = sinkScreen();
  else if (step === 6) nodes = painScreen();
  else nodes = contactScreen();
  mount(...nodes);
  if (focus) app.querySelector('.screen')?.classList.add('enter');
  if (focus && step !== 0) focusHeading();
}

function focusHeading() {
  /** @type {HTMLElement|null} */ (app.querySelector('.q'))?.focus({ preventScroll: true });
}

render({ focus: false });
