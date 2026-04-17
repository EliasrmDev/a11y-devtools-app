/* ─────────────────────────────────────────────────
   a11y DevTools Landing Page — JavaScript
   Security: no innerHTML with untrusted data,
   no eval(), no dynamic script loading.
───────────────────────────────────────────────── */
(function () {
  'use strict';

  /* ── Constants ── */
  var DEMO_SCORE       = 87;
  var DEMO_GRADE       = 'B';
  var DEMO_BREAKDOWN   = { critical: 1, serious: 3, moderate: 2, minor: 4 };
  var RING_CIRCUMF     = 150.796; /* 2π × 24 (radius) */
  var ANIM_DURATION    = 1500;    /* ms */
  var prefersReduced   = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── Utility: count-up animation ── */
  function countUp(el, from, to, duration) {
    if (!el) return;
    if (prefersReduced) { el.textContent = to; return; }
    var start = performance.now();
    function tick(now) {
      var elapsed  = now - start;
      var progress = Math.min(elapsed / duration, 1);
      var eased    = 1 - Math.pow(1 - progress, 3); /* cubic ease-out */
      el.textContent = Math.round(from + (to - from) * eased);
      if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  /* ── Hero score ring + counters ── */
  function startHeroDemo() {
    var ring     = document.getElementById('demo-ring');
    var scoreEl  = document.getElementById('demo-score');
    var gradeEl  = document.getElementById('demo-grade');
    var statV    = document.getElementById('stat-v');
    var statP    = document.getElementById('stat-p');
    var statI    = document.getElementById('stat-i');
    var cntCrit  = document.getElementById('cnt-critical');
    var cntSer   = document.getElementById('cnt-serious');
    var cntMod   = document.getElementById('cnt-moderate');
    var cntMin   = document.getElementById('cnt-minor');

    /* Start ring animation after brief delay */
    setTimeout(function () {
      if (ring) {
        ring.style.strokeDashoffset = RING_CIRCUMF * (1 - DEMO_SCORE / 100);
      }
    }, 500);

    /* Counters */
    setTimeout(function () {
      countUp(scoreEl, 0, DEMO_SCORE, ANIM_DURATION);
      countUp(statV,   0, 5,          1200);
      countUp(statP,   0, 34,         1200);
      countUp(statI,   0, 8,          1200);

      setTimeout(function () {
        if (cntCrit) cntCrit.textContent = DEMO_BREAKDOWN.critical;
        if (cntSer)  cntSer.textContent  = DEMO_BREAKDOWN.serious;
        if (cntMod)  cntMod.textContent  = DEMO_BREAKDOWN.moderate;
        if (cntMin)  cntMin.textContent  = DEMO_BREAKDOWN.minor;
        if (gradeEl) gradeEl.textContent = DEMO_GRADE;
      }, 400);
    }, 600);

    /* Stagger violation items in */
    var violItems = document.querySelectorAll('.mock-viol-item');
    violItems.forEach(function (item, i) {
      setTimeout(function () {
        item.classList.add('visible');
      }, 850 + i * 190);
    });
  }

  /* ── Scroll-triggered reveal (IntersectionObserver) ── */
  function setupReveal() {
    var targets = document.querySelectorAll('.reveal, .feature-card');

    if (prefersReduced) {
      targets.forEach(function (el) { el.classList.add('in-view'); });
      return;
    }

    if (!('IntersectionObserver' in window)) {
      targets.forEach(function (el) { el.classList.add('in-view'); });
      return;
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('in-view');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -36px 0px' });

    targets.forEach(function (el) { io.observe(el); });
  }

  /* ── Active nav link on scroll ── */
  function setupNavHighlight() {
    var sections = document.querySelectorAll('section[id]');
    var navLinks = document.querySelectorAll('.nav-links a');
    if (!sections.length || !navLinks.length) return;

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var id = entry.target.id;
        navLinks.forEach(function (link) {
          var isActive = link.getAttribute('href') === '#' + id;
          if (isActive) {
            link.setAttribute('aria-current', 'page');
          } else {
            link.removeAttribute('aria-current');
          }
        });
      });
    }, { threshold: 0.4 });

    sections.forEach(function (s) { io.observe(s); });
  }

  /* ── Accessible smooth scroll ── */
  function setupSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
      anchor.addEventListener('click', function (e) {
        var id = this.getAttribute('href').slice(1);
        if (!id) return;
        var target = document.getElementById(id);
        if (!target) return;
        e.preventDefault();
        target.scrollIntoView({ behavior: prefersReduced ? 'auto' : 'smooth' });
        /* Move focus to section for keyboard/screen reader users */
        if (!target.hasAttribute('tabindex')) {
          target.setAttribute('tabindex', '-1');
        }
        target.focus({ preventScroll: true });
      });
    });
  }

  /* ── Init ── */
  function init() {
    startHeroDemo();
    setupReveal();
    setupNavHighlight();
    setupSmoothScroll();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();