// routes/management.js
const express = require('express');
const router = express.Router();
const db = require('../database');
const fs = require('fs');
const path = require('path');
const { requireAuth, requireRole, requireActiveAccount } = require('../middleware/auth');

router.use(requireAuth, requireRole('management'));

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

  // Fetches recent projects along with their uploaded media references
  const recentProjects = db.prepare(`
    SELECT projects.*, students.first_name, students.last_name FROM projects
    JOIN students ON students.id = projects.student_id
    ORDER BY projects.created_at DESC LIMIT 50
  `).all();

  // Dynamic user list tracking for 10-12 or unlimited live testers
  const allUsers = db.prepare(`
    SELECT id, unique_number, username, role, status, created_at FROM users
    WHERE role != 'management'
    ORDER BY created_at DESC LIMIT 100
  `).all();

  // Reading live raw files from public uploads folder as backup tracking
  const uploadDir = path.join(__dirname, '../public/uploads');
  let uploadedFiles = [];
  if (fs.existsSync(uploadDir)) {
    uploadedFiles = fs.readdirSync(uploadDir).filter(file => file !== '.gitkeep');
  }

  res.render('management/dashboard', { stats, pendingTeachers, pendingDonors, recentProjects, allUsers, uploadedFiles });
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

function logAction(req, action, details) {
  db.prepare('INSERT INTO audit_log (user_id, action, details) VALUES (?, ?, ?)')
    .run(req.session.user.id, action, details);
}

module.exports = router;