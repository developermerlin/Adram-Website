import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { lmsAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

/** The signed-in student's wishlist. `wish` is null for everyone else, so cards simply show no heart. */
export const useWishlist = () => {
  const { user } = useAuth();
  const isStudent = user?.role === 'STUDENT';
  const [slugs, setSlugs] = useState([]);

  useEffect(() => {
    if (!isStudent) return undefined;
    let live = true;
    lmsAPI.wishlist().then(({ data }) => live && setSlugs(data.slugs)).catch(() => {});
    return () => {
      live = false;
    };
  }, [isStudent]);

  const toggle = useCallback(
    async (slug) => {
      const saved = slugs.includes(slug);
      setSlugs((s) => (saved ? s.filter((x) => x !== slug) : [...s, slug]));
      try {
        await (saved ? lmsAPI.unwish(slug) : lmsAPI.wish(slug));
        toast.success(saved ? 'Removed from your wishlist' : 'Saved to your wishlist');
      } catch {
        setSlugs((s) => (saved ? [...s, slug] : s.filter((x) => x !== slug)));
        toast.error('Your wishlist could not be updated.');
      }
    },
    [slugs],
  );

  return isStudent ? { has: (slug) => slugs.includes(slug), toggle } : null;
};

export default useWishlist;
