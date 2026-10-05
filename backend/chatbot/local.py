"""
Built-in answers: the assistant's own answering, with no AI service needed.

It works out what the visitor is asking about (services, a particular service, training programmes, a particular
course, scholarships, how to apply, fees, contact details, accounts, the team, the blog) and answers from the
website's live content. Used when no AI key is set, and as a backup whenever the AI service can't be reached.
"""
import re

from . import knowledge

STOP = set('''a an the and or of to in on for with about is are was be can could would should will i me my we you your our us it
this that these those do does did have has how what which who when where why please tell know want need like get give any some
there here from at by as so if not just also more much many really adram'''.split())

SERVICE_WORDS = {
    'web-development': ['website', 'websites', 'web', 'site', 'portal', 'ecommerce', 'e-commerce'],
    'mobile-development': ['mobile', 'app', 'apps', 'android', 'ios', 'iphone'],
    'software-development': ['software', 'system', 'systems', 'erp', 'database', 'management'],
    'networking': ['network', 'networking', 'wifi', 'wi-fi', 'internet', 'cabling', 'router', 'lan', 'server', 'servers'],
    'hardware': ['hardware', 'computer', 'computers', 'laptop', 'laptops', 'repair', 'repairs', 'printer', 'equipment'],
    'ai-machine-learning': ['ai', 'artificial', 'intelligence', 'machine', 'learning', 'automation', 'chatbot'],
    'data-analytics': ['data', 'analytics', 'dashboard', 'dashboards', 'reports', 'excel', 'statistics'],
    'it-consultancy': ['consultancy', 'consulting', 'consultant', 'advice', 'advise'],
    'digital-transformation': ['digital', 'transformation', 'paperless', 'online'],
    'graphic-design': ['design', 'logo', 'logos', 'branding', 'graphic', 'graphics', 'photography', 'photo', 'photos', 'flyer'],
    'typing': ['typing', 'keyboard'],
}
INTENTS = {
    'greet': ['hi', 'hello', 'hey', 'morning', 'afternoon', 'evening', 'kushe', 'kusheh'],
    'thanks': ['thanks', 'thank', 'thx', 'appreciate', 'bye', 'goodbye'],
    'human': ['human', 'person', 'agent', 'staff', 'someone', 'complaint', 'complain', 'manager', 'representative'],
    'contact': ['contact', 'phone', 'call', 'email', 'whatsapp', 'address', 'location', 'located', 'office', 'reach', 'hours', 'open', 'opening', 'visit', 'where'],
    'services': ['service', 'services', 'offer', 'offers', 'provide', 'do', 'solutions'],
    'courses': ['course', 'courses', 'training', 'train', 'programme', 'programmes', 'program', 'programs', 'class', 'classes', 'learn', 'study', 'lesson', 'lessons', 'certificate', 'enroll', 'enrol'],
    'scholarships': ['scholarship', 'scholarships', 'abroad', 'university', 'universities', 'masters', 'bachelor', 'phd', 'funding', 'funded', 'grant'],
    'apply': ['apply', 'application', 'applying', 'process', 'steps', 'requirements', 'documents', 'eligible', 'eligibility'],
    'price': ['price', 'prices', 'fee', 'fees', 'cost', 'costs', 'charge', 'how much', 'pay', 'payment', 'quote', 'quotation', 'afford'],
    'account': ['account', 'register', 'registration', 'signup', 'sign', 'login', 'log', 'password', 'portal', 'dashboard'],
    'team': ['team', 'staff', 'people', 'employees', 'who'],
    'blog': ['blog', 'article', 'articles', 'news', 'post', 'posts'],
}


# words that describe a kind of thing, not a particular course or scholarship
GENERIC = {w for vocab in INTENTS.values() for w in vocab} | {'join', 'government', 'scholarship', 'full', 'international', 'students', 'student', 'best', 'available', 'list', 'all', 'new'}


def words(text):
    return [w for w in re.findall(r"[a-z0-9][a-z0-9'+-]*", text.lower()) if w not in STOP]


def score(tokens, vocabulary):
    return sum(1 for t in tokens if t in vocabulary or any(t.startswith(v) and len(v) > 3 for v in vocabulary))


def block_hours():
    return '**Opening hours**\n' + '\n'.join(f'- {h}' for h in knowledge.SITE['hours'])


def block_contact():
    c = knowledge.SITE
    data = knowledge._cms('site')
    phones = data.get('phones') if isinstance(data.get('phones'), list) and data.get('phones') else c['phones']
    email = data.get('email') or c['email']
    return (f"You can reach ADRAM Technologies in {data.get('location') or c['location']}:\n\n"
            f"- **Phone:** {', '.join(phones)}\n- **WhatsApp:** [chat with us]({c['whatsapp']})\n- **Email:** {email}\n"
            f"- **Contact form:** [send us a message](/contact)\n\n{block_hours()}")


_contact_text = block_contact


def _services():
    edited = knowledge._cms('services').get('items')
    if isinstance(edited, list) and edited:
        return [(i.get('id', ''), i.get('title', ''), i.get('summary', '')) for i in edited if isinstance(i, dict) and i.get('title')]
    return knowledge.SERVICES


def _courses():
    from catalog.models import Course
    return list(Course.objects.filter(is_published=True).order_by('title'))


def _course_line(c):
    price = c.fee or (f'NLe {c.price:,.0f}' if c.price else 'free')
    extra = f', {c.duration}' if c.duration else ''
    return f'- [{c.title}](/courses/{c.slug}): {price}{extra}'


def _scholarships():
    from catalog.models import Scholarship
    return list(Scholarship.objects.filter(is_published=True).order_by('deadline', 'name'))


def _scholarship_line(s):
    when = f', deadline {s.deadline:%d %b %Y}' if s.deadline else ''
    return f'- [{s.name}](/scholarships/{s.slug}): {s.get_country_display()}, {s.get_funding_display().lower()}{when}'


def block_services():
    return '\n'.join(f'- [{title}](/services/{sid}): {summary}' for sid, title, summary in _services())


def block_courses():
    rows = _courses()
    if not rows:
        return 'Our training programmes are being updated. Please check the [training page](/courses) soon.'
    listed = '\n'.join(_course_line(c) for c in rows[:8])
    more = f'\n\nThere are {len(rows)} programmes in total: see them all on the [training page](/courses).' if len(rows) > 8 else ''
    return f'**Our training programmes**\n{listed}{more}'


def block_scholarships():
    rows = _scholarships()
    if not rows:
        return 'New scholarships are added regularly on the [scholarships page](/scholarships).'
    listed = '\n'.join(_scholarship_line(s) for s in rows[:6])
    more = f'\n\nThere are {len(rows)} in total: see them all on the [scholarships page](/scholarships).' if len(rows) > 6 else ''
    return f'**Scholarships you can apply for now**\n{listed}{more}'


def _best(items, tokens, text_of):
    """The item whose name matches the question best (needs at least one meaningful word in common)."""
    tokens = [t for t in tokens if t not in GENERIC]
    best, best_score = None, 0
    for item in items:
        name = words(text_of(item))
        s = sum(2 if t in name else 0 for t in tokens) + sum(1 for t in tokens if any(n.startswith(t) and len(t) > 3 for n in name))
        if s > best_score:
            best, best_score = item, s
    return best if best_score >= 2 else None


APPLY_STEPS = ('**How ADRAM helps you apply for a scholarship**\n\n'
               '1. [Create a free account](/join) and choose **Scholarships**.\n'
               '2. Browse the [scholarships](/scholarships) and save the ones you like.\n'
               '3. On a scholarship, choose **ADRAM applies for you** to ask our team to handle your application.\n'
               '4. Once ADRAM approves your request, pay the service fee and upload your documents.\n'
               '5. Fill in the application form and sign the service agreement in your portal.\n'
               '6. Follow every step of your application and its result in your student portal.\n\n'
               'You can also apply on your own using the official link on each scholarship page.')


def answer(question, user=None, faqs=None):
    """Returns (markdown reply, handoff). The admin's own questions and answers come first."""
    from . import faqs as faq_list
    hit = faq_list.match(question, faqs or [])
    if hit:
        return faq_list.render(hit['answer']), bool(hit.get('handoff'))
    q = question.lower()
    tokens = words(question)
    raw = re.findall(r"[a-z0-9'-]+", q)
    intent = {name: score(raw if name in ('greet', 'thanks', 'services') else tokens, vocab) for name, vocab in INTENTS.items()}
    if 'how much' in q:
        intent['price'] += 2
    first_name = f' {user.first_name}' if user is not None and getattr(user, 'is_authenticated', False) and user.first_name else ''

    # A person, please
    if intent['human'] and not (intent['courses'] or intent['scholarships']):
        return ('Of course. Someone from the ADRAM team will be happy to help you. Choose how you’d like to reach us below, '
                'or use the [contact form](/contact).', True)

    # A particular course or scholarship named in the question
    courses = _courses() if intent['courses'] or intent['price'] or len(tokens) <= 6 else []
    course = _best(courses, tokens, lambda c: c.title) if courses else None
    if course and (intent['courses'] or intent['price'] or not intent['scholarships']):
        price = course.fee or (f'NLe {course.price:,.0f}' if course.price else 'Free')
        lines = [f'**{course.title}**', '', course.summary.strip()[:400], '', f'- **Fee:** {price}', f'- **Level:** {course.get_level_display()}']
        if course.duration:
            lines.append(f'- **Duration:** {course.duration}')
        lines += ['', f'See the full details and enrol on the [course page](/courses/{course.slug}).']
        return '\n'.join(lines), False
    scholarships = _scholarships() if intent['scholarships'] or intent['apply'] or len(tokens) <= 6 else []
    sch = _best(scholarships, tokens, lambda s: f'{s.name} {s.provider}') if scholarships else None
    if sch:
        lines = [f'**{sch.name}** ({sch.provider})', '', sch.summary.strip()[:400], '',
                 f'- **Destination:** {sch.get_country_display()}', f'- **Funding:** {sch.get_funding_display()}']
        if sch.levels:
            lines.append(f"- **Study level:** {', '.join(map(str, sch.levels))}")
        if sch.deadline:
            lines.append(f'- **Deadline:** {sch.deadline:%d %B %Y}')
        elif sch.application_window:
            lines.append(f'- **When to apply:** {sch.application_window}')
        if sch.service_enabled:
            lines.append(f"- **ADRAM can apply for you**{f' (service fee: {sch.service_fee})' if sch.service_fee else ''}")
        lines += ['', f'Read everything on the [scholarship page](/scholarships/{sch.slug}).']
        return '\n'.join(lines), False

    # A particular service
    service_scores = {sid: score(tokens, vocab) for sid, vocab in SERVICE_WORDS.items()}
    sid, s_score = max(service_scores.items(), key=lambda kv: kv[1])
    if s_score and not intent['courses'] and not intent['scholarships']:
        match = next((s for s in _services() if s[0] == sid), None)
        if match:
            text = (f'**{match[1]}**\n\n{match[2]}\n\nRead more on the [{match[1]} page](/services/{match[0]}). '
                    'For a price, tell us about your project and we’ll send you a quote.')
            return text, bool(intent['price'])

    if intent['contact'] and intent['contact'] >= max(intent['courses'], intent['scholarships'], intent['services']):
        return _contact_text(), False
    if intent['apply'] and (intent['scholarships'] or not intent['courses']):
        return APPLY_STEPS, False
    if intent['scholarships']:
        intro = 'ADRAM helps students find and win international scholarships. We can guide you, or apply on your behalf.\n\n' + block_scholarships()
        return intro + '\n\nAsk me “how do I apply?” to see the steps.', False
    if intent['courses'] or (intent['price'] and not intent['services']):
        if not _courses():
            return block_courses() + ' Or contact the team.', True
        return block_courses() + '\n\nEvery programme is practical and project-based, with a certificate when you finish.', False
    if intent['services']:
        return f'**What ADRAM Technologies offers**\n{block_services()}\n\nTell me which one interests you, or [request a quote](/contact).', False
    if intent['account']:
        return ('**Your ADRAM account**\n\n- New here? [Create a free account](/join).\n- Already registered? [Sign in](/login).\n'
                '- Forgot your password? Use [reset your password](/forgot-password).\n\nYour portal is where you follow courses, scholarship applications and messages.'), False
    if intent['team']:
        from team.models import TeamProfile
        members = TeamProfile.objects.filter(is_published=True, user__is_active=True).select_related('user')[:8]
        listed = '\n'.join(f'- [{m.name}](/team/{m.slug}), {m.job_title}' for m in members)
        return (f'**Meet the team**\n{listed}\n\nSee everyone on the [team page](/about/team).' if listed
                else 'Meet the people behind ADRAM on the [team page](/about/team).'), False
    if intent['blog']:
        from blog.models import Post
        posts = list(Post.live.all()[:5])
        listed = '\n'.join(f'- [{p.title}](/blog/{p.slug})' for p in posts)
        return (f'**Latest articles**\n{listed}\n\nRead more on the [blog](/blog).' if listed else 'Visit our [blog](/blog) for news and guides.'), False
    if intent['thanks']:
        return 'You’re welcome! Is there anything else I can help you with?', False
    if intent['greet']:
        return (f'Hello{first_name}! I can help you with:\n\n- our [services](/services) for organisations\n- [training programmes](/courses) and their fees\n'
                '- [scholarships](/scholarships) and how ADRAM can apply for you\n- how to [contact the team](/contact)\n\nWhat would you like to know?'), False
    return ('I’m not sure about that one. I can tell you about our [services](/services), [training programmes](/courses), '
            '[scholarships](/scholarships) or how to reach the team. You can also ask a person directly:'), True
