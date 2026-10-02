"""
Anti-sharing: how many devices may play videos on one account at the same time (LmsSettings.max_streams).

The course player's heartbeat (every 30 seconds) says whether a video is playing. Each signed-in device (the `sid` of
its sign-in) that played in the last 75 seconds counts. One device too many is told to pause; the student can choose
"Watch here instead", which pauses the others until they choose the same. Kept in the cache: with several server
processes the cache must be shared (Redis), or each process counts on its own.
"""
import time

from django.core.cache import cache

from .models import LmsSettings

WINDOW = 75  # seconds a device counts as playing after its last heartbeat
KICK = 10 * 60  # how long a device that was taken over stays paused (unless it takes over back)


def device_of(request):
    auth = getattr(request, 'auth', None)
    sid = auth.get('sid') if hasattr(auth, 'get') else None
    return str(sid or request.session.session_key or 'web')


def beat(request, playing, take_over=False):
    """Records this device; returns {'blocked': bool, 'limit': n} for the player."""
    limit = LmsSettings.load().max_streams
    if not limit:
        return {'blocked': False, 'limit': 0}
    user, device, now = request.user.pk, device_of(request), time.time()
    key = f'streams:{user}'
    streams = {d: t for d, t in (cache.get(key) or {}).items() if now - t < WINDOW}
    kicked_key = f'stream-kicked:{user}:{device}'
    if take_over:
        for other in streams:
            if other != device:
                cache.set(f'stream-kicked:{user}:{other}', 1, KICK)
        cache.delete(kicked_key)
        streams = {device: now}
        cache.set(key, streams, WINDOW * 2)
        return {'blocked': False, 'limit': limit}
    if cache.get(kicked_key):
        return {'blocked': True, 'limit': limit, 'reason': 'taken_over'}
    if not playing:
        streams.pop(device, None)
        cache.set(key, streams, WINDOW * 2)
        return {'blocked': False, 'limit': limit}
    others = [d for d in streams if d != device]
    if len(others) >= limit:
        return {'blocked': True, 'limit': limit, 'reason': 'too_many'}
    streams[device] = now
    cache.set(key, streams, WINDOW * 2)
    return {'blocked': False, 'limit': limit}
