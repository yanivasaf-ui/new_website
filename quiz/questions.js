// @ts-check
// Single source of truth for quiz questions and option ids.
// Imported by the browser (/quiz/questions.js) and by the Worker (validation, email, prompt).

/** @typedef {{ id: string, label: string, freeText?: boolean }} Option */
/** @typedef {{ id: string, type: 'single'|'multi'|'text', text: string, options?: Option[], max?: number, optional?: boolean }} Question */

/** @type {Question[]} */
export const QUESTIONS = [
  {
    id: 'industry',
    type: 'single',
    text: 'מה העסק שלך עושה?',
    options: [
      { id: 'professional', label: 'שירותים מקצועיים (משרד, יועץ, עו"ד, רו"ח)' },
      { id: 'construction', label: 'בניין, שיפוצים ובעלי מקצוע' },
      { id: 'retail', label: 'מסחר וחנות (פיזית או אונליין)' },
      { id: 'hospitality', label: 'מסעדה, קפה, אירוח' },
      { id: 'health_beauty', label: 'בריאות, טיפול, יופי וכושר' },
      { id: 'realestate_finance', label: 'נדל"ן, ביטוח, פיננסים' },
      { id: 'education', label: 'חינוך והדרכה' },
      { id: 'other', label: 'אחר', freeText: true },
    ],
  },
  {
    id: 'size',
    type: 'single',
    text: 'כמה אנשים עובדים אצלכם, כולל אותך?',
    options: [
      { id: 'solo', label: 'רק אני' },
      { id: '2_5', label: '2-5' },
      { id: '6_15', label: '6-15' },
      { id: '16_50', label: '16-50' },
      { id: '50_plus', label: 'יותר מ-50' },
    ],
  },
  {
    id: 'channels',
    type: 'multi',
    max: 2,
    text: 'איפה רוב השיחות קורות?',
    options: [
      { id: 'whatsapp', label: 'וואטסאפ' },
      { id: 'phone', label: 'טלפון' },
      { id: 'email', label: 'מייל' },
      { id: 'internal_chat', label: 'אפליקציית הודעות פנימית (Slack/Teams)' },
      { id: 'in_person', label: 'פגישות פנים אל פנים' },
      { id: 'crm', label: 'CRM או מערכת ייעודית' },
    ],
  },
  {
    id: 'acquisition',
    type: 'single',
    text: 'איך לקוחות חדשים מגיעים אליך?',
    options: [
      { id: 'referrals', label: 'המלצות ופה לאוזן' },
      { id: 'social', label: 'פייסבוק ואינסטגרם' },
      { id: 'google', label: 'גוגל (חיפוש או פרסום)' },
      { id: 'website', label: 'אתר ופורמים' },
      { id: 'outbound', label: 'יוזם פניות בעצמי (טלמרקטינג, לינקדין)' },
      { id: 'repeat', label: 'לקוחות קבועים, כמעט אין חדשים' },
    ],
  },
  {
    id: 'sink',
    type: 'single',
    text: 'איפה מבזבזים הכי הרבה זמן?',
    options: [
      { id: 'repeat_questions', label: 'לענות על אותן שאלות שוב ושוב' },
      { id: 'scheduling', label: 'לתאם פגישות ולרדוף אחרי אנשים' },
      { id: 'documents', label: 'הצעות מחיר, חשבוניות ומסמכים' },
      { id: 'lead_followup', label: 'מעקב אחרי לידים ולקוחות שנעלמו' },
      { id: 'reporting', label: 'דיווחים, מספרים ותמונת מצב' },
      { id: 'team', label: 'לעדכן ולתאם עם העובדים' },
      { id: 'content', label: 'תוכן ושיווק' },
      { id: 'other', label: 'משהו אחר' },
    ],
  },
  {
    // Shown as a chip row on the same screen as `sink`.
    id: 'hours',
    type: 'single',
    text: 'כמה שעות בשבוע זה לוקח?',
    options: [
      { id: 'lt2', label: 'פחות מ-2' },
      { id: '2_5', label: '2-5' },
      { id: '5_10', label: '5-10' },
      { id: '10_plus', label: '10+' },
    ],
  },
  {
    id: 'pain',
    type: 'text',
    optional: true,
    text: 'במשפט אחד: מה הכי מעצבן בעבודה השבועית?',
  },
];

/** @param {string} qid */
export function question(qid) {
  return QUESTIONS.find((q) => q.id === qid);
}

/** Hebrew label for an option id, or the id itself if unknown. */
export function optionLabel(qid, optId) {
  const opt = question(qid)?.options?.find((o) => o.id === optId);
  return opt ? opt.label : String(optId ?? '');
}

/** @param {string} qid */
export function optionIds(qid) {
  return (question(qid)?.options || []).map((o) => o.id);
}

export const LIMITS = { pain: 280, industryOther: 60, name: 60, email: 120 };
