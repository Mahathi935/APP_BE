// describe_users.js
import mysql from "mysql2/promise";

(async () => {
  try {
    const pool = mysql.createPool({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
    });
    const [rows] = await pool.query("DESCRIBE users");
    console.log(JSON.stringify(rows, null, 2));
    process.exit(0);
  } catch (err) {
    console.error("DESCRIBE ERROR:", err && (err.message || err));
    process.exit(1);
  }
})();
