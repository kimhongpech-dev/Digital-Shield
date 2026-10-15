'use strict';

const crypto = require('node:crypto');
const { Readable } = require('node:stream');
const { del, get, list, put } = require('@vercel/blob');
const site = require('../content/site.json');
const {
  renderMarkdown,
  renderPostContent,
} = require('../scripts/build');

const SESSION_COOKIE = 'digital_shield_admin';
const SESSION_SECONDS = 12 * 60 * 60;
const MAX_JSON_BYTES = 4 * 1024 * 1024;
const MAX_IMAGE_BYTES = Math.floor(2.5 * 1024 * 1024);
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MEDIA_RE = /^uploads\/[A-Za-z0-9][A-Za-z0-9._-]*$/;
const loginAttempts = new Map();

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function sendJson(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store, max-age=0',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(JSON.stringify(data));
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_JSON_BYTES) throw new HttpError(413, 'Request is too large');
    chunks.push(chunk);
  }
  try {
    return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
  } catch {
    throw new HttpError(400, 'Invalid JSON');
  }
}

function requireJson(req) {
  if (!String(req.headers['content-type'] || '').startsWith('application/json')) {
    throw new HttpError(415, 'JSON requests only');
  }
}

function verifySameOrigin(req) {
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  const proto = String(req.headers['x-forwarded-proto'] || (process.env.VERCEL ? 'https' : 'http'))
    .split(',')[0]
    .trim();
  if (!host || req.headers.origin !== `${proto}://${host}`) {
    throw new HttpError(403, 'Request origin is not allowed');
  }
}

function authConfigured() {
  return (
    typeof process.env.ADMIN_PASSWORD === 'string' &&
    process.env.ADMIN_PASSWORD.length >= 12 &&
    typeof process.env.ADMIN_SESSION_SECRET === 'string' &&
    process.env.ADMIN_SESSION_SECRET.length >= 32
  );
}

function cookieValue(req, name) {
  const part = String(req.headers.cookie || '')
    .split(';')
    .map((value) => value.trim())
    .find((value) => value.startsWith(`${name}=`));
  return part ? part.slice(name.length + 1) : '';
}

function sessionSignature(expiry) {
  return crypto.createHmac('sha256', process.env.ADMIN_SESSION_SECRET).update(expiry).digest('hex');
}

function isAdmin(req) {
  if (!authConfigured()) return false;
  const [expiry, signature, extra] = cookieValue(req, SESSION_COOKIE).split('.');
  if (!expiry || !signature || extra || !/^\d+$/.test(expiry) || Number(expiry) <= Date.now()) return false;
  const expected = Buffer.from(sessionSignature(expiry), 'hex');
  const provided = Buffer.from(signature, 'hex');
  return expected.length === provided.length && crypto.timingSafeEqual(expected, provided);
}

function requireAdmin(req) {
  if (!authConfigured()) {
    throw new HttpError(503, 'Admin login is not configured. Set ADMIN_PASSWORD and ADMIN_SESSION_SECRET in Vercel.');
  }
  if (!isAdmin(req)) throw new HttpError(401, 'Please sign in again.');
}

function setSessionCookie(res, req, value, maxAge) {
  const secure = process.env.VERCEL || req.headers['x-forwarded-proto'] === 'https';
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=${encodeURIComponent(value)}; Max-Age=${maxAge}; Path=/; HttpOnly; SameSite=Strict${secure ? '; Secure' : ''}`
  );
}

function allowLoginAttempt(req) {
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
  const now = Date.now();
  const current = loginAttempts.get(ip);
  if (current && current.until > now && current.count >= 10) {
    throw new HttpError(429, 'Too many sign-in attempts. Try again in 15 minutes.');
  }
  if (!current || current.until <= now) loginAttempts.set(ip, { count: 0, until: now + 15 * 60 * 1000 });
  return ip;
}

function recordLoginFailure(ip) {
  const entry = loginAttempts.get(ip) || { count: 0, until: Date.now() + 15 * 60 * 1000 };
  entry.count++;
  loginAttempts.set(ip, entry);
}

function clearLoginFailures(ip) {
  loginAttempts.delete(ip);
}

async function withErrors(req, res, callback) {
  try {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) verifySameOrigin(req);
    await callback();
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    if (status >= 500) console.error(error);
    if (!res.headersSent) sendJson(res, status, { error: status >= 500 ? 'Something went wrong. Check the Vercel function logs.' : error.message });
    else res.destroy(error);
  }
}

async function listPaths(prefix) {
  const paths = [];
  let cursor;
  let hasMore = true;
  while (hasMore) {
    const result = await list({ prefix, cursor, limit: 1000 });
    paths.push(...result.blobs.map((blob) => blob.pathname));
    cursor = result.cursor;
    hasMore = result.hasMore;
  }
  return paths;
}

async function readBlob(pathname) {
  const result = await get(pathname, { access: 'private', useCache: false });
  if (!result || result.statusCode !== 200) throw new HttpError(404, 'Post not found.');
  const response = new Response(result.stream);
  if (!response.ok) throw new Error(`Could not read ${pathname} from Vercel Blob.`);
  return response.json();
}

async function allPosts() {
  const paths = await listPaths('posts/');
  const posts = await Promise.all(
    paths
      .filter((pathname) => /^posts\/[a-z0-9-]+\.json$/.test(pathname))
      .map(async (pathname) => {
        const slug = pathname.slice('posts/'.length, -'.json'.length);
        const post = await readBlob(pathname);
        return { ...post, slug };
      })
  );
  return posts.sort((a, b) => String(b.date).localeCompare(String(a.date)) || a.slug.localeCompare(b.slug));
}

async function postBySlug(slug) {
  if (!SLUG_RE.test(String(slug || ''))) throw new HttpError(404, 'Post not found.');
  return { ...(await readBlob(`posts/${slug}.json`)), slug };
}

function rowForAdmin(post) {
  return {
    slug: post.slug,
    date: post.date || '',
    category: post.category || '',
    draft: !!post.draft,
    image: post.image || '',
    title: post.title || {},
  };
}

function mediaUrl(pathname) {
  return `/api/media?pathname=${encodeURIComponent(pathname)}`;
}

function mediaPath(value) {
  if (!value) return '';
  const pathname = parseMediaPath(value);
  if (!pathname) throw new HttpError(400, 'Invalid image path.');
  return mediaUrl(pathname);
}

function parseMediaPath(value) {
  try {
    const url = new URL(String(value), 'https://digital-shield.invalid');
    let pathname = null;
    if (url.pathname === '/api/media') pathname = url.searchParams.get('pathname');
    else if (url.pathname.startsWith('/uploads/')) pathname = `uploads/${url.pathname.slice('/uploads/'.length)}`;
    return pathname && MEDIA_RE.test(pathname) ? pathname : null;
  } catch {
    return null;
  }
}

function postReferencesMedia(post, pathname) {
  if (parseMediaPath(post.image) === pathname) return true;
  for (const value of Object.values(post.body || {})) {
    if (typeof value !== 'string') continue;
    const references = value.matchAll(/\/api\/media\?pathname=([^\s)"'<>]+)/g);
    for (const [, reference] of references) {
      if (parseMediaPath(`/api/media?pathname=${reference}`) === pathname) return true;
    }
  }
  return false;
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');
}

function cleanBilingual(value) {
  const result = {};
  for (const lang of ['en', 'km']) {
    const text = value && typeof value[lang] === 'string' ? value[lang].replace(/\r\n/g, '\n').trim() : '';
    if (text) result[lang] = text;
  }
  return result;
}

function validImage(buffer) {
  if (buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg';
  if (buffer.length > 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buffer.length > 6 && buffer.subarray(0, 4).toString('latin1') === 'GIF8') return 'gif';
  if (buffer.length > 12 && buffer.subarray(0, 4).toString('latin1') === 'RIFF' && buffer.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp';
  return '';
}

async function saveImage(dataUrl, hint) {
  const match = /^data:image\/(?:jpeg|png|gif|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!match) throw new HttpError(400, 'Unsupported image. Use JPG, PNG, WebP or GIF.');
  const buffer = Buffer.from(match[1], 'base64');
  if (buffer.length > MAX_IMAGE_BYTES) throw new HttpError(413, 'Image is larger than 2.5 MB after resizing.');
  const extension = validImage(buffer);
  if (!extension) throw new HttpError(400, 'That file is not a valid image.');
  const hash = crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 12);
  const pathname = `uploads/${slugify(hint) || 'image'}-${hash}.${extension}`;
  const contentType = { jpg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp' }[extension];
  await put(pathname, buffer, {
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType,
  });
  return mediaUrl(pathname);
}

async function savePost(input) {
  const title = cleanBilingual(input.title);
  if (!title.en && !title.km) throw new HttpError(400, 'Add a title in English or Khmer.');
  const body = cleanBilingual(input.body);
  if (!body.en && !body.km) throw new HttpError(400, 'Write the article text.');
  const date = String(input.date || '');
  const parsedDate = new Date(`${date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date) {
    throw new HttpError(400, 'Pick a valid date.');
  }

  const posts = await allPosts();
  let slug = input.slug;
  if (slug && !SLUG_RE.test(String(slug))) throw new HttpError(400, 'Invalid post id.');
  if (!slug) {
    const root = slugify(title.en) || `post-${Date.now().toString(36)}`;
    slug = root;
    let suffix = 2;
    while (posts.some((post) => post.slug === slug)) slug = `${root}-${suffix++}`;
  } else if (!posts.some((post) => post.slug === slug)) {
    throw new HttpError(404, 'Post not found.');
  }

  let image = mediaPath(input.image);
  if (input.imageData) image = await saveImage(input.imageData, slug);
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
  await put(`posts/${slug}.json`, JSON.stringify(post, null, 2), {
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json; charset=utf-8',
  });
  return slug;
}

async function renderPost(slug, req) {
  const post = await postBySlug(slug);
  const admin = isAdmin(req);
  if (post.draft && !admin) throw new HttpError(404, 'Post not found.');
  const posts = (await allPosts()).filter((item) => !item.draft);
  const visiblePost = posts.find((item) => item.slug === slug) || post;
  const rendered = renderPostContent(site, visiblePost, posts);
  return {
    post,
    mainHtml: rendered.main,
    titles: rendered.titles,
    descriptions: rendered.descriptions,
  };
}

async function streamMedia(req, res) {
  const url = new URL(req.url, `https://${req.headers.host || 'localhost'}`);
  const pathname = url.searchParams.get('pathname') || '';
  if (!MEDIA_RE.test(pathname)) throw new HttpError(404, 'Image not found.');
  const posts = await allPosts();
  const available = isAdmin(req) || posts.some((post) => !post.draft && postReferencesMedia(post, pathname));
  if (!available) throw new HttpError(404, 'Image not found.');
  const result = await get(pathname, { access: 'private', useCache: false });
  if (!result || result.statusCode !== 200) throw new HttpError(404, 'Image not found.');
  res.writeHead(200, {
    'Content-Type': result.blob.contentType || 'application/octet-stream',
    'Cache-Control': 'public, max-age=31536000, immutable',
    'X-Content-Type-Options': 'nosniff',
    'Content-Disposition': 'inline',
  });
  Readable.fromWeb(result.stream).on('error', (error) => {
    console.error(error);
    res.destroy(error);
  }).pipe(res);
}

async function deletePost(slug) {
  if (!SLUG_RE.test(String(slug || ''))) throw new HttpError(400, 'Invalid post id.');
  await postBySlug(slug);
  await del(`posts/${slug}.json`);
}

module.exports = {
  HttpError,
  MAX_JSON_BYTES,
  SESSION_COOKIE,
  SESSION_SECONDS,
  site,
  allPosts,
  allowLoginAttempt,
  authConfigured,
  clearLoginFailures,
  deletePost,
  isAdmin,
  listPaths,
  mediaPath,
  mediaUrl,
  postBySlug,
  readJson,
  readBlob,
  recordLoginFailure,
  renderMarkdown,
  renderPost,
  requireAdmin,
  requireJson,
  rowForAdmin,
  saveImage,
  savePost,
  sendJson,
  sessionSignature,
  setSessionCookie,
  streamMedia,
  withErrors,
};
