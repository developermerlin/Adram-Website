"""The flash sales running now, cached briefly: course prices are worked out for every card on every page."""
from django.core.cache import cache
from django.utils import timezone

CACHE_KEY = 'catalog:flash-sales'
CACHE_SECONDS = 60


def _load():
    from .models import FlashSale
    rows = []
    for sale in FlashSale.objects.filter(is_enabled=True, ends_at__gt=timezone.now()).prefetch_related('courses'):
        ids = {c.pk for c in sale.courses.all()}
        rows.append({'id': sale.pk, 'name': sale.name, 'percent': sale.percent_off, 'starts_at': sale.starts_at,
                     'ends_at': sale.ends_at, 'course_ids': ids or None})
    return rows


def live_flash_sales(now=None):
    """Enabled flash sales running at `now` (upcoming ones are cached too, so they switch on by themselves)."""
    rows = cache.get(CACHE_KEY)
    if rows is None:
        rows = _load()
        cache.set(CACHE_KEY, rows, CACHE_SECONDS)
    now = now or timezone.now()
    return [r for r in rows if r['starts_at'] <= now < r['ends_at']]


def forget_flash_sales():
    cache.delete(CACHE_KEY)
