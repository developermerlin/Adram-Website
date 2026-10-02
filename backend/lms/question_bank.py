"""
Question banks: reusable questions an instructor keeps, sorted into categories and by difficulty. A quiz copies
questions from a bank, or draws random ones from it each attempt (QuizRule, set in the quiz editor). Every question
counts how often it is answered and answered right, so weak questions stand out.

  GET    /lms/manage/banks/                         my banks (administrators: every bank)
  POST   /lms/manage/banks/                         {title, description, course (slug, optional)}
  GET    /lms/manage/banks/<id>/?category=&difficulty=&kind=&q=     the bank, its categories and questions
  PATCH  /lms/manage/banks/<id>/   DELETE
  POST   /lms/manage/banks/<id>/categories/         {name}
  PATCH  /lms/manage/bank-categories/<id>/  DELETE  {name}
  POST   /lms/manage/banks/<id>/questions/          one question (as in the quiz editor) + category, difficulty
  PATCH  /lms/manage/bank-questions/<id>/   DELETE
  POST   /lms/manage/banks/<id>/import/             multipart file: a CSV (see the template)
  GET    /lms/manage/banks/import-template/         the CSV template
"""
import csv
import io

from django.db import transaction
from django.db.models import Count, Q
from django.http import Http404, HttpResponse
from django.shortcuts import get_object_or_404
from rest_framework import parsers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from catalog.models import Course

from . import access
from .models import Choice, Question, QuestionBank, QuestionCategory
from .questions import clean_question, for_author
from .views import quiz_ready

MAX_IMPORT_ROWS, MAX_IMPORT_BYTES = 500, 1024 * 1024
KIND_NAMES = {**{k: k for k, _ in Question.KINDS}, **{label.lower(): k for k, label in Question.KINDS},
              'mcq': Question.SINGLE, 'choice': Question.SINGLE, 'checkbox': Question.MULTIPLE, 'truefalse': Question.TRUE_FALSE,
              'true/false': Question.TRUE_FALSE, 'tf': Question.TRUE_FALSE, 'blank': Question.FILL_BLANK, 'fill': Question.FILL_BLANK,
              'match': Question.MATCHING}
TEMPLATE_ROWS = [
    ['type', 'question', 'options', 'correct', 'points', 'difficulty', 'category', 'explanation'],
    ['single', 'Which tag makes a link?', '<p>|<a>|<div>', '<a>', '1', 'easy', 'HTML', 'The a (anchor) tag makes links.'],
    ['multiple', 'Which are programming languages?', 'Python|HTML|JavaScript', 'Python|JavaScript', '2', 'medium', 'Basics', ''],
    ['true_false', 'CSS controls how a page looks.', '', 'true', '1', 'easy', 'CSS', ''],
    ['short', 'What does CPU stand for?', '', 'central processing unit|central processor', '1', 'medium', 'Hardware', ''],
    ['fill_blank', 'The capital of Sierra Leone is [Freetown].', '', '', '1', 'easy', 'General', 'Square brackets mark each blank; use | for other accepted answers.'],
    ['matching', 'Match each tool to its use.', 'HTML=Structure|CSS=Style|JavaScript=Behaviour', '', '3', 'hard', 'Basics', 'Write each pair as left=right.'],
]


def banks_for(user):
    banks = QuestionBank.objects.all()
    return banks if access.is_admin(user) else banks.filter(owner=user)


def bank_for(request, pk):
    bank = banks_for(request.user).filter(pk=pk).select_related('course', 'owner').first()
    if not bank:
        raise Http404
    return bank


def _course(request, slug):
    if not slug:
        return None
    course = Course.objects.filter(slug=slug).first()
    if not course or not access.can_manage(request.user, course):
        raise ValueError('Choose one of your courses.')
    return course


def bank_data(bank, counts=None):
    return {'id': bank.id, 'title': bank.title, 'description': bank.description,
            'course': {'slug': bank.course.slug, 'title': bank.course.title} if bank.course_id else None,
            'owner': bank.owner.get_full_name() or bank.owner.email, 'updated_at': bank.updated_at,
            **(counts or {})}


def save_question(bank, item, number=1, question=None):
    """Create or replace one bank question from the editor's (or an import row's) data."""
    fields, choices = clean_question(number, item)
    category = None
    if item.get('category'):
        category = bank.categories.filter(pk=item['category']).first() if str(item['category']).isdigit() else None
        if not category:
            raise ValueError(f'Question {number}: that category is not in this bank.')
    elif item.get('category_name'):
        category, _ = QuestionCategory.objects.get_or_create(bank=bank, name=str(item['category_name']).strip()[:120])
    with transaction.atomic():
        if question:
            for key, value in fields.items():
                setattr(question, key, value)
            question.category = category
            question.save()
            question.choices.all().delete()
        else:
            last = bank.questions.order_by('-sort_order').values_list('sort_order', flat=True).first()
            question = Question.objects.create(bank=bank, category=category, sort_order=(last or 0) + 1, **fields)
        Choice.objects.bulk_create(
            Choice(question=question, text=str(c['text']).strip()[:300], is_correct=bool(c.get('is_correct')), sort_order=i)
            for i, c in enumerate(choices)
        )
    return question


class Manage(APIView):
    permission_classes = [access.IsAdminOrInstructor]


class BanksView(Manage):
    def get(self, request):
        banks = banks_for(request.user).select_related('course', 'owner').annotate(
            question_count=Count('questions', distinct=True), category_count=Count('categories', distinct=True))
        banks = banks.prefetch_related('categories')
        return Response([bank_data(b, {'question_count': b.question_count, 'category_count': b.category_count,
                                       'categories': [{'id': c.id, 'name': c.name} for c in b.categories.all()]}) for b in banks])

    def post(self, request):
        title = str(request.data.get('title', '')).strip()
        if not title:
            return Response({'title': 'Give the bank a name.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            course = _course(request, request.data.get('course'))
        except ValueError as exc:
            return Response({'course': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        bank = QuestionBank.objects.create(owner=request.user, course=course, title=title[:200],
                                           description=str(request.data.get('description', '')).strip()[:500])
        return Response(bank_data(bank, {'question_count': 0, 'category_count': 0}), status=status.HTTP_201_CREATED)


class BankDetailView(Manage):
    def get(self, request, pk):
        bank = bank_for(request, pk)
        questions = bank.questions.select_related('category').prefetch_related('choices')
        params = request.query_params
        if params.get('category') == 'none':
            questions = questions.filter(category__isnull=True)
        elif str(params.get('category', '')).isdigit():
            questions = questions.filter(category_id=params['category'])
        if params.get('difficulty') in dict(Question.DIFFICULTIES):
            questions = questions.filter(difficulty=params['difficulty'])
        if params.get('kind') in dict(Question.KINDS):
            questions = questions.filter(kind=params['kind'])
        if params.get('q'):
            questions = questions.filter(Q(text__icontains=params['q']) | Q(explanation__icontains=params['q']))
        categories = bank.categories.annotate(count=Count('questions'))
        totals = bank.questions.aggregate(n=Count('id'), **{d: Count('id', filter=Q(difficulty=d)) for d, _ in Question.DIFFICULTIES})
        return Response({
            **bank_data(bank, {'question_count': totals['n'], 'category_count': len(categories)}),
            'by_difficulty': {d: totals[d] for d, _ in Question.DIFFICULTIES},
            'categories': [{'id': c.id, 'name': c.name, 'count': c.count} for c in categories],
            'questions': [for_author(q) for q in questions],
            'used_by': [{'lesson': r.lesson.title, 'course': r.lesson.section.course.title} for r in bank.rules.select_related('lesson__section__course')],
        })

    def patch(self, request, pk):
        bank = bank_for(request, pk)
        if 'title' in request.data:
            title = str(request.data['title']).strip()
            if not title:
                return Response({'title': 'Give the bank a name.'}, status=status.HTTP_400_BAD_REQUEST)
            bank.title = title[:200]
        if 'description' in request.data:
            bank.description = str(request.data['description']).strip()[:500]
        if 'course' in request.data:
            try:
                bank.course = _course(request, request.data['course'])
            except ValueError as exc:
                return Response({'course': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        bank.save()
        return Response(bank_data(bank))

    def delete(self, request, pk):
        bank = bank_for(request, pk)
        if bank.rules.exists() and request.query_params.get('force') != '1':
            return Response({'detail': 'Quizzes draw questions from this bank. Remove those rules first, or delete anyway.',
                             'code': 'in_use'}, status=status.HTTP_409_CONFLICT)
        lessons = [r.lesson for r in bank.rules.select_related('lesson')]
        with transaction.atomic():
            bank.delete()
            for lesson in lessons:  # a published quiz with nothing left to ask goes offline
                if lesson.is_published and not quiz_ready(lesson):
                    lesson.is_published = False
                    lesson.save(update_fields=['is_published', 'updated_at'])
        return Response(status=status.HTTP_204_NO_CONTENT)


class BankCategoriesView(Manage):
    def post(self, request, pk):
        bank = bank_for(request, pk)
        name = str(request.data.get('name', '')).strip()[:120]
        if not name:
            return Response({'name': 'Name the category.'}, status=status.HTTP_400_BAD_REQUEST)
        if bank.categories.filter(name__iexact=name).exists():
            return Response({'name': 'This bank already has that category.'}, status=status.HTTP_400_BAD_REQUEST)
        category = QuestionCategory.objects.create(bank=bank, name=name)
        return Response({'id': category.id, 'name': category.name, 'count': 0}, status=status.HTTP_201_CREATED)


class BankCategoryDetailView(Manage):
    def _get(self, request, pk):
        category = get_object_or_404(QuestionCategory.objects.select_related('bank'), pk=pk)
        bank_for(request, category.bank_id)
        return category

    def patch(self, request, pk):
        category = self._get(request, pk)
        name = str(request.data.get('name', '')).strip()[:120]
        if not name:
            return Response({'name': 'Name the category.'}, status=status.HTTP_400_BAD_REQUEST)
        if category.bank.categories.filter(name__iexact=name).exclude(pk=pk).exists():
            return Response({'name': 'This bank already has that category.'}, status=status.HTTP_400_BAD_REQUEST)
        category.name = name
        category.save(update_fields=['name'])
        return Response({'id': category.id, 'name': category.name})

    def delete(self, request, pk):
        self._get(request, pk).delete()  # its questions stay, without a category
        return Response(status=status.HTTP_204_NO_CONTENT)


class BankQuestionsView(Manage):
    def post(self, request, pk):
        bank = bank_for(request, pk)
        try:
            question = save_question(bank, request.data)
        except ValueError as exc:
            return Response({'detail': str(exc).replace('Question 1: ', '').replace('Question 1 ', 'The question ')},
                            status=status.HTTP_400_BAD_REQUEST)
        return Response(for_author(Question.objects.select_related('category').get(pk=question.pk)), status=status.HTTP_201_CREATED)


class BankQuestionDetailView(Manage):
    def _get(self, request, pk):
        question = get_object_or_404(Question.objects.filter(bank__isnull=False), pk=pk)
        return bank_for(request, question.bank_id), question

    def patch(self, request, pk):
        bank, question = self._get(request, pk)
        item = {**for_author(question), **request.data}
        if 'category' in request.data:
            item.pop('category_name', None)
        try:
            save_question(bank, item, question=question)
        except ValueError as exc:
            return Response({'detail': str(exc).replace('Question 1: ', '').replace('Question 1 ', 'The question ')},
                            status=status.HTTP_400_BAD_REQUEST)
        return Response(for_author(Question.objects.select_related('category').get(pk=question.pk)))

    def delete(self, request, pk):
        _, question = self._get(request, pk)
        question.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------- CSV import

def _split(value):
    return [v.strip() for v in str(value or '').split('|') if v.strip()]


def row_to_item(row):
    """One CSV row (see TEMPLATE_ROWS) as a question for save_question."""
    kind = KIND_NAMES.get(str(row.get('type') or 'single').strip().lower())
    if not kind:
        raise ValueError(f'unknown type "{row.get("type")}"')
    item = {'kind': kind, 'text': row.get('question', ''), 'points': row.get('points') or 1,
            'difficulty': str(row.get('difficulty') or '').strip().lower() or Question.MEDIUM,
            'explanation': row.get('explanation', ''), 'category_name': str(row.get('category') or '').strip()}
    options, correct = _split(row.get('options')), _split(row.get('correct'))
    if kind == Question.SHORT:
        item['accepted_answers'] = correct
    elif kind == Question.TRUE_FALSE:
        value = (correct or [''])[0].lower()
        if value not in ('true', 'false', 't', 'f', 'yes', 'no'):
            raise ValueError('"correct" must be true or false')
        item['answer'] = value in ('true', 't', 'yes')
    elif kind == Question.MATCHING:
        pairs = []
        for option in options:
            if '=' not in option:
                raise ValueError(f'write each pair as left=right ("{option}")')
            left, right = option.split('=', 1)
            pairs.append({'left': left.strip(), 'right': right.strip()})
        item['data'] = {'pairs': pairs}
    elif kind in (Question.SINGLE, Question.MULTIPLE):
        wanted = set()
        for c in correct:
            if c.isdigit() and 1 <= int(c) <= len(options) and c not in options:
                wanted.add(int(c) - 1)  # an option number
            else:
                match = [i for i, o in enumerate(options) if o.casefold() == c.casefold()]
                if not match:
                    raise ValueError(f'the correct answer "{c}" is not one of the options')
                wanted.update(match)
        item['choices'] = [{'text': o, 'is_correct': i in wanted} for i, o in enumerate(options)]
    return item


class BankImportView(Manage):
    parser_classes = [parsers.MultiPartParser, parsers.FormParser]

    def post(self, request, pk):
        bank = bank_for(request, pk)
        upload = request.FILES.get('file')
        if not upload:
            return Response({'file': 'Choose a CSV file.'}, status=status.HTTP_400_BAD_REQUEST)
        if upload.size > MAX_IMPORT_BYTES:
            return Response({'file': 'The file is too large (1 MB at most).'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            text = upload.read().decode('utf-8-sig')
        except UnicodeDecodeError:
            return Response({'file': 'Save the file as CSV (UTF-8) and try again.'}, status=status.HTTP_400_BAD_REQUEST)
        reader = csv.DictReader(io.StringIO(text))
        if not reader.fieldnames or 'question' not in [f.strip().lower() for f in reader.fieldnames]:
            return Response({'file': 'The first row must name the columns: type, question, options, correct, points, difficulty, category, explanation.'},
                            status=status.HTTP_400_BAD_REQUEST)
        created, errors = 0, []
        for line, raw in enumerate(reader, start=2):
            if line - 1 > MAX_IMPORT_ROWS:
                errors.append({'row': line, 'message': f'Only the first {MAX_IMPORT_ROWS} questions are imported.'})
                break
            row = {str(k or '').strip().lower(): (v or '').strip() for k, v in raw.items()}
            if not any(row.values()):
                continue
            try:
                save_question(bank, row_to_item(row), number=line)
                created += 1
            except ValueError as exc:
                message = str(exc)
                errors.append({'row': line, 'message': message.split(': ', 1)[-1] if message.startswith('Question') else message})
        return Response({'created': created, 'errors': errors}, status=status.HTTP_201_CREATED if created else status.HTTP_400_BAD_REQUEST)


class BankTemplateView(Manage):
    def get(self, request):
        out = io.StringIO()
        csv.writer(out).writerows(TEMPLATE_ROWS)
        response = HttpResponse(out.getvalue(), content_type='text/csv; charset=utf-8')
        response['Content-Disposition'] = 'attachment; filename="question-bank-template.csv"'
        return response
