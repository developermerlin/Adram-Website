import toast from 'react-hot-toast';
import { site } from '../../config/site';

// Link to a page on ADRAM's own domain, e.g. shareUrl('/scholarships/chevening').
const shareUrl = (path) => `${site.url}${path}`;

const copy = async (url) => {
  try {
    await navigator.clipboard.writeText(url);
    toast.success('Link copied');
  } catch {
    window.prompt('Copy this link:', url); // clipboard blocked (e.g. plain http): let them copy by hand
  }
};

// "Share" uses the phone's share sheet when there is one, otherwise copies the link; plus WhatsApp.
export const ShareButtons = ({ path, title, className = 'btn btn--ghost-light' }) => {
  const url = shareUrl(path);
  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch (err) {
        if (err?.name === 'AbortError') return; // they closed the share sheet
      }
    }
    copy(url);
  };
  return (
    <>
      <button type="button" className={className} onClick={share}>
        <i className="fas fa-share-nodes" /> Share
      </button>
      <a href={`https://wa.me/?text=${encodeURIComponent(`${title}: ${url}`)}`} target="_blank" rel="noopener noreferrer" className={className} aria-label="Share on WhatsApp">
        <i className="fab fa-whatsapp" /> WhatsApp
      </a>
    </>
  );
};

// Read-only box showing the link with a copy button (admin editor).
export const CopyLink = ({ path }) => {
  const url = shareUrl(path);
  return (
    <div className="copy-link">
      <input className="input" readOnly value={url} aria-label="Shareable link" onFocus={(e) => e.target.select()} />
      <button type="button" className="icon-btn" title="Copy link" aria-label="Copy link" onClick={() => copy(url)}>
        <i className="far fa-copy" />
      </button>
    </div>
  );
};
