// test_user.js
import mysql from "mysql2/promise";

(async () => {
  try {
    const pool = mysql.createPool({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      waitForConnections: true,
    });
    const phone = process.argv[2] || "+919000000001";
    const [rows] = await pool.query("SELECT id, phone_number, password FROM users WHERE phone_number = ? LIMIT 1", [phone]);
    if (rows.length) console.log("USER FOUND:", { id: rows[0].id, phone: rows[0].phone_number, pw_preview: (rows[0].password||'').slice(0,8)+'...' });
    else console.log("USER NOT FOUND");
    process.exit(0);
  } catch (err) {
    console.error("QUERY ERROR:", err && (err.message || err));
    process.exit(1);
  }
})();
