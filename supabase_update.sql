-- Supabase Database Schema Updater for EduFlow
-- Paste this into the Supabase SQL Editor and click "Run"

-- 1. Ensure new columns are added to existing users table
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='username') THEN
        ALTER TABLE users ADD COLUMN username TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='password') THEN
        ALTER TABLE users ADD COLUMN password TEXT;
    END IF;
END $$;

-- 2. Make sure all necessary tables exist in case any were missed previously
CREATE TABLE IF NOT EXISTS settings (
    id TEXT PRIMARY KEY,
    "appName" TEXT,
    "schoolName" TEXT,
    "schoolAddress" TEXT,
    "schoolNpsn" TEXT,
    "schoolContact" TEXT,
    "headmasterName" TEXT,
    "headmasterNip" TEXT,
    "themeColor" TEXT,
    features JSONB,
    "studentDisplaySettings" JSONB
);

CREATE TABLE IF NOT EXISTS students (
    id TEXT PRIMARY KEY,
    name TEXT,
    email TEXT,
    "classId" TEXT,
    attendance INTEGER,
    "gradeValue" NUMERIC,
    nisn TEXT,
    nis TEXT,
    gender TEXT,
    phone TEXT,
    address TEXT,
    dusun TEXT,
    desa TEXT,
    kecamatan TEXT,
    "birthPlace" TEXT,
    "birthDate" TEXT,
    nik TEXT,
    nkk TEXT,
    religion TEXT,
    "weightSem1" NUMERIC,
    "weightSem2" NUMERIC,
    "heightSem1" NUMERIC,
    "heightSem2" NUMERIC,
    "fatherName" TEXT,
    "fatherBirthYear" TEXT,
    "fatherNik" TEXT,
    "motherName" TEXT,
    "motherBirthYear" TEXT,
    "motherNik" TEXT,
    "guardianName" TEXT,
    "guardianBirthYear" TEXT,
    "guardianNik" TEXT,
    "distanceToSchool" NUMERIC,
    "attendanceNumber" INTEGER
);

CREATE TABLE IF NOT EXISTS classes (
    id TEXT PRIMARY KEY,
    name TEXT,
    subject TEXT,
    teacher TEXT,
    "homeroomTeacher" TEXT,
    "homeroomTeacherNip" TEXT,
    "academicYear" TEXT,
    "studentCount" INTEGER,
    schedule TEXT
);

CREATE TABLE IF NOT EXISTS subjects (
    id TEXT PRIMARY KEY,
    name TEXT,
    code TEXT,
    "classId" TEXT,
    "teacherName" TEXT
);

CREATE TABLE IF NOT EXISTS materials (
    id TEXT PRIMARY KEY,
    "subjectId" TEXT,
    title TEXT,
    weight NUMERIC,
    type TEXT
);

CREATE TABLE IF NOT EXISTS grades (
    id TEXT PRIMARY KEY,
    "studentId" TEXT,
    "materialId" TEXT,
    value NUMERIC,
    "scoreType" TEXT
);

CREATE TABLE IF NOT EXISTS "attendance" (
    id TEXT PRIMARY KEY,
    "studentId" TEXT,
    date TEXT,
    status TEXT,
    notes TEXT
);

CREATE TABLE IF NOT EXISTS "feeItems" (
    id TEXT PRIMARY KEY,
    name TEXT,
    amount NUMERIC,
    category TEXT,
    "academicYear" TEXT
);

CREATE TABLE IF NOT EXISTS "studentPayments" (
    id TEXT PRIMARY KEY,
    "studentId" TEXT,
    "feeItemId" TEXT,
    "amountPaid" NUMERIC,
    "paymentDate" TEXT,
    "paymentMethod" TEXT,
    notes TEXT,
    "isDeposit" BOOLEAN
);

CREATE TABLE IF NOT EXISTS "savingsTransactions" (
    id TEXT PRIMARY KEY,
    "studentId" TEXT,
    amount NUMERIC,
    date TEXT,
    type TEXT,
    notes TEXT
);

CREATE TABLE IF NOT EXISTS "classCashTransactions" (
    id TEXT PRIMARY KEY,
    "classId" TEXT,
    "studentId" TEXT,
    type TEXT,
    "transactionType" TEXT,
    amount NUMERIC,
    date TEXT,
    "period_month" TEXT,
    notes TEXT
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='classCashTransactions' AND column_name='period_month') THEN
        ALTER TABLE "classCashTransactions" ADD COLUMN "period_month" TEXT;
    END IF;
END $$;

UPDATE "classCashTransactions"
SET "period_month" = substring(date from 1 for 7)
WHERE "period_month" IS NULL AND date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_classcash_class_month
ON "classCashTransactions" ("classId", "period_month");

CREATE INDEX IF NOT EXISTS idx_classcash_student_month
ON "classCashTransactions" ("studentId", "period_month");

CREATE TABLE IF NOT EXISTS "schoolDeposits" (
    id TEXT PRIMARY KEY,
    "classId" TEXT,
    "feeItemId" TEXT,
    amount NUMERIC,
    "depositDate" TEXT,
    notes TEXT
);

CREATE TABLE IF NOT EXISTS "academicRecords" (
    id TEXT PRIMARY KEY,
    "studentId" TEXT,
    rapot JSONB,
    prestasi JSONB,
    ijazah JSONB,
    tka TEXT
);

CREATE TABLE IF NOT EXISTS "dashboardWidgets" (
    id TEXT PRIMARY KEY,
    type TEXT,
    title TEXT,
    "isVisible" BOOLEAN,
    "order" INTEGER,
    user_id TEXT
);

-- Insert Default Settings if not exists
INSERT INTO settings (id, "appName", "schoolName", "schoolAddress", "themeColor")
VALUES ('default', 'EduFlow', 'Sekolah Contoh', 'Jl. Merdeka No. 1', '#3b82f6')
ON CONFLICT (id) DO NOTHING;

-- Chat Messages Table (Admin <-> Siswa + Broadcast)
CREATE TABLE IF NOT EXISTS "chatMessages" (
    id TEXT PRIMARY KEY,
    "threadId" TEXT,
    "studentId" TEXT,
    kind TEXT,
    "senderRole" TEXT,
    "senderUserId" TEXT,
    message TEXT,
    "createdAt" TEXT
);

CREATE INDEX IF NOT EXISTS idx_chatmessages_thread_created
ON "chatMessages" ("threadId", "createdAt");

CREATE INDEX IF NOT EXISTS idx_chatmessages_student_created
ON "chatMessages" ("studentId", "createdAt");
