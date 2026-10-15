'use strict';

const { readJson, requireAdmin, requireJson, saveImage, sendJson, withErrors } = require('../server/blob');

module.exports = (req, res) =>
  withErrors(req, res, async () => {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return sendJson(res, 405, { error: 'Method not allowed.' });
    }
    requireAdmin(req);
    requireJson(req);
    const body = await readJson(req);
    const path = await saveImage(body.data, String(body.name || 'image').replace(/\.[a-z0-9]+$/i, ''));
    return sendJson(res, 200, { path });
  });
