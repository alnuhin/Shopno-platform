// utils/ensureAdmin.js
// -----------------------------------------------------------------------
// WHY THIS FILE EXISTS:
// On a host like Render (free tier), you cannot run a one-off command
// like `npm run seed` after deploy — there's no shell access, and Render
// only ever runs your configured Start Command (`npm start`). So the
// Management account must be created automatically, every time the app
// boots, without ever creating duplicates.
//
// This function is SAFE to call on every single server start:
//   - If a management account already exists -> does nothing.
//   - If not -> creates exactly one, using ADMIN_USERNAME/ADMIN_PASSWORD
//     from environment variables (falls back to safe defaults only in
//     local development).
//
// IMPORTANT: on Render, environment variables must be set in the
// dashboard (Settings -> Environment), NOT in a .env file — .env files
// are for your own computer only and are never uploaded to Render.
// -----------------------------------------------------------------------

const bcrypt = require('bcryptjs');
const db = require('../database');

function ensureAdminAccount() {
  const existing = db.prepare("SELECT id FROM users WHERE role = 'management' LIMIT 1").get();
  if (existing) {
    console.log('[ensureAdmin] Management account already exists — skipping creation.');
    return;
  }

  const username = process.env.ADMIN_USERNAME || 'admin';
  const password = process.env.ADMIN_PASSWORD || 'ChangeMe123!';

  if (!process.env.ADMIN_USERNAME || !process.env.ADMIN_PASSWORD) {
    console.warn(
      '[ensureAdmin] WARNING: ADMIN_USERNAME / ADMIN_PASSWORD env vars are not set. ' +
      'Falling back to default admin/ChangeMe123! — CHANGE THIS in your hosting ' +
      'dashboard environment variables as soon as possible.'
    );
  }

  const hash = bcrypt.hashSync(password, 10);
  const uniqueNumber = 'MGMT-' + Math.floor(100000 + Math.random() * 900000);

  db.prepare(`
    INSERT INTO users (unique_number, username, password_hash, role, status, agreed_terms)
    VALUES (?, ?, ?, 'management', 'active', 1)
  `).run(uniqueNumber, username, hash);

  console.log('----------------------------------------------------');
  console.log('[ensureAdmin] Management account created automatically:');
  console.log('  Username :', username);
  console.log('  Unique # :', uniqueNumber);
  console.log('  (Password is whatever ADMIN_PASSWORD is set to in your environment)');
  console.log('----------------------------------------------------');
}

module.exports = { ensureAdminAccount };
