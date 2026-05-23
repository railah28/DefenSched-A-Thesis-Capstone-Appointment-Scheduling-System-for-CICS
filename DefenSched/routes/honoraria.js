'use strict';

const express = require('express');
const router = express.Router();
const db = require('../database');
const { requireAuth, requireActive, requireRole } = require('../middleware/auth');

// GET /api/honoraria/rates
router.get('/rates', requireAuth, requireActive, (req, res) => {
  const rates = db.prepare('SELECT * FROM honoraria_rates').all();
  res.json({ rates });
});

// POST /api/honoraria/rates — admin only
router.post('/rates', requireRole('admin'), (req, res) => {
  const { panelist_rate, adviser_rate } = req.body;
  if (!panelist_rate || !adviser_rate)
    return res.status(400).json({ error: 'Both rates are required.' });

  db.prepare(`UPDATE honoraria_rates SET rate_per_session = ?, updated_at = ? WHERE role_type = 'panelist'`)
    .run(parseFloat(panelist_rate), new Date().toISOString());
  db.prepare(`UPDATE honoraria_rates SET rate_per_session = ?, updated_at = ? WHERE role_type = 'adviser'`)
    .run(parseFloat(adviser_rate), new Date().toISOString());

  res.json({ success: true });
});

// GET /api/honoraria/report — full computation per faculty
router.get('/report', requireAuth, requireActive, (req, res) => {
  const { userId, role } = req.session;

  const rates = {};
  db.prepare('SELECT * FROM honoraria_rates').all()
    .forEach(r => { rates[r.role_type] = r.rate_per_session; });

  let faculty;
  if (role === 'faculty') {
    faculty = db.prepare(`SELECT id, name, email FROM users WHERE id = ? AND role = 'faculty'`).all(userId);
  } else {
    faculty = db.prepare(`SELECT id, name, email FROM users WHERE role = 'faculty' AND is_active = 1 ORDER BY name`).all();
  }

  const report = faculty.map(f => {
    const panelSessions = db.prepare(`
      SELECT COUNT(*) as c FROM appointment_panelists ap
      JOIN appointments a ON ap.appointment_id = a.id
      WHERE ap.panelist_id = ? AND a.status IN ('confirmed','completed')
    `).get(f.id).c;

    const adviserGroups = db.prepare(`
      SELECT COUNT(*) as c FROM appointments
      WHERE adviser_id = ? AND status IN ('confirmed','completed')
    `).get(f.id).c;

    const panelHonoraria = panelSessions * (rates['panelist'] || 0);
    const adviserHonoraria = adviserGroups * (rates['adviser'] || 0);

    return {
      id: f.id,
      name: f.name,
      email: f.email,
      panel_sessions: panelSessions,
      adviser_groups: adviserGroups,
      panel_rate: rates['panelist'] || 0,
      adviser_rate: rates['adviser'] || 0,
      panel_honoraria: panelHonoraria,
      adviser_honoraria: adviserHonoraria,
      total: panelHonoraria + adviserHonoraria
    };
  });

  const grand_total = report.reduce((sum, r) => sum + r.total, 0);
  res.json({ report, grand_total, rates });
});

// GET /api/honoraria/settings — defense window settings
router.get('/settings', requireAuth, requireActive, (req, res) => {
  const settings = {};
  db.prepare('SELECT setting_key, setting_value FROM defense_settings').all()
    .forEach(s => { settings[s.setting_key] = s.setting_value; });
  res.json({ settings });
});

// PUT /api/honoraria/settings — update defense window
router.put('/settings', requireAuth, requireActive, requireRole('admin'), (req, res) => {
  const { defense_start_time, defense_end_time, defense_days } = req.body;
  const upd = db.prepare(`UPDATE defense_settings SET setting_value = ?, updated_at = ? WHERE setting_key = ?`);
  if (defense_start_time) upd.run(defense_start_time, new Date().toISOString(), 'defense_start_time');
  if (defense_end_time) upd.run(defense_end_time, new Date().toISOString(), 'defense_end_time');
  if (defense_days) upd.run(defense_days, new Date().toISOString(), 'defense_days');
  res.json({ success: true });
});

module.exports = router;
