// routes/teacher.js
const express = require('express');
const router = express.Router();
const db = require('../database');
const { requireAuth, requireRole, requireActiveAccount } = require('../middleware/auth');

router.use(requireAuth, requireRole('teacher'), requireActiveAccount);

function getTeacherProfile(userId) {
  return db.prepare('SELECT * FROM teachers WHERE user_id = ?').get(userId);
}

router.get('/dashboard', (req, res) => {
  const profile = getTeacherProfile(req.session.user.id);
  const pendingStudents = db.prepare(`
    SELECT students.*, users.unique_number FROM students
    JOIN users ON users.id = students.user_id
    WHERE students.teacher_id = ? AND students.verification_status = 'awaiting_teacher'
    ORDER BY students.created_at DESC
  `).all(req.session.user.id);

  const confirmedStudents = db.prepare(`
    SELECT students.*, users.unique_number FROM students
    JOIN users ON users.id = students.user_id
    WHERE students.teacher_id = ? AND students.verification_status = 'confirmed'
    ORDER BY students.created_at DESC
  `).all(req.session.user.id);

  const pendingProjects = db.prepare(`
    SELECT projects.*, students.first_name, students.last_name FROM projects
    JOIN students ON students.id = projects.student_id
    WHERE projects.teacher_id = ? AND projects.status = 'pending'
    ORDER BY projects.created_at DESC
  `).all(req.session.user.id);

  res.render('teacher/dashboard', { profile, pendingStudents, confirmedStudents, pendingProjects });
});

router.post('/students/:studentId/confirm', (req, res) => {
  const student = db.prepare('SELECT * FROM students WHERE id = ? AND teacher_id = ?')
    .get(req.params.studentId, req.session.user.id);
  if (!student) return res.status(404).render('error', { title: '404', message: 'Student not found' });

  db.prepare("UPDATE students SET verification_status = 'confirmed' WHERE id = ?").run(student.id);
  db.prepare("UPDATE users SET status = 'active' WHERE id = ?").run(student.user_id);

  req.session.flash = { type: 'success', key: 'confirm' };
  res.redirect('/teacher/dashboard');
});

router.post('/students/:studentId/reject', (req, res) => {
  const student = db.prepare('SELECT * FROM students WHERE id = ? AND teacher_id = ?')
    .get(req.params.studentId, req.session.user.id);
  if (!student) return res.status(404).render('error', { title: '404', message: 'Student not found' });

  db.prepare("UPDATE students SET verification_status = 'rejected' WHERE id = ?").run(student.id);
  db.prepare("UPDATE users SET status = 'rejected' WHERE id = ?").run(student.user_id);

  req.session.flash = { type: 'success', key: 'reject' };
  res.redirect('/teacher/dashboard');
});

router.post('/projects/:projectId/approve', (req, res) => {
  const project = db.prepare('SELECT * FROM projects WHERE id = ? AND teacher_id = ?')
    .get(req.params.projectId, req.session.user.id);
  if (!project) return res.status(404).render('error', { title: '404', message: 'Project not found' });

  db.prepare("UPDATE projects SET status = 'approved', teacher_note = ? WHERE id = ?")
    .run(req.body.note || null, project.id);
  req.session.flash = { type: 'success', key: 'approved' };
  res.redirect('/teacher/dashboard');
});

router.post('/projects/:projectId/reject', (req, res) => {
  const project = db.prepare('SELECT * FROM projects WHERE id = ? AND teacher_id = ?')
    .get(req.params.projectId, req.session.user.id);
  if (!project) return res.status(404).render('error', { title: '404', message: 'Project not found' });

  db.prepare("UPDATE projects SET status = 'rejected', teacher_note = ? WHERE id = ?")
    .run(req.body.note || null, project.id);
  req.session.flash = { type: 'success', key: 'rejected' };
  res.redirect('/teacher/dashboard');
});

router.post('/students/:studentId/achievement', (req, res) => {
  const student = db.prepare('SELECT * FROM students WHERE id = ? AND teacher_id = ?')
    .get(req.params.studentId, req.session.user.id);
  if (!student) return res.status(404).render('error', { title: '404', message: 'Student not found' });

  const { category, points, note } = req.body;
  db.prepare(`
    INSERT INTO achievements (student_id, given_by, category, points, note)
    VALUES (?, ?, ?, ?, ?)
  `).run(student.id, req.session.user.id, category, Number(points) || 1, note || null);

  res.redirect('/teacher/dashboard');
});

module.exports = router;
