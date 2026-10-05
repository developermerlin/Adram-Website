from django.conf import settings
from django.db import models

# The pages whose content the admin can edit. `site` holds details used across the whole website
# (contact details, social links, opening hours). Add a slug here when a page becomes editable.
CONTENT_PAGES = ('site', 'home', 'about', 'team', 'services', 'courses', 'scholarships', 'contact', 'navigation', 'other', 'accounts', 'interface', 'blog', 'partners', 'store', 'projects')


class PageContent(models.Model):
    """
    What the admin has changed on one page, as JSON. The website keeps its built-in wording in code and
    lays these edits on top, so a page with no row (or a blank field) simply shows the original text.
    """
    slug = models.SlugField(max_length=40, unique=True)
    data = models.JSONField(default=dict, blank=True)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')

    class Meta:
        ordering = ['slug']
        verbose_name = 'page content'
        verbose_name_plural = 'page content'

    def __str__(self):
        return self.slug


class PageRevision(models.Model):
    """One entry in a page's change history: what the page looked like after a save, a reset or a restore."""
    SAVED, RESET, RESTORED = 'saved', 'reset', 'restored'
    ACTIONS = [(SAVED, 'Saved'), (RESET, 'Reset to original'), (RESTORED, 'Restored')]
    KEEP = 30  # newest revisions kept per page

    slug = models.SlugField(max_length=40, db_index=True)
    data = models.JSONField(default=dict, blank=True)
    action = models.CharField(max_length=10, choices=ACTIONS, default=SAVED)
    created_at = models.DateTimeField(auto_now_add=True)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')

    class Meta:
        ordering = ['-created_at', '-id']

    def __str__(self):
        return f'{self.slug} {self.action} {self.created_at:%Y-%m-%d %H:%M}'

    @classmethod
    def record(cls, slug, data, action, user):
        """Add an entry and drop the oldest ones beyond KEEP."""
        cls.objects.create(slug=slug, data=data or {}, action=action, user=user)
        stale = cls.objects.filter(slug=slug).values_list('pk', flat=True)[cls.KEEP:]
        cls.objects.filter(pk__in=list(stale)).delete()


class SiteImage(models.Model):
    """A picture uploaded from the admin portal for use on the website."""
    image = models.ImageField(upload_to='site/%Y/%m/')
    name = models.CharField(max_length=150, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')

    class Meta:
        ordering = ['-created_at', '-id']

    def __str__(self):
        return self.name or self.image.name


class SiteLock(models.Model):
    """One row: when locked, visitors can look at the website but not use it; only administrators can act (cms/lock.py)."""
    locked = models.BooleanField(default=False)
    message = models.CharField(max_length=300, blank=True)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')

    class Meta:
        verbose_name = verbose_name_plural = 'website lock'

    @classmethod
    def load(cls):
        return cls.objects.first() or cls.objects.create()
