import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePageContent } from '../../content/useContent';
import { learningAPI } from '../../services/api';
import BrandIcon from '../brand/BrandIcon';
import { LevelDots } from './LearningParts';
import { levelList } from './levels';

/**
 * The Learning hub introduced on another page (the Services page): its published fields as small cards and a way in.
 * Wording: Site content → Learning hub → "On the Services page".
 */
export const LearningBand = () => {
  const c = usePageContent('learning');
  const b = c.servicesBand;
  const levels = levelList(c);
  const [fields, setFields] = useState(null);
  useEffect(() => {
    learningAPI.fields().then(({ data }) => setFields(data.results)).catch(() => setFields([]));
  }, []);
  if (!b?.show) return null;
  return (
    <section className="section lb-band" aria-labelledby="lb-title">
      <div className="container">
        <div className="lb-card">
          <div className="lb-copy">
            {b.eyebrow && <span className="eyebrow">{b.eyebrow}</span>}
            <h2 id="lb-title">{b.title}</h2>
            {b.text && <p>{b.text}</p>}
            <ul className="lb-points">
              {levels.map((l) => <li key={l.level}><span>{l.level}</span>{l.name}</li>)}
            </ul>
            <Link to="/learning" className="btn btn--primary">{b.button} <i className="fas fa-arrow-right" aria-hidden="true" /></Link>
          </div>
          <div className="lb-fields">
            {fields === null && [0, 1].map((i) => <div key={i} className="lb-field lb-field--skeleton"><span className="skeleton skeleton--block" /></div>)}
            {fields?.map((f) => (
              <Link key={f.slug} to={`/learning/${f.slug}`} className="lb-field">
                <span className="lb-field__icon"><BrandIcon name={f.icon || 'network'} size={26} /></span>
                <span className="lb-field__text">
                  <strong>{f.name}</strong>
                  <small>{f.notes} notes · {f.topics} topics</small>
                  <LevelDots levels={f.levels} names={levels} />
                </span>
                <i className="fas fa-arrow-right lb-field__go" aria-hidden="true" />
              </Link>
            ))}
            {fields?.length === 0 && <p className="lb-empty">{c.labels.empty}</p>}
          </div>
        </div>
      </div>
    </section>
  );
};

export default LearningBand;
