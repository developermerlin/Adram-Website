"""The website blog: articles written in Admin → Blog. The page around them (title, intro) is Site content → Blog."""
import math
import re

from django.conf import settings
from django.db import models
from django.utils import timezone
from django.utils.text import slugify


def unique_slug(model, text, exclude_pk=None, max_length=200):
    base = slugify(text)[:max_length - 6].strip('-') or 'post'
    slug, n = base, 2
    while model.objects.filter(slug=slug).exclude(pk=exclude_pk).exists():
        slug, n = f'{base}-{n}', n + 1
    return slug


class Category(models.Model):
    name = models.CharField(max_length=60, unique=True)
    slug = models.SlugField(max_length=70, unique=True)
    description = models.CharField(max_length=200, blank=True)
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ['sort_order', 'name']
        verbose_name_plural = 'categories'

    def __str__(self):
        return self.name


class PublishedManager(models.Manager):
    def get_queryset(self):
        return super().get_queryset().filter(status=Post.PUBLISHED, published_at__lte=timezone.now())


class Post(models.Model):
    DRAFT, PUBLISHED = 'draft', 'published'
    STATUSES = [(DRAFT, 'Draft'), (PUBLISHED, 'Published')]

    title = models.CharField(max_length=200)
    slug = models.SlugField(max_length=200, unique=True)
    excerpt = models.CharField(max_length=300, blank=True, help_text='One or two sentences shown on the blog page and in search results.')
    body = models.TextField(blank=True, max_length=100000, help_text='Markdown: ## heading, **bold**, *italic*, [link](url), ![alt](image), - list, > quote.')
    cover = models.CharField(max_length=500, blank=True)
    cover_alt = models.CharField(max_length=200, blank=True)
    category = models.ForeignKey(Category, null=True, blank=True, on_delete=models.SET_NULL, related_name='posts')
    tags = models.JSONField(default=list, blank=True)
    author = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='blog_posts')
    author_name = models.CharField(max_length=120, blank=True, help_text='Shown instead of the account name, e.g. "ADRAM Team".')
    author_title = models.CharField(max_length=120, blank=True, help_text='e.g. "Head of Training".')
    status = models.CharField(max_length=10, choices=STATUSES, default=DRAFT, db_index=True)
    published_at = models.DateTimeField(null=True, blank=True, db_index=True, help_text='A future date schedules the post.')
    featured = models.BooleanField(default=False)
    seo_title = models.CharField(max_length=150, blank=True)
    seo_description = models.CharField(max_length=300, blank=True)
    views = models.PositiveIntegerField(default=0)
    helpful_yes = models.PositiveIntegerField(default=0, help_text='Readers who found the article helpful.')
    helpful_no = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = models.Manager()
    live = PublishedManager()

    class Meta:
        ordering = ['-published_at', '-created_at']

    def __str__(self):
        return self.title

    @property
    def is_live(self):
        return self.status == self.PUBLISHED and self.published_at is not None and self.published_at <= timezone.now()

    @property
    def is_scheduled(self):
        return self.status == self.PUBLISHED and self.published_at is not None and self.published_at > timezone.now()

    @property
    def reading_minutes(self):
        return max(1, math.ceil(len(re.findall(r'\w+', self.body or '')) / 220))
