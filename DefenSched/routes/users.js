'use strict';

const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcryptjs');
const db      = require('../database');
const { requireAuth, requireActive, requireRole } = require('../middleware/auth');

// GET /api/users — admin: all users; faculty/student: self only
router.get('/', requireAuth, requireActive, (req, res) => {
  const { userId, role } = req.session;
  if (role === 'admin') {
    const users = db.prepare(
      'SELECT id, name, email, role, group_name, is_group, members, is_active, created_at FROM users ORDER BY role, name'
    ).all();
    return res.json({ users });
  }
  const user = db.prepare(
    'SELECT id, name, email, role, group_name, is_group, members FROM users WHERE id = ?'
  ).get(userId);
  res.json({ users: [user] });
});
router.get('/faculty', requireAuth, requireActive, (req, res) => {
  const faculty = db.prepare('SELECT id, name, email FROM users WHERE role = "faculty" AND is_active = 1 ORDER BY name').all();
  res.json({ faculty });
});


// GET /api/users/:id
router.get('/:id', requireAuth, requireActive, (req, res) => {
  const user = db.prepare(
    'SELECT id, name, email, role, group_name, is_group, members, is_active, created_at FROM users WHERE id = ?'
  ).get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  res.json({ user });
});

// POST /api/users — admin: create user
router.post('/', requireRole('admin'), (req, res) => {
  const { name, email, password, role, group_name } = req.body;
  if (!name || !email || !password || !role)
    return res.status(400).json({ error: 'name, email, password, and role are required.' });

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (existing) return res.status(409).json({ error: 'Email already in use.' });

  const hash = bcrypt.hashSync(password, 10);
  const { lastInsertRowid: id } = db.prepare(`
    INSERT INTO users (name, email, password_hash, role, group_name)
    VALUES (?, ?, ?, ?, ?)
  `).run(name, email.toLowerCase().trim(), hash, role, group_name || null);

  res.status(201).json({ success: true, user_id: id });
});

// PUT /api/users/:id — admin: edit user
router.put('/:id', requireRole('admin'), (req, res) => {
  const { name, email, role, group_name, is_active, password } = req.body;
  const updates = {};
  if (name)       updates.name       = name;
  if (email)      updates.email      = email.toLowerCase().trim();
  if (role)       updates.role       = role;
  if (group_name !== undefined) updates.group_name = group_name;
  if (is_active  !== undefined) updates.is_active  = is_active ? 1 : 0;
  if (password)   updates.password_hash = bcrypt.hashSync(password, 10);

  if (!Object.keys(updates).length)
    return res.status(400).json({ error: 'No fields to update.' });

  const set = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  db.prepare(`UPDATE users SET ${set} WHERE id = ?`).run(...Object.values(updates), req.params.id);
  res.json({ success: true });
});

// DELETE /api/users/:id — hard delete (FK-safe)
router.delete('/:id', requireRole('admin'), (req, res) => {
  const uid = parseInt(req.params.id);
  const user = db.prepare('SELECT id, role FROM users WHERE id = ?').get(uid);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  if (user.role === 'admin') return res.status(403).json({ error: 'Cannot delete admin accounts.' });

  try {
    // Run everything in a single transaction
    db.transaction(() => {
      // 1. Remove from panelist assignments first (avoids orphan FK on appointment_panelists)
      db.prepare('DELETE FROM appointment_panelists WHERE panelist_id = ?').run(uid);

      // 2. Hard-delete appointments where user is student (panelists cascade via FK)
      //    We must DELETE (not just cancel) to remove the FK reference on student_id
      db.prepare('DELETE FROM appointments WHERE student_id = ?').run(uid);

      // 3. Hard-delete appointments where user is adviser
      db.prepare('DELETE FROM appointments WHERE adviser_id = ?').run(uid);

      // 4. Delete the user — notifications cascade via FK ON DELETE CASCADE
      db.prepare('DELETE FROM users WHERE id = ?').run(uid);
    })();

    res.json({ success: true });
  } catch (err) {
    console.error('Delete user error:', err.message);
    res.status(500).json({ error: 'Failed to delete user: ' + err.message });
  }
});

// GET /api/users/venues/all — venue list
router.get('/venues/all', requireAuth, requireActive, (req, res) => {
  const venues = db.prepare('SELECT * FROM venues WHERE is_active = 1 ORDER BY name').all();
  res.json({ venues });
});

module.exports = router;
