"""
Payment providers. An order is handed to a provider, which tells the student how to pay and reports the result.

Built in:
  free    - nothing to pay (free courses, or a coupon that takes the whole price off): paid at once.
  manual  - Orange Money, Afrimoney or card (a card-payment link from the bank or a payment service): the student
            pays, uploads the receipt, and an administrator confirms or rejects it.

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
    key, label = 'manual', 'Mobile money or card'
    needs_receipt = True
    METHODS = [('orange_money', 'Orange Money'), ('afrimoney', 'Afrimoney'), ('card', 'Card')]

    def instructions(self, order):
        row = PaymentSettings.load()
        return {'methods': row.methods(), 'instructions': row.instructions, 'reference': order.number}


PROVIDERS = {p.key: p for p in (FreeProvider(), ManualMobileMoneyProvider())}


def enabled_keys():
    return [k for k in getattr(settings, 'LMS_PAYMENT_PROVIDERS', ['manual']) if k in PROVIDERS]


def get(key):
    return PROVIDERS.get(key) or PROVIDERS['manual']


def default_provider():
    """The provider used for paid orders (the first enabled one)."""
    keys = [k for k in enabled_keys() if k != 'free']
    return get(keys[0] if keys else 'manual')
