// Helpers for the scholarship application form (backend portal/intake.py): question types, progress, display.
import { formatDate } from './format';

export const FIELD_TYPES = [
  { type: 'text', label: 'Short answer', icon: 'fa-font' },
  { type: 'textarea', label: 'Paragraph', icon: 'fa-align-left' },
  { type: 'email', label: 'Email', icon: 'fa-at' },
  { type: 'phone', label: 'Phone', icon: 'fa-phone' },
  { type: 'date', label: 'Date', icon: 'fa-calendar-day' },
  { type: 'number', label: 'Number', icon: 'fa-hashtag' },
  { type: 'select', label: 'Dropdown', icon: 'fa-square-caret-down' },
  { type: 'radio', label: 'Multiple choice', icon: 'fa-circle-dot' },
  { type: 'checkboxes', label: 'Checkboxes', icon: 'fa-square-check' },
  { type: 'yes_no', label: 'Yes / No', icon: 'fa-toggle-on' },
  { type: 'country', label: 'Country', icon: 'fa-earth-africa' },
];
export const CHOICE_TYPES = ['select', 'radio', 'checkboxes'];
export const PREFILLS = [
  ['', 'Nothing'],
  ['full_name', 'Full name'],
  ['first_name', 'First name'],
  ['last_name', 'Last name'],
  ['email', 'Email address'],
  ['phone', 'Phone number'],
  ['country', 'Country'],
];

export const isEmpty = (v) => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);

/** {answered, required} for a section (or the whole form when given every section). */
export const progressOf = (sections, answers) => {
  const required = sections.flatMap((s) => s.fields.filter((f) => f.required));
  return { answered: required.filter((f) => !isEmpty(answers[f.id])).length, required: required.length };
};

export const sectionDone = (section, answers) => section.fields.every((f) => !f.required || !isEmpty(answers[f.id]));

/** First answers for a new form: the student's name, email… where the admin linked a question to them. */
export const prefilled = (sections, prefill = {}) => {
  const out = {};
  sections.forEach((s) => s.fields.forEach((f) => {
    if (f.prefill && prefill[f.prefill]) out[f.id] = prefill[f.prefill];
  }));
  return out;
};

/** An answer as text, for the review step and the printable copy. */
export const displayValue = (field, value) => {
  if (isEmpty(value)) return '';
  if (field.type === 'checkboxes') return value.join(', ');
  if (field.type === 'yes_no') return value === 'yes' ? 'Yes' : 'No';
  if (field.type === 'date') return formatDate(`${value}T00:00`);
  return String(value);
};

let counter = 0;
/** A temporary id for a new question or section in the form designer (the server turns labels into ids). */
export const tempId = (prefix) => {
  counter += 1;
  return `${prefix}_new_${Date.now().toString(36)}${counter}`;
};
