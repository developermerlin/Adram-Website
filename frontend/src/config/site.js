// Company details used across the site. Update them here, not in individual pages.
export const site = {
  name: 'ADRAM Technologies',
  shortName: 'ADRAM',
  tagline: 'Building Solutions for a Better Future',
  // Public address used in links people share (e.g. a scholarship's Share button).
  url: (import.meta.env.VITE_SITE_URL || 'https://adramtechnologies.com').replace(/\/$/, ''),
  email: 'adramtechnologies@gmail.com',
  phones: ['+232 76 978 720', '+232 76 827 374'],
  location: 'Freetown, Sierra Leone',
  hours: [
    { days: 'Monday – Friday', short: 'Mon – Fri', time: '9:00 AM – 6:00 PM', weekdays: [1, 2, 3, 4, 5], open: 9, close: 18 },
    { days: 'Saturday', short: 'Sat', time: '10:00 AM – 4:00 PM', weekdays: [6], open: 10, close: 16 },
    { days: 'Sunday', short: 'Sun', time: 'Closed', weekdays: [0] },
  ],
  // `brand` is each network's official colour, used for the icon buttons.
  // TODO: replace the Instagram, X and LinkedIn links with ADRAM's own profile URLs.
  socials: [
    { id: 'facebook', label: 'Facebook', icon: 'fab fa-facebook-f', href: 'https://www.facebook.com/sai4ull' },
    { id: 'whatsapp', label: 'WhatsApp', icon: 'fab fa-whatsapp', href: 'https://wa.me/23276978720' },
    { id: 'instagram', label: 'Instagram', icon: 'fab fa-instagram', href: 'https://www.instagram.com/' },
    { id: 'x', label: 'X (Twitter)', icon: 'fab fa-x-twitter', href: 'https://x.com/' },
    { id: 'linkedin', label: 'LinkedIn', icon: 'fab fa-linkedin-in', href: 'https://www.linkedin.com/' },
  ],
};

// Freetown is on GMT (UTC+0) all year, so UTC time is local office time for every visitor.
export const officeStatus = (now = new Date()) => {
  const day = now.getUTCDay();
  const hour = now.getUTCHours() + now.getUTCMinutes() / 60;
  const today = site.hours.find((h) => h.weekdays.includes(day));
  const open = Boolean(today?.open !== undefined && hour >= today.open && hour < today.close);
  return { today, open };
};

export const whatsappHref = site.socials.find((s) => s.id === 'whatsapp')?.href;
export const mapsHref = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${site.name}, ${site.location}`)}`;

export const telHref = (phone) => `tel:${phone.replace(/\s/g, '')}`;
