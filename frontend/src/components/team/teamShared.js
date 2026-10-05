// Shared by the Team page, the portfolio page, the CV and the profile editor.

// The social networks a team member can link to, in display order. `brand` is the network's own colour.
export const SOCIAL_NETWORKS = [
  { id: 'linkedin', label: 'LinkedIn', icon: 'fab fa-linkedin-in', brand: '#0a66c2', placeholder: 'https://www.linkedin.com/in/…' },
  { id: 'x', label: 'X (Twitter)', icon: 'fab fa-x-twitter', brand: '#111111', placeholder: 'https://x.com/…' },
  { id: 'facebook', label: 'Facebook', icon: 'fab fa-facebook-f', brand: '#1877f2', placeholder: 'https://www.facebook.com/…' },
  { id: 'instagram', label: 'Instagram', icon: 'fab fa-instagram', brand: '#dd2a7b', placeholder: 'https://www.instagram.com/…' },
  { id: 'github', label: 'GitHub', icon: 'fab fa-github', brand: '#24292f', placeholder: 'https://github.com/…' },
  { id: 'whatsapp', label: 'WhatsApp', icon: 'fab fa-whatsapp', brand: '#25d366', placeholder: '+232 76 000 000' },
  { id: 'website', label: 'Website', icon: 'fas fa-globe', brand: '#1454e8', placeholder: 'https://…' },
];

export const initials = (name = '') =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
