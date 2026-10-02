// Ways to pay without a gateway: Orange Money, Afrimoney or card (a card-payment link). The list itself comes from
// Admin → Payments & terms (`methods` in the API); this is what each kind asks the student for afterwards.

export const METHOD_LABELS = { orange_money: 'Orange Money', afrimoney: 'Afrimoney', card: 'Card' };

export const METHOD_ICONS = { orange_money: 'fa-mobile-screen-button', afrimoney: 'fa-mobile-screen-button', card: 'fa-credit-card' };

// The proof form's labels, per kind of method
export const PROOF = {
  mobile: {
    transaction: 'Transaction ID',
    transactionHint: 'From the confirmation SMS',
    payer: 'Number you paid from',
    payerHint: 'e.g. 076 123 456',
    receipt: 'Screenshot or photo of the confirmation SMS (or a PDF)',
  },
  card: {
    transaction: 'Payment reference or approval code',
    transactionHint: 'From the card payment confirmation',
    payer: 'Name on the card',
    payerHint: 'As printed on the card',
    receipt: 'Screenshot, photo or PDF of the card payment confirmation',
  },
};

export const kindOf = (methods, id) => methods.find((m) => m.id === id)?.kind || 'mobile';
