import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { fill } from './merge';
import { usePageContent, useSite } from './useContent';
import { assetUrl } from '../utils/assets';
import { useServices } from './useServices';

// Sets the browser tab title and the search description for the page being shown, from each page's editable
// "Search & browser title" content. A service's own page is titled after the service. Pages without an entry
// (portal, sign-in) keep the site-wide title from index.html.
const ROUTES = [
  ['/about/team', 'team'],
  ['/about', 'about'],
  ['/services', 'services'],
  ['/courses', 'courses'],
  ['/scholarships', 'scholarships'],
  ['/contact', 'contact'],
  ['/join', 'other'],
  ['/blog', 'blog'],
  ['/partners', 'partners'],
  ['/projects', 'projects'],
  ['/learning', 'learning'],
];

// What index.html says, kept so it can be restored
const original = {
  title: document.title,
  description: document.querySelector('meta[name="description"]')?.content || '',
};

const setDescription = (text) => {
  let tag = document.querySelector('meta[name="description"]');
  if (!tag) {
    tag = document.createElement('meta');
    tag.name = 'description';
    document.head.appendChild(tag);
  }
  tag.content = text;
};

const Meta = ({ slug, pathname }) => {
  const site = useSite();
  const content = usePageContent(slug);
  const { services, details } = useServices();
  const serviceId = slug === 'services' ? pathname.split('/')[2] : null;
  const service = serviceId ? services.find((s) => s.id === serviceId) : null;

  const title = service ? `${service.title} | ${site.name}` : fill(content.seo.title, site);
  const description = service ? details[service.id]?.tagline || service.summary : fill(content.seo.description, site);

  useEffect(() => {
    document.title = title;
    if (description) setDescription(description);
  }, [title, description]);

  // Leaving for a page without its own title (the portal, sign-in) puts the site-wide title back
  useEffect(
    () => () => {
      document.title = original.title;
      setDescription(original.description);
    },
    [],
  );
  return null;
};

// The tab icon from the site-wide details (the server also writes it into the page for the first load)
const SiteIcon = () => {
  const { favicon } = usePageContent('site');
  useEffect(() => {
    if (!favicon) return;
    document.querySelectorAll('link[rel="icon"]').forEach((el) => el.remove());
    const link = document.createElement('link');
    link.rel = 'icon';
    link.href = assetUrl(favicon);
    document.head.appendChild(link);
  }, [favicon]);
  return null;
};

export const PageMeta = () => {
  const { pathname } = useLocation();
  const slug = pathname === '/' ? 'home' : ROUTES.find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`))?.[1];
  const article = slug === 'blog' && pathname.replace(/\/$/, '') !== '/blog'; // a post sets its own title (BlogPostPage)
  return (
    <>
      <SiteIcon />
      {slug && !article && <Meta key={slug} slug={slug} pathname={pathname} />}
    </>
  );
};

export default PageMeta;
