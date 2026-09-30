import { useEffect, useSyncExternalStore } from 'react';
import { lmsAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { CART_CHANGED } from './cartStore';

// What the signed-in person owns, has in the cart or saved, shared by every course card on the page
// (one request, refreshed whenever the cart changes).
const EMPTY = { loaded: false, owned: [], requested: [], cart: [], wishlist: [], teaching: [] };
let state = EMPTY;
let loadedFor = null;
const listeners = new Set();

const emit = () => listeners.forEach((fn) => fn());
const subscribe = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
const snapshot = () => state;

export const refreshLibrary = () =>
  lmsAPI.library()
    .then(({ data }) => {
      state = { loaded: true, ...data };
      emit();
    })
    .catch(() => {});

if (typeof window !== 'undefined') window.addEventListener(CART_CHANGED, () => loadedFor && refreshLibrary());

/** {owned, cart, wishlist, requested, teaching} as lists of course slugs; empty for visitors. */
export const useLibrary = () => {
  const { user } = useAuth();
  const id = user?.id || null;
  useEffect(() => {
    if (id && loadedFor !== id) {
      loadedFor = id;
      refreshLibrary();
    }
    if (!id && loadedFor) {
      loadedFor = null;
      state = EMPTY;
      emit();
    }
  }, [id]);
  return useSyncExternalStore(subscribe, snapshot, snapshot);
};
