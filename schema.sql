-- schema.sql
-- Full schema for healthcare_db as per your current database

CREATE DATABASE IF NOT EXISTS healthcare_db;
USE healthcare_db;

-- ---------------- USERS ----------------
CREATE TABLE IF NOT EXISTS users (
  id INT NOT NULL AUTO_INCREMENT,
  phone_number VARCHAR(30) NOT NULL,
  password VARCHAR(255) NOT NULL,
  role ENUM('patient','doctor') NOT NULL,
  name VARCHAR(100) NOT NULL,
  sex VARCHAR(10) NOT NULL,
  date_of_birth DATE NOT NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY phone_number (phone_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ---------------- PATIENTS ----------------
CREATE TABLE IF NOT EXISTS patients (
  id INT NOT NULL AUTO_INCREMENT,
  user_id INT NOT NULL,
  PRIMARY KEY (id),
  KEY user_id (user_id),
  CONSTRAINT patients_ibfk_1 FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ---------------- DOCTORS ----------------
CREATE TABLE IF NOT EXISTS doctors (
  id INT NOT NULL AUTO_INCREMENT,
  user_id INT NOT NULL,
  license_number VARCHAR(50) NOT NULL,
  specialization VARCHAR(100) NOT NULL,
  PRIMARY KEY (id),
  KEY user_id (user_id),
  CONSTRAINT doctors_ibfk_1 FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ---------------- DOCTOR SLOTS ----------------
CREATE TABLE IF NOT EXISTS doctor_slots (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  doctor_user_id INT NOT NULL,
  slot_at DATETIME NOT NULL,
  is_booked TINYINT(1) NOT NULL DEFAULT '0',
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY ux_doctor_slot (doctor_user_id, slot_at),
  CONSTRAINT doctor_slots_ibfk_1 FOREIGN KEY (doctor_user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ---------------- APPOINTMENTS ----------------
CREATE TABLE IF NOT EXISTS appointments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  patient_user_id INT NOT NULL,
  doctor_user_id INT NOT NULL,
  scheduled_at DATETIME NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'booked',
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY ux_appt_doctor_time (doctor_user_id, scheduled_at),
  KEY patient_user_id (patient_user_id),
  CONSTRAINT appointments_ibfk_1 FOREIGN KEY (patient_user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT appointments_ibfk_2 FOREIGN KEY (doctor_user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ---------------- LAB TESTS ----------------
CREATE TABLE IF NOT EXISTS lab_tests (
  id INT NOT NULL AUTO_INCREMENT,
  patient_user_id INT NOT NULL,
  test_name VARCHAR(255) NOT NULL,
  test_date DATE NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  report_url VARCHAR(2083) DEFAULT NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY patient_user_id (patient_user_id),
  CONSTRAINT lab_tests_ibfk_1 FOREIGN KEY (patient_user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ---------------- CALENDAR EVENTS ----------------
CREATE TABLE IF NOT EXISTS calendar_events (
  id INT NOT NULL AUTO_INCREMENT,
  user_id INT NOT NULL,
  event_type VARCHAR(32) NOT NULL,
  related_type VARCHAR(32) DEFAULT NULL,
  related_id INT DEFAULT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  start_time DATETIME NOT NULL,
  end_time DATETIME DEFAULT NULL,
  color VARCHAR(32) DEFAULT NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY user_id (user_id),
  CONSTRAINT calendar_events_ibfk_1 FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
