# Smart Academic System - Troubleshooting Guide

This guide covers common issues, error messages, and fixes for the Smart Academic System (Electron + Node.js + MySQL + Cloudinary + Google Drive).

Need a shorter version by role? See: `docs/TROUBLESHOOTING_ROLE_BASED.md`

For preventive maintenance and support workflow, see: `docs/MAINTENANCE_AND_SUPPORT.md`

## 1) Quick Triage Checklist

Before deep debugging, check these first:

1. Confirm dependencies are installed:
   - Root: `npm install`
   - Backend: `npm --prefix backend install`
2. Confirm Node.js version is 18 or higher.
3. Confirm `.env` exists and has valid values (DB, JWT, Cloudinary, Google OAuth, Mail).
4. Confirm backend is reachable:
   - `http://localhost:3000/health` should return `{ "ok": true, ... }` in local dev.
5. Restart app and backend after any `.env` or credential changes.

## 2) Common Issues and Solutions

### A) App starts but stays on loading screen

Symptoms:

- Loading page does not proceed to main app.
- App keeps retrying startup.

Likely causes:

- Backend did not finish startup in time.
- Backend health is up, but API readiness is not complete.
- Local port conflict.

Fix:

1. Check if backend responds:
   - `http://127.0.0.1:3000/health`
2. If port 3000 is used by another process, stop it or restart app.
3. Use root dev script (it auto handles port cleanup):
   - `npm run dev`
4. In packaged build, open app again after full quit; startup logic will attempt alternate local ports when needed.

### B) Backend fails to start or API calls fail

Symptoms:

- Login fails with server-side messages.
- Calls return 500/Internal server error.

Likely causes:

- Missing environment variables.
- Database/network issues.
- Wrong backend URL in packaged setup.

Fix:

1. Validate backend env values (`DB_*`, `JWT_SECRET`, `MAIL_*`, `GOOGLE_OAUTH_*`, `CLOUDINARY_*`).
2. Start backend directly to view logs:
   - `npm --prefix backend run dev`
3. Verify backend health route:
   - `http://localhost:3000/health`
4. In installed app, ensure `.env` is available in one of these supported locations:
   - `%APPDATA%/smart-academic-system-ccs/.env` (recommended)
   - `<install folder>/resources/.env`
   - Optional override with `SAS_ENV_PATH`

### C) Database connection errors

Symptoms:

- API routes fail unexpectedly.
- Startup or queries fail with network/DB errors.

Likely causes:

- Wrong DB host/port/user/password/database.
- Cloud database unavailable or network blocked.
- SSL rejectUnauthorized mismatch.

Fix:

1. Recheck `.env` database values:
   - `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
2. If cloud provider requires SSL config, verify:
   - `DB_SSL_REJECT_UNAUTHORIZED`
3. Ensure your network can reach the DB host/port.
4. Retry after temporary network interruption (app already retries transient DB errors once).

### D) Login and token/authentication issues

Symptoms:

- Login rejected despite known account.
- Requests fail with unauthorized/expired token.

Likely causes:

- Wrong department selected.
- JWT secret missing/mismatched.
- Too many failed login attempts lockout.

Fix:

1. Select the correct department before login.
2. Ensure `JWT_SECRET` is set and consistent for backend session.
3. If rate-limited, wait for lockout timer and retry.
4. Log out and log in again to refresh token.

### E) OTP email is not sent

Symptoms:

- OTP operation returns failure.

Likely causes:

- Mail transporter not configured.
- Wrong `MAIL_USER` / `MAIL_PASS`.
- Mail provider blocks sign-in.

Fix:

1. Set `MAIL_USER` and `MAIL_PASS` correctly.
2. Verify mail provider app-password/security settings.
3. Retry send after confirming credentials.

### F) Google Drive authorization/upload issues

Symptoms:

- Cannot generate OAuth URL.
- Authorization fails/cancelled.
- Upload reports auth required.

Likely causes:

- Missing Google OAuth env vars.
- Invalid callback host/redirect URI.
- Missing/expired token.

Fix:

1. Set all required vars:
   - `GOOGLE_OAUTH_CLIENT_ID`
   - `GOOGLE_OAUTH_CLIENT_SECRET`
   - `GOOGLE_OAUTH_REDIRECT_URI`
2. Ensure callback URI matches Google Console settings.
3. Re-authorize Google Drive in app and save token again.
4. If needed, clear token and re-auth:
   - use in-app clear/reconnect flow.

### G) Cloudinary image upload issues (profile/logo)

Symptoms:

- Profile/logo upload fails.

Likely causes:

- Cloudinary credentials missing/invalid.
- Upload returns no URL.

Fix:

1. Set Cloudinary vars correctly:
   - `CLOUDINARY_CLOUD_NAME`
   - `CLOUDINARY_API_KEY`
   - `CLOUDINARY_API_SECRET`
2. Retry with supported image types (`jpg`, `jpeg`, `png`, `gif`, `webp` where applicable).
3. Check backend logs for Cloudinary API errors.

### H) Auto-update not working

Symptoms:

- No update checks.
- Update check fails.

Likely causes:

- Running in unpackaged/dev mode without dev-update flag.
- Updater module unavailable.
- Publish metadata/build artifacts missing.

Fix:

1. Test updates in installed build, not plain `npm start`.
2. For dev-only testing, set `SAS_ENABLE_DEV_AUTO_UPDATE=1`.
3. Ensure build/publish config points to correct GitHub repo.
4. Ensure release metadata exists (`latest.yml`, `app-update.yml`).

### I) Department/admin setup issues

Symptoms:

- Setup OTP flow fails.
- Admin setup does not complete.

Likely causes:

- Missing mail config.
- Invalid admin user ID format.
- OTP expired/consumed.

Fix:

1. Confirm mail env vars are configured.
2. Ensure admin `user_id` uses expected format: `AYY-NNNNN`.
3. Request a new OTP and complete within expiry window.

### J) File picker/dialog issues

Symptoms:

- Image or import file chooser does not open.

Likely causes:

- IPC handler unavailable in current app session.
- Electron state issue.

Fix:

1. Fully quit and relaunch app.
2. Retry action from the same screen.
3. If persistent, restart machine to release stuck shell/file dialog resources.

## 3) Error Messages and Fixes (Message -> Action)

Use this section to map exact errors to immediate fixes.

| Error message (exact/near text)                                                                                         | Meaning                                         | Fix                                                                                                                    |
| ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `npm.ps1 cannot be loaded because running scripts is disabled on this system`                                           | PowerShell execution policy blocked npm script  | Run PowerShell as Admin: `Set-ExecutionPolicy RemoteSigned -Scope CurrentUser`, then reopen terminal.                  |
| `EADDRINUSE`                                                                                                            | Desired port is already in use                  | Close conflicting process, or run `npm run dev` (includes port cleanup). Packaged app also tries fallback local ports. |
| `Backend did not become ready at ... within ... (health + API readiness).`                                              | Backend did not pass startup readiness check    | Check backend logs; verify DB access and `/api/meta/departments` route readiness.                                      |
| `Server authentication is not configured (JWT_SECRET missing).`                                                         | JWT secret missing in env                       | Add `JWT_SECRET` to `.env`, restart backend/app.                                                                       |
| `Unauthorized.`                                                                                                         | No token supplied                               | Log in again; ensure Authorization header/session token exists.                                                        |
| `Invalid or expired token.`                                                                                             | Token invalid or expired                        | Re-login and retry action.                                                                                             |
| `Too many login attempts. Try again in ... seconds.`                                                                    | Temporary login lockout triggered               | Wait for lock duration, then retry with correct credentials.                                                           |
| `Invalid email or password.`                                                                                            | Credentials mismatch                            | Verify email/password, selected department, and account status.                                                        |
| `This account is not registered under the selected department.`                                                         | Account exists but wrong department selected    | Select correct department and login again.                                                                             |
| `to use this account, please contact the developers`                                                                    | Restricted secret account path used incorrectly | Use proper secret login flow or standard account.                                                                      |
| `Missing Google OAuth env vars. Set GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, and GOOGLE_OAUTH_REDIRECT_URI.` | OAuth config incomplete                         | Set all required Google OAuth env vars and restart app/backend.                                                        |
| `Authorization code is missing. Paste the Google code or full callback URL.`                                            | OAuth code input was empty/invalid              | Paste full callback URL or valid `code` value and retry.                                                               |
| `No valid OAuth token. User must authenticate first via Google Drive.`                                                  | No valid token stored                           | Re-run Google Drive authorization in app.                                                                              |
| `Google authorization failed: ...`                                                                                      | OAuth callback returned an error                | Re-authorize; verify consent screen and redirect URI.                                                                  |
| `Google callback did not include an authorization code.`                                                                | OAuth callback URL missing `code` query param   | Repeat OAuth flow and ensure final callback is complete.                                                               |
| `Could not start callback listener on ...`                                                                              | Local callback listener could not bind          | Check local port availability/firewall; retry authorization.                                                           |
| `Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in .env.`       | Cloudinary credentials missing                  | Add Cloudinary env vars and restart backend/app.                                                                       |
| `Cloudinary upload succeeded but no URL was returned.`                                                                  | Cloudinary returned incomplete upload payload   | Retry upload; check cloudinary account limits/settings and API logs.                                                   |
| `Failed to send OTP.`                                                                                                   | OTP email send failed                           | Verify `MAIL_USER`/`MAIL_PASS` and provider security settings.                                                         |
| `MAIL_USER and MAIL_PASS must be configured to send OTP.`                                                               | Setup OTP mail config missing                   | Add both env vars and restart backend/app.                                                                             |
| `Department ... handlers are unavailable in this app session. Please restart the app.`                                  | IPC handler mismatch or stale Electron session  | Restart the app to reload main/preload handlers.                                                                       |
| `Could not open file picker.`                                                                                           | Native file dialog failed                       | Retry; relaunch app if needed.                                                                                         |
| `Auto-update check failed:` / `[auto-updater] Error:`                                                                   | Auto-updater could not check/download updates   | Test in installed build, verify release metadata and GitHub publish settings.                                          |
| `Route not found.`                                                                                                      | Wrong API endpoint/path                         | Verify requested endpoint and route prefix (`/api/...`).                                                               |
| `Internal server error.`                                                                                                | Unhandled server exception                      | Check backend console stack trace and fix underlying issue.                                                            |

## 4) Diagnostics for Support/Developers

When reporting an issue, capture these details:

1. App version and whether app is packaged or dev mode.
2. Backend URL currently used by Electron.
3. Backend diagnostics payload from app (`getBackendDiagnostics`).
4. Last console errors from:
   - Electron main process
   - Backend process
   - Renderer DevTools console
5. The exact error message text and when it appears.

## 5) Preventive Best Practices

1. Keep `.env` values consistent across dev, backend, and packaged runtime.
2. Use `npm run dev` for local development to avoid startup race/port issues.
3. Avoid editing tokens manually; use in-app auth flows for Google Drive.
4. Keep release metadata files in sync when building installer updates.
5. After changing auth or storage settings, restart the app to reload runtime configuration.
