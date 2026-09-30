export const NOTIFICATION_ICONS = {
  enrollment: 'fa-user-graduate', purchase: 'fa-bag-shopping', payment: 'fa-money-bill-wave', refund: 'fa-rotate-left',
  course_approved: 'fa-circle-check', course_rejected: 'fa-circle-xmark', course_review: 'fa-clipboard-check',
  new_lecture: 'fa-circle-play', announcement: 'fa-bullhorn', quiz_result: 'fa-list-check', assignment_submitted: 'fa-file-arrow-up',
  assignment_graded: 'fa-marker', certificate: 'fa-certificate', coupon: 'fa-ticket', question: 'fa-circle-question',
  answer: 'fa-comment-dots', review: 'fa-star', report: 'fa-flag', system: 'fa-bell',
};

export const NOTIFICATION_LABELS = {
  enrollment: 'Enrolments', purchase: 'Purchases', payment: 'Payments', refund: 'Refunds', course_approved: 'Course approved',
  course_rejected: 'Course rejected', course_review: 'Course reviews', new_lecture: 'New lectures', announcement: 'Announcements',
  quiz_result: 'Quiz results', assignment_submitted: 'Submissions', assignment_graded: 'Assignment grades', certificate: 'Certificates',
  coupon: 'Coupons', question: 'Questions', answer: 'Answers', review: 'Reviews', report: 'Reports', system: 'System',
};

// Other parts of the site can ask the bell to refresh (e.g. after marking things read on the notifications page).
export const NOTIFICATIONS_CHANGED = 'adram:notifications-changed';
