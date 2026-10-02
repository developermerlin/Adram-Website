import toast from 'react-hot-toast';
import { METHOD_ICONS } from '../../config/payments';
import '../../styles/payments.css';

const copy = async (text, what) => {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${what} copied`);
  } catch {
    toast.error('Copy didn’t work. Please select the text instead.');
  }
};

const Copyable = ({ value, what }) => (
  <span className="htp-copy">
    <strong>{value}</strong>
    <button type="button" className="icon-btn" onClick={() => copy(value, what)} aria-label={`Copy ${what.toLowerCase()}`} title="Copy"><i className="far fa-copy" /></button>
  </span>
);

/**
 * How to pay, without a gateway: the student picks Orange Money, Afrimoney or card, then sees exactly what to do for
 * that method (amount, number or card link, the reference to quote, ADRAM's steps). Shared by course orders and the
 * scholarship "ADRAM applies for you" payment. `methods` comes from Admin → Payments & terms.
 */
const HowToPay = ({ methods, amount, reference, selected, onSelect, note }) => {
  const method = methods.find((m) => m.id === selected);
  return (
    <div className="htp">
      <div className="htp-pick" role="radiogroup" aria-label="Choose how to pay">
        {methods.map((m) => (
          <button key={m.id} type="button" role="radio" aria-checked={selected === m.id} className={`htp-pick__option htp-pick__option--${m.id}${selected === m.id ? ' is-on' : ''}`} onClick={() => onSelect(m.id)}>
            <i className={`fas ${METHOD_ICONS[m.id] || 'fa-wallet'}`} aria-hidden="true" />
            <strong>{m.label}</strong>
            <small>{m.kind === 'card' ? m.cards : 'Mobile money'}</small>
          </button>
        ))}
      </div>

      {!method && <p className="muted small">Choose a way to pay to see the details.</p>}
      {method && (
        <div className={`htp-panel htp-panel--${method.id}`}>
          <dl className="htp-facts">
            <div><dt>Amount</dt><dd><Copyable value={amount} what="Amount" /></dd></div>
            {method.kind === 'mobile' && (
              <div>
                <dt>{method.label} number</dt>
                <dd><Copyable value={method.number} what="Number" />{method.name && <small>Account name: {method.name}</small>}</dd>
              </div>
            )}
            <div><dt>Reference</dt><dd><Copyable value={reference} what="Reference" /><small>Write it in the payment note so we can match your payment.</small></dd></div>
          </dl>

          {method.kind === 'card' && method.link && (
            <a href={method.link} target="_blank" rel="noopener noreferrer" className="btn btn--primary htp-cardlink">
              <i className="fas fa-credit-card" /> Pay {amount} by card <i className="fas fa-arrow-up-right-from-square" aria-hidden="true" />
            </a>
          )}

          <ol className="htp-steps">
            {method.steps?.length > 0 ? method.steps.map((s) => <li key={s}>{s}</li>) : (
              method.kind === 'card' ? (
                <>
                  <li>Open the card payment page and pay <strong>{amount}</strong>.</li>
                  <li>Enter <strong>{reference}</strong> as the reference or description.</li>
                  <li>Keep the confirmation (screenshot or email).</li>
                </>
              ) : (
                <>
                  <li>Send <strong>{amount}</strong> to <strong>{method.number}</strong> with {method.label}.</li>
                  <li>Write <strong>{reference}</strong> in the note if your phone asks for one.</li>
                  <li>Keep the confirmation SMS.</li>
                </>
              )
            )}
            <li>Upload your proof below. ADRAM checks it and confirms, usually within one working day.</li>
          </ol>
          {note && <p className="htp-note">{note}</p>}
        </div>
      )}
    </div>
  );
};

export default HowToPay;
