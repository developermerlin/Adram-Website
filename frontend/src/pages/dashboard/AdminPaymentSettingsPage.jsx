import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { parseApiErrors, staffPortalAPI } from '../../services/api';
import { formatDateTime } from '../../utils/format';
import PortalLayout from '../../components/layout/PortalLayout';
import { Alert, TextField } from '../../components/ui/Form';
import { Spinner } from '../../components/ui/Section';

const FIELDS = ['orange_money_number', 'orange_money_name', 'orange_money_steps', 'afrimoney_number', 'afrimoney_name', 'afrimoney_steps',
  'card_link', 'card_label', 'card_steps', 'instructions', 'terms'];

/** One step per line; shown to students as a numbered list for that method. */
const StepsField = ({ id, value, onChange, placeholder }) => (
  <div className="field">
    <label htmlFor={id}>Steps for students <span className="optional">(optional, one per line)</span></label>
    <textarea id={id} className="input" rows={4} value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    <p className="hint">Leave empty to show ADRAM’s standard steps.</p>
  </div>
);

export const AdminPaymentSettingsPage = () => {
  const [saved, setSaved] = useState(null);
  const [form, setForm] = useState(null);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    staffPortalAPI
      .paymentSettings()
      .then(({ data }) => {
        setSaved(data);
        setForm(data);
      })
      .catch(() => setErrors({ form: 'Could not load the settings.' }));
  }, []);

  const dirty = form && saved && FIELDS.some((f) => form[f] !== saved[f]);
  const input = (field) => ({ name: field, value: form[field] || '', error: errors[field], onChange: (e) => setForm((f) => ({ ...f, [field]: e.target.value })) });

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { data } = await staffPortalAPI.savePaymentSettings(Object.fromEntries(FIELDS.map((f) => [f, form[f] || ''])));
      setSaved(data);
      setForm(data);
      setErrors({});
      toast.success('Payment settings saved');
    } catch (err) {
      setErrors(parseApiErrors(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <PortalLayout title="Payments & terms" subtitle="How students pay for courses and for “ADRAM applies for you”: Orange Money, Afrimoney or card. They pay, upload proof, and you confirm it.">
      {!form ? (
        errors.form ? <Alert>{errors.form}</Alert> : <Spinner label="Loading settings…" />
      ) : (
        <form className="editor" onSubmit={save} noValidate>
          <div className="editor__main">
            <Alert>{errors.form}</Alert>
            <section className="card panel editor__section">
              <h2 className="h3">Orange Money</h2>
              <p className="muted small">Leave the number blank to stop offering Orange Money.</p>
              <div className="form-grid">
                <div className="form-row">
                  <TextField label="Orange Money number" inputMode="tel" maxLength={30} placeholder="e.g. 076 123 456" {...input('orange_money_number')} />
                  <TextField label="Account name" maxLength={100} placeholder="e.g. ADRAM Technologies" {...input('orange_money_name')} />
                </div>
                <StepsField id="orange_money_steps" value={form.orange_money_steps} onChange={(v) => setForm((f) => ({ ...f, orange_money_steps: v }))}
                  placeholder={'Dial the Orange Money menu on your phone\nChoose Transfer money\nEnter the number and amount shown above\nConfirm with your PIN'} />
              </div>
            </section>

            <section className="card panel editor__section">
              <h2 className="h3">Afrimoney</h2>
              <p className="muted small">Leave the number blank to stop offering Afrimoney.</p>
              <div className="form-grid">
                <div className="form-row">
                  <TextField label="Afrimoney number" inputMode="tel" maxLength={30} placeholder="e.g. 030 123 456" {...input('afrimoney_number')} />
                  <TextField label="Account name" maxLength={100} placeholder="e.g. ADRAM Technologies" {...input('afrimoney_name')} />
                </div>
                <StepsField id="afrimoney_steps" value={form.afrimoney_steps} onChange={(v) => setForm((f) => ({ ...f, afrimoney_steps: v }))}
                  placeholder={'Dial the Afrimoney menu on your phone\nChoose Send money\nEnter the number and amount shown above\nConfirm with your PIN'} />
              </div>
            </section>

            <section className="card panel editor__section">
              <h2 className="h3">Card</h2>
              <p className="muted small">
                No card gateway is connected yet. Paste a card-payment link from your bank or payment service (students pay there, then upload the
                confirmation), and/or explain how to pay by card, for example at the ADRAM office. Leave both blank to stop offering card.
              </p>
              <div className="form-grid">
                <div className="form-row">
                  <TextField label="Card payment link" type="url" maxLength={500} placeholder="https://…" hint="Must start with https://" {...input('card_link')} />
                  <TextField label="Cards accepted" maxLength={60} placeholder="Visa / Mastercard" {...input('card_label')} />
                </div>
                <StepsField id="card_steps" value={form.card_steps} onChange={(v) => setForm((f) => ({ ...f, card_steps: v }))}
                  placeholder={'Open the card payment page\nEnter the amount and your reference\nPay and keep the confirmation email or screenshot'} />
              </div>
            </section>

            <section className="card panel editor__section">
              <h2 className="h3">For every method</h2>
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="instructions">A note shown under every method <span className="optional">(optional)</span></label>
                  <textarea id="instructions" className="input" rows={4} value={form.instructions || ''} onChange={(e) => setForm((f) => ({ ...f, instructions: e.target.value }))} placeholder="e.g. Send the exact amount, write your payment reference in the note, and keep the confirmation SMS." />
                </div>
              </div>
            </section>

            <section className="card panel editor__section">
              <h2 className="h3">Terms and conditions</h2>
              <p className="muted small">Students must read and agree to these before they can continue to payment.</p>
              <div className="field">
                <label htmlFor="terms" className="sr-only">Terms and conditions</label>
                <textarea id="terms" className="input terms-input" rows={14} value={form.terms || ''} onChange={(e) => setForm((f) => ({ ...f, terms: e.target.value }))} placeholder={'1. The application fee covers…\n2. Fees are refundable only if…\n3. ADRAM does not guarantee that a scholarship will be awarded…'} />
                {!form.terms && <p className="hint">Until you add terms, students can’t continue to payment.</p>}
              </div>
            </section>
          </div>

          <aside className="editor__aside">
            <section className="card panel editor__publish">
              <button type="submit" className="btn btn--primary btn--block" disabled={saving || !dirty}>
                {saving ? <span className="btn-spinner" /> : <i className="fas fa-floppy-disk" />} {dirty ? 'Save settings' : 'Saved'}
              </button>
              {saved?.updated_at && <p className="muted small">Last saved {formatDateTime(saved.updated_at)}</p>}
            </section>
          </aside>
        </form>
      )}
    </PortalLayout>
  );
};

export default AdminPaymentSettingsPage;
