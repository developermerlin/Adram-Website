"""
Community features of a course.

Wishlist (signed-in students):
  GET  /lms/me/wishlist/                      the saved courses
  POST/DELETE /lms/courses/<slug>/wishlist/   save / remove a course
Announcements (enrolled students and the course's instructor/administrators read; the instructor and administrators write):
  GET  /lms/courses/<slug>/announcements/
  POST /lms/manage/courses/<slug>/announcements/   {title, body, notify}   DELETE /lms/manage/announcements/<id>/
Q&A (enrolled students, the course's instructor and administrators):
  GET/POST /lms/courses/<slug>/qa/            list (?q=&lesson=&filter=mine|unanswered|moments&sort=recent|votes)
                                              / ask {title, body, lesson, position (seconds into the lesson video)}
  GET/DELETE /lms/qa/<id>/                    a question with its answers / remove it (author or course staff)
  POST/DELETE /lms/qa/<id>/vote/              "I have this question too" (an upvote; not on your own question)
  POST /lms/qa/<id>/pin/                      {pinned: true|false} course staff pin a question to the top
  POST /lms/qa/<id>/replies/  DELETE /lms/qa/replies/<id>/
  POST/DELETE /lms/qa/replies/<id>/like/      mark an answer useful
  POST /lms/qa/replies/<id>/mark/             {answer: true|false} the instructor marks the answer
  POST /lms/qa/replies/<id>/accept/           {accepted: true|false} the student who asked accepts the answer that solved it
Pinned questions always come first.
"""
from django.db import transaction
from django.db.models import Count, Exists, OuterRef, Q
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from catalog.models import Course
from portal.models import TrainingEnrollment

from . import access, emails
from .briefs import course_brief, public_name
from .models import Announcement, Lesson, Reply, ReplyLike, Thread, ThreadVote, Wishlist
from .notify import notify, notify_admins
from .stats import stats_for


def _course(slug, user=None):
    course = get_object_or_404(Course, slug=slug)
    if not course.is_published and not (user and user.is_authenticated and access.can_manage(user, course)):
        from django.http import Http404
        raise Http404
    return course


def _member(request, course):
    """None when the person may take part in the course (enrolled, or its staff); otherwise the refusal to send."""
    if access.can_manage(request.user, course) or access.enrollment_for(request.user, course):
        return None
    return Response({'detail': 'Enrol on this course to see this.', 'code': 'enrollment_required'}, status=status.HTTP_403_FORBIDDEN)


def _staff_name(course, user):
    if course.instructor_id == user.id:
        return f'{user.get_full_name()} (Instructor)'
    return 'ADRAM team'


# ---------------------------------------------------------------- wishlist

class WishlistView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        courses = list(Course.objects.filter(is_published=True, wishlisted__student=request.user)
                       .select_related('instructor', 'category', 'subcategory').order_by('-wishlisted__created_at'))
        stats = stats_for(courses)
        return Response({'slugs': [c.slug for c in courses], 'courses': [course_brief(c, stats[c.id]) for c in courses]})


class CourseWishlistView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, slug):
        course = get_object_or_404(Course, slug=slug, is_published=True)
        Wishlist.objects.get_or_create(student=request.user, course=course)
        return Response({'saved': True}, status=status.HTTP_201_CREATED)

    def delete(self, request, slug):
        Wishlist.objects.filter(student=request.user, course__slug=slug).delete()
        return Response({'saved': False})


# ---------------------------------------------------------------- announcements

def announcement_data(a):
    author = _staff_name(a.course, a.author) if a.author else 'ADRAM team'
    return {'id': a.id, 'title': a.title, 'body': a.body, 'created_at': a.created_at, 'author': author,
            'course': {'slug': a.course.slug, 'title': a.course.title}}


class AnnouncementsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, slug):
        course = _course(slug, request.user)
        refused = _member(request, course)
        if refused:
            return refused
        return Response([announcement_data(a) for a in course.announcements.select_related('author', 'course')[:50]])


class ManageAnnouncementsView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, slug):
        course = get_object_or_404(Course, slug=slug)
        if not access.can_manage(request.user, course):
            return Response({'detail': 'Only the course instructor and administrators can post announcements.'}, status=status.HTTP_403_FORBIDDEN)
        title = str(request.data.get('title', '')).strip()
        body = str(request.data.get('body', '')).strip()
        if not title or not body:
            return Response({'title': 'Give the announcement a title and a message.' if not title else '', 'body': 'Write the message.' if not body else ''},
                            status=status.HTTP_400_BAD_REQUEST)
        announcement = Announcement.objects.create(course=course, author=request.user, title=title[:200], body=body[:5000])
        students = [e.student for e in TrainingEnrollment.objects.filter(
            course=course, status__in=[TrainingEnrollment.ACTIVE, TrainingEnrollment.COMPLETED]).select_related('student')]
        notify(students, 'announcement', f'{course.title}: {announcement.title}', announcement.body[:300], f'/courses/{course.slug}#announcements')
        if request.data.get('notify'):
            transaction.on_commit(lambda: [emails.send_announcement(announcement, s) for s in students])
        return Response(announcement_data(announcement), status=status.HTTP_201_CREATED)


class AnnouncementDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, pk):
        announcement = get_object_or_404(Announcement.objects.select_related('course'), pk=pk)
        if not access.can_manage(request.user, announcement.course):
            return Response({'detail': 'You cannot delete this announcement.'}, status=status.HTTP_403_FORBIDDEN)
        announcement.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------- Q&A

def thread_row(thread, user):
    def value(name, compute):
        return getattr(thread, name) if hasattr(thread, name) else compute()
    return {
        'id': thread.id, 'title': thread.title, 'body': thread.body,
        'author': public_name(thread.author), 'mine': thread.author_id == user.id,
        'course': {'slug': thread.course.slug, 'title': thread.course.title},
        'lesson': {'id': thread.lesson_id, 'title': thread.lesson.title} if thread.lesson_id else None,
        'position_seconds': thread.position_seconds, 'is_pinned': thread.is_pinned,
        'reply_count': value('reply_count', thread.replies.count),
        'answered': value('answered', lambda: thread.replies.filter(Q(is_staff=True) | Q(is_instructor_answer=True) | Q(is_accepted=True)).exists()),
        'accepted': value('accepted', lambda: thread.replies.filter(is_accepted=True).exists()),
        'votes': value('vote_count', thread.votes.count),
        'voted': value('voted', lambda: thread.votes.filter(user=user).exists()),
        'created_at': thread.created_at, 'updated_at': thread.updated_at,
    }


def reply_row(reply, user, course):
    liked = ReplyLike.objects.filter(reply=reply, user=user).exists()
    return {'id': reply.id, 'author': _staff_name(course, reply.author) if reply.is_staff else public_name(reply.author),
            'is_staff': reply.is_staff, 'is_instructor_answer': reply.is_instructor_answer, 'is_accepted': reply.is_accepted,
            'likes': reply.likes.count(), 'liked': liked,
            'mine': reply.author_id == user.id, 'body': reply.body, 'created_at': reply.created_at}


def annotated_threads(user):
    staff_reply = Reply.objects.filter(thread=OuterRef('pk')).filter(Q(is_staff=True) | Q(is_instructor_answer=True) | Q(is_accepted=True))
    return Thread.objects.select_related('author', 'lesson', 'course').annotate(
        reply_count=Count('replies', distinct=True), vote_count=Count('votes', distinct=True), answered=Exists(staff_reply),
        accepted=Exists(Reply.objects.filter(thread=OuterRef('pk'), is_accepted=True)),
        voted=Exists(ThreadVote.objects.filter(thread=OuterRef('pk'), user=user)))


class QuestionsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, slug):
        course = _course(slug, request.user)
        refused = _member(request, course)
        if refused:
            return refused
        threads = annotated_threads(request.user).filter(course=course)
        unanswered = threads.filter(answered=False).count()
        lesson = request.query_params.get('lesson')
        if lesson and lesson.isdigit():
            threads = threads.filter(lesson_id=int(lesson))
        query = request.query_params.get('q', '').strip()
        if query:
            threads = threads.filter(Q(title__icontains=query) | Q(body__icontains=query) | Q(replies__body__icontains=query)).distinct()
        wanted = request.query_params.get('filter')
        if wanted == 'mine':
            threads = threads.filter(author=request.user)
        elif wanted == 'unanswered':
            threads = threads.filter(answered=False)
        elif wanted == 'moments':  # questions asked at a moment of a lesson video, in video order
            threads = threads.filter(position_seconds__isnull=False).order_by('position_seconds', 'id')
        if wanted != 'moments':
            threads = threads.order_by('-is_pinned', '-vote_count', '-updated_at', '-id') if request.query_params.get('sort') == 'votes' \
                else threads.order_by('-is_pinned', '-updated_at', '-id')
        return Response({'unanswered': unanswered, 'threads': [thread_row(t, request.user) for t in threads[:100]]})

    def post(self, request, slug):
        course = _course(slug, request.user)
        refused = _member(request, course)
        if refused:
            return refused
        title = str(request.data.get('title', '')).strip()
        if not title:
            return Response({'title': 'Write your question.'}, status=status.HTTP_400_BAD_REQUEST)
        lesson = None
        if request.data.get('lesson'):
            lesson = Lesson.objects.filter(pk=request.data['lesson'], section__course=course).first()
            if not lesson:
                return Response({'lesson': 'That lesson is not in this course.'}, status=status.HTTP_400_BAD_REQUEST)
        position = None
        if lesson and request.data.get('position') not in (None, ''):
            try:
                position = max(0, int(float(request.data['position'])))
            except (TypeError, ValueError):
                return Response({'position': 'The moment must be a number of seconds.'}, status=status.HTTP_400_BAD_REQUEST)
        thread = Thread.objects.create(course=course, lesson=lesson, author=request.user, title=title[:200],
                                       body=str(request.data.get('body', '')).strip()[:2000], position_seconds=position)
        if not access.can_manage(request.user, course):
            link = f'/instructor/courses/{course.slug}/qa' if course.instructor_id else f'/admin/courses/{course.slug}/content?tab=qa'
            if course.instructor:
                notify(course.instructor, 'question', f'New question: {course.title}', thread.title, link)
            else:
                notify_admins('question', f'New question: {course.title}', thread.title, link)
                transaction.on_commit(lambda: emails.notify_team_question(thread))
        return Response(thread_row(thread, request.user), status=status.HTTP_201_CREATED)


def _thread_for(request, pk):
    thread = get_object_or_404(Thread.objects.select_related('course', 'author', 'lesson'), pk=pk)
    return thread, _member(request, thread.course)


class ThreadView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        thread, refused = _thread_for(request, pk)
        if refused:
            return refused
        replies = thread.replies.select_related('author')
        return Response({**thread_row(thread, request.user), 'can_moderate': access.can_manage(request.user, thread.course),
                         'replies': [reply_row(r, request.user, thread.course) for r in replies]})

    def delete(self, request, pk):
        thread, refused = _thread_for(request, pk)
        if refused:
            return refused
        if thread.author_id != request.user.id and not access.can_manage(request.user, thread.course):
            return Response({'detail': 'You can only delete your own questions.'}, status=status.HTTP_403_FORBIDDEN)
        thread.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ThreadVoteView(APIView):
    """"I have this question too": an upvote, so common questions rise."""
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        thread, refused = _thread_for(request, pk)
        if refused:
            return refused
        if thread.author_id == request.user.id:
            return Response({'detail': 'You can’t vote for your own question.'}, status=status.HTTP_400_BAD_REQUEST)
        ThreadVote.objects.get_or_create(thread=thread, user=request.user)
        return Response(thread_row(thread, request.user))

    def delete(self, request, pk):
        thread, refused = _thread_for(request, pk)
        if refused:
            return refused
        ThreadVote.objects.filter(thread=thread, user=request.user).delete()
        return Response(thread_row(thread, request.user))


class ThreadPinView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        thread, refused = _thread_for(request, pk)
        if refused:
            return refused
        if not access.can_manage(request.user, thread.course):
            return Response({'detail': 'Only the instructor can pin questions.'}, status=status.HTTP_403_FORBIDDEN)
        thread.is_pinned = bool(request.data.get('pinned', True))
        Thread.objects.filter(pk=thread.pk).update(is_pinned=thread.is_pinned)  # pinning doesn't bump the question
        return Response(thread_row(thread, request.user))


class RepliesView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        thread, refused = _thread_for(request, pk)
        if refused:
            return refused
        body = str(request.data.get('body', '')).strip()
        if not body:
            return Response({'body': 'Write your answer.'}, status=status.HTTP_400_BAD_REQUEST)
        staff = access.can_manage(request.user, thread.course)
        reply = Reply.objects.create(thread=thread, author=request.user, body=body[:2000], is_staff=staff)
        thread.save(update_fields=['updated_at'])  # bumps the question to the top of the list
        if thread.author_id != request.user.id:
            link = f'/learn/{thread.course.slug}/lesson/{thread.lesson_id}?qa={thread.id}' if thread.lesson_id else f'/courses/{thread.course.slug}'
            notify(thread.author, 'answer', 'New answer to your question' if not staff else 'Your instructor answered your question', thread.title, link)
            if staff:
                transaction.on_commit(lambda: emails.send_answer(reply))
        return Response(reply_row(reply, request.user, thread.course), status=status.HTTP_201_CREATED)


def _reply_for(request, pk):
    reply = get_object_or_404(Reply.objects.select_related('thread__course', 'author'), pk=pk)
    return reply, _member(request, reply.thread.course)


class ReplyDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, pk):
        reply, refused = _reply_for(request, pk)
        if refused:
            return refused
        if reply.author_id != request.user.id and not access.can_manage(request.user, reply.thread.course):
            return Response({'detail': 'You can only delete your own answers.'}, status=status.HTTP_403_FORBIDDEN)
        reply.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ReplyLikeView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        reply, refused = _reply_for(request, pk)
        if refused:
            return refused
        ReplyLike.objects.get_or_create(reply=reply, user=request.user)
        return Response(reply_row(reply, request.user, reply.thread.course))

    def delete(self, request, pk):
        reply, refused = _reply_for(request, pk)
        if refused:
            return refused
        ReplyLike.objects.filter(reply=reply, user=request.user).delete()
        return Response(reply_row(reply, request.user, reply.thread.course))


class ReplyMarkView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        reply = get_object_or_404(Reply.objects.select_related('thread__course', 'author'), pk=pk)
        if not access.can_manage(request.user, reply.thread.course):
            return Response({'detail': 'Only the instructor can mark the answer.'}, status=status.HTTP_403_FORBIDDEN)
        reply.is_instructor_answer = bool(request.data.get('answer', True))
        reply.save(update_fields=['is_instructor_answer'])
        return Response(reply_row(reply, request.user, reply.thread.course))


class ReplyAcceptView(APIView):
    """The student who asked marks the answer that solved it (one per question). Course staff can too."""
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        reply, refused = _reply_for(request, pk)
        if refused:
            return refused
        thread = reply.thread
        if thread.author_id != request.user.id and not access.can_manage(request.user, thread.course):
            return Response({'detail': 'Only the person who asked can accept an answer.'}, status=status.HTTP_403_FORBIDDEN)
        accepted = bool(request.data.get('accepted', True))
        with transaction.atomic():
            if accepted:
                thread.replies.exclude(pk=reply.pk).filter(is_accepted=True).update(is_accepted=False)
            reply.is_accepted = accepted
            reply.save(update_fields=['is_accepted'])
        if accepted and reply.author_id != request.user.id:
            link = f'/learn/{thread.course.slug}/lesson/{thread.lesson_id}?qa={thread.id}' if thread.lesson_id else f'/courses/{thread.course.slug}'
            notify(reply.author, 'answer', 'Your answer was accepted', thread.title, link)
        return Response(reply_row(reply, request.user, thread.course))
