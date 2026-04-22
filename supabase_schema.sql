-- Supabase Database Schema for EduFlow
-- Paste this into the Supabase SQL Editor and click "Run"

-- 1. Users Table
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    uid TEXT,
    email TEXT,
    "displayName" TEXT,
    role TEXT,
    "studentId" TEXT,
    "createdAt" TEXT,
    username TEXT,
    password TEXT
);

-- 2. Settings Table
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

-- 3. Students Table
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

-- 4. Classes Table
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

-- 5. Subjects Table
CREATE TABLE IF NOT EXISTS subjects (
    id TEXT PRIMARY KEY,
    name TEXT,
    code TEXT,
    "classId" TEXT,
    "teacherName" TEXT
);

-- 6. Materials Table
CREATE TABLE IF NOT EXISTS materials (
    id TEXT PRIMARY KEY,
    "subjectId" TEXT,
    title TEXT,
    weight NUMERIC,
    type TEXT
);

-- 7. Grades Table
CREATE TABLE IF NOT EXISTS grades (
    id TEXT PRIMARY KEY,
    "studentId" TEXT,
    "materialId" TEXT,
    value NUMERIC,
    "scoreType" TEXT
);

-- 8. Fee Items Table
CREATE TABLE IF NOT EXISTS "feeItems" (
    id TEXT PRIMARY KEY,
    name TEXT,
    amount NUMERIC,
    category TEXT,
    "academicYear" TEXT
);

-- 9. Student Payments Table
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

-- 10. Savings Transactions Table
CREATE TABLE IF NOT EXISTS "savingsTransactions" (
    id TEXT PRIMARY KEY,
    "studentId" TEXT,
    amount NUMERIC,
    date TEXT,
    type TEXT,
    notes TEXT
);

-- 11. Class Cash Transactions Table
CREATE TABLE IF NOT EXISTS "classCashTransactions" (
    id TEXT PRIMARY KEY,
    "classId" TEXT,
    "studentId" TEXT,
    type TEXT,
    "transactionType" TEXT,
    amount NUMERIC,
    date TEXT,
    notes TEXT
);

-- 12. School Deposits Table
CREATE TABLE IF NOT EXISTS "schoolDeposits" (
    id TEXT PRIMARY KEY,
    "classId" TEXT,
    "feeItemId" TEXT,
    amount NUMERIC,
    "depositDate" TEXT,
    notes TEXT
);

-- 13. Academic Records Table
CREATE TABLE IF NOT EXISTS "academicRecords" (
    id TEXT PRIMARY KEY,
    "studentId" TEXT,
    rapot JSONB,
    prestasi JSONB,
    ijazah JSONB,
    tka TEXT
);

-- 14. Dashboard Widgets
CREATE TABLE IF NOT EXISTS "dashboardWidgets" (
    id TEXT PRIMARY KEY,
    type TEXT,
    title TEXT,
    "isVisible" BOOLEAN,
    "order" INTEGER,
    user_id TEXT
);

-- Note: We are using TEXT for IDs to match your local uuid generation (e.g. Math.random().toString(36))

-- Insert Default Admin User
INSERT INTO users (id, uid, email, "displayName", role, "createdAt", username, password)
VALUES ('1', 'admin-uid', 'admin@sekolah.id', 'Super Admin', 'admin', '2025-01-01T00:00:00.000Z', 'admin', 'admin')
ON CONFLICT (id) DO NOTHING;

-- Insert Default Settings
INSERT INTO settings (id, "appName", "schoolName", "schoolAddress", "themeColor")
VALUES ('default', 'EduFlow', 'Sekolah Contoh', 'Jl. Merdeka No. 1', '#3b82f6')
ON CONFLICT (id) DO NOTHING;
