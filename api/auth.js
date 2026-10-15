'use strict';

const crypto = require('node:crypto');
const {
  SESSION_SECONDS,
  allowLoginAttempt,
  authConfigured,
  clearLoginFailures,
  isAdmin,
  readJson,
  recordLoginFailure,
  requireJson,
  sendJson,
  sessionSignature,
  setSessionCookie,
  withErrors,
} = require('../server/blob');

module.exports = (req, res) =>
  withErrors(req, res, async () => {
    if (req.method === 'GET') {
      return sendJson(res, 200, { configured: authConfigured(), authenticated: isAdmin(req) });
    }
    if (req.method === 'POST') {
      requireJson(req);
      if (!authConfigured()) {
        return sendJson(res, 503, {
          error: 'Set ADMIN_PASSWORD (at least 12 characters) and ADMIN_SESSION_SECRET (at least 32 characters) in Vercel.',
        });
      }
      const ip = allowLoginAttempt(req);
      const { password } = await readJson(req);
      const provided = Buffer.from(String(password || ''));
      const expected = Buffer.from(process.env.ADMIN_PASSWORD);
      if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
        recordLoginFailure(ip);
        return sendJson(res, 401, { error: 'Incorrect password.' });
      }
      clearLoginFailures(ip);
      const expiry = String(Date.now() + SESSION_SECONDS * 1000);
      setSessionCookie(res, req, `${expiry}.${sessionSignature(expiry)}`, SESSION_SECONDS);
      return sendJson(res, 200, { authenticated: true });
    }
    if (req.method === 'DELETE') {
      setSessionCookie(res, req, '', 0);
      return sendJson(res, 200, { authenticated: false });
    }
    res.setHeader('Allow', 'GET, POST, DELETE');
    return sendJson(res, 405, { error: 'Method not allowed.' });
  });
