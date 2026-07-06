// routes/management.js
const path = require('path');
const express = require('express');
const router = express.Router();
const db = require('../database');
const { requireAuth, requireRole, requireActiveAccount } = require('../middleware/auth');

router.use(requireAuth, requireRole('management'), requireActiveAccount);

router.get('/dashboard', (req, res) => {
  const stats = {
    totalStudents: db.prepare("SELECT COUNT(*) c FROM users WHERE role='student'").get().c,
    totalTeachers: db.prepare("SELECT COUNT(*) c FROM users WHERE role='teacher'").get().c,
    totalDonors: db.prepare("SELECT COUNT(*) c FROM users WHERE role='donor'").get().c,
    totalProjects: db.prepare('SELECT COUNT(*) c FROM projects').get().c,
    pendingProjects: db.prepare("SELECT COUNT(*) c FROM projects WHERE status='pending'").get().c,
    approvedProjects: db.prepare("SELECT COUNT(*) c FROM projects WHERE status='approved'").get().c,
    totalPledged: db.prepare('SELECT COALESCE(SUM(amount),0) t FROM pledges').get().t,
  };

  const pendingTeachers = db.prepare(`
    SELECT teachers.*, users.unique_number, users.username, users.status FROM teachers
    JOIN users ON users.id = teachers.user_id
    WHERE teachers.admin_verified = 0
    ORDER BY teachers.created_at DESC
  `).all();

  const pendingDonors = db.prepare(`
    SELECT donors.*, users.unique_number, users.username FROM donors
    JOIN users ON users.id = donors.user_id
    WHERE donors.admin_verified = 0
    ORDER BY donors.created_at DESC
  `).all();

  const recentProjects = db.prepare(`
    SELECT projects.*, students.first_name, students.last_name FROM projects
    JOIN students ON students.id = projects.student_id
    ORDER BY projects.created_at DESC LIMIT 20
  `).all();

  const allUsers = db.prepare(`
    SELECT id, unique_number, username, role, status, created_at FROM users
    WHERE role != 'management'
    ORDER BY created_at DESC LIMIT 50
  `).all();

  res.render('management/dashboard', { stats, pendingTeachers, pendingDonors, recentProjects, allUsers });
});

router.post('/teachers/:userId/verify', (req, res) => {
  db.prepare('UPDATE teachers SET admin_verified = 1 WHERE user_id = ?').run(req.params.userId);
  db.prepare("UPDATE users SET status = 'active' WHERE id = ?").run(req.params.userId);
  logAction(req, 'verify_teacher', `teacher user_id=${req.params.userId}`);
  res.redirect('/management/dashboard');
});

router.post('/donors/:userId/verify', (req, res) => {
  db.prepare('UPDATE donors SET admin_verified = 1 WHERE user_id = ?').run(req.params.userId);
  logAction(req, 'verify_donor', `donor user_id=${req.params.userId}`);
  res.redirect('/management/dashboard');
});

router.post('/users/:userId/suspend', (req, res) => {
  db.prepare("UPDATE users SET status = 'suspended' WHERE id = ?").run(req.params.userId);
  logAction(req, 'suspend_user', `user_id=${req.params.userId}`);
  res.redirect('/management/dashboard');
});

router.post('/users/:userId/activate', (req, res) => {
  db.prepare("UPDATE users SET status = 'active' WHERE id = ?").run(req.params.userId);
  logAction(req, 'activate_user', `user_id=${req.params.userId}`);
  res.redirect('/management/dashboard');
});

router.post('/projects/:projectId/feature', (req, res) => {
  db.prepare("UPDATE projects SET status = 'ongoing' WHERE id = ? AND status = 'approved'").run(req.params.projectId);
  res.redirect('/management/dashboard');
});

// -----------------------------------------------------------------------
// UPLOADS GALLERY — see every photo/video anyone has uploaded, without
// needing shell/file-system access on the hosting platform.
// -----------------------------------------------------------------------
router.get('/uploads', (req, res) => {
  const studentPhotos = db.prepare(`
    SELECT s.id, u.unique_number, s.first_name, s.last_name, s.created_at,
      s.photo_path, s.father_photo_path, s.mother_photo_path,
      s.legal_guardian_photo_path, s.emergency_contact_photo_path,
      s.nid_or_birth_cert_front_path, s.nid_or_birth_cert_back_path
    FROM students s JOIN users u ON u.id = s.user_id
    ORDER BY s.created_at DESC
  `).all();

  const teacherPhotos = db.prepare(`
    SELECT t.id, u.unique_number, t.full_name, t.created_at,
      t.photo_path, t.nid_front_path, t.nid_back_path, t.id_card_front_path, t.id_card_back_path
    FROM teachers t JOIN users u ON u.id = t.user_id
    ORDER BY t.created_at DESC
  `).all();

  const donorPhotos = db.prepare(`
    SELECT d.id, u.unique_number, d.account_name, d.created_at,
      d.profile_photo_path, d.id_photo_path
    FROM donors d JOIN users u ON u.id = d.user_id
    ORDER BY d.created_at DESC
  `).all();

  const projectMedia = db.prepare(`
    SELECT p.id, p.title, p.media_path, p.media_type, p.status, p.created_at,
      s.first_name, s.last_name
    FROM projects p JOIN students s ON s.id = p.student_id
    WHERE p.media_path IS NOT NULL
    ORDER BY p.created_at DESC
  `).all();

  res.render('management/uploads', { studentPhotos, teacherPhotos, donorPhotos, projectMedia });
});

// -----------------------------------------------------------------------
// DATABASE BACKUP DOWNLOAD — lets Management pull the live .db file
// straight from the browser (no shell/SSH access needed on Render etc.)
// so you can inspect it in "DB Browser for SQLite" or keep a dated backup.
// -----------------------------------------------------------------------
router.get('/backup', (req, res) => {
  const dbPath = path.join(__dirname, '..', 'data', 'shopno.db');
  const stamp = new Date().toISOString().slice(0, 10);
  logAction(req, 'download_backup', dbPath);
  res.download(dbPath, `shopno-backup-${stamp}.db`);
});

function logAction(req, action, details) {
  db.prepare('INSERT INTO audit_log (user_id, action, details) VALUES (?, ?, ?)')
    .run(req.session.user.id, action, details);
}

module.exports = router;
