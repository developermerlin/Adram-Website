"""
Admin insights: active users, cohort retention, course quality scores, fraud flags and a revenue forecast.

  GET /lms/admin/insights/?days=30

"Active" on a day means any of: a signed-in request (ActiveDay, recorded once per user per day by the sign-in check),
learning (LearningDay) or signing in (ActivityLog LOGIN). Numbers are computed on request; they are meant for a
dashboard, not accounting.
"""
import statistics
from collections import defaultdict
from datetime import date, timedelta
from decimal import Decimal

from django.core.cache import cache
from django.db import IntegrityError
from django.db.models import Count, Q, Sum
from django.db.models.functions import Lower
from django.utils import timezone
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import ActivityLog, User, UserSession
from accounts.permissions import IsAdmin
from catalog.models import Course
from portal.models import TrainingEnrollment

from . import analytics
from .models import (
    ActiveDay, LearningDay, Order, OrderItem, Referral, Report, Reply, Review, Subscription, Thread,
)

LEARNING = [TrainingEnrollment.ACTIVE, TrainingEnrollment.COMPLETED]


def mark_active(user):
    """Record that the user is active today (one database write per user per day at most)."""
    if not getattr(user, 'pk', None):
        return
    today = timezone.localdate()
    key = f'active:{user.pk}:{today.isoformat()}'
    if cache.get(key):
        return
    try:
        ActiveDay.objects.get_or_create(user_id=user.pk, date=today)
    except IntegrityError:
        pass  # two requests at once: the other one wrote it
    cache.set(key, 1, 60 * 60 * 26)


def active_by_day(since):
    """{date: set(user ids)} from every activity source, since a date."""
    days = defaultdict(set)
    for uid, d in ActiveDay.objects.filter(date__gte=since).values_list('user_id', 'date'):
        days[d].add(uid)
    for uid, d in LearningDay.objects.filter(date__gte=since).filter(Q(seconds__gte=60) | Q(lessons_completed__gt=0)).values_list('user_id', 'date'):
        days[d].add(uid)
    for uid, ts in ActivityLog.objects.filter(action=ActivityLog.LOGIN, timestamp__date__gte=since, user__isnull=False).values_list('user_id', 'timestamp'):
        days[timezone.localtime(ts).date()].add(uid)
    return days


def activity(days):
    today = timezone.localdate()
    by_day = active_by_day(today - timedelta(days=max(days, 30) + 29))
    def window(end, n):
        out = set()
        for i in range(n):
            out |= by_day.get(end - timedelta(days=i), set())
        return out
    dau, wau, mau = len(by_day.get(today, set())), len(window(today, 7)), len(window(today, 30))
    last30 = [len(by_day.get(today - timedelta(days=i), set())) for i in range(30)]
    series = [{'date': d.isoformat(), 'value': len(by_day.get(d, set())), 'mau': len(window(d, 30))} for d in analytics.days_back(days)]
    return {'dau': dau, 'wau': wau, 'mau': mau,
            'stickiness': round(100 * statistics.mean(last30) / mau, 1) if mau else 0,
            'series': series}


def _month_start(d, back=0):
    y, m = d.year, d.month - back
    while m <= 0:
        y, m = y - 1, m + 12
    return date(y, m, 1)


def cohorts(months=6):
    """Students who joined each month, and the share active in each month after (0 = the month they joined)."""
    today = timezone.localdate()
    first = _month_start(today, months - 1)
    by_day = active_by_day(first)
    active_months = defaultdict(set)
    for d, users in by_day.items():
        key = (d.year, d.month)
        for uid in users:
            active_months[uid].add(key)
    rows = []
    for back in range(months - 1, -1, -1):
        start = _month_start(today, back)
        end = _month_start(today, back - 1) if back else today + timedelta(days=1)
        members = list(User.objects.filter(role=User.STUDENT, created_at__date__gte=start, created_at__date__lt=end).values_list('id', flat=True))
        cells = []
        for k in range(back + 1):
            m = _month_start(start, -k)
            kept = sum(1 for uid in members if (m.year, m.month) in active_months[uid])
            cells.append(round(100 * kept / len(members)) if members else None)
        rows.append({'month': start.strftime('%b %Y'), 'size': len(members), 'retention': cells})
    return rows


def quality():
    """A 0–100 score for each published course with students, weakest first, and what pulls it down."""
    out = []
    courses = Course.objects.filter(is_published=True)
    for c in courses:
        enrolled = TrainingEnrollment.objects.filter(course=c, status__in=LEARNING)
        n = enrolled.count()
        if not n:
            continue
        reviews = Review.objects.filter(course=c, is_hidden=False)
        rated = reviews.count()
        rating = reviews.aggregate(a=Sum('rating'))['a'] / rated if rated else None
        completed = enrolled.filter(Q(status=TrainingEnrollment.COMPLETED) | Q(certificate__isnull=False)).distinct().count()
        started = enrolled.filter(lesson_progress__last_viewed_at__isnull=False).distinct().count()
        sold = OrderItem.objects.filter(course=c, order__status__in=[Order.SUCCESSFUL, Order.REFUNDED]).count()
        refunded = OrderItem.objects.filter(course=c, order__status=Order.REFUNDED).count()
        threads = Thread.objects.filter(course=c)
        unanswered = threads.exclude(pk__in=Reply.objects.filter(Q(is_staff=True) | Q(is_instructor_answer=True) | Q(is_accepted=True)).values('thread_id')).count()
        reports = Report.objects.filter(status=Report.OPEN, target_type='course', target_id=c.id).count()
        parts = {
            'rating': (rating / 5 * 100) if rated >= 3 else 70,
            'completion': min(100, 200 * completed / n),
            'refunds': max(0, 100 - 400 * refunded / sold) if sold else 100,
            'engagement': 100 * started / n,
            'support': 100 * (1 - unanswered / threads.count()) if threads.count() else 100,
        }
        weights = {'rating': .35, 'completion': .25, 'refunds': .2, 'engagement': .1, 'support': .1}
        score = sum(parts[k] * w for k, w in weights.items()) - 10 * reports
        issues = []
        if rated >= 3 and rating < 3.5:
            issues.append(f'Low rating ({rating:.1f}★)')
        if n >= 5 and completed / n < 0.1:
            issues.append('Few students finish')
        if sold >= 3 and refunded / sold > 0.15:
            issues.append(f'{round(100 * refunded / sold)}% refunded')
        if n >= 5 and started / n < 0.5:
            issues.append('Many never start')
        if unanswered:
            issues.append(f'{unanswered} unanswered question{"s" if unanswered != 1 else ""}')
        if reports:
            issues.append(f'{reports} open report{"s" if reports != 1 else ""}')
        if n < 5:
            issues.append('Too few students to judge yet')
        out.append({'slug': c.slug, 'title': c.title, 'score': max(0, round(score)), 'students': n,
                    'rating': round(rating, 1) if rating else None, 'ratings': rated,
                    'completion': round(100 * completed / n), 'refund_rate': round(100 * refunded / sold) if sold else 0, 'issues': issues})
    return sorted(out, key=lambda r: r['score'])


def _name(user):
    return user.get_full_name() or user.email


def fraud_flags():
    flags = []
    now = timezone.now()
    # 1. the same payment reference on several orders
    dupes = (Order.objects.exclude(transaction_id='').exclude(status=Order.CANCELLED).annotate(ref=Lower('transaction_id'))
             .values('ref').annotate(n=Count('id'), people=Count('student', distinct=True)).filter(n__gt=1))
    for d in dupes[:20]:
        orders = Order.objects.annotate(ref=Lower('transaction_id')).filter(ref=d['ref']).select_related('student')
        flags.append({'kind': 'reused_reference', 'severity': 'high' if d['people'] > 1 else 'medium',
                      'title': f'Payment reference “{orders[0].transaction_id}” used on {d["n"]} orders',
                      'detail': ', '.join(f'{o.number} ({_name(o.student)}, {o.get_status_display().lower()})' for o in orders),
                      'link': '/admin/course-sales'})
    # 2. repeated failed payment proofs
    for row in (Order.objects.filter(status=Order.FAILED, created_at__gte=now - timedelta(days=30)).values('student')
                .annotate(n=Count('id')).filter(n__gte=3)[:20]):
        user = User.objects.get(pk=row['student'])
        flags.append({'kind': 'failed_payments', 'severity': 'medium', 'title': f'{_name(user)}: {row["n"]} rejected payment proofs in 30 days',
                      'detail': user.email, 'link': '/admin/course-sales'})
    # 3. repeated refunds
    for row in (Order.objects.filter(status=Order.REFUNDED, refunded_at__gte=now - timedelta(days=90)).values('student')
                .annotate(n=Count('id')).filter(n__gte=2)[:20]):
        user = User.objects.get(pk=row['student'])
        flags.append({'kind': 'refunds', 'severity': 'medium', 'title': f'{_name(user)}: {row["n"]} refunds in 90 days',
                      'detail': 'Buying, learning, then asking for money back?', 'link': '/admin/course-sales'})
    # 4. one account used from many networks (shared logins)
    ips = defaultdict(set)
    for uid, ip in UserSession.objects.filter(last_seen_at__gte=now - timedelta(days=7)).exclude(ip_address=None).values_list('user_id', 'ip_address'):
        ips[uid].add(ip)
    for uid, ip in ActivityLog.objects.filter(action=ActivityLog.LOGIN, timestamp__gte=now - timedelta(days=7)).exclude(ip_address=None).values_list('user_id', 'ip_address'):
        if uid:
            ips[uid].add(ip)
    for uid, seen in ips.items():
        if len(seen) >= 5:
            user = User.objects.filter(pk=uid).first()
            if user and user.role == User.STUDENT:
                flags.append({'kind': 'shared_account', 'severity': 'medium', 'title': f'{_name(user)} signed in from {len(seen)} networks this week',
                              'detail': 'The account may be shared. Check their devices in Users.', 'link': f'/admin/users?q={user.email}'})
    # 5. referrals from the inviter's own network
    reg_ips = {r.user_id: r.ip_address for r in ActivityLog.objects.filter(action=ActivityLog.REGISTRATION).exclude(ip_address=None)}
    inviter_ips = defaultdict(set)
    for uid, ip in ActivityLog.objects.filter(action=ActivityLog.LOGIN).exclude(ip_address=None).values_list('user_id', 'ip_address'):
        inviter_ips[uid].add(ip)
    suspicious = defaultdict(list)
    for r in Referral.objects.select_related('referrer', 'referred'):
        ip = reg_ips.get(r.referred_id)
        if ip and ip in inviter_ips.get(r.referrer_id, set()):
            suspicious[r.referrer].append(r.referred)
    for referrer, friends in suspicious.items():
        flags.append({'kind': 'self_referral', 'severity': 'high' if len(friends) > 1 else 'medium',
                      'title': f'{_name(referrer)}: {len(friends)} “friend{"s" if len(friends) != 1 else ""}” joined from their own network',
                      'detail': ', '.join(_name(f) for f in friends), 'link': '/admin/course-sales?tab=referrals'})
    order = {'high': 0, 'medium': 1}
    return sorted(flags, key=lambda f: order[f['severity']])


def forecast():
    now = timezone.now()
    today = timezone.localdate()
    paid = Order.objects.filter(status=Order.SUCCESSFUL, paid_at__isnull=False)
    daily = defaultdict(Decimal)
    for t, total in paid.filter(paid_at__date__gte=today - timedelta(days=83)).values_list('paid_at', 'total'):
        daily[timezone.localtime(t).date()] += total
    last28 = [float(daily.get(today - timedelta(days=i), 0)) for i in range(1, 29)]
    avg = statistics.mean(last28)
    spread = statistics.pstdev(last28)
    month_start = today.replace(day=1)
    mtd = float(sum(v for d, v in daily.items() if d >= month_start))
    next_month = _month_start(today, -1)
    days_left = (next_month - today).days
    weeks = []
    for w in range(11, -1, -1):
        end = today - timedelta(days=7 * w)
        weeks.append(float(sum(daily.get(end - timedelta(days=i), 0) for i in range(7))))
    xs = list(range(len(weeks)))
    mean_x, mean_y = statistics.mean(xs), statistics.mean(weeks)
    var = sum((x - mean_x) ** 2 for x in xs)
    slope = sum((x - mean_x) * (y - mean_y) for x, y in zip(xs, weeks)) / var if var else 0
    ahead = [max(0, mean_y + slope * (len(weeks) - 1 - mean_x) + slope * (k + 1)) for k in range(4)]
    # Premium renewals: plans ending in the next 30 days, at the share that renewed before
    ending = {}
    for s in Subscription.objects.filter(ends_at__gt=now).select_related('plan').order_by('user_id', '-ends_at'):
        ending.setdefault(s.user_id, s)
    due = [s for s in ending.values() if s.ends_at <= now + timedelta(days=30)]
    users_with_past = Subscription.objects.filter(ends_at__lte=now).values('user').distinct().count()
    renewed = Subscription.objects.values('user').annotate(n=Count('id')).filter(n__gt=1).count()
    rate = renewed / users_with_past if users_with_past else 0.5
    z = 1.28  # an 80% range
    return {
        'daily_average': round(avg, 2), 'month_to_date': round(mtd, 2), 'days_left_in_month': days_left,
        'month_projection': round(mtd + avg * days_left, 2),
        'month_range': [round(max(mtd, mtd + avg * days_left - z * spread * days_left ** .5), 2), round(mtd + avg * days_left + z * spread * days_left ** .5, 2)],
        'next_30': round(avg * 30, 2), 'next_30_range': [round(max(0, avg * 30 - z * spread * 30 ** .5), 2), round(avg * 30 + z * spread * 30 ** .5, 2)],
        'weekly_trend': round(100 * slope / mean_y, 1) if mean_y else 0,
        'weeks': [{'label': (today - timedelta(days=7 * (11 - i))).strftime('%d %b'), 'value': round(v, 2), 'forecast': False} for i, v in enumerate(weeks)]
                 + [{'label': (today + timedelta(days=7 * (k + 1))).strftime('%d %b'), 'value': round(v, 2), 'forecast': True} for k, v in enumerate(ahead)],
        'renewals': {'due': len(due), 'expected': round(sum(float(s.plan.price) for s in due) * rate, 2), 'rate': round(100 * rate)},
    }


class InsightsView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        days = analytics.period(request, allowed=(7, 30, 90))
        return Response({'days': days, 'activity': activity(days), 'cohorts': cohorts(), 'quality': quality(),
                         'fraud': fraud_flags(), 'forecast': forecast()})
