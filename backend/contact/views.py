from rest_framework import viewsets, status
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from rest_framework.views import APIView
import logging

from accounts.emails import send_contact_confirmation, send_contact_notification
from accounts.permissions import IsAdmin
from api.throttling import AnonRate, FormRate
from .models import ContactMessage
from .serializers import ContactMessageSerializer, ContactMessageAdminSerializer

logger = logging.getLogger(__name__)

@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([AnonRate, FormRate])
def create_contact_message(request):
    """
    Create a new contact message and send notification email
    """
    serializer = ContactMessageSerializer(data=request.data)
    
    if serializer.is_valid():
        # Save the message
        contact_message = serializer.save()
        
        # Branded emails: an alert to the team (Reply-To is the sender) and a confirmation to the sender.
        # A failed email must never lose the enquiry, which is already saved.
        for send in (send_contact_notification, send_contact_confirmation):
            try:
                send(contact_message)
            except Exception:
                logger.exception('Could not send contact email (%s) for message %s', send.__name__, contact_message.pk)

        return Response(
            {
                'success': True,
                'message': 'Your message has been sent successfully. We will contact you soon.',
                'data': serializer.data
            },
            status=status.HTTP_201_CREATED
        )
    
    return Response(
        {
            'success': False,
            'message': 'Error sending message',
            'errors': serializer.errors
        },
        status=status.HTTP_400_BAD_REQUEST
    )


class ContactMessageViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing contact messages (admin only).
    Public submissions go through create_contact_message instead.
    """
    queryset = ContactMessage.objects.all()
    serializer_class = ContactMessageAdminSerializer
    permission_classes = [IsAdmin]
    # Admins read, mark read/unread and delete; new messages only arrive through the public form.
    http_method_names = ['get', 'patch', 'delete', 'head', 'options']
    search_fields = ['name', 'email', 'subject', 'message']

    def get_queryset(self):
        """?is_read=true|false filters the inbox."""
        queryset = super().get_queryset()
        is_read = self.request.query_params.get('is_read')
        if is_read in ('true', 'false'):
            queryset = queryset.filter(is_read=is_read == 'true')
        return queryset



class EngagementStatsView(APIView):
    """
    GET /api/contact/stats/?days=30   (7, 30 or 90)
    Enquiries (the contact form and partnership requests) and in-site notifications, for the admin Overview:
    the period, the period before it, a per-day series, and the breakdowns the charts need.
    """
    permission_classes = [IsAdmin]
    ALLOWED_DAYS = (7, 30, 90)

    def get(self, request):
        from datetime import datetime, time, timedelta
        from django.contrib.auth import get_user_model
        from django.db.models import Count, Min
        from django.db.models.functions import ExtractHour, ExtractIsoWeekDay, Lower, Trim, TruncDate
        from django.utils import timezone
        from lms.models import Notification
        from partners.models import PartnerApplication

        try:
            days = int(request.query_params.get('days', 30))
        except ValueError:
            days = 30
        days = days if days in self.ALLOWED_DAYS else 30
        today = timezone.localdate()
        start = today - timedelta(days=days - 1)  # inclusive: today is the last day
        since = timezone.make_aware(datetime.combine(start, time.min))
        prev_since = timezone.make_aware(datetime.combine(start - timedelta(days=days), time.min))

        def per_day(qs, **extra):
            rows = qs.filter(created_at__gte=since, **extra).annotate(day=TruncDate('created_at')).values('day').annotate(n=Count('id'))
            return {r['day']: r['n'] for r in rows}

        contact, partners, notes = ContactMessage.objects.all(), PartnerApplication.objects.all(), Notification.objects.all()
        c_day, p_day, n_day, r_day = per_day(contact), per_day(partners), per_day(notes), per_day(notes, is_read=True)
        series = []
        for i in range(days):
            d = start + timedelta(days=i)
            series.append({'date': d.isoformat(), 'contact': c_day.get(d, 0), 'partnerships': p_day.get(d, 0),
                           'enquiries': c_day.get(d, 0) + p_day.get(d, 0), 'notifications': n_day.get(d, 0),
                           'notifications_read': r_day.get(d, 0)})

        def window(qs):
            return qs.filter(created_at__gte=since).count(), qs.filter(created_at__gte=prev_since, created_at__lt=since).count()

        c_now, c_prev = window(contact)
        p_now, p_prev = window(partners)
        unread = contact.filter(is_read=False)
        read_now = contact.filter(created_at__gte=since, is_read=True).count()

        # When enquiries arrive: ISO weekday (Mon..Sun) x eight 3-hour blocks, local time (the same grid as sign-ins)
        heatmap = [[0] * 8 for _ in range(7)]
        for qs in (contact, partners):
            for r in (qs.filter(created_at__gte=since).annotate(wd=ExtractIsoWeekDay('created_at'), hr=ExtractHour('created_at'))
                      .values('wd', 'hr').annotate(n=Count('id'))):
                heatmap[r['wd'] - 1][r['hr'] // 3] += r['n']

        subjects = (contact.filter(created_at__gte=since).annotate(s=Lower(Trim('subject'))).values('s')
                    .annotate(n=Count('id'), label=Min('subject')).order_by('-n', 's')[:6])
        p_status = dict(partners.values_list('status').annotate(n=Count('id')))

        n_now, n_prev = window(notes)
        period_notes = notes.filter(created_at__gte=since)
        n_read = period_notes.filter(is_read=True).count()
        kinds = dict(Notification.KINDS)
        by_kind = period_notes.values('kind').annotate(n=Count('id')).order_by('-n', 'kind')[:8]
        User = get_user_model()
        roles = dict(User.ROLE_CHOICES)
        by_role = period_notes.values('user__role').annotate(n=Count('id'), people=Count('user', distinct=True)).order_by('-n')

        return Response({
            'days': days, 'start': start.isoformat(), 'end': today.isoformat(), 'series': series,
            'enquiries': {
                'total': c_now + p_now, 'total_prev': c_prev + p_prev,
                'contact': c_now, 'contact_prev': c_prev, 'partnerships': p_now, 'partnerships_prev': p_prev,
                'unread': unread.count(), 'oldest_unread': unread.aggregate(t=Min('created_at'))['t'],
                'read_rate': round(read_now / c_now * 100) if c_now else None,
                'all_time': contact.count() + partners.count(),
                'partnerships_new': p_status.get(PartnerApplication.NEW, 0),
                'partnership_status': [{'key': k, 'label': label, 'count': p_status.get(k, 0)} for k, label in PartnerApplication.STATUSES],
                'top_subjects': [{'label': (s['label'] or '').strip() or '(no subject)', 'count': s['n']} for s in subjects],
                'heatmap': heatmap,
            },
            'notifications': {
                'sent': n_now, 'sent_prev': n_prev, 'read': n_read,
                'read_rate': round(n_read / n_now * 100) if n_now else None,
                'recipients': period_notes.values('user').distinct().count(),
                'unread_total': notes.filter(is_read=False).count(),
                'admin_unread': notes.filter(is_read=False, user__role=User.ADMIN).count(),
                'by_kind': [{'key': k['kind'], 'label': kinds.get(k['kind'], k['kind']), 'count': k['n']} for k in by_kind],
                'by_role': [{'key': r['user__role'] or 'unknown', 'label': roles.get(r['user__role'], 'Unknown'), 'count': r['n'], 'people': r['people']}
                            for r in by_role],
            },
        })
