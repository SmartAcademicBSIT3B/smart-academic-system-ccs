# Smart Academic System - Role-Based Condensed Troubleshooting

Use this quick guide when you need fast fixes by role.

## How to Use This Page

1. Go to your role section.
2. Match the symptom or error.
3. Apply the fix steps in order.
4. If unresolved, escalate with the log details listed at the end.

---

## Admin Quick Fixes

### 1) Cannot login

Common messages:

- Invalid email or password.
- This account is not registered under the selected department.
- Too many login attempts. Try again in ... seconds.

Fix:

1. Confirm correct department is selected.
2. Recheck email/password.
3. Wait for lockout timer if rate-limited.
4. If still failing, ask support to verify account status and role in database.

### 2) Dashboard or tables fail to load

Common messages:

- Internal server error.
- Route not found.

Fix:

1. Check backend is running and healthy at http://localhost:3000/health (dev).
2. Restart app and backend.
3. Verify API route path is correct (/api/...).
4. Confirm backend environment values are loaded.

### 3) Profile image / partner logo upload fails

Common messages:

- Cloudinary is not configured...
- Cloudinary upload succeeded but no URL was returned.
- Could not open file picker.

Fix:

1. Confirm Cloudinary env vars are set (name, key, secret).
2. Retry using supported image format.
3. Relaunch app if file picker is unavailable.

### 4) OTP emails not sending

Common messages:

- Failed to send OTP.
- MAIL_USER and MAIL_PASS must be configured to send OTP.

Fix:

1. Set MAIL_USER and MAIL_PASS.
2. Verify email provider app-password/security setup.
3. Retry OTP request.

---

## Coordinator Quick Fixes

### 1) Cannot access coordinator pages after login

Common messages:

- Unauthorized.
- Invalid or expired token.

Fix:

1. Log out and log in again.
2. Ensure token was saved in session/local storage.
3. Confirm the user role is coordinator for the selected department.

### 2) OJT student data or sections not loading

Common messages:

- Failed to fetch sections.
- Internal server error.

Fix:

1. Confirm backend health and network access.
2. Verify department context is correct.
3. Reload page; if still failing, restart backend.
4. Check backend logs for query/database errors.

### 3) Coordinator notifications not showing

Common issue:

- WebSocket not connected or no updates received.

Fix:

1. Confirm backend is running with notifications endpoint.
2. Reopen coordinator page to reconnect socket.
3. Verify coordinator email/department values are passed correctly.

---

## Installer and Support Quick Fixes

### 1) App stuck at loading after install

Common messages:

- Backend did not become ready at ... within ...
- EADDRINUSE

Fix:

1. Fully quit and relaunch app.
2. Free the occupied port or restart machine.
3. Confirm local backend can start and DB is reachable.
4. If needed, collect backend diagnostics from the app and escalate.

### 2) Installed app cannot use online features

Possible causes:

- Missing runtime .env in installed environment.

Fix:

1. Place .env in supported path:
   - %APPDATA%/smart-academic-system-ccs/.env
   - or <install folder>/resources/.env
2. Optionally set SAS_ENV_PATH to explicit env location.
3. Restart app.

### 3) Google Drive auth fails on installed app

Common messages:

- Missing Google OAuth env vars...
- Google callback did not include an authorization code.
- Could not start callback listener on ...

Fix:

1. Verify OAuth client vars and redirect URI.
2. Re-run authorization and paste full callback URL/code correctly.
3. Ensure callback listener port is not blocked by another process.

### 4) Auto-update does not trigger

Common messages:

- Auto-update check failed
- [auto-updater] Error

Fix:

1. Test in installed build, not npm start dev mode.
2. Verify release metadata exists (latest.yml/app-update.yml).
3. Confirm GitHub publish configuration is correct.

---

## Escalation Template (Send to Dev Team)

Include:

1. App version and whether it is installed or dev mode.
2. Exact error message text.
3. Time of issue and action being performed.
4. Backend health result.
5. Last logs from Electron main, backend console, and renderer console.

For full technical troubleshooting details, see docs/TROUBLESHOOTING.md.

For maintenance routines and support workflow, see docs/MAINTENANCE_AND_SUPPORT.md.
