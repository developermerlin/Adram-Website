import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { lmsAPI, parseApiErrors } from '../../services/api';
import { assetUrl } from '../../utils/assets';
import { formatDateTime } from '../../utils/format';
import { paragraphs } from '../../utils/lms';
import '../../styles/assignments.css';

/** Reviewing classmates' work after handing in, and the reviews your own work received (names hidden both ways). */
export const PeerReviewBox = ({ lessonId }) => {
  const [data, setData] = useState(null);
  const [scores, setScores] = useState([]);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => lmsAPI.peerReview(lessonId).then(({ data: d }) => {
    setData(d);
    setScores((d.rubric || []).map(() => ''));
    setComment('');
  }).catch(() => setData(null)), [lessonId]);
  useEffect(() => {
    load();
  }, [load]);
  if (!data || !data.required) return null;

  const send = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await lmsAPI.completePeerReview(data.current.id, { comment, scores: scores.map(Number) });
      toast.success('Thanks! Your review was sent.');
      load();
    } catch (err) {
      const errs = parseApiErrors(err);
      toast.error(errs.comment || errs.scores || errs.detail || 'Your review could not be sent.');
    } finally {
      setBusy(false);
    }
  };
  const c = data.current;
  const total = data.rubric.reduce((sum, r) => sum + r.points, 0);

  return (
    <section className="asg-block pr-box">
      <h2 className="h4"><i className="fas fa-people-arrows" aria-hidden="true" /> Peer review · {data.done} of {data.required} done</h2>
      {!data.handed_in && <p className="muted small">Hand in your work first. Then you’ll review {data.required === 1 ? 'one classmate’s' : `${data.required} classmates’`} work. Names are hidden both ways.</p>}
      {data.waiting_for_work && <p className="muted small">No classmate work to review yet. Come back once others have handed in.</p>}
      {data.handed_in && !c && !data.waiting_for_work && <p className="pr-done"><i className="fas fa-circle-check" aria-hidden="true" /> Thanks: you’ve done your reviews.</p>}
      {c && (
        <form onSubmit={send} className="pr-form">
          <div className="pr-work">
            <small className="muted">A classmate’s work · handed in {formatDateTime(c.handed_in)}</small>
            {c.text ? paragraphs(c.text).map((p) => <p key={p.slice(0, 40)}>{p}</p>) : <p className="muted">No written answer.</p>}
            {c.files.length > 0 && (
              <ul className="asg-files">{c.files.map((f) => <li key={f.url}><a href={assetUrl(f.url)} className="btn btn--outline btn--sm" download><i className="fas fa-paperclip" /> {f.filename}</a></li>)}</ul>
            )}
          </div>
          {data.rubric.length > 0 && (
            <table className="asg-rubric asg-rubric--grade">
              <tbody>
                {data.rubric.map((r, k) => (
                  <tr key={r.title}>
                    <td><strong>{r.title}</strong>{r.description && <small className="muted">{r.description}</small>}</td>
                    <td className="num">
                      <input type="number" min="0" max={r.points} className="input" aria-label={`Score for ${r.title}`} value={scores[k]}
                        onChange={(e) => setScores((list) => list.map((v, m) => (m === k ? e.target.value : v)))} /> / {r.points}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <label className="field">
            <span>Your feedback</span>
            <textarea className="input" rows={4} maxLength={3000} value={comment} onChange={(e) => setComment(e.target.value)}
              placeholder="What works well, and one thing they could improve. Be kind and specific." />
          </label>
          <div>
            <button type="submit" className="btn btn--primary btn--sm" disabled={busy || comment.trim().length < 15 || scores.some((v) => v === '')}>
              {busy && <span className="btn-spinner" />} Send review
            </button>
          </div>
        </form>
      )}
      {data.received.length > 0 && (
        <div className="pr-received">
          <h3 className="h5">What classmates said about your work</h3>
          {data.received.map((r) => (
            <div key={r.label} className="pr-received__item">
              <strong>{r.label}</strong>
              {r.scores.length > 0 && <small className="muted"> · {r.scores.reduce((a, b) => a + b, 0)} / {total}</small>}
              <p>{r.comment}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};

export default PeerReviewBox;
