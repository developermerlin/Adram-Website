// Long-form content for each service page (/services/:id). Keys match the ids in services.js.
// Review the wording, technologies and FAQs so they match how ADRAM actually works.
export const serviceDetails = {
  'web-development': {
    tagline: 'Websites and web applications that work as hard as your team does.',
    overview: [
      'Your website is often the first place people meet your organisation. We design and build fast, secure and mobile-friendly websites that explain what you do clearly and make it easy for people to contact you, enrol, apply or buy.',
      'When you need more than a website, we build web applications: portals, dashboards and online systems that let staff, customers or students do their work in the browser, from any device.',
    ],
    idealFor: ['Businesses that need a professional online presence', 'Schools and training centres with admissions or results portals', 'NGOs that publish reports and collect data online', 'Shops that want to sell and take payments online'],
    benefits: [
      { icon: 'mobile', title: 'Mobile-first', text: 'Designed for phones first, where most of your visitors are.' },
      { icon: 'shield', title: 'Secure by default', text: 'HTTPS, safe logins and regular updates to keep data protected.' },
      { icon: 'growth', title: 'Built to be found', text: 'Clean structure and fast loading that search engines reward.' },
      { icon: 'support', title: 'Easy to update', text: 'Edit your own content, with our support when you need it.' },
    ],
    process: [
      { title: 'Discovery', text: 'We agree the goals, the pages or features you need, and who will use them.' },
      { title: 'Design', text: 'You review page layouts and the look and feel before development starts.' },
      { title: 'Build & test', text: 'We develop in stages, test on phones and computers, and share progress.' },
      { title: 'Launch & support', text: 'We handle hosting and launch, train your team, and keep things updated.' },
    ],
    technologies: ['React', 'Django', 'WordPress', 'HTML & CSS', 'PostgreSQL', 'Cloud hosting'],
    // Optional extras used by the service page (other services can add them too):
    // a photo under the overview, a photo behind the sidebar's contact card, and grouped logos
    // for "Tools & technologies" (logos are in public/tech, from the open-source Devicon set).
    overviewImage: '/web/webpic-md.jpg',
    asideImage: '/web/web2-md.jpg',
    featuredTech: ['react', 'nodejs', 'python', 'java'], // the logos on the overview photo's badge
    techStack: [
      {
        group: 'Frontend',
        icon: 'fa-display',
        items: [
          ['React', 'react'], ['Next.js', 'nextjs'], ['Vue.js', 'vuejs'], ['Angular', 'angular'], ['TypeScript', 'typescript'],
          ['JavaScript', 'javascript'], ['HTML5', 'html5'], ['CSS3', 'css3'], ['Tailwind CSS', 'tailwindcss'], ['Bootstrap', 'bootstrap'],
        ],
      },
      {
        group: 'Backend',
        icon: 'fa-server',
        items: [
          ['Node.js', 'nodejs'], ['Express', 'express'], ['Python', 'python'], ['Django', 'django'],
          ['Java', 'java'], ['Spring', 'spring'], ['PHP', 'php'], ['Laravel', 'laravel'],
        ],
      },
      {
        group: 'Databases & CMS',
        icon: 'fa-database',
        items: [['PostgreSQL', 'postgresql'], ['MySQL', 'mysql'], ['MongoDB', 'mongodb'], ['Firebase', 'firebase'], ['Redis', 'redis'], ['WordPress', 'wordpress']],
      },
      {
        group: 'Tools & hosting',
        icon: 'fa-screwdriver-wrench',
        items: [
          ['Git', 'git'], ['GitHub', 'github'], ['Docker', 'docker'], ['AWS', 'aws'],
          ['Google Cloud', 'googlecloud'], ['Nginx', 'nginx'], ['Figma', 'figma'], ['Linux', 'linux'],
        ],
      },
    ],
    faqs: [
      { q: 'How long does a website take?', a: 'A company website typically takes a few weeks; larger web applications take longer. We give you a timeline after the first consultation.' },
      { q: 'Can we update the content ourselves?', a: 'Yes. We can set up an easy editing area and show your team how to use it.' },
      { q: 'Do you provide hosting and a domain name?', a: 'We can arrange hosting, domain registration and email for you, or work with what you already have.' },
    ],
  },

  'mobile-development': {
    tagline: 'Android and iOS apps that put your services in people’s pockets.',
    overview: [
      'Most people in Sierra Leone reach the internet through their phones. A well-built app lets your customers, members or staff use your services wherever they are, even with patchy connectivity.',
      'We design and build Android and iOS apps, together with the backend systems and APIs they rely on, and help you publish them on the app stores.',
    ],
    idealFor: ['Businesses offering bookings, orders or payments', 'Organisations with field staff collecting data', 'Schools and training providers engaging students', 'Start-ups turning an idea into a product'],
    benefits: [
      { icon: 'mobile', title: 'One app, two platforms', text: 'Cross-platform development for Android and iOS from one codebase.' },
      { icon: 'network', title: 'Works on slow networks', text: 'Designed to stay usable with weak or intermittent connections.' },
      { icon: 'shield', title: 'Secure data', text: 'Protected logins and encrypted communication with your servers.' },
      { icon: 'build', title: 'Ready to grow', text: 'A solid backend that can handle more users and new features.' },
    ],
    process: [
      { title: 'Idea & scope', text: 'We turn your idea into a clear list of screens and features.' },
      { title: 'Prototype', text: 'You try a clickable prototype before we write production code.' },
      { title: 'Develop & test', text: 'We build the app and its backend and test on real devices.' },
      { title: 'Publish & improve', text: 'We publish to the stores and support updates after launch.' },
    ],
    technologies: ['Flutter', 'React Native', 'Android', 'iOS', 'REST APIs', 'Firebase'],
    overviewImage: '/mobile/app1.jpg',
    asideImage: '/mobile/app2.jpg',
    featuredTech: ['flutter', 'kotlin', 'swift', 'firebase'],
    techStack: [
      {
        group: 'Cross-platform',
        icon: 'fa-layer-group',
        items: [['Flutter', 'flutter'], ['Dart', 'dart'], ['React Native', 'react'], ['Expo', 'expo'], ['Ionic', 'ionic'], ['TypeScript', 'typescript']],
      },
      {
        group: 'Native Android & iOS',
        icon: 'fa-mobile-screen-button',
        items: [
          ['Android', 'android'], ['Kotlin', 'kotlin'], ['Java', 'java'], ['Android Studio', 'androidstudio'],
          ['iOS', 'apple'], ['Swift', 'swift'], ['Xcode', 'xcode'],
        ],
      },
      {
        group: 'Backend & data',
        icon: 'fa-database',
        items: [['Firebase', 'firebase'], ['Node.js', 'nodejs'], ['GraphQL', 'graphql'], ['SQLite', 'sqlite'], ['PostgreSQL', 'postgresql'], ['MongoDB', 'mongodb']],
      },
      {
        group: 'Design, testing & delivery',
        icon: 'fa-screwdriver-wrench',
        items: [['Figma', 'figma'], ['Postman', 'postman'], ['Git', 'git'], ['GitHub', 'github'], ['Jira', 'jira'], ['Google Cloud', 'googlecloud']],
      },
    ],
    faqs: [
      { q: 'Do I need separate apps for Android and iPhone?', a: 'Usually not. We build one cross-platform app that runs on both, which saves time and cost.' },
      { q: 'Will you publish the app for us?', a: 'Yes. We prepare the store listings and handle submission to Google Play and the App Store.' },
      { q: 'Can the app work offline?', a: 'Many features can work offline and sync when a connection is available. We plan this during scoping.' },
    ],
  },

  'software-development': {
    tagline: 'Custom systems that replace paperwork and spreadsheets.',
    overview: [
      'When off-the-shelf software doesn’t fit the way you work, we build systems that do. Records, inventory, finance, student management, clinic workflows: we design software around your real processes.',
      'We connect new systems with the tools you already use, migrate your existing data, and train your staff so the change is smooth.',
    ],
    idealFor: ['Schools managing students, fees and results', 'Clinics and pharmacies tracking patients and stock', 'Businesses with manual sales, stock or HR processes', 'Institutions that need secure digital records'],
    benefits: [
      { icon: 'transform', title: 'Less manual work', text: 'Automate repetitive tasks and remove duplicate data entry.' },
      { icon: 'growth', title: 'Better decisions', text: 'Live reports and dashboards instead of end-of-month spreadsheets.' },
      { icon: 'shield', title: 'Controlled access', text: 'Roles and permissions so people only see what they should.' },
      { icon: 'layers', title: 'Fits your process', text: 'Software shaped around how your organisation actually works.' },
    ],
    process: [
      { title: 'Process mapping', text: 'We study how work flows today and where time is lost.' },
      { title: 'System design', text: 'We design the screens, data and user roles with your team.' },
      { title: 'Build in stages', text: 'Working modules are delivered regularly for you to test.' },
      { title: 'Rollout & training', text: 'We migrate data, train users and support the go-live.' },
    ],
    technologies: ['Python & Django', 'React', 'PostgreSQL', 'MySQL', 'REST APIs', 'Linux servers'],
    overviewImage: '/software/soft1.jpg',
    asideImage: '/software/soft4.jpg',
    featuredTech: ['python', 'django', 'react', 'postgresql'],
    techStack: [
      {
        group: 'Languages & frameworks',
        icon: 'fa-code',
        items: [
          ['Python', 'python'], ['Django', 'django'], ['Java', 'java'], ['Spring', 'spring'], ['PHP', 'php'],
          ['Laravel', 'laravel'], ['Node.js', 'nodejs'], ['Express', 'express'], ['TypeScript', 'typescript'],
        ],
      },
      {
        group: 'Interfaces & dashboards',
        icon: 'fa-display',
        items: [['React', 'react'], ['Angular', 'angular'], ['Vue.js', 'vuejs'], ['Next.js', 'nextjs'], ['Tailwind CSS', 'tailwindcss'], ['Bootstrap', 'bootstrap']],
      },
      {
        group: 'Databases & integration',
        icon: 'fa-database',
        items: [['PostgreSQL', 'postgresql'], ['MySQL', 'mysql'], ['SQLite', 'sqlite'], ['MongoDB', 'mongodb'], ['Redis', 'redis'], ['GraphQL', 'graphql'], ['Postman', 'postman']],
      },
      {
        group: 'Deployment & delivery',
        icon: 'fa-screwdriver-wrench',
        items: [
          ['Git', 'git'], ['GitHub', 'github'], ['Docker', 'docker'], ['Linux', 'linux'],
          ['Nginx', 'nginx'], ['AWS', 'aws'], ['Google Cloud', 'googlecloud'], ['Jira', 'jira'],
        ],
      },
    ],
    faqs: [
      { q: 'Can you move our existing data into the new system?', a: 'Yes. We migrate data from spreadsheets or older systems as part of the rollout.' },
      { q: 'Who owns the software?', a: 'Ownership terms are agreed in the contract before work begins, so you know exactly what you’re getting.' },
      { q: 'What happens after launch?', a: 'We offer support and maintenance plans for fixes, updates and new features.' },
    ],
  },

  networking: {
    tagline: 'Reliable, secure networks that keep your offices connected.',
    overview: [
      'A slow or unreliable network costs time every day. We design, install and support networks that keep your staff, devices and systems connected, from a single office to multiple sites.',
      'We handle structured cabling, Wi-Fi, servers, routers and firewalls, and design for local conditions such as power interruptions and limited bandwidth.',
    ],
    idealFor: ['Offices setting up or moving premises', 'Schools and training centres with computer labs', 'Organisations with unreliable or insecure Wi-Fi', 'Multi-site teams that need to share systems'],
    benefits: [
      { icon: 'network', title: 'Dependable connectivity', text: 'Properly planned coverage and cabling that just works.' },
      { icon: 'shield', title: 'Network security', text: 'Firewalls, secure Wi-Fi and access control for your data.' },
      { icon: 'server', title: 'Servers & storage', text: 'Shared files, backups and on-site servers set up correctly.' },
      { icon: 'support', title: 'Ongoing support', text: 'Maintenance and troubleshooting from a team that can come on site.' },
    ],
    process: [
      { title: 'Site survey', text: 'We assess your premises, users, devices and current setup.' },
      { title: 'Network design', text: 'You receive a plan covering equipment, cabling and security.' },
      { title: 'Installation', text: 'We install and configure everything with minimal disruption.' },
      { title: 'Handover & support', text: 'We document the network and provide ongoing maintenance.' },
    ],
    technologies: ['Structured cabling', 'Wi-Fi access points', 'Routers & switches', 'Firewalls', 'VPN', 'Backup systems'],
    overviewImage: '/network/net-overview.jpg',
    asideImage: '/network/net-aside.jpg',
    featuredTech: ['net-router', 'net-wifi', 'net-firewall', 'net-fibre'],
    techStack: [
      {
        group: 'Cabling & connectivity',
        icon: 'fa-ethernet',
        items: [['Structured cabling', 'net-cabling'], ['Fibre optic', 'net-fibre'], ['Wi-Fi access points', 'net-wifi'], ['Routers', 'net-router'], ['Switches', 'net-switch']],
      },
      {
        group: 'Security & access',
        icon: 'fa-shield-halved',
        items: [['Firewalls', 'net-firewall'], ['VPN', 'net-vpn'], ['Access control', 'net-lock'], ['CCTV', 'net-cctv']],
      },
      {
        group: 'Servers & storage',
        icon: 'fa-server',
        items: [['Servers', 'net-server'], ['Linux', 'linux'], ['File sharing', 'net-folder'], ['Backup systems', 'net-backup']],
      },
      {
        group: 'Monitoring & support',
        icon: 'fa-headset',
        items: [['Monitoring', 'net-monitor'], ['Remote support', 'net-remote'], ['Power backup (UPS)', 'net-power']],
      },
    ],
    faqs: [
      { q: 'Can you work with our existing equipment?', a: 'Yes. We assess what you have and reuse it where it makes sense.' },
      { q: 'Do you offer maintenance contracts?', a: 'Yes. We offer ongoing support so problems are fixed quickly and the network stays healthy.' },
      { q: 'Can you connect our branch offices?', a: 'We can link sites securely so teams share systems and files.' },
    ],
  },

  hardware: {
    tagline: 'Reliable computers and equipment, kept running by people who can fix them.',
    overview: [
      'The right hardware makes every other system work better, and the wrong hardware costs you time every day. We supply laptops, desktops and office equipment that suit your work and budget, and we look after them once they are in use.',
      'When something breaks or slows down, we diagnose the fault, repair or upgrade the parts, and get you working again. Regular servicing and cleaning keeps machines healthy in dusty, hot conditions and helps them last longer.',
    ],
    idealFor: ['Offices equipping new staff or a new branch', 'Schools and training centres with computer labs', 'Businesses with slow, faulty or ageing computers', 'Individuals who need a trustworthy repair or upgrade'],
    benefits: [
      { icon: 'build', title: 'Expert repairs', text: 'Fault-finding and component-level repair by trained technicians.' },
      { icon: 'growth', title: 'Upgrades that pay off', text: 'More memory or a faster drive can give an old machine years of extra life.' },
      { icon: 'shield', title: 'Protected data', text: 'We take care of your files during repairs, and can back up before we start.' },
      { icon: 'support', title: 'Ongoing care', text: 'Servicing plans and support so problems are caught before they stop your work.' },
    ],
    process: [
      { title: 'Consult & diagnose', text: 'We listen to what you need, or find the fault, and explain your options clearly.' },
      { title: 'Quote', text: 'You receive a clear price for the equipment or repair before any work begins.' },
      { title: 'Supply, repair or upgrade', text: 'We source quality parts and equipment, then fit, repair and test everything.' },
      { title: 'Handover & aftercare', text: 'We set up your devices, show your team how to look after them and stay on hand.' },
    ],
    technologies: ['Laptops', 'Desktops', 'Printers', 'Memory & storage upgrades', 'Repairs', 'Servicing'],
    overviewImage: '/hardware/hardware-overview.jpg',
    asideImage: '/hardware/hardware-aside.jpg',
    featuredTech: ['hw-laptop', 'hw-chip', 'hw-ram', 'hw-ssd'],
    techStack: [
      {
        group: 'Equipment we supply',
        icon: 'fa-computer',
        items: [['Laptops', 'hw-laptop'], ['Desktops', 'hw-desktop'], ['Printers & scanners', 'hw-printer'], ['Peripherals', 'hw-mouse'], ['Servers', 'net-server']],
      },
      {
        group: 'Repairs & upgrades',
        icon: 'fa-screwdriver-wrench',
        items: [['Screen replacement', 'hw-screen'], ['Memory (RAM) upgrades', 'hw-ram'], ['SSD & storage', 'hw-ssd'], ['Battery & charger', 'hw-battery'], ['Motherboard repair', 'hw-chip']],
      },
      {
        group: 'Servicing & protection',
        icon: 'fa-fan',
        items: [['Cleaning & cooling', 'hw-fan'], ['Diagnostics', 'hw-diag'], ['Power protection (UPS)', 'net-power'], ['Data backup & recovery', 'net-backup']],
      },
      {
        group: 'Setup & support',
        icon: 'fa-headset',
        items: [['Operating system install', 'hw-install'], ['Office setup', 'net-router'], ['Wi-Fi & cabling', 'net-cabling'], ['Remote support', 'net-remote']],
      },
    ],
    faqs: [
      { q: 'Do you sell new computers as well as repair them?', a: 'Yes. We can supply laptops, desktops, printers and accessories that fit your needs and budget, and advise before you buy.' },
      { q: 'Can you upgrade an old computer instead of replacing it?', a: 'Often, yes. Adding memory or replacing a slow hard drive with an SSD makes many older machines fast again, and costs far less than a new one.' },
      { q: 'Will I lose my files during a repair?', a: 'We take care to protect your data, and we recommend a backup first. If a drive has failed, we can try to recover your files.' },
    ],
  },

  'ai-machine-learning': {
    tagline: 'Practical AI that saves time and turns data into decisions.',
    overview: [
      'AI is most useful when it solves a specific, everyday problem. We help organisations identify where AI can genuinely help, then build tools such as chatbots, document processing and data analysis that fit into daily work.',
      'We start small, measure the results, and make sure your team understands and trusts the tools before scaling up.',
    ],
    idealFor: ['Teams answering the same questions every day', 'Organisations with data they don’t have time to analyse', 'Offices processing many forms and documents', 'Leaders exploring what AI could do for them'],
    benefits: [
      { icon: 'ai', title: 'Automate routine work', text: 'Let software handle repetitive questions, sorting and data entry.' },
      { icon: 'growth', title: 'Insight from data', text: 'Dashboards and analysis that show trends and guide decisions.' },
      { icon: 'discover', title: 'Always-on assistants', text: 'Chatbots that answer common questions at any time of day.' },
      { icon: 'shield', title: 'Responsible use', text: 'Clear guidance on data privacy, accuracy and human oversight.' },
    ],
    process: [
      { title: 'Opportunity review', text: 'We identify the tasks where AI can make a real difference.' },
      { title: 'Pilot', text: 'We build a small, focused solution and test it with real users.' },
      { title: 'Measure', text: 'We check accuracy, time saved and user feedback together.' },
      { title: 'Scale & train', text: 'We roll out what works and train your team to use it well.' },
    ],
    technologies: ['Python', 'Machine learning', 'Large language models', 'Chatbots', 'Data dashboards', 'Automation tools'],
    overviewImage: '/ai/ai-overview.jpg',
    asideImage: '/ai/ai-aside.jpg',
    featuredTech: ['python', 'ai-llm', 'postgresql', 'docker'],
    techStack: [
      {
        group: 'AI & machine learning',
        icon: 'fa-brain',
        items: [['Python', 'python'], ['Machine learning', 'ai-ml'], ['Large language models', 'ai-llm'], ['Chatbots', 'ai-chatbot'], ['Document processing', 'ai-document']],
      },
      {
        group: 'Data & dashboards',
        icon: 'fa-chart-line',
        items: [['PostgreSQL', 'postgresql'], ['MySQL', 'mysql'], ['MongoDB', 'mongodb'], ['Data dashboards', 'ai-dashboard'], ['GraphQL', 'graphql']],
      },
      {
        group: 'Automation & integration',
        icon: 'fa-gears',
        items: [['Automation tools', 'ai-automation'], ['Django', 'django'], ['Node.js', 'nodejs'], ['React', 'react'], ['REST APIs', 'ai-api']],
      },
      {
        group: 'Deployment & delivery',
        icon: 'fa-screwdriver-wrench',
        items: [['Docker', 'docker'], ['Git', 'git'], ['GitHub', 'github'], ['AWS', 'aws'], ['Google Cloud', 'googlecloud'], ['Linux', 'linux']],
      },
    ],
    faqs: [
      { q: 'Do we need a lot of data to use AI?', a: 'Not always. Many useful tools, like assistants and document processing, work with modest amounts of data.' },
      { q: 'Is our data safe?', a: 'We design solutions with privacy in mind and explain exactly where your data goes and who can access it.' },
      { q: 'Where should we start?', a: 'With a short consultation to find one task where AI can save time. A small pilot proves the value first.' },
    ],
  },

  'data-analytics': {
    tagline: 'Clear answers from your data, and dashboards that keep them in front of you.',
    overview: [
      'Most organisations already hold valuable data in spreadsheets, forms, databases and reports, but it is hard to see what it is saying. We collect, clean and analyse your data, then present the findings in a way that leads to decisions.',
      'We build dashboards that update as your data changes, prepare reports for managers, boards and funders, and set up the tracking you need to measure progress against your goals.',
    ],
    idealFor: ['Managers who want to see performance at a glance', 'NGOs and projects reporting results to funders', 'Schools and clinics tracking outcomes over time', 'Businesses that want to understand sales, stock and customers'],
    benefits: [
      { icon: 'growth', title: 'Decisions backed by evidence', text: 'See what is working and what is not, instead of guessing.' },
      { icon: 'discover', title: 'Insight you can see', text: 'Charts and dashboards that anyone on your team can read.' },
      { icon: 'transform', title: 'Reports without the effort', text: 'Automated reports that replace hours of copying and pasting.' },
      { icon: 'shield', title: 'Data you can trust', text: 'Cleaned, checked and stored securely, with controlled access.' },
    ],
    process: [
      { title: 'Define the questions', text: 'We agree what you need to know and which data can answer it.' },
      { title: 'Collect & clean', text: 'We gather your data, fix errors and gaps, and bring it into one place.' },
      { title: 'Analyse', text: 'We look for patterns, trends and outliers, and test what they mean.' },
      { title: 'Present & train', text: 'You get dashboards and reports, and your team learns to use them.' },
    ],
    technologies: ['Data cleaning', 'Statistical analysis', 'Dashboards', 'KPI reporting', 'Forecasting', 'Survey data'],
    overviewImage: '/analytics/analytics-overview.jpg',
    asideImage: '/analytics/analytics-aside.jpg',
    featuredTech: ['python', 'postgresql', 'ai-dashboard', 'an-stats'],
    techStack: [
      {
        group: 'Collection & cleaning',
        icon: 'fa-broom',
        items: [['Surveys & forms', 'an-survey'], ['Spreadsheets', 'an-sheet'], ['Data cleaning', 'an-clean'], ['PostgreSQL', 'postgresql'], ['MySQL', 'mysql']],
      },
      {
        group: 'Analysis',
        icon: 'fa-magnifying-glass-chart',
        items: [['Python', 'python'], ['SQL queries', 'an-sql'], ['Statistical analysis', 'an-stats'], ['Forecasting', 'an-forecast'], ['Machine learning', 'ai-ml']],
      },
      {
        group: 'Dashboards & reporting',
        icon: 'fa-chart-pie',
        items: [['Interactive dashboards', 'ai-dashboard'], ['Charts & infographics', 'gd-chart'], ['Automated reports', 'an-report'], ['KPI tracking', 'an-kpi'], ['Presentations', 'gd-slides']],
      },
      {
        group: 'Data management',
        icon: 'fa-database',
        items: [['Data warehousing', 'an-warehouse'], ['Data migration', 'dt-migrate'], ['Backup & recovery', 'net-backup'], ['Access control', 'net-lock']],
      },
    ],
    faqs: [
      { q: 'We only have spreadsheets. Is that enough?', a: 'Yes. Spreadsheets are a common starting point. We clean them, combine them and turn them into dashboards and reports.' },
      { q: 'Can the dashboards update automatically?', a: 'Yes. Once connected to your data, dashboards refresh as new records arrive, so you always see the latest picture.' },
      { q: 'Can you help with reports for funders?', a: 'Yes. We set up indicators and tracking so results are recorded consistently, and prepare clear reports for donors and boards.' },
    ],
  },

  'it-consultancy': {
    tagline: 'Independent advice on the right technology, and a plan to adopt it.',
    overview: [
      'Technology decisions are expensive to get wrong. We give independent, practical advice on what to buy, build or change, based on your goals, budget and the realities of working in Sierra Leone.',
      'From a one-off assessment to ongoing oversight of a project, we help you spend wisely and avoid common pitfalls.',
    ],
    idealFor: ['Leaders planning a new system or major purchase', 'Organisations reviewing IT security and policies', 'Projects that need independent technical oversight', 'Teams unsure where to start with digital change'],
    benefits: [
      { icon: 'consult', title: 'Clear recommendations', text: 'Plain-language advice you can act on, not jargon.' },
      { icon: 'finance', title: 'Better value', text: 'Avoid overspending on the wrong tools or suppliers.' },
      { icon: 'shield', title: 'Reduced risk', text: 'Security and policy reviews that close gaps before they cause harm.' },
      { icon: 'architecture', title: 'A roadmap', text: 'A step-by-step plan that fits your budget and timeline.' },
    ],
    process: [
      { title: 'Listen', text: 'We learn your goals, challenges and current technology.' },
      { title: 'Assess', text: 'We review systems, processes, costs and risks.' },
      { title: 'Recommend', text: 'You receive a clear report with prioritised options.' },
      { title: 'Support delivery', text: 'If you wish, we oversee suppliers and implementation.' },
    ],
    technologies: ['IT assessments', 'Procurement support', 'Security reviews', 'IT policies', 'Project oversight', 'Vendor evaluation'],
    overviewImage: '/consultancy/consult-overview.jpg',
    asideImage: '/consultancy/consult-aside.jpg',
    featuredTech: ['cs-assess', 'cs-roadmap', 'net-vpn', 'cs-project'],
    techStack: [
      {
        group: 'Assess & plan',
        icon: 'fa-magnifying-glass-chart',
        items: [['IT assessments', 'cs-assess'], ['Technology roadmap', 'cs-roadmap'], ['Budget planning', 'cs-budget']],
      },
      {
        group: 'Procurement',
        icon: 'fa-cart-shopping',
        items: [['Procurement support', 'cs-procure'], ['Vendor evaluation', 'cs-vendor'], ['Tenders & RFPs', 'cs-tender']],
      },
      {
        group: 'Security & policy',
        icon: 'fa-shield-halved',
        items: [['Security reviews', 'net-vpn'], ['IT policies', 'cs-policy'], ['Risk assessment', 'cs-risk'], ['Data protection', 'net-lock']],
      },
      {
        group: 'Delivery & oversight',
        icon: 'fa-diagram-project',
        items: [['Project oversight', 'cs-project'], ['Staff training', 'cs-training'], ['Progress reporting', 'net-monitor']],
      },
    ],
    faqs: [
      { q: 'Are you independent of suppliers?', a: 'Our advice is based on what fits your needs. We’ll tell you when a simpler or cheaper option is the right one.' },
      { q: 'Can you help us write a tender or request for proposals?', a: 'Yes. We can define requirements and help evaluate supplier responses.' },
      { q: 'Is the first consultation free?', a: 'Yes. The first conversation is free, so we can understand what you need.' },
    ],
  },

  'digital-transformation': {
    tagline: 'Moving your processes online, step by step, with your team on board.',
    overview: [
      'Digital transformation is about people and processes as much as technology. We help organisations move from paper and manual work to digital systems in manageable steps, without disrupting the work that matters.',
      'We combine process redesign, the right software and cloud tools, and hands-on staff training, so the change sticks.',
    ],
    idealFor: ['Organisations still relying on paper files', 'Teams struggling to share information', 'Institutions modernising services for the public', 'Growing businesses that have outgrown spreadsheets'],
    benefits: [
      { icon: 'transform', title: 'Faster processes', text: 'Approvals, records and reporting that take minutes, not days.' },
      { icon: 'layers', title: 'One source of truth', text: 'Information stored once and shared securely across teams.' },
      { icon: 'people', title: 'Confident staff', text: 'Training that helps everyone use new tools with confidence.' },
      { icon: 'server', title: 'Cloud-ready', text: 'Access your systems securely from the office or on the move.' },
    ],
    process: [
      { title: 'Assess', text: 'We map current processes and agree priorities with you.' },
      { title: 'Plan', text: 'A phased roadmap that delivers value early and often.' },
      { title: 'Implement', text: 'We digitise processes and set up the tools, phase by phase.' },
      { title: 'Train & embed', text: 'Staff training and follow-up so new ways of working last.' },
    ],
    technologies: ['Cloud platforms', 'Document management', 'Workflow automation', 'Microsoft 365 / Google Workspace', 'Custom software', 'Staff training'],
    overviewImage: '/transform/transform-overview.jpg',
    asideImage: '/transform/transform-aside.jpg',
    featuredTech: ['dt-cloud', 'dt-workflow', 'googlecloud', 'aws'],
    techStack: [
      {
        group: 'Cloud & productivity',
        icon: 'fa-cloud',
        items: [['Cloud platforms', 'dt-cloud'], ['Google Cloud', 'googlecloud'], ['AWS', 'aws'], ['Email & collaboration', 'dt-mail'], ['Cloud migration', 'dt-migrate']],
      },
      {
        group: 'Digitising processes',
        icon: 'fa-file-signature',
        items: [['Document management', 'dt-docs'], ['Workflow automation', 'dt-workflow'], ['Online forms', 'dt-forms'], ['Digital records', 'net-folder']],
      },
      {
        group: 'Custom systems',
        icon: 'fa-laptop-code',
        items: [['Custom software', 'dt-code'], ['Python', 'python'], ['Django', 'django'], ['React', 'react'], ['PostgreSQL', 'postgresql']],
      },
      {
        group: 'People & change',
        icon: 'fa-people-group',
        items: [['Staff training', 'cs-training'], ['Change support', 'dt-change'], ['Data backup', 'net-backup'], ['Access control', 'net-lock']],
      },
    ],
    faqs: [
      { q: 'Do we have to change everything at once?', a: 'No. We work in phases, starting with the changes that bring the biggest benefit.' },
      { q: 'What if our staff aren’t comfortable with technology?', a: 'Training is built into every phase, and we support your team until they’re confident.' },
      { q: 'How do you protect our data during the move?', a: 'We plan migrations carefully, keep backups and control who has access at every step.' },
    ],
  },

  'graphic-design': {
    tagline: 'Design and photography that make your organisation look as professional as it is.',
    overview: [
      'People judge an organisation in seconds, and most of what they see is design: a logo, a flyer, a social media post, a photograph. We create branding and visuals that are clear, consistent and memorable, so your message is understood and trusted.',
      'From a new logo to a full brand identity, from a single event poster to a year of social media content, and from staff portraits to product photography, we handle the creative work so your team can focus on running the organisation.',
    ],
    idealFor: ['New businesses that need a logo and brand identity', 'Organisations promoting events, courses or campaigns', 'Shops and brands that need product photos and social content', 'NGOs and institutions that need reports and materials that look credible'],
    benefits: [
      { icon: 'discover', title: 'A memorable identity', text: 'Logos and brand guidelines that make you instantly recognisable.' },
      { icon: 'layers', title: 'Consistent everywhere', text: 'One look across print, social media, your website and your documents.' },
      { icon: 'growth', title: 'Content that connects', text: 'Graphics and photos designed to get attention and get results.' },
      { icon: 'support', title: 'Ready to use', text: 'Files delivered in the right formats for print, web and social media.' },
    ],
    process: [
      { title: 'Brief', text: 'We learn about your organisation, your audience and what the design must achieve.' },
      { title: 'Concepts', text: 'You review design directions or a shot list, and choose what fits best.' },
      { title: 'Create & refine', text: 'We design or shoot, then refine the work with your feedback.' },
      { title: 'Deliver', text: 'You receive final files for print and digital, with source files where agreed.' },
    ],
    technologies: ['Logo design', 'Brand identity', 'Print design', 'Social media graphics', 'Photography', 'Photo retouching'],
    overviewImage: '/graphics/graphics-overview.jpg',
    asideImage: '/graphics/graphics-aside.jpg',
    featuredTech: ['gd-logo', 'gd-camera', 'gd-social', 'gd-video'],
    techStack: [
      {
        group: 'Branding & print',
        icon: 'fa-pen-nib',
        items: [['Logo design', 'gd-logo'], ['Brand identity', 'gd-brand'], ['Flyers & posters', 'gd-poster'], ['Business cards & stationery', 'gd-card'], ['Banners & signage', 'gd-banner']],
      },
      {
        group: 'Digital & social',
        icon: 'fa-share-nodes',
        items: [['Social media graphics', 'gd-social'], ['Web & app graphics', 'gd-ui'], ['Infographics', 'gd-chart'], ['Presentations', 'gd-slides']],
      },
      {
        group: 'Photography',
        icon: 'fa-camera',
        items: [['Event photography', 'gd-camera'], ['Portraits & headshots', 'gd-portrait'], ['Product photography', 'gd-product']],
      },
      {
        group: 'Editing & motion',
        icon: 'fa-clapperboard',
        items: [['Photo retouching', 'gd-retouch'], ['Video editing', 'gd-video'], ['Motion graphics', 'gd-motion']],
      },
    ],
    faqs: [
      { q: 'Do I own the designs and photos?', a: 'Ownership and usage terms are agreed before work begins, so you know exactly what you can use and where.' },
      { q: 'Can you design a full brand, not just a logo?', a: 'Yes. We can create a complete identity with colours, fonts, templates and guidelines, so everything you publish looks consistent.' },
      { q: 'How many revisions are included?', a: 'We agree a number of revision rounds in the quote, and we keep refining until the design does its job.' },
    ],
  },

  typing: {
    tagline: 'Learn to type fast and accurately, without ever looking down at the keys.',
    overview: [
      'Typing is the basic skill behind every computer job, from writing reports and answering emails to entering data and studying online. Touch typing means using all ten fingers and knowing where every key is, so your speed and accuracy improve and typing stops being tiring.',
      'We teach it step by step: correct posture, finger placement on the home row, then the rest of the keyboard, with regular speed and accuracy practice. Learners are tested as they progress, so they can see their words-per-minute go up.',
    ],
    idealFor: ['Students who want to type assignments and exams faster', 'Job seekers who need typing skills for office roles', 'Staff who still type with two fingers and look at the keys', 'Schools and children starting to use computers'],
    benefits: [
      { icon: 'growth', title: 'Type much faster', text: 'Most learners double their speed as touch typing becomes automatic.' },
      { icon: 'discover', title: 'Fewer mistakes', text: 'Proper finger placement builds accuracy along with speed.' },
      { icon: 'people', title: 'Suits every learner', text: 'Patient, practical lessons for children, students and working adults.' },
      { icon: 'support', title: 'Skills employers want', text: 'A recognised, practical skill that helps in interviews, jobs and studies.' },
    ],
    process: [
      { title: 'Typing assessment', text: 'We measure your starting speed and accuracy and set a target.' },
      { title: 'Learn the technique', text: 'Posture, home row and finger placement, taught step by step.' },
      { title: 'Practise daily', text: 'Timed drills and exercises build muscle memory, with feedback from your trainer.' },
      { title: 'Test & certify', text: 'A final speed test shows your progress, and you receive a certificate.' },
    ],
    technologies: ['Finger placement', 'Home-row technique', 'Speed drills', 'Accuracy training', 'Progress tests', 'Certificates'],
    overviewImage: '/typing/typing-overview.jpg',
    asideImage: '/typing/typing-aside.jpg',
    featuredTech: ['ty-finger', 'ty-fast', 'ty-test', 'ty-cert'],
    techStack: [
      {
        group: 'Foundations',
        icon: 'fa-hand',
        items: [['Finger placement', 'ty-finger'], ['Home-row technique', 'ty-home'], ['Posture & ergonomics', 'ty-posture'], ['Keyboard familiarity', 'ty-keys']],
      },
      {
        group: 'Speed & accuracy',
        icon: 'fa-gauge-high',
        items: [['Speed drills', 'ty-fast'], ['Accuracy training', 'ty-proof'], ['Progress tests', 'ty-test'], ['Typing games', 'ty-game']],
      },
      {
        group: 'Practical computer skills',
        icon: 'fa-laptop',
        items: [['Word processing', 'ty-doc'], ['Formatting documents', 'ty-format'], ['Spreadsheet data entry', 'an-sheet'], ['Email & internet basics', 'dt-mail']],
      },
      {
        group: 'Who we teach',
        icon: 'fa-people-group',
        items: [['Children', 'ty-kids'], ['Job seekers & adults', 'ty-cv'], ['Schools & groups', 'ty-group'], ['Certificates', 'ty-cert']],
      },
    ],
    faqs: [
      { q: 'How long does it take to learn touch typing?', a: 'Most learners type without looking within a few weeks of regular practice. Speed then keeps improving with practice. We set a plan after your first assessment.' },
      { q: 'Can children and complete beginners join?', a: 'Yes. We start from the very beginning, at a pace that suits each learner, whether a child or an adult who has never used a keyboard.' },
      { q: 'Can you train our staff or school?', a: 'Yes. We run classes for schools, offices and organisations, either at your premises or at ours.' },
    ],
  },
};

export default serviceDetails;
