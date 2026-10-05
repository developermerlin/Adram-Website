import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import PortalLayout from '../../components/layout/PortalLayout';
import NewsletterOverview from '../../components/newsletter/NewsletterOverview';
import NewsletterSubscribers from '../../components/newsletter/NewsletterSubscribers';
import NewsletterIssues from '../../components/newsletter/NewsletterIssues';
import NewsletterSettings from '../../components/newsletter/NewsletterSettings';
import { newsletterAPI } from '../../services/api';
import '../../styles/newsletter.css';

const TABS = [
  { id: 'overview', label: 'Overview', icon: 'fa-chart-simple' },
  { id: 'subscribers', label: 'Subscribers', icon: 'fa-users' },
  { id: 'newsletters', label: 'Newsletters', icon: 'fa-newspaper' },
  { id: 'settings', label: 'Settings', icon: 'fa-sliders' },
];

/** Admin → Newsletter: the footer sign-ups, writing and sending newsletters, and the form's settings. */
export const AdminNewsletterPage = () => {
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.id === params.get('tab')) ? params.get('tab') : 'overview';
  const issue = params.get('issue');
  const openId = issue === 'new' ? 'new' : issue ? Number(issue) : null;
  const [subscribers, setSubscribers] = useState(0);

  const refreshCount = useCallback(() => newsletterAPI.overview().then(({ data }) => setSubscribers(data.subscribed)).catch(() => {}), []);
  useEffect(() => {
    refreshCount();
  }, [refreshCount, tab]);

  const go = (next, extra = {}) => setParams({ tab: next, ...extra });
  const openIssue = (id) => go('newsletters', id === null ? {} : { issue: String(id) });

  return (
    <PortalLayout title="Newsletter" subtitle="People who sign up in the website footer, the newsletters you send them, and the sign-up form itself.">
      <div className="tabs nl-tabs" role="tablist" aria-label="Newsletter">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={`tabs__tab${tab === t.id ? ' is-active' : ''}`} onClick={() => go(t.id)}>
            <i className={`fas ${t.icon}`} aria-hidden="true" /> {t.label}
            {t.id === 'subscribers' && <span className="nl-tabs__count">{subscribers}</span>}
          </button>
        ))}
      </div>
      {tab === 'overview' && <NewsletterOverview onWrite={() => openIssue('new')} onOpenIssue={openIssue} />}
      {tab === 'subscribers' && <NewsletterSubscribers onChange={refreshCount} />}
      {tab === 'newsletters' && <NewsletterIssues openId={openId} onOpen={openIssue} subscribers={subscribers} />}
      {tab === 'settings' && <NewsletterSettings />}
    </PortalLayout>
  );
};

export default AdminNewsletterPage;
