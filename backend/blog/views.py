"""
Blog API (mounted at /api/v1/blog/).

Public
  GET posts/?category=&tag=&q=&page=   published posts, newest first (9 a page); page 1 without filters also has `featured`
  GET posts/<slug>/                    one published post + related posts and the previous/next post (counts a view)
  GET categories/                      categories that have published posts, with counts

Admin (administrators)
  GET/POST          manage/posts/          ?q=&status=draft|published|scheduled&category=
  GET/PATCH/DELETE  manage/posts/<id>/
  GET/POST          manage/categories/
  PATCH/DELETE      manage/categories/<id>/
  GET               manage/authors/        who can be named as a post's author
"""
from django.core.cache import cache
from django.db.models import Count, F, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from django.utils.text import slugify
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import User
from accounts.permissions import IsAdmin

from .models import Category, Post, unique_slug

PAGE = 9


def _image(path):
    return path or ''


def author_data(post, request=None):
    user = post.author
    name = post.author_name or (user.get_full_name() if user else '') or 'ADRAM Technologies'
    avatar = ''
    if user and not post.author_name and getattr(user, 'profile_picture', None):
        try:
            avatar = user.profile_picture.url
        except ValueError:
            avatar = ''
    return {'name': name, 'title': post.author_title, 'avatar': avatar}


def category_data(c, count=None):
    data = {'id': c.id, 'name': c.name, 'slug': c.slug, 'description': c.description, 'sort_order': c.sort_order}
    if count is not None:
        data['count'] = count
    return data


def card(post):
    """A post as listed on the blog page."""
    return {
        'id': post.id, 'slug': post.slug, 'title': post.title, 'excerpt': post.excerpt, 'cover': _image(post.cover),
        'cover_alt': post.cover_alt or post.title, 'category': category_data(post.category) if post.category else None,
        'tags': post.tags or [], 'author': author_data(post), 'published_at': post.published_at,
        'reading_minutes': post.reading_minutes, 'featured': post.featured,
    }


def full(post):
    return {**card(post), 'body': post.body, 'updated_at': post.updated_at, 'views': post.views,
            'seo_title': post.seo_title, 'seo_description': post.seo_description,
            'helpful': {'yes': post.helpful_yes, 'no': post.helpful_no}}


# ---------------------------------------------------------------- public

class PostListView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        posts = Post.live.select_related('category', 'author')
        p = request.query_params
        filtered = False
        if p.get('category'):
            posts, filtered = posts.filter(category__slug=p['category']), True
        if p.get('tag'):
            posts, filtered = posts.filter(tags__icontains=f'"{p["tag"]}"'), True
        q = str(p.get('q', '')).strip()
        if q:
            posts, filtered = posts.filter(Q(title__icontains=q) | Q(excerpt__icontains=q) | Q(body__icontains=q)), True
        try:
            page = max(1, int(p.get('page', 1)))
        except ValueError:
            page = 1

        featured = None
        if page == 1 and not filtered:
            featured = posts.filter(featured=True).first() or posts.first()
        rest = posts.exclude(pk=featured.pk) if featured else posts
        total = rest.count()
        return Response({
            'featured': card(featured) if featured else None,
            'results': [card(x) for x in rest[(page - 1) * PAGE: page * PAGE]],
            'count': total + (1 if featured else 0), 'page': page, 'pages': max(1, -(-total // PAGE)),
        })


class PostDetailView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request, slug):
        post = get_object_or_404(Post.live.select_related('category', 'author'), slug=slug)
        # one view per visitor per post every 6 hours
        who = request.META.get('HTTP_X_FORWARDED_FOR', '').split(',')[0].strip() or request.META.get('REMOTE_ADDR', '')
        key = f'blog:view:{post.pk}:{who}'
        if not cache.get(key):
            cache.set(key, 1, 6 * 3600)
            Post.objects.filter(pk=post.pk).update(views=F('views') + 1)
            post.views += 1  # include this visit in the count shown
        live = Post.live.select_related('category', 'author')
        related = list(live.filter(category=post.category).exclude(pk=post.pk)[:3]) if post.category else []
        if len(related) < 3:
            related += list(live.exclude(pk__in=[post.pk, *[r.pk for r in related]])[:3 - len(related)])
        newer = live.filter(published_at__gt=post.published_at).order_by('published_at').first()
        older = live.filter(published_at__lt=post.published_at).order_by('-published_at').first()
        nav = lambda x: {'slug': x.slug, 'title': x.title} if x else None  # noqa: E731
        return Response({**full(post), 'related': [card(r) for r in related], 'newer': nav(newer), 'older': nav(older)})


class FeedbackView(APIView):
    """POST /blog/posts/<slug>/feedback/ {helpful: true|false} -> "Was this article helpful?" (one vote per reader)."""
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request, slug):
        post = get_object_or_404(Post.live, slug=slug)
        helpful = request.data.get('helpful')
        if not isinstance(helpful, bool):
            return Response({'detail': 'Say whether the article was helpful.'}, status=status.HTTP_400_BAD_REQUEST)
        who = request.META.get('HTTP_X_FORWARDED_FOR', '').split(',')[0].strip() or request.META.get('REMOTE_ADDR', '')
        key = f'blog:helpful:{post.pk}:{who}'
        previous = cache.get(key)
        if previous is None:
            Post.objects.filter(pk=post.pk).update(**{'helpful_yes' if helpful else 'helpful_no': F('helpful_yes' if helpful else 'helpful_no') + 1})
        elif previous != helpful:  # changed their mind
            field_up, field_down = ('helpful_yes', 'helpful_no') if helpful else ('helpful_no', 'helpful_yes')
            Post.objects.filter(pk=post.pk, **{f'{field_down}__gt': 0}).update(**{field_up: F(field_up) + 1, field_down: F(field_down) - 1})
        cache.set(key, helpful, 30 * 24 * 3600)
        post.refresh_from_db(fields=['helpful_yes', 'helpful_no'])
        return Response({'yes': post.helpful_yes, 'no': post.helpful_no, 'vote': helpful})


class CategoryListView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        counts = dict(Post.live.filter(category__isnull=False).values_list('category').annotate(n=Count('id')))
        return Response([category_data(c, counts[c.id]) for c in Category.objects.all() if counts.get(c.id)])


# ---------------------------------------------------------------- admin: posts

def admin_post(post):
    state = 'scheduled' if post.is_scheduled else post.status
    return {**full(post), 'status': post.status, 'state': state, 'views': post.views, 'created_at': post.created_at,
            'author_id': post.author_id, 'author_name': post.author_name, 'author_title': post.author_title,
            'category_id': post.category_id, 'url': f'/blog/{post.slug}'}


TEXT = {'title': 200, 'excerpt': 300, 'body': 100000, 'cover': 500, 'cover_alt': 200, 'author_name': 120, 'author_title': 120,
        'seo_title': 150, 'seo_description': 300}


def apply(post, data):
    errors = {}
    for field, limit in TEXT.items():
        if field in data:
            setattr(post, field, str(data[field] or '').strip()[:limit] if field != 'body' else str(data[field] or '')[:limit])
    if not post.title:
        errors['title'] = 'Give the post a title.'
    if post.cover and not post.cover.startswith(('/', 'https://')):
        errors['cover'] = 'Use an uploaded image or a full https:// address.'

    if 'slug' in data:
        wanted = slugify(str(data['slug'] or ''))[:200]
        if wanted and Post.objects.filter(slug=wanted).exclude(pk=post.pk).exists():
            errors['slug'] = 'Another post already uses this web address.'
        post.slug = wanted or post.slug
    if not post.slug and post.title:
        post.slug = unique_slug(Post, post.title, exclude_pk=post.pk)

    if 'category_id' in data:
        cid = data['category_id']
        post.category = Category.objects.filter(pk=cid).first() if cid else None
    if 'author_id' in data:
        aid = data['author_id']
        post.author = User.objects.filter(pk=aid).first() if aid else None
    if 'tags' in data:
        raw = data['tags'] if isinstance(data['tags'], list) else str(data['tags'] or '').split(',')
        seen = []
        for t in raw:
            t = str(t).strip()[:40]
            if t and t.lower() not in [s.lower() for s in seen]:
                seen.append(t)
        post.tags = seen[:12]
    if 'featured' in data:
        post.featured = bool(data['featured'])
    if 'published_at' in data:
        value = data['published_at']
        when = parse_datetime(value) if isinstance(value, str) and value else None
        if value and not when:
            errors['published_at'] = 'Use a valid date and time.'
        if when and timezone.is_naive(when):
            when = timezone.make_aware(when)
        post.published_at = when
    if 'status' in data:
        if data['status'] not in (Post.DRAFT, Post.PUBLISHED):
            errors['status'] = 'Unknown status.'
        else:
            post.status = data['status']
            if post.status == Post.PUBLISHED and not post.published_at:
                post.published_at = timezone.now()
    if post.status == Post.PUBLISHED and not (post.body or '').strip():
        errors['body'] = 'Write the post before publishing it.'
    return errors


class ManagePostsView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        posts = Post.objects.select_related('category', 'author')
        p = request.query_params
        q = str(p.get('q', '')).strip()
        if q:
            posts = posts.filter(Q(title__icontains=q) | Q(excerpt__icontains=q))
        now = timezone.now()
        if p.get('status') == 'draft':
            posts = posts.filter(status=Post.DRAFT)
        elif p.get('status') == 'published':
            posts = posts.filter(status=Post.PUBLISHED, published_at__lte=now)
        elif p.get('status') == 'scheduled':
            posts = posts.filter(status=Post.PUBLISHED, published_at__gt=now)
        if p.get('category'):
            posts = posts.filter(category_id=p['category'])
        all_posts = Post.objects.all()
        counts = {
            'all': all_posts.count(), 'draft': all_posts.filter(status=Post.DRAFT).count(),
            'published': all_posts.filter(status=Post.PUBLISHED, published_at__lte=now).count(),
            'scheduled': all_posts.filter(status=Post.PUBLISHED, published_at__gt=now).count(),
        }
        return Response({'results': [admin_post(x) for x in posts.order_by('-updated_at')[:300]], 'counts': counts})

    def post(self, request):
        post = Post(author=request.user)
        data = dict(request.data)
        if not data.get('author_id'):
            data.pop('author_id', None)  # a new post is by whoever writes it, unless another author is chosen
        errors = apply(post, data)
        if errors:
            return Response(errors, status=status.HTTP_400_BAD_REQUEST)
        post.save()
        return Response(admin_post(post), status=status.HTTP_201_CREATED)


class ManagePostView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request, pk):
        return Response(admin_post(get_object_or_404(Post.objects.select_related('category', 'author'), pk=pk)))

    def patch(self, request, pk):
        post = get_object_or_404(Post, pk=pk)
        errors = apply(post, request.data)
        if errors:
            return Response(errors, status=status.HTTP_400_BAD_REQUEST)
        post.save()
        return Response(admin_post(post))

    def delete(self, request, pk):
        get_object_or_404(Post, pk=pk).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------- admin: categories

class ManageCategoriesView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        counts = dict(Post.objects.filter(category__isnull=False).values_list('category').annotate(n=Count('id')))
        return Response([category_data(c, counts.get(c.id, 0)) for c in Category.objects.all()])

    def post(self, request):
        name = str(request.data.get('name', '')).strip()[:60]
        if not name:
            return Response({'name': 'Name the category.'}, status=status.HTTP_400_BAD_REQUEST)
        if Category.objects.filter(name__iexact=name).exists():
            return Response({'name': 'This category already exists.'}, status=status.HTTP_400_BAD_REQUEST)
        c = Category.objects.create(name=name, slug=unique_slug(Category, name, max_length=70),
                                    description=str(request.data.get('description', '')).strip()[:200],
                                    sort_order=Category.objects.count())
        return Response(category_data(c, 0), status=status.HTTP_201_CREATED)


class ManageCategoryView(APIView):
    permission_classes = [IsAdmin]

    def patch(self, request, pk):
        c = get_object_or_404(Category, pk=pk)
        if 'name' in request.data:
            name = str(request.data['name'] or '').strip()[:60]
            if not name:
                return Response({'name': 'Name the category.'}, status=status.HTTP_400_BAD_REQUEST)
            if Category.objects.filter(name__iexact=name).exclude(pk=pk).exists():
                return Response({'name': 'This category already exists.'}, status=status.HTTP_400_BAD_REQUEST)
            c.name = name
        if 'description' in request.data:
            c.description = str(request.data['description'] or '').strip()[:200]
        if 'sort_order' in request.data:
            try:
                c.sort_order = max(0, int(request.data['sort_order']))
            except (TypeError, ValueError):
                pass
        c.save()
        return Response(category_data(c, c.posts.count()))

    def delete(self, request, pk):
        get_object_or_404(Category, pk=pk).delete()  # its posts stay, without a category
        return Response(status=status.HTTP_204_NO_CONTENT)


class AuthorsView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        staff = User.objects.filter(is_active=True).exclude(role=User.STUDENT).order_by('first_name', 'last_name')[:200]
        return Response([{'id': u.id, 'name': u.get_full_name() or u.email, 'role': u.get_role_display()} for u in staff])

