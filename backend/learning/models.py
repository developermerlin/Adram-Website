"""
The Learning hub: free study material organised from zero to hero, written and managed in Admin → Learning.

  Field   a subject area, e.g. Networking
  Topic   a group of notes at one level of a field, e.g. "IP addressing & subnetting" (Foundations)
  Note    the material itself: a note, a research note, a hands-on lab or a cheat sheet, with resources
  NoteProgress  which notes a signed-in learner has finished
"""
from django.conf import settings
from django.db import models

# The five stages every field runs through. Their names are shown from Site content (frontend), so only numbers are stored.
LEVELS = [(1, 'Zero'), (2, 'Foundations'), (3, 'Intermediate'), (4, 'Advanced'), (5, 'Hero')]


class Field(models.Model):
    name = models.CharField(max_length=80)
    slug = models.SlugField(max_length=80, unique=True)
    icon = models.CharField(max_length=40, blank=True, default='network', help_text='A brand icon name, e.g. network.')
    summary = models.CharField(max_length=300, blank=True, help_text='One or two sentences, shown on the field card.')
    description = models.TextField(max_length=6000, blank=True, help_text='Markdown: who it is for and what learners will be able to do.')
    cover = models.CharField(max_length=500, blank=True)
    is_published = models.BooleanField(default=False, db_index=True)
    sort_order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['sort_order', 'name']

    def __str__(self):
        return self.name


class Topic(models.Model):
    field = models.ForeignKey(Field, on_delete=models.CASCADE, related_name='topics')
    level = models.PositiveSmallIntegerField(choices=LEVELS, default=1)
    title = models.CharField(max_length=120)
    summary = models.CharField(max_length=300, blank=True)
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ['level', 'sort_order', 'id']

    def __str__(self):
        return f'{self.field.name}: {self.title}'


class Note(models.Model):
    NOTE, RESEARCH, LAB, CHEATSHEET = 'note', 'research', 'lab', 'cheatsheet'
    KINDS = [(NOTE, 'Note'), (RESEARCH, 'Research note'), (LAB, 'Hands-on lab'), (CHEATSHEET, 'Cheat sheet')]

    topic = models.ForeignKey(Topic, on_delete=models.CASCADE, related_name='notes')
    field = models.ForeignKey(Field, on_delete=models.CASCADE, related_name='notes')  # always the topic's field (kept in step on save)
    title = models.CharField(max_length=160)
    slug = models.SlugField(max_length=120)
    kind = models.CharField(max_length=12, choices=KINDS, default=NOTE)
    summary = models.CharField(max_length=300, blank=True)
    objectives = models.JSONField(default=list, blank=True)  # ['Explain what an IP address is', ...]
    body = models.TextField(max_length=60000, blank=True)    # Markdown
    resources = models.JSONField(default=list, blank=True)   # [{kind: link|video|file, title, url}]
    is_published = models.BooleanField(default=False, db_index=True)
    sort_order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['sort_order', 'id']
        constraints = [models.UniqueConstraint(fields=['field', 'slug'], name='learning_note_slug_per_field')]

    def __str__(self):
        return self.title

    def save(self, *args, **kwargs):
        self.field_id = self.topic.field_id
        super().save(*args, **kwargs)

    @property
    def minutes(self):
        """Reading time: about 200 words a minute, at least one minute."""
        return max(1, round(len(self.body.split()) / 200))


class NoteProgress(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='learning_progress')
    note = models.ForeignKey(Note, on_delete=models.CASCADE, related_name='progress')
    completed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['user', 'note'], name='learning_progress_once')]
