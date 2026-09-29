from rest_framework import serializers

from .models import LEVELS, Course, Scholarship

LIST_FIELDS_MAX = 30


class TextListField(serializers.ListField):
    """A list of short lines (what an award covers, application steps…). Blank lines are dropped."""
    def __init__(self, line_length=300, **kwargs):
        kwargs.setdefault('child', serializers.CharField(max_length=line_length, allow_blank=True, trim_whitespace=True))
        kwargs.setdefault('max_length', LIST_FIELDS_MAX)
        super().__init__(**kwargs)

    def to_internal_value(self, data):
        return [line for line in super().to_internal_value(data) if line]


# ---------------------------------------------------------------- Public website

class TimelineEntrySerializer(serializers.Serializer):
    label = serializers.CharField(max_length=100)
    date = serializers.DateField(required=False, allow_null=True)
    text = serializers.CharField(max_length=100, required=False, allow_blank=True, default='')

    def validate(self, attrs):
        if not attrs.get('date') and not attrs.get('text', '').strip():
            raise serializers.ValidationError('Give each key date a date, or describe when it happens.')
        return attrs


SERVICE_FIELDS = ['service_enabled', 'service_fee', 'service_includes', 'service_requirements', 'service_cutoff', 'service_note']


class ScholarshipSerializer(serializers.ModelSerializer):
    """
    Restricted details are left out of the response, not just hidden in the page:
    - the official website (`url`) is only sent to signed-in users; `link_locked` tells the page to
      send visitors to the "join ADRAM" page instead. Hidden links are never sent to anyone.
    - members-only scholarships also drop eligibility and steps for visitors (`locked`).
    """
    country_name = serializers.CharField(source='get_country_display', read_only=True)
    locked = serializers.SerializerMethodField()
    link_locked = serializers.SerializerMethodField()

    class Meta:
        model = Scholarship
        fields = [
            'slug', 'name', 'provider', 'country', 'country_name', 'levels', 'funding', 'duration', 'fields',
            'application_window', 'deadline', 'summary', 'covers', 'eligibility', 'steps', 'url', 'is_published',
            'hide_official_link', 'members_only', 'locked', 'link_locked', 'timeline', *SERVICE_FIELDS,
        ]

    def _signed_in(self):
        request = self.context.get('request')
        return bool(request and request.user.is_authenticated)

    def get_locked(self, obj):
        return obj.members_only and not self._signed_in()

    def get_link_locked(self, obj):
        return not obj.hide_official_link and not self._signed_in()

    def to_representation(self, obj):
        data = super().to_representation(obj)
        if data['locked']:
            data.update(eligibility=[], steps=[])
        if obj.hide_official_link or not self._signed_in():
            data['url'] = None
        return data


class CourseSerializer(serializers.ModelSerializer):
    class Meta:
        model = Course
        fields = ['slug', 'title', 'icon', 'summary', 'topics', 'duration', 'fee', 'next_intake']


# ---------------------------------------------------------------- Admin portal

class ManageSerializerMixin(serializers.Serializer):
    """Blank slug = generated from the name; `updated_by` is always the signed-in editor."""
    slug = serializers.SlugField(max_length=80, required=False, allow_blank=True)
    updated_by_name = serializers.SerializerMethodField()

    def get_updated_by_name(self, obj):
        return obj.updated_by.get_full_name() if obj.updated_by else None

    def validate_slug(self, value):
        value = value.lower()
        taken = self.Meta.model.objects.filter(slug=value).exclude(pk=getattr(self.instance, 'pk', None))
        if value and taken.exists():
            raise serializers.ValidationError('Another item already uses this web address.')
        return value

    def save(self, **kwargs):
        return super().save(updated_by=self.context['request'].user, **kwargs)


class ScholarshipManageSerializer(ManageSerializerMixin, serializers.ModelSerializer):
    levels = serializers.ListField(child=serializers.ChoiceField(choices=LEVELS), min_length=1,
                                   error_messages={'min_length': 'Choose at least one level of study.'})
    covers = TextListField()
    eligibility = TextListField()
    steps = TextListField()
    timeline = TimelineEntrySerializer(many=True, required=False)
    service_includes = TextListField(required=False)
    service_requirements = TextListField(required=False)

    class Meta:
        model = Scholarship
        fields = [
            'id', 'slug', 'name', 'provider', 'country', 'levels', 'funding', 'duration', 'fields',
            'application_window', 'deadline', 'summary', 'covers', 'eligibility', 'steps', 'url',
            'hide_official_link', 'members_only', 'timeline', *SERVICE_FIELDS,
            'is_published', 'sort_order', 'created_at', 'updated_at', 'updated_by_name',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def validate_levels(self, value):
        return [level for level in LEVELS if level in value]  # de-duplicated, in the usual order

    def validate_timeline(self, value):
        # Stored as plain JSON in the editor's order.
        return [{'label': e['label'].strip(), 'date': e['date'].isoformat() if e.get('date') else None,
                 'text': e.get('text', '').strip()} for e in value]


class CourseManageSerializer(ManageSerializerMixin, serializers.ModelSerializer):
    topics = TextListField(line_length=60, max_length=8)

    class Meta:
        model = Course
        fields = [
            'id', 'slug', 'title', 'icon', 'summary', 'topics', 'duration', 'fee', 'next_intake',
            'is_published', 'sort_order', 'created_at', 'updated_at', 'updated_by_name',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class ReorderSerializer(serializers.Serializer):
    ids = serializers.ListField(child=serializers.IntegerField(), allow_empty=False, max_length=500)
