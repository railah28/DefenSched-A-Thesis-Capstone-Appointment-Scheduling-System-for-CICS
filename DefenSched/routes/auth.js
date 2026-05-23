'use strict';

const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcryptjs');
const db      = require('../database');

// POST /api/auth/register — Users start with 'pending' status; admin must approve (requireActive middleware blocks access until approved)
router.post('/register', (req, res) => {
  const { name, email, password, role, is_group, group_name, leader_name, member_names, adviser_id } = req.body;
  if (!name || !email || !password || !role)
    return res.status(400).json({ error: 'All fields are required.' });

  // Build members JSON for group student accounts
  let membersJson = null;
  let isGroup = 0;
  if (role === 'student' && is_group) {
    isGroup = 1;
    if (!leader_name) return res.status(400).json({ error: 'Team leader name is required for group accounts.' });
    const names = Array.isArray(member_names) ? member_names.filter(n => n && n.trim()) : [];
    membersJson = JSON.stringify({ leader: leader_name.trim(), members: names.map(n => n.trim()) });
  }

  const hashed = bcrypt.hashSync(password, 10);
  try {
    // All new users start with status='pending'. Admins must approve before they can access the app.
    const { lastInsertRowid: id } = db.prepare(`
      INSERT INTO users (name, email, password_hash, role, group_name, is_group, members, status, adviser_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(name, email.toLowerCase().trim(), hashed, role, group_name || null, isGroup, membersJson, 'pending', adviser_id || null);

    // Notify all admins in the system about the new signup
    const admins = db.prepare("SELECT id FROM users WHERE role = 'admin' AND is_active = 1").all();
    const noteStmt = db.prepare('INSERT INTO notifications (user_id, message, type) VALUES (?, ?, ?)');
    for (const admin of admins) {
      noteStmt.run(admin.id, `New registration: ${name} (${email}, role: ${role}). Please review and approve.`, 'info');
    }

    // Also notify the registrant that their account is pending
    noteStmt.run(id, 'Your account has been created and is pending administrator approval. You will be notified when approved.', 'info');

    res.status(201).json({ 
      success: true, 
      user_id: id,
      message: 'Account created successfully. Please wait for admin approval before logging in.' 
    });
  } catch (e) {
    if (e.message.includes('UNIQUE'))
      return res.status(400).json({ error: 'Email already exists.' });
    throw e;
  }
});

// POST /api/auth/login — Blocks login for 'pending' or 'rejected' status users
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: 'Email and password are required.' });

  const user = db.prepare('SELECT * FROM users WHERE email = ? AND is_active = 1')
                 .get(email.toLowerCase().trim());

  if (!user || !bcrypt.compareSync(password, user.password_hash))
    return res.status(401).json({ error: 'Invalid email or password.' });

  // Check account approval status: only 'active' users can log in
  if (user.status === 'pending') {
    return res.status(403).json({ error: 'Your account is pending admin approval.' });
  }
  if (user.status === 'rejected') {
    return res.status(403).json({ error: 'Your account registration was rejected by the administrator.' });
  }
  if (user.status !== 'active') {
    return res.status(403).json({ error: 'Your account is not active.' });
  }

  req.session.userId = user.id;
  req.session.role   = user.role;

  res.json({
    success: true,
    user: { id: user.id, name: user.name, email: user.email, role: user.role, group_name: user.group_name, is_group: user.is_group, members: user.members, adviser_id: user.adviser_id }
  });
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

// GET /api/auth/me
router.get('/me', (req, res) => {
  if (!req.session?.userId) return res.status(401).json({ error: 'Not authenticated.' });
  const user = db.prepare('SELECT id, name, email, role, group_name, is_group, members, status, adviser_id FROM users WHERE id = ?')
                 .get(req.session.userId);
  if (!user) return res.status(401).json({ error: 'User not found.' });
  res.json({ user });
});

module.exports = router;
