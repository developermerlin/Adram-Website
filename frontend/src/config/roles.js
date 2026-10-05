export const ROLES = {
  ADMIN: 'Administrator',
  SCHOLARSHIP_MANAGER: 'Scholarship Manager',
  FINANCE_MANAGER: 'Finance Manager',
  COUNSELLOR: 'Counsellor',
  INSTRUCTOR: 'Instructor',
  TEAM_MEMBER: 'Team member',
  STUDENT: 'Student',
};

// Where each role lands after signing in. Roles without their own dashboard yet go to their profile.
export const dashboardPathFor = (role) => {
  switch (role) {
    case 'ADMIN':
      return '/admin/dashboard';
    case 'STUDENT':
      return '/student/dashboard';
    case 'INSTRUCTOR':
      return '/instructor';
    case 'SCHOLARSHIP_MANAGER':
      return '/admin/scholarships';
    case 'TEAM_MEMBER':
      return '/team-profile';
    default:
      return '/profile';
  }
};

// A student's sidebar for each side of the portal (see config/tracks.js). `requires` hides a link until the
// student has something there (My training appears once they enroll).
const STUDENT_SIDES = {
  training: [
    { to: '/student/dashboard/training', label: 'Overview', icon: 'fa-gauge-high', end: true },
    { to: '/student/learning', label: 'My learning', icon: 'fa-circle-play' },
    { to: '/student/progress', label: 'My progress', icon: 'fa-chart-line' },
    { to: '/student/groups', label: 'Study groups', icon: 'fa-people-group' },
    { to: '/student/referrals', label: 'Invite friends', icon: 'fa-user-plus' },
    { to: '/student/affiliate', label: 'Affiliate programme', icon: 'fa-handshake' },
    { to: '/student/training', label: 'My training', icon: 'fa-laptop-code', requires: 'training' },
    { to: '/student/certificates', label: 'Certificates', icon: 'fa-certificate' },
    { to: '/student/purchases', label: 'Purchase history', icon: 'fa-receipt' },
    { to: '/cart', label: 'Cart', icon: 'fa-cart-shopping' },
    { to: '/courses', label: 'Browse courses', icon: 'fa-compass', external: true },
  ],
  scholarships: [
    { to: '/student/dashboard/scholarships', label: 'Overview', icon: 'fa-gauge-high', end: true },
    { to: '/student/applications', label: 'My applications', icon: 'fa-list-check', badge: 'actions' },
    { to: '/student/saved', label: 'Saved scholarships', icon: 'fa-bookmark' },
    { to: '/scholarships', label: 'Browse scholarships', icon: 'fa-graduation-cap', external: true },
  ],
};
const STUDENT_SHARED = [
  { to: '/messages', label: 'Messages', icon: 'fa-comments', badge: 'messages_unread' },
  { to: '/notifications', label: 'Notifications', icon: 'fa-bell' },
];

// Sidebar sections for the portal. Add a role's pages here as they are built.
// Students see the side they're on (`track`: training or scholarships), then what both sides share.
export const portalNavFor = (role, track = null) => {
  if (role === 'STUDENT') {
    const side = STUDENT_SIDES[track];
    return [
      side ? { heading: track === 'training' ? 'Training' : 'Scholarships', items: side }
        : { heading: 'Workspace', items: [{ to: '/student/dashboard', label: 'Get started', icon: 'fa-compass', end: true }] },
      { heading: 'Inbox', items: STUDENT_SHARED },
      { heading: 'Account', items: [
        { to: '/profile', label: 'Profile & security', icon: 'fa-user-gear' },
        { to: '/activity', label: 'Activity log', icon: 'fa-clock-rotate-left' },
      ] },
    ];
  }

  const workspace = {
    ADMIN: [
      { to: '/admin/dashboard', label: 'Overview', icon: 'fa-gauge-high' },
      // `badge` names a count from /users/stats/ shown next to the link
      { to: '/admin/users', label: 'Users', icon: 'fa-users-gear', badge: 'pending' },
      { to: '/admin/applications', label: 'Applications', icon: 'fa-list-check', badge: 'to_review' },
      { to: '/messages', label: 'Messages', icon: 'fa-comments', badge: 'messages_unread' },
      { to: '/admin/messages', label: 'Enquiries', icon: 'fa-inbox' },
      { to: '/notifications', label: 'Notifications', icon: 'fa-bell' },
    ],
    TEAM_MEMBER: [
      { to: '/team-profile', label: 'My portfolio', icon: 'fa-id-badge', end: true },
      { to: '/messages', label: 'Messages', icon: 'fa-comments', badge: 'messages_unread' },
      { to: '/notifications', label: 'Notifications', icon: 'fa-bell' },
      { to: '/about/team', label: 'Team page', icon: 'fa-users', external: true },
    ],
    SCHOLARSHIP_MANAGER: [
      { to: '/admin/scholarships', label: 'Scholarships', icon: 'fa-graduation-cap' },
      { to: '/scholarships', label: 'Public page', icon: 'fa-globe', external: true },
    ],
    INSTRUCTOR: [
      { to: '/instructor', label: 'Dashboard', icon: 'fa-gauge-high', end: true },
      { to: '/instructor/courses', label: 'My courses', icon: 'fa-chalkboard-user' },
      { to: '/instructor/question-banks', label: 'Question banks', icon: 'fa-box-archive' },
      { to: '/instructor/questions', label: 'Q&A', icon: 'fa-circle-question' },
      { to: '/instructor/reviews', label: 'Reviews', icon: 'fa-star' },
      { to: '/instructor/analytics', label: 'Analytics', icon: 'fa-chart-line' },
      { to: '/instructor/earnings', label: 'Earnings', icon: 'fa-wallet' },
      { to: '/notifications', label: 'Notifications', icon: 'fa-bell' },
      { to: '/messages', label: 'Messages', icon: 'fa-comments', badge: 'messages_unread' },
    ],
  }[role];

  // The course marketplace (administrators).
  const learning = {
    ADMIN: [
      { to: '/admin/lms', label: 'LMS overview', icon: 'fa-chart-pie' },
      { to: '/admin/insights', label: 'Insights', icon: 'fa-magnifying-glass-chart' },
      { to: '/admin/courses', label: 'Courses', icon: 'fa-laptop-code' },
      { to: '/admin/enrollments', label: 'Enrollments', icon: 'fa-user-check', badge: 'training_requests' },
      { to: '/admin/course-reviews', label: 'Course reviews', icon: 'fa-clipboard-check' },
      { to: '/admin/categories', label: 'Categories', icon: 'fa-folder-tree' },
      { to: '/admin/question-banks', label: 'Question banks', icon: 'fa-box-archive' },
      { to: '/admin/course-sales', label: 'Orders & coupons', icon: 'fa-receipt' },
      { to: '/admin/campaigns', label: 'Email campaigns', icon: 'fa-envelope-open-text' },
      { to: '/admin/newsletter', label: 'Newsletter', icon: 'fa-newspaper' },
      { to: '/admin/moderation', label: 'Moderation', icon: 'fa-flag' },
      { to: '/admin/certificates', label: 'Certificates', icon: 'fa-certificate' },
      { to: '/admin/audit', label: 'Audit log', icon: 'fa-clipboard-list' },
    ],
  }[role];

  // Content shown on the public website.
  const website = {
    ADMIN: [
      { to: '/admin/content', label: 'Site content', icon: 'fa-pen-ruler' },
      { to: '/admin/blog', label: 'Blog', icon: 'fa-pen-nib' },
      { to: '/admin/team', label: 'Team', icon: 'fa-people-group' },
      { to: '/admin/chatbot', label: 'Chatbot', icon: 'fa-robot' },
      { to: '/admin/projects', label: 'Projects', icon: 'fa-briefcase' },
      { to: '/admin/partners', label: 'Partners', icon: 'fa-handshake' },
      { to: '/admin/scholarships', label: 'Scholarships', icon: 'fa-graduation-cap' },
      { to: '/admin/settings/application-form', label: 'Application forms', icon: 'fa-file-signature', badge: 'forms_to_review' },
      { to: '/admin/agreements', label: 'Service agreements', icon: 'fa-file-contract' },
      { to: '/admin/settings/payments', label: 'Payments & terms', icon: 'fa-money-bill-transfer' },
      { to: '/admin/settings/lockdown', label: 'Lock website', icon: 'fa-lock' },
    ],
  }[role];

  return [
    ...(workspace ? [{ heading: 'Workspace', items: workspace }] : []),
    ...(learning ? [{ heading: 'Learning', items: learning }] : []),
    ...(website ? [{ heading: 'Website', items: website }] : []),
    {
      heading: 'Account',
      items: [
        // Admins, instructors and students have Messages in their workspace; everyone else finds it here.
        ...(['ADMIN', 'STUDENT', 'INSTRUCTOR', 'TEAM_MEMBER'].includes(role) ? [] : [{ to: '/messages', label: 'Messages', icon: 'fa-comments', badge: 'messages_unread' }]),
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
