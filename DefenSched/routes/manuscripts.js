'use strict';

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../database');
const { requireAuth } = require('../middleware/auth');

const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const safe = `appt_${req.params.appointmentId}_${Date.now()}${ext}`;
    cb(null, safe);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.docx', '.doc'];
    if (allowed.includes(path.extname(file.originalname).toLowerCase())) cb(null, true);
    else cb(new Error('Only PDF and DOCX files are allowed.'));
  }
});

function notify(userId, message, type = 'info') {
  db.prepare('INSERT INTO notifications (user_id, message, type) VALUES (?, ?, ?)').run(userId, message, type);
}

// POST /api/manuscripts/upload/:appointmentId
router.post('/upload/:appointmentId', requireAuth, upload.single('manuscript'), (req, res) => {
  const { appointmentId } = req.params;
  const { userId } = req.session;

  const appt = db.prepare('SELECT * FROM appointments WHERE id = ?').get(appointmentId);
  if (!appt) return res.status(404).json({ error: 'Appointment not found.' });
  if (appt.student_id !== userId)
    return res.status(403).json({ error: 'You can only upload for your own appointment.' });
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

  // Remove old manuscript file if exists
  const existing = db.prepare('SELECT * FROM manuscripts WHERE appointment_id = ?').get(appointmentId);
  if (existing) {
    const oldPath = path.join(UPLOADS_DIR, existing.filename);
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    db.prepare('DELETE FROM manuscripts WHERE appointment_id = ?').run(appointmentId);
  }

  db.prepare(`
    INSERT INTO manuscripts (appointment_id, filename, original_name, file_size)
    VALUES (?, ?, ?, ?)
  `).run(appointmentId, req.file.filename, req.file.originalname, req.file.size);

  // Confirm the appointment and notify stakeholders
  db.prepare(`UPDATE appointments SET manuscript_uploaded = 1, status = 'confirmed', updated_at = ? WHERE id = ?`)
    .run(new Date().toISOString(), appointmentId);

  notify(appt.adviser_id, `Manuscript uploaded by ${appt.group_name}. Defense confirmed for ${appt.date}.`, 'success');
  const panelists = db.prepare('SELECT panelist_id FROM appointment_panelists WHERE appointment_id = ?').all(appointmentId);
  panelists.forEach(p => notify(p.panelist_id, `Manuscript available for ${appt.group_name}'s defense on ${appt.date}.`, 'info'));

  res.status(201).json({
    success: true,
    message: 'Manuscript uploaded. Appointment is now CONFIRMED.',
    filename: req.file.originalname,
    size: req.file.size
  });
});

// GET /api/manuscripts/list-by-faculty — all manuscripts for logged-in faculty
router.get('/list-by-faculty', requireAuth, (req, res) => {
  const { userId, role } = req.session;
  if (role !== 'faculty') return res.status(403).json({ error: 'Faculty only.' });

  const manuscripts = db.prepare(`
    SELECT DISTINCT m.id, m.appointment_id, m.original_name, m.file_size, m.uploaded_at,
           a.group_name, a.date, a.time_slot,
           CASE WHEN a.adviser_id = ? THEN 'adviser' ELSE 'panelist' END as role
    FROM manuscripts m
    JOIN appointments a ON m.appointment_id = a.id
    LEFT JOIN appointment_panelists ap ON a.id = ap.appointment_id
    WHERE a.adviser_id = ? OR ap.panelist_id = ?
    ORDER BY m.uploaded_at DESC
  `).all(userId, userId, userId);

  res.json({ manuscripts });
});

// GET /api/manuscripts/:appointmentId — get manuscript info
router.get('/:appointmentId', requireAuth, (req, res) => {
  const ms = db.prepare('SELECT * FROM manuscripts WHERE appointment_id = ?').get(req.params.appointmentId);
  if (!ms) return res.status(404).json({ error: 'No manuscript found.' });
  res.json({ manuscript: ms });
});

// GET /api/manuscripts/download/:id — download file
router.get('/download/:id', requireAuth, (req, res) => {
  const ms = db.prepare('SELECT * FROM manuscripts WHERE id = ?').get(req.params.id);
  if (!ms) return res.status(404).json({ error: 'File not found.' });
  const filePath = path.join(UPLOADS_DIR, ms.filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File missing on server.' });
  res.download(filePath, ms.original_name);
});

module.exports = router;
