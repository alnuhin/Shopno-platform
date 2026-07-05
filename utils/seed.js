// utils/seed.js
// Run once with: npm run seed
// Creates the single default Management account. Management accounts are
// never created through the public signup form (see notes: only
// Student / Teacher-Mentor / Donor-Investor sign up publicly).

require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('../database');

const username = process.env.ADMIN_USERNAME || 'admin';
const password = process.env.ADMIN_PASSWORD || 'ChangeMe123!';

const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
if (existing) {
  console.log(`Management account "${username}" already exists. Nothing to do.`);
  process.exit(0);
}

const hash = bcrypt.hashSync(password, 10);
const uniqueNumber = 'MGMT-' + Math.floor(100000 + Math.random() * 900000);

db.prepare(`
  INSERT INTO users (unique_number, username, password_hash, role, status, agreed_terms)
  VALUES (?, ?, ?, 'management', 'active', 1)
`).run(uniqueNumber, username, hash);

console.log('----------------------------------------------------');
console.log('Management (admin) account created:');
console.log('  Username :', username);
console.log('  Password :', password);
console.log('  Unique # :', uniqueNumber);
console.log('Log in at /login with the username & password above.');
console.log('----------------------------------------------------');
