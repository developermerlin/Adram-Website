"""
Building a course's curriculum: administrators for every course, instructors for the courses they own.

  GET    /lms/manage/courses/<slug>/curriculum/    the whole tree, drafts included
  POST   /lms/manage/courses/<slug>/sections/     {title}
  PATCH  /lms/manage/sections/<id>/   DELETE
  POST   /lms/manage/sections/<id>/lessons/       {title, kind}
  PATCH  /lms/manage/lessons/<id>/    DELETE      JSON, or multipart when uploading a video or document
  POST   /lms/manage/lessons/<id>/resources/      multipart: title, file
  DELETE /lms/manage/resources/<id>/
  PUT    /lms/manage/lessons/<id>/quiz/           quiz settings, {questions: [{kind, text, explanation, points, difficulty,
                                                    choices|accepted_answers|data}]} and optional {rules: [{bank, category, difficulty, count}]}
  POST   /lms/manage/courses/<slug>/reorder/      {sections: [ids], lessons: {section_id: [ids]}}  (drag and drop)
  GET    /lms/manage/courses/<slug>/students/     who is learning, how far they are, quiz scores and time spent
  GET    /lms/manage/courses/<slug>/submissions/?status=   assignment hand-ins to grade
  POST   /lms/manage/submissions/<id>/grade/      {status: approved|rejected, grade, feedback}
"""
import os

from django.db import transaction
from django.db.models import Avg, Count, Max, Q, Sum
from django.http import Http404
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import parsers, serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from catalog.models import Course
from portal.models import TrainingEnrollment

from . import access
from .media import MAX_RESOURCE_MB, VIDEO_EXTENSIONS, embed_url, looks_like_video, max_video_bytes, sign
from .models import Certificate, Choice, Lesson, Progress, Question, QuestionCategory, QuizAttempt, QuizRule, Resource, Section, Submission
from .notify import notify
from . import assignments
from .peer import peer_reviews_for
from .similarity import similarity_data
from .question_bank import banks_for
from .questions import clean_question, for_author
from .views import BLOCKED_EXTENSIONS, quiz_ready, submission_data

DOCUMENT_EXTENSIONS = {'.pdf', '.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx', '.odt', '.odp', '.txt', '.rtf', '.epub'}


# ---------------------------------------------------------------- output

def lesson_admin_data(lesson, user_id):
    embedded = embed_url(lesson.video_url) if lesson.video_source == Lesson.EMBED else None
    return {
        'id': lesson.id,
        'section_id': lesson.section_id,
        'title': lesson.title,
        'kind': lesson.kind,
        'summary': lesson.summary,
        'body': lesson.body,
        'video_source': lesson.video_source,
        'video_url': lesson.video_url,
        'embed_url': embedded,
        'has_video_file': bool(lesson.video_file),
        'video_name': lesson.video_name,
        'video_preview_url': f'/api/v1/lms/media/video/{lesson.id}/?t={sign("video", lesson.id, user_id)}' if lesson.video_file else None,
        'has_document': bool(lesson.document_file),
        'document_name': lesson.document_name,
        'document_url': f'/api/v1/lms/media/document/{lesson.id}/?t={sign("document", lesson.id, user_id)}' if lesson.document_file else None,
        'duration_seconds': lesson.duration_seconds,
        'is_preview': lesson.is_preview,
        'is_published': lesson.is_published,
        'is_required': lesson.is_required,
        'pass_mark': lesson.pass_mark,
        'time_limit_minutes': lesson.time_limit_minutes,
        'max_attempts': lesson.max_attempts,
        'questions_per_attempt': lesson.questions_per_attempt,
        'shuffle_questions': lesson.shuffle_questions,
        'shuffle_choices': lesson.shuffle_choices,
        'show_answers': lesson.show_answers,
        'max_points': lesson.max_points,
        'allow_resubmit': lesson.allow_resubmit,
        'due_at': lesson.due_at,
        'due_days': lesson.due_days,
        'late_policy': lesson.late_policy,
        'late_penalty_percent': lesson.late_penalty_percent,
        'max_files': lesson.max_files,
        'rubric': lesson.rubric or [],
        'peer_reviews': lesson.peer_reviews,
        'captions': [{'id': c.id, 'language': c.language, 'label': c.label,
                      'url': f'/api/v1/lms/media/caption/{c.id}/?t={sign("caption", c.id, user_id)}'} for c in lesson.captions.all()],
        'resources': [
            {'id': r.id, 'title': r.title, 'filename': r.filename, 'size': r.size,
             'url': f'/api/v1/lms/media/resource/{r.id}/?t={sign("resource", r.id, user_id)}'}
            for r in lesson.resources.all()
        ],
        'questions': [for_author(q) for q in lesson.questions.all()],
        'rules': [
            {'id': r.id, 'bank': r.bank_id, 'bank_title': r.bank.title, 'category': r.category_id,
             'category_name': r.category.name if r.category_id else '', 'difficulty': r.difficulty, 'count': r.count,
             'available': r.pool().count()}
            for r in lesson.quiz_rules.select_related('bank', 'category')
        ] if lesson.kind == Lesson.QUIZ else [],
    }


def curriculum_data(course, user_id):
    sections = course.lms_sections.prefetch_related('lessons__resources', 'lessons__questions__choices')
    return {
        'course': {'id': course.id, 'slug': course.slug, 'title': course.title, 'is_published': course.is_published, 'status': course.status},
        'limits': {'max_video_mb': max_video_bytes() // (1024 * 1024), 'max_resource_mb': MAX_RESOURCE_MB},
        'sections': [
            {'id': s.id, 'title': s.title, 'lessons': [lesson_admin_data(l, user_id) for l in s.lessons.all()]}
            for s in sections
        ],
    }


# ---------------------------------------------------------------- input

class LessonInput(serializers.Serializer):
    title = serializers.CharField(max_length=200, required=False)
    kind = serializers.ChoiceField(choices=[k for k, _ in Lesson.KINDS], required=False)
    summary = serializers.CharField(max_length=300, required=False, allow_blank=True)
    body = serializers.CharField(required=False, allow_blank=True, max_length=50000)
    video_source = serializers.ChoiceField(choices=[k for k, _ in Lesson.SOURCES], required=False, allow_blank=True)
    video_url = serializers.CharField(max_length=500, required=False, allow_blank=True)
    video_file = serializers.FileField(required=False)
    clear_video = serializers.BooleanField(required=False)
    document_file = serializers.FileField(required=False)
    clear_document = serializers.BooleanField(required=False)
    duration_seconds = serializers.IntegerField(min_value=0, max_value=60 * 60 * 24, required=False)
    is_preview = serializers.BooleanField(required=False)
    is_published = serializers.BooleanField(required=False)
    is_required = serializers.BooleanField(required=False)
    pass_mark = serializers.IntegerField(min_value=1, max_value=100, required=False)
    time_limit_minutes = serializers.IntegerField(min_value=0, max_value=600, required=False)
    max_attempts = serializers.IntegerField(min_value=0, max_value=100, required=False)
    questions_per_attempt = serializers.IntegerField(min_value=0, max_value=100, required=False)
    shuffle_questions = serializers.BooleanField(required=False)
    shuffle_choices = serializers.BooleanField(required=False)
    show_answers = serializers.BooleanField(required=False)
    max_points = serializers.IntegerField(min_value=1, max_value=1000, required=False)
    allow_resubmit = serializers.BooleanField(required=False)
    due_at = serializers.DateTimeField(required=False, allow_null=True)
    due_days = serializers.IntegerField(min_value=0, max_value=365, required=False)
    late_policy = serializers.ChoiceField(choices=[k for k, _ in Lesson.LATE_POLICIES], required=False)
    late_penalty_percent = serializers.IntegerField(min_value=0, max_value=100, required=False)
    max_files = serializers.IntegerField(min_value=1, max_value=assignments.MAX_FILES, required=False)
    rubric = serializers.JSONField(required=False)
    peer_reviews = serializers.IntegerField(min_value=0, max_value=3, required=False)

    def validate_rubric(self, value):
        try:
            return assignments.clean_rubric(value)
        except ValueError as exc:
            raise serializers.ValidationError(str(exc)) from None

    def validate_video_file(self, upload):
        extension = os.path.splitext(upload.name)[1].lower()
        if extension not in VIDEO_EXTENSIONS:
            raise serializers.ValidationError('Use an MP4, M4V, MOV or WebM video.')
        if upload.size > max_video_bytes():
            raise serializers.ValidationError(f'Videos can be at most {max_video_bytes() // (1024 * 1024)} MB. Upload it to YouTube or Vimeo and paste the link instead.')
        if not looks_like_video(upload):
            raise serializers.ValidationError('That file does not look like a video.')
        return upload

    def validate_document_file(self, upload):
        if os.path.splitext(upload.name)[1].lower() not in DOCUMENT_EXTENSIONS:
            raise serializers.ValidationError('Use a PDF, Word, PowerPoint, Excel or text document.')
        if upload.size > MAX_RESOURCE_MB * 1024 * 1024:
            raise serializers.ValidationError(f'Documents can be at most {MAX_RESOURCE_MB} MB.')
        return upload


SIMPLE_FIELDS = ('title', 'kind', 'summary', 'body', 'duration_seconds', 'is_preview', 'is_published', 'is_required', 'pass_mark',
                 'time_limit_minutes', 'max_attempts', 'questions_per_attempt', 'shuffle_questions', 'shuffle_choices', 'show_answers',
                 'max_points', 'allow_resubmit', 'due_at', 'due_days', 'late_policy', 'late_penalty_percent', 'max_files', 'rubric', 'peer_reviews')


def apply_lesson(lesson, data):
    """Applies validated input to a lesson (not yet saved) and returns a dict of problems, empty when fine."""
    errors = {}
    for field in SIMPLE_FIELDS:
        if field in data:
            setattr(lesson, field, data[field])

    if data.get('clear_video'):
        lesson.video_file = None
        lesson.video_name = ''
        lesson.video_url = ''
        lesson.video_source = Lesson.NONE
    if 'video_url' in data:
        lesson.video_url = data['video_url'].strip()
    if 'video_source' in data:
        lesson.video_source = data['video_source']
    if data.get('video_file') is not None:
        lesson.video_file = data['video_file']
        lesson.video_name = os.path.basename(data['video_file'].name)[:200]
        lesson.video_source = Lesson.UPLOAD
    if data.get('clear_document'):
        lesson.document_file = None
        lesson.document_name = ''
    if data.get('document_file') is not None:
        lesson.document_file = data['document_file']
        lesson.document_name = os.path.basename(data['document_file'].name)[:200]

    if lesson.rubric:  # with a rubric, the grade is out of the criteria's total
        lesson.max_points = min(1000, sum(c['points'] for c in lesson.rubric))
    if lesson.video_source == Lesson.EMBED and not embed_url(lesson.video_url):
        errors['video_url'] = 'Paste a YouTube or Vimeo link, for example https://www.youtube.com/watch?v=…'
    if lesson.video_source == Lesson.UPLOAD and not lesson.video_file:
        errors['video_file'] = 'Choose a video file to upload.'
    return errors


def publish_problem(lesson):
    """Why a lesson cannot be published yet, or None."""
    if lesson.kind == Lesson.VIDEO and not ((lesson.video_source == Lesson.EMBED and embed_url(lesson.video_url)) or (lesson.video_source == Lesson.UPLOAD and lesson.video_file)):
        return 'Add a video (a YouTube or Vimeo link, or an uploaded file) before publishing this lesson.'
    if lesson.kind == Lesson.TEXT and not lesson.body.strip():
        return 'Write the lesson text before publishing it.'
    if lesson.kind == Lesson.DOCUMENT and not lesson.document_file:
        return 'Upload the document before publishing this lesson.'
    if lesson.kind == Lesson.ASSIGNMENT and not lesson.body.strip():
        return 'Write the assignment instructions before publishing it.'
    if lesson.kind == Lesson.QUIZ and not quiz_ready(lesson):
        return 'Add at least one question before publishing this quiz.'
    return None


# ---------------------------------------------------------------- permissions

def _check(request, course):
    if not access.can_manage(request.user, course):
        raise Http404  # never reveal other instructors' courses
    return course


def course_for(request, slug):
    return _check(request, get_object_or_404(Course, slug=slug))


def section_for(request, pk):
    section = get_object_or_404(Section.objects.select_related('course'), pk=pk)
    _check(request, section.course)
    return section


def lesson_for(request, pk):
    lesson = get_object_or_404(Lesson.objects.select_related('section__course'), pk=pk)
    _check(request, lesson.section.course)
    return lesson


# ---------------------------------------------------------------- views

class Manage(APIView):
    permission_classes = [access.IsAdminOrInstructor]
    parser_classes = [parsers.JSONParser, parsers.MultiPartParser, parsers.FormParser]


class CurriculumView(Manage):
    def get(self, request, slug):
        return Response(curriculum_data(course_for(request, slug), request.user.id))


class SectionsView(Manage):
    def post(self, request, slug):
        course = course_for(request, slug)
        title = str(request.data.get('title', '')).strip()
        if not title:
            return Response({'title': 'Give the section a title.'}, status=status.HTTP_400_BAD_REQUEST)
        last = course.lms_sections.aggregate(m=Max('sort_order'))['m']
        section = Section.objects.create(course=course, title=title[:200], sort_order=0 if last is None else last + 1)
        return Response({'id': section.id, 'title': section.title, 'lessons': []}, status=status.HTTP_201_CREATED)


class SectionDetailView(Manage):
    def patch(self, request, pk):
        section = section_for(request, pk)
        title = str(request.data.get('title', '')).strip()
        if not title:
            return Response({'title': 'Give the section a title.'}, status=status.HTTP_400_BAD_REQUEST)
        section.title = title[:200]
        section.save(update_fields=['title'])
        return Response({'id': section.id, 'title': section.title})

    def delete(self, request, pk):
        section_for(request, pk).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class LessonsView(Manage):
    def post(self, request, pk):
        section = section_for(request, pk)
        title = str(request.data.get('title', '')).strip()
        kind = request.data.get('kind') or Lesson.VIDEO
        if not title:
            return Response({'title': 'Give the lesson a title.'}, status=status.HTTP_400_BAD_REQUEST)
        if kind not in dict(Lesson.KINDS):
            return Response({'kind': 'Choose video, reading, document, quiz or assignment.'}, status=status.HTTP_400_BAD_REQUEST)
        last = section.lessons.aggregate(m=Max('sort_order'))['m']
        lesson = Lesson.objects.create(section=section, title=title[:200], kind=kind, sort_order=0 if last is None else last + 1)
        return Response(lesson_admin_data(lesson, request.user.id), status=status.HTTP_201_CREATED)


def _announce_new_lesson(lesson):
    course = lesson.section.course
    if not course.is_published:
        return
    students = [e.student for e in TrainingEnrollment.objects.filter(
        course=course, status__in=[TrainingEnrollment.ACTIVE, TrainingEnrollment.COMPLETED]).select_related('student')]
    notify(students, 'new_lecture', f'New in {course.title}: {lesson.title}', lesson.summary, f'/learn/{course.slug}/lesson/{lesson.id}')


class LessonDetailView(Manage):
    def patch(self, request, pk):
        lesson = lesson_for(request, pk)
        was_published = lesson.is_published
        serializer = LessonInput(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        problems = apply_lesson(lesson, serializer.validated_data)
        if problems:
            return Response(problems, status=status.HTTP_400_BAD_REQUEST)
        if lesson.is_published:
            problem = publish_problem(lesson)
            if problem:
                # Keep the other edits, but never leave an unfinished lesson visible to students
                lesson.is_published = False
                lesson.save()
                return Response({'is_published': problem, 'saved_as_draft': True}, status=status.HTTP_400_BAD_REQUEST)
        lesson.save()
        if lesson.is_published and not was_published:
            _announce_new_lesson(lesson)
        return Response(lesson_admin_data(Lesson.objects.get(pk=lesson.pk), request.user.id))

    def delete(self, request, pk):
        lesson_for(request, pk).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ResourcesView(Manage):
    def post(self, request, pk):
        lesson = lesson_for(request, pk)
        upload = request.FILES.get('file')
        if not upload:
            return Response({'file': 'Choose a file to attach.'}, status=status.HTTP_400_BAD_REQUEST)
        if upload.size > MAX_RESOURCE_MB * 1024 * 1024:
            return Response({'file': f'Files can be at most {MAX_RESOURCE_MB} MB.'}, status=status.HTTP_400_BAD_REQUEST)
        if os.path.splitext(upload.name)[1].lower() in BLOCKED_EXTENSIONS:
            return Response({'file': 'That type of file cannot be attached.'}, status=status.HTTP_400_BAD_REQUEST)
        name = os.path.basename(upload.name)[:200]
        title = (str(request.data.get('title', '')).strip() or os.path.splitext(name)[0])[:200]
        last = lesson.resources.aggregate(m=Max('sort_order'))['m']
        resource = Resource.objects.create(lesson=lesson, title=title, file=upload, filename=name, size=upload.size,
                                           sort_order=0 if last is None else last + 1)
        return Response({
            'id': resource.id, 'title': resource.title, 'filename': resource.filename, 'size': resource.size,
            'url': f'/api/v1/lms/media/resource/{resource.id}/?t={sign("resource", resource.id, request.user.id)}',
        }, status=status.HTTP_201_CREATED)


class ResourceOrderView(Manage):
    """POST /lms/manage/lessons/<id>/resources/order/ {ids: [...]} puts a lesson's downloads in this order."""
    def post(self, request, pk):
        lesson = lesson_for(request, pk)
        ids = request.data.get('ids')
        own = set(lesson.resources.values_list('id', flat=True))
        if not isinstance(ids, list) or set(ids) != own or len(ids) != len(own):
            return Response({'ids': 'Send every file of this lesson once.'}, status=status.HTTP_400_BAD_REQUEST)
        for order, rid in enumerate(ids):
            Resource.objects.filter(pk=rid).update(sort_order=order)
        return Response(lesson_admin_data(Lesson.objects.get(pk=lesson.pk), request.user.id))


class ResourceDetailView(Manage):
    def delete(self, request, pk):
        resource = get_object_or_404(Resource.objects.select_related('lesson__section__course'), pk=pk)
        _check(request, resource.lesson.section.course)
        resource.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


def clean_rules(user, rules):
    """Random draws from the user's question banks: [{bank, category, difficulty, count}]."""
    if not isinstance(rules, list) or len(rules) > 20:
        raise ValueError('Send a list of up to 20 rules.')
    banks = {b.id: b for b in banks_for(user)}
    out = []
    for number, rule in enumerate(rules, start=1):
        rule = rule if isinstance(rule, dict) else {}
        try:
            bank = banks[int(rule.get('bank'))]
        except (KeyError, TypeError, ValueError):
            raise ValueError(f'Rule {number}: choose one of your question banks.') from None
        category = None
        if rule.get('category'):
            category = QuestionCategory.objects.filter(bank=bank, pk=rule['category']).first()
            if not category:
                raise ValueError(f'Rule {number}: that category is not in {bank.title}.')
        difficulty = rule.get('difficulty') or ''
        if difficulty and difficulty not in dict(Question.DIFFICULTIES):
            raise ValueError(f'Rule {number}: difficulty must be easy, medium or hard.')
        try:
            count = max(1, min(int(rule.get('count') or 1), 50))
        except (TypeError, ValueError):
            count = 1
        out.append({'bank': bank, 'category': category, 'difficulty': difficulty, 'count': count})
    return out


QUIZ_SETTINGS = {'pass_mark': (1, 100), 'time_limit_minutes': (0, 600), 'max_attempts': (0, 100), 'questions_per_attempt': (0, 100)}
QUIZ_FLAGS = ('shuffle_questions', 'shuffle_choices', 'show_answers', 'is_required')


class QuizView(Manage):
    def put(self, request, pk):
        lesson = lesson_for(request, pk)
        if lesson.kind != Lesson.QUIZ:
            return Response({'detail': 'Only quiz lessons have questions.'}, status=status.HTTP_400_BAD_REQUEST)
        questions = request.data.get('questions')
        if not isinstance(questions, list) or len(questions) > 100:
            return Response({'questions': 'Send a list of questions (up to 100).'}, status=status.HTTP_400_BAD_REQUEST)
        clean = []
        for number, item in enumerate(questions, start=1):
            try:
                clean.append(clean_question(number, item))
            except ValueError as exc:
                return Response({'questions': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        rules = None
        if request.data.get('rules') is not None:
            try:
                rules = clean_rules(request.user, request.data.get('rules'))
            except ValueError as exc:
                return Response({'rules': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        changed = []
        for field, (low, high) in QUIZ_SETTINGS.items():
            if request.data.get(field) is not None:
                try:
                    setattr(lesson, field, max(low, min(int(request.data[field]), high)))
                except (TypeError, ValueError):
                    return Response({field: 'Must be a whole number.'}, status=status.HTTP_400_BAD_REQUEST)
                changed.append(field)
        for field in QUIZ_FLAGS:
            if field in request.data:
                setattr(lesson, field, bool(request.data[field]))
                changed.append(field)
        with transaction.atomic():
            if changed:
                lesson.save(update_fields=[*changed, 'updated_at'])
            lesson.questions.all().delete()
            for order, (fields, choices) in enumerate(clean):
                question = Question.objects.create(lesson=lesson, sort_order=order, **fields)
                Choice.objects.bulk_create(
                    Choice(question=question, text=str(c['text']).strip()[:300], is_correct=bool(c.get('is_correct')), sort_order=i)
                    for i, c in enumerate(choices)
                )
            if rules is not None:
                lesson.quiz_rules.all().delete()
                QuizRule.objects.bulk_create(QuizRule(lesson=lesson, sort_order=i, **r) for i, r in enumerate(rules))
            # Questions changed: attempts in progress would point at questions that no longer exist
            QuizAttempt.objects.filter(lesson=lesson, status=QuizAttempt.IN_PROGRESS).delete()
            if lesson.is_published and not quiz_ready(lesson):  # a published quiz must keep its questions
                lesson.is_published = False
                lesson.save(update_fields=['is_published', 'updated_at'])
        return Response(lesson_admin_data(Lesson.objects.get(pk=lesson.pk), request.user.id))


class ReorderView(Manage):
    def post(self, request, slug):
        course = course_for(request, slug)
        section_ids = request.data.get('sections')
        lesson_map = request.data.get('lessons') or {}
        own_sections = {s.id: s for s in course.lms_sections.all()}
        own_lessons = {l.id: l for l in Lesson.objects.filter(section__course=course)}
        if not isinstance(section_ids, list) or set(section_ids) != set(own_sections) or len(section_ids) != len(own_sections):
            return Response({'sections': 'Send every section of this course once.'}, status=status.HTTP_400_BAD_REQUEST)
        placed = [i for ids in lesson_map.values() for i in ids] if isinstance(lesson_map, dict) else None
        if placed is None or sorted(placed) != sorted(own_lessons) or any(int(k) not in own_sections for k in lesson_map):
            return Response({'lessons': 'Send every lesson of this course once, under a section of this course.'}, status=status.HTTP_400_BAD_REQUEST)
        with transaction.atomic():
            for order, section_id in enumerate(section_ids):
                Section.objects.filter(pk=section_id).update(sort_order=order)
            for section_id, ids in lesson_map.items():
                for order, lesson_id in enumerate(ids):
                    Lesson.objects.filter(pk=lesson_id).update(section_id=int(section_id), sort_order=order)
        return Response(curriculum_data(course, request.user.id))


class StudentsView(Manage):
    def get(self, request, slug):
        course = course_for(request, slug)
        lessons = access.published_lessons(course)
        ids = [l.id for l in lessons]
        enrollments = (
            TrainingEnrollment.objects.filter(course=course, status__in=[TrainingEnrollment.ACTIVE, TrainingEnrollment.COMPLETED])
            .select_related('student')
            .annotate(done=Count('lesson_progress', filter=Q(lesson_progress__lesson_id__in=ids, lesson_progress__completed_at__isnull=False), distinct=True),
                      last_activity=Max('lesson_progress__last_viewed_at'),
                      spent=Sum('lesson_progress__time_spent_seconds'))
        )
        certificates = dict(Certificate.objects.filter(enrollment__in=enrollments).values_list('enrollment_id', 'code'))
        quiz = {row['enrollment_id']: row for row in QuizAttempt.objects.filter(enrollment__in=enrollments, status=QuizAttempt.SUBMITTED)
                .values('enrollment_id').annotate(average=Avg('score_percent'), attempts=Count('id'))}
        rows = [{
            'enrollment_id': e.id,
            'student_id': e.student_id,
            'name': e.student.get_full_name() or e.student.email,
            'email': e.student.email,
            'status': e.status,
            'enrolled_at': e.created_at,
            'completed': e.done,
            'total': len(ids),
            'percent': round(100 * e.done / len(ids)) if ids else 0,
            'last_activity': e.last_activity,
            'time_spent_seconds': e.spent or 0,
            'quiz_average': round(quiz[e.id]['average']) if e.id in quiz else None,
            'quiz_attempts': quiz[e.id]['attempts'] if e.id in quiz else 0,
            'certificate_code': certificates.get(e.id),
        } for e in enrollments]
        return Response({'total_lessons': len(ids), 'students': rows})


class CourseSubmissionsView(Manage):
    def get(self, request, slug):
        course = course_for(request, slug)
        subs = (Submission.objects.filter(lesson__section__course=course)
                .select_related('lesson', 'enrollment__student', 'similar_to__enrollment__student').prefetch_related('files'))
        wanted = request.query_params.get('status')
        if wanted in dict(Submission.STATUSES):
            subs = subs.filter(status=wanted)
        counts = dict(Submission.objects.filter(lesson__section__course=course).values_list('status').annotate(n=Count('id')))
        return Response({
            'counts': {s: counts.get(s, 0) for s, _ in Submission.STATUSES},
            'submissions': [{**submission_data(s, request.user.id),
                             'lesson': {'id': s.lesson_id, 'title': s.lesson.title, 'rubric': s.lesson.rubric or [],
                                        'due_at': assignments.due_for(s.lesson, s.enrollment)},
                             'peer_reviews': peer_reviews_for(s),
                             'similarity': similarity_data(s),
                             'student': {'id': s.enrollment.student_id, 'name': s.enrollment.student.get_full_name() or s.enrollment.student.email}}
                            for s in subs[:300]],
        })


class GradeSubmissionView(Manage):
    def post(self, request, pk):
        sub = get_object_or_404(Submission.objects.select_related('lesson__section__course', 'enrollment__student'), pk=pk)
        course = _check(request, sub.lesson.section.course)
        decision = request.data.get('status')
        if decision not in (Submission.APPROVED, Submission.REJECTED):
            return Response({'status': 'Choose approved or rejected.'}, status=status.HTTP_400_BAD_REQUEST)
        scores = []
        grade = request.data.get('grade')
        if sub.lesson.rubric and request.data.get('rubric_scores') is not None:
            try:
                scores = assignments.clean_scores(sub.lesson, request.data.get('rubric_scores'))
            except ValueError as exc:
                return Response({'rubric_scores': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
            grade = sum(scores)
        if grade not in (None, ''):
            try:
                grade = int(grade)
            except (TypeError, ValueError):
                return Response({'grade': 'The grade must be a whole number.'}, status=status.HTTP_400_BAD_REQUEST)
            if not 0 <= grade <= sub.lesson.max_points:
                return Response({'grade': f'The grade must be between 0 and {sub.lesson.max_points}.'}, status=status.HTTP_400_BAD_REQUEST)
        else:
            grade = None
        sub.status, sub.raw_grade, sub.rubric_scores = decision, grade, scores
        sub.grade = assignments.after_penalty(grade, sub.penalty_percent)  # late work loses its penalty
        sub.feedback = str(request.data.get('feedback', '')).strip()[:5000]
        sub.graded_by, sub.graded_at = request.user, timezone.now()
        sub.save()
        if decision == Submission.APPROVED:
            access.mark_complete(sub.enrollment, sub.lesson)
            access.finish_if_done(sub.enrollment)
        else:
            Progress.objects.filter(enrollment=sub.enrollment, lesson=sub.lesson).update(completed_at=None)
        mark = f' ({sub.grade}/{sub.lesson.max_points})' if sub.grade is not None else ''
        notify(sub.enrollment.student, 'assignment_graded',
               f'{sub.lesson.title}: {"approved" if decision == Submission.APPROVED else "needs more work"}{mark}',
               sub.feedback[:300], f'/learn/{course.slug}/lesson/{sub.lesson_id}')
        return Response(submission_data(sub, request.user.id))
