import { usePageContent } from '../../content/useContent';

const LEVELS = { all: 'All levels', beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' };
export const levelLabel = (level) => LEVELS[level] || LEVELS.all;
export const LEVEL_OPTIONS = Object.entries(LEVELS).map(([value, label]) => ({ value, label }));

/** "NLe 1,250.00" */
export const money = (value, currency = 'NLe') =>
  `${currency} ${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
/** The short form for course cards: whole amounts without ".00" (NLe 370, NLe 370.50). */
export const shortMoney = (value, currency = 'NLe') =>
  `${currency} ${Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

/** What a student pays for a course today (the sale price while it is lower). */
export const salePrice = (course) => Number(course.sale_price ?? course.price ?? 0);
export const isPaid = (course) => salePrice(course) > 0;
export const onSale = (course) => course.discount_price != null && Number(course.discount_price) < Number(course.price || 0);

/** The price line of a course: its price, or how to find out. */
export const priceOf = (course) => {
  if (isPaid(course)) return money(salePrice(course), course.currency);
  return course.fee || (course.enrollment_mode === 'open' || course.is_free ? 'Free' : 'Fee on request');
};

/** Who teaches a course, from the API's instructor object (or the old typed-in name). */
export const instructorName = (course) => course.instructor?.name || course.instructor_name || 'ADRAM Technologies';

/** A course's picture: the one set in the admin, else the programme photo from the Training page content. */
export const useCourseImage = () => {
  const { meta } = usePageContent('courses');
  return (course) => course.thumbnail || meta.find((m) => m.slug === course.slug)?.image || '';
};

export const STATUS_LABELS = {
  draft: 'Draft', submitted: 'Submitted', in_review: 'Under review', changes_requested: 'Changes requested',
  rejected: 'Rejected', approved: 'Approved', published: 'Published',
};

/** The label administrators can put on a course card. */
export const HIGHLIGHT_LABELS = { bestseller: 'Bestseller', highest_rated: 'Highest rated', hot_new: 'Hot & new', new: 'New' };
