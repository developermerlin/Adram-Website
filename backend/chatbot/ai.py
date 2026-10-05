"""
Talks to the Claude Messages API (https://docs.anthropic.com). The key comes from ANTHROPIC_API_KEY in .env.
The long knowledge block is marked for prompt caching, so repeated questions cost far less.
"""
import json
import logging
import urllib.error
import urllib.request

from django.conf import settings

logger = logging.getLogger(__name__)
API_URL = 'https://api.anthropic.com/v1/messages'
HANDOFF = '[HANDOFF]'


class AssistantUnavailable(Exception):
    pass


def configured():
    return bool(getattr(settings, 'ANTHROPIC_API_KEY', ''))


def ask(model, rules, knowledge, history, max_tokens=600):
    """history: [{'role': 'user'|'assistant', 'content': str}, ...] ending with the visitor's message.
    Returns (text, handoff, input_tokens, output_tokens)."""
    if not configured():
        raise AssistantUnavailable('No API key')
    body = {
        'model': model,
        'max_tokens': max_tokens,
        'system': [
            {'type': 'text', 'text': rules},
            {'type': 'text', 'text': f'WEBSITE KNOWLEDGE\n\n{knowledge}', 'cache_control': {'type': 'ephemeral'}},
        ],
        'messages': history,
    }
    req = urllib.request.Request(getattr(settings, 'ANTHROPIC_API_URL', '') or API_URL, data=json.dumps(body).encode(), method='POST', headers={
        'content-type': 'application/json', 'x-api-key': settings.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01',
    })
    try:
        with urllib.request.urlopen(req, timeout=40) as resp:
            data = json.loads(resp.read().decode())
    except urllib.error.HTTPError as exc:
        logger.warning('Chatbot API error %s: %s', exc.code, exc.read()[:300])
        raise AssistantUnavailable(f'HTTP {exc.code}') from exc
    except (urllib.error.URLError, TimeoutError, ValueError) as exc:
        logger.warning('Chatbot API unreachable: %s', exc)
        raise AssistantUnavailable('unreachable') from exc
    text = ''.join(b.get('text', '') for b in data.get('content', []) if b.get('type') == 'text').strip()
    handoff = HANDOFF in text
    text = text.replace(HANDOFF, '').strip()
    usage = data.get('usage', {})
    return text, handoff, usage.get('input_tokens', 0) + usage.get('cache_read_input_tokens', 0), usage.get('output_tokens', 0)
