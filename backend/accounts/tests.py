import re
from datetime import timedelta
from unittest.mock import patch
from urllib.parse import parse_qs, urlparse

from django.core import mail
from django.core.cache import cache
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from .models import ActivityLog, EmailOTP, SocialAccount, User

PASSWORD = 'Passw0rd!'


def make_user(email='ama@example.com', approved=True, verified=True, role=User.STUDENT, **extra):
    return User.objects.create_user(
        email=email, password=PASSWORD, first_name='Ama', last_name='Kamara', role=role,
        approval_status=User.APPROVED if approved else User.PENDING, is_verified=verified, **extra,
    )


def last_code():
    """The 6-digit code from the most recent email (tests use Django's in-memory mail outbox)."""
    return re.search(r'\b(\d{6})\b', mail.outbox[-1].body).group(1)


# ============================================================ Email codes (OTP)

class RegistrationOTPTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def register(self, email='new@example.com'):
        return self.client.post('/api/v1/auth/register/', {
            'email': email, 'first_name': 'Fatmata', 'last_name': 'Sesay', 'country': 'Sierra Leone',
            'password': PASSWORD, 'password_confirm': PASSWORD,
        }, format='json')

    def test_register_sends_code_and_returns_no_tokens(self):
        resp = self.register()
        self.assertEqual(resp.status_code, 201)
        self.assertTrue(resp.data['otp_required'])
        self.assertNotIn('access', resp.data)
        self.assertEqual(resp.data['email'], 'ne***@example.com')  # never reveals the real length
        user = User.objects.get(email='new@example.com')
        self.assertEqual((user.approval_status, user.is_verified), (User.PENDING, False))
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn('new@example.com', mail.outbox[0].to)
        self.assertEqual(len(mail.outbox[0].alternatives), 1)  # branded HTML version

    def test_verifying_code_approves_the_student_and_signs_them_in(self):
        challenge = self.register().data['challenge']
        resp = self.client.post('/api/v1/auth/otp/verify/', {'challenge': challenge, 'code': last_code()}, format='json')
        self.assertEqual(resp.data['status'], 'signed_in')
        self.assertIn('access', resp.data)
        user = User.objects.get(email='new@example.com')
        self.assertEqual((user.is_verified, user.approval_status), (True, User.APPROVED))
        self.assertTrue(ActivityLog.objects.filter(user=user, action=ActivityLog.ACCOUNT_APPROVED).exists())
        self.assertEqual(len(mail.outbox), 1)  # just the code; no "awaiting approval" alert

    def test_code_is_single_use(self):
        challenge = self.register().data['challenge']
        code = last_code()
        self.client.post('/api/v1/auth/otp/verify/', {'challenge': challenge, 'code': code}, format='json')
        again = self.client.post('/api/v1/auth/otp/verify/', {'challenge': challenge, 'code': code}, format='json')
        self.assertEqual(again.data['code'], 'code_expired')


class LoginOTPTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = make_user()

    def login(self, email='ama@example.com', password=PASSWORD, remember=True):
        return self.client.post('/api/v1/auth/login/', {'email': email, 'password': password, 'remember': remember}, format='json')

    def test_correct_password_sends_code_not_tokens(self):
        resp = self.login()
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.data['otp_required'])
        self.assertEqual(resp.data['purpose'], 'LOGIN')
        self.assertNotIn('access', resp.data)
        self.assertEqual(len(mail.outbox), 1)

    def test_correct_code_signs_in(self):
        challenge = self.login(remember=False).data['challenge']
        resp = self.client.post('/api/v1/auth/otp/verify/', {'challenge': challenge, 'code': last_code()}, format='json')
        self.assertEqual(resp.status_code, 200)
        self.assertIn('access', resp.data)
        self.assertEqual(resp.data['user']['email'], 'ama@example.com')
        self.assertFalse(resp.data['remember'])
        self.assertTrue(ActivityLog.objects.filter(user=self.user, action=ActivityLog.LOGIN).exists())

    def test_wrong_password_sends_nothing(self):
        resp = self.login(password='wrong')
        self.assertEqual(resp.status_code, 401)
        self.assertEqual(len(mail.outbox), 0)

    def test_wrong_codes_are_limited(self):
        challenge = self.login().data['challenge']
        wrong = '000000' if last_code() != '000000' else '111111'
        for left in (4, 3, 2, 1):
            resp = self.client.post('/api/v1/auth/otp/verify/', {'challenge': challenge, 'code': wrong}, format='json')
            self.assertIn(f'{left} attempt', resp.data['detail'])
        resp = self.client.post('/api/v1/auth/otp/verify/', {'challenge': challenge, 'code': wrong}, format='json')
        self.assertEqual(resp.data['code'], 'too_many_attempts')
        # Even the right code no longer works
        resp = self.client.post('/api/v1/auth/otp/verify/', {'challenge': challenge, 'code': last_code()}, format='json')
        self.assertEqual(resp.data['code'], 'too_many_attempts')

    def test_expired_code(self):
        challenge = self.login().data['challenge']
        EmailOTP.objects.update(expires_at=timezone.now() - timedelta(seconds=1))
        resp = self.client.post('/api/v1/auth/otp/verify/', {'challenge': challenge, 'code': last_code()}, format='json')
        self.assertEqual(resp.data['code'], 'code_expired')

    def test_resend_is_rate_limited_and_replaces_old_code(self):
        challenge = self.login().data['challenge']
        first = last_code()
        too_soon = self.client.post('/api/v1/auth/otp/resend/', {'challenge': challenge}, format='json')
        self.assertEqual(too_soon.status_code, 429)
        self.assertIn('retry_after', too_soon.data)

        EmailOTP.objects.update(created_at=timezone.now() - timedelta(minutes=2))
        ok = self.client.post('/api/v1/auth/otp/resend/', {'challenge': challenge}, format='json')
        self.assertEqual(ok.status_code, 200)
        second = last_code()
        if first != second:
            old = self.client.post('/api/v1/auth/otp/verify/', {'challenge': challenge, 'code': first}, format='json')
            self.assertEqual(old.status_code, 400)
        new = self.client.post('/api/v1/auth/otp/verify/', {'challenge': challenge, 'code': second}, format='json')
        self.assertIn('access', new.data)

    def test_tampered_challenge_is_rejected(self):
        resp = self.client.post('/api/v1/auth/otp/verify/', {'challenge': 'forged', 'code': '123456'}, format='json')
        self.assertEqual(resp.data['code'], 'challenge_expired')

    def test_pending_rejected_and_suspended_accounts_are_blocked_before_any_code(self):
        make_user('pending@example.com', approved=False, role=User.COUNSELLOR)  # staff still need an admin
        make_user('rejected@example.com')
        User.objects.filter(email='rejected@example.com').update(approval_status=User.REJECTED)
        make_user('off@example.com', is_active=False)
        for email, code in [('pending@example.com', 'pending_approval'), ('rejected@example.com', 'rejected'), ('off@example.com', 'suspended')]:
            resp = self.login(email)
            self.assertEqual((resp.status_code, resp.data['code']), (403, code))
        self.assertEqual(len(mail.outbox), 0)

    def test_pending_student_is_approved_on_next_sign_in(self):
        make_user('waiting@example.com', approved=False)
        resp = self.login('waiting@example.com')
        self.assertTrue(resp.data['otp_required'])
        self.assertEqual(User.objects.get(email='waiting@example.com').approval_status, User.APPROVED)

    def test_unverified_user_is_asked_to_verify_email_first(self):
        make_user('unverified@example.com', verified=False)
        resp = self.login('unverified@example.com')
        self.assertEqual(resp.data['purpose'], 'REGISTER')


class PasswordResetTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = make_user()

    def test_reset_with_code(self):
        challenge = self.client.post('/api/v1/auth/password-reset/request/', {'email': 'ama@example.com'}, format='json').data['challenge']
        resp = self.client.post('/api/v1/auth/password-reset/confirm/', {
            'challenge': challenge, 'code': last_code(), 'new_password': 'N3w-Passw0rd!', 'new_password_confirm': 'N3w-Passw0rd!',
        }, format='json')
        self.assertEqual(resp.status_code, 200)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password('N3w-Passw0rd!'))

    def test_unknown_email_gets_the_same_answer_and_no_email(self):
        resp = self.client.post('/api/v1/auth/password-reset/request/', {'email': 'nobody@example.com'}, format='json')
        self.assertEqual(resp.status_code, 200)
        self.assertIn('challenge', resp.data)
        self.assertEqual(len(mail.outbox), 0)
        confirm = self.client.post('/api/v1/auth/password-reset/confirm/', {
            'challenge': resp.data['challenge'], 'code': '123456', 'new_password': 'N3w-Passw0rd!', 'new_password_confirm': 'N3w-Passw0rd!',
        }, format='json')
        self.assertEqual(confirm.status_code, 400)


# ============================================================ Admin user management

class AdminUserManagementTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(email='admin@example.com', password=PASSWORD, first_name='Ad', last_name='Min')
        self.client = APIClient()
        self.client.force_authenticate(self.admin)
        self.pending = make_user('pending@example.com', approved=False)

    def action(self, user, action, **extra):
        # Status emails are sent after the transaction commits; run those callbacks in tests.
        with self.captureOnCommitCallbacks(execute=True):
            return self.client.post(f'/api/v1/auth/users/{user.pk}/action/', {'action': action, **extra}, format='json')

    def test_superuser_starts_approved(self):
        self.assertEqual(self.admin.approval_status, User.APPROVED)

    def test_only_admins_can_manage_users(self):
        student = make_user('student@example.com')
        other = APIClient()
        other.force_authenticate(student)
        self.assertEqual(other.get('/api/v1/auth/users/').status_code, 403)
        self.assertEqual(other.post(f'/api/v1/auth/users/{self.pending.pk}/action/', {'action': 'approve'}, format='json').status_code, 403)

    def test_list_filters_and_stats(self):
        make_user('ok@example.com')
        pending = self.client.get('/api/v1/auth/users/', {'status': 'pending'})
        self.assertEqual([u['email'] for u in pending.data['results']], ['pending@example.com'])
        stats = self.client.get('/api/v1/auth/users/stats/').data
        self.assertEqual((stats['total'], stats['pending'], stats['approved']), (3, 1, 2))

    def test_approve_emails_the_user_and_lets_them_sign_in(self):
        resp = self.action(self.pending, 'approve')
        self.assertEqual(resp.data['user']['approval_status'], 'APPROVED')
        self.assertEqual(resp.data['user']['approved_by_name'], 'Ad Min')
        self.assertIn('approved', mail.outbox[-1].subject)
        login = APIClient().post('/api/v1/auth/login/', {'email': 'pending@example.com', 'password': PASSWORD}, format='json')
        self.assertTrue(login.data['otp_required'])

    def test_reject_with_reason(self):
        self.action(self.pending, 'reject', reason='Incomplete details')
        self.pending.refresh_from_db()
        self.assertEqual((self.pending.approval_status, self.pending.rejection_reason), (User.REJECTED, 'Incomplete details'))
        self.assertIn('Incomplete details', mail.outbox[-1].body)

    def test_suspend_and_reactivate(self):
        user = make_user('user@example.com')
        self.action(user, 'suspend')
        user.refresh_from_db()
        self.assertFalse(user.is_active)
        self.action(user, 'activate')
        user.refresh_from_db()
        self.assertTrue(user.is_active)
        self.assertIn('enabled', mail.outbox[-1].subject)

    def test_delete_user(self):
        user = make_user('user@example.com')
        url = f'/api/v1/auth/users/{user.pk}/'
        self.assertEqual(self.client.delete(f'/api/v1/auth/users/{self.admin.pk}/').status_code, 400)  # not yourself
        self.assertEqual(self.client.delete(url).status_code, 204)
        self.assertFalse(User.objects.filter(pk=user.pk).exists())
        self.assertTrue(ActivityLog.objects.filter(user=self.admin, description__contains='user@example.com').exists())
        self.assertEqual(self.client.delete(url).status_code, 404)
        student = APIClient()
        student.force_authenticate(make_user('student@example.com'))
        self.assertEqual(student.delete(f'/api/v1/auth/users/{self.admin.pk}/').status_code, 403)

    def test_change_role(self):
        user = make_user('user@example.com')
        self.action(user, 'set_role', role=User.COUNSELLOR)
        user.refresh_from_db()
        self.assertEqual(user.role, User.COUNSELLOR)
        self.assertTrue(ActivityLog.objects.filter(user=user, action=ActivityLog.ROLE_CHANGE).exists())

    def test_admin_cannot_lock_themselves_out(self):
        for action in ('suspend', 'reject'):
            self.assertEqual(self.action(self.admin, action).status_code, 400)
        self.assertEqual(self.action(self.admin, 'set_role', role=User.STUDENT).status_code, 400)
        self.admin.refresh_from_db()
        self.assertTrue(self.admin.is_active)

    def test_bulk_approve_skips_self(self):
        second = make_user('second@example.com', approved=False)
        resp = self.client.post('/api/v1/auth/users/bulk/', {'ids': [self.pending.pk, second.pk], 'action': 'approve'}, format='json')
        self.assertEqual(resp.data['updated'], 2)
        bulk_suspend = self.client.post('/api/v1/auth/users/bulk/', {'ids': [self.admin.pk, second.pk], 'action': 'suspend'}, format='json')
        self.assertEqual(bulk_suspend.data['updated'], 1)
        self.assertEqual(bulk_suspend.data['skipped'][0]['email'], 'admin@example.com')

    def test_insights_for_the_dashboard(self):
        # One user registered 40 days ago (previous 30-day period), the rest this period
        old = make_user('old@example.com')
        User.objects.filter(pk=old.pk).update(created_at=timezone.now() - timedelta(days=40))
        ActivityLog.objects.create(user=self.pending, action=ActivityLog.LOGIN)
        data = self.client.get('/api/v1/auth/users/insights/', {'days': 30}).data
        self.assertEqual(len(data['series']), 30)
        self.assertEqual(data['series'][-1]['date'], timezone.localdate().isoformat())
        self.assertEqual(data['totals']['registrations'], 2)       # admin + pending, created today
        self.assertEqual(data['totals']['registrations_prev'], 1)  # the old user
        self.assertEqual(data['totals']['logins'], 1)
        self.assertEqual(data['status']['pending'], 1)
        self.assertEqual(sum(r['count'] for r in data['roles']), 3)
        self.assertEqual((len(data['login_heatmap']), len(data['login_heatmap'][0])), (7, 8))
        self.assertEqual(sum(map(sum, data['login_heatmap'])), 1)
        self.assertEqual(self.client.get('/api/v1/auth/users/insights/', {'days': 999}).data['days'], 30)
        student = APIClient()
        student.force_authenticate(make_user('s@example.com'))
        self.assertEqual(student.get('/api/v1/auth/users/insights/').status_code, 403)

    def test_overview_for_the_users_page(self):
        ActivityLog.objects.create(user=self.pending, action=ActivityLog.LOGIN)
        self.action(self.pending, 'approve')
        data = self.client.get('/api/v1/auth/users/overview/').data
        self.assertEqual(data['total'], 2)                       # admin + the now-approved user
        self.assertEqual((data['new_7'], data['active_30'], data['pending']), (2, 1, 0))
        self.assertEqual(len(data['weekly']), 12)
        self.assertEqual(data['weekly'][-1]['end'], timezone.localdate().isoformat())
        self.assertEqual(sum(w['count'] for w in data['weekly']), 2)
        self.assertEqual(data['methods'][0], {'key': 'email', 'label': 'Email & password', 'count': 2})
        self.assertIsNotNone(data['avg_approval_hours'])
        self.assertEqual(sum(r['count'] for r in data['roles']), 2)
        student = APIClient()
        student.force_authenticate(make_user('s2@example.com'))
        self.assertEqual(student.get('/api/v1/auth/users/overview/').status_code, 403)

    def test_platform_activity_and_overview(self):
        phone = 'Mozilla/5.0 (Linux; Android 14) Mobile Safari'
        ActivityLog.objects.create(user=self.pending, action=ActivityLog.LOGIN, ip_address='10.0.0.1', user_agent=phone)
        ActivityLog.objects.create(user=self.pending, action=ActivityLog.FAILED_LOGIN, ip_address='10.0.0.9')
        ActivityLog.objects.create(user=self.admin, action=ActivityLog.FAILED_LOGIN, ip_address='10.0.0.9')
        self.action(self.pending, 'approve')

        listed = self.client.get('/api/v1/auth/activity/').data
        self.assertEqual(listed['count'], 4)
        self.assertEqual(listed['results'][0]['action'], 'ACCOUNT_APPROVED')
        self.assertEqual(self.client.get('/api/v1/auth/activity/', {'action': 'FAILED_LOGIN'}).data['count'], 2)
        self.assertEqual(self.client.get('/api/v1/auth/activity/', {'action': 'admin'}).data['count'], 1)
        self.assertEqual(self.client.get('/api/v1/auth/activity/', {'ip': '10.0.0.9'}).data['count'], 2)
        by_name = self.client.get('/api/v1/auth/activity/', {'search': 'pending@'}).data
        self.assertEqual(by_name['count'], 3)
        self.assertEqual(self.client.get('/api/v1/auth/activity/', {'action': 'LOGIN'}).data['results'][0]['device'], 'mobile')

        ov = self.client.get('/api/v1/auth/activity/overview/', {'days': 7}).data
        self.assertEqual((ov['events'], ov['logins'], ov['failed'], ov['admin_actions']), (4, 1, 2, 1))
        self.assertEqual(len(ov['series']), 7)
        self.assertEqual(sum(p['failed'] for p in ov['series']), 2)
        self.assertEqual(ov['failed_ips'][0], {**ov['failed_ips'][0], 'ip': '10.0.0.9', 'count': 2, 'accounts': 2})
        self.assertEqual(dict((d['key'], d['count']) for d in ov['devices'])['mobile'], 1)
        # Approval is logged on the approved account; the admin's failed attempt doesn't count as activity.
        self.assertEqual(ov['unique_users'], 1)

        student = APIClient()
        student.force_authenticate(make_user('s3@example.com'))
        self.assertEqual(student.get('/api/v1/auth/activity/').status_code, 403)
        self.assertEqual(student.get('/api/v1/auth/activity/overview/').status_code, 403)

    def test_my_activity_overview(self):
        phone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5) Mobile/15E148'
        ActivityLog.objects.create(user=self.pending, action=ActivityLog.LOGIN, ip_address='10.0.0.1', user_agent=phone)
        ActivityLog.objects.create(user=self.pending, action=ActivityLog.LOGIN, ip_address='10.0.0.2', user_agent='Windows Chrome')
        ActivityLog.objects.create(user=self.pending, action=ActivityLog.FAILED_LOGIN, ip_address='10.0.0.9')
        ActivityLog.objects.create(user=self.pending, action=ActivityLog.PASSWORD_CHANGE)
        ActivityLog.objects.create(user=self.admin, action=ActivityLog.LOGIN, ip_address='10.9.9.9')   # someone else's

        me = APIClient()
        me.force_authenticate(self.pending)
        data = me.get('/api/v1/auth/activity-logs/overview/', {'days': 7}).data
        self.assertEqual((data['events'], data['logins'], data['failed']), (4, 2, 1))
        self.assertEqual(len(data['series']), 7)
        self.assertEqual(data['current_login']['ip'], '10.0.0.2')
        self.assertEqual(data['previous_login']['device'], 'mobile')
        self.assertIsNotNone(data['password_changed_at'])
        self.assertEqual({a['ip'] for a in data['addresses']}, {'10.0.0.1', '10.0.0.2', '10.0.0.9'})   # not the admin's
        self.assertEqual(dict((d['key'], d['count']) for d in data['devices'])['mobile'], 1)
        self.assertEqual(me.get('/api/v1/auth/activity-logs/').data['results'][0]['device'], 'unknown')

    def test_user_detail_includes_activity(self):
        self.action(self.pending, 'approve')
        resp = self.client.get(f'/api/v1/auth/users/{self.pending.pk}/')
        self.assertEqual(resp.data['user']['email'], 'pending@example.com')
        self.assertEqual(resp.data['activity'][0]['action'], 'ACCOUNT_APPROVED')


# ============================================================ Social sign-in

OAUTH_SETTINGS = dict(
    GOOGLE_CLIENT_ID='gid', GOOGLE_CLIENT_SECRET='gsecret',
    GITHUB_CLIENT_ID='hid', GITHUB_CLIENT_SECRET='hsecret',
    FACEBOOK_CLIENT_ID='', FACEBOOK_CLIENT_SECRET='',
    FRONTEND_URL='http://frontend.test', BACKEND_URL='http://api.test',
)

GOOGLE_PROFILE = {'uid': 'g-123', 'email': 'ama@example.com', 'email_verified': True, 'first_name': 'Ama', 'last_name': 'Kamara'}


@override_settings(**OAUTH_SETTINGS)
class OAuthFlowTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()

    def start(self, provider='google', next_path=''):
        url = f'/api/v1/auth/oauth/{provider}/start/' + (f'?next={next_path}' if next_path else '')
        resp = self.client.get(url)
        state = parse_qs(urlparse(resp['Location']).query).get('state', [''])[0]
        return resp, state

    def callback(self, state, provider='google', profile=GOOGLE_PROFILE):
        cls = {'google': 'Google', 'github': 'GitHub'}[provider]
        with patch('accounts.oauth.Provider.exchange_code', return_value='token'), \
             patch(f'accounts.oauth.{cls}Provider.profile', return_value=profile):
            return self.client.get(f'/api/v1/auth/oauth/{provider}/callback/', {'code': 'abc', 'state': state})

    def params(self, resp):
        return {k: v[0] for k, v in parse_qs(urlparse(resp['Location']).query).items()}

    def test_start_redirects_to_provider_with_state_cookie(self):
        resp, state = self.start()
        self.assertTrue(resp['Location'].startswith('https://accounts.google.com/'))
        self.assertIn('redirect_uri=http%3A%2F%2Fapi.test%2Fapi%2Fv1%2Fauth%2Foauth%2Fgoogle%2Fcallback%2F', resp['Location'])
        self.assertTrue(state)
        self.assertIn('adram_oauth_state', resp.cookies)

    def test_unconfigured_provider_reports_not_configured(self):
        resp = self.client.get('/api/v1/auth/oauth/facebook/start/')
        self.assertEqual(resp['Location'], 'http://frontend.test/login?oauth_error=not_configured&provider=facebook')

    def test_new_social_user_is_approved_as_a_student_and_signed_in(self):
        _, state = self.start()
        resp = self.callback(state)
        self.assertNotIn('oauth_error', self.params(resp))
        user = User.objects.get(email='ama@example.com')
        self.assertEqual((user.role, user.is_verified, user.approval_status, user.has_usable_password()),
                         (User.STUDENT, True, User.APPROVED, False))
        self.assertTrue(SocialAccount.objects.filter(user=user, provider='google').exists())
        self.assertEqual(len(mail.outbox), 0)

    def test_approved_user_signs_in_and_code_works_once(self):
        make_user()
        _, state = self.start(next_path='/scholarships')
        params = self.params(self.callback(state))
        self.assertEqual(params['next'], '/scholarships')
        first = self.client.post('/api/v1/auth/oauth/exchange/', {'code': params['code']}, format='json')
        self.assertEqual(first.data['user']['email'], 'ama@example.com')
        second = self.client.post('/api/v1/auth/oauth/exchange/', {'code': params['code']}, format='json')
        self.assertEqual(second.status_code, 400)

    def test_existing_account_is_linked_by_verified_email_then_by_provider_id(self):
        existing = make_user()
        _, state = self.start()
        self.callback(state)
        self.assertEqual(SocialAccount.objects.get(uid='g-123').user, existing)
        _, state = self.start()
        resp = self.callback(state, profile={**GOOGLE_PROFILE, 'email': 'changed@example.com'})
        self.assertIn('/oauth/callback?', resp['Location'])

    def test_unverified_email_is_rejected(self):
        make_user('victim@example.com')
        _, state = self.start('github')
        resp = self.callback(state, 'github', {**GOOGLE_PROFILE, 'uid': 'h-1', 'email': 'victim@example.com', 'email_verified': False})
        self.assertEqual(self.params(resp)['oauth_error'], 'no_email')
        self.assertFalse(SocialAccount.objects.exists())

    def test_forged_or_missing_state_is_rejected(self):
        self.start()
        self.assertEqual(self.params(self.callback('forged-state'))['oauth_error'], 'state')
        _, state = self.start()
        self.client.cookies.clear()
        self.assertEqual(self.params(self.callback(state))['oauth_error'], 'state')
        self.assertFalse(User.objects.filter(email='ama@example.com').exists())

    def test_cancelled_at_provider(self):
        _, state = self.start()
        resp = self.client.get('/api/v1/auth/oauth/google/callback/', {'error': 'access_denied', 'state': state})
        self.assertEqual(self.params(resp)['oauth_error'], 'access_denied')

    def test_inactive_user_cannot_sign_in(self):
        make_user(is_active=False)
        _, state = self.start()
        self.assertEqual(self.params(self.callback(state))['oauth_error'], 'inactive')

    def test_external_next_is_ignored(self):
        make_user()
        _, state = self.start(next_path='//evil.example')
        self.assertNotIn('next', self.params(self.callback(state)))

    def test_providers_endpoint(self):
        resp = self.client.get('/api/v1/auth/oauth/providers/')
        self.assertEqual(resp.data, {'google': True, 'facebook': False, 'github': True})


class OTPLimitTests(TestCase):
    def test_no_hourly_limit_by_default(self):
        from .otp import issue_otp
        user = make_user('often@example.com')
        for _ in range(8):
            EmailOTP.objects.filter(user=user).update(created_at=timezone.now() - timedelta(minutes=2))  # past the 60s wait
            issue_otp(user, EmailOTP.LOGIN)
        self.assertEqual(len(mail.outbox), 8)
