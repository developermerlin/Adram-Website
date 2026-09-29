export const ROLES = {
  ADMIN: 'Administrator',
  SCHOLARSHIP_MANAGER: 'Scholarship Manager',
  FINANCE_MANAGER: 'Finance Manager',
  COUNSELLOR: 'Counsellor',
  STUDENT: 'Student',
};

// Where each role lands after signing in. Roles without their own dashboard yet go to their profile.
export const dashboardPathFor = (role) => {
  switch (role) {
    case 'ADMIN':
      return '/admin/dashboard';
    case 'STUDENT':
      return '/student/dashboard';
    case 'SCHOLARSHIP_MANAGER':
      return '/admin/scholarships';
    default:
      return '/profile';
  }
};

// Sidebar sections for the portal. Add a role's pages here as they are built.
export const portalNavFor = (role) => {
  const workspace = {
    ADMIN: [
      { to: '/admin/dashboard', label: 'Overview', icon: 'fa-gauge-high' },
      // `badge` names a count from /users/stats/ shown next to the link
      { to: '/admin/users', label: 'Users', icon: 'fa-users-gear', badge: 'pending' },
      { to: '/admin/applications', label: 'Applications', icon: 'fa-list-check', badge: 'to_review' },
      { to: '/messages', label: 'Messages', icon: 'fa-comments', badge: 'messages_unread' },
      { to: '/admin/messages', label: 'Enquiries', icon: 'fa-inbox' },
    ],
    SCHOLARSHIP_MANAGER: [
      { to: '/admin/scholarships', label: 'Scholarships', icon: 'fa-graduation-cap' },
      { to: '/scholarships', label: 'Public page', icon: 'fa-globe', external: true },
    ],
    // `requires` hides a link until the student has something there (My training appears once they enroll).
    STUDENT: [
      { to: '/student/dashboard', label: 'Overview', icon: 'fa-gauge-high', end: true },
      { to: '/student/applications', label: 'My applications', icon: 'fa-list-check', badge: 'actions' },
      { to: '/student/saved', label: 'Saved scholarships', icon: 'fa-bookmark' },
      { to: '/student/training', label: 'My training', icon: 'fa-laptop-code', requires: 'training' },
      { to: '/messages', label: 'Messages', icon: 'fa-comments', badge: 'messages_unread' },
      { to: '/scholarships', label: 'Browse scholarships', icon: 'fa-graduation-cap', external: true },
    ],
  }[role];

  // Content shown on the public website.
  const website = {
    ADMIN: [
      { to: '/admin/scholarships', label: 'Scholarships', icon: 'fa-graduation-cap' },
      { to: '/admin/courses', label: 'Training', icon: 'fa-laptop-code', badge: 'training_requests' },
      { to: '/admin/settings/payments', label: 'Payments & terms', icon: 'fa-money-bill-transfer' },
    ],
  }[role];

  return [
    ...(workspace ? [{ heading: 'Workspace', items: workspace }] : []),
    ...(website ? [{ heading: 'Website', items: website }] : []),
    {
      heading: 'Account',
      items: [
        // Admins and students have Messages in their workspace; everyone else finds it here.
        ...(role === 'ADMIN' || role === 'STUDENT' ? [] : [{ to: '/messages', label: 'Messages', icon: 'fa-comments', badge: 'messages_unread' }]),
        { to: '/profile', label: 'Profile & security', icon: 'fa-user-gear' },
        { to: '/activity', label: 'Activity log', icon: 'fa-clock-rotate-left' },
      ],
    },
  ];
};

// Shared by the activity page and dashboard widgets.
export const ACTIVITY_ICONS = {
  LOGIN: 'fa-right-to-bracket',
  LOGOUT: 'fa-right-from-bracket',
  REGISTRATION: 'fa-user-plus',
  PROFILE_UPDATE: 'fa-user-pen',
  PASSWORD_CHANGE: 'fa-key',
  PASSWORD_RESET: 'fa-unlock-keyhole',
  EMAIL_VERIFICATION: 'fa-envelope-circle-check',
  ROLE_CHANGE: 'fa-user-shield',
  ACCOUNT_DEACTIVATION: 'fa-user-slash',
  ACCOUNT_ACTIVATION: 'fa-user-check',
  FAILED_LOGIN: 'fa-triangle-exclamation',
  ACCOUNT_APPROVED: 'fa-user-check',
  ACCOUNT_REJECTED: 'fa-user-xmark',
};
