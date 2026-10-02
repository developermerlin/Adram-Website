from django.core.management.base import BaseCommand

from lms.assignments import send_reminders
from lms.premium import remind_instalments


class Command(BaseCommand):
    help = 'Remind students of assignments due within a day and payment-plan parts due within 3 days (run it hourly). Each reminder is sent once.'

    def handle(self, *args, **options):
        self.stdout.write(f'{send_reminders()} assignment and {remind_instalments()} payment reminder(s) sent.')
