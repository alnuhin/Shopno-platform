// routes/auth.js
const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const db = require('../database');
const { uploader } = require('../utils/upload');
const { generateOtp, otpExpiry, deliverOtp } = require('../utils/otp');

function makeUniqueNumber(prefix) {
  return `${prefix}-${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 90 + 10)}`;
}

// ---------------------------------------------------------------------
// LOGIN / LOGOUT
// ---------------------------------------------------------------------
router.get('/login', (req, res) => {
  if (req.session.user) return res.redirect(`/${req.session.user.role}/dashboard`);
  res.render('auth/login');
});

router.post('/login', (req, res) => {
  const { identifier, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE username = ? OR unique_number = ?').get(identifier, identifier);

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    req.session.flash = { type: 'error', key: 'error_invalid_login' };
    return res.redirect('/login');
  }

  if (user.status === 'suspended') {
    req.session.flash = { type: 'error', key: 'error_generic' };
    return res.redirect('/login');
  }

  db.prepare('UPDATE users SET last_login_at = datetime(\'now\') WHERE id = ?').run(user.id);

  req.session.user = {
    id: user.id,
    role: user.role,
    username: user.username,
    unique_number: user.unique_number,
    status: user.status,
    language: user.language,
  };

  req.session.save((err) => {
    if (err) {
      console.error('Session save error:', err);
      return res.redirect('/login');
    }
    res.redirect(`/${user.role}/dashboard`);
  });
});
      req.session.flash = { type: 'error', key: 'error_generic' };
      return res.redirect('/login');
    }
    req.session.flash = { type: 'success', key: 'success_login' };
    res.redirect(`/${user.role}/dashboard`);
  });

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

// ---------------------------------------------------------------------
// ROLE PICKER
// ---------------------------------------------------------------------
router.get('/signup', (req, res) => {
  res.render('auth/signup-role');
});

// ---------------------------------------------------------------------
// STUDENT SIGNUP  (multi-section form -> single submit, matches notes:
// Personal Info -> Educational Info -> Parents Info -> Submit Info)
// ---------------------------------------------------------------------
router.get('/signup/student', (req, res) => {
  res.render('auth/signup-student', { old: {} });
});

const studentUpload = uploader('students').fields([
  { name: 'student_photo', maxCount: 1 },
  { name: 'father_photo', maxCount: 1 },
  { name: 'mother_photo', maxCount: 1 },
  { name: 'legal_guardian_photo', maxCount: 1 },
  { name: 'emergency_contact_photo', maxCount: 1 },
  { name: 'nid_front', maxCount: 1 },
  { name: 'nid_back', maxCount: 1 },
]);

router.post('/signup/student', studentUpload, (req, res) => {
  const b = req.body;
  const f = req.files || {};

  if (!b.username || !b.password || !b.first_name || !b.last_name || !b.teacher_contact) {
    req.session.flash = { type: 'error', key: 'error_generic' };
    return res.redirect('/signup/student');
  }
  if (!b.agree_terms) {
    req.session.flash = { type: 'error', key: 'error_generic' };
    return res.redirect('/signup/student');
  }

  const existingUsername = db.prepare('SELECT id FROM users WHERE username = ?').get(b.username);
  if (existingUsername) {
    req.session.flash = { type: 'error', key: 'error_generic' };
    return res.redirect('/signup/student');
  }

  const uniqueNumber = makeUniqueNumber('STU');
  const passwordHash = bcrypt.hashSync(b.password, 10);
  const lang = req.session.lang || 'bn';

  const insertUser = db.prepare(`
    INSERT INTO users (unique_number, username, password_hash, role, language, status, agreed_terms)
    VALUES (?, ?, ?, 'student', ?, 'pending', 1)
  `);
  const userInfo = insertUser.run(uniqueNumber, b.username, passwordHash, lang);
  const userId = userInfo.lastInsertRowid;

  const otp = generateOtp();

  db.prepare(`
    INSERT INTO students (
      user_id, first_name, last_name, dob, birth_certificate_no, gender, religion, photo_path,
      class_level, institution_name, institution_eiin, institution_email, club_activity, club_name,
      father_name, father_occupation, father_nid, father_phone,
      mother_name, mother_occupation, mother_nid, mother_phone,
      is_orphan, legal_guardian_name, legal_guardian_relation, legal_guardian_phone, legal_guardian_nid,
      father_photo_path, mother_photo_path, legal_guardian_photo_path,
      present_address, permanent_address,
      student_phone, student_email, social_media_account, whatsapp_number,
      emergency_contact_name, emergency_contact_phone, emergency_contact_photo_path,
      nid_or_birth_cert_front_path, nid_or_birth_cert_back_path,
      teacher_contact, verification_status, otp_code, otp_expires_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?,
      ?, 'awaiting_teacher', ?, ?
    )
  `).run(
    userId, b.first_name, b.last_name, b.dob || null, b.birth_certificate_no || null, b.gender || null, b.religion || null,
    f.student_photo ? `/uploads/students/${f.student_photo[0].filename}` : null,
    b.class_level || null, b.institution_name || null, b.institution_eiin || null, b.institution_email || null,
    b.club_activity === 'yes' ? 1 : 0, b.club_name || null,
    b.father_name || null, b.father_occupation || null, b.father_nid || null, b.father_phone || null,
    b.mother_name || null, b.mother_occupation || null, b.mother_nid || null, b.mother_phone || null,
    b.is_orphan === 'yes' ? 1 : 0, b.legal_guardian_name || null, b.legal_guardian_relation || null,
    b.legal_guardian_phone || null, b.legal_guardian_nid || null,
    f.father_photo ? `/uploads/students/${f.father_photo[0].filename}` : null,
    f.mother_photo ? `/uploads/students/${f.mother_photo[0].filename}` : null,
    f.legal_guardian_photo ? `/uploads/students/${f.legal_guardian_photo[0].filename}` : null,
    b.present_address || null, b.permanent_address || null,
    b.student_phone || null, b.student_email || null, b.social_media_account || null, b.whatsapp_number || null,
    b.emergency_contact_name || null, b.emergency_contact_phone || null,
    f.emergency_contact_photo ? `/uploads/students/${f.emergency_contact_photo[0].filename}` : null,
    f.nid_front ? `/uploads/students/${f.nid_front[0].filename}` : null,
    f.nid_back ? `/uploads/students/${f.nid_back[0].filename}` : null,
    b.teacher_contact,
    otp, otpExpiry(10)
  );

  // Try to auto-link to an already-registered teacher by phone/email match
  const matchedTeacher = db.prepare(`
    SELECT user_id FROM teachers WHERE phone = ? OR email = ? LIMIT 1
  `).get(b.teacher_contact, b.teacher_contact);
  if (matchedTeacher) {
    db.prepare('UPDATE students SET teacher_id = ? WHERE user_id = ?').run(matchedTeacher.user_id, userId);
  }

  deliverOtp(b.student_phone || b.student_email || b.username, otp);

  req.session.pendingOtp = { userId, role: 'student', otp, destination: b.student_phone || b.student_email };
  res.redirect('/signup/verify-otp');
});

// ---------------------------------------------------------------------
// TEACHER / MENTOR SIGNUP
// ---------------------------------------------------------------------
router.get('/signup/teacher', (req, res) => {
  res.render('auth/signup-teacher');
});

const teacherUpload = uploader('teachers').fields([
  { name: 'teacher_photo', maxCount: 1 },
  { name: 'nid_front', maxCount: 1 },
  { name: 'nid_back', maxCount: 1 },
  { name: 'id_card_front', maxCount: 1 },
  { name: 'id_card_back', maxCount: 1 },
]);

router.post('/signup/teacher', teacherUpload, (req, res) => {
  const b = req.body;
  const f = req.files || {};

  if (!b.username || !b.password || !b.full_name || !b.phone || !b.email || !b.agree_terms) {
    req.session.flash = { type: 'error', key: 'error_generic' };
    return res.redirect('/signup/teacher');
  }

  const existingUsername = db.prepare('SELECT id FROM users WHERE username = ?').get(b.username);
  if (existingUsername) {
    req.session.flash = { type: 'error', key: 'error_generic' };
    return res.redirect('/signup/teacher');
  }

  const uniqueNumber = makeUniqueNumber('TCH');
  const passwordHash = bcrypt.hashSync(b.password, 10);
  const lang = req.session.lang || 'bn';

  const userInfo = db.prepare(`
    INSERT INTO users (unique_number, username, password_hash, role, language, status, agreed_terms)
    VALUES (?, ?, ?, 'teacher', ?, 'pending', 1)
  `).run(uniqueNumber, b.username, passwordHash, lang);
  const userId = userInfo.lastInsertRowid;

  const otp = generateOtp();

  db.prepare(`
    INSERT INTO teachers (
      user_id, full_name, phone, email, photo_path,
      working_place, affiliated_with_institution, club_name, is_teacher_or_mentor,
      graduated_from, graduation_year, graduate_subject, cgpa, publications, about_self,
      nid_number, nid_front_path, nid_back_path, id_card_front_path, id_card_back_path,
      otp_code
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    userId, b.full_name, b.phone, b.email,
    f.teacher_photo ? `/uploads/teachers/${f.teacher_photo[0].filename}` : null,
    b.working_place || null, b.affiliated_with_institution === 'yes' ? 1 : 0, b.club_name || null,
    b.is_teacher_or_mentor || 'teacher',
    b.graduated_from || null, b.graduation_year || null, b.graduate_subject || null, b.cgpa || null,
    b.publications || null, b.about_self || null,
    b.nid_number || null,
    f.nid_front ? `/uploads/teachers/${f.nid_front[0].filename}` : null,
    f.nid_back ? `/uploads/teachers/${f.nid_back[0].filename}` : null,
    f.id_card_front ? `/uploads/teachers/${f.id_card_front[0].filename}` : null,
    f.id_card_back ? `/uploads/teachers/${f.id_card_back[0].filename}` : null,
    otp
  );

  // Link any students who had already typed this teacher's phone/email
  db.prepare(`
    UPDATE students SET teacher_id = ? WHERE (teacher_contact = ? OR teacher_contact = ?) AND teacher_id IS NULL
  `).run(userId, b.phone, b.email);

  deliverOtp(b.phone || b.email, otp);
  req.session.pendingOtp = { userId, role: 'teacher', otp, destination: b.phone || b.email };
  res.redirect('/signup/verify-otp');
});

// ---------------------------------------------------------------------
// DONOR / INVESTOR SIGNUP
// ---------------------------------------------------------------------
router.get('/signup/donor', (req, res) => {
  res.render('auth/signup-donor');
});

const donorUpload = uploader('donors').fields([
  { name: 'profile_photo', maxCount: 1 },
  { name: 'id_photo', maxCount: 1 },
]);

router.post('/signup/donor', donorUpload, (req, res) => {
  const b = req.body;
  const f = req.files || {};

  if (!b.username || !b.password || !b.account_name || !b.full_name || !b.agree_terms) {
    req.session.flash = { type: 'error', key: 'error_generic' };
    return res.redirect('/signup/donor');
  }

  const existingUsername = db.prepare('SELECT id FROM users WHERE username = ?').get(b.username);
  if (existingUsername) {
    req.session.flash = { type: 'error', key: 'error_generic' };
    return res.redirect('/signup/donor');
  }

  const uniqueNumber = makeUniqueNumber('DNR');
  const passwordHash = bcrypt.hashSync(b.password, 10);
  const lang = req.session.lang || 'bn';

  // Donor/investor accounts are active immediately (lower risk), but
  // are flagged for Management review before their pledges are trusted publicly.
  const userInfo = db.prepare(`
    INSERT INTO users (unique_number, username, password_hash, role, language, status, agreed_terms)
    VALUES (?, ?, ?, 'donor', ?, 'active', 1)
  `).run(uniqueNumber, b.username, passwordHash, lang);
  const userId = userInfo.lastInsertRowid;

  db.prepare(`
    INSERT INTO donors (user_id, account_name, full_name, donor_type, phone, email, id_type, id_number, id_photo_path, profile_photo_path)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    userId, b.account_name, b.full_name, b.donor_type || 'donor', b.phone || null, b.email || null,
    b.id_type || null, b.id_number || null,
    f.id_photo ? `/uploads/donors/${f.id_photo[0].filename}` : null,
    f.profile_photo ? `/uploads/donors/${f.profile_photo[0].filename}` : null
  );

  req.session.user = { id: userId, role: 'donor', username: b.username, unique_number: uniqueNumber, status: 'active', language: lang };
  req.session.flash = { type: 'success', key: 'success_signup' };
  res.redirect('/donor/dashboard');
});

// ---------------------------------------------------------------------
// OTP VERIFICATION (shared step for student & teacher signup)
// ---------------------------------------------------------------------
router.get('/signup/verify-otp', (req, res) => {
  if (!req.session.pendingOtp) return res.redirect('/signup');
  res.render('auth/verify-otp', { pending: req.session.pendingOtp });
});

router.post('/signup/verify-otp', (req, res) => {
  const pending = req.session.pendingOtp;
  if (!pending) return res.redirect('/signup');

  const { code } = req.body;
  const table = pending.role === 'student' ? 'students' : 'teachers';
  const record = db.prepare(`SELECT * FROM ${table} WHERE user_id = ?`).get(pending.userId);

  if (!record || record.otp_code !== code) {
    req.session.flash = { type: 'error', key: 'error_generic' };
    return res.redirect('/signup/verify-otp');
  }

  if (pending.role === 'student') {
    db.prepare('UPDATE students SET otp_verified = 1 WHERE user_id = ?').run(pending.userId);
  } else {
    db.prepare('UPDATE teachers SET otp_verified = 1 WHERE user_id = ?').run(pending.userId);
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(pending.userId);
  req.session.user = {
    id: user.id, role: user.role, username: user.username,
    unique_number: user.unique_number, status: user.status, language: user.language,
  };
  delete req.session.pendingOtp;
  req.session.flash = { type: 'success', key: 'success_signup' };

  res.redirect(`/${user.role}/dashboard`);
});
// ---------------------------------------------------------------------
// SECRET MANAGEMENT ADMIN GENERATOR (ONE-TIME RUN)
// ---------------------------------------------------------------------
router.get('/signup/secret-management-admin', (req, res) => {
  try {
    const adminUsername = 'admin';
    
    // Check if admin already exists to prevent duplicate error
    const existingAdmin = db.prepare('SELECT id FROM users WHERE username = ?').get(adminUsername);
    if (existingAdmin) {
      return res.send('Admin account already exists! Please log in using: Username: admin / Password: adminpassword123');
    }

    const uniqueNumber = 'MGT-0001';
    const passwordHash = bcrypt.hashSync('adminpassword123', 10);

    db.prepare(`
      INSERT INTO users (unique_number, username, password_hash, role, language, status, agreed_terms)
      VALUES (?, ?, ?, 'management', 'en', 'active', 1)
    `).run(uniqueNumber, adminUsername, passwordHash);

    res.send('Successfully created Management Admin! Use these credentials to log in: <br><br><b>Username:</b> admin<br><b>Password:</b> adminpassword123<br><b>Unique Number:</b> MGT-0001');
  } catch (error) {
    res.send('Error creating admin: ' + error.message);
  }
});
module.exports = router;
