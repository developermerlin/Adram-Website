"""
Quiz questions, whatever quiz or bank they live in: checking what an author typed, what a student is shown, marking
an answer, and what is revealed afterwards.

Kinds: single, multiple, true_false, short, fill_blank ("The capital is [Freetown]"; "[colour|color]" accepts either)
and matching ({pairs: [{left, right}]}; students pick a right-hand item for each left-hand one).
"""
import random
import re
import unicodedata

from .models import Question

BLANK = re.compile(r'\[([^\[\]]+)\]')
MAX_BLANKS, MIN_PAIRS, MAX_PAIRS = 10, 2, 10


def normal(text):
    text = unicodedata.normalize('NFKC', str(text or '')).casefold()
    return ' '.join(text.replace('.', ' ').split())


def blanks_of(text):
    """The accepted answers of each [blank] in a fill-in-the-blanks text."""
    return [[a.strip()[:200] for a in m.group(1).split('|') if a.strip()] for m in BLANK.finditer(text)]


def parts_of(text):
    """The text cut at the blanks: [{'text': ...}, {'blank': 0}, {'text': ...}]."""
    parts, pos = [], 0
    for i, m in enumerate(BLANK.finditer(text)):
        if m.start() > pos:
            parts.append({'text': text[pos:m.start()]})
        parts.append({'blank': i})
        pos = m.end()
    if pos < len(text):
        parts.append({'text': text[pos:]})
    return parts


def clean_question(number, item):
    """(fields, choices) for one question, or raises ValueError with the problem."""
    item = item if isinstance(item, dict) else {}
    kind = item.get('kind') or Question.SINGLE
    if kind not in dict(Question.KINDS):
        raise ValueError(f'Question {number} has an unknown type.')
    text = str(item.get('text', '')).strip()
    if not text:
        raise ValueError(f'Question {number} needs some text.')
    try:
        points = max(1, min(int(item.get('points') or 1), 100))
    except (TypeError, ValueError):
        points = 1
    difficulty = item.get('difficulty') if item.get('difficulty') in dict(Question.DIFFICULTIES) else Question.MEDIUM
    fields = {'kind': kind, 'text': text[:1000], 'explanation': str(item.get('explanation', '')).strip()[:500], 'points': points,
              'difficulty': difficulty, 'accepted_answers': [], 'data': {}}
    if kind == Question.SHORT:
        answers = [str(a).strip()[:200] for a in item.get('accepted_answers') or [] if str(a).strip()]
        if not answers:
            raise ValueError(f'Question {number} needs at least one accepted answer.')
        fields['accepted_answers'] = answers[:20]
        return fields, []
    if kind == Question.FILL_BLANK:
        blanks = blanks_of(text)
        if not blanks or any(not b for b in blanks):
            raise ValueError(f'Question {number}: put each answer in square brackets, e.g. "The capital is [Freetown]".')
        if len(blanks) > MAX_BLANKS:
            raise ValueError(f'Question {number} can have at most {MAX_BLANKS} blanks.')
        fields['data'] = {'blanks': blanks}
        return fields, []
    if kind == Question.MATCHING:
        raw = (item.get('data') or {}).get('pairs') if isinstance(item.get('data'), dict) else item.get('pairs')
        pairs = [{'left': str(p.get('left', '')).strip()[:200], 'right': str(p.get('right', '')).strip()[:200]}
                 for p in raw or [] if isinstance(p, dict)]
        pairs = [p for p in pairs if p['left'] or p['right']]
        if any(not p['left'] or not p['right'] for p in pairs):
            raise ValueError(f'Question {number}: fill in both sides of every pair.')
        if not MIN_PAIRS <= len(pairs) <= MAX_PAIRS:
            raise ValueError(f'Question {number} needs between {MIN_PAIRS} and {MAX_PAIRS} pairs.')
        if len({normal(p['left']) for p in pairs}) < len(pairs):
            raise ValueError(f'Question {number}: each item on the left must be different.')
        fields['data'] = {'pairs': pairs}
        return fields, []
    if kind == Question.TRUE_FALSE:
        choices = [c for c in item.get('choices', []) if isinstance(c, dict)]
        truth = next((str(c.get('text', '')).strip().lower() == 'true' for c in choices if c.get('is_correct')), None)
        if truth is None and 'answer' in item:
            truth = bool(item['answer'])
        if truth is None:
            raise ValueError(f'Question {number}: say whether the statement is true or false.')
        return fields, [{'text': 'True', 'is_correct': truth}, {'text': 'False', 'is_correct': not truth}]
    choices = [c for c in item.get('choices', []) if isinstance(c, dict) and str(c.get('text', '')).strip()]
    if len(choices) < 2 or len(choices) > 8:
        raise ValueError(f'Question {number} needs between 2 and 8 answers.')
    right = sum(bool(c.get('is_correct')) for c in choices)
    if kind == Question.SINGLE and right != 1:
        raise ValueError(f'Question {number} needs exactly one correct answer.')
    if kind == Question.MULTIPLE and right < 1:
        raise ValueError(f'Question {number} needs at least one correct answer.')
    return fields, choices


def match_options(question):
    """The right-hand items of a matching question, each once."""
    seen, out = set(), []
    for p in (question.data or {}).get('pairs', []):
        if normal(p['right']) not in seen:
            seen.add(normal(p['right']))
            out.append(p['right'])
    return out


def shuffled_order(question):
    """A random order for a question's choices (by id) or matching options (by index), or None."""
    if question.kind in (Question.SINGLE, Question.MULTIPLE):
        order = [c.id for c in question.choices.all()]
    elif question.kind == Question.MATCHING:
        order = list(range(len(match_options(question))))
    else:
        return None
    random.shuffle(order)
    return order


def for_student(question, order=None):
    """What a student sees: never the answers."""
    data = {'id': question.id, 'kind': question.kind, 'points': question.points, 'choices': []}
    if question.kind == Question.FILL_BLANK:
        data['parts'] = parts_of(question.text)
        data['text'] = BLANK.sub('_____', question.text)
        return data
    data['text'] = question.text
    if question.kind == Question.MATCHING:
        options = match_options(question)
        if not order:
            order = list(range(len(options)))
            random.shuffle(order)  # never in the answer order
        data['prompts'] = [p['left'] for p in question.data.get('pairs', [])]
        data['options'] = [options[i] for i in order if i < len(options)]
        return data
    if question.kind == Question.SHORT:
        return data
    choices = list(question.choices.all())
    if order:
        by_id = {c.id: c for c in choices}
        choices = [by_id[i] for i in order if i in by_id] + [c for c in choices if c.id not in order]
    data['choices'] = [{'id': c.id, 'text': c.text} for c in choices]
    return data


def grade(question, answer):
    """(correct, chosen) for one answer."""
    if question.kind == Question.SHORT:
        given = normal(answer)
        return bool(given) and given in {normal(a) for a in question.accepted_answers}, str(answer or '')[:300]
    if question.kind == Question.FILL_BLANK:
        blanks = (question.data or {}).get('blanks') or blanks_of(question.text)
        given = [str(a or '')[:200] for a in answer] if isinstance(answer, list) else []
        given = (given + [''] * len(blanks))[:len(blanks)]
        ok = bool(blanks) and all(normal(g) and normal(g) in {normal(a) for a in accepted} for g, accepted in zip(given, blanks))
        return ok, given
    if question.kind == Question.MATCHING:
        pairs = (question.data or {}).get('pairs', [])
        given = [str(a or '')[:200] for a in answer] if isinstance(answer, list) else []
        given = (given + [''] * len(pairs))[:len(pairs)]
        ok = bool(pairs) and all(normal(g) == normal(p['right']) for g, p in zip(given, pairs))
        return ok, given
    right = [c.id for c in question.choices.all() if c.is_correct]
    if question.kind == Question.MULTIPLE:
        values = answer if isinstance(answer, list) else [answer]
        chosen = sorted({int(v) for v in values if str(v).isdigit()})
        return bool(right) and chosen == sorted(right), chosen
    chosen = int(answer) if str(answer).isdigit() else None
    return bool(right) and chosen == right[0], chosen


def reveal(question):
    """The right answers, shown after an attempt when the quiz allows it."""
    right = [c.id for c in question.choices.all() if c.is_correct]
    data = {'correct_ids': right, 'correct_id': right[0] if right else None, 'explanation': question.explanation,
            'accepted_answers': question.accepted_answers if question.kind == Question.SHORT else []}
    if question.kind == Question.FILL_BLANK:
        data['blanks'] = (question.data or {}).get('blanks') or blanks_of(question.text)
    if question.kind == Question.MATCHING:
        data['pairs'] = (question.data or {}).get('pairs', [])
    return data


def for_author(q):
    """A question as its author edits it."""
    return {'id': q.id, 'kind': q.kind, 'text': q.text, 'explanation': q.explanation, 'points': q.points,
            'difficulty': q.difficulty, 'accepted_answers': q.accepted_answers, 'data': q.data or {},
            'category': q.category_id, 'category_name': q.category.name if q.category_id else '',
            'choices': [{'id': c.id, 'text': c.text, 'is_correct': c.is_correct} for c in q.choices.all()],
            'stats': {'answered': q.times_answered, 'correct': q.times_correct,
                      'percent': round(100 * q.times_correct / q.times_answered) if q.times_answered else None}}
