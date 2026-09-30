from rest_framework import serializers

from .models import PageContent, PageRevision, SiteImage
from .validators import validate_page_data

MAX_IMAGE_BYTES = 6 * 1024 * 1024
ALLOWED_FORMATS = {'JPEG', 'PNG', 'WEBP', 'GIF'}  # no SVG: it can carry scripts


class PageContentSerializer(serializers.ModelSerializer):
    updated_by_name = serializers.SerializerMethodField()

    class Meta:
        model = PageContent
        fields = ('slug', 'data', 'updated_at', 'updated_by_name')
        read_only_fields = ('slug', 'updated_at', 'updated_by_name')

    def get_updated_by_name(self, obj):
        user = obj.updated_by
        return (user.get_full_name() or user.email) if user else ''

    def validate_data(self, value):
        return validate_page_data(value)


class PageRevisionSerializer(serializers.ModelSerializer):
    user_name = serializers.SerializerMethodField()
    changed = serializers.SerializerMethodField()

    class Meta:
        model = PageRevision
        fields = ('id', 'action', 'created_at', 'user_name', 'changed')

    def get_user_name(self, obj):
        return (obj.user.get_full_name() or obj.user.email) if obj.user else ''

    def get_changed(self, obj):
        """The parts of the page that had been edited at that point, e.g. ['hero', 'highlights']."""
        return sorted(obj.data.keys()) if isinstance(obj.data, dict) else []


class SiteImageSerializer(serializers.ModelSerializer):
    url = serializers.SerializerMethodField()
    image = serializers.ImageField(write_only=True)

    class Meta:
        model = SiteImage
        fields = ('id', 'name', 'url', 'image', 'created_at')
        read_only_fields = ('id', 'url', 'created_at')

    def get_url(self, obj):
        # A path (/media/...), so it keeps working if the site moves to another domain.
        return obj.image.url

    def validate_image(self, value):
        if value.size > MAX_IMAGE_BYTES:
            raise serializers.ValidationError('Images can be at most 6 MB.')
        fmt = getattr(getattr(value, 'image', None), 'format', None)
        if fmt not in ALLOWED_FORMATS:
            raise serializers.ValidationError('Use a JPG, PNG, WebP or GIF image.')
        return value
