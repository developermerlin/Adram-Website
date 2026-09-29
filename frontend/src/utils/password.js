// Mirrors CustomPasswordValidator in backend/accounts/validators.py, so users see the rules before submitting.
export const passwordRules = [
  { label: 'At least 8 characters', test: (p) => p.length >= 8 },
  { label: 'An uppercase letter', test: (p) => /[A-Z]/.test(p) },
  { label: 'A lowercase letter', test: (p) => /[a-z]/.test(p) },
  { label: 'A number', test: (p) => /\d/.test(p) },
  { label: 'A symbol (!@#$%&*)', test: (p) => /[!@#$%^&*(),.?":{}|<>]/.test(p) },
];

export const isStrongPassword = (password) => passwordRules.every((rule) => rule.test(password));
