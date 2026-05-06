<!-- markdownlint-disable MD024 -->

# OJT Database Schema and PHP Integration Guide

## Purpose

This document explains the OJT-related database schema currently used by the Smart Academic System CCS repository, including what each table is for, what each column means, and how to connect a future PHP student-side website to the same OJT data and Cloudinary file storage.

This guide is based on the current backend and Electron implementation in the repository.

## High-Level Architecture

The current OJT system is split into three parts:

1. MySQL stores OJT metadata and workflow state.
2. Cloudinary stores uploaded files such as requirement PDFs, attendance proofs, weekly reports, and certificates.
3. The Node.js backend exposes JWT-protected APIs that the Electron app already uses.

That means you have two realistic ways to build a PHP student website:

1. Recommended: PHP calls the existing Node backend APIs and upload endpoints.
2. Alternative: PHP talks directly to MySQL and Cloudinary using PHP code.

The first option is safer because the existing backend already contains:

- validation rules
- workflow transitions
- Cloudinary folder rules
- upload payload formats
- department scoping

## Important Gap Before Building the Student Website

The repo creates student accounts in `students_user`, but the current backend login route authenticates the `users` table, not `students_user`.

That means:

- `users` is for admin/coordinator authentication
- `students_user` appears to be the student account table
- there is no confirmed student-auth API route yet in the inspected backend routes

If you want the PHP student site to reuse the current backend auth model, you should add a student-auth route such as:

- `POST /api/student-auth/login`
- `GET /api/student-auth/profile`

Otherwise, PHP can authenticate students directly against `students_user`, but then PHP becomes the student portal auth layer.

## OJT Core Tables

---

## 1. `ojt_students`

### What this table is for

This is the main OJT student master table. Every OJT workflow hangs off this table. It stores one row per student participating in OJT.

### Schema

```sql
CREATE TABLE ojt_students (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id VARCHAR(120) NOT NULL,
  name VARCHAR(255) NOT NULL,
  section VARCHAR(120) NOT NULL,
  department VARCHAR(120) NOT NULL DEFAULT 'CCS',
  email VARCHAR(255) NULL,
  contact_no VARCHAR(50) NULL,
  status VARCHAR(120) NOT NULL DEFAULT 'Deployed',
  external_partner_assigned VARCHAR(255) NULL,
  nature_of_business VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_ojt_students_student_id (student_id),
  INDEX idx_ojt_students_name (name),
  INDEX idx_ojt_students_section (section),
  INDEX idx_ojt_students_department (department),
  INDEX idx_ojt_students_status (status)
);
```

### Column descriptions

| Column                      | Type         | Description                                                                                                  |
| --------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------ |
| `id`                        | INT PK       | Internal numeric primary key used by other OJT tables.                                                       |
| `student_id`                | VARCHAR(120) | Official student identifier used in UI and API lookups.                                                      |
| `name`                      | VARCHAR(255) | Student full name.                                                                                           |
| `section`                   | VARCHAR(120) | Section assignment of the student.                                                                           |
| `department`                | VARCHAR(120) | Department scope, usually `CCS`. Many APIs filter by this.                                                   |
| `email`                     | VARCHAR(255) | Student email used for account creation and certificate sending.                                             |
| `contact_no`                | VARCHAR(50)  | Student contact number.                                                                                      |
| `status`                    | VARCHAR(120) | Current OJT workflow status. Examples: `Pending Requirements`, `Pre-Deployment`, `Deployed`, `OJT Complete`. |
| `external_partner_assigned` | VARCHAR(255) | Company or partner assigned to the student.                                                                  |
| `nature_of_business`        | VARCHAR(255) | Nature of the assigned partner's business.                                                                   |
| `created_at`                | DATETIME     | Record creation time.                                                                                        |
| `updated_at`                | DATETIME     | Last update time.                                                                                            |

### Notes

- This table is the parent table for requirements, attendance, weekly reports, certificates, and status history.
- The system auto-transitions `status` in some cases.

---

## 2. `ojt_requirement_templates`

### What this table is for

This stores the list of required or optional OJT requirements that students are expected to submit. It supports pre-deployment and post-deployment requirements.

### Schema

```sql
CREATE TABLE ojt_requirement_templates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  type ENUM('pre', 'post') NOT NULL DEFAULT 'pre',
  scope ENUM('department', 'section', 'student') NOT NULL DEFAULT 'department',
  scope_value VARCHAR(255) NULL,
  deadline DATE NULL,
  is_required TINYINT(1) NOT NULL DEFAULT 1,
  display_order INT NOT NULL DEFAULT 0,
  department VARCHAR(120) NOT NULL DEFAULT 'CCS',
  created_by_user_id INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_ort_dept_type (department, type),
  INDEX idx_ort_scope (scope, scope_value)
);
```

### Column descriptions

| Column               | Type                                   | Description                                                                                                                                         |
| -------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                 | INT PK                                 | Template identifier.                                                                                                                                |
| `name`               | VARCHAR(255)                           | Requirement name such as `Curriculum Vitae` or `Narrative Report`.                                                                                  |
| `type`               | ENUM('pre','post')                     | Whether the requirement belongs before deployment or after deployment.                                                                              |
| `scope`              | ENUM('department','section','student') | Who the template applies to.                                                                                                                        |
| `scope_value`        | VARCHAR(255)                           | Scope target value. For department scope this is usually `CCS`, for section scope it is a section name, and for student scope it is the student ID. |
| `deadline`           | DATE                                   | Optional due date.                                                                                                                                  |
| `is_required`        | TINYINT(1)                             | `1` means required, `0` means optional.                                                                                                             |
| `display_order`      | INT                                    | Sort order in the UI.                                                                                                                               |
| `department`         | VARCHAR(120)                           | Department ownership.                                                                                                                               |
| `created_by_user_id` | INT                                    | User who created the template. References `users.id` logically.                                                                                     |
| `created_at`         | DATETIME                               | Creation timestamp.                                                                                                                                 |
| `updated_at`         | DATETIME                               | Last modification timestamp.                                                                                                                        |

### Notes

- Default templates are auto-seeded for `pre` and `post`.
- `is_required = 1` is used in deployment-status checks.

---

## 3. `ojt_requirement_submissions`

### What this table is for

This stores the actual file submissions of students for each requirement template.

### Schema

```sql
CREATE TABLE ojt_requirement_submissions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ojt_student_id INT NOT NULL,
  template_id INT NOT NULL,
  student_id_ref VARCHAR(120) NOT NULL,
  file_url VARCHAR(512) NULL,
  cloudinary_public_id VARCHAR(512) NULL,
  folder_path VARCHAR(512) NULL,
  file_name VARCHAR(255) NULL,
  file_type VARCHAR(50) NULL,
  status ENUM('pending', 'submitted', 'verified', 'rejected') NOT NULL DEFAULT 'pending',
  deadline_override DATE NULL,
  verified_by_user_id INT NULL,
  verified_at DATETIME NULL,
  notes TEXT NULL,
  department VARCHAR(120) NOT NULL DEFAULT 'CCS',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_student_template (ojt_student_id, template_id),
  INDEX idx_ors_student (ojt_student_id),
  INDEX idx_ors_template (template_id),
  INDEX idx_ors_status (status, department)
);
```

### Column descriptions

| Column                 | Type         | Description                                                          |
| ---------------------- | ------------ | -------------------------------------------------------------------- |
| `id`                   | INT PK       | Submission row ID.                                                   |
| `ojt_student_id`       | INT          | Links to `ojt_students.id`.                                          |
| `template_id`          | INT          | Links to `ojt_requirement_templates.id`.                             |
| `student_id_ref`       | VARCHAR(120) | Denormalized student ID kept for easier lookups and debugging.       |
| `file_url`             | VARCHAR(512) | Public Cloudinary URL of the uploaded file.                          |
| `cloudinary_public_id` | VARCHAR(512) | Cloudinary public ID used for update/delete operations.              |
| `folder_path`          | VARCHAR(512) | Cloudinary folder path.                                              |
| `file_name`            | VARCHAR(255) | Original filename or stored logical filename.                        |
| `file_type`            | VARCHAR(50)  | MIME type such as `application/pdf`.                                 |
| `status`               | ENUM         | Submission state: `pending`, `submitted`, `verified`, or `rejected`. |
| `deadline_override`    | DATE         | Student-specific override of the template deadline.                  |
| `verified_by_user_id`  | INT          | User who verified the file.                                          |
| `verified_at`          | DATETIME     | Time the file was verified.                                          |
| `notes`                | TEXT         | Coordinator notes or rejection reason.                               |
| `department`           | VARCHAR(120) | Department ownership.                                                |
| `created_at`           | DATETIME     | Creation timestamp.                                                  |
| `updated_at`           | DATETIME     | Last update timestamp.                                               |

### Notes

- One student can only have one submission per template.
- Uploading a file usually sets status to `submitted`.
- Verification can auto-promote the student to `Pre-Deployment`.
- Rejecting a previously verified pre-requirement can demote status back to `Pending Requirements`.

---

## 4. `ojt_attendance`

### What this table is for

This stores daily OJT attendance records, including proof attachments.

### Schema

```sql
CREATE TABLE ojt_attendance (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ojt_student_id INT NOT NULL,
  student_id_ref VARCHAR(120) NOT NULL,
  attendance_date DATE NOT NULL,
  datetime_in DATETIME NULL,
  datetime_out DATETIME NULL,
  duration_minutes INT NULL,
  status ENUM('present','absent','late','half-day','excused') NOT NULL DEFAULT 'present',
  proof_url VARCHAR(512) NULL,
  proof_public_id VARCHAR(512) NULL,
  notes TEXT NULL,
  recorded_by_user_id INT NULL,
  source ENUM('coordinator','student') NOT NULL DEFAULT 'coordinator',
  department VARCHAR(120) NOT NULL DEFAULT 'CCS',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_oa_student (ojt_student_id),
  INDEX idx_oa_date (attendance_date),
  INDEX idx_oa_dept (department)
);
```

### Column descriptions

| Column                | Type         | Description                                                                      |
| --------------------- | ------------ | -------------------------------------------------------------------------------- |
| `id`                  | INT PK       | Attendance record ID.                                                            |
| `ojt_student_id`      | INT          | Links to `ojt_students.id`.                                                      |
| `student_id_ref`      | VARCHAR(120) | Denormalized student ID.                                                         |
| `attendance_date`     | DATE         | Day of attendance.                                                               |
| `datetime_in`         | DATETIME     | Timestamp when the student timed in.                                             |
| `datetime_out`        | DATETIME     | Timestamp when the student timed out.                                            |
| `duration_minutes`    | INT          | Computed minutes between `datetime_in` and `datetime_out`.                       |
| `status`              | ENUM         | Attendance status such as `present`, `late`, `absent`, `half-day`, or `excused`. |
| `proof_url`           | VARCHAR(512) | Cloudinary URL for attached proof image or PDF.                                  |
| `proof_public_id`     | VARCHAR(512) | Cloudinary public ID for the proof file.                                         |
| `notes`               | TEXT         | Remarks from student or coordinator.                                             |
| `recorded_by_user_id` | INT          | User who recorded the entry.                                                     |
| `source`              | ENUM         | Whether the record came from `student` or `coordinator`.                         |
| `department`          | VARCHAR(120) | Department ownership.                                                            |
| `created_at`          | DATETIME     | Creation timestamp.                                                              |
| `updated_at`          | DATETIME     | Last update timestamp.                                                           |

### Notes

- This table already supports student-submitted attendance by using `source = 'student'`.
- The current backend routes still require JWT auth intended for existing staff users.

---

## 5. `ojt_weekly_reports`

### What this table is for

This stores one weekly report per student per week.

### Schema

```sql
CREATE TABLE ojt_weekly_reports (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ojt_student_id INT NOT NULL,
  student_id_ref VARCHAR(120) NOT NULL,
  week_number INT NOT NULL,
  week_start_date DATE NULL,
  file_url VARCHAR(512) NULL,
  cloudinary_public_id VARCHAR(512) NULL,
  folder_path VARCHAR(512) NULL,
  file_name VARCHAR(255) NULL,
  status ENUM('pending', 'submitted', 'reviewed', 'returned') NOT NULL DEFAULT 'pending',
  submitted_at DATETIME NULL,
  reviewed_by_user_id INT NULL,
  reviewed_at DATETIME NULL,
  feedback TEXT NULL,
  department VARCHAR(120) NOT NULL DEFAULT 'CCS',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_student_week (ojt_student_id, week_number),
  INDEX idx_owr_student (ojt_student_id),
  INDEX idx_owr_dept (department)
);
```

### Column descriptions

| Column                 | Type         | Description                                                   |
| ---------------------- | ------------ | ------------------------------------------------------------- |
| `id`                   | INT PK       | Weekly report ID.                                             |
| `ojt_student_id`       | INT          | Links to `ojt_students.id`.                                   |
| `student_id_ref`       | VARCHAR(120) | Denormalized student ID.                                      |
| `week_number`          | INT          | OJT week index, starting from 1.                              |
| `week_start_date`      | DATE         | Optional start date of the week.                              |
| `file_url`             | VARCHAR(512) | Cloudinary URL of the uploaded weekly report file.            |
| `cloudinary_public_id` | VARCHAR(512) | Cloudinary public ID.                                         |
| `folder_path`          | VARCHAR(512) | Cloudinary folder path.                                       |
| `file_name`            | VARCHAR(255) | Original file name.                                           |
| `status`               | ENUM         | Review state: `pending`, `submitted`, `reviewed`, `returned`. |
| `submitted_at`         | DATETIME     | Timestamp when the report was submitted.                      |
| `reviewed_by_user_id`  | INT          | User who reviewed or returned the report.                     |
| `reviewed_at`          | DATETIME     | Review timestamp.                                             |
| `feedback`             | TEXT         | Review comments or return reason.                             |
| `department`           | VARCHAR(120) | Department ownership.                                         |
| `created_at`           | DATETIME     | Creation timestamp.                                           |
| `updated_at`           | DATETIME     | Last update timestamp.                                        |

### Notes

- Only one row per student per week is allowed.
- The POST endpoint behaves like an upsert.

---

## 6. `ojt_certificates`

### What this table is for

This stores issued OJT certificate files and email-delivery tracking.

### Schema

```sql
CREATE TABLE ojt_certificates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ojt_student_id INT NOT NULL,
  student_id_ref VARCHAR(120) NOT NULL,
  certificate_type VARCHAR(120) NOT NULL DEFAULT 'OJT Certification',
  issue_date DATE NOT NULL,
  file_url VARCHAR(512) NOT NULL,
  cloudinary_public_id VARCHAR(512) NULL,
  folder_path VARCHAR(512) NULL,
  file_name VARCHAR(255) NULL,
  email_status ENUM('pending', 'sent', 'failed') NOT NULL DEFAULT 'pending',
  sent_to_email VARCHAR(255) NULL,
  sent_at DATETIME NULL,
  issued_by_user_id INT NULL,
  notes TEXT NULL,
  department VARCHAR(120) NOT NULL DEFAULT 'CCS',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_oc_student (ojt_student_id),
  INDEX idx_oc_dept (department),
  INDEX idx_oc_email_status (email_status)
);
```

### Column descriptions

| Column                 | Type         | Description                                              |
| ---------------------- | ------------ | -------------------------------------------------------- |
| `id`                   | INT PK       | Certificate row ID.                                      |
| `ojt_student_id`       | INT          | Links to `ojt_students.id`.                              |
| `student_id_ref`       | VARCHAR(120) | Denormalized student ID.                                 |
| `certificate_type`     | VARCHAR(120) | Label for certificate type, default `OJT Certification`. |
| `issue_date`           | DATE         | Date of issuance.                                        |
| `file_url`             | VARCHAR(512) | Cloudinary URL of the certificate PDF.                   |
| `cloudinary_public_id` | VARCHAR(512) | Cloudinary public ID.                                    |
| `folder_path`          | VARCHAR(512) | Cloudinary folder path.                                  |
| `file_name`            | VARCHAR(255) | Filename of the certificate PDF.                         |
| `email_status`         | ENUM         | Whether email sending is `pending`, `sent`, or `failed`. |
| `sent_to_email`        | VARCHAR(255) | Recipient email.                                         |
| `sent_at`              | DATETIME     | Email sent timestamp.                                    |
| `issued_by_user_id`    | INT          | User who issued the certificate.                         |
| `notes`                | TEXT         | Additional notes.                                        |
| `department`           | VARCHAR(120) | Department ownership.                                    |
| `created_at`           | DATETIME     | Creation timestamp.                                      |
| `updated_at`           | DATETIME     | Last update timestamp.                                   |

### Notes

- This is normally a coordinator-side table, not student-side.
- The backend emails the certificate after inserting the row.

---

## 7. `ojt_status_history`

### What this table is for

This is an audit trail of student OJT status changes.

### Schema

```sql
CREATE TABLE ojt_status_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ojt_student_id INT NOT NULL,
  old_status VARCHAR(120) NULL,
  new_status VARCHAR(120) NOT NULL,
  changed_by_user_id INT NULL,
  notes TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_osh_student (ojt_student_id),
  INDEX idx_osh_created (created_at)
);
```

### Column descriptions

| Column               | Type         | Description                 |
| -------------------- | ------------ | --------------------------- |
| `id`                 | INT PK       | Audit row ID.               |
| `ojt_student_id`     | INT          | Links to `ojt_students.id`. |
| `old_status`         | VARCHAR(120) | Previous OJT status.        |
| `new_status`         | VARCHAR(120) | New OJT status.             |
| `changed_by_user_id` | INT          | User who caused the change. |
| `notes`              | TEXT         | Why the status changed.     |
| `created_at`         | DATETIME     | When the change happened.   |

### Notes

- Used for both manual transitions and automatic transitions.

## Supporting OJT Tables

---

## 8. `external_partners`

### What this table is for

This stores companies or external organizations where students are deployed.

### Schema

```sql
CREATE TABLE external_partners (
  id INT AUTO_INCREMENT PRIMARY KEY,
  logo VARCHAR(512) NULL,
  company_name VARCHAR(255) NOT NULL,
  address VARCHAR(255) NOT NULL,
  department VARCHAR(120) NOT NULL DEFAULT 'CCS',
  company_email VARCHAR(255) NULL,
  company_contact VARCHAR(50) NULL,
  representative VARCHAR(255) NULL,
  job_description VARCHAR(255) NULL,
  representative_email VARCHAR(255) NULL,
  representative_contact VARCHAR(50) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_external_partners_company_name (company_name),
  INDEX idx_external_partners_representative (representative)
);
```

### Column descriptions

| Column                   | Type         | Description                                        |
| ------------------------ | ------------ | -------------------------------------------------- |
| `id`                     | INT PK       | Partner ID.                                        |
| `logo`                   | VARCHAR(512) | Cloudinary URL of the partner logo.                |
| `company_name`           | VARCHAR(255) | Name of the company or organization.               |
| `address`                | VARCHAR(255) | Company address.                                   |
| `department`             | VARCHAR(120) | Department ownership.                              |
| `company_email`          | VARCHAR(255) | General company email.                             |
| `company_contact`        | VARCHAR(50)  | General company contact number.                    |
| `representative`         | VARCHAR(255) | Contact person or representative.                  |
| `job_description`        | VARCHAR(255) | Description of the trainee role or job assignment. |
| `representative_email`   | VARCHAR(255) | Representative's email.                            |
| `representative_contact` | VARCHAR(50)  | Representative's phone number.                     |
| `created_at`             | DATETIME     | Creation timestamp.                                |
| `updated_at`             | DATETIME     | Last update timestamp.                             |

---

## 9. `archive_ojt_links`

### What this table is for

This links OJT students to thesis/capstone archive records.

### Schema

```sql
CREATE TABLE archive_ojt_links (
  id INT AUTO_INCREMENT PRIMARY KEY,
  archive_id INT NOT NULL,
  ojt_student_id INT NOT NULL,
  section VARCHAR(120) NOT NULL,
  department VARCHAR(120) NOT NULL,
  linked_by VARCHAR(50) NOT NULL DEFAULT 'auto-match',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_archive_student (archive_id, ojt_student_id),
  KEY idx_archive_ojt_links_archive_id (archive_id),
  KEY idx_archive_ojt_links_student_id (ojt_student_id),
  KEY idx_archive_ojt_links_department_section (department, section)
);
```

### Column descriptions

| Column           | Type         | Description                                     |
| ---------------- | ------------ | ----------------------------------------------- |
| `id`             | INT PK       | Link row ID.                                    |
| `archive_id`     | INT          | Linked thesis/capstone archive record.          |
| `ojt_student_id` | INT          | Links to `ojt_students.id`.                     |
| `section`        | VARCHAR(120) | Student section stored for quick filtering.     |
| `department`     | VARCHAR(120) | Department ownership.                           |
| `linked_by`      | VARCHAR(50)  | How the link was created, such as `auto-match`. |
| `created_at`     | DATETIME     | Creation timestamp.                             |
| `updated_at`     | DATETIME     | Last update timestamp.                          |

### Notes

- Used for capstone/thesis approval display inside OJT student profiles.

---

## 10. `sections`

### What this table is for

This is a simple lookup table of section names.

### Schema

```sql
CREATE TABLE sections (
  id INT NOT NULL AUTO_INCREMENT,
  section_name VARCHAR(120) NOT NULL,
  department VARCHAR(120) NOT NULL DEFAULT 'CCS',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_sections_department (department),
  KEY idx_sections_name (section_name)
);
```

### Column descriptions

| Column         | Type         | Description            |
| -------------- | ------------ | ---------------------- |
| `id`           | INT PK       | Section row ID.        |
| `section_name` | VARCHAR(120) | Section name.          |
| `department`   | VARCHAR(120) | Department ownership.  |
| `created_at`   | TIMESTAMP    | Creation timestamp.    |
| `updated_at`   | TIMESTAMP    | Last update timestamp. |

---

## 11. `section_assignments`

### What this table is for

This maps sections to the assigned coordinator or professor.

### Current schema in backend route

```sql
CREATE TABLE section_assignments (
  id INT NOT NULL AUTO_INCREMENT,
  section_name VARCHAR(120) NOT NULL,
  professor_name VARCHAR(180) NOT NULL,
  professor_email VARCHAR(255) NOT NULL DEFAULT '',
  department VARCHAR(120) NOT NULL DEFAULT 'CCS',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_section_assignments_department (department),
  KEY idx_section_assignments_section (section_name),
  KEY idx_section_assignments_professor (professor_name)
);
```

### Column descriptions

| Column            | Type         | Description                  |
| ----------------- | ------------ | ---------------------------- |
| `id`              | INT PK       | Assignment row ID.           |
| `section_name`    | VARCHAR(120) | Assigned section.            |
| `professor_name`  | VARCHAR(180) | Coordinator/professor name.  |
| `professor_email` | VARCHAR(255) | Coordinator/professor email. |
| `department`      | VARCHAR(120) | Department ownership.        |
| `created_at`      | TIMESTAMP    | Creation timestamp.          |
| `updated_at`      | TIMESTAMP    | Last update timestamp.       |

### Legacy note

An older SQL file in the repo still shows a legacy `date_assigned` column. The active backend route migrates away from that and uses `professor_email` instead.

---

## 12. `students_user` (Inferred Schema)

### What this table is for

This appears to be the student portal account table. It is not defined with a `CREATE TABLE` statement in the inspected repo, but the code clearly reads and writes it.

### Inferred columns from code usage

| Column              | Type     | Confidence | Description                                         |
| ------------------- | -------- | ---------- | --------------------------------------------------- |
| `id`                | INT PK   | High       | Internal row ID.                                    |
| `student_id`        | VARCHAR  | High       | Student ID used to match `ojt_students.student_id`. |
| `name`              | VARCHAR  | High       | Student full name.                                  |
| `email`             | VARCHAR  | High       | Student email.                                      |
| `password`          | VARCHAR  | High       | SHA-256 password hash.                              |
| `status`            | VARCHAR  | High       | Account status, typically `active`.                 |
| `created_at`        | DATETIME | High       | Account creation time.                              |
| `profile_image_url` | VARCHAR  | High       | Student profile image URL.                          |

### Notes

- This is not the same as `users`.
- Current backend login does not appear to authenticate this table.
- A student portal should probably authenticate against this table.

## Referenced External Tables Not Fully Defined Here

These tables are used by OJT flows but their full schema was not found in the inspected files.

### `users`

Used for:

- coordinator/admin login
- `created_by_user_id`
- `verified_by_user_id`
- `reviewed_by_user_id`
- `changed_by_user_id`
- profile images and names

Known fields from usage:

- `id`
- `user_id`
- `name`
- `email`
- `role`
- `department`
- `status`
- `password`
- `profile_image`

### `archives`

Used for:

- thesis/capstone records linked through `archive_ojt_links`

Known fields from usage:

- `id`
- `title`
- `type`
- `status`
- `authors`
- `section`
- `department`
- `created_at`

## OJT Status Workflow

The current backend behavior is:

1. `Pending Requirements`
2. `Pre-Deployment`
3. `Deployed`
4. `OJT Complete`

### How transitions happen

- `Pending Requirements` to `Pre-Deployment`
  - automatic
  - happens when all required pre-requirements are verified

- `Pre-Deployment` to `Deployed`
  - manual
  - coordinator action

- `Deployed` to `OJT Complete`
  - manual
  - usually after post-requirements and certificate flow

- `Pre-Deployment` back to `Pending Requirements`
  - automatic demotion
  - happens if a previously verified requirement is rejected

## Cloudinary Storage Rules

The backend already enforces folder conventions.

### Allowed OJT upload folders

- `Daily Reports`
- `Post Requirements`
- `Pre Requirements`
- `Profile`
- `Weekly Reports`

### OJT file folder pattern

```text
HTA Files/OJT Requirements/{studentId}/{folderType}
```

Examples:

- `HTA Files/OJT Requirements/2022-0001/Pre Requirements`
- `HTA Files/OJT Requirements/2022-0001/Weekly Reports`

### Certificate folder pattern

```text
HTA Files/OJT Certificates/{studentId}/Certificates
```

### What gets stored in MySQL after Cloudinary upload

For most OJT file tables, you should save:

- `file_url`
- `cloudinary_public_id`
- `folder_path`
- `file_name`
- sometimes `file_type`

## Recommended PHP Integration Strategy

### Best practice

Use PHP as the website layer, but keep the Node backend as the business/API layer.

That means:

- PHP frontend sends requests to Node backend
- Node backend handles validation and DB rules
- Node backend handles Cloudinary upload
- PHP only renders pages and manages sessions

This avoids duplicating business rules in PHP.

### Required request headers

Most OJT routes need:

- `Authorization: Bearer {jwt}`
- `x-department: CCS`

### Login flow if reusing existing backend

Current backend login:

```http
POST /api/auth/login
Content-Type: application/json
```

Body:

```json
{
  "email": "staff@example.com",
  "password": "your-password",
  "departmentCode": "CCS"
}
```

Response:

```json
{
  "success": true,
  "token": "JWT_TOKEN",
  "user": {
    "id": 1,
    "user_id": "A26-12345",
    "name": "Coordinator Name",
    "email": "staff@example.com",
    "role": "coordinator",
    "department_code": "CCS",
    "is_super_admin": false
  }
}
```

### Important for student portal

This login flow is for `users`, not confirmed for `students_user`.

For a real student-side PHP website, you should add a student-auth flow first.

## PHP Option A: Recommended Architecture

### Flow

1. Student logs into PHP website.
2. PHP verifies student identity.
3. PHP server calls Node backend APIs using a server-side token or a new student-auth token.
4. PHP renders the returned data.

This keeps DB credentials and Cloudinary credentials off the browser.

## PHP Option B: Direct DB + Cloudinary from PHP

This is possible, but then PHP must reimplement:

- table lookups
- file folder rules
- status workflow
- verification rules
- auto-transition rules

Use this only if you are intentionally replacing the Node backend.

## PHP Example: Reusable API Helper

```php
<?php

function apiRequest(string $method, string $url, ?array $jsonBody = null, ?string $token = null, array $extraHeaders = []): array
{
    $ch = curl_init($url);

    $headers = [
        'Accept: application/json',
        'x-department: CCS',
    ];

    if ($token) {
        $headers[] = 'Authorization: Bearer ' . $token;
    }

    foreach ($extraHeaders as $header) {
        $headers[] = $header;
    }

    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);

    if ($jsonBody !== null) {
        $payload = json_encode($jsonBody);
        $headers[] = 'Content-Type: application/json';
        curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
    }

    curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);

    $response = curl_exec($ch);
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);

    if ($response === false) {
        throw new Exception(curl_error($ch));
    }

    curl_close($ch);

    return [
        'status' => $status,
        'data' => json_decode($response, true),
    ];
}
```

## PHP Example: Login

```php
<?php

$baseUrl = 'http://localhost:3000';

$result = apiRequest('POST', $baseUrl . '/api/auth/login', [
    'email' => 'coordinator@example.com',
    'password' => 'secret',
    'departmentCode' => 'CCS'
]);

if (!empty($result['data']['success'])) {
    $token = $result['data']['token'];
}
```

## Fetching OJT Data for a Student

## 1. Fetch student profile

Current route:

```http
GET /api/ojt-coordinator/student/{studentId}
```

Use this for coordinator/admin views.

Example:

```php
<?php

$studentId = '2022-0001';

$result = apiRequest(
    'GET',
    $baseUrl . '/api/ojt-coordinator/student/' . urlencode($studentId),
    null,
    $token
);

$student = $result['data']['student'] ?? null;
```

## 2. Fetch requirement submissions

### Pre requirements

```http
GET /api/ojt-requirements/submissions/{studentId}?type=pre
```

### Post requirements

```http
GET /api/ojt-requirements/submissions/{studentId}?type=post
```

Example:

```php
<?php

$result = apiRequest(
    'GET',
    $baseUrl . '/api/ojt-requirements/submissions/' . urlencode($studentId) . '?type=pre',
    null,
    $token
);

$requirements = $result['data']['requirements'] ?? [];
```

## 3. Fetch attendance

```http
GET /api/ojt-attendance/{studentId}
GET /api/ojt-attendance/{studentId}?month=2026-05
```

Example:

```php
<?php

$result = apiRequest(
    'GET',
    $baseUrl . '/api/ojt-attendance/' . urlencode($studentId) . '?month=2026-05',
    null,
    $token
);

$records = $result['data']['records'] ?? [];
$summary = $result['data']['summary'] ?? [];
```

## 4. Fetch weekly reports

```http
GET /api/ojt-weekly-reports/{studentId}
```

## 5. Fetch certificates

```http
GET /api/ojt-certificates/{studentId}
```

## Uploading Files Through the Existing Backend

### General pattern

For requirements, attendance proof, and weekly reports, the upload flow is always:

1. upload file to Cloudinary through backend upload route
2. get `url`, `public_id`, and `folder`
3. save that metadata into the correct MySQL table through the correct API route

This is important. Do not insert DB rows first and upload later unless you also handle rollback logic.

### File limits and allowed types

#### `/api/upload/ojt-file`

- max size: 25 MB
- allowed MIME types:
  - `application/pdf`
  - `image/jpeg`
  - `image/png`
  - `image/gif`
  - `image/webp`

#### `/api/upload/ojt-certificate`

- max size: 25 MB
- PDF only

## PHP Example: Multipart Upload Helper

```php
<?php

function uploadFileToApi(string $url, string $filePath, array $fields, string $token): array
{
    $ch = curl_init($url);

    $postFields = $fields;
    $postFields['file'] = new CURLFile($filePath);

    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, $postFields);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Accept: application/json',
        'Authorization: Bearer ' . $token,
        'x-department: CCS',
    ]);

    $response = curl_exec($ch);

    if ($response === false) {
        throw new Exception(curl_error($ch));
    }

    curl_close($ch);

    return json_decode($response, true);
}
```

## Upload flow: Pre/Post requirement submission

### Step 1. Upload file to Cloudinary through backend

```php
<?php

$upload = uploadFileToApi(
    $baseUrl . '/api/upload/ojt-file',
    __DIR__ . '/uploads/cv.pdf',
    [
        'studentId' => '2022-0001',
        'folderType' => 'Pre Requirements',
        'fileName' => 'cv.pdf',
    ],
    $token
);
```

Expected response:

```json
{
  "success": true,
  "url": "https://res.cloudinary.com/...",
  "public_id": "2022_0001_Pre_Requirements_....",
  "folder": "HTA Files/OJT Requirements/2022-0001/Pre Requirements"
}
```

### Step 2. Save submission row

```php
<?php

$templateId = 1;

$save = apiRequest('POST', $baseUrl . '/api/ojt-requirements/submissions', [
    'student_id' => '2022-0001',
    'template_id' => $templateId,
    'file_url' => $upload['url'],
    'cloudinary_public_id' => $upload['public_id'],
    'folder_path' => $upload['folder'],
    'file_name' => 'cv.pdf',
    'file_type' => 'application/pdf'
], $token);
```

## Upload flow: Weekly report

### Step 1. Upload file

Use folder type:

- `Weekly Reports`

### Step 2. Save row in `ojt_weekly_reports`

```php
<?php

$save = apiRequest('POST', $baseUrl . '/api/ojt-weekly-reports', [
    'student_id' => '2022-0001',
    'week_number' => 3,
    'week_start_date' => '2026-05-04',
    'file_url' => $upload['url'],
    'cloudinary_public_id' => $upload['public_id'],
    'folder_path' => $upload['folder'],
    'file_name' => 'week3.pdf'
], $token);
```

## Upload flow: Attendance proof

### Step 1. Upload file

Use folder type:

- `Daily Reports`

### Step 2. Save row in `ojt_attendance`

```php
<?php

$save = apiRequest('POST', $baseUrl . '/api/ojt-attendance', [
    'student_id' => '2022-0001',
    'attendance_date' => '2026-05-06',
    'datetime_in' => '2026-05-06 08:00:00',
    'datetime_out' => '2026-05-06 17:00:00',
    'status' => 'present',
    'proof_url' => $upload['url'],
    'proof_public_id' => $upload['public_id'],
    'notes' => 'Submitted by student',
    'source' => 'student'
], $token);
```

## Upload flow: Certificate

Normally this is not a student action, but the backend flow is:

1. upload PDF to `/api/upload/ojt-certificate`
2. create DB row in `/api/ojt-certificates`

Example:

```php
<?php

$upload = uploadFileToApi(
    $baseUrl . '/api/upload/ojt-certificate',
    __DIR__ . '/uploads/certificate.pdf',
    [
        'studentId' => '2022-0001',
        'fileName' => 'certificate.pdf',
    ],
    $token
);

$save = apiRequest('POST', $baseUrl . '/api/ojt-certificates', [
    'student_id' => '2022-0001',
    'certificate_type' => 'OJT Certification',
    'issue_date' => '2026-05-06',
    'file_url' => $upload['url'],
    'cloudinary_public_id' => $upload['public_id'],
    'folder_path' => $upload['folder'],
    'file_name' => 'certificate.pdf'
], $token);
```

## Direct MySQL Access from PHP

If you decide not to call the Node backend and want PHP to read MySQL directly, use PDO and prepared statements.

### PDO connection example

```php
<?php

$pdo = new PDO(
    'mysql:host=YOUR_HOST;port=3306;dbname=YOUR_DB;charset=utf8mb4',
    'YOUR_USER',
    'YOUR_PASSWORD',
    [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]
);
```

### Example: Fetch one OJT student profile directly

```php
<?php

$sql = "
    SELECT
        os.id,
        os.student_id,
        os.name,
        os.section,
        os.department,
        os.email,
        os.contact_no,
        os.status,
        os.external_partner_assigned,
        os.nature_of_business,
        su.profile_image_url
    FROM ojt_students os
    LEFT JOIN students_user su
        ON LOWER(TRIM(su.student_id)) = LOWER(TRIM(os.student_id))
    WHERE os.student_id = :student_id
      AND os.department = :department
    LIMIT 1
";

$stmt = $pdo->prepare($sql);
$stmt->execute([
    ':student_id' => '2022-0001',
    ':department' => 'CCS',
]);

$student = $stmt->fetch();
```

### Example: Fetch requirements directly

```php
<?php

$sql = "
    SELECT
        t.id AS template_id,
        t.name AS template_name,
        t.type,
        t.scope,
        t.scope_value,
        t.deadline,
        t.is_required,
        s.id AS submission_id,
        s.file_url,
        s.cloudinary_public_id,
        s.file_name,
        s.file_type,
        s.status,
        s.notes,
        s.verified_at
    FROM ojt_students os
    JOIN ojt_requirement_templates t
      ON t.department = os.department
     AND t.type = :type
     AND (
         (t.scope = 'department' AND t.scope_value = os.department)
      OR (t.scope = 'section' AND t.scope_value = os.section)
      OR (t.scope = 'student' AND t.scope_value = os.student_id)
     )
    LEFT JOIN ojt_requirement_submissions s
      ON s.ojt_student_id = os.id
     AND s.template_id = t.id
     AND s.department = os.department
    WHERE os.student_id = :student_id
      AND os.department = :department
    ORDER BY t.display_order ASC, t.id ASC
";

$stmt = $pdo->prepare($sql);
$stmt->execute([
    ':type' => 'pre',
    ':student_id' => '2022-0001',
    ':department' => 'CCS',
]);

$requirements = $stmt->fetchAll();
```

## Direct Cloudinary Upload from PHP

If PHP uploads directly to Cloudinary, do this only on the server side, never from exposed frontend code.

### Typical process

1. receive uploaded file in PHP
2. upload to Cloudinary
3. get `secure_url`, `public_id`
4. store those values in MySQL

### Example with Cloudinary PHP SDK

```php
<?php

require 'vendor/autoload.php';

use Cloudinary\Configuration\Configuration;
use Cloudinary\Api\Upload\UploadApi;

Configuration::instance([
    'cloud' => [
        'cloud_name' => 'YOUR_CLOUD_NAME',
        'api_key'    => 'YOUR_API_KEY',
        'api_secret' => 'YOUR_API_SECRET',
    ],
    'url' => [
        'secure' => true,
    ],
]);

$studentId = '2022-0001';
$folderType = 'Pre Requirements';

$result = (new UploadApi())->upload(
    __DIR__ . '/uploads/cv.pdf',
    [
        'folder' => "HTA Files/OJT Requirements/{$studentId}/{$folderType}",
        'resource_type' => 'auto',
    ]
);

$fileUrl = $result['secure_url'] ?? null;
$publicId = $result['public_id'] ?? null;
```

Then insert into `ojt_requirement_submissions` or another target table.

## Recommended Implementation Plan for the Student PHP Website

### Phase 1

Build read-only student pages first:

- profile
- pre requirements
- post requirements
- attendance
- weekly reports
- certificate history

### Phase 2

Add uploads:

- requirement uploads
- attendance proof uploads
- weekly report uploads

### Phase 3

Add student authentication properly:

- create a student auth route for `students_user`
- issue JWTs for student users
- restrict student access so each student can only access their own records

### Phase 4

Add student-safe APIs:

- `GET /api/student/me`
- `GET /api/student/requirements?type=pre`
- `POST /api/student/requirements/upload`
- `GET /api/student/attendance`
- `POST /api/student/attendance`
- `GET /api/student/weekly-reports`
- `POST /api/student/weekly-reports`

This is better than exposing the coordinator routes directly to students.

## Practical Recommendation

For your PHP student-side website, the cleanest architecture is:

1. keep MySQL and Cloudinary ownership in the existing Node backend
2. add student-auth support using `students_user`
3. add student-safe API routes
4. let PHP consume those APIs and render the student portal

That gives you:

- less duplicated logic
- consistent workflow rules
- safer Cloudinary usage
- fewer schema mistakes

## Source of Truth in the Repo

The schema and behavior in this guide were derived from these backend areas:

- `backend/routes/ojt-requirements.js`
- `backend/routes/ojt-attendance.js`
- `backend/routes/ojt-weekly-reports.js`
- `backend/routes/ojt-certificates.js`
- `backend/routes/ojt-coordinator.js`
- `backend/routes/ojt-students.js`
- `backend/routes/upload.js`
- `backend/services/cloudinary.js`
- `backend/services/student-user.js`
- `backend/helpers/archive-ojt-link.js`
- `backend/routes/section-assignments.js`
- `backend/routes/sections.js`
- `electron/main.js`

## Final Notes

- `students_user` is partially inferred because its full `CREATE TABLE` statement was not found in the inspected files.
- `users` and `archives` are clearly required by OJT features, but their full schema was not fully present in the inspected OJT-related files.
- If you want one unified student website, add student JWT auth first before exposing upload actions.
