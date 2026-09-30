"""
Serves the built website (frontend/dist) from Django, when SERVE_FRONTEND is on.

Files that exist in the build (JS, CSS, images) are sent as they are. Every other address gets index.html, which the
React app turns into the right page, with the search and link-preview tags filled in from the admin's edits (cms.share).
"""
import mimetypes
from pathlib import Path

from django.conf import settings
from django.http import FileResponse, Http404, HttpResponse

from .share import apply_meta, build_meta


def _dist():
    return Path(settings.FRONTEND_DIST)


def spa(request, path=''):
    if request.method not in ('GET', 'HEAD'):
        return HttpResponse(status=405)
    dist = _dist().resolve()
    index = dist / 'index.html'
    if not index.is_file():
        return HttpResponse('The website has not been built yet. Run "npm run build" in the frontend folder.', status=503, content_type='text/plain')

    # A real file from the build? Resolve it and make sure it stays inside the build folder.
    if path:
        candidate = (dist / path).resolve()
        if candidate.is_file() and dist in candidate.parents:
            content_type = mimetypes.guess_type(candidate.name)[0] or 'application/octet-stream'
            response = FileResponse(open(candidate, 'rb'), content_type=content_type)
            # Build files in /assets have a fingerprint in their name, so they can be cached for a year.
            response['Cache-Control'] = 'public, max-age=31536000, immutable' if path.startswith('assets/') else 'public, max-age=3600'
            return response
        if Path(path).suffix and path.startswith('assets/'):
            raise Http404

    page = index.read_text(encoding='utf-8')
    address = '/' + path.strip('/') if path else '/'
    page = apply_meta(page, build_meta(address), request.build_absolute_uri)
    response = HttpResponse(page, content_type='text/html; charset=utf-8')
    response['Cache-Control'] = 'no-cache'  # so an edit shows up in the next share preview
    return response
