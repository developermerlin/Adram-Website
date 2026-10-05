import { Link } from 'react-router-dom';
import { formatDateTime } from '../../utils/format';
import '../../styles/application-form.css';

const ICONS = { draft: 'fa-file-pen', returned: 'fa-rotate-left', submitted: 'fa-paper-plane', reviewed: 'fa-circle-check' };

/** On the student's progress page: the application form's status and the way into it. */
export const ApplicationFormCard = ({ application: a }) => {
  const f = a.intake;
  const started = f.progress.answered > 0;
  const percent = f.progress.required ? Math.round((f.progress.answered / f.progress.required) * 100) : 0;
  const editable = f.status === 'draft' || f.status === 'returned';
  const title = {
    draft: started ? 'Finish your application form' : 'Fill in your application form',
    returned: 'Please update your application form',
    submitted: 'Application form submitted',
    reviewed: 'Application form approved',
  }[f.status];
  const text = {
    draft: 'ADRAM needs these details to prepare and submit your scholarship application. Fill it in online (about 15 minutes, saved as you go), or download it, fill it in by hand and upload a scan.',
    returned: f.return_note || 'ADRAM asked you to change some answers.',
    submitted: `Submitted ${formatDateTime(f.submitted_at)}${f.method === 'upload' ? ' as a scanned paper form' : ''}. ADRAM is reviewing it.`,
    reviewed: `Submitted ${formatDateTime(f.submitted_at)}, reviewed and approved by ADRAM.`,
  }[f.status];
  return (
    <section className={`card panel form-card form-card--${f.status}`}>
      <span className="form-card__icon" aria-hidden="true"><i className={`fas ${ICONS[f.status]}`} /></span>
      <div className="form-card__body">
        <h2 className="form-card__title">{title}</h2>
        <p className="muted">{text}</p>
        {f.status === 'draft' && started && (
          <div className="form-card__bar" aria-label={`${percent}% complete`}><span style={{ width: `${percent}%` }} /><small>{percent}% complete</small></div>
        )}
      </div>
      <div className="form-card__actions">
        {editable ? (
          <Link to={`/student/applications/${a.id}/form`} className="btn btn--primary btn--sm">
            <i className="fas fa-pen" /> {f.status === 'returned' ? 'Update the form' : started ? 'Continue' : 'Start the form'}
          </Link>
        ) : (
          <>
            <Link to={`/student/applications/${a.id}/form`} className="btn btn--outline btn--sm"><i className="fas fa-eye" /> {f.method === 'upload' ? 'View upload' : 'View answers'}</Link>
            {f.method !== 'upload' && <Link to={`/student/applications/${a.id}/form/print`} target="_blank" className="btn btn--primary btn--sm"><i className="fas fa-file-arrow-down" /> Download PDF</Link>}
          </>
        )}
      </div>
    </section>
  );
};

export default ApplicationFormCard;
