const { query } = require("../db/connect");

let ensureLinksTablePromise = null;

function normalizeWhitespace(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeAuthorToken(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

function maybeReorderSurnameFirstName(rawName) {
  const raw = normalizeWhitespace(rawName);
  if (!raw.includes(",")) return raw;

  const parts = raw
    .split(",")
    .map((part) => normalizeWhitespace(part))
    .filter(Boolean);

  if (parts.length !== 2) {
    return raw;
  }

  const left = parts[0];
  const right = parts[1];

  const leftLooksLikeSurname =
    left.split(" ").length === 1 && /^[A-Za-z'`-]+$/.test(left);
  const rightLooksLikeGiven = /^[A-Za-z][A-Za-z.'`\-\s]+$/.test(right);

  if (!leftLooksLikeSurname || !rightLooksLikeGiven) {
    return raw;
  }

  return normalizeWhitespace(`${right} ${left}`);
}

function splitArchiveAuthors(authorsText) {
  const raw = normalizeWhitespace(authorsText);
  if (!raw) return [];

  // Normalize all known author separators first so mixed delimiters
  // like "A, B & C" are handled consistently.
  const normalizedSeparators = raw
    .replace(/\s+and\s+/gi, ";")
    .replace(/\s*&\s*/g, ";")
    .replace(/\s*;\s*/g, ";")
    .replace(/;+/g, ";")
    .replace(/^;|;$/g, "");

  const primaryParts = normalizedSeparators
    .split(";")
    .map((value) => normalizeWhitespace(value))
    .filter(Boolean);

  const allParts = [];

  for (const part of primaryParts) {
    const commaParts = part
      .split(/\s*,\s*/)
      .map((value) => normalizeWhitespace(value))
      .filter(Boolean);

    if (commaParts.length <= 1) {
      allParts.push(part);
      continue;
    }

    const combined = [];
    for (let i = 0; i < commaParts.length; i += 1) {
      const current = commaParts[i];
      const next = commaParts[i + 1];

      const currentLooksLikeSurname =
        current &&
        current.split(" ").length === 1 &&
        /^[A-Za-z'`-]+$/.test(current);
      const nextLooksLikeGiven =
        next &&
        /^(?:[A-Za-z][A-Za-z.'`-]*)(?:\s+[A-Za-z][A-Za-z.'`-]*)+$/i.test(next);

      // Preserve "Surname, Given" formatting as a single author token.
      if (currentLooksLikeSurname && nextLooksLikeGiven) {
        combined.push(`${current}, ${next}`);
        i += 1;
        continue;
      }

      combined.push(current);
    }

    allParts.push(...combined);
  }

  return allParts.filter(Boolean);
}

function toComparableNameParts(rawName) {
  const ordered = maybeReorderSurnameFirstName(rawName);
  const tokens = normalizeWhitespace(ordered)
    .split(" ")
    .map((token) => normalizeAuthorToken(token))
    .filter(Boolean);

  if (tokens.length < 2) {
    return null;
  }

  return {
    surname: tokens[tokens.length - 1],
    given: tokens.slice(0, -1),
  };
}

function tokenMatches(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length === 1 && b.startsWith(a)) return true;
  if (b.length === 1 && a.startsWith(b)) return true;
  return false;
}

function namesMatch(studentName, archiveAuthorName) {
  const student = toComparableNameParts(studentName);
  const author = toComparableNameParts(archiveAuthorName);

  if (!student || !author) return false;
  if (student.surname !== author.surname) return false;

  const studentFirst = student.given[0];
  const authorFirst = author.given[0];
  if (!tokenMatches(studentFirst, authorFirst)) return false;

  const maxMiddleLength = Math.max(student.given.length, author.given.length);
  for (let i = 1; i < maxMiddleLength; i += 1) {
    const studentToken = student.given[i] || "";
    const authorToken = author.given[i] || "";

    if (!studentToken && !authorToken) {
      continue;
    }

    // Missing middle token on either side is tolerated.
    // We still require exact/initial compatibility when both tokens exist.
    if (!studentToken || !authorToken) {
      continue;
    }

    if (!tokenMatches(studentToken, authorToken)) {
      return false;
    }
  }

  return true;
}

function ensureArchiveOjtLinksTable() {
  if (!ensureLinksTablePromise) {
    ensureLinksTablePromise = (async () => {
      await query(`
        CREATE TABLE IF NOT EXISTS archive_ojt_links (
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);
    })().catch((error) => {
      ensureLinksTablePromise = null;
      throw error;
    });
  }

  return ensureLinksTablePromise;
}

async function upsertArchiveStudentLinks(
  archiveId,
  section,
  department,
  studentIds,
) {
  await query("DELETE FROM archive_ojt_links WHERE archive_id = ?", [
    archiveId,
  ]);

  for (const studentId of studentIds) {
    await query(
      `INSERT INTO archive_ojt_links
       (archive_id, ojt_student_id, section, department, linked_by)
       VALUES (?, ?, ?, ?, 'auto-match')
       ON DUPLICATE KEY UPDATE
         section = VALUES(section),
         department = VALUES(department),
         linked_by = VALUES(linked_by),
         updated_at = CURRENT_TIMESTAMP`,
      [archiveId, studentId, section, department],
    );
  }
}

async function syncArchiveLinksByArchiveId(archiveId) {
  await ensureArchiveOjtLinksTable();

  const archiveRows = await query(
    `SELECT id, authors, section, department
     FROM archives
     WHERE id = ?
     LIMIT 1`,
    [archiveId],
  );

  if (!Array.isArray(archiveRows) || archiveRows.length === 0) {
    await query("DELETE FROM archive_ojt_links WHERE archive_id = ?", [
      archiveId,
    ]);
    return;
  }

  const archive = archiveRows[0];
  const section = normalizeWhitespace(archive.section);
  const department = normalizeWhitespace(archive.department);

  if (!section || !department) {
    await query("DELETE FROM archive_ojt_links WHERE archive_id = ?", [
      archive.id,
    ]);
    return;
  }

  const archiveAuthors = splitArchiveAuthors(archive.authors);
  if (!archiveAuthors.length) {
    await query("DELETE FROM archive_ojt_links WHERE archive_id = ?", [
      archive.id,
    ]);
    return;
  }

  const candidateStudents = await query(
    `SELECT id, name
     FROM ojt_students
     WHERE LOWER(TRIM(department)) = LOWER(TRIM(?))
       AND LOWER(TRIM(section)) = LOWER(TRIM(?))`,
    [department, section],
  );

  const matchedStudentIds = (
    Array.isArray(candidateStudents)
      ? candidateStudents.filter((student) =>
          archiveAuthors.some((author) => namesMatch(student.name, author)),
        )
      : []
  ).map((student) => student.id);

  await upsertArchiveStudentLinks(
    archive.id,
    section,
    department,
    matchedStudentIds,
  );
}

async function syncArchiveLinksByStudentId(studentId) {
  await ensureArchiveOjtLinksTable();

  const studentRows = await query(
    `SELECT id, name, section, department
     FROM ojt_students
     WHERE id = ?
     LIMIT 1`,
    [studentId],
  );

  if (!Array.isArray(studentRows) || studentRows.length === 0) {
    await query("DELETE FROM archive_ojt_links WHERE ojt_student_id = ?", [
      studentId,
    ]);
    return;
  }

  const student = studentRows[0];
  const section = normalizeWhitespace(student.section);
  const department = normalizeWhitespace(student.department);

  if (!section || !department) {
    await query("DELETE FROM archive_ojt_links WHERE ojt_student_id = ?", [
      student.id,
    ]);
    return;
  }

  const candidateArchives = await query(
    `SELECT id, authors
     FROM archives
     WHERE LOWER(TRIM(department)) = LOWER(TRIM(?))
       AND LOWER(TRIM(section)) = LOWER(TRIM(?))`,
    [department, section],
  );

  const matchedArchiveIds = (
    Array.isArray(candidateArchives)
      ? candidateArchives.filter((archive) => {
          const archiveAuthors = splitArchiveAuthors(archive.authors);
          return archiveAuthors.some((author) =>
            namesMatch(student.name, author),
          );
        })
      : []
  ).map((archive) => archive.id);

  await query("DELETE FROM archive_ojt_links WHERE ojt_student_id = ?", [
    student.id,
  ]);

  for (const archiveId of matchedArchiveIds) {
    await query(
      `INSERT INTO archive_ojt_links
       (archive_id, ojt_student_id, section, department, linked_by)
       VALUES (?, ?, ?, ?, 'auto-match')
       ON DUPLICATE KEY UPDATE
         section = VALUES(section),
         department = VALUES(department),
         linked_by = VALUES(linked_by),
         updated_at = CURRENT_TIMESTAMP`,
      [archiveId, student.id, section, department],
    );
  }
}

async function removeArchiveLinksByArchiveId(archiveId) {
  await ensureArchiveOjtLinksTable();
  await query("DELETE FROM archive_ojt_links WHERE archive_id = ?", [
    archiveId,
  ]);
}

async function removeArchiveLinksByStudentId(studentId) {
  await ensureArchiveOjtLinksTable();
  await query("DELETE FROM archive_ojt_links WHERE ojt_student_id = ?", [
    studentId,
  ]);
}

async function hydrateStudentLinkMetadata(students) {
  await ensureArchiveOjtLinksTable();

  const list = Array.isArray(students) ? students : [];
  if (!list.length) return list;

  const studentIds = list
    .map((student) => Number.parseInt(student.id, 10))
    .filter((id) => Number.isInteger(id) && id > 0);

  if (!studentIds.length) {
    return list.map((student) => ({
      ...student,
      linked_archive_count: 0,
      linked_archive_title: "",
      linked_archive_id: null,
      has_linked_archive: false,
    }));
  }

  const placeholders = studentIds.map(() => "?").join(",");
  const summaryRows = await query(
    `SELECT
       l.ojt_student_id,
       COUNT(*) AS linked_archive_count,
       GROUP_CONCAT(a.title ORDER BY a.created_at DESC SEPARATOR '||') AS linked_titles,
       GROUP_CONCAT(a.id ORDER BY a.created_at DESC SEPARATOR ',') AS linked_ids
     FROM archive_ojt_links l
     INNER JOIN archives a ON a.id = l.archive_id
     WHERE l.ojt_student_id IN (${placeholders})
     GROUP BY l.ojt_student_id`,
    studentIds,
  );

  const summaryMap = new Map();
  (Array.isArray(summaryRows) ? summaryRows : []).forEach((row) => {
    const studentId = Number.parseInt(row.ojt_student_id, 10);
    if (!Number.isInteger(studentId)) return;

    const count = Number.parseInt(row.linked_archive_count, 10) || 0;
    const linkedTitles = String(row.linked_titles || "")
      .split("||")
      .map((value) => normalizeWhitespace(value))
      .filter(Boolean);
    const linkedIds = String(row.linked_ids || "")
      .split(",")
      .map((value) => Number.parseInt(value, 10))
      .filter((value) => Number.isInteger(value) && value > 0);

    summaryMap.set(studentId, {
      linked_archive_count: count,
      linked_archive_title: linkedTitles[0] || "",
      linked_archive_id: linkedIds[0] || null,
      has_linked_archive: count > 0,
    });
  });

  return list.map((student) => {
    const studentId = Number.parseInt(student.id, 10);
    const metadata = summaryMap.get(studentId) || {
      linked_archive_count: 0,
      linked_archive_title: "",
      linked_archive_id: null,
      has_linked_archive: false,
    };

    return {
      ...student,
      ...metadata,
    };
  });
}

async function syncAllArchiveOjtLinks() {
  await ensureArchiveOjtLinksTable();

  // Remove orphan links first in case archives or students were deleted outside API flows.
  await query(
    `DELETE l
     FROM archive_ojt_links l
     LEFT JOIN archives a ON a.id = l.archive_id
     LEFT JOIN ojt_students s ON s.id = l.ojt_student_id
     WHERE a.id IS NULL OR s.id IS NULL`,
  );

  const archives = await query("SELECT id FROM archives ORDER BY id ASC");
  for (const archive of Array.isArray(archives) ? archives : []) {
    const archiveId = Number.parseInt(archive?.id, 10);
    if (!Number.isInteger(archiveId) || archiveId <= 0) continue;
    await syncArchiveLinksByArchiveId(archiveId);
  }
}

module.exports = {
  ensureArchiveOjtLinksTable,
  syncArchiveLinksByArchiveId,
  syncArchiveLinksByStudentId,
  removeArchiveLinksByArchiveId,
  removeArchiveLinksByStudentId,
  hydrateStudentLinkMetadata,
  syncAllArchiveOjtLinks,
};
