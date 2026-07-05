// server.js
require('dotenv').config();
const path = require('path');
const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);

const { attachLocals } = require('./middleware/auth');
const { t } = require('./utils/i18n');

const authRoutes = require('./routes/auth');
const studentRoutes = require('./routes/student');
const teacherRoutes = require('./routes/teacher');
const donorRoutes = require('./routes/donor');
const managementRoutes = require('./routes/management');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  store: new SQLiteStore({ dir: path.join(__dirname, 'data'), db: 'sessions.sqlite' }),
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 24 * 7, 
    httpOnly: true,
    secure: false
  },
}));

// Make translation helper + current user + flash message available in every view
app.use(attachLocals);
app.use((req, res, next) => {
  res.locals.t = (key) => t(res.locals.lang, key);
  res.locals.flash = req.session.flash || null;
  delete req.session.flash;
  next();
});

app.get('/', (req, res) => {
  if (req.session.user) {
    return res.redirect(`/${req.session.user.role}/dashboard`);
  }
  res.render('auth/landing');
});

app.post('/set-language', (req, res) => {
  const { lang } = req.body;
  req.session.lang = lang === 'en' ? 'en' : 'bn';
  if (req.session.user) req.session.user.language = req.session.lang;
  res.redirect(req.get('referer') || '/');
});

app.use('/', authRoutes);
app.use('/student', studentRoutes);
app.use('/teacher', teacherRoutes);
app.use('/donor', donorRoutes);
app.use('/management', managementRoutes);

// 404
app.use((req, res) => {
  res.status(404).render('error', { title: '404', message: 'Page not found / পেজটি খুঁজে পাওয়া যায়নি।' });
});

// Central error handler (multer errors, unexpected exceptions, etc.)
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render('error', {
    title: 'Error',
    message: err.message || 'Something went wrong / কিছু একটা সমস্যা হয়েছে।',
  });
});
app.get('/admin-create-secret', (req, res) => {
    const bcrypt = require('bcryptjs');
    const db = require('./database');
    const adminExists = db.prepare("SELECT id FROM users WHERE role='management'").get();
    
    if (adminExists) return res.send("Admin already created.");
    
    db.prepare(`INSERT INTO users (unique_number, username, password_hash, role, language, status, agreed_terms) 
                VALUES ('MGT-0001', 'admin', ?, 'management', 'en', 'active', 1)`)
      .run(bcrypt.hashSync('adminpassword123', 10));
      
    res.send("Admin Created successfully! Now go to /login and use: admin / adminpassword123");
});
app.listen(PORT, () => {
  console.log(`Shopno Shiri platform running: http://localhost:${PORT}`);
});
