"""Short descriptions of courses and people, shared by the cart, orders, dashboards and search results."""
from .stats import course_stats


def money(value):
    return f'{value:.2f}' if value is not None else None


def photo_url(user):
    try:
        return user.profile_picture.url if user and user.profile_picture else ''
    except ValueError:
        return ''


def instructor_info(course):
    """Who teaches a course: the instructor account if there is one, else the names typed on the course page."""
    user = course.instructor if course.instructor_id else None
    if user:
        profile = getattr(user, 'lms_profile', None)
        return {
            'id': user.id,
            'name': user.get_full_name() or course.instructor_name or 'Instructor',
            'title': (profile.headline if profile else '') or course.instructor_title,
            'photo': photo_url(user) or course.instructor_photo,
        }
    return {'id': None, 'name': course.instructor_name or 'ADRAM Technologies', 'title': course.instructor_title, 'photo': course.instructor_photo}


def category_info(category):
    return {'id': category.id, 'slug': category.slug, 'name': category.name} if category else None


def _embed(url):
    from .media import embed_url
    return embed_url(url) if url else None


def _topics(topics):
    from .topics import topic_links
    return topic_links(topics)


def _trending():
    from .search import trending_ids
    return trending_ids()


def course_brief(course, stats=None):
    deal = course.current_deal()
    return {
        'id': course.id,
        'slug': course.slug,
        'title': course.title,
        'subtitle': course.subtitle,
        'summary': course.summary,
        'icon': course.icon,
        'thumbnail': course.thumbnail,
        'level': course.level,
        'language': course.language,
        'currency': course.currency,
        'price': money(course.price),
        'discount_price': money(deal['price']) if deal else None,  # only a sale running now
        'sale_price': money(deal['price'] if deal else (course.price or 0)),
        'sale_ends_at': deal['ends_at'] if deal else None,
        'sale_label': deal['label'] if deal else None,
        'is_free': course.is_free,
        'enrollment_mode': course.enrollment_mode,
        'is_premium': course.is_premium,
        'highlight': course.highlight,
        'format_label': course.format_label or 'Course',
        'learn_points': (course.learn_points or [])[:3],  # the card's hover preview
        'caption_count': len(course.caption_languages or []),
        'promo_embed_url': _embed(course.promo_video_url),
        'topic_links': _topics(course.topics),
        'trending': course.id in _trending(),
        'instructor': instructor_info(course),
        'category': category_info(course.category),
        'subcategory': category_info(course.subcategory),
        'updated_at': course.updated_at,
        'published_at': course.published_at,
        'stats': stats if stats is not None else course_stats(course),
    }


def public_name(user):
    first = (user.first_name or '').strip()
    last = (user.last_name or '').strip()
    return f'{first} {last[:1]}.'.strip() if first else 'A student'
