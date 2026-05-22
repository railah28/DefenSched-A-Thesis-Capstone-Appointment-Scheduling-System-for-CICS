'use strict';

const express = require('express');
const router  = express.Router();
const db      = require('../database');
const { requireAuth } = require('../middleware/auth');

// GET /api/notifications — current user's notifications
router.get('/', requireAuth, (req, res) => {
  const notifs = db.prepare(`
    SELECT * FROM notifications
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT 50
  `).all(req.session.userId);

  const unread = notifs.filter(n => !n.is_read).length;
  res.json({ notifications: notifs, unread });
});

// PUT /api/notifications/:id/read
router.put('/:id/read', requireAuth, (req, res) => {
  db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?')
    .run(req.params.id, req.session.userId);
  res.json({ success: true });
});

// PUT /api/notifications/read-all
router.put('/read-all', requireAuth, (req, res) => {
  db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?')
    .run(req.session.userId);
  res.json({ success: true });
});

module.exports = router;
