/**
 * site/js/app.js
 * Fetches all data from Firebase Realtime Database and renders the portfolio.
 * Firebase config is injected from config.js (gitignored).
 */

import { initializeApp }    from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getDatabase, ref, onValue } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js';
import { FIREBASE_CONFIG }  from './config.js';

/* ── Bootstrap ── */
const app = initializeApp(FIREBASE_CONFIG);
const db  = getDatabase(app);

onValue(ref(db, '/site'), snap => {
  const data = snap.val();
  if (!data) return;
  applyTheme(data.theme);
  renderMeta(data.meta);
  renderHero(data.hero);
  renderAbout(data.about);
  renderPortfolio(data.portfolio);
  renderExperience(data.experience);
  renderContact(data.contact);
  hideLoader();
  initInteractions();
}, { onlyOnce: false }); // live updates — edits via bot reflect immediately

/* ── Theme ── */
function applyTheme(t) {
  if (!t) return;
  const r = document.documentElement.style;
  if (t.ink)    r.setProperty('--ink',    t.ink);
  if (t.paper)  r.setProperty('--paper',  t.paper);
  if (t.warm)   r.setProperty('--warm',   t.warm);
  if (t.accent) r.setProperty('--accent', t.accent);
  if (t.muted)  r.setProperty('--muted',  t.muted);
  if (t.line)   r.setProperty('--line',   t.line);
  if (t.fontDisplay) r.setProperty('--f-display', `'${t.fontDisplay}', serif`);
  if (t.fontBody)    r.setProperty('--f-body',    `'${t.fontBody}', sans-serif`);
}

/* ── Meta ── */
function renderMeta(m) {
  if (!m) return;
  if (m.title)       document.title = m.title;
  if (m.description) {
    let el = document.querySelector('meta[name="description"]');
    if (!el) { el = document.createElement('meta'); el.name = 'description'; document.head.appendChild(el); }
    el.content = m.description;
  }
}

/* ── Hero ── */
function renderHero(h) {
  if (!h) return;
  set('#hero-tag',  h.tag);
  setHTML('#hero-name', h.nameHtml);
  set('#hero-sub',  h.sub);
  setLink('#hero-cta-primary',   h.ctaPrimary?.label,   h.ctaPrimary?.href);
  setLink('#hero-cta-secondary', h.ctaSecondary?.label, h.ctaSecondary?.href);
}

/* ── About ── */
function renderAbout(a) {
  if (!a) return;
  set('#about-eyebrow', a.eyebrow);
  set('#about-heading', a.heading);
  const textEl = document.getElementById('about-paragraphs');
  if (textEl && a.paragraphs) {
    textEl.innerHTML = a.paragraphs.map(p => `<p>${p}</p>`).join('');
  }
  const statsEl = document.getElementById('about-stats');
  if (statsEl && a.stats) {
    statsEl.innerHTML = a.stats.map(s => `
      <div>
        <div class="stat-num">${s.value}</div>
        <div class="stat-label">${s.label}</div>
      </div>
    `).join('');
  }
}

/* ── Portfolio ── */
function renderPortfolio(p) {
  if (!p) return;
  set('#portfolio-eyebrow', p.eyebrow);
  set('#portfolio-heading', p.heading);

  const grid = document.getElementById('port-grid');
  if (!grid || !p.items) return;

  const items = Object.values(p.items)
    .filter(i => i.visible !== false)
    .sort((a, b) => (a.order || 0) - (b.order || 0));

  // Build unique category filters
  const cats = ['all', ...new Set(items.map(i => i.category).filter(Boolean))];
  const filterEl = document.getElementById('port-filters');
  if (filterEl) {
    filterEl.innerHTML = cats.map(c =>
      `<button class="filter-btn${c==='all'?' active':''}" data-filter="${c}">${c === 'all' ? 'All' : cap(c)}</button>`
    ).join('');
  }

  grid.innerHTML = items.map(item => `
    <article class="port-item reveal" data-category="${item.category || ''}" data-id="${item.id}">
      <div class="port-thumb">
        ${renderMedia(item.media)}
      </div>
      <div class="port-info">
        <div>
          <div class="port-title">${item.title || 'Untitled'}</div>
          <div class="port-cat">${item.category ? cap(item.category) : ''}</div>
        </div>
        <div class="port-arrow">↗</div>
      </div>
    </article>
  `).join('');
}

function renderMedia(media) {
  if (!media || !media.url) {
    return `<div class="port-ph">
      <div class="port-ph-icon">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <path d="M3 9h18M9 21V9"/>
        </svg>
      </div>
      <span>Add project image</span>
    </div>`;
  }
  if (media.type === 'youtube') {
    const id = extractYouTubeId(media.url);
    return `<iframe
      src="https://www.youtube.com/embed/${id}?mute=1&autoplay=0&rel=0"
      title="Project video"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      allowfullscreen></iframe>`;
  }
  // image (default)
  return `<img src="${media.url}" alt="${media.alt || 'Project image'}" loading="lazy"/>`;
}

function extractYouTubeId(url) {
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : '';
}

/* ── Experience ── */
function renderExperience(e) {
  if (!e) return;
  set('#cv-eyebrow', e.eyebrow);
  set('#cv-heading',  e.heading);

  const tl = document.getElementById('timeline');
  if (tl && e.timeline) {
    const entries = Object.values(e.timeline).sort((a,b)=>(a.order||0)-(b.order||0));
    tl.innerHTML = entries.map(entry => `
      <div class="cv-entry">
        <div class="cv-dot-col">
          <div class="cv-dot"></div>
          <div class="cv-line"></div>
        </div>
        <div>
          <div class="cv-year">${entry.period}</div>
          <div class="cv-body">
            <div class="cv-title">${entry.title}</div>
            <div class="cv-place">${entry.place}</div>
            <div class="cv-desc">${entry.desc}</div>
          </div>
        </div>
      </div>
    `).join('');
  }

  const sk = document.getElementById('skills-block');
  if (sk && e.skills) {
    sk.innerHTML = e.skills.map(g => `
      <div>
        <div class="skill-group-label">${g.group}</div>
        <div class="skill-tags">
          ${g.tags.map(t => `<span class="skill-tag">${t}</span>`).join('')}
        </div>
      </div>
    `).join('');
  }
}

/* ── Contact ── */
function renderContact(c) {
  if (!c) return;
  set('#contact-eyebrow', c.eyebrow);
  set('#contact-heading', c.heading);
  set('#contact-body',    c.body);
  const emailEls = document.querySelectorAll('.contact-email');
  emailEls.forEach(el => { el.textContent = c.email; el.href = `mailto:${c.email}`; });
  const dlBtn = document.getElementById('cv-download');
  if (dlBtn && c.cvUrl) dlBtn.href = c.cvUrl;
  const emailBtn = document.getElementById('contact-email-btn');
  if (emailBtn && c.email) emailBtn.href = `mailto:${c.email}`;

  const socials = document.getElementById('socials');
  if (socials && c.socials) {
    socials.innerHTML = c.socials.map(s =>
      `<a href="${s.url}" class="social-link" target="_blank" rel="noopener">${s.label}</a>`
    ).join('');
  }
}

/* ── Interactions ── */
function initInteractions() {
  // Smooth scroll
  document.querySelectorAll('a[href^="#"]').forEach(link => {
    link.addEventListener('click', e => {
      const target = document.querySelector(link.getAttribute('href'));
      if (!target) return;
      e.preventDefault();
      const offset = document.querySelector('nav')?.offsetHeight || 0;
      window.scrollTo({ top: target.offsetTop - offset, behavior: 'smooth' });
      closeMenu();
    });
  });

  // Nav scroll + active
  const nav = document.getElementById('nav');
  const sections = [...document.querySelectorAll('section[id]')];
  const navLinks = document.querySelectorAll('.nav-links a');

  function onScroll() {
    nav?.classList.toggle('scrolled', window.scrollY > 40);
    let cur = '';
    sections.forEach(s => { if (window.scrollY >= s.offsetTop - 120) cur = s.id; });
    navLinks.forEach(a => a.classList.toggle('active', a.getAttribute('href') === `#${cur}`));
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // Mobile menu
  const burger = document.querySelector('.burger');
  const drawer = document.querySelector('.drawer');
  function closeMenu() {
    burger?.classList.remove('open');
    drawer?.classList.remove('open');
    burger?.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
  }
  burger?.addEventListener('click', () => {
    const isOpen = drawer?.classList.contains('open');
    if (isOpen) { closeMenu(); } else {
      burger.classList.add('open');
      drawer?.classList.add('open');
      burger.setAttribute('aria-expanded', 'true');
      document.body.style.overflow = 'hidden';
    }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenu(); });

  // Reveal on scroll
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((e, i) => {
      if (e.isIntersecting) {
        setTimeout(() => e.target.classList.add('in'), i * 60);
        observer.unobserve(e.target);
      }
    });
  }, { threshold: 0.06, rootMargin: '0px 0px -32px 0px' });
  document.querySelectorAll('.reveal').forEach(el => observer.observe(el));

  // Portfolio filter (event delegation — works after dynamic render)
  document.getElementById('port-filters')?.addEventListener('click', e => {
    const btn = e.target.closest('.filter-btn');
    if (!btn) return;
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const f = btn.dataset.filter;
    document.querySelectorAll('.port-item').forEach(item => {
      item.classList.toggle('hidden', f !== 'all' && item.dataset.category !== f);
    });
  });
}

/* ── Helpers ── */
function set(sel, val)         { const el = document.querySelector(sel); if (el && val !== undefined) el.textContent = val; }
function setHTML(sel, val)     { const el = document.querySelector(sel); if (el && val !== undefined) el.innerHTML   = val; }
function setLink(sel, label, href) {
  const el = document.querySelector(sel);
  if (!el) return;
  if (label) el.textContent = label;
  if (href)  el.href = href;
}
function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
function hideLoader() {
  const l = document.getElementById('loading');
  if (l) { l.classList.add('hidden'); setTimeout(() => l.remove(), 600); }
}
