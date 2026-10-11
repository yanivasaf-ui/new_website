// @ts-check
// Recommendation catalog. The LLM may only recommend ids from here (and only from the shortlist).
// `brief` is what the model reads; `title`/`template` are used by the fallback and the UI.
// Template placeholders: {ask} a typical recurring question, {doc} a typical document,
// {meet} a typical appointment (per industry, see INDUSTRY_EXAMPLES).

/**
 * @typedef {Object} Solution
 * @property {string} code
 * @property {string} id
 * @property {string} title
 * @property {string} brief
 * @property {{ description: string, week1: string, next: string }} template
 */

/** @type {Solution[]} */
export const CATALOG = [
  {
    code: 'S1',
    id: 'inquiry_responder',
    title: 'מענה אוטומטי לשאלות שחוזרות',
    brief: 'Answers recurring customer questions and captures the inquirer’s details 24/7, on the channel customers already use (WhatsApp is one example, not the default).',
    template: {
      description: 'מענה שעונה על השאלות שחוזרות, למשל {ask}, ואוסף את פרטי הפונה בערוץ שהלקוחות כבר משתמשים בו. זה מחליף את ההקלדה של אותה תשובה שוב ושוב.',
      week1: 'השאלות הנפוצות נענות תוך דקה, גם בערב, ומגיעה רשימה מסודרת של מי פנה ומה ביקש.',
      next: 'לחבר את המענה למעקב לידים, כדי שאף פונה לא נעלם.',
    },
  },
  {
    code: 'S2',
    id: 'scheduling_followup',
    title: 'תיאום ותזכורות שרצים לבד',
    brief: 'Books appointments, sends confirmations and reminders, and chases no-shows.',
    template: {
      description: 'מערכת שקובעת {meet}, שולחת אישור ותזכורת, וחוזרת למי שלא הגיע. זה מחליף את ההודעות הלוך ושוב ואת המעקב הידני ביומן.',
      week1: 'פחות הודעות של "מתי נוח", ותזכורות שיוצאות לבד יום לפני.',
      next: 'מעקב אוטומטי אחרי לקוחות שלא קבעו פגישת המשך.',
    },
  },
  {
    code: 'S3',
    id: 'quote_docs',
    title: 'הצעות מחיר ומסמכים מכמה פרטים',
    brief: 'Drafts quotes, invoices and contracts from a few inputs, for the owner to check and send.',
    template: {
      description: 'כלי שמכין טיוטה של {doc} מכמה פרטים: מה, כמה ולמי. נשאר רק לבדוק ולשלוח. זה מחליף את ההעתק-הדבק מהמסמך הקודם.',
      week1: 'הצעה ראשונה יוצאת באותו יום שהלקוח ביקש, לא אחרי כמה ימים.',
      next: 'מעקב אוטומטי אחרי הצעות שעוד לא קיבלו תשובה.',
    },
  },
  {
    code: 'S4',
    id: 'lead_followup_engine',
    title: 'מעקב לידים שלא נופל',
    brief: 'Every lead gets a fast first reply and timed follow-ups; the owner sees at a glance who is hot.',
    template: {
      description: 'כל פנייה חדשה מקבלת מענה ראשון תוך דקות, ואחריו תזכורות בזמנים קבועים. בכל בוקר רואים מי חם ומי מחכה לשיחה. זה מחליף את הרשימות שבראש.',
      week1: 'אף פנייה לא נשארת בלי תשובה יותר מכמה דקות, ויש רשימה אחת של מי מחכה למה.',
      next: 'לחבר את הנתונים לתמונת מצב שבועית על הפניות.',
    },
  },
  {
    code: 'S5',
    id: 'owner_briefing',
    title: 'תמונת מצב בכל בוקר',
    brief: 'Pulls numbers from the tools the business already uses into a short morning summary, and answers questions about the business.',
    template: {
      description: 'סיכום בוקר קצר שאוסף את המספרים מהכלים שכבר יש בעסק: מכירות, פניות ומה פתוח. אפשר גם לשאול אותו שאלות על העסק. זה מחליף את האיסוף הידני לגיליון.',
      week1: 'כל בוקר מגיעה הודעה אחת עם מה שחשוב היום, בלי לפתוח כמה מערכות.',
      next: 'התראות כשמשהו חורג מהרגיל.',
    },
  },
  {
    code: 'S6',
    id: 'team_coordination',
    title: 'תיאום צוות בתוך הערוץ הקיים',
    brief: 'Tasks, handoffs and status requests handled inside the channel the team already uses.',
    template: {
      description: 'משימות, העברות ובקשות "איפה זה עומד" מטופלות בתוך הערוץ שהצוות כבר עובד בו. מי שצריך לדעת, יודע בלי לשאול. זה מחליף את השיחות והתזכורות האישיות לכל עובד.',
      week1: 'פחות שאלות "מה המצב" במהלך היום, ורשימה ברורה של מה פתוח ואצל מי.',
      next: 'תמונת מצב שבועית על העבודה של הצוות.',
    },
  },
  {
    code: 'S7',
    id: 'content_assistant',
    title: 'עוזר תוכן בסגנון של העסק',
    brief: 'Drafts posts, replies and newsletters in the owner’s voice, for approval before publishing.',
    template: {
      description: 'עוזר שמנסח פוסטים, תגובות וניוזלטרים בסגנון של העסק, על בסיס מה שכבר קורה בו. הכל עובר אישור לפני פרסום. זה מחליף את הדף הריק.',
      week1: 'טיוטות לשבוע שלם מחכות לאישור בתוך שעה.',
      next: 'מענה לתגובות ולהודעות שמגיעות מהתוכן.',
    },
  },
  {
    code: 'S8',
    id: 'personal_ops_assistant',
    title: 'עוזר אישי לניהול היום',
    brief: 'One assistant for the owner: reminders, inbox and message triage, ad-hoc tasks (this is where a WhatsApp personal assistant sits).',
    template: {
      description: 'עוזר אחד שמחזיק את היום: תזכורות, סינון מיילים והודעות, ומשימות קטנות שצצות באמצע. כותבים לו כמו לעוזר אנושי. זה מחליף את הפתקים ואת הזיכרון.',
      week1: 'פחות דברים נופלים בין הכיסאות, ובכל ערב יש רשימה קצרה של מה נשאר פתוח.',
      next: 'לתת לו לטפל גם בפניות החוזרות של הלקוחות.',
    },
  },
  {
    code: 'S9',
    id: 'map_first',
    title: 'מיפוי של 30 דקות',
    brief: 'A 30-minute working session to map how the business operates and find the first target. Used when the answers are vague or mixed.',
    template: {
      description: 'שיחת עבודה של חצי שעה שבה ממפים איך נראה יום רגיל בעסק, ומוצאים את המקום הראשון שכדאי להתחיל בו. בלי התחייבות לכלי מסוים.',
      week1: 'יוצאים עם יעד אחד ברור ותוכנית קצרה איך מתחילים.',
      next: 'לבנות את הצעד הראשון ולבדוק אותו על העבודה האמיתית.',
    },
  },
];

/** @param {string} id */
export const solution = (id) => CATALOG.find((s) => s.id === id);

/** Concrete per-industry examples used to fill template placeholders. */
export const INDUSTRY_EXAMPLES = {
  professional: { ask: 'איפה עומד התיק', doc: 'הצעת שכר טרחה', meet: 'פגישות ייעוץ' },
  construction: { ask: 'מתי מגיעים לעבודה', doc: 'הצעת מחיר לשיפוץ', meet: 'סיורים באתר' },
  retail: { ask: 'מה עם המשלוח', doc: 'חשבונית ללקוח עסקי', meet: 'איסוף הזמנות' },
  hospitality: { ask: 'אם יש מקום בשישי בערב', doc: 'הצעת מחיר לאירוע', meet: 'הזמנות לאירועים' },
  health_beauty: { ask: 'כמה עולה טיפול ומתי יש תור', doc: 'קבלה ללקוח', meet: 'תורים' },
  realestate_finance: { ask: 'מה המצב עם הנכס או הפוליסה', doc: 'הצעה ללקוח', meet: 'פגישות היכרות' },
  education: { ask: 'מתי מתחיל הקורס הבא', doc: 'הצעת מחיר לקורס או לסדנה', meet: 'שיעורי ניסיון' },
  other: { ask: 'השאלה שכל לקוח חדש שואל', doc: 'מסמך ללקוח', meet: 'פגישות' },
};
