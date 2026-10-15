'use strict';

const { readJson, renderMarkdown, requireAdmin, requireJson, sendJson, withErrors } = require('../server/blob');

module.exports = (req, res) =>
  withErrors(req, res, async () => {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return sendJson(res, 405, { error: 'Method not allowed.' });
    }
    requireAdmin(req);
    requireJson(req);
    const { md } = await readJson(req);
    const markdown = String(md || '').slice(0, 200000);
    return sendJson(res, 200, { html: renderMarkdown(markdown) });
  });
