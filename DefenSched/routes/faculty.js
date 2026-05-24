'use strict';

const express = require('express');
const router  = express.Router();
const db      = require('../database');
const { requireAuth, requireActive, requireRole } = require('../middleware/auth');

// GET /api/faculty — list all faculty (for dropdowns)
router.get('/', requireAuth, requireActive, (req, res) => {
  const faculty = db.prepare(
    `SELECT id, name, email FROM users WHERE role = 'faculty' AND is_active = 1 ORDER BY name`
  ).all();
  res.json({ faculty });
});

// GET /api/faculty/:id/availability
router.get('/:id/availability', requireAuth, requireActive, (req, res) => {
  const { date, type } = req.query;
  let query = 'SELECT * FROM faculty_availability WHERE faculty_id = ?';
  const params = [req.params.id];
  if (date) { query += ' AND date = ?'; params.push(date); }
  if (type) { query += ' AND availability_type = ?'; params.push(type); }
  query += ' ORDER BY date, time_slot';
  res.json({ availability: db.prepare(query).all(...params) });
});

// POST /api/faculty/:id/availability — add a slot
router.post('/:id/availability', requireAuth, requireActive, (req, res) => {
  const { userId, role } = req.session;
  // Faculty can only set their own; admin can set any
  if (role === 'faculty' && parseInt(req.params.id) !== userId)
    return res.status(403).json({ error: 'Cannot modify another faculty\'s availability.' });

  const { availability_type, date, time_slot } = req.body;
  if (!availability_type || !date || !time_slot)
    return res.status(400).json({ error: 'availability_type, date, and time_slot are required.' });

  try {
    db.prepare(`
      INSERT INTO faculty_availability (faculty_id, availability_type, date, time_slot)
      VALUES (?, ?, ?, ?)
    `).run(req.params.id, availability_type, date, time_slot);
    res.status(201).json({ success: true });
  } catch (e) {
    res.status(409).json({ error: 'That slot is already marked.' });
  }
});

// DELETE /api/faculty/:id/availability/:slotId
router.delete('/:id/availability/:slotId', requireAuth, requireActive, (req, res) => {
  const { userId, role } = req.session;
  if (role === 'faculty' && parseInt(req.params.id) !== userId)
    return res.status(403).json({ error: 'Cannot modify another faculty\'s availability.' });

  db.prepare('DELETE FROM faculty_availability WHERE id = ? AND faculty_id = ?')
    .run(req.params.slotId, req.params.id);
  res.json({ success: true });
});

module.exports = router;
