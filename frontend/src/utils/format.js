const dateFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const dateTimeFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
const relativeFmt = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

export const formatDate = (value) => (value ? dateFmt.format(new Date(value)) : '—');
export const formatDateTime = (value) => (value ? dateTimeFmt.format(new Date(value)) : '—');

// "5 minutes ago", "yesterday"; falls back to the date after a week.
export const timeAgo = (value) => {
  if (!value) return '—';
  const seconds = Math.round((new Date(value) - Date.now()) / 1000);
  const units = [
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ];
  if (Math.abs(seconds) < 60) return 'just now';
  if (Math.abs(seconds) > 7 * 86400) return formatDate(value);
  const [unit, size] = units.find(([, s]) => Math.abs(seconds) >= s);
  return relativeFmt.format(Math.round(seconds / size), unit);
};

export const greeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
};

// Amounts are in new Sierra Leonean leones (NLe).
export const formatMoney = (value) =>
  value === null || value === undefined || value === ''
    ? '—'
    : `NLe ${Number(value).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
