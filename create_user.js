// File: create_user.js
// Usage:
//   node create_user.js "+919000000001" "patientpass123" "1990-01-01" "Test Patient" "patient" "unspecified"
// Environment variables required: DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, (optional) DB_PORT, BCRYPT_ROUNDS

import mysql from 'mysql2/promise';
import bcrypt from 'bcrypt';

const phone = process.argv[2] || '+919000000001';
const plain = process.argv[3] || 'patientpass123';
const dob = process.argv[4] || '1990-01-01'; // YYYY-MM-DD
const name = process.argv[5] || 'Test Patient';
const role = process.argv[6] || 'patient';
const sex = process.argv[7] || 'unspecified';

(async () => {
  try {
    const pool = mysql.createPool({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
      waitForConnections: true,
      connectionLimit: 5,
    });

    const rounds = Number(process.env.BCRYPT_ROUNDS || 10);
    const hashed = await bcrypt.hash(plain, rounds);

    const [result] = await pool.query(
      'INSERT INTO users (phone_number, password, role, name, sex, date_of_birth, created_at) VALUES (?, ?, ?, ?, ?, ?, NOW())',
      [phone, hashed, role, name, sex, dob]
    );

    console.log('USER CREATED ID:', result.insertId);
    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error('CREATE USER ERR:', err && (err.message || err));
    process.exit(1);
  }
})();

