// Fixed options for scholarship listings. The scholarships themselves are edited in the admin portal
// (Admin → Scholarships) and served by the API; see useCatalog.js.

export const LEVELS = ['Undergraduate', 'Masters', 'PhD'];

export const FUNDING = { full: 'Fully funded', partial: 'Partial funding' };

// Must match DESTINATION_CHOICES in backend/catalog/models.py (and add a flag in components/ui/Flag.jsx).
export const destinations = {
  gb: { name: 'United Kingdom', city: 'London, Edinburgh, Manchester…' },
  us: { name: 'United States', city: 'Universities across the USA' },
  ca: { name: 'Canada', city: 'Toronto' },
  de: { name: 'Germany', city: 'Berlin, Munich, Bonn…' },
  eu: { name: 'Europe (multi-country)', city: 'Two or more EU countries' },
  nl: { name: 'Netherlands', city: 'Amsterdam, Delft, Leiden…' },
  cn: { name: 'China', city: 'Beijing, Shanghai, Wuhan…' },
  tr: { name: 'Türkiye', city: 'Istanbul, Ankara, Izmir…' },
  in: { name: 'India', city: 'Delhi, Mumbai, Bengaluru…' },
  africa: { name: 'Africa & worldwide', city: 'Partner universities' },
};

// Typical documents most scholarship applications ask for.
export const commonDocuments = [
  'Valid international passport',
  'Academic certificates and transcripts (WASSCE, degree)',
  'Statement of purpose or personal essays',
  'Two or three reference letters',
  'CV / résumé',
  'English test results (IELTS / TOEFL) where required',
];
