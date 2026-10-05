import { Suspense, useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import SiteHeader from './SiteHeader';
import SiteFooter from './SiteFooter';
import ChatWidget from '../chatbot/ChatWidget';

const BackToTop = () => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 600);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <button
      type="button"
      className={`back-to-top${visible ? ' is-visible' : ''}`}
      aria-label="Back to top"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
    >
      <i className="fas fa-arrow-up" />
    </button>
  );
};

/** Shown for a moment while a page's code downloads. */
export const PageLoading = () => (
  <div className="page-loading" role="status" aria-live="polite"><span className="btn-spinner" aria-hidden="true" /><span className="sr-only">Loading…</span></div>
);

// Header and footer stay mounted while the page content (Outlet) changes.
export const PublicLayout = () => (
  <>
    <SiteHeader />
    <main>
      <Suspense fallback={<PageLoading />}>
        <Outlet />
      </Suspense>
    </main>
    <SiteFooter />
    <BackToTop />
    <ChatWidget />
  </>
);

export default PublicLayout;
