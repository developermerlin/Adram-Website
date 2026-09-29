// Messages for the ?oauth_error= codes the API sends back to /login.
export const oauthErrorMessage = (code, provider) => {
  const name = { google: 'Google', facebook: 'Facebook', github: 'GitHub' }[provider] || 'that provider';
  return {
    not_configured: `Sign-in with ${name} isn’t available yet. Please use your email and password.`,
    access_denied: `${name} sign-in was cancelled.`,
    state: 'Your sign-in session expired or was interrupted. Please try again.',
    no_email: `${name} didn’t share a verified email address. Verify your email with ${name}, or sign up with your email instead.`,
    inactive: 'This account has been disabled. Please contact support.',
    pending_approval: 'Your account has been created and is waiting for approval. We’ll email you as soon as an administrator approves it.',
    rejected: 'Your account request was not approved. Please contact us if you think this is a mistake.',
    failed: `We couldn’t complete sign-in with ${name}. Please try again.`,
  }[code] || 'Social sign-in failed. Please try again.';
};

// Pending approval is good news that needs patience, not an error.
export const isInfoCode = (code) => code === 'pending_approval';
