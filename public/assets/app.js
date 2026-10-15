(function () {
  'use strict';
  var root = document.documentElement;

  /* ---------- language toggle ---------- */
  var langButtons = document.querySelectorAll('[data-set-lang]');

  function applyLang(lang, save) {
    root.setAttribute('data-lang', lang);
    root.lang = lang;
    var t = document.body.getAttribute('data-title-' + lang);
    if (t) document.title = t;
    langButtons.forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-set-lang') === lang));
    });
    if (save) {
      try { localStorage.setItem('lang', lang); } catch (e) {}
    }
  }

  langButtons.forEach(function (b) {
    b.addEventListener('click', function () {
      applyLang(b.getAttribute('data-set-lang'), true);
    });
  });
  applyLang(root.getAttribute('data-lang') || 'en', false);

  /* ---------- topic filter (home page) ---------- */
  var filterButtons = document.querySelectorAll('[data-filter]');
  var cards = document.querySelectorAll('.grid .card');
  var empty = document.querySelector('.latest .empty');

  function applyFilter(cat) {
    var shown = 0;
    var first = true;
    cards.forEach(function (c) {
      var match = cat === 'all' || c.getAttribute('data-cat') === cat;
      c.hidden = !match;
      c.classList.remove('is-lead');
      if (match) {
        shown++;
        if (first && cat === 'all' && cards.length > 2) c.classList.add('is-lead');
        first = false;
      }
    });
    if (empty && cards.length) empty.hidden = shown !== 0;
    filterButtons.forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-filter') === cat));
    });
  }

  filterButtons.forEach(function (b) {
    b.addEventListener('click', function () {
      applyFilter(b.getAttribute('data-filter'));
    });
  });
})();
