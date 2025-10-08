// test_db.js
import mysql from "mysql2/promise";

(async () => {
  try {
    const pool = mysql.createPool({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      port: process.env.DB_PORT || 3306,
      waitForConnections: true,
      connectionLimit: 2,
    });
    const [rows] = await pool.query("SELECT 1 + 1 AS result");
    console.log("DB OK:", rows[0]);
    process.exit(0);
  } catch (err) {
    console.error("DB ERROR:", err && (err.message || err.stack || err));
    process.exit(1);
  }
})();
