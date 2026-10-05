"""The website newsletter: people who signed up in the footer (no account needed), the issues sent to them, and the form's settings."""
import secrets

from django.conf import settings
from django.db import models


def new_token():
    return secrets.token_urlsafe(24)


class Subscriber(models.Model):
    PENDING, SUBSCRIBED, UNSUBSCRIBED = 'pending', 'subscribed', 'unsubscribed'
    STATUSES = [(PENDING, 'Waiting for confirmation'), (SUBSCRIBED, 'Subscribed'), (UNSUBSCRIBED, 'Unsubscribed')]
    FOOTER, ADMIN, IMPORT = 'footer', 'admin', 'import'
    SOURCES = [(FOOTER, 'Website footer'), (ADMIN, 'Added by an administrator'), (IMPORT, 'Imported')]

    email = models.EmailField(unique=True)
    name = models.CharField(max_length=120, blank=True)
    status = models.CharField(max_length=12, choices=STATUSES, default=PENDING, db_index=True)
    source = models.CharField(max_length=10, choices=SOURCES, default=FOOTER)
    token = models.CharField(max_length=40, unique=True, default=new_token)  # confirm and unsubscribe links
    created_at = models.DateTimeField(auto_now_add=True)
    confirmed_at = models.DateTimeField(null=True, blank=True)
    unsubscribed_at = models.DateTimeField(null=True, blank=True)
    confirmation_sent_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return self.email


class Issue(models.Model):
    """One newsletter email."""
    DRAFT, SENDING, SENT = 'draft', 'sending', 'sent'
    STATUSES = [(DRAFT, 'Draft'), (SENDING, 'Sending'), (SENT, 'Sent')]

    subject = models.CharField(max_length=150)
    preheader = models.CharField(max_length=150, blank=True, help_text='The grey preview line in the inbox.')
    title = models.CharField(max_length=150, blank=True, help_text='The heading inside the email (defaults to the subject).')
    body = models.TextField(max_length=10000, help_text='Paragraphs separated by a blank line.')
    image = models.CharField(max_length=500, blank=True, help_text='A picture at the top (https:// or a site image).')
    button_label = models.CharField(max_length=60, blank=True)
    button_link = models.CharField(max_length=300, blank=True)
    status = models.CharField(max_length=10, choices=STATUSES, default=DRAFT)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    sent_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return self.subject


class Delivery(models.Model):
    issue = models.ForeignKey(Issue, on_delete=models.CASCADE, related_name='deliveries')
    subscriber = models.ForeignKey(Subscriber, on_delete=models.CASCADE, related_name='deliveries')
    sent_at = models.DateTimeField(null=True, blank=True)
    failed = models.BooleanField(default=False)
    clicked_at = models.DateTimeField(null=True, blank=True)
    unsubscribed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        unique_together = [('issue', 'subscriber')]


class NewsletterSettings(models.Model):
    """One row, edited in Admin → Newsletter → Settings."""
    enabled = models.BooleanField(default=True, help_text='Show the sign-up form in the website footer.')
    heading = models.CharField(max_length=80, default='Subscribe to our newsletter')
    text = models.CharField(max_length=240, default='News about our services, new training programmes and scholarship opportunities. No spam, unsubscribe at any time.')
    button_label = models.CharField(max_length=30, default='Subscribe')
    placeholder = models.CharField(max_length=60, default='Your email address')
    double_opt_in = models.BooleanField(default=True, help_text='Ask new subscribers to confirm their email address first.')
    welcome_email = models.BooleanField(default=True, help_text='Send a short welcome email once someone is subscribed.')
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = verbose_name_plural = 'newsletter settings'

    @classmethod
    def load(cls):
        return cls.objects.first() or cls.objects.create()
