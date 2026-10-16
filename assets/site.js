(() => {
  'use strict';
  const root = document.documentElement;
  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  const menuButton = document.querySelector('.menu-toggle');
  const nav = document.querySelector('#main-nav');
  const motionButton = document.querySelector('#motion-toggle');
  let userPaused = false;
  try { userPaused = sessionStorage.getItem('bluejay-motion-paused') === 'true'; } catch (_) { /* Storage is optional. */ }
  const closeMenu = (returnFocus = false) => {
    nav.classList.remove('is-open');
    menuButton.setAttribute('aria-expanded', 'false');
    if (returnFocus) menuButton.focus();
  };
  menuButton.addEventListener('click', () => {
    const open = menuButton.getAttribute('aria-expanded') !== 'true';
    menuButton.setAttribute('aria-expanded', String(open));
    nav.classList.toggle('is-open', open);
  });
  nav.addEventListener('click', event => { if (event.target.closest('a')) closeMenu(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && nav.classList.contains('is-open')) closeMenu(true); });
  document.addEventListener('click', event => { if (!event.target.closest('.site-header')) closeMenu(); });
  function applyMotionPreference() {
    const paused = userPaused || media.matches;
    root.classList.toggle('motion-paused', paused);
    motionButton.setAttribute('aria-pressed', String(paused));
    motionButton.textContent = paused ? (media.matches ? 'Reduced motion enabled' : 'Resume motion ↗') : 'Pause motion Ⅱ';
    motionButton.disabled = media.matches;
    if (paused) root.style.setProperty('--hero-shift', '0px');
  }
  motionButton.addEventListener('click', () => {
    userPaused = !userPaused;
    try { sessionStorage.setItem('bluejay-motion-paused', String(userPaused)); } catch (_) { /* Storage is optional. */ }
    applyMotionPreference();
  });
  media.addEventListener('change', applyMotionPreference);
  applyMotionPreference();
  let scrollPending = false;
  function updateScroll() {
    const maximum = root.scrollHeight - window.innerHeight;
    root.style.setProperty('--scroll', maximum > 0 ? String(window.scrollY / maximum) : '0');
    if (!userPaused && !media.matches && window.innerWidth > 680 && window.scrollY < 1000) root.style.setProperty('--hero-shift', `${Math.min(35, window.scrollY * .045)}px`);
    scrollPending = false;
  }
  function queueScroll() { if (!scrollPending) { scrollPending = true; window.requestAnimationFrame(updateScroll); } }
  window.addEventListener('scroll', queueScroll, { passive: true });
  window.addEventListener('resize', () => { if (window.innerWidth > 680) closeMenu(); queueScroll(); });
  document.addEventListener('toggle', queueScroll, true);
  updateScroll();
  if ('IntersectionObserver' in window) {
    const revealObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => { if (entry.isIntersecting) { entry.target.classList.add('is-visible'); revealObserver.unobserve(entry.target); } });
    }, { threshold: .08, rootMargin: '0px 0px -30px 0px' });
    document.querySelectorAll('[data-reveal]').forEach(element => revealObserver.observe(element));
    root.classList.add('motion-ready');
    const navLinks = [...document.querySelectorAll('[data-nav]')];
    const sectionObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        navLinks.forEach(link => {
          if (link.dataset.nav === entry.target.id) link.setAttribute('aria-current', 'location');
          else link.removeAttribute('aria-current');
        });
      });
    }, { rootMargin: '-15% 0px -65% 0px', threshold: 0 });
    document.querySelectorAll('#research, #coverage, #approach, #plans, #contact').forEach(section => sectionObserver.observe(section));
    const steps = [...document.querySelectorAll('[data-step]')];
    const dots = [...document.querySelectorAll('.process-dots i')];
    const processObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const step = entry.target;
        document.querySelector('#process-number').textContent = step.dataset.step.padStart(2, '0');
        document.querySelector('#process-label').textContent = step.dataset.label;
        steps.forEach(item => item.classList.toggle('is-active', item === step));
        dots.forEach((dot, index) => dot.classList.toggle('active', index + 1 === Number(step.dataset.step)));
      });
    }, { rootMargin: '-20% 0px -45% 0px', threshold: 0 });
    steps.forEach(step => processObserver.observe(step));
  }
  const aliases = { '#proof':'#research', '#services':'#coverage', '#sample':'#approach', '#faq':'#contact', '#questions':'#contact' };
  function resolveHash() {
    let hash = window.location.hash;
    const aliased = Boolean(aliases[hash]);
    if (aliased) { history.replaceState(null, '', aliases[hash]); hash = aliases[hash]; }
    if (!hash) return;
    let id;
    try { id = decodeURIComponent(hash.slice(1)); } catch (_) { return; }
    const target = document.getElementById(id);
    if (!target) return;
    let parent = target;
    while (parent) { if (parent.tagName === 'DETAILS') parent.open = true; parent = parent.parentElement; }
    if (target.closest('details') || aliased) requestAnimationFrame(() => target.scrollIntoView({ behavior:'auto', block:'start' }));
    queueScroll();
  }
  window.addEventListener('hashchange', resolveHash);
  resolveHash();
  document.querySelector('#year').textContent = new Date().getFullYear();
})();
