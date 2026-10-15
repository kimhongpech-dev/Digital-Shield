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
  var liveGrid = document.getElementById('live-posts');
  var empty = document.getElementById('live-empty');
  var activeFilter = 'all';
  var isLocalPreview = (location.hostname === 'localhost' || location.hostname === '127.0.0.1') && location.port === '4001';

  function applyFilter(cat) {
    var shown = 0;
    var first = true;
    var cards = document.querySelectorAll('#live-posts .card');
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
    if (empty) empty.hidden = shown !== 0;
    filterButtons.forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-filter') === cat));
    });
  }

  filterButtons.forEach(function (b) {
    b.addEventListener('click', function () {
      activeFilter = b.getAttribute('data-filter');
      applyFilter(activeFilter);
    });
  });

  if (liveGrid && !isLocalPreview) {
    fetch('/api/posts', { headers: { Accept: 'application/json' } })
      .then(function (response) {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.json();
      })
      .then(function (data) {
        liveGrid.innerHTML = data.cardsHtml || '';
        applyFilter(activeFilter);
      })
      .catch(function (error) {
        console.error('Could not load live posts:', error);
      });
  }

  /* ---------- live article content ---------- */
  var articleMatch = /^\/posts\/([a-z0-9-]+)\/?$/.exec(location.pathname);
  var main = document.getElementById('main');
  if (articleMatch && main && !isLocalPreview) {
    fetch('/api/posts/' + encodeURIComponent(articleMatch[1]), {
      headers: { Accept: 'application/json' },
    })
      .then(function (response) {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.json();
      })
      .then(function (data) {
        main.innerHTML = data.mainHtml;
        document.body.setAttribute('data-title-en', data.titles.en);
        document.body.setAttribute('data-title-km', data.titles.km);
        var description = document.querySelector('meta[name="description"]');
        if (description) description.content = data.descriptions.en;
        var ogTitle = document.querySelector('meta[property="og:title"]');
        if (ogTitle) ogTitle.content = data.titles.en;
        var ogDescription = document.querySelector('meta[property="og:description"]');
        if (ogDescription) ogDescription.content = data.descriptions.en;
        var ogImage = document.querySelector('meta[property="og:image"]');
        if (ogImage) {
          if (data.post.image) ogImage.content = new URL(data.post.image, location.origin).href;
          else ogImage.removeAttribute('content');
        }
        var twitterCard = document.querySelector('meta[name="twitter:card"]');
        if (twitterCard) twitterCard.content = data.post.image ? 'summary_large_image' : 'summary';
        applyLang(root.getAttribute('data-lang') || 'en', false);
      })
      .catch(function (error) {
        console.error('Could not load live article:', error);
      });
  }
})();
