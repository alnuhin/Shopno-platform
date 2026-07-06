# স্বপ্ন সিঁড়ি (Shopno Shiri)

Student idea/talent funding platform for Bangladesh — connects **Students**,
**Teachers/Mentors**, **Donors/Investors**, and **Management** on one
platform. This is a working prototype: real signup, real login, real file
uploads, real database — built to demo the full flow end-to-end for 10–15
test users.

---

## 1. Quick start

```bash
cd shopno
npm install
cp .env.example .env        # then open .env and change SESSION_SECRET + ADMIN_PASSWORD
npm run seed                 # creates the one Management (admin) account
npm start                    # or: npm run dev  (auto-restarts on file changes)
```

Open **http://localhost:3000**

The terminal will print your Management username/password after `npm run seed`.
Log in with that account at `/login` to reach the Management dashboard.

Students, Teachers/Mentors, and Donors/Investors create their own accounts
through `/signup` — Management accounts are never created through the public
form, on purpose (only you should be able to create admins).

---

## 2. How the demo flow works end-to-end

1. **Student** signs up at `/signup/student`, fills all 4 sections
   (personal → educational → family → submit), types their teacher's phone
   or email, uploads photos, agrees to terms, gets a **demo OTP shown
   directly on screen** (see note below), and lands on their dashboard with
   status "awaiting teacher confirmation."
2. **Teacher/Mentor** signs up at `/signup/teacher`. If a student already
   typed this teacher's phone/email, that student automatically appears in
   the teacher's "students pending confirmation" list. Teacher clicks
   **Confirm** → student's account becomes active and they can submit
   projects.
3. **Student** submits a project (title, description, team members, photo
   or video) → goes to **pending**. The same teacher who confirmed the
   student reviews it and clicks **Approve** or **Reject**.
4. **Donor/Investor** signs up at `/signup/donor`, and immediately sees the
   community feed of every **approved** project. They can like, comment,
   and "donate" (see payments note below).
5. **Management** logs in and sees platform-wide stats, verifies
   Teacher/Mentor and Donor/Investor identity documents, and can
   suspend/reactivate any account.

---

## 3. What is real vs. what is intentionally stubbed

Being straight with you about what actually works vs. what's a placeholder,
so nothing surprises you in front of judges:

| Feature | Status |
|---|---|
| Signup / login / sessions / password hashing | ✅ Real (bcrypt + express-session) |
| File uploads (photos, ID docs, project photo/video) | ✅ Real (saved to `public/uploads/...`) |
| Database (all 4 roles, projects, likes, comments, pledges) | ✅ Real (SQLite file, persists between restarts) |
| Teacher confirmation / project approval workflow | ✅ Real |
| Bilingual (বাংলা/English) UI | ✅ Real — every screen, every button, every error message |
| Management verification & suspend/reactivate | ✅ Real |
| **OTP verification** | ⚠️ **Demo mode.** A real 6-digit code is generated and stored, but there is no SMS gateway connected — the code is shown directly on the confirmation screen with a clear warning label instead of being texted. To go live: sign up with a Bangladeshi SMS gateway (SSL Wireless, Alpha SMS, BulkSMSBD, etc.), get an API key, and replace `deliverOtp()` in `utils/otp.js`. |
| **Donations / payments** | ⚠️ **Stubbed.** The "Donate" button records the donor's *intent* (amount + message) in the `pledges` table — no money actually moves. To go live: integrate bKash/Nagad/Rocket's merchant API (they require business verification + a merchant account) or a card processor. This is genuinely the most involved integration and needs its own dedicated setup — happy to help wire it up once you have gateway credentials. |
| NID/ID numbers | ⚠️ Stored as plain text for the demo. **Before any real launch**, these must be encrypted at rest (see Security section below) — do not deploy this publicly with real NID data until that's fixed. |

---

## 3.5 Deploying on Render — what broke and how it's fixed now

If you deployed this to Render (or Railway, Fly.io, Heroku, etc.) and found
**no Management/admin account existed** and you couldn't browse the
database file, here's exactly why, and what changed:

**Root cause #1 — the admin account was never created.**
Render only ever runs your Start Command (`npm start`). It never runs
`npm run seed` for you, and free-tier Render gives you no shell/SSH access
to run it yourself. So the Management account genuinely never got created —
this wasn't something you did wrong.

**Fix:** `server.js` now calls `ensureAdminAccount()` (in
`utils/ensureAdmin.js`) automatically every time the app boots. It checks
"does a management user already exist?" — if not, it creates exactly one
using `ADMIN_USERNAME`/`ADMIN_PASSWORD` from environment variables. This
means you never need shell access or a manual seed step again.

**⚠️ You must set environment variables in Render's dashboard**, not in a
`.env` file. `.env` is for your own computer only — it's git-ignored and
never gets uploaded to Render. On Render: go to your service → **Environment**
tab → add:
- `ADMIN_USERNAME` = (pick a username)
- `ADMIN_PASSWORD` = (pick a strong password)
- `SESSION_SECRET` = (a long random string)
- `NODE_ENV` = `production`

Then trigger a redeploy (or it'll pick these up on the next natural restart).

**Root cause #2 — Render's free tier has no persistent disk.**
This is the bigger one: without a paid "Persistent Disk" add-on, Render
wipes your service's entire local filesystem — including `data/shopno.db`
and every uploaded photo/video — on every redeploy, crash, **and every time
the free service spins down from inactivity and spins back up.** This is
almost certainly why your 2 students + 1 teacher signups seemed to
disappear or become unreachable: the container restarted and reset.

**Your options, ranked by what fits a 2-day demo right now:**

1. **Fastest & safest for tomorrow: go back to running it on your own laptop
   with ngrok** (as covered earlier). Your laptop's disk is never wiped —
   this guarantees no data loss during your actual presentation. This is
   what I'd personally do given the time pressure.
2. **Keep the Render link, but add a Persistent Disk.** Render's cheapest
   plan with disk support is "Starter" (paid, but small — check Render's
   current pricing). In the dashboard: Add-ons → Disks → attach a disk,
   mount it at e.g. `/data`, then set an environment variable so
   `database.js` writes there instead of the ephemeral local folder. Ask me
   and I'll wire up the `DATA_DIR` env var support for this in five minutes
   if you go this route.
3. **Zero-cost, permanent, more work: migrate the database to a hosted
   SQLite-compatible service like Turso** (has a genuinely free tier that
   isn't tied to Render's ephemeral disk). This needs the `better-sqlite3`
   calls converted to the async Turso client throughout every route file —
   a real but doable rewrite. Tell me if you want this and I'll do it
   properly once your immediate deadline has passed — not something to risk
   changing hours before a presentation.

**New admin visibility tools (work regardless of which option you pick):**
- `/management/uploads` — every photo/video anyone has uploaded, in one
  gallery, organized by role. No file-system access needed.
- `/management/backup` — downloads the live `shopno.db` file straight from
  your browser, so you can open it in "DB Browser for SQLite" locally even
  when you have no shell access to the server.

---

## 4. Your database question — how to store data for a 10–15 person test

You asked how to store the data so it can smoothly support ~10-15 test users
while you demo everything except real money movement. Short answer: **what's
already built is exactly right for that.**

**What it uses right now:** SQLite (`data/shopno.db`), a single file on disk,
accessed through `better-sqlite3`. Everything — accounts, student profiles,
projects, likes, comments, pledge records — lives in that one file.

**Why this is the correct choice for your situation:**
- Zero setup. No separate database server to install, configure, or pay for.
- Handles far more than 10-15 concurrent users comfortably — SQLite is used
  in production for apps with thousands of daily users when writes aren't
  extremely high-frequency, which is exactly your case (people signing up,
  submitting a few projects, liking/commenting occasionally).
- **It persists.** Stopping and restarting the server (`npm start` again)
  does not lose any data — it's all still in `data/shopno.db`.
- Easy to back up: it's one file. Copy `data/shopno.db` anywhere and that's
  your entire backup.
- Easy to inspect: install "DB Browser for SQLite" (free, GUI) and open
  `data/shopno.db` directly to see every table/row while you test — great
  for double-checking that signups/projects/pledges are actually saving.

**When you would need to move off SQLite** (not yet, but for your own
planning):
- If you deploy across multiple servers/regions at once (SQLite is a single
  file, so multiple app servers can't share it directly).
- If you get into hundreds of simultaneous writes per second (real
  crowdfunding launch traffic, not a classroom demo).
- At that point, migrate to PostgreSQL — the schema in `database.js` maps
  over almost directly (swap `better-sqlite3` for the `pg` package, and
  change `AUTOINCREMENT` → `SERIAL`/`GENERATED ALWAYS AS IDENTITY`). This is
  a well-understood, mechanical migration when the time comes — not a
  rewrite.

**Practical tip for your 2-day test window:** before your presentation,
run `cp data/shopno.db data/shopno-backup.db` once you've created a few good
demo accounts/projects, so if anything gets messy during live testing you can
restore that backup instantly instead of re-creating test data.

---

## 5. Security checklist before this touches real user data publicly

The prototype is safe for a controlled classroom/pilot test with people you
know. Before opening it to the public internet with real students' NID
numbers and real money, do these:

1. **Encrypt sensitive fields at rest** — NID numbers, birth certificate
   numbers (student + parents + guardian). Use a library like `node:crypto`
   with AES-256-GCM and a key stored outside the codebase (environment
   variable / secrets manager), not in `database.js`.
2. **Change `SESSION_SECRET` and `ADMIN_PASSWORD`** in `.env` to strong,
   unique values — never keep the example defaults.
3. **Put the app behind HTTPS** (e.g. via a reverse proxy like Nginx +
   Let's Encrypt, or a platform like Render/Railway that provides HTTPS
   automatically). Session cookies are marked `secure` in production mode,
   which requires HTTPS to work at all.
4. **Rate-limit login and signup** (e.g. `express-rate-limit`) to slow down
   brute-force attempts.
5. **Get NGO Affairs Bureau / relevant regulatory guidance** before
   collecting public donations in Bangladesh — crowdfunding for donations
   has legal requirements independent of anything technical.
6. **Get a real SMS gateway and payment gateway** as described in the table
   above, and remove the demo OTP screen entirely once SMS delivery works.

---

## 6. Project structure

```
shopno/
├── server.js              # app entry point
├── database.js            # SQLite schema (all tables, single source of truth)
├── middleware/auth.js      # session guards (requireAuth, requireRole, ...)
├── routes/
│   ├── auth.js             # landing, login, signup (student/teacher/donor), OTP
│   ├── student.js          # student dashboard, project submission
│   ├── teacher.js          # teacher dashboard, confirmations, project review
│   ├── donor.js             # donor feed, likes, comments, pledges
│   └── management.js       # admin overview, verification, moderation
├── utils/
│   ├── i18n.js              # bn/en dictionary — add new UI text here
│   ├── otp.js                # OTP generation (demo delivery, see notes above)
│   ├── upload.js             # multer file upload config
│   └── seed.js               # creates the Management account
├── views/                  # EJS templates, organised by role
├── public/
│   ├── css/style.css        # design system (colors, type, components)
│   └── uploads/              # uploaded photos/videos land here
└── data/
    └── shopno.db             # the actual database (created on first run)
```

---

## 7. Adding more UI text later

Every visible string lives in `utils/i18n.js` under both `bn` and `en` keys.
When you add a new page or button, add its text there first, then reference
it in the view with `<%= t('your_key') %>` — this keeps the whole app
consistently bilingual with no hardcoded text hiding anywhere.
