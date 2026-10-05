"""Send the service agreement to every paid or awarded application that doesn't have one yet."""
from django.core.management.base import BaseCommand
from django.db import transaction

from portal.agreements import issue, without_agreement


class Command(BaseCommand):
    help = 'Send the service agreement to paid or awarded applications that have none (portal notification only; add --email to email them too).'

    def add_arguments(self, parser):
        parser.add_argument('--email', action='store_true', help='Also email each student.')
        parser.add_argument('--dry-run', action='store_true', help='Only list who would get one.')

    def handle(self, *args, email=False, dry_run=False, **options):
        apps = list(without_agreement().select_related('student'))
        for app in apps:
            self.stdout.write(f'#{app.id} {app.student.email} · {app.scholarship_name}')
            if not dry_run:
                with transaction.atomic():
                    issue(app, email=email)
        self.stdout.write(self.style.SUCCESS(f'{"Would send" if dry_run else "Sent"} {len(apps)} agreement(s).'))
