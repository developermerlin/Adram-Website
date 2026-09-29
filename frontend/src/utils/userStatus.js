// One status per user for the admin screens: a disabled account overrides the approval state.
// (The API still calls disabling "suspend" and enabling "activate"; people only ever see Disable / Enable.)
export const statusOf = (user) => (!user.is_active ? 'suspended' : (user.approval_status || 'PENDING').toLowerCase());

export const STATUS_META = {
  pending: { label: 'Pending approval', badge: 'badge--amber', icon: 'fa-hourglass-half' },
  approved: { label: 'Approved', badge: 'badge--green', icon: 'fa-circle-check' },
  rejected: { label: 'Rejected', badge: 'badge--red', icon: 'fa-circle-xmark' },
  suspended: { label: 'Disabled', badge: 'badge--gray', icon: 'fa-user-slash' },
};

// Which actions make sense for each status (role changes are offered separately).
export const ACTIONS_FOR = {
  pending: ['approve', 'reject'],
  approved: ['suspend'],
  rejected: ['approve'],
  suspended: ['activate'],
};

export const ACTION_META = {
  approve: { label: 'Approve', icon: 'fa-check', className: 'btn--success', done: 'approved' },
  reject: { label: 'Reject', icon: 'fa-xmark', className: 'btn--danger-outline', done: 'rejected' },
  // Disable / Enable show as icon-only buttons on user rows (the label becomes the tooltip).
  suspend: { label: 'Disable', icon: 'fa-user-slash', className: 'btn--danger-outline', done: 'disabled', iconOnly: true },
  activate: { label: 'Enable', icon: 'fa-user-check', className: 'btn--success', done: 'enabled', iconOnly: true },
};

// Actions that need a confirmation dialog (the others are safe, reversible one-clicks).
export const CONFIRM = {
  reject: {
    title: 'Reject this account?',
    text: 'They won’t be able to sign in and will receive an email. You can approve them later if needed.',
    reason: true,
    confirm: 'Reject account',
  },
  suspend: {
    title: 'Disable this account?',
    text: 'They’ll be signed out everywhere and can’t use the system until you enable the account again.',
    confirm: 'Disable account',
  },
};
