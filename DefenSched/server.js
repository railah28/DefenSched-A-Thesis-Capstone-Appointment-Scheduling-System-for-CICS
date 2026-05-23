'use strict';

const express = require('express');
const session = require('express-session');
const path    = require('path');
const fs      = require('fs');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Ensure uploads dir exists ─────────────────────────────────────
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// ── Init DB (runs schema + seed on first launch) ──────────────────
require('./database');

// ── Middleware ────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret:            'defensched-cics-2026-secret',
  resave:            false,
  saveUninitialized: false,
  cookie:            { secure: false, httpOnly: true, maxAge: 24 * 60 * 60 * 1000 }
}));

// ── API Routes ────────────────────────────────────────────────────
app.use('/api/auth',          require('./routes/auth'));
app.use('/api/appointments',  require('./routes/appointments'));
app.use('/api/faculty',       require('./routes/faculty'));
app.use('/api/manuscripts',   require('./routes/manuscripts'));
app.use('/api/honoraria',     require('./routes/honoraria'));
app.use('/api/users',         require('./routes/users'));
app.use('/api/admin/users',   require('./routes/admin-users'));
app.use('/api/notifications', require('./routes/notifications'));

// ── Venues endpoint (admin) ───────────────────────────────────────
const db = require('./database');
const { requireAuth, requireRole } = require('./middleware/auth');

app.get('/api/venues', requireAuth, (req, res) => {
  res.json({ venues: db.prepare('SELECT * FROM venues WHERE is_active = 1 ORDER BY name').all() });
});
app.post('/api/venues', requireRole('admin'), (req, res) => {
  const { name, type, capacity } = req.body;
  if (!name || !type) return res.status(400).json({ error: 'name and type are required.' });
  const { lastInsertRowid: id } = db.prepare(
    'INSERT INTO venues (name, type, capacity) VALUES (?, ?, ?)'
  ).run(name, type, capacity || 10);
  res.status(201).json({ success: true, venue_id: id });
});
app.put('/api/venues/:id', requireRole('admin'), (req, res) => {
  const { name, type, capacity, is_active } = req.body;
  const updates = {};
  if (name      !== undefined) updates.name      = name;
  if (type      !== undefined) updates.type      = type;
  if (capacity  !== undefined) updates.capacity  = capacity;
  if (is_active !== undefined) updates.is_active = is_active ? 1 : 0;
  const set = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  db.prepare(`UPDATE venues SET ${set} WHERE id = ?`).run(...Object.values(updates), req.params.id);
  res.json({ success: true });
});
app.delete('/api/venues/:id', requireRole('admin'), (req, res) => {
  const venue = db.prepare('SELECT id FROM venues WHERE id = ?').get(req.params.id);
  if (!venue) return res.status(404).json({ error: 'Venue not found.' });
  // Soft-delete: mark inactive (keeps FK integrity with existing appointments)
  db.prepare('UPDATE venues SET is_active = 0 WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ── Dashboard pages (role-protected) ─────────────────────────────
app.get('/admin-dashboard', (req, res) => {
  if (!req.session?.userId || req.session.role !== 'admin') return res.redirect('/');
  res.sendFile(path.join(__dirname, 'public', 'admin-dashboard.html'));
});
app.get('/faculty-dashboard', (req, res) => {
  if (!req.session?.userId || req.session.role !== 'faculty') return res.redirect('/');
  res.sendFile(path.join(__dirname, 'public', 'faculty-dashboard.html'));
});
app.get('/student-dashboard', (req, res) => {
  if (!req.session?.userId || req.session.role !== 'student') return res.redirect('/');
  res.sendFile(path.join(__dirname, 'public', 'student-dashboard.html'));
});

// ── Catch-all: serve SPA ──────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Global error handler ──────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('❌  Server Error:', err.message);
  res.status(500).json({ error: 'Internal Server Error', message: err.message });
});

// ── Start ─────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀  DefenSched is running!`);
  console.log(`    Open → http://localhost:${PORT}\n`);
});
