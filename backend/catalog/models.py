"""
Content shown on the public website and edited from the admin portal:
international scholarships (/scholarships) and training programmes (/courses).
"""
from django.conf import settings
from django.db import models
from django.utils.text import slugify

# Study destinations. The frontend has the matching names and flags (frontend/src/data/scholarships.js),
# so add a code in both places.
DESTINATION_CHOICES = [
    ('gb', 'United Kingdom'),
    ('us', 'United States'),
    ('ca', 'Canada'),
    ('de', 'Germany'),
    ('eu', 'Europe (multi-country)'),
    ('nl', 'Netherlands'),
    ('cn', 'China'),
    ('tr', 'Türkiye'),
    ('in', 'India'),
    ('africa', 'Africa & worldwide'),
]
LEVELS = ['Undergraduate', 'Masters', 'PhD']

# ADRAM brand icons a course can use (names from frontend/src/components/brand/BrandIcon.jsx).
COURSE_ICONS = [
    'ai', 'terminal', 'web', 'architecture', 'mobile', 'briefcase', 'software', 'network', 'laptop',
    'server', 'shield', 'design', 'build', 'layers', 'innovation', 'classroom', 'certificate', 'consult',
    'transform', 'growth', 'finance', 'people', 'community', 'graduate', 'flask', 'globe',
]


class CatalogItem(models.Model):
    """Fields shared by everything the admin publishes to the website."""
    slug = models.SlugField(max_length=80, unique=True, help_text='Used in the page address; changing it breaks old links.')
    summary = models.TextField()
    is_published = models.BooleanField(default=False, help_text='Only published items appear on the website.')
    sort_order = models.PositiveIntegerField(default=0, help_text='Lower numbers are listed first.')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')

    class Meta:
        abstract = True

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = unique_slug(type(self), self.display_name, self.pk)
        super().save(*args, **kwargs)


def unique_slug(model, text, pk=None):
    base = slugify(text)[:70] or 'item'
    slug, n = base, 2
    while model.objects.filter(slug=slug).exclude(pk=pk).exists():
        slug, n = f'{base}-{n}', n + 1
    return slug


class Scholarship(CatalogItem):
    FULL, PARTIAL = 'full', 'partial'
    FUNDING_CHOICES = [(FULL, 'Fully funded'), (PARTIAL, 'Partial funding')]

    name = models.CharField(max_length=200)
    provider = models.CharField(max_length=255)
    country = models.CharField('destination', max_length=10, choices=DESTINATION_CHOICES)
    levels = models.JSONField(default=list, help_text=f'Any of: {", ".join(LEVELS)}')
    funding = models.CharField(max_length=10, choices=FUNDING_CHOICES, default=FULL)
    duration = models.CharField(max_length=200, blank=True)
    fields = models.CharField('fields of study', max_length=255, blank=True)
    application_window = models.CharField(max_length=255, blank=True, help_text='e.g. “Applications typically open in August.”')
    deadline = models.DateField(null=True, blank=True, help_text='Next confirmed closing date, if known.')
    covers = models.JSONField(default=list, help_text='What the award pays for, one item per line.')
    eligibility = models.JSONField(default=list)
    steps = models.JSONField(default=list, help_text='How to apply, in order.')
    url = models.URLField('official website', max_length=500)

    # Restrictions an editor can switch on per scholarship (enforced by the public API, not just hidden).
    hide_official_link = models.BooleanField(default=False, help_text='Don’t show the provider’s website; students go through ADRAM instead.')
    members_only = models.BooleanField('sign-in to view details', default=False,
                                       help_text='Visitors see the summary; eligibility, steps and the official link need a signed-in account.')

    # Key dates, in order: [{"label": "Applications open", "date": "2026-08-05", "text": ""}, ...].
    # `date` (YYYY-MM-DD) when confirmed, otherwise `text` such as "Typically February".
    timeline = models.JSONField(default=list, blank=True)

    # "ADRAM applies for you": what students who show interest are offered for this scholarship.
    service_enabled = models.BooleanField('ADRAM application service', default=True)
    service_fee = models.CharField(max_length=100, blank=True, help_text='e.g. “Free” or “NLe 1,500”.')
    service_includes = models.JSONField(default=list, blank=True, help_text='What ADRAM does for the student.')
    service_requirements = models.JSONField(default=list, blank=True,
                                            help_text='What the student must send ADRAM; becomes their documents checklist.')
    service_cutoff = models.DateField(null=True, blank=True, help_text='Date the student must send everything by.')
    service_note = models.TextField(blank=True, help_text='Instructions shown to interested students.')

    class Meta:
        ordering = ['sort_order', 'name']

    @property
    def display_name(self):
        return self.name

    def __str__(self):
        return self.name


class Course(CatalogItem):
    title = models.CharField(max_length=200)
    icon = models.CharField(max_length=30, choices=[(i, i) for i in COURSE_ICONS], default='laptop')
    topics = models.JSONField(default=list, help_text='Short topic tags shown on the card.')
    duration = models.CharField(max_length=100, blank=True, help_text='e.g. “8 weeks, evenings”')
    fee = models.CharField(max_length=100, blank=True, help_text='e.g. “Le 2,500” — leave blank to ask people to enquire.')
    next_intake = models.DateField(null=True, blank=True)

    class Meta:
        ordering = ['sort_order', 'title']

    @property
    def display_name(self):
        return self.title

    def __str__(self):
        return self.title
