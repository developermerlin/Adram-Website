import { Link } from 'react-router-dom';

// A link from editable content: pages on this site ("/services") use the router, everything else
// ("https://…", "mailto:…", "tel:…") is a normal link, opened in a new tab when it leaves the site.
export const SmartLink = ({ to, children, ...props }) => {
  const target = (to || '').trim();
  if (!target) return <span {...props}>{children}</span>;
  if (/^(https?:|mailto:|tel:)/i.test(target)) {
    const web = /^https?:/i.test(target);
    return (
      <a href={target} {...(web ? { target: '_blank', rel: 'noopener noreferrer' } : {})} {...props}>
        {children}
      </a>
    );
  }
  return (
    <Link to={target} {...props}>
      {children}
    </Link>
  );
};

export default SmartLink;
