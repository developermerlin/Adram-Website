// A friend's invitation code from a ?ref= link, kept until the visitor signs up (then sent with the registration).
const KEY = 'adram_ref';
const DAYS = 30;

export const rememberReferral = (search) => {
  const code = new URLSearchParams(search).get('ref');
  if (!code || !/^[A-Za-z0-9]{4,12}$/.test(code)) return;
  try {
    localStorage.setItem(KEY, JSON.stringify({ code: code.toUpperCase(), at: Date.now() }));
  } catch { /* private mode: the friend can still enter the code later */ }
};

export const savedReferral = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    return saved && Date.now() - saved.at < DAYS * 86400000 ? saved.code : '';
  } catch {
    return '';
  }
};

export const forgetReferral = () => {
  try {
    localStorage.removeItem(KEY);
  } catch { /* nothing to do */ }
};

// An affiliate partner's code from a ?aff= link: kept for the days the server says, and sent with every order.
const AFF_KEY = 'adram_aff';

export const rememberAffiliate = (code, days) => {
  try {
    localStorage.setItem(AFF_KEY, JSON.stringify({ code: code.toUpperCase(), until: Date.now() + days * 86400000 }));
  } catch { /* private mode: the purchase just won't be credited */ }
};

export const savedAffiliate = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(AFF_KEY) || 'null');
    return saved && Date.now() < saved.until ? saved.code : '';
  } catch {
    return '';
  }
};

/** Adds the remembered affiliate code (if any) to an order request. */
export const withAffiliate = (data = {}) => {
  const affiliate = savedAffiliate();
  return affiliate ? { ...data, affiliate } : data;
};
