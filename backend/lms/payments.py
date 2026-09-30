"""
Payment providers. An order is handed to a provider, which tells the student how to pay and reports the result.

Built in:
  free    - nothing to pay (free courses, or a coupon that takes the whole price off): paid at once.
  manual  - mobile money (Afrimoney / Orange Money): the student sends the money, uploads the receipt, and an
            administrator confirms or rejects it.

To connect a card or mobile-money gateway later, subclass PaymentProvider (start() returns a redirect or checkout
data; a webhook view calls orders.mark_paid / orders.mark_failed), add it to PROVIDERS, and list its key in the
LMS_PAYMENT_PROVIDERS setting. Nothing else in the course marketplace needs to change.
"""
from django.conf import settings

from portal.models import PaymentSettings


class PaymentProvider:
    key = ''
    label = ''
    needs_receipt = False

    def is_available(self):
        return True

    def instructions(self, order):
        """What the student sees on the order page to pay it."""
        return {}

    def start(self, order):
        """Called when the order is placed. Return extra data for the student (e.g. a gateway checkout link)."""
        return {}


class FreeProvider(PaymentProvider):
    key, label = 'free', 'No payment needed'


class ManualMobileMoneyProvider(PaymentProvider):
    key, label = 'manual', 'Mobile money'
    needs_receipt = True
    METHODS = [('afrimoney', 'Afrimoney'), ('orange_money', 'Orange Money')]

    def instructions(self, order):
        row = PaymentSettings.load()
        methods = []
        if row.afrimoney_number:
            methods.append({'id': 'afrimoney', 'label': 'Afrimoney', 'number': row.afrimoney_number, 'name': row.afrimoney_name})
        if row.orange_money_number:
            methods.append({'id': 'orange_money', 'label': 'Orange Money', 'number': row.orange_money_number, 'name': row.orange_money_name})
        return {'methods': methods, 'instructions': row.instructions, 'reference': order.number}


PROVIDERS = {p.key: p for p in (FreeProvider(), ManualMobileMoneyProvider())}


def enabled_keys():
    return [k for k in getattr(settings, 'LMS_PAYMENT_PROVIDERS', ['manual']) if k in PROVIDERS]


def get(key):
    return PROVIDERS.get(key) or PROVIDERS['manual']


def default_provider():
    """The provider used for paid orders (the first enabled one)."""
    keys = [k for k in enabled_keys() if k != 'free']
    return get(keys[0] if keys else 'manual')
