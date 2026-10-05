"""The Partners page: organisations ADRAM works with (grouped, with logos and quotes) and applications to become one."""
from django.db import models


class PartnerGroup(models.Model):
    """A section of the logo wall, e.g. "Technology partners" or "Education partners"."""
    name = models.CharField(max_length=80, unique=True)
    description = models.CharField(max_length=240, blank=True)
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ['sort_order', 'name']

    def __str__(self):
        return self.name


class Partner(models.Model):
    name = models.CharField(max_length=120)
    logo = models.CharField(max_length=500, blank=True, help_text='An uploaded image (/media/...) or a full https:// address.')
    website = models.URLField(max_length=300, blank=True)
    group = models.ForeignKey(PartnerGroup, null=True, blank=True, on_delete=models.SET_NULL, related_name='partners')
    description = models.CharField(max_length=400, blank=True, help_text='One or two sentences about the partnership.')
    featured = models.BooleanField(default=False, help_text='Shown in the spotlight with its quote.')
    quote = models.TextField(max_length=600, blank=True)
    quote_author = models.CharField(max_length=120, blank=True)
    quote_role = models.CharField(max_length=120, blank=True)
    since = models.PositiveIntegerField(null=True, blank=True, help_text='The year the partnership started.')
    visible = models.BooleanField(default=True)
    sort_order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['sort_order', 'name']

    def __str__(self):
        return self.name


class PartnerApplication(models.Model):
    NEW, CONTACTED, APPROVED, DECLINED = 'new', 'contacted', 'approved', 'declined'
    STATUSES = [(NEW, 'New'), (CONTACTED, 'Contacted'), (APPROVED, 'Approved'), (DECLINED, 'Declined')]

    organisation = models.CharField(max_length=150)
    contact_name = models.CharField(max_length=120)
    email = models.EmailField()
    phone = models.CharField(max_length=40, blank=True)
    website = models.CharField(max_length=300, blank=True)
    partnership_type = models.CharField(max_length=80, blank=True)
    message = models.TextField(max_length=3000)
    status = models.CharField(max_length=10, choices=STATUSES, default=NEW, db_index=True)
    notes = models.TextField(max_length=3000, blank=True, help_text='Private notes for the team.')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.organisation} ({self.get_status_display()})'
