import { formatDate } from './format';

export const BLANK = '______________________';

/** Fills {fee}, {student_name}, {title}… in a line of agreement wording. Unknown placeholders are left as typed. */
export const fillText = (text, values) => String(text || '').replace(/\{(\w+)\}/g, (m, key) => (key in values ? values[key] || BLANK : m));

/** Same as fillText, but returns pieces so the filled-in values can be shown in bold: [{text, value}]. */
export const fillParts = (text, values) => String(text || '').split(/(\{\w+\})/).filter(Boolean).map((piece) => {
  const key = piece.match(/^\{(\w+)\}$/)?.[1];
  return key && key in values ? { text: values[key] || BLANK, value: true } : { text: piece, value: false };
});

/** A field's value as shown in the document (dates in words). */
export const showValue = (field, value) => {
  if (!value) return BLANK;
  return field.type === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? formatDate(`${value}T00:00`) : value;
};

export const INPUT_TYPES = { date: 'date', email: 'email', tel: 'tel', number: 'number' };

/** NLe 25,000 / $1,500 / NLe 12,500.50 (same as the server). */
export const fmtMoney = (currency, amount) => {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return '';
  const n = amount.toLocaleString('en-US', { minimumFractionDigits: amount % 1 ? 2 : 0, maximumFractionDigits: 2 });
  const c = (currency || '').trim();
  if (!c) return n;
  return /[A-Za-z]/.test(c) ? `${c} ${n}` : `${c}${n}`;
};

/** The two instalments of a fee: [first, second]. */
export const splitFee = (amount, firstPercent) => {
  const first = Math.round(amount * firstPercent) / 100;
  return [first, Math.round((amount - first) * 100) / 100];
};
