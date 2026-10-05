import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import PortalLayout from '../../components/layout/PortalLayout';
import AgreementFieldsEditor from '../../components/admin/AgreementFieldsEditor';
import SignaturePad from '../../components/portal/SignaturePad';
import { staffPortalAPI, parseApiErrors } from '../../services/api';
import { formatDateTime } from '../../utils/format';
import { fmtMoney, splitFee } from '../../utils/agreement';
import '../../styles/application-form.css';
import '../../styles/agreement.css';

const STATUS = [['', 'All'], ['pending', 'Waiting for signature'], ['uploaded', 'Signed copy to check'], ['signed', 'Signed'], ['void', 'Cancelled']];
const TONE = { pending: 'badge--amber', uploaded: 'badge--blue', signed: 'badge--green', void: 'badge--gray' };

/** Shrinks an image file and returns it as a PNG data: URL (for the stamp / an uploaded signature). */
const imageToDataUrl = (file, max = 600) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL('image/png'));
    };
    img.onerror = reject;
    img.src = reader.result;
  };
  reader.onerror = reject;
  reader.readAsDataURL(file);
});

const Agreements = () => {
  const [status, setStatus] = useState('');
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [data, setData] = useState(null);
  const [fees, setFees] = useState({});
  const [busy, setBusy] = useState(null);
  useEffect(() => {
    const t = setTimeout(() => setSearch(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);
  const load = useCallback(() => staffPortalAPI.agreements({ status: status || undefined, q: search || undefined })
    .then(({ data: d }) => setData(d)).catch(() => toast.error('Could not load the agreements.')), [status, search]);
  useEffect(() => {
    load();
  }, [load]);

  const send = async (row) => {
    setBusy(row.application_id);
    try {
      await staffPortalAPI.issueAgreement({ application_id: row.application_id, ...(fees[row.application_id] ? { amount: fees[row.application_id] } : {}) });
      toast.success(`Agreement sent to ${row.email}.`);
      load();
    } catch (err) {
      toast.error(parseApiErrors(err).detail || 'Could not send the agreement.');
    } finally {
      setBusy(null);
    }
  };
  const remind = async (row) => {
    setBusy(row.application_id);
    try {
      await staffPortalAPI.agreementAction(row.application_id, { action: 'remind' });
      toast.success(`Reminder sent to ${row.student.email}.`);
      load();
    } catch (err) {
      toast.error(parseApiErrors(err).detail || 'Could not send the reminder.');
    } finally {
      setBusy(null);
    }
  };
  const total = data ? Object.values(data.counts).reduce((a, b) => a + b, 0) : 0;

  return (
    <div className="aga-stack">
      {data && (
        <div className="aga-stats">
          <div className="aga-stat is-amber"><strong>{data.counts.pending}</strong><span>Waiting for signature</span></div>
          {data.counts.uploaded > 0 && <div className="aga-stat is-blue"><strong>{data.counts.uploaded}</strong><span>Signed copies to check</span></div>}
          <div className="aga-stat is-green"><strong>{data.counts.signed}</strong><span>Signed</span></div>
          <div className="aga-stat"><strong>{data.awaiting.length}</strong><span>Waiting for an agreement</span></div>
        </div>
      )}
      {data?.awaiting.length > 0 && (
        <section className="aga-awaiting">
          <h2><i className="fas fa-award" aria-hidden="true" /> Paid or awarded students without an agreement</h2>
          <ul>
            {data.awaiting.map((a) => (
              <li key={a.application_id}>
                <span><strong>{a.student}</strong><small>{a.awarded ? 'Awarded' : 'Paid'} · {a.scholarship_name} · {a.email}</small></span>
                <input className="input" inputMode="decimal" placeholder="Fee amount (optional)" aria-label={`Fee for ${a.student}`} value={fees[a.application_id] || ''}
                  onChange={(e) => setFees((f) => ({ ...f, [a.application_id]: e.target.value }))} />
                <button type="button" className="btn btn--primary btn--sm" disabled={busy === a.application_id} onClick={() => send(a)}><i className="fas fa-paper-plane" /> Send agreement</button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="card table-card">
        <div className="aga-toolbar">
          <div className="aga-search">
            <i className="fas fa-magnifying-glass" aria-hidden="true" />
            <input className="input" type="search" placeholder="Search student, scholarship or reference" aria-label="Search agreements" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <div className="aga-filters" role="tablist" aria-label="Filter by status">
            {STATUS.map(([id, label]) => (
              <button key={id || 'all'} type="button" role="tab" aria-selected={status === id} className={`aga-filter${status === id ? ' is-active' : ''}`} onClick={() => setStatus(id)}>
                {label}{data && <span>{id ? data.counts[id] : total}</span>}
              </button>
            ))}
          </div>
        </div>
        {!data ? <p className="muted aga-pad">Loading…</p> : data.results.length === 0 ? (
          <div className="aga-empty"><i className="fas fa-file-contract" aria-hidden="true" />
            <p>{status || search ? 'No agreements match.' : 'No agreements yet. One is sent to the student with their application form when you confirm their payment.'}</p></div>
        ) : (
          <div className="table-scroll">
            <table className="table aga-table">
              <thead><tr><th>Student</th><th>Scholarship</th><th>Fee &amp; payments</th><th>Status</th><th>Dates</th><th><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {data.results.map((r) => (
                  <tr key={r.application_id}>
                    <td><strong>{r.student.name}</strong><small>{r.student.email}</small></td>
                    <td>{r.scholarship_name}<small>{r.reference}</small></td>
                    <td>{r.fee || <span className="text-danger">Not filled in</span>}
                      {r.paid && <small>{r.fully_paid ? 'Paid in full' : `Paid ${r.paid} (${r.paid_percent}%) · balance ${r.balance}`}</small>}</td>
                    <td><span className={`badge ${TONE[r.status]}`}>{r.status_display}</span>{r.status === 'pending' && !r.ready && <small className="text-danger">Fill in before the student can sign</small>}</td>
                    <td><small>Sent {formatDateTime(r.issued_at)}</small>{r.signed_at && <small>Signed {formatDateTime(r.signed_at)}</small>}
                      {!r.signed_at && r.reminded_at && <small>Reminded {formatDateTime(r.reminded_at)}</small>}</td>
                    <td className="aga-actions">
                      {r.status === 'pending' && <button type="button" className="btn btn--text btn--sm" disabled={busy === r.application_id} onClick={() => remind(r)}><i className="fas fa-bell" /> Remind</button>}
                      <Link to={`/admin/agreements/${r.application_id}`} target="_blank" className="btn btn--outline btn--sm">Open</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};

const ImagePicker = ({ label, hint, value, onChange, allowDraw = false }) => {
  const [drawing, setDrawing] = useState(false);
  const input = useRef(null);
  const pick = async (file) => {
    if (!file) return;
    if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) { toast.error('Use a PNG or JPG image.'); return; }
    try {
      onChange(await imageToDataUrl(file));
    } catch {
      toast.error('That image could not be read.');
    }
  };
  return (
    <div className="agt-image">
      <span className="field__label">{label}</span>
      {drawing ? <SignaturePad onChange={onChange} /> : (
        <div className="agt-image__preview">{value ? <img src={value} alt={label} /> : <span className="muted small">None yet</span>}</div>
      )}
      <div className="agt-image__btns">
        <button type="button" className="btn btn--outline btn--sm" onClick={() => input.current?.click()}><i className="fas fa-upload" /> Upload image</button>
        {allowDraw && <button type="button" className="btn btn--outline btn--sm" onClick={() => setDrawing((v) => !v)}><i className="fas fa-signature" /> {drawing ? 'Done' : 'Draw instead'}</button>}
        {value && <button type="button" className="btn btn--text btn--sm text-danger" onClick={() => { onChange(''); setDrawing(false); }}>Remove</button>}
      </div>
      {hint && <small className="hint">{hint}</small>}
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { pick(e.target.files[0]); e.target.value = ''; }} />
    </div>
  );
};

const FIELDS = ['title', 'subtitle', 'company_name', 'company_description', 'company_address', 'representative_name', 'representative_position',
  'currency', 'default_amount', 'first_percent', 'company_signature', 'company_stamp', 'auto_issue', 'require_read', 'allow_online', 'allow_upload', 'clauses',
  'student_fields', 'signature_fields', 'admin_fields', 'wording'];

const WORDING = [
  {
    title: 'In the agreement',
    note: 'Part of the document: each agreement keeps the wording it was sent with.',
    keys: [['between_label', 'Above the two parties’ names'], ['made_on', 'Opening sentence (with the date)'], ['company_ref', 'After the company details'],
      ['student_heading', 'Student information heading'], ['student_ref', 'After the student’s details'], ['signatures_heading', 'Signatures heading'],
      ['student_signer', 'Student signature box heading'], ['agree_statement', 'The statement the student ticks before signing']],
  },
  {
    title: 'Signing page',
    note: 'What the student sees around the agreement.',
    keys: [['hero_title', 'Title'], ['hero_title_awarded', 'Title after the scholarship is awarded'], ['intro', 'Introduction'],
      ['intro_awarded', 'Introduction after the scholarship is awarded'], ['details_heading', 'Details heading'], ['sign_heading', 'Signature heading'],
      ['signature_fields_heading', 'Above the fields beside the signature'], ['esign_note', 'Note under the signature'], ['sign_button', 'Sign button']],
  },
  {
    title: 'Invitation card',
    note: 'The highlighted card on the student’s progress page and application form.',
    keys: [['card_badge', 'Badge'], ['card_title', 'Title'], ['card_title_awarded', 'Title after the scholarship is awarded'],
      ['card_title_form', 'Title on the application form page'], ['card_lead', 'Text'], ['card_lead_awarded', 'Text after the scholarship is awarded'],
      ['fact1_title', 'Highlight 1'], ['fact1_text', 'Highlight 1, small text'], ['fact2_title', 'Highlight 2'], ['fact2_text', 'Highlight 2, small text'],
      ['fact3_title', 'Highlight 3'], ['fact3_text', 'Highlight 3, small text'], ['card_button', 'Button']],
  },
  {
    title: 'Signing online or on paper',
    note: 'The choice students get, and the steps for signing on paper (one step per line; the upload box goes with the last step).',
    keys: [['choose_heading', 'Question'], ['online_option', 'Online option'], ['online_hint', 'Online option, small text'],
      ['paper_option', 'Paper option'], ['paper_hint', 'Paper option, small text'], ['paper_steps', 'Steps for signing on paper'],
      ['uploaded_note', 'Message after uploading']],
  },
  {
    title: 'Service fee and payments',
    note: 'The payment summary the student sees once they have signed, and the notice shown while you are still filling in their agreement.',
    keys: [['payments_heading', 'Heading'], ['first_label', 'First instalment name'], ['first_due', 'When the first instalment is due'],
      ['second_label', 'Second instalment name'], ['second_due', 'When the second instalment is due'], ['not_ready', 'Notice before the agreement is filled in']],
  },
];

const PLACEHOLDERS = [['{fee}', 'total fee'], ['{first_amount}', 'first instalment'], ['{second_amount}', 'second instalment'],
  ['{first_percent}', 'e.g. 60'], ['{first_percent_words}', 'e.g. sixty'], ['{second_percent}', 'e.g. 40'], ['{second_percent_words}', 'e.g. forty'],
  ['{student_name}', ''], ['{effective_date}', ''], ['{reference}', ''], ['{scholarship}', ''], ['{company_name}', ''], ['{title}', '']];

/** A temporary id for a new clause (the server makes the final one from its title). */
const newClauseId = () => `clause_${Date.now()}`;

const ACCOUNT_SOURCES = [
  { value: '', label: 'Nothing: the student types it' },
  { value: 'auto', label: 'Automatic (application form, then account)' },
  { value: 'account:name', label: 'Account: full name' },
  { value: 'account:email', label: 'Account: email' },
  { value: 'account:phone', label: 'Account: phone' },
  { value: 'today', label: 'Today’s date' },
];

/** The default service fee and how it is split into two instalments, with the amounts worked out. */
const FeeCard = ({ form, set }) => {
  const amount = Number(String(form.default_amount || '').replace(/,/g, ''));
  const pct = Number(form.first_percent);
  const valid = amount > 0 && pct >= 1 && pct <= 100;
  const [first, second] = valid ? splitFee(amount, pct) : [0, 0];
  return (
    <section className="card panel agt-card">
      <h2 className="agt-h">Service fee</h2>
      <div className="agt-row">
        <label className="field"><span className="field__label">Currency</span>
          <input className="input" value={form.currency || ''} maxLength={12} onChange={(e) => set('currency')(e.target.value)} /></label>
        <label className="field"><span className="field__label">Default fee</span>
          <input className="input" inputMode="decimal" value={form.default_amount || ''} placeholder="e.g. 25000" onChange={(e) => set('default_amount')(e.target.value)} /></label>
      </div>
      <label className="field"><span className="field__label">First payment (before travel), %</span>
        <input className="input" type="number" min={1} max={100} value={form.first_percent} onChange={(e) => set('first_percent')(e.target.value)} /></label>
      <small className="hint">Second payment (after arrival): {pct >= 1 && pct <= 100 ? 100 - pct : '—'}%.</small>
      {valid && (
        <div className="agx-split">
          <span>First <strong>{fmtMoney(form.currency, first)}</strong></span>
          {pct < 100 && <span>Second <strong>{fmtMoney(form.currency, second)}</strong></span>}
        </div>
      )}
      <small className="hint">Used when an agreement is sent. You can change the fee and split for each student before they sign. Leave the fee empty to fill it in for every student yourself.</small>
    </section>
  );
};

const Template = () => {
  const [form, setForm] = useState(null);
  const [saved, setSaved] = useState('');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState([]);
  const [meta, setMeta] = useState(null);
  const adopt = (d) => {
    const f = Object.fromEntries(FIELDS.map((k) => [k, d[k]]));
    setMeta({ defaults: d.default_wording, types: d.field_types, questions: d.intake_questions || [], blanks: d.blanks || [] });
    setForm(f);
    setSaved(JSON.stringify(f));
    setErrors([]);
  };
  useEffect(() => {
    staffPortalAPI.agreementTemplate().then(({ data }) => adopt(data)).catch(() => toast.error('Could not load the agreement.'));
  }, []);
  if (!form || !meta) return <div className="card panel"><p className="muted">Loading…</p></div>;
  const intakeSources = meta.questions.map((q) => ({ value: `intake:${q.id}`, label: `Application form: ${q.label}` }));
  const studentSources = [...ACCOUNT_SOURCES, ...intakeSources];
  const signatureSources = [
    ...ACCOUNT_SOURCES.filter((x) => x.value !== 'auto'),
    ...form.student_fields.filter((f) => f.id).map((f) => ({ value: `field:${f.id}`, label: `Same as: ${f.label}` })),
    ...intakeSources,
  ];
  const setWord = (key, value) => set('wording')({ ...form.wording, [key]: value });
  const dirty = JSON.stringify(form) !== saved;
  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));
  const setClause = (i, patch) => set('clauses')(form.clauses.map((c, k) => (k === i ? { ...c, ...patch } : c)));
  const move = (i, step) => {
    const next = [...form.clauses];
    [next[i], next[i + step]] = [next[i + step], next[i]];
    set('clauses')(next);
  };
  const save = async () => {
    setBusy(true);
    try {
      const { data } = await staffPortalAPI.saveAgreementTemplate(form);
      adopt(data);
      toast.success('Agreement saved. Students who haven’t signed yet see this version.');
    } catch (err) {
      const list = err.response?.data?.errors || [parseApiErrors(err).detail || 'Could not save.'];
      setErrors(list);
      toast.error(list[0]);
    } finally {
      setBusy(false);
    }
  };
  const reset = async () => {
    if (!window.confirm('Restore the original agreement wording? Your edits to the title, clauses and wording will be lost. The fee, fields, company details, signature and stamp are kept.')) return;
    const { data } = await staffPortalAPI.resetAgreementTemplate();
    adopt(data);
    toast.success('Original wording restored.');
  };
  const text = (key, label, props = {}) => (
    <label className="field"><span className="field__label">{label}</span>
      {props.rows ? <textarea className="input" rows={props.rows} value={form[key] || ''} maxLength={props.maxLength} onChange={(e) => set(key)(e.target.value)} />
        : <input className="input" value={form[key] || ''} maxLength={props.maxLength} placeholder={props.placeholder} onChange={(e) => set(key)(e.target.value)} />}
    </label>
  );

  return (
    <>
      <div className="agt-top">
        <span className="muted small">Changes reach every agreement that hasn’t been signed yet. Signed agreements keep exactly what was signed.</span>
        <span className="agt-top__spacer" />
        {dirty && <span className="agt-unsaved"><i className="fas fa-circle" /> Unsaved changes</span>}
        <button type="button" className="btn btn--text btn--sm" onClick={reset}><i className="fas fa-rotate-left" /> Original wording</button>
        <button type="button" className="btn btn--primary btn--sm" disabled={!dirty || busy} onClick={save}>{busy ? <span className="btn-spinner" /> : <i className="fas fa-floppy-disk" />} Save agreement</button>
      </div>
      {errors.length > 0 && <div className="afb-errors" role="alert"><strong>Please fix:</strong><ul>{errors.map((e) => <li key={e}>{e}</li>)}</ul></div>}
      {meta.blanks.length > 0 && (
        <div className="agx-todo" role="status">
          <strong><i className="fas fa-triangle-exclamation" aria-hidden="true" /> Still blank in the agreement</strong>
          <ul>{meta.blanks.map((b) => <li key={b}>{b}</li>)}</ul>
          <small>Fill these in under Company and Company signature &amp; stamp, otherwise students see a blank line there.</small>
        </div>
      )}
      <div className="agt">
        <div className="agt-main">
          <section className="card panel agt-card">
            <h2 className="agt-h">Title</h2>
            {text('title', 'Agreement title', { maxLength: 200 })}
            {text('subtitle', 'Line under the title', { maxLength: 200 })}
          </section>
          <section className="card panel agt-card">
            <h2 className="agt-h">Student information</h2>
            <p className="muted small">The details the student confirms before signing. They appear under “And” in the parties section.</p>
            <AgreementFieldsEditor fields={form.student_fields} onChange={set('student_fields')} sources={studentSources} types={meta.types} />
          </section>
          <section className="card panel agt-card">
            <h2 className="agt-h">Beside the student’s signature</h2>
            <p className="muted small">What the student fills in next to their signature, such as the date or place of signing. It is printed in the student’s signature box.</p>
            <AgreementFieldsEditor fields={form.signature_fields} onChange={set('signature_fields')} sources={signatureSources} types={meta.types} />
          </section>
          <section className="card panel agt-card">
            <h2 className="agt-h">Details you fill in for each student</h2>
            <p className="muted small">
              Anything else ADRAM must fill in on each agreement, e.g. “Destination country” or “Programme”. You fill them in on the student’s agreement;
              they appear on the cover page, and you can use them in the clauses as placeholders. Required ones must be filled in before the student can sign.
            </p>
            {form.admin_fields.length > 0
              ? <AgreementFieldsEditor fields={form.admin_fields} onChange={set('admin_fields')} sources={[{ value: '', label: 'You type it in' }]} types={meta.types} addLabel="Add a detail" />
              : <button type="button" className="btn btn--outline btn--sm" onClick={() => set('admin_fields')([{ id: '', label: '', type: 'text', required: true, prefill: '' }])}><i className="fas fa-plus" /> Add a detail</button>}
          </section>
          <section className="card panel agt-card">
            <h2 className="agt-h">Clauses</h2>
            <p className="muted small">One line per paragraph. Start a line with spaces for an indented sub-point (i., ii.). These are filled in for each student:</p>
            <p className="agt-ph">
              {PLACEHOLDERS.map(([ph, hint]) => <span key={ph}><code>{ph}</code>{hint && <small>{hint}</small>}</span>)}
              {form.admin_fields.filter((f) => f.id).map((f) => <span key={f.id}><code>{`{${f.id}}`}</code><small>{f.label}</small></span>)}
            </p>
            <ol className="agt-clauses">
              {form.clauses.map((c, i) => (
                <li key={c.id || i} className="agt-clause">
                  <div className="agt-clause__bar">
                    <span className="agt-clause__num">{i + 1}</span>
                    <input className="input" value={c.title} maxLength={150} aria-label={`Clause ${i + 1} title`} onChange={(e) => setClause(i, { title: e.target.value })} />
                    <span className="afb-q__tools">
                      <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}><i className="fas fa-arrow-up" /></button>
                      <button type="button" aria-label="Move down" disabled={i === form.clauses.length - 1} onClick={() => move(i, 1)}><i className="fas fa-arrow-down" /></button>
                      <button type="button" aria-label="Delete clause" className="afb-danger" onClick={() => window.confirm(`Delete clause “${c.title}”?`) && set('clauses')(form.clauses.filter((_, k) => k !== i))}><i className="fas fa-trash-can" /></button>
                    </span>
                  </div>
                  <textarea className="input" rows={Math.min(14, Math.max(4, c.body.split('\n').length + 1))} value={c.body} maxLength={6000} aria-label={`Clause ${i + 1} text`} onChange={(e) => setClause(i, { body: e.target.value })} />
                </li>
              ))}
            </ol>
            <button type="button" className="btn btn--outline btn--sm" onClick={() => set('clauses')([...form.clauses, { id: newClauseId(), title: '', body: '' }])}><i className="fas fa-plus" /> Add a clause</button>
          </section>
          <section className="card panel agt-card">
            <h2 className="agt-h">Wording</h2>
            <p className="muted small">
              You can use <code>{'{student_name}'}</code> <code>{'{fee}'}</code> <code>{'{title}'}</code> <code>{'{company_name}'}</code> <code>{'{scholarship}'}</code> <code>{'{reference}'}</code>,
              and in the opening sentence <code>{'{day}'}</code> <code>{'{month}'}</code> <code>{'{year}'}</code>. Leave a box empty to use the original wording.
            </p>
            {WORDING.map((group) => (
              <div key={group.title} className="agw-group">
                <h3>{group.title}</h3>
                <p className="muted small">{group.note}</p>
                {group.keys.map(([key, label]) => {
                  const value = form.wording[key] ?? '';
                  const original = meta.defaults[key];
                  return (
                    <label key={key} className="field">
                      <span className="field__label">{label}
                        {value !== original && <button type="button" className="btn btn--text btn--sm agw-reset" onClick={() => setWord(key, original)}>Use original</button>}
                      </span>
                      {original.length > 70
                        ? <textarea className="input" rows={2} value={value} maxLength={800} placeholder={original} onChange={(e) => setWord(key, e.target.value)} />
                        : <input className="input" value={value} maxLength={800} placeholder={original} onChange={(e) => setWord(key, e.target.value)} />}
                    </label>
                  );
                })}
              </div>
            ))}
          </section>
        </div>
        <aside className="agt-side">
          <section className="card panel agt-card">
            <h2 className="agt-h">Sending</h2>
            <label className="checkbox">
              <input type="checkbox" checked={form.auto_issue} onChange={(e) => set('auto_issue')(e.target.checked)} />
              <span className="checkbox__box" aria-hidden="true"><i className="fas fa-check" /></span>
              <span>Send automatically with the application form<small>When you confirm the student’s payment. Otherwise send it yourself from the Agreements tab.</small></span>
            </label>
            <label className="checkbox">
              <input type="checkbox" checked={form.require_read} onChange={(e) => set('require_read')(e.target.checked)} />
              <span className="checkbox__box" aria-hidden="true"><i className="fas fa-check" /></span>
              <span>Students must scroll to the end before signing<small>The “I agree” box stays locked until they have reached the end.</small></span>
            </label>
            <label className="checkbox">
              <input type="checkbox" checked={form.allow_online} onChange={(e) => set('allow_online')(e.target.checked)} />
              <span className="checkbox__box" aria-hidden="true"><i className="fas fa-check" /></span>
              <span>Students can sign online<small>They type or draw their signature in the portal.</small></span>
            </label>
            <label className="checkbox">
              <input type="checkbox" checked={form.allow_upload} onChange={(e) => set('allow_upload')(e.target.checked)} />
              <span className="checkbox__box" aria-hidden="true"><i className="fas fa-check" /></span>
              <span>Students can sign on paper<small>They download it, sign by hand and upload a scan; you check it and accept it.</small></span>
            </label>
          </section>
          <FeeCard form={form} set={set} />
          <section className="card panel agt-card">
            <h2 className="agt-h">Company</h2>
            {text('company_name', 'Company name', { maxLength: 150 })}
            {text('company_description', 'Description', { rows: 3, maxLength: 600 })}
            {text('company_address', 'Address', { maxLength: 300 })}
            <div className="agt-row">
              {text('representative_name', 'Represented by', { maxLength: 120, placeholder: 'Full name' })}
              {text('representative_position', 'Position', { maxLength: 120 })}
            </div>
          </section>
          <section className="card panel agt-card agt-images">
            <h2 className="agt-h">Company signature &amp; stamp</h2>
            <ImagePicker label="Signature" value={form.company_signature} onChange={set('company_signature')} allowDraw hint="Upload a scan of the signature on white or transparent background, or draw it." />
            <ImagePicker label="Company stamp" value={form.company_stamp} onChange={set('company_stamp')} hint="A PNG with a transparent background looks best." />
          </section>
        </aside>
      </div>
    </>
  );
};

/** Admin → Service agreements: the agreements students sign after a successful result, and the agreement itself. */
export const AdminAgreementsPage = () => {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'template' ? 'template' : 'agreements';
  return (
    <PortalLayout title="Service agreements" subtitle="Students read and sign this agreement together with their application form. The fee only becomes due if the scholarship is awarded. Both of you can download the signed copy.">
      <div className="tabs aga-tabs" role="tablist" aria-label="Service agreements">
        <button type="button" role="tab" aria-selected={tab === 'agreements'} className={`tabs__tab${tab === 'agreements' ? ' is-active' : ''}`} onClick={() => setParams({})}>
          <i className="fas fa-file-contract" aria-hidden="true" /> Agreements
        </button>
        <button type="button" role="tab" aria-selected={tab === 'template'} className={`tabs__tab${tab === 'template' ? ' is-active' : ''}`} onClick={() => setParams({ tab: 'template' })}>
          <i className="fas fa-pen-ruler" aria-hidden="true" /> Agreement template
        </button>
      </div>
      {tab === 'agreements' ? <Agreements /> : <Template />}
    </PortalLayout>
  );
};

export default AdminAgreementsPage;
