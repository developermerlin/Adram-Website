import { useEffect, useState } from 'react';
import { catalogAPI, tokenStorage } from '../services/api';

// Scholarships and courses are edited in the admin portal and served by the API. Lists are fetched
// once per page load and shared (the header, landing page and courses page all use the courses list).
const cache = {};

const fetchList = (key, request) => {
  cache[key] = cache[key] || request().then(({ data }) => data);
  cache[key].catch(() => delete cache[key]); // let the next visit retry
  return cache[key];
};

// Call after an admin edit so the public pages show the change without a reload.
export const invalidateCatalog = () => Object.keys(cache).forEach((key) => delete cache[key]);

const useRemote = (key, load) => {
  const [state, setState] = useState({ key: null, data: null, error: null });

  useEffect(() => {
    if (!key) return undefined; // nothing to load (e.g. no slug)
    let live = true;
    load()
      .then((data) => live && setState({ key, data, error: null }))
      .catch((error) => live && setState({ key, data: null, error }));
    return () => {
      live = false;
    };
    // `load` is recreated on every render; the key identifies it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Ignore a previous key's result while the new one loads (e.g. moving between scholarship pages).
  const current = state.key === key;
  return { data: current ? state.data : null, error: current ? state.error : null, loading: !current };
};

// Signed-in users get official links, so the cached list is kept per sign-in state.
export const useScholarships = () => {
  const key = `scholarships:${tokenStorage.access ? 'in' : 'out'}`;
  return useRemote(key, () => fetchList(key, catalogAPI.scholarships));
};
export const useCourses = () => useRemote('courses', () => fetchList('courses', catalogAPI.courses));
// Not cached: editors preview drafts here, so it should always be fresh.
export const useScholarship = (slug) => {
  const key = slug ? `${slug}:${tokenStorage.access ? 'in' : 'out'}` : null;
  return useRemote(key, () => catalogAPI.scholarship(slug).then(({ data }) => data));
};
