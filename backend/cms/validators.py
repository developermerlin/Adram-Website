"""Checks on what the admin portal sends, so a page's JSON cannot carry unsafe or oversized content."""
import json

from rest_framework import serializers

MAX_BYTES = 400_000      # a whole page, serialised
MAX_DEPTH = 8
MAX_STRING = 8_000
MAX_LIST = 500
UNSAFE_SCHEMES = ('javascript:', 'data:', 'vbscript:')


def _check(value, depth=0):
    if depth > MAX_DEPTH:
        raise serializers.ValidationError('The content is nested too deeply.')
    if isinstance(value, dict):
        for key, item in value.items():
            if not isinstance(key, str) or len(key) > 60:
                raise serializers.ValidationError('Invalid field name.')
            _check(item, depth + 1)
    elif isinstance(value, list):
        if len(value) > MAX_LIST:
            raise serializers.ValidationError(f'Lists can have at most {MAX_LIST} items.')
        for item in value:
            _check(item, depth + 1)
    elif isinstance(value, str):
        if len(value) > MAX_STRING:
            raise serializers.ValidationError(f'Text can be at most {MAX_STRING} characters.')
        # Links and image addresses end up in href/src attributes, so refuse script-style schemes.
        if value.strip().lower().startswith(UNSAFE_SCHEMES):
            raise serializers.ValidationError('That kind of link is not allowed.')
    elif value is not None and not isinstance(value, (bool, int, float)):
        raise serializers.ValidationError('Unsupported value.')


def validate_page_data(data):
    if not isinstance(data, dict):
        raise serializers.ValidationError('Page content must be an object.')
    _check(data)
    if len(json.dumps(data)) > MAX_BYTES:
        raise serializers.ValidationError('This page has too much content.')
    return data
