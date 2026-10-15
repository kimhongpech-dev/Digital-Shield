#!/usr/bin/env node
'use strict';

/**
 * Static site generator.
 *
 *   content/site.json          -> site name, tagline, categories, tips
 *   content/posts/<slug>.json  -> one file per news post (EN + KM)
 *   public/                    -> copied as-is (css, js, fonts, uploads)
 *   dist/                      -> generated output (what Vercel serves)
 */

const fs = require('fs');
const path = require('path');
const { marked } = require('marked');

const ROOT = path.resolve(__dirname, '..');
const CONTENT = path.join(ROOT, 'content');
const POSTS_DIR = path.join(CONTENT, 'posts');
const PUBLIC = path.join(ROOT, 'public');
const ADMIN = path.join(ROOT, 'admin');
const DIST = path.join(ROOT, 'dist');
const LANGS = ['en', 'km'];

const EN_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const KM_MONTHS = ['មករា', 'កុម្ភៈ', 'មីនា', 'មេសា', 'ឧសភា', 'មិថុនា', 'កក្កដា', 'សីហា', 'កញ្ញា', 'តុលា', 'វិច្ឆិកា', 'ធ្នូ'];
const KM_DIGITS = ['០', '១', '២', '៣', '៤', '៥', '៦', '៧', '៨', '៩'];

/* ---------- helpers ---------- */

const esc = (s) =>
  String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** Pick text for a language from {en, km}; falls back to the other language. */
function field(value, lang) {
  if (value == null) return { text: '', lang };
  if (typeof value === 'string') return { text: value, lang };
  const other = lang === 'en' ? 'km' : 'en';
  if (value[lang] && String(value[lang]).trim()) return { text: String(value[lang]), lang };
  if (value[other] && String(value[other]).trim()) return { text: String(value[other]), lang: other };
  return { text: '', lang };
}

/** Render {en, km} as two spans; CSS shows only the active language. */
function bi(value, tag = 'span') {
  return LANGS.map((l) => {
    const f = field(value, l);
    return `<${tag} class="${l}" lang="${f.lang}">${esc(f.text)}</${tag}>`;
  }).join('');
}

function formatDate(iso, lang) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!m) return esc(iso || '');
  const mi = Number(m[2]) - 1;
  const day = String(Number(m[3]));
  if (lang === 'km') {
    const kd = (s) => String(s).replace(/\d/g, (c) => KM_DIGITS[Number(c)]);
    return `${kd(day)} ${KM_MONTHS[mi]} ${kd(m[1])}`;
  }
  return `${EN_MONTHS[mi]} ${day}, ${m[1]}`;
}

function dateEl(iso) {
  return (
    `<time datetime="${esc(iso)}">` +
    `<span class="en" lang="en">${formatDate(iso, 'en')}</span>` +
    `<span class="km" lang="km">${formatDate(iso, 'km')}</span>` +
    `</time>`
  );
}

function renderMarkdown(md) {
  let html = marked.parse(String(md || ''), { async: false });
  html = html.replace(/<img /g, '<img loading="lazy" ');
  html = html.replace(/<a href="(https?:\/\/[^"]+)"/g, '<a href="$1" rel="noopener noreferrer" target="_blank"');
  return html;
}

function readSite() {
  const file = path.join(CONTENT, 'site.json');
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    throw new Error(`content/site.json: ${e.message}`);
  }
}

function loadPosts() {
  if (!fs.existsSync(POSTS_DIR)) return [];
  const posts = [];
  for (const file of fs.readdirSync(POSTS_DIR).sort()) {
    if (!file.endsWith('.json')) continue;
    const slug = file.slice(0, -5);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      throw new Error(`content/posts/${file}: file name must use lowercase letters, numbers and hyphens only`);
    }
    let data;
    try {
      data = JSON.parse(fs.readFileSync(path.join(POSTS_DIR, file), 'utf8'));
    } catch (e) {
      throw new Error(`content/posts/${file}: invalid JSON (${e.message})`);
    }
    if (data.draft) continue;
    const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(data.date || '');
    if (!dm || Number(dm[2]) < 1 || Number(dm[2]) > 12) {
      throw new Error(`content/posts/${file}: "date" must look like 2026-10-15`);
    }
    if (!field(data.title, 'en').text) throw new Error(`content/posts/${file}: needs a title`);
    posts.push({ ...data, slug });
  }
  posts.sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug));
  return posts;
}

function catLabel(site, key) {
  const c = site.categories && site.categories[key];
  return c || { en: key || 'News', km: key || 'ព័ត៌មាន' };
}

const chip = (site, key) =>
  `<span class="chip" data-cat="${esc(key || 'news')}">${bi(catLabel(site, key))}</span>`;

/* ---------- inline art ---------- */

const LOGO = `<svg class="logo" viewBox="0 0 32 32" width="28" height="28" aria-hidden="true" focusable="false"><path d="M16 2.5 5 6.6v8.2c0 6.6 4.5 11.9 11 14.7 6.5-2.8 11-8.1 11-14.7V6.6L16 2.5Z" fill="#12b886"/><path d="m11 16.2 3.6 3.6 6.6-7" fill="none" stroke="#0b1b2b" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const HERO_ART = `<svg class="hero-art" viewBox="0 0 320 360" aria-hidden="true" focusable="false"><defs><linearGradient id="hg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#12b886"/><stop offset="1" stop-color="#1c7ed6"/></linearGradient></defs><path d="M160 14 40 60v96c0 80 52 142 120 176 68-34 120-96 120-176V60L160 14Z" fill="none" stroke="url(#hg)" stroke-width="3"/><path d="M160 44 66 80v76c0 62 40 112 94 140 54-28 94-78 94-140V80L160 44Z" fill="url(#hg)" opacity=".16"/><path d="m112 168 36 36 64-72" fill="none" stroke="#12b886" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/><g fill="#12b886" opacity=".7"><circle cx="40" cy="60" r="5"/><circle cx="280" cy="60" r="5"/><circle cx="160" cy="332" r="5"/></g></svg>`;

const ARROW = '<span aria-hidden="true">←</span>';

/* ---------- page shell ---------- */

function page({ site, titles, descriptions, image, type = 'website', urlPath = '/', main }) {
  const base = (site.url || '').replace(/\/$/, '');
  const titleEn = titles.en;
  const descEn = descriptions.en;
  const absImage = image && base ? base + image : '';
  const og = [
    `<meta property="og:type" content="${type}">`,
    `<meta property="og:site_name" content="${esc(field(site.name, 'en').text)}">`,
    `<meta property="og:title" content="${esc(titleEn)}">`,
    `<meta property="og:description" content="${esc(descEn)}">`,
    base ? `<meta property="og:url" content="${esc(base + urlPath)}">` : '',
    absImage ? `<meta property="og:image" content="${esc(absImage)}">` : '',
    `<meta name="twitter:card" content="${absImage ? 'summary_large_image' : 'summary'}">`,
  ]
    .filter(Boolean)
    .join('\n');

  return `<!doctype html>
<html lang="en" data-lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titleEn)}</title>
<meta name="description" content="${esc(descEn)}">
<meta name="theme-color" content="#0b1b2b">
${og}
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/assets/style.css">
<script src="/assets/lang.js"></script>
</head>
<body data-title-en="${esc(titles.en)}" data-title-km="${esc(titles.km)}">
<a class="skip" href="#main"><span class="en">Skip to content</span><span class="km" lang="km">រំលងទៅមាតិកា</span></a>
<header class="site-header">
  <div class="wrap bar">
    <a class="brand" href="/">${LOGO}<span class="brand-name">${bi(site.name)}</span></a>
    <nav class="nav" aria-label="Main">
      <a href="/#latest"><span class="en">Latest news</span><span class="km" lang="km">ព័ត៌មានថ្មីៗ</span></a>
      <a href="/#tips"><span class="en">Safety tips</span><span class="km" lang="km">គន្លឹះសុវត្ថិភាព</span></a>
    </nav>
    <div class="lang" role="group" aria-label="Language / ភាសា">
      <button type="button" data-set-lang="en" aria-pressed="true">EN</button>
      <button type="button" data-set-lang="km" aria-pressed="false" lang="km">ខ្មែរ</button>
    </div>
  </div>
</header>
<main id="main">
${main}
</main>
<footer class="site-footer">
  <div class="wrap">
    <p class="foot-brand">${LOGO}<strong>${bi(site.name)}</strong></p>
    <p class="foot-note">${bi(site.footer)}</p>
    <p class="foot-copy">© ${new Date().getFullYear()} ${bi(site.name)}</p>
  </div>
</footer>
<script src="/assets/app.js" defer></script>
</body>
</html>
`;
}

/* ---------- components ---------- */

function card(site, post, isLead) {
  const href = `/posts/${post.slug}`;
  const media = post.image
    ? `<img src="${esc(post.image)}" alt="" loading="lazy">`
    : `<span class="ph">${LOGO}</span>`;
  return `<article class="card${isLead ? ' is-lead' : ''}" data-cat="${esc(post.category || 'news')}">
  <a class="card-media" href="${href}" tabindex="-1" aria-hidden="true">${media}</a>
  <div class="card-body">
    <p class="meta">${chip(site, post.category)}${dateEl(post.date)}</p>
    <h3><a href="${href}">${bi(post.title)}</a></h3>
    <p class="summary">${bi(post.summary)}</p>
  </div>
</article>`;
}

/* ---------- pages ---------- */

function indexPage(site, posts) {
  const used = [];
  const order = Object.keys(site.categories || {});
  for (const k of order) if (posts.some((p) => p.category === k)) used.push(k);
  for (const p of posts) if (p.category && !used.includes(p.category)) used.push(p.category);

  const filters = used.length > 1
    ? `<div class="filters" role="group" aria-label="Filter by topic / ត្រងតាមប្រធានបទ">
        <button type="button" data-filter="all" aria-pressed="true"><span class="en">All</span><span class="km" lang="km">ទាំងអស់</span></button>
        ${used.map((k) => `<button type="button" data-filter="${esc(k)}" aria-pressed="false">${bi(catLabel(site, k))}</button>`).join('\n        ')}
      </div>`
    : '';

  const grid = `<div class="grid" id="live-posts">
${posts.map((p, i) => card(site, p, i === 0 && posts.length > 2)).join('\n')}
</div>
<p class="empty" id="live-empty"${posts.length ? ' hidden' : ''}><span class="en">No posts in this topic yet.</span><span class="km" lang="km">មិនទាន់មានអត្ថបទក្នុងប្រធានបទនេះទេ។</span></p>`;

  const tips = (site.tips || [])
    .map(
      (t, i) => `<li><span class="tip-n" aria-hidden="true">0${i + 1}</span><div><h3>${bi(t.title)}</h3><p>${bi(t.text)}</p></div></li>`
    )
    .join('\n');

  const main = `<section class="hero">
  <div class="wrap hero-grid">
    <div class="hero-copy">
      <p class="eyebrow">${bi(site.eyebrow)}</p>
      <h1>${bi(site.headline)}</h1>
      <p class="lead">${bi(site.tagline)}</p>
      <p class="cta"><a class="btn" href="#latest"><span class="en">Read the latest</span><span class="km" lang="km">អានអត្ថបទថ្មីៗ</span></a></p>
    </div>
    ${HERO_ART}
  </div>
</section>
<section class="latest" id="latest">
  <div class="wrap">
    <div class="section-head">
      <h2>${bi({ en: 'Latest news', km: 'ព័ត៌មានថ្មីៗ' })}</h2>
      ${filters}
    </div>
    ${grid}
  </div>
</section>
<section class="tips" id="tips">
  <div class="wrap">
    <h2>${bi({ en: 'Three habits that block most attacks', km: 'ទម្លាប់ ៣ យ៉ាងដែលទប់ស្កាត់ការវាយប្រហារភាគច្រើន' })}</h2>
    <ul class="tip-grid">
${tips}
    </ul>
  </div>
</section>`;

  return page({
    site,
    titles: {
      en: `${field(site.name, 'en').text} — ${field(site.tagline, 'en').text}`,
      km: `${field(site.name, 'km').text} — ${field(site.tagline, 'km').text}`,
    },
    descriptions: { en: field(site.tagline, 'en').text, km: field(site.tagline, 'km').text },
    urlPath: '/',
    main,
  });
}

function postPage(site, post, all) {
  const rendered = renderPostContent(site, post, all);
  return page({
    site,
    titles: rendered.titles,
    descriptions: rendered.descriptions,
    image: post.image,
    type: 'article',
    urlPath: `/posts/${post.slug}`,
    main: rendered.main,
  });
}

function renderPostContent(site, post, all) {
  const bodies = LANGS.map((l) => {
    const f = field(post.body, l);
    return `<div class="prose ${l}" lang="${f.lang}">\n${renderMarkdown(f.text)}\n</div>`;
  }).join('\n');

  const altOf = (l) => field(post.imageAlt, l).text || field(post.title, l).text;
  const cover = post.image
    ? `<figure class="cover">
    <img class="en" src="${esc(post.image)}" alt="${esc(altOf('en'))}" lang="en">
    <img class="km" src="${esc(post.image)}" alt="${esc(altOf('km'))}" lang="km">
  </figure>`
    : '';

  const more = all.filter((p) => p.slug !== post.slug).slice(0, 3);
  const moreHtml = more.length
    ? `<section class="more">
  <div class="wrap">
    <h2>${bi({ en: 'Keep reading', km: 'អានបន្ត' })}</h2>
    <div class="grid">
${more.map((p) => card(site, p, false)).join('\n')}
    </div>
  </div>
</section>`
    : '';

  const main = `<article class="post">
  <a class="back" href="/">${ARROW} <span class="en">All news</span><span class="km" lang="km">អត្ថបទទាំងអស់</span></a>
  <p class="meta">${chip(site, post.category)}${dateEl(post.date)}</p>
  <h1>${bi(post.title)}</h1>
  <p class="dek">${bi(post.summary)}</p>
  ${cover}
  ${bodies}
</article>
${moreHtml}`;

  const titles = {
    en: `${field(post.title, 'en').text} · ${field(site.name, 'en').text}`,
    km: `${field(post.title, 'km').text} · ${field(site.name, 'km').text}`,
  };
  const sum = field(post.summary, 'en').text || field(post.title, 'en').text;
  return {
    main,
    titles,
    descriptions: { en: sum, km: field(post.summary, 'km').text || sum },
  };
}

function notFoundPage(site) {
  const main = `<section class="wrap nf">
  <h1>${bi({ en: 'Page not found', km: 'រកមិនឃើញទំព័រ' })}</h1>
  <p>${bi({ en: 'That page does not exist or has been removed.', km: 'ទំព័រនេះមិនមាន ឬត្រូវបានលុបចេញ។' })}</p>
  <p><a class="btn" href="/"><span class="en">Back to home</span><span class="km" lang="km">ត្រឡប់ទៅទំព័រដើម</span></a></p>
</section>`;
  return page({
    site,
    titles: { en: `Not found · ${field(site.name, 'en').text}`, km: `រកមិនឃើញ · ${field(site.name, 'km').text}` },
    descriptions: { en: 'Page not found', km: 'រកមិនឃើញទំព័រ' },
    urlPath: '/404',
    main,
  });
}

/* ---------- build ---------- */

function build() {
  const site = readSite();
  const posts = loadPosts();

  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(path.join(DIST, 'posts'), { recursive: true });
  if (fs.existsSync(PUBLIC)) fs.cpSync(PUBLIC, DIST, { recursive: true });
  fs.mkdirSync(path.join(DIST, 'admin'), { recursive: true });
  for (const file of ['index.html', 'admin.css', 'admin.js']) {
    fs.copyFileSync(path.join(ADMIN, file), path.join(DIST, 'admin', file));
  }
  fs.cpSync(path.join(PUBLIC, 'assets', 'fonts'), path.join(DIST, 'fonts'), { recursive: true });

  fs.writeFileSync(path.join(DIST, 'index.html'), indexPage(site, posts));
  for (const post of posts) {
    fs.writeFileSync(path.join(DIST, 'posts', `${post.slug}.html`), postPage(site, post, posts));
  }
  fs.writeFileSync(path.join(DIST, '404.html'), notFoundPage(site));

  const base = (site.url || '').replace(/\/$/, '');
  if (base) {
    const urls = ['/', ...posts.map((p) => `/posts/${p.slug}`)];
    const xml =
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
      urls.map((u) => `  <url><loc>${esc(base + u)}</loc></url>`).join('\n') +
      `\n</urlset>\n`;
    fs.writeFileSync(path.join(DIST, 'sitemap.xml'), xml);
    fs.writeFileSync(path.join(DIST, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${base}/sitemap.xml\n`);
  }

  return { posts: posts.length };
}

module.exports = {
  build,
  loadPosts,
  renderMarkdown,
  renderCard: card,
  renderPostContent,
  readSite,
  ROOT,
  CONTENT,
  POSTS_DIR,
  PUBLIC,
  DIST,
};

if (require.main === module) {
  try {
    const r = build();
    console.log(`Built ${r.posts} post${r.posts === 1 ? '' : 's'} -> dist/`);
  } catch (e) {
    console.error('Build failed: ' + e.message);
    process.exit(1);
  }
}
