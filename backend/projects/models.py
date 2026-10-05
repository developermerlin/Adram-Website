"""The Projects page: work ADRAM has completed, each with its own case-study page. Managed in Admin → Projects."""
from django.db import models


class Project(models.Model):
    DRAFT, PUBLISHED = 'draft', 'published'
    STATUSES = [(DRAFT, 'Draft'), (PUBLISHED, 'Published')]

    title = models.CharField(max_length=160)
    slug = models.SlugField(max_length=120, unique=True)
    summary = models.CharField(max_length=320, help_text='One or two sentences, shown on the project card.')
    status = models.CharField(max_length=10, choices=STATUSES, default=DRAFT, db_index=True)
    featured = models.BooleanField(default=False, help_text='Shown large at the top of the Projects page.')
    sort_order = models.PositiveIntegerField(default=0)

    # The facts at the top of the case study
    client = models.CharField(max_length=150, blank=True)
    client_logo = models.CharField(max_length=500, blank=True)
    sector = models.CharField(max_length=80, blank=True, help_text='e.g. Education, Health, NGO, Government, Retail.')
    location = models.CharField(max_length=120, blank=True)
    service = models.CharField(max_length=60, blank=True, help_text='The id of the ADRAM service it belongs to, e.g. web-development.')
    completed_on = models.DateField(null=True, blank=True)
    duration = models.CharField(max_length=60, blank=True, help_text='e.g. 3 months.')
    live_url = models.URLField(max_length=300, blank=True)

    cover = models.CharField(max_length=500, blank=True)
    cover_alt = models.CharField(max_length=200, blank=True)

    # The story (Markdown)
    challenge = models.TextField(max_length=8000, blank=True)
    solution = models.TextField(max_length=8000, blank=True)
    outcome = models.TextField(max_length=8000, blank=True)

    results = models.JSONField(default=list, blank=True)       # [{value: '40%', label: 'faster enrolment'}]
    gallery = models.JSONField(default=list, blank=True)       # [{src, caption}]
    technologies = models.JSONField(default=list, blank=True)  # ['React', 'Django']

    quote = models.TextField(max_length=800, blank=True)
    quote_author = models.CharField(max_length=120, blank=True)
    quote_role = models.CharField(max_length=120, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['sort_order', '-completed_on', '-created_at']

    def __str__(self):
        return self.title
