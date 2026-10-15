'use strict';

const { streamMedia, withErrors } = require('../server/blob');

module.exports = (req, res) =>
  withErrors(req, res, async () => {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      res.writeHead(405);
      return res.end();
    }
    await streamMedia(req, res);
  });
