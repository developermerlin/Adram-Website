"""
User management for administrators: list, statistics, detail and approval actions.
All endpoints require the ADMIN role.
"""
from datetime import datetime, time, timedelta

from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .emails import send_approved_email, send_reactivated_email, send_rejected_email, send_suspended_email
from .models import ActivityLog
from .permissions import IsAdmin
from .serializers import (
    ActivityLogSerializer, AdminBulkActionSerializer, AdminUserActionSerializer, AdminUserSerializer,
)
from .views import log_activity, sign_out_everywhere

User = get_user_model()

# ?status= filter values used by the admin dashboard tabs.
STATUS_FILTERS = {
    'pending': Q(approval_status=User.PENDING, is_active=True),
    'approved': Q(approval_status=User.APPROVED, is_active=True),
    'rejected': Q(approval_status=User.REJECTED),
    'suspended': Q(is_active=False),
    'unverified': Q(is_verified=False, is_active=True),
}


class UserListView(generics.ListAPIView):
    """
    GET /api/v1/auth/users/?status=pending&role=STUDENT&search=ama&ordering=-created_at
    """
    serializer_class = AdminUserSerializer
    permission_classes = [IsAdmin]
    search_fields = ['email', 'first_name', 'last_name', 'phone_number', 'country']
    ordering_fields = ['created_at', 'email', 'first_name', 'last_login', 'approval_status']

    def get_queryset(self):
        queryset = User.objects.select_related('approved_by').order_by('-created_at')
        params = self.request.query_params
        if params.get('role'):
            queryset = queryset.filter(role=params['role'])
        if params.get('status') in STATUS_FILTERS:
            queryset = queryset.filter(STATUS_FILTERS[params['status']])
        return queryset


class UserStatsView(APIView):
    """GET /api/v1/auth/users/stats/ -> headline numbers for the admin dashboard."""
    permission_classes = [IsAdmin]

    def get(self, request):
        counts = User.objects.aggregate(
            total=Count('id'),
            **{name: Count('id', filter=condition) for name, condition in STATUS_FILTERS.items()},
            new_this_week=Count('id', filter=Q(created_at__gte=timezone.now() - timedelta(days=7))),
        )
        by_role = dict(User.objects.values_list('role').annotate(n=Count('id')))
        counts['by_role'] = {role: by_role.get(role, 0) for role, _ in User.ROLE_CHOICES}
        return Response(counts)


class UserOverviewView(APIView):
    """
    GET /api/v1/auth/users/overview/ -> statistics for the Users page: growth, engagement, verification,
    approval speed, sign-in methods and where users live. Separate from /stats/ (which the sidebar polls).
    """
    permission_classes = [IsAdmin]
    WEEKS = 12

    def get(self, request):
        from django.db.models.functions import TruncDate
        from .models import SocialAccount

        now = timezone.now()
        today = timezone.localdate()
        users = User.objects.all()
        logins = ActivityLog.objects.filter(action=ActivityLog.LOGIN)

        def active_between(since, until):
            return logins.filter(timestamp__gte=since, timestamp__lt=until).values('user').distinct().count()

        # Sign-ups per week for the last 12 weeks (the last bucket ends today).
        start = today - timedelta(days=self.WEEKS * 7 - 1)
        per_day = dict(users.filter(created_at__gte=timezone.make_aware(datetime.combine(start, time.min)))
                       .annotate(day=TruncDate('created_at')).values('day').annotate(n=Count('id')).values_list('day', 'n'))
        weekly = []
        for w in range(self.WEEKS):
            week_start = start + timedelta(days=w * 7)
            weekly.append({'start': week_start.isoformat(),
                           'end': (week_start + timedelta(days=6)).isoformat(),
                           'count': sum(per_day.get(week_start + timedelta(days=d), 0) for d in range(7))})

        # How long approval takes (accounts approved in the last 90 days).
        waits = [(u.approved_at - u.created_at).total_seconds() / 3600
                 for u in users.filter(approved_at__gte=now - timedelta(days=90), approved_at__isnull=False).only('approved_at', 'created_at')[:1000]
                 if u.approved_at >= u.created_at]
        oldest_pending = users.filter(STATUS_FILTERS['pending']).order_by('created_at').values_list('created_at', flat=True).first()

        # Sign-in methods: a user may have linked more than one provider.
        social = dict(SocialAccount.objects.values_list('provider').annotate(n=Count('user', distinct=True)))
        with_social = SocialAccount.objects.values('user').distinct().count()
        methods = [{'key': 'email', 'label': 'Email & password', 'count': users.count() - with_social}]
        methods += [{'key': key, 'label': label, 'count': social.get(key, 0)} for key, label in SocialAccount.PROVIDER_CHOICES]

        by_country = list(users.exclude(country__isnull=True).exclude(country='')
                          .values('country').annotate(n=Count('id')).order_by('-n', 'country'))
        countries = [{'label': row['country'], 'count': row['n']} for row in by_country[:6]]
        if by_country[6:]:
            countries.append({'label': 'Other countries', 'count': sum(row['n'] for row in by_country[6:])})
        unknown = users.filter(Q(country__isnull=True) | Q(country='')).count()
        if unknown:
            countries.append({'label': 'Not given', 'count': unknown})

        counts = users.aggregate(
            total=Count('id'),
            verified=Count('id', filter=Q(is_verified=True)),
            never_signed_in=Count('id', filter=Q(last_login__isnull=True, is_active=True)),
            new_7=Count('id', filter=Q(created_at__gte=now - timedelta(days=7))),
            new_prev_7=Count('id', filter=Q(created_at__gte=now - timedelta(days=14), created_at__lt=now - timedelta(days=7))),
            **{name: Count('id', filter=condition) for name, condition in STATUS_FILTERS.items()},
        )
        by_role = dict(users.values_list('role').annotate(n=Count('id')))
        return Response({
            **counts,
            'active_30': active_between(now - timedelta(days=30), now),
            'active_prev_30': active_between(now - timedelta(days=60), now - timedelta(days=30)),
            'avg_approval_hours': round(sum(waits) / len(waits), 1) if waits else None,
            'oldest_pending_days': (now - oldest_pending).days if oldest_pending else None,
            'weekly': weekly,
            'methods': methods,
            'countries': countries,
            'roles': [{'role': role, 'label': label, 'count': by_role.get(role, 0)} for role, label in User.ROLE_CHOICES],
        })


def period_param(request, allowed=(7, 30, 90), default=30):
    try:
        days = int(request.query_params.get('days', default))
    except ValueError:
        return default
    return days if days in allowed else default


# Actions an admin takes on someone else's account.
ADMIN_ACTIONS = [ActivityLog.ACCOUNT_APPROVED, ActivityLog.ACCOUNT_REJECTED, ActivityLog.ROLE_CHANGE,
                 ActivityLog.ACCOUNT_DEACTIVATION, ActivityLog.ACCOUNT_ACTIVATION]
PASSWORD_ACTIONS = [ActivityLog.PASSWORD_CHANGE, ActivityLog.PASSWORD_RESET]


class PlatformActivityView(generics.ListAPIView):
    """
    GET /api/v1/auth/activity/?action=FAILED_LOGIN&search=ama&days=30&user=12
    Everyone's activity, newest first (the personal log stays at /activity-logs/).
    """
    permission_classes = [IsAdmin]

    def get_serializer_class(self):
        from .serializers import AdminActivityLogSerializer
        return AdminActivityLogSerializer

    def get_queryset(self):
        params = self.request.query_params
        queryset = ActivityLog.objects.select_related('user').order_by('-timestamp')
        if params.get('days'):
            queryset = queryset.filter(timestamp__gte=timezone.now() - timedelta(days=period_param(self.request)))
        action = params.get('action', '')
        if action == 'admin':
            queryset = queryset.filter(action__in=ADMIN_ACTIONS)
        elif action == 'password':
            queryset = queryset.filter(action__in=PASSWORD_ACTIONS)
        elif action in dict(ActivityLog.ACTION_CHOICES):
            queryset = queryset.filter(action=action)
        if params.get('user', '').isdigit():
            queryset = queryset.filter(user_id=params['user'])
        if params.get('ip'):
            queryset = queryset.filter(ip_address=params['ip'])
        search = params.get('search', '').strip()
        if search:
            queryset = queryset.filter(Q(user__email__icontains=search) | Q(user__first_name__icontains=search)
                                       | Q(user__last_name__icontains=search) | Q(ip_address__startswith=search)
                                       | Q(description__icontains=search))
        return queryset


class ActivityOverviewView(APIView):
    """
    GET /api/v1/auth/activity/overview/?days=30 -> statistics for the admin Activity log: events per day, sign-ins,
    failed sign-ins (by IP and by account), password and admin changes, devices and the most active users.
    """
    permission_classes = [IsAdmin]

    def get(self, request):
        from django.db.models import Max
        from django.db.models.functions import TruncDate
        from .serializers import device_of

        days = period_param(request)
        now, today = timezone.now(), timezone.localdate()
        start = today - timedelta(days=days - 1)
        since = timezone.make_aware(datetime.combine(start, time.min))
        before = since - timedelta(days=days)
        logs = ActivityLog.objects.filter(timestamp__gte=since)
        prev = ActivityLog.objects.filter(timestamp__gte=before, timestamp__lt=since)
        failed = logs.filter(action=ActivityLog.FAILED_LOGIN)

        def per_day(queryset):
            return dict(queryset.annotate(day=TruncDate('timestamp')).values('day').annotate(n=Count('id')).values_list('day', 'n'))

        all_day, failed_day, login_day = per_day(logs), per_day(failed), per_day(logs.filter(action=ActivityLog.LOGIN))
        series = [{'date': (start + timedelta(days=i)).isoformat(),
                   'events': all_day.get(start + timedelta(days=i), 0),
                   'logins': login_day.get(start + timedelta(days=i), 0),
                   'failed': failed_day.get(start + timedelta(days=i), 0)} for i in range(days)]

        by_action = dict(logs.values_list('action').annotate(n=Count('id')))
        devices = {'desktop': 0, 'mobile': 0, 'tablet': 0, 'unknown': 0}
        for agent in logs.filter(action=ActivityLog.LOGIN).values_list('user_agent', flat=True)[:5000]:
            devices[device_of(agent)] += 1

        failed_ips = [{'ip': row['ip_address'], 'count': row['n'], 'accounts': row['accounts'], 'last': row['last']}
                      for row in failed.exclude(ip_address__isnull=True).values('ip_address')
                      .annotate(n=Count('id'), accounts=Count('user', distinct=True), last=Max('timestamp')).order_by('-n')[:5]]
        failed_accounts = [{'user_id': row['user'], 'name': f"{row['user__first_name']} {row['user__last_name']}".strip(),
                            'email': row['user__email'], 'count': row['n'], 'last': row['last']}
                           for row in failed.values('user', 'user__first_name', 'user__last_name', 'user__email')
                           .annotate(n=Count('id'), last=Max('timestamp')).order_by('-n')[:5]]
        active = [{'user_id': row['user'], 'name': f"{row['user__first_name']} {row['user__last_name']}".strip(),
                   'email': row['user__email'], 'count': row['n']}
                  for row in logs.exclude(action=ActivityLog.FAILED_LOGIN)
                  .values('user', 'user__first_name', 'user__last_name', 'user__email').annotate(n=Count('id')).order_by('-n')[:5]]

        return Response({
            'days': days,
            'start': start.isoformat(),
            'end': today.isoformat(),
            'events': logs.count(),
            'events_prev': prev.count(),
            'logins': by_action.get(ActivityLog.LOGIN, 0),
            'logins_prev': prev.filter(action=ActivityLog.LOGIN).count(),
            'failed': by_action.get(ActivityLog.FAILED_LOGIN, 0),
            'failed_prev': prev.filter(action=ActivityLog.FAILED_LOGIN).count(),
            'unique_users': logs.exclude(action=ActivityLog.FAILED_LOGIN).values('user').distinct().count(),
            'password_events': sum(by_action.get(a, 0) for a in PASSWORD_ACTIONS),
            'admin_actions': sum(by_action.get(a, 0) for a in ADMIN_ACTIONS),
            'series': series,
            'by_action': [{'action': a, 'label': label, 'count': by_action.get(a, 0)} for a, label in ActivityLog.ACTION_CHOICES],
            'devices': [{'key': k, 'count': v} for k, v in devices.items()],
            'failed_ips': failed_ips,
            'failed_accounts': failed_accounts,
            'most_active': active,
        })


class UserDetailView(APIView):
    """GET /api/v1/auth/users/<id>/ -> profile plus recent activity.  DELETE -> delete the account and its files."""
    permission_classes = [IsAdmin]

    def get(self, request, pk):
        user = get_object_or_404(User.objects.select_related('approved_by'), pk=pk)
        activity = ActivityLog.objects.filter(user=user)[:15]
        return Response({
            'user': AdminUserSerializer(user, context={'request': request}).data,
            'activity': ActivityLogSerializer(activity, many=True).data,
            'social_accounts': list(user.social_accounts.values('provider', 'email', 'created_at')),
        })

    def delete(self, request, pk):
        user = get_object_or_404(User, pk=pk)
        if user.pk == request.user.pk:
            return Response({'detail': 'You can’t delete your own account.'}, status=status.HTTP_400_BAD_REQUEST)
        name, email = user.get_full_name() or user.email, user.email
        uploads = user_uploads(user)
        with transaction.atomic():
            user.delete()   # their applications, messages, notes and history go with the account
            # Kept on the admin's own log, since the deleted user's log goes with them.
            log_activity(request.user, ActivityLog.ACCOUNT_DEACTIVATION, f'Deleted the account of {name} ({email})', request)
        for field in uploads:   # files last, once the rows are gone for good
            try:
                field.delete(save=False)
            except OSError:
                pass
        return Response(status=status.HTTP_204_NO_CONTENT)


def user_uploads(user):
    """Every uploaded file that belongs to a user: profile picture, application files and chat attachments."""
    from portal.models import ApplicationDocument, Message, ResultFile, ServiceRequest

    fields = [user.profile_picture] if user.profile_picture else []
    fields += [d.file for d in ApplicationDocument.objects.filter(application__student=user).exclude(file='')]
    fields += [r.file for r in ResultFile.objects.filter(application__student=user)]
    fields += [s.receipt for s in ServiceRequest.objects.filter(application__student=user).exclude(receipt='')]
    fields += [m.attachment for m in Message.objects.filter(conversation__user=user).exclude(attachment='')]
    return fields


def apply_action(admin, user, action, request, role=None, reason=''):
    """
    Run one admin action on one user. Returns an error message, or None on success.
    Emails are sent after the database change commits.
    """
    if user.pk == admin.pk and action in ('reject', 'suspend', 'set_role'):
        return 'You can’t change the status or role of your own account.'

    now = timezone.now()
    if action == 'approve':
        if user.approval_status == User.APPROVED:
            return None
        user.approval_status, user.approved_at, user.approved_by, user.rejection_reason = User.APPROVED, now, admin, ''
        user.save(update_fields=['approval_status', 'approved_at', 'approved_by', 'rejection_reason', 'updated_at'])
        log_activity(user, ActivityLog.ACCOUNT_APPROVED, f'Approved by {admin.get_full_name()}', request)
        transaction.on_commit(lambda: send_approved_email(user))

    elif action == 'reject':
        user.approval_status, user.approved_at, user.approved_by, user.rejection_reason = User.REJECTED, None, admin, reason
        user.save(update_fields=['approval_status', 'approved_at', 'approved_by', 'rejection_reason', 'updated_at'])
        sign_out_everywhere(user)
        log_activity(user, ActivityLog.ACCOUNT_REJECTED, f'Rejected by {admin.get_full_name()}' + (f': {reason}' if reason else ''), request)
        transaction.on_commit(lambda: send_rejected_email(user, reason))

    elif action == 'suspend':
        if not user.is_active:
            return None
        user.is_active = False
        user.save(update_fields=['is_active', 'updated_at'])
        sign_out_everywhere(user)
        log_activity(user, ActivityLog.ACCOUNT_DEACTIVATION, f'Disabled by {admin.get_full_name()}', request)
        transaction.on_commit(lambda: send_suspended_email(user))

    elif action == 'activate':
        if user.is_active:
            return None
        user.is_active = True
        user.save(update_fields=['is_active', 'updated_at'])
        log_activity(user, ActivityLog.ACCOUNT_ACTIVATION, f'Enabled by {admin.get_full_name()}', request)
        transaction.on_commit(lambda: send_reactivated_email(user))

    elif action == 'set_role':
        if user.role == role:
            return None
        old = user.get_role_display()
        user.role = role
        user.save(update_fields=['role', 'updated_at'])
        sign_out_everywhere(user)  # tokens carry the role, so make them sign in again
        log_activity(user, ActivityLog.ROLE_CHANGE, f'Role changed from {old} to {user.get_role_display()} by {admin.get_full_name()}', request)
    return None


class UserActionView(APIView):
    """POST /api/v1/auth/users/<id>/action/  {action: approve|reject|suspend|activate|set_role, role?, reason?}"""
    permission_classes = [IsAdmin]

    def post(self, request, pk):
        serializer = AdminUserActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = get_object_or_404(User, pk=pk)
        with transaction.atomic():
            error = apply_action(request.user, user, request=request, **serializer.validated_data)
        if error:
            return Response({'detail': error}, status=status.HTTP_400_BAD_REQUEST)
        user.refresh_from_db()
        return Response({'user': AdminUserSerializer(user, context={'request': request}).data})


class UserBulkActionView(APIView):
    """POST /api/v1/auth/users/bulk/  {ids: [...], action, reason?}"""
    permission_classes = [IsAdmin]

    def post(self, request):
        serializer = AdminBulkActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        done, skipped = 0, []
        with transaction.atomic():
            for user in User.objects.filter(pk__in=data['ids']):
                error = apply_action(request.user, user, data['action'], request, reason=data.get('reason', ''))
                if error:
                    skipped.append({'id': user.pk, 'email': user.email, 'reason': error})
                else:
                    done += 1
        return Response({'updated': done, 'skipped': skipped})


class UserInsightsView(APIView):
    """
    GET /api/v1/auth/users/insights/?days=30   (7, 30 or 90)
    Everything the admin overview charts need, for one period and the period before it.
    """
    permission_classes = [IsAdmin]
    ALLOWED_DAYS = (7, 30, 90)

    def get(self, request):
        from django.db.models.functions import TruncDate

        try:
            days = int(request.query_params.get('days', 30))
        except ValueError:
            days = 30
        if days not in self.ALLOWED_DAYS:
            days = 30

        today = timezone.localdate()
        start = today - timedelta(days=days - 1)                 # inclusive: today is the last day
        prev_start = start - timedelta(days=days)
        window_start = timezone.make_aware(datetime.combine(start, time.min))
        prev_window_start = timezone.make_aware(datetime.combine(prev_start, time.min))

        def per_day(queryset, field):
            rows = (queryset.filter(**{f'{field}__gte': window_start})
                    .annotate(day=TruncDate(field)).values('day').annotate(n=Count('id')))
            return {row['day']: row['n'] for row in rows}

        signups = per_day(User.objects.all(), 'created_at')
        logins = per_day(ActivityLog.objects.filter(action=ActivityLog.LOGIN), 'timestamp')
        series = []
        for i in range(days):
            day = start + timedelta(days=i)
            series.append({'date': day.isoformat(), 'registrations': signups.get(day, 0), 'logins': logins.get(day, 0)})

        def count_between(queryset, field, since, until=None):
            q = queryset.filter(**{f'{field}__gte': since})
            return q.filter(**{f'{field}__lt': until}).count() if until else q.count()

        login_qs = ActivityLog.objects.filter(action=ActivityLog.LOGIN)
        totals = {
            'registrations': sum(p['registrations'] for p in series),
            'registrations_prev': count_between(User.objects.all(), 'created_at', prev_window_start, window_start),
            'logins': sum(p['logins'] for p in series),
            'logins_prev': count_between(login_qs, 'timestamp', prev_window_start, window_start),
            'approvals': count_between(ActivityLog.objects.filter(action=ActivityLog.ACCOUNT_APPROVED), 'timestamp', window_start),
        }

        status_counts = User.objects.aggregate(**{name: Count('id', filter=cond) for name, cond in STATUS_FILTERS.items()},
                                               total=Count('id'))
        by_role = dict(User.objects.values_list('role').annotate(n=Count('id')))

        # When people sign in: ISO weekday (Mon..Sun) x eight 3-hour blocks, in local time.
        from django.db.models.functions import ExtractHour, ExtractIsoWeekDay
        heatmap = [[0] * 8 for _ in range(7)]
        for row in (login_qs.filter(timestamp__gte=window_start)
                    .annotate(wd=ExtractIsoWeekDay('timestamp'), hr=ExtractHour('timestamp'))
                    .values('wd', 'hr').annotate(n=Count('id'))):
            heatmap[row['wd'] - 1][row['hr'] // 3] += row['n']

        recent = (ActivityLog.objects.select_related('user')
                  .exclude(action=ActivityLog.FAILED_LOGIN)
                  .order_by('-timestamp')[:8])
        return Response({
            'days': days,
            'start': start.isoformat(),
            'end': today.isoformat(),
            'series': series,
            'totals': totals,
            'status': {k: status_counts[k] for k in ('approved', 'pending', 'rejected', 'suspended', 'total')},
            'roles': [{'role': role, 'label': label, 'count': by_role.get(role, 0)} for role, label in User.ROLE_CHOICES],
            'login_heatmap': heatmap,
            'recent_activity': [{
                'id': log.id, 'action': log.action, 'action_display': log.get_action_display(),
                'user_id': log.user_id, 'user_name': log.user.get_full_name(), 'description': log.description,
                'timestamp': log.timestamp,
            } for log in recent],
        })
