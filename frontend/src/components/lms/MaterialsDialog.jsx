import { useEffect, useState } from 'react';
import { lmsAPI } from '../../services/api';
import { assetUrl } from '../../utils/assets';
import { formatSize } from '../../utils/lms';

const ICONS = { notes: 'fa-file-lines', document: 'fa-file-pdf', video: 'fa-file-video', resource: 'fa-file-arrow-down' };

/** In the course player: every file the student can download, lesson by lesson, and the whole course as one ZIP. */
const MaterialsDialog = ({ slug, onClose }) => {
  const [state, setState] = useState({ data: null, error: '' });
  useEffect(() => {
    let live = true;
    lmsAPI.materials(slug)
      .then(({ data }) => live && setState({ data, error: '' }))
      .catch((err) => live && setState({ data: null, error: err.response?.data?.detail || 'The materials could not be loaded.' }));
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      live = false;
      window.removeEventListener('keydown', onKey);
    };
  }, [slug, onClose]);

  const { data, error } = state;
  return (
    <div className="ldm" role="dialog" aria-modal="true" aria-labelledby="ldm-title">
      <button type="button" className="ldm__backdrop" aria-label="Close" onClick={onClose} />
      <div className="ldm__card">
        <header className="ldm__head">
          <div>
            <h2 id="ldm-title">Course materials</h2>
            <p className="muted small">Download the lesson notes, documents and resources to keep or study offline.</p>
          </div>
          <button type="button" className="ldm__close" onClick={onClose} aria-label="Close"><i className="fas fa-xmark" /></button>
        </header>

        {!data && !error && <p className="muted">Loading…</p>}
        {error && <p className="ldm__error">{error}</p>}
        {data && (
          <>
            <div className="ldm__all">
              <span><strong>{data.file_count} {data.file_count === 1 ? 'file' : 'files'}</strong> · {formatSize(data.total_size)}{!data.videos_included && ' · videos stream only'}</span>
              <a href={assetUrl(data.zip_url)} className="btn btn--primary btn--sm" download><i className="fas fa-file-zipper" /> Download everything (.zip)</a>
            </div>
            {data.sections.length === 0 && <p className="muted">This course has no files to download yet.</p>}
            {data.sections.map((s) => (
              <section key={s.id} className="ldm__section">
                <h3>{s.title}</h3>
                {s.lessons.map((l) => (
                  <div key={l.id} className="ldm__lesson">
                    <strong>{l.title}</strong>
                    <ul>
                      {l.files.map((f) => (
                        <li key={f.url}>
                          <i className={`fas ${ICONS[f.kind] || 'fa-file'}`} aria-hidden="true" />
                          <span>{f.title && f.title !== f.name ? `${f.title} · ` : ''}{f.name}<small> · {formatSize(f.size)}</small></span>
                          <a href={assetUrl(f.url)} className="btn btn--outline btn--sm" download>Download</a>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </section>
            ))}
          </>
        )}
      </div>
    </div>
  );
};

export default MaterialsDialog;
