import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { lmsAPI } from '../../services/api';
import { rememberAffiliate, rememberReferral } from '../../utils/referral';

// Count each partner's link once per browser session (reloads and repeat visits aren't new clicks)
const counted = new Set();
const firstVisit = (code) => {
  const key = `adram_aff_seen_${code.toUpperCase()}`;
  if (counted.has(key)) return false;
  counted.add(key);
  try {
    if (sessionStorage.getItem(key)) return false;
    sessionStorage.setItem(key, '1');
  } catch { /* no session storage: the in-memory set still stops doubles */ }
  return true;
};

/**
 * Remembers a friend's invitation code from any page opened with ?ref=CODE (sent when the visitor signs up), and an
 * affiliate partner's code from ?aff=CODE (the visit is counted; the code goes with the visitor's orders).
 */
export const ReferralCatcher = () => {
  const { search } = useLocation();
  useEffect(() => {
    rememberReferral(search);
    const aff = new URLSearchParams(search).get('aff');
    if (aff && /^[A-Za-z0-9]{4,12}$/.test(aff) && firstVisit(aff)) {
      lmsAPI.affiliateClick(aff).then(({ data }) => rememberAffiliate(aff, data.days || 30)).catch(() => {});
    }
  }, [search]);
  return null;
};

export default ReferralCatcher;
