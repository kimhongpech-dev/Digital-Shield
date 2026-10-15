#!/usr/bin/env node
'use strict';

/**
 * Local posting tool. Run it on YOUR computer with:  npm run admin
 *
 *   http://localhost:4000  -> the editor (write posts, upload images, publish)
 *   http://localhost:4001  -> live preview of the generated site
 *
 * It only listens on 127.0.0.1, so nobody else on your network can reach it.
 * No dependencies beyond `marked`; no database. Posts are JSON files in content/posts/,
 * images go to public/uploads/, and "Publish" runs git add / commit / push.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const { build, renderMarkdown, ROOT, CONTENT, POSTS_DIR, PUBLIC, DIST } = require('../scripts/build');

const HOST = '127.0.0.1';
const ADMIN_PORT = Number(process.env.ADMIN_PORT) || 4000;
const PREVIEW_PORT = Number(process.env.PREVIEW_PORT) || 4001;
const ADMIN_DIR = __dirname;
const UPLOADS = path.join(PUBLIC, 'uploads');
const FONTS_DIR = path.join(PUBLIC, 'assets', 'fonts');
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_BODY_BYTES = 16 * 1024 * 1024;

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SAFE_IMG = /^\/uploads\/[A-Za-z0-9][A-Za-z0-9._-]*$/;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.woff2': 'font/woff2',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

const ADMIN_CSP =
  "default-src 'self'; img-src 'self' data: blob:; style-src 'self'; script-src 'self'; font-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

/* ---------- small utilities ---------- */

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(body);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) {
        reject(new HttpError(413, 'Request is too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
      } catch {
        reject(new HttpError(400, 'Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function serveFile(res, file, headers = {}) {
  fs.readFile(file, (err, buf) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': buf.length,
      ...headers,
    });
    res.end(buf);
  });
}

/**
 * Block DNS-rebinding and cross-site requests: the Host header must be this
 * exact local address, and anything that changes data must be JSON from our own origin.
 */
function guard(req) {
  const host = String(req.headers.host || '').toLowerCase();
  if (host !== `localhost:${ADMIN_PORT}` && host !== `127.0.0.1:${ADMIN_PORT}`) {
    throw new HttpError(403, 'Forbidden host');
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    if (!String(req.headers['content-type'] || '').startsWith('application/json')) {
      throw new HttpError(415, 'JSON requests only');
    }
    const origin = req.headers.origin;
    if (origin && origin !== `http://${req.headers.host}`) throw new HttpError(403, 'Bad origin');
  }
}

/* ---------- posts ---------- */

function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');
}

function postFile(slug) {
  if (!SLUG_RE.test(String(slug))) throw new HttpError(400, 'Invalid post id');
  return path.join(POSTS_DIR, slug + '.json');
}

function uniqueSlug(base) {
  const root = base || 'post-' + Date.now().toString(36);
  let s = root;
  let i = 2;
  while (fs.existsSync(path.join(POSTS_DIR, s + '.json'))) s = `${root}-${i++}`;
  return s;
}

function cleanBilingual(v) {
  const out = {};
  for (const l of ['en', 'km']) {
    const t = v && typeof v[l] === 'string' ? v[l].replace(/\r\n/g, '\n').trim() : '';
    if (t) out[l] = t;
  }
  return out;
}

function detectImage(buf) {
  if (buf.length > 12 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length > 6 && buf.subarray(0, 4).toString('latin1') === 'GIF8') return 'gif';
  if (buf.length > 12 && buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp';
  return null;
}

function saveImage(dataUrl, hint) {
  const m = /^data:image\/(?:jpeg|png|gif|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m) throw new HttpError(400, 'Unsupported image. Use JPG, PNG, WebP or GIF.');
  const buf = Buffer.from(m[1], 'base64');
  if (buf.length > MAX_IMAGE_BYTES) throw new HttpError(413, 'Image is larger than 8 MB');
  const ext = detectImage(buf);
  if (!ext) throw new HttpError(400, 'That file is not a valid image');
  const hash = crypto.createHash('sha256').update(buf).digest('hex').slice(0, 8);
  const name = `${slugify(hint) || 'image'}-${hash}.${ext}`;
  fs.mkdirSync(UPLOADS, { recursive: true });
  fs.writeFileSync(path.join(UPLOADS, name), buf);
  return '/uploads/' + name;
}

function readPost(slug) {
  const file = postFile(slug);
  if (!fs.existsSync(file)) throw new HttpError(404, 'Post not found');
  return { slug, ...JSON.parse(fs.readFileSync(file, 'utf8')) };
}

function listPosts() {
  if (!fs.existsSync(POSTS_DIR)) return [];
  const rows = [];
  for (const f of fs.readdirSync(POSTS_DIR)) {
    if (!f.endsWith('.json')) continue;
    const slug = f.slice(0, -5);
    try {
      const p = JSON.parse(fs.readFileSync(path.join(POSTS_DIR, f), 'utf8'));
      rows.push({
        slug,
        date: p.date || '',
        category: p.category || '',
        draft: !!p.draft,
        image: p.image || '',
        title: p.title || {},
      });
    } catch {
      rows.push({ slug, date: '', category: '', draft: true, image: '', title: { en: `(unreadable) ${f}` } });
    }
  }
  rows.sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug));
  return rows;
}

function savePost(input) {
  const title = cleanBilingual(input.title);
  if (!title.en && !title.km) throw new HttpError(400, 'Add a title in English or Khmer');
  const body = cleanBilingual(input.body);
  if (!body.en && !body.km) throw new HttpError(400, 'Write the article text');
  const date = String(input.date || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) throw new HttpError(400, 'Pick a valid date');

  let slug = input.slug;
  if (slug) postFile(slug); // validates
  else slug = uniqueSlug(slugify(title.en || ''));

  let image = typeof input.image === 'string' && SAFE_IMG.test(input.image) ? input.image : '';
  if (input.imageData) image = saveImage(input.imageData, slug);

  const post = {
    date,
    category: String(input.category || '').replace(/[^a-z0-9-]/g, '').slice(0, 40),
    draft: !!input.draft,
    image,
    imageAlt: cleanBilingual(input.imageAlt),
    title,
    summary: cleanBilingual(input.summary),
    body,
  };
  if (!post.image) delete post.image;
  if (!Object.keys(post.imageAlt).length) delete post.imageAlt;

  fs.mkdirSync(POSTS_DIR, { recursive: true });
  fs.writeFileSync(postFile(slug), JSON.stringify(post, null, 2) + '\n');
  return slug;
}

function imageStillUsed(img) {
  if (!img) return false;
  return fs
    .readdirSync(POSTS_DIR)
    .filter((f) => f.endsWith('.json'))
    .some((f) => fs.readFileSync(path.join(POSTS_DIR, f), 'utf8').includes(img));
}

function tryBuild() {
  try {
    build();
    return { built: true };
  } catch (e) {
    return { built: false, buildError: e.message };
  }
}

/* ---------- git publish ---------- */

function git(args) {
  return new Promise((resolve) => {
    execFile('git', args, { cwd: ROOT, timeout: 120000, maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
      resolve({ ok: !err, out: `${stdout || ''}${stderr || ''}`.trim(), notFound: err && err.code === 'ENOENT' });
    });
  });
}

async function publish(message) {
  const log = [];
  const step = async (label, args) => {
    const r = await git(args);
    log.push(`$ git ${args.join(' ')}${r.out ? '\n' + r.out : ''}`);
    return { ...r, label };
  };

  const inside = await git(['rev-parse', '--is-inside-work-tree']);
  if (inside.notFound) return { ok: false, error: 'Git is not installed. Install it from https://git-scm.com and try again.', log };
  if (!inside.ok) {
    return { ok: false, error: 'This folder is not a git repository yet. Run "git init" first (see README).', log };
  }
  const remote = await git(['remote']);
  if (!remote.out.trim()) {
    return {
      ok: false,
      error: 'No GitHub remote is set. Run: git remote add origin https://github.com/YOU/REPO.git (see README).',
      log,
    };
  }

  const add = await step('add', ['add', '-A']);
  if (!add.ok) return { ok: false, error: 'git add failed', log };

  const status = await git(['status', '--porcelain']);
  let committed = false;
  if (status.out.trim()) {
    const msg = String(message || 'Update news').replace(/\s+/g, ' ').trim().slice(0, 200) || 'Update news';
    const commit = await step('commit', ['commit', '-m', msg]);
    if (!commit.ok) return { ok: false, error: 'git commit failed (is your git name/email set?)', log };
    committed = true;
  }

  const push = await step('push', ['push', '-u', 'origin', 'HEAD']);
  if (!push.ok) {
    return {
      ok: false,
      error: 'git push failed. Check that you are signed in to GitHub and have access to the repository.',
      log,
    };
  }
  return {
    ok: true,
    message: committed
      ? 'Published. Vercel will deploy the new version in about a minute.'
      : 'Nothing new to commit; pushed any pending commits.',
    log,
  };
}

/* ---------- API ---------- */

async function handleApi(req, res, url) {
  const p = url.pathname;
  const m = req.method;
  let match;

  if (p === '/api/site' && m === 'GET') {
    const site = JSON.parse(fs.readFileSync(path.join(CONTENT, 'site.json'), 'utf8'));
    return sendJson(res, 200, { ...site, previewPort: PREVIEW_PORT });
  }
  if (p === '/api/posts' && m === 'GET') return sendJson(res, 200, { posts: listPosts() });

  if (p === '/api/posts' && m === 'POST') {
    const slug = savePost(await readJson(req));
    return sendJson(res, 200, { slug, ...tryBuild() });
  }

  if ((match = /^\/api\/posts\/([a-z0-9-]+)$/.exec(p))) {
    const slug = match[1];
    if (m === 'GET') return sendJson(res, 200, readPost(slug));
    if (m === 'DELETE') {
      const post = readPost(slug);
      fs.unlinkSync(postFile(slug));
      let removedImage = false;
      if (post.image && SAFE_IMG.test(post.image) && !imageStillUsed(post.image)) {
        try {
          fs.unlinkSync(path.join(UPLOADS, path.basename(post.image)));
          removedImage = true;
        } catch {}
      }
      return sendJson(res, 200, { deleted: slug, removedImage, ...tryBuild() });
    }
  }

  if (p === '/api/upload' && m === 'POST') {
    const body = await readJson(req);
    return sendJson(res, 200, { path: saveImage(body.data, String(body.name || 'image').replace(/\.[a-z0-9]+$/i, '')) });
  }

  if (p === '/api/render' && m === 'POST') {
    const body = await readJson(req);
    return sendJson(res, 200, { html: renderMarkdown(String(body.md || '').slice(0, 200000)) });
  }

  if (p === '/api/publish' && m === 'POST') {
    const body = await readJson(req);
    const built = tryBuild();
    if (!built.built) return sendJson(res, 200, { ok: false, error: 'Build failed: ' + built.buildError, log: [] });
    return sendJson(res, 200, await publish(body.message));
  }

  throw new HttpError(404, 'Unknown API route');
}

/* ---------- servers ---------- */

const adminServer = http.createServer(async (req, res) => {
  try {
    guard(req);
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Method not allowed');

    const headers = {
      'Content-Security-Policy': ADMIN_CSP,
      'X-Frame-Options': 'DENY',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Cache-Control': 'no-store',
    };
    const staticMap = {
      '/': 'index.html',
      '/admin.css': 'admin.css',
      '/admin.js': 'admin.js',
      '/admin/admin.css': 'admin.css',
      '/admin/admin.js': 'admin.js',
    };
    if (staticMap[url.pathname]) return serveFile(res, path.join(ADMIN_DIR, staticMap[url.pathname]), headers);

    let m;
    if ((m = /^\/fonts\/([a-z0-9-]+\.woff2)$/.exec(url.pathname))) return serveFile(res, path.join(FONTS_DIR, m[1]), headers);
    if ((m = /^\/uploads\/([A-Za-z0-9][A-Za-z0-9._-]*)$/.exec(url.pathname))) return serveFile(res, path.join(UPLOADS, m[1]), headers);
    throw new HttpError(404, 'Not found');
  } catch (e) {
    const status = e.status || 500;
    if (status >= 500) console.error(e);
    if (!res.headersSent) sendJson(res, status, { error: status >= 500 ? 'Something went wrong' : e.message });
    else res.end();
  }
});

function resolveDist(pathname) {
  let p;
  try {
    p = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  const base = path.resolve(DIST);
  const target = path.resolve(base, '.' + p);
  if (target !== base && !target.startsWith(base + path.sep)) return null;
  for (const c of [target, target + '.html', path.join(target, 'index.html')]) {
    try {
      if (fs.statSync(c).isFile()) return c;
    } catch {}
  }
  return null;
}

const previewServer = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405);
    return res.end();
  }
  const url = new URL(req.url, 'http://localhost');
  const file = resolveDist(url.pathname);
  if (file) return serveFile(res, file, { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  const nf = path.join(DIST, '404.html');
  fs.readFile(nf, (err, buf) => {
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(err ? 'Not found' : buf);
  });
});

function listen(server, port, label) {
  return new Promise((resolve) => {
    server.once('error', (e) => {
      if (e.code === 'EADDRINUSE') {
        console.error(`\nPort ${port} is already in use (${label}). Close the other program, or run with another port, e.g.\n  ADMIN_PORT=4100 PREVIEW_PORT=4101 npm run admin\n`);
      } else {
        console.error(e);
      }
      process.exit(1);
    });
    server.listen(port, HOST, resolve);
  });
}

(async () => {
  const b = tryBuild();
  if (!b.built) console.warn('Initial build failed: ' + b.buildError);
  await listen(adminServer, ADMIN_PORT, 'editor');
  await listen(previewServer, PREVIEW_PORT, 'preview');
  console.log('\nDigital Shield posting tool is running.\n');
  console.log(`  Editor : http://localhost:${ADMIN_PORT}`);
  console.log(`  Preview: http://localhost:${PREVIEW_PORT}\n`);
  console.log('Press Ctrl+C to stop.\n');
})();
