-- Smart Learning database schema (MySQL 8).
-- The backend runs this on every start (lib/db.js), and it is safe to re-run:
-- every statement is CREATE ... IF NOT EXISTS, or adds only rows that are missing. You can also run it yourself in
-- MySQL Workbench (File > Open SQL Script, then Execute).

CREATE DATABASE IF NOT EXISTS smart_learning CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE smart_learning;

-- every account; the role decides which of the role-specific columns are used
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(254) NOT NULL UNIQUE,
  role ENUM('learner','teacher','parent','hod','principal','admin') NOT NULL,
  password_hash VARCHAR(100) NOT NULL,
  must_change_password TINYINT(1) NOT NULL DEFAULT 0,  -- 1 while on an administrator-issued temporary password
  token_version INT NOT NULL DEFAULT 0,                -- bumped on password change: logs out older sessions
  phone VARCHAR(30) NULL,
  grade VARCHAR(4) NULL,            -- learner: the grade they are in
  id_number VARCHAR(30) NULL,       -- learner
  progress INT NOT NULL DEFAULT 0,  -- learner: overall progress this term (%)
  subject_key VARCHAR(60) NULL,     -- teacher: the subject they teach
  teach_grade VARCHAR(4) NULL,      -- teacher: the grade they mainly teach
  staff_number VARCHAR(30) NULL,    -- teacher
  dept VARCHAR(30) NULL,            -- teacher (from their subject) and HOD (the department they lead)
  attendance INT NULL,              -- teacher: attendance (%)
  performance INT NULL,             -- teacher: class performance (%)
  work_done TINYINT(1) NULL,        -- teacher: assigned interventions done? NULL = not asked yet
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_users_role (role)
) ENGINE=InnoDB;

-- which learners each parent may see (set by the administrator)
CREATE TABLE IF NOT EXISTS parent_children (
  parent_id INT NOT NULL,
  learner_id INT NOT NULL,
  PRIMARY KEY (parent_id, learner_id),
  FOREIGN KEY (parent_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (learner_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS lessons (
  id INT AUTO_INCREMENT PRIMARY KEY,
  lesson_key VARCHAR(60) NOT NULL UNIQUE,  -- i18n key of the lesson title, e.g. lesson_1
  sort_order INT NOT NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS learner_lessons (
  learner_id INT NOT NULL,
  lesson_id INT NOT NULL,
  progress INT NOT NULL DEFAULT 0,
  done TINYINT(1) NOT NULL DEFAULT 0,
  assessment_viewed TINYINT(1) NOT NULL DEFAULT 0,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (learner_id, lesson_id),
  FOREIGN KEY (learner_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- the built-in multiple-choice check-in quiz; the latest attempt sets the learner's status
CREATE TABLE IF NOT EXISTS checkin_attempts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  learner_id INT NOT NULL,
  answers JSON NOT NULL,            -- chosen option index per question
  score INT NOT NULL,
  total INT NOT NULL,
  feedback VARCHAR(500) NULL,       -- AI study tip, when AI was available
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_checkin_learner (learner_id, created_at),
  FOREIGN KEY (learner_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- teacher-authored quizzes
CREATE TABLE IF NOT EXISTS quizzes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  teacher_id INT NULL,
  title VARCHAR(150) NOT NULL,
  grade VARCHAR(4) NOT NULL,
  subject_key VARCHAR(60) NOT NULL,
  time_limit_min INT NOT NULL DEFAULT 0,  -- 0 = untimed
  questions JSON NOT NULL,                -- [{ "text": ..., "answer": ... }]
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_quizzes_grade (grade),
  FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- the learner's current attempt at each quiz (a retake starts it over); every submitted
-- attempt is also kept in quiz_submissions
CREATE TABLE IF NOT EXISTS quiz_attempts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  quiz_id INT NOT NULL,
  learner_id INT NOT NULL,
  answers JSON NULL,
  score INT NULL,                   -- NULL while in progress
  total INT NOT NULL,
  timed_out TINYINT(1) NOT NULL DEFAULT 0,
  started_at DATETIME(3) NOT NULL,
  deadline DATETIME(3) NULL,        -- NULL for untimed quizzes
  submitted_at DATETIME(3) NULL,
  UNIQUE KEY uq_attempt (quiz_id, learner_id),
  FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE,
  FOREIGN KEY (learner_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- every submitted attempt, retakes included, so teachers see the first score and not only the latest
CREATE TABLE IF NOT EXISTS quiz_submissions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  quiz_id INT NOT NULL,
  learner_id INT NOT NULL,
  answers JSON NOT NULL,
  score INT NOT NULL,
  total INT NOT NULL,
  timed_out TINYINT(1) NOT NULL DEFAULT 0,
  started_at DATETIME(3) NOT NULL,
  submitted_at DATETIME(3) NOT NULL,
  INDEX idx_submissions_quiz (quiz_id, learner_id, id),
  FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE,
  FOREIGN KEY (learner_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- copies in attempts submitted before quiz_submissions existed (adds nothing once they are there)
INSERT INTO quiz_submissions (quiz_id, learner_id, answers, score, total, timed_out, started_at, submitted_at)
SELECT a.quiz_id, a.learner_id, COALESCE(a.answers, JSON_ARRAY()), a.score, a.total, a.timed_out, a.started_at, a.submitted_at
  FROM quiz_attempts a
 WHERE a.submitted_at IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM quiz_submissions s WHERE s.quiz_id = a.quiz_id AND s.learner_id = a.learner_id);

-- uploaded question papers; the file itself lives in UPLOAD_DIR under stored_name
CREATE TABLE IF NOT EXISTS papers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  teacher_id INT NULL,
  title VARCHAR(150) NOT NULL,
  grade VARCHAR(4) NOT NULL,
  subject_key VARCHAR(60) NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  stored_name VARCHAR(100) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  size_bytes INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_papers_grade (grade),
  FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- classes (subject groups): one subject taught by one teacher to a group of learners, e.g.
-- 10A Mathematics, set up by the administrator. A teacher sees only their own classes, and a
-- learner gets only the quizzes and papers sent to the classes they are in.
CREATE TABLE IF NOT EXISTS classes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(10) NOT NULL,        -- e.g. 10A
  grade VARCHAR(4) NOT NULL,
  subject_key VARCHAR(60) NOT NULL,
  teacher_id INT NULL,              -- NULL until the administrator assigns one
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_class (grade, name, subject_key),
  INDEX idx_classes_teacher (teacher_id),
  FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS class_learners (
  class_id INT NOT NULL,
  learner_id INT NOT NULL,
  PRIMARY KEY (class_id, learner_id),
  INDEX idx_class_learners_learner (learner_id),
  FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
  FOREIGN KEY (learner_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- the classes each quiz and question paper was sent to
CREATE TABLE IF NOT EXISTS quiz_classes (
  quiz_id INT NOT NULL,
  class_id INT NOT NULL,
  PRIMARY KEY (quiz_id, class_id),
  INDEX idx_quiz_classes_class (class_id),
  FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE,
  FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS paper_classes (
  paper_id INT NOT NULL,
  class_id INT NOT NULL,
  PRIMARY KEY (paper_id, class_id),
  INDEX idx_paper_classes_class (class_id),
  FOREIGN KEY (paper_id) REFERENCES papers(id) ON DELETE CASCADE,
  FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- learner_id is NULL for anonymous (imported) ratings; NULLs never clash on the unique key
CREATE TABLE IF NOT EXISTS teacher_ratings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  teacher_id INT NOT NULL,
  learner_id INT NULL,
  rating TINYINT NOT NULL,          -- 1 to 5 stars
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_rating (teacher_id, learner_id),
  FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (learner_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- the principal's feedback to a teacher
CREATE TABLE IF NOT EXISTS teacher_feedback (
  id INT AUTO_INCREMENT PRIMARY KEY,
  teacher_id INT NOT NULL,
  from_user_id INT NULL,
  message TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (from_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- HOD department reports sent to the principal
CREATE TABLE IF NOT EXISTS dept_reports (
  id INT AUTO_INCREMENT PRIMARY KEY,
  hod_id INT NULL,
  dept VARCHAR(30) NOT NULL,
  `rows` JSON NOT NULL,             -- [{ teacherId, name, subjectKey, gradeKey, attendance, performance, avgRating }]
  sent_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (hod_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- msg_key + params for i18n-keyed messages the UI translates, message for server-written text
CREATE TABLE IF NOT EXISTS notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  msg_key VARCHAR(60) NULL,
  params JSON NULL,
  message VARCHAR(500) NULL,
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_notifications_user (user_id, created_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- per-subject attendance and performance on the admin overview
CREATE TABLE IF NOT EXISTS subject_stats (
  subject_key VARCHAR(60) PRIMARY KEY,
  attendance INT NOT NULL,
  performance INT NOT NULL
) ENGINE=InnoDB;

-- forgot-password links; only a SHA-256 of the token is stored
CREATE TABLE IF NOT EXISTS password_resets (
  token_hash CHAR(64) PRIMARY KEY,
  user_id INT NOT NULL,
  expires_at DATETIME NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- online lessons a teacher schedules for one of their classes, held in the app's own live
-- classroom (video, audio and chat)
CREATE TABLE IF NOT EXISTS online_classes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  class_id INT NOT NULL,
  teacher_id INT NULL,
  title VARCHAR(150) NOT NULL,
  starts_at DATETIME NOT NULL,      -- UTC
  duration_min INT NOT NULL,
  ended_at DATETIME NULL,           -- set when the teacher ends the class early
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_online_classes_class (class_id, starts_at),
  INDEX idx_online_classes_teacher (teacher_id, starts_at),
  FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
  FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- the class register: a row once a learner enters the live classroom, or once the teacher
-- marks them. A learner with no row did not attend.
CREATE TABLE IF NOT EXISTS online_attendance (
  online_class_id INT NOT NULL,
  learner_id INT NOT NULL,
  status ENUM('present','late','absent') NOT NULL,
  joined_at DATETIME NULL,          -- when the learner first entered the classroom
  last_joined_at DATETIME NULL,     -- start of the learner's current visit, NULL while they are out
  seconds_attended INT NOT NULL DEFAULT 0,  -- time in the classroom over all visits
  marked_by ENUM('join','teacher') NOT NULL,
  PRIMARY KEY (online_class_id, learner_id),
  INDEX idx_online_attendance_learner (learner_id),
  FOREIGN KEY (online_class_id) REFERENCES online_classes(id) ON DELETE CASCADE,
  FOREIGN KEY (learner_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;
