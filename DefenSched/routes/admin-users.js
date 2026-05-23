'use strict';

const express = require('express');
const router = express.Router();
const db = require('../database');
const { requireAuth, requireActive, requireRole } = require('../middleware/auth');

// GET /api/admin/users/pending
// Fetch all users with pending approval status.
router.get('/pending', requireAuth, requireActive, requireRole('admin'), (req, res) => {
  try {
    const pendingUsers = db.prepare(`
      SELECT id, name, email, role, group_name, is_group, members, created_at
      FROM users
      WHERE status = 'pending'
      ORDER BY created_at ASC
    `).all();
    res.json({ users: pendingUsers, count: pendingUsers.length });
  } catch (err) {
    console.error('Error fetching pending users:', err.message);
    res.status(500).json({ error: 'Failed to fetch pending users.' });
  }
});

// POST /api/admin/users/:id/approve
// Approve a pending user and set status to active.
router.post('/:id/approve', requireAuth, requireActive, requireRole('admin'), (req, res) => {
  try {
    const uid = parseInt(req.params.id, 10);
    const user = db.prepare('SELECT id, email, name, status FROM users WHERE id = ?').get(uid);
    if (!user) return res.status(404).json({ error: 'User not found.' });
    if (user.status === 'active') return res.status(400).json({ error: 'User is already active.' });
    if (user.status === 'rejected') return res.status(400).json({ error: 'Cannot approve a rejected user.' });

    db.prepare('UPDATE users SET status = ? WHERE id = ?').run('active', uid);
    db.prepare('INSERT INTO notifications (user_id, message, type) VALUES (?, ?, ?)')
      .run(uid, 'Your account has been approved! You can now log in and access the system.', 'success');

    res.json({ success: true, message: `User ${user.name} (${user.email}) has been approved.` });
  } catch (err) {
    console.error('Error approving user:', err.message);
    res.status(500).json({ error: 'Failed to approve user.' });
  }
});

// POST /api/admin/users/:id/reject
// Reject a pending user and set status to rejected.
router.post('/:id/reject', requireAuth, requireActive, requireRole('admin'), (req, res) => {
  try {
    const uid = parseInt(req.params.id, 10);
    const { reason } = req.body;
    const user = db.prepare('SELECT id, email, name, status FROM users WHERE id = ?').get(uid);
    if (!user) return res.status(404).json({ error: 'User not found.' });
    if (user.status === 'active') return res.status(400).json({ error: 'Cannot reject an already-active user.' });
    if (user.status === 'rejected') return res.status(400).json({ error: 'User is already rejected.' });

    db.prepare('UPDATE users SET status = ? WHERE id = ?').run('rejected', uid);
    const rejectMsg = reason
      ? `Your account registration was rejected. Reason: ${reason}`
      : 'Your account registration was rejected by the administrator.';
    db.prepare('INSERT INTO notifications (user_id, message, type) VALUES (?, ?, ?)')
      .run(uid, rejectMsg, 'error');

    res.json({ success: true, message: `User ${user.name} (${user.email}) has been rejected.` });
  } catch (err) {
    console.error('Error rejecting user:', err.message);
    res.status(500).json({ error: 'Failed to reject user.' });
  }
});

module.exports = router;
