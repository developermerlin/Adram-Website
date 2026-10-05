"""
Ready-made questions and answers (Admin → Chatbot → Questions & answers). The assistant answers these exactly as the
admin wrote them, whether or not an AI key is set. Answers are Markdown and may contain live blocks:
{services}, {courses}, {scholarships}, {contact} and {hours}, filled from the website's current content.
"""
import re
import uuid

LIMITS = {'question': 200, 'answer': 4000, 'keywords': 300}
MAX_FAQS = 150
BLOCKS = ('services', 'courses', 'scholarships', 'contact', 'hours')


def _faq(question, answer, keywords='', show=True, handoff=False):
    return {'id': uuid.uuid5(uuid.NAMESPACE_URL, question).hex[:12], 'question': question, 'answer': answer,
            'keywords': keywords, 'show': show, 'handoff': handoff}


DEFAULT_FAQS = [
    _faq('What services does ADRAM offer?',
         'ADRAM Technologies is an IT company in Freetown. We build and look after the technology organisations run on:\n\n{services}\n\n'
         'Tell us about your project and we’ll send you a quote: [request a quote](/contact).',
         'services, offer, provide, what do you do, company'),
    _faq('How much does a website or app cost?',
         'Every project is different, so we price each one after we understand what you need: the number of pages or screens, '
         'the features, and who will manage it afterwards.\n\n[Tell us about your project](/contact) or message us on WhatsApp, '
         'and we’ll send you a clear quote.',
         'price, cost, quote, website cost, app cost, how much website', handoff=True),
    _faq('Which training programmes can I join?',
         '{courses}\n\nEvery programme is practical and project-based. Open a programme to see what you’ll learn, then choose **Enroll now**.',
         'training, programmes, courses, classes, learn, study'),
    _faq('How can ADRAM help me apply for a scholarship?',
         '1. [Create a free account](/join) and choose **Scholarships**.\n'
         '2. Browse the [scholarships](/scholarships) and save the ones you like.\n'
         '3. On a scholarship, choose **ADRAM applies for you** to ask our team to handle your application.\n'
         '4. Once ADRAM approves your request, pay the service fee and upload your documents.\n'
         '5. Fill in the application form and sign the service agreement in your portal.\n'
         '6. Follow every step of your application and its result in your student portal.\n\n'
         'You can also apply on your own using the official link on each scholarship page.',
         'apply scholarship, apply for a scholarship, apply for scholarship, scholarship application, help me apply, how to apply'),
    _faq('How do I contact the team?',
         '{contact}',
         'contact, phone, call, email, whatsapp, reach'),
    _faq('How do I enroll in a course?',
         '1. [Create a free account](/join), or [sign in](/login) if you have one.\n'
         '2. Open the course on the [training page](/courses).\n'
         '3. Choose **Enroll now** (some courses ask you to request a place first).\n'
         '4. Find the course in your dashboard and start learning.',
         'enroll, enrol, register course, join course, sign up course'),
    _faq('Will I get a certificate?',
         'Yes. When you complete a programme you receive an ADRAM certificate with its own code. '
         'Anyone, such as an employer, can check it on the [certificate check page](/verify).',
         'certificate, certified, get a certificate'),
    _faq('Which scholarships are open now?',
         '{scholarships}',
         'scholarships open, available scholarships, list scholarships, study abroad'),
    _faq('What documents do I need for a scholarship?',
         'Most scholarships ask for:\n\n- a valid passport\n- your academic certificates and transcripts\n- a CV\n'
         '- a personal statement or motivation letter\n- recommendation letters\n- proof of English, if required\n\n'
         'Each [scholarship page](/scholarships) lists exactly what that scholarship needs.',
         'documents, requirements, papers, transcripts, passport, needed'),
    _faq('Does ADRAM guarantee that I will win a scholarship?',
         'No. The decision always belongs to the scholarship provider. What we do is help you choose scholarships that fit you, '
         'prepare strong documents and submit a complete application on time.',
         'guarantee, sure, promise, chance, win'),
    _faq('Where is your office and when are you open?',
         '{contact}',
         'office, location, address, located, where, hours, open, opening, closing, time'),
    _faq('How do I create an account?',
         '[Create a free account](/join) and choose what you’re here for: training, scholarships or services. '
         'Already registered? [Sign in](/login).',
         'account, register, sign up, signup, create account'),
    _faq('I forgot my password',
         'No problem. Use [reset your password](/forgot-password) and we’ll email you a link to choose a new one.',
         'forgot password, reset password, cannot login, can\'t sign in, password', show=False),
    _faq('Do you repair computers?',
         'We can help. Our hardware team supplies quality computers and equipment and handles repairs, upgrades and maintenance. '
         'See [Computer Hardware](/services/hardware) or [contact us](/contact) to book a repair.',
         'repair, fix, laptop, computer, printer, broken', show=False),
    _faq('Can I talk to a person?',
         'Of course. Someone from the ADRAM team will be happy to help. Choose how you’d like to reach us below.',
         'human, person, agent, staff, someone, talk to', show=False, handoff=True),
]

# More answers taken from the website's own pages (about, contact, training, scholarships, store, partners, and
# the questions on each service page). Answered when typed; only a few are offered as buttons.
DEFAULT_FAQS += [
    # ---- About ADRAM
    _faq('What is ADRAM Technologies?',
         'ADRAM Technologies is a technology company in Freetown, Sierra Leone, helping organisations work smarter and helping people build careers in tech.\n\n'
         '- **IT services:** websites, software, mobile apps, networks, hardware, AI, data analytics, consultancy and design\n'
         '- **Training:** practical courses for individuals and organisations\n'
         '- **Scholarships:** guidance for students who want to study abroad\n\n'
         'Read more [about us](/about).',
         'about adram, who are you, about you, about the company, what is adram, tell me about adram'),
    _faq('What are ADRAM’s mission and vision?',
         '**Our mission:** make dependable technology and digital skills accessible to everyone we serve.\n\n'
         '**Our vision:** a Sierra Leone where every organisation and every young person can thrive in the digital economy.\n\n'
         'Our values are partnership, quality, innovation and empowerment. See [about us](/about).',
         'mission, vision, values', show=False),
    _faq('Who do you work with?',
         'We deliver IT solutions for businesses, schools, NGOs and public institutions, and we train individuals and teams. '
         'See the organisations we work with on our [partners page](/partners).',
         'your clients, who are your customers, do you work with ngos, do you work with schools, work with government', show=False),
    _faq('How quickly do you reply to messages?',
         'We reply to messages within one working day. For anything urgent, call or WhatsApp us.\n\n{contact}',
         'reply time, how long to reply, response time, when will you reply, how fast', show=False),

    # ---- Payments and online learning
    _faq('How can I pay?',
         'You can pay for courses and ADRAM Premium by **Orange Money, Afrimoney or card**.\n\n'
         'For projects and the scholarship application service, the amount and payment plan are set out in your quote or service agreement.',
         'payment methods, pay with, orange money, afrimoney, mobile money, card payment, how do i pay, bank transfer'),
    _faq('What is ADRAM Premium?',
         'ADRAM Premium is one plan that opens every Premium course while it’s active:\n\n'
         '- every Premium course, as long as your plan is active\n- certificates for the courses you finish\n'
         '- pay by Orange Money, Afrimoney or card\n- no automatic charges: you choose when to renew\n\n'
         'You can still buy single courses to keep for good. See [ADRAM Premium](/premium).',
         'premium, subscription, premium plan, all courses'),
    _faq('Will Premium charge me automatically?',
         'No. ADRAM Premium never renews by itself. When your time runs out, you choose whether to add more. See [ADRAM Premium](/premium).',
         'auto renew, renew automatically, automatic charge, charge automatically, cancel premium, renew premium, premium renew', show=False),
    _faq('What are course bundles?',
         'Bundles are courses that go well together, sold for less than buying them one by one. See the [course bundles](/bundles).',
         'bundle, bundles, course package, discount', show=False),
    _faq('How can I check that an ADRAM certificate is real?',
         'Enter the certificate ID printed at the bottom of the certificate (for example ADR-1A2B-3C4D-5E6F) on the [certificate check page](/verify).',
         'verify certificate, check certificate, certificate id, fake certificate, employer check', show=False),
    _faq('Are your courses online or in person?',
         'Both. Some programmes are instructor-led classes in Freetown with hands-on lab time, and we also deliver corporate training at your organisation. '
         'Online courses are taken in your ADRAM portal at your own pace.\n\nSee every programme on the [training page](/courses).',
         'online course, in person, classroom, physical class, distance learning, learn online, where are classes'),

    # ---- Training
    _faq('Do I need any experience to join a programme?',
         'Not for our foundation programmes such as Touch Typing and Programming Foundations: they start from zero. '
         'If you’re unsure whether a programme suits you, [ask us](/contact) and we’ll advise.',
         'experience, beginner, no experience, complete beginner, start from zero, prerequisites', show=False),
    _faq('How much do programmes cost, and when do they start?',
         'Each programme shows its fee and next intake once they are confirmed. If they aren’t shown yet, use “Ask about dates & fees” on the programme, '
         'or [contact us](/contact), and we’ll reply within one working day.\n\n{courses}',
         'course fee, course price, training fee, training cost, start date, next intake, when does the course start, intake'),
    _faq('Can you train our staff or students as a group?',
         'Yes. We deliver corporate and group training at your organisation, tailored to your team’s needs. '
         '[Contact us](/contact) with your goals and group size.',
         'corporate training, group training, train our staff, staff training, train our students, school training', handoff=True),
    _faq('How long does it take to learn touch typing?',
         'Most learners type without looking within a few weeks of regular practice, and speed keeps improving with practice. '
         'We set a plan after your first assessment. See [Touch Typing](/services/typing).',
         'learn typing, typing duration, how long typing', show=False),
    _faq('Can children and complete beginners learn touch typing?',
         'Yes. We start from the very beginning, at a pace that suits each learner, whether a child or an adult who has never used a keyboard. '
         'We also run classes for schools, offices and organisations, at your premises or ours.',
         'typing for children, kids typing, children typing, typing beginners, typing for schools', show=False),

    # ---- Scholarships
    _faq('Does ADRAM award these scholarships?',
         'No. Each scholarship is awarded by its own provider, such as a government, foundation or university. '
         'ADRAM helps you choose the right ones and prepare strong applications.',
         'who awards, adram scholarship, do you give scholarships, does adram give', show=False),
    _faq('Can I apply for more than one scholarship?',
         'Usually yes, and applying to several improves your chances. Check each programme’s rules, as a few limit parallel applications.',
         'more than one scholarship, several scholarships, multiple scholarships, many scholarships', show=False),
    _faq('When should I start preparing for a scholarship?',
         'Early. Many deadlines fall six to twelve months before the course starts, and gathering documents and references takes time. '
         'See the open [scholarships](/scholarships) and their deadlines.',
         'when to start, start preparing, deadline, deadlines, when to apply', show=False),
    _faq('Do I need IELTS or TOEFL?',
         'It depends on the programme and university. Some accept proof that your previous degree was taught in English; others require a test score. '
         'Each [scholarship page](/scholarships) says what it needs.',
         'ielts, toefl, english test, english proficiency, duolingo', show=False),
    _faq('What help does ADRAM give with scholarship applications?',
         '- **Finding the right fit:** we match your profile to scholarships you have a real chance of winning\n'
         '- **Application review:** feedback on your essays, statement of purpose, CV and documents before you submit\n'
         '- **Deadline tracking:** your student portal keeps every application and deadline in one place\n'
         '- **Pre-departure advice:** guidance on visas, travel and settling in once you’re accepted\n\n'
         '[Book a consultation](/contact?subject=Scholarship%20consultation) to get started.',
         'scholarship help, scholarship support, essay review, statement of purpose, visa help, pre-departure'),
    _faq('How do I book a scholarship consultation?',
         'Send us a message through the [consultation form](/contact?subject=Scholarship%20consultation), or call or WhatsApp us. '
         'A counsellor will help you shortlist the right scholarships and plan your application.',
         'book consultation, consultation, counsellor, counselor, meet a counsellor, scholarship advice', handoff=True),
    _faq('Why do I need an account to open the official scholarship website?',
         'Official links, saved scholarships and application tracking are for ADRAM members. Creating a free account takes about a minute: '
         'confirm your email with the 6-digit code we send, and you’re taken straight back to the scholarship with its official website unlocked.\n\n'
         '[Create a free account](/join)',
         'official website, official link, scholarship link, locked, why account, see official', show=False),
    _faq('What is the scholarship service agreement?',
         'When ADRAM applies for a scholarship on your behalf, you sign a service agreement in your student portal. It sets out the service, the fee and the payment plan. '
         'You can sign it online, or download it, sign it on paper and upload it.',
         'service agreement, agreement, contract, sign agreement', show=False),

    # ---- Account
    _faq('How do I verify my email?',
         'After you create your account we email you a 6-digit code. Enter it on the screen to confirm your email. '
         'Didn’t get it? Check your spam folder, or ask for a new code on the same screen.',
         'verify email, verification code, 6 digit code, otp, confirm email, did not receive code, no code', show=False),

    # ---- Partners
    _faq('How can my organisation become a partner?',
         '1. Tell us about you: send the short form on the [partners page](/partners).\n'
         '2. Meet our team: we arrange a call within two working days.\n'
         '3. Agree a plan with clear goals, responsibilities and timelines.\n'
         '4. Launch and grow, reviewing the results regularly.',
         'partner, partnership, become a partner, sponsor, collaborate, collaboration', show=False),

    # ---- Web development
    _faq('How long does a website take to build?',
         'A company website typically takes a few weeks; larger web applications take longer. We give you a timeline after the first consultation. '
         'See [Web Development](/services/web-development).',
         'how long website, website timeline, website duration, build a website', show=False),
    _faq('Can we update our website ourselves?',
         'Yes. We can set up an easy editing area and show your team how to use it.',
         'update website, edit website, manage website ourselves, change content', show=False),
    _faq('Do you provide website hosting and a domain name?',
         'We can arrange hosting, domain registration and email for you, or work with what you already have.',
         'hosting, domain, domain name, business email, website email', show=False),

    # ---- Mobile apps
    _faq('Do I need separate apps for Android and iPhone?',
         'Usually not. We build one cross-platform app that runs on both, which saves time and cost. See [Mobile Development](/services/mobile-development).',
         'android and iphone, android and ios, cross platform, both platforms', show=False),
    _faq('Will you publish our app on Google Play and the App Store?',
         'Yes. We prepare the store listings and handle submission to Google Play and the App Store.',
         'publish app, play store, app store, google play', show=False),
    _faq('Can the app work offline?',
         'Many features can work offline and sync when a connection is available. We plan this during scoping.',
         'offline app, without internet, no internet', show=False),

    # ---- Software
    _faq('Can you move our existing data into a new system?',
         'Yes. We migrate data from spreadsheets or older systems as part of the rollout. See [Software Development](/services/software-development).',
         'data migration, migrate data, move data, import data, old system', show=False),
    _faq('Who owns the software you build?',
         'Ownership terms are agreed in the contract before work begins, so you know exactly what you’re getting.',
         'own the software, software ownership, source code, who owns', show=False),
    _faq('What happens after our software or website launches?',
         'We offer support and maintenance plans for fixes, updates and new features.',
         'after launch, support plan, maintenance plan, maintenance, aftercare', show=False),

    # ---- Networking
    _faq('Can you work with our existing network equipment?',
         'Yes. We assess what you have and reuse it where it makes sense. See [Computer Networking](/services/networking).',
         'existing equipment, our equipment, reuse equipment', show=False),
    _faq('Do you offer network maintenance contracts?',
         'Yes. We offer ongoing support so problems are fixed quickly and the network stays healthy.',
         'network maintenance, network support, it support contract, maintenance contract', show=False),
    _faq('Can you connect our branch offices?',
         'Yes. We can link sites securely so teams share systems and files.',
         'branch offices, connect offices, multiple offices, link sites, vpn', show=False),

    # ---- Hardware
    _faq('Do you sell new computers?',
         'Yes. We supply laptops, desktops, printers and accessories that fit your needs and budget, and advise before you buy. '
         'See [Computer Hardware](/services/hardware).',
         'buy computer, buy laptop, sell computers, sell laptops, new laptop, printer for sale, accessories', show=False),
    _faq('Can you upgrade an old computer instead of replacing it?',
         'Often, yes. Adding memory or replacing a slow hard drive with an SSD makes many older machines fast again, and costs far less than a new one.',
         'upgrade computer, slow computer, slow laptop, laptop is slow, computer is slow, laptop is very slow, computer is very slow, ssd, more ram, old computer', show=False),
    _faq('Will I lose my files during a repair?',
         'We take care to protect your data, and we recommend a backup first. If a drive has failed, we can try to recover your files.',
         'lose files, data recovery, recover files, lost files, backup', show=False),

    # ---- AI
    _faq('Do we need a lot of data to use AI?',
         'Not always. Many useful tools, like assistants and document processing, work with modest amounts of data. See [AI & Machine Learning](/services/ai-machine-learning).',
         'data for ai, ai data, need data', show=False),
    _faq('Is our data safe with your AI solutions?',
         'We design solutions with privacy in mind and explain exactly where your data goes and who can access it.',
         'ai privacy, data safe, data privacy, data security', show=False),
    _faq('Where should we start with AI?',
         'With a short consultation to find one task where AI can save time. A small pilot proves the value first.',
         'start with ai, use ai, ai for my business, adopt ai, automation', show=False),

    # ---- Data analytics
    _faq('We only have spreadsheets. Is that enough for data analytics?',
         'Yes. Spreadsheets are a common starting point. We clean them, combine them and turn them into dashboards and reports. '
         'See [Data Analytics](/services/data-analytics).',
         'spreadsheets, excel, only excel', show=False),
    _faq('Can dashboards update automatically?',
         'Yes. Once connected to your data, dashboards refresh as new records arrive, so you always see the latest picture.',
         'dashboard update, live dashboard, automatic dashboard, real time dashboard', show=False),
    _faq('Can you help with reports for funders and donors?',
         'Yes. We set up indicators and tracking so results are recorded consistently, and prepare clear reports for donors and boards.',
         'donor reports, funder reports, m&e, monitoring and evaluation, ngo reports, board reports', show=False),

    # ---- IT consultancy
    _faq('Is the first consultation free?',
         'Yes. The first conversation is free, so we can understand what you need. [Contact us](/contact) to arrange it.',
         'free consultation, consultation fee, first meeting free, free advice', handoff=True),
    _faq('Are you independent of suppliers?',
         'Our advice is based on what fits your needs. We’ll tell you when a simpler or cheaper option is the right one. See [IT Consultancy](/services/it-consultancy).',
         'independent, supplier, vendor, unbiased', show=False),
    _faq('Can you help us write a tender or request for proposals?',
         'Yes. We can define requirements and help evaluate supplier responses.',
         'tender, rfp, request for proposals, procurement, bid', show=False),

    # ---- Digital transformation
    _faq('Do we have to change everything at once to go digital?',
         'No. We work in phases, starting with the changes that bring the biggest benefit. See [Digital Transformation](/services/digital-transformation).',
         'go digital, change everything, digital transformation, go paperless', show=False),
    _faq('What if our staff aren’t comfortable with technology?',
         'Training is built into every phase, and we support your team until they’re confident.',
         'staff not comfortable, staff not good with computers, not tech savvy, train our team', show=False),
    _faq('How do you protect our data when moving to new systems?',
         'We plan migrations carefully, keep backups and control who has access at every step.',
         'protect data, data during migration, data safe migration', show=False),

    # ---- Graphic design
    _faq('Do I own the designs and photos?',
         'Ownership and usage terms are agreed before work begins, so you know exactly what you can use and where. See [Graphic Design & Photography](/services/graphic-design).',
         'own designs, own photos, design ownership, copyright', show=False),
    _faq('Can you design a full brand, not just a logo?',
         'Yes. We can create a complete identity with colours, fonts, templates and guidelines, so everything you publish looks consistent.',
         'full brand, branding, brand identity, logo design, logo', show=False),
    _faq('How many design revisions are included?',
         'We agree a number of revision rounds in the quote, and we keep refining until the design does its job.',
         'revisions, changes to design, how many changes', show=False),
]


def clean(items):
    """Validated list of FAQs from the admin's form, or raises ValueError with a message for the admin."""
    if not isinstance(items, list):
        raise ValueError('Questions and answers must be a list.')
    out, seen = [], set()
    for n, raw in enumerate(items[:MAX_FAQS], start=1):
        if not isinstance(raw, dict):
            continue
        row = {k: str(raw.get(k) or '').strip()[:limit] for k, limit in LIMITS.items()}
        if not row['question'] and not row['answer']:
            continue
        if not row['question'] or not row['answer']:
            raise ValueError(f'Question {n} needs both a question and an answer.')
        key = norm(row['question'])
        if key in seen:
            raise ValueError(f'“{row["question"]}” is listed twice.')
        seen.add(key)
        fid = str(raw.get('id') or '')
        row['id'] = fid if re.fullmatch(r'[0-9a-z]{6,32}', fid) else uuid.uuid4().hex[:12]
        row['show'], row['handoff'] = bool(raw.get('show')), bool(raw.get('handoff'))
        out.append(row)
    return out


def norm(text):
    return ' '.join(re.findall(r"[a-z0-9]+", text.lower()))


def match(question, faqs):
    """The FAQ that answers this question, or None. A tapped button matches exactly; typed questions need most of
    the FAQ's words, or one of its keyword phrases."""
    from .local import words
    q = norm(question)
    if not q:
        return None
    asked = set(words(question))
    best, best_score = None, 0.0
    for faq in faqs:
        if norm(faq.get('question', '')) == q:
            return faq
        own = set(words(faq.get('question', '')))
        overlap = len(asked & own) / len(own) if own else 0
        score = overlap if overlap >= 0.75 and len(asked & own) >= 2 else 0
        for phrase in (p.strip() for p in (faq.get('keywords') or '').split(',')):
            p = norm(phrase)
            # one-word keywords only decide short messages ("hours?", "price"); phrases decide any message
            if p and len(p) > 2 and (' ' in p or len(asked) <= 2) and re.search(rf'\b{re.escape(p)}\b', q):
                score = max(score, 0.6 + 0.05 * len(p.split()))
        if score > best_score:
            best, best_score = faq, score
    return best if best_score >= 0.6 else None


def render(answer):
    """Fills the live blocks ({services}, {courses}, ...) with the website's current content."""
    if '{' not in answer:
        return answer
    from . import local
    blocks = {name: (lambda f=getattr(local, f'block_{name}'): f()) for name in BLOCKS}
    return re.sub(r'\{(' + '|'.join(BLOCKS) + r')\}', lambda m: blocks[m.group(1)](), answer)
