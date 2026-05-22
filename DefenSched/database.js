'use strict';

const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'defensched.db');
const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── Schema ──────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT    NOT NULL,
    email         TEXT    NOT NULL UNIQUE,
    password_hash TEXT    NOT NULL,
    role          TEXT    NOT NULL CHECK(role IN ('admin','faculty','student')),
    group_name    TEXT,
    is_active     INTEGER NOT NULL DEFAULT 1,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS venues (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    name      TEXT    NOT NULL,
    type      TEXT    NOT NULL CHECK(type IN ('physical','virtual')),
    capacity  INTEGER DEFAULT 10,
    is_active INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS faculty_availability (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    faculty_id        INTEGER NOT NULL,
    availability_type TEXT    NOT NULL CHECK(availability_type IN ('adviser','panelist')),
    date              TEXT    NOT NULL,
    time_slot         TEXT    NOT NULL,
    FOREIGN KEY (faculty_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(faculty_id, date, time_slot, availability_type)
  );

  CREATE TABLE IF NOT EXISTS appointments (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    group_name          TEXT    NOT NULL,
    student_id          INTEGER NOT NULL,
    adviser_id          INTEGER NOT NULL,
    date                TEXT    NOT NULL,
    time_slot           TEXT    NOT NULL,
    venue_id            INTEGER NOT NULL,
    status              TEXT    NOT NULL DEFAULT 'pending'
                          CHECK(status IN ('pending','confirmed','rescheduled','completed','cancelled')),
    manuscript_uploaded INTEGER NOT NULL DEFAULT 0,
    notes               TEXT,
    created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES users(id),
    FOREIGN KEY (adviser_id) REFERENCES users(id),
    FOREIGN KEY (venue_id)   REFERENCES venues(id)
  );

  CREATE TABLE IF NOT EXISTS appointment_panelists (
    appointment_id INTEGER NOT NULL,
    panelist_id    INTEGER NOT NULL,
    PRIMARY KEY (appointment_id, panelist_id),
    FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE,
    FOREIGN KEY (panelist_id)    REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS manuscripts (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    appointment_id  INTEGER NOT NULL UNIQUE,
    filename        TEXT    NOT NULL,
    original_name   TEXT    NOT NULL,
    file_size       INTEGER NOT NULL,
    uploaded_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS honoraria_rates (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    role_type        TEXT    NOT NULL CHECK(role_type IN ('panelist','adviser')),
    rate_per_session REAL    NOT NULL,
    updated_at       DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL,
    message    TEXT    NOT NULL,
    type       TEXT    NOT NULL DEFAULT 'info' CHECK(type IN ('info','success','warning','error')),
    is_read    INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS defense_settings (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    setting_key   TEXT NOT NULL UNIQUE,
    setting_value TEXT NOT NULL,
    updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// ── Migrations (idempotent) ────────────────────────────────────
try { db.exec(`ALTER TABLE users ADD COLUMN members TEXT`); } catch (_) { /* column already exists */ }
try { db.exec(`ALTER TABLE users ADD COLUMN is_group INTEGER NOT NULL DEFAULT 0`); } catch (_) { /* column already exists */ }

// ── Seed ────────────────────────────────────────────────────────
function seed() {
  const count = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
  if (count > 0) return;

  console.log('\n🌱  Seeding database with demo data...');
  const h = p => bcrypt.hashSync(p, 10);

  const ins = db.prepare(`
    INSERT INTO users (name, email, password_hash, role, group_name)
    VALUES (?, ?, ?, ?, ?)
  `);
  ins.run('Research Coordinator', 'admin@cics.edu.ph', h('admin123'), 'admin', null);
  ins.run('Dr. Jose Reyes', 'jose.reyes@cics.edu.ph', h('faculty123'), 'faculty', null);
  ins.run('Prof. Maria Santos', 'maria.santos@cics.edu.ph', h('faculty123'), 'faculty', null);
  ins.run('Dr. Ana Lim', 'ana.lim@cics.edu.ph', h('faculty123'), 'faculty', null);
  ins.run('Group Alpha', 'group.alpha@cics.edu.ph', h('student123'), 'student', 'Group Alpha');
  ins.run('Group Beta', 'group.beta@cics.edu.ph', h('student123'), 'student', 'Group Beta');

  const insV = db.prepare('INSERT INTO venues (name, type, capacity) VALUES (?, ?, ?)');
  insV.run('Room 301 - CICS Lab', 'physical', 15);
  insV.run('Room 302 - Multimedia Room', 'physical', 20);
  insV.run('Conference Hall', 'physical', 30);
  insV.run('Virtual - Google Meet', 'virtual', 50);
  insV.run('Virtual - Zoom', 'virtual', 50);

  const insR = db.prepare('INSERT INTO honoraria_rates (role_type, rate_per_session) VALUES (?, ?)');
  insR.run('panelist', 1500.00);
  insR.run('adviser', 2000.00);

  const insS = db.prepare('INSERT INTO defense_settings (setting_key, setting_value) VALUES (?, ?)');
  insS.run('defense_start_time', '08:00');
  insS.run('defense_end_time', '17:00');
  insS.run('defense_days', 'Monday,Tuesday,Wednesday,Thursday,Friday');
  insS.run('slot_duration_minutes', '60');

  // ── Seed appointments, panelists, availability & notifications ──
  const today = new Date();
  const monday = new Date(today);
  monday.setDate(today.getDate() - today.getDay() + 1);
  const mon = monday.toISOString().split('T')[0];
  const tue = new Date(monday); tue.setDate(monday.getDate() + 1); const tueStr = tue.toISOString().split('T')[0];
  const wed = new Date(monday); wed.setDate(monday.getDate() + 2); const wedStr = wed.toISOString().split('T')[0];
  const thu = new Date(monday); thu.setDate(monday.getDate() + 3); const thuStr = thu.toISOString().split('T')[0];
  const fri = new Date(monday); fri.setDate(monday.getDate() + 4); const friStr = fri.toISOString().split('T')[0];

  const insA = db.prepare(`
    INSERT INTO appointments (group_name, student_id, adviser_id, date, time_slot, venue_id, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  insA.run('Group Alpha', 5, 2, thuStr, '09:00-10:00', 1, 'confirmed');
  insA.run('Group Beta', 6, 3, friStr, '10:00-11:00', 2, 'pending');

  const insAP = db.prepare('INSERT INTO appointment_panelists (appointment_id, panelist_id) VALUES (?, ?)');
  insAP.run(1, 3);
  insAP.run(1, 4);
  insAP.run(2, 2);
  insAP.run(2, 4);

  const insAv = db.prepare('INSERT INTO faculty_availability (faculty_id, availability_type, date, time_slot) VALUES (?, ?, ?, ?)');
  insAv.run(2, 'adviser', mon, '09:00-10:00');
  insAv.run(2, 'adviser', tueStr, '14:00-15:00');
  insAv.run(2, 'adviser', wedStr, '09:00-10:00');
  insAv.run(2, 'panelist', thuStr, '10:00-11:00');
  insAv.run(2, 'panelist', friStr, '13:00-14:00');

  const insN = db.prepare('INSERT INTO notifications (user_id, message, type) VALUES (?, ?, ?)');
  insN.run(2, 'Group Alpha has uploaded a manuscript for their defense on ' + thuStr + '.', 'success');
  insN.run(2, 'You have been assigned as panelist for Group Beta defense on ' + friStr + '.', 'info');

  console.log('✅  Database seeded!\n');
  console.log('📋  Demo Accounts:');
  console.log('    Admin   → admin@cics.edu.ph         / admin123');
  console.log('    Faculty → jose.reyes@cics.edu.ph    / faculty123');
  console.log('    Student → group.alpha@cics.edu.ph   / student123\n');
}

seed();
module.exports = db;
