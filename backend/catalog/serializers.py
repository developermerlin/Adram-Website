from rest_framework import serializers

from .models import LEVELS, Category, Course, Scholarship

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
    """A programme as the public sees it: the catalogue card and the course page."""
    promo_embed_url = serializers.SerializerMethodField()
    stats = serializers.SerializerMethodField()
    sale_price = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    is_free = serializers.BooleanField(read_only=True)
    category = serializers.SerializerMethodField()
    subcategory = serializers.SerializerMethodField()
    instructor = serializers.SerializerMethodField()

    class Meta:
        model = Course
        fields = [
            'slug', 'title', 'icon', 'summary', 'topics', 'duration', 'fee', 'price', 'next_intake',
            'description', 'learn_points', 'requirements', 'audience', 'level', 'language', 'thumbnail', 'promo_embed_url',
            'instructor_name', 'instructor_title', 'instructor_bio', 'instructor_photo', 'enrollment_mode', 'stats',
            'id', 'subtitle', 'discount_price', 'sale_price', 'currency', 'is_free', 'faqs', 'category', 'subcategory',
            'instructor', 'updated_at', 'published_at', 'is_premium', 'highlight', 'format_label',
            'caption_languages', 'includes', 'premium_note', 'feature', 'allow_downloads', 'allow_video_downloads',
        ]

    def get_category(self, obj):
        return {'id': obj.category.id, 'slug': obj.category.slug, 'name': obj.category.name} if obj.category_id else None

    def get_subcategory(self, obj):
        return {'id': obj.subcategory.id, 'slug': obj.subcategory.slug, 'name': obj.subcategory.name} if obj.subcategory_id else None

    def get_instructor(self, obj):
        from lms.briefs import instructor_info
        return instructor_info(obj)

    def get_promo_embed_url(self, obj):
        from lms.media import embed_url  # imported here: lms depends on catalog
        return embed_url(obj.promo_video_url) if obj.promo_video_url else None

    def get_stats(self, obj):
        """Lessons, hours, rating and students. Without the course-portal tables (migration not applied yet) the
        programme list must keep working, so it reports an empty course portal instead of failing."""
        from django.db import DatabaseError
        from lms.stats import course_stats
        try:
            return course_stats(obj)
        except DatabaseError:
            return {'lesson_count': 0, 'total_seconds': 0, 'rating_average': 0, 'rating_count': 0, 'student_count': 0}

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data['lesson_count'] = data['stats']['lesson_count']  # kept for the Training page cards
        # Only a sale running now is shown (a timed sale price outside its window, or a finished flash sale, isn't)
        deal = instance.current_deal()
        data['discount_price'] = f"{deal['price']:.2f}" if deal else None
        data['sale_price'] = f"{(deal['price'] if deal else (instance.price or 0)):.2f}"
        data['sale_ends_at'] = deal['ends_at'] if deal else None
        data['sale_label'] = deal['label'] if deal else None
        from lms.topics import topic_links
        data['topic_links'] = topic_links(instance.topics)
        return data


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


def _safe_image(value):
    """An image is a path on this site (/media/..., /web/...) or a web address, never a script."""
    value = (value or '').strip()
    if value and not (value.startswith('/') and not value.startswith('//') or value.lower().startswith(('http://', 'https://'))):
        raise serializers.ValidationError('Choose an image from the library.')
    return value


class FaqField(serializers.ListField):
    """[{question, answer}]: blank pairs are dropped."""
    def __init__(self, **kwargs):
        kwargs.setdefault('child', serializers.DictField(child=serializers.CharField(max_length=2000, allow_blank=True)))
        kwargs.setdefault('max_length', 30)
        super().__init__(**kwargs)

    def to_internal_value(self, data):
        rows = super().to_internal_value(data)
        clean = []
        for row in rows:
            question, answer = str(row.get('question', '')).strip()[:300], str(row.get('answer', '')).strip()[:2000]
            if question and answer:
                clean.append({'question': question, 'answer': answer})
            elif question or answer:
                raise serializers.ValidationError('Give every FAQ a question and an answer.')
        return clean


class FeatureBoxField(serializers.Field):
    """The highlighted box on a course page: {title, text, image, link_label, link_url}. Empty title = no box."""
    LIMITS = {'title': 120, 'text': 600, 'image': 300, 'link_label': 60, 'link_url': 500}

    def to_representation(self, value):
        return value or {}

    def to_internal_value(self, data):
        if data in (None, ''):
            return {}
        if not isinstance(data, dict):
            raise serializers.ValidationError('Fill in the feature box fields.')
        box = {key: str(data.get(key) or '').strip()[:limit] for key, limit in self.LIMITS.items()}
        if not box['title']:
            return {}
        box['image'] = _safe_image(box['image'])
        url = box['link_url']
        if url and not (url.startswith('/') and not url.startswith('//') or url.lower().startswith(('http://', 'https://'))):
            raise serializers.ValidationError('The link must be a web address (https://…) or a page on this site (/…).')
        if url and not box['link_label']:
            box['link_label'] = 'Learn more'
        return box


class CourseManageSerializer(ManageSerializerMixin, serializers.ModelSerializer):
    topics = TextListField(line_length=60, max_length=8)
    learn_points = TextListField(line_length=200, max_length=12, required=False)
    requirements = TextListField(line_length=200, max_length=10, required=False)
    audience = TextListField(line_length=200, max_length=8, required=False)
    thumbnail = serializers.CharField(max_length=300, required=False, allow_blank=True, validators=[_safe_image])
    instructor_photo = serializers.CharField(max_length=300, required=False, allow_blank=True, validators=[_safe_image])
    price = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=0, required=False, allow_null=True)
    discount_price = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=0, required=False, allow_null=True)
    sale_starts_at = serializers.DateTimeField(required=False, allow_null=True)
    sale_ends_at = serializers.DateTimeField(required=False, allow_null=True)
    faqs = FaqField(required=False)
    caption_languages = TextListField(line_length=40, max_length=40, required=False)
    includes = TextListField(line_length=120, max_length=10, required=False)
    feature = FeatureBoxField(required=False)
    category = serializers.PrimaryKeyRelatedField(queryset=Category.objects.filter(parent__isnull=True), required=False, allow_null=True)
    subcategory = serializers.PrimaryKeyRelatedField(queryset=Category.objects.filter(parent__isnull=False), required=False, allow_null=True)
    instructor_account = serializers.SerializerMethodField()
    stats = serializers.SerializerMethodField()

    class Meta:
        model = Course
        fields = [
            'id', 'slug', 'title', 'subtitle', 'icon', 'summary', 'topics', 'duration', 'fee', 'price', 'discount_price',
            'sale_starts_at', 'sale_ends_at', 'next_intake',
            'description', 'learn_points', 'requirements', 'audience', 'level', 'language', 'thumbnail', 'promo_video_url',
            'instructor_name', 'instructor_title', 'instructor_bio', 'instructor_photo', 'enrollment_mode',
            'category', 'subcategory', 'faqs', 'instructor', 'instructor_account', 'is_premium', 'highlight', 'format_label', 'caption_languages', 'includes', 'premium_note', 'feature', 'allow_downloads', 'allow_video_downloads', 'stats', 'status', 'review_note', 'submitted_at', 'published_at',
            'is_published', 'sort_order', 'created_at', 'updated_at', 'updated_by_name',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'status', 'review_note', 'submitted_at', 'published_at']

    def get_stats(self, obj):
        return CourseSerializer.get_stats(self, obj)

    def get_instructor_account(self, obj):
        user = obj.instructor
        return {'id': user.id, 'name': user.get_full_name(), 'email': user.email} if user else None

    def validate_instructor(self, user):
        from accounts.models import User
        if user and user.role != User.INSTRUCTOR:
            raise serializers.ValidationError('Choose an account with the Instructor role.')
        return user

    def validate(self, attrs):
        attrs = super().validate(attrs)
        category = attrs.get('category', getattr(self.instance, 'category', None))
        sub = attrs.get('subcategory', getattr(self.instance, 'subcategory', None))
        if sub and sub.parent_id != getattr(category, 'id', None):
            raise serializers.ValidationError({'subcategory': 'Choose a subcategory of the chosen category.'})
        price = attrs.get('price', getattr(self.instance, 'price', None))
        sale = attrs.get('discount_price', getattr(self.instance, 'discount_price', None))
        if sale is not None and (not price or sale >= price):
            raise serializers.ValidationError({'discount_price': 'The sale price must be lower than the price.'})
        starts = attrs.get('sale_starts_at', getattr(self.instance, 'sale_starts_at', None))
        ends = attrs.get('sale_ends_at', getattr(self.instance, 'sale_ends_at', None))
        if starts and ends and ends <= starts:
            raise serializers.ValidationError({'sale_ends_at': 'The sale must end after it starts.'})
        return attrs

    def validate_promo_video_url(self, value):
        from lms.media import embed_url
        if value and not embed_url(value):
            raise serializers.ValidationError('Paste a YouTube or Vimeo link.')
        return value


class ReorderSerializer(serializers.Serializer):
    ids = serializers.ListField(child=serializers.IntegerField(), allow_empty=False, max_length=500)
