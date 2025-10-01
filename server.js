// server_db_schema_complete.js
// Complete server: signup/login/profile + appointments & doctor slots
// ES module style (import/export). Make sure to `npm install express mysql2 dotenv jsonwebtoken bcrypt helmet express-rate-limit`.

import express from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import mysql from "mysql2/promise";
import dotenv from "dotenv";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

dotenv.config();

const {
  PORT = 3000,
  JWT_SECRET,
  DB_HOST,
  DB_USER,
  DB_PASSWORD,
  DB_NAME,
  BCRYPT_ROUNDS = 10,
  RATE_LIMIT_WINDOW_MS = 60_000,
  RATE_LIMIT_MAX = 100,
} = process.env;

if (!JWT_SECRET) {
  console.error("FATAL: JWT_SECRET not set in env");
  process.exit(1);
}

const app = express();
app.use(express.json());
app.use(helmet());

const authLimiter = rateLimit({
  windowMs: Number(RATE_LIMIT_WINDOW_MS),
  max: Number(RATE_LIMIT_MAX),
  standardHeaders: true,
  legacyHeaders: false,
});

const pool = mysql.createPool({
  host: DB_HOST || "localhost",
  user: DB_USER || "root",
  password: DB_PASSWORD || "",
  database: DB_NAME || "medicine_app",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// ----------------- Helpers -----------------
function validateDateISO(dateStr) {
  return /^\d{4}-\d{2}-\d{2}$/.test(dateStr);
}

function validateDateTimeSQL(dt) {
  return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(dt);
}

// ----------------- Auth: Signup & Login -----------------

// Signup — inserts into users + patients OR doctors tables based on role.
// Required columns per your schema: users(phone_number, password, role, name, sex, date_of_birth)
// doctors(user_id, license_number, specialization), patients(user_id)
app.post("/signup", authLimiter, async (req, res) => {
  const {
    phone_number,
    password,
    role,
    name,
    sex,
    date_of_birth,
    license_number,
    specialization,
  } = req.body;

  if (!phone_number || !password || !role || !name || !sex || !date_of_birth) {
    return res.status(400).json({
      message:
        "phone_number, password, role, name, sex, and date_of_birth are required",
    });
  }

  if (!["patient", "doctor"].includes(role)) {
    return res.status(400).json({ message: "role must be 'patient' or 'doctor'" });
  }

  if (!validateDateISO(date_of_birth)) {
    return res.status(400).json({ message: "date_of_birth must be YYYY-MM-DD" });
  }

  if (role === "doctor" && (!license_number || !specialization)) {
    return res.status(400).json({
      message: "license_number and specialization are required for doctors",
    });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Ensure phone_number unique
    const [existing] = await conn.query(
      "SELECT id FROM users WHERE phone_number = ? LIMIT 1",
      [phone_number]
    );
    if (existing.length > 0) {
      await conn.rollback();
      return res.status(400).json({ message: "User already exists" });
    }

    // Hash password
    const rounds = Number(BCRYPT_ROUNDS) || 10;
    const hashed = await bcrypt.hash(password, rounds);

    // Insert into users table
    const [userResult] = await conn.query(
      `INSERT INTO users (phone_number, password, role, name, sex, date_of_birth, created_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [phone_number, hashed, role, name, sex, date_of_birth]
    );

    const userId = userResult.insertId;

    // Insert into role-specific table
    if (role === "patient") {
      await conn.query("INSERT INTO patients (user_id) VALUES (?)", [userId]);
    } else {
      await conn.query(
        "INSERT INTO doctors (user_id, license_number, specialization) VALUES (?, ?, ?)",
        [userId, license_number, specialization]
      );
    }

    await conn.commit();
    res.status(201).json({ message: "User registered successfully" });
  } catch (err) {
    await conn.rollback().catch(() => {});
    console.error("SIGNUP ERR:", err && err.stack ? err.stack : err);
    res.status(500).json({ message: "Error creating user" });
  } finally {
    conn.release();
  }
});

// Login — authenticates using users.phone_number + password and returns JWT
app.post("/login", authLimiter, async (req, res) => {
  const { phone_number, password } = req.body;
  if (!phone_number || !password) {
    return res.status(400).json({ message: "phone_number and password required" });
  }

  try {
    const [rows] = await pool.query(
      "SELECT id, phone_number, password, role, name FROM users WHERE phone_number = ? LIMIT 1",
      [phone_number]
    );
    const user = rows[0];
    const invalidMsg = { message: "Invalid phone number or password" };
    if (!user) return res.status(400).json(invalidMsg);

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(400).json(invalidMsg);

    const token = jwt.sign(
      { id: user.id, phone_number: user.phone_number, role: user.role },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    res.json({ token });
  } catch (err) {
    console.error("LOGIN ERR:", err && err.stack ? err.stack : err);
    res.status(500).json({ message: "Login error" });
  }
});

// ----------------- Middleware -----------------
function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) return res.status(401).json({ message: "No token provided" });

  jwt.verify(token, JWT_SECRET, (err, payload) => {
    if (err) return res.status(403).json({ message: "Invalid token" });
    req.user = payload; // { id, phone_number, role }
    next();
  });
}

function authorizeRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ message: "Access denied: insufficient role" });
    }
    next();
  };
}

// ----------------- Profiles -----------------
// /profile returns users.id, phone_number, role, name, sex, date_of_birth
app.get("/profile", authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, phone_number, role, name, sex, date_of_birth, created_at
       FROM users WHERE id = ? LIMIT 1`,
      [req.user.id]
    );
    const user = rows[0];
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
  } catch (err) {
    console.error("PROFILE ERR:", err && err.stack ? err.stack : err);
    res.status(500).json({ message: "Error fetching profile" });
  }
});

// Patient profile (/patients/me)
app.get(
  "/patients/me",
  authenticateToken,
  authorizeRoles("patient"),
  async (req, res) => {
    try {
      const [rows] = await pool.query(
        `SELECT u.id, u.phone_number, u.role, u.name, u.sex, u.date_of_birth, u.created_at
         FROM users u
         JOIN patients p ON u.id = p.user_id
         WHERE u.id = ? LIMIT 1`,
        [req.user.id]
      );
      if (!rows[0]) return res.status(404).json({ message: "No profile found" });
      res.json(rows[0]);
    } catch (err) {
      console.error("PATIENT PROFILE ERR:", err && err.stack ? err.stack : err);
      res.status(500).json({ message: "Failed to fetch patient profile" });
    }
  }
);

// Doctor profile (/doctors/me)
app.get(
  "/doctors/me",
  authenticateToken,
  authorizeRoles("doctor"),
  async (req, res) => {
    try {
      const [rows] = await pool.query(
        `SELECT u.id, u.phone_number, u.role, u.name, u.sex, u.date_of_birth, u.created_at,
                d.license_number, d.specialization
         FROM users u
         JOIN doctors d ON u.id = d.user_id
         WHERE u.id = ? LIMIT 1`,
        [req.user.id]
      );
      if (!rows[0]) return res.status(404).json({ message: "No profile found" });
      res.json(rows[0]);
    } catch (err) {
      console.error("DOCTOR PROFILE ERR:", err && err.stack ? err.stack : err);
      res.status(500).json({ message: "Failed to fetch doctor profile" });
    }
  }
);

// ----------------- Appointments & Doctor Slots -----------------
/*
Run these SQL commands once in your DB before using the endpoints (examples):

-- doctor_slots table
CREATE TABLE IF NOT EXISTS doctor_slots (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  doctor_user_id INT NOT NULL,
  slot_at DATETIME NOT NULL,
  is_booked TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY ux_doctor_slot (doctor_user_id, slot_at),
  FOREIGN KEY (doctor_user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- appointments table (example minimal)
CREATE TABLE IF NOT EXISTS appointments (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  patient_user_id INT NOT NULL,
  doctor_user_id INT NOT NULL,
  scheduled_at DATETIME NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'booked',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (patient_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (doctor_user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY ux_appt_doctor_time (doctor_user_id, scheduled_at)
);
*/

// Patient books by selecting a doctor slot id
app.post("/appointments", authenticateToken, authorizeRoles("patient"), async (req, res) => {
  const { doctorSlotId } = req.body;
  if (!doctorSlotId) return res.status(400).json({ message: "doctorSlotId is required" });

  try {
    const [[slot]] = await pool.query(
      `SELECT ds.id, ds.slot_at, ds.doctor_user_id, ds.is_booked
       FROM doctor_slots ds
       JOIN users u ON u.id = ds.doctor_user_id AND u.role = 'doctor'
       WHERE ds.id = ?`,
      [doctorSlotId]
    );

    if (!slot) return res.status(404).json({ message: "Slot not found" });
    if (slot.is_booked) return res.status(409).json({ message: "Slot already booked" });

    const patientId = req.user.id;
    const doctorId = slot.doctor_user_id;
    const scheduledAt = slot.slot_at;

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // Atomically mark the slot booked
      const [upd] = await conn.query(
        "UPDATE doctor_slots SET is_booked = 1 WHERE id = ? AND is_booked = 0",
        [doctorSlotId]
      );
      if (upd.affectedRows === 0) {
        await conn.rollback();
        return res.status(409).json({ message: "Slot already booked (race)" });
      }

      // Insert appointment
      const [insertRes] = await conn.query(
        "INSERT INTO appointments (patient_user_id, doctor_user_id, scheduled_at, status, created_at) VALUES (?, ?, ?, ?, NOW())",
        [patientId, doctorId, scheduledAt, "booked"]
      );

      await conn.commit();
      return res.status(201).json({
        id: insertRes.insertId,
        patient_user_id: patientId,
        doctor_user_id: doctorId,
        scheduled_at: scheduledAt,
        slot_id: doctorSlotId,
      });
    } catch (txErr) {
      await conn.rollback().catch(() => {});
      console.error("BOOKING TX ERR:", txErr && txErr.stack ? txErr.stack : txErr);
      return res.status(500).json({ message: "Failed to book slot" });
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error("BOOK APPT ERR:", err && err.stack ? err.stack : err);
    res.status(500).json({ message: "Server error" });
  }
});

// Doctor: view own appointments
app.get("/appointments", authenticateToken, authorizeRoles("doctor"), async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT a.id, a.patient_user_id, pu.name AS patient_name, pu.phone_number AS patient_phone,
              a.doctor_user_id, du.name AS doctor_name,
              a.scheduled_at, a.status, a.created_at
       FROM appointments a
       JOIN users pu ON pu.id = a.patient_user_id
       JOIN users du ON du.id = a.doctor_user_id
       WHERE a.doctor_user_id = ?
       ORDER BY a.scheduled_at DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    console.error("FETCH DOC APPTS ERR:", err && err.stack ? err.stack : err);
    res.status(500).json({ message: "Failed to fetch appointments" });
  }
});

// Patient: view own appointments
app.get("/appointments/me", authenticateToken, authorizeRoles("patient"), async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT a.id, a.patient_user_id, pu.name AS patient_name,
              a.doctor_user_id, du.name AS doctor_name, du.phone_number AS doctor_phone,
              a.scheduled_at, a.status, a.created_at
       FROM appointments a
       JOIN users pu ON pu.id = a.patient_user_id
       JOIN users du ON du.id = a.doctor_user_id
       WHERE a.patient_user_id = ?
       ORDER BY a.scheduled_at DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    console.error("FETCH PAT APPTS ERR:", err && err.stack ? err.stack : err);
    res.status(500).json({ message: "Failed to fetch appointments" });
  }
});

// Patient: view doctor's public slots by phone_number or username fallback
app.get("/doctors/:username/slots", authenticateToken, authorizeRoles("patient"), async (req, res) => {
  const doctorUsername = req.params.username;
  try {
    // First try phone_number (your login uses phone_number)
    const [[doctorByPhone]] = await pool.query(
      "SELECT id FROM users WHERE phone_number = ? AND role = 'doctor' LIMIT 1",
      [doctorUsername]
    );

    let doctorId = doctorByPhone && doctorByPhone.id ? doctorByPhone.id : null;

    // fallback to username column if present
    if (!doctorId) {
      const [[docByUsername]] = await pool.query(
        "SELECT id FROM users WHERE username = ? AND role = 'doctor' LIMIT 1",
        [doctorUsername]
      );
      if (docByUsername && docByUsername.id) doctorId = docByUsername.id;
    }

    if (!doctorId) return res.status(404).json({ message: "Doctor not found" });

    const [rows] = await pool.query(
      `SELECT id AS slot_id, slot_at, is_booked
       FROM doctor_slots
       WHERE doctor_user_id = ? AND slot_at >= NOW()
       ORDER BY slot_at ASC`,
      [doctorId]
    );
    res.json(rows);
  } catch (err) {
    console.error("FETCH DOCTOR SLOTS ERR:", err && err.stack ? err.stack : err);
    res.status(500).json({ message: "Failed to fetch doctor slots" });
  }
});

// Doctor: create multiple slots (array of "YYYY-MM-DD HH:MM:SS")
app.post("/doctor/slots", authenticateToken, authorizeRoles("doctor"), async (req, res) => {
  const { slots } = req.body;
  if (!Array.isArray(slots) || slots.length === 0) {
    return res.status(400).json({ message: "slots (array) required" });
  }

  for (const s of slots) {
    if (typeof s !== "string" || !validateDateTimeSQL(s)) {
      return res.status(400).json({ message: `Invalid slot format: ${s}. Use "YYYY-MM-DD HH:MM:SS"` });
    }
  }

  const doctorId = req.user.id;
  try {
    const values = slots.map((s) => [doctorId, s]);
    const [result] = await pool.query("INSERT IGNORE INTO doctor_slots (doctor_user_id, slot_at) VALUES ?", [values]);
    res.status(201).json({ inserted: result.affectedRows });
  } catch (err) {
    console.error("CREATE SLOTS ERR:", err && err.stack ? err.stack : err);
    res.status(500).json({ message: "Failed to create slots" });
  }
});

// Doctor: list own slots
app.get("/doctor/slots", authenticateToken, authorizeRoles("doctor"), async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT id AS slot_id, slot_at, is_booked FROM doctor_slots WHERE doctor_user_id = ? ORDER BY slot_at ASC",
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    console.error("FETCH DOCTOR SLOTS ERR:", err && err.stack ? err.stack : err);
    res.status(500).json({ message: "Failed to fetch doctor slots" });
  }
});

// Doctor: delete slot if not booked
app.delete("/doctor/slots/:id", authenticateToken, authorizeRoles("doctor"), async (req, res) => {
  const slotId = req.params.id;
  const doctorId = req.user.id;
  try {
    const [[slot]] = await pool.query("SELECT * FROM doctor_slots WHERE id = ? AND doctor_user_id = ?", [slotId, doctorId]);
    if (!slot) return res.status(404).json({ message: "Slot not found" });
    if (slot.is_booked) return res.status(409).json({ message: "Cannot delete a booked slot" });

    await pool.query("DELETE FROM doctor_slots WHERE id = ?", [slotId]);
    res.json({ message: "Slot deleted" });
  } catch (err) {
    console.error("DELETE SLOT ERR:", err && err.stack ? err.stack : err);
    res.status(500).json({ message: "Failed to delete slot" });
  }
});

// Cancel appointment (patient owner OR the doctor) — frees the slot if exists
app.delete("/appointments/:id", authenticateToken, async (req, res) => {
  const apptId = req.params.id;
  const userId = req.user.id;
  const userRole = req.user.role;

  try {
    const [[appointment]] = await pool.query("SELECT * FROM appointments WHERE id = ?", [apptId]);
    if (!appointment) return res.status(404).json({ message: "Appointment not found" });

    const isPatient = appointment.patient_user_id === userId && userRole === "patient";
    const isDoctor = appointment.doctor_user_id === userId && userRole === "doctor";
    if (!isPatient && !isDoctor) return res.status(403).json({ message: "Not authorized to cancel this appointment" });

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // Delete appointment (or alternatively update status='cancelled')
      await conn.query("DELETE FROM appointments WHERE id = ?", [apptId]);

      // Free the slot if one exists that matches doctor + scheduled_at
      await conn.query("UPDATE doctor_slots SET is_booked = 0 WHERE doctor_user_id = ? AND slot_at = ?", [
        appointment.doctor_user_id,
        appointment.scheduled_at,
      ]);

      await conn.commit();
      res.json({ message: "Appointment canceled" });
    } catch (txErr) {
      await conn.rollback().catch(() => {});
      console.error("CANCEL TX ERR:", txErr && txErr.stack ? txErr.stack : txErr);
      res.status(500).json({ message: "Failed to cancel appointment" });
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error("CANCEL APPT ERR:", err && err.stack ? err.stack : err);
    res.status(500).json({ message: "Server error" });
  }
});

// ----------------- Healthcheck & Root -----------------
app.get("/health", (req, res) => res.json({ ok: true }));
app.get("/", (req, res) =>
  res.json({ ok: true, message: "API is running. Use /health, /signup, /login, /profile" })
);

// ----------------- Start server -----------------
if (process.env.NODE_ENV !== "test") {
  const port = Number(PORT) || 3000;
  app.listen(port, () => {
    console.log(`Server listening on http://localhost:${port}`);
  });
}

export default app;
