// @ts-check
// Recommendation catalog. Ensemble sells implementation: every result ends with a named product
// that Asaf builds for the client in days. The LLM may only pick ids from the shortlist (see shortlist.js);
// the template fallback builds the product block from `product` below.
//
// Placeholders in `product` strings (filled per answer profile by productFor):
//   {to}     "ללקוחות" / "למטופלים"...   {ask} a typical customer question   {meet} plural appointments
//   {doc}    one typical document        {docPl} the same, plural            {ch} " בוואטסאפ" / " במייל" / "" (a channel they chose)
// `days` is the build time Ensemble commits to. It always comes from here, never from the model.

/**
 * @typedef {Object} Solution
 * @property {string} code
 * @property {string} id
 * @property {string} title        short generic product name (shown to the model as a hint)
 * @property {string} brief        what it is, for the model (English)
 * @property {number} days         build time in days
 * @property {string[]} channels   which of the owner's channels to name in the product name, in order of preference
 * @property {{ name: string, does: string, week1: string }} product
 */

/** @type {Solution[]} */
export const CATALOG = [
  {
    code: 'S1',
    id: 'inquiry_responder',
    title: 'מענה אוטומטי ללקוחות',
    brief: 'Answers recurring customer questions and captures the inquirer’s details 24/7, on the channel customers already use (WhatsApp is one example, not the default).',
    days: 5,
    channels: ['whatsapp', 'email', 'internal_chat'],
    product: {
      name: 'מענה אוטומטי {to}{ch}',
      does: 'עונה על שאלות כמו "{ask}" ואוסף את פרטי הפונה, בלי שמישהו יקליד את אותה תשובה שוב.',
      week1: 'רואים כמה פניות נענו תוך דקה וכמה פרטי פונים נאספו.',
    },
  },
  {
    code: 'S2',
    id: 'scheduling_followup',
    title: 'תיאום ותזכורות אוטומטי',
    brief: 'Books appointments, sends confirmations and reminders, and chases no-shows.',
    days: 4,
    channels: ['whatsapp', 'email', 'internal_chat'],
    product: {
      name: 'תיאום ותזכורות ל{meet}{ch}',
      does: 'קובע {meet}, שולח אישור ותזכורת ופונה שוב למי שלא הגיע.',
      week1: 'רואים כמה {meet} נקבעו בלי הודעות הלוך ושוב וכמה תזכורות יצאו.',
    },
  },
  {
    code: 'S3',
    id: 'quote_docs',
    title: 'מחולל הצעות ומסמכים',
    brief: 'Drafts quotes, invoices and contracts from a few inputs, for the owner to check and send.',
    days: 3,
    channels: [],
    product: {
      name: 'מחולל {docPl}',
      does: 'מכין טיוטה של {doc} מכמה פרטים. נשאר לבדוק ולשלוח.',
      week1: 'רואים כמה {docPl} יצאו באותו יום שהתבקשו.',
    },
  },
  {
    code: 'S4',
    id: 'lead_followup_engine',
    title: 'מעקב אוטומטי אחרי פניות',
    brief: 'Every lead gets a fast first reply and timed follow-ups; the owner sees at a glance who is hot.',
    days: 5,
    channels: ['whatsapp', 'email', 'internal_chat'],
    product: {
      name: 'מעקב אוטומטי אחרי פניות{ch}',
      does: 'עונה לכל פנייה חדשה תוך דקות, שולח תזכורות בזמנים קבועים ומראה מי מחכה לשיחה.',
      week1: 'רואים כמה פניות קיבלו מענה תוך דקות ומי מהן מחכה לשיחה.',
    },
  },
  {
    code: 'S5',
    id: 'owner_briefing',
    title: 'תדריך בוקר מהמספרים',
    brief: 'Pulls numbers from the tools the business already uses into a short morning summary, and answers questions about the business.',
    days: 4,
    channels: [],
    product: {
      name: 'תדריך בוקר מהמספרים של העסק',
      does: 'אוסף את המספרים מהכלים שכבר יש לכם ושולח סיכום קצר בכל בוקר. אפשר גם לשאול אותו על העסק.',
      week1: 'מקבלים כל בוקר הודעה אחת עם המספרים, בלי לפתוח כמה מערכות.',
    },
  },
  {
    code: 'S6',
    id: 'team_coordination',
    title: 'מתאם משימות לצוות',
    brief: 'Tasks, handoffs and status requests handled inside the channel the team already uses.',
    days: 5,
    channels: ['internal_chat', 'whatsapp', 'email'],
    product: {
      name: 'מתאם משימות לצוות{ch}',
      does: 'מרכז משימות, העברות ושאלות "איפה זה עומד" במקום אחד ומזכיר לעובדים מה פתוח.',
      week1: 'רואים רשימה אחת של מה פתוח ואצל מי, ופחות שאלות "מה המצב" במהלך היום.',
    },
  },
  {
    code: 'S7',
    id: 'content_assistant',
    title: 'עוזר פוסטים בסגנון שלכם',
    brief: 'Drafts posts, replies and newsletters in the owner’s voice, for approval before publishing.',
    days: 3,
    channels: [],
    product: {
      name: 'עוזר פוסטים בסגנון שלכם',
      does: 'כותב טיוטות לפוסטים, תגובות וניוזלטר בסגנון שלכם. כל טיוטה מחכה לאישור.',
      week1: 'יש טיוטות לשבוע שלם שמחכות לאישור.',
    },
  },
  {
    code: 'S8',
    id: 'personal_ops_assistant',
    title: 'עוזר אישי לניהול היום',
    brief: 'One assistant for the owner: reminders, inbox and message triage, ad-hoc tasks (this is where a WhatsApp personal assistant sits).',
    days: 3,
    channels: ['whatsapp', 'email'],
    product: {
      name: 'עוזר אישי לניהול היום{ch}',
      does: 'מחזיק תזכורות, ממיין מיילים והודעות ומטפל במשימות קטנות שצצות באמצע היום.',
      week1: 'רואים בסוף כל יום רשימה קצרה של מה נשאר פתוח.',
    },
  },
  {
    code: 'S9',
    id: 'map_first',
    title: 'אוטומציה ראשונה אחרי מיפוי',
    brief: 'A 30-minute working session to map how the business operates, followed by building the first small automation it points to. Used when the answers are vague or mixed.',
    days: 5,
    channels: [],
    product: {
      name: 'אוטומציה ראשונה אחרי מיפוי',
      does: 'ממפים יחד שבוע עבודה בשיחה של 30 דקות ובונים את הדבר הקטן הראשון שמוריד עבודה ידנית.',
      week1: 'בסוף השבוע יש דבר אחד שרץ על עבודה אמיתית, ורואים כמה זמן הוא תופס.',
    },
  },
];

/** @param {string} id */
export const solution = (id) => CATALOG.find((s) => s.id === id);

/** Per-industry wording used to fill the placeholders above. */
export const INDUSTRY_EXAMPLES = {
  professional: { ask: 'איפה עומד התיק', doc: 'הצעת שכר טרחה', docPl: 'הצעות שכר טרחה', meet: 'פגישות ייעוץ', to: 'ללקוחות' },
  construction: { ask: 'מתי מגיעים לעבודה', doc: 'הצעת מחיר לשיפוץ', docPl: 'הצעות מחיר לשיפוצים', meet: 'סיורים באתר', to: 'ללקוחות' },
  retail: { ask: 'מה עם המשלוח', doc: 'חשבונית ללקוח עסקי', docPl: 'חשבוניות ללקוחות עסקיים', meet: 'איסוף הזמנות', to: 'לקונים' },
  hospitality: { ask: 'אם יש מקום בשישי בערב', doc: 'הצעת מחיר לאירוע', docPl: 'הצעות מחיר לאירועים', meet: 'הזמנות לאירועים', to: 'לאורחים' },
  health_beauty: { ask: 'כמה עולה טיפול ומתי יש תור', doc: 'קבלה ללקוח', docPl: 'קבלות ללקוחות', meet: 'תורים ושיעורים', to: 'לפונים' },
  realestate_finance: { ask: 'מה המצב עם הנכס או הפוליסה', doc: 'הצעה ללקוח', docPl: 'הצעות ללקוחות', meet: 'פגישות היכרות', to: 'ללקוחות' },
  education: { ask: 'מתי מתחיל הקורס הבא', doc: 'הצעת מחיר לקורס', docPl: 'הצעות מחיר לקורסים ולסדנאות', meet: 'שיעורי ניסיון', to: 'לתלמידים' },
  other: { ask: 'השאלה שכל לקוח חדש שואל', doc: 'מסמך ללקוח', docPl: 'מסמכים ללקוחות', meet: 'פגישות', to: 'ללקוחות' },
};

const CHANNEL_PHRASE = { whatsapp: ' בוואטסאפ', email: ' במייל', internal_chat: " בצ'אט הפנימי" };

/**
 * The product block for a solution and an answer profile: name, what it does, build days, first-week effect.
 * The channel is only named when the owner chose it themselves.
 * @param {Solution} sol
 * @param {import('./validate.js').Answers} a
 * @returns {{ solution_id: string, name: string, does: string, days: number, week1: string }}
 */
export function productFor(sol, a) {
  const ex = INDUSTRY_EXAMPLES[a.industry] || INDUSTRY_EXAMPLES.other;
  const chosen = a.channels || [];
  const ch = CHANNEL_PHRASE[sol.channels.find((c) => chosen.includes(c))] || '';
  const fill = (/** @type {string} */ s) =>
    s
      .replaceAll('{to}', ex.to)
      .replaceAll('{ask}', ex.ask)
      .replaceAll('{docPl}', ex.docPl)
      .replaceAll('{doc}', ex.doc)
      .replaceAll('{meet}', ex.meet)
      .replaceAll('{ch}', ch);
  return { solution_id: sol.id, name: fill(sol.product.name), does: fill(sol.product.does), days: sol.days, week1: fill(sol.product.week1) };
}
