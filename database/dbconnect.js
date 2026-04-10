const mysql = require("mysql2/promise");

const pool = mysql.createPool({
  host: "mysql-eac28ff-smartacademicbsit3b-fb16.b.aivencloud.com",
  port: 25442,
  user: "avnadmin",
  password: "AVNS__-yJEBgGhuiklEhCWdS",
  database: "CTAPLP",
  ssl: {
    rejectUnauthorized: false,
  },
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

async function query(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

module.exports = {
  pool,
  query,
};
