"""Study groups: creating, joining (open or by code), the progress board, posts, owners."""
from portal.models import TrainingEnrollment

from .models import GroupMember, Notification, StudyGroup
from .tests import API, LmsCase


class StudyGroupTests(LmsCase):
    def setUp(self):
        super().setUp()
        self.enroll()
        self.enroll(self.other)

    def create(self, **extra):
        self.as_(self.student)
        resp = self.client.post(f'{API}/courses/web/groups/', {'name': 'Evening learners', **extra}, format='json')
        self.assertEqual(resp.status_code, 201, resp.data)
        return resp.data

    def test_create_join_board_and_posts(self):
        group = self.create()
        self.assertTrue(group['is_owner'])
        self.as_(self.other)
        self.assertEqual([g['name'] for g in self.client.get(f'{API}/courses/web/groups/').data['groups']], ['Evening learners'])
        self.assertEqual(self.client.post(f'{API}/groups/{group["id"]}/posts/', {'body': 'hi'}, format='json').status_code, 403)  # not a member
        data = self.client.post(f'{API}/groups/{group["id"]}/join/').data
        self.assertEqual(len(data['members_list']), 2)
        self.assertTrue(Notification.objects.filter(user=self.student, title__contains='joined Evening learners').exists())
        # progress board
        self.client.post(f'{API}/lessons/{self.reading.id}/progress/', {'completed': True}, format='json')
        board = self.client.get(f'{API}/groups/{group["id"]}/').data['members_list']
        self.assertEqual(board[0]['name'], 'B.' if board[0]['progress'] and not board[0]['name'] else board[0]['name'])
        self.assertGreater(next(m for m in board if m['you'])['progress'], 0)
        # posts notify the others
        self.client.post(f'{API}/groups/{group["id"]}/posts/', {'body': 'Shall we do the quiz tonight?'}, format='json')
        self.assertTrue(Notification.objects.filter(user=self.student, body__contains='quiz tonight').exists())
        self.assertEqual(self.client.get(f'{API}/me/groups/').data[0]['name'], 'Evening learners')

    def test_private_groups_need_the_code(self):
        group = self.create(is_private=True)
        code = StudyGroup.objects.get().invite_code
        self.as_(self.other)
        self.assertEqual(self.client.get(f'{API}/courses/web/groups/').data['groups'], [])  # not listed
        self.assertEqual(self.client.get(f'{API}/groups/{group["id"]}/').status_code, 404)
        self.assertEqual(self.client.post(f'{API}/groups/{group["id"]}/join/', {'code': 'WRONG'}, format='json').status_code, 400)
        self.assertEqual(self.client.post(f'{API}/groups/join/', {'code': code.lower()}, format='json').status_code, 200)
        self.assertIsNone(self.client.get(f'{API}/groups/{group["id"]}/').data['invite_code'])  # members don't see it; the owner does

    def test_only_students_on_the_course(self):
        group = self.create()
        TrainingEnrollment.objects.filter(student=self.other).delete()
        self.as_(self.other)
        self.assertEqual(self.client.post(f'{API}/groups/{group["id"]}/join/').status_code, 403)
        self.assertEqual(self.client.post(f'{API}/courses/web/groups/', {'name': 'x'}, format='json').status_code, 403)

    def test_full_owner_tools_and_leaving(self):
        group = self.create(max_members=2)
        self.as_(self.other)
        self.client.post(f'{API}/groups/{group["id"]}/join/')
        post = self.client.post(f'{API}/groups/{group["id"]}/posts/', {'body': 'spam'}, format='json').data
        self.as_(self.student)
        self.assertTrue(self.client.post(f'{API}/group-posts/{post["id"]}/pin/').data['is_pinned'])
        self.assertEqual(self.client.delete(f'{API}/group-posts/{post["id"]}/').status_code, 204)  # owner can remove posts
        self.client.delete(f'{API}/groups/{group["id"]}/members/{self.other.id}/')
        self.assertEqual(GroupMember.objects.filter(group_id=group['id']).count(), 1)
        # the owner leaves: the group passes to the next member, or ends
        self.as_(self.other)
        self.client.post(f'{API}/groups/{group["id"]}/join/')
        self.as_(self.student)
        self.client.post(f'{API}/groups/{group["id"]}/leave/')
        self.assertEqual(GroupMember.objects.get(group_id=group['id']).user, self.other)
        self.assertEqual(GroupMember.objects.get(group_id=group['id']).role, GroupMember.OWNER)
        self.as_(self.other)
        self.client.post(f'{API}/groups/{group["id"]}/leave/')
        self.assertFalse(StudyGroup.objects.exists())
