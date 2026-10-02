/**
 * Quiz questions in the editors (quiz lessons and question banks): the six types, difficulty, and converting
 * between the server's shape and the editor's.
 */
export const TYPES = [
  ['single', 'Multiple choice (one answer)'],
  ['multiple', 'Multiple answers'],
  ['true_false', 'True / false'],
  ['short', 'Short answer'],
  ['fill_blank', 'Fill in the blanks'],
  ['matching', 'Matching'],
];
export const TYPE_LABEL = Object.fromEntries(TYPES.map(([k, label]) => [k, label.replace(/ \(.*\)/, '')]));
export const DIFFICULTIES = [['easy', 'Easy'], ['medium', 'Medium'], ['hard', 'Hard']];

export const BLANK = /\[([^[\]]+)\]/g;
const twoPairs = () => [{ left: '', right: '' }, { left: '', right: '' }];

export const blankQuestion = (kind = 'single') => ({
  kind,
  text: '',
  explanation: '',
  points: 1,
  difficulty: 'medium',
  answer: true,
  accepted_answers: [''],
  choices: [{ text: '', is_correct: true }, { text: '', is_correct: false }],
  pairs: twoPairs(),
});

export const fromServer = (q) => ({
  id: q.id,
  category: q.category ?? null,
  kind: q.kind || 'single',
  text: q.text,
  explanation: q.explanation || '',
  points: q.points || 1,
  difficulty: q.difficulty || 'medium',
  answer: q.kind === 'true_false' ? Boolean(q.choices.find((c) => c.text === 'True')?.is_correct) : true,
  accepted_answers: q.accepted_answers?.length ? q.accepted_answers : [''],
  choices: ['single', 'multiple'].includes(q.kind) ? q.choices.map((c) => ({ text: c.text, is_correct: c.is_correct })) : blankQuestion().choices,
  pairs: q.data?.pairs?.length ? q.data.pairs.map((p) => ({ ...p })) : twoPairs(),
});

// What the server expects for each type
export const toServer = (q) => {
  const base = { kind: q.kind, text: q.text, explanation: q.explanation, points: Number(q.points) || 1, difficulty: q.difficulty || 'medium' };
  if (q.kind === 'short') return { ...base, accepted_answers: q.accepted_answers.filter((a) => a.trim()) };
  if (q.kind === 'true_false') return { ...base, answer: q.answer };
  if (q.kind === 'fill_blank') return base;
  if (q.kind === 'matching') return { ...base, data: { pairs: q.pairs.filter((p) => p.left.trim() || p.right.trim()) } };
  return { ...base, choices: q.choices };
};

/** The blanks found in a fill-in-the-blanks text: [['Freetown'], ['blue', 'grey']]. */
export const blanksOf = (text) => [...(text || '').matchAll(BLANK)].map((m) => m[1].split('|').map((a) => a.trim()).filter(Boolean));
