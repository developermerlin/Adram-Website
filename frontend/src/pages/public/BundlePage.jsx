import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { lmsAPI, parseApiErrors } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { Spinner } from '../../components/ui/Section';
import CourseCard from '../../components/lms/CourseCard';
import GiftDialog from '../../components/lms/GiftDialog';
import useWishlist from '../../components/lms/useWishlist';
import { cartChanged } from '../../components/lms/cartStore';
import { paragraphs } from '../../utils/lms';
import { NotFoundPage } from './StatusPages';
import { money } from '../../components/lms/courseUtils';
import '../../styles/lms.css';
import '../../styles/marketplace.css';
import '../../styles/bundles.css';


/** One bundle: its courses, the price against buying them separately, and buying it (for yourself or as a gift). */
export const BundlePage = () => {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth();
  const wish = useWishlist();
  const [state, setState] = useState({ data: null, missing: false });
  const [busy, setBusy] = useState(false);
  const [gifting, setGifting] = useState(false);

  useEffect(() => {
    let live = true;
    lmsAPI.bundle(slug).then(({ data }) => live && setState({ data, missing: false })).catch(() => live && setState({ data: null, missing: true }));
    return () => {
      live = false;
    };
  }, [slug]);

  const { data: b, missing } = state;
  if (missing) return <NotFoundPage />;
  if (!b) return <Spinner label="Loading bundle…" />;
  const student = user?.role === 'STUDENT';
  const partly = b.owned.length > 0 && !b.owns_all;

  const buy = async () => {
    if (!isAuthenticated) {
      navigate('/login', { state: { from: `/bundles/${slug}` } });
      return;
    }
    setBusy(true);
    try {
      const { data } = await lmsAPI.buyBundle(slug);
      cartChanged();
      navigate(data.status === 'successful' ? '/student/learning' : `/orders/${data.id}`);
    } catch (err) {
      toast.error(parseApiErrors(err).detail || 'Your order could not be started.');
      setBusy(false);
    }
  };
  const gift = () => (isAuthenticated ? setGifting(true) : navigate('/login', { state: { from: `/bundles/${slug}` } }));

  return (
    <div className="container bd-page">
      <nav className="bd-crumbs" aria-label="Breadcrumb"><Link to="/courses">Courses</Link> <i className="fas fa-chevron-right" aria-hidden="true" /> <span>Bundles</span></nav>
      <div className="bd-head">
        <div>
          <p className="bd-kicker"><i className="fas fa-layer-group" aria-hidden="true" /> Bundle · {b.course_count} courses</p>
          <h1>{b.title}</h1>
          {b.summary && <p className="bd-summary">{b.summary}</p>}
          {b.description && <div className="bd-desc">{paragraphs(b.description).map((p) => <p key={p.slice(0, 40)}>{p}</p>)}</div>}
        </div>
        <aside className="card bd-buy">
          <p className="bd-buy__price">
            <strong>{money(partly ? b.your_price : b.price)}</strong>
            {Number(b.savings) > 0 && <s>{money(b.separate_price)}</s>}
          </p>
          {Number(b.savings) > 0 && <p className="bd-save"><i className="fas fa-tag" aria-hidden="true" /> Save {money(b.savings)} ({b.savings_percent}%) on buying the courses separately</p>}
          {partly && <p className="bd-note">You already own {b.owned.length} of these courses, so they’re taken off the price.</p>}
          {b.owns_all ? (
            <p className="bd-note"><i className="fas fa-circle-check" aria-hidden="true" /> You own every course in this bundle.</p>
          ) : (
            <button type="button" className="btn btn--primary btn--block btn--lg" onClick={buy} disabled={busy || (isAuthenticated && !student)}>
              {busy && <span className="btn-spinner" />} Buy the bundle
            </button>
          )}
          <button type="button" className="btn btn--outline btn--block" onClick={gift} disabled={isAuthenticated && !student}><i className="fas fa-gift" /> Buy as a gift</button>
          {isAuthenticated && !student && <p className="bd-note">Sign in with a student account to buy courses.</p>}
          <p className="bd-note">Pay by Orange Money, Afrimoney or card. Every course unlocks once the payment is confirmed.</p>
        </aside>
      </div>
      <section>
        <h2>What’s included</h2>
        <div className="cc-grid">
          {b.courses.map((c) => (
            <div key={c.slug} className="bd-course">
              {b.owned.includes(c.slug) && <span className="badge badge--green bd-owned"><i className="fas fa-check" /> You own this</span>}
              <CourseCard course={c} wish={wish} />
            </div>
          ))}
        </div>
      </section>
      {gifting && <GiftDialog target={{ bundle: slug }} title={b.title} price={money(b.price)} onClose={() => setGifting(false)} />}
    </div>
  );
};

export default BundlePage;
