(() => {
  'use strict';

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const LANGS = ['en', 'km'];

  const state = { slug: null, image: '', imageData: null, site: null, tab: 'en', busy: false };

  /* ---------- API ---------- */
  async function api(url, method = 'GET', body) {
    const opts = { method };
    if (method !== 'GET') {
      opts.headers = { 'Content-Type': 'application/json' };
      opts.body = JSON.stringify(body || {});
    }
    const res = await fetch(url, opts);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || res.statusText);
    return data;
  }

  /* ---------- UI helpers ---------- */
  let toastTimer;
  function toast(msg, isError) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.toggle('error', !!isError);
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.hidden = true), isError ? 9000 : 4500);
  }

  function setBusy(on) {
    state.busy = on;
    $$('#btn-save, #btn-publish, #btn-delete, #btn-new').forEach((b) => (b.disabled = on));
  }

  const todayIso = () => {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  };

  const pane = (lang) => $(`.pane[data-lang="${lang}"]`);

  /* ---------- panes ---------- */
  function buildPanes() {
    const tpl = $('#pane-tpl');
    for (const lang of LANGS) {
      const node = tpl.content.firstElementChild.cloneNode(true);
      node.dataset.lang = lang;
      node.lang = lang;
      if (lang === 'km') {
        $('.f-title', node).placeholder = 'ចំណងជើង';
        $('.f-summary', node).placeholder = 'សេចក្តីសង្ខេបខ្លី';
        $('.f-body', node).placeholder = 'សរសេរអត្ថបទនៅទីនេះ…';
      } else {
        $('.f-title', node).placeholder = 'Headline';
        $('.f-summary', node).placeholder = 'One or two sentences';
        $('.f-body', node).placeholder = 'Write the article here…';
      }
      $('#panes').appendChild(node);

      const ta = $('.f-body', node);
      let timer;
      ta.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(() => renderPreview(lang), 250);
      });
      $('.toolbar', node).addEventListener('click', (e) => {
        const b = e.target.closest('button[data-act]');
        if (b) toolbar(lang, b.dataset.act);
      });
    }
    switchTab('en');
  }

  function switchTab(lang) {
    state.tab = lang;
    $$('.tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === lang)));
    LANGS.forEach((l) => (pane(l).hidden = l !== lang));
  }

  async function renderPreview(lang) {
    const md = $('.f-body', pane(lang)).value;
    const box = $('.preview', pane(lang));
    if (!md.trim()) {
      box.innerHTML = '';
      return;
    }
    try {
      const { html } = await api('/api/render', 'POST', { md });
      box.innerHTML = html;
    } catch {
      /* preview is best-effort */
    }
  }

  /* ---------- toolbar ---------- */
  function wrapSel(ta, before, after, placeholder) {
    const s = ta.selectionStart;
    const e = ta.selectionEnd;
    const sel = ta.value.slice(s, e) || placeholder;
    ta.setRangeText(before + sel + after, s, e, 'select');
    ta.setSelectionRange(s + before.length, s + before.length + sel.length);
    ta.focus();
    ta.dispatchEvent(new Event('input'));
  }

  function prefixLines(ta, makePrefix) {
    const s = ta.selectionStart;
    const e = ta.selectionEnd;
    const start = ta.value.lastIndexOf('\n', s - 1) + 1;
    const seg = ta.value.slice(start, e) || '';
    const out = (seg || 'Item').split('\n').map((line, i) => makePrefix(i) + line).join('\n');
    ta.setRangeText(out, start, e, 'end');
    ta.focus();
    ta.dispatchEvent(new Event('input'));
  }

  function toolbar(lang, act) {
    const ta = $('.f-body', pane(lang));
    if (act === 'bold') wrapSel(ta, '**', '**', 'bold text');
    else if (act === 'italic') wrapSel(ta, '_', '_', 'italic text');
    else if (act === 'h2') prefixLines(ta, () => '## ');
    else if (act === 'ul') prefixLines(ta, () => '- ');
    else if (act === 'ol') prefixLines(ta, (i) => `${i + 1}. `);
    else if (act === 'link') wrapSel(ta, '[', '](https://)', 'link text');
    else if (act === 'image') {
      inlineTarget = lang;
      $('#inline-file').click();
    }
  }

  let inlineTarget = 'en';

  /* ---------- images ---------- */
  function readAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(new Error('Could not read the file'));
      r.readAsDataURL(file);
    });
  }

  async function prepareImage(file, maxW = 1600) {
    if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) throw new Error('Please choose a JPG, PNG, WebP or GIF image.');
    if (file.type === 'image/gif') {
      if (file.size > 6 * 1024 * 1024) throw new Error('That GIF is too large (limit about 6 MB).');
      return readAsDataUrl(file);
    }
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, maxW / bmp.width);
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * scale);
    c.height = Math.round(bmp.height * scale);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(bmp, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.86);
  }

  function showCover(src) {
    const img = $('#cover-preview');
    if (src) {
      img.src = src;
      img.hidden = false;
    } else {
      img.removeAttribute('src');
      img.hidden = true;
    }
    $('#cover-empty').hidden = !!src;
    $('#cover-remove').hidden = !src;
  }

  $('#cover-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      state.imageData = await prepareImage(file);
      showCover(state.imageData);
    } catch (err) {
      toast(err.message, true);
    }
  });

  $('#cover-remove').addEventListener('click', () => {
    state.image = '';
    state.imageData = null;
    showCover('');
  });

  $('#inline-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      setBusy(true);
      const data = await prepareImage(file);
      const { path } = await api('/api/upload', 'POST', { data, name: file.name });
      const ta = $('.f-body', pane(inlineTarget));
      const alt = inlineTarget === 'km' ? 'ការពិពណ៌នារូបភាព' : 'Describe the image';
      const md = `\n\n![${alt}](${path})\n\n`;
      const s = ta.selectionStart;
      ta.setRangeText(md, s, ta.selectionEnd, 'end');
      ta.focus();
      ta.dispatchEvent(new Event('input'));
      toast('Image added to the article. Replace the text in [ ] with a short description.');
    } catch (err) {
      toast(err.message, true);
    } finally {
      setBusy(false);
    }
  });

  /* ---------- form <-> data ---------- */
  function fillForm(post) {
    state.slug = post ? post.slug : null;
    state.image = post && post.image ? post.image : '';
    state.imageData = null;

    $('#editor-title').textContent = post ? 'Edit post' : 'New post';
    $('#slug-note').textContent = post ? `/posts/${post.slug}` : '';
    $('#category').value = post && post.category ? post.category : Object.keys(state.site.categories)[0];
    $('#date').value = post && post.date ? post.date : todayIso();
    $('#draft').checked = !!(post && post.draft);
    $('#btn-delete').hidden = !post;
    showCover(state.image);

    for (const l of LANGS) {
      const p = pane(l);
      $('.f-title', p).value = (post && post.title && post.title[l]) || '';
      $('.f-summary', p).value = (post && post.summary && post.summary[l]) || '';
      $('.f-alt', p).value = (post && post.imageAlt && post.imageAlt[l]) || '';
      $('.f-body', p).value = (post && post.body && post.body[l]) || '';
      renderPreview(l);
    }
    $('#log').hidden = true;
  }

  function readForm() {
    const pick = (cls) => Object.fromEntries(LANGS.map((l) => [l, $(cls, pane(l)).value]));
    return {
      slug: state.slug || undefined,
      category: $('#category').value,
      date: $('#date').value,
      draft: $('#draft').checked,
      image: state.image,
      imageData: state.imageData || undefined,
      imageAlt: pick('.f-alt'),
      title: pick('.f-title'),
      summary: pick('.f-summary'),
      body: pick('.f-body'),
    };
  }

  /* ---------- list ---------- */
  const titleOf = (t) => (t && (t.en || t.km)) || '(untitled)';

  async function loadList() {
    const { posts } = await api('/api/posts');
    const ul = $('#list');
    ul.textContent = '';
    if (!posts.length) {
      const li = document.createElement('li');
      li.className = 'muted';
      li.textContent = 'No posts yet.';
      ul.appendChild(li);
      return;
    }
    for (const p of posts) {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.slug = p.slug;
      if (p.slug === state.slug) b.setAttribute('aria-current', 'true');
      const t = document.createElement('span');
      t.className = 't';
      t.textContent = titleOf(p.title);
      if (!p.title.en && p.title.km) t.lang = 'km';
      const s = document.createElement('span');
      s.className = 's';
      s.textContent = p.date;
      if (p.draft) {
        const d = document.createElement('span');
        d.className = 'badge';
        d.textContent = 'Draft';
        s.appendChild(d);
      }
      b.append(t, s);
      li.appendChild(b);
      ul.appendChild(li);
    }
  }

  $('#list').addEventListener('click', async (e) => {
    const b = e.target.closest('button[data-slug]');
    if (!b || state.busy) return;
    try {
      fillForm(await api('/api/posts/' + encodeURIComponent(b.dataset.slug)));
      await loadList();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      toast(err.message, true);
    }
  });

  /* ---------- actions ---------- */
  $('#btn-new').addEventListener('click', async () => {
    fillForm(null);
    switchTab('en');
    await loadList();
    $('.f-title', pane('en')).focus();
  });

  $$('.tabs button').forEach((b) => b.addEventListener('click', () => switchTab(b.dataset.tab)));

  $('#form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (state.busy) return;
    setBusy(true);
    try {
      const res = await api('/api/posts', 'POST', readForm());
      fillForm(await api('/api/posts/' + res.slug));
      await loadList();
      if (res.built === false) toast('Saved, but the preview could not be rebuilt: ' + res.buildError, true);
      else toast('Saved. Check the live preview, then press "Publish to GitHub".');
    } catch (err) {
      toast(err.message, true);
    } finally {
      setBusy(false);
    }
  });

  $('#btn-delete').addEventListener('click', async () => {
    if (!state.slug || state.busy) return;
    if (!confirm('Delete this post? This removes it from the website the next time you publish.')) return;
    setBusy(true);
    try {
      await api('/api/posts/' + encodeURIComponent(state.slug), 'DELETE');
      fillForm(null);
      await loadList();
      toast('Post deleted.');
    } catch (err) {
      toast(err.message, true);
    } finally {
      setBusy(false);
    }
  });

  $('#btn-publish').addEventListener('click', async () => {
    if (state.busy) return;
    const title = titleOf(readForm().title);
    const message = prompt('Describe this update (saved in the Git history):', state.slug ? `Update: ${title}` : 'Update news');
    if (message === null) return;
    setBusy(true);
    const log = $('#log');
    log.hidden = false;
    log.textContent = 'Publishing…';
    try {
      const res = await api('/api/publish', 'POST', { message });
      log.textContent = (res.log || []).join('\n\n') || '(no output)';
      if (res.ok) toast(res.message);
      else {
        log.textContent = res.error + (log.textContent ? '\n\n' + log.textContent : '');
        toast(res.error, true);
      }
    } catch (err) {
      log.textContent = err.message;
      toast(err.message, true);
    } finally {
      setBusy(false);
    }
  });

  /* ---------- init ---------- */
  (async () => {
    try {
      state.site = await api('/api/site');
      const sel = $('#category');
      for (const [key, v] of Object.entries(state.site.categories || {})) {
        const o = document.createElement('option');
        o.value = key;
        o.textContent = `${v.en} / ${v.km}`;
        sel.appendChild(o);
      }
      $('#preview-link').href = `http://localhost:${state.site.previewPort}`;
      buildPanes();
      fillForm(null);
      await loadList();
    } catch (err) {
      toast('Could not start: ' + err.message, true);
    }
  })();
})();
