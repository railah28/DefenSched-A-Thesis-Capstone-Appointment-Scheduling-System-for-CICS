# Admin Approval Workflow for User Registration

## Overview

This document describes the admin approval workflow implemented for user registration in DefenSched. When a new user creates an account, they are placed in a **"pending"** state and cannot log in until an admin **manually approves** their account.

---

## Implementation Details

### 1. Database Schema Changes

**File:** `database.js`

Added a migration to create the `status` column on the `users` table:

```sql
ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'active'
```

**Status Values:**
- `pending` — New user awaiting admin approval
- `active` — User is approved and can log in
- `rejected` — User registration was rejected; cannot log in

> **Note:** Seeded admin users (from the seed function) are automatically created with `status='active'` by default, allowing them to log in immediately.

---

### 2. Authentication Middleware

**File:** `middleware/auth.js`

#### `requireAuth()` — Existing
- Checks if user is authenticated (has a session)
- Returns 401 if not authenticated

#### `requireRole(...roles)` — Existing
- Checks if user has one of the required roles
- Returns 403 if role is not authorized

#### `requireActive()` — NEW
Blocks users whose account status is not `'active'`. Use this to protect routes that should only be available to approved users.

```javascript
function requireActive(req, res, next) {
    // Checks user.status in the database
    // Returns 403 with appropriate message for 'pending' or 'rejected' users
}
```

**Export:** `{ requireAuth, requireRole, requireActive }`

**Usage Example:**
```javascript
router.get(
    '/some-protected-resource',
    requireAuth,          // Must be logged in
    requireActive,        // Must be approved (active)
    requireRole('student'),  // Must be student role
    (req, res) => { /* ... */ }
);
```

---

### 3. Registration Route

**File:** `routes/auth.js` → `POST /api/auth/register`

**Key Changes:**
1. All new users are inserted with `status = 'pending'`
2. If no admin exists yet, user is auto-activated (seeded admins always have `status='active'`)
3. In-app notifications are sent:
   - All admins receive a notification about the new signup
   - The registrant receives a notification that their account is pending

**Request Body:**
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "securepass123",
  "role": "student",  // or "faculty"
  "is_group": false,
  "group_name": "My Group"
}
```

**Response:**
```json
{
  "success": true,
  "user_id": 5,
  "message": "Account created successfully. Please wait for admin approval before logging in."
}
```

**Admin Notifications:**
```sql
INSERT INTO notifications (user_id, message, type)
VALUES (admin_id, "New registration: John Doe (john@example.com, role: student). Please review and approve.", 'info');
```

---

### 4. Login Route

**File:** `routes/auth.js` → `POST /api/auth/login`

**Blocking Logic:**
- ✓ User enters correct email and password → Check `status` field
  - `status = 'pending'` → Return 403: *"Your account is pending admin approval."*
  - `status = 'rejected'` → Return 403: *"Your account registration was rejected by the administrator."*
  - `status = 'active'` → Proceed with login (create session)

**No session is created** for non-active users, preventing any access to protected routes.

**Response Examples:**

Success:
```json
{
  "success": true,
  "user": { "id": 1, "name": "John Doe", "email": "john@example.com", "role": "student" }
}
```

Pending:
```json
{
  "error": "Your account is pending admin approval."
}
```

Rejected:
```json
{
  "error": "Your account registration was rejected by the administrator."
}
```

---

### 5. Admin Approval Endpoints

**File:** `routes/users.js`

#### GET `/api/admin/users/pending`

Fetch all users with `status='pending'`.

**Access:** Admin only (`requireRole('admin')`)

**Response:**
```json
{
  "users": [
    {
      "id": 5,
      "name": "John Doe",
      "email": "john@example.com",
      "role": "student",
      "group_name": "My Group",
      "is_group": 0,
      "members": null,
      "created_at": "2026-05-23T10:00:00.000Z"
    }
  ],
  "count": 1
}
```

---

#### POST `/api/admin/users/:id/approve`

Approve a pending user by updating their status to `'active'`.

**Access:** Admin only (`requireRole('admin')`)

**Request:** (No body required)

**Response:**
```json
{
  "success": true,
  "message": "User John Doe (john@example.com) has been approved."
}
```

**Side Effects:**
- User status is set to `'active'`
- User receives an in-app notification: *"Your account has been approved! You can now log in and access the system."*

---

#### POST `/api/admin/users/:id/reject`

Reject a pending user by updating their status to `'rejected'`.

**Access:** Admin only (`requireRole('admin')`)

**Request Body:**
```json
{
  "reason": "Email domain not recognized"  // Optional reason
}
```

**Response:**
```json
{
  "success": true,
  "message": "User John Doe (john@example.com) has been rejected."
}
```

**Side Effects:**
- User status is set to `'rejected'`
- User receives an in-app notification with the rejection reason or a default message

---

## Workflow Summary

1. **User Signs Up**
   - New account created with `status='pending'`
   - All admins notified via in-app notification

2. **Admin Reviews Pending Users**
   - Admin logs in with their pre-approved admin account
   - Admin calls `GET /api/admin/users/pending` to see new signups

3. **Admin Takes Action**
   - **Approve:** `POST /api/admin/users/:id/approve`
     - User status → `'active'`
     - User notified: "Your account has been approved!"
     - User can now log in
   - **Reject:** `POST /api/admin/users/:id/reject`
     - User status → `'rejected'`
     - User notified with rejection reason
     - User cannot log in

4. **User attempts to log in**
   - If `status='active'` → Login succeeds, session created
   - If `status='pending'` → Login fails: 403 "Account pending approval"
   - If `status='rejected'` → Login fails: 403 "Account rejected"

---

## Seeded Demo Accounts

From `database.js`, the following admin is seeded with `status='active'`:

| Email | Password | Role | Status |
|-------|----------|------|--------|
| admin@cics.edu.ph | admin123 | admin | active |

You can use this account to immediately log in and test the approval workflow.

---

## Code Locations

| Component | File | Key Lines |
|-----------|------|-----------|
| Database migration | `database.js` | Migrations section |
| Middleware | `middleware/auth.js` | `requireActive()` function |
| Register logic | `routes/auth.js` | `POST /api/auth/register` |
| Login validation | `routes/auth.js` | `POST /api/auth/login` |
| Admin endpoints | `routes/users.js` | `GET /api/admin/users/pending`, `POST /api/admin/users/:id/approve`, `POST /api/admin/users/:id/reject` |

---

## How to Use in Your Tests

### Quick Test: Register and Approve a User

```bash
# 1. Register a new user
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Jane Smith",
    "email": "jane@example.com",
    "password": "pass123",
    "role": "faculty"
  }'
# Response: { "success": true, "user_id": 6, "message": "Account created..." }

# 2. Try to log in (should fail with 403)
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "jane@example.com", "password": "pass123"}'
# Response: { "error": "Your account is pending admin approval." }

# 3. Log in as admin
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@cics.edu.ph", "password": "admin123"}'
# Response: { "success": true, "user": {...} }
# Save the session cookie (usually handled by your frontend)

# 4. Fetch pending users (as admin)
curl -X GET http://localhost:3000/api/admin/users/pending \
  --cookie "connect.sid=your_session_cookie"
# Response: { "users": [...], "count": 1 }

# 5. Approve the pending user
curl -X POST http://localhost:3000/api/admin/users/6/approve \
  --cookie "connect.sid=your_session_cookie"
# Response: { "success": true, "message": "User Jane Smith... has been approved." }

# 6. Now the user can log in
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "jane@example.com", "password": "pass123"}'
# Response: { "success": true, "user": {...} }
```

---

## Optional Enhancements

### 1. Email Notifications (Nodemailer)
To send actual emails instead of (or in addition to) in-app notifications, install Nodemailer:

```bash
npm install nodemailer
```

Then update the approval/rejection endpoints in `routes/users.js` to call Nodemailer (example commented in the code).

### 2. Audit Log
Add a table to track who approved/rejected which users and when:

```sql
CREATE TABLE IF NOT EXISTS admin_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id INTEGER NOT NULL,
  action_type TEXT CHECK(action_type IN ('approve', 'reject')),
  target_user_id INTEGER NOT NULL,
  reason TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (admin_id) REFERENCES users(id),
  FOREIGN KEY (target_user_id) REFERENCES users(id)
);
```

### 3. Admin Dashboard UI
Create a frontend admin panel that:
- Shows pending users in a table
- Provides buttons to approve/reject
- Displays change history

---

## Current Server Status

✅ **Server running on `http://localhost:3000`**

Database schema updated with `status` column ✓

Middleware and routes implemented ✓

Ready for frontend integration and testing!

