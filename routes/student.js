// routes/student.js
const express = require('express');
const router = express.Router();
const db = require('../database');
const { requireAuth, requireRole, requireActiveAccount } = require('../middleware/auth');
const { uploader } = require('../utils/upload');

router.use(requireAuth, requireRole('student'), requireActiveAccount);

function getStudentProfile(userId) {
  return db.prepare('SELECT * FROM students WHERE user_id = ?').get(userId);
}

router.get('/dashboard', (req, res) => {
  const profile = getStudentProfile(req.session.user.id);
  const teacher = profile && profile.teacher_id
    ? db.prepare('SELECT full_name, phone, email FROM teachers WHERE user_id = ?').get(profile.teacher_id)
    : null;
  const projects = profile
    ? db.prepare('SELECT * FROM projects WHERE student_id = ? ORDER BY created_at DESC').all(profile.id)
    : [];
  const achievements = profile
    ? db.prepare('SELECT * FROM achievements WHERE student_id = ? ORDER BY created_at DESC').all(profile.id)
    : [];

  res.render('student/dashboard', { profile, teacher, projects, achievements });
});

router.get('/projects/new', (req, res) => {
  const profile = getStudentProfile(req.session.user.id);
  if (!profile || profile.verification_status !== 'confirmed') {
    req.session.flash = { type: 'error', key: 'please_wait_teacher' };
    return res.redirect('/student/dashboard');
  }
  res.render('student/new-project');
});

const projectUpload = uploader('projects').single('media');

router.post('/projects', projectUpload, (req, res) => {
  const profile = getStudentProfile(req.session.user.id);
  if (!profile || profile.verification_status !== 'confirmed') {
    req.session.flash = { type: 'error', key: 'please_wait_teacher' };
    return res.redirect('/student/dashboard');
  }

  const { title, description, category, team_members, funding_goal } = req.body;
  if (!title || !description) {
    req.session.flash = { type: 'error', key: 'error_generic' };
    return res.redirect('/student/projects/new');
  }

  let mediaPath = null, mediaType = null;
  if (req.file) {
    mediaPath = `/uploads/projects/${req.file.filename}`;
    mediaType = req.file.mimetype.startsWith('video') ? 'video' : 'image';
  }

  db.prepare(`
    INSERT INTO projects (student_id, teacher_id, title, description, category, team_members, media_path, media_type, funding_goal, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
  `).run(profile.id, profile.teacher_id, title, description, category || null, team_members || null, mediaPath, mediaType, Number(funding_goal) || 0);

  req.session.flash = { type: 'success', key: 'success_signup' };
  res.redirect('/student/dashboard');
});

router.get('/projects/:id', (req, res) => {
  const profile = getStudentProfile(req.session.user.id);
  const project = db.prepare('SELECT * FROM projects WHERE id = ? AND student_id = ?').get(req.params.id, profile.id);
  if (!project) return res.status(404).render('error', { title: '404', message: 'Project not found' });
  const comments = db.prepare(`
    SELECT comments.*, users.username FROM comments
    JOIN users ON users.id = comments.user_id
    WHERE project_id = ? ORDER BY comments.created_at DESC
  `).all(project.id);
  const likeCount = db.prepare('SELECT COUNT(*) as c FROM likes WHERE project_id = ?').get(project.id).c;
  const pledgeTotal = db.prepare('SELECT COALESCE(SUM(amount),0) as total FROM pledges WHERE project_id = ?').get(project.id).total;
  res.render('student/project-detail', { project, comments, likeCount, pledgeTotal });
});

module.exports = router;
