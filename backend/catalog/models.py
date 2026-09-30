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


class Category(models.Model):
    """A subject area courses are filed under. A category with a parent is a subcategory (one level deep)."""
    name = models.CharField(max_length=80)
    slug = models.SlugField(max_length=90, unique=True)
    parent = models.ForeignKey('self', null=True, blank=True, on_delete=models.CASCADE, related_name='children')
    description = models.TextField(blank=True)
    icon = models.CharField(max_length=30, blank=True, help_text='A brand icon name, like the course icons.')
    image = models.CharField(max_length=300, blank=True)
    sort_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['sort_order', 'name']
        verbose_name_plural = 'categories'

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = unique_slug(Category, self.name, self.pk)
        super().save(*args, **kwargs)

    def __str__(self):
        return f'{self.parent.name} / {self.name}' if self.parent_id else self.name


class Course(CatalogItem):
    # Review workflow: an instructor's draft is submitted, reviewed and approved by an administrator, then published.
    DRAFT, SUBMITTED, IN_REVIEW, CHANGES, REJECTED, APPROVED, PUBLISHED = (
        'draft', 'submitted', 'in_review', 'changes_requested', 'rejected', 'approved', 'published')
    STATUSES = [
        (DRAFT, 'Draft'), (SUBMITTED, 'Submitted for review'), (IN_REVIEW, 'Under review'),
        (CHANGES, 'Changes requested'), (REJECTED, 'Rejected'), (APPROVED, 'Approved'), (PUBLISHED, 'Published'),
    ]

    title = models.CharField(max_length=200)
    subtitle = models.CharField(max_length=250, blank=True, help_text='One line under the title on the course page.')
    icon = models.CharField(max_length=30, choices=[(i, i) for i in COURSE_ICONS], default='laptop')
    topics = models.JSONField(default=list, help_text='Short topic tags shown on the card.')
    duration = models.CharField(max_length=100, blank=True, help_text='e.g. “8 weeks, evenings”')
    fee = models.CharField(max_length=100, blank=True, help_text='e.g. “Le 2,500” — leave blank to ask people to enquire.')
    price = models.DecimalField('price (NLe)', max_digits=12, decimal_places=2, null=True, blank=True,
                                help_text='Students pay this to enrol. Leave empty (or 0) for a free course.')
    next_intake = models.DateField(null=True, blank=True)

    # ---- the course page (what a student reads before enrolling)
    LEVELS = [('all', 'All levels'), ('beginner', 'Beginner'), ('intermediate', 'Intermediate'), ('advanced', 'Advanced')]
    OPEN, APPROVAL = 'open', 'approval'
    ENROLLMENT_MODES = [(OPEN, 'Open: students get instant access'), (APPROVAL, 'By approval: ADRAM confirms each place')]

    description = models.TextField(blank=True, help_text='The full description shown on the course page. A blank line starts a new paragraph.')
    learn_points = models.JSONField(default=list, blank=True, help_text='“What you’ll learn” bullet points.')
    requirements = models.JSONField(default=list, blank=True, help_text='What students need before they start.')
    audience = models.JSONField(default=list, blank=True, help_text='Who this course is for.')
    level = models.CharField(max_length=15, choices=LEVELS, default='all')
    language = models.CharField(max_length=40, default='English', blank=True)
    thumbnail = models.CharField(max_length=300, blank=True, help_text='The course picture (an uploaded image or a website photo).')
    promo_video_url = models.URLField(max_length=500, blank=True, help_text='A YouTube or Vimeo link to a short trailer.')
    instructor_name = models.CharField(max_length=120, blank=True)
    instructor_title = models.CharField(max_length=160, blank=True)
    instructor_bio = models.TextField(blank=True)
    instructor_photo = models.CharField(max_length=300, blank=True)
    enrollment_mode = models.CharField(max_length=10, choices=ENROLLMENT_MODES, default=APPROVAL)

    # ---- marketplace
    category = models.ForeignKey(Category, null=True, blank=True, on_delete=models.SET_NULL, related_name='courses')
    subcategory = models.ForeignKey(Category, null=True, blank=True, on_delete=models.SET_NULL, related_name='sub_courses')
    instructor = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
                                   related_name='taught_courses', help_text='The instructor account that owns this course.')
    discount_price = models.DecimalField('sale price (NLe)', max_digits=12, decimal_places=2, null=True, blank=True,
                                         help_text='Optional reduced price; used instead of the price while it is lower.')
    currency = models.CharField(max_length=8, default='NLe')
    # ---- how the course card looks (set by administrators)
    HIGHLIGHTS = [('', 'None'), ('bestseller', 'Bestseller'), ('highest_rated', 'Highest rated'), ('hot_new', 'Hot & new'), ('new', 'New')]
    is_premium = models.BooleanField(default=False, help_text='Shows the "Premium" badge on the course card.')
    highlight = models.CharField(max_length=20, choices=HIGHLIGHTS, blank=True, default='', help_text='A label on the card, e.g. Bestseller.')
    format_label = models.CharField(max_length=30, default='Course', blank=True, help_text='The type shown on the card: Course, Bootcamp, Workshop…')
    faqs = models.JSONField(default=list, blank=True, help_text='[{question, answer}] shown on the course page.')
    status = models.CharField(max_length=20, choices=STATUSES, default=DRAFT, db_index=True)
    review_note = models.TextField(blank=True, help_text='Feedback from the reviewer to the instructor.')
    submitted_at = models.DateTimeField(null=True, blank=True)
    published_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['sort_order', 'title']

    def save(self, *args, **kwargs):
        # `is_published` decides what the website shows; the review status follows it.
        from django.utils import timezone
        if self.is_published:
            self.status = self.PUBLISHED
            self.published_at = self.published_at or timezone.now()
        elif self.status == self.PUBLISHED:
            self.status = self.APPROVED if self.instructor_id else self.DRAFT
        super().save(*args, **kwargs)

    @property
    def sale_price(self):
        """What a student pays today (before coupons): the sale price while it is lower than the price."""
        price = self.price or 0
        if self.discount_price is not None and 0 <= self.discount_price < price:
            return self.discount_price
        return price

    @property
    def is_free(self):
        return not self.sale_price or self.sale_price <= 0

    @property
    def display_name(self):
        return self.title

    def __str__(self):
        return self.title
