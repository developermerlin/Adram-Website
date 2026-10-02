import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { lmsAPI } from '../../services/api';
import { Spinner } from '../../components/ui/Section';
import CourseCard from '../../components/lms/CourseCard';
import useWishlist from '../../components/lms/useWishlist';
import { NotFoundPage } from './StatusPages';
import '../../styles/marketplace.css';
import '../../styles/search.css';

/** /topics/<slug>: every course on one topic (e.g. JavaScript), with related topics to explore next. */
export const TopicPage = () => {
  const { slug } = useParams();
  const wish = useWishlist();
  const [state, setState] = useState({ slug: null, data: null, missing: false });

  useEffect(() => {
    let live = true;
    lmsAPI.topic(slug)
      .then(({ data }) => live && setState({ slug, data, missing: false }))
      .catch(() => live && setState({ slug, data: null, missing: true }));
    return () => {
      live = false;
    };
  }, [slug]);

  if (state.slug === slug && state.missing) return <NotFoundPage />;
  const data = state.slug === slug ? state.data : null;
  if (!data) return <Spinner label="Loading courses…" />;

  return (
    <div className="topic-page">
      <section className="topic-hero">
        <div className="container">
          <nav className="breadcrumb" aria-label="Breadcrumb">
            <Link to="/">Home</Link>
            <span className="breadcrumb__item"><span aria-hidden="true">/</span><Link to="/courses">Training</Link></span>
            <span className="breadcrumb__item"><span aria-hidden="true">/</span><span>Topics</span></span>
          </nav>
          <p className="topic-hero__eyebrow"><i className="fas fa-tag" aria-hidden="true" /> Topic</p>
          <h1>{data.name} courses</h1>
          <p>{data.count} {data.count === 1 ? 'course' : 'courses'} on {data.name}{data.categories.length ? ` in ${data.categories.map((c) => c.name).join(', ')}` : ''}.</p>
        </div>
      </section>
      <div className="container topic-body">
        {data.related.length > 0 && (
          <div className="topic-related">
            <span className="muted small">Related topics</span>
            <div className="cd-topics">{data.related.map((t) => <Link key={t.slug} to={`/topics/${t.slug}`} className="cd-topic">{t.name}</Link>)}</div>
          </div>
        )}
        <div className="cc-grid">{data.courses.map((c) => <CourseCard key={c.slug} course={c} wish={wish} />)}</div>
        <p className="topic-more"><Link to={`/courses?q=${encodeURIComponent(data.name)}`} className="link-arrow">Search all courses for “{data.name}” <i className="fas fa-arrow-right" /></Link></p>
      </div>
    </div>
  );
};

export default TopicPage;
