"""
A similarity check for assignment hand-ins: how much wording a submission shares with other students' work on the same
assignment. A hint for the grader, not proof of copying (shared starter code or a quoted question also overlap).

Text comes from the written answer, text and code files, and Word (.docx) files. Each piece of work becomes a set of
5-word sequences ("shingles"); the score is the share of the smaller set found in the other (so copying a whole answer
into a longer one still shows). Very short work (under 25 words) isn't scored.
"""
import re
import zipfile

from .models import Submission

TEXT_EXTENSIONS = {'.txt', '.md', '.py', '.js', '.jsx', '.ts', '.html', '.htm', '.css', '.java', '.c', '.cpp', '.h', '.cs', '.php',
                   '.rb', '.go', '.sql', '.json', '.xml', '.csv', '.kt', '.swift', '.r', '.ipynb'}
MAX_FILE_BYTES = 2 * 1024 * 1024
SHINGLE, MIN_WORDS = 5, 25
WORD = re.compile(r"[\w']+", re.UNICODE)
TAG = re.compile(r'<[^>]+>')


def _file_text(field, name):
    ext = ('.' + name.rsplit('.', 1)[-1].lower()) if '.' in name else ''
    try:
        if field.size > MAX_FILE_BYTES:
            return ''
        with field.open('rb') as fh:
            raw = fh.read()
    except Exception:
        return ''
    if ext in TEXT_EXTENSIONS:
        return raw.decode('utf-8', errors='ignore')
    if ext == '.docx':
        try:
            import io
            with zipfile.ZipFile(io.BytesIO(raw)) as z:
                return TAG.sub(' ', z.read('word/document.xml').decode('utf-8', errors='ignore'))
        except Exception:
            return ''
    return ''


def text_of(submission):
    parts = [submission.text or '']
    if submission.file:
        parts.append(_file_text(submission.file, submission.filename or submission.file.name))
    for f in submission.files.all():
        parts.append(_file_text(f.file, f.filename))
    return '\n'.join(parts)


def shingles(text):
    words = [w.lower() for w in WORD.findall(text)]
    if len(words) < MIN_WORDS:
        return set()
    return {' '.join(words[i:i + SHINGLE]) for i in range(len(words) - SHINGLE + 1)}


def overlap(a, b):
    """% of the smaller set found in the other."""
    if not a or not b:
        return 0
    return round(100 * len(a & b) / min(len(a), len(b)))


def check(submission):
    """Scores a new hand-in against the latest work of every other student, and raises theirs if this one matches more."""
    mine = shingles(text_of(submission))
    if not mine:
        return
    latest = {}
    for other in (Submission.objects.filter(lesson=submission.lesson).exclude(enrollment=submission.enrollment)
                  .order_by('-created_at', '-id').prefetch_related('files')):
        latest.setdefault(other.enrollment_id, other)
    best, best_score = None, 0
    for other in latest.values():
        score = overlap(mine, shingles(text_of(other)))
        if score > best_score:
            best, best_score = other, score
        if score and (other.similarity or 0) < score:
            Submission.objects.filter(pk=other.pk).update(similarity=score, similar_to=submission)
    Submission.objects.filter(pk=submission.pk).update(similarity=best_score, similar_to=best)


def similarity_data(sub):
    if sub.similarity is None:
        return None
    other = sub.similar_to
    who = other.enrollment.student.get_full_name() or other.enrollment.student.email if other else None
    return {'percent': sub.similarity, 'with': who, 'with_submission': other.id if other else None,
            'flag': sub.similarity >= 50}
