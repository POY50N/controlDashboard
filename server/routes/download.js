const fs = require('fs');
const path = require('path');
const express = require('express');
const { readSession, requireRole } = require('../lib/session');

const DIST_DIR = path.join(__dirname, '..', '..', 'dist');

// Finds the built Windows executable without hard-coding the version number,
// so a new `npm run dist` is picked up automatically.
function findWindowsBuild() {
  if (!fs.existsSync(DIST_DIR)) return null;
  const exe = fs.readdirSync(DIST_DIR).filter((f) => f.toLowerCase().endsWith('.exe')).sort().pop();
  return exe ? path.join(DIST_DIR, exe) : null;
}

module.exports = function downloadRoutes(db) {
  const router = express.Router();

  // Tells the page what this visitor may download. The desktop app is an
  // administration tool, so only the lawyer's account sees/gets it.
  router.get('/status', (req, res) => {
    const session = readSession(db, req);
    const isAdmin = !!session && session.role === 'admin';
    const exe = isAdmin ? findWindowsBuild() : null;
    res.json({
      isAdmin,
      windows: isAdmin
        ? (exe
            ? { allowed: true, available: true, filename: path.basename(exe), sizeMb: +(fs.statSync(exe).size / 1048576).toFixed(1) }
            : { allowed: true, available: false })
        : { allowed: false }
    });
  });

  // Enforced server-side: hiding the button would not be enough.
  router.get('/windows', requireRole(db, 'admin'), (req, res) => {
    const exe = findWindowsBuild();
    if (!exe) {
      return res.status(404).json({
        error: 'O instalador para Windows ainda não foi gerado. Rode "npm run dist" para criar o executável.'
      });
    }
    res.download(exe, path.basename(exe));
  });

  return router;
};
