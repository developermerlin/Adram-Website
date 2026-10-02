"""
Study groups: students on the same course learning together.

A group belongs to a course; only students on that course (or its staff) can join. Open groups are listed on the course;
private ones are joined with their invite code. Members see a board of posts and each other's progress through the course
(joining a group means sharing your progress with its members).

  GET  /lms/courses/<slug>/groups/            open groups on the course, and mine
  POST /lms/courses/<slug>/groups/            {name, description, is_private, max_members}  create (you own it)
  GET  /lms/me/groups/                        my groups, on every course
  GET  /lms/groups/<id>/                      the group: members with progress, posts (members only)
  PATCH/DELETE /lms/groups/<id>/              owner: edit (regenerate_code: true) / delete
  POST /lms/groups/<id>/join/                 {code} (private groups)   POST /lms/groups/join/ {code} by code alone
  POST /lms/groups/<id>/leave/                leave (an owner leaving hands the group to the longest member)
  POST /lms/groups/<id>/posts/                {body}   DELETE /lms/group-posts/<id>/   POST /lms/group-posts/<id>/pin/
  DELETE /lms/groups/<id>/members/<user id>/  owner: remove someone
"""
from django.db import transaction
from django.db.models import Count
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from catalog.models import Course

from . import access
from .briefs import photo_url, public_name
from .models import GroupMember, GroupPost, StudyGroup, new_group_code
from .notify import notify


def _on_course(user, course):
    return access.enrollment_for(user, course) is not None or access.can_manage(user, course)


def group_row(group, user, member=None):
    count = getattr(group, 'member_count', None)
    count = group.members.count() if count is None else count
    return {'id': group.id, 'name': group.name, 'description': group.description, 'is_private': group.is_private,
            'members': count, 'max_members': group.max_members, 'full': count >= group.max_members,
            'course': {'slug': group.course.slug, 'title': group.course.title},
            'is_member': member is not None, 'is_owner': bool(member and member.role == GroupMember.OWNER),
            'created_at': group.created_at}


def _membership(group, user):
    return GroupMember.objects.filter(group=group, user=user).first()


class CourseGroupsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, slug):
        course = get_object_or_404(Course, slug=slug)
        mine = {m.group_id: m for m in GroupMember.objects.filter(user=request.user, group__course=course)}
        groups = (StudyGroup.objects.filter(course=course).select_related('course').annotate(member_count=Count('members'))
                  .order_by('-member_count'))
        rows = [group_row(g, request.user, mine.get(g.id)) for g in groups if not g.is_private or g.id in mine]
        return Response({'can_join': _on_course(request.user, course), 'groups': rows})

    def post(self, request, slug):
        course = get_object_or_404(Course, slug=slug)
        if not _on_course(request.user, course):
            return Response({'detail': 'Enrol on this course to start a study group.'}, status=status.HTTP_403_FORBIDDEN)
        name = str(request.data.get('name', '')).strip()[:80]
        if not name:
            return Response({'name': 'Name your group.'}, status=status.HTTP_400_BAD_REQUEST)
        if GroupMember.objects.filter(user=request.user, role=GroupMember.OWNER, group__course=course).count() >= 3:
            return Response({'detail': 'You already run 3 groups on this course.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            size = max(2, min(int(request.data.get('max_members') or 30), 100))
        except (TypeError, ValueError):
            size = 30
        with transaction.atomic():
            group = StudyGroup.objects.create(course=course, name=name, description=str(request.data.get('description', '')).strip()[:300],
                                              is_private=bool(request.data.get('is_private')), max_members=size, created_by=request.user)
            member = GroupMember.objects.create(group=group, user=request.user, role=GroupMember.OWNER)
        request.user.join_track('training')
        return Response({**group_row(group, request.user, member), 'invite_code': group.invite_code}, status=status.HTTP_201_CREATED)


class MyGroupsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        members = GroupMember.objects.filter(user=request.user).select_related('group__course')
        return Response([group_row(m.group, request.user, m) for m in members])


def _progress(user, course):
    enrollment = access.enrollment_for(user, course)
    if not enrollment:
        return None
    lessons = access.published_lessons(course)
    return access.summary(enrollment, lessons)['percent'] if lessons else 0


class GroupView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        group = get_object_or_404(StudyGroup.objects.select_related('course'), pk=pk)
        member = _membership(group, request.user)
        if not member:
            if group.is_private:
                return Response({'detail': 'This group is private.'}, status=status.HTTP_404_NOT_FOUND)
            return Response({**group_row(group, request.user), 'members_list': [], 'posts': []})
        members = list(group.members.select_related('user'))
        board = sorted(({'id': m.user_id, 'name': public_name(m.user), 'photo': photo_url(m.user), 'role': m.role,
                         'you': m.user_id == request.user.id, 'progress': _progress(m.user, group.course), 'joined_at': m.joined_at}
                        for m in members), key=lambda r: -(r['progress'] or 0))
        posts = group.posts.select_related('author')[:100]
        return Response({**group_row(group, request.user, member), 'members_list': board,
                         'invite_code': group.invite_code if member.role == GroupMember.OWNER or not group.is_private else None,
                         'posts': [{'id': p.id, 'author': public_name(p.author), 'photo': photo_url(p.author), 'mine': p.author_id == request.user.id,
                                    'body': p.body, 'is_pinned': p.is_pinned, 'created_at': p.created_at} for p in posts]})

    def patch(self, request, pk):
        group = get_object_or_404(StudyGroup, pk=pk)
        member = _membership(group, request.user)
        if not member or member.role != GroupMember.OWNER:
            return Response({'detail': 'Only the group’s owner can change it.'}, status=status.HTTP_403_FORBIDDEN)
        if 'name' in request.data and str(request.data['name']).strip():
            group.name = str(request.data['name']).strip()[:80]
        if 'description' in request.data:
            group.description = str(request.data['description']).strip()[:300]
        if 'is_private' in request.data:
            group.is_private = bool(request.data['is_private'])
        if request.data.get('regenerate_code'):
            group.invite_code = new_group_code()  # old invitations stop working
        group.save()
        return self.get(request, pk)

    def delete(self, request, pk):
        group = get_object_or_404(StudyGroup, pk=pk)
        member = _membership(group, request.user)
        if not (member and member.role == GroupMember.OWNER) and not access.can_manage(request.user, group.course):
            return Response({'detail': 'Only the group’s owner can delete it.'}, status=status.HTTP_403_FORBIDDEN)
        group.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


def _join(request, group):
    if not _on_course(request.user, group.course):
        return Response({'detail': 'Enrol on this course to join its study groups.'}, status=status.HTTP_403_FORBIDDEN)
    if _membership(group, request.user):
        return GroupView().get(request, group.pk)
    if group.members.count() >= group.max_members:
        return Response({'detail': 'This group is full.'}, status=status.HTTP_400_BAD_REQUEST)
    GroupMember.objects.create(group=group, user=request.user)
    owner = group.members.filter(role=GroupMember.OWNER).select_related('user').first()
    if owner:
        notify(owner.user, 'system', f'{public_name(request.user)} joined {group.name}', '', f'/student/groups/{group.id}')
    return GroupView().get(request, group.pk)


class JoinView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        group = get_object_or_404(StudyGroup.objects.select_related('course'), pk=pk)
        if group.is_private and str(request.data.get('code', '')).strip().upper() != group.invite_code:
            return Response({'code': 'That invite code isn’t right.'}, status=status.HTTP_400_BAD_REQUEST)
        return _join(request, group)


class JoinByCodeView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        group = StudyGroup.objects.select_related('course').filter(invite_code=str(request.data.get('code', '')).strip().upper()).first()
        if not group:
            return Response({'code': 'No group has that invite code.'}, status=status.HTTP_404_NOT_FOUND)
        return _join(request, group)


class LeaveView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        group = get_object_or_404(StudyGroup, pk=pk)
        member = _membership(group, request.user)
        if not member:
            return Response(status=status.HTTP_204_NO_CONTENT)
        with transaction.atomic():
            member.delete()
            if member.role == GroupMember.OWNER:
                heir = group.members.order_by('joined_at').first()
                if heir:
                    heir.role = GroupMember.OWNER
                    heir.save(update_fields=['role'])
                else:
                    group.delete()  # nobody left
        return Response(status=status.HTTP_204_NO_CONTENT)


class RemoveMemberView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, pk, user_id):
        group = get_object_or_404(StudyGroup, pk=pk)
        me = _membership(group, request.user)
        if not me or me.role != GroupMember.OWNER or user_id == request.user.id:
            return Response({'detail': 'Only the owner can remove members.'}, status=status.HTTP_403_FORBIDDEN)
        GroupMember.objects.filter(group=group, user_id=user_id).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class PostsView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        group = get_object_or_404(StudyGroup, pk=pk)
        if not _membership(group, request.user):
            return Response({'detail': 'Join the group to post.'}, status=status.HTTP_403_FORBIDDEN)
        body = str(request.data.get('body', '')).strip()[:2000]
        if not body:
            return Response({'body': 'Write something.'}, status=status.HTTP_400_BAD_REQUEST)
        post = GroupPost.objects.create(group=group, author=request.user, body=body)
        others = [m.user for m in group.members.exclude(user=request.user).select_related('user')]
        notify(others, 'announcement', f'{public_name(request.user)} in {group.name}', body[:200], f'/student/groups/{group.id}')
        return Response({'id': post.id}, status=status.HTTP_201_CREATED)


class PostView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, pk):
        post = get_object_or_404(GroupPost.objects.select_related('group'), pk=pk)
        me = _membership(post.group, request.user)
        if post.author_id != request.user.id and not (me and me.role == GroupMember.OWNER):
            return Response({'detail': 'You can only delete your own posts.'}, status=status.HTTP_403_FORBIDDEN)
        post.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class PinPostView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        post = get_object_or_404(GroupPost.objects.select_related('group'), pk=pk)
        me = _membership(post.group, request.user)
        if not me or me.role != GroupMember.OWNER:
            return Response({'detail': 'Only the owner can pin posts.'}, status=status.HTTP_403_FORBIDDEN)
        post.is_pinned = not post.is_pinned
        post.save(update_fields=['is_pinned'])
        return Response({'is_pinned': post.is_pinned})
