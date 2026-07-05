// routes/donor.js
const express = require('express');
const router = express.Router();
const db = require('../database');
const { requireAuth, requireRole, requireActiveAccount } = require('../middleware/auth');

router.use(requireAuth, requireRole('donor'), requireActiveAccount);

function getDonorProfile(userId) {
  return db.prepare('SELECT * FROM donors WHERE user_id = ?').get(userId);
}

router.get('/dashboard', (req, res) => {
  const profile = getDonorProfile(req.session.user.id);

  const projects = db.prepare(`
    SELECT projects.*, students.first_name, students.last_name, students.institution_name,
      (SELECT COUNT(*) FROM likes WHERE likes.project_id = projects.id) as like_count,
      (SELECT COUNT(*) FROM comments WHERE comments.project_id = projects.id) as comment_count,
      (SELECT COALESCE(SUM(amount),0) FROM pledges WHERE pledges.project_id = projects.id) as pledged_total,
      (SELECT COUNT(*) FROM likes WHERE likes.project_id = projects.id AND likes.user_id = ?) as liked_by_me
    FROM projects
    JOIN students ON students.id = projects.student_id
    WHERE projects.status IN ('approved','ongoing')
    ORDER BY projects.created_at DESC
  `).all(req.session.user.id);

  const myPledges = db.prepare(`
    SELECT pledges.*, projects.title FROM pledges
    JOIN projects ON projects.id = pledges.project_id
    WHERE pledges.donor_id = ? ORDER BY pledges.created_at DESC
  `).all(profile.id);

  res.render('donor/feed', { profile, projects, myPledges });
});

router.get('/projects/:id/comments', (req, res) => {
  const comments = db.prepare(`
    SELECT comments.*, users.username FROM comments
    JOIN users ON users.id = comments.user_id
    WHERE project_id = ? ORDER BY comments.created_at DESC
  `).all(req.params.id);
  res.json(comments);
});

router.post('/projects/:id/like', (req, res) => {
  const projectId = req.params.id;
  const existing = db.prepare('SELECT id FROM likes WHERE project_id = ? AND user_id = ?')
    .get(projectId, req.session.user.id);

  if (existing) {
    db.prepare('DELETE FROM likes WHERE id = ?').run(existing.id);
  } else {
    db.prepare('INSERT INTO likes (project_id, user_id) VALUES (?, ?)').run(projectId, req.session.user.id);
  }
  res.redirect('/donor/dashboard');
});

router.post('/projects/:id/comment', (req, res) => {
  const { body } = req.body;
  if (body && body.trim()) {
    db.prepare('INSERT INTO comments (project_id, user_id, body) VALUES (?, ?, ?)')
      .run(req.params.id, req.session.user.id, body.trim());
  }
  res.redirect('/donor/dashboard');
});

// -----------------------------------------------------------------------
// DONATE (STUB): this records the donor's *intent* to donate a specific
// amount to a specific project. It does NOT move any real money -
// there is no payment gateway wired up. See README "Payments" section
// for what you would need to add (bKash/Nagad/Rocket merchant API,
// or Stripe for card payments) to make this real.
// -----------------------------------------------------------------------
router.post('/projects/:id/donate', (req, res) => {
  const profile = getDonorProfile(req.session.user.id);
  const amount = Number(req.body.amount);
  if (!amount || amount <= 0) {
    req.session.flash = { type: 'error', key: 'error_generic' };
    return res.redirect('/donor/dashboard');
  }

  db.prepare(`
    INSERT INTO pledges (project_id, donor_id, amount, message, status)
    VALUES (?, ?, ?, ?, 'recorded')
  `).run(req.params.id, profile.id, amount, req.body.message || null);

  req.session.flash = { type: 'success', key: 'donate' };
  res.redirect('/donor/dashboard');
});

module.exports = router;
