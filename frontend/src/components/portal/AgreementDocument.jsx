import { useSite } from '../../content/useContent';
import Brand from '../ui/Brand';
import { formatDate, formatDateTime } from '../../utils/format';
import { BLANK, fillParts, fillText, showValue } from '../../utils/agreement';

/** A clause body: one line per paragraph; indented lines (sub-points like "i.") are shown indented. */
const ClauseBody = ({ text }) => (
  <div className="agd__body">
    {text.split('\n').filter((l) => l.trim()).map((line, i) => {
      const indented = /^\s{2,}/.test(line);
      const marker = line.trim().match(/^(\([a-z]\)|[ivx]+\.)\s/);
      const label = !marker && line.trim().match(/^([A-Z][A-Za-z ]{2,30}):\s*(\S.*)$/); // e.g. "First Payment: 60%"
      return (
        <p key={i} className={indented ? 'agd__sub' : marker ? 'agd__item' : label ? 'agd__label-line' : ''}>
          {marker ? <><b>{marker[1]}</b>{line.trim().slice(marker[0].length - 1)}</>
            : label ? <><strong>{label[1]}:</strong> {label[2]}</> : line.trim()}
        </p>
      );
    })}
  </div>
);

/** A line of wording with the filled-in values in bold. */
const Rich = ({ text, values }) => fillParts(text, values).map((p, i) => (p.value ? <b key={i}>{p.text}</b> : <span key={i}>{p.text}</span>));

/**
 * The service agreement as a formal document (on screen, and as the printable / PDF copy).
 * `details` / `signedWith` are the student's details and what they wrote beside their signature
 * (the signed copy, or what they've typed so far).
 */
export const AgreementDocument = ({ data, details, signedWith, paper = false }) => {
  const site = useSite();
  const c = data.content;
  const w = data.wording;
  // `paper`: the copy to print and sign by hand, so the student's parts are left blank
  const d = paper ? {} : details || data.student_details || {};
  const g = paper ? {} : signedWith || data.signature_details || {};
  const onPaper = data.paper_signed;
  const signed = data.status === 'signed';
  const date = `${data.effective_date}T00:00`;
  const dt = new Date(date);
  const name = d.full_name || data.student?.name;
  // Money, dates and ADRAM's filled-in details come worked out from the server (data.values)
  const values = {
    ...data.values, student_name: name, reference: data.reference, company_name: c.company_name, title: c.title, scholarship: data.scholarship_name,
    day: String(dt.getDate()), month: dt.toLocaleString('en-GB', { month: 'long' }), year: String(dt.getFullYear()),
  };

  return (
    <article className="agd">
      <table className="afd__sheet">
        <thead><tr><td><div className="afd__margin" /></td></tr></thead>
        <tfoot><tr><td><div className="afd__margin afd__margin--foot"><span>{c.company_name} · {c.title} · {data.reference}</span></div></td></tr></tfoot>
        <tbody><tr><td>
          <header className="agd__letterhead">
            <div className="agd__brand"><Brand /></div>
            <div className="agd__contact">
              <span>{site.phones?.[0]}</span>
              <span>{site.email}</span>
              <span>{c.company_address || site.location}</span>
            </div>
          </header>
          <div className="agd__rule" aria-hidden="true" />

          <section className="agd__cover">
            <h1>{c.title}</h1>
            {c.subtitle && <p className="agd__subtitle">{c.subtitle}</p>}
            <div className="agd__between">
              <span>{fillText(w.between_label, values)}</span>
              <strong>{c.company_name}</strong>
              <em>and</em>
              <strong>{(name || 'Student applicant').toUpperCase()}</strong>
            </div>
            <dl className="agd__meta">
              <div><dt>Effective date</dt><dd>{formatDate(date)}</dd></div>
              <div><dt>Agreement reference no.</dt><dd>{data.reference}</dd></div>
              <div><dt>Student name</dt><dd>{name}</dd></div>
              <div><dt>Scholarship</dt><dd>{data.scholarship_name}</dd></div>
              <div><dt>Total service fee</dt><dd>{values.fee || BLANK}</dd></div>
              {data.admin_fields.map((f) => <div key={f.id}><dt>{f.label}</dt><dd>{values[f.id] || BLANK}</dd></div>)}
            </dl>
          </section>

          <section className="agd__parties">
            <p><Rich text={w.made_on} values={values} /></p>
            <h2>Between</h2>
            <div className="agd__party">
              <h3>{c.company_name}</h3>
              {c.company_description && <p>{c.company_description}</p>}
              <dl>
                <div><dt>Company address</dt><dd>{c.company_address || BLANK}</dd></div>
                <div><dt>Represented by</dt><dd>{c.representative_name || BLANK}</dd></div>
                <div><dt>Position</dt><dd>{c.representative_position || BLANK}</dd></div>
              </dl>
              {w.company_ref && <p className="agd__ref">{fillText(w.company_ref, values)}</p>}
            </div>
            <h2>And</h2>
            <div className="agd__party">
              <h3>{fillText(w.student_heading, values)}</h3>
              <dl>
                {data.student_fields.map((f) => (
                  <div key={f.id}><dt>{f.label}</dt><dd>{showValue(f, d[f.id])}</dd></div>
                ))}
              </dl>
              {w.student_ref && <p className="agd__ref">{fillText(w.student_ref, values)}</p>}
            </div>
          </section>

          {c.clauses.map((clause, i) => (
            <section key={clause.id} className="agd__clause">
              <h2><span>{i + 1}.</span> {clause.title}</h2>
              <ClauseBody text={fillText(clause.body, values)} />
            </section>
          ))}

          <section className="agd__clause agd__signatures">
            <h2><span>{c.clauses.length + 1}.</span> {fillText(w.signatures_heading, values)}</h2>
            <div className="agd__sign-grid">
              <div className="agd__signer">
                <h3>{c.company_name}</h3>
                <div className="agd__sig-area">
                  {c.company_stamp && <img className="agd__stamp" src={c.company_stamp} alt="Company stamp" />}
                  {c.company_signature && <img className="agd__sig" src={c.company_signature} alt="Company signature" />}
                </div>
                <dl>
                  <div><dt>Name</dt><dd>{c.representative_name || BLANK}</dd></div>
                  <div><dt>Position</dt><dd>{c.representative_position || BLANK}</dd></div>
                  <div><dt>Date</dt><dd>{formatDate(date)}</dd></div>
                </dl>
              </div>
              <div className="agd__signer">
                <h3>{fillText(w.student_signer, values)}</h3>
                <div className="agd__sig-area">
                  {signed && data.student_signature ? <img className="agd__sig" src={data.student_signature} alt="Student signature" />
                    : onPaper ? <span className="agd__sig-empty">Signed by hand: see the signed copy</span>
                    : paper ? null : <span className="agd__sig-empty">Not signed yet</span>}
                </div>
                <dl>
                  {data.signature_fields.map((f) => (
                    <div key={f.id}><dt>{f.label}</dt><dd>{showValue(f, g[f.id])}</dd></div>
                  ))}
                </dl>
              </div>
            </div>
            {signed && onPaper && (
              <p className="agd__evidence">
                Signed by hand on paper by {name}. The signed copy was uploaded on {formatDateTime(data.uploaded_at)} and accepted by
                {' '}{c.company_name} on {formatDateTime(data.accepted_at)}. Reference (SHA-256): <code>{data.fingerprint}</code>
              </p>
            )}
            {signed && !onPaper && (
              <p className="agd__evidence">
                Signed electronically by {name} ({data.student?.email}) on {formatDateTime(data.signed_at)}.
                Document fingerprint (SHA-256): <code>{data.fingerprint}</code>
              </p>
            )}
          </section>
        </td></tr></tbody>
      </table>
    </article>
  );
};

export default AgreementDocument;
