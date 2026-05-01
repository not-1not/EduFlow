/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Student {
    id: string;
    name: string;
    email: string;
    classId: string;
    attendance: number; // percentage
    gradeValue?: number; // average grade
    nisn?: string;
    nis?: string;
    gender?: 'L' | 'P';
    phone?: string;
    address?: string;
    dusun?: string;
    desa?: string;
    kecamatan?: string;
    birthPlace?: string;
    birthDate?: string;
    nik?: string;
    nkk?: string;
    religion?: string;
    weightSem1?: number;
    weightSem2?: number;
    heightSem1?: number;
    heightSem2?: number;
    fatherName?: string;
    fatherBirthYear?: string;
    fatherNik?: string;
    motherName?: string;
    motherBirthYear?: string;
    motherNik?: string;
    guardianName?: string;
    guardianBirthYear?: string;
    guardianNik?: string;
    distanceToSchool?: number;
    attendanceNumber?: number;
    notes?: string;
    paymentExtraBills?: Array<{
        id: string;
        label: string;
        amount: number;
    }>;
}

export interface Subject {
    id: string;
    name: string;
    code: string;
    classId: string;
    teacherName?: string; // Guru Mapel
}

export type AssessmentType = 'formatif' | 'sumatif' | 'pengetahuan' | 'keterampilan' | 'pts' | 'pas';

export interface Material {
    id: string;
    subjectId: string;
    title: string;
    weight: number; // percentage of total grade
    type: AssessmentType;
}

export interface Grade {
    id: string;
    studentId: string;
    materialId: string;
    value: number;
    scoreType?: string;
}

export interface Class {
    id: string;
    name: string;
    subject: string;
    teacher: string; // Keep for compatibility or use as homeroom
    homeroomTeacher: string;
    homeroomTeacherNip: string;
    academicYear: string;
    studentCount: number;
    schedule: string; // e.g., "Mon, Wed 09:00 AM" or we can make it more structured
}

export interface Assignment {
    id: string;
    title: string;
    dueDate: string;
    classId: string;
    status: 'active' | 'closed' | 'draft';
}

export type AttendanceStatus = 'hadir' | 'izin' | 'sakit' | 'alpa';

export interface AttendanceRecord {
    id: string;
    studentId: string;
    classId: string;
    date: string; // YYYY-MM-DD
    status: AttendanceStatus;
}

export interface Holiday {
    date: string;
    name: string;
    is_national_holiday: boolean;
}

export interface FeeItem {
    id: string;
    name: string;
    amount: number;
    category: 'wajib' | 'sukarela' | 'lainnya';
    academicYear: string;
}

export interface StudentPayment {
    id: string;
    studentId: string;
    feeItemId: string;
    amountPaid: number;
    paymentDate: string;
    paymentMethod: 'cash' | 'transfer' | 'bank';
    notes?: string;
    isDeposit?: boolean; // If true, it's a general deposit not yet mapped to a specific fee
}

export interface SavingsTransaction {
    id: string;
    studentId: string;
    amount: number;
    date: string;
    type: 'deposit' | 'withdrawal';
    notes?: string;
}

export interface ClassCashTransaction {
    id: string;
    classId: string;
    studentId?: string; // Optional: if null, it's a class-wide transaction
    type: 'gemari' | 'infaq';
    transactionType?: 'deposit' | 'withdrawal'; // 'deposit' by default
    amount: number;
    date: string;
    period_month?: string; // YYYY-MM
    notes?: string;
}

export interface SchoolDeposit {
    id: string;
    classId: string;
    feeItemId: string;
    amount: number;
    depositDate: string;
    notes?: string;
}

export type UserRole = 'admin' | 'student';

export interface StudentDisplaySettings {
    showGrades: boolean;
    showAttendance: boolean;
    showPayments: boolean;
    showSavings: boolean;
    showClassCash: boolean;
}

export interface AppSettings {
    appName: string;
    schoolName: string;
    schoolAddress: string;
    schoolNpsn?: string;
    schoolContact?: string;
    headmasterName: string;
    headmasterNip?: string;
    themeColor: string;
    features?: {
        enableSavings?: boolean;
        enableClassCash?: boolean;
        enableAcademic?: boolean;
        enablePayments?: boolean;
        enableAttendance?: boolean;
    };
    studentDisplaySettings?: StudentDisplaySettings;
}

export interface Achievement {
    id: string;
    name: string;
    level: string; // e.g., Kabupaten, Provinsi, Nasional
    year: string;
    poin?: number | string;
}

export interface DiplomaSubject {
    id: string;
    no: number;
    subject: string;
    grade_p: number | string;
    grade_k: number | string;
}

export interface SemesterGrade {
    subject: string;
    s41_p: number | string;
    s41_k: number | string;
    s42_p: number | string;
    s42_k: number | string;
    s51_p: number | string;
    s51_k: number | string;
    s52_p: number | string;
    s52_k: number | string;
    s61_p: number | string;
    s61_k: number | string;
}

export interface AcademicRecord {
    id: string;
    studentId: string;
    rapot: SemesterGrade[];
    prestasi: Achievement[];
    ijazah: DiplomaSubject[];
    tka?: number | string;
}

export type WidgetType = 'stats' | 'arrears' | 'recent_savings' | 'attendance_summary' | 'cash_flow';

export interface DashboardWidget {
    id: string;
    type: WidgetType;
    title: string;
    isVisible: boolean;
    order: number;
}

export interface UserAccount {
    id: string;
    uid: string;
    email: string;
    displayName: string;
    role: UserRole;
    studentId?: string; // Link to student record if role is student
    createdAt: string;
    username?: string;
    password?: string;
}

export type View = 'dashboard' | 'student-dashboard' | 'students' | 'classes' | 'attendance' | 'settings' | 'grades' | 'subjects' | 'student-profile' | 'payments' | 'savings' | 'class-cash' | 'academic' | 'users';

