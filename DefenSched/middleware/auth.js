'use strict';

const db = require('../database');

function requireAuth(req, res, next) {
    if (!req.session || !req.session.userId) {
        return res.status(401).json({ error: 'Authentication required.' });
    }
    next();
}

function requireRole(...roles) {
    return (req, res, next) => {
        if (!req.session || !req.session.userId) {
            return res.status(401).json({ error: 'Authentication required.' });
        }
        if (!roles.includes(req.session.role)) {
            return res.status(403).json({ error: 'Access denied.' });
        }
        next();
    };
}

// Middleware to block users whose account status is not 'active'
// Use this to enforce admin approval before allowing access to features
function requireActive(req, res, next) {
    if (!req.session || !req.session.userId) {
        return res.status(401).json({ error: 'Authentication required.' });
    }
    const user = db.prepare('SELECT status FROM users WHERE id = ?').get(req.session.userId);
    if (!user) return res.status(401).json({ error: 'User not found.' });
    if (user.status !== 'active') {
        if (user.status === 'pending') {
            return res.status(403).json({ error: 'Your account is pending admin approval.' });
        }
        if (user.status === 'rejected') {
            return res.status(403).json({ error: 'Your account registration was rejected by the administrator.' });
        }
        return res.status(403).json({ error: 'Your account is not active.' });
    }
    next();
}

module.exports = { requireAuth, requireRole, requireActive };
