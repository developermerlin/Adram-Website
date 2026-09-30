// Images chosen in the admin portal are uploaded to Django and saved as /media/... paths. In development
// Vite proxies /media to Django; in production the API may live on another domain (VITE_API_URL).
const apiOrigin = () => {
  const url = import.meta.env.VITE_API_URL;
  if (!url) return '';
  try {
    return new URL(url).origin;
  } catch {
    return '';
  }
};

/** Address to use in <img src>, <video src> or a CSS url(): uploaded photos and lesson files live on the API server. */
export const assetUrl = (path) => (typeof path === 'string' && (path.startsWith('/media/') || path.startsWith('/api/')) ? `${apiOrigin()}${path}` : path || '');
