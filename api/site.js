'use strict';

const { sendJson, site, withErrors } = require('../server/blob');

module.exports = (req, res) =>
  withErrors(req, res, async () => {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return sendJson(res, 405, { error: 'Method not allowed.' });
    }
    return sendJson(res, 200, site);
  });
