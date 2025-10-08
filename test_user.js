

// ----------------------------------------------------------------------
// File: test_user.js
// Usage:
//   node test_user.js "+919000000001"
// Environment variables required: DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, (optional) DB_PORT

import mysql2 from 'mysql2/promise';

const phoneToCheck = process.argv[2] || 'patient1@email.com';

(async () => {
  try {
    const pool = mysql2.createPool({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
      waitForConnections: true,
      connectionLimit: 2,
    });

    const [rows] = await pool.query(
      'SELECT id, email, role, name, sex, date_of_birth FROM users WHERE email = ? LIMIT 1',
      [phoneToCheck]
    );

    if (rows.length) {
      // Print a concise one-line JSON to make it easy to parse in CLI
      console.log('USER FOUND:', JSON.stringify(rows[0]));
    } else {
      console.log('USER NOT FOUND');
    }

    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error('QUERY ERROR:', err && (err.message || err));
    process.exit(1);
  }
})();