import toast from 'react-hot-toast';

/** Copy link, LinkedIn, X and WhatsApp buttons for a public page (a certificate, a course). */
export const ShareButtons = ({ url, text, size = 'sm' }) => {
  const encoded = encodeURIComponent(url);
  const message = encodeURIComponent(text);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link copied');
    } catch {
      toast.error('Copy the link from the address bar instead.');
    }
  };
  const cls = `btn btn--outline btn--${size}`;
  return (
    <div className="share-row">
      <button type="button" className={cls} onClick={copy}><i className="fas fa-link" /> Copy link</button>
      <a className={cls} href={`https://www.linkedin.com/sharing/share-offsite/?url=${encoded}`} target="_blank" rel="noopener noreferrer"><i className="fab fa-linkedin" /> LinkedIn</a>
      <a className={cls} href={`https://twitter.com/intent/tweet?url=${encoded}&text=${message}`} target="_blank" rel="noopener noreferrer"><i className="fab fa-x-twitter" /> X</a>
      <a className={cls} href={`https://wa.me/?text=${message}%20${encoded}`} target="_blank" rel="noopener noreferrer"><i className="fab fa-whatsapp" /> WhatsApp</a>
    </div>
  );
};

export default ShareButtons;
