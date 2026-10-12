// @ts-check
// Deterministic fallback result, built from the catalog + answers. Used when the LLM is
// unavailable, times out, or fails validation twice. Must pass the same checks as LLM output.
import { solution, productFor } from './catalog.js';

const INDUSTRY = {
  professional: 'משרד שנותן שירותים מקצועיים',
  construction: 'עסק בתחום הבנייה והשיפוצים',
  retail: 'עסק במסחר',
  hospitality: 'עסק בתחום האוכל והאירוח',
  health_beauty: 'עסק בתחום הבריאות, הטיפול והיופי',
  realestate_finance: 'עסק בנדל"ן, ביטוח או פיננסים',
  education: 'עסק בתחום החינוך וההדרכה',
};
const SIZE = {
  solo: 'שמנוהל לבד',
  '2_5': 'עם צוות קטן של 2-5 אנשים',
  '6_15': 'עם 6-15 אנשים',
  '16_50': 'עם 16-50 אנשים',
  '50_plus': 'עם יותר מ-50 אנשים',
};
const CHANNEL = {
  whatsapp: 'בוואטסאפ',
  phone: 'בטלפון',
  email: 'במייל',
  internal_chat: 'בהודעות פנימיות',
  in_person: 'בפגישות פנים אל פנים',
  crm: 'במערכת ייעודית',
};
const SINK_NOUN = {
  repeat_questions: 'מענה לאותן שאלות',
  scheduling: 'תיאום פגישות ומעקב אחרי אנשים',
  documents: 'הצעות מחיר ומסמכים',
  lead_followup: 'מעקב אחרי לידים',
  reporting: 'דיווחים ותמונת מצב',
  team: 'תיאום עם העובדים',
  content: 'תוכן ושיווק',
  other: 'משימות שלא נכנסות לקטגוריה אחת',
};
const LEAK = {
  repeat_questions: 'התשובות לאותן שאלות. כל אחת לוקחת דקה, אבל הן מגיעות כל היום וקוטעות עבודה אחרת.',
  scheduling: 'התיאום: הודעות הלוך ושוב, תזכורות ידניות ואנשים שלא מגיעים. זה זמן שלא מופיע בשום דוח.',
  documents: 'ההכנה של מסמכים. כל הצעה נבנית כמעט מאפס, ובינתיים הלקוח מחכה.',
  lead_followup: 'לידים שנעלמים. פנייה שלא קיבלה תשובה מהירה או תזכורת בזמן היא עבודה שהלכה.',
  reporting: 'האיסוף של המספרים. בלי תמונת מצב אחת, כל החלטה מתחילה בחיפוש.',
  team: 'התיאום עם הצוות: לשאול מה המצב, להעביר הלאה ולוודא שזה קרה.',
  content: 'התוכן. להתחיל כל פוסט מדף ריק לוקח יותר זמן מהפוסט עצמו.',
  other: 'העבודה השוטפת שלא מתחלקת לקטגוריה אחת, ולכן גם לא מתייעלת.',
};
/** weekly hours answer -> rough monthly range */
const MONTHLY = { lt2: '4-8 שעות בחודש', '2_5': '8-20 שעות בחודש', '5_10': '20-40 שעות בחודש', '10_plus': '40 שעות בחודש ויותר' };

/** @param {string} s @param {number} maxWords */
function clip(s, maxWords) {
  const w = s.split(/\s+/).filter(Boolean);
  return w.length <= maxWords ? s : w.slice(0, maxWords).join(' ') + '…';
}

/**
 * @param {import('./validate.js').Answers} a
 * @param {string[]} shortlist
 * @returns {import('./analysis.js').AnalysisResult}
 */
export function templateResult(a, shortlist) {
  const sol = solution(shortlist[0]) || solution('map_first');

  const industry = a.industry === 'other' ? (a.industry_other ? `עסק מסוג "${a.industry_other}"` : 'עסק בתחום שלא מופיע ברשימה') : INDUSTRY[a.industry];
  const channels = (a.channels || []).map((c) => CHANNEL[c]).filter(Boolean).join(' ו');
  const base = `${industry} ${SIZE[a.size] || ''}, ורוב השיחות קורות ${channels}.`.replace(/\s+/g, ' ');
  const pain = a.pain ? ` כתבת: "${clip(a.pain, 16)}".` : ` הכי הרבה זמן הולך על ${SINK_NOUN[a.sink] || SINK_NOUN.other}.`;

  return {
    what_i_saw: base + pain,
    biggest_leak: LEAK[a.sink] || LEAK.other,
    estimate_note: `הערכה גסה, לפי מה שסימנת: בערך ${MONTHLY[a.hours] || MONTHLY['2_5']}.`,
    product: productFor(sol, a),
  };
}
