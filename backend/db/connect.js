require("dotenv").config();
const mysql = require("mysql2/promise");

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT, 10),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: {
    rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED === "true",
  },
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
});

const TRANSIENT_DB_ERROR_CODES = new Set([
  "ECONNRESET",
  "EPIPE",
  "ETIMEDOUT",
  "PROTOCOL_CONNECTION_LOST",
  "PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR",
]);

function shouldRetryDbError(error) {
  if (!error) return false;
  if (TRANSIENT_DB_ERROR_CODES.has(error.code)) return true;
  return error.fatal === true;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function query(sql, params = []) {
  const maxAttempts = 2;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const [rows] = await pool.execute(sql, params);
      return rows;
    } catch (error) {
      const canRetry = attempt < maxAttempts && shouldRetryDbError(error);
      if (!canRetry) throw error;

      console.warn(
        `[db] transient query failure (${error.code || "UNKNOWN"}), retrying attempt ${attempt + 1}/${maxAttempts}`,
      );
      await wait(150);
    }
  }

  return [];
}

module.exports = { pool, query };
