"""
What the assistant knows: a plain-text summary built from the website's live content (services, training
programmes, scholarships, blog articles, the team, contact details) plus the admin's own extra facts.
Rebuilt at most every five minutes, so admin edits reach the assistant quickly.
"""
import hashlib

from django.core.cache import cache
from django.utils import timezone

CACHE_KEY = 'chatbot:knowledge'
MAX_CHARS = 60000

# The website's built-in wording (frontend/src/config/site.js and data/services.js); Site content edits win.
SITE = {
    'name': 'ADRAM Technologies', 'email': 'adramtechnologies@gmail.com', 'phones': ['+232 76 978 720', '+232 76 827 374'],
    'location': 'Freetown, Sierra Leone', 'whatsapp': 'https://wa.me/23276978720',
    'hours': ['Monday – Friday: 9:00 AM – 6:00 PM', 'Saturday: 10:00 AM – 4:00 PM', 'Sunday: closed'],
}
SERVICES = [
    ('web-development', 'Web Development', 'Fast, secure websites and web applications built around how your organisation works.'),
    ('mobile-development', 'Mobile Development', 'Android and iOS apps that put your services in your customers’ pockets.'),
    ('software-development', 'Software Development', 'Custom systems that replace paperwork and spreadsheets with reliable software.'),
    ('networking', 'Computer Networking', 'Network design, installation and support that keeps your offices connected.'),
    ('hardware', 'Computer Hardware', 'Quality computers and equipment, with repairs, upgrades and maintenance.'),
    ('ai-machine-learning', 'AI & Machine Learning', 'Practical AI: automating routine work and turning your data into decisions.'),
    ('data-analytics', 'Data Analytics', 'Turning records and surveys into clear insight, dashboards and reports.'),
    ('it-consultancy', 'IT Consultancy', 'Independent advice on the right technology, and a plan to adopt it.'),
    ('digital-transformation', 'Digital Transformation', 'Moving processes online, step by step, with the team trained along the way.'),
    ('graphic-design', 'Graphic Design & Photography', 'Logos, branding, social graphics and professional photography.'),
    ('typing', 'Touch Typing Training', 'Learn to type fast and accurately, with structured lessons for children and adults.'),
]
PAGES = [
    ('/services', 'All services'), ('/courses', 'Training programmes'), ('/scholarships', 'Scholarships'),
    ('/about', 'About ADRAM'), ('/about/team', 'The team'), ('/projects', 'Completed projects'), ('/learning', 'Learning hub (free notes)'), ('/blog', 'Blog'), ('/partners', 'Partners'),
    ('/contact', 'Contact form'), ('/join', 'Create a free account'), ('/login', 'Sign in'),
]


def _cms(slug):
    from cms.models import PageContent
    row = PageContent.objects.filter(slug=slug).first()
    return row.data if row and isinstance(row.data, dict) else {}


def _site_section():
    site = {**SITE, **{k: v for k, v in _cms('site').items() if k in ('name', 'email', 'phones', 'location') and v}}
    phones = site['phones'] if isinstance(site['phones'], list) else [site['phones']]
    return '\n'.join([
        f"Company: {site['name']}, an IT company in {site['location']} delivering software, networks and digital systems, plus practical tech training and scholarship guidance.",
        f"Email: {site['email']}", f"Phone: {', '.join(p for p in phones if p)}", f"WhatsApp: {site['whatsapp']}",
        'Office hours: ' + '; '.join(site['hours']),
    ])


def _services_section():
    edited = _cms('services').get('items')
    rows = []
    if isinstance(edited, list) and edited:
        for item in edited:
            if isinstance(item, dict) and item.get('title'):
                rows.append(f"- {item['title']}: {item.get('summary', '')} (page: /services/{item.get('id', '')})")
    else:
        rows = [f'- {title}: {summary} (page: /services/{sid})' for sid, title, summary in SERVICES]
    return '\n'.join(rows)


def _courses_section():
    from catalog.models import Course
    rows = []
    for c in Course.objects.filter(is_published=True).order_by('title')[:80]:
        price = c.fee or (f'NLe {c.price:,.0f}' if c.price else 'Free')
        bits = [f'level: {c.get_level_display()}', f'fee: {price}']
        if c.duration:
            bits.append(f'duration: {c.duration}')
        rows.append(f"- {c.title} ({'; '.join(bits)}). {c.summary[:260]} (page: /courses/{c.slug})")
    return '\n'.join(rows) or 'No programmes are listed at the moment.'


def _scholarships_section():
    from catalog.models import Scholarship
    rows = []
    for s in Scholarship.objects.filter(is_published=True).order_by('name')[:80]:
        bits = [s.get_country_display(), s.get_funding_display()]
        if s.levels:
            bits.append('levels: ' + ', '.join(map(str, s.levels)))
        if s.deadline:
            bits.append(f'deadline: {s.deadline:%d %B %Y}')
        elif s.application_window:
            bits.append(s.application_window)
        if s.service_enabled:
            bits.append(f"ADRAM can apply for the student{f' (service fee: {s.service_fee})' if s.service_fee else ''}")
        rows.append(f"- {s.name} by {s.provider} ({'; '.join(bits)}). {s.summary[:220]} (page: /scholarships/{s.slug})")
    return '\n'.join(rows) or 'No scholarships are listed at the moment.'


def _blog_section():
    from blog.models import Post
    return '\n'.join(f'- {p.title}: {p.excerpt} (page: /blog/{p.slug})' for p in Post.live.all()[:30]) or 'No articles yet.'


def _team_section():
    from team.models import TeamProfile
    rows = [f'- {p.name}, {p.job_title or "team member"} (profile: /team/{p.slug})'
            for p in TeamProfile.objects.filter(is_published=True, user__is_active=True).select_related('user')[:40]]
    return '\n'.join(rows) or 'Team profiles are not published yet.'


def _projects_section():
    from projects.models import Project
    rows = []
    for p in Project.objects.filter(status=Project.PUBLISHED)[:40]:
        facts = ', '.join(x for x in (p.client, p.sector, p.location, str(p.completed_on.year) if p.completed_on else '') if x)
        rows.append(f'- {p.title}{f" ({facts})" if facts else ""}: {p.summary} (case study: /projects/{p.slug})')
    return '\n'.join(rows) or 'No projects published yet.'


def _learning_section():
    from learning.models import Field
    rows = []
    for f in Field.objects.filter(is_published=True):
        topics = list(f.topics.filter(notes__is_published=True).distinct().values_list('title', flat=True)[:12])
        if topics:
            rows.append(f"- {f.name} (free notes from zero to hero, page: /learning/{f.slug}): {f.summary} Topics: {', '.join(topics)}.")
    return '\n'.join(rows) or 'No learning notes published yet.'


def build(extra=''):
    sections = [
        ('ABOUT ADRAM AND CONTACT DETAILS', _site_section()),
        ('SERVICES', _services_section()),
        ('TRAINING PROGRAMMES', _courses_section()),
        ('SCHOLARSHIPS', _scholarships_section()),
        ('BLOG ARTICLES', _blog_section()),
        ('COMPLETED PROJECTS (CASE STUDIES)', _projects_section()),
        ('LEARNING HUB (FREE STUDY NOTES)', _learning_section()),
        ('TEAM', _team_section()),
        ('USEFUL PAGES', '\n'.join(f'- {label}: {path}' for path, label in PAGES)),
    ]
    if extra.strip():
        sections.append(('EXTRA FACTS AND FAQS FROM THE ADRAM TEAM', extra.strip()))
    text = '\n\n'.join(f'## {title}\n{body}' for title, body in sections)
    return text[:MAX_CHARS]


def get(extra=''):
    key = f'{CACHE_KEY}:{hashlib.md5(extra.encode()).hexdigest()}'
    text = cache.get(key)
    if text is None:
        text = build(extra)
        cache.set(key, text, 300)
    return text


def system_prompt(cfg, user=None):
    who = f'The visitor is signed in as {user.first_name or "a registered user"}.' if user and user.is_authenticated else 'The visitor is not signed in.'
    rules = f'''You are {cfg.name}, the assistant on the ADRAM Technologies website. Today is {timezone.localdate():%A %d %B %Y}. {who}

How to answer:
- Help visitors with ADRAM's services, training programmes, scholarships, the blog, the team and how to contact ADRAM.
- Use only the information below. Never invent prices, dates, deadlines, eligibility rules or promises. If the answer isn't there, say you're not sure and offer to connect them with the team.
- Keep answers short and friendly: usually 2–5 sentences or a short list. Use simple English; if the visitor writes in Krio or another language, reply in that language.
- Link to the right page using Markdown with the relative address given below, e.g. [Training programmes](/courses).
- Never guarantee that someone will win a scholarship. Never ask for passwords, card numbers or mobile-money PINs.
- Politely decline unrelated requests (homework, coding help, general chat) and steer back to how ADRAM can help.
- When the visitor wants a person, wants a quote, has a complaint or account problem, or you can't help, end your reply with the exact marker [HANDOFF] on its own line.'''
    if cfg.instructions.strip():
        rules += f'\n\nAdditional rules from the ADRAM team:\n{cfg.instructions.strip()}'
    return rules, get(cfg.knowledge)
