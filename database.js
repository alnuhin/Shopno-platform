// database.js
// -----------------------------------------------------------------------
// Single-file SQLite database for the Shopno Shiri prototype.
//
// WHY SQLite for this stage:
//  - Zero setup: one file (data/shopno.db), no separate DB server to install.
//  - More than enough for a 10-15 user pilot / demo / judge presentation.
//  - `better-sqlite3` is synchronous, fast, and battle-tested for exactly
//    this "small app, single server" use case.
//
// WHEN TO MOVE OFF SQLite (see the README "Scaling the database" section):
//  - Real concurrent writes from many users at once (SQLite locks the whole
//    file on write), or you deploy across multiple server instances.
//  - At that point the schema below maps almost 1:1 onto PostgreSQL/MySQL -
//    swap better-sqlite3 for `pg` and change the few SQLite-specific types
//    (AUTOINCREMENT, TEXT for dates) and you are done.
// -----------------------------------------------------------------------

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'shopno.db'));
db.pragma('journal_mode = WAL'); // better concurrent read performance
db.pragma('foreign_keys = ON');

db.exec(`
-- ======================================================================
-- CORE ACCOUNT TABLE (shared by all 4 roles)
-- ======================================================================
CREATE TABLE IF NOT EXISTS users (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  unique_number   TEXT UNIQUE NOT NULL,         -- shown to user, used to log in
  username        TEXT UNIQUE NOT NULL,
  password_hash   TEXT NOT NULL,
  role            TEXT NOT NULL CHECK(role IN ('student','teacher','donor','management')),
  language        TEXT NOT NULL DEFAULT 'bn' CHECK(language IN ('bn','en')),
  status          TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','active','suspended','rejected')),
  agreed_terms    INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  last_login_at   TEXT
);

-- ======================================================================
-- STUDENT PROFILE
-- ======================================================================
CREATE TABLE IF NOT EXISTS students (
  id                        INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id                   INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,

  -- Personal information
  first_name                TEXT NOT NULL,
  last_name                 TEXT NOT NULL,
  dob                       TEXT,                 -- YYYY-MM-DD
  birth_certificate_no      TEXT,
  gender                    TEXT CHECK(gender IN ('M','F','Other')),
  religion                  TEXT,
  photo_path                TEXT,

  -- Educational information
  class_level               TEXT,
  institution_name          TEXT,
  institution_eiin          TEXT,
  institution_email         TEXT,
  club_activity             INTEGER DEFAULT 0,     -- 0/1
  club_name                 TEXT,

  -- Parents / Guardian information
  father_name               TEXT,
  father_occupation         TEXT,
  father_nid                TEXT,
  father_phone              TEXT,
  mother_name               TEXT,
  mother_occupation         TEXT,
  mother_nid                TEXT,
  mother_phone              TEXT,
  is_orphan                 INTEGER DEFAULT 0,
  legal_guardian_name       TEXT,
  legal_guardian_relation   TEXT,
  legal_guardian_phone      TEXT,
  legal_guardian_nid        TEXT,
  father_photo_path         TEXT,
  mother_photo_path         TEXT,
  legal_guardian_photo_path TEXT,

  -- Address
  present_address           TEXT,
  permanent_address         TEXT,

  -- Contact / accounts
  student_phone             TEXT,
  student_email             TEXT,
  social_media_account      TEXT,
  whatsapp_number           TEXT,

  -- Emergency contact
  emergency_contact_name    TEXT,
  emergency_contact_phone   TEXT,
  emergency_contact_photo_path TEXT,

  -- Documents
  nid_or_birth_cert_front_path TEXT,
  nid_or_birth_cert_back_path  TEXT,

  -- Teacher / Mentor link (student picks their verifying teacher)
  teacher_contact           TEXT,                  -- phone or email typed by student at signup
  teacher_id                INTEGER REFERENCES users(id),
  verification_status       TEXT NOT NULL DEFAULT 'awaiting_teacher'
                              CHECK(verification_status IN ('awaiting_teacher','confirmed','rejected')),
  otp_code                  TEXT,
  otp_expires_at            TEXT,
  otp_verified              INTEGER DEFAULT 0,

  created_at                TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ======================================================================
-- TEACHER / MENTOR PROFILE
-- ======================================================================
CREATE TABLE IF NOT EXISTS teachers (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id               INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  full_name             TEXT NOT NULL,
  phone                 TEXT NOT NULL,
  email                 TEXT NOT NULL,
  photo_path            TEXT,

  working_place         TEXT,                  -- school/college/university/organisation name
  affiliated_with_institution INTEGER DEFAULT 0,
  club_name             TEXT,
  is_teacher_or_mentor  TEXT CHECK(is_teacher_or_mentor IN ('teacher','mentor')),

  -- teacher-only educational fields
  graduated_from        TEXT,
  graduation_year       TEXT,
  graduate_subject      TEXT,
  cgpa                  TEXT,
  publications          TEXT,
  about_self            TEXT,

  nid_number            TEXT,
  nid_front_path        TEXT,
  nid_back_path         TEXT,
  id_card_front_path    TEXT,
  id_card_back_path     TEXT,

  admin_verified        INTEGER DEFAULT 0,      -- Management approval required to act
  otp_code              TEXT,
  otp_verified          INTEGER DEFAULT 0,

  created_at            TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ======================================================================
-- DONOR / INVESTOR PROFILE
-- ======================================================================
CREATE TABLE IF NOT EXISTS donors (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id           INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  account_name      TEXT NOT NULL,       -- display name shown on the platform
  full_name         TEXT NOT NULL,       -- legal / ID name
  donor_type        TEXT NOT NULL DEFAULT 'donor' CHECK(donor_type IN ('donor','investor')),
  phone             TEXT,
  email             TEXT,
  id_type           TEXT,                 -- NID / Passport / etc
  id_number         TEXT,
  id_photo_path     TEXT,
  profile_photo_path TEXT,
  admin_verified    INTEGER DEFAULT 0,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ======================================================================
-- PROJECTS (submitted by students, reviewed by their confirming teacher)
-- ======================================================================
CREATE TABLE IF NOT EXISTS projects (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id      INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  teacher_id      INTEGER REFERENCES users(id),
  title           TEXT NOT NULL,
  description     TEXT NOT NULL,
  category        TEXT,                    -- e.g. STEM / Idea / Startup / Art
  team_members    TEXT,                    -- free text: names + student IDs
  media_path      TEXT,                    -- uploaded photo or video
  media_type      TEXT CHECK(media_type IN ('image','video')),
  funding_goal    REAL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK(status IN ('pending','approved','rejected','completed','ongoing')),
  teacher_note    TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ======================================================================
-- SOCIAL FEATURES: likes, comments (donor/community engagement)
-- ======================================================================
CREATE TABLE IF NOT EXISTS likes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(project_id, user_id)
);

CREATE TABLE IF NOT EXISTS comments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body        TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ======================================================================
-- PLEDGES / DONATIONS (money flow is stubbed for the prototype -
-- no real payment gateway is wired up, see README)
-- ======================================================================
CREATE TABLE IF NOT EXISTS pledges (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id   INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  donor_id     INTEGER NOT NULL REFERENCES donors(id) ON DELETE CASCADE,
  amount       REAL NOT NULL,
  message      TEXT,
  status       TEXT NOT NULL DEFAULT 'recorded' CHECK(status IN ('recorded','paid','cancelled')),
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ======================================================================
-- ACHIEVEMENTS (leadership score, kindness, talents - given by donors/teachers)
-- ======================================================================
CREATE TABLE IF NOT EXISTS achievements (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id   INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  given_by     INTEGER NOT NULL REFERENCES users(id),
  category     TEXT NOT NULL CHECK(category IN ('leadership','kindness','talent')),
  points       INTEGER NOT NULL DEFAULT 1,
  note         TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ======================================================================
-- AUDIT LOG (Management visibility - who did what)
-- ======================================================================
CREATE TABLE IF NOT EXISTS audit_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER REFERENCES users(id),
  action      TEXT NOT NULL,
  details     TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_students_teacher ON students(teacher_id);
CREATE INDEX IF NOT EXISTS idx_projects_student ON projects(student_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_pledges_project ON pledges(project_id);
`);

module.exports = db;
