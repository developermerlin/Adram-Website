"""Video and file helpers: embed links, signed download links, and streaming with seek (HTTP Range) support."""
import mimetypes
import os
import re
from urllib.parse import parse_qs, urlparse

from django.conf import settings
from django.core import signing
from django.http import HttpResponse, StreamingHttpResponse

mimetypes.add_type('text/vtt', '.vtt')  # subtitles: browsers only play them with this type

SALT = 'lms-media'
TOKEN_MAX_AGE = 6 * 60 * 60  # a link to a video or file stays valid for six hours

VIDEO_EXTENSIONS = {'.mp4', '.m4v', '.mov', '.webm'}
MAX_RESOURCE_MB = 50


def max_video_bytes():
    return int(getattr(settings, 'LMS_MAX_VIDEO_MB', 1500)) * 1024 * 1024


# ------------------------------------------------------------------ embedded videos (YouTube, Vimeo only)

_YOUTUBE_ID = re.compile(r'^[\w-]{11}$')


def embed_url(link):
    """Turns a YouTube or Vimeo link into the address of its embeddable player, or None for anything else."""
    try:
        url = urlparse((link or '').strip())
    except ValueError:
        return None
    if url.scheme not in ('http', 'https'):
        return None
    host = (url.hostname or '').lower().removeprefix('www.').removeprefix('m.')
    parts = [p for p in url.path.split('/') if p]

    if host in ('youtube.com', 'youtube-nocookie.com'):
        video = None
        if parts[:1] == ['watch']:
            video = (parse_qs(url.query).get('v') or [''])[0]
        elif parts[:1] in (['embed'], ['shorts'], ['live']) and len(parts) > 1:
            video = parts[1]
        return f'https://www.youtube-nocookie.com/embed/{video}' if video and _YOUTUBE_ID.match(video) else None
    if host == 'youtu.be' and parts:
        return f'https://www.youtube-nocookie.com/embed/{parts[0]}' if _YOUTUBE_ID.match(parts[0]) else None

    if host in ('vimeo.com', 'player.vimeo.com'):
        ids = [p for p in parts if p.isdigit()]
        if not ids:
            return None
        # unlisted videos carry a hash, either as /<id>/<hash> or ?h=<hash>
        rest = parts[parts.index(ids[0]) + 1:]
        secret = (parse_qs(url.query).get('h') or [''])[0] or (rest[0] if rest and re.match(r'^[0-9a-f]+$', rest[0]) else '')
        return f'https://player.vimeo.com/video/{ids[0]}' + (f'?h={secret}' if secret else '')
    return None


# ------------------------------------------------------------------ signed links for private files

def sign(kind, object_id, user_id):
    """A link token: who asked for which file. `user_id` 0 is a visitor watching a free-preview lesson."""
    return signing.dumps({'k': kind, 'i': object_id, 'u': user_id or 0}, salt=SALT)


def read_token(token, kind, object_id):
    """Returns the user id inside a valid token for this file, or None."""
    try:
        data = signing.loads(token, salt=SALT, max_age=TOKEN_MAX_AGE)
    except signing.BadSignature:
        return None
    return data['u'] if data.get('k') == kind and data.get('i') == object_id else None


# ------------------------------------------------------------------ streaming with seek

CHUNK = 1024 * 512


def _read(path, start, length):
    with open(path, 'rb') as handle:
        handle.seek(start)
        remaining = length
        while remaining > 0:
            data = handle.read(min(CHUNK, remaining))
            if not data:
                break
            remaining -= len(data)
            yield data


def file_response(request, path, name, inline):
    """Sends a file with Range support, so a browser can jump around in a video without downloading all of it."""
    size = os.path.getsize(path)
    content_type = mimetypes.guess_type(name)[0] or 'application/octet-stream'
    start, end, status = 0, size - 1, 200
    header = request.headers.get('Range', '')
    match = re.match(r'^bytes=(\d*)-(\d*)$', header.strip())
    if match and (match.group(1) or match.group(2)):
        if match.group(1):
            start = int(match.group(1))
            end = int(match.group(2)) if match.group(2) else size - 1
        else:  # the last N bytes
            start = max(size - int(match.group(2)), 0)
        end = min(end, size - 1)
        if start > end or start >= size:
            response = HttpResponse(status=416)
            response['Content-Range'] = f'bytes */{size}'
            return response
        status = 206
    length = end - start + 1
    response = StreamingHttpResponse(_read(path, start, length), status=status, content_type=content_type)
    response['Content-Length'] = str(length)
    response['Accept-Ranges'] = 'bytes'
    if status == 206:
        response['Content-Range'] = f'bytes {start}-{end}/{size}'
    safe_name = name.replace('"', '')
    response['Content-Disposition'] = f'{"inline" if inline else "attachment"}; filename="{safe_name}"'
    response['Cache-Control'] = 'private, max-age=3600'
    return response


# ------------------------------------------------------------------ checking uploads

def looks_like_video(upload):
    """A quick look at the file's first bytes: MP4/MOV/M4V start with 'ftyp' (or an old-style atom), WebM with an EBML header."""
    head = upload.read(16)
    upload.seek(0)
    return head[4:8] in (b'ftyp', b'moov', b'mdat', b'free', b'wide') or head[:4] == b'\x1a\x45\xdf\xa3'
