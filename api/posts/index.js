'use strict';

const {
  allPosts,
  isAdmin,
  readJson,
  requireAdmin,
  requireJson,
  rowForAdmin,
  savePost,
  site,
  sendJson,
  withErrors,
} = require('../../server/blob');
const { renderCard } = require('../../scripts/build');

module.exports = (req, res) =>
  withErrors(req, res, async () => {
    if (req.method === 'GET') {
      const posts = await allPosts();
      const admin = isAdmin(req);
      const published = posts.filter((post) => !post.draft);
      const visible = admin ? posts : published;
      return sendJson(res, 200, {
        posts: visible.map((post) => rowForAdmin(post)),
        cardsHtml: published.map((post, index) => renderCard(site, post, index === 0 && published.length > 2)).join('\n'),
      });
    }
    if (req.method === 'POST') {
      requireAdmin(req);
      requireJson(req);
      const slug = await savePost(await readJson(req));
      return sendJson(res, 200, { slug, saved: true });
    }
    res.setHeader('Allow', 'GET, POST');
    return sendJson(res, 405, { error: 'Method not allowed.' });
  });
