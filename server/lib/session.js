const crypto = require('crypto');

const COOKIE_NAME = 'js_session';
const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function parseCookies(req) {
  const header = req.headers.cookie;
  const out = {};
  if (!header) return out;
  header.split(';').forEach((part) => {
    const idx = part.indexOf('=');
    if (idx === -1) return;
    const key = part.slice(0, idx).trim();
    const val = decodeURIComponent(part.slice(idx + 1).trim());
    out[key] = val;
  });
  return out;
}

function createSession(db, role, subjectId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + TTL_MS).toISOString();
  db.run('INSERT INTO sessions (token, role, subject_id, expires_at) VALUES (?, ?, ?, ?)', [token, role, subjectId, expiresAt]);
  return { token, expiresAt };
}

function readSession(db, req) {
  const cookies = parseCookies(req);
  const token = cookies[COOKIE_NAME];
  if (!token) return null;
  const row = db.get('SELECT * FROM sessions WHERE token = ?', [token]);
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    db.run('DELETE FROM sessions WHERE token = ?', [token]);
    return null;
  }
  return row;
}

function setSessionCookie(res, token) {
  const maxAge = Math.floor(TTL_MS / 1000);
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; Path=/; Max-Age=${maxAge}; SameSite=Lax`);
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`);
}

function destroySession(db, req) {
  const cookies = parseCookies(req);
  const token = cookies[COOKIE_NAME];
  if (token) db.run('DELETE FROM sessions WHERE token = ?', [token]);
}

function requireRole(db, ...roles) {
  return (req, res, next) => {
    const session = readSession(db, req);
    if (!session || (roles.length && !roles.includes(session.role))) {
      return res.status(401).json({ error: 'Não autenticado.' });
    }
    req.session = session;
    next();
  };
}

module.exports = { createSession, readSession, setSessionCookie, clearSessionCookie, destroySession, requireRole, COOKIE_NAME };
