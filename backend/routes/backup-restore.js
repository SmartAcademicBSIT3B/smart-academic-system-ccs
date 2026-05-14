const express = require("express");
const path = require("node:path");
const fs = require("node:fs/promises");
const archiverModule = require("archiver");
const multer = require("multer");

const { pool, query } = require("../db/connect");
const { requireAuth } = require("../middleware/auth");
const { rowsToCsv, csvToRows } = require("../services/backup-csv");
const { extractCsvEntriesFromZipBuffer } = require("../services/backup-zip");

const router = express.Router();

const DEPT_HEADER = "x-department";
const CSV_IMPORT_UPLOAD = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024,
  },
});

const CORE_EXPORT_TABLES = [
  "external_partners",
  "users",
  "section_assignments",
  "ojt_students",
];

const OJT_EXPORT_TABLES = [
  "ojt_students",
  "ojt_attendance",
  "ojt_certificates",
  "ojt_requirement_submissions",
  "ojt_status_history",
  "ojt_student_schedules",
  "ojt_weekly_reports",
  "students_user",
];

const SELECTED_IMPORT_TABLES = [
  "external_partners",
  "users",
  "ojt_students",
  "section_assignments",
];

const OJT_IMPORT_TABLES = [
  "ojt_students",
  "ojt_attendance",
  "ojt_certificates",
  "ojt_requirement_submissions",
  "ojt_status_history",
  "ojt_student_schedules",
  "ojt_weekly_reports",
  "students_user",
  "section_assignments",
];

function createZipArchive(options = {}) {
  if (typeof archiverModule === "function") {
    return archiverModule("zip", options);
  }

  if (archiverModule && typeof archiverModule.ZipArchive === "function") {
    return new archiverModule.ZipArchive(options);
  }

  throw new TypeError("Archiver zip constructor is unavailable.");
}

const IMPORT_KEY_CANDIDATES = {
  external_partners: [["id"], ["company_name", "department"]],
  users: [["id"], ["user_id"], ["email"]],
  ojt_students: [["id"], ["student_id", "department"]],
  ojt_attendance: [["id"], ["ojt_student_id", "attendance_date", "department"]],
  ojt_certificates: [
    ["id"],
    ["ojt_student_id", "issue_date", "department", "file_name"],
  ],
  ojt_requirement_submissions: [["id"], ["ojt_student_id", "template_id"]],
  ojt_status_history: [["id"], ["ojt_student_id", "created_at", "new_status"]],
  ojt_student_schedules: [
    ["id"],
    ["ojt_student_id", "day_of_week", "department"],
  ],
  ojt_weekly_reports: [["id"], ["ojt_student_id", "week_number"]],
  students_user: [["student_id"], ["email"], ["id"]],
  section_assignments: [["id"], ["section_name", "department"]],
};

function getDept(req) {
  return (
    String(
      req.headers[DEPT_HEADER] || req.user?.department_code || "CCS",
    ).trim() || "CCS"
  );
}

function getExportCodeName(req) {
  const departmentCode =
    getDept(req)
      .replace(/[^A-Za-z0-9_-]+/g, "")
      .trim() || "CCS";
  return `${departmentCode}_Export`;
}

function getDateStamp() {
  return new Date().toISOString().slice(0, 10);
}

function buildZipFileName(req, kind) {
  const safeKind = String(kind || "backup")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-");
  return `${getExportCodeName(req)}_${safeKind}_${getDateStamp()}.zip`;
}

function sanitizeFileName(fileName, fallback = "file") {
  const clean = String(fileName || "")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120);
  return clean || fallback;
}

function normalizeTableName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/`/g, "")
    .replace(/[^a-z0-9_]/g, "");
}

function normalizeCsvFileTableName(fileName) {
  const base = String(fileName || "")
    .replace(/\\/g, "/")
    .split("/")
    .pop()
    .replace(/\.csv$/i, "")
    .trim()
    .toLowerCase();

  return base.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function setZipHeaders(res, fileName) {
  res.setHeader("Content-Type", "application/zip");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${sanitizeFileName(fileName, "backup")}"`,
  );
}

async function getTableColumns(tableName) {
  const rows = await query(
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
     ORDER BY ORDINAL_POSITION ASC`,
    [tableName],
  );

  return Array.isArray(rows)
    ? rows.map((row) => String(row.COLUMN_NAME || "").trim()).filter(Boolean)
    : [];
}

async function tableExists(tableName) {
  const rows = await query(
    `SELECT TABLE_NAME
     FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
     LIMIT 1`,
    [tableName],
  );
  return Array.isArray(rows) && rows.length > 0;
}

function hasDepartmentColumn(columns) {
  if (columns.includes("department")) return "department";
  if (columns.includes("department_code")) return "department_code";
  return "";
}

async function selectTableRows(tableName, dept) {
  const columns = await getTableColumns(tableName);
  if (!columns.length) {
    return { columns: [], rows: [] };
  }

  const deptColumn = hasDepartmentColumn(columns);
  const sql = deptColumn
    ? `SELECT * FROM \`${tableName}\` WHERE \`${deptColumn}\` = ? ORDER BY 1 ASC`
    : `SELECT * FROM \`${tableName}\` ORDER BY 1 ASC`;

  const rows = await query(sql, deptColumn ? [dept] : []);
  return { columns, rows: Array.isArray(rows) ? rows : [] };
}

async function appendTableCsvEntries(archive, tableNames, dept, report) {
  for (const tableName of tableNames) {
    const exists = await tableExists(tableName);
    if (!exists) {
      report.missingTables.push(tableName);
      continue;
    }

    const { columns, rows } = await selectTableRows(tableName, dept);
    const csvText = rowsToCsv(rows, columns);
    archive.append(csvText, { name: `csv/${tableName}.csv` });

    report.tables.push({
      table: tableName,
      rowCount: rows.length,
      scopedByDepartment: Boolean(hasDepartmentColumn(columns)),
    });
  }
}

function resolveArchiveAttachmentCandidates(row) {
  const candidates = [];
  const localFilePath = String(row?.local_file_path || "").trim();
  const remoteFilePath = String(row?.file_path || "").trim();

  if (localFilePath) {
    candidates.push({
      type: "local",
      value: localFilePath,
    });
  }

  if (remoteFilePath) {
    candidates.push({
      type: /^https?:\/\//i.test(remoteFilePath) ? "url" : "local",
      value: remoteFilePath,
    });
  }

  return candidates;
}

async function readLocalFileIfExists(filePath) {
  try {
    await fs.access(filePath);
    const buffer = await fs.readFile(filePath);
    return buffer;
  } catch (_error) {
    return null;
  }
}

async function fetchRemoteFile(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (_error) {
    return null;
  }
}

async function buildArchiveBackupEntries(dept, report) {
  const { columns, rows } = await selectTableRows("archives", dept);
  const archiveLinks = (await tableExists("archive_ojt_links"))
    ? await selectTableRows("archive_ojt_links", dept)
    : { columns: [], rows: [] };

  const entries = [];
  entries.push({
    name: "csv/archives.csv",
    content: rowsToCsv(rows, columns),
  });

  if (archiveLinks.columns.length) {
    entries.push({
      name: "csv/archive_ojt_links.csv",
      content: rowsToCsv(archiveLinks.rows, archiveLinks.columns),
    });
  }

  const missingFiles = [];
  let attachedCount = 0;

  for (const row of rows) {
    const archiveId = Number.parseInt(row?.id, 10) || 0;
    const title = sanitizeFileName(
      row?.title,
      `archive_${archiveId || Date.now()}`,
    );
    const candidates = resolveArchiveAttachmentCandidates(row);

    let attached = false;
    for (const candidate of candidates) {
      let buffer = null;
      if (candidate.type === "local") {
        buffer = await readLocalFileIfExists(candidate.value);
      } else if (candidate.type === "url") {
        buffer = await fetchRemoteFile(candidate.value);
      }

      if (buffer) {
        const sourceName = sanitizeFileName(
          path.basename(candidate.value),
          "document.bin",
        );
        const targetName = `attachments/${archiveId || "na"}_${title}_${sourceName}`;
        entries.push({
          name: targetName,
          buffer,
        });
        attached = true;
        attachedCount += 1;
        break;
      }
    }

    if (!attached) {
      missingFiles.push({
        archive_id: archiveId || null,
        title: row?.title || "",
        file_path: row?.file_path || "",
        local_file_path: row?.local_file_path || "",
        reason: "Attachment could not be downloaded or found.",
      });
    }
  }

  if (missingFiles.length) {
    entries.push({
      name: "reports/missing_files.csv",
      content: rowsToCsv(missingFiles, [
        "archive_id",
        "title",
        "file_path",
        "local_file_path",
        "reason",
      ]),
    });
  }

  report.tables.push({
    table: "archives",
    rowCount: rows.length,
    scopedByDepartment: true,
  });

  if (archiveLinks.columns.length) {
    report.tables.push({
      table: "archive_ojt_links",
      rowCount: archiveLinks.rows.length,
      scopedByDepartment: true,
    });
  }

  report.attachmentsIncluded = attachedCount;
  report.attachmentsMissing = missingFiles.length;

  return entries;
}

function pickImportKeys(tableName, tableColumns, rows) {
  const candidates = IMPORT_KEY_CANDIDATES[tableName] || [["id"]];

  for (const candidate of candidates) {
    const allColumnsExist = candidate.every((col) =>
      tableColumns.includes(col),
    );
    if (!allColumnsExist) continue;

    const hasValueInSomeRow = rows.some((row) =>
      candidate.every((col) => {
        const value = row?.[col];
        return (
          value !== undefined && value !== null && String(value).trim() !== ""
        );
      }),
    );

    if (hasValueInSomeRow) return candidate;
  }

  return [];
}

function normalizeCellValue(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  if (text === "") return null;
  return text;
}

function normalizeImportRow(rawRow, tableColumns, dept) {
  const out = {};
  for (const key of tableColumns) {
    if (Object.prototype.hasOwnProperty.call(rawRow, key)) {
      out[key] = normalizeCellValue(rawRow[key]);
    }
  }

  if (tableColumns.includes("department") && !out.department) {
    out.department = dept;
  }
  if (tableColumns.includes("department_code") && !out.department_code) {
    out.department_code = dept;
  }

  return out;
}

function buildWhereClauseFromKeys(keys) {
  const parts = keys.map((key) => `\`${key}\` <=> ?`);
  return parts.join(" AND ");
}

async function runTableImport(tableName, incomingRows, dept) {
  const rows = Array.isArray(incomingRows) ? incomingRows : [];
  const result = {
    table: tableName,
    totalRows: rows.length,
    inserted: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    keyColumns: [],
    errors: [],
  };

  if (!rows.length) return result;

  const tableColumns = await getTableColumns(tableName);
  if (!tableColumns.length) {
    result.failed = rows.length;
    result.errors.push("Table does not exist in current schema.");
    return result;
  }

  const keyColumns = pickImportKeys(tableName, tableColumns, rows);
  result.keyColumns = keyColumns;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    for (let index = 0; index < rows.length; index += 1) {
      const row = normalizeImportRow(rows[index], tableColumns, dept);
      const insertColumns = Object.keys(row).filter((col) =>
        tableColumns.includes(col),
      );

      if (!insertColumns.length) {
        result.skipped += 1;
        continue;
      }

      const canUseKeys =
        keyColumns.length > 0 &&
        keyColumns.every((key) => row[key] !== undefined && row[key] !== null);

      try {
        let existingMatch = false;
        if (canUseKeys) {
          const whereSql = buildWhereClauseFromKeys(keyColumns);
          const whereParams = keyColumns.map((key) => row[key]);
          const [matches] = await connection.execute(
            `SELECT 1 FROM \`${tableName}\` WHERE ${whereSql} LIMIT 1`,
            whereParams,
          );
          existingMatch = Array.isArray(matches) && matches.length > 0;
        }

        if (existingMatch) {
          const updateColumns = insertColumns.filter((col) => col !== "id");
          if (!updateColumns.length) {
            result.skipped += 1;
            continue;
          }

          const setSql = updateColumns
            .map((col) => `\`${col}\` = ?`)
            .join(", ");
          const setParams = updateColumns.map((col) => row[col]);
          const whereSql = buildWhereClauseFromKeys(keyColumns);
          const whereParams = keyColumns.map((key) => row[key]);
          await connection.execute(
            `UPDATE \`${tableName}\` SET ${setSql} WHERE ${whereSql}`,
            [...setParams, ...whereParams],
          );
          result.updated += 1;
          continue;
        }

        const placeholders = insertColumns.map(() => "?").join(", ");
        const insertSql = `INSERT INTO \`${tableName}\` (${insertColumns
          .map((col) => `\`${col}\``)
          .join(", ")}) VALUES (${placeholders})`;
        const insertParams = insertColumns.map((col) => row[col]);
        await connection.execute(insertSql, insertParams);
        result.inserted += 1;
      } catch (error) {
        result.failed += 1;
        result.errors.push(`Row ${index + 1}: ${error.message}`);
      }
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    result.failed = rows.length;
    result.inserted = 0;
    result.updated = 0;
    result.skipped = 0;
    result.errors = [error.message || "Transaction failed."];
  } finally {
    connection.release();
  }

  return result;
}

async function resolveCsvRowsFromUpload(fileBuffer, fileName, preferredTable) {
  const lowerName = String(fileName || "").toLowerCase();
  if (lowerName.endsWith(".csv")) {
    return {
      tableName: preferredTable,
      rows: csvToRows(fileBuffer),
    };
  }

  if (!lowerName.endsWith(".zip")) {
    throw new Error("Only CSV or ZIP files are supported.");
  }

  const entries = await extractCsvEntriesFromZipBuffer(fileBuffer);
  if (!entries.length) {
    throw new Error("ZIP does not contain any CSV file.");
  }

  const preferredMatch = entries.find(
    (entry) => normalizeCsvFileTableName(entry.fileName) === preferredTable,
  );
  const target = preferredMatch || entries[0];

  return {
    tableName: preferredTable,
    rows: csvToRows(target.content),
  };
}

async function resolveCsvMapFromZipUpload(fileBuffer, fileName) {
  const lowerName = String(fileName || "").toLowerCase();
  if (!lowerName.endsWith(".zip")) {
    throw new Error("A ZIP file is required for this import.");
  }

  const entries = await extractCsvEntriesFromZipBuffer(fileBuffer);
  if (!entries.length) {
    throw new Error("ZIP does not contain CSV files.");
  }

  const map = new Map();
  for (const entry of entries) {
    const tableName = normalizeCsvFileTableName(entry.fileName);
    if (!tableName) continue;
    map.set(tableName, csvToRows(entry.content));
  }

  return map;
}

router.get("/export/department-archives", requireAuth, async (req, res) => {
  try {
    const dept = getDept(req);
    const report = {
      exportType: "department-archives",
      department: dept,
      generatedAt: new Date().toISOString(),
      tables: [],
      missingTables: [],
      attachmentsIncluded: 0,
      attachmentsMissing: 0,
    };

    const zipFileName = buildZipFileName(req, "department-archives-backup");
    setZipHeaders(res, zipFileName);

    const archive = createZipArchive({ zlib: { level: 9 } });
    archive.on("error", (error) => {
      console.error("department archive export zip error:", error);
      if (!res.headersSent) {
        res.status(500).json({ success: false, message: error.message });
      } else {
        res.end();
      }
    });
    archive.pipe(res);

    const entries = await buildArchiveBackupEntries(dept, report);
    for (const entry of entries) {
      if (entry.buffer) {
        archive.append(entry.buffer, { name: entry.name });
      } else {
        archive.append(String(entry.content || ""), { name: entry.name });
      }
    }

    archive.append(JSON.stringify(report, null, 2), {
      name: "reports/export_report.json",
    });

    await archive.finalize();
  } catch (error) {
    console.error("department archive export error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to export department archive backup.",
    });
  }
});

router.get("/export/core-data", requireAuth, async (req, res) => {
  try {
    const dept = getDept(req);
    const report = {
      exportType: "core-data",
      department: dept,
      generatedAt: new Date().toISOString(),
      tables: [],
      missingTables: [],
    };

    const zipFileName = buildZipFileName(req, "core-data-csv");
    setZipHeaders(res, zipFileName);

    const archive = createZipArchive({ zlib: { level: 9 } });
    archive.on("error", (error) => {
      console.error("core-data export zip error:", error);
      if (!res.headersSent) {
        res.status(500).json({ success: false, message: error.message });
      } else {
        res.end();
      }
    });

    archive.pipe(res);
    await appendTableCsvEntries(archive, CORE_EXPORT_TABLES, dept, report);
    archive.append(JSON.stringify(report, null, 2), {
      name: "reports/export_report.json",
    });

    await archive.finalize();
  } catch (error) {
    console.error("core-data export error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to export core CSV data.",
    });
  }
});

router.get("/export/all-ojt", requireAuth, async (req, res) => {
  try {
    const dept = getDept(req);
    const report = {
      exportType: "all-ojt",
      department: dept,
      generatedAt: new Date().toISOString(),
      tables: [],
      missingTables: [],
    };

    const zipFileName = buildZipFileName(req, "all-ojt-csv");
    setZipHeaders(res, zipFileName);

    const archive = createZipArchive({ zlib: { level: 9 } });
    archive.on("error", (error) => {
      console.error("all-ojt export zip error:", error);
      if (!res.headersSent) {
        res.status(500).json({ success: false, message: error.message });
      } else {
        res.end();
      }
    });

    archive.pipe(res);
    await appendTableCsvEntries(archive, OJT_EXPORT_TABLES, dept, report);
    archive.append(JSON.stringify(report, null, 2), {
      name: "reports/export_report.json",
    });

    await archive.finalize();
  } catch (error) {
    console.error("all-ojt export error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to export all OJT CSV data.",
    });
  }
});

router.get("/export/section-assignments", requireAuth, async (req, res) => {
  try {
    const dept = getDept(req);
    const report = {
      exportType: "section-assignments",
      department: dept,
      generatedAt: new Date().toISOString(),
      tables: [],
      missingTables: [],
    };

    const zipFileName = buildZipFileName(req, "section-assignments-csv");
    setZipHeaders(res, zipFileName);

    const archive = createZipArchive({ zlib: { level: 9 } });
    archive.on("error", (error) => {
      console.error("section-assignments export zip error:", error);
      if (!res.headersSent) {
        res.status(500).json({ success: false, message: error.message });
      } else {
        res.end();
      }
    });

    archive.pipe(res);
    await appendTableCsvEntries(archive, ["section_assignments"], dept, report);
    archive.append(JSON.stringify(report, null, 2), {
      name: "reports/export_report.json",
    });

    await archive.finalize();
  } catch (error) {
    console.error("section-assignments export error:", error);
    return res.status(500).json({
      success: false,
      message:
        error.message || "Failed to export section assignments CSV data.",
    });
  }
});

router.post(
  "/import/selected",
  requireAuth,
  CSV_IMPORT_UPLOAD.single("file"),
  async (req, res) => {
    try {
      const dept = getDept(req);
      const file = req.file;
      const targetTable = normalizeTableName(req.body?.targetTable);

      if (!SELECTED_IMPORT_TABLES.includes(targetTable)) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid target table. Allowed: external_partners, users, ojt_students, section_assignments.",
        });
      }

      if (!file?.buffer || !file?.originalname) {
        return res.status(400).json({
          success: false,
          message: "CSV or ZIP file is required.",
        });
      }

      const resolved = await resolveCsvRowsFromUpload(
        file.buffer,
        file.originalname,
        targetTable,
      );

      const tableResult = await runTableImport(
        targetTable,
        resolved.rows,
        dept,
      );

      return res.json({
        success: tableResult.failed === 0,
        mode: "selected",
        targetTable,
        report: tableResult,
      });
    } catch (error) {
      console.error("selected import error:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to import selected CSV data.",
      });
    }
  },
);

router.post(
  "/import/all-ojt",
  requireAuth,
  CSV_IMPORT_UPLOAD.single("file"),
  async (req, res) => {
    try {
      const dept = getDept(req);
      const file = req.file;
      if (!file?.buffer || !file?.originalname) {
        return res.status(400).json({
          success: false,
          message: "ZIP file with CSV entries is required.",
        });
      }

      const csvMap = await resolveCsvMapFromZipUpload(
        file.buffer,
        file.originalname,
      );

      const reports = [];
      const ignoredFiles = [];

      for (const [tableName, rows] of csvMap.entries()) {
        if (!OJT_IMPORT_TABLES.includes(tableName)) {
          ignoredFiles.push(tableName);
          continue;
        }

        const report = await runTableImport(tableName, rows, dept);
        reports.push(report);
      }

      const failedCount = reports.reduce((acc, item) => acc + item.failed, 0);
      const importedTables = reports.map((item) => item.table);

      return res.json({
        success: failedCount === 0,
        mode: "all-ojt",
        importedTables,
        ignoredFiles,
        reports,
      });
    } catch (error) {
      console.error("all-ojt import error:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to import all OJT CSV data.",
      });
    }
  },
);

// ==================== RESET ENDPOINTS ====================

router.post("/reset/thesis-capstone", requireAuth, async (req, res) => {
  try {
    const dept = getDept(req);

    // Delete thesis and capstone archives for the department
    await query(
      "DELETE FROM archives WHERE department = ? AND type IN ('thesis', 'capstone')",
      [dept],
    );

    return res.json({
      success: true,
      message: "All thesis and capstone archives have been deleted.",
    });
  } catch (error) {
    console.error("thesis-capstone reset error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to reset thesis/capstone archives.",
    });
  }
});

router.post("/reset/ojt-tables", requireAuth, async (req, res) => {
  try {
    const dept = getDept(req);

    const tablesToTruncate = [
      "ojt_students",
      "ojt_attendance",
      "ojt_certificates",
      "ojt_requirement_submissions",
      "ojt_status_history",
      "ojt_student_schedules",
      "ojt_weekly_reports",
      "students_user",
      "section_assignments",
    ];

    for (const table of tablesToTruncate) {
      await query(`DELETE FROM ${table} WHERE department = ?`, [dept]);
    }

    return res.json({
      success: true,
      message: "OJT-related tables have been truncated.",
    });
  } catch (error) {
    console.error("ojt-tables reset error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to reset OJT tables.",
    });
  }
});

router.post("/reset/external-partners", requireAuth, async (req, res) => {
  try {
    await query("TRUNCATE TABLE external_partners");

    return res.json({
      success: true,
      message: "External partners table has been truncated.",
    });
  } catch (error) {
    console.error("external-partners reset error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to reset external partners table.",
    });
  }
});

router.post("/reset/settings", requireAuth, async (req, res) => {
  try {
    // This endpoint acknowledges the reset request.
    // Actual settings reset is handled by Electron on the client side.
    return res.json({
      success: true,
      message: "Settings reset initiated on client.",
    });
  } catch (error) {
    console.error("settings reset error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to reset settings.",
    });
  }
});

module.exports = router;
