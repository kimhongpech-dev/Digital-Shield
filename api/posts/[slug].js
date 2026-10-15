'use strict';

const {
  deletePost,
  renderPost,
  requireAdmin,
  sendJson,
  withErrors,
} = require('../../server/blob');

module.exports = (req, res) =>
  withErrors(req, res, async () => {
    const slug = String(req.query.slug || '');
    if (req.method === 'GET') return sendJson(res, 200, await renderPost(slug, req));
    if (req.method === 'DELETE') {
      requireAdmin(req);
      await deletePost(slug);
      return sendJson(res, 200, { deleted: slug });
    }
    res.setHeader('Allow', 'GET, DELETE');
    return sendJson(res, 405, { error: 'Method not allowed.' });
  });
