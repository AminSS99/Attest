// The page remains fully readable if this script cannot run.
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

if (!reducedMotion.matches && 'IntersectionObserver' in window) {
  const headings = [...document.querySelectorAll('main h1, main h2, main h3')];
  const groups = [...document.querySelectorAll(`
    .site-header .brand, .site-header nav,
    main .section-index, main .lead, main .hero-actions, main .hero-aside,
    main .split-heading > p, main .evidence-chain, main .example-footnote,
    main .process .section-heading > p, main .process-list li,
    main .feature-copy > p, main .feature-copy > a,
    main .passport-specimen, main .journey-specimen, main .capsule-specimen,
    main .principle-columns p, main .availability-grid > div,
    main .faq details, main .final-cta p,
    main .guide-intro, main .guide-nav,
    main .guide-content section > p, main .guide-content pre
  `)];

  // Keep each heading's accessible name whole while its visible words animate.
  for (const heading of headings) {
    heading.setAttribute('aria-label', heading.innerText.replace(/\s+/g, ' ').trim());
    const walker = document.createTreeWalker(heading, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    let index = 0;
    for (const node of nodes) {
      if (!node.textContent.trim()) continue;
      const fragment = document.createDocumentFragment();
      for (const part of node.textContent.match(/\S+|\s+/g) || []) {
        if (/^\s+$/.test(part)) {
          fragment.append(document.createTextNode(part));
        } else {
          const word = document.createElement('span');
          word.className = 'reveal-word';
          word.setAttribute('aria-hidden', 'true');
          word.style.setProperty('--word-index', index++);
          word.textContent = part;
          fragment.append(word);
        }
      }
      node.replaceWith(fragment);
    }
    heading.classList.add('reveal-pending', 'reveal-text');
  }

  for (const group of groups) group.classList.add('reveal-pending', 'reveal-group');

  const heroTitle = document.querySelector('.hero h1, .guide-main h1');
  if (heroTitle) heroTitle.style.setProperty('--reveal-delay', '100ms');
  const lead = document.querySelector('.hero .lead, .guide-intro');
  if (lead) lead.style.setProperty('--reveal-delay', '420ms');
  const actions = document.querySelector('.hero-actions');
  if (actions) actions.style.setProperty('--reveal-delay', '580ms');
  const aside = document.querySelector('.hero-aside');
  if (aside) aside.style.setProperty('--reveal-delay', '650ms');

  const targets = [...headings, ...groups];
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    }
  }, { rootMargin: '0px 0px -4% 0px', threshold: 0.06 });
  for (const target of targets) observer.observe(target);

  // If the preference changes mid-page, reveal anything still waiting.
  reducedMotion.addEventListener('change', (event) => {
    if (!event.matches) return;
    for (const target of targets) target.classList.add('is-visible');
    observer.disconnect();
  });
}
