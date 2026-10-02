"""
Peer review of assignments: after handing in, each student reviews Lesson.peer_reviews classmates' work.

Names are hidden both ways. The work with the fewest reviews is handed out first, so everyone gets feedback.
Reviews use the assignment's rubric when it has one, plus a comment. They are feedback: the instructor still grades.

  GET  /lms/lessons/<id>/peer-review/     how many to do, the one to review now (claimed for you), reviews you received
  POST /lms/peer-reviews/<id>/            {scores, comment}  complete your review
"""
from django.db.models import Count
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from . import access
from .assignments import clean_scores
from .models import Lesson, PeerReview, Submission
from .notify import notify

MIN_COMMENT = 15


def _latest_per_student(lesson):
    """The newest submission of each student on the lesson."""
    latest = {}
    for sub in Submission.objects.filter(lesson=lesson).order_by('-created_at', '-id'):
        latest.setdefault(sub.enrollment_id, sub)
    return list(latest.values())


def claim(user, lesson, enrollment):
    """The review the student should do now (an unfinished one, or a newly claimed one), or None."""
    mine = PeerReview.objects.filter(reviewer=user, submission__lesson=lesson)
    pending = mine.filter(status=PeerReview.PENDING).select_related('submission').first()
    if pending:
        return pending
    if mine.filter(status=PeerReview.DONE).count() >= lesson.peer_reviews:
        return None
    reviewed = set(mine.values_list('submission__enrollment_id', flat=True))
    candidates = [s for s in _latest_per_student(lesson) if s.enrollment_id != enrollment.id and s.enrollment_id not in reviewed]
    if not candidates:
        return None
    counts = dict(PeerReview.objects.filter(submission__in=candidates).values_list('submission').annotate(n=Count('id')))
    pick = min(candidates, key=lambda s: (counts.get(s.id, 0), s.created_at))
    return PeerReview.objects.create(submission=pick, reviewer=user)


def received(enrollment, lesson):
    """The finished reviews of the student's latest work, as "Classmate 1, 2…"."""
    latest = Submission.objects.filter(enrollment=enrollment, lesson=lesson).order_by('-created_at', '-id').first()
    if not latest:
        return []
    done = PeerReview.objects.filter(submission=latest, status=PeerReview.DONE).order_by('done_at')
    return [{'label': f'Classmate {i}', 'scores': r.scores, 'comment': r.comment, 'date': r.done_at} for i, r in enumerate(done, start=1)]


def review_data(review, user_id):
    from .views import submission_data
    sub = submission_data(review.submission, user_id)
    return {'id': review.id, 'status': review.status, 'text': sub['text'], 'files': sub['files'], 'handed_in': sub['created_at']}


class PeerReviewView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        lesson = get_object_or_404(Lesson.objects.select_related('section__course'), pk=pk)
        if lesson.kind != Lesson.ASSIGNMENT or not lesson.peer_reviews:
            return Response({'required': 0})
        enrollment = access.enrollment_for(request.user, lesson.section.course)
        if not enrollment:
            return Response({'detail': 'Enrol on this course first.'}, status=status.HTTP_403_FORBIDDEN)
        handed_in = Submission.objects.filter(enrollment=enrollment, lesson=lesson).exists()
        current = claim(request.user, lesson, enrollment) if handed_in else None
        done = PeerReview.objects.filter(reviewer=request.user, submission__lesson=lesson, status=PeerReview.DONE).count()
        return Response({'required': lesson.peer_reviews, 'done': done, 'handed_in': handed_in, 'rubric': lesson.rubric or [],
                         'current': review_data(current, request.user.id) if current else None,
                         'waiting_for_work': handed_in and current is None and done < lesson.peer_reviews,
                         'received': received(enrollment, lesson)})


class CompleteReviewView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        review = get_object_or_404(PeerReview.objects.select_related('submission__lesson__section__course', 'submission__enrollment__student'),
                                   pk=pk, reviewer=request.user)
        if review.status == PeerReview.DONE:
            return Response({'detail': 'You already sent this review.'}, status=status.HTTP_400_BAD_REQUEST)
        lesson = review.submission.lesson
        comment = str(request.data.get('comment', '')).strip()[:3000]
        if len(comment) < MIN_COMMENT:
            return Response({'comment': 'Write a helpful comment: what works well, and one thing to improve.'}, status=status.HTTP_400_BAD_REQUEST)
        scores = []
        if lesson.rubric:
            try:
                scores = clean_scores(lesson, request.data.get('scores'))
            except ValueError as exc:
                return Response({'scores': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        review.scores, review.comment, review.status, review.done_at = scores, comment, PeerReview.DONE, timezone.now()
        review.save()
        notify(review.submission.enrollment.student, 'assignment_graded', f'A classmate reviewed your work: {lesson.title}',
               comment[:200], f'/learn/{lesson.section.course.slug}/lesson/{lesson.id}')
        return Response({'done': True})


def peer_reviews_for(submission):
    """For the instructor grading: every finished review of this work (with the reviewer's name)."""
    return [{'reviewer': r.reviewer.get_full_name() or r.reviewer.email, 'scores': r.scores, 'comment': r.comment, 'date': r.done_at}
            for r in submission.peer_reviews.filter(status=PeerReview.DONE).select_related('reviewer')]


def can_see_submission(user, submission):
    """Classmates assigned to review it may open its files."""
    return PeerReview.objects.filter(submission=submission, reviewer=user).exists()

