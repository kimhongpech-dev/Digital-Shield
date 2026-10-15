'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { put } = require('@vercel/blob');
const { POSTS_DIR, PUBLIC } = require('./build');

const MEDIA_RE = /\/uploads\/([A-Za-z0-9][A-Za-z0-9._-]*)/g;
const MIME = {
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

function requireBlobCredentials() {
  if (!process.env.BLOB_READ_WRITE_TOKEN && !(process.env.BLOB_STORE_ID && process.env.VERCEL_OIDC_TOKEN)) {
    throw new Error('Connect a private Blob store, then run `vercel env pull .env.local` before seeding.');
  }
}

async function seed() {
  requireBlobCredentials();
  const uploadDir = path.join(PUBLIC, 'uploads');
  const files = fs.readdirSync(uploadDir).filter((file) => fs.statSync(path.join(uploadDir, file)).isFile());
  for (const file of files) {
    const pathname = `uploads/${file}`;
    await put(pathname, fs.readFileSync(path.join(uploadDir, file)), {
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
    });
  }

  const posts = fs.readdirSync(POSTS_DIR).filter((file) => file.endsWith('.json')).sort();
  for (const file of posts) {
    const post = JSON.parse(fs.readFileSync(path.join(POSTS_DIR, file), 'utf8'));
    if (post.image) post.image = toMediaUrl(post.image);
    for (const lang of ['en', 'km']) {
      if (typeof post.body?.[lang] === 'string') {
        post.body[lang] = post.body[lang].replace(MEDIA_RE, (_match, name) => `/api/media?pathname=${encodeURIComponent(`uploads/${name}`)}`);
      }
    }
    await put(`posts/${file}`, JSON.stringify(post, null, 2), {
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: 'application/json; charset=utf-8',
    });
  }

  console.log(`Seeded ${files.length} image${files.length === 1 ? '' : 's'} and ${posts.length} post${posts.length === 1 ? '' : 's'} to the private Vercel Blob store.`);
}

function toMediaUrl(image) {
  const match = /^\/uploads\/([A-Za-z0-9][A-Za-z0-9._-]*)$/.exec(image);
  if (!match) throw new Error(`Unsupported image path in a post: ${image}`);
  return `/api/media?pathname=${encodeURIComponent(`uploads/${match[1]}`)}`;
}

seed().catch((error) => {
  console.error('Vercel Blob seeding failed:', error.message);
  process.exitCode = 1;
});
