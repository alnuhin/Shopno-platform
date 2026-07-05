// middleware/auth.js
const db = require('../database');

function attachLocals(req, res, next) {
  res.locals.currentUser = req.session.user || null;
  res.locals.lang = (req.session.user && req.session.user.language) || req.session.lang || 'bn';
  next();
}

function requireAuth(req, res, next) {
  if (!req.session.user) {
    req.session.flash = { type: 'error', key: 'error_generic' };
    return res.redirect('/login');
  }
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.session.user) return res.redirect('/login');
    if (!roles.includes(req.session.user.role)) {
      return res.status(403).send('Forbidden: your account role cannot access this page.');
    }
    next();
  };
}

function requireActiveAccount(req, res, next) {
  const user = req.session.user;
  if (!user) return res.redirect('/login');
  const fresh = db.prepare('SELECT status FROM users WHERE id = ?').get(user.id);
  if (!fresh || fresh.status === 'suspended') {
    req.session.destroy(() => res.redirect('/login'));
    return;
  }
  next();
}

module.exports = { attachLocals, requireAuth, requireRole, requireActiveAccount };
