import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { parseApiErrors, shopAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

// Pages that change the cart fire this so the header count updates.
export const CART_CHANGED = 'adram:cart-changed';
export const cartChanged = () => window.dispatchEvent(new Event(CART_CHANGED));

/** How many courses are in the signed-in student's cart (0 for everyone else). */
export const useCartCount = () => {
  const { user } = useAuth();
  const isStudent = user?.role === 'STUDENT';
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!isStudent) return undefined;
    let live = true;
    const load = () => shopAPI.cart().then(({ data }) => live && setCount(data.count)).catch(() => {});
    load();
    window.addEventListener(CART_CHANGED, load);
    return () => {
      live = false;
      window.removeEventListener(CART_CHANGED, load);
    };
  }, [isStudent]);
  return isStudent ? count : 0;
};

/** Add a course to the cart, with feedback. Returns true when it worked. */
export const useAddToCart = () =>
  useCallback(async (slug) => {
    try {
      await shopAPI.addToCart(slug);
      cartChanged();
      toast.success('Added to your cart');
      return true;
    } catch (err) {
      toast.error(parseApiErrors(err).form || 'This course could not be added to your cart.');
      return false;
    }
  }, []);
