import { useMemo } from 'react';
import { usePageContent } from './useContent';

/**
 * The services, with the admin's edits applied. Returns:
 *   services: the cards, in order: { id, title, brandIcon, summary, includes, image, heroImage, featured }
 *   details:  each service's full page, by id: { tagline, overview, idealFor, benefits, process, techStack, faqs, … }
 *   content:  the Services page wording (header, labels, contact banner)
 */
export const useServices = () => {
  const content = usePageContent('services');
  return useMemo(() => {
    // A card needs an address and a title; anything half-finished in the editor is skipped
    const items = (content.items || []).filter((i) => i && i.id && i.title);
    return {
      content,
      services: items.map((i) => ({
        id: i.id,
        title: i.title,
        brandIcon: i.icon || 'server',
        summary: i.summary || '',
        includes: i.includes || [],
        image: i.image || '',
        heroImage: i.heroImage || '',
        featured: Boolean(i.featured),
      })),
      details: Object.fromEntries(items.map((i) => [i.id, i.details || {}])),
    };
  }, [content]);
};

export default useServices;
