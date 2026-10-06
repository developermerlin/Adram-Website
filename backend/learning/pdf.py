"""
A field's notes as one downloadable PDF book (ReportLab):

  cover · about the field and the five levels · contents (with page numbers) ·
  each level → its topics → its notes (objectives, the text, tables, callouts, code, pictures, resources)

The fonts are the website's own (Sora for headings, DM Sans for text, JetBrains Mono for code), shipped as static
files in learning/fonts with their OFL licences. Colours follow Site content → theme. Pictures from this website
(/media/... and the site's own /images) are embedded; pictures from other websites are shown as a link.
"""
import io
import re
from datetime import date
from functools import lru_cache
from html import escape
from pathlib import Path

from django.conf import settings
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (BaseDocTemplate, CondPageBreak, Flowable, Frame, Image, KeepTogether, NextPageTemplate,
                                PageBreak, PageTemplate, Paragraph, Spacer, Table, TableStyle)
from reportlab.platypus.tableofcontents import TableOfContents

FONTS = Path(__file__).resolve().parent / 'fonts'
PAGE_W, PAGE_H = A4
MARGIN = 20 * mm
WIDTH = PAGE_W - 2 * MARGIN
LEVEL_NAMES = ['Zero', 'Foundations', 'Intermediate', 'Advanced', 'Hero']
KINDS = {'note': 'Note', 'research': 'Research note', 'lab': 'Hands-on lab', 'cheatsheet': 'Cheat sheet'}
LANGS = {'cmd': 'Command Prompt', 'powershell': 'PowerShell', 'ps': 'PowerShell', 'bash': 'Terminal', 'sh': 'Terminal', 'shell': 'Terminal',
         'zsh': 'Terminal', 'cisco': 'Cisco IOS', 'ios': 'Cisco IOS', 'python': 'Python', 'py': 'Python', 'js': 'JavaScript',
         'javascript': 'JavaScript', 'html': 'HTML', 'css': 'CSS', 'sql': 'SQL', 'json': 'JSON', 'yaml': 'YAML', 'yml': 'YAML',
         'text': 'Text', 'txt': 'Text', 'config': 'Configuration', 'conf': 'Configuration', 'php': 'PHP', 'java': 'Java'}
CALLOUTS = {'note': ('Note', 'blue'), 'tip': ('Tip', 'green'), 'warning': ('Warning', 'amber'), 'important': ('Important', 'red')}
SUPERSCRIPTS = {'⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', 'ⁿ': 'n', 'ʰ': 'h'}
YOUTUBE = re.compile(r'^https?://(?:www\.)?(?:youtube\.com/watch\?(?:.*&)?v=|youtu\.be/|youtube\.com/shorts/)([\w-]{11})\S*$', re.I)


@lru_cache(maxsize=1)
def register_fonts():
    for name in ('DMSans-Regular', 'DMSans-Bold', 'Sora-SemiBold', 'Sora-Bold', 'JetBrainsMono-Regular', 'JetBrainsMono-Bold'):
        pdfmetrics.registerFont(TTFont(name, str(FONTS / f'{name}.ttf')))
    pdfmetrics.registerFontFamily('DMSans', normal='DMSans-Regular', bold='DMSans-Bold', italic='DMSans-Regular', boldItalic='DMSans-Bold')
    pdfmetrics.registerFontFamily('JetBrainsMono', normal='JetBrainsMono-Regular', bold='JetBrainsMono-Bold',
                                  italic='JetBrainsMono-Regular', boldItalic='JetBrainsMono-Bold')
    return True


# ---------------------------------------------------------------- colours and text styles

def palette():
    """The site's three theme colours (Site content → theme), and lighter tints made from them."""
    from cms.models import PageContent
    row = PageContent.objects.filter(slug='site').first()
    theme = (row.data.get('theme') if row and isinstance(row.data, dict) else None) or {}

    def colour(value, fallback):
        return colors.HexColor(value) if isinstance(value, str) and re.fullmatch(r'#[0-9a-fA-F]{6}', value) else colors.HexColor(fallback)

    primary, accent, dark = colour(theme.get('primary'), '#1454e8'), colour(theme.get('accent'), '#16c8f5'), colour(theme.get('dark'), '#06123d')

    def tint(c, amount):
        return colors.Color(c.red + (1 - c.red) * amount, c.green + (1 - c.green) * amount, c.blue + (1 - c.blue) * amount)

    return {
        'primary': primary, 'accent': accent, 'dark': dark, 'ink': colors.HexColor('#111827'), 'text': colors.HexColor('#374151'),
        'muted': colors.HexColor('#6b7280'), 'line': colors.HexColor('#e5e7eb'), 'surface': colors.HexColor('#f7f7f8'),
        'tint': tint(primary, 0.92), 'tint2': tint(primary, 0.85),
        'blue': (colors.HexColor('#eff6ff'), colors.HexColor('#bfdbfe'), colors.HexColor('#1d4ed8')),
        'green': (colors.HexColor('#ecfdf5'), colors.HexColor('#a7f3d0'), colors.HexColor('#047857')),
        'amber': (colors.HexColor('#fffbeb'), colors.HexColor('#fde68a'), colors.HexColor('#b45309')),
        'red': (colors.HexColor('#fef2f2'), colors.HexColor('#fecaca'), colors.HexColor('#b91c1c')),
    }


def styles(c):
    base = dict(fontName='DMSans-Regular', fontSize=10.5, leading=16, textColor=c['text'])
    return {
        'body': ParagraphStyle('body', **base, spaceAfter=7),
        'small': ParagraphStyle('small', **{**base, 'fontSize': 9, 'leading': 13, 'textColor': c['muted']}),
        'lead': ParagraphStyle('lead', **{**base, 'fontSize': 12, 'leading': 18, 'textColor': c['text']}, spaceAfter=6),
        'eyebrow': ParagraphStyle('eyebrow', fontName='DMSans-Bold', fontSize=8.5, leading=12, textColor=c['primary'], spaceAfter=4),
        'h1': ParagraphStyle('h1', fontName='Sora-Bold', fontSize=22, leading=28, textColor=c['ink'], spaceAfter=6),
        'level': ParagraphStyle('level', fontName='Sora-Bold', fontSize=30, leading=36, textColor=c['ink'], spaceAfter=8),
        'topic': ParagraphStyle('topic', fontName='Sora-SemiBold', fontSize=15, leading=20, textColor=c['primary'], spaceBefore=2, spaceAfter=3),
        'h2': ParagraphStyle('h2', fontName='Sora-SemiBold', fontSize=14, leading=19, textColor=c['ink'], spaceBefore=10, spaceAfter=5),
        'h3': ParagraphStyle('h3', fontName='Sora-SemiBold', fontSize=12, leading=16, textColor=c['ink'], spaceBefore=8, spaceAfter=4),
        'bullet': ParagraphStyle('bullet', **base, leftIndent=14, bulletIndent=2, spaceAfter=3),
        'quote': ParagraphStyle('quote', **{**base, 'fontSize': 11.5, 'leading': 17, 'textColor': c['ink']}, leftIndent=12),
        'cell': ParagraphStyle('cell', **{**base, 'fontSize': 9.2, 'leading': 13}),
        'cellhead': ParagraphStyle('cellhead', **{**base, 'fontName': 'DMSans-Bold', 'fontSize': 9.2, 'leading': 13, 'textColor': c['ink']}),
        'code': ParagraphStyle('code', fontName='JetBrainsMono-Regular', fontSize=8.6, leading=12.5, textColor=colors.HexColor('#1f2937')),
        'codehead': ParagraphStyle('codehead', fontName='DMSans-Bold', fontSize=7.8, leading=10, textColor=c['muted']),
        'caption': ParagraphStyle('caption', **{**base, 'fontSize': 9, 'leading': 13, 'textColor': c['muted']}, alignment=TA_CENTER, spaceAfter=8),
        'toc0': ParagraphStyle('toc0', fontName='Sora-SemiBold', fontSize=11.5, leading=16, textColor=c['ink'], spaceBefore=10, leftIndent=0),
        'toc1': ParagraphStyle('toc1', fontName='DMSans-Bold', fontSize=10, leading=14, textColor=c['text'], spaceBefore=4, leftIndent=12),
        'toc2': ParagraphStyle('toc2', fontName='DMSans-Regular', fontSize=9.6, leading=13.5, textColor=c['text'], leftIndent=26),
    }


# ---------------------------------------------------------------- Markdown → flowables (the same syntax as the website)

def inline(text, c):
    """**bold**, *italic*, `code`, [text](link) → ReportLab's paragraph markup, everything else escaped."""
    out, last = [], 0
    pattern = re.compile(r'(\*\*([^*]+)\*\*)|(`([^`]+)`)|(\[([^\]]+)\]\(([^)\s]+)\))|(\*([^*\s][^*]*)\*)|(_([^_\s][^_]*)_)')
    for m in pattern.finditer(text):
        out.append(plain(text[last:m.start()]))
        if m.group(1):
            out.append(f'<b>{inline(m.group(2), c)}</b>')
        elif m.group(3):
            out.append(f'<font name="JetBrainsMono-Regular" size="9" backColor="#f1f2f4">&nbsp;{plain(m.group(4))}&nbsp;</font>')
        elif m.group(5):
            href = m.group(7)
            if href.startswith('/'):
                href = site_url() + href
            if re.match(r'^(https?:|mailto:)', href):
                out.append(f'<link href="{escape(href)}" color="{c["primary"].hexval()}"><u>{inline(m.group(6), c)}</u></link>')
            else:
                out.append(inline(m.group(6), c))
        elif m.group(8):
            out.append(f'<i>{inline(m.group(9), c)}</i>')
        elif m.group(10):
            out.append(f'<i>{inline(m.group(11), c)}</i>')
        last = m.end()
    out.append(plain(text[last:]))
    return ''.join(out)


def plain(text):
    """Escape for ReportLab and turn superscript characters (2ⁿ, 2⁶) into raised text the fonts can draw."""
    s = escape(text, quote=False)
    return re.sub('[' + ''.join(SUPERSCRIPTS) + ']+', lambda m: '<super>' + ''.join(SUPERSCRIPTS[ch] for ch in m.group(0)) + '</super>', s)


def parse_blocks(source):
    """The website's Markdown blocks (utils/markdown.js), as dicts."""
    lines = (source or '').replace('\r\n', '\n').replace('\r', '\n').split('\n')
    blocks, i = [], 0
    is_table_rule = re.compile(r'^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?$')
    while i < len(lines):
        t = lines[i].strip()
        if not t:
            i += 1
            continue
        if t.startswith('```'):
            words = t[3:].split()
            lang = re.sub(r'[^\w+#.-]', '', words[0])[:20] if words else ''
            title = ' '.join(words[1:])[:80]
            code, i = [], i + 1
            while i < len(lines) and not lines[i].strip().startswith('```'):
                code.append(lines[i])
                i += 1
            blocks.append({'type': 'code', 'text': '\n'.join(code), 'lang': lang, 'title': title})
            i += 1
            continue
        m = re.match(r'^(#{1,4})\s+(.+)$', t)
        if m:
            blocks.append({'type': 'h3' if len(m.group(1)) >= 3 else 'h2', 'text': m.group(2).rstrip('#').strip()})
            i += 1
            continue
        if re.fullmatch(r'-{3,}|\*{3,}', t):
            blocks.append({'type': 'hr'})
            i += 1
            continue
        m = re.match(r'^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"(small|medium|full)")?\)$', t)
        if m:
            blocks.append({'type': 'img', 'alt': m.group(1), 'src': m.group(2), 'size': m.group(3) or 'full'})
            i += 1
            continue
        if YOUTUBE.match(t):
            blocks.append({'type': 'video', 'url': t})
            i += 1
            continue
        if t.startswith('>'):
            quote = []
            while i < len(lines) and lines[i].strip().startswith('>'):
                quote.append(re.sub(r'^>\s?', '', lines[i].strip()))
                i += 1
            m = re.match(r'^\[!(NOTE|TIP|WARNING|IMPORTANT)\]\s*(.*)$', quote[0], re.I)
            if m:
                blocks.append({'type': 'callout', 'tone': m.group(1).lower(), 'text': ' '.join([m.group(2)] + quote[1:]).strip()})
            else:
                blocks.append({'type': 'quote', 'text': ' '.join(quote)})
            continue
        if t.startswith('|') and i + 1 < len(lines) and is_table_rule.match(lines[i + 1].strip()):
            def cells(row):
                return [x.strip() for x in row.strip().strip('|').split('|')]
            head, rows, i = cells(t), [], i + 2
            while i < len(lines) and lines[i].strip().startswith('|'):
                rows.append(cells(lines[i]))
                i += 1
            blocks.append({'type': 'table', 'head': head, 'rows': rows})
            continue
        if re.match(r'^[-*]\s+', t) or re.match(r'^\d+[.)]\s+', t):
            ordered = bool(re.match(r'^\d', t))
            marker = re.compile(r'^\d+[.)]\s+' if ordered else r'^[-*]\s+')
            items = []
            while i < len(lines) and marker.match(lines[i].strip()):
                items.append(marker.sub('', lines[i].strip()))
                i += 1
            blocks.append({'type': 'ol' if ordered else 'ul', 'items': items})
            continue
        para = []
        while i < len(lines) and lines[i].strip() and not re.match(r'^(#{1,4}\s|```|>|[-*]\s|\d+[.)]\s|!\[|-{3,}$|\|)', lines[i].strip()) \
                and not YOUTUBE.match(lines[i].strip()):
            para.append(lines[i].strip())
            i += 1
        if para:
            blocks.append({'type': 'p', 'lines': para})
        else:
            i += 1
    return blocks


def boxed(content, c, background, border, padding=10):
    """One-cell table used as a tinted box (callouts, objectives, code)."""
    t = Table([[content]], colWidths=[WIDTH])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), background), ('BOX', (0, 0), (-1, -1), 0.6, border),
        ('LEFTPADDING', (0, 0), (-1, -1), padding), ('RIGHTPADDING', (0, 0), (-1, -1), padding),
        ('TOPPADDING', (0, 0), (-1, -1), padding - 2), ('BOTTOMPADDING', (0, 0), (-1, -1), padding - 2),
        ('ROUNDEDCORNERS', [6, 6, 6, 6]),
    ]))
    return t


def code_block(b, c, st):
    lines = b['text'].split('\n') or ['']
    body = '<br/>'.join(plain(line).replace('  ', '&nbsp; ').replace(' ', '&nbsp;') if line else '&nbsp;' for line in lines)
    label = LANGS.get(b['lang'].lower(), b['lang']) if b['lang'] else 'Code'
    head = f'{escape(label.upper())}' + (f'  ·  <font name="DMSans-Regular" color="{c["text"].hexval()}">{plain(b["title"])}</font>' if b['title'] else '')
    t = Table([[Paragraph(head, st['codehead'])], [Paragraph(body, st['code'])]], colWidths=[WIDTH])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#eef0f3')), ('BACKGROUND', (0, 1), (-1, 1), colors.HexColor('#f8f9fb')),
        ('BOX', (0, 0), (-1, -1), 0.6, colors.HexColor('#d9dde3')), ('LINEBELOW', (0, 0), (-1, 0), 0.6, colors.HexColor('#d9dde3')),
        ('LEFTPADDING', (0, 0), (-1, -1), 10), ('RIGHTPADDING', (0, 0), (-1, -1), 10),
        ('TOPPADDING', (0, 0), (-1, 0), 5), ('BOTTOMPADDING', (0, 0), (-1, 0), 5),
        ('TOPPADDING', (0, 1), (-1, 1), 8), ('BOTTOMPADDING', (0, 1), (-1, 1), 8), ('ROUNDEDCORNERS', [5, 5, 5, 5]),
    ]))
    return t


def table_block(b, c, st):
    cols = max(len(b['head']), *(len(r) for r in b['rows'])) if b['rows'] else len(b['head'])
    pad = lambda row: row + [''] * (cols - len(row))  # noqa: E731
    data = [[Paragraph(inline(x, c), st['cellhead']) for x in pad(b['head'])]]
    data += [[Paragraph(inline(x, c), st['cell']) for x in pad(r)] for r in b['rows']]
    # wider columns for longer text, within reason
    lengths = [max(len(re.sub(r'[*`]', '', (row + [''] * cols)[k])) for row in [b['head']] + b['rows']) for k in range(cols)]
    # each column at least as wide as its heading's longest word, so headings never break mid-word
    head_words = [max((len(w) for w in re.sub(r'[*`]', '', (b['head'] + [''] * cols)[k]).split()), default=4) for k in range(cols)]
    weights = [max(min(max(n, 6), 60), head_words[k] * 1.25 + 2) for k, n in enumerate(lengths)]
    total = sum(weights) or 1
    t = Table(data, colWidths=[WIDTH * w / total for w in weights], repeatRows=1)
    style = [
        ('BACKGROUND', (0, 0), (-1, 0), c['surface']), ('LINEBELOW', (0, 0), (-1, 0), 0.8, c['line']),
        ('BOX', (0, 0), (-1, -1), 0.6, c['line']), ('INNERGRID', (0, 0), (-1, -1), 0.4, c['line']),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'), ('LEFTPADDING', (0, 0), (-1, -1), 7), ('RIGHTPADDING', (0, 0), (-1, -1), 7),
        ('TOPPADDING', (0, 0), (-1, -1), 5), ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ]
    style += [('BACKGROUND', (0, r), (-1, r), colors.HexColor('#fbfbfc')) for r in range(2, len(data), 2)]
    t.setStyle(TableStyle(style))
    return t


def resolve_image(src):
    """A path on disk for a picture from this website, or None (pictures from elsewhere are not fetched)."""
    if not src.startswith('/') or '..' in src:
        return None
    candidates = []
    if src.startswith(settings.MEDIA_URL if settings.MEDIA_URL.startswith('/') else '/' + settings.MEDIA_URL):
        candidates.append(Path(settings.MEDIA_ROOT) / src.split('/', 2)[2])
    candidates += [Path(settings.FRONTEND_DIST) / src.lstrip('/'), Path(settings.BASE_DIR).parent / 'frontend' / 'public' / src.lstrip('/')]
    return next((p for p in candidates if p.is_file()), None)


def image_block(b, c, st):
    path = resolve_image(b['src'])
    caption = Paragraph(plain(b['alt']), st['caption']) if b['alt'] else None
    if not path:
        link = b['src'] if b['src'].startswith('http') else site_url() + b['src']
        return [Paragraph(f'<i>Picture: <link href="{escape(link)}" color="{c["primary"].hexval()}"><u>{plain(b["alt"] or "open it online")}</u></link></i>',
                          st['small'])]
    try:
        iw, ih = ImageReader(str(path)).getSize()
    except Exception:  # noqa: BLE001 - an unreadable file is left out rather than breaking the book
        return [caption] if caption else []
    width = WIDTH * {'full': 1, 'medium': 0.66, 'small': 0.4}.get(b['size'], 1)
    height = width * ih / iw
    if height > 95 * mm:  # very tall pictures are scaled down to keep them on one page
        height, width = 95 * mm, 95 * mm * iw / ih
    img = Image(str(path), width=width, height=height)
    img.hAlign = 'CENTER'
    return [KeepTogether([Spacer(1, 4), img, Spacer(1, 4)] + ([caption] if caption else []))]


def markdown(source, c, st):
    out = []
    for b in parse_blocks(source):
        kind = b['type']
        if kind == 'h2':
            out += [CondPageBreak(30 * mm), Paragraph(inline(b['text'], c), st['h2'])]
        elif kind == 'h3':
            out += [CondPageBreak(25 * mm), Paragraph(inline(b['text'], c), st['h3'])]
        elif kind == 'p':
            out.append(Paragraph('<br/>'.join(inline(line, c) for line in b['lines']), st['body']))
        elif kind in ('ul', 'ol'):
            for n, item in enumerate(b['items'], start=1):
                bullet = f'{n}.' if kind == 'ol' else '•'
                out.append(Paragraph(inline(item, c), st['bullet'], bulletText=bullet))
            out.append(Spacer(1, 4))
        elif kind == 'quote':
            out.append(boxed(Paragraph(f'<i>{inline(b["text"], c)}</i>', st['quote']), c, c['surface'], c['line']))
            out.append(Spacer(1, 8))
        elif kind == 'callout':
            label, tone = CALLOUTS[b['tone']]
            bg, border, fg = c[tone]
            out.append(boxed(Paragraph(f'<font name="DMSans-Bold" color="{fg.hexval()}">{label.upper()}</font><br/>{inline(b["text"], c)}', st['body']),
                             c, bg, border))
            out.append(Spacer(1, 8))
        elif kind == 'table':
            out += [table_block(b, c, st), Spacer(1, 9)]
        elif kind == 'code':
            out += [code_block(b, c, st), Spacer(1, 9)]
        elif kind == 'hr':
            out += [Spacer(1, 4), Rule(c['line']), Spacer(1, 8)]
        elif kind == 'img':
            out += image_block(b, c, st)
        elif kind == 'video':
            out.append(Paragraph(f'<b>Video:</b> <link href="{escape(b["url"])}" color="{c["primary"].hexval()}"><u>{escape(b["url"])}</u></link>', st['body']))
    return out


class Rule(Flowable):
    def __init__(self, colour, width=None, thickness=0.6):
        super().__init__()
        self.colour, self.w, self.thickness = colour, width or WIDTH, thickness

    def wrap(self, *args):
        return self.w, self.thickness

    def draw(self):
        self.canv.setStrokeColor(self.colour)
        self.canv.setLineWidth(self.thickness)
        self.canv.line(0, 0, self.w, 0)


class Marker(Flowable):
    """An invisible point that adds a contents entry and a PDF bookmark where it sits."""

    def __init__(self, level, text, key):
        super().__init__()
        self.level, self.text, self.key = level, text, key

    def wrap(self, *args):
        return 0, 0

    def draw(self):
        pass


# ---------------------------------------------------------------- the document

def site_url():
    return getattr(settings, 'FRONTEND_URL', '').rstrip('/') or 'https://adramtechnologies.com'


class Book(BaseDocTemplate):
    def __init__(self, buffer, field, c, **kw):
        super().__init__(buffer, pagesize=A4, leftMargin=MARGIN, rightMargin=MARGIN, topMargin=MARGIN + 6 * mm, bottomMargin=MARGIN,
                         title=f'{field.name}: learning notes', author='ADRAM Technologies', subject=field.summary or field.name,
                         creator='ADRAM Technologies Learning hub', **kw)
        self.field, self.c = field, c
        body = Frame(MARGIN, MARGIN, WIDTH, PAGE_H - 2 * MARGIN - 6 * mm, id='body')
        self.addPageTemplates([
            PageTemplate(id='cover', frames=[Frame(MARGIN, MARGIN, WIDTH, PAGE_H - 2 * MARGIN, id='cover')], onPage=self.draw_cover),
            PageTemplate(id='page', frames=[body], onPage=self.draw_page),
        ])

    def afterFlowable(self, flowable):
        if isinstance(flowable, Marker):
            self.notify('TOCEntry', (flowable.level, escape(flowable.text), self.page, flowable.key))
            self.canv.bookmarkPage(flowable.key)
            self.canv.addOutlineEntry(flowable.text, flowable.key, level=flowable.level, closed=flowable.level > 0)

    def draw_page(self, canvas, doc):
        c = self.c
        canvas.saveState()
        canvas.setStrokeColor(c['line'])
        canvas.setLineWidth(0.6)
        canvas.line(MARGIN, PAGE_H - MARGIN + 2 * mm, PAGE_W - MARGIN, PAGE_H - MARGIN + 2 * mm)
        canvas.setFont('DMSans-Bold', 8)
        canvas.setFillColor(c['primary'])
        canvas.drawString(MARGIN, PAGE_H - MARGIN + 4 * mm, f'{self.field.name.upper()}  ·  LEARNING NOTES')
        canvas.setFont('DMSans-Regular', 8)
        canvas.setFillColor(c['muted'])
        canvas.drawRightString(PAGE_W - MARGIN, PAGE_H - MARGIN + 4 * mm, 'ADRAM Technologies')
        canvas.line(MARGIN, MARGIN - 6 * mm, PAGE_W - MARGIN, MARGIN - 6 * mm)
        canvas.drawString(MARGIN, MARGIN - 10 * mm, site_url().replace('https://', '').replace('http://', '') + '/learning')
        canvas.drawRightString(PAGE_W - MARGIN, MARGIN - 10 * mm, f'Page {doc.page}')
        canvas.restoreState()

    def draw_cover(self, canvas, doc):
        c, f = self.c, self.field
        canvas.saveState()
        # the dark top two thirds, with a soft accent circle
        top = PAGE_H * 0.36
        canvas.setFillColor(c['dark'])
        canvas.rect(0, top, PAGE_W, PAGE_H - top, stroke=0, fill=1)
        canvas.setFillColor(c['primary'])
        canvas.setFillAlpha(0.35)
        canvas.circle(PAGE_W - 30 * mm, PAGE_H - 40 * mm, 70 * mm, stroke=0, fill=1)
        canvas.setFillAlpha(1)
        canvas.setFillColor(c['accent'])
        canvas.rect(0, top, PAGE_W, 2.2 * mm, stroke=0, fill=1)
        # logo
        logo = resolve_image(cover_logo())
        if logo:
            canvas.setFillColor(colors.white)
            canvas.roundRect(MARGIN, PAGE_H - MARGIN - 18 * mm, 18 * mm, 18 * mm, 3 * mm, stroke=0, fill=1)
            canvas.drawImage(str(logo), MARGIN + 2 * mm, PAGE_H - MARGIN - 16 * mm, 14 * mm, 14 * mm, mask='auto', preserveAspectRatio=True)
        canvas.setFillColor(colors.white)
        canvas.setFont('Sora-Bold', 13)
        canvas.drawString(MARGIN + 23 * mm, PAGE_H - MARGIN - 8 * mm, 'ADRAM')
        canvas.setFont('DMSans-Regular', 8.5)
        canvas.setFillColor(colors.Color(1, 1, 1, 0.7))
        canvas.drawString(MARGIN + 23 * mm, PAGE_H - MARGIN - 13 * mm, 'TECHNOLOGIES  ·  LEARNING HUB')
        canvas.restoreState()



def cover_logo():
    from cms.models import PageContent
    row = PageContent.objects.filter(slug='site').first()
    logo = row.data.get('logo') if row and isinstance(row.data, dict) else ''
    return logo if isinstance(logo, str) and logo.startswith('/') else '/brand/mark-192.png'


def level_names():
    from cms.models import PageContent
    row = PageContent.objects.filter(slug='learning').first()
    edited = row.data.get('levels') if row and isinstance(row.data, dict) else None
    names, texts = list(LEVEL_NAMES), [
        'No experience needed: the very first ideas, explained simply.', 'The core concepts every professional uses every day.',
        'Configure, build and troubleshoot real set-ups.', 'Design, secure and scale with confidence.',
        'Expert topics, research and certification-level depth.']
    if isinstance(edited, list):
        for k, item in enumerate(edited[:5]):
            if isinstance(item, dict):
                names[k] = str(item.get('name') or names[k])
                texts[k] = str(item.get('text') or texts[k])
    return names, texts


def build_pdf(field, notes):
    """notes: the field's notes in reading order (level, topic, note). Returns the PDF as bytes."""
    register_fonts()
    c = palette()
    st = styles(c)
    names, texts = level_names()
    buffer = io.BytesIO()
    doc = Book(buffer, field, c)

    topics = []
    for n in notes:
        if not topics or topics[-1][0].id != n.topic_id:
            topics.append((n.topic, []))
        topics[-1][1].append(n)
    levels = sorted({t.level for t, _ in topics})
    minutes = sum(n.minutes for n in notes)

    story = []
    # ---- cover (text on top of the drawn background)
    story += [Spacer(1, 62 * mm),
              Paragraph('LEARNING NOTES  ·  FROM ZERO TO HERO', ParagraphStyle('ce', fontName='DMSans-Bold', fontSize=9.5, leading=14, textColor=c['accent'])),
              Spacer(1, 4 * mm),
              Paragraph(plain(field.name), ParagraphStyle('ct', fontName='Sora-Bold', fontSize=40, leading=46, textColor=colors.white)),
              Spacer(1, 5 * mm)]
    if field.summary:
        story.append(Paragraph(plain(field.summary), ParagraphStyle('cs', fontName='DMSans-Regular', fontSize=12.5, leading=19,
                                                                     textColor=colors.Color(1, 1, 1, 0.85))))
    hours = f'{round(minutes / 60, 1)} hours' if minutes >= 60 else f'{minutes} minutes'
    facts = [(str(len(levels)), 'levels'), (str(len(topics)), 'topics'), (str(len(notes)), 'notes'), (hours, 'of reading')]
    story += [Spacer(1, 78 * mm)]
    fact_cells = [Paragraph(f'<font name="Sora-Bold" size="17" color="{c["ink"].hexval()}">{v}</font><br/>'
                            f'<font size="8.5" color="{c["muted"].hexval()}">{label}</font>', st['body']) for v, label in facts]
    ft = Table([fact_cells], colWidths=[WIDTH / 4] * 4)
    ft.setStyle(TableStyle([('LINEBEFORE', (1, 0), (-1, 0), 0.6, c['line']), ('LEFTPADDING', (0, 0), (-1, -1), 10), ('VALIGN', (0, 0), (-1, -1), 'TOP')]))
    story += [ft, Spacer(1, 12 * mm),
              Paragraph(f'<b>ADRAM Technologies</b>  ·  {escape(site_url().replace("https://", "").replace("http://", ""))}/learning/{escape(field.slug)}<br/>'
                        f'Edition of {date.today():%B %Y}. The latest version is always online.', st['small']),
              NextPageTemplate('page'), PageBreak()]

    # ---- about the field and how the levels work
    story += [Paragraph('ABOUT THIS FIELD', st['eyebrow']), Paragraph(plain(field.name), st['h1'])]
    if field.description.strip():
        story += markdown(field.description, c, st)
    elif field.summary:
        story.append(Paragraph(plain(field.summary), st['lead']))
    story += [Spacer(1, 6 * mm), Paragraph('HOW THE LEARNING PATH WORKS', st['eyebrow']),
              Paragraph('Every field runs through five levels. Start at the first, follow the notes in order, and tick each one off as you finish it.', st['body'])]
    rows = []
    for k in range(5):
        here = (k + 1) in levels
        num = Paragraph(f'<font name="Sora-Bold" size="13" color="{(c["primary"] if here else c["muted"]).hexval()}">{k + 1}</font>', st['body'])
        rows.append([num, Paragraph(f'<b>{plain(names[k])}</b><br/><font color="{c["muted"].hexval()}">{plain(texts[k])}</font>'
                                    + ('' if here else '  <font size="8.5" color="#9ca3af">(notes coming soon)</font>'), st['body'])])
    lt = Table(rows, colWidths=[14 * mm, WIDTH - 14 * mm])
    lt.setStyle(TableStyle([('VALIGN', (0, 0), (-1, -1), 'TOP'), ('LINEBELOW', (0, 0), (-1, -2), 0.4, c['line']),
                            ('TOPPADDING', (0, 0), (-1, -1), 6), ('BOTTOMPADDING', (0, 0), (-1, -1), 4)]))
    story += [lt, PageBreak()]

    # ---- contents
    toc = TableOfContents(dotsMinLevel=1)
    toc.levelStyles = [st['toc0'], st['toc1'], st['toc2']]
    story += [Paragraph('CONTENTS', st['eyebrow']), Paragraph('What is inside', st['h1']), Spacer(1, 3 * mm), toc, PageBreak()]

    # ---- the notes, level by level
    key = 0
    for level in levels:
        name = names[level - 1]
        key += 1
        story += [Marker(0, f'Level {level}: {name}', f'k{key}'), Spacer(1, 28 * mm),
                  Paragraph(f'LEVEL {level} OF 5', st['eyebrow']), Paragraph(plain(name), st['level']),
                  Paragraph(plain(texts[level - 1]), st['lead']), Spacer(1, 8 * mm)]
        for topic, tnotes in [(t, ns) for t, ns in topics if t.level == level]:
            story.append(boxed(Paragraph(f'<b>{plain(topic.title)}</b>' + (f'<br/><font color="{c["muted"].hexval()}">{plain(topic.summary)}</font>' if topic.summary else '')
                                         + '<br/>' + '<br/>'.join(f'<font size="9.5">{"•"}&nbsp; {plain(n.title)}</font>' for n in tnotes), st['body']),
                               c, c['tint'], c['tint2']))
            story.append(Spacer(1, 5))
        story.append(PageBreak())
        for topic, tnotes in [(t, ns) for t, ns in topics if t.level == level]:
            key += 1
            story.append(Marker(1, topic.title, f'k{key}'))
            for k, n in enumerate(tnotes):
                key += 1
                head = [Paragraph(f'{escape(name.upper())}  ·  {plain(topic.title).upper()}', st['eyebrow'])] if k == 0 else []
                kind = KINDS.get(n.kind, 'Note')
                story += [Marker(2, n.title, f'k{key}')] + head + [
                    Paragraph(f'<font name="DMSans-Bold" size="8" color="{c["primary"].hexval()}">{escape(kind.upper())}</font>'
                              f'<font size="8" color="{c["muted"].hexval()}">  ·  {n.minutes} min read</font>', st['small']),
                    Paragraph(plain(n.title), st['h1'])]
                if n.summary:
                    story.append(Paragraph(plain(n.summary), st['lead']))
                if n.objectives:
                    items = '<br/>'.join(f'<font name="DMSans-Bold" color="{c["primary"].hexval()}">→</font>&nbsp;&nbsp;{plain(o)}' for o in n.objectives)
                    story += [Spacer(1, 3), boxed(Paragraph(f'<font name="DMSans-Bold" size="8.5" color="{c["primary"].hexval()}">WHAT YOU WILL LEARN</font><br/>{items}',
                                                            st['body']), c, c['tint'], c['tint2']), Spacer(1, 8)]
                story += markdown(n.body, c, st)
                if n.resources:
                    story += [Spacer(1, 4), Paragraph('Resources', st['h3'])]
                    for r in n.resources:
                        url = r.get('url', '')
                        url = site_url() + url if url.startswith('/') else url
                        label = {'video': 'Video', 'file': 'Download', 'link': 'Link'}.get(r.get('kind'), 'Link')
                        story.append(Paragraph(f'<b>{label}:</b> <link href="{escape(url)}" color="{c["primary"].hexval()}"><u>{plain(r.get("title") or url)}</u></link>',
                                               st['bullet'], bulletText='•'))
                story.append(PageBreak())
    doc.multiBuild(story)
    return buffer.getvalue()
