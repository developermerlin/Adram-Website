import { useEffect } from 'react';
import { usePageContent } from '../../content/useContent';
import { applyTheme, resolveTheme } from '../../content/theme';

/** Applies the colour scheme the admin chose (Site content → Contact details & footer → Colours) to the whole site. */
const SiteTheme = () => {
  const { theme } = usePageContent('site');
  const key = JSON.stringify(resolveTheme(theme));
  useEffect(() => {
    applyTheme(JSON.parse(key));
  }, [key]);
  return null;
};

export default SiteTheme;
