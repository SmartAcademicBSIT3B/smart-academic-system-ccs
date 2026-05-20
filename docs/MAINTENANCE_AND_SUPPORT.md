# Smart Academic System - Maintenance and Support

This document defines practical maintenance routines and support practices to keep the system stable, secure, and recoverable.

## 1) Maintenance Objectives

1. Keep the application available and responsive.
2. Prevent data loss through consistent backups.
3. Detect issues early before users are impacted.
4. Reduce downtime with repeatable support procedures.

## 2) System Maintenance Tips

### A) Daily Maintenance

1. Verify backend health endpoint is reachable.
   - Dev/local: http://localhost:3000/health
2. Check app startup in at least one admin account and one coordinator account.
3. Review critical logs for new errors:
   - Electron main process logs
   - Backend logs
   - Renderer console errors (if UI issue reported)
4. Confirm notifications and key workflows still function:
   - Login
   - Profile load
   - Archive list fetch
   - Coordinator list/sections

### B) Weekly Maintenance

1. Validate environment configuration:
   - DB, JWT, Cloudinary, Google OAuth, Mail values are present and correct.
2. Verify Google Drive authorization status and token validity.
3. Verify Cloudinary upload path by uploading one test image.
4. Check disk usage on hosts running backend or storing export/import files.
5. Run dependency checks and review outdated packages before updating.

### C) Monthly Maintenance

1. Perform backup and restore drill using non-production copy.
2. Validate release/update pipeline artifacts (latest.yml, app-update.yml for installer updates).
3. Review account hygiene:
   - Disable inactive users when applicable.
   - Verify role assignments are correct per department.
4. Review security settings:
   - Rotate credentials where policy requires.
   - Confirm JWT secret handling remains secure.
5. Review performance trends from logs:
   - Slow endpoints
   - Frequent retries/timeouts
   - Repeated auth failures

## 3) Preventive Maintenance Checklist

Use this quick checklist before and after deployments:

1. Confirm database connectivity with current credentials.
2. Confirm backend starts cleanly without unhandled errors.
3. Confirm app can reach API and pass readiness checks.
4. Confirm critical integrations are working:
   - Google Drive auth/upload
   - Cloudinary image upload
   - Mail OTP send
5. Confirm department setup and role-based access still works.
6. Confirm version and release files are consistent.

## 4) Data Protection and Backup Tips

1. Schedule regular exports of critical data (archives, OJT datasets, users, assignments).
2. Keep at least three backup generations:
   - Latest
   - Previous stable
   - Monthly snapshot
3. Store backups in separate location from live runtime.
4. Test restore procedure regularly; do not assume backups are valid.
5. Document backup timestamp, source version, and operator for each backup.

## 5) Update and Patch Management Tips

1. Apply updates first in a staging/test environment.
2. Validate login, archive operations, OJT workflows, and settings after update.
3. Keep release notes for every deployed version.
4. If auto-update fails, verify packaged build metadata and GitHub publish config.
5. Keep a rollback plan (previous installer and compatible backup) ready.

## 6) Incident Support Workflow

### Step 1: Classify impact

1. Critical: system unavailable, login unavailable, data corruption risk.
2. High: major feature unusable for many users.
3. Medium: partial feature issue with workaround.
4. Low: cosmetic/minor behavior issue.

### Step 2: Collect evidence

1. Exact error message text.
2. Time of incident and user action.
3. App version and environment (dev, installed app, server).
4. Backend health result and diagnostics.
5. Relevant logs and screenshots.

### Step 3: Stabilize

1. Restart affected process only if safe.
2. If integration-specific failure exists, isolate that feature while preserving core access.
3. Communicate temporary workaround to affected users.

### Step 4: Resolve and verify

1. Apply fix in controlled order (config, service, code, data).
2. Verify critical workflows after fix.
3. Record root cause and prevention action.

## 7) Support Communication Template

Use this format for internal support updates:

1. Issue summary
2. Affected users/departments
3. Current status (investigating, mitigated, resolved)
4. Temporary workaround
5. Expected next update time

## 8) Escalation Triggers

Escalate to development team immediately when:

1. Repeated Internal server error appears with no clear config cause.
2. Authentication errors persist after valid credential/config checks.
3. Database connectivity is unstable or data inconsistency is suspected.
4. OAuth, Cloudinary, or mail integration fails after credential validation.
5. Installer update behavior is broken across multiple endpoints.

## 9) Related Documents

1. Full troubleshooting: docs/TROUBLESHOOTING.md
2. Role-based troubleshooting: docs/TROUBLESHOOTING_ROLE_BASED.md
