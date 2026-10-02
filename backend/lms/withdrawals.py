"""
Instructors asking to be paid, their tax details and sales report; administrators paying or rejecting requests.

  Instructors
  GET    /lms/instructor/withdrawals/          balance + my requests
  POST   /lms/instructor/withdrawals/          {amount, method, account, account_name, bank_name?, note?}
  DELETE /lms/instructor/withdrawals/<id>/     cancel a request that hasn't been paid
  GET/PUT /lms/instructor/tax-info/            {legal_name, tax_id, tax_address}
  GET    /lms/instructor/earnings/report/?year=  my sales as a CSV file

  Administrators
  GET    /lms/manage/withdrawals/?status=requested|paid|rejected|cancelled|all
  POST   /lms/manage/withdrawals/<id>/pay/     {reference, note?}  records the payout and tells the instructor
  POST   /lms/manage/withdrawals/<id>/reject/  {reason}
"""
import csv
from decimal import Decimal, InvalidOperation

from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsAdmin

from . import access, audit
from .commerce import earnings_summary, money
from .models import LmsSettings, Order, OrderItem, Payout, Profile, WithdrawalRequest
from .notify import notify, notify_admins

METHOD_LABELS = dict(WithdrawalRequest.METHODS)


def request_row(w, admin=False):
    row = {
        'id': w.id, 'amount': money(w.amount), 'method': w.method, 'method_label': METHOD_LABELS.get(w.method, w.method),
        'account': w.account, 'account_name': w.account_name, 'bank_name': w.bank_name, 'note': w.note,
        'status': w.status, 'status_display': w.get_status_display(), 'admin_note': w.admin_note,
        'reference': w.payout.reference if w.payout_id else '', 'created_at': w.created_at, 'decided_at': w.decided_at,
    }
    if admin:
        profile = Profile.objects.filter(user=w.instructor).first()
        row['instructor'] = {'id': w.instructor_id, 'name': w.instructor.get_full_name() or w.instructor.email, 'email': w.instructor.email,
                             'legal_name': profile.legal_name if profile else '', 'tax_id': profile.tax_id if profile else ''}
        row['balance'] = earnings_summary(w.instructor)
        row['decided_by'] = w.decided_by.get_full_name() if w.decided_by else None
    return row


def _amount(value):
    try:
        return Decimal(str(value)).quantize(Decimal('0.01'))
    except (InvalidOperation, TypeError, ValueError):
        return None


class MyWithdrawalsView(APIView):
    permission_classes = [access.IsAdminOrInstructor]

    def get(self, request):
        profile = Profile.objects.filter(user=request.user).first()
        return Response({
            'balance': earnings_summary(request.user),
            'requests': [request_row(w) for w in WithdrawalRequest.objects.filter(instructor=request.user).select_related('payout')[:50]],
            'tax_info_complete': bool(profile and profile.legal_name),
            'methods': [{'value': k, 'label': v} for k, v in WithdrawalRequest.METHODS],
        })

    def post(self, request):
        user = request.user
        data = request.data
        balance = earnings_summary(user)
        settings_row = LmsSettings.load()
        errors = {}
        amount = _amount(data.get('amount'))
        if amount is None or amount <= 0:
            errors['amount'] = 'Enter the amount you want to withdraw.'
        elif amount < settings_row.min_withdrawal:
            errors['amount'] = f'The smallest withdrawal is NLe {settings_row.min_withdrawal:,.2f}.'
        elif amount > Decimal(balance['available']):
            errors['amount'] = f'You can withdraw up to NLe {Decimal(balance["available"]):,.2f} right now.'
        if data.get('method') not in METHOD_LABELS:
            errors['method'] = 'Choose how you want to be paid.'
        for field, label in (('account', 'the phone or account number'), ('account_name', 'the name on the account')):
            if not str(data.get(field) or '').strip():
                errors[field] = f'Enter {label}.'
        if data.get('method') == 'bank' and not str(data.get('bank_name') or '').strip():
            errors['bank_name'] = 'Enter the bank’s name.'
        profile = Profile.objects.filter(user=user).first()
        if not (profile and profile.legal_name):
            errors['form'] = 'Add your tax details (at least your legal name) before your first withdrawal.'
        if WithdrawalRequest.objects.filter(instructor=user, status=WithdrawalRequest.REQUESTED).exists():
            errors['form'] = 'You already have a request waiting. Wait for it to be paid, or cancel it first.'
        if errors:
            return Response(errors, status=status.HTTP_400_BAD_REQUEST)
        w = WithdrawalRequest.objects.create(
            instructor=user, amount=amount, method=data['method'], account=str(data['account']).strip()[:120],
            account_name=str(data['account_name']).strip()[:120], bank_name=str(data.get('bank_name') or '').strip()[:120],
            note=str(data.get('note') or '').strip()[:300],
        )
        notify_admins('payment', 'Withdrawal request', f'{user.get_full_name() or user.email} asked for NLe {amount:,.2f}.',
                      '/admin/course-sales?tab=earnings')
        audit.record(request, 'withdrawal_requested', w, label=f'{user.get_full_name()}: NLe {amount}')
        return Response(request_row(w), status=status.HTTP_201_CREATED)


class MyWithdrawalDetailView(APIView):
    permission_classes = [access.IsAdminOrInstructor]

    def delete(self, request, pk):
        w = get_object_or_404(WithdrawalRequest, pk=pk, instructor=request.user)
        if w.status != WithdrawalRequest.REQUESTED:
            return Response({'detail': 'Only a request that is still waiting can be cancelled.'}, status=status.HTTP_400_BAD_REQUEST)
        w.status, w.decided_at = WithdrawalRequest.CANCELLED, timezone.now()
        w.save(update_fields=['status', 'decided_at'])
        return Response(status=status.HTTP_204_NO_CONTENT)


class TaxInfoView(APIView):
    permission_classes = [access.IsAdminOrInstructor]
    FIELDS = {'legal_name': 150, 'tax_id': 60, 'tax_address': 300}

    def get(self, request):
        profile = Profile.objects.filter(user=request.user).first()
        return Response({f: getattr(profile, f) if profile else '' for f in self.FIELDS})

    def put(self, request):
        profile, _ = Profile.objects.get_or_create(user=request.user)
        for field, limit in self.FIELDS.items():
            if field in request.data:
                setattr(profile, field, str(request.data.get(field) or '').strip()[:limit])
        profile.save()
        return Response({f: getattr(profile, f) for f in self.FIELDS})


class EarningsReportView(APIView):
    """My sales for a year as a spreadsheet (CSV): one row per course sold, with the commission and my share."""
    permission_classes = [access.IsAdminOrInstructor]

    def get(self, request):
        year = request.query_params.get('year')
        year = int(year) if year and year.isdigit() else timezone.now().year
        items = (OrderItem.objects.filter(instructor=request.user, order__status__in=[Order.SUCCESSFUL, Order.REFUNDED],
                                          order__paid_at__year=year).select_related('order').order_by('order__paid_at'))
        response = HttpResponse(content_type='text/csv; charset=utf-8')
        response['Content-Disposition'] = f'attachment; filename="adram-earnings-{year}.csv"'
        response.write('﻿')  # so Excel opens accented names correctly
        out = csv.writer(response)
        out.writerow(['Date paid', 'Order', 'Course', 'Price paid (NLe)', 'Commission %', 'Your share (NLe)', 'Status'])
        for i in items:
            out.writerow([i.order.paid_at.date().isoformat() if i.order.paid_at else '', i.order.number, i.title, money(i.amount),
                          str(i.commission_percent), money(i.instructor_share), 'Refunded' if i.order.status == Order.REFUNDED else 'Paid'])
        payouts = Payout.objects.filter(instructor=request.user, paid_at__year=year).order_by('paid_at')
        if payouts:
            out.writerow([])
            out.writerow(['Payouts'])
            out.writerow(['Date', 'Amount (NLe)', 'Method', 'Reference'])
            for p in payouts:
                out.writerow([p.paid_at.date().isoformat(), money(p.amount), p.method, p.reference])
        return response


# ---------------------------------------------------------------- administrators

class ManageWithdrawalsView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        rows = WithdrawalRequest.objects.select_related('instructor', 'payout', 'decided_by')
        wanted = request.query_params.get('status', WithdrawalRequest.REQUESTED)
        if wanted != 'all':
            rows = rows.filter(status=wanted)
        rows = rows.order_by('created_at') if wanted == WithdrawalRequest.REQUESTED else rows
        return Response({
            'waiting': WithdrawalRequest.objects.filter(status=WithdrawalRequest.REQUESTED).count(),
            'results': [request_row(w, admin=True) for w in rows[:200]],
        })


class PayWithdrawalView(APIView):
    permission_classes = [IsAdmin]

    def post(self, request, pk):
        w = get_object_or_404(WithdrawalRequest, pk=pk)
        if w.status != WithdrawalRequest.REQUESTED:
            return Response({'detail': 'This request is not waiting any more.'}, status=status.HTTP_400_BAD_REQUEST)
        reference = str(request.data.get('reference') or '').strip()[:120]
        if not reference:
            return Response({'reference': 'Enter the transfer reference or transaction ID.'}, status=status.HTTP_400_BAD_REQUEST)
        payout = Payout.objects.create(instructor=w.instructor, amount=w.amount, method=METHOD_LABELS.get(w.method, w.method),
                                       reference=reference, note=str(request.data.get('note') or '').strip()[:300] or f'Withdrawal request #{w.id}',
                                       paid_at=timezone.now(), created_by=request.user)
        w.status, w.payout, w.decided_by, w.decided_at = WithdrawalRequest.PAID, payout, request.user, timezone.now()
        w.admin_note = str(request.data.get('note') or '').strip()[:300]
        w.save()
        audit.record(request, 'withdrawal_paid', w, label=f'{w.instructor.get_full_name()}: NLe {w.amount} ({reference})')
        notify(w.instructor, 'payment', 'Your withdrawal was paid', f'NLe {w.amount:,.2f} was sent by {METHOD_LABELS.get(w.method)} (ref. {reference}).',
               '/instructor/earnings')
        return Response(request_row(w, admin=True))


class RejectWithdrawalView(APIView):
    permission_classes = [IsAdmin]

    def post(self, request, pk):
        w = get_object_or_404(WithdrawalRequest, pk=pk)
        if w.status != WithdrawalRequest.REQUESTED:
            return Response({'detail': 'This request is not waiting any more.'}, status=status.HTTP_400_BAD_REQUEST)
        reason = str(request.data.get('reason') or '').strip()[:300]
        if not reason:
            return Response({'reason': 'Tell the instructor why.'}, status=status.HTTP_400_BAD_REQUEST)
        w.status, w.admin_note, w.decided_by, w.decided_at = WithdrawalRequest.REJECTED, reason, request.user, timezone.now()
        w.save()
        audit.record(request, 'withdrawal_rejected', w, label=f'{w.instructor.get_full_name()}: NLe {w.amount}')
        notify(w.instructor, 'payment', 'Your withdrawal request wasn’t paid', reason, '/instructor/earnings')
        return Response(request_row(w, admin=True))
