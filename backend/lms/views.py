"""
The student side of the course portal.

  GET  /lms/courses/<slug>/                 outline: sections, lessons, the student's progress (course, section, lesson)
  GET  /lms/lessons/<id>/                   one lesson (video, reading, document, quiz, assignment) if the student may open it
  POST /lms/lessons/<id>/progress/          {completed?, position?, spent?}  (a heartbeat while learning)
  POST /lms/lessons/<id>/quiz/start/        start (or resume) an attempt: the questions to answer, and the deadline
  POST /lms/lessons/<id>/quiz/              {attempt?, answers: {question_id: choice id | [choice ids] | "text"}}
  GET/POST /lms/lessons/<id>/submissions/   an assignment: my hand-ins / hand in {text, file}
  GET/POST /lms/lessons/<id>/notes/         my notes on a lesson / add {body, position}
  GET  /lms/courses/<slug>/notes/?q=        all my notes in a course (searchable)
  PATCH/DELETE /lms/notes/<id>/
  GET  /lms/courses/<slug>/certificate/     the certificate, once the course is completed
  GET  /lms/certificates/<code>/            anyone can check a certificate
  GET  /lms/me/                             the student's courses and how far along they are
  GET  /lms/me/certificates/                every certificate the student earned
  GET  /lms/media/<kind>/<id>/?t=<token>    a video, document, resource or handed-in file, with a signed link
"""
import logging
import os
import random
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.db.models import Count, F, Max, Sum
from django.http import Http404
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import User
from catalog.models import Course
from catalog.serializers import CourseSerializer
from .materials import can_download, lesson_files
from portal.models import TrainingEnrollment

from . import access, assignments, certificates, premium, questions as quiz_questions
from .briefs import instructor_info, public_name
from .media import MAX_RESOURCE_MB, embed_url, file_response, read_token, sign
from .models import (
    Certificate, Lesson, LmsSettings, Note, Order, OrderItem, LessonCaption, Progress, Question, QuizAttempt, Resource, Review, Submission, SubmissionFile,
)
from .notify import notify, notify_admins

logger = logging.getLogger(__name__)
BLOCKED_EXTENSIONS = {'.exe', '.bat', '.cmd', '.sh', '.js', '.html', '.htm', '.svg', '.php', '.msi', '.com', '.scr', '.ps1'}


def _course_or_404(user, slug):
    """Published programmes for everyone; the people who manage a course can also open it before it is published."""
    course = get_object_or_404(Course, slug=slug)
    if not course.is_published and not (user and user.is_authenticated and access.can_manage(user, course)):
        raise Http404
    return course


def media_link(kind, pk, user_id):
    return f'/api/v1/lms/media/{kind}/{pk}/?t={sign(kind, pk, user_id)}'


def lesson_outline(lesson):
    return {
        'id': lesson.id,
        'title': lesson.title,
        'kind': lesson.kind,
        'summary': lesson.summary,
        'duration_seconds': lesson.duration_seconds,
        'is_preview': lesson.is_preview,
        'is_required': lesson.is_required,
    }


def platform_name():
    try:
        from cms.models import PageContent  # the name set under Site content, when there is one
        name = (PageContent.objects.filter(slug='site').values_list('data', flat=True).first() or {}).get('name')
        if isinstance(name, str) and name.strip():
            return name.strip()
    except Exception:
        pass
    return getattr(settings, 'SITE_NAME', 'ADRAM Technologies')


def certificate_data(certificate):
    enrollment = certificate.enrollment
    student, course = enrollment.student, enrollment.course
    signer = LmsSettings.load()
    template = certificates.template_for(certificate)
    url = certificates.verify_url(certificate.code)
    organisation = platform_name()
    return {
        'template': certificates.template_data(template),
        'verify_url': url,
        'qr_svg': certificates.qr_svg(url) if not template or template.show_qr else '',
        'linkedin_url': certificates.linkedin_url(certificate, course.title, organisation),
        'code': certificate.code,
        'student_name': student.get_full_name() or student.email,
        'course_title': course.title,
        'course_slug': course.slug,
        'instructor_name': instructor_info(course)['name'],
        'platform_name': organisation,
        'signer_name': (template.signer_name if template else '') or signer.certificate_signer_name,
        'signer_title': (template.signer_title if template else '') or signer.certificate_signer_title,
        'signature': signer.certificate_signature,
        'issued_at': certificate.issued_at,
        'revoked': bool(certificate.revoked_at),
        'revoked_at': certificate.revoked_at,
        'hours': round((course_seconds(course) or 0) / 3600, 1),
    }


def course_seconds(course):
    return Lesson.objects.filter(section__course=course, is_published=True).aggregate(s=Sum('duration_seconds'))['s'] or 0


def open_order_for(user, course):
    """An order for this course the student has not finished paying, if any."""
    if not (user and user.is_authenticated):
        return None
    item = (OrderItem.objects.filter(order__student=user, course=course, order__status__in=Order.OPEN)
            .select_related('order').order_by('-order__created_at').first())
    return {'id': item.order.id, 'number': item.order.number, 'status': item.order.status} if item else None


def premium_info(user, course):
    rates = LmsSettings.load()
    if not (course.is_premium and rates.premium_enabled) or course.is_free:
        return None
    return {'included': True, 'active_until': premium.premium_until(user)}


def blocked_info(user, course, place):
    """A place the student has but can't use now: Premium ended, or a payment-plan part is overdue."""
    if not (place and place.status in (TrainingEnrollment.ACTIVE, TrainingEnrollment.COMPLETED)):
        return None
    reason = premium.blocked_reason(place)
    if reason == 'instalment_overdue':
        part = premium.overdue_part(user, course)
        return {'reason': reason, 'order_id': part.id, 'due_at': part.due_at, 'amount': f'{part.total:.2f}'}
    return {'reason': reason} if reason else None


class CourseOutlineView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, slug):
        course = _course_or_404(request.user, slug)
        lessons = access.published_lessons(course)
        enrollment = access.enrollment_for(request.user, course)
        manager = request.user.is_authenticated and access.can_manage(request.user, course)
        pending = None
        if request.user.is_authenticated and not enrollment:
            pending = TrainingEnrollment.objects.filter(student=request.user, course=course).exclude(status=TrainingEnrollment.CANCELLED).first()

        sections = []
        for lesson in lessons:
            if not sections or sections[-1]['id'] != lesson.section_id:
                sections.append({'id': lesson.section_id, 'title': lesson.section.title, 'lessons': []})
            sections[-1]['lessons'].append({**lesson_outline(lesson), 'locked': not (enrollment or manager or lesson.is_preview)})

        progress = access.summary(enrollment, lessons) if enrollment else None
        data = {
            'course': {**CourseSerializer(course).data, 'is_published': course.is_published, 'status': course.status},
            'sections': sections,
            'totals': {'lessons': len(lessons), 'seconds': sum(l.duration_seconds for l in lessons),
                       'quizzes': sum(l.kind == Lesson.QUIZ for l in lessons), 'assignments': sum(l.kind == Lesson.ASSIGNMENT for l in lessons),
                       'documents': sum(l.kind == Lesson.DOCUMENT for l in lessons),
                       'resources': Resource.objects.filter(lesson__in=lessons).count()},
            'has_content': bool(lessons),
            'can_download': can_download(request.user, course)[0],
            'enrolled': enrollment is not None,
            'can_manage': manager,
            'enrollment_status': (enrollment or pending).status if (enrollment or pending) else None,
            # A request waiting for ADRAM, or one they declined: when it was asked and ADRAM's message
            'enrollment_request': ({'requested_at': pending.created_at, 'decided_at': pending.decided_at, 'note': pending.note,
                                    'start_date': pending.start_date} if pending else None),
            'open_order': None if enrollment else open_order_for(request.user, course),
            # Premium (alongside buying), paying in parts, and why an existing place is closed right now
            'premium': premium_info(request.user, course),
            'instalments': None if enrollment else premium.instalment_offer(course, request.user),
            'blocked': blocked_info(request.user, course, pending) if not enrollment else None,
            'progress': progress,
            'certificate_code': None,
        }
        if enrollment:
            certificate = Certificate.objects.filter(enrollment=enrollment, revoked_at__isnull=True).first()
            data['certificate_code'] = certificate.code if certificate else None
        return Response(data)


def _neighbours(course, lesson):
    lessons = access.published_lessons(course)
    ids = [l.id for l in lessons]
    if lesson.id not in ids:
        return None, None
    index = ids.index(lesson.id)
    return (ids[index - 1] if index else None), (ids[index + 1] if index + 1 < len(ids) else None)


def question_for_student(question, order=None):
    return quiz_questions.for_student(question, order)


def _asked(attempt, lesson):
    """The questions of an attempt, in the order asked (its own and any drawn from a question bank)."""
    found = {q.id: q for q in Question.objects.filter(pk__in=attempt.question_ids).prefetch_related('choices')}
    return [found[i] for i in attempt.question_ids if i in found] or list(lesson.questions.prefetch_related('choices'))


def attempt_data(attempt, lesson):
    deadline = attempt.created_at + timedelta(minutes=lesson.time_limit_minutes) if lesson.time_limit_minutes else None
    return {'id': attempt.id, 'started_at': attempt.created_at, 'deadline': deadline,
            'questions': [question_for_student(q, attempt.choice_order.get(str(q.id))) for q in _asked(attempt, lesson)]}


def quiz_size(lesson):
    """How many questions one attempt asks: the quiz's own (or its random selection) plus those drawn from banks."""
    count = lesson.questions.count()
    own = min(count, lesson.questions_per_attempt) if lesson.questions_per_attempt else count
    return own + sum(min(rule.count, rule.pool().count()) for rule in lesson.quiz_rules.select_related('bank'))


def submission_data(sub, user_id):
    files = [{'id': f.id, 'filename': f.filename, 'size': f.size, 'url': media_link('submission-file', f.id, user_id)} for f in sub.files.all()]
    if sub.file:  # handed in before several files were allowed
        files.insert(0, {'id': None, 'filename': sub.filename, 'size': None, 'url': media_link('submission', sub.id, user_id)})
    return {'id': sub.id, 'status': sub.status, 'status_display': sub.get_status_display(), 'text': sub.text,
            'filename': files[0]['filename'] if files else '', 'file_url': files[0]['url'] if files else None, 'files': files,
            'grade': sub.grade, 'raw_grade': sub.raw_grade, 'max_points': sub.lesson.max_points, 'feedback': sub.feedback,
            'rubric_scores': sub.rubric_scores or [], 'is_late': sub.is_late, 'penalty_percent': sub.penalty_percent,
            'graded_at': sub.graded_at, 'created_at': sub.created_at}


class LessonView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, pk):
        lesson = get_object_or_404(Lesson.objects.select_related('section__course'), pk=pk)
        course = lesson.course
        enrollment = access.enrollment_for(request.user, course)
        if not course.is_published and not (request.user.is_authenticated and access.can_manage(request.user, course)):
            raise Http404
        if not access.can_open(request.user, lesson, enrollment):
            if not request.user.is_authenticated:
                return Response({'detail': 'Sign in to open this lesson.', 'code': 'sign_in'}, status=status.HTTP_401_UNAUTHORIZED)
            return Response({'detail': 'Enrol on this course to open its lessons.', 'code': 'enrollment_required'}, status=status.HTTP_403_FORBIDDEN)

        user_id = request.user.id if request.user.is_authenticated else 0
        video = None
        if lesson.kind == Lesson.VIDEO:
            if lesson.video_source == Lesson.EMBED and embed_url(lesson.video_url):
                video = {'type': 'embed', 'url': embed_url(lesson.video_url)}
            elif lesson.video_source == Lesson.UPLOAD and lesson.video_file:
                video = {'type': 'upload', 'url': media_link('video', lesson.id, user_id),
                         'captions': [{'id': c.id, 'language': c.language, 'label': c.label, 'url': media_link('caption', c.id, user_id)}
                                      for c in lesson.captions.all()]}

        progress = None
        peek = request.query_params.get('peek') == '1'  # the course page's player: don't move the student's place
        if enrollment and peek:
            progress = Progress.objects.filter(enrollment=enrollment, lesson=lesson).first()
        elif enrollment:
            progress, _ = Progress.objects.get_or_create(enrollment=enrollment, lesson=lesson)
            progress.last_viewed_at = timezone.now()
            progress.save(update_fields=['last_viewed_at', 'updated_at'])
        previous_id, next_id = _neighbours(course, lesson)
        data = {
            **lesson_outline(lesson),
            'course': {'slug': course.slug, 'title': course.title},
            'section_title': lesson.section.title,
            'body': lesson.body,
            'video': video,
            # What this lesson offers to download (enrolled students, when the course allows it)
            'downloads': lesson_files(lesson, user_id, course.allow_video_downloads) if can_download(request.user, course)[0] else [],
            'document': ({'name': lesson.document_name, 'url': media_link('document', lesson.id, user_id),
                          'is_pdf': lesson.document_name.lower().endswith('.pdf')} if lesson.kind == Lesson.DOCUMENT and lesson.document_file else None),
            'resources': [
                {'id': r.id, 'title': r.title, 'filename': r.filename, 'size': r.size, 'url': media_link('resource', r.id, user_id)}
                for r in lesson.resources.all()
            ],
            'previous_id': previous_id,
            'next_id': next_id,
            'is_published': lesson.is_published,
            'completed': bool(progress and progress.completed_at),
            'position_seconds': progress.position_seconds if progress else 0,
            'watch_percent': progress.watch_percent if progress else 0,
            'can_track': enrollment is not None,
            # the student's email shown faintly over videos (so recordings can be traced back to the account)
            'watermark': (request.user.email if lesson.kind == Lesson.VIDEO and enrollment is not None
                          and LmsSettings.load().watermark_videos and not access.can_manage(request.user, course) else None),
            'can_manage': request.user.is_authenticated and access.can_manage(request.user, course),
        }
        if lesson.kind == Lesson.QUIZ:
            record = access.quiz_record(enrollment, lesson)
            open_attempt = QuizAttempt.objects.filter(enrollment=enrollment, lesson=lesson, status=QuizAttempt.IN_PROGRESS).first() if enrollment else None
            data['pass_mark'] = lesson.pass_mark
            data['quiz'] = {
                'pass_mark': lesson.pass_mark, 'time_limit_minutes': lesson.time_limit_minutes, 'max_attempts': lesson.max_attempts,
                'question_count': quiz_size(lesson),
                'show_answers': lesson.show_answers, 'record': record,
                'attempt': attempt_data(open_attempt, lesson) if open_attempt else None,
            }
            data['last_attempt'] = record['last']
            # Previews (not enrolled) see the questions without taking the quiz
            data['questions'] = [] if enrollment else [question_for_student(q) for q in lesson.questions.prefetch_related('choices')]
        if lesson.kind == Lesson.ASSIGNMENT:
            subs = list(Submission.objects.filter(enrollment=enrollment, lesson=lesson).select_related('lesson').prefetch_related('files')) if enrollment else []
            latest = subs[0] if subs else None
            info = assignments.assignment_info(lesson, enrollment)
            data['assignment'] = {
                **info, 'max_points': lesson.max_points, 'allow_resubmit': lesson.allow_resubmit, 'peer_reviews': lesson.peer_reviews,
                'latest': submission_data(latest, user_id) if latest else None,
                'history': [submission_data(s, user_id) for s in subs[1:10]],
                'can_submit': bool(enrollment) and not info['closed'] and (not latest or (latest.status != Submission.APPROVED and lesson.allow_resubmit)),
            }
        return Response(data)


def _tracked(request, pk):
    """The lesson and the student's enrolment, for actions that change progress."""
    lesson = get_object_or_404(Lesson.objects.select_related('section__course'), pk=pk, is_published=True)
    enrollment = access.enrollment_for(request.user, lesson.course)
    return lesson, enrollment


def _completion(enrollment):
    lessons = access.published_lessons(enrollment.course)
    certificate, _ = access.finish_if_done(enrollment)
    return {'progress': access.summary(enrollment, lessons), 'certificate_code': certificate.code if certificate and not certificate.revoked_at else None}


def _int(value, low, high):
    return max(low, min(int(value), high))


class LessonProgressView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        lesson, enrollment = _tracked(request, pk)
        if not enrollment:
            return Response({'detail': 'Enrol on this course to track your progress.'}, status=status.HTTP_403_FORBIDDEN)
        progress, _ = Progress.objects.get_or_create(enrollment=enrollment, lesson=lesson)
        fields = {'updated_at', 'last_viewed_at'}
        progress.last_viewed_at = timezone.now()
        try:
            if request.data.get('position') is not None:
                progress.position_seconds = _int(request.data['position'], 0, 60 * 60 * 24)
                progress.watched_seconds = max(progress.watched_seconds, progress.position_seconds)
                fields |= {'position_seconds', 'watched_seconds'}
            if request.data.get('spent') is not None:
                spent = _int(request.data['spent'], 0, 300)  # at most 5 minutes per heartbeat
                progress.time_spent_seconds += spent
                fields.add('time_spent_seconds')
                from .learning_analytics import record_time
                record_time(request.user, spent)  # today's minutes, for streaks, goals and charts
        except (TypeError, ValueError):
            return Response({'position': 'Must be a number of seconds.'}, status=status.HTTP_400_BAD_REQUEST)
        progress.save(update_fields=list(fields))

        completed = request.data.get('completed')
        # Watching (nearly) all of a video completes it
        if (completed is None and lesson.kind == Lesson.VIDEO and lesson.duration_seconds
                and progress.watched_seconds >= 0.9 * lesson.duration_seconds and not progress.completed_at):
            completed = True
        if completed is not None:
            if completed and lesson.kind == Lesson.QUIZ:
                return Response({'detail': 'Pass the quiz to complete this lesson.'}, status=status.HTTP_400_BAD_REQUEST)
            if completed and lesson.kind == Lesson.ASSIGNMENT:
                return Response({'detail': 'This lesson is completed when your assignment is approved.'}, status=status.HTTP_400_BAD_REQUEST)
            if completed:
                access.mark_complete(enrollment, lesson)
            else:
                progress.completed_at = None
                progress.save(update_fields=['completed_at', 'updated_at'])
        progress.refresh_from_db()
        stream = None
        if lesson.kind == Lesson.VIDEO and ('playing' in request.data or request.data.get('take_over')):
            from .streams import beat
            stream = beat(request, bool(request.data.get('playing')), take_over=bool(request.data.get('take_over')))
        return Response({'completed': bool(progress.completed_at), 'watch_percent': progress.watch_percent, 'stream': stream,
                         **_completion(enrollment)})


# ---------------------------------------------------------------- quizzes

def grade_question(question, answer):
    """(correct, chosen) for one answer."""
    return quiz_questions.grade(question, answer)


def _attempts_left(lesson, enrollment):
    if not lesson.max_attempts:
        return None
    return max(0, lesson.max_attempts - QuizAttempt.objects.filter(enrollment=enrollment, lesson=lesson, status=QuizAttempt.SUBMITTED).count())


def _new_attempt(lesson, enrollment):
    ids = list(lesson.questions.values_list('id', flat=True))
    if lesson.shuffle_questions or lesson.questions_per_attempt:
        random.shuffle(ids)
    if lesson.questions_per_attempt:
        ids = ids[:lesson.questions_per_attempt]
        if not lesson.shuffle_questions:  # a random selection, still in the course's order
            order = list(lesson.questions.values_list('id', flat=True))
            ids.sort(key=order.index)
    for rule in lesson.quiz_rules.select_related('bank'):  # random questions from question banks
        pool = list(rule.pool().exclude(pk__in=ids).values_list('id', flat=True))
        ids += random.sample(pool, min(rule.count, len(pool)))
    if lesson.shuffle_questions:
        random.shuffle(ids)
    choice_order = {}
    for question in Question.objects.filter(id__in=ids).prefetch_related('choices'):
        # matching options are always mixed up; choices only when the quiz says so
        if lesson.shuffle_choices or question.kind == Question.MATCHING:
            order = quiz_questions.shuffled_order(question)
            if order:
                choice_order[str(question.id)] = order
    return QuizAttempt.objects.create(enrollment=enrollment, lesson=lesson, status=QuizAttempt.IN_PROGRESS,
                                      question_ids=ids, choice_order=choice_order)


def quiz_ready(lesson):
    return lesson.questions.exists() or any(rule.pool().exists() for rule in lesson.quiz_rules.select_related('bank'))


def _expired(attempt, lesson, grace=0):
    return bool(lesson.time_limit_minutes) and timezone.now() > attempt.created_at + timedelta(minutes=lesson.time_limit_minutes, seconds=grace)


class QuizStartView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        lesson, enrollment = _tracked(request, pk)
        if lesson.kind != Lesson.QUIZ:
            return Response({'detail': 'This lesson is not a quiz.'}, status=status.HTTP_400_BAD_REQUEST)
        if not enrollment:
            return Response({'detail': 'Enrol on this course to take its quizzes.'}, status=status.HTTP_403_FORBIDDEN)
        if not quiz_ready(lesson):
            return Response({'detail': 'This quiz has no questions yet.'}, status=status.HTTP_400_BAD_REQUEST)
        attempt = QuizAttempt.objects.filter(enrollment=enrollment, lesson=lesson, status=QuizAttempt.IN_PROGRESS).first()
        if attempt and _expired(attempt, lesson, grace=30):
            _grade_attempt(attempt, lesson, attempt.answers or {})  # time ran out: it counts with what was answered
            attempt = None
        if not attempt:
            if _attempts_left(lesson, enrollment) == 0:
                return Response({'detail': 'You have used all your attempts at this quiz.', 'code': 'no_attempts'}, status=status.HTTP_400_BAD_REQUEST)
            attempt = _new_attempt(lesson, enrollment)
        return Response(attempt_data(attempt, lesson), status=status.HTTP_201_CREATED)


def _grade_attempt(attempt, lesson, answers):
    asked = _asked(attempt, lesson)
    results, points, total, right_ids = [], 0, 0, []
    for question in asked:
        correct, chosen = grade_question(question, answers.get(str(question.id)))
        total += question.points
        points += question.points if correct else 0
        if correct:
            right_ids.append(question.id)
        row = {'question_id': question.id, 'correct': correct, 'chosen': chosen,
               'chosen_id': chosen if isinstance(chosen, int) else None}
        if lesson.show_answers:
            row.update(quiz_questions.reveal(question))
        results.append(row)
    score = round(100 * points / total) if total else 0
    attempt.status, attempt.finished_at = QuizAttempt.SUBMITTED, timezone.now()
    attempt.points, attempt.max_points, attempt.score_percent = points, total, score
    attempt.passed = score >= lesson.pass_mark
    attempt.answers = {str(k): v for k, v in answers.items()}
    attempt.save()
    # per-question statistics: how often each question is answered, and answered right
    Question.objects.filter(pk__in=[q.id for q in asked]).update(times_answered=F('times_answered') + 1)
    Question.objects.filter(pk__in=right_ids).update(times_correct=F('times_correct') + 1)
    if attempt.passed:
        access.mark_complete(attempt.enrollment, lesson)
    return results


class QuizSubmitView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        lesson, enrollment = _tracked(request, pk)
        if lesson.kind != Lesson.QUIZ:
            return Response({'detail': 'This lesson is not a quiz.'}, status=status.HTTP_400_BAD_REQUEST)
        if not enrollment:
            return Response({'detail': 'Enrol on this course to take its quizzes.'}, status=status.HTTP_403_FORBIDDEN)
        answers = request.data.get('answers')
        if not isinstance(answers, dict):
            return Response({'answers': 'Send the answers as {question id: answer}.'}, status=status.HTTP_400_BAD_REQUEST)
        if not quiz_ready(lesson):
            return Response({'detail': 'This quiz has no questions yet.'}, status=status.HTTP_400_BAD_REQUEST)

        attempt_id = request.data.get('attempt')
        attempt = QuizAttempt.objects.filter(enrollment=enrollment, lesson=lesson, status=QuizAttempt.IN_PROGRESS)
        attempt = attempt.filter(pk=attempt_id).first() if attempt_id else attempt.first()
        if not attempt:
            if lesson.time_limit_minutes or lesson.questions_per_attempt or lesson.quiz_rules.exists():
                return Response({'detail': 'Start the quiz first.', 'code': 'not_started'}, status=status.HTTP_400_BAD_REQUEST)
            if _attempts_left(lesson, enrollment) == 0:
                return Response({'detail': 'You have used all your attempts at this quiz.', 'code': 'no_attempts'}, status=status.HTTP_400_BAD_REQUEST)
            attempt = QuizAttempt.objects.create(enrollment=enrollment, lesson=lesson, status=QuizAttempt.IN_PROGRESS,
                                                 question_ids=list(lesson.questions.values_list('id', flat=True)))
        late = _expired(attempt, lesson, grace=120)
        results = _grade_attempt(attempt, lesson, {} if late else answers)
        record = access.quiz_record(enrollment, lesson)
        notify(request.user, 'quiz_result', f'{lesson.title}: {attempt.score_percent}%',
               'You passed!' if attempt.passed else f'You need {lesson.pass_mark}% to pass.', f'/learn/{lesson.course.slug}/lesson/{lesson.id}')
        return Response({'score_percent': attempt.score_percent, 'points': attempt.points, 'max_points': attempt.max_points,
                         'passed': attempt.passed, 'pass_mark': lesson.pass_mark, 'late': late, 'results': results,
                         'show_answers': lesson.show_answers, 'record': record, **_completion(enrollment)})


# ---------------------------------------------------------------- assignments

class SubmissionsView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get(self, request, pk):
        lesson, enrollment = _tracked(request, pk)
        if not enrollment:
            return Response({'detail': 'Enrol on this course first.'}, status=status.HTTP_403_FORBIDDEN)
        subs = Submission.objects.filter(enrollment=enrollment, lesson=lesson).select_related('lesson').prefetch_related('files')
        return Response([submission_data(s, request.user.id) for s in subs])

    def post(self, request, pk):
        lesson, enrollment = _tracked(request, pk)
        if lesson.kind != Lesson.ASSIGNMENT:
            return Response({'detail': 'This lesson is not an assignment.'}, status=status.HTTP_400_BAD_REQUEST)
        if not enrollment:
            return Response({'detail': 'Enrol on this course to hand in work.'}, status=status.HTTP_403_FORBIDDEN)
        latest = access.latest_submission(enrollment, lesson)
        if latest and latest.status == Submission.APPROVED:
            return Response({'detail': 'Your work was already approved.'}, status=status.HTTP_400_BAD_REQUEST)
        if latest and not lesson.allow_resubmit:
            return Response({'detail': 'This assignment can only be handed in once.'}, status=status.HTTP_400_BAD_REQUEST)
        is_late, penalty, closed = assignments.late_state(lesson, enrollment)
        if closed:
            return Response({'detail': 'The deadline has passed and this assignment no longer accepts work.', 'code': 'closed'},
                            status=status.HTTP_400_BAD_REQUEST)
        text = str(request.data.get('text', '')).strip()[:20000]
        uploads = request.FILES.getlist('files') or request.FILES.getlist('file')
        if not text and not uploads:
            return Response({'detail': 'Write your answer or attach a file.'}, status=status.HTTP_400_BAD_REQUEST)
        if len(uploads) > lesson.max_files:
            return Response({'file': f'Hand in at most {lesson.max_files} {"file" if lesson.max_files == 1 else "files"}.'},
                            status=status.HTTP_400_BAD_REQUEST)
        for upload in uploads:
            if upload.size > MAX_RESOURCE_MB * 1024 * 1024:
                return Response({'file': f'{upload.name}: files can be at most {MAX_RESOURCE_MB} MB.'}, status=status.HTTP_400_BAD_REQUEST)
            if os.path.splitext(upload.name)[1].lower() in BLOCKED_EXTENSIONS:
                return Response({'file': f'{upload.name}: that type of file cannot be handed in.'}, status=status.HTTP_400_BAD_REQUEST)
        with transaction.atomic():
            sub = Submission.objects.create(lesson=lesson, enrollment=enrollment, text=text, is_late=is_late, penalty_percent=penalty)
            for order, upload in enumerate(uploads):
                SubmissionFile.objects.create(submission=sub, file=upload, filename=os.path.basename(upload.name)[:200],
                                              size=upload.size, sort_order=order)
        from .similarity import check
        try:
            check(sub)  # how much it shares with classmates' work (a hint for the grader)
        except Exception:
            logger.exception('Similarity check failed for submission %s', sub.pk)
        course = lesson.course
        message = (f'{request.user.get_full_name() or "A student"} handed in “{lesson.title}”.', f'/instructor/courses/{course.slug}/submissions')
        if course.instructor:
            notify(course.instructor, 'assignment_submitted', f'New submission: {course.title}', *message)
        else:
            notify_admins('assignment_submitted', f'New submission: {course.title}', *message)
        return Response(submission_data(sub, request.user.id), status=status.HTTP_201_CREATED)


# ---------------------------------------------------------------- notes

def note_data(note):
    return {'id': note.id, 'lesson': {'id': note.lesson_id, 'title': note.lesson.title}, 'position_seconds': note.position_seconds,
            'body': note.body, 'created_at': note.created_at, 'updated_at': note.updated_at}


class LessonNotesView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        lesson = get_object_or_404(Lesson, pk=pk)
        return Response([note_data(n) for n in Note.objects.filter(student=request.user, lesson=lesson).select_related('lesson')])

    def post(self, request, pk):
        lesson = get_object_or_404(Lesson.objects.select_related('section__course'), pk=pk)
        if not access.can_open(request.user, lesson, access.enrollment_for(request.user, lesson.course)):
            return Response({'detail': 'Enrol on this course to take notes.'}, status=status.HTTP_403_FORBIDDEN)
        body = str(request.data.get('body', '')).strip()
        if not body:
            return Response({'body': 'Write your note.'}, status=status.HTTP_400_BAD_REQUEST)
        position = request.data.get('position')
        try:
            position = _int(position, 0, 60 * 60 * 24) if position not in (None, '') else None
        except (TypeError, ValueError):
            position = None
        note = Note.objects.create(student=request.user, lesson=lesson, body=body[:5000], position_seconds=position)
        return Response(note_data(note), status=status.HTTP_201_CREATED)


class CourseNotesView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, slug):
        notes = Note.objects.filter(student=request.user, lesson__section__course__slug=slug).select_related('lesson', 'lesson__section')
        query = request.query_params.get('q', '').strip()
        if query:
            notes = notes.filter(body__icontains=query)
        notes = notes.order_by('lesson__section__sort_order', 'lesson__sort_order', 'position_seconds', 'created_at')
        return Response([note_data(n) for n in notes[:500]])


class NoteDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        note = get_object_or_404(Note, pk=pk, student=request.user)
        body = str(request.data.get('body', note.body)).strip()
        if not body:
            return Response({'body': 'Write your note.'}, status=status.HTTP_400_BAD_REQUEST)
        note.body = body[:5000]
        note.save(update_fields=['body', 'updated_at'])
        return Response(note_data(note))

    def delete(self, request, pk):
        get_object_or_404(Note, pk=pk, student=request.user).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------- certificates and "my learning"

class CertificateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, slug):
        course = get_object_or_404(Course, slug=slug)
        enrollment = access.enrollment_for(request.user, course)
        certificate = None
        if enrollment:
            certificate, _ = access.finish_if_done(enrollment)
        if not certificate or certificate.revoked_at:
            return Response({'detail': 'Complete the course to receive your certificate.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(certificate_data(certificate))


class VerifyCertificateView(APIView):
    """Public: confirms that a certificate code is real (and says so if it was revoked)."""
    permission_classes = [AllowAny]

    def get(self, request, code):
        certificate = get_object_or_404(Certificate.objects.select_related('enrollment__student', 'enrollment__course'), code=code.strip().upper())
        return Response(certificate_data(certificate))


class MyCertificatesView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        rows = Certificate.objects.filter(enrollment__student=request.user, revoked_at__isnull=True).select_related('enrollment__course', 'enrollment__student')
        return Response([certificate_data(c) for c in rows])


def learning_rows(user):
    """Every course the student is on, with progress, last lesson and time spent (newest activity first)."""
    enrollments = (TrainingEnrollment.objects.filter(student=user, status__in=[TrainingEnrollment.ACTIVE, TrainingEnrollment.COMPLETED])
                   .select_related('course__instructor', 'course__category'))
    rows = []
    for enrollment in enrollments:
        course = enrollment.course
        lessons = access.published_lessons(course)
        progress = access.summary(enrollment, lessons)
        titles = {l.id: l.title for l in lessons}
        activity = Progress.objects.filter(enrollment=enrollment).aggregate(spent=Sum('time_spent_seconds'), last=Max('last_viewed_at'))
        certificate = Certificate.objects.filter(enrollment=enrollment, revoked_at__isnull=True).first()
        rows.append({
            'course': {'id': course.id, 'slug': course.slug, 'title': course.title, 'icon': course.icon, 'thumbnail': course.thumbnail,
                       'instructor': instructor_info(course)['name'], 'category': course.category.name if course.category else None},
            'status': enrollment.status,
            'has_content': bool(lessons),
            'progress': progress,
            'last_lesson': {'id': progress['last_lesson_id'], 'title': titles.get(progress['last_lesson_id'])} if progress['last_lesson_id'] else None,
            'resume_title': titles.get(progress['resume_id']),
            'last_accessed_at': activity['last'],
            'enrolled_at': enrollment.created_at,
            'time_spent_seconds': activity['spent'] or 0,
            'certificate_code': certificate.code if certificate else None,
        })
    rows.sort(key=lambda r: (r['last_accessed_at'] or r['enrolled_at']), reverse=True)
    return rows


class MyLearningView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response([r for r in learning_rows(request.user) if r['has_content']])


class MediaView(APIView):
    """A private file, sent to anyone holding a valid signed link for it who is still allowed to see it."""
    permission_classes = [AllowAny]
    authentication_classes = []  # the signed link is the credential: a <video> tag can't send a token header

    def get(self, request, kind, pk):
        submission = None
        if kind == 'video':
            lesson = get_object_or_404(Lesson.objects.select_related('section__course'), pk=pk)
            field, name, inline = lesson.video_file, lesson.video_name or 'video.mp4', True
        elif kind == 'document':
            lesson = get_object_or_404(Lesson.objects.select_related('section__course'), pk=pk)
            field, name = lesson.document_file, lesson.document_name or 'document'
            inline = name.lower().endswith('.pdf')
        elif kind == 'resource':
            resource = get_object_or_404(Resource.objects.select_related('lesson__section__course'), pk=pk)
            lesson, field, name, inline = resource.lesson, resource.file, resource.filename or 'file', False
        elif kind == 'caption':
            caption = get_object_or_404(LessonCaption.objects.select_related('lesson__section__course'), pk=pk)
            lesson, field, name, inline = caption.lesson, caption.file, f'{caption.language}.vtt', True
        elif kind == 'submission':
            submission = get_object_or_404(Submission.objects.select_related('lesson__section__course', 'enrollment'), pk=pk)
            lesson, field, name, inline = submission.lesson, submission.file, submission.filename or 'file', False
        elif kind == 'submission-file':
            handed = get_object_or_404(SubmissionFile.objects.select_related('submission__lesson__section__course', 'submission__enrollment'), pk=pk)
            submission = handed.submission
            lesson, field, name, inline = submission.lesson, handed.file, handed.filename or 'file', False
        else:
            raise Http404
        user_id = read_token(request.query_params.get('t', ''), kind, pk)
        if user_id is None or not field:
            raise Http404

        # The link proves who asked; they must still be allowed to see it today (an enrolment may have been cancelled)
        user = User.objects.filter(pk=user_id, is_active=True).first() if user_id else None
        if submission is not None:
            from .peer import can_see_submission
            allowed = user is not None and (submission.enrollment.student_id == user.id or access.can_manage(user, lesson.course)
                                            or can_see_submission(user, submission))
        else:
            enrollment = access.enrollment_for(user, lesson.course) if user else None
            allowed = access.can_open(user, lesson, enrollment)
        if not allowed:
            raise Http404
        try:
            path = field.path
        except (ValueError, NotImplementedError):
            raise Http404
        if request.query_params.get('download') == '1':
            if kind == 'video' and not (lesson.course.allow_video_downloads or access.can_manage(user, lesson.course)):
                raise Http404  # watching is fine; saving the video file is up to the course
            inline = False
        return file_response(request, path, name, inline)


# ---------------------------------------------------------------- reviews

class ReviewsView(APIView):
    """
    GET  /lms/courses/<slug>/reviews/   the rating summary and the reviews (public)
    POST /lms/courses/<slug>/reviews/   {rating: 1-5, comment}  (enrolled students; saving again edits your review)
    DELETE the same address             removes your review
    """
    permission_classes = [AllowAny]

    def get_permissions(self):
        return [AllowAny()] if self.request.method == 'GET' else [IsAuthenticated()]

    def _payload(self, request, course):
        reviews = Review.objects.filter(course=course, is_hidden=False).select_related('student')
        counts = dict(reviews.values_list('rating').annotate(n=Count('id')))
        total = sum(counts.values())
        mine = Review.objects.filter(course=course, student=request.user).first() if request.user.is_authenticated else None
        rating = request.query_params.get('rating')
        shown = reviews.filter(rating=int(rating)) if rating and rating.isdigit() else reviews

        def one(review):
            return {'id': review.id, 'name': public_name(review.student), 'rating': review.rating, 'comment': review.comment,
                    'created_at': review.created_at, 'updated_at': review.updated_at, 'mine': bool(mine and review.id == mine.id),
                    'hidden': review.is_hidden}
        return {
            'summary': {'average': round(sum(k * v for k, v in counts.items()) / total, 1) if total else 0, 'count': total,
                        'distribution': {str(star): counts.get(star, 0) for star in (5, 4, 3, 2, 1)}},
            'reviews': [one(r) for r in shown[:50]],
            'can_review': bool(request.user.is_authenticated and access.enrollment_for(request.user, course)),
            'my_review': one(mine) if mine else None,
        }

    def get(self, request, slug):
        return Response(self._payload(request, _course_or_404(request.user, slug)))

    def post(self, request, slug):
        course = _course_or_404(request.user, slug)
        if not access.enrollment_for(request.user, course):
            return Response({'detail': 'Enrol on this course to review it.'}, status=status.HTTP_403_FORBIDDEN)
        try:
            rating = int(request.data.get('rating'))
        except (TypeError, ValueError):
            rating = 0
        if not 1 <= rating <= 5:
            return Response({'rating': 'Choose 1 to 5 stars.'}, status=status.HTTP_400_BAD_REQUEST)
        comment = str(request.data.get('comment', '')).strip()[:1500]
        with transaction.atomic():
            review, created = Review.objects.update_or_create(course=course, student=request.user, defaults={'rating': rating, 'comment': comment})
        if created and course.instructor:
            notify(course.instructor, 'review', f'New {rating}-star review: {course.title}', comment[:200], f'/courses/{course.slug}#reviews')
        return Response(self._payload(request, course), status=status.HTTP_201_CREATED)

    def delete(self, request, slug):
        course = _course_or_404(request.user, slug)
        Review.objects.filter(course=course, student=request.user).delete()
        return Response(self._payload(request, course))
