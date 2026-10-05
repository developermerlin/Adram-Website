"""
The ADRAM team: one portfolio profile per team member account.

A profile is created automatically when an account gets the "Team member" role (see signals.py); the admin can also
add any staff account to the team. Administrators control every profile from Admin → Team; a team member can also
edit their own. Only published profiles appear on the public Team page and at /team/<slug>.

Lists (skills, experience, education, ...) are stored as JSON so the admin can add, remove and reorder entries freely.
Pictures are addresses from the media library (/media/...), like the rest of the site's content.
"""
import os
import uuid

from django.conf import settings
from django.db import models
from django.utils.text import slugify


def cv_upload_to(instance, filename):
    ext = os.path.splitext(filename)[1].lower()[:10]
    return f'cvs/{uuid.uuid4().hex}{ext}'  # private storage; never the original file name on disk


def _private_storage():
    from portal.models import private_storage
    return private_storage


class TeamProfile(models.Model):
    PUBLIC, MEMBERS, HIDDEN = 'public', 'members', 'hidden'
    CV_VISIBILITY = [(PUBLIC, 'Everyone'), (MEMBERS, 'Signed-in users only'), (HIDDEN, 'Nobody (hidden)')]

    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='team_profile')
    slug = models.SlugField(max_length=80, unique=True, help_text='The page address: /team/<slug>.')
    # Who they are
    display_name = models.CharField(max_length=150, blank=True, help_text='Empty = the account name.')
    job_title = models.CharField(max_length=120, blank=True)
    department = models.CharField(max_length=120, blank=True)
    location = models.CharField(max_length=120, blank=True)
    headline = models.CharField(max_length=220, blank=True, help_text='One sentence under the name.')
    photo = models.CharField(max_length=500, blank=True)
    cover = models.CharField(max_length=500, blank=True)
    bio = models.TextField(blank=True, max_length=8000, help_text='The full introduction (simple formatting allowed).')
    years_experience = models.PositiveSmallIntegerField(null=True, blank=True)
    # Lists the admin edits
    skills = models.JSONField(default=list, blank=True)          # [{name, level 0-100}]
    expertise = models.JSONField(default=list, blank=True)       # ["Cloud networks", ...]
    languages = models.JSONField(default=list, blank=True)       # ["English", "Krio", ...]
    experience = models.JSONField(default=list, blank=True)      # [{title, organisation, location, start, end, current, description}]
    education = models.JSONField(default=list, blank=True)       # [{qualification, institution, start, end, description}]
    certifications = models.JSONField(default=list, blank=True)  # [{name, issuer, year, url}]
    projects = models.JSONField(default=list, blank=True)        # [{title, description, image, url, tags}]
    achievements = models.JSONField(default=list, blank=True)    # [{title, year, description}]
    testimonials = models.JSONField(default=list, blank=True)    # [{quote, author, role}]
    socials = models.JSONField(default=dict, blank=True)         # {linkedin, x, facebook, instagram, github, whatsapp, website}
    public_email = models.EmailField(blank=True)
    public_phone = models.CharField(max_length=40, blank=True)
    # CV: an uploaded PDF, and/or the printable CV made from this profile
    cv_file = models.FileField(upload_to=cv_upload_to, storage=_private_storage, blank=True)
    cv_name = models.CharField(max_length=200, blank=True)
    cv_visibility = models.CharField(max_length=10, choices=CV_VISIBILITY, default=PUBLIC)
    generated_cv = models.BooleanField(default=True, help_text='Offer the printable CV made from this profile.')
    # Publishing
    allow_chat = models.BooleanField(default=True, help_text='Signed-in users can message this person.')
    is_published = models.BooleanField(default=False, help_text='Shown on the Team page.')
    featured = models.BooleanField(default=False, help_text='Shown first, in a larger card.')
    sort_order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-featured', 'sort_order', 'id']

    def __str__(self):
        return self.name

    @property
    def name(self):
        return self.display_name or self.user.get_full_name() or self.user.email

    @classmethod
    def unique_slug(cls, text, exclude_pk=None):
        base = slugify(text)[:70] or 'member'
        slug, n = base, 2
        while cls.objects.filter(slug=slug).exclude(pk=exclude_pk).exists():
            slug, n = f'{base}-{n}', n + 1
        return slug

    @classmethod
    def for_user(cls, user):
        """The profile of `user`, created if they don't have one yet (unpublished until the admin checks it)."""
        profile = cls.objects.filter(user=user).first()
        if profile:
            return profile, False
        last = cls.objects.order_by('-sort_order').values_list('sort_order', flat=True).first() or 0
        return cls.objects.create(user=user, slug=cls.unique_slug(user.get_full_name() or user.email.split('@')[0]),
                                  public_email='', sort_order=last + 1), True
