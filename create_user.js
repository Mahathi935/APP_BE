// create_user.js
import mysql from "mysql2/promise";
import bcrypt from "bcrypt";

const phone = process.argv[2] || "+919000000001";
const plain = process.argv[3] || "patientpass123";

(async () => {
  try {
    const pool = mysql.createPool({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      waitForConnections: true,
    });

    const hashed = await bcrypt.hash(plain, Number(process.env.BCRYPT_ROUNDS || 10));
    const [result] = await pool.query(
      'INSERT INTO users (phone_number, password, role, name, created_at) VALUES (?, ?, ?, ?, NOW())',
      [phone, hashed, 'patient', 'Test Patient']
    );
    console.log('USER CREATED ID:', result.insertId);
    process.exit(0);
  } catch (err) {
    console.error('CREATE USER ERR:', err && (err.message || err));
    process.exit(1);
  }
})();
