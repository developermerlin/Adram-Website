import { useState } from 'react';
import { useSite } from '../../content/useContent';
import Brand from '../ui/Brand';
import { CHOICE_TYPES, displayValue } from '../../utils/applicationForm';
import { formatDate, formatDateTime } from '../../utils/format';

/** Space to write an answer by hand, shaped by the kind of question (the blank paper form). */
const WritingSpace = ({ field }) => {
  if (CHOICE_TYPES.includes(field.type) || field.type === 'yes_no') {
    const options = field.type === 'yes_no' ? ['Yes', 'No'] : field.options;
    return (
      <ul className={`afd__ticks${options.length <= 3 ? ' afd__ticks--row' : ''}`}>
        {options.map((o) => <li key={o}><span className="afd__box" aria-hidden="true" />{o}</li>)}
      </ul>
    );
  }
  if (field.type === 'date') {
    return (
      <span className="afd__date" aria-hidden="true">
        {['D', 'D', '/', 'M', 'M', '/', 'Y', 'Y', 'Y', 'Y'].map((c, i) => (c === '/' ? <em key={i}>/</em> : <span key={i}>{c}</span>))}
      </span>
    );
  }
  const lines = field.type === 'textarea' ? 5 : 1;
  return <span className="afd__lines" aria-hidden="true">{Array.from({ length: lines }, (_, i) => <span key={i} />)}</span>;
};

const isWide = (f, blank) => f.width === 'full' || f.type === 'textarea' || (blank && CHOICE_TYPES.includes(f.type) && f.options.length > 3);

/** Which answers take the whole row: wide questions, and a half-width one that would otherwise leave an empty gap. */
const spans = (fields, blank) => {
  const out = [];
  let column = 0;
  fields.forEach((f, i) => {
    let wide = isWide(f, blank);
    if (!wide && column === 0) {
      const next = fields[i + 1];
      if (!next || isWide(next, blank)) wide = true; // alone on its row
    }
    out.push({ field: f, wide });
    column = wide ? 0 : (column + 1) % 2;
  });
  return out;
};

/**
 * The application form as a formal document. `blank` gives the empty paper version students fill in by hand.
 * In print, the page is wrapped in a table whose header and footer rows repeat on every sheet: they hold the page
 * margins (so the browser has no room for its own web-address header and footer) and the document's own footer.
 */
export const ApplicationFormDocument = ({ data, blank = false }) => {
  const site = useSite();
  const [printedOn] = useState(() => new Date().toISOString());
  const { form } = data;
  const answers = blank ? {} : data.answers || {};
  const footer = `${site.name} · ${form.title} · Reference ${data.reference}`;

  return (
    <article className={`afd${blank ? ' afd--blank' : ''}`}>
      <table className="afd__sheet">
        <thead><tr><td><div className="afd__margin" /></td></tr></thead>
        <tfoot><tr><td><div className="afd__margin afd__margin--foot"><span>{footer}</span></div></td></tr></tfoot>
        <tbody><tr><td>
          <header className="afd__head">
            <div className="afd__brand">
              <Brand />
              <span className="afd__contact">{site.location}<br />{site.email} · {site.phones?.[0]}</span>
            </div>
            <div className="afd__refs">
              {!blank && data.approval && <span className="afd__stamp" aria-label="Approved"><i className="fas fa-circle-check" aria-hidden="true" /> Approved</span>}
              <div className="afd__ref">
                <span>Reference</span>
                <strong>{data.reference}</strong>
              </div>
            </div>
          </header>

          <div className="afd__title">
            <h1>{form.title}</h1>
            <p>{data.scholarship_name}</p>
          </div>

          <table className="afd__facts">
            <tbody>
              <tr>
                <th>Applicant</th><td>{data.student?.name}</td>
                <th>Email</th><td>{data.student?.email}</td>
              </tr>
              <tr>
                <th>Status</th><td>{blank ? 'Paper form' : data.status_display}</td>
                <th>{blank ? 'Printed' : 'Submitted'}</th><td>{blank ? formatDate(printedOn) : data.submitted_at ? formatDateTime(data.submitted_at) : 'Not yet'}</td>
              </tr>
            </tbody>
          </table>

          {blank && (
            <div className="afd__instructions">
              <strong>How to complete this form</strong>
              <ol>
                <li>Write clearly in CAPITAL LETTERS with a black or blue pen.</li>
                <li>Tick boxes like this <span className="afd__box afd__box--ticked" aria-hidden="true" /> and answer every question marked <span className="afd__req">*</span>.</li>
                <li>Sign and date the declaration at the end.</li>
                <li>Scan or photograph every page and upload it in your ADRAM portal under this application.</li>
              </ol>
            </div>
          )}

          {form.sections.map((s, i) => (
            <section key={s.id} className="afd__section">
              <h2><span>Section {i + 1}</span>{s.title}</h2>
              {s.description && <p className="afd__section-note">{s.description}</p>}
              <div className="afd__grid">
                {spans(s.fields, blank).map(({ field: f, wide }, k) => {
                  return (
                    <div key={f.id} className={`afd__cell${wide ? ' afd__cell--full' : ''}`}>
                      <span className="afd__label"><b>{i + 1}.{k + 1}</b> {f.label}{f.required && <span className="afd__req"> *</span>}</span>
                      {blank ? <WritingSpace field={f} /> : (
                        <span className="afd__value">{displayValue(f, answers[f.id]) || <span className="afd__empty">Not answered</span>}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}

          {form.declaration && (
            <section className="afd__section afd__declare">
              <h2><span>Declaration</span>Applicant’s confirmation</h2>
              <p>{form.declaration}</p>
              <div className="afd__sign">
                <div><span className="afd__sign-line">{!blank && data.declared ? `Confirmed online by ${data.student?.name}` : ''}</span><small>Applicant’s signature</small></div>
                <div><span className="afd__sign-line">{!blank && data.submitted_at ? formatDate(data.submitted_at) : ''}</span><small>Date</small></div>
              </div>
            </section>
          )}

          {!blank && data.approval ? (
            <section className="afd__section afd__approval">
              <h2><span>For ADRAM</span>Review and approval</h2>
              <div className="afd__approval-body">
                <p>This application form has been reviewed by {site.name} and is approved for use in the applicant’s scholarship application.</p>
                <div className="afd__sign">
                  <div>
                    <span className="afd__sign-line afd__sign-line--img">{data.approval.signature && <img src={data.approval.signature} alt={`Signature of ${data.approval.name}`} />}</span>
                    <small>{data.approval.name}{data.approval.title && `, ${data.approval.title}`} · {site.name}</small>
                  </div>
                  <div><span className="afd__sign-line">{formatDate(data.approval.at)}</span><small>Date approved</small></div>
                </div>
              </div>
            </section>
          ) : (
            <section className="afd__office">
              <span className="afd__office-title">For ADRAM office use only</span>
              <div><span>Received by</span><i /></div>
              <div><span>Date received</span><i /></div>
              <div><span>Checked and approved by</span><i /></div>
            </section>
          )}
        </td></tr></tbody>
      </table>
    </article>
  );
};

export default ApplicationFormDocument;
