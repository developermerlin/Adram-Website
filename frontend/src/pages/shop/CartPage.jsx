import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { lmsAPI, parseApiErrors, shopAPI } from '../../services/api';
import { Alert } from '../../components/ui/Form';
import BrandIcon from '../../components/brand/BrandIcon';
import Stars from '../../components/lms/Stars';
import CourseCard from '../../components/lms/CourseCard';
import { cartChanged, useAddToCart } from '../../components/lms/cartStore';
import { instructorName, money, useCourseImage } from '../../components/lms/courseUtils';
import { assetUrl } from '../../utils/assets';
import { formatDuration } from '../../utils/lms';
import '../../styles/lms.css';
import '../../styles/marketplace.css';
import '../../styles/shop.css';

/** The shopping cart: courses waiting to be bought, a coupon, the totals and checkout. */
export const CartPage = () => {
  const navigate = useNavigate();
  const imageOf = useCourseImage();
  const addToCart = useAddToCart();
  const [cart, setCart] = useState(null);
  const [error, setError] = useState('');
  const [code, setCode] = useState('');
  const [applied, setApplied] = useState('');
  const [wishlist, setWishlist] = useState([]);
  const [busy, setBusy] = useState('');

  const load = useCallback((coupon = '') =>
    shopAPI.cart(coupon)
      .then(({ data }) => {
        setCart(data);
        setError('');
      })
      .catch(() => setError('Your cart could not be loaded. Refresh the page to try again.')), []);

  useEffect(() => {
    load();
    let live = true;
    lmsAPI.wishlist().then(({ data }) => live && setWishlist(data.courses)).catch(() => {});
    return () => {
      live = false;
    };
  }, [load]);

  const remove = async (slug) => {
    setBusy(slug);
    await shopAPI.removeFromCart(slug).catch(() => {});
    cartChanged();
    await load(applied);
    setBusy('');
  };
  const saveForLater = async (course) => {
    setBusy(course.slug);
    try {
      await lmsAPI.wish(course.slug);
      await shopAPI.removeFromCart(course.slug);
      setWishlist((w) => [course, ...w.filter((c) => c.slug !== course.slug)]);
      toast.success('Moved to your wishlist');
      cartChanged();
      await load(applied);
    } catch {
      toast.error('That could not be moved.');
    } finally {
      setBusy('');
    }
  };
  const moveToCart = async (course) => {
    if (await addToCart(course.slug)) {
      setWishlist((w) => w.filter((c) => c.slug !== course.slug));
      load(applied);
    }
  };
  const applyCoupon = async (e) => {
    e.preventDefault();
    setApplied(code.trim());
    await load(code.trim());
  };
  const clearCoupon = async () => {
    setCode('');
    setApplied('');
    await load('');
  };
  const checkout = async () => {
    setBusy('checkout');
    try {
      const { data } = await shopAPI.checkout(cart.coupon ? applied : '');
      cartChanged();
      if (data.status === 'successful') {
        toast.success('You’re enrolled! Enjoy your courses.');
        navigate('/student/learning');
      } else {
        navigate(`/orders/${data.id}`);
      }
    } catch (err) {
      const e = parseApiErrors(err);
      toast.error(e.coupon || e.form || 'Your order could not be placed.');
      setBusy('');
      load(applied);
    }
  };

  const blocked = cart?.items.some((i) => i.problem);

  return (
    <div className="shop container">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link to="/">Home</Link>
        <span className="breadcrumb__item"><span aria-hidden="true">/</span><Link to="/courses">Training</Link></span>
        <span className="breadcrumb__item"><span aria-hidden="true">/</span><span>Cart</span></span>
      </nav>
      <h1 className="shop__title">Shopping cart</h1>
      <Alert>{error}</Alert>
      {!cart && !error && <div className="skeleton skeleton--block" />}

      {cart && cart.count === 0 && (
        <section className="card shop-empty">
          <span className="shop-empty__icon"><i className="fas fa-cart-shopping" aria-hidden="true" /></span>
          <h2>Your cart is empty</h2>
          <p className="muted">Keep browsing to find a course you’ll love.</p>
          <Link to="/courses" className="btn btn--primary"><i className="fas fa-compass" /> Browse courses</Link>
        </section>
      )}

      {cart && cart.count > 0 && (
        <div className="shop-grid">
          <section aria-label="Courses in your cart">
            <p className="shop__count">{cart.count} {cart.count === 1 ? 'course' : 'courses'} in cart</p>
            <ul className="cart-list">
              {cart.items.map(({ course, list_price: listPrice, price, discount, amount, problem }) => {
                const image = imageOf(course);
                const stats = course.stats || {};
                return (
                  <li key={course.slug} className={`cart-item${problem ? ' has-problem' : ''}`}>
                    <Link to={`/courses/${course.slug}`} className="cart-item__thumb" tabIndex={-1} aria-hidden="true">
                      {image ? <img src={assetUrl(image)} alt="" loading="lazy" /> : <span><BrandIcon name={course.icon} size={32} /></span>}
                    </Link>
                    <div className="cart-item__body">
                      <Link to={`/courses/${course.slug}`} className="cart-item__title">{course.title}</Link>
                      <span className="muted small">By {instructorName(course)}</span>
                      {stats.rating_count > 0 && (
                        <span className="cart-item__rating"><b>{stats.rating_average.toFixed(1)}</b> <Stars value={stats.rating_average} size={12} /> <small className="muted">({stats.rating_count})</small></span>
                      )}
                      <span className="muted small">
                        {stats.total_seconds ? `${formatDuration(stats.total_seconds)} · ` : ''}{stats.lesson_count || 0} lessons
                      </span>
                      {problem && <p className="cart-item__problem"><i className="fas fa-triangle-exclamation" aria-hidden="true" /> {problem} Remove it to continue.</p>}
                      <div className="cart-item__actions">
                        <button type="button" className="btn btn--text btn--sm" onClick={() => remove(course.slug)} disabled={busy === course.slug}>Remove</button>
                        <button type="button" className="btn btn--text btn--sm" onClick={() => saveForLater(course)} disabled={busy === course.slug}>Move to wishlist</button>
                      </div>
                    </div>
                    <div className="cart-item__price">
                      <strong>{money(amount)}</strong>
                      {Number(listPrice) > Number(amount) && <s className="muted">{money(listPrice)}</s>}
                      {Number(discount) > 0 && <small className="shop-off">Coupon −{money(discount)}</small>}
                      {Number(price) < Number(listPrice) && Number(discount) === 0 && <small className="shop-off">On sale</small>}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>

          <aside className="card shop-summary" aria-label="Order summary">
            <h2>Summary</h2>
            <dl className="shop-lines">
              <div><dt>Subtotal</dt><dd>{money(cart.subtotal)}</dd></div>
              {Number(cart.discount) > 0 && <div className="shop-lines__off"><dt>Coupon{cart.coupon ? ` (${cart.coupon.code})` : ''}</dt><dd>−{money(cart.discount)}</dd></div>}
              <div className="shop-lines__total"><dt>Total</dt><dd>{money(cart.total)}</dd></div>
            </dl>
            <button type="button" className="btn btn--primary btn--block btn--lg" onClick={checkout} disabled={!!busy || blocked}>
              {busy === 'checkout' ? <span className="btn-spinner" /> : <i className="fas fa-lock" />} Checkout
            </button>
            {blocked && <p className="muted small">Remove the courses marked above to continue.</p>}
            <p className="muted small shop-summary__note">You’ll pay by mobile money and upload your receipt. Your courses unlock as soon as ADRAM confirms it.</p>

            <div className="shop-coupon">
              {cart.coupon ? (
                <p className="shop-coupon__applied">
                  <i className="fas fa-ticket" aria-hidden="true" /> <strong>{cart.coupon.code}</strong> is applied
                  <button type="button" className="btn btn--text btn--sm" onClick={clearCoupon}>Remove</button>
                </p>
              ) : (
                <form onSubmit={applyCoupon} className="shop-coupon__form">
                  <label htmlFor="coupon" className="sr-only">Coupon code</label>
                  <input id="coupon" className="input" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Enter coupon" maxLength={40} />
                  <button type="submit" className="btn btn--outline" disabled={!code.trim()}>Apply</button>
                </form>
              )}
              {cart.coupon_error && <p className="shop-error" role="alert">{cart.coupon_error}</p>}
            </div>
          </aside>
        </div>
      )}

      {wishlist.length > 0 && (
        <section className="shop-wish">
          <h2>Your wishlist</h2>
          <div className="cc-grid">
            {wishlist.slice(0, 8).map((course) => (
              <div key={course.slug} className="shop-wish__item">
                <CourseCard course={course} />
                {!course.is_free && <button type="button" className="btn btn--outline btn--sm btn--block" onClick={() => moveToCart(course)}><i className="fas fa-cart-plus" /> Move to cart</button>}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

export default CartPage;
