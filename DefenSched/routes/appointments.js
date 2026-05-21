'use strict';

const express = require('express');
const router  = express.Router();
const db      = require('../database');
const { requireAuth, requireRole } = require('../middleware/auth');

// ── Helpers ──────────────────────────────────────────────────────
function getDayName(dateStr) {
  return ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
    [new Date(dateStr + 'T00:00:00').getDay()];
}

function notify(userId, message, type = 'info') {
  db.prepare('INSERT INTO notifications (user_id, message, type) VALUES (?, ?, ?)')
    .run(userId, message, type);
}

function attachPanelists(appts) {
  return appts.map(a => ({
    ...a,
    panelists: db.prepare(`
      SELECT u.id, u.name FROM users u
      JOIN appointment_panelists ap ON u.id = ap.panelist_id
      WHERE ap.appointment_id = ?
    `).all(a.id)
  }));
}

// ── GET /api/appointments ─────────────────────────────────────────
router.get('/', requireAuth, (req, res) => {
  const { userId, role } = req.session;
  let rows;
  if (role === 'admin') {
    rows = db.prepare(`
      SELECT a.*, u.name student_name, f.name adviser_name, v.name venue_name
      FROM appointments a
      JOIN users u ON a.student_id = u.id
      JOIN users f ON a.adviser_id = f.id
      JOIN venues v ON a.venue_id  = v.id
      ORDER BY a.date DESC, a.time_slot
    `).all();
  } else if (role === 'faculty') {
    rows = db.prepare(`
      SELECT DISTINCT a.*, u.name student_name, f.name adviser_name, v.name venue_name
      FROM appointments a
      JOIN users u ON a.student_id = u.id
      JOIN users f ON a.adviser_id = f.id
      JOIN venues v ON a.venue_id  = v.id
      LEFT JOIN appointment_panelists ap ON a.id = ap.appointment_id
      WHERE a.adviser_id = ? OR ap.panelist_id = ?
      ORDER BY a.date DESC, a.time_slot
    `).all(userId, userId);
  } else {
    rows = db.prepare(`
      SELECT a.*, f.name adviser_name, v.name venue_name
      FROM appointments a
      JOIN users f ON a.adviser_id = f.id
      JOIN venues v ON a.venue_id  = v.id
      WHERE a.student_id = ?
      ORDER BY a.date DESC
    `).all(userId);
  }
  res.json({ appointments: attachPanelists(rows) });
});

// ── GET /api/appointments/check-conflict ─────────────────────────
router.get('/check-conflict', requireAuth, (req, res) => {
  const { date, time_slot, adviser_id, panelist_ids, venue_id, exclude_id } = req.query;
  if (!date || !time_slot || !adviser_id || !venue_id)
    return res.status(400).json({ error: 'Missing required fields.' });

  const settings = {};
  db.prepare('SELECT setting_key, setting_value FROM defense_settings').all()
    .forEach(s => { settings[s.setting_key] = s.setting_value; });

  const ex = exclude_id ? `AND a.id != ${parseInt(exclude_id)}` : '';

  const dayName     = getDayName(date);
  const allowedDays = (settings.defense_days || '').split(',');
  const slotStart   = time_slot.split('-')[0];
  const slotEnd     = time_slot.split('-')[1];
  let rules = { ok: false, message: '' };
  if (!allowedDays.includes(dayName)) {
    rules.message = `${dayName} is not an approved defense day.`;
  } else if (slotStart < settings.defense_start_time || slotEnd > settings.defense_end_time) {
    rules.message = `Time must be within ${settings.defense_start_time}–${settings.defense_end_time}.`;
  } else {
    rules = { ok: true, message: 'Within approved schedule window.' };
  }

  const advConflict = db.prepare(`
    SELECT id FROM appointments
    WHERE adviser_id = ? AND date = ? AND time_slot = ? AND status != 'cancelled' ${ex}
  `).get(adviser_id, date, time_slot);
  const adviser = advConflict
    ? { ok: false, message: 'Adviser has a conflict at this time.' }
    : { ok: true,  message: 'Adviser is available.' };

  const pIds = panelist_ids ? panelist_ids.split(',').map(Number).filter(Boolean) : [];
  let panelists = { ok: false, message: 'No panelists selected.', details: [] };
  if (pIds.length) {
    let allOk = true;
    const details = pIds.map(pid => {
      const conflict = db.prepare(`
        SELECT a.id FROM appointments a
        JOIN appointment_panelists ap ON a.id = ap.appointment_id
        WHERE ap.panelist_id = ? AND a.date = ? AND a.time_slot = ? AND a.status != 'cancelled' ${ex}
      `).get(pid, date, time_slot);
      const name = db.prepare('SELECT name FROM users WHERE id = ?').get(pid)?.name || '';
      if (conflict) allOk = false;
      return { id: pid, name, ok: !conflict };
    });
    panelists = {
      ok: allOk,
      message: allOk ? 'All panelists available.' : 'One or more panelists have a conflict.',
      details
    };
  }

  const venConflict = db.prepare(`
    SELECT id FROM appointments
    WHERE venue_id = ? AND date = ? AND time_slot = ? AND status != 'cancelled' ${ex}
  `).get(venue_id, date, time_slot);
  const venue = venConflict
    ? { ok: false, message: 'Venue is already booked at this time.' }
    : { ok: true,  message: 'Venue is available.' };

  res.json({
    adviser, panelists, venue, rules,
    all_clear: adviser.ok && panelists.ok && venue.ok && rules.ok
  });
});

// ── POST /api/appointments ────────────────────────────────────────
router.post('/', requireAuth, (req, res) => {
  const { userId } = req.session;
  const { group_name, adviser_id, panelist_ids, date, time_slot, venue_id, notes } = req.body;
  if (!group_name || !adviser_id || !date || !time_slot || !venue_id || !panelist_ids?.length)
    return res.status(400).json({ error: 'All fields are required.' });

  if (db.prepare(`SELECT id FROM appointments WHERE adviser_id=? AND date=? AND time_slot=? AND status!='cancelled'`).get(adviser_id, date, time_slot))
    return res.status(409).json({ error: 'Conflict: Adviser is not available at that time.' });

  if (db.prepare(`SELECT id FROM appointments WHERE venue_id=? AND date=? AND time_slot=? AND status!='cancelled'`).get(venue_id, date, time_slot))
    return res.status(409).json({ error: 'Conflict: Venue is already booked.' });

  const { lastInsertRowid: apptId } = db.prepare(`
    INSERT INTO appointments (group_name, student_id, adviser_id, date, time_slot, venue_id, notes, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
  `).run(group_name, userId, adviser_id, date, time_slot, venue_id, notes || null);

  const insPan = db.prepare('INSERT INTO appointment_panelists (appointment_id, panelist_id) VALUES (?, ?)');
  for (const pid of panelist_ids) insPan.run(apptId, pid);

  // Notify adviser, panelists, and submitting student
  notify(parseInt(adviser_id), `New defense scheduled: ${group_name} on ${date} at ${time_slot}.`, 'info');
  for (const pid of panelist_ids) notify(pid, `You are assigned as panelist for ${group_name} on ${date}.`, 'info');
  notify(userId, 'Appointment submitted. Upload your manuscript to confirm.', 'success');

  // Notify all admin users about the new booking
  const admins = db.prepare("SELECT id FROM users WHERE role = 'admin' AND is_active = 1").all();
  for (const admin of admins) {
    notify(admin.id, `New appointment request from ${group_name} on ${date} at ${time_slot}.`, 'info');
  }

  res.status(201).json({ success: true, appointment_id: apptId });
});

// ── PUT /api/appointments/:id ─────────────────────────────────────
router.put('/:id', requireAuth, (req, res) => {
  const { userId, role } = req.session;
  const appt = db.prepare('SELECT * FROM appointments WHERE id = ?').get(req.params.id);
  if (!appt) return res.status(404).json({ error: 'Appointment not found.' });
  if (role === 'student' && appt.student_id !== userId)
    return res.status(403).json({ error: 'Cannot modify another group\'s appointment.' });

  const fields = ['status','date','time_slot','venue_id','notes'];
  const updates = {};
  fields.forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });
  updates.updated_at = new Date().toISOString();

  const set = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  db.prepare(`UPDATE appointments SET ${set} WHERE id = ?`).run(...Object.values(updates), req.params.id);

  if (role !== 'student' && (req.body.date || req.body.time_slot))
    notify(appt.student_id, `Your defense has been rescheduled to ${req.body.date || appt.date} at ${req.body.time_slot || appt.time_slot}.`, 'warning');

  res.json({ success: true });
});

// ── DELETE /api/appointments/:id — hard delete ────────────────────
router.delete('/:id', requireRole('admin'), (req, res) => {
  const appt = db.prepare('SELECT * FROM appointments WHERE id = ?').get(req.params.id);
  if (!appt) return res.status(404).json({ error: 'Appointment not found.' });

  // Notify student before removing
  try { notify(appt.student_id, `Your appointment on ${appt.date} has been deleted by the admin.`, 'error'); } catch (_) {}

  // Hard delete — appointment_panelists cascades via FK ON DELETE CASCADE
  db.prepare('DELETE FROM appointments WHERE id = ?').run(req.params.id);

  res.json({ success: true });
});

module.exports = router;
