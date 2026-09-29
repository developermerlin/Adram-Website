// Presentation details for the training programmes, keyed by course slug. The programmes themselves
// (title, summary, topics, fees, dates) are edited in the admin portal; this only adds the photo, the
// group used by the filter buttons and the matching service page. A programme added in the admin that
// isn't listed here still shows, as a card with its icon and no photo.
export const COURSE_GROUPS = [
  { id: 'foundations', label: 'Digital skills' },
  { id: 'development', label: 'Software & web' },
  { id: 'data', label: 'Data & AI' },
  { id: 'infrastructure', label: 'Networks & hardware' },
  { id: 'business', label: 'Business & consulting' },
  { id: 'creative', label: 'Design' },
];

export const courseMeta = {
  'touch-typing': { image: '/typing/typing-card.jpg', group: 'foundations', service: 'typing' },
  programming: { image: '/software/soft4.jpg', group: 'foundations' },
  'professional-training': { image: '/consultancy/consult-aside.jpg', group: 'business' },
  'it-consultancy': { image: '/consultancy/consult-card.jpg', group: 'business', service: 'it-consultancy' },
  'digital-transformation': { image: '/transform/transform-card.jpg', group: 'business', service: 'digital-transformation' },
  'web-development': { image: '/web/heroimg-card.jpg', group: 'development', service: 'web-development' },
  'software-engineering': { image: '/software/cardimg.jpg', group: 'development', service: 'software-development' },
  'mobile-development': { image: '/mobile/app4.jpg', group: 'development', service: 'mobile-development' },
  'ai-machine-learning': { image: '/ai/ai-card.jpg', group: 'data', service: 'ai-machine-learning' },
  'data-analytics': { image: '/analytics/analytics-card.jpg', group: 'data', service: 'data-analytics' },
  'computer-networking': { image: '/network/net-card.jpg', group: 'infrastructure', service: 'networking' },
  'computer-hardware': { image: '/hardware/hardware-card.jpg', group: 'infrastructure', service: 'hardware' },
  'graphic-design': { image: '/graphics/graphics-card.jpg', group: 'creative', service: 'graphic-design' },
};
