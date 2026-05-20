/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from './components/AuthProvider';
import { Login } from './components/Login';
import {
    Users,
    BookOpen,
    LayoutDashboard,
    CalendarCheck,
    FileText,
    Search,
    Bell,
    User,
    Plus,
    ArrowUpRight,
    TrendingUp,
    Clock,
    Filter,
    MoreVertical,
    Activity,
    AlertCircle,
    Download,
    Upload,
    Edit3,
    Save,
    Database,
    Grid,
    FileSpreadsheet,
    Settings,
    Trash2,
    X,
    Edit,
    UserPlus,
    ChevronLeft,
    ChevronRight,
    Printer,
    CreditCard,
    Wallet,
    PiggyBank,
    History,
    TrendingDown as TrendingDownIcon,
    Coins,
    PanelLeftClose,
    PanelLeftOpen,
    Layout,
    CheckSquare,
    ArrowDownRight,
    Menu,
    Calculator,
    ArrowUp,
    ArrowDown,
    Building2,
    Zap,
    Palette,
    TrendingDown,
     MessageSquare,
     Send,
     LogOut,
     Sparkles,
     Minus
 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db, collection, getDocs, doc, setDoc, updateDoc, deleteDoc, query, where, orderBy, getDoc, addDoc, supabase, syncSheetRecords } from './firebase';
import { View, Student, Class, Assignment, Subject, Material, Grade, AttendanceRecord, AttendanceStatus, Holiday, AssessmentType, FeeItem, StudentPayment, SavingsTransaction, ClassCashTransaction, DashboardWidget, SchoolDeposit, AppSettings, UserAccount, UserRole, StudentDisplaySettings, ChatMessage } from './types';
import { INDONESIA_HOLIDAYS_2026 } from './data/holidays';
import sdn3PurwosariLogo from './assets/logo-sdn3-purwosari.png';
import html2canvas from 'html2canvas';

const sortStudentsForSelect = (students: Student[]) => {
    return [...students].sort((a, b) => {
        const aNum = a.attendanceNumber ?? Number.POSITIVE_INFINITY;
        const bNum = b.attendanceNumber ?? Number.POSITIVE_INFINITY;
        if (aNum !== bNum) return aNum - bNum;
        return (a.name || '').localeCompare((b.name || ''), 'id-ID', { numeric: true, sensitivity: 'base' });
    });
};

const normalizeDelimitedHeader = (value: string) =>
    String(value || '')
        .replace(/^\uFEFF/, '')
        .replace(/(^"|"$)/g, '')
        .trim()
        .toLowerCase();

const detectDelimitedSeparator = (text: string) => {
    const sampleLine = String(text || '')
        .replace(/^\uFEFF/, '')
        .split(/\r?\n/)
        .find(line => line.trim().length > 0) || '';
    const candidates = [',', ';', '\t'] as const;
    let best = ',';
    let bestScore = -1;

    for (const delimiter of candidates) {
        let count = 0;
        let inQuotes = false;
        for (let i = 0; i < sampleLine.length; i++) {
            const ch = sampleLine[i];
            if (ch === '"') {
                if (inQuotes && sampleLine[i + 1] === '"') {
                    i++;
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (ch === delimiter && !inQuotes) {
                count++;
            }
        }
        if (count > bestScore) {
            bestScore = count;
            best = delimiter;
        }
    }

    return best;
};

const parseDelimitedLine = (line: string, delimiter: string) => {
    const cells: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQuotes) {
            if (ch === '"') {
                if (line[i + 1] === '"') {
                    current += '"';
                    i++;
                } else {
                    inQuotes = false;
                }
            } else {
                current += ch;
            }
        } else if (ch === '"') {
            inQuotes = true;
        } else if (ch === delimiter) {
            cells.push(current.trim());
            current = '';
        } else {
            current += ch;
        }
    }

    cells.push(current.trim());
    return cells.map(cell => cell.replace(/^\uFEFF/, '').trim());
};

const serializeDelimitedValue = (value: any) => {
    if (value === undefined || value === null) return '';
    return `"${String(value).replace(/"/g, '""')}"`;
};

const serializeDelimitedRow = (values: any[], delimiter = ';') =>
    values.map(serializeDelimitedValue).join(delimiter);

type ClassCashWriteEntry = {
    classId: string;
    studentId?: string;
    amount: number;
    date: string;
    period_month?: string;
    type: 'gemari' | 'infaq';
    notes?: string;
    transactionType?: 'deposit' | 'withdrawal';
};

const DEFAULT_APP_FEATURES: Required<NonNullable<AppSettings['features']>> = {
    enableSavings: true,
    enableClassCash: true,
    enableInfaq: true,
    enableAcademic: true,
    enablePayments: true,
    enableAttendance: true
};

const withDefaultFeatures = (settings: AppSettings): AppSettings => ({
    ...settings,
    features: {
        ...DEFAULT_APP_FEATURES,
        ...(settings.features || {})
    }
});

const getPeriodMonth = (dateValue: string) => String(dateValue || '').slice(0, 7);
const CLASSCASH_EDIT_KEY_SEPARATOR = '::';
const currentYear = new Date().getFullYear();
const CLASSCASH_MONTH_TABLES: string[] = [];
for (let y = 2025; y <= currentYear + 1; y++) {
    for (let m = 1; m <= 12; m++) {
        CLASSCASH_MONTH_TABLES.push(`classCashTransactions_${y}_${String(m).padStart(2, '0')}`);
    }
}
const getClassCashTableByDate = (dateValue: string) => {
    const month = getPeriodMonth(dateValue);
    const [year, mm] = month.split('-');
    if (year && mm) return `classCashTransactions_${year}_${mm}`;
    return `classCashTransactions_${currentYear}_01`;
};

const applyClassCashFilters = (queryBuilder: any, filters: { studentId?: string; classId?: string; amount?: number }) => {
    let q = queryBuilder;
    if (filters.studentId !== undefined) q = q.eq('studentId', filters.studentId);
    if (filters.classId !== undefined) q = q.eq('classId', filters.classId);
    if (filters.amount !== undefined) q = q.eq('amount', filters.amount);
    return q;
};

async function fetchClassCashTransactions(filters: { studentId?: string; classId?: string; amount?: number } = {}) {
    const sb = supabase;
    if (!sb) return [] as any[];
    
    // We fetch across generated partitioned tables
    const responses = await Promise.all(
        CLASSCASH_MONTH_TABLES.map((tableName) =>
            applyClassCashFilters(sb.from(tableName).select('*'), filters)
        )
    );

    const merged: any[] = [];
    responses.forEach(({ data, error }, idx) => {
        if (error) {
            // Ignore missing tables gracefully, it just means no transactions for that month yet
            if (!error.message?.includes('does not exist')) {
                console.error(`Error fetching ${CLASSCASH_MONTH_TABLES[idx]}:`, error);
            }
            return;
        }
        if (Array.isArray(data)) merged.push(...data);
    });
    return merged.map((t) => ({
        ...t,
        period_month: t?.period_month || getPeriodMonth(String(t?.date || ''))
    }));
}

const buildClassCashKey = (entry: ClassCashWriteEntry) =>
    `${entry.classId}__${entry.studentId || 'kolektif'}__${entry.type}__${entry.date}__${entry.transactionType || 'deposit'}__${getPeriodMonth(entry.date)}`;

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function persistClassCashEntries(entries: ClassCashWriteEntry[]) {
    if (!entries.length) return { total: 0 };

    const deduped = Array.from(
        entries.reduce((map, entry) => {
            map.set(buildClassCashKey(entry), entry);
            return map;
        }, new Map<string, ClassCashWriteEntry>()).values()
    );

    const rows = deduped.map((entry) => ({
        ...entry,
        transactionType: entry.transactionType || 'deposit',
        period_month: getPeriodMonth(entry.date),
        id: buildClassCashKey(entry)
    }));
    const chunkSize = 200;
    const maxRetries = 2;

    const groupedByTable = rows.reduce((acc, row) => {
        const tableName = getClassCashTableByDate(row.date);
        if (!acc[tableName]) acc[tableName] = [];
        acc[tableName].push(row);
        return acc;
    }, {} as Record<string, any[]>);

    for (const [tableName, tableRows] of Object.entries(groupedByTable)) {
        const rowsToDelete = tableRows.filter((row) => Number(row.amount) < 0);
        const rowsToUpsert = tableRows.filter((row) => Number(row.amount) >= 0);

        for (let i = 0; i < rowsToDelete.length; i += chunkSize) {
            const deleteChunk = rowsToDelete.slice(i, i + chunkSize);
            const deleteIds = deleteChunk.map((row) => row.id).filter(Boolean);
            if (!deleteIds.length) continue;
            if (!supabase) {
                for (const deleteId of deleteIds) {
                    await deleteDoc(doc(db, tableName, deleteId));
                }
                continue;
            }
            const { error } = await supabase.from(tableName).delete().in('id', deleteIds);
            if (error) throw error;
        }

        for (let i = 0; i < rowsToUpsert.length; i += chunkSize) {
            const chunk = rowsToUpsert.slice(i, i + chunkSize);
            let lastError: any = null;

            for (let attempt = 0; attempt <= maxRetries; attempt++) {
                if (!supabase) {
                    for (const row of chunk) {
                        await setDoc(doc(db, tableName, row.id), row);
                    }
                    lastError = null;
                    break;
                }

                const { error } = await supabase
                    .from(tableName)
                    .upsert(chunk, { onConflict: 'id', ignoreDuplicates: false });

                if (!error) {
                    lastError = null;
                    break;
                }

                lastError = error;
                if (attempt < maxRetries) {
                    await delay(300 * (attempt + 1));
                }
            }

        if (lastError) {
            throw lastError;
        }
    }
    } // End of groupedByTable loop

    return { total: rows.length };
}

export default function App() {
    const { user, role, studentId, loading, logout } = useAuth();

    if (loading) return <div className="h-screen flex items-center justify-center">Loading...</div>;
    if (!user) return <Login />;

    return <MainContent user={user} role={role} studentId={studentId} logout={logout} />;
}

function MainContent({ user, role, studentId, logout }: { user: any, role: any, studentId: any, logout: () => Promise<void> }) {
    const [currentView, setCurrentView] = useState<View>(role === 'student' ? 'student-dashboard' : 'dashboard');
    const [searchQuery, setSearchQuery] = useState('');
    const [students, setStudents] = useState<Student[]>([]);
    const [classes, setClasses] = useState<Class[]>([]);
    const [subjects, setSubjects] = useState<Subject[]>([]);
    const [materials, setMaterials] = useState<Material[]>([]);
    const [grades, setGrades] = useState<Grade[]>([]);
    const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
    const [feeItems, setFeeItems] = useState<FeeItem[]>([]);
    const [payments, setPayments] = useState<StudentPayment[]>([]);
    const [savings, setSavings] = useState<SavingsTransaction[]>([]);
    const [classCash, setClassCash] = useState<ClassCashTransaction[]>([]);
    const [schoolDeposits, setSchoolDeposits] = useState<SchoolDeposit[]>([]);
    const [holidays, setHolidays] = useState<Holiday[]>([]);
    const [appSettings, setAppSettings] = useState<AppSettings | null>(null);
    const [dataLoading, setDataLoading] = useState(true);
    const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
    const [showPrintModal, setShowPrintModal] = useState(false);
    const [printSettings, setPrintSettings] = useState({ margin: '20mm', paperSize: 'A4' });
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
    const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>({ key: 'attendanceNumber', direction: 'asc' });
    const [dashboardWidgets, setDashboardWidgets] = useState<DashboardWidget[]>([
        { id: '1', type: 'stats', title: 'Ringkasan Cepat', isVisible: true, order: 0 },
        { id: '2', type: 'arrears', title: 'Tunggakan Tertinggi', isVisible: true, order: 1 },
        { id: '3', type: 'recent_savings', title: 'Aktivitas Tabungan', isVisible: true, order: 2 },
        { id: '4', type: 'attendance_summary', title: 'Rekap Kehadiran', isVisible: true, order: 3 },
        { id: '5', type: 'cash_flow', title: 'Gemari', isVisible: true, order: 4 },
    ]);

    useEffect(() => {
        if (role === 'student' && currentView !== 'student-dashboard') {
            setCurrentView('student-dashboard');
        }
    }, [role, currentView]);

    const handleSort = (key: string) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const handlePrint = () => {
        window.print();
        setShowPrintModal(false);
    };

    const sortedData = <T,>(data: T[]): T[] => {
        if (!sortConfig) return data;
        return [...data].sort((a: any, b: any) => {
            const aVal = a[sortConfig.key];
            const bVal = b[sortConfig.key];
            if (aVal == null && bVal == null) return 0;
            if (aVal == null) return 1;
            if (bVal == null) return -1;

            let cmp = 0;
            if (typeof aVal === 'number' && typeof bVal === 'number') cmp = aVal - bVal;
            else cmp = String(aVal).localeCompare(String(bVal), 'id-ID', { numeric: true, sensitivity: 'base' });
            return sortConfig.direction === 'asc' ? cmp : -cmp;
        });
    };

    const SortableTH = ({ label, sortKey, currentSort, onSort }: { label: string, sortKey: string, currentSort: { key: string, direction: 'asc' | 'desc' } | null, onSort: (k: string) => void }) => {
        const isActive = currentSort?.key === sortKey;
        return (
            <th
                className="cursor-pointer hover:text-accent transition-colors group"
                onClick={() => onSort(sortKey)}
            >
                <div className="flex items-center gap-1">
                    {label}
                    <div className={`transition-opacity ${isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-50'}`}>
                        {isActive && currentSort.direction === 'desc' ? <ArrowDown size={12} /> : <ArrowUp size={12} />}
                    </div>
                </div>
            </th>
        );
    };

    const fetchHolidays = async () => {
        // Using local holiday data to avoid "Failed to fetch" errors from external API
        setHolidays(INDONESIA_HOLIDAYS_2026);
    };

    const fetchData = async () => {
        try {
            setDataLoading(true);
            await fetchHolidays();

            const getCollectionData = async (colNameOrQuery: any, debugName?: string) => {
                try {
                    const snap = await getDocs(typeof colNameOrQuery === 'string' ? collection(db, colNameOrQuery) : colNameOrQuery);
                    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                } catch (e) {
                    console.error(`Error fetching collection ${debugName || colNameOrQuery}:`, e);
                    return null;
                }
            };

            // Student account: only load related student data (privacy)
            if (role === 'student' && studentId) {
                const studentSnap = await getDoc(doc(db, 'students', String(studentId)));
                const me = studentSnap.exists()
                    ? ({ id: String(studentId), ...studentSnap.data() } as any)
                    : null;

                const classesData = (await getCollectionData('classes', 'classes')) || [];
                const feeItemsData = (await getCollectionData('feeItems', 'feeItems')) || [];

                const gradesData = (await getCollectionData(
                    query(collection(db, 'grades'), where('studentId', '==', String(studentId))),
                    'grades(studentId)'
                )) || [];
                const attendanceData = (await getCollectionData(
                    query(collection(db, 'attendance'), where('studentId', '==', String(studentId))),
                    'attendance(studentId)'
                )) || [];
                const paymentsData = (await getCollectionData(
                    query(collection(db, 'studentPayments'), where('studentId', '==', String(studentId))),
                    'studentPayments(studentId)'
                )) || [];
                const savingsData = (await getCollectionData(
                    query(collection(db, 'savingsTransactions'), where('studentId', '==', String(studentId))),
                    'savingsTransactions(studentId)'
                )) || [];

                const myClassCash = await fetchClassCashTransactions({ studentId: String(studentId) });
                const bebasSetor = me?.classId ? await fetchClassCashTransactions({ classId: String(me.classId), amount: 0 }) : [];

                const uniq: Record<string, boolean> = {};
                const mergedClassCash = [...myClassCash, ...bebasSetor].filter((t: any) => {
                    if (!t?.id) return true;
                    if (uniq[t.id]) return false;
                    uniq[t.id] = true;
                    return true;
                });

                setStudents(me ? [me as Student] : []);
                setClasses(classesData as Class[]);
                setSubjects([]);
                setMaterials([]);
                setGrades(gradesData as Grade[]);
                setAttendanceRecords(attendanceData as AttendanceRecord[]);
                setFeeItems(feeItemsData as FeeItem[]);
                setPayments(paymentsData as StudentPayment[]);
                setSavings(savingsData as SavingsTransaction[]);
                setClassCash(mergedClassCash as ClassCashTransaction[]);
                setSchoolDeposits([]);

                // Settings still apply (theme, visibility)
                const settingsDoc = await getDoc(doc(db, 'settings', 'global'));
                if (settingsDoc.exists()) setAppSettings(withDefaultFeatures(settingsDoc.data() as AppSettings));

                return;
            }

            const collectionNames = [
                'students',
                'classes',
                'subjects',
                'materials',
                'grades',
                'attendance',
                'feeItems',
                'studentPayments',
                'savingsTransactions',
                'schoolDeposits'
            ] as const;

            const collectionResults = await Promise.all(
                collectionNames.map(async (name) => [name, await getCollectionData(name)] as const)
            );

            const dataMap: Record<string, any[]> = {};
            collectionResults.forEach(([name, data]) => {
                dataMap[name] = Array.isArray(data) ? data : [];
            });

            const studentsData = dataMap.students;
            const classesData = dataMap.classes;
            const subjectsData = dataMap.subjects;
            const materialsData = dataMap.materials;
            const gradesData = dataMap.grades;
            const attendanceData = dataMap.attendance;
            const feeItemsData = dataMap.feeItems;
            const paymentsData = dataMap.studentPayments;
            const savingsData = dataMap.savingsTransactions;
            const classCashData = await fetchClassCashTransactions();
            const schoolDepositsData = dataMap.schoolDeposits;

            // Seed initial data if students collection is empty
            if (studentsData.length === 0) {
                const initialStudents = [
                    { name: 'Budi Santoso', email: 'budi@sekolah.id', nisn: '0012345678', classId: '1', attendance: 95, gradeValue: 88 },
                    { name: 'Siti Aminah', email: 'siti@sekolah.id', nisn: '0023456789', classId: '1', attendance: 98, gradeValue: 92 },
                    { name: 'Agus Pratama', email: 'agus@sekolah.id', nisn: '0034567890', classId: '2', attendance: 90, gradeValue: 85 }
                ];

                const initialClasses = [
                    { name: 'X-IPA-1', subject: 'IPA', homeroomTeacher: 'John Doe', academicYear: '2025/2026', studentCount: 24 },
                    { name: 'XI-IPS-1', subject: 'IPS', homeroomTeacher: 'Mike Ross', academicYear: '2025/2026', studentCount: 15 }
                ];

                // We use setDoc with custom IDs for mock data to be consistent or addDoc
                for (const s of initialStudents) { await addDoc(collection(db, 'students'), s); }
                for (const c of initialClasses) { await addDoc(collection(db, 'classes'), c); }

                // After seeding, we should re-trigger fetch
                fetchData();
                return;
            }

            const classList = (classesData as any[]) || [];
            const classIdSet = new Set(classList.map((c: any) => String(c?.id || '')));

            const resolveStudentClassId = (rawClassId: any): string => {
                const raw = String(rawClassId ?? '').trim();
                if (!raw) return '';
                if (classIdSet.has(raw)) return raw;

                // Backward compatibility: old imports/seed used "1", "2", ... as class pointer.
                const numericIndex = Number(raw);
                if (!Number.isNaN(numericIndex) && numericIndex >= 1 && numericIndex <= classList.length) {
                    const mapped = String(classList[numericIndex - 1]?.id || '');
                    if (mapped) return mapped;
                }

                // Fallback: if student classId stores class name, map by class name.
                const byName = classList.find((c: any) => String(c?.name || '').trim() === raw);
                if (byName?.id) return String(byName.id);

                return raw;
            };

            const normalizedStudents = (studentsData as any[]).map((s) => ({
                ...s,
                name: s?.name || s?.displayName || s?.fullName || s?.nama || '',
                email: s?.email || '',
                classId: resolveStudentClassId(s?.classId),
            }));
            setStudents(normalizedStudents as Student[]);
            setClasses(classesData as Class[]);
            setSubjects(subjectsData as Subject[]);
            setMaterials(materialsData as Material[]);
            setGrades(gradesData as Grade[]);
            setAttendanceRecords(attendanceData as AttendanceRecord[]);
            setFeeItems(feeItemsData as FeeItem[]);
            setPayments(paymentsData as StudentPayment[]);
            setSavings(savingsData as SavingsTransaction[]);
            setClassCash(classCashData as ClassCashTransaction[]);
            setSchoolDeposits(schoolDepositsData as SchoolDeposit[]);

            let settingsDoc = await getDoc(doc(db, 'settings', 'global'));
            if (!settingsDoc.exists()) {
                settingsDoc = await getDoc(doc(db, 'settings', 'default'));
            }
            if (settingsDoc.exists()) {
                const settingsData = withDefaultFeatures(settingsDoc.data() as AppSettings);
                setAppSettings(settingsData);
                if (settingsData.themeColor) {
                    document.documentElement.style.setProperty('--color-accent', settingsData.themeColor);
                }
            } else {
                const defaultSettings: AppSettings = {
                    appName: 'EduManage',
                    schoolName: 'Sekolah Contoh',
                    schoolAddress: 'Jl. Pendidikan No 1',
                    headmasterName: 'Bapak Kepala Sekolah',
                    themeColor: '#3b82f6',
                    features: DEFAULT_APP_FEATURES
                };
                setAppSettings(defaultSettings);
            }
        } catch (error) {
            console.error('Error fetching data:', error);
        } finally {
            setDataLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const renderView = () => {
        if (dataLoading) return <div className="h-full flex items-center justify-center font-mono opacity-30 text-text-secondary">LOADING SYSTEM_DATA...</div>;

        const commonProps = { onSort: handleSort, currentSort: sortConfig, sortedData, SortableTH };

        switch (currentView) {
            case 'student-dashboard':
                return <StudentDashboardView
                    settings={appSettings}
                    attendance={attendanceRecords}
                    grades={grades}
                    studentId={studentId}
                    students={students}
                    payments={payments}
                    savings={savings}
                    classCash={classCash}
                    feeItems={feeItems}
                    classes={classes}
                    holidays={holidays}
                />;
            case 'dashboard':
                return <DashboardView
                    classes={classes}
                    students={students}
                    feeItems={feeItems}
                    payments={payments}
                    savings={savings}
                    classCash={classCash}
                    widgets={dashboardWidgets}
                    attendance={attendanceRecords}
                    onSetWidgets={setDashboardWidgets}
                    onNavigate={setCurrentView}
                    {...commonProps}
                />;
            case 'messages':
                return role === 'admin'
                    ? <AdminMessagesView user={user} students={students} />
                    : <StudentMessagesView user={user} students={students} studentId={String(studentId || '')} />;
            case 'students':
                return <StudentsView
                    students={students}
                    classes={classes}
                    onRefresh={fetchData}
                    onViewProfile={(id) => {
                        setSelectedStudentId(id);
                        setCurrentView('student-profile');
                    }}
                    onSetSortConfig={setSortConfig}
                    {...commonProps}
                />;
            case 'classes':
                return <ClassesView classes={classes} onRefresh={fetchData} />;
            case 'attendance':
                return <AttendanceView students={students} classes={classes} attendanceRecords={attendanceRecords} holidays={holidays} onRefresh={fetchData} onOpenPrint={() => setShowPrintModal(true)} {...commonProps} />;
            case 'payments':
                return <PaymentsView
                    students={students}
                    classes={classes}
                    feeItems={feeItems}
                    payments={payments}
                    classCash={classCash}
                    holidays={holidays}
                    schoolDeposits={schoolDeposits}
                    onRefresh={fetchData}
                    onOpenPrint={() => setShowPrintModal(true)}
                    initialStudentId={selectedStudentId}
                    onCloseDetail={() => setSelectedStudentId(null)}
                    {...commonProps}
                />;
            case 'savings':
                return <SavingsView students={students} classes={classes} transactions={savings} onRefresh={fetchData} onOpenPrint={() => setShowPrintModal(true)} {...commonProps} />;
            case 'gemari':
                return <GemariView
                    classes={classes}
                    students={students}
                    transactions={classCash}
                    holidays={holidays}
                    onRefresh={fetchData}
                    onOpenPrint={() => setShowPrintModal(true)}
                    {...commonProps}
                />;
            case 'infaqJumat':
                return <InfaqJumatView
                    classes={classes}
                    students={students}
                    transactions={classCash}
                    holidays={holidays}
                    onRefresh={fetchData}
                    onOpenPrint={() => setShowPrintModal(true)}
                    {...commonProps}
                />;
            case 'grades':
                return <GradesView students={students} subjects={subjects} materials={materials} grades={grades} classes={classes} onRefresh={fetchData} onOpenPrint={() => setShowPrintModal(true)} {...commonProps} />;
            case 'subjects':
                return <SubjectsView subjects={subjects} materials={materials} classes={classes} onRefresh={fetchData} {...commonProps} />;
            case 'student-profile':
                return <StudentProfileView
                    studentId={selectedStudentId}
                    students={students}
                    classes={classes}
                    subjects={subjects}
                    materials={materials}
                    grades={grades}
                    attendance={attendanceRecords}
                    payments={payments}
                    feeItems={feeItems}
                    savings={savings}
                    classCash={classCash}
                    settings={appSettings || { appName: '', schoolName: '', schoolAddress: '', headmasterName: '', themeColor: '#3B82F6' }}
                    onBack={() => setCurrentView('students')}
                    onViewPayments={(id) => {
                        setSelectedStudentId(id);
                        setCurrentView('payments');
                    }}
                />;
            case 'academic':
                return <AcademicView students={students} classes={classes} {...commonProps} />;
            case 'users':
                return <UsersManagementView students={students} classes={classes} />;
            case 'settings':
                return <SettingsView settings={appSettings || { appName: '', schoolName: '', schoolAddress: '', headmasterName: '', themeColor: '#3B82F6', features: DEFAULT_APP_FEATURES }} onSettingsSaved={fetchData} />;
            default:
                return <DashboardView
                    classes={classes}
                    students={students}
                    feeItems={feeItems}
                    payments={payments}
                    savings={savings}
                    classCash={classCash}
                    widgets={dashboardWidgets}
                    attendance={attendanceRecords}
                    onSetWidgets={setDashboardWidgets}
                    onNavigate={setCurrentView}
                    {...commonProps}
                />;
        }
    };

    return (
        <div className="flex h-screen bg-bg text-text-primary overflow-hidden font-sans relative">
            {/* Mobile Sidebar Overlay */}
            <AnimatePresence>
                {!isSidebarCollapsed && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setIsSidebarCollapsed(true)}
                        className="fixed inset-0 bg-slate-900/40 z-30 lg:hidden"
                    />
                )}
            </AnimatePresence>

            {/* Sidebar */}
            <aside
                className={`bg-sidebar-bg text-white flex flex-col h-full transition-all duration-300 ease-in-out z-40 fixed lg:static ${isSidebarCollapsed ? 'w-0 lg:w-[80px] -translate-x-full lg:translate-x-0' : 'w-[260px] translate-x-0'} border-r border-slate-800`}
            >
                <div className={`logo h-[72px] flex items-center border-b border-slate-800 mb-6 flex-shrink-0 transition-all duration-300 ${isSidebarCollapsed ? 'justify-center px-0' : 'justify-between px-6'}`}>
                    {!isSidebarCollapsed ? (
                        <div className="text-[20px] font-[800] flex items-center gap-[10px] overflow-hidden">
                            <div className="logo-icon w-9 h-9 bg-slate-800 rounded-xl flex items-center justify-center text-yellow-400 border border-slate-700 shadow-xl shadow-black/20 flex-shrink-0">
                                <Layout size={20} />
                            </div>
                            <span className="truncate tracking-tight">{appSettings?.appName || 'EduManage'}</span>
                        </div>
                    ) : (
                        <div className="logo-icon w-11 h-11 bg-slate-800 rounded-xl flex items-center justify-center text-yellow-400 border border-slate-700 shadow-xl shadow-black/20 transform hover:rotate-12 transition-transform duration-300">
                            <Layout size={24} />
                        </div>
                    )}

                    <button
                        onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                        className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 lg:hidden"
                        title="Tutup Menu"
                    >
                        <X size={20} />
                    </button>
                </div>

                <nav className="flex flex-col gap-1 px-3 flex-1 scrollbar-hide overflow-y-auto">
                    {!isSidebarCollapsed && <div className="px-4 pt-4 pb-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Menu Utama</div>}
                    <NavItem
                        icon={<LayoutDashboard size={20} />}
                        label="Beranda"
                        active={role === 'student' ? currentView === 'student-dashboard' : currentView === 'dashboard'}
                        collapsed={isSidebarCollapsed}
                        onClick={() => { setCurrentView(role === 'student' ? 'student-dashboard' : 'dashboard'); if (window.innerWidth < 1024) setIsSidebarCollapsed(true); }}
                    />
                    <NavItem
                        icon={<MessageSquare size={20} />}
                        label="Pesan / Chat"
                        active={currentView === 'messages'}
                        collapsed={isSidebarCollapsed}
                        onClick={() => { setCurrentView('messages'); if (window.innerWidth < 1024) setIsSidebarCollapsed(true); }}
                    />
                    {role === 'admin' && (
                        <NavItem
                            icon={<Users size={20} />}
                            label="Database Siswa"
                            active={currentView === 'students'}
                            collapsed={isSidebarCollapsed}
                            onClick={() => { setCurrentView('students'); if (window.innerWidth < 1024) setIsSidebarCollapsed(true); }}
                        />
                    )}

                    {role === 'admin' && !isSidebarCollapsed && <div className="px-4 pt-4 pb-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Akademik</div>}
                    {role === 'admin' && (
                        <>
                            <NavItem
                                icon={<BookOpen size={20} />}
                                label="Jadwal Kelas"
                                active={currentView === 'classes'}
                                collapsed={isSidebarCollapsed}
                                onClick={() => { setCurrentView('classes'); if (window.innerWidth < 1024) setIsSidebarCollapsed(true); }}
                            />
                            <NavItem
                                icon={<Database size={20} />}
                                label="Mata Pelajaran"
                                active={currentView === 'subjects'}
                                collapsed={isSidebarCollapsed}
                                onClick={() => { setCurrentView('subjects'); if (window.innerWidth < 1024) setIsSidebarCollapsed(true); }}
                            />
                            <NavItem
                                icon={<Grid size={20} />}
                                label="Input Nilai"
                                active={currentView === 'grades'}
                                collapsed={isSidebarCollapsed}
                                onClick={() => { setCurrentView('grades'); if (window.innerWidth < 1024) setIsSidebarCollapsed(true); }}
                            />
                        </>
                    )}
                    {role === 'admin' && (
                        <NavItem
                            icon={<User size={20} />}
                            label="Manajemen Akun"
                            active={currentView === 'users'}
                            collapsed={isSidebarCollapsed}
                            onClick={() => { setCurrentView('users'); if (window.innerWidth < 1024) setIsSidebarCollapsed(true); }}
                        />
                    )}

                    {role === 'admin' && !isSidebarCollapsed && (appSettings?.features?.enableAttendance || appSettings?.features?.enablePayments || appSettings?.features?.enableSavings || appSettings?.features?.enableClassCash || appSettings?.features?.enableInfaq) && (
                        <div className="px-4 pt-4 pb-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Administrasi</div>
                    )}
                    {role === 'admin' && (!appSettings?.features || appSettings.features.enableAttendance) && (
                        <NavItem
                            icon={<CalendarCheck size={20} />}
                            label="Presensi"
                            active={currentView === 'attendance'}
                            collapsed={isSidebarCollapsed}
                            onClick={() => { setCurrentView('attendance'); if (window.innerWidth < 1024) setIsSidebarCollapsed(true); }}
                        />
                    )}
                    {role === 'admin' && (!appSettings?.features || appSettings.features.enablePayments) && (
                        <NavItem
                            icon={<CreditCard size={20} />}
                            label="Pembayaran"
                            active={currentView === 'payments'}
                            collapsed={isSidebarCollapsed}
                            onClick={() => { setCurrentView('payments'); if (window.innerWidth < 1024) setIsSidebarCollapsed(true); }}
                        />
                    )}
                    {role === 'admin' && (!appSettings?.features || appSettings.features.enableSavings) && (
                        <NavItem
                            icon={<Wallet size={20} />}
                            label="Tabungan"
                            active={currentView === 'savings'}
                            collapsed={isSidebarCollapsed}
                            onClick={() => { setCurrentView('savings'); if (window.innerWidth < 1024) setIsSidebarCollapsed(true); }}
                        />
                    )}
                    {role === 'admin' && (!appSettings?.features || appSettings.features.enableClassCash) && (
                        <NavItem
                            icon={<Coins size={20} />}
                            label="GEMARI"
                            active={currentView === 'gemari'}
                            collapsed={isSidebarCollapsed}
                            onClick={() => { setCurrentView('gemari'); if (window.innerWidth < 1024) setIsSidebarCollapsed(true); }}
                        />
                    )}
                    {role === 'admin' && (!appSettings?.features || appSettings.features.enableInfaq) && (
                        <NavItem
                            icon={<Sparkles size={20} />}
                            label="INFAQ Jumat"
                            active={currentView === 'infaqJumat'}
                            collapsed={isSidebarCollapsed}
                            onClick={() => { setCurrentView('infaqJumat'); if (window.innerWidth < 1024) setIsSidebarCollapsed(true); }}
                        />
                    )}
                    {role === 'admin' && (!appSettings?.features || appSettings.features.enableAcademic) && (
                        <NavItem
                            icon={<FileSpreadsheet size={20} />}
                            label="Akademik & Ijazah"
                            active={currentView === 'academic'}
                            collapsed={isSidebarCollapsed}
                            onClick={() => { setCurrentView('academic'); if (window.innerWidth < 1024) setIsSidebarCollapsed(true); }}
                        />
                    )}
                    {role === 'admin' && (
                        <NavItem
                            icon={<Settings size={20} />}
                            label="Pengaturan"
                            active={currentView === 'settings'}
                            collapsed={isSidebarCollapsed}
                            onClick={() => { setCurrentView('settings'); if (window.innerWidth < 1024) setIsSidebarCollapsed(true); }}
                        />
                    )}
                    <button
                        id="logout-button"
                        onClick={logout}
                        className={`
                      flex items-center transition-all duration-200 rounded-xl
                      bg-red-600 text-white hover:bg-red-700
                      ${isSidebarCollapsed ? 'justify-center w-12 h-12 mx-auto' : 'w-full gap-3 px-4 py-3 shadow-md'}
                      mt-2 mb-4
                    `}
                        title="Keluar dari Aplikasi"
                    >
                        <div className="flex-shrink-0">
                            <LogOut size={20} />
                        </div>
                        {!isSidebarCollapsed && <span className="text-sm font-semibold">Keluar</span>}
                    </button>
                </nav>

                <div className={`p-4 border-t border-slate-800 transition-all duration-300 ${isSidebarCollapsed ? 'px-2' : ''}`}>
                    <div className={`flex items-center rounded-xl bg-slate-800/50 transition-all duration-300 ${isSidebarCollapsed ? 'justify-center w-12 h-12 mx-auto p-0' : 'gap-3 p-2'}`}>
                        <div className="avatar w-8 h-8 bg-slate-700 rounded-lg flex items-center justify-center font-bold text-xs flex-shrink-0 text-yellow-400 shadow-lg shadow-black/20 border border-slate-600">
                            {user.displayName ? user.displayName.charAt(0) : user.email.charAt(0).toUpperCase()}
                        </div>
                        {!isSidebarCollapsed && (
                            <div className="flex flex-col min-w-0">
                                <span className="text-xs font-bold truncate tracking-tight">{user.displayName || user.email.split('@')[0]}</span>
                                <span className="text-[10px] text-slate-400 capitalize truncate font-medium">{role || 'User'}</span>
                            </div>
                        )}
                    </div>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col overflow-hidden min-w-0">
                {/* Header */}
                <header className="h-[72px] bg-white border-b border-border flex items-center justify-between px-4 lg:px-8 flex-shrink-0">
                    <div className="header-title flex items-center gap-4 lg:gap-6 min-w-0">
                        <button
                            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                            className="p-2 hover:bg-slate-100 rounded-lg text-text-secondary transition-all"
                            title={isSidebarCollapsed ? "Buka Sidebar" : "Tutup Sidebar"}
                        >
                            {isSidebarCollapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
                        </button>
                         <h1 className="text-[16px] lg:text-[18px] font-bold truncate">
                             {currentView === 'student-dashboard' ? 'Dashboard Siswa' :
                                 currentView === 'dashboard' ? 'Ringkasan Dashboard' :
                                    currentView === 'messages' ? 'Pesan / Chat' :
                                     currentView === 'students' ? 'Database Siswa' :
                                         currentView === 'classes' ? 'Daftar Kelas' :
                                             currentView === 'subjects' ? 'Manajemen Mata Pelajaran' :
                                                 currentView === 'grades' ? 'Manajemen Nilai Siswa' :
                                                     currentView === 'payments' ? 'Pembayaran Uang Sekolah' :
                                                         currentView === 'savings' ? 'Tabungan Siswa' :
                                                             currentView === 'attendance' ? 'Presensi Siswa' :
                                                             currentView === 'gemari' ? 'GEMARI' :
                                                                 currentView === 'infaqJumat' ? 'INFAQ Jumat' : 'Pengaturan'}
                         </h1>
                        <div className="hidden sm:block h-4 w-px bg-border flex-shrink-0"></div>
                        <div className="hidden sm:block">
                            <ClockDisplay holidays={holidays} />
                        </div>
                    </div>
                    {role === 'admin' && (
                        <div className="flex items-center gap-3 lg:gap-6">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" size={16} />
                                <input
                                    type="text"
                                    placeholder="Cari data..."
                                    className="bg-bg border border-border rounded-lg pl-10 pr-4 py-2 text-sm outline-none focus:border-accent w-64"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                />
                            </div>
                            <button className="flex items-center gap-2 btn-primary">
                                <Plus size={16} />
                                <span>Aksi Cepat</span>
                            </button>
                        </div>
                    )}
                </header>

                {/* View Content */}
                <div className="flex-1 overflow-y-auto p-8">
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={currentView}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.2 }}
                        >
                            {renderView()}
                        </motion.div>
                    </AnimatePresence>
                </div>

                {showPrintModal && (
                    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4 no-print">
                        <div className="bg-white rounded-2xl p-8 max-w-sm w-full shadow-2xl border border-border">
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-xl font-bold">Pengaturan Cetak</h3>
                                <button onClick={() => setShowPrintModal(false)} aria-label="Tutup pengaturan cetak"><X size={20} /></button>
                            </div>
                            <div className="space-y-4">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold uppercase text-text-secondary">Ukuran Kertas</label>
                                    <select
                                        className="w-full bg-slate-50 border border-border rounded-lg p-3 outline-none font-bold text-sm"
                                        value={printSettings.paperSize}
                                        onChange={e => setPrintSettings({ ...printSettings, paperSize: e.target.value })}
                                        title="Pilih Ukuran Kertas"
                                    >
                                        <option value="A4">A4 (210 x 297 mm)</option>
                                        <option value="F4">F4 / Folio (215 x 330 mm)</option>
                                        <option value="Letter">Letter (215.9 x 279.4 mm)</option>
                                    </select>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold uppercase text-text-secondary">Margin Halaman</label>
                                    <select
                                        className="w-full bg-slate-50 border border-border rounded-lg p-3 outline-none font-bold text-sm"
                                        value={printSettings.margin}
                                        onChange={e => setPrintSettings({ ...printSettings, margin: e.target.value })}
                                        title="Pilih Margin Halaman"
                                    >
                                        <option value="10mm">Sempit (10mm)</option>
                                        <option value="20mm">Normal (20mm)</option>
                                        <option value="25mm">Lebar (25mm)</option>
                                    </select>
                                </div>
                                <button onClick={handlePrint} className="w-full btn-primary py-3 flex items-center justify-center gap-2 mt-4 transition-all hover:scale-[1.02] active:scale-95">
                                    <Printer size={18} /> Mulai Cetak PDF
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}

function SubjectsView({
    subjects,
    materials,
    classes,
    onRefresh,
    onSort,
    currentSort,
    sortedData,
    SortableTH
}: {
    subjects: Subject[],
    materials: Material[],
    classes: Class[],
    onRefresh: () => void,
    onSort: (k: string) => void,
    currentSort: any,
    sortedData: any,
    SortableTH: any
}) {
    const [showAddSubject, setShowAddSubject] = useState(false);
    const [editingSubject, setEditingSubject] = useState<Subject | null>(null);
    const [newSubject, setNewSubject] = useState({ name: '', code: '', classId: '', teacherName: '' });
    const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null);
    const [showAddMaterial, setShowAddMaterial] = useState(false);
    const [newMaterial, setNewMaterial] = useState({ title: '', weight: 0 });
    const [materialWeightEdits, setMaterialWeightEdits] = useState<Record<string, number>>({});
    const [showTemplateModal, setShowTemplateModal] = useState(false);
    const [applyingTemplate, setApplyingTemplate] = useState(false);
    const [materialTemplateItems, setMaterialTemplateItems] = useState<Array<{ id: string; title: string; weight: number }>>([
        { id: `tpl-${Date.now()}`, title: '', weight: 0 }
    ]);

    useEffect(() => {
        if (!subjects.length) {
            setSelectedSubjectId(null);
            return;
        }
        if (!selectedSubjectId || !subjects.some(s => s.id === selectedSubjectId)) {
            setSelectedSubjectId(subjects[0].id);
        }
    }, [subjects, selectedSubjectId]);

    useEffect(() => {
        const currentSubjectMaterials = materials.filter(m => m.subjectId === selectedSubjectId);
        const initialWeights: Record<string, number> = {};
        currentSubjectMaterials.forEach(m => {
            initialWeights[m.id] = Number(m.weight) || 0;
        });
        setMaterialWeightEdits(initialWeights);
    }, [materials, selectedSubjectId]);

    const handleAddSubject = async () => {
        if (editingSubject) {
            const { id, ...payload } = editingSubject;
            await updateDoc(doc(db, 'subjects', id), payload);
        } else {
            await addDoc(collection(db, 'subjects'), newSubject);
        }
        setNewSubject({ name: '', code: '', classId: '', teacherName: '' });
        setEditingSubject(null);
        setShowAddSubject(false);
        onRefresh();
    };

    const handleDeleteSubject = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        if (!confirm('Hapus mata pelajaran ini beserta semua materinya?')) return;
        const relatedMaterials = materials.filter(m => m.subjectId === id);
        for (const m of relatedMaterials) {
            await deleteDoc(doc(db, 'materials', m.id));
        }
        await deleteDoc(doc(db, 'subjects', id));
        if (selectedSubjectId === id) setSelectedSubjectId(null);
        onRefresh();
    };

    const handleAddMaterial = async () => {
        if (!selectedSubjectId) return;
        await addDoc(collection(db, 'materials'), { ...newMaterial, subjectId: selectedSubjectId });
        setNewMaterial({ title: '', weight: 0 });
        setShowAddMaterial(false);
        onRefresh();
    };

    const handleDeleteMaterial = async (id: string) => {
        if (!confirm('Hapus materi ini?')) return;
        await deleteDoc(doc(db, 'materials', id));
        onRefresh();
    };

    const handleSaveMaterialWeight = async (material: Material) => {
        const updatedWeight = Number(materialWeightEdits[material.id]);
        if (isNaN(updatedWeight) || updatedWeight < 0 || updatedWeight > 100) {
            alert('Bobot harus berupa angka 0-100.');
            return;
        }
        await updateDoc(doc(db, 'materials', material.id), { weight: updatedWeight });
        onRefresh();
    };

    const handleAddTemplateRow = () => {
        setMaterialTemplateItems(prev => [...prev, { id: `tpl-${Date.now()}-${prev.length}`, title: '', weight: 0 }]);
    };

    const handleRemoveTemplateRow = (id: string) => {
        setMaterialTemplateItems(prev => {
            const next = prev.filter(item => item.id !== id);
            return next.length > 0 ? next : [{ id: `tpl-${Date.now()}`, title: '', weight: 0 }];
        });
    };

    const handleUpdateTemplateRow = (id: string, patch: Partial<{ title: string; weight: number }>) => {
        setMaterialTemplateItems(prev =>
            prev.map(item => item.id === id ? { ...item, ...patch } : item)
        );
    };

    const handleApplyTemplateToAllSubjects = async () => {
        const sanitizedTemplate = materialTemplateItems
            .map(item => ({ title: item.title.trim(), weight: Number(item.weight) || 0 }))
            .filter(item => item.title.length > 0);

        if (sanitizedTemplate.length === 0) {
            alert('Isi minimal satu materi pada template.');
            return;
        }
        if (sanitizedTemplate.some(item => item.weight < 0 || item.weight > 100)) {
            alert('Bobot template harus berada dalam rentang 0-100.');
            return;
        }
        if (subjects.length === 0) {
            alert('Belum ada mata pelajaran untuk diterapkan.');
            return;
        }

        setApplyingTemplate(true);
        try {
            // Apply template to each subject: update existing title if found, otherwise create new material.
            for (const subject of subjects) {
                const subjectMaterials = materials.filter(m => m.subjectId === subject.id);
                for (const tpl of sanitizedTemplate) {
                    const existing = subjectMaterials.find(
                        m => String(m.title || '').trim().toLowerCase() === tpl.title.toLowerCase()
                    );
                    if (existing) {
                        await updateDoc(doc(db, 'materials', existing.id), { weight: tpl.weight });
                    } else {
                        await addDoc(collection(db, 'materials'), {
                            subjectId: subject.id,
                            title: tpl.title,
                            weight: tpl.weight
                        });
                    }
                }
            }
            setShowTemplateModal(false);
            onRefresh();
            alert('Template materi berhasil diterapkan ke semua mata pelajaran.');
        } finally {
            setApplyingTemplate(false);
        }
    };

    return (
        <div className="space-y-8">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold tracking-tighter">Mata Pelajaran & Materi</h2>
                    <p className="text-sm text-text-secondary">Kelola kurikulum dan bobot penilaian</p>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={() => setShowTemplateModal(true)} className="btn-small flex items-center gap-2">
                        <FileSpreadsheet size={14} /> Template Semua Mapel
                    </button>
                    <button onClick={() => setShowAddSubject(true)} className="btn-primary flex items-center gap-2">
                        <Plus size={16} /> Tambah Mapel
                    </button>
                </div>
            </div>

            <div className="space-y-6">
                <div className="card !p-0 overflow-hidden">
                    <div className="p-4 border-b border-border bg-slate-50/60 flex items-center justify-between">
                        <h3 className="stat-label">Tabel Mata Pelajaran</h3>
                        <button onClick={() => setShowAddSubject(true)} className="btn-small flex items-center gap-2">
                            <Plus size={14} /> Tambah Mapel
                        </button>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="data-table whitespace-nowrap">
                            <thead>
                                <tr>
                                    <th>MATA PELAJARAN</th>
                                    <th>KODE</th>
                                    <th>KELAS</th>
                                    <th>GURU</th>
                                    <th>JUMLAH MATERI</th>
                                    <th>AKSI</th>
                                </tr>
                            </thead>
                            <tbody>
                                {subjects.map(s => {
                                    const isActive = selectedSubjectId === s.id;
                                    const materialCount = materials.filter(m => m.subjectId === s.id).length;
                                    return (
                                        <tr
                                            key={s.id}
                                            onClick={() => setSelectedSubjectId(s.id)}
                                            className={`cursor-pointer ${isActive ? 'bg-slate-900 text-yellow-400' : 'hover:bg-slate-50'}`}
                                        >
                                            <td className="font-bold">{s.name}</td>
                                            <td className="font-mono text-xs">{s.code || '-'}</td>
                                            <td className="text-xs font-bold">{classes.find(c => c.id === s.classId)?.name || '-'}</td>
                                            <td className="text-xs">{s.teacherName || '-'}</td>
                                            <td className={`text-xs font-black ${isActive ? 'text-yellow-300' : 'text-accent'}`}>{materialCount}</td>
                                            <td>
                                                <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                                                    <button
                                                        onClick={() => { setEditingSubject(s); setShowAddSubject(true); }}
                                                        className={`p-1 rounded ${isActive ? 'hover:bg-white/20' : 'hover:bg-slate-100 text-text-secondary'}`}
                                                    >
                                                        <Edit size={14} />
                                                    </button>
                                                    <button
                                                        onClick={(e) => handleDeleteSubject(e, s.id)}
                                                        className={`p-1 rounded ${isActive ? 'hover:bg-red-500' : 'hover:bg-red-50 text-red-500'}`}
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                                {subjects.length === 0 && (
                                    <tr>
                                        <td colSpan={6} className="text-center py-12 opacity-30 italic">Belum ada mata pelajaran</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="card !p-0 overflow-hidden">
                    <div className="p-4 border-b border-border bg-slate-50/60 flex items-center justify-between">
                        <h3 className="stat-label">
                            Tabel Materi {selectedSubjectId ? `- ${subjects.find(s => s.id === selectedSubjectId)?.name || ''}` : ''}
                        </h3>
                        <button onClick={() => setShowAddMaterial(true)} className="btn-small flex items-center gap-2" disabled={!selectedSubjectId}>
                            <Plus size={14} /> Tambah Materi
                        </button>
                    </div>
                    {!selectedSubjectId ? (
                        <div className="h-40 flex items-center justify-center text-center opacity-30 italic">
                            Pilih mata pelajaran terlebih dahulu
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="data-table whitespace-nowrap">
                                <thead>
                                    <tr>
                                        <th>JUDUL MATERI / KOMPETENSI</th>
                                        <th>BOBOT (%)</th>
                                        <th>AKSI</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {materials.filter(m => m.subjectId === selectedSubjectId).map(m => (
                                        <tr key={m.id}>
                                            <td className="font-medium">{m.title}</td>
                                            <td className="data-value">
                                                <div className="flex items-center gap-2">
                                                    <input
                                                        type="number"
                                                        min={0}
                                                        max={100}
                                                        className="w-20 bg-slate-50 border border-border rounded px-2 py-1 text-sm font-bold outline-none focus:border-accent"
                                                        value={materialWeightEdits[m.id] ?? (Number(m.weight) || 0)}
                                                        onChange={(e) => setMaterialWeightEdits(prev => ({ ...prev, [m.id]: parseInt(e.target.value) || 0 }))}
                                                    />
                                                    <span className="text-xs">%</span>
                                                </div>
                                            </td>
                                            <td>
                                                <div className="flex items-center gap-3">
                                                    <button
                                                        onClick={() => handleSaveMaterialWeight(m)}
                                                        disabled={(materialWeightEdits[m.id] ?? (Number(m.weight) || 0)) === (Number(m.weight) || 0)}
                                                        className="text-emerald-600 font-bold text-xs hover:underline flex items-center gap-1 disabled:opacity-40 disabled:no-underline"
                                                    >
                                                        <Save size={12} /> Simpan
                                                    </button>
                                                    <button onClick={() => handleDeleteMaterial(m.id)} className="text-red-500 font-bold text-xs hover:underline flex items-center gap-1">
                                                        <Trash2 size={12} /> Hapus
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                    {materials.filter(m => m.subjectId === selectedSubjectId).length === 0 && (
                                        <tr>
                                            <td colSpan={3} className="text-center py-10 opacity-30 italic">Belum ada materi ditambahkan</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>

            {/* Modals */}
            {showAddSubject && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl border border-border">
                        <h3 className="text-xl font-bold mb-6">{editingSubject ? 'Edit Mapel' : 'Tambah Mata Pelajaran Baru'}</h3>
                        <div className="space-y-4">
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold uppercase tracking-widest text-text-secondary" htmlFor="subject-name-input">Nama Mata Pelajaran</label>
                                <input
                                    id="subject-name-input"
                                    type="text"
                                    className="w-full bg-slate-50 border border-border rounded-lg p-3 outline-none focus:border-accent"
                                    placeholder="Misal: Kalkulus 1"
                                    value={editingSubject ? editingSubject.name : newSubject.name}
                                    onChange={e => editingSubject ? setEditingSubject({ ...editingSubject, name: e.target.value }) : setNewSubject({ ...newSubject, name: e.target.value })}
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold uppercase tracking-widest text-text-secondary" htmlFor="subject-code-input">Kode Mapel</label>
                                <input
                                    id="subject-code-input"
                                    title="Masukkan Kode Mapel"
                                    type="text"
                                    className="w-full bg-slate-50 border border-border rounded-lg p-3 outline-none focus:border-accent"
                                    placeholder="Misal: MAT-101"
                                    value={editingSubject ? editingSubject.code : newSubject.code}
                                    onChange={e => editingSubject ? setEditingSubject({ ...editingSubject, code: e.target.value }) : setNewSubject({ ...newSubject, code: e.target.value })}
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold uppercase tracking-widest text-text-secondary" htmlFor="subject-class-select">Kelas</label>
                                <select
                                    id="subject-class-select"
                                    title="Pilih Kelas"
                                    className="w-full bg-slate-50 border border-border rounded-lg p-3 outline-none focus:border-accent font-bold"
                                    value={editingSubject ? editingSubject.classId : newSubject.classId}
                                    onChange={e => editingSubject ? setEditingSubject({ ...editingSubject, classId: e.target.value }) : setNewSubject({ ...newSubject, classId: e.target.value })}
                                >
                                    <option value="">Pilih Kelas</option>
                                    {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold uppercase tracking-widest text-text-secondary" htmlFor="subject-teacher-input">Nama Guru Mapel</label>
                                <input
                                    id="subject-teacher-input"
                                    title="Masukkan Nama Guru"
                                    type="text"
                                    className="w-full bg-slate-50 border border-border rounded-lg p-3 outline-none focus:border-accent"
                                    placeholder="Misal: John Doe, S.Pd"
                                    value={editingSubject ? (editingSubject.teacherName || '') : newSubject.teacherName}
                                    onChange={e => editingSubject ? setEditingSubject({ ...editingSubject, teacherName: e.target.value }) : setNewSubject({ ...newSubject, teacherName: e.target.value })}
                                />
                            </div>
                            <div className="flex gap-3 mt-8">
                                <button onClick={() => { setShowAddSubject(false); setEditingSubject(null); }} className="flex-1 py-3 border border-border rounded-xl font-bold text-sm hover:bg-slate-50 transition-all">Batal</button>
                                <button onClick={handleAddSubject} className="flex-1 py-3 bg-slate-900 text-yellow-400 rounded-xl font-bold text-sm shadow-lg shadow-black/20 hover:bg-slate-950 transition-all border border-slate-800">Simpan</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {showAddMaterial && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl border border-border">
                        <h3 className="text-xl font-bold mb-6">Tambah Materi Penilaian</h3>
                        <div className="space-y-4">
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold uppercase tracking-widest text-text-secondary" htmlFor="material-title-input">Judul Materi / Tugas</label>
                                <input
                                    id="material-title-input"
                                    type="text"
                                    className="w-full bg-slate-50 border border-border rounded-lg p-3 outline-none focus:border-accent"
                                    placeholder="Misal: Ujian Tengah Semester"
                                    value={newMaterial.title}
                                    onChange={e => setNewMaterial({ ...newMaterial, title: e.target.value })}
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold uppercase tracking-widest text-text-secondary" htmlFor="material-weight-input">Bobot Penilaian (%)</label>
                                <input
                                    id="material-weight-input"
                                    type="number"
                                    className="w-full bg-slate-50 border border-border rounded-lg p-3 outline-none focus:border-accent"
                                    placeholder="20"
                                    value={newMaterial.weight || ''}
                                    onChange={e => setNewMaterial({ ...newMaterial, weight: parseInt(e.target.value) })}
                                />
                            </div>
                            <div className="flex gap-3 mt-8">
                                <button onClick={() => setShowAddMaterial(false)} className="flex-1 py-3 border border-border rounded-xl font-bold text-sm hover:bg-slate-50 transition-all">Batal</button>
                                <button onClick={handleAddMaterial} className="flex-1 py-3 bg-slate-900 text-yellow-400 rounded-xl font-bold text-sm hover:bg-slate-950 transition-all border border-slate-800">Tambahkan</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {showTemplateModal && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl p-8 max-w-3xl w-full shadow-2xl border border-border max-h-[90vh] overflow-y-auto">
                        <div className="flex justify-between items-center mb-4">
                            <div>
                                <h3 className="text-xl font-bold">Template Daftar Materi Global</h3>
                                <p className="text-xs text-text-secondary">Template ini akan diterapkan ke semua mata pelajaran.</p>
                            </div>
                            <button onClick={() => setShowTemplateModal(false)} aria-label="Tutup template materi"><X size={20} /></button>
                        </div>

                        <div className="card !p-0 overflow-hidden mb-4">
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th className="w-16">#</th>
                                        <th>JUDUL MATERI / KOMPETENSI</th>
                                        <th className="w-40">BOBOT (%)</th>
                                        <th className="w-24">AKSI</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {materialTemplateItems.map((item, index) => (
                                        <tr key={item.id}>
                                            <td className="font-mono text-xs text-slate-400">{index + 1}</td>
                                            <td>
                                                <input
                                                    type="text"
                                                    className="w-full bg-slate-50 border border-border rounded px-3 py-2 outline-none focus:border-accent text-sm"
                                                    placeholder="Contoh: Tugas Harian 1"
                                                    value={item.title}
                                                    onChange={(e) => handleUpdateTemplateRow(item.id, { title: e.target.value })}
                                                />
                                            </td>
                                            <td>
                                                <input
                                                    type="number"
                                                    min={0}
                                                    max={100}
                                                    className="w-full bg-slate-50 border border-border rounded px-3 py-2 outline-none focus:border-accent text-sm font-bold"
                                                    value={item.weight}
                                                    onChange={(e) => handleUpdateTemplateRow(item.id, { weight: parseInt(e.target.value) || 0 })}
                                                />
                                            </td>
                                            <td>
                                                <button
                                                    onClick={() => handleRemoveTemplateRow(item.id)}
                                                    className="text-red-500 font-bold text-xs hover:underline flex items-center gap-1"
                                                >
                                                    <Trash2 size={12} /> Hapus
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="flex justify-between items-center gap-3">
                            <button onClick={handleAddTemplateRow} className="btn-small flex items-center gap-2">
                                <Plus size={14} /> Tambah Baris
                            </button>
                            <div className="flex gap-3">
                                <button onClick={() => setShowTemplateModal(false)} className="px-5 py-2 border border-border rounded-xl font-bold text-sm">Batal</button>
                                <button
                                    onClick={handleApplyTemplateToAllSubjects}
                                    className="btn-primary px-6 py-2 rounded-xl text-sm font-bold disabled:opacity-50"
                                    disabled={applyingTemplate}
                                >
                                    {applyingTemplate ? 'Menerapkan...' : 'Terapkan ke Semua Mapel'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function GradesView({
    students,
    subjects,
    materials,
    grades,
    classes,
    onRefresh,
    onOpenPrint,
    onSort,
    currentSort,
    sortedData,
    SortableTH
}: {
    students: Student[],
    subjects: Subject[],
    materials: Material[],
    grades: Grade[],
    classes: Class[],
    onRefresh: () => void,
    onOpenPrint: () => void,
    onSort: (k: string) => void,
    currentSort: any,
    sortedData: any,
    SortableTH: any
}) {
    const [selectedSubjectId, setSelectedSubjectId] = useState<string>('');
    const [selectedMaterialId, setSelectedMaterialId] = useState<string>('');
    const [editMode, setEditMode] = useState<'manual' | 'bulk' | 'recap' | 'matrix'>('manual');
    const [bulkData, setBulkData] = useState<{ [key: string]: number }>({});
    const [savingId, setSavingId] = useState<string | null>(null);

    useEffect(() => {
        // Initialize bulk data with current values or cache
        const initialBulk: { [key: string]: number } = {};
        const cacheKey = `bulkData_${selectedMaterialId}`;
        const cached = localStorage.getItem(cacheKey);

        let parsedCache: { [key: string]: number } | null = null;
        if (cached) {
            try {
                parsedCache = JSON.parse(cached);
            } catch (e) { }
        }

        students.forEach(s => {
            const grade = grades.find(g => g.studentId === s.id && g.materialId === selectedMaterialId);
            if (parsedCache && typeof parsedCache[s.id] !== 'undefined') {
                initialBulk[s.id] = parsedCache[s.id];
            } else {
                initialBulk[s.id] = grade ? grade.value : 0;
            }
        });
        setBulkData(initialBulk);
    }, [selectedMaterialId, grades, students]);

    const saveGradeEntries = async (entries: Array<{ studentId: string; materialId: string; value: number }>) => {
        for (const entry of entries) {
            const existing = grades.find(g =>
                g.studentId === entry.studentId &&
                g.materialId === entry.materialId
            );
            if (existing?.id) {
                await updateDoc(doc(db, 'grades', existing.id), entry);
            } else {
                await addDoc(collection(db, 'grades'), entry);
            }
        }
    };

    const handleSaveBulk = async () => {
        if (!selectedMaterialId) return;
        const updates = Object.entries(bulkData).map(([studentId, value]) => ({
            studentId,
            materialId: selectedMaterialId,
            value: parseInt(value as any) || 0
        }));
        await saveGradeEntries(updates);
        localStorage.removeItem(`bulkData_${selectedMaterialId}`);
        alert('Nilai masal berhasil disimpan');
        onRefresh();
    };

    const handleSaveSingle = async (studentId: string, value: number) => {
        setSavingId(studentId);
        await saveGradeEntries([{ studentId, materialId: selectedMaterialId, value }]);
        setSavingId(null);
        onRefresh();
    };

    return (
        <div className="space-y-8 print-container">
            <div className="print-header">
                <h1 className="text-2xl font-black uppercase tracking-tighter">REKAPITULASI NILAI SISWA</h1>
                <p className="text-xs font-bold text-slate-500">Mata Pelajaran: {subjects.find(s => s.id === selectedSubjectId)?.name || '-'} | Tahun Pelajaran: {classes.find(c => c.id === subjects.find(s => s.id === selectedSubjectId)?.classId)?.academicYear || '-'}</p>
            </div>

            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 no-print">
                <div className="flex gap-4 flex-1">
                    <div className="space-y-1 flex-1">
                        <label className="stat-label" htmlFor="subject-select">Pilih Mapel</label>
                        <select
                            id="subject-select"
                            className="w-full bg-white border border-border rounded-xl p-3 outline-none font-bold"
                            value={selectedSubjectId}
                            onChange={e => {
                                setSelectedSubjectId(e.target.value);
                                setSelectedMaterialId('');
                            }}
                        >
                            <option value="">Pilih Mata Pelajaran</option>
                            {subjects.map(s => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}
                        </select>
                    </div>
                    <div className="space-y-1 flex-1">
                        <label className="stat-label" htmlFor="material-select">Pilih Materi/Tugas</label>
                        <select
                            id="material-select"
                            className="w-full bg-white border border-border rounded-xl p-3 outline-none font-bold"
                            value={selectedMaterialId}
                            onChange={e => setSelectedMaterialId(e.target.value)}
                            disabled={!selectedSubjectId}
                        >
                            <option value="">Pilih Materi</option>
                            {materials.filter(m => m.subjectId === selectedSubjectId).map(m => <option key={m.id} value={m.id}>{m.title} ({m.weight}%)</option>)}
                        </select>
                    </div>
                </div>
                <div className="flex gap-2 no-print">
                    <button onClick={onOpenPrint} className="btn-small !bg-slate-700 flex items-center gap-2"><Printer size={14} /> Cetak PDF</button>
                    <button className="btn-small !bg-slate-700 flex items-center gap-2"><Download size={14} /> Template</button>
                    <button className="btn-small !bg-slate-700 flex items-center gap-2" title="Upload spreadsheet"><Upload size={14} /> Upload</button>
                </div>
            </div>

            <div className="flex border-b border-border gap-8 pb-3">
                <button
                    onClick={() => setEditMode('manual')}
                    className={`text-sm font-bold uppercase tracking-widest pb-1 transition-all ${editMode === 'manual' ? 'text-accent border-b-2 border-accent' : 'opacity-30 hover:opacity-100'}`}
                >
                    Masukan Manual
                </button>
                <button
                    onClick={() => setEditMode('bulk')}
                    className={`text-sm font-bold uppercase tracking-widest pb-1 transition-all ${editMode === 'bulk' ? 'text-accent border-b-2 border-accent' : 'opacity-30 hover:opacity-100'}`}
                >
                    Edit Masal
                </button>
                <button
                    onClick={() => setEditMode('recap')}
                    className={`text-sm font-bold uppercase tracking-widest pb-1 transition-all ${editMode === 'recap' ? 'text-accent border-b-2 border-accent' : 'opacity-30 hover:opacity-100'}`}
                >
                    Rekap & Download
                </button>
                <button
                    onClick={() => setEditMode('matrix')}
                    className={`text-sm font-bold uppercase tracking-widest pb-1 transition-all ${editMode === 'matrix' ? 'text-accent border-b-2 border-accent' : 'opacity-30 hover:opacity-100'}`}
                >
                    Matrix Kelas
                </button>
            </div>

            <AnimatePresence mode="wait">
                <motion.div
                    key={editMode}
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    className="card !p-0 overflow-hidden"
                >
                    {editMode === 'manual' || editMode === 'bulk' ? (
                        <>
                            <div className="p-4 bg-slate-50 border-b border-border flex items-center justify-between">
                                <div className="flex items-center gap-6">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-white border border-border flex items-center justify-center">
                                            <Grid size={20} className="text-accent" />
                                        </div>
                                        <div>
                                            <h4 className="font-bold text-sm">{materials.find(m => m.id === selectedMaterialId)?.title || 'Pilih Materi/Tugas'}</h4>
                                            <div className="flex gap-2 items-center">
                                                <span className="text-[10px] text-text-secondary uppercase font-bold">Kategori:</span>
                                                <span className="text-[10px] font-black text-accent uppercase">{materials.find(m => m.id === selectedMaterialId)?.type || '-'}</span>
                                            </div>
                                        </div>
                                    </div>

                                </div>
                                {editMode === 'bulk' && (
                                    <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-3 py-1 rounded-full uppercase tabular-nums">Peringatan: Mode Edit Masal Aktif</span>
                                )}
                            </div>
                            <div className="table-container shadow-sm">
                                <table className="data-table whitespace-nowrap">
                                    <thead>
                                        <tr>
                                            <SortableTH label="SISWA" sortKey="name" currentSort={currentSort} onSort={onSort} />
                                            <SortableTH label="EMAIL" sortKey="email" currentSort={currentSort} onSort={onSort} />
                                            <SortableTH label="NILAI (0-100)" sortKey="value" currentSort={currentSort} onSort={onSort} />
                                            <th>STATUS</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {sortedData(students).map((s: any) => (
                                            <tr key={s.id} className="hover:bg-slate-50 transition-all">
                                                <td className="font-bold">{s.name}</td>
                                                <td className="text-text-secondary italic">{s.email}</td>
                                                <td>
                                                    <div className="flex items-center gap-3">
                                                        <input
                                                            type="number"
                                                            aria-label={`Nilai untuk ${s.name}`}
                                                            className={`w-20 bg-slate-50 border border-border rounded px-2 py-1 outline-none font-bold transition-all ${savingId === s.id ? 'opacity-50 scale-95' : ''}`}
                                                            value={editMode === 'manual' ? (grades.find(g => g.studentId === s.id && g.materialId === selectedMaterialId)?.value ?? '') : (bulkData[s.id] || 0)}
                                                            onChange={e => {
                                                                const val = parseInt(e.target.value) || 0;
                                                                if (editMode === 'manual') {
                                                                    handleSaveSingle(s.id, val);
                                                                } else {
                                                                    const newBulkData = { ...bulkData, [s.id]: val };
                                                                    setBulkData(newBulkData);
                                                                    localStorage.setItem(`bulkData_${selectedMaterialId}`, JSON.stringify(newBulkData));
                                                                }
                                                            }}
                                                            disabled={!selectedMaterialId || savingId === s.id}
                                                            placeholder="0"
                                                        />
                                                        {editMode === 'manual' && savingId === s.id && (
                                                            <Activity size={14} className="animate-spin text-accent" />
                                                        )}
                                                    </div>
                                                </td>
                                                <td>
                                                    {grades.find(g => g.studentId === s.id && g.materialId === selectedMaterialId) ? (
                                                        <span className="status-pill !bg-success/10 !text-success">Sudah Dinilai</span>
                                                    ) : (
                                                        <span className="status-pill !bg-red-50 !text-red-500">Belum Ada Nilai</span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            {editMode === 'bulk' && (
                                <div className="p-6 bg-slate-50 border-t border-line flex justify-end">
                                    <button onClick={handleSaveBulk} className="btn-primary flex items-center gap-2">
                                        <Save size={16} /> Simpan Perubahan Masal
                                    </button>
                                </div>
                            )}
                        </>
                    ) : editMode === 'recap' ? (
                        <div className="p-8 space-y-6">
                            <div className="flex items-center justify-between">
                                <h4 className="font-bold">Rekapitulasi Nilai Akhir</h4>
                                <div className="flex gap-2">
                                    <button className="btn-small flex items-center gap-2" title="Download nilai CSV"><FileSpreadsheet size={16} /> Download CSV</button>
                                </div>
                            </div>
                            <div className="table-container">
                                <table className="data-table whitespace-nowrap">
                                    <thead>
                                        <tr className="bg-slate-50">
                                            <th rowSpan={2} className="border-r border-border sticky left-0 bg-slate-50 z-10">NAMA SISWA</th>
                                            <th colSpan={materials.filter(m => m.subjectId === selectedSubjectId && m.type === 'formatif').length || 1} className="text-center border-r border-border text-blue-600 bg-blue-50/20">FORMATIF</th>
                                            <th colSpan={materials.filter(m => m.subjectId === selectedSubjectId && m.type === 'sumatif').length || 1} className="text-center border-r border-border text-orange-600 bg-orange-50/20">SUMATIF</th>
                                            <th rowSpan={2} className="bg-accent/5 sticky right-0 z-10">NILAI AKHIR</th>
                                        </tr>
                                        <tr>
                                            {/* Formatif */}
                                            {materials.filter(m => m.subjectId === selectedSubjectId && m.type === 'formatif').map(m => (
                                                <th key={m.id} className="text-[9px] font-normal" title={m.title}>{m.title.substring(0, 10)}..</th>
                                            ))}
                                            {materials.filter(m => m.subjectId === selectedSubjectId && m.type === 'formatif').length === 0 && <th className="text-[9px] opacity-30 text-center">-</th>}

                                            {/* Sumatif */}
                                            {materials.filter(m => m.subjectId === selectedSubjectId && m.type === 'sumatif').map(m => (
                                                <th key={m.id} className="text-[9px] font-normal" title={m.title}>{m.title.substring(0, 10)}..</th>
                                            ))}
                                            {materials.filter(m => m.subjectId === selectedSubjectId && m.type === 'sumatif').length === 0 && <th className="text-[9px] opacity-30 text-center">-</th>}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {students.map(s => {
                                            const getAvg = (type: AssessmentType) => {
                                                const mats = materials.filter(m => m.subjectId === selectedSubjectId && m.type === type);
                                                if (mats.length === 0) return 0;
                                                let sum = 0;
                                                let count = 0;
                                                mats.forEach(m => {
                                                    // Since we changed score logic, let's just sum whatever grades are attached to this material
                                                    const materialGrades = grades.filter(gr => gr.studentId === s.id && gr.materialId === m.id);
                                                    if (materialGrades.length > 0) {
                                                        sum += materialGrades.reduce((acc, g) => acc + g.value, 0) / materialGrades.length; // avg if multiple score types exist, otherwise just the value
                                                        count++;
                                                    }
                                                });
                                                return count > 0 ? sum / count : 0;
                                            };

                                            const avgFormatif = getAvg('formatif');
                                            const avgSumatif = getAvg('sumatif');

                                            // Calculate NA based on 2 types
                                            const na = (avgFormatif + avgSumatif) / 2;

                                            return (
                                                <tr key={s.id}>
                                                    <td className="font-bold whitespace-nowrap border-r border-border px-4 py-2 sticky left-0 bg-white group-hover:bg-slate-50 z-10">{s.name}</td>
                                                    {/* Formatif Grades */}
                                                    {materials.filter(m => m.subjectId === selectedSubjectId && m.type === 'formatif').map(m => {
                                                        const g = grades.find(gr => gr.studentId === s.id && gr.materialId === m.id);
                                                        return <td key={m.id} className="text-center font-mono text-xs">{g ? g.value : '-'}</td>;
                                                    })}
                                                    {materials.filter(m => m.subjectId === selectedSubjectId && m.type === 'formatif').length === 0 && <td className="text-center opacity-30">-</td>}

                                                    {/* Sumatif Grades */}
                                                    {materials.filter(m => m.subjectId === selectedSubjectId && m.type === 'sumatif').map(m => {
                                                        const g = grades.find(gr => gr.studentId === s.id && gr.materialId === m.id);
                                                        return <td key={m.id} className="text-center font-mono text-xs">{g ? g.value : '-'}</td>;
                                                    })}
                                                    {materials.filter(m => m.subjectId === selectedSubjectId && m.type === 'sumatif').length === 0 && <td className="text-center opacity-30">-</td>}

                                                    <td className="font-black text-accent bg-accent/5 text-center text-sm sticky right-0 z-10">{na.toFixed(1)}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ) : (
                        <div className="p-8 space-y-6">
                            <div className="flex items-center justify-between">
                                <h4 className="font-bold">Matrix Nilai Keseluruhan Kelas</h4>
                                <div className="flex gap-2">
                                    <span className="text-[10px] font-bold bg-slate-100 px-2 py-1 rounded">MATA PELAJARAN AKTIF: {subjects.length}</span>
                                </div>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="data-table">
                                    <thead>
                                        <tr>
                                            <th className="sticky left-0 bg-white z-10">NAMA SISWA</th>
                                            {subjects.map(sub => (
                                                <th key={sub.id} className="text-[10px] whitespace-nowrap px-4">{sub.name.toUpperCase()}</th>
                                            ))}
                                            <th className="bg-accent/5">RATA2 AKHIR</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {students.map(s => {
                                            let classTotal = 0;
                                            let subjectCount = 0;
                                            return (
                                                <tr key={s.id} className="group hover:bg-slate-50">
                                                    <td className="font-bold sticky left-0 bg-white group-hover:bg-slate-50 z-10">{s.name}</td>
                                                    {subjects.map(sub => {
                                                        const getAvg = (type: AssessmentType) => {
                                                            const mats = materials.filter(m => m.subjectId === sub.id && m.type === type);
                                                            if (mats.length === 0) return 0;
                                                            let sum = 0;
                                                            let count = 0;
                                                            mats.forEach(m => {
                                                                const materialGrades = grades.filter(gr => gr.studentId === s.id && gr.materialId === m.id);
                                                                if (materialGrades.length > 0) {
                                                                    sum += materialGrades.reduce((acc, g) => acc + g.value, 0) / materialGrades.length;
                                                                    count++;
                                                                }
                                                            });
                                                            return count > 0 ? sum / count : 0;
                                                        };

                                                        const avgFormatif = getAvg('formatif');
                                                        const avgSumatif = getAvg('sumatif');

                                                        const subMaterials = materials.filter(m => m.subjectId === sub.id);
                                                        const subTotal = subMaterials.length > 0 ? (avgFormatif + avgSumatif) / 2 : 0;

                                                        if (subMaterials.length > 0) {
                                                            classTotal += subTotal;
                                                            subjectCount++;
                                                        }
                                                        return (
                                                            <td key={sub.id} className="text-center font-mono text-xs">
                                                                {subMaterials.length > 0 ? subTotal.toFixed(1) : '-'}
                                                            </td>
                                                        );
                                                    })}
                                                    <td className="font-black text-accent bg-accent/5 text-center">
                                                        {subjectCount > 0 ? (classTotal / subjectCount).toFixed(1) : '0'}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </motion.div>
            </AnimatePresence>
        </div>
    );
}

// Reuse the existing small NavItem component
function NavItem({ icon, label, active, collapsed, onClick }: { icon: React.ReactNode, label: string, active: boolean, collapsed?: boolean, onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            title={collapsed ? label : ''}
            className={`
        relative group flex items-center transition-all duration-200 rounded-xl
        ${active ? 'bg-slate-700 text-yellow-400 shadow-md ring-1 ring-slate-600' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}
        ${collapsed ? 'justify-center w-12 h-12 mx-auto' : 'w-full gap-3 px-4 py-3'}
        mb-1
      `}
        >
            <div className={`flex-shrink-0 transition-transform duration-200 ${active ? 'scale-110' : 'group-hover:scale-110'}`}>
                {icon}
            </div>

            {!collapsed && (
                <span className={`
          font-semibold text-sm whitespace-nowrap overflow-hidden transition-all duration-300
          ${active ? 'opacity-100' : 'opacity-70 group-hover:opacity-100'}
        `}>
                    {label}
                </span>
            )}

            {active && !collapsed && (
                <motion.div
                    layoutId="active-nav-indicator"
                    className="absolute right-2 w-1.5 h-1.5 rounded-full bg-yellow-400"
                />
            )}
        </button>
    );
}

// Previous components (simplified dashboard/classes/students/attendance)
function DashboardView({
    classes,
    students,
    feeItems,
    payments,
    savings,
    classCash,
    widgets,
    attendance,
    onSetWidgets,
    onNavigate,
    onSort,
    currentSort,
    sortedData,
    SortableTH
}: {
    classes: Class[],
    students: Student[],
    feeItems: FeeItem[],
    payments: StudentPayment[],
    savings: SavingsTransaction[],
    classCash: ClassCashTransaction[],
    widgets: DashboardWidget[],
    attendance: AttendanceRecord[],
    onSetWidgets: (w: DashboardWidget[]) => void,
    onNavigate: (v: View) => void,
    onSort: (k: string) => void,
    currentSort: any,
    sortedData: any,
    SortableTH: any
}) {
    const [showWidgetSettings, setShowWidgetSettings] = useState(false);
    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(amount);
    };

    const totalCollected = payments.reduce((acc, p) => acc + p.amountPaid, 0);
    const totalSavings = savings.filter(t => t.type === 'deposit').reduce((acc, t) => acc + t.amount, 0) - savings.filter(t => t.type === 'withdrawal').reduce((acc, t) => acc + t.amount, 0);
    const totalGemari = classCash.filter(t => t.type === 'gemari').reduce((acc, t) => acc + t.amount, 0);

    const reorderWidget = (id: string, direction: 'up' | 'down') => {
        const sortedWidgets = [...widgets].sort((a, b) => a.order - b.order);
        const index = sortedWidgets.findIndex(w => w.id === id);
        if (index < 0) return;

        const newIndex = direction === 'up' ? index - 1 : index + 1;
        if (newIndex < 0 || newIndex >= sortedWidgets.length) return;

        // Swap orders
        const target = sortedWidgets[index];
        const neighbor = sortedWidgets[newIndex];

        const tempOrder = target.order;
        target.order = neighbor.order;
        neighbor.order = tempOrder;

        onSetWidgets([...widgets]);
    };

    const toggleWidget = (id: string) => {
        onSetWidgets(widgets.map(w => w.id === id ? { ...w, isVisible: !w.isVisible } : w));
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center mb-2">
                <p className="text-xs font-bold text-text-secondary uppercase tracking-widest">Pusat Informasi Sekolah</p>
                <button
                    onClick={() => setShowWidgetSettings(true)}
                    className="btn-small flex items-center gap-2"
                >
                    <Settings size={14} /> Atur Dashboard
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 auto-rows-max">
                {widgets.filter(w => w.isVisible).sort((a, b) => a.order - b.order).map(widget => {
                    switch (widget.type) {
                        case 'stats':
                            return (
                                <div key={widget.id} className="grid grid-cols-1 gap-6 col-span-1 md:col-span-2 lg:col-span-3 lg:grid-cols-3">
                                    <StatCard title="Total Siswa" value={students.length.toString()} change={`${classes.length} Kelas Aktif`} icon={<Users size={20} />} />
                                    <StatCard title="Dana Terkumpul" value={formatCurrency(totalCollected)} change="Total pembayaran SPP/Lainnya" icon={<CreditCard size={20} />} iconColor="text-blue-500" />
                                    <StatCard title="Kas Gemari" value={formatCurrency(totalGemari)} change="Akumulasi Kas Kelas" icon={<Coins size={20} />} iconColor="text-emerald-500" />
                                </div>
                            );
                        case 'arrears':
                            return (
                                <div key={widget.id} className="card col-span-1 md:col-span-2 !p-0 overflow-hidden">
                                    <div className="card-header p-5 border-b border-border flex justify-between items-center">
                                        <span className="font-bold flex items-center gap-2"><AlertCircle size={16} className="text-red-500" /> {widget.title}</span>
                                        <span className="text-[10px] bg-red-50 text-red-600 px-2 py-1 rounded font-bold uppercase tracking-widest">Perhatian Khusus</span>
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="data-table">
                                            <thead>
                                                <tr>
                                                    <th>SISWA</th>
                                                    <th>KELAS</th>
                                                    <th>TUNGGAKAN</th>
                                                    <th>AKSI</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {sortedData(students.map(s => {
                                                    const paid = payments.filter(p => p.studentId === s.id && !p.isDeposit).reduce((acc, p) => acc + p.amountPaid, 0);
                                                    const due = feeItems.filter(i => i.category === 'wajib').reduce((acc, i) => acc + i.amount, 0);
                                                    return { s, arrears: due - paid };
                                                })
                                                    .filter(item => item.arrears > 0)).slice(0, 5).map((item: any) => (
                                                        <tr key={item.s.id} className="hover:bg-slate-50 transition-all group">
                                                            <td className="font-bold">
                                                                <div className="flex items-center gap-2">
                                                                    {item.s.name}
                                                                    <ArrowUpRight size={12} className="opacity-0 group-hover:opacity-40" />
                                                                </div>
                                                            </td>
                                                            <td className="text-[10px] font-black uppercase text-slate-500 whitespace-nowrap">{classes.find(c => c.id === item.s.classId)?.name}</td>
                                                            <td className="text-red-500 font-black font-mono text-sm">{formatCurrency(item.arrears)}</td>
                                                            <td><button className="px-2 py-1 bg-slate-100 hover:bg-slate-200 rounded text-accent font-bold text-[9px] uppercase tracking-wider transition-all">Detail</button></td>
                                                        </tr>
                                                    ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            );
                        case 'recent_savings':
                            return (
                                <div key={widget.id} className="card col-span-1 flex flex-col">
                                    <div className="card-header p-0 mb-4 font-bold flex items-center gap-2">
                                        <PiggyBank size={18} className="text-accent" /> {widget.title}
                                    </div>
                                    <div className="space-y-4 flex-1">
                                        <div className="p-4 bg-accent/5 rounded-xl border border-accent/10">
                                            <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Total Tabungan Aktif</p>
                                            <p className="text-2xl font-black text-accent">{formatCurrency(totalSavings)}</p>
                                        </div>
                                        <div className="space-y-3">
                                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Aktivitas Terakhir</p>
                                            {savings.slice(-3).reverse().map(s => (
                                                <div key={s.id} className="flex justify-between items-center py-2 border-b border-border border-dashed last:border-0">
                                                    <div className="min-w-0">
                                                        <p className="text-xs font-bold truncate">{students.find(st => st.id === s.studentId)?.name}</p>
                                                        <p className="text-[9px] text-slate-400 font-mono italic">{s.date}</p>
                                                    </div>
                                                    <p className={`text-xs font-bold ${s.type === 'deposit' ? 'text-success' : 'text-red-500'}`}>
                                                        {s.type === 'deposit' ? '+' : '-'}{formatCurrency(s.amount)}
                                                    </p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            );
                        case 'attendance_summary':
                            const today = new Date().toISOString().split('T')[0];
                            const todayRecords = attendance.filter(a => a.date === today);
                            const hadir = todayRecords.filter(r => r.status === 'hadir').length;
                            return (
                                <div key={widget.id} className="card col-span-1">
                                    <div className="card-header p-0 mb-4 font-bold flex items-center gap-2">
                                        <CalendarCheck size={18} className="text-blue-500" /> {widget.title}
                                    </div>
                                    <div className="space-y-6">
                                        <div className="flex justify-between items-end">
                                            <div>
                                                <p className="text-2xl font-black">{hadir}/{students.length || 0}</p>
                                                <p className="text-[10px] font-bold text-slate-400 uppercase">Siswa Hadir Hari Ini</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-sm font-bold text-blue-500">{students.length > 0 ? ((hadir / students.length) * 100).toFixed(1) : 0}%</p>
                                                <p className="text-[9px] text-slate-400">Rasio Kehadiran</p>
                                            </div>
                                        </div>
                                        <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                                            <div className="bg-blue-500 h-full transition-all" style={{ width: `${students.length > 0 ? (hadir / students.length) * 100 : 0}%` }} />
                                        </div>
                                        <div className="grid grid-cols-2 gap-3 pb-2">
                                            <div className="p-3 bg-slate-50 rounded-lg text-center">
                                                <p className="text-xs font-bold text-red-500">{todayRecords.filter(r => r.status === 'alpa').length}</p>
                                                <p className="text-[9px] font-medium text-slate-500">Alpa</p>
                                            </div>
                                            <div className="p-3 bg-slate-50 rounded-lg text-center">
                                                <p className="text-xs font-bold text-yellow-600">{todayRecords.filter(r => r.status === 'sakit').length + todayRecords.filter(r => r.status === 'izin').length}</p>
                                                <p className="text-[9px] font-medium text-slate-500">Sakit/Izin</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        case 'cash_flow':
                            return (
                                <div key={widget.id} className="card col-span-1 md:col-span-2 flex flex-col">
                                    <div className="card-header p-0 mb-4 font-bold flex items-center gap-2">
                                        <TrendingUp size={18} className="text-emerald-500" /> {widget.title}
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                        <div className="space-y-4">
                                            <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-100">
                                                <p className="text-[10px] font-bold text-emerald-600 uppercase mb-1">Total Infaq Jumat</p>
                                                <p className="text-xl font-black text-emerald-700">{formatCurrency(classCash.filter(t => t.type === 'infaq').reduce((acc, t) => acc + t.amount, 0))}</p>
                                            </div>
                                            <button
                                                onClick={() => onNavigate('gemari')}
                                                className="w-full btn-small"
                                            >
                                                Buka GEMARI
                                            </button>
                                        </div>
                                        <div className="space-y-2">
                                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Entri Kas Terbaru</p>
                                            {classCash.slice(-4).reverse().map(tx => (
                                                <div key={tx.id} className="flex justify-between items-center text-xs p-2 bg-slate-50 rounded-lg">
                                                    <span className="font-semibold capitalize">{tx.type}</span>
                                                    <span className="font-bold text-emerald-600">{formatCurrency(tx.amount)}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            );
                        default:
                            return null;
                    }
                })}
            </div>

            {/* Widget Settings Modal */}
            {showWidgetSettings && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 overflow-y-auto">
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="bg-white rounded-3xl p-8 max-w-lg w-full shadow-2xl border border-border"
                    >
                        <div className="flex justify-between items-center mb-6">
                            <div>
                                <h3 className="text-xl font-bold text-slate-900">Kustomisasi Dashboard</h3>
                                <p className="text-sm text-slate-500 mt-1 font-medium italic">Pilih data dan atur urutan tampilan</p>
                            </div>
                            <button
                                onClick={() => setShowWidgetSettings(false)}
                                className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 transition-colors"
                                aria-label="Tutup"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <div className="space-y-3 mb-8">
                            {[...widgets].sort((a, b) => a.order - b.order).map((widget, idx, arr) => (
                                <div key={widget.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-border hover:border-accent/30 transition-all group">
                                    <div className="flex items-center gap-4">
                                        <div className="flex flex-col gap-1">
                                            <button
                                                disabled={idx === 0}
                                                onClick={() => reorderWidget(widget.id, 'up')}
                                                className="p-1 hover:bg-white rounded-md text-slate-600 disabled:opacity-20 hover:text-accent transition-all"
                                            >
                                                <ArrowUp size={14} />
                                            </button>
                                            <button
                                                disabled={idx === arr.length - 1}
                                                onClick={() => reorderWidget(widget.id, 'down')}
                                                className="p-1 hover:bg-white rounded-md text-slate-600 disabled:opacity-20 hover:text-accent transition-all"
                                            >
                                                <ArrowDown size={14} />
                                            </button>
                                        </div>
                                        <span className="font-extrabold text-sm text-slate-700">{widget.title}</span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <span className={`text-[9px] font-black uppercase px-2 py-1 rounded-md ${widget.isVisible ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'}`}>
                                            {widget.isVisible ? 'Aktif' : 'Sembunyi'}
                                        </span>
                                        <button
                                            onClick={() => toggleWidget(widget.id)}
                                            className={`w-12 h-6 rounded-full transition-all relative border ${widget.isVisible ? 'bg-accent border-accent' : 'bg-slate-200 border-slate-300'}`}
                                        >
                                            <div className={`absolute top-0.5 w-4.5 h-4.5 bg-white rounded-full shadow-sm transition-all ${widget.isVisible ? 'left-6.5' : 'left-0.5'}`} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <button
                            onClick={() => setShowWidgetSettings(false)}
                            className="w-full btn-primary py-4 rounded-2xl text-xs"
                        >
                            Simpan & Terapkan
                        </button>
                    </motion.div>
                </div>
            )}
        </div>
    );
}

function StatCard({ title, value, change, icon, iconColor = "text-accent" }: { title: string, value: string, change: string, icon: React.ReactNode, iconColor?: string }) {
    return (
        <div className="card group hover:-translate-y-1 transition-all duration-300">
            <div className="flex justify-between items-center mb-4">
                <div className={`p-2 bg-slate-50 rounded-xl border border-border transition-colors group-hover:bg-accent/5 group-hover:border-accent/20 ${iconColor}`}>{icon}</div>
                <div className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg flex items-center gap-1 leading-none shadow-sm shadow-emerald-100/50">
                    <ArrowUpRight size={12} />
                    <span>+2.4%</span>
                </div>
            </div>
            <div className="stat-label">{title}</div>
            <div className="stat-value text-slate-900">{value}</div>
            <div className="text-[11px] mt-2 text-slate-400 font-medium tracking-tight italic flex items-center gap-1.5">
                <Activity size={10} className="text-accent opacity-50" />
                {change}
            </div>
        </div>
    );
}

function StudentsView({ students, classes, onRefresh, onViewProfile, onSort, onSetSortConfig, currentSort, sortedData, SortableTH }: { students: Student[], classes: Class[], onRefresh: () => void, onViewProfile: (id: string) => void, onSort: (k: string) => void, onSetSortConfig: (cfg: { key: string, direction: 'asc' | 'desc' } | null) => void, currentSort: any, sortedData: any, SortableTH: any }) {
    const [filter, setFilter] = useState('');
    const [showImport, setShowImport] = useState(false);
    const [fileName, setFileName] = useState('');
    const [showAdd, setShowAdd] = useState(false);
    const [editingStudent, setEditingStudent] = useState<Student | null>(null);
    const [showBulkEdit, setShowBulkEdit] = useState(false);
    const [bulkField, setBulkField] = useState<keyof Student>('name');
    const [bulkEditData, setBulkEditData] = useState<{ [key: string]: any }>({});
    const [importText, setImportText] = useState('');
    const [newStudent, setNewStudent] = useState<Partial<Student>>({
        name: '', email: '', classId: '1', attendance: 100, gradeValue: 0, attendanceNumber: (students.length + 1)
    });

    const getStudentName = (s: any) => s?.name || s?.displayName || s?.fullName || s?.nama || '';

    const filteredStudents = sortedData(students).filter((s: any) =>
        getStudentName(s).toLowerCase().includes(filter.toLowerCase()) ||
        (s?.email || '').toLowerCase().includes(filter.toLowerCase()) ||
        (s?.nisn || '').includes(filter) ||
        (s?.nis || '').includes(filter)
    );

    const handleSaveBulkEdit = async () => {
        try {
            const updatePromises = Object.entries(bulkEditData).map(([id, value]) =>
                updateDoc(doc(db, 'students', id), {
                    [bulkField]: value
                })
            );
            await Promise.all(updatePromises);
            setShowBulkEdit(false);
            setBulkEditData({});
            onRefresh();
        } catch (error) {
            console.error("Error bulk updating students:", error);
            alert("Gagal melakukan update masal.");
        }
    };

    const BULK_FIELDS: { value: keyof Student, label: string }[] = [
        { value: 'name', label: 'Nama Lengkap' },
        { value: 'address', label: 'Alamat' },
        { value: 'nisn', label: 'NISN' },
        { value: 'nis', label: 'NIS' },
        { value: 'nik', label: 'NIK' },
        { value: 'religion', label: 'Agama' },
        { value: 'phone', label: 'No. Telp' },
        { value: 'email', label: 'Email' }
    ];

    const handleExportCSV = () => {
        const headers = ["id", "name", "email", "classId", "attendance", "gradeValue", "nisn", "nis", "gender", "phone", "address", "dusun", "desa", "kecamatan", "birthPlace", "birthDate", "nik", "nkk", "religion", "weightSem1", "weightSem2", "heightSem1", "heightSem2", "fatherName", "fatherBirthYear", "fatherNik", "motherName", "motherBirthYear", "motherNik", "guardianName", "guardianBirthYear", "guardianNik", "distanceToSchool", "attendanceNumber"];
        const rows = students.map(s => {
            const escapeCsv = (str: any) => {
                if (str === undefined || str === null) return '';
                const stringVal = String(str);
                return stringVal.includes(',') || stringVal.includes('"') || stringVal.includes('\n')
                    ? `"${stringVal.replace(/"/g, '""')}"`
                    : stringVal;
            };
            return [
                s.id,
                s.name,
                s.email,
                s.classId,
                s.attendance,
                s.gradeValue,
                s.nisn,
                s.nis,
                s.gender,
                s.phone,
                s.address,
                s.dusun,
                s.desa,
                s.kecamatan,
                s.birthPlace,
                s.birthDate,
                s.nik,
                s.nkk,
                s.religion,
                s.weightSem1,
                s.weightSem2,
                s.heightSem1,
                s.heightSem2,
                s.fatherName,
                s.fatherBirthYear,
                s.fatherNik,
                s.motherName,
                s.motherBirthYear,
                s.motherNik,
                s.guardianName,
                s.guardianBirthYear,
                s.guardianNik,
                s.distanceToSchool,
                s.attendanceNumber
            ].map(escapeCsv);
        });

        let csvContent = "data:text/csv;charset=utf-8,"
            + headers.join(",") + "\n"
            + rows.map(e => e.join(",")).join("\n");

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `students_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
    };

    const handleSaveStudent = async () => {
        if (!newStudent.name) return alert('Nama wajib diisi');
        try {
            if (editingStudent) {
                await updateDoc(doc(db, 'students', editingStudent.id), newStudent);
            } else {
                await addDoc(collection(db, 'students'), newStudent);
            }
            setShowAdd(false);
            setEditingStudent(null);
            setNewStudent({ name: '', email: '', classId: '1', attendance: 100, gradeValue: 0, attendanceNumber: (students.length + 1) });
            onRefresh();
        } catch (error) {
            console.error("Error saving student:", error);
            alert("Gagal menyimpan data siswa.");
        }
    };

    const handleDeleteStudent = async (id: string) => {
        if (!confirm('Hapus data siswa ini secara permanen?')) return;
        try {
            await deleteDoc(doc(db, 'students', id));
            onRefresh();
        } catch (error) {
            console.error("Error deleting student:", error);
            alert("Gagal menghapus data siswa.");
        }
    };

    const parseCSVRow = (text: string) => {
        return parseDelimitedLine(text, detectDelimitedSeparator(text));
    };

    const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const text = event.target?.result as string;
            setImportText(text);
            setFileName(file.name);
        };
        reader.readAsText(file);
    };

    const handleImport = async () => {
        const lines = importText.split('\n').filter(l => l.trim());
        let dataLines = lines;

        if (lines.length > 0 && lines[0].toLowerCase().includes('id') && lines[0].toLowerCase().includes('name')) {
            dataLines = lines.slice(1);
        }

        const newStudents = dataLines.map((line, index) => {
            const row = parseCSVRow(line);
            const [
                id, name, email, classId, attendance, gradeValue, nisn, nis, gender, phone, address,
                dusun, desa, kecamatan, birthPlace, birthDate, nik, nkk, religion,
                weightSem1, weightSem2, heightSem1, heightSem2,
                fatherName, fatherBirthYear, fatherNik, motherName, motherBirthYear, motherNik,
                guardianName, guardianBirthYear, guardianNik, distanceToSchool, attendanceNumber
            ] = row;

            const classObj = classes.find(c => c.id === classId?.trim());
            const existing = students.find(s => s.id === id?.trim() || (nisn && s.nisn === nisn?.trim()) || (nis && s.nis === nis?.trim()));

            return {
                id: id?.trim() || existing?.id || '',
                name: name?.trim() || '',
                email: email?.trim() || '',
                classId: classId?.trim() || classObj?.id || '1',
                attendance: parseInt(attendance?.trim() || '0') || 100,
                gradeValue: parseFloat(gradeValue?.trim() || '0') || 0,
                nisn: nisn?.trim() || '',
                nis: nis?.trim() || '',
                gender: (gender?.trim() ? (gender.trim().charAt(0).toUpperCase() === 'P' ? 'P' : 'L') : undefined) as 'L' | 'P' | undefined,
                phone: phone?.trim() || '',
                address: address?.trim() || '',
                dusun: dusun?.trim() || '',
                desa: desa?.trim() || '',
                kecamatan: kecamatan?.trim() || '',
                birthPlace: birthPlace?.trim() || '',
                birthDate: birthDate?.trim() || '',
                nik: nik?.trim() || '',
                nkk: nkk?.trim() || '',
                religion: religion?.trim() || '',
                weightSem1: parseFloat(weightSem1?.trim() || '0') || 0,
                weightSem2: parseFloat(weightSem2?.trim() || '0') || 0,
                heightSem1: parseFloat(heightSem1?.trim() || '0') || 0,
                heightSem2: parseFloat(heightSem2?.trim() || '0') || 0,
                fatherName: fatherName?.trim() || '',
                fatherBirthYear: fatherBirthYear?.trim() || '',
                fatherNik: fatherNik?.trim() || '',
                motherName: motherName?.trim() || '',
                motherBirthYear: motherBirthYear?.trim() || '',
                motherNik: motherNik?.trim() || '',
                guardianName: guardianName?.trim() || '',
                guardianBirthYear: guardianBirthYear?.trim() || '',
                guardianNik: guardianNik?.trim() || '',
                distanceToSchool: parseFloat(distanceToSchool?.trim() || '0') || 0,
                attendanceNumber: parseInt(attendanceNumber?.trim() || '0') || (students.length + index + 1)
            };
        });

        try {
            for (const s of newStudents) {
                const { id, ...studentData } = s;
                try {
                    if (id && id.length > 0) {
                        await setDoc(doc(db, 'students', id), studentData);
                    } else {
                        await addDoc(collection(db, 'students'), { ...studentData, attendance: 100, gradeValue: 0 });
                    }
                } catch (err) {
                    console.error("Error saving student:", s.name, err);
                }
            }
            setImportText('');
            setShowImport(false);
            setFileName('');
            onRefresh();
            alert("Import berhasil!");
        } catch (error) {
            console.error("Error importing students:", error);
            alert("Gagal mengimpor data.");
        }
    };

    const handleDownloadTemplate = () => {
        const headers = ["id", "name", "email", "classId", "attendance", "gradeValue", "nisn", "nis", "gender", "phone", "address", "dusun", "desa", "kecamatan", "birthPlace", "birthDate", "nik", "nkk", "religion", "weightSem1", "weightSem2", "heightSem1", "heightSem2", "fatherName", "fatherBirthYear", "fatherNik", "motherName", "motherBirthYear", "motherNik", "guardianName", "guardianBirthYear", "guardianNik", "distanceToSchool", "attendanceNumber"];
        const sample = ["", "John Doe", "john@example.com", "1", "100", "85", "1234567890", "1234", "L", "08123456789", "Jl. Mawar No 1", "", "", "", "Jakarta", "2005-01-01", "327123456789012345", "327123456789012345", "Islam", "60", "0", "170", "0", "Budi", "1975", "", "Siti", "1975", "", "", "", "", "0", "1"];
        const csvContent = "data:text/csv;charset=utf-8," + headers.join(",") + "\n" + sample.join(",");
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "template_siswa.csv");
        document.body.appendChild(link);
        link.click();
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" size={16} />
                    <input
                        type="text"
                        placeholder="Cari siswa..."
                        className="w-full bg-white border border-border rounded-lg pl-10 pr-4 py-2 text-sm outline-none focus:border-accent"
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                    />
                </div>
                <div className="flex gap-2">
                    <select
                        className="bg-white border border-border rounded-lg px-3 py-2 text-sm font-bold outline-none focus:border-accent"
                        value={currentSort?.key === 'name' ? 'abjad' : 'absen'}
                        onChange={(e) => {
                            const v = e.target.value;
                            if (v === 'abjad') onSetSortConfig({ key: 'name', direction: 'asc' });
                            else onSetSortConfig({ key: 'attendanceNumber', direction: 'asc' });
                        }}
                        title="Urutkan daftar siswa"
                    >
                        <option value="absen">Urut No Absen</option>
                        <option value="abjad">Urut Abjad</option>
                    </select>
                    <button onClick={() => setShowBulkEdit(true)} className="btn-small flex items-center gap-2">
                        <Edit size={14} /> Edit Masal
                    </button>
                    <button onClick={handleExportCSV} className="btn-small flex items-center gap-2">
                        <Download size={14} /> Export CSV
                    </button>
                    <button onClick={() => setShowAdd(true)} className="btn-small flex items-center gap-2">
                        <UserPlus size={14} /> Input Data
                    </button>
                    <button onClick={() => { setShowImport(true); setImportText(''); setFileName(''); }} className="btn-primary flex items-center gap-2">
                        <Upload size={16} /> Import Siswa
                    </button>
                </div>
            </div>

            <div className="card !p-0">
                <div className="p-5 border-b border-border flex justify-between items-center bg-slate-50/50">
                    <div className="stat-label">Database Siswa ({filteredStudents.length})</div>
                    <p className="text-[10px] font-bold text-slate-400 italic">Geser tabel untuk detail lebih lanjut »</p>
                </div>
                <div className="table-container shadow-sm">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <SortableTH label="NO ABSEN" sortKey="attendanceNumber" currentSort={currentSort} onSort={onSort} />
                                <SortableTH label="NAMA" sortKey="name" currentSort={currentSort} onSort={onSort} />
                                <SortableTH label="NISN" sortKey="nisn" currentSort={currentSort} onSort={onSort} />
                                <SortableTH label="NIS" sortKey="nis" currentSort={currentSort} onSort={onSort} />
                                <SortableTH label="L/P" sortKey="gender" currentSort={currentSort} onSort={onSort} />
                                <SortableTH label="TTL" sortKey="birthPlace" currentSort={currentSort} onSort={onSort} />
                                <SortableTH label="NIK" sortKey="nik" currentSort={currentSort} onSort={onSort} />
                                <SortableTH label="NKK" sortKey="nkk" currentSort={currentSort} onSort={onSort} />
                                <SortableTH label="AGAMA" sortKey="religion" currentSort={currentSort} onSort={onSort} />
                                <SortableTH label="ALAMAT" sortKey="address" currentSort={currentSort} onSort={onSort} />
                                <SortableTH label="ORTU" sortKey="fatherName" currentSort={currentSort} onSort={onSort} />
                                <SortableTH label="NO TELP" sortKey="phone" currentSort={currentSort} onSort={onSort} />
                                <SortableTH label="EMAIL" sortKey="email" currentSort={currentSort} onSort={onSort} />
                                <SortableTH label="ROMBEL" sortKey="classId" currentSort={currentSort} onSort={onSort} />
                                <SortableTH label="TB (cm)" sortKey="heightSem1" currentSort={currentSort} onSort={onSort} />
                                <SortableTH label="BB (kg)" sortKey="weightSem1" currentSort={currentSort} onSort={onSort} />
                                <SortableTH label="CATATAN" sortKey="notes" currentSort={currentSort} onSort={onSort} />
                                <th className="no-print sticky right-0 bg-white shadow-[-5px_0_10px_rgba(0,0,0,0.05)]">AKSI</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredStudents.map((s: Student) => (
                                <tr
                                    key={s.id}
                                    className="hover:bg-slate-50 cursor-pointer group transition-all"
                                    onClick={() => onViewProfile(s.id)}
                                >
                                    <td className="font-mono text-xs text-slate-400">{s.attendanceNumber || ''}</td>
                                    <td className="font-bold">
                                        <div className="flex items-center gap-2 whitespace-nowrap">
                                            {getStudentName(s)}
                                            <ArrowUpRight size={14} className="opacity-0 group-hover:opacity-40 text-accent transition-all" />
                                        </div>
                                    </td>
                                    <td className="font-mono text-xs text-slate-400">{s.nisn || '-'}</td>
                                    <td className="font-mono text-xs text-slate-400">{s.nis || '-'}</td>
                                    <td className="text-xs text-center font-bold px-2"><span className={`px-2 py-0.5 rounded ${s.gender === 'P' ? 'bg-pink-50 text-pink-500' : 'bg-blue-50 text-blue-500'}`}>{s.gender || '-'}</span></td>
                                    <td className="text-[10px] text-slate-500 max-w-[120px] truncate" title={[s.birthPlace, s.birthDate].filter(Boolean).join(', ')}>
                                        {[s.birthPlace, s.birthDate].filter(Boolean).join(', ') || '-'}
                                    </td>
                                    <td className="font-mono text-[10px] text-slate-400">{s.nik || '-'}</td>
                                    <td className="font-mono text-[10px] text-slate-400">{s.nkk || '-'}</td>
                                    <td className="text-[10px] font-bold text-slate-500 uppercase">{s.religion || '-'}</td>
                                    <td className="text-[10px] text-slate-500 max-w-[150px] truncate" title={s.address}>{s.address || '-'}</td>
                                    <td className="text-[10px] text-slate-500 max-w-[120px] truncate" title={[s.fatherName ? `A: ${s.fatherName}` : '', s.motherName ? `I: ${s.motherName}` : ''].filter(Boolean).join(' | ')}>
                                        {[s.fatherName ? `A: ${s.fatherName}` : '', s.motherName ? `I: ${s.motherName}` : ''].filter(Boolean).join(' | ') || '-'}
                                    </td>
                                    <td className="font-mono text-[10px] text-slate-500">{s.phone || '-'}</td>
                                    <td className="text-[10px] text-slate-500">{s.email || '-'}</td>
                                    <td className="text-[10px] font-bold text-accent uppercase whitespace-nowrap">{classes.find(c => c.id === s.classId)?.name || s.classId}</td>
                                    <td className="font-mono text-xs text-slate-400 text-center">{s.heightSem1 || '-'}</td>
                                    <td className="font-mono text-xs text-slate-400 text-center">{s.weightSem1 || '-'}</td>
                                    <td className="text-[10px] text-slate-400 italic max-w-[120px] truncate" title={s.notes}>{s.notes || '-'}</td>
                                    <td className="no-print sticky right-0 bg-white shadow-[-5px_0_10px_rgba(0,0,0,0.05)] px-2">
                                        <div className="flex items-center gap-2 justify-center" onClick={(e) => e.stopPropagation()}>
                                            <button
                                                onClick={() => onViewProfile(s.id)}
                                                className="p-1.5 hover:bg-slate-100 rounded text-slate-700 transition-all"
                                                title="Lihat Profil"
                                            >
                                                <Search size={14} />
                                            </button>
                                            <button
                                                onClick={() => { setEditingStudent(s); setShowAdd(true); }}
                                                className="p-1.5 hover:bg-slate-100 rounded text-text-secondary"
                                                title="Ubah Data Siswa"
                                                aria-label="Ubah Data Siswa"
                                            >
                                                <Edit size={14} />
                                            </button>
                                            <button
                                                onClick={() => handleDeleteStudent(s.id)}
                                                className="p-1.5 hover:bg-red-50 rounded text-red-500"
                                                title="Hapus Data Siswa"
                                                aria-label="Hapus Data Siswa"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {filteredStudents.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="text-center py-20 opacity-30 italic">Siswa tidak ditemukan atau data kosong</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {showBulkEdit && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl p-8 max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-border">
                        <div className="flex justify-between items-center mb-6">
                            <div>
                                <h3 className="text-xl font-bold">Edit Siswa Secara Masal</h3>
                                <p className="text-xs text-text-secondary">Pilih field dan input data langsung pada tabel</p>
                            </div>
                            <button onClick={() => setShowBulkEdit(false)} aria-label="Tutup modal edit batch"><X size={20} /></button>
                        </div>

                        <div className="bg-slate-50 p-4 rounded-xl mb-6 flex items-center gap-4">
                            <label className="text-xs font-bold uppercase tracking-widest text-text-secondary whitespace-nowrap" htmlFor="bulk-edit-field-select">Data yang akan Diedit:</label>
                            <select
                                id="bulk-edit-field-select"
                                title="Pilih field yang akan diedit"
                                className="bg-white border border-border rounded-lg px-4 py-2 text-sm font-bold outline-none flex-1"
                                value={bulkField}
                                onChange={e => {
                                    setBulkField(e.target.value as keyof Student);
                                    setBulkEditData({});
                                }}
                            >
                                {BULK_FIELDS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                            </select>
                        </div>

                        <table className="data-table mb-8">
                            <thead>
                                <tr>
                                    <th>NAMA SISWA</th>
                                    <th>DATA LAMA</th>
                                    <th className="w-1/2">DATA BARU ({BULK_FIELDS.find(f => f.value === bulkField)?.label})</th>
                                </tr>
                            </thead>
                            <tbody>
                                {students.map(s => (
                                    <tr key={s.id}>
                                        <td className="font-bold">{getStudentName(s)}</td>
                                        <td className="text-[10px] text-text-secondary italic">{String(s[bulkField] || '-')}</td>
                                        <td>
                                            <input
                                                type="text"
                                                className="w-full bg-slate-50 border border-border rounded px-3 py-1.5 outline-none focus:border-accent text-sm"
                                                placeholder={`Input ${BULK_FIELDS.find(f => f.value === bulkField)?.label} baru...`}
                                                value={bulkEditData[s.id] || ''}
                                                onChange={e => setBulkEditData({ ...bulkEditData, [s.id]: e.target.value })}
                                            />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>

                        <div className="flex justify-end gap-3 sticky bottom-0 bg-white py-4 border-t border-border">
                            <button onClick={() => setShowBulkEdit(false)} className="px-6 py-2 border border-border rounded-xl font-bold text-sm">Batal</button>
                            <button onClick={handleSaveBulkEdit} className="btn-primary px-8 text-sm">Simpan {students.length} Perubahan</button>
                        </div>
                    </div>
                </div>
            )}

            {showImport && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl p-8 max-w-2xl w-full shadow-2xl border border-border">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold">Import Siswa Masal</h3>
                            <button onClick={() => { setShowImport(false); setFileName(''); }} aria-label="Tutup modal import"><X size={20} /></button>
                        </div>
                        <div className="mb-4 p-4 border-2 border-dashed border-slate-300 rounded-xl hover:border-accent transition-colors">
                            <input
                                type="file"
                                accept=".csv"
                                onChange={handleFileImport}
                                className="hidden"
                                id="csv-file-input"
                            />
                            <label htmlFor="csv-file-input" className="flex flex-col items-center cursor-pointer">
                                <FileSpreadsheet size={32} className="text-slate-400 mb-2" />
                                <span className="text-sm font-bold text-slate-600">
                                    {fileName ? fileName : 'Klik untuk upload file CSV'}
                                </span>
                                <span className="text-xs text-slate-400 mt-1">atau paste data di bawah</span>
                            </label>
                        </div>
                        <p className="text-sm text-text-secondary mb-4">ATAU: Paste data siswa (No Absen, Nama, NISN, NIS, Jenis Kelamin, Tempat dan Tanggal Lahir, NIK, NKK, Agama, Alamat, Nama Orang tua Ayah dan Ibu, No Telp, Email, Rombel, Tinggi Badan, Berat Badan, Catatan) pisahkan dengan koma per baris.</p>
                        <textarea
                            className="w-full h-48 bg-slate-50 border border-border rounded-lg p-4 font-mono text-sm outline-none focus:border-accent mb-6"
                            placeholder="No Absen,Nama,NISN,NIS,Jenis Kelamin,Tempat dan Tanggal Lahir,NIK,NKK,Agama,Alamat,Nama Orang tua Ayah dan Ibu,No Telp,Email,Rombel,Tinggi Badan,Berat Badan,Catatan&#10;1,Budi Santoso,1234567890,1234,L,Jakarta\, 01-01-2005,327123,327123,Islam,Jl. Mawar No 1,Ayah: Budi | Ibu: Siti,08123456789,budi@email.com,X IPA 1,170,60,Siswa Aktif"
                            value={importText}
                            onChange={e => setImportText(e.target.value)}
                        />
                        <div className="flex justify-end gap-3">
                            <button onClick={() => { setShowImport(false); setFileName(''); }} className="px-6 py-2 border border-border rounded-xl font-bold">Batal</button>
                            <button onClick={handleImport} className="btn-primary px-8">Proses Import</button>
                        </div>
                    </div>
                </div>
            )}

            {showAdd && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl p-8 max-w-2xl w-full shadow-2xl border border-border max-h-[90vh] overflow-y-auto">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold">{editingStudent ? 'Edit Data Siswa' : 'Tambah Siswa Baru'}</h3>
                            <button onClick={() => { setShowAdd(false); setEditingStudent(null); }} aria-label="Tutup form siswa"><X size={20} /></button>
                        </div>

                        <div className="grid grid-cols-2 gap-4 mb-6">
                            <div className="col-span-2 space-y-1">
                                <label className="text-xs font-black uppercase tracking-widest text-text-secondary" htmlFor="student-name-input">Nama Lengkap</label>
                                <input
                                    id="student-name-input"
                                    type="text"
                                    className="w-full bg-slate-50 border border-border rounded-lg p-3 outline-none focus:border-accent font-bold"
                                    placeholder="Contoh: Budi Santoso"
                                    value={newStudent.name}
                                    onChange={e => setNewStudent({ ...newStudent, name: e.target.value })}
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-black uppercase tracking-widest text-text-secondary" htmlFor="student-email-input">Email</label>
                                <input
                                    id="student-email-input"
                                    type="email"
                                    className="w-full bg-slate-50 border border-border rounded-lg p-3 outline-none focus:border-accent"
                                    placeholder="budi@email.com"
                                    value={newStudent.email}
                                    onChange={e => setNewStudent({ ...newStudent, email: e.target.value })}
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-black uppercase tracking-widest text-text-secondary" htmlFor="student-class-select">Pilih Kelas</label>
                                <select
                                    id="student-class-select"
                                    className="w-full bg-slate-50 border border-border rounded-lg p-3 outline-none focus:border-accent font-bold"
                                    value={newStudent.classId}
                                    onChange={e => setNewStudent({ ...newStudent, classId: e.target.value })}
                                >
                                    <option value="">Pilih Kelas...</option>
                                    {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-black uppercase tracking-widest text-text-secondary" htmlFor="student-nisn-input">NISN</label>
                                <input
                                    id="student-nisn-input"
                                    type="text"
                                    className="w-full bg-slate-50 border border-border rounded-lg p-3 outline-none focus:border-accent font-mono"
                                    placeholder="Nomor Induk Siswa Nasional"
                                    value={newStudent.nisn}
                                    onChange={e => setNewStudent({ ...newStudent, nisn: e.target.value })}
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-black uppercase tracking-widest text-text-secondary" htmlFor="student-nis-input">NIS</label>
                                <input
                                    id="student-nis-input"
                                    type="text"
                                    className="w-full bg-slate-50 border border-border rounded-lg p-3 outline-none focus:border-accent font-mono"
                                    placeholder="Nomor Induk Siswa"
                                    value={newStudent.nis}
                                    onChange={e => setNewStudent({ ...newStudent, nis: e.target.value })}
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-black uppercase tracking-widest text-text-secondary" htmlFor="student-phone-input">No. Telp</label>
                                <input
                                    id="student-phone-input"
                                    type="text"
                                    className="w-full bg-slate-50 border border-border rounded-lg p-3 outline-none focus:border-accent"
                                    placeholder="0812..."
                                    value={newStudent.phone}
                                    onChange={e => setNewStudent({ ...newStudent, phone: e.target.value })}
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500" htmlFor="edit-student-gender">Jenis Kelamin</label>
                                <select
                                    id="edit-student-gender"
                                    title="Pilih Jenis Kelamin"
                                    className="w-full bg-slate-50 border border-border rounded-lg p-3 outline-none focus:border-accent font-bold"
                                    value={newStudent.gender}
                                    onChange={e => setNewStudent({ ...newStudent, gender: e.target.value as 'L' | 'P' })}
                                >
                                    <option value="">Pilih...</option>
                                    <option value="L">Laki-laki</option>
                                    <option value="P">Perempuan</option>
                                </select>
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-black uppercase tracking-widest text-text-secondary">Tempat Lahir</label>
                                <input
                                    type="text"
                                    className="w-full bg-slate-50 border border-border rounded-lg p-3 outline-none focus:border-accent"
                                    value={newStudent.birthPlace}
                                    onChange={e => setNewStudent({ ...newStudent, birthPlace: e.target.value })}
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-black uppercase tracking-widest text-text-secondary">Tanggal Lahir</label>
                                <input
                                    type="date"
                                    className="w-full bg-slate-50 border border-border rounded-lg p-3 outline-none focus:border-accent"
                                    value={newStudent.birthDate}
                                    onChange={e => setNewStudent({ ...newStudent, birthDate: e.target.value })}
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-black uppercase tracking-widest text-text-secondary">No. Absen</label>
                                <input
                                    type="number"
                                    className="w-full bg-slate-50 border border-border rounded-lg p-3 outline-none focus:border-accent font-bold"
                                    value={newStudent.attendanceNumber}
                                    onChange={e => setNewStudent({ ...newStudent, attendanceNumber: parseInt(e.target.value) })}
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-black uppercase tracking-widest text-text-secondary">Alamat</label>
                                <input
                                    type="text"
                                    className="w-full bg-slate-50 border border-border rounded-lg p-3 outline-none focus:border-accent"
                                    placeholder="Alamat lengkap..."
                                    value={newStudent.address}
                                    onChange={e => setNewStudent({ ...newStudent, address: e.target.value })}
                                />
                            </div>
                        </div>

                        <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                            <button
                                onClick={() => { setShowAdd(false); setEditingStudent(null); }}
                                className="px-6 py-2 border border-border rounded-xl font-bold text-sm hover:bg-slate-50 transition-all"
                            >
                                Batal
                            </button>
                            <button onClick={handleSaveStudent} className="btn-primary px-8 text-sm">
                                {editingStudent ? 'Simpan Perubahan' : 'Tambah Siswa'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function ClassesView({ classes, onRefresh }: { classes: Class[], onRefresh: () => void }) {
    const [showAdd, setShowAdd] = useState(false);
    const [editingClass, setEditingClass] = useState<Class | null>(null);
    const [newClass, setNewClass] = useState({
        name: '',
        subject: '',
        teacher: '',
        homeroomTeacher: '',
        homeroomTeacherNip: '',
        academicYear: '2025/2026',
        studentCount: 0,
        schedule: ''
    });

    const handleSave = async () => {
        try {
            if (editingClass) {
                const { id, ...data } = editingClass;
                await updateDoc(doc(db, 'classes', id), data);
            } else {
                await addDoc(collection(db, 'classes'), newClass);
            }
            setShowAdd(false);
            setEditingClass(null);
            setNewClass({
                name: '',
                subject: '',
                teacher: '',
                homeroomTeacher: '',
                homeroomTeacherNip: '',
                academicYear: '2025/2026',
                studentCount: 0,
                schedule: ''
            });
            onRefresh();
        } catch (error) {
            console.error("Error saving class:", error);
            alert("Gagal menyimpan data kelas.");
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Hapus kelas ini?')) return;
        try {
            await deleteDoc(doc(db, 'classes', id));
            onRefresh();
        } catch (error) {
            console.error("Error deleting class:", error);
            alert("Gagal menghapus kelas.");
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold">Manajemen Daftar Kelas</h2>
                <button onClick={() => setShowAdd(true)} className="btn-primary flex items-center gap-2">
                    <Plus size={16} /> Tambah Kelas
                </button>
            </div>

            <div className="grid grid-cols-2 gap-6">
                {classes.map(c => (
                    <div key={c.id} className="card group hover:border-accent transition-all">
                        <div className="flex items-start justify-between">
                            <div>
                                <h3 className="font-bold text-lg">{c.name}</h3>
                                <div className="flex flex-col gap-1 mt-1">
                                    <p className="text-xs font-bold text-accent">TP: {c.academicYear || '-'}</p>
                                    <p className="text-sm text-text-secondary">{c.subject}</p>
                                    <div className="mt-1 p-2 bg-slate-50 rounded-lg border border-slate-100">
                                        <p className="text-[10px] font-bold uppercase text-text-secondary">Wali Kelas</p>
                                        <p className="text-xs font-bold">{c.homeroomTeacher || c.teacher}</p>
                                        <p className="text-[9px] text-text-secondary">NIP: {c.homeroomTeacherNip || '-'}</p>
                                    </div>
                                </div>
                                <div className="mt-3 flex items-center gap-4 text-xs font-semibold text-text-secondary">
                                    <span className="flex items-center gap-1"><Users size={12} /> {c.studentCount} Siswa</span>
                                    <span className="flex items-center gap-1"><Clock size={12} /> {c.schedule}</span>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => { setEditingClass(c); setShowAdd(true); }}
                                    className="p-2 text-text-secondary hover:text-accent opacity-0 group-hover:opacity-100 transition-all"
                                    title="Ubah Data Kelas"
                                    aria-label="Ubah Data Kelas"
                                >
                                    <Edit size={16} />
                                </button>
                                <button
                                    onClick={() => handleDelete(c.id)}
                                    className="p-2 text-text-secondary hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                                    title="Hapus Data Kelas"
                                    aria-label="Hapus Data Kelas"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        </div>
                        <div className="mt-4 pt-4 border-t border-border flex justify-between items-center">
                            <span className="status-pill">Aktif</span>
                            <button className="text-xs font-bold text-accent hover:underline">Lihat Detail</button>
                        </div>
                    </div>
                ))}
                {classes.length === 0 && <div className="col-span-2 text-center py-20 opacity-30 italic">Belum ada kelas terdaftar</div>}
            </div>

            <div className="pt-10 border-t border-border">
                <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center text-accent">
                        <CalendarCheck size={20} />
                    </div>
                    <div>
                        <h3 className="font-bold text-lg">Jadwal Mingguan Terintegrasi</h3>
                        <p className="text-xs text-text-secondary">Ringkasan jadwal seluruh kelas aktif</p>
                    </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
                    {['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'].map(day => (
                        <div key={day} className="space-y-4">
                            <div className="text-[10px] font-black uppercase text-text-secondary py-2 border-b-2 border-slate-100 flex justify-between items-center px-1">
                                {day}
                                <span className="w-4 h-4 rounded bg-slate-100 flex items-center justify-center text-[8px] font-bold">{classes.filter(c => (c.schedule || '').includes(day)).length}</span>
                            </div>
                            <div className="space-y-3">
                                {classes.filter(c => (c.schedule || '').includes(day)).map(c => (
                                    <div key={c.id} className="p-3 bg-white border border-border rounded-xl shadow-sm hover:shadow-md transition-all group">
                                        <p className="text-xs font-black text-accent mb-1">{c.name}</p>
                                        <p className="text-[9px] font-bold text-text-secondary leading-tight line-clamp-1">{c.subject}</p>
                                        <div className="mt-2 flex items-center gap-1.5 text-[8px] font-bold text-slate-400">
                                            <Clock size={8} />
                                            {c.schedule.split(' ').pop()}
                                        </div>
                                    </div>
                                ))}
                                {classes.filter(c => (c.schedule || '').includes(day)).length === 0 && (
                                    <div className="py-8 text-center text-[10px] text-text-secondary italic opacity-20">No session</div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {showAdd && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl border border-border">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold">{editingClass ? 'Edit Kelas' : 'Tambah Kelas Baru'}</h3>
                            <button onClick={() => { setShowAdd(false); setEditingClass(null); }} aria-label="Tutup form kelas"><X size={20} /></button>
                        </div>
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold uppercase text-text-secondary">Nama Kelas</label>
                                    <input
                                        type="text"
                                        placeholder="mis: 10 IPA 1"
                                        className="w-full bg-slate-50 border border-border rounded-lg p-3 outline-none focus:border-accent font-bold"
                                        value={editingClass ? editingClass.name : newClass.name}
                                        onChange={e => editingClass ? setEditingClass({ ...editingClass, name: e.target.value }) : setNewClass({ ...newClass, name: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold uppercase text-text-secondary">Tahun Pelajaran</label>
                                    <input
                                        type="text"
                                        placeholder="mis: 2025/2026"
                                        className="w-full bg-slate-50 border border-border rounded-lg p-3 outline-none focus:border-accent font-bold font-mono"
                                        value={editingClass ? editingClass.academicYear : newClass.academicYear}
                                        onChange={e => editingClass ? setEditingClass({ ...editingClass, academicYear: e.target.value }) : setNewClass({ ...newClass, academicYear: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div className="space-y-1">
                                <label className="text-[10px] font-bold uppercase text-text-secondary">Mata Pelajaran Utama</label>
                                <input
                                    type="text"
                                    className="w-full bg-slate-50 border border-border rounded-lg p-3 outline-none focus:border-accent"
                                    value={editingClass ? editingClass.subject : newClass.subject}
                                    onChange={e => editingClass ? setEditingClass({ ...editingClass, subject: e.target.value }) : setNewClass({ ...newClass, subject: e.target.value })}
                                />
                            </div>

                            <div className="space-y-1">
                                <label className="text-[10px] font-bold uppercase text-text-secondary">Nama Wali Kelas</label>
                                <input
                                    type="text"
                                    className="w-full bg-slate-50 border border-border rounded-lg p-3 outline-none focus:border-accent"
                                    value={editingClass ? (editingClass.homeroomTeacher || editingClass.teacher) : newClass.homeroomTeacher}
                                    onChange={e => editingClass ? setEditingClass({ ...editingClass, homeroomTeacher: e.target.value, teacher: e.target.value }) : setNewClass({ ...newClass, homeroomTeacher: e.target.value, teacher: e.target.value })}
                                />
                            </div>

                            <div className="space-y-1">
                                <label className="text-[10px] font-bold uppercase text-text-secondary">NIP Wali Kelas</label>
                                <input
                                    type="text"
                                    className="w-full bg-slate-50 border border-border rounded-lg p-3 outline-none focus:border-accent font-mono"
                                    value={editingClass ? editingClass.homeroomTeacherNip : newClass.homeroomTeacherNip}
                                    onChange={e => editingClass ? setEditingClass({ ...editingClass, homeroomTeacherNip: e.target.value }) : setNewClass({ ...newClass, homeroomTeacherNip: e.target.value })}
                                />
                            </div>

                            <div className="space-y-1">
                                <label className="text-[10px] font-bold uppercase text-text-secondary">Jadwal Mingguan</label>
                                <input
                                    type="text"
                                    placeholder="Senin-Sabtu 08:00"
                                    className="w-full bg-slate-50 border border-border rounded-lg p-3 outline-none focus:border-accent"
                                    value={editingClass ? editingClass.schedule : newClass.schedule}
                                    onChange={e => editingClass ? setEditingClass({ ...editingClass, schedule: e.target.value }) : setNewClass({ ...newClass, schedule: e.target.value })}
                                />
                            </div>
                            <button onClick={handleSave} className="w-full btn-primary py-3 mt-4">Simpan Data Kelas</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function AttendanceView({
    students,
    classes,
    attendanceRecords,
    holidays,
    onRefresh,
    onOpenPrint,
    onSort,
    currentSort,
    sortedData,
    SortableTH
}: {
    students: Student[],
    classes: Class[],
    attendanceRecords: AttendanceRecord[],
    holidays: Holiday[],
    onRefresh: () => void,
    onOpenPrint: () => void,
    onSort: (k: string) => void,
    currentSort: any,
    sortedData: any,
    SortableTH: any
}) {
    const [activeTab, setActiveTab] = useState<'daily' | 'monthly'>('daily');
    const [selectedClassId, setSelectedClassId] = useState<string>(classes[0]?.id || '');
    const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
    const [selectedMonth, setSelectedMonth] = useState<string>(new Date().toISOString().slice(0, 7)); // YYYY-MM

    const classStudents = students.filter(s => s.classId === selectedClassId);
    const currentHoliday = holidays.find(h => h.date === selectedDate);
    const isSunday = new Date(selectedDate).getDay() === 0;

    useEffect(() => {
        if (!classes.length) return;
        if (!selectedClassId || !classes.some(c => c.id === selectedClassId)) {
            setSelectedClassId(classes[0].id);
        }
    }, [classes, selectedClassId]);

    const getAttendanceRecord = (studentId: string, date: string) => {
        const deterministicId = `${studentId}_${date}`;
        const byDeterministicId = attendanceRecords.find(r => r.id === deterministicId);
        if (byDeterministicId) return byDeterministicId;
        const matches = attendanceRecords.filter(r => r.studentId === studentId && r.date === date);
        return matches.length ? matches[matches.length - 1] : undefined;
    };

    const saveAttendanceAdaptive = async (entry: { studentId: string; date: string; status: AttendanceStatus }) => {
        if (!supabase) throw new Error('Supabase belum terkonfigurasi.');

        const basePayload = {
            id: `${entry.studentId}_${entry.date}`,
            studentId: entry.studentId,
            date: entry.date,
            status: entry.status
        };

        // First try with classId (for schemas requiring this column), then fallback without classId.
        const withClassPayload: any = { ...basePayload, classId: selectedClassId };
        let { error } = await supabase.from('attendance').upsert(withClassPayload, { onConflict: 'id' });

        if (error) {
            const message = String(error.message || '').toLowerCase();
            const classIdColumnIssue = message.includes('classid') || message.includes('column') || message.includes('schema cache');
            if (classIdColumnIssue) {
                const retry = await supabase.from('attendance').upsert(basePayload, { onConflict: 'id' });
                error = retry.error;
            }
        }

        if (error) throw error;
        await syncSheetRecords('attendance', [{ ...withClassPayload }], 'upsert');
    };

    const upsertAttendanceEntries = async (entries: Array<{ studentId: string; date: string; status: AttendanceStatus }>) => {
        for (const entry of entries) {
            await saveAttendanceAdaptive(entry);
        }
    };

    const handleBatchStatus = async (status: AttendanceStatus) => {
        if (!selectedClassId || !selectedDate || currentHoliday || isSunday) return;
        const updates = classStudents.map(s => ({
            studentId: s.id,
            date: selectedDate,
            status
        }));
        try {
            await upsertAttendanceEntries(updates);
            onRefresh();
        } catch (error) {
            console.error('Error setting batch attendance:', error);
            const msg = error instanceof Error ? error.message : String(error);
            alert(`Gagal menyimpan presensi massal.\n${msg}`);
        }
    };

    const handleSingleStatus = async (studentId: string, status: AttendanceStatus) => {
        try {
            await upsertAttendanceEntries([{ studentId, date: selectedDate, status }]);
            onRefresh();
        } catch (error) {
            console.error('Error setting attendance:', error);
            const msg = error instanceof Error ? error.message : String(error);
            alert(`Gagal menyimpan status presensi.\n${msg}`);
        }
    };

    return (
        <div className="space-y-6 print-container">
            <div className="print-header">
                <h1 className="text-2xl font-black uppercase tracking-tighter">LAPORAN PRESENSI SISWA</h1>
                <p className="text-xs font-bold text-slate-500">Kelas: {classes.find(c => c.id === selectedClassId)?.name || '-'} | Periode: {activeTab === 'daily' ? selectedDate : selectedMonth}</p>
            </div>

            <div className="flex border-b border-border gap-8 pb-3 no-print items-center justify-between">
                <div className="flex gap-8">
                    <button
                        onClick={() => setActiveTab('daily')}
                        className={`text-sm font-bold uppercase tracking-widest pb-1 transition-all ${activeTab === 'daily' ? 'text-accent border-b-2 border-accent' : 'opacity-30 hover:opacity-100'}`}
                    >
                        Absensi Harian
                    </button>
                    <button
                        onClick={() => setActiveTab('monthly')}
                        className={`text-sm font-bold uppercase tracking-widest pb-1 transition-all ${activeTab === 'monthly' ? 'text-accent border-b-2 border-accent' : 'opacity-30 hover:opacity-100'}`}
                    >
                        Rekap Bulanan
                    </button>
                </div>
                <button onClick={onOpenPrint} className="btn-small !bg-slate-700 flex items-center gap-2 shadow-md">
                    <Printer size={14} /> Cetak Laporan PDF
                </button>
            </div>

            {activeTab === 'daily' && (currentHoliday || isSunday) && (
                <div className="bg-red-50 border border-red-100 p-4 rounded-xl flex items-center gap-3 text-red-600 font-bold">
                    <AlertCircle size={20} />
                    <span>Hari ini adalah {currentHoliday?.name || (isSunday ? 'Hari Minggu' : 'Hari Libur')}. Absensi tidak diperlukan.</span>
                </div>
            )}

            <div className="flex flex-col md:flex-row gap-4 items-end">
                <div className="flex-1 space-y-1">
                    <label className="stat-label">Pilih Kelas</label>
                    <select
                        className="w-full bg-white border border-border rounded-xl p-3 outline-none font-bold"
                        value={selectedClassId}
                        onChange={e => setSelectedClassId(e.target.value)}
                    >
                        <option value="">Pilih Kelas</option>
                        {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                </div>

                {activeTab === 'daily' ? (
                    <div className="flex-1 space-y-1">
                        <label className="stat-label">Tanggal</label>
                        <input
                            type="date"
                            className="w-full bg-white border border-border rounded-xl p-3 outline-none font-bold"
                            value={selectedDate}
                            onChange={e => setSelectedDate(e.target.value)}
                        />
                    </div>
                ) : (
                    <div className="flex-1 space-y-1">
                        <label className="stat-label">Bulan</label>
                        <input
                            type={typeof document !== 'undefined' && document.createElement('input').type === 'month' ? 'month' : 'text'}
                            placeholder="YYYY-MM"
                            pattern="\d{4}-\d{2}"
                            title="Format: YYYY-MM"
                            className="w-full bg-white border border-border rounded-xl p-3 outline-none font-bold"
                            value={selectedMonth}
                            onChange={e => setSelectedMonth(e.target.value)}
                        />
                    </div>
                )}

                {activeTab === 'daily' && !currentHoliday && !isSunday && (
                    <div className="flex gap-2">
                        <button onClick={() => handleBatchStatus('hadir')} className="btn-small !bg-success flex items-center gap-2">Set Hadir Semua</button>
                    </div>
                )}
            </div>

            <div className="table-container shadow-sm">
                {activeTab === 'daily' ? (
                    <table className="data-table">
                        <thead>
                            <tr>
                                <SortableTH label="SISWA" sortKey="name" currentSort={currentSort} onSort={onSort} />
                                <th className="w-48 text-center text-[10px] font-black uppercase text-slate-500 bg-slate-50/50">STATUS</th>
                                <th colSpan={2} className="text-center text-[10px] font-black uppercase text-slate-500 bg-slate-50/50">OPERASI CEPAT</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sortedData(classStudents).map((s: any) => {
                                const record = getAttendanceRecord(s.id, selectedDate);
                                const disabled = !!currentHoliday || isSunday;
                                return (
                                    <tr key={s.id} className="hover:bg-slate-50 transition-all">
                                        <td>
                                            <div className="flex flex-col">
                                                <span className="font-bold text-sm">{s.name}</span>
                                                <span className="text-[10px] text-text-secondary font-mono uppercase">{s.nis || 'NO NIS'}</span>
                                            </div>
                                        </td>
                                        <td className="text-center">
                                            <div className="flex justify-center flex-wrap gap-1">
                                                <StatusBtn label="H" active={record?.status === 'hadir'} color="bg-success text-white" onClick={() => !disabled && handleSingleStatus(s.id, 'hadir')} />
                                                <StatusBtn label="I" active={record?.status === 'izin'} color="bg-blue-500 text-white" onClick={() => !disabled && handleSingleStatus(s.id, 'izin')} />
                                                <StatusBtn label="S" active={record?.status === 'sakit'} color="bg-yellow-500 text-white" onClick={() => !disabled && handleSingleStatus(s.id, 'sakit')} />
                                                <StatusBtn label="A" active={record?.status === 'alpa'} color="bg-red-500 text-white" onClick={() => !disabled && handleSingleStatus(s.id, 'alpa')} />
                                            </div>
                                        </td>
                                        <td className="text-center w-24">
                                            {record ? (
                                                <span className={`text-[10px] font-black uppercase px-3 py-1 rounded-full shadow-sm tracking-tighter ${record.status === 'hadir' ? 'text-success bg-success/10 border border-success/20' :
                                                    record.status === 'izin' ? 'text-blue-600 bg-blue-50 border border-blue-100' :
                                                        record.status === 'sakit' ? 'text-yellow-600 bg-yellow-50 border border-yellow-100' :
                                                            'text-red-600 bg-red-50 border border-red-100'
                                                    }`}>
                                                    {record.status}
                                                </span>
                                            ) : <span className="text-[9px] font-bold text-slate-300 italic tracking-tight">NULL_DATA</span>}
                                        </td>
                                    </tr>
                                );
                            })}
                            {classStudents.length === 0 && (
                                <tr>
                                    <td colSpan={3} className="text-center py-24 opacity-30 italic font-mono text-xs">AWAITING_CLASS_SELECTION...</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                ) : (
                    <MonthlyAttendanceView
                        students={classStudents}
                        month={selectedMonth}
                        attendanceRecords={attendanceRecords}
                        classId={selectedClassId}
                        holidays={holidays}
                        onRefresh={onRefresh}
                    />
                )}
            </div>
        </div>
    );
}

function StatusBtn({ label, active, color, onClick }: { label: string, active: boolean, color: string, onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs transition-all ${active ? color : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}
        >
            {label}
        </button>
    );
}

function MonthlyAttendanceView({
    students,
    month,
    attendanceRecords,
    classId,
    holidays,
    onRefresh
}: {
    students: Student[],
    month: string,
    attendanceRecords: AttendanceRecord[],
    classId: string,
    holidays: Holiday[],
    onRefresh: () => void
}) {
    const [year, m] = month.split('-').map(Number);
    const daysInMonth = new Date(year, m, 0).getDate();
    const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
    const [edits, setEdits] = useState<Record<string, AttendanceStatus | null>>({});
    const [saving, setSaving] = useState(false);
    const statusCycle: Array<AttendanceStatus | null> = ['hadir', 'izin', 'sakit', 'alpa', null];

    const isHoliday = (date: Date) => {
        const day = date.getDay();
        const dateStr = date.toISOString().split('T')[0];

        if (day === 0) return { holiday: true, name: 'Minggu' };

        const holiday = holidays.find(h => h.date === dateStr);
        if (holiday) return { holiday: true, name: holiday.name };

        return { holiday: false };
    };

    const getAttendanceRecord = (studentId: string, date: string) => {
        const deterministicId = `${studentId}_${date}`;
        const byDeterministicId = attendanceRecords.find(r => r.id === deterministicId);
        if (byDeterministicId) return byDeterministicId;
        const matches = attendanceRecords.filter(r => r.studentId === studentId && r.date === date);
        return matches.length ? matches[matches.length - 1] : undefined;
    };

    const getCellKey = (studentId: string, dateStr: string) => `${studentId}_${dateStr}`;

    const getCellStatus = (studentId: string, dateStr: string): AttendanceStatus | null => {
        const key = getCellKey(studentId, dateStr);
        if (key in edits) return edits[key];
        return (getAttendanceRecord(studentId, dateStr)?.status as AttendanceStatus | undefined) ?? null;
    };

    const toggleCellStatus = (studentId: string, dateStr: string) => {
        const current = getCellStatus(studentId, dateStr);
        const next = statusCycle[(statusCycle.indexOf(current) + 1) % statusCycle.length];
        setEdits(prev => ({ ...prev, [getCellKey(studentId, dateStr)]: next }));
    };

    const saveAttendanceAdaptive = async (entry: { studentId: string; date: string; status: AttendanceStatus }) => {
        if (!supabase) throw new Error('Supabase belum terkonfigurasi.');

        const basePayload = {
            id: `${entry.studentId}_${entry.date}`,
            studentId: entry.studentId,
            date: entry.date,
            status: entry.status
        };

        const withClassPayload: any = { ...basePayload, classId };
        let { error } = await supabase.from('attendance').upsert(withClassPayload, { onConflict: 'id' });

        if (error) {
            const message = String(error.message || '').toLowerCase();
            const classIdColumnIssue = message.includes('classid') || message.includes('column') || message.includes('schema cache');
            if (classIdColumnIssue) {
                const retry = await supabase.from('attendance').upsert(basePayload, { onConflict: 'id' });
                error = retry.error;
            }
        }

        if (error) throw error;
        await syncSheetRecords('attendance', [{ ...withClassPayload }], 'upsert');
    };

    const handleSaveMonthlyEdits = async () => {
        const keys = Object.keys(edits);
        if (keys.length === 0) return;
        setSaving(true);
        try {
            for (const key of keys) {
                const [studentId, date] = key.split('_');
                const status = edits[key];
                const existing = getAttendanceRecord(studentId, date);

                if (!status) {
                    if (existing?.id) {
                        await deleteDoc(doc(db, 'attendance', existing.id));
                    }
                    continue;
                }
                await saveAttendanceAdaptive({ studentId, date, status });
            }
            setEdits({});
            onRefresh();
        } catch (error) {
            console.error('Error saving monthly attendance edits:', error);
            const msg = error instanceof Error ? error.message : String(error);
            alert(`Gagal menyimpan rekap bulanan.\n${msg}`);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="p-4 overflow-x-auto min-w-full">
            {Object.keys(edits).length > 0 && (
                <div className="mb-4 p-3 bg-blue-50 border border-blue-100 rounded-xl flex items-center justify-between">
                    <p className="text-xs font-bold text-blue-700">{Object.keys(edits).length} perubahan belum disimpan.</p>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setEdits({})}
                            className="text-xs font-bold text-slate-600 hover:text-slate-800"
                            disabled={saving}
                        >
                            Batal
                        </button>
                        <button
                            onClick={handleSaveMonthlyEdits}
                            className="btn-small !bg-blue-600 hover:!bg-blue-700 flex items-center gap-2"
                            disabled={saving}
                        >
                            <Save size={14} /> {saving ? 'Menyimpan...' : 'Simpan Rekap'}
                        </button>
                    </div>
                </div>
            )}
            <table className="w-full border-collapse">
                <thead>
                    <tr>
                        <th className="text-left p-2 border border-border sticky left-0 bg-white z-10 min-w-[200px]">SISWA</th>
                        {days.map(d => {
                            const date = new Date(year, m - 1, d);
                            const holidayInfo = isHoliday(date);
                            return (
                                <th
                                    key={d}
                                    className={`p-1 border border-border font-mono text-[10px] min-w-[28px] ${holidayInfo.holiday ? 'bg-red-50 text-red-500' : ''}`}
                                    title={holidayInfo.name}
                                >
                                    {d}
                                </th>
                            );
                        })}
                    </tr>
                </thead>
                <tbody>
                    {students.map(s => (
                        <tr key={s.id} className="hover:bg-slate-50 transition-all">
                            <td className="p-2 border border-border sticky left-0 bg-white group-hover:bg-slate-50 z-10 font-bold text-sm">{s.name.split(' ')[0]}</td>
                            {days.map(d => {
                                const date = new Date(year, m - 1, d);
                                const dateStr = `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                                const status = getCellStatus(s.id, dateStr);
                                const holidayInfo = isHoliday(date);
                                const edited = getCellKey(s.id, dateStr) in edits;

                                return (
                                    <td
                                        key={d}
                                        className={`p-0 border border-border text-center ${holidayInfo.holiday ? 'bg-red-50/30' : 'cursor-pointer hover:bg-slate-100'} ${edited ? 'bg-blue-50/50' : ''}`}
                                        onClick={() => !holidayInfo.holiday && toggleCellStatus(s.id, dateStr)}
                                    >
                                        {status ? (
                                            <div className={`w-full h-full min-h-[28px] flex items-center justify-center text-[10px] font-black ${status === 'hadir' ? 'text-success' :
                                                status === 'izin' ? 'text-blue-500' :
                                                    status === 'sakit' ? 'text-yellow-500' :
                                                        'text-red-500'
                                                }`} title={`${dateStr}: ${status}`}>
                                                {status === 'hadir' ? 'H' : status[0].toUpperCase()}
                                            </div>
                                        ) : (
                                            <div className="min-h-[28px] flex items-center justify-center">
                                                {holidayInfo.holiday && <div className="w-1 h-1 bg-red-400 rounded-full" title={holidayInfo.name}></div>}
                                            </div>
                                        )}
                                    </td>
                                );
                            })}
                        </tr>
                    ))}
                    {students.length === 0 && (
                        <tr>
                            <td colSpan={daysInMonth + 1} className="text-center py-20 opacity-30 italic">Pilih kelas untuk melihat rekap</td>
                        </tr>
                    )}
                </tbody>
            </table>
            <div className="mt-4 flex gap-6 text-[10px] font-bold uppercase tracking-widest text-text-secondary">
                <div className="flex items-center gap-2"><div className="w-2 h-2 bg-success rounded-full"></div> Hadir (H)</div>
                <div className="flex items-center gap-2"><div className="w-2 h-2 bg-blue-500 rounded-full"></div> Izin (I)</div>
                <div className="flex items-center gap-2"><div className="w-2 h-2 bg-yellow-500 rounded-full"></div> Sakit (S)</div>
                <div className="flex items-center gap-2"><div className="w-2 h-2 bg-red-500 rounded-full"></div> Alpa (A)</div>
                <div className="ml-auto text-[10px] italic opacity-60">Klik sel untuk ubah status.</div>
            </div>
        </div>
    );
}

function AssignmentsView({ materials, subjects, onRefresh }: { materials: Material[], subjects: Subject[], onRefresh: () => void }) {
    const [showAdd, setShowAdd] = useState(false);
    const [selectedSubjectId, setSelectedSubjectId] = useState('');
    const [newMaterial, setNewMaterial] = useState<{ title: string, weight: number, type: AssessmentType }>({
        title: '',
        weight: 25,
        type: 'formatif'
    });

    const handleAddMaterial = async () => {
        if (!selectedSubjectId || !newMaterial.title) return alert('Lengkapi data');
        await addDoc(collection(db, 'materials'), { ...newMaterial, subjectId: selectedSubjectId });
        setNewMaterial({ title: '', weight: 25, type: 'formatif' });
        setShowAdd(false);
        onRefresh();
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Hapus tugas ini?')) return;
        await deleteDoc(doc(db, 'materials', id));
        onRefresh();
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold tracking-tighter">Manajemen Tugas & Materi</h2>
                <button onClick={() => setShowAdd(true)} className="btn-primary flex items-center gap-2">
                    <BookOpen size={16} /> Tambah Materi/Tugas
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {subjects.map(s => (
                    <div key={s.id} className="card !p-0 overflow-hidden">
                        <div className="bg-accent/5 p-4 border-b border-border flex justify-between items-center">
                            <div>
                                <h3 className="font-bold text-lg">{s.name}</h3>
                                <span className="text-[10px] font-bold text-text-secondary uppercase tracking-widest">{s.code}</span>
                            </div>
                            <Activity size={20} className="text-accent/30" />
                        </div>
                        <div className="p-4 space-y-3">
                            {materials.filter(m => m.subjectId === s.id).length === 0 && (
                                <p className="text-xs text-text-secondary italic opacity-50 py-4 text-center">Belum ada tugas/materi</p>
                            )}
                            {materials.filter(m => m.subjectId === s.id).map(m => (
                                <div key={m.id} className="group flex items-center justify-between p-3 bg-slate-50 rounded-xl hover:bg-slate-100 transition-all">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 bg-white border border-border rounded-lg flex items-center justify-center font-bold text-xs text-accent">
                                            {m.weight}%
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold">{m.title}</p>
                                            <div className="flex gap-2 items-center">
                                                <p className="text-[10px] text-text-secondary">Bobot: {m.weight}%</p>
                                                <span className={`text-[8px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-tighter ${m.type === 'formatif' ? 'bg-blue-100 text-blue-600' :
                                                    m.type === 'sumatif' ? 'bg-orange-100 text-orange-600' :
                                                        'bg-slate-100 text-slate-600'
                                                    }`}>
                                                    {m.type}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => handleDelete(m.id)}
                                        className="p-2 text-red-500 opacity-0 group-hover:opacity-100 hover:bg-red-50 rounded-lg transition-all"
                                        title="Hapus Tugas/Materi"
                                        aria-label="Hapus Tugas/Materi"
                                    >
                                        <X size={14} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            {showAdd && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl p-8 max-w-lg w-full shadow-2xl border border-border">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold">Tambah Tugas/Materi</h3>
                            <button onClick={() => setShowAdd(false)} title="Tutup Modal" aria-label="Tutup"><X size={20} /></button>
                        </div>

                        <div className="space-y-4 mb-8">
                            <div className="space-y-1">
                                <label className="stat-label" htmlFor="academic-subject-select">Pilih Mata Pelajaran</label>
                                <select
                                    id="academic-subject-select"
                                    title="Pilih Mata Pelajaran"
                                    className="w-full bg-slate-50 border border-border rounded-lg p-3 outline-none font-bold"
                                    value={selectedSubjectId}
                                    onChange={e => setSelectedSubjectId(e.target.value)}
                                >
                                    <option value="">-- Pilih Mapel --</option>
                                    {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                </select>
                            </div>
                            <div className="space-y-1">
                                <label className="stat-label" htmlFor="assessment-type-select">Jenis Penilaian</label>
                                <select
                                    id="assessment-type-select"
                                    title="Pilih Jenis Penilaian"
                                    className="w-full bg-slate-50 border border-border rounded-lg p-3 outline-none font-bold"
                                    value={newMaterial.type}
                                    onChange={e => setNewMaterial({ ...newMaterial, type: e.target.value as AssessmentType })}
                                >
                                    <option value="formatif">Formatif</option>
                                    <option value="sumatif">Sumatif</option>
                                </select>
                            </div>
                            <div className="space-y-1">
                                <label className="stat-label">Judul Materi / Tujuan Pembelajaran</label>
                                <input
                                    type="text"
                                    className="w-full bg-slate-50 border border-border rounded-lg p-3 outline-none focus:border-accent"
                                    placeholder="Contoh: TP 1 - Aljabar"
                                    value={newMaterial.title}
                                    onChange={e => setNewMaterial({ ...newMaterial, title: e.target.value })}
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="stat-label">Bobot dalam Kategori (%)</label>
                                <input
                                    type="number"
                                    className="w-full bg-slate-50 border border-border rounded-lg p-3 outline-none focus:border-accent"
                                    value={newMaterial.weight}
                                    onChange={e => setNewMaterial({ ...newMaterial, weight: parseInt(e.target.value) })}
                                />
                            </div>
                        </div>

                        <div className="flex justify-end gap-3">
                            <button onClick={() => setShowAdd(false)} className="px-6 py-2 border border-border rounded-xl font-bold">Batal</button>
                            <button onClick={handleAddMaterial} className="btn-primary px-8">Tambah Tugas</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function ClockDisplay({ holidays }: { holidays: Holiday[] }) {
    const [time, setTime] = useState(new Date());
    const [showCalendar, setShowCalendar] = useState(false);
    const [viewDate, setViewDate] = useState(new Date());

    useEffect(() => {
        const timer = setInterval(() => setTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDayOfMonth = new Date(year, month, 1).getDay();

    const prefixDays = Array.from({ length: firstDayOfMonth }, (_, i) => null);
    const monthDays = Array.from({ length: daysInMonth }, (_, i) => i + 1);
    const calendarDays = [...prefixDays, ...monthDays];

    const changeMonth = (offset: number) => {
        const nextDate = new Date(viewDate);
        nextDate.setMonth(nextDate.getMonth() + offset);
        setViewDate(nextDate);
    };

    const changeYear = (offset: number) => {
        const nextDate = new Date(viewDate);
        nextDate.setFullYear(nextDate.getFullYear() + offset);
        setViewDate(nextDate);
    };

    return (
        <div className="relative">
            <button
                onClick={() => {
                    if (!showCalendar) setViewDate(new Date());
                    setShowCalendar(!showCalendar);
                }}
                className="flex items-center gap-3 font-mono text-3xl font-black text-accent hover:bg-slate-50 p-2 rounded-lg transition-all"
                title="Klik untuk lihat kalender"
            >
                <Clock size={28} />
                <span>{time.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
            </button>

            {showCalendar && (
                <div className="absolute top-full left-0 mt-2 z-50 bg-white border border-border shadow-2xl rounded-2xl p-6 min-w-[340px]">
                    <div className="flex flex-col gap-4 mb-6">
                        <div className="flex justify-between items-center">
                            <div className="flex items-center gap-1">
                                <button onClick={() => changeYear(-1)} className="p-1 hover:bg-slate-100 rounded text-slate-400" title="Tahun Lalu"><ChevronLeft size={14} /><ChevronLeft size={14} className="-ml-2" /></button>
                                <button onClick={() => changeMonth(-1)} className="p-1 hover:bg-slate-100 rounded text-slate-400" title="Bulan Lalu"><ChevronLeft size={18} /></button>
                            </div>
                            <h4 className="font-bold text-lg text-slate-800 flex-1 text-center">
                                {viewDate.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}
                            </h4>
                            <div className="flex items-center gap-1">
                                <button onClick={() => changeMonth(1)} className="p-1 hover:bg-slate-100 rounded text-slate-400" title="Bulan Depan"><ChevronRight size={18} /></button>
                                <button onClick={() => changeYear(1)} className="p-1 hover:bg-slate-100 rounded text-slate-400" title="Tahun Depan"><ChevronRight size={14} /><ChevronRight size={14} className="-ml-2" /></button>
                            </div>
                        </div>
                        <button
                            onClick={() => setViewDate(new Date())}
                            className="text-[10px] uppercase font-bold text-accent hover:underline text-center"
                        >
                            Kembali ke Hari Ini
                        </button>
                    </div>

                    <div className="grid grid-cols-7 gap-2 text-center">
                        {['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'].map(d => (
                            <div key={d} className={`text-[10px] font-bold py-2 ${d === 'Min' ? 'text-red-500' : 'text-slate-400'}`}>{d}</div>
                        ))}

                        {calendarDays.map((d, i) => {
                            if (d === null) return <div key={`empty-${i}`} className="p-2" />;

                            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                            const holiday = holidays.find(h => h.date === dateStr);
                            const isToday = d === time.getDate() && month === time.getMonth() && year === time.getFullYear();
                            const isSunday = (i % 7 === 0);

                            return (
                                <div
                                    key={d}
                                    className={`
                     relative p-2 text-xs font-bold rounded-lg transition-all
                     ${isToday ? 'bg-slate-900 text-yellow-400 shadow-lg ring-2 ring-yellow-400/50' : 'hover:bg-slate-50 text-slate-700'}
                     ${(holiday || isSunday) && !isToday ? 'text-red-500' : ''}
                   `}
                                    title={holiday?.name}
                                >
                                    {d}
                                    {holiday && <div className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-red-500 rounded-full" />}
                                </div>
                            );
                        })}
                    </div>

                    {holidays.filter(h => {
                        const hDate = new Date(h.date);
                        return hDate.getMonth() === month && hDate.getFullYear() === year;
                    }).length > 0 && (
                            <div className="mt-6 pt-4 border-t border-border space-y-2">
                                <p className="text-[10px] font-bold text-text-secondary uppercase tracking-widest">Hari Libur Bulan Ini</p>
                                {holidays.filter(h => {
                                    const hDate = new Date(h.date);
                                    return hDate.getMonth() === month && hDate.getFullYear() === year;
                                }).map(h => (
                                    <div key={h.date} className="flex gap-2 text-[10px] font-medium text-slate-600">
                                        <span className="text-red-500 whitespace-nowrap">{new Date(h.date).getDate()} {new Date(h.date).toLocaleDateString('id-ID', { month: 'short' })}</span>
                                        <span className="truncate">{h.name}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                </div>
            )}
        </div>
    );
}

function StudentProfileView({
    studentId,
    students,
    classes,
    subjects,
    materials,
    grades,
    attendance,
    payments,
    feeItems,
    savings,
    classCash,
    settings,
    onBack,
    onViewPayments
}: {
    studentId: string | null,
    students: Student[],
    classes: Class[],
    subjects: Subject[],
    materials: Material[],
    grades: Grade[],
    attendance: AttendanceRecord[],
    payments: StudentPayment[],
    feeItems: FeeItem[],
    savings: SavingsTransaction[],
    classCash: ClassCashTransaction[],
    settings: AppSettings,
    onBack: () => void,
    onViewPayments: (id: string) => void
}) {
    const student = students.find(s => s.id === studentId);
    const studentClass = classes.find(c => c.id === student?.classId);

    if (!student) return <div className="p-20 text-center text-text-secondary opacity-50 italic">Siswa tidak ditemukan</div>;

    // Calculate stats
    const studentGrades = grades.filter(g => g.studentId === studentId);
    const studentAttendance = attendance.filter(a => a.studentId === studentId);
    // Calculate financial stats
    const studentPayments = payments.filter(p => p.studentId === studentId);
    const paidAmount = studentPayments.reduce((acc, p) => acc + p.amountPaid, 0);
    const studentSavings = savings.filter(t => t.studentId === studentId);
    const balanceSavings = studentSavings.filter(t => t.type === 'deposit').reduce((acc, t) => acc + t.amount, 0) - studentSavings.filter(t => t.type === 'withdrawal').reduce((acc, t) => acc + t.amount, 0);
    const totalWajib = feeItems.filter(i => i.category === 'wajib').reduce((acc, i) => acc + i.amount, 0);
    const arrears = totalWajib - (studentPayments.reduce((acc, p) => acc + (p.isDeposit ? 0 : p.amountPaid), 0)); // simple arrears calc
    const attendPercent = studentAttendance.length > 0
        ? (studentAttendance.filter(a => a.status === 'hadir').length / studentAttendance.length) * 100
        : 0;

    // Calculate Class Cash (Gemari & Infaq)
    const gemariData = classCash.filter(t => t.studentId === studentId && t.type === 'gemari');
    const infaqData = classCash.filter(t => t.studentId === studentId && t.type === 'infaq');
    const totalGemariPaid = gemariData.filter(t => t.transactionType === 'deposit').reduce((sum, t) => sum + t.amount, 0);
    const totalInfaqPaid = infaqData.filter(t => t.transactionType === 'deposit').reduce((sum, t) => sum + t.amount, 0);

    // As a simulation, assume target is to pay for 20 days per month. So let's estimate 1 month active (20 days)
    // Or simpler: target = (total gemari inputs we have for all students / total students) or just a fixed estimate:
    const activeDaysEstimate = 20; // Defaulting to ~20 days worth of target for typical month recap
    const targetGemari = activeDaysEstimate * 500;
    const targetInfaq = activeDaysEstimate * 1000;
    const kurangGemari = Math.max(0, targetGemari - totalGemariPaid);
    const kurangInfaq = Math.max(0, targetInfaq - totalInfaqPaid);

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(amount);
    };

    return (
        <div className="space-y-8 pb-20 print:pb-0">
            <div className="flex items-center gap-4 no-print">
                <button
                    onClick={onBack}
                    className="p-2 hover:bg-slate-100 rounded-lg transition-all text-text-secondary"
                    title="Kembali"
                    aria-label="Kembali ke halaman sebelumnya"
                >
                    <ChevronRight size={24} className="rotate-180" />
                </button>
                <div>
                    <h2 className="text-2xl font-bold tracking-tighter">Profil Siswa Detail</h2>
                    <p className="text-sm text-text-secondary">Informasi lengkap, riwayat nilai, dan rekapan absensi</p>
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 no-print">
                {/* Left Col: Info & Bio */}
                <div className="space-y-6">
                    <div className="card text-center relative overflow-hidden">
                        <div className="absolute top-4 right-4 text-[48px] font-black text-slate-50 -z-10 select-none">#{student.attendanceNumber || '-'}</div>
                        <div className="w-24 h-24 bg-accent/10 text-accent rounded-full flex items-center justify-center text-3xl font-black mx-auto mb-4 border-4 border-white shadow-xl">
                            {student.name.charAt(0)}
                        </div>
                        <h3 className="text-xl font-bold">{student.name}</h3>
                        <p className="text-sm text-text-secondary mb-4">{student.email}</p>
                        <div className="flex flex-wrap justify-center gap-2">
                            <span className="text-[10px] font-bold uppercase tracking-widest bg-slate-900 text-yellow-400 px-2 py-1 rounded shadow-sm">Kelas {studentClass?.name}</span>
                            <span className="text-[10px] font-bold uppercase tracking-widest bg-slate-100 text-slate-700 px-2 py-1 rounded">NISN: {student.nisn || '-'}</span>
                            <span className="text-[10px] font-bold uppercase tracking-widest bg-slate-100 text-slate-700 px-2 py-1 rounded">NIS: {student.nis || '-'}</span>
                        </div>
                    </div>

                    <div className="card space-y-4">
                        <h4 className="stat-label uppercase flex items-center gap-2"><User size={14} /> Identitas Siswa</h4>
                        <div className="space-y-3">
                            <InfoRow label="No. Absen" value={student.attendanceNumber?.toString() || '-'} />
                            <InfoRow label="Jenis Kelamin" value={student.gender === 'L' ? 'Laki-laki' : 'Perempuan'} />
                            <InfoRow label="Tempat Lahir" value={student.birthPlace || '-'} />
                            <InfoRow label="Tanggal Lahir" value={student.birthDate || '-'} />
                            <InfoRow label="NIK" value={student.nik || '-'} />
                            <InfoRow label="NKK" value={student.nkk || '-'} />
                            <InfoRow label="Agama" value={student.religion || '-'} />
                            <InfoRow label="No. Telp" value={student.phone || '-'} />
                        </div>
                    </div>

                    <div className="card space-y-4 border-l-4 border-l-accent">
                        <h4 className="stat-label uppercase flex items-center gap-2"><CreditCard size={14} /> Ringkasan Keuangan</h4>
                        <div className="space-y-4">
                            <div className="flex justify-between items-end">
                                <span className="text-[10px] font-bold uppercase text-text-secondary">Arrears / Tunggakan</span>
                                <span className={`text-lg font-black ${arrears > 0 ? 'text-red-500' : 'text-success'}`}>{formatCurrency(Math.max(0, arrears))}</span>
                            </div>
                            <div className="flex justify-between items-end">
                                <span className="text-[10px] font-bold uppercase text-text-secondary">Saldo Tabungan</span>
                                <span className="text-lg font-black text-accent">{formatCurrency(balanceSavings)}</span>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => onViewPayments(student.id)}
                                    className="flex-1 btn-small !py-2 text-[10px] uppercase font-black tracking-widest bg-slate-700 hover:bg-slate-800"
                                >
                                    Rincian Transaksi
                                </button>
                                <button
                                    onClick={() => window.print()}
                                    className="btn-small !py-2 text-[10px] uppercase font-black tracking-widest bg-emerald-600 hover:bg-emerald-700"
                                    title="Cetak Kwitansi Keuangan"
                                >
                                    <Printer size={16} />
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="card space-y-4">
                        <h4 className="stat-label uppercase flex items-center gap-2"><Settings size={14} /> Alamat & Jarak</h4>
                        <div className="space-y-3">
                            <div className="space-y-1">
                                <span className="text-[10px] font-bold uppercase text-text-secondary">Alamat Lengkap</span>
                                <p className="text-xs font-medium">{student.address || '-'}</p>
                            </div>
                            <InfoRow label="Dusun" value={student.dusun || '-'} />
                            <InfoRow label="Desa" value={student.desa || '-'} />
                            <InfoRow label="Kecamatan" value={student.kecamatan || '-'} />
                            <InfoRow label="Jarak ke Sekolah" value={`${student.distanceToSchool || '-'} KM`} />
                        </div>
                    </div>
                </div>

                {/* Middle Col: Physical & Family */}
                <div className="space-y-6">
                    <div className="card space-y-6">
                        <h4 className="stat-label uppercase flex items-center gap-2"><Activity size={14} /> Perkembangan Fisik</h4>
                        <div className="grid grid-cols-2 gap-6">
                            <div className="space-y-3">
                                <div className="text-[10px] font-bold uppercase text-accent border-b border-accent/20 pb-1">Semester 1</div>
                                <InfoRow label="Berat (kg)" value={student.weightSem1?.toString() || '-'} />
                                <InfoRow label="Tinggi (cm)" value={student.heightSem1?.toString() || '-'} />
                            </div>
                            <div className="space-y-3">
                                <div className="text-[10px] font-bold uppercase text-accent border-b border-accent/20 pb-1">Semester 2</div>
                                <InfoRow label="Berat (kg)" value={student.weightSem2?.toString() || '-'} />
                                <InfoRow label="Tinggi (cm)" value={student.heightSem2?.toString() || '-'} />
                            </div>
                        </div>
                    </div>

                    <div className="card space-y-6">
                        <h4 className="stat-label uppercase flex items-center gap-2"><Users size={14} /> Data Orang Tua / Wali</h4>

                        <div className="space-y-4">
                            <div className="space-y-2">
                                <div className="text-[10px] font-bold uppercase text-accent bg-accent/5 p-1 rounded">Ayah Kandung</div>
                                <InfoRow label="Nama" value={student.fatherName || '-'} />
                                <InfoRow label="Tahun Lahir" value={student.fatherBirthYear || '-'} />
                                <InfoRow label="NIK" value={student.fatherNik || '-'} />
                            </div>

                            <div className="space-y-2">
                                <div className="text-[10px] font-bold uppercase text-accent bg-accent/5 p-1 rounded">Ibu Kandung</div>
                                <InfoRow label="Nama" value={student.motherName || '-'} />
                                <InfoRow label="Tahun Lahir" value={student.motherBirthYear || '-'} />
                                <InfoRow label="NIK" value={student.motherNik || '-'} />
                            </div>

                            <div className="space-y-2">
                                <div className="text-[10px] font-bold uppercase text-slate-600 bg-slate-100 p-1 rounded">Wali</div>
                                <InfoRow label="Nama" value={student.guardianName || '-'} />
                                <InfoRow label="Tahun Lahir" value={student.guardianBirthYear || '-'} />
                                <InfoRow label="NIK" value={student.guardianNik || '-'} />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Col: Performance */}
                <div className="space-y-6">
                    <div className="grid grid-cols-1 gap-4">
                        <StatCard title="Rata-rata Nilai" value={student.gradeValue?.toString() || '0'} change="Berdasarkan Mapel Aktif" icon={<TrendingUp size={20} />} />
                        <StatCard title="Presensi Riwayat" value={`${attendPercent.toFixed(1)}%`} change={`${studentAttendance.length} Sesi Tercatat`} icon={<CalendarCheck size={20} />} iconColor="text-emerald-500" />
                    </div>

                    <div className="card !p-0">
                        <div className="p-5 font-bold border-b border-border flex justify-between items-center">
                            Riwayat Nilai
                            <FileText size={16} className="text-text-secondary" />
                        </div>
                        <div className="max-h-[300px] overflow-y-auto">
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>MAPEL</th>
                                        <th>AV</th>
                                        <th>STAT</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {subjects.filter(sub => sub.classId === student.classId).map(sub => {
                                        const getAvg = (type: AssessmentType) => {
                                            const mats = materials.filter(m => m.subjectId === sub.id && m.type === type);
                                            if (mats.length === 0) return 0;
                                            let sum = 0;
                                            let count = 0;
                                            mats.forEach(m => {
                                                const gp = studentGrades.find(gr => gr.materialId === m.id && gr.scoreType === 'Pengetahuan');
                                                const gk = studentGrades.find(gr => gr.materialId === m.id && gr.scoreType === 'Keterampilan');
                                                if (gp) { sum += gp.value; count++; }
                                                if (gk) { sum += gk.value; count++; }
                                            });
                                            return count > 0 ? sum / count : 0;
                                        };

                                        const avgP = getAvg('pengetahuan');
                                        const avgK = getAvg('keterampilan');
                                        const avgPTS = getAvg('pts');
                                        const avgPAS = getAvg('pas');

                                        const subMaterials = materials.filter(m => m.subjectId === sub.id);
                                        const avg = subMaterials.length > 0 ? (avgP + avgK + avgPTS + avgPAS) / 4 : 0;

                                        return (
                                            <tr key={sub.id}>
                                                <td className="font-bold text-xs">{sub.name}</td>
                                                <td className="data-value">{avg.toFixed(1)}</td>
                                                <td>
                                                    <div className={`w-2 h-2 rounded-full ${avg >= 75 ? 'bg-success' : 'bg-red-500'}`} title={avg >= 75 ? 'Tuntas' : 'Remedi'}></div>
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className="card !p-0">
                        <div className="p-5 font-bold border-b border-border flex justify-between items-center text-xs">
                            Presensi Terakhir
                            <Activity size={14} className="text-text-secondary" />
                        </div>
                        <table className="data-table">
                            <tbody>
                                {studentAttendance.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5).map(a => (
                                    <tr key={a.id}>
                                        <td className="font-mono text-[10px]">{a.date}</td>
                                        <td>
                                            <span className={`text-[9px] font-bold px-2 py-0.5 rounded ${a.status === 'hadir' ? 'text-success bg-success/10' :
                                                a.status === 'izin' ? 'text-blue-600 bg-blue-50' :
                                                    a.status === 'sakit' ? 'text-yellow-600 bg-yellow-50' :
                                                        'text-red-600 bg-red-50'
                                                }`}>
                                                {a.status[0].toUpperCase()}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* --- HIDDEN PRINT VIEW: KWITANSI KEUANGAN --- */}
            <div className="hidden print:block w-full text-black">
                <div className="text-center border-b-2 border-black pb-4 mb-6 relative">
                    <h1 className="text-2xl font-black uppercase tracking-widest">{settings?.schoolName || 'Kwitansi Rekap Keuangan'}</h1>
                    <p className="text-sm">{settings?.schoolAddress || ''}</p>
                    <div className="mt-4 pt-4 border-t border-black border-dashed">
                        <h2 className="text-xl font-bold uppercase tracking-wider">KWITANSI KEUANGAN SISWA</h2>
                        <p className="text-sm font-bold mt-1">Siswa: {student.name} | Kelas: {studentClass?.name} | NIS: {student.nis || '-'}</p>
                        <p className="text-xs mt-1">Dicetak pada: {new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-8 mb-8 text-sm">
                    {/* TABUNGAN & PEMBAYARAN */}
                    <div className="space-y-4">
                        <div className="border border-black p-4 rounded">
                            <h3 className="font-bold border-b border-black pb-2 mb-2 uppercase tracking-wider">Tabungan</h3>
                            <div className="flex justify-between">
                                <span>Saldo Akhir</span>
                                <span className="font-bold">{formatCurrency(balanceSavings)}</span>
                            </div>
                        </div>

                        <div className="border border-black p-4 rounded">
                            <h3 className="font-bold border-b border-black pb-2 mb-2 uppercase tracking-wider">Pembayaran (SPP/Wajib)</h3>
                            <div className="flex justify-between mb-1">
                                <span>Total Tagihan</span>
                                <span>{formatCurrency(totalWajib)}</span>
                            </div>
                            <div className="flex justify-between mb-1">
                                <span>Total Dibayar</span>
                                <span className="text-green-600">{formatCurrency(studentPayments.reduce((acc, p) => acc + (p.isDeposit ? 0 : p.amountPaid), 0))}</span>
                            </div>
                            <div className="flex justify-between font-bold mt-2 pt-2 border-t border-dashed border-gray-400">
                                <span>Tunggakan / Kurang</span>
                                <span className="text-red-600">{formatCurrency(Math.max(0, arrears))}</span>
                            </div>
                        </div>
                    </div>

                    {/* GEMARI & INFAQ */}
                    <div className="space-y-4">
                        <div className="border border-black p-4 rounded">
                            <h3 className="font-bold border-b border-black pb-2 mb-2 uppercase tracking-wider">Kas Gemari</h3>
                            <p className="text-xs text-gray-500 mb-2 italic">*Estimasi Seharusnya (1 Bulan): {formatCurrency(targetGemari)}</p>
                            <div className="flex justify-between mb-1">
                                <span>Total Dibayar</span>
                                <span className="text-green-600">{formatCurrency(totalGemariPaid)}</span>
                            </div>
                            <div className="flex justify-between font-bold mt-2 pt-2 border-t border-dashed border-gray-400">
                                <span>Kurang</span>
                                <span className="text-red-600">{formatCurrency(kurangGemari)}</span>
                            </div>
                        </div>

                        <div className="border border-black p-4 rounded">
                            <h3 className="font-bold border-b border-black pb-2 mb-2 uppercase tracking-wider">Infaq</h3>
                            <p className="text-xs text-gray-500 mb-2 italic">*Estimasi Seharusnya (1 Bulan): {formatCurrency(targetInfaq)}</p>
                            <div className="flex justify-between mb-1">
                                <span>Total Dibayar</span>
                                <span className="text-green-600">{formatCurrency(totalInfaqPaid)}</span>
                            </div>
                            <div className="flex justify-between font-bold mt-2 pt-2 border-t border-dashed border-gray-400">
                                <span>Kurang</span>
                                <span className="text-red-600">{formatCurrency(kurangInfaq)}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex justify-end mt-12 pr-12 text-sm">
                    <div className="text-center">
                        <p className="mb-16">Petugas / Administrasi</p>
                        <p className="font-bold border-b border-black inline-block px-4">( ________________________ )</p>
                    </div>
                </div>
            </div>
        </div>
    );
}

function InfoRow({ label, value }: { label: string, value: string }) {
    return (
        <div className="flex justify-between items-baseline gap-4 py-1 border-b border-border border-dashed last:border-0">
            <span className="text-xs text-text-secondary">{label}</span>
            <span className="text-xs font-bold text-right">{value}</span>
        </div>
    );
}

function PaymentsView({
    students,
    classes,
    feeItems,
    payments,
    classCash,
    holidays,
    schoolDeposits,
    onRefresh,
    onOpenPrint,
    onSort,
    currentSort,
    sortedData,
    SortableTH,
    initialStudentId,
    onCloseDetail
}: {
    students: Student[],
    classes: Class[],
    feeItems: FeeItem[],
    payments: StudentPayment[],
    classCash: ClassCashTransaction[],
    holidays: Holiday[],
    schoolDeposits: SchoolDeposit[],
    onRefresh: () => void,
    onOpenPrint: () => void,
    onSort: (k: string) => void,
    currentSort: any,
    sortedData: any,
    SortableTH: any,
    initialStudentId?: string | null,
    onCloseDetail?: () => void
}) {
    const [activeTab, setActiveTab] = useState<'history' | 'setup' | 'recap' | 'deposits'>('history');
    const [showAddPayment, setShowAddPayment] = useState(false);
    const [showAddItem, setShowAddItem] = useState(false);
    const [showAddDeposit, setShowAddDeposit] = useState(false);
    const [selectedClassId, setSelectedClassId] = useState('');
    const [detailStudentId, setDetailStudentId] = useState<string | null>(initialStudentId || null);
    const [editingPayment, setEditingPayment] = useState<StudentPayment | null>(null);
    const [extraBills, setExtraBills] = useState<Student['paymentExtraBills']>([]);
    const [savingExtraBills, setSavingExtraBills] = useState(false);
    const [hideAdditionalBills, setHideAdditionalBills] = useState(false);

    const [newSchoolDeposit, setNewSchoolDeposit] = useState({
        classId: '',
        feeItemId: '',
        amount: 0,
        depositDate: new Date().toISOString().split('T')[0],
        notes: ''
    });

    const [newPayment, setNewPayment] = useState({
        studentId: initialStudentId || '',
        amountPaid: 0,
        paymentDate: new Date().toISOString().split('T')[0],
        paymentMethod: 'cash' as 'cash' | 'transfer' | 'bank',
        notes: '',
        isDeposit: false
    });
    const [paymentItemAmounts, setPaymentItemAmounts] = useState<Record<string, number>>({});

    const [newItem, setNewItem] = useState({
        name: '',
        amount: 0,
        category: 'wajib' as 'wajib' | 'sukarela' | 'lainnya',
        academicYear: '2025/2026'
    });

    useEffect(() => {
        if (initialStudentId) {
            setDetailStudentId(initialStudentId);
            setNewPayment(prev => ({ ...prev, studentId: initialStudentId }));
        }
    }, [initialStudentId]);

    const handleAddPayment = async () => {
        if (!newPayment.studentId) return alert('Pilih siswa terlebih dahulu');

        const entries = feeItems
            .map(item => ({
                studentId: newPayment.studentId,
                feeItemId: item.id,
                amountPaid: Number(paymentItemAmounts[item.id] || 0),
                paymentDate: newPayment.paymentDate,
                paymentMethod: newPayment.paymentMethod,
                notes: newPayment.notes,
                isDeposit: false
            }))
            .filter(entry => entry.amountPaid > 0);

        if (entries.length === 0) return alert('Isi minimal satu nominal pembayaran di atas 0');

        for (const entry of entries) {
            await addDoc(collection(db, 'studentPayments'), entry);
        }

        setShowAddPayment(false);
        setNewPayment({
            studentId: '',
            amountPaid: 0,
            paymentDate: new Date().toISOString().split('T')[0],
            paymentMethod: 'cash',
            notes: '',
            isDeposit: false
        });
        setPaymentItemAmounts({});
        onRefresh();
    };

    const openAddPaymentModal = (studentId: string = '') => {
        const defaultAmounts = feeItems.reduce((acc, item) => {
            acc[item.id] = item.amount;
            return acc;
        }, {} as Record<string, number>);

        setPaymentItemAmounts(defaultAmounts);
        setNewPayment(prev => ({
            ...prev,
            studentId,
            paymentDate: new Date().toISOString().split('T')[0],
            paymentMethod: 'cash',
            notes: ''
        }));
        setShowAddPayment(true);
    };

    const handleUpdatePayment = async () => {
        if (!editingPayment) return;
        if (!Number.isFinite(editingPayment.amountPaid) || editingPayment.amountPaid <= 0) return alert('Nominal pembayaran harus lebih dari 0');
        if (!editingPayment.paymentDate) return alert('Tanggal pembayaran wajib diisi');
        const { id, ...payload } = editingPayment as any;
        await updateDoc(doc(db, 'studentPayments', id), payload);
        setEditingPayment(null);
        onRefresh();
    };

    const handleDeletePayment = async (payment: StudentPayment) => {
        const s = students.find(st => st.id === payment.studentId);
        const item = feeItems.find(i => i.id === payment.feeItemId);
        const label = payment.isDeposit ? 'Titipan / Deposit' : (item?.name || 'Item');
        const ok = window.confirm(`Hapus pembayaran ini?\n\nSiswa: ${s?.name || '-'}\nItem: ${label}\nNominal: ${formatCurrency(payment.amountPaid)}\nTanggal: ${payment.paymentDate}`);
        if (!ok) return;
        await deleteDoc(doc(db, 'studentPayments', payment.id));
        if (editingPayment?.id === payment.id) setEditingPayment(null);
        onRefresh();
    };

    const handleAddItem = async () => {
        if (!newItem.name.trim()) return alert('Nama item wajib diisi');
        if (!newItem.amount || newItem.amount <= 0) return alert('Nominal item harus lebih dari 0');
        await addDoc(collection(db, 'feeItems'), {
            ...newItem,
            name: newItem.name.trim()
        });
        setShowAddItem(false);
        setNewItem({
            name: '',
            amount: 0,
            category: 'wajib',
            academicYear: '2025/2026'
        });
        onRefresh();
    };

    const handleAddDeposit = async () => {
        await addDoc(collection(db, 'schoolDeposits'), newSchoolDeposit);
        setShowAddDeposit(false);
        setNewSchoolDeposit({
            classId: '',
            feeItemId: '',
            amount: 0,
            depositDate: new Date().toISOString().split('T')[0],
            notes: ''
        });
        onRefresh();
    };

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(amount);
    };

    const getCurrentMonthStr = () => {
        const d = new Date();
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        return `${y}-${m}`;
    };

    const countTargetDays = (type: 'gemari' | 'infaq', monthStr: string) => {
        const year = parseInt(monthStr.split('-')[0]);
        const month = parseInt(monthStr.split('-')[1]) - 1;
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        let targetDays = 0;

        for (let day = 1; day <= daysInMonth; day++) {
            const d = new Date(year, month, day);
            const dateStr = [d.getFullYear(), ('0' + (d.getMonth() + 1)).slice(-2), ('0' + d.getDate()).slice(-2)].join('-');
            const isHoliday = holidays.some(h => h.date === dateStr);
            const dayOfWeek = d.getDay();
            if (type === 'gemari') {
                if (dayOfWeek !== 0 && !isHoliday) targetDays++;
            } else {
                if (dayOfWeek === 5 && !isHoliday) targetDays++;
            }
        }
        return targetDays;
    };

    const getCashNominal = (type: 'gemari' | 'infaq') => type === 'gemari' ? 500 : 1000;

    useEffect(() => {
        if (!detailStudentId) return;
        const st = students.find(s => s.id === detailStudentId);
        setExtraBills((st?.paymentExtraBills || []).map(b => ({ ...b })));
        setHideAdditionalBills(false);
    }, [detailStudentId, students]);

    const addExtraBill = () => {
        const id = (globalThis.crypto && 'randomUUID' in globalThis.crypto)
            ? (globalThis.crypto as any).randomUUID()
            : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
        setExtraBills(prev => ([...(prev || []), { id, label: 'Tagihan Lain-lain', amount: 0 }]));
    };

    const updateExtraBill = (id: string, patch: Partial<NonNullable<Student['paymentExtraBills']>[number]>) => {
        setExtraBills(prev => (prev || []).map(b => b.id === id ? ({ ...b, ...patch }) : b));
    };

    const removeExtraBill = (id: string) => {
        setExtraBills(prev => (prev || []).filter(b => b.id !== id));
    };

    const saveExtraBills = async () => {
        if (!detailStudentId) return;
        setSavingExtraBills(true);
        try {
            const cleaned = (extraBills || [])
                .map(b => ({ ...b, label: (b.label || '').trim(), amount: Number(b.amount) || 0 }))
                .filter(b => b.label && b.amount >= 0);
            await updateDoc(doc(db, 'students', detailStudentId), { paymentExtraBills: cleaned });
            onRefresh();
        } finally {
            setSavingExtraBills(false);
        }
    };

    const filteredStudents = selectedClassId ? students.filter(s => s.classId === selectedClassId) : students;
    const totalRequired = feeItems.reduce((acc, item) => acc + (item.category === 'wajib' ? item.amount * students.length : 0), 0);
    const totalCollected = payments.reduce((acc, p) => acc + p.amountPaid, 0);

    const detailStudent = detailStudentId ? students.find(s => s.id === detailStudentId) : null;
    const detailClass = detailStudent ? classes.find(c => c.id === detailStudent.classId) : null;
    const detailPayments = detailStudentId ? payments.filter(p => p.studentId === detailStudentId) : [];
    const detailPaidAmount = detailPayments.reduce((acc, p) => acc + p.amountPaid, 0);
    const detailRequiredAmount = feeItems.filter(i => i.category === 'wajib').reduce((acc, i) => acc + i.amount, 0);
    const detailBalance = detailPaidAmount - detailRequiredAmount;
    const isDetailLunas = !!detailStudentId && detailBalance >= 0;

    return (
        <div className="space-y-6 print-container relative">
            <div className="print-header">
                <h1 className="text-2xl font-black uppercase tracking-tighter">LAPORAN PEMBAYARAN SISWA</h1>
                <p className="text-xs font-bold text-slate-500">Periode: {new Date().getFullYear()}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 no-print">
                <div className="card space-y-1">
                    <p className="stat-label">Total Kewajiban (Wajib)</p>
                    <p className="stat-value">{formatCurrency(totalRequired)}</p>
                </div>
                <div className="card space-y-1">
                    <p className="stat-label">Total Terkumpul</p>
                    <p className="stat-value text-accent">{formatCurrency(totalCollected)}</p>
                </div>
                <div className="card space-y-1">
                    <p className="stat-label">Tunggakan Estimasi</p>
                    <p className="stat-value text-red-500">{formatCurrency(Math.max(0, totalRequired - totalCollected))}</p>
                </div>
            </div>

            <div className="flex border-b border-border gap-8 pb-3 no-print items-center justify-between">
                <div className="flex gap-4 lg:gap-8 overflow-x-auto scrollbar-hide">
                    <button
                        onClick={() => setActiveTab('history')}
                        className={`text-[10px] lg:text-sm font-bold uppercase tracking-widest pb-1 transition-all whitespace-nowrap ${activeTab === 'history' ? 'text-accent border-b-2 border-accent' : 'opacity-30 hover:opacity-100'}`}
                    >
                        Riwayat
                    </button>
                    <button
                        onClick={() => setActiveTab('recap')}
                        className={`text-[10px] lg:text-sm font-bold uppercase tracking-widest pb-1 transition-all whitespace-nowrap ${activeTab === 'recap' ? 'text-accent border-b-2 border-accent' : 'opacity-30 hover:opacity-100'}`}
                    >
                        Rekap Siswa
                    </button>
                    <button
                        onClick={() => setActiveTab('setup')}
                        className={`text-[10px] lg:text-sm font-bold uppercase tracking-widest pb-1 transition-all whitespace-nowrap ${activeTab === 'setup' ? 'text-accent border-b-2 border-accent' : 'opacity-30 hover:opacity-100'}`}
                    >
                        Pengaturan Biaya
                    </button>
                    <button
                        onClick={() => setActiveTab('deposits')}
                        className={`text-[10px] lg:text-sm font-bold uppercase tracking-widest pb-1 transition-all whitespace-nowrap ${activeTab === 'deposits' ? 'text-accent border-b-2 border-accent' : 'opacity-30 hover:opacity-100'}`}
                    >
                        Setoran Sekolah
                    </button>
                </div>
                <div className="flex gap-2">
                    <button onClick={onOpenPrint} className="p-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-700 hidden sm:block">
                        <Printer size={18} />
                    </button>
                    <button onClick={() => openAddPaymentModal()} className="btn-primary flex items-center gap-2">
                        <Plus size={16} /> <span className="hidden sm:inline">Input Bayar</span>
                    </button>
                </div>
            </div>

            {activeTab === 'history' && (
                <div className="table-container shadow-sm">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <SortableTH label="TANGGAL" sortKey="paymentDate" currentSort={currentSort} onSort={onSort} />
                                <SortableTH label="SISWA" sortKey="name" currentSort={currentSort} onSort={onSort} />
                                <SortableTH label="ITEM / KETERANGAN" sortKey="feeItemId" currentSort={currentSort} onSort={onSort} />
                                <SortableTH label="NOMINAL" sortKey="amountPaid" currentSort={currentSort} onSort={onSort} />
                                <SortableTH label="METODE" sortKey="paymentMethod" currentSort={currentSort} onSort={onSort} />
                                <th className="no-print">AKSI</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sortedData(payments).map((p: any) => {
                                const s = students.find(st => st.id === p.studentId);
                                const item = feeItems.find(i => i.id === p.feeItemId);
                                return (
                                    <tr key={p.id} className="hover:bg-slate-50 transition-all">
                                        <td className="font-mono text-xs">{p.paymentDate}</td>
                                        <td>
                                            <button
                                                onClick={() => setDetailStudentId(p.studentId)}
                                                className="text-left group"
                                            >
                                                <div className="font-bold group-hover:text-accent transition-all leading-tight">{s?.name}</div>
                                                <div className="text-[9px] text-text-secondary uppercase font-bold tracking-tighter">KLAS: {classes.find(c => c.id === s?.classId)?.name}</div>
                                            </button>
                                        </td>
                                        <td>
                                            <div className="text-xs font-black text-slate-500">{p.isDeposit ? 'Titipan / Deposit' : item?.name}</div>
                                            {p.notes && <div className="text-[9px] text-text-secondary italic truncate max-w-[120px]">{p.notes}</div>}
                                        </td>
                                        <td className="font-black text-accent text-sm">{formatCurrency(p.amountPaid)}</td>
                                        <td><span className="status-pill !bg-slate-100 !text-slate-600 uppercase text-[8px] font-bold">{p.paymentMethod}</span></td>
                                        <td className="no-print">
                                            <div className="flex gap-1">
                                                <button
                                                    onClick={() => setEditingPayment(p)}
                                                    className="p-1.5 hover:bg-accent/10 text-accent rounded transition-all"
                                                >
                                                    <Edit size={12} />
                                                </button>
                                                <button
                                                    onClick={() => handleDeletePayment(p)}
                                                    className="p-1.5 hover:bg-red-500/10 text-red-600 rounded transition-all"
                                                    title="Hapus pembayaran"
                                                >
                                                    <Trash2 size={12} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                            {payments.length === 0 && (
                                <tr><td colSpan={6} className="text-center py-24 opacity-30 italic font-mono text-xs uppercase tracking-widest">No_Payment_Records_Found</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {activeTab === 'recap' && (
                <div className="space-y-4">
                    <div className="flex flex-col sm:flex-row gap-4 no-print sm:items-center justify-between">
                        <label className="stat-label" htmlFor="recap-class-select">Pilih Kelas</label>
                        <select
                            id="recap-class-select"
                            className="bg-bg border border-border px-3 py-1.5 rounded-lg text-xs outline-none focus:border-accent"
                            value={selectedClassId}
                            onChange={(e) => setSelectedClassId(e.target.value)}
                            title="Filter Berdasarkan Kelas"
                        >
                            <option value="">Semua Kelas</option>
                            {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                        <p className="text-[10px] font-bold text-text-secondary uppercase">Klik nama siswa untuk rincian & koreksi</p>
                    </div>
                    <div className="card !p-0 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>SISWA</th>
                                        <th>TOTAL WAJIB</th>
                                        <th>TOTAL BAYAR</th>
                                        <th>STATUS</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredStudents.map(s => {
                                        const studentPayments = payments.filter(p => p.studentId === s.id);
                                        const paid = studentPayments.reduce((acc, p) => acc + p.amountPaid, 0);
                                        const totalDue = feeItems.reduce((acc, i) => acc + (i.category === 'wajib' ? i.amount : 0), 0);
                                        const balance = paid - totalDue;

                                        return (
                                            <tr key={s.id}>
                                                <td>
                                                    <button
                                                        onClick={() => setDetailStudentId(s.id)}
                                                        className="text-left hover:text-accent font-bold transition-all"
                                                    >
                                                        {s.name}
                                                    </button>
                                                </td>
                                                <td className="text-xs font-mono">{formatCurrency(totalDue)}</td>
                                                <td className="text-xs font-mono font-bold text-accent">{formatCurrency(paid)}</td>
                                                <td>
                                                    {balance >= 0 ? (
                                                        <span className="status-pill">LUNAS</span>
                                                    ) : (
                                                        <span className="status-pill !bg-red-50 !text-red-600" title={`Kurang: ${formatCurrency(Math.abs(balance))}`}>MENUNGGAK</span>
                                                    )}
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'setup' && (
                <div className="space-y-4">
                    <div className="flex justify-between items-center">
                        <h3 className="stat-label">Biaya Sekolah Tahun 2025/2026</h3>
                        <button onClick={() => setShowAddItem(true)} className="btn-small">Tambah Item</button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                        {feeItems.map(item => (
                            <div key={item.id} className="card group hover:border-accent transition-all">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <h4 className="font-bold">{item.name}</h4>
                                        <p className="text-[10px] text-text-secondary uppercase tracking-widest">{item.category}</p>
                                    </div>
                                    <button className="text-text-secondary hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all">
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                                <div className="mt-4 flex justify-between items-end">
                                    <div className="text-2xl font-black text-accent">{formatCurrency(item.amount)}</div>
                                    <div className="text-[10px] font-bold text-text-secondary">{item.academicYear}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {activeTab === 'deposits' && (
                <div className="space-y-6">
                    <div className="flex justify-between items-center">
                        <div>
                            <h3 className="stat-label">Setoran Kolektif ke Sekolah</h3>
                            <p className="text-xs text-text-secondary italic">Monitoring dana terkumpul di kelas vs dana disetor ke sekolah</p>
                        </div>
                        <button onClick={() => setShowAddDeposit(true)} className="btn-primary flex items-center gap-2">
                            <Plus size={16} /> Catat Setoran
                        </button>
                    </div>

                    <div className="card !p-0 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>ITEM BIAYA</th>
                                        <th>TOTAL TERKUMPUL (DARI SISWA)</th>
                                        <th>TOTAL DISETOR (KE SEKOLAH)</th>
                                        <th>SISA DI KELAS</th>
                                        <th>AKSI</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {feeItems.map(item => {
                                        const collected = payments
                                            .filter(p => p.feeItemId === item.id)
                                            .reduce((acc, p) => acc + p.amountPaid, 0);
                                        const deposited = schoolDeposits
                                            .filter(d => d.feeItemId === item.id)
                                            .reduce((acc, d) => acc + d.amount, 0);
                                        const bal = collected - deposited;

                                        return (
                                            <tr key={item.id}>
                                                <td>
                                                    <div className="font-bold">{item.name}</div>
                                                    <div className="text-[10px] text-text-secondary uppercase">{item.category}</div>
                                                </td>
                                                <td className="font-mono text-xs text-accent font-bold">{formatCurrency(collected)}</td>
                                                <td className="font-mono text-xs text-success font-bold">{formatCurrency(deposited)}</td>
                                                <td className={`font-mono text-xs font-black ${bal > 0 ? 'text-orange-600' : 'text-slate-400'}`}>
                                                    {formatCurrency(bal)}
                                                </td>
                                                <td>
                                                    <button
                                                        className="text-[10px] font-bold text-accent hover:underline uppercase"
                                                        onClick={() => {
                                                            setNewSchoolDeposit(prev => ({ ...prev, feeItemId: item.id, amount: bal }));
                                                            setShowAddDeposit(true);
                                                        }}
                                                    >
                                                        Setorkan
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className="space-y-4 pt-6">
                        <h4 className="text-xs font-bold text-text-secondary uppercase tracking-widest pl-1">Riwayat Setoran Terbaru</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {schoolDeposits.sort((a, b) => b.depositDate.localeCompare(a.depositDate)).map(sd => (
                                <div key={sd.id} className="p-4 bg-white border border-border rounded-xl flex justify-between items-center shadow-sm">
                                    <div>
                                        <p className="text-sm font-bold">{feeItems.find(i => i.id === sd.feeItemId)?.name}</p>
                                        <p className="text-[10px] font-mono text-text-secondary italic">{sd.depositDate} • {classes.find(c => c.id === sd.classId)?.name || 'Kolektif'}</p>
                                        {sd.notes && <p className="text-[9px] text-slate-500 mt-1">Note: {sd.notes}</p>}
                                    </div>
                                    <div className="text-right">
                                        <p className="font-black text-success">{formatCurrency(sd.amount)}</p>
                                        <span className="status-pill !bg-success/10 !text-success">TERSETOR</span>
                                    </div>
                                </div>
                            ))}
                            {schoolDeposits.length === 0 && (
                                <div className="col-span-2 py-10 text-center opacity-30 italic text-sm">Belum ada riwayat setoran</div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Student Detail Side Overlay */}
            <AnimatePresence>
                {detailStudentId && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => { setDetailStudentId(null); onCloseDetail?.(); }}
                            className="fixed inset-0 bg-slate-900/40 z-[60] backdrop-blur-sm"
                        />
                        <motion.div
                            initial={{ x: '100%' }}
                            animate={{ x: 0 }}
                            exit={{ x: '100%' }}
                            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                            className="fixed top-0 right-0 h-full w-full max-w-xl bg-bg z-[70] shadow-2xl flex flex-col"
                        >
                            <div className="p-6 border-b border-border bg-white flex justify-between items-center">
                                <div className="flex items-center gap-3">
                                    <img
                                        src={sdn3PurwosariLogo}
                                        alt="Logo SDN 3 Purwosari"
                                        className="w-10 h-10 object-contain"
                                    />
                                    <div className="w-10 h-10 bg-slate-900 text-yellow-400 rounded-full flex items-center justify-center font-black">
                                        {detailStudent?.name?.charAt(0)}
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-lg">{detailStudent?.name}</h3>
                                        <p className="text-[10px] font-bold text-text-secondary uppercase">Rekapitulasi Pembayaran Personal</p>
                                        <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1 text-[10px] font-bold text-slate-500">
                                            <span>Kelas: {detailClass?.name || '-'}</span>
                                            <span>Wali: {detailClass?.homeroomTeacher || detailClass?.teacher || '-'}</span>
                                        </div>
                                    </div>
                                </div>
                                <button
                                    onClick={() => { setDetailStudentId(null); onCloseDetail?.(); }}
                                    className="p-2 hover:bg-slate-100 rounded-lg"
                                >
                                    <X size={20} />
                                </button>
                            </div>

                            <div className="flex-1 overflow-y-auto p-6">
                                <div className="relative">
                                    {isDetailLunas && (
                                        <div className="pointer-events-none absolute inset-0 flex items-center justify-center select-none">
                                            <div className="text-[72px] font-black tracking-[0.25em] text-emerald-600/10 rotate-[-20deg]">
                                                LUNAS
                                            </div>
                                        </div>
                                    )}

                                    <div className="relative z-10 space-y-8">
                                        {/* Summary Section */}
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="p-4 bg-white rounded-2xl border border-border">
                                                <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Total Terbayar</p>
                                                <p className="text-xl font-black text-accent">
                                                    {formatCurrency(detailPaidAmount)}
                                                </p>
                                            </div>
                                            <div className="p-4 bg-white rounded-2xl border border-border">
                                                <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Status Tunggakan</p>
                                                <p className={`text-xl font-black ${isDetailLunas ? 'text-success' : 'text-red-500'}`}>
                                                    {isDetailLunas ? 'LUNAS' : formatCurrency(Math.abs(detailBalance))}
                                                </p>
                                            </div>
                                        </div>

                                        {/* Tagihan Tambahan */}
                                        {(() => {
                                            const st = detailStudent;
                                            if (!st) return null;

                                            const monthStr = getCurrentMonthStr();
                                            const [yy, mm] = monthStr.split('-').map(Number);
                                            const monthLabel = new Date(yy, (mm || 1) - 1, 1).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });

                                            const classId = String((st as any)?.classId || '');
                                            const calc = (type: 'gemari' | 'infaq') => {
                                                const nominal = getCashNominal(type);
                                                const targetDays = countTargetDays(type, monthStr);
                                                const target = targetDays * nominal;

                                                const monthTx = classCash.filter(t => t.type === type && String((t as any)?.classId || '') === classId && (t.date || '').startsWith(monthStr));
                                                const bebasDates = new Set(monthTx.filter(t => t.amount === 0).map(t => t.date));
                                                const targetReal = Math.max(0, target - (bebasDates.size * nominal));

                                                const paid = monthTx
                                                    .filter(t => String((t as any)?.studentId || '') === String(detailStudentId))
                                                    .filter(t => (t as any).transactionType ? (t as any).transactionType === 'deposit' : true)
                                                    .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

                                                const kurang = Math.max(0, targetReal - paid);
                                                return { nominal, targetDays, bebasDays: bebasDates.size, targetReal, paid, kurang };
                                            };

                                            const gemari = calc('gemari');
                                            const infaq = calc('infaq');
                                            const otherTotal = (extraBills || []).reduce((sum, b) => sum + (Number(b.amount) || 0), 0);
                                            const totalAdditional = gemari.kurang + infaq.kurang + otherTotal;

                                            return (
                                                <div className="space-y-4">
                                                    <div className="flex items-end justify-between gap-4">
                                                        <div>
                                                            <h4 className="text-xs font-bold text-text-secondary uppercase tracking-widest pl-1">Tagihan Tambahan</h4>
                                                            <p className="text-[10px] text-slate-400 italic pl-1">Sinkron dengan tagihan Kas & Infaq ({monthLabel})</p>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <button
                                                                onClick={() => setHideAdditionalBills(v => !v)}
                                                                className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-600"
                                                                aria-label={hideAdditionalBills ? 'Tampilkan tagihan tambahan' : 'Sembunyikan tagihan tambahan'}
                                                                title={hideAdditionalBills ? 'Tampilkan' : 'Sembunyikan'}
                                                            >
                                                                {hideAdditionalBills ? 'Show' : 'Hide'}
                                                            </button>
                                                            <button onClick={addExtraBill} className="btn-small" disabled={hideAdditionalBills}>+ Lain-lain</button>
                                                        </div>
                                                    </div>

                                                    {hideAdditionalBills ? (
                                                        <div className="p-4 bg-white rounded-2xl border border-border flex items-center justify-between">
                                                            <div className="text-xs font-black text-slate-600 uppercase tracking-widest">Tagihan Tambahan (disembunyikan)</div>
                                                            <div className="text-right">
                                                                <div className="text-sm font-black text-red-500">{formatCurrency(totalAdditional)}</div>
                                                                <div className="text-[10px] text-slate-400">Klik Show untuk detail</div>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="p-4 bg-white rounded-2xl border border-border space-y-3">
                                                            <div className="flex justify-between items-center">
                                                                <div>
                                                                    <div className="text-xs font-black text-slate-600 uppercase tracking-widest">Kekurangan Gemari</div>
                                                                    <div className="text-[10px] text-slate-400">Target: {gemari.targetDays} hari × {formatCurrency(gemari.nominal)} {gemari.bebasDays ? `(- bebas setor ${gemari.bebasDays} hari)` : ''}</div>
                                                                </div>
                                                                <div className="text-right">
                                                                    <div className="text-xs font-black text-red-500">{formatCurrency(gemari.kurang)}</div>
                                                                    <div className="text-[10px] text-slate-400">Setor: {formatCurrency(gemari.paid)}</div>
                                                                </div>
                                                            </div>
                                                            <div className="flex justify-between items-center">
                                                                <div>
                                                                    <div className="text-xs font-black text-slate-600 uppercase tracking-widest">Kekurangan Infaq Jumat</div>
                                                                    <div className="text-[10px] text-slate-400">Target: {infaq.targetDays} Jumat × {formatCurrency(infaq.nominal)} {infaq.bebasDays ? `(- bebas setor ${infaq.bebasDays} Jumat)` : ''}</div>
                                                                </div>
                                                                <div className="text-right">
                                                                    <div className="text-xs font-black text-red-500">{formatCurrency(infaq.kurang)}</div>
                                                                    <div className="text-[10px] text-slate-400">Setor: {formatCurrency(infaq.paid)}</div>
                                                                </div>
                                                            </div>

                                                            {(extraBills || []).length > 0 && (
                                                                <div className="pt-2 border-t border-border space-y-2">
                                                                    {(extraBills || []).map(b => (
                                                                        <div key={b.id} className="flex gap-2 items-center">
                                                                            <input
                                                                                className="flex-1 bg-slate-50 border border-border rounded-lg px-3 py-2 text-xs font-bold outline-none focus:border-accent"
                                                                                value={b.label}
                                                                                onChange={(e) => updateExtraBill(b.id, { label: e.target.value })}
                                                                                placeholder="Nama tagihan lain-lain"
                                                                            />
                                                                            <input
                                                                                type="number"
                                                                                className="w-32 bg-slate-50 border border-border rounded-lg px-3 py-2 text-xs font-bold outline-none focus:border-accent text-right"
                                                                                value={Number(b.amount) || 0}
                                                                                onChange={(e) => updateExtraBill(b.id, { amount: Number(e.target.value) || 0 })}
                                                                                min={0}
                                                                            />
                                                                            <button
                                                                                onClick={() => removeExtraBill(b.id)}
                                                                                className="p-2 hover:bg-red-50 text-red-600 rounded-lg"
                                                                                title="Hapus tagihan lain-lain"
                                                                                aria-label="Hapus tagihan lain-lain"
                                                                            >
                                                                                <Trash2 size={16} />
                                                                            </button>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}

                                                            <div className="pt-3 border-t border-border flex items-center justify-between">
                                                                <div className="text-xs font-black text-slate-600 uppercase tracking-widest">Total Tagihan Tambahan</div>
                                                                <div className="text-sm font-black text-red-500">{formatCurrency(totalAdditional)}</div>
                                                            </div>

                                                            <button
                                                                onClick={saveExtraBills}
                                                                disabled={savingExtraBills}
                                                                className="w-full btn-primary py-3 rounded-xl disabled:opacity-50"
                                                            >
                                                                {savingExtraBills ? 'Menyimpan...' : 'Simpan Tagihan Lain-lain'}
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })()}

                                        {/* Detailed History */}
                                        <div className="space-y-4">
                                            <h4 className="text-xs font-bold text-text-secondary uppercase tracking-widest pl-1">Riwayat Transaksi</h4>
                                            <div className="space-y-3">
                                                {detailPayments
                                                    .slice()
                                                    .sort((a, b) => b.paymentDate.localeCompare(a.paymentDate))
                                                    .map(p => (
                                                        <div key={p.id} className="p-4 bg-white rounded-2xl border border-border group hover:border-accent transition-all relative">
                                                            <div className="flex justify-between items-start">
                                                                <div>
                                                                    <p className="text-sm font-bold">{p.isDeposit ? 'Titipan / Deposit' : feeItems.find(i => i.id === p.feeItemId)?.name}</p>
                                                                    <p className="text-[10px] text-slate-400 font-mono italic">{p.paymentDate} • {p.paymentMethod.toUpperCase()}</p>
                                                                </div>
                                                                <div className="text-right">
                                                                    <p className="font-black text-accent">{formatCurrency(p.amountPaid)}</p>
                                                                    <button
                                                                        onClick={() => setEditingPayment(p)}
                                                                        className="text-[10px] font-bold text-text-secondary hover:text-accent underline uppercase mt-1 opacity-0 group-hover:opacity-100 transition-all"
                                                                    >
                                                                        Koreksi
                                                                    </button>
                                                                    <button
                                                                        onClick={() => handleDeletePayment(p)}
                                                                        className="text-[10px] font-bold text-text-secondary hover:text-red-600 underline uppercase mt-1 ml-3 opacity-0 group-hover:opacity-100 transition-all"
                                                                    >
                                                                        Hapus
                                                                    </button>
                                                                </div>
                                                            </div>
                                                            {p.notes && (
                                                                <div className="mt-3 p-2 bg-slate-50 rounded-lg text-[10px] font-medium text-slate-600 border border-slate-100">
                                                                    Note: {p.notes}
                                                                </div>
                                                            )}
                                                        </div>
                                                    ))}
                                                {detailPayments.length === 0 && (
                                                    <div className="text-center py-12 bg-slate-50 rounded-3xl border border-dashed border-border">
                                                        <p className="text-xs text-slate-400 italic">Belum ada catatan pembayaran</p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="p-6 bg-white border-t border-border">
                                <button
                                    onClick={() => {
                                        openAddPaymentModal(detailStudentId || '');
                                    }}
                                    className="w-full btn-primary py-4 rounded-2xl flex items-center justify-center gap-3 font-bold uppercase tracking-widest text-xs"
                                >
                                    <Plus size={16} /> Tambah Pembayaran Baru
                                </button>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>

            {/* Edit Payment Modal */}
            {editingPayment && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl border border-border"
                    >
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold">Koreksi Data Pembayaran</h3>
                            <button onClick={() => setEditingPayment(null)} aria-label="Tutup form koreksi pembayaran"><X size={20} /></button>
                        </div>
                        <div className="space-y-4">
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold uppercase text-text-secondary">Siswa</label>
                                <div className="font-bold p-3 bg-slate-50 rounded-lg">{students.find(s => s.id === editingPayment.studentId)?.name}</div>
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold uppercase text-text-secondary">Nominal Pembayaran</label>
                                <input
                                    type="number"
                                    className="w-full bg-slate-50 border border-border rounded-lg p-3 outline-none focus:border-accent font-bold"
                                    value={editingPayment.amountPaid}
                                    onChange={e => setEditingPayment({ ...editingPayment, amountPaid: Number(e.target.value) || 0 })}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold uppercase text-text-secondary">Tanggal</label>
                                    <input
                                        type="date"
                                        className="w-full bg-slate-50 border border-border rounded-lg p-3 outline-none focus:border-accent"
                                        value={editingPayment.paymentDate}
                                        onChange={e => setEditingPayment({ ...editingPayment, paymentDate: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold uppercase text-text-secondary">Metode</label>
                                    <select
                                        className="w-full bg-slate-50 border border-border rounded-lg p-3 outline-none focus:border-accent"
                                        value={editingPayment.paymentMethod}
                                        onChange={e => setEditingPayment({ ...editingPayment, paymentMethod: e.target.value as any })}
                                    >
                                        <option value="cash">Tunai</option>
                                        <option value="transfer">Transfer</option>
                                        <option value="bank">Bank</option>
                                    </select>
                                </div>
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold uppercase text-text-secondary">Catatan Perubahan</label>
                                <textarea
                                    className="w-full bg-slate-50 border border-border rounded-lg p-3 outline-none focus:border-accent text-sm"
                                    placeholder="Alasan koreksi data..."
                                    value={editingPayment.notes || ''}
                                    onChange={e => setEditingPayment({ ...editingPayment, notes: e.target.value })}
                                />
                            </div>
                            <div className="flex gap-3 pt-4">
                                <button
                                    onClick={() => handleDeletePayment(editingPayment)}
                                    className="px-5 py-3 border border-red-200 text-red-700 rounded-xl font-bold hover:bg-red-50"
                                >
                                    Hapus
                                </button>
                                <button onClick={() => setEditingPayment(null)} className="flex-1 px-6 py-3 border border-border rounded-xl font-bold">Batal</button>
                                <button onClick={handleUpdatePayment} className="flex-1 btn-primary py-3 rounded-xl">Simpan Koreksi</button>
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}

            {/* Other Modals ... (Simplified for this version) */}
            {showAddPayment && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl border border-border">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold">Input Pembayaran Baru</h3>
                            <button onClick={() => setShowAddPayment(false)} aria-label="Tutup form pembayaran"><X size={20} /></button>
                        </div>
                        <div className="space-y-4">
                            {!newPayment.studentId && (
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold uppercase text-text-secondary">Pilih Siswa</label>
                                    <select
                                        className="w-full bg-slate-50 border border-border rounded-lg p-3 outline-none focus:border-accent"
                                        value={newPayment.studentId}
                                        onChange={e => setNewPayment({ ...newPayment, studentId: e.target.value })}
                                    >
                                        <option value="">Pilih Siswa</option>
                                        {sortStudentsForSelect(students).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                    </select>
                                </div>
                            )}
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold uppercase text-text-secondary">Tanggal Bayar</label>
                                <input
                                    type="date"
                                    className="w-full bg-slate-50 border border-border rounded-lg p-3 outline-none focus:border-accent"
                                    value={newPayment.paymentDate}
                                    onChange={e => setNewPayment({ ...newPayment, paymentDate: e.target.value })}
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold uppercase text-text-secondary">Metode Pembayaran</label>
                                <select
                                    className="w-full bg-slate-50 border border-border rounded-lg p-3 outline-none focus:border-accent"
                                    value={newPayment.paymentMethod}
                                    onChange={e => setNewPayment({ ...newPayment, paymentMethod: e.target.value as 'cash' | 'transfer' | 'bank' })}
                                >
                                    <option value="cash">Tunai</option>
                                    <option value="transfer">Transfer</option>
                                    <option value="bank">Bank</option>
                                </select>
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold uppercase text-text-secondary">Nominal per Item (Bisa Diedit)</label>
                                <div className="max-h-64 overflow-y-auto border border-border rounded-xl divide-y divide-border">
                                    {feeItems.map(item => (
                                        <div key={item.id} className="p-3 flex items-center justify-between gap-3">
                                            <div>
                                                <p className="text-sm font-bold leading-tight">{item.name}</p>
                                                <p className="text-[10px] uppercase text-text-secondary font-bold tracking-wider">{item.category}</p>
                                            </div>
                                            <input
                                                type="number"
                                                className="w-36 bg-slate-50 border border-border rounded-lg p-2 outline-none font-bold text-accent text-right"
                                                value={paymentItemAmounts[item.id] ?? item.amount}
                                                onChange={e => setPaymentItemAmounts(prev => ({
                                                    ...prev,
                                                    [item.id]: parseInt(e.target.value) || 0
                                                }))}
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold uppercase text-text-secondary">Catatan</label>
                                <textarea
                                    className="w-full bg-slate-50 border border-border rounded-lg p-3 outline-none focus:border-accent text-sm"
                                    value={newPayment.notes}
                                    onChange={e => setNewPayment({ ...newPayment, notes: e.target.value })}
                                    placeholder="Opsional, akan disimpan pada semua item pembayaran."
                                />
                            </div>
                            <button onClick={handleAddPayment} className="w-full btn-primary py-4 rounded-xl mt-4 font-bold">Simpan Transaksi</button>
                        </div>
                    </div>
                </div>
            )}

            {showAddItem && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl border border-border">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold">Tambah Item Biaya</h3>
                            <button onClick={() => setShowAddItem(false)} aria-label="Tutup form item biaya"><X size={20} /></button>
                        </div>
                        <div className="space-y-4">
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold uppercase text-text-secondary">Nama Item</label>
                                <input
                                    type="text"
                                    className="w-full bg-slate-50 border border-border rounded-lg p-3 outline-none focus:border-accent"
                                    placeholder="Contoh: SPP Bulanan"
                                    value={newItem.name}
                                    onChange={e => setNewItem({ ...newItem, name: e.target.value })}
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold uppercase text-text-secondary">Nominal (Rp)</label>
                                <input
                                    type="number"
                                    className="w-full bg-slate-50 border border-border rounded-lg p-3 outline-none focus:border-accent font-bold"
                                    value={newItem.amount}
                                    onChange={e => setNewItem({ ...newItem, amount: parseInt(e.target.value) || 0 })}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold uppercase text-text-secondary">Kategori</label>
                                    <select
                                        className="w-full bg-slate-50 border border-border rounded-lg p-3 outline-none focus:border-accent"
                                        value={newItem.category}
                                        onChange={e => setNewItem({ ...newItem, category: e.target.value as 'wajib' | 'sukarela' | 'lainnya' })}
                                    >
                                        <option value="wajib">Wajib</option>
                                        <option value="sukarela">Sukarela</option>
                                        <option value="lainnya">Lainnya</option>
                                    </select>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold uppercase text-text-secondary">Tahun Ajaran</label>
                                    <input
                                        type="text"
                                        className="w-full bg-slate-50 border border-border rounded-lg p-3 outline-none focus:border-accent font-mono"
                                        placeholder="2025/2026"
                                        value={newItem.academicYear}
                                        onChange={e => setNewItem({ ...newItem, academicYear: e.target.value })}
                                    />
                                </div>
                            </div>
                            <button onClick={handleAddItem} className="w-full btn-primary py-4 rounded-xl mt-4 font-bold">
                                Simpan Item
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showAddDeposit && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl border border-border">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold">Catat Setoran ke Sekolah</h3>
                            <button onClick={() => setShowAddDeposit(false)} aria-label="Tutup form setoran"><X size={20} /></button>
                        </div>
                        <div className="space-y-4">
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold uppercase text-text-secondary">Pilih Kelas</label>
                                <select
                                    className="w-full bg-slate-50 border border-border rounded-lg p-3 outline-none focus:border-accent"
                                    value={newSchoolDeposit.classId}
                                    onChange={e => setNewSchoolDeposit({ ...newSchoolDeposit, classId: e.target.value })}
                                >
                                    <option value="">Semua Kelas (Kolektif)</option>
                                    {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold uppercase text-text-secondary">Item Biaya</label>
                                <select
                                    className="w-full bg-slate-50 border border-border rounded-lg p-3 outline-none focus:border-accent"
                                    value={newSchoolDeposit.feeItemId}
                                    onChange={e => setNewSchoolDeposit({ ...newSchoolDeposit, feeItemId: e.target.value })}
                                >
                                    <option value="">-- Pilih Item --</option>
                                    {feeItems.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                                </select>
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold uppercase text-text-secondary">Nominal Setoran (Rp)</label>
                                <input
                                    type="number"
                                    className="w-full bg-slate-50 border border-border rounded-lg p-3 outline-none font-bold text-success"
                                    value={newSchoolDeposit.amount}
                                    onChange={e => setNewSchoolDeposit({ ...newSchoolDeposit, amount: parseInt(e.target.value) || 0 })}
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold uppercase text-text-secondary">Tanggal Setor</label>
                                <input
                                    type="date"
                                    className="w-full bg-slate-50 border border-border rounded-lg p-3 outline-none focus:border-accent"
                                    value={newSchoolDeposit.depositDate}
                                    onChange={e => setNewSchoolDeposit({ ...newSchoolDeposit, depositDate: e.target.value })}
                                />
                            </div>
                            <button
                                onClick={handleAddDeposit}
                                className="w-full !bg-success text-white py-4 rounded-xl mt-4 font-bold shadow-lg shadow-success/10"
                            >
                                Konfirmasi Setoran
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function GemariView({
    classes,
    students,
    transactions,
    holidays,
    onRefresh,
    onOpenPrint,
    onSort,
    currentSort,
    sortedData,
    SortableTH
}: {
    classes: Class[],
    students: Student[],
    transactions: ClassCashTransaction[],
    holidays: Holiday[],
    onRefresh: () => void,
    onOpenPrint: () => void,
    onSort: (k: string) => void,
    currentSort: any,
    sortedData: any,
    SortableTH: any
}) {
    const DEFAULT_GEMARI_RATE = 500;
    const todayStr = new Date().toISOString().split('T')[0];
    const [activeTab, setActiveTab] = useState<'overview' | 'ledger'>('overview');
    const [selectedClassId, setSelectedClassId] = useState(classes[0]?.id || '');
    const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
    const [selectedStudentId, setSelectedStudentId] = useState('');
    const [showForm, setShowForm] = useState(false);
    const [editingTx, setEditingTx] = useState<ClassCashTransaction | null>(null);
    const [selectedTxIds, setSelectedTxIds] = useState<Set<string>>(new Set());
    const [gemariRate, setGemariRate] = useState(DEFAULT_GEMARI_RATE);
    const [gemariTargetOverride, setGemariTargetOverride] = useState<number | null>(null);
    const [gemariTargetDays, setGemariTargetDays] = useState<number | null>(null);
    const [showGemariSettings, setShowGemariSettings] = useState(false);

    // Table-based settings: map of month -> { rate, targetDays, override }
    const currentYear = new Date().getFullYear();
    const [settingsRangeStart, setSettingsRangeStart] = useState(`${currentYear - 1}-07`);
    const [settingsRangeEnd, setSettingsRangeEnd] = useState(`${currentYear}-06`);
    const [settingsTable, setSettingsTable] = useState<Record<string, { rate: number; targetDays: string; override: string }>>({});
    const [settingsBulkRate, setSettingsBulkRate] = useState(DEFAULT_GEMARI_RATE);
    const [settingsLoading, setSettingsLoading] = useState(false);

    // Generate months in range
    const getMonthsInRange = (start: string, end: string) => {
        const months: string[] = [];
        const [sy, sm] = start.split('-').map(Number);
        const [ey, em] = end.split('-').map(Number);
        let y = sy, m = sm;
        while (y < ey || (y === ey && m <= em)) {
            months.push(`${y}-${String(m).padStart(2, '0')}`);
            m++;
            if (m > 12) { m = 1; y++; }
        }
        return months;
    };

    const settingsMonths = React.useMemo(() => getMonthsInRange(settingsRangeStart, settingsRangeEnd), [settingsRangeStart, settingsRangeEnd]);

    const monthLabel = (m: string) => {
        const [y, mo] = m.split('-').map(Number);
        return new Date(y, mo - 1).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
    };

    const getSchoolDaysForMonth = (monthStr: string) => {
        const [y, m] = monthStr.split('-').map(Number);
        if (!y || !m) return 0;
        const daysInMonth = new Date(y, m, 0).getDate();
        let total = 0;
        for (let day = 1; day <= daysInMonth; day++) {
            const d = new Date(y, m - 1, day);
            const dateStr = [d.getFullYear(), ('0' + (d.getMonth() + 1)).slice(-2), ('0' + d.getDate()).slice(-2)].join('-');
            const isHoliday = (holidays || []).some((h: any) => h.date === dateStr);
            if (d.getDay() !== 0 && !isHoliday) total++;
        }
        return total;
    };

    const [form, setForm] = useState({
        studentId: '',
        transactionType: 'deposit' as 'deposit' | 'withdrawal',
        amount: 0,
        date: todayStr,
        notes: ''
    });

    // Load monthly gemari settings from Firestore (for the active month)
    React.useEffect(() => {
        if (!selectedMonth) return;
        (async () => {
            try {
                const settingsRef = doc(db, 'gemariSettings', selectedMonth);
                const snap = await getDoc(settingsRef);
                if (snap.exists()) {
                    const data = snap.data();
                    setGemariRate(Number(data.rate) || DEFAULT_GEMARI_RATE);
                    setGemariTargetOverride(data.targetOverride ? Number(data.targetOverride) : null);
                    setGemariTargetDays(data.targetDays !== null && data.targetDays !== undefined ? Number(data.targetDays) : null);
                } else {
                    setGemariRate(DEFAULT_GEMARI_RATE);
                    setGemariTargetOverride(null);
                    setGemariTargetDays(null);
                }
            } catch {
                setGemariRate(DEFAULT_GEMARI_RATE);
                setGemariTargetOverride(null);
                setGemariTargetDays(null);
            }
        })();
    }, [selectedMonth]);

    // Load all settings for the table range (single batch query)
    const loadSettingsTable = async () => {
        setSettingsLoading(true);
        setSettingsSavingError('');
        const table: Record<string, { rate: number; targetDays: string; override: string }> = {};

        const fetchSettings = () => supabase!
            .from('gemariSettings')
            .select('month, rate, "targetDays", "targetOverride"')
            .in('month', settingsMonths);

        try {
            const { data, error } = await Promise.race([
                fetchSettings(),
                new Promise<never>((_, rej) => setTimeout(() => rej(new Error(
                    'Koneksi terlalu lama (>15 dtk). Periksa sambungan internet atau tabel gemariSettings belum dibuat di Supabase.'
                )), 15000))
            ]);
            if (error) throw error;
            if (data && data.length > 0) {
                const rows = data as any[];
                const found = new Set(rows.map((r: any) => r.month));
                for (const m of settingsMonths) {
                    if (found.has(m)) {
                        const r = rows.find((x: any) => x.month === m)!;
                        table[m] = {
                            rate: Number(r.rate) || DEFAULT_GEMARI_RATE,
                            targetDays: r.targetDays !== null && r.targetDays !== undefined ? String(r.targetDays) : '',
                            override: r.targetOverride ? String(r.targetOverride) : ''
                        };
                    } else {
                        table[m] = { rate: DEFAULT_GEMARI_RATE, targetDays: '', override: '' };
                    }
                }
            } else {
                for (const m of settingsMonths) table[m] = { rate: DEFAULT_GEMARI_RATE, targetDays: '', override: '' };
            }
        } catch (err: any) {
            console.error('Gagal memuat pengaturan GEMARI:', err);
            for (const m of settingsMonths) table[m] = { rate: DEFAULT_GEMARI_RATE, targetDays: '', override: '' };
            setSettingsSavingError(err?.message || String(err));
        }
        setSettingsTable(table);
        setSettingsLoading(false);
    };

    const openGemariSettings = () => {
        setShowGemariSettings(true);
        loadSettingsTable();
    };

    const [settingsSavingError, setSettingsSavingError] = useState('');

    const handleSaveAllSettings = () => {
        if (!supabase || !supabase.from) {
            setSettingsSavingError('Supabase belum dikonfigurasi. Cek file .env');
            return;
        }
        const sb = supabase;
        setSettingsLoading(true);
        setSettingsSavingError('');
        const rows: any[] = settingsMonths.map(m => {
            const entry = settingsTable[m];
            if (!entry) return null;
            const rate = Number(entry.rate) || DEFAULT_GEMARI_RATE;
            const targetDays = entry.targetDays !== '' ? Number(entry.targetDays) : null;
            const override = entry.override ? Number(entry.override) : null;
            return { month: m, rate, targetDays, targetOverride: override, updatedAt: new Date().toISOString() };
        }).filter(Boolean);

        const saveUp = async () => {
            try {
                if (rows.length > 0) {
                    const { error } = await sb.from('gemariSettings').upsert(rows, { onConflict: 'month' });
                    if (error) throw error;
                }
                // Update in-memory live rate from the just-saved table
                const active = settingsTable[selectedMonth];
                if (active) {
                    setGemariRate(Number(active.rate) || DEFAULT_GEMARI_RATE);
                    setGemariTargetOverride(active.override ? Number(active.override) : null);
                    setGemariTargetDays(active.targetDays !== '' ? Number(active.targetDays) : null);
                }
            } catch (err: any) {
                console.error('Gagal menyimpan pengaturan GEMARI:', err);
                setSettingsSavingError(`Gagal menyimpan: ${err?.message || err}`);
            } finally {
                setSettingsLoading(false);
            }
        };
        void saveUp();
    };

    const handleBulkFillRate = () => {
        const updated = { ...settingsTable };
        for (const m of settingsMonths) {
            updated[m] = { ...(updated[m] || { rate: DEFAULT_GEMARI_RATE, targetDays: '', override: '' }), rate: settingsBulkRate };
        }
        setSettingsTable(updated);
    };

    const getStudentName = (id: string) => {
        const s = students.find(x => x.id === id);
        return s?.name || (s as any)?.displayName || (s as any)?.fullName || (s as any)?.nama || 'Umum / Kolektif';
    };
    const formatCurrency = (amount: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(amount);
    
    const selectedClass = React.useMemo(() => classes.find(c => c.id === selectedClassId), [classes, selectedClassId]);
    const filteredStudents = React.useMemo(() => students.filter(s => !selectedClassId || String(s.classId) === String(selectedClassId)), [students, selectedClassId]);
    
    // Transactions for the selected month and class
    const monthTransactions = React.useMemo(() => transactions
        .filter(t => t.type === 'gemari' && (!selectedClassId || String(t.classId) === String(selectedClassId)) && (t.date || '').startsWith(selectedMonth))
        .sort((a, b) => a.date.localeCompare(b.date)), [transactions, selectedClassId, selectedMonth]);

    const monthSchoolDays = React.useMemo(() => {
        const [y, m] = selectedMonth.split('-').map(Number);
        if (!y || !m) return 0;
        const daysInMonth = new Date(y, m, 0).getDate();
        let total = 0;
        for (let day = 1; day <= daysInMonth; day++) {
            const d = new Date(y, m - 1, day);
            const dateStr = [d.getFullYear(), ('0' + (d.getMonth() + 1)).slice(-2), ('0' + d.getDate()).slice(-2)].join('-');
            const isHoliday = (holidays || []).some((h: any) => h.date === dateStr);
            if (d.getDay() !== 0 && !isHoliday) total++;
        }
        return total;
    }, [selectedMonth, holidays]);
    const effectiveGemariDays = gemariTargetDays ?? monthSchoolDays;
    const targetPerStudent = gemariTargetOverride || (effectiveGemariDays * gemariRate);

    const studentRows = React.useMemo(() => filteredStudents.map(s => {
        const studentTx = monthTransactions.filter(t => t.studentId === s.id);
        const paid = studentTx.reduce((sum, t) => sum + (t.transactionType === 'withdrawal' ? -Number(t.amount || 0) : Number(t.amount || 0)), 0);
        const kurang = Math.max(0, targetPerStudent - paid);
        const status = paid >= targetPerStudent && paid > 0 ? 'sudah_bayar' : paid <= 0 ? 'belum_bayar' : 'kurang_bayar';
        return {
            student: s,
            paid,
            kurang,
            status,
            txCount: studentTx.length
        };
    }).sort((a, b) => {
        const order: Record<string, number> = { keKurangan: 0, belum_bayar: 1, sudah_bayar: 2 };
        return order[a.status] - order[b.status] || a.student.name.localeCompare(b.student.name, 'id-ID', { numeric: true, sensitivity: 'base' });
    }), [filteredStudents, monthTransactions, targetPerStudent]);

    const totalPaid = studentRows.reduce((sum, row) => sum + row.paid, 0);
    const totalTarget = targetPerStudent * filteredStudents.length;
    const totalKurang = studentRows.reduce((sum, row) => sum + row.kurang, 0);
    const countSudah = studentRows.filter(row => row.status === 'sudah_bayar').length;
    const countBelum = studentRows.filter(row => row.status === 'belum_bayar').length;
    const countKurang = studentRows.filter(row => row.status === 'kurang_bayar').length;

    useEffect(() => {
        if (!classes.length) return;
        if (!selectedClassId || !classes.some(c => c.id === selectedClassId)) {
            setSelectedClassId(classes[0].id);
        }
    }, [classes, selectedClassId]);

    const resetForm = () => setForm({
        studentId: '',
        transactionType: 'deposit',
        amount: 0,
        date: todayStr,
        notes: ''
    });

    const openEdit = (tx: ClassCashTransaction) => {
        setEditingTx(tx);
        setForm({
            studentId: tx.studentId || '',
            transactionType: tx.transactionType || 'deposit',
            amount: Math.abs(Number(tx.amount) || 0),
            date: tx.date,
            notes: tx.notes || ''
        });
        setShowForm(true);
    };

    const handleSaveTx = async () => {
        if (!form.amount || form.amount <= 0) return alert('Nominal harus lebih dari 0');
        const targetClassId = editingTx?.classId || selectedClassId;

        if (editingTx) {
            await persistClassCashEntries([{
                classId: editingTx.classId,
                studentId: editingTx.studentId || '',
                type: 'gemari',
                transactionType: editingTx.transactionType || 'deposit',
                amount: -1,
                date: editingTx.date,
                notes: editingTx.notes
            }]);
        }

        await persistClassCashEntries([{
            classId: targetClassId,
            studentId: form.studentId || '',
            type: 'gemari',
            transactionType: form.transactionType,
            amount: form.amount,
            date: form.date,
            notes: form.notes || undefined
        }]);
        setShowForm(false);
        setEditingTx(null);
        resetForm();
        onRefresh();
    };

    const handleDeleteTx = async (tx: ClassCashTransaction) => {
        if (!confirm('Hapus transaksi ini?')) return;
        await persistClassCashEntries([{
            classId: tx.classId,
            studentId: tx.studentId || '',
            type: 'gemari',
            transactionType: tx.transactionType || 'deposit',
            amount: -1,
            date: tx.date,
            notes: tx.notes
        }]);
        if (editingTx?.id === tx.id) setEditingTx(null);
        onRefresh();
    };

    const handleBulkDeleteTx = async () => {
        if (selectedTxIds.size === 0) return;
        if (!confirm(`Hapus ${selectedTxIds.size} transaksi terpilih?`)) return;

        const txsToDelete = monthTransactions.filter(t => selectedTxIds.has(t.id));
        const entries = txsToDelete.map(tx => ({
            classId: tx.classId,
            studentId: tx.studentId || '',
            type: 'gemari' as const,
            transactionType: tx.transactionType || 'deposit',
            amount: -1,
            date: tx.date,
            notes: tx.notes
        }));
        
        await persistClassCashEntries(entries);
        setSelectedTxIds(new Set());
        onRefresh();
    };

    const handleDeleteStudentGemari = async (studentId: string, studentName: string) => {
        const studentTx = monthTransactions.filter(t => t.studentId === studentId);
        if (studentTx.length === 0) return alert('Tidak ada transaksi untuk dihapus.');
        if (!confirm(`Hapus semua ${studentTx.length} transaksi GEMARI milik ${studentName} pada bulan ini?`)) return;
        const entries = studentTx.map(tx => ({
            classId: tx.classId,
            studentId: tx.studentId || '',
            type: 'gemari' as const,
            transactionType: tx.transactionType || 'deposit',
            amount: -1,
            date: tx.date,
            notes: tx.notes
        }));
        await persistClassCashEntries(entries);
        setSelectedTxIds(new Set());
        onRefresh();
    };

    const handleDeleteAllGemari = async () => {
        const target = ledgerRows;
        if (target.length === 0) return alert('Tidak ada transaksi untuk dihapus.');
        if (!confirm(`Hapus SEMUA ${target.length} transaksi yang sedang ditampilkan?\n\nAksi ini TIDAK BISA dibatalkan.`)) return;
        const entries = target.map((tx: any) => ({
            classId: tx.classId,
            studentId: tx.studentId || '',
            type: 'gemari' as const,
            transactionType: tx.transactionType || 'deposit',
            amount: -1,
            date: tx.date,
            notes: tx.notes
        }));
        await persistClassCashEntries(entries);
        setSelectedTxIds(new Set());
        onRefresh();
    };

    // Calculate Ledger Rows with Running Balance
    const ledgerRows = React.useMemo(() => {
        const base = monthTransactions.filter(t => !selectedStudentId || t.studentId === selectedStudentId);
        let runningBalance = 0;
        return base.map(t => {
            const debet = t.transactionType === 'deposit' ? Number(t.amount || 0) : 0;
            const kredit = t.transactionType === 'withdrawal' ? Number(t.amount || 0) : 0;
            runningBalance += (debet - kredit);
            return {
                ...t,
                student: students.find(s => s.id === t.studentId),
                debet,
                kredit,
                saldo: runningBalance
            };
        });
    }, [monthTransactions, selectedStudentId, students]);

    return (
        <div className="space-y-6 print-container">
            <div className="print-header">
                <h1 className="text-2xl font-black uppercase tracking-tighter">GEMARI SISWA</h1>
                <p className="text-xs font-bold text-slate-500">Buku Transaksi: {selectedClass?.name} - {selectedMonth}</p>
            </div>

            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 no-print">
                <div>
                    <h2 className="text-2xl font-black tracking-tighter uppercase italic">GEMARI</h2>
                    <p className="text-xs text-text-secondary font-bold">Monitor tabungan dan infaq harian siswa secara transparan</p>
                </div>
                <div className="flex gap-2 w-full sm:w-auto">
                    <select
                        className="bg-white border border-border rounded-lg px-3 py-2 text-xs font-bold font-mono outline-none"
                        value={selectedClassId}
                        onChange={e => setSelectedClassId(e.target.value)}
                    >
                        {classes.map(c => <option key={c.id} value={c.id}>Kelas {c.name}</option>)}
                    </select>
                    <input
                        type="month"
                        className="bg-white border border-border rounded-lg px-3 py-2 text-xs font-bold font-mono outline-none"
                        value={selectedMonth}
                        onChange={e => setSelectedMonth(e.target.value)}
                    />
                    <button onClick={() => { resetForm(); setEditingTx(null); setShowForm(true); }} className="btn-primary flex items-center gap-2">
                        <Plus size={16} /> Input Manual
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 no-print">
                <div className="card">
                    <p className="stat-label">Total Target Kelas</p>
                    <p className="stat-value text-accent">{formatCurrency(totalTarget)}</p>
                </div>
                <div className="card">
                    <p className="stat-label">Total Terkumpul</p>
                    <p className="stat-value text-emerald-600">{formatCurrency(totalPaid)}</p>
                </div>
                <div className="card">
                    <p className="stat-label">Sisa Kekurangan</p>
                    <p className="stat-value text-red-500">{formatCurrency(totalKurang)}</p>
                </div>
                <div className="card">
                    <p className="stat-label">Status Partisipasi</p>
                    <p className="text-sm font-black text-slate-700">{countSudah} Lunas / {countKurang} Nyicil / {countBelum} Belum</p>
                </div>
                <div className="card cursor-pointer hover:border-accent transition-all group" onClick={openGemariSettings}>
                    <p className="stat-label flex items-center gap-1">Tarif Harian <Settings size={10} className="group-hover:text-accent" /></p>
                    <p className="stat-value text-purple-600">{formatCurrency(gemariRate)}</p>
                    <p className="text-[9px] text-slate-400 mt-1">{gemariTargetOverride ? `Override: ${formatCurrency(gemariTargetOverride)}` : `${effectiveGemariDays} hari × Rp ${gemariRate.toLocaleString('id-ID')}`}</p>
                </div>
            </div>

            <div className="flex border-b border-border gap-8 pb-3 no-print items-center justify-between">
                <div className="flex gap-8">
                    <button
                        onClick={() => setActiveTab('overview')}
                        className={`text-sm font-bold uppercase tracking-widest pb-1 transition-all ${activeTab === 'overview' ? 'text-accent border-b-2 border-accent' : 'opacity-30 hover:opacity-100'}`}
                    >
                        Ringkasan Siswa
                    </button>
                    <button
                        onClick={() => setActiveTab('ledger')}
                        className={`text-sm font-bold uppercase tracking-widest pb-1 transition-all ${activeTab === 'ledger' ? 'text-accent border-b-2 border-accent' : 'opacity-30 hover:opacity-100'}`}
                    >
                        Buku Transaksi
                    </button>
                </div>
                <button onClick={onOpenPrint} className="btn-small !bg-slate-700 flex items-center gap-2">
                    <Printer size={14} /> Cetak Laporan
                </button>
            </div>

            {activeTab === 'overview' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {studentRows.length === 0 ? (
                        <div className="card p-10 text-center text-slate-400 italic">Belum ada siswa pada kelas ini.</div>
                    ) : studentRows.map(row => (
                        <div key={row.student.id} className="card space-y-4 group hover:border-accent transition-all">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <h4 className="font-black text-lg group-hover:text-accent transition-all">{row.student.name}</h4>
                                    <p className="text-[10px] uppercase tracking-widest text-slate-400">Target: {effectiveGemariDays} hari × {formatCurrency(gemariRate)}</p>
                                </div>
                                <span className={`px-2 py-1 rounded text-[10px] font-black uppercase ${
                                    row.status === 'sudah_bayar' ? 'bg-emerald-100 text-emerald-700' :
                                    row.status === 'kurang_bayar' ? 'bg-amber-100 text-amber-700' :
                                    'bg-red-100 text-red-700'
                                }`}>
                                    {row.status === 'sudah_bayar' ? 'Sudah Bayar' : row.status === 'kurang_bayar' ? 'Kurang Bayar' : 'Belum Bayar'}
                                </span>
                            </div>
                            <div className="grid grid-cols-2 gap-3 text-xs">
                                <div className="p-3 bg-slate-50 rounded-xl border border-border">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase">Target</p>
                                    <p className="font-black">{formatCurrency(targetPerStudent)}</p>
                                </div>
                                <div className="p-3 bg-slate-50 rounded-xl border border-border">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase">Dibayar</p>
                                    <p className="font-black text-emerald-600">{formatCurrency(row.paid)}</p>
                                </div>
                                <div className="p-3 bg-slate-50 rounded-xl border border-border">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase">Kurang</p>
                                    <p className="font-black text-red-500">{formatCurrency(row.kurang)}</p>
                                </div>
                                <div className="p-3 bg-slate-50 rounded-xl border border-border">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase">Input</p>
                                    <p className="font-black">{row.txCount} Kali</p>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => {
                                        setForm({ ...form, studentId: row.student.id, transactionType: 'deposit' });
                                        setShowForm(true);
                                    }}
                                    className="flex-1 btn-primary !py-2 text-[10px]"
                                >
                                    Input / Edit
                                </button>
                                <button
                                    onClick={() => {
                                        setSelectedStudentId(row.student.id);
                                        setActiveTab('ledger');
                                    }}
                                    className="flex-1 btn-small !py-2 text-[10px] bg-slate-100 text-slate-600 shadow-none border-none hover:bg-slate-200"
                                >
                                    Detail
                                </button>
                                <button
                                    onClick={() => handleDeleteStudentGemari(row.student.id, row.student.name)}
                                    className="btn-small !py-2 text-[10px] bg-red-50 text-red-500 border-none shadow-none hover:bg-red-100"
                                    title={`Hapus semua data GEMARI ${row.student.name}`}
                                >
                                    <Trash2 size={12} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="space-y-4">
                    <div className="flex flex-col md:flex-row gap-4 no-print items-end justify-between bg-slate-50 p-4 rounded-2xl border border-border">
                        <div className="flex gap-4 items-end flex-wrap">
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold uppercase text-text-secondary ml-1">Cari Siswa</label>
                                <select
                                    className="bg-white border border-border rounded-lg px-4 py-2 text-sm outline-none font-bold min-w-[200px]"
                                    value={selectedStudentId}
                                    onChange={e => setSelectedStudentId(e.target.value)}
                                >
                                    <option value="">Seluruh Kelas</option>
                                    {sortStudentsForSelect(filteredStudents).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                </select>
                            </div>
                            {selectedStudentId && (
                                <button onClick={() => setSelectedStudentId('')} className="text-xs font-bold text-accent hover:underline mb-2">Hapus Filter</button>
                            )}
                        </div>
                        <div className="flex gap-2">
                            <button 
                                onClick={() => { resetForm(); setForm(f => ({ ...f, transactionType: 'deposit' })); setShowForm(true); }} 
                                className="btn-small !bg-emerald-600 text-white flex items-center gap-2"
                            >
                                <Plus size={14} /> Pemasukan
                            </button>
                            <button 
                                onClick={() => { resetForm(); setForm(f => ({ ...f, transactionType: 'withdrawal' })); setShowForm(true); }} 
                                className="btn-small !bg-red-500 text-white flex items-center gap-2"
                            >
                                <Minus size={14} /> Pengeluaran
                            </button>
                            <button 
                                onClick={handleDeleteAllGemari} 
                                className="btn-small !bg-red-50 text-red-600 border border-red-200 hover:!bg-red-100 flex items-center gap-2"
                            >
                                <Trash2 size={14} /> Hapus Semua
                            </button>
                        </div>
                    </div>

                    {selectedTxIds.size > 0 && (
                        <div className="bg-red-50 border border-red-100 p-3 mb-4 rounded-xl flex justify-between items-center no-print">
                            <span className="text-sm font-bold text-red-800">{selectedTxIds.size} transaksi terpilih</span>
                            <button onClick={handleBulkDeleteTx} className="btn-small bg-red-500 text-white hover:bg-red-600 flex items-center gap-2 shadow-sm shadow-red-500/20">
                                <Trash2 size={14} /> Hapus Terpilih
                            </button>
                        </div>
                    )}

                    <div className="table-container shadow-sm overflow-x-auto">
                        <table className="data-table">
                            <thead className="bg-slate-900 text-white">
                                <tr>
                                    <th className="w-10 !text-white border-none py-3 px-4">
                                        <input 
                                            type="checkbox" 
                                            className="rounded cursor-pointer w-4 h-4 accent-red-500 focus:ring-red-500 border-white/20 bg-white/10" 
                                            checked={ledgerRows.length > 0 && selectedTxIds.size === ledgerRows.length}
                                            onChange={(e) => {
                                                if (e.target.checked) {
                                                    setSelectedTxIds(new Set(ledgerRows.map((t: any) => t.id)));
                                                } else {
                                                    setSelectedTxIds(new Set());
                                                }
                                            }}
                                        />
                                    </th>
                                    <th className="!text-white border-none">TGL</th>
                                    <th className="!text-white border-none">SISWA / KETERANGAN</th>
                                    <th className="!text-white border-none text-right">MASUK (D)</th>
                                    <th className="!text-white border-none text-right">KELUAR (K)</th>
                                    <th className="!text-white border-none text-right">SALDO</th>
                                    <th className="no-print !text-white border-none">AKSI</th>
                                </tr>
                            </thead>
                            <tbody>
                                {ledgerRows.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} className="text-center py-20 text-slate-400 italic">Belum ada catatan transaksi untuk periode ini.</td>
                                    </tr>
                                ) : (
                                    ledgerRows.map((t: any) => (
                                        <tr key={t.id} className={`transition-all border-b border-slate-100 ${selectedTxIds.has(t.id) ? 'bg-red-50/50' : 'hover:bg-blue-50/50'}`}>
                                            <td className="text-center py-3 px-4">
                                                <input 
                                                    type="checkbox"
                                                    className="w-4 h-4 text-red-500 rounded border-slate-300 focus:ring-red-500 cursor-pointer accent-red-500"
                                                    checked={selectedTxIds.has(t.id)}
                                                    onChange={(e) => {
                                                        const newSet = new Set(selectedTxIds);
                                                        if (e.target.checked) newSet.add(t.id);
                                                        else newSet.delete(t.id);
                                                        setSelectedTxIds(newSet);
                                                    }}
                                                />
                                            </td>
                                            <td className="font-mono text-xs whitespace-nowrap">{t.date}</td>
                                            <td className="py-3">
                                                <div className="flex flex-col">
                                                    <span className="font-bold text-slate-700">{t.student?.name || 'UMUM / KOLEKTIF'}</span>
                                                    <span className="text-[10px] text-slate-400 italic">{t.notes || '- no notes -'}</span>
                                                </div>
                                            </td>
                                            <td className="text-right font-bold text-emerald-600">
                                                {t.debet > 0 ? formatCurrency(t.debet) : '-'}
                                            </td>
                                            <td className="text-right font-bold text-red-500">
                                                {t.kredit > 0 ? formatCurrency(t.kredit) : '-'}
                                            </td>
                                            <td className="text-right font-black bg-slate-50/50">
                                                {formatCurrency(t.saldo)}
                                            </td>
                                            <td className="no-print">
                                                <div className="flex gap-1 justify-center">
                                                    <button onClick={() => openEdit(t)} className="p-1.5 hover:bg-blue-100 rounded text-blue-600 transition-all">
                                                        <Edit size={12} />
                                                    </button>
                                                    <button onClick={() => handleDeleteTx(t)} className="p-1.5 hover:bg-red-100 rounded text-red-500 transition-all">
                                                        <Trash2 size={12} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                            {ledgerRows.length > 0 && (
                                <tfoot className="bg-slate-50 font-black">
                                    <tr>
                                        <td colSpan={3} className="text-right py-3 uppercase text-[10px] tracking-widest text-slate-500">Total Periode Ini</td>
                                        <td className="text-right text-emerald-600">{formatCurrency(ledgerRows.reduce((a, b) => a + b.debet, 0))}</td>
                                        <td className="text-right text-red-500">{formatCurrency(ledgerRows.reduce((a, b) => a + b.kredit, 0))}</td>
                                        <td className="text-right bg-slate-100">{formatCurrency(ledgerRows[ledgerRows.length - 1].saldo)}</td>
                                        <td className="no-print"></td>
                                    </tr>
                                </tfoot>
                            )}
                        </table>
                    </div>
                </div>
            )}

            <AnimatePresence>
                {showForm && (
                    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 20 }}
                            className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl border border-border relative overflow-hidden"
                        >
                            <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-accent to-blue-400" />
                            <div className="flex justify-between items-center mb-6">
                                <div>
                                    <h3 className="text-xl font-black uppercase tracking-tighter text-slate-800">{editingTx ? 'Ubah Catatan' : 'Input Transaksi'}</h3>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Modul Gemari Siswa</p>
                                </div>
                                <button onClick={() => { setShowForm(false); setEditingTx(null); resetForm(); }} className="p-2 hover:bg-slate-100 rounded-full transition-all">
                                    <X size={20} />
                                </button>
                            </div>
                            
                            <div className="space-y-4">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Nama Siswa</label>
                                    <select
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 outline-none font-bold focus:border-accent focus:bg-white transition-all"
                                        value={form.studentId}
                                        onChange={e => setForm(prev => ({ ...prev, studentId: e.target.value }))}
                                    >
                                        <option value="">-- UMUM / KOLEKTIF --</option>
                                        {sortStudentsForSelect(filteredStudents).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                    </select>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Tipe</label>
                                        <select
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 outline-none font-bold focus:border-accent focus:bg-white transition-all"
                                            value={form.transactionType}
                                            onChange={e => setForm(prev => ({ ...prev, transactionType: e.target.value as 'deposit' | 'withdrawal' }))}
                                        >
                                            <option value="deposit">Pemasukan (D)</option>
                                            <option value="withdrawal">Pengeluaran (K)</option>
                                        </select>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Tanggal</label>
                                        <input
                                            type="date"
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 outline-none font-bold focus:border-accent focus:bg-white transition-all"
                                            value={form.date}
                                            onChange={e => setForm(prev => ({ ...prev, date: e.target.value }))}
                                        />
                                    </div>
                                </div>

                                <div className="space-y-1">
                                    <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Nominal (Rp)</label>
                                    <div className="relative">
                                        <input
                                            type="number"
                                            min="0"
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 pl-10 outline-none font-black text-lg text-accent focus:border-accent focus:bg-white transition-all"
                                            value={form.amount}
                                            onChange={e => setForm(prev => ({ ...prev, amount: parseInt(e.target.value || '0') }))}
                                        />
                                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 font-bold">Rp</div>
                                    </div>
                                </div>

                                <div className="space-y-1">
                                    <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Keterangan / Catatan</label>
                                    <textarea
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 outline-none text-sm min-h-[80px] focus:border-accent focus:bg-white transition-all"
                                        value={form.notes}
                                        onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))}
                                        placeholder="Tuliskan alasan atau sumber dana..."
                                    />
                                </div>
                            </div>

                            <div className="flex gap-3 mt-8">
                                <button 
                                    onClick={() => { setShowForm(false); setEditingTx(null); resetForm(); }} 
                                    className="flex-1 py-4 bg-slate-100 text-slate-500 rounded-2xl font-black uppercase text-xs hover:bg-slate-200 transition-all"
                                >
                                    Batal
                                </button>
                                <button 
                                    onClick={handleSaveTx} 
                                    className="flex-3 py-4 bg-slate-900 text-yellow-400 rounded-2xl font-black uppercase text-xs shadow-xl shadow-slate-200 active:scale-95 transition-all"
                                >
                                    {editingTx ? 'Update Data' : 'Simpan Transaksi'}
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {showGemariSettings && (
                    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 20 }}
                            className="bg-white rounded-3xl p-6 md:p-8 max-w-3xl w-full shadow-2xl border border-border relative overflow-hidden max-h-[90vh] flex flex-col"
                        >
                            <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-purple-500 to-pink-400" />
                            <div className="flex justify-between items-center mb-5">
                                <div>
                                    <h3 className="text-xl font-black uppercase tracking-tighter text-slate-800">Pengaturan Target GEMARI</h3>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Konfigurasi tarif harian per bulan</p>
                                </div>
                                <button onClick={() => setShowGemariSettings(false)} className="p-2 hover:bg-slate-100 rounded-full transition-all">
                                    <X size={20} />
                                </button>
                            </div>

                            {/* Range picker */}
                            <div className="flex flex-wrap gap-4 items-end mb-4 pb-4 border-b border-border">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Mulai</label>
                                    <input type="month" className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold outline-none focus:border-purple-500" value={settingsRangeStart} onChange={e => { setSettingsRangeStart(e.target.value); }} />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Sampai</label>
                                    <input type="month" className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold outline-none focus:border-purple-500" value={settingsRangeEnd} onChange={e => { setSettingsRangeEnd(e.target.value); }} />
                                </div>
                                <button onClick={loadSettingsTable} className="btn-small !bg-purple-100 text-purple-700 hover:!bg-purple-200 font-bold">
                                    Muat Data
                                </button>
                                <div className="flex-1" />
                                <div className="flex items-end gap-2">
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Isi Semua</label>
                                        <input type="number" className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold outline-none w-28 focus:border-purple-500" value={settingsBulkRate} onChange={e => setSettingsBulkRate(Number(e.target.value))} min={0} />
                                    </div>
                                    <button onClick={handleBulkFillRate} className="btn-small !bg-purple-600 text-white hover:!bg-purple-700 font-bold">
                                        Terapkan
                                    </button>
                                </div>
                            </div>

                            {settingsSavingError && (
                                <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-xl text-[11px] text-red-600 font-bold whitespace-pre-line flex items-start justify-between gap-3">
                                    <span>{settingsSavingError}</span>
                                    <button onClick={() => setSettingsSavingError('')} className="text-red-400 hover:text-red-600 shrink-0">✕</button>
                                </div>
                            )}

                            {/* Table */}
                            <div className="overflow-y-auto flex-1 -mx-2 px-2">
                                {settingsLoading ? (
                                    <div className="text-center py-16 text-slate-400 italic">Memuat data pengaturan...</div>
                                ) : (
                                    <table className="w-full text-sm border-collapse">
                                        <thead className="sticky top-0 bg-white z-10">
                                            <tr className="border-b-2 border-purple-200">
                                                <th className="text-left py-3 px-2 text-[10px] font-black uppercase text-slate-500">Bulan</th>
                                                <th className="text-center py-3 px-2 text-[10px] font-black uppercase text-slate-500 w-20">Hari Kerja</th>
                                                <th className="text-center py-3 px-2 text-[10px] font-black uppercase text-slate-500 w-32">Tarif Harian</th>
                                                <th className="text-center py-3 px-2 text-[10px] font-black uppercase text-slate-500 w-36">Override Target</th>
                                                <th className="text-right py-3 px-2 text-[10px] font-black uppercase text-slate-500 w-32">Target/Siswa</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {settingsMonths.map(m => {
                                                const entry = settingsTable[m] || { rate: DEFAULT_GEMARI_RATE, targetDays: '', override: '' };
                                                const days = entry.targetDays !== '' ? Number(entry.targetDays) : getSchoolDaysForMonth(m);
                                                const target = entry.override ? Number(entry.override) : days * entry.rate;
                                                const isActive = m === selectedMonth;
                                                return (
                                                    <tr key={m} className={`border-b border-slate-100 transition-all ${isActive ? 'bg-purple-50/50 ring-1 ring-purple-200' : 'hover:bg-slate-50'}`}>
                                                        <td className="py-2.5 px-2">
                                                            <span className={`font-bold ${isActive ? 'text-purple-700' : 'text-slate-700'}`}>{monthLabel(m)}</span>
                                                            {isActive && <span className="ml-2 text-[9px] bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded-full font-black">AKTIF</span>}
                                                        </td>
                                                        <td className="py-2.5 px-2">
                                                            <input
                                                                type="number"
                                                                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-center font-bold outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-200 transition-all"
                                                                value={entry.targetDays}
                                                                onChange={e => setSettingsTable(prev => ({ ...prev, [m]: { ...(prev[m] || { rate: DEFAULT_GEMARI_RATE, targetDays: '', override: '' }), targetDays: e.target.value } }))}
                                                                placeholder={String(getSchoolDaysForMonth(m))}
                                                                min={0}
                                                            />
                                                        </td>
                                                        <td className="py-2.5 px-2">
                                                            <input
                                                                type="number"
                                                                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-center font-bold outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-200 transition-all"
                                                                value={entry.rate}
                                                                onChange={e => setSettingsTable(prev => ({ ...prev, [m]: { ...(prev[m] || { rate: DEFAULT_GEMARI_RATE, targetDays: '', override: '' }), rate: Number(e.target.value) } }))}
                                                                min={0}
                                                            />
                                                        </td>
                                                        <td className="py-2.5 px-2">
                                                            <input
                                                                type="number"
                                                                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-center font-bold outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-200 transition-all"
                                                                value={entry.override}
                                                                onChange={e => setSettingsTable(prev => ({ ...prev, [m]: { ...(prev[m] || { rate: DEFAULT_GEMARI_RATE, targetDays: '', override: '' }), override: e.target.value } }))}
                                                                placeholder="—"
                                                                min={0}
                                                            />
                                                        </td>
                                                        <td className="py-2.5 px-2 text-right font-black text-purple-600">
                                                            {formatCurrency(target)}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                        <tfoot className="border-t-2 border-purple-200 bg-purple-50/30">
                                            <tr>
                                                <td colSpan={4} className="py-3 px-2 text-right text-[10px] font-black uppercase text-purple-500">Total Target/Siswa (Setahun):</td>
                                                <td className="py-3 px-2 text-right font-black text-purple-700 text-base">
                                                    {formatCurrency(settingsMonths.reduce((sum, m) => {
                                                        const e = settingsTable[m] || { rate: DEFAULT_GEMARI_RATE, targetDays: '', override: '' };
                                                        const days = e.targetDays !== '' ? Number(e.targetDays) : getSchoolDaysForMonth(m);
                                                        return sum + (e.override ? Number(e.override) : days * e.rate);
                                                    }, 0))}
                                                </td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                )}
                            </div>

                            <div className="flex gap-3 mt-5 pt-4 border-t border-border">
                                <button 
                                    onClick={() => setShowGemariSettings(false)} 
                                    className="flex-1 py-3 bg-slate-100 text-slate-500 rounded-2xl font-black uppercase text-xs hover:bg-slate-200 transition-all"
                                >
                                    Batal
                                </button>
                                <button 
                                    onClick={handleSaveAllSettings} 
                                    disabled={settingsLoading}
                                    className="flex-[3] py-3 bg-purple-600 text-white rounded-2xl font-black uppercase text-xs shadow-xl shadow-purple-200 active:scale-95 transition-all disabled:opacity-50"
                                >
                                    {settingsLoading ? 'Menyimpan...' : 'Simpan Semua Pengaturan'}
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}


function InfaqJumatView({
    classes,
    students,
    transactions,
    holidays,
    onRefresh,
    onOpenPrint,
    onSort,
    currentSort,
    sortedData,
    SortableTH
}: {
    classes: Class[],
    students: Student[],
    transactions: ClassCashTransaction[],
    holidays: Holiday[],
    onRefresh: () => void,
    onOpenPrint: () => void,
    onSort: (k: string) => void,
    currentSort: any,
    sortedData: any,
    SortableTH: any
}) {
    const DEFAULT_INFAQ_RATE = 1000;
    const todayStr = new Date().toISOString().split('T')[0];
    const [activeTab, setActiveTab] = useState<'overview' | 'ledger'>('overview');
    const [selectedClassId, setSelectedClassId] = useState(classes[0]?.id || '');
    const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
    const [selectedStudentId, setSelectedStudentId] = useState('');
    const [showForm, setShowForm] = useState(false);
    const [editingTx, setEditingTx] = useState<ClassCashTransaction | null>(null);
    const [selectedInfaqIds, setSelectedInfaqIds] = useState<Set<string>>(new Set());
    const [infaqRate, setInfaqRate] = useState(DEFAULT_INFAQ_RATE);
    const [infaqTargetOverride, setInfaqTargetOverride] = useState<number | null>(null);
    const [infaqTargetDays, setInfaqTargetDays] = useState<number | null>(null);
    const [showInfaqSettings, setShowInfaqSettings] = useState(false);

    // Table-based settings: map of month -> { rate, targetDays, override }
    const currentYear = new Date().getFullYear();
    const [infaqRangeStart, setInfaqRangeStart] = useState(`${currentYear - 1}-07`);
    const [infaqRangeEnd, setInfaqRangeEnd] = useState(`${currentYear}-06`);
    const [infaqTable, setInfaqTable] = useState<Record<string, { rate: number; targetDays: string; override: string }>>({});
    const [infaqBulkRate, setInfaqBulkRate] = useState(DEFAULT_INFAQ_RATE);
    const [infaqLoading, setInfaqLoading] = useState(false);

    // Generate months in range
    const getMonthsInRange = (start: string, end: string) => {
        const months: string[] = [];
        const [sy, sm] = start.split('-').map(Number);
        const [ey, em] = end.split('-').map(Number);
        let y = sy, m = sm;
        while (y < ey || (y === ey && m <= em)) {
            months.push(`${y}-${String(m).padStart(2, '0')}`);
            m++;
            if (m > 12) { m = 1; y++; }
        }
        return months;
    };

    const infaqMonths = React.useMemo(() => getMonthsInRange(infaqRangeStart, infaqRangeEnd), [infaqRangeStart, infaqRangeEnd]);

    const monthLabel = (m: string) => {
        const [y, mo] = m.split('-').map(Number);
        return new Date(y, mo - 1).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
    };

    const getSchoolDaysForMonth = (monthStr: string) => {
        const [y, m] = monthStr.split('-').map(Number);
        if (!y || !m) return 0;
        const daysInMonth = new Date(y, m, 0).getDate();
        let total = 0;
        for (let day = 1; day <= daysInMonth; day++) {
            const d = new Date(y, m - 1, day);
            const dateStr = [d.getFullYear(), ('0' + (d.getMonth() + 1)).slice(-2), ('0' + d.getDate()).slice(-2)].join('-');
            const isHoliday = (holidays || []).some((h: any) => h.date === dateStr);
            if (d.getDay() === 5 && !isHoliday) total++;
        }
        return total;
    };

    const [form, setForm] = useState({
        studentId: '',
        transactionType: 'deposit' as 'deposit' | 'withdrawal',
        amount: 0,
        date: todayStr,
        notes: ''
    });

    // Load monthly infaq settings from Supabase (for the active month)
    React.useEffect(() => {
        if (!selectedMonth) return;
        (async () => {
            try {
                const settingsRef = doc(db, 'infaqSettings', selectedMonth);
                const snap = await getDoc(settingsRef);
                if (snap.exists()) {
                    const data = snap.data();
                    setInfaqRate(Number(data.rate) || DEFAULT_INFAQ_RATE);
                    setInfaqTargetOverride(data.targetOverride ? Number(data.targetOverride) : null);
                    setInfaqTargetDays(data.targetDays !== null && data.targetDays !== undefined ? Number(data.targetDays) : null);
                } else {
                    setInfaqRate(DEFAULT_INFAQ_RATE);
                    setInfaqTargetOverride(null);
                    setInfaqTargetDays(null);
                }
            } catch {
                setInfaqRate(DEFAULT_INFAQ_RATE);
                setInfaqTargetOverride(null);
                setInfaqTargetDays(null);
            }
        })();
    }, [selectedMonth]);

    // Load all settings for the table range (single batch query)
    const loadInfaqSettings = async () => {
        setInfaqLoading(true);
        setInfaqSavingError('');
        const table: Record<string, { rate: number; targetDays: string; override: string }> = {};

        const isMissingInfaqSettingsColumn = (err: any) => {
            const message = `${err?.message || ''} ${err?.details || ''} ${err?.hint || ''}`;
            return /infaqSettings\.(targetDays|targetOverride|targetdays|targetoverride)/i.test(message)
                || /column .* does not exist/i.test(message);
        };

        const fetchSettings = async () => {
            const camel = await supabase!
                .from('infaqSettings')
                .select('month, rate, "targetDays", "targetOverride"')
                .in('month', infaqMonths);
            if (!camel.error || !isMissingInfaqSettingsColumn(camel.error)) return camel;

            const lower = await supabase!
                .from('infaqSettings')
                .select('month, rate, targetdays, targetoverride')
                .in('month', infaqMonths);
            if (!lower.error || !isMissingInfaqSettingsColumn(lower.error)) return lower;

            return supabase!
                .from('infaqSettings')
                .select('month, rate')
                .in('month', infaqMonths);
        };

        try {
            const { data, error } = await Promise.race([
                fetchSettings(),
                new Promise<never>((_, rej) => setTimeout(() => rej(new Error(
                    'Koneksi terlalu lama (>15 dtk). Periksa sambungan internet atau tabel infaqSettings belum dibuat di Supabase.'
                )), 15000))
            ]);
            if (error) throw error;
            if (data && data.length > 0) {
                const rows = data as any[];
                const found = new Set(rows.map((r: any) => r.month));
                for (const m of infaqMonths) {
                    if (found.has(m)) {
                        const r = rows.find((x: any) => x.month === m)!;
                        const rowTargetDays = r.targetDays ?? r.targetdays;
                        const rowTargetOverride = r.targetOverride ?? r.targetoverride;
                        table[m] = {
                            rate: Number(r.rate) || DEFAULT_INFAQ_RATE,
                            targetDays: rowTargetDays !== null && rowTargetDays !== undefined ? String(rowTargetDays) : '',
                            override: rowTargetOverride ? String(rowTargetOverride) : ''
                        };
                    } else {
                        table[m] = { rate: DEFAULT_INFAQ_RATE, targetDays: '', override: '' };
                    }
                }
            } else {
                for (const m of infaqMonths) table[m] = { rate: DEFAULT_INFAQ_RATE, targetDays: '', override: '' };
            }
        } catch (err: any) {
            console.error('Gagal memuat pengaturan INFAQ Jumat:', err);
            for (const m of infaqMonths) table[m] = { rate: DEFAULT_INFAQ_RATE, targetDays: '', override: '' };
            setInfaqSavingError(err?.message || String(err));
        }
        setInfaqTable(table);
        setInfaqLoading(false);
    };

    const openInfaqSettings = () => {
        setShowInfaqSettings(true);
        loadInfaqSettings();
    };

    const [infaqSavingError, setInfaqSavingError] = useState('');

    const handleSaveAllInfaqSettings = () => {
        if (!supabase || !supabase.from) {
            setInfaqSavingError('Supabase belum dikonfigurasi. Cek file .env');
            return;
        }
        const sb = supabase;
        setInfaqLoading(true);
        setInfaqSavingError('');
        const rows: any[] = infaqMonths.map(m => {
            const entry = infaqTable[m];
            if (!entry) return null;
            const rate = Number(entry.rate) || DEFAULT_INFAQ_RATE;
            const targetDays = entry.targetDays !== '' ? Number(entry.targetDays) : null;
            const override = entry.override ? Number(entry.override) : null;
            return { month: m, rate, targetDays, targetOverride: override, updatedAt: new Date().toISOString() };
        }).filter(Boolean);

        const saveUp = async () => {
            try {
                if (rows.length > 0) {
                    const isMissingInfaqSettingsColumn = (err: any) => {
                        const message = `${err?.message || ''} ${err?.details || ''} ${err?.hint || ''}`;
                        return /infaqSettings\.(targetDays|targetOverride|targetdays|targetoverride)/i.test(message)
                            || /column .* does not exist/i.test(message);
                    };

                    const saveCamel = await sb.from('infaqSettings').upsert(rows, { onConflict: 'month' });
                    if (saveCamel.error && isMissingInfaqSettingsColumn(saveCamel.error)) {
                        const lowercaseRows = rows.map(({ targetDays, targetOverride, updatedAt, ...rest }) => ({
                            ...rest,
                            targetdays: targetDays,
                            targetoverride: targetOverride,
                            updatedat: updatedAt
                        }));
                        const saveLower = await sb.from('infaqSettings').upsert(lowercaseRows, { onConflict: 'month' });
                        if (saveLower.error && isMissingInfaqSettingsColumn(saveLower.error)) {
                            const basicRows = rows.map(({ targetDays: _targetDays, targetOverride: _targetOverride, ...rest }) => rest);
                            const saveBasic = await sb.from('infaqSettings').upsert(basicRows, { onConflict: 'month' });
                            if (saveBasic.error) throw saveBasic.error;
                            setInfaqSavingError('Nominal tersimpan, tetapi kolom targetDays/targetOverride belum ada di tabel infaqSettings. Jalankan migration Supabase untuk menyimpan target hari dan override.');
                        } else if (saveLower.error) {
                            throw saveLower.error;
                        }
                    } else if (saveCamel.error) {
                        throw saveCamel.error;
                    }
                }
                // Update in-memory live rate from the just-saved table
                const active = infaqTable[selectedMonth];
                if (active) {
                    setInfaqRate(Number(active.rate) || DEFAULT_INFAQ_RATE);
                    setInfaqTargetOverride(active.override ? Number(active.override) : null);
                    setInfaqTargetDays(active.targetDays !== '' ? Number(active.targetDays) : null);
                }
            } catch (err: any) {
                console.error('Gagal menyimpan pengaturan INFAQ Jumat:', err);
                setInfaqSavingError(`Gagal menyimpan: ${err?.message || err}`);
            } finally {
                setInfaqLoading(false);
            }
        };
        void saveUp();
    };

    const handleBulkFillInfaqRate = () => {
        const updated = { ...infaqTable };
        for (const m of infaqMonths) {
            updated[m] = { ...(updated[m] || { rate: DEFAULT_INFAQ_RATE, targetDays: '', override: '' }), rate: infaqBulkRate };
        }
        setInfaqTable(updated);
    };

    const getStudentName = (id: string) => {
        const s = students.find(x => x.id === id);
        return s?.name || (s as any)?.displayName || (s as any)?.fullName || (s as any)?.nama || 'Umum / Kolektif';
    };
    const formatCurrency = (amount: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(amount);
    
    const selectedClass = React.useMemo(() => classes.find(c => c.id === selectedClassId), [classes, selectedClassId]);
    const filteredStudents = React.useMemo(() => students.filter(s => !selectedClassId || String(s.classId) === String(selectedClassId)), [students, selectedClassId]);
    
    // Transactions for the selected month and class
    const monthTransactions = React.useMemo(() => transactions
        .filter(t => t.type === 'infaq' && (!selectedClassId || String(t.classId) === String(selectedClassId)) && (t.date || '').startsWith(selectedMonth))
        .sort((a, b) => a.date.localeCompare(b.date)), [transactions, selectedClassId, selectedMonth]);

    const monthSchoolDays = React.useMemo(() => {
        const [y, m] = selectedMonth.split('-').map(Number);
        if (!y || !m) return 0;
        const daysInMonth = new Date(y, m, 0).getDate();
        let total = 0;
        for (let day = 1; day <= daysInMonth; day++) {
            const d = new Date(y, m - 1, day);
            const dateStr = [d.getFullYear(), ('0' + (d.getMonth() + 1)).slice(-2), ('0' + d.getDate()).slice(-2)].join('-');
            const isHoliday = (holidays || []).some((h: any) => h.date === dateStr);
            if (d.getDay() === 5 && !isHoliday) total++;
        }
        return total;
    }, [selectedMonth, holidays]);
    const effectiveInfaqDays = infaqTargetDays ?? monthSchoolDays;
    const targetPerStudent = infaqTargetOverride || (effectiveInfaqDays * infaqRate);

    const studentRows = React.useMemo(() => filteredStudents.map(s => {
        const studentTx = monthTransactions.filter(t => t.studentId === s.id);
        const paid = studentTx.reduce((sum, t) => sum + (t.transactionType === 'withdrawal' ? -Number(t.amount || 0) : Number(t.amount || 0)), 0);
        const kurang = Math.max(0, targetPerStudent - paid);
        const status = paid >= targetPerStudent && paid > 0 ? 'sudah_bayar' : paid <= 0 ? 'belum_bayar' : 'keKurangan';
        return {
            student: s,
            paid,
            kurang,
            status,
            txCount: studentTx.length
        };
    }).sort((a, b) => {
        const order: Record<string, number> = { keKurangan: 0, belum_bayar: 1, sudah_bayar: 2 };
        return order[a.status] - order[b.status] || a.student.name.localeCompare(b.student.name, 'id-ID', { numeric: true, sensitivity: 'base' });
    }), [filteredStudents, monthTransactions, targetPerStudent]);

    const totalPaid = studentRows.reduce((sum, row) => sum + row.paid, 0);
    const totalTarget = targetPerStudent * filteredStudents.length;
    const totalKekurangan = studentRows.reduce((sum, row) => sum + row.kurang, 0);
    const countSudah = studentRows.filter(row => row.status === 'sudah_bayar').length;
    const countBelum = studentRows.filter(row => row.status === 'belum_bayar').length;
    const countKekurangan = studentRows.filter(row => row.status === 'keKurangan').length;

    useEffect(() => {
        if (!classes.length) return;
        if (!selectedClassId || !classes.some(c => c.id === selectedClassId)) {
            setSelectedClassId(classes[0].id);
        }
    }, [classes, selectedClassId]);

    const resetForm = () => setForm({
        studentId: '',
        transactionType: 'deposit',
        amount: 0,
        date: todayStr,
        notes: ''
    });

    const openEdit = (tx: ClassCashTransaction) => {
        setEditingTx(tx);
        setForm({
            studentId: tx.studentId || '',
            transactionType: tx.transactionType || 'deposit',
            amount: Math.abs(Number(tx.amount) || 0),
            date: tx.date,
            notes: tx.notes || ''
        });
        setShowForm(true);
    };

    const handleSaveTx = async () => {
        if (!form.amount || form.amount <= 0) return alert('Nominal harus lebih dari 0');
        const targetClassId = editingTx?.classId || selectedClassId;

        if (editingTx) {
            await persistClassCashEntries([{
                classId: editingTx.classId,
                studentId: editingTx.studentId || '',
                type: 'infaq',
                transactionType: editingTx.transactionType || 'deposit',
                amount: -1,
                date: editingTx.date,
                notes: editingTx.notes
            }]);
        }

        await persistClassCashEntries([{
            classId: targetClassId,
            studentId: form.studentId || '',
            type: 'infaq',
            transactionType: form.transactionType,
            amount: form.amount,
            date: form.date,
            notes: form.notes || undefined
        }]);
        setShowForm(false);
        setEditingTx(null);
        resetForm();
        onRefresh();
    };

    const handleDeleteTx = async (tx: ClassCashTransaction) => {
        if (!confirm('Hapus transaksi ini?')) return;
        await persistClassCashEntries([{
            classId: tx.classId,
            studentId: tx.studentId || '',
            type: 'infaq',
            transactionType: tx.transactionType || 'deposit',
            amount: -1,
            date: tx.date,
            notes: tx.notes
        }]);
        if (editingTx?.id === tx.id) setEditingTx(null);
        onRefresh();
    };

    const handleBulkDeleteInfaq = async () => {
        if (selectedInfaqIds.size === 0) return;
        if (!confirm(`Hapus ${selectedInfaqIds.size} transaksi terpilih?`)) return;

        const txsToDelete = monthTransactions.filter(t => selectedInfaqIds.has(t.id));
        const entries = txsToDelete.map(tx => ({
            classId: tx.classId,
            studentId: tx.studentId || '',
            type: 'infaq' as const,
            transactionType: tx.transactionType || 'deposit',
            amount: -1,
            date: tx.date,
            notes: tx.notes
        }));
        
        await persistClassCashEntries(entries);
        setSelectedInfaqIds(new Set());
        onRefresh();
    };

    const handleDeleteStudentInfaq = async (studentId: string, studentName: string) => {
        const studentTx = monthTransactions.filter(t => t.studentId === studentId);
        if (studentTx.length === 0) return alert('Tidak ada transaksi untuk dihapus.');
        if (!confirm(`Hapus semua ${studentTx.length} transaksi INFAQ milik ${studentName} pada bulan ini?`)) return;
        const entries = studentTx.map(tx => ({
            classId: tx.classId,
            studentId: tx.studentId || '',
            type: 'infaq' as const,
            transactionType: tx.transactionType || 'deposit',
            amount: -1,
            date: tx.date,
            notes: tx.notes
        }));
        await persistClassCashEntries(entries);
        setSelectedInfaqIds(new Set());
        onRefresh();
    };

    const handleDeleteAllInfaq = async () => {
        const target = ledgerRows;
        if (target.length === 0) return alert('Tidak ada transaksi untuk dihapus.');
        if (!confirm(`Hapus SEMUA ${target.length} transaksi yang sedang ditampilkan?\n\nAksi ini TIDAK BISA dibatalkan.`)) return;
        const entries = target.map((tx: any) => ({
            classId: tx.classId,
            studentId: tx.studentId || '',
            type: 'infaq' as const,
            transactionType: tx.transactionType || 'deposit',
            amount: -1,
            date: tx.date,
            notes: tx.notes
        }));
        await persistClassCashEntries(entries);
        setSelectedInfaqIds(new Set());
        onRefresh();
    };

    // Calculate Ledger Rows with Running Balance
    const ledgerRows = React.useMemo(() => {
        const base = monthTransactions.filter(t => !selectedStudentId || t.studentId === selectedStudentId);
        let runningBalance = 0;
        return base.map(t => {
            const debet = t.transactionType === 'deposit' ? Number(t.amount || 0) : 0;
            const kredit = t.transactionType === 'withdrawal' ? Number(t.amount || 0) : 0;
            runningBalance += (debet - kredit);
            return {
                ...t,
                student: students.find(s => s.id === t.studentId),
                debet,
                kredit,
                saldo: runningBalance
            };
        });
    }, [monthTransactions, selectedStudentId, students]);

    return (
        <div className="space-y-6 print-container">
            <div className="print-header">
                <h1 className="text-2xl font-black uppercase tracking-tighter">INFAQ JUMAT SISWA</h1>
                <p className="text-xs font-bold text-slate-500">Buku Transaksi Infaq: {selectedClass?.name} - {selectedMonth}</p>
            </div>

            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 no-print">
                <div>
                    <h2 className="text-2xl font-black tracking-tighter uppercase italic">INFAQ JUMAT</h2>
                    <p className="text-xs text-text-secondary font-bold">Monitor pembayaran infaq Jumat siswa secara transparan</p>
                </div>
                <div className="flex gap-2 w-full sm:w-auto">
                    <select
                        className="bg-white border border-border rounded-lg px-3 py-2 text-xs font-bold font-mono outline-none"
                        value={selectedClassId}
                        onChange={e => setSelectedClassId(e.target.value)}
                    >
                        {classes.map(c => <option key={c.id} value={c.id}>Kelas {c.name}</option>)}
                    </select>
                    <input
                        type="month"
                        className="bg-white border border-border rounded-lg px-3 py-2 text-xs font-bold font-mono outline-none"
                        value={selectedMonth}
                        onChange={e => setSelectedMonth(e.target.value)}
                    />
                    <button onClick={() => { resetForm(); setEditingTx(null); setShowForm(true); }} className="btn-primary flex items-center gap-2">
                        <Plus size={16} /> Input Manual
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 no-print">
                <div className="card">
                    <p className="stat-label">Total Target Infaq</p>
                    <p className="stat-value text-accent">{formatCurrency(totalTarget)}</p>
                </div>
                <div className="card">
                    <p className="stat-label">Total Terbayar</p>
                    <p className="stat-value text-emerald-600">{formatCurrency(totalPaid)}</p>
                </div>
                <div className="card">
                    <p className="stat-label">Kekurangan</p>
                    <p className="stat-value text-red-500">{formatCurrency(totalKekurangan)}</p>
                </div>
                <div className="card">
                    <p className="stat-label">Status Terbayar</p>
                    <p className="text-sm font-black text-slate-700">{countSudah} Lunas / {countKekurangan} Nyicil / {countBelum} Belum</p>
                </div>
                <div className="card cursor-pointer hover:border-accent transition-all group" onClick={openInfaqSettings}>
                    <p className="stat-label flex items-center gap-1">Nominal Infaq <Settings size={10} className="group-hover:text-accent" /></p>
                    <p className="stat-value text-purple-600">{formatCurrency(infaqRate)}</p>
                    <p className="text-[9px] text-slate-400 mt-1">{infaqTargetOverride ? `Override: ${formatCurrency(infaqTargetOverride)}` : `${effectiveInfaqDays} hari × Rp ${infaqRate.toLocaleString('id-ID')}`}</p>
                </div>
            </div>

            <div className="flex border-b border-border gap-8 pb-3 no-print items-center justify-between">
                <div className="flex gap-8">
                    <button
                        onClick={() => setActiveTab('overview')}
                        className={`text-sm font-bold uppercase tracking-widest pb-1 transition-all ${activeTab === 'overview' ? 'text-accent border-b-2 border-accent' : 'opacity-30 hover:opacity-100'}`}
                    >
                        Ringkasan Siswa
                    </button>
                    <button
                        onClick={() => setActiveTab('ledger')}
                        className={`text-sm font-bold uppercase tracking-widest pb-1 transition-all ${activeTab === 'ledger' ? 'text-accent border-b-2 border-accent' : 'opacity-30 hover:opacity-100'}`}
                    >
                        Buku Transaksi
                    </button>
                </div>
                <button onClick={onOpenPrint} className="btn-small !bg-slate-700 flex items-center gap-2">
                    <Printer size={14} /> Cetak Laporan
                </button>
            </div>

            {activeTab === 'overview' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {studentRows.length === 0 ? (
                        <div className="card p-10 text-center text-slate-400 italic">Belum ada siswa pada kelas ini.</div>
                    ) : studentRows.map(row => (
                        <div key={row.student.id} className="card space-y-4 group hover:border-accent transition-all">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <h4 className="font-black text-lg group-hover:text-accent transition-all">{row.student.name}</h4>
                                    <p className="text-[10px] uppercase tracking-widest text-slate-400">Target: {effectiveInfaqDays} hari × {formatCurrency(infaqRate)}</p>
                                </div>
                                <span className={`px-2 py-1 rounded text-[10px] font-black uppercase ${
                                    row.status === 'sudah_bayar' ? 'bg-emerald-100 text-emerald-700' :
                                    row.status === 'keKurangan' ? 'bg-amber-100 text-amber-700' :
                                    'bg-red-100 text-red-700'
                                }`}>
                                    {row.status === 'sudah_bayar' ? 'Lunas' : row.status === 'keKurangan' ? 'Kekurangan' : 'Belum'}
                                </span>
                            </div>
                            <div className="grid grid-cols-2 gap-3 text-xs">
                                <div className="p-3 bg-slate-50 rounded-xl border border-border">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase">Target</p>
                                    <p className="font-black">{formatCurrency(targetPerStudent)}</p>
                                </div>
                                <div className="p-3 bg-slate-50 rounded-xl border border-border">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase">Terbayar</p>
                                    <p className="font-black text-emerald-600">{formatCurrency(row.paid)}</p>
                                </div>
                                <div className="p-3 bg-slate-50 rounded-xl border border-border">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase">Kekurangan</p>
                                    <p className="font-black text-red-500">{formatCurrency(row.kurang)}</p>
                                </div>
                                <div className="p-3 bg-slate-50 rounded-xl border border-border">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase">Frek Input</p>
                                    <p className="font-black">{row.txCount} Kali</p>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => {
                                        setForm({ ...form, studentId: row.student.id, transactionType: 'deposit' });
                                        setShowForm(true);
                                    }}
                                    className="flex-1 btn-primary !py-2 text-[10px]"
                                >
                                    Input / Edit
                                </button>
                                <button
                                    onClick={() => {
                                        setSelectedStudentId(row.student.id);
                                        setActiveTab('ledger');
                                    }}
                                    className="flex-1 btn-small !py-2 text-[10px] bg-slate-100 text-slate-600 shadow-none border-none hover:bg-slate-200"
                                >
                                    Detail
                                </button>
                                <button
                                    onClick={() => handleDeleteStudentInfaq(row.student.id, row.student.name)}
                                    className="btn-small !py-2 text-[10px] bg-red-50 text-red-500 border-none shadow-none hover:bg-red-100"
                                    title={`Hapus semua data INFAQ ${row.student.name}`}
                                >
                                    <Trash2 size={12} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="space-y-4">
                    <div className="flex flex-col md:flex-row gap-4 no-print items-end justify-between bg-slate-50 p-4 rounded-2xl border border-border">
                        <div className="flex gap-4 items-end flex-wrap">
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold uppercase text-text-secondary ml-1">Cari Siswa</label>
                                <select
                                    className="bg-white border border-border rounded-lg px-4 py-2 text-sm outline-none font-bold min-w-[200px]"
                                    value={selectedStudentId}
                                    onChange={e => setSelectedStudentId(e.target.value)}
                                >
                                    <option value="">Seluruh Kelas</option>
                                    {sortStudentsForSelect(filteredStudents).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                </select>
                            </div>
                            {selectedStudentId && (
                                <button onClick={() => setSelectedStudentId('')} className="text-xs font-bold text-accent hover:underline mb-2">Hapus Filter</button>
                            )}
                        </div>
                        <div className="flex gap-2">
                            <button 
                                onClick={() => { resetForm(); setForm(f => ({ ...f, transactionType: 'deposit' })); setShowForm(true); }} 
                                className="btn-small !bg-emerald-600 text-white flex items-center gap-2"
                            >
                                <Plus size={14} /> Pemasukan
                            </button>
                            <button 
                                onClick={() => { resetForm(); setForm(f => ({ ...f, transactionType: 'withdrawal' })); setShowForm(true); }} 
                                className="btn-small !bg-red-500 text-white flex items-center gap-2"
                            >
                                <Minus size={14} /> Pengeluaran
                            </button>
                            <button 
                                onClick={handleDeleteAllInfaq} 
                                className="btn-small !bg-red-50 text-red-600 border border-red-200 hover:!bg-red-100 flex items-center gap-2"
                            >
                                <Trash2 size={14} /> Hapus Semua
                            </button>
                        </div>
                    </div>

                    {selectedInfaqIds.size > 0 && (
                        <div className="bg-red-50 border border-red-100 p-3 mb-4 rounded-xl flex justify-between items-center no-print">
                            <span className="text-sm font-bold text-red-800">{selectedInfaqIds.size} transaksi terpilih</span>
                            <button onClick={handleBulkDeleteInfaq} className="btn-small bg-red-500 text-white hover:bg-red-600 flex items-center gap-2 shadow-sm shadow-red-500/20">
                                <Trash2 size={14} /> Hapus Terpilih
                            </button>
                        </div>
                    )}

                    <div className="table-container shadow-sm overflow-x-auto">
                        <table className="data-table">
                            <thead className="bg-slate-900 text-white">
                                <tr>
                                    <th className="w-10 !text-white border-none py-3 px-4">
                                        <input 
                                            type="checkbox" 
                                            className="rounded cursor-pointer w-4 h-4 accent-red-500 focus:ring-red-500 border-white/20 bg-white/10" 
                                            checked={ledgerRows.length > 0 && selectedInfaqIds.size === ledgerRows.length}
                                            onChange={(e) => {
                                                if (e.target.checked) {
                                                    setSelectedInfaqIds(new Set(ledgerRows.map((t: any) => t.id)));
                                                } else {
                                                    setSelectedInfaqIds(new Set());
                                                }
                                            }}
                                        />
                                    </th>
                                    <th className="!text-white border-none">TGL</th>
                                    <th className="!text-white border-none">SISWA / KETERANGAN</th>
                                    <th className="!text-white border-none text-right">MASUK (D)</th>
                                    <th className="!text-white border-none text-right">KELUAR (K)</th>
                                    <th className="!text-white border-none text-right">SALDO</th>
                                    <th className="no-print !text-white border-none">AKSI</th>
                                </tr>
                            </thead>
                            <tbody>
                                {ledgerRows.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} className="text-center py-20 text-slate-400 italic">Belum ada catatan transaksi untuk periode ini.</td>
                                    </tr>
                                ) : (
                                    ledgerRows.map((t: any) => (
                                        <tr key={t.id} className={`transition-all border-b border-slate-100 ${selectedInfaqIds.has(t.id) ? 'bg-red-50/50' : 'hover:bg-blue-50/50'}`}>
                                            <td className="text-center py-3 px-4">
                                                <input 
                                                    type="checkbox"
                                                    className="w-4 h-4 text-red-500 rounded border-slate-300 focus:ring-red-500 cursor-pointer accent-red-500"
                                                    checked={selectedInfaqIds.has(t.id)}
                                                    onChange={(e) => {
                                                        const newSet = new Set(selectedInfaqIds);
                                                        if (e.target.checked) newSet.add(t.id);
                                                        else newSet.delete(t.id);
                                                        setSelectedInfaqIds(newSet);
                                                    }}
                                                />
                                            </td>
                                            <td className="font-mono text-xs whitespace-nowrap">{t.date}</td>
                                            <td className="py-3">
                                                <div className="flex flex-col">
                                                    <span className="font-bold text-slate-700">{t.student?.name || 'UMUM / KOLEKTIF'}</span>
                                                    <span className="text-[10px] text-slate-400 italic">{t.notes || '- no notes -'}</span>
                                                </div>
                                            </td>
                                            <td className="text-right font-bold text-emerald-600">
                                                {t.debet > 0 ? formatCurrency(t.debet) : '-'}
                                            </td>
                                            <td className="text-right font-bold text-red-500">
                                                {t.kredit > 0 ? formatCurrency(t.kredit) : '-'}
                                            </td>
                                            <td className="text-right font-black bg-slate-50/50">
                                                {formatCurrency(t.saldo)}
                                            </td>
                                            <td className="no-print">
                                                <div className="flex gap-1 justify-center">
                                                    <button onClick={() => openEdit(t)} className="p-1.5 hover:bg-blue-100 rounded text-blue-600 transition-all">
                                                        <Edit size={12} />
                                                    </button>
                                                    <button onClick={() => handleDeleteTx(t)} className="p-1.5 hover:bg-red-100 rounded text-red-500 transition-all">
                                                        <Trash2 size={12} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                            {ledgerRows.length > 0 && (
                                <tfoot className="bg-slate-50 font-black">
                                    <tr>
                                        <td colSpan={3} className="text-right py-3 uppercase text-[10px] tracking-widest text-slate-500">Total Periode Ini</td>
                                        <td className="text-right text-emerald-600">{formatCurrency(ledgerRows.reduce((a, b) => a + b.debet, 0))}</td>
                                        <td className="text-right text-red-500">{formatCurrency(ledgerRows.reduce((a, b) => a + b.kredit, 0))}</td>
                                        <td className="text-right bg-slate-100">{formatCurrency(ledgerRows[ledgerRows.length - 1].saldo)}</td>
                                        <td className="no-print"></td>
                                    </tr>
                                </tfoot>
                            )}
                        </table>
                    </div>
                </div>
            )}

            <AnimatePresence>
                {showForm && (
                    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 20 }}
                            className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl border border-border relative overflow-hidden"
                        >
                            <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-accent to-blue-400" />
                            <div className="flex justify-between items-center mb-6">
                                <div>
                                    <h3 className="text-xl font-black uppercase tracking-tighter text-slate-800">{editingTx ? 'Ubah Catatan' : 'Input Transaksi'}</h3>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Modul Infaq Jumat</p>
                                </div>
                                <button onClick={() => { setShowForm(false); setEditingTx(null); resetForm(); }} className="p-2 hover:bg-slate-100 rounded-full transition-all">
                                    <X size={20} />
                                </button>
                            </div>
                            
                            <div className="space-y-4">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Nama Siswa</label>
                                    <select
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 outline-none font-bold focus:border-accent focus:bg-white transition-all"
                                        value={form.studentId}
                                        onChange={e => setForm(prev => ({ ...prev, studentId: e.target.value }))}
                                    >
                                        <option value="">-- UMUM / KOLEKTIF --</option>
                                        {sortStudentsForSelect(filteredStudents).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                    </select>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Tipe</label>
                                        <select
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 outline-none font-bold focus:border-accent focus:bg-white transition-all"
                                            value={form.transactionType}
                                            onChange={e => setForm(prev => ({ ...prev, transactionType: e.target.value as 'deposit' | 'withdrawal' }))}
                                        >
                                            <option value="deposit">Pemasukan (D)</option>
                                            <option value="withdrawal">Pengeluaran (K)</option>
                                        </select>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Tanggal</label>
                                        <input
                                            type="date"
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 outline-none font-bold focus:border-accent focus:bg-white transition-all"
                                            value={form.date}
                                            onChange={e => setForm(prev => ({ ...prev, date: e.target.value }))}
                                        />
                                    </div>
                                </div>

                                <div className="space-y-1">
                                    <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Nominal (Rp)</label>
                                    <div className="relative">
                                        <input
                                            type="number"
                                            min="0"
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 pl-10 outline-none font-black text-lg text-accent focus:border-accent focus:bg-white transition-all"
                                            value={form.amount}
                                            onChange={e => setForm(prev => ({ ...prev, amount: parseInt(e.target.value || '0') }))}
                                        />
                                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 font-bold">Rp</div>
                                    </div>
                                </div>

                                <div className="space-y-1">
                                    <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Keterangan / Catatan</label>
                                    <textarea
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 outline-none text-sm min-h-[80px] focus:border-accent focus:bg-white transition-all"
                                        value={form.notes}
                                        onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))}
                                        placeholder="Tuliskan alasan atau sumber dana..."
                                    />
                                </div>
                            </div>

                            <div className="flex gap-3 mt-8">
                                <button 
                                    onClick={() => { setShowForm(false); setEditingTx(null); resetForm(); }} 
                                    className="flex-1 py-4 bg-slate-100 text-slate-500 rounded-2xl font-black uppercase text-xs hover:bg-slate-200 transition-all"
                                >
                                    Batal
                                </button>
                                <button 
                                    onClick={handleSaveTx} 
                                    className="flex-3 py-4 bg-slate-900 text-yellow-400 rounded-2xl font-black uppercase text-xs shadow-xl shadow-slate-200 active:scale-95 transition-all"
                                >
                                    {editingTx ? 'Update Data' : 'Simpan Transaksi'}
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {showInfaqSettings && (
                    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 20 }}
                            className="bg-white rounded-3xl p-6 md:p-8 max-w-3xl w-full shadow-2xl border border-border relative overflow-hidden max-h-[90vh] flex flex-col"
                        >
                            <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-purple-500 to-pink-400" />
                            <div className="flex justify-between items-center mb-5">
                                <div>
                                    <h3 className="text-xl font-black uppercase tracking-tighter text-slate-800">Pengaturan Target INFAQ Jumat</h3>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Konfigurasi nominal infaq per bulan</p>
                                </div>
                                <button onClick={() => setShowInfaqSettings(false)} className="p-2 hover:bg-slate-100 rounded-full transition-all">
                                    <X size={20} />
                                </button>
                            </div>

                            {/* Range picker */}
                            <div className="flex flex-wrap gap-4 items-end mb-4 pb-4 border-b border-border">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Mulai</label>
                                    <input type="month" className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold outline-none focus:border-purple-500" value={infaqRangeStart} onChange={e => { setInfaqRangeStart(e.target.value); }} />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Sampai</label>
                                    <input type="month" className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold outline-none focus:border-purple-500" value={infaqRangeEnd} onChange={e => { setInfaqRangeEnd(e.target.value); }} />
                                </div>
                                <button onClick={loadInfaqSettings} className="btn-small !bg-purple-100 text-purple-700 hover:!bg-purple-200 font-bold">
                                    Muat Data
                                </button>
                                <div className="flex-1" />
                                <div className="flex items-end gap-2">
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Isi Semua</label>
                                        <input type="number" className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold outline-none w-28 focus:border-purple-500" value={infaqBulkRate} onChange={e => setInfaqBulkRate(Number(e.target.value))} min={0} />
                                    </div>
                                    <button onClick={handleBulkFillInfaqRate} className="btn-small !bg-purple-600 text-white hover:!bg-purple-700 font-bold">
                                        Terapkan
                                    </button>
                                </div>
                            </div>

                            {infaqSavingError && (
                                <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-xl text-[11px] text-red-600 font-bold whitespace-pre-line flex items-start justify-between gap-3">
                                    <span>{infaqSavingError}</span>
                                    <button onClick={() => setInfaqSavingError('')} className="text-red-400 hover:text-red-600 shrink-0">✕</button>
                                </div>
                            )}

                            {/* Table */}
                            <div className="overflow-y-auto flex-1 -mx-2 px-2">
                                {infaqLoading ? (
                                    <div className="text-center py-16 text-slate-400 italic">Memuat data pengaturan...</div>
                                ) : (
                                    <table className="w-full text-sm border-collapse">
                                        <thead className="sticky top-0 bg-white z-10">
                                            <tr className="border-b-2 border-purple-200">
                                                <th className="text-left py-3 px-2 text-[10px] font-black uppercase text-slate-500">Bulan</th>
                                                <th className="text-center py-3 px-2 text-[10px] font-black uppercase text-slate-500 w-20">Hari Jumat</th>
                                                <th className="text-center py-3 px-2 text-[10px] font-black uppercase text-slate-500 w-32">Nominal Infaq</th>
                                                <th className="text-center py-3 px-2 text-[10px] font-black uppercase text-slate-500 w-36">Override Target</th>
                                                <th className="text-right py-3 px-2 text-[10px] font-black uppercase text-slate-500 w-32">Target/Siswa</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {infaqMonths.map(m => {
                                                const entry = infaqTable[m] || { rate: DEFAULT_INFAQ_RATE, targetDays: '', override: '' };
                                                const days = entry.targetDays !== '' ? Number(entry.targetDays) : getSchoolDaysForMonth(m);
                                                const target = entry.override ? Number(entry.override) : days * entry.rate;
                                                const isActive = m === selectedMonth;
                                                return (
                                                    <tr key={m} className={`border-b border-slate-100 transition-all ${isActive ? 'bg-purple-50/50 ring-1 ring-purple-200' : 'hover:bg-slate-50'}`}>
                                                        <td className="py-2.5 px-2">
                                                            <span className={`font-bold ${isActive ? 'text-purple-700' : 'text-slate-700'}`}>{monthLabel(m)}</span>
                                                            {isActive && <span className="ml-2 text-[9px] bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded-full font-black">AKTIF</span>}
                                                        </td>
                                                        <td className="py-2.5 px-2">
                                                            <input
                                                                type="number"
                                                                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-center font-bold outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-200 transition-all"
                                                                value={entry.targetDays}
                                                                onChange={e => setInfaqTable(prev => ({ ...prev, [m]: { ...(prev[m] || { rate: DEFAULT_INFAQ_RATE, targetDays: '', override: '' }), targetDays: e.target.value } }))}
                                                                placeholder={String(getSchoolDaysForMonth(m))}
                                                                min={0}
                                                            />
                                                        </td>
                                                        <td className="py-2.5 px-2">
                                                            <input
                                                                type="number"
                                                                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-center font-bold outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-200 transition-all"
                                                                value={entry.rate}
                                                                onChange={e => setInfaqTable(prev => ({ ...prev, [m]: { ...(prev[m] || { rate: DEFAULT_INFAQ_RATE, targetDays: '', override: '' }), rate: Number(e.target.value) } }))}
                                                                min={0}
                                                            />
                                                        </td>
                                                        <td className="py-2.5 px-2">
                                                            <input
                                                                type="number"
                                                                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-center font-bold outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-200 transition-all"
                                                                value={entry.override}
                                                                onChange={e => setInfaqTable(prev => ({ ...prev, [m]: { ...(prev[m] || { rate: DEFAULT_INFAQ_RATE, targetDays: '', override: '' }), override: e.target.value } }))}
                                                                placeholder="—"
                                                                min={0}
                                                            />
                                                        </td>
                                                        <td className="py-2.5 px-2 text-right font-black text-purple-600">
                                                            {formatCurrency(target)}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                        <tfoot className="border-t-2 border-purple-200 bg-purple-50/30">
                                            <tr>
                                                <td colSpan={4} className="py-3 px-2 text-right text-[10px] font-black uppercase text-purple-500">Total Target/Siswa (Setahun):</td>
                                                <td className="py-3 px-2 text-right font-black text-purple-700 text-base">
                                                    {formatCurrency(infaqMonths.reduce((sum, m) => {
                                                        const e = infaqTable[m] || { rate: DEFAULT_INFAQ_RATE, targetDays: '', override: '' };
                                                        const days = e.targetDays !== '' ? Number(e.targetDays) : getSchoolDaysForMonth(m);
                                                        return sum + (e.override ? Number(e.override) : days * e.rate);
                                                    }, 0))}
                                                </td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                )}
                            </div>

                            <div className="flex gap-3 mt-5 pt-4 border-t border-border">
                                <button 
                                    onClick={() => setShowInfaqSettings(false)} 
                                    className="flex-1 py-3 bg-slate-100 text-slate-500 rounded-2xl font-black uppercase text-xs hover:bg-slate-200 transition-all"
                                >
                                    Batal
                                </button>
                                <button 
                                    onClick={handleSaveAllInfaqSettings} 
                                    disabled={infaqLoading}
                                    className="flex-[3] py-3 bg-purple-600 text-white rounded-2xl font-black uppercase text-xs shadow-xl shadow-purple-200 active:scale-95 transition-all disabled:opacity-50"
                                >
                                    {infaqLoading ? 'Menyimpan...' : 'Simpan Semua Pengaturan'}
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
function SavingsView({
    students,
    classes,
    transactions,
    onRefresh,
    onOpenPrint,
    onSort,
    currentSort,
    sortedData,
    SortableTH
}: {
    students: Student[],
    classes: Class[],
    transactions: SavingsTransaction[],
    onRefresh: () => void,
    onOpenPrint: () => void,
    onSort: (k: string) => void,
    currentSort: any,
    sortedData: any,
    SortableTH: any
}) {
    const [activeTab, setActiveTab] = useState<'overview' | 'ledger'>('overview');
    const [showForm, setShowForm] = useState(false);
    const [selectedStudentId, setSelectedStudentId] = useState('');
    const [editingTx, setEditingTx] = useState<any>(null);

    const [newTransaction, setNewTransaction] = useState({
        studentId: '',
        amount: 0,
        date: new Date().toISOString().split('T')[0],
        type: 'deposit' as 'deposit' | 'withdrawal',
        notes: ''
    });

    const openEdit = (tx: any) => {
        setEditingTx(tx);
        setNewTransaction({
            studentId: tx.studentId,
            amount: tx.amount,
            date: tx.date || new Date().toISOString().split('T')[0],
            type: tx.type,
            notes: tx.notes || ''
        });
        setShowForm(true);
    };

    const handleSaveTransaction = async () => {
        if (!newTransaction.studentId || newTransaction.amount <= 0) {
            alert('Lengkapi data dengan benar');
            return;
        }
        if (editingTx) {
            await updateDoc(doc(db, 'savingsTransactions', editingTx.id), newTransaction);
        } else {
            await addDoc(collection(db, 'savingsTransactions'), newTransaction);
        }
        setShowForm(false);
        setEditingTx(null);
        setNewTransaction({
            studentId: '',
            amount: 0,
            date: new Date().toISOString().split('T')[0],
            type: 'deposit',
            notes: ''
        });
        onRefresh();
    };

    const handleDeleteTransaction = async (tx: any) => {
        if (!confirm('Hapus transaksi ini?')) return;
        await deleteDoc(doc(db, 'savingsTransactions', tx.id));
        if (editingTx?.id === tx.id) {
            setEditingTx(null);
            setShowForm(false);
        }
        onRefresh();
    };

    const handleDeleteStudentSavings = async (studentId: string, studentName: string) => {
        const studentTx = transactions.filter(t => t.studentId === studentId);
        if (studentTx.length === 0) return alert('Tidak ada transaksi untuk dihapus.');
        if (!confirm(`Hapus semua ${studentTx.length} transaksi tabungan milik ${studentName}?`)) return;
        for (const tx of studentTx) {
            await deleteDoc(doc(db, 'savingsTransactions', tx.id));
        }
        onRefresh();
    };

    const handleDeleteAllSavings = async () => {
        const target = transactions.filter(t => !selectedStudentId || t.studentId === selectedStudentId);
        if (target.length === 0) return alert('Tidak ada transaksi untuk dihapus.');
        const label = selectedStudentId ? students.find(s => s.id === selectedStudentId)?.name || 'siswa' : 'SEMUA siswa';
        if (!confirm(`Hapus SEMUA ${target.length} transaksi tabungan ${label}?\n\nAksi ini TIDAK BISA dibatalkan.`)) return;
        for (const tx of target) {
            await deleteDoc(doc(db, 'savingsTransactions', tx.id));
        }
        onRefresh();
    };

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(amount);
    };

    const studentBalances = students.map(s => {
        const studentTx = transactions.filter(t => t.studentId === s.id);
        const totalDeposit = studentTx.filter(t => t.type === 'deposit').reduce((acc, t) => acc + t.amount, 0);
        const totalWithdrawal = studentTx.filter(t => t.type === 'withdrawal').reduce((acc, t) => acc + t.amount, 0);
        return {
            ...s,
            balance: totalDeposit - totalWithdrawal,
            txCount: studentTx.length
        };
    }).sort((a, b) => b.balance - a.balance);

    const totalSavings = transactions.filter(t => t.type === 'deposit').reduce((acc, t) => acc + t.amount, 0);
    const totalWithdrawals = transactions.filter(t => t.type === 'withdrawal').reduce((acc, t) => acc + t.amount, 0);
    const netSavings = totalSavings - totalWithdrawals;

    return (
        <div className="space-y-6 print-container">
            <div className="print-header">
                <h1 className="text-2xl font-black uppercase tracking-tighter">LAPORAN TABUNGAN SISWA</h1>
                <p className="text-xs font-bold text-slate-500">Saldo Per Tanggal: {new Date().toLocaleDateString('id-ID')}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 no-print">
                <div className="card space-y-1 border-l-4 border-l-success">
                    <p className="stat-label">Total Saldo Tabungan</p>
                    <p className="stat-value text-success">{formatCurrency(netSavings)}</p>
                </div>
                <div className="card space-y-1">
                    <p className="stat-label">Total Simpanan</p>
                    <p className="stat-value">{formatCurrency(totalSavings)}</p>
                </div>
                <div className="card space-y-1">
                    <p className="stat-label">Total Penarikan</p>
                    <p className="stat-value text-red-500">{formatCurrency(totalWithdrawals)}</p>
                </div>
            </div>

            <div className="flex border-b border-border gap-8 pb-3 no-print items-center justify-between">
                <div className="flex gap-8">
                    <button
                        onClick={() => setActiveTab('overview')}
                        className={`text-sm font-bold uppercase tracking-widest pb-1 transition-all ${activeTab === 'overview' ? 'text-accent border-b-2 border-accent' : 'opacity-30 hover:opacity-100'}`}
                    >
                        Dashboard Tabungan
                    </button>
                    <button
                        onClick={() => setActiveTab('ledger')}
                        className={`text-sm font-bold uppercase tracking-widest pb-1 transition-all ${activeTab === 'ledger' ? 'text-accent border-b-2 border-accent' : 'opacity-30 hover:opacity-100'}`}
                    >
                        Buku Besar
                    </button>
                </div>
                <div className="flex gap-2">
                    <button onClick={onOpenPrint} className="btn-small !bg-slate-700 flex items-center gap-2">
                        <Printer size={14} /> Cetak
                    </button>
                    <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-2">
                        <Plus size={16} /> Transaksi Baru
                    </button>
                    <button 
                        onClick={handleDeleteAllSavings} 
                        className="btn-small !bg-red-50 text-red-600 border border-red-200 hover:!bg-red-100 flex items-center gap-2"
                    >
                        <Trash2 size={14} /> Hapus Semua
                    </button>
                </div>
            </div>

            {activeTab === 'overview' && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {studentBalances.map(s => (
                        <div key={s.id} className="card hover:border-accent transition-all cursor-pointer group" onClick={() => { setSelectedStudentId(s.id); setActiveTab('ledger'); }}>
                            <div className="flex justify-between items-start">
                                <div>
                                    <h4 className="font-bold group-hover:text-accent transition-all">{s.name}</h4>
                                    <p className="text-[10px] text-text-secondary uppercase">{classes.find(c => c.id === s.classId)?.name}</p>
                                </div>
                                <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-accent group-hover:bg-accent group-hover:text-white transition-all">
                                    <PiggyBank size={16} />
                                </div>
                            </div>
                            <div className="mt-4">
                                <p className="text-[10px] font-bold uppercase text-text-secondary mb-1">Saldo Saat Ini</p>
                                <p className="text-xl font-black text-accent">{formatCurrency(s.balance)}</p>
                            </div>
                            <div className="mt-3 pt-3 border-t border-border flex gap-2">
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setNewTransaction({ ...newTransaction, studentId: s.id, type: 'deposit' });
                                        setEditingTx(null);
                                        setShowForm(true);
                                    }}
                                    className="flex-1 btn-primary py-2 text-xs flex items-center justify-center gap-1"
                                >
                                    <Plus size={12} /> Input Edit
                                </button>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedStudentId(s.id);
                                        setActiveTab('ledger');
                                    }}
                                    className="flex-1 btn-small py-2 text-xs"
                                >
                                    Riwayat
                                </button>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleDeleteStudentSavings(s.id, s.name);
                                    }}
                                    className="btn-small py-2 text-xs bg-red-50 text-red-500 border-none shadow-none hover:bg-red-100"
                                    title={`Hapus semua tabungan ${s.name}`}
                                >
                                    <Trash2 size={12} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {activeTab === 'ledger' && (
                <div className="space-y-4">
                    <div className="flex gap-4 no-print items-end">
                        <div className="space-y-1 flex-1 max-w-xs">
                            <label className="text-[10px] font-bold capitalize text-text-secondary">Filter Siswa</label>
                            <select
                                className="w-full bg-white border border-border rounded-lg px-4 py-2 text-sm outline-none"
                                value={selectedStudentId}
                                onChange={e => setSelectedStudentId(e.target.value)}
                            >
                                <option value="">Semua Siswa</option>
                                {sortStudentsForSelect(students).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                        </div>
                        {selectedStudentId && (
                            <button onClick={() => setSelectedStudentId('')} className="text-xs font-bold text-accent hover:underline mb-2">Reset</button>
                        )}
                    </div>
                    <div className="table-container shadow-sm">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <SortableTH label="TANGGAL" sortKey="date" currentSort={currentSort} onSort={onSort} />
                                    <SortableTH label="SISWA" sortKey="name" currentSort={currentSort} onSort={onSort} />
                                    <SortableTH label="TIPE" sortKey="type" currentSort={currentSort} onSort={onSort} />
                                    <SortableTH label="NOMINAL" sortKey="amount" currentSort={currentSort} onSort={onSort} />
                                    <th>KETERANGAN</th>
                                    <th className="no-print">AKSI</th>
                                </tr>
                            </thead>
                            <tbody>
                                {sortedData(transactions.filter(t => !selectedStudentId || t.studentId === selectedStudentId)).map((t: any) => {
                                    const s = students.find(st => st.id === t.studentId);
                                    return (
                                        <tr key={t.id} className="hover:bg-slate-50 transition-all">
                                            <td className="font-mono text-xs">{t.date}</td>
                                            <td className="font-bold">{s?.name}</td>
                                            <td>
                                                <span className={`text-[9px] font-black uppercase px-2 py-1 rounded-full border shadow-sm ${t.type === 'deposit' ? 'bg-success/10 text-success border-success/20' : 'bg-red-50 text-red-500 border-red-100'}`}>
                                                    {t.type === 'deposit' ? (
                                                        <span className="flex items-center gap-1"><ArrowUpRight size={10} /> Simpan</span>
                                                    ) : (
                                                        <span className="flex items-center gap-1"><TrendingDown size={10} /> Tarik</span>
                                                    )}
                                                </span>
                                            </td>
                                            <td className={`font-black font-mono text-sm ${t.type === 'deposit' ? 'text-text-primary' : 'text-red-500'}`}>
                                                {t.type === 'withdrawal' ? '-' : ''}{formatCurrency(t.amount)}
                                            </td>
                                            <td className="text-xs text-text-secondary italic">{t.notes || '-'}</td>
                                            <td className="no-print">
                                                <div className="flex gap-1">
                                                    <button onClick={() => openEdit(t)} className="p-1.5 hover:bg-blue-100 rounded text-blue-600 transition-all" aria-label="Edit Transaksi">
                                                        <Edit size={12} />
                                                    </button>
                                                    <button onClick={() => handleDeleteTransaction(t)} className="p-1.5 hover:bg-red-100 rounded text-red-500 transition-all" aria-label="Hapus Transaksi">
                                                        <Trash2 size={12} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {showForm && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl border border-border">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold">{editingTx ? 'Koreksi Transaksi Tabungan' : 'Transaksi Tabungan'}</h3>
                            <button onClick={() => { setShowForm(false); setEditingTx(null); }} aria-label="Tutup form tabungan"><X size={20} /></button>
                        </div>
                        <div className="space-y-4">
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold uppercase text-text-secondary">Siswa</label>
                                <select
                                    className="w-full bg-slate-50 border border-border rounded-lg p-3 outline-none focus:border-accent"
                                    value={newTransaction.studentId}
                                    onChange={e => setNewTransaction({ ...newTransaction, studentId: e.target.value })}
                                >
                                    <option value="">Pilih Siswa</option>
                                    {sortStudentsForSelect(students).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                </select>
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold uppercase text-text-secondary">Tipe Transaksi</label>
                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        onClick={() => setNewTransaction({ ...newTransaction, type: 'deposit' })}
                                        className={`p-3 rounded-lg border font-bold text-sm flex items-center justify-center gap-2 ${newTransaction.type === 'deposit' ? 'bg-success text-white border-success' : 'bg-slate-50 border-border text-text-secondary'}`}
                                    >
                                        <ArrowUpRight size={16} /> Setor
                                    </button>
                                    <button
                                        onClick={() => setNewTransaction({ ...newTransaction, type: 'withdrawal' })}
                                        className={`p-3 rounded-lg border font-bold text-sm flex items-center justify-center gap-2 ${newTransaction.type === 'withdrawal' ? 'bg-red-500 text-white border-red-500' : 'bg-slate-50 border-border text-text-secondary'}`}
                                    >
                                        <TrendingDownIcon size={16} /> Tarik
                                    </button>
                                </div>
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold uppercase text-text-secondary">Nominal</label>
                                <input
                                    type="number"
                                    className="w-full bg-slate-50 border border-border rounded-lg p-3 outline-none focus:border-accent font-bold"
                                    value={newTransaction.amount}
                                    onChange={e => setNewTransaction({ ...newTransaction, amount: parseInt(e.target.value) })}
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold uppercase text-text-secondary">Tanggal</label>
                                <input
                                    type="date"
                                    className="w-full bg-slate-50 border border-border rounded-lg p-3 outline-none focus:border-accent font-bold"
                                    value={newTransaction.date}
                                    onChange={e => setNewTransaction({ ...newTransaction, date: e.target.value })}
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold uppercase text-text-secondary">Keterangan</label>
                                <textarea
                                    className="w-full bg-slate-50 border border-border rounded-lg p-3 outline-none focus:border-accent text-sm"
                                    placeholder="Opsional..."
                                    value={newTransaction.notes}
                                    onChange={e => setNewTransaction({ ...newTransaction, notes: e.target.value })}
                                />
                            </div>
                            <div className="flex gap-3 mt-4">
                                <button onClick={() => { setShowForm(false); setEditingTx(null); }} className="flex-1 py-3 border border-border rounded-xl font-bold">Batal</button>
                                <button onClick={handleSaveTransaction} className="flex-1 btn-primary py-3">{editingTx ? 'Simpan Koreksi' : 'Proses Transaksi'}</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
const GradeInput = ({ value, onChange, placeholder = '' }: any) => {
    const hasError = value !== '' && value !== null && (Number(value) < 0 || Number(value) > 100);
    return (
        <input
            type="number"
            step="0.01"
            min="0"
            max="100"
            className={`w-full p-1 text-center outline-none bg-transparent ${hasError ? 'bg-red-100 text-red-600 font-bold border border-red-500 rounded' : ''}`}
            value={value ?? ''}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder}
        />
    );
};

const CHAT_BROADCAST_THREAD_ID = 'broadcast';
const getDirectChatThreadId = (studentId: string) => `admin__${studentId}`;

function AdminMessagesView({ user, students }: { user: any; students: Student[] }) {
    const [mode, setMode] = useState<'direct' | 'broadcast'>('direct');
    const studentsForSelect = sortStudentsForSelect(students);
    const [selectedStudentId, setSelectedStudentId] = useState<string>(studentsForSelect[0]?.id || '');
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [loading, setLoading] = useState(false);
    const [text, setText] = useState('');

    useEffect(() => {
        if (!selectedStudentId && studentsForSelect[0]?.id) {
            setSelectedStudentId(studentsForSelect[0].id);
        }
    }, [selectedStudentId, studentsForSelect]);

    const threadId = mode === 'broadcast' ? CHAT_BROADCAST_THREAD_ID : (selectedStudentId ? getDirectChatThreadId(selectedStudentId) : '');
    const targetStudent = students.find(s => s.id === selectedStudentId);
    const getStudentName = (s: any) => s?.name || s?.displayName || s?.fullName || s?.nama || 'Tanpa Nama';

    const fetchThread = async () => {
        if (!threadId) return setMessages([]);
        try {
            setLoading(true);
            const snap = await getDocs(query(collection(db, 'chatMessages'), where('threadId', '==', threadId), orderBy('createdAt', 'asc')));
            setMessages(snap.docs.map((d: any) => ({ id: d.id, ...d.data() })));
        } catch (e) {
            console.error('Error fetching chatMessages:', e);
            setMessages([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchThread();
    }, [threadId]);

    const handleSend = async () => {
        const msg = text.trim();
        if (!msg) return;
        if (mode === 'direct' && !selectedStudentId) return alert('Pilih siswa terlebih dahulu!');

        const payload: Omit<ChatMessage, 'id'> = {
            threadId,
            studentId: mode === 'direct' ? selectedStudentId : null,
            kind: mode === 'direct' ? 'direct' : 'broadcast',
            senderRole: 'admin',
            senderUserId: user?.uid || user?.id || null,
            message: msg,
            createdAt: new Date().toISOString()
        };

        await addDoc(collection(db, 'chatMessages'), payload);
        setText('');
        fetchThread();
    };

    return (
        <div className="p-6 h-full flex flex-col gap-4">
            <div className="flex items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-black tracking-tighter">Pesan / Chat</h2>
                    <p className="text-sm text-text-secondary">Komunikasi admin dengan siswa atau broadcast.</p>
                </div>
                <div className="flex gap-2">
                    <button onClick={() => setMode('direct')} className={`btn-small ${mode === 'direct' ? 'bg-slate-900 text-yellow-400' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>Chat Siswa</button>
                    <button onClick={() => setMode('broadcast')} className={`btn-small ${mode === 'broadcast' ? 'bg-slate-900 text-yellow-400' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>Broadcast</button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 flex-1 min-h-0">
                <div className="card !p-4 lg:col-span-1 flex flex-col gap-3 min-h-0">
                    <p className="text-[10px] font-black uppercase tracking-widest text-text-secondary">
                        {mode === 'broadcast' ? 'Broadcast' : 'Pilih Siswa'}
                    </p>
                    {mode === 'direct' ? (
                        <div className="space-y-2">
                            <select className="p-2 rounded border border-border w-full bg-white" value={selectedStudentId} onChange={(e) => setSelectedStudentId(e.target.value)}>
                                {studentsForSelect.map(s => (
                                    <option key={s.id} value={s.id}>{getStudentName(s)}</option>
                                ))}
                            </select>
                            <div className="p-3 rounded-xl bg-slate-50 border border-border">
                                <div className="text-xs font-bold">{targetStudent ? getStudentName(targetStudent) : '-'}</div>
                                <div className="text-[10px] text-slate-500">Thread: {threadId || '-'}</div>
                            </div>
                        </div>
                    ) : (
                        <div className="p-3 rounded-xl bg-slate-50 border border-border">
                            <div className="text-xs font-bold">Broadcast ke semua siswa</div>
                            <div className="text-[10px] text-slate-500">Thread: {CHAT_BROADCAST_THREAD_ID}</div>
                        </div>
                    )}
                </div>

                <div className="card !p-0 lg:col-span-2 flex flex-col min-h-0">
                    <div className="p-4 border-b border-border bg-slate-50/50 flex items-center justify-between">
                        <div className="min-w-0">
                            <div className="text-xs font-black uppercase tracking-widest truncate">
                                {mode === 'broadcast' ? 'Broadcast' : (targetStudent ? `Chat: ${getStudentName(targetStudent)}` : 'Chat')}
                            </div>
                            <div className="text-[10px] text-slate-400 truncate">{threadId || '-'}</div>
                        </div>
                        <button onClick={fetchThread} className="btn-small bg-slate-100 hover:bg-slate-200 text-slate-700">Refresh</button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/30">
                        {loading ? (
                            <div className="text-center py-12 text-slate-400 italic">Memuat pesan...</div>
                        ) : messages.length === 0 ? (
                            <div className="text-center py-12 text-slate-400 italic">Belum ada pesan.</div>
                        ) : messages.map((message) => {
                            const mine = message.senderRole === 'admin';
                            return (
                                <div key={message.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm shadow-sm ${mine ? 'bg-slate-900 text-white' : 'bg-white border border-border text-slate-700'}`}>
                                        <p className="whitespace-pre-wrap">{message.message}</p>
                                        <p className={`text-[10px] mt-2 ${mine ? 'text-slate-300' : 'text-slate-400'}`}>{new Date(message.createdAt).toLocaleString('id-ID')}</p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    <div className="p-4 border-t border-border bg-white flex gap-2">
                        <textarea
                            className="flex-1 min-h-[44px] max-h-28 p-3 rounded-xl border border-border outline-none text-sm resize-none focus:border-accent"
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                            placeholder="Tulis pesan..."
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleSend();
                                }
                            }}
                        />
                        <button onClick={handleSend} className="btn-primary px-4 flex items-center gap-2" disabled={!threadId || !text.trim()}>
                            <Send size={16} /> Kirim
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

function StudentMessagesView({ user, studentId }: { user: any; students: Student[]; studentId: string }) {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [loading, setLoading] = useState(false);
    const [text, setText] = useState('');
    const threadId = studentId ? getDirectChatThreadId(studentId) : '';

    const fetchThread = async () => {
        if (!threadId) return setMessages([]);
        try {
            setLoading(true);
            const [directSnap, broadcastSnap] = await Promise.all([
                getDocs(query(collection(db, 'chatMessages'), where('threadId', '==', threadId), orderBy('createdAt', 'asc'))),
                getDocs(query(collection(db, 'chatMessages'), where('threadId', '==', CHAT_BROADCAST_THREAD_ID), orderBy('createdAt', 'asc')))
            ]);
            const rows = [...directSnap.docs, ...broadcastSnap.docs]
                .map((d: any) => ({ id: d.id, ...d.data() } as ChatMessage))
                .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
            setMessages(rows);
        } catch (e) {
            console.error('Error fetching student chatMessages:', e);
            setMessages([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchThread();
    }, [threadId]);

    const handleSend = async () => {
        const msg = text.trim();
        if (!msg || !threadId) return;
        await addDoc(collection(db, 'chatMessages'), {
            threadId,
            studentId,
            kind: 'direct',
            senderRole: 'student',
            senderUserId: user?.uid || user?.id || null,
            message: msg,
            createdAt: new Date().toISOString()
        });
        setText('');
        fetchThread();
    };

    return (
        <div className="p-6 h-full flex flex-col gap-4">
            <div>
                <h2 className="text-2xl font-black tracking-tighter">Pesan / Chat</h2>
                <p className="text-sm text-text-secondary">Komunikasi dengan admin sekolah.</p>
            </div>
            <div className="card !p-0 flex-1 min-h-0 flex flex-col overflow-hidden">
                <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/30">
                    {loading ? (
                        <div className="text-center py-12 text-slate-400 italic">Memuat pesan...</div>
                    ) : messages.length === 0 ? (
                        <div className="text-center py-12 text-slate-400 italic">Belum ada pesan.</div>
                    ) : messages.map((message) => {
                        const mine = message.senderRole === 'student';
                        return (
                            <div key={message.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm shadow-sm ${mine ? 'bg-slate-900 text-white' : 'bg-white border border-border text-slate-700'}`}>
                                    {message.kind === 'broadcast' && <p className="text-[10px] font-black uppercase tracking-widest text-amber-500 mb-1">Broadcast</p>}
                                    <p className="whitespace-pre-wrap">{message.message}</p>
                                    <p className={`text-[10px] mt-2 ${mine ? 'text-slate-300' : 'text-slate-400'}`}>{new Date(message.createdAt).toLocaleString('id-ID')}</p>
                                </div>
                            </div>
                        );
                    })}
                </div>
                <div className="p-4 border-t border-border bg-white flex gap-2">
                    <textarea
                        className="flex-1 min-h-[44px] max-h-28 p-3 rounded-xl border border-border outline-none text-sm resize-none focus:border-accent"
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        placeholder="Tulis pesan..."
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSend();
                            }
                        }}
                    />
                    <button onClick={handleSend} className="btn-primary px-4 flex items-center gap-2" disabled={!threadId || !text.trim()}>
                        <Send size={16} /> Kirim
                    </button>
                </div>
            </div>
        </div>
    );
}

function AcademicView({ students, classes }: { students: Student[]; classes: Class[] }) {
    return (
        <div className="p-6 h-full">
            <div className="card space-y-3">
                <h2 className="text-2xl font-black tracking-tighter uppercase">Akademik & Ijazah</h2>
                <p className="text-sm text-text-secondary">
                    Modul akademik belum memiliki komponen aktif di file aplikasi ini. Data siswa tersedia: {students.length}, kelas: {classes.length}.
                </p>
            </div>
        </div>
    );
}

function UsersManagementView({ students, classes }: { students: Student[]; classes: Class[] }) {
    const [users, setUsers] = useState<UserAccount[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAdd, setShowAdd] = useState(false);
    const [showPrintAccount, setShowPrintAccount] = useState<UserAccount | null>(null);
    const [editingUser, setEditingUser] = useState<UserAccount | null>(null);
    const [roleFilter, setRoleFilter] = useState<string>('all');
    const [bulkClassId, setBulkClassId] = useState<string>('');
    const [bulkPassword, setBulkPassword] = useState<string>('');
    const [bulkSkipExisting, setBulkSkipExisting] = useState(true);
    const [bulkCreating, setBulkCreating] = useState(false);
    const [formData, setFormData] = useState<Partial<UserAccount>>({
        email: '',
        displayName: '',
        role: 'student',
        studentId: '',
        username: '',
        password: ''
    });

    const filteredUsers = users.filter(u => roleFilter === 'all' || u.role === roleFilter);
    const studentsForSelect = sortStudentsForSelect(students);

    const renderCardHtml = (u: UserAccount) => `
        <div id="card-render-target" style="background:#f8fafc;border-radius:24px;padding:32px;width:400px;position:relative;overflow:hidden;font-family:sans-serif;">
            <div style="position:absolute;top:0;left:0;right:0;height:4px;background:linear-gradient(90deg,#6366f1,#8b5cf6);"></div>
            <div style="display:flex;align-items:center;gap:16px;margin-bottom:32px;">
                <div style="width:56px;height:56px;border-radius:16px;background:#1e293b;display:flex;align-items:center;justify-content:center;">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#facc15" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                </div>
                <div>
                    <div style="font-weight:900;font-size:20px;color:#0f172a;">EduFlow Access</div>
                    <div style="font-size:10px;font-weight:700;color:#94a3b8;letter-spacing:0.2em;text-transform:uppercase;">Credentials Card</div>
                </div>
            </div>
            <div style="background:white;padding:24px;border-radius:16px;margin-bottom:16px;border:1px solid #e2e8f0;">
                <div style="font-size:9px;font-weight:900;color:#94a3b8;text-transform:uppercase;letter-spacing:0.15em;margin-bottom:16px;">Informasi Pengguna</div>
                <div style="margin-bottom:16px;">
                    <div style="font-size:10px;color:#64748b;margin-bottom:4px;font-weight:700;">NAMA LENGKAP</div>
                    <div style="font-weight:900;font-size:20px;color:#0f172a;">${u.displayName}</div>
                </div>
                <div style="display:flex;gap:32px;">
                    <div>
                        <div style="font-size:10px;color:#64748b;margin-bottom:4px;font-weight:700;">PERAN</div>
                        <div style="font-weight:900;color:#0f172a;text-transform:uppercase;">${u.role}</div>
                    </div>
                    ${u.role === 'student' ? '<div><div style="font-size:10px;color:#64748b;margin-bottom:4px;font-weight:700;">STATUS</div><div style="font-weight:700;color:#16a34a;font-style:italic;">Terverifikasi</div></div>' : ''}
                </div>
            </div>
            <div style="background:#1e293b;padding:24px;border-radius:16px;margin-bottom:16px;">
                <div style="font-size:9px;font-weight:900;color:#facc1566;text-transform:uppercase;letter-spacing:0.15em;margin-bottom:16px;">Login Kredensial</div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
                    <div>
                        <div style="font-size:9px;color:#94a3b8;font-weight:700;text-transform:uppercase;margin-bottom:2px;">Username</div>
                        <div style="font-family:monospace;font-weight:900;font-size:18px;color:white;letter-spacing:0.05em;">${u.username || '-'}</div>
                    </div>
                    <div>
                        <div style="font-size:9px;color:#94a3b8;font-weight:700;text-transform:uppercase;margin-bottom:2px;">Password</div>
                        <div style="font-family:monospace;font-weight:900;font-size:18px;color:white;background:rgba(255,255,255,0.1);padding:2px 8px;border-radius:6px;">${u.password || '-'}</div>
                    </div>
                </div>
            </div>
            <div style="text-align:center;">
                <div style="font-size:9px;color:#94a3b8;font-weight:700;font-style:italic;">Simpan kartu ini dengan baik. Jangan berikan akses akun Anda kepada siapapun.</div>
            </div>
        </div>`;

    const downloadCardJpg = async (u: UserAccount) => {
        const tmp = document.createElement('div');
        tmp.style.cssText = 'position:fixed;left:-9999px;top:-9999px;z-index:-1;';
        tmp.innerHTML = renderCardHtml(u);
        document.body.appendChild(tmp);
        const cardEl = tmp.querySelector('#card-render-target') as HTMLElement;
        try {
            const canvas = await html2canvas(cardEl, { scale: 2, useCORS: true, backgroundColor: null });
            const a = document.createElement('a');
            a.download = `KartuAkses_${u.displayName || u.username}.jpg`;
            a.href = canvas.toDataURL('image/jpeg', 0.95);
            a.click();
        } finally {
            document.body.removeChild(tmp);
        }
    };

    const [downloadingAll, setDownloadingAll] = useState(false);
    const downloadAllCardsJpg = async () => {
        if (filteredUsers.length === 0) return;
        setDownloadingAll(true);
        for (const u of filteredUsers) {
            await downloadCardJpg(u);
            await new Promise(r => setTimeout(r, 300));
        }
        setDownloadingAll(false);
    };

    const slugifyUsername = (v: string) =>
        String(v || '')
            .toLowerCase()
            .normalize('NFKD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/g, '.')
            .replace(/(^\\.)|(\\.$)/g, '')
            .slice(0, 24);

    const generatePassword = () => String(Math.floor(100000 + Math.random() * 900000));

    const buildDefaultUsernameForStudent = (s: Student) => {
        const base = String(s.nisn || s.nis || '').trim();
        if (base) return base;
        const namePart = slugifyUsername(s.name || 'siswa');
        const numPart = s.attendanceNumber != null ? String(s.attendanceNumber) : '';
        const candidate = [numPart, namePart].filter(Boolean).join('.');
        return candidate || `siswa.${String(s.id).slice(0, 6)}`;
    };

    const makeUniqueUsername = (candidate: string, existing: Set<string>) => {
        let u = String(candidate || '').trim();
        if (!u) u = 'siswa';
        let attempt = 0;
        let out = u;
        while (existing.has(out)) {
            attempt += 1;
            out = `${u}.${attempt}`;
        }
        existing.add(out);
        return out;
    };

    const handleDownloadCSV = () => {
        const headers = ['Nama', 'Email', 'Username', 'Password', 'Role', 'Status Tautan'];
        const rows = filteredUsers.map(u => [
            u.displayName,
            u.email,
            u.username || '-',
            u.password || '-',
            u.role,
            u.role === 'student' ? (students.find(s => s.id === u.studentId)?.name || 'Belum ditautkan') : '-'
        ]);

        const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `Data_Akun_EduFlow_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const fetchUsers = async () => {
        setLoading(true);
        try {
            const q = query(collection(db, 'users'), orderBy('createdAt', 'desc'));
            const querySnapshot = await getDocs(q);
            const fetchedUsers: UserAccount[] = [];
            querySnapshot.forEach((doc) => {
                fetchedUsers.push({ id: doc.id, ...doc.data() } as UserAccount);
            });
            setUsers(fetchedUsers);
        } catch (error) {
            console.error("Error fetching users:", error);
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchUsers();
    }, []);

    useEffect(() => {
        if (!bulkClassId) {
            setBulkClassId(classes?.[0]?.id || '');
        }
    }, [classes, bulkClassId]);

    const handleBulkCreate = async () => {
        if (!bulkClassId) return alert('Pilih kelas terlebih dahulu.');
        const targetStudents = studentsForSelect.filter(s => s.classId === bulkClassId);
        if (targetStudents.length === 0) return alert('Tidak ada siswa di kelas ini.');

        const existingUsernames = new Set(users.map(u => String(u.username || '').trim()).filter(Boolean));
        const existingStudentIdLinked = new Set(users.filter(u => u.role === 'student' && u.studentId).map(u => String(u.studentId)));

        const toCreate: Array<{ id: string; row: any }> = [];
        for (const s of targetStudents) {
            const alreadyLinked = existingStudentIdLinked.has(String(s.id));
            if (bulkSkipExisting && alreadyLinked) continue;

            const baseUsername = buildDefaultUsernameForStudent(s);
            const username = makeUniqueUsername(baseUsername, existingUsernames);
            const password = bulkPassword.trim() ? bulkPassword.trim() : generatePassword();
            const email = String(s.email || '').trim() || `${username}@eduflow.local`;

            const newId = Math.random().toString(36).substr(2, 9);
            toCreate.push({
                id: newId,
                row: {
                    uid: '',
                    email,
                    displayName: s.name,
                    role: 'student',
                    studentId: s.id,
                    username,
                    password,
                    createdAt: new Date().toISOString()
                }
            });
        }

        if (toCreate.length === 0) return alert('Semua siswa sudah punya akun (tidak ada yang dibuat).');
        if (!confirm(`Buat ${toCreate.length} akun siswa untuk kelas ini?`)) return;

        try {
            setBulkCreating(true);
            for (const item of toCreate) {
                await setDoc(doc(db, 'users', item.id), item.row);
            }
            alert(`Berhasil membuat ${toCreate.length} akun siswa.`);
            fetchUsers();
        } catch (e) {
            console.error('Bulk create users error:', e);
            alert('Gagal membuat akun massal. Coba lagi.');
        } finally {
            setBulkCreating(false);
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.email || !formData.displayName) return alert('Email dan Nama wajib diisi');

        try {
            if (editingUser) {
                await updateDoc(doc(db, 'users', editingUser.id), {
                    ...formData,
                    createdAt: formData.createdAt || new Date().toISOString()
                });
            } else {
                const newId = Math.random().toString(36).substr(2, 9);
                await setDoc(doc(db, 'users', newId), {
                    ...formData,
                    uid: '',
                    createdAt: new Date().toISOString()
                });
            }
            setShowAdd(false);
            setEditingUser(null);
            setFormData({ email: '', displayName: '', role: 'student', studentId: '', username: '', password: '' });
            fetchUsers();
        } catch (error) {
            console.error("Error saving user:", error);
            alert("Gagal menyimpan akun. Pastikan rules Firestore sudah benar.");
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Hapus akun ini?')) return;
        try {
            await deleteDoc(doc(db, 'users', id));
            fetchUsers();
        } catch (error) {
            console.error("Error deleting user:", error);
        }
    };

    return (
        <div className="p-6 space-y-6 overflow-y-auto h-full pb-20">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h2 className="text-3xl font-black tracking-tighter uppercase">Manajemen Akun</h2>
                    <p className="text-sm text-text-secondary">Kelola akses pengguna dan tautkan akun ke data siswa.</p>
                </div>
                <div className="flex gap-2 w-full md:w-auto">
                    <button
                        onClick={handleDownloadCSV}
                        className="btn-secondary flex items-center gap-2 justify-center flex-1 md:flex-initial"
                    >
                        <Download size={18} /> CSV
                    </button>
                    <button
                        onClick={downloadAllCardsJpg}
                        disabled={downloadingAll || filteredUsers.length === 0}
                        className="btn-secondary flex items-center gap-2 justify-center flex-1 md:flex-initial disabled:opacity-60"
                        title="Download Semua Kartu Akses sebagai JPG"
                    >
                        {downloadingAll ? (
                            <><span className="animate-spin border-2 border-emerald-500 border-t-transparent w-4 h-4 rounded-full inline-block" /> Memproses...</>
                        ) : (
                            <><Download size={18} /> Semua JPG</>
                        )}
                    </button>
                    <button
                        onClick={() => { setShowAdd(true); setEditingUser(null); setFormData({ email: '', displayName: '', role: 'student', studentId: '', username: '', password: '' }); }}
                        className="btn-primary flex items-center gap-2 flex-1 md:flex-initial justify-center"
                    >
                        <UserPlus size={18} /> Tambah Akun
                    </button>
                </div>
            </div>

            <div className="card border border-border">
                <div className="flex flex-col lg:flex-row gap-4 items-end">
                    <div className="flex-1 space-y-1">
                        <label className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] block ml-1">Buat Akun Massal (per Kelas)</label>
                        <select className="w-full p-3 border border-border rounded-xl font-bold text-sm bg-white outline-none" value={bulkClassId} onChange={e => setBulkClassId(e.target.value)}>
                            <option value="">Pilih kelas...</option>
                            {classes.map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                        </select>
                    </div>
                    <div className="w-full lg:w-[260px] space-y-1">
                        <label className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] block ml-1">Password Default (opsional)</label>
                        <input
                            type="text"
                            className="w-full p-3 border border-border rounded-xl font-mono text-sm outline-none"
                            placeholder="Kosongkan = acak per siswa"
                            value={bulkPassword}
                            onChange={e => setBulkPassword(e.target.value)}
                        />
                    </div>
                    <div className="flex items-center gap-2 w-full lg:w-auto pb-2">
                        <input id="bulkSkipExisting" type="checkbox" className="w-4 h-4" checked={bulkSkipExisting} onChange={e => setBulkSkipExisting(e.target.checked)} />
                        <label htmlFor="bulkSkipExisting" className="text-xs font-bold text-slate-600">Lewati siswa yang sudah punya akun</label>
                    </div>
                    <button
                        onClick={handleBulkCreate}
                        disabled={bulkCreating}
                        className="btn-primary flex items-center gap-2 justify-center w-full lg:w-auto disabled:opacity-50"
                        title="Buat akun individual untuk semua siswa dalam kelas"
                    >
                        <Users size={18} /> {bulkCreating ? 'Membuat...' : 'Buat Akun Massal'}
                    </button>
                </div>
                <p className="text-[11px] text-slate-500 mt-3 leading-relaxed">
                    Akun dibuat per siswa (bukan per kelas). Username otomatis (prioritas: NISN/NIS, lalu nama+absen) dan dapat diubah kapan saja lewat tombol Edit.
                </p>
            </div>

            <div className="flex gap-4 items-center bg-white p-4 rounded-xl border border-border shadow-sm">
                <Search size={18} className="text-slate-400" />
                <select
                    title="Filter berdasarkan Peran"
                    className="bg-transparent text-sm font-bold outline-none flex-1"
                    value={roleFilter}
                    onChange={e => setRoleFilter(e.target.value)}
                >
                    <option value="all">Semua Peran</option>
                    <option value="admin">Administrator</option>
                    <option value="student">Siswa</option>
                </select>
                <div className="text-[10px] font-black uppercase text-slate-400 bg-slate-50 px-2 py-1 rounded">
                    {filteredUsers.length} AKUN
                </div>
            </div>

            <div className="grid grid-cols-1 gap-6">
                <div className="card !p-0 overflow-hidden shadow-sm border border-border">
                    <div className="overflow-x-auto">
                        <table className="data-table w-full">
                            <thead>
                                <tr className="bg-slate-50 border-b border-border">
                                    <th className="p-4 text-left text-[10px] uppercase font-black tracking-widest text-slate-400">Pengguna</th>
                                    <th className="p-4 text-left text-[10px] uppercase font-black tracking-widest text-slate-400">Akses Kredensial</th>
                                    <th className="p-4 text-left text-[10px] uppercase font-black tracking-widest text-slate-400">Peran</th>
                                    <th className="p-4 text-left text-[10px] uppercase font-black tracking-widest text-slate-400">Status Tautan</th>
                                    <th className="p-4 text-right text-[10px] uppercase font-black tracking-widest text-slate-400">Aksi</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {loading ? (
                                    <tr><td colSpan={5} className="p-12 text-center"><Activity className="animate-spin mx-auto text-accent" /></td></tr>
                                ) : filteredUsers.length === 0 ? (
                                    <tr><td colSpan={5} className="p-12 text-center text-slate-400 font-medium tracking-tight">Tidak ada akun dengan peran ini.</td></tr>
                                ) : filteredUsers.map(u => (
                                    <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                                        <td className="p-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-accent/10 text-accent flex items-center justify-center font-black text-xs uppercase">
                                                    {u.displayName.charAt(0)}
                                                </div>
                                                <div className="font-bold text-sm">{u.displayName}</div>
                                            </div>
                                        </td>
                                        <td className="p-4">
                                            <div className="flex flex-col gap-1">
                                                <div className="text-xs font-black font-mono bg-slate-100 rounded px-1.5 py-0.5 w-fit">ID: {u.username || '-'}</div>
                                                <div className="text-xs font-mono text-slate-400 italic">PW: {u.password || '-'}</div>
                                                <div className="text-[10px] text-slate-400">{u.email}</div>
                                            </div>
                                        </td>
                                        <td className="p-4">
                                            <span className={`px-2 py-1 rounded text-[10px] font-black uppercase tracking-wider ${u.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                                                {u.role}
                                            </span>
                                        </td>
                                        <td className="p-4">
                                            {u.role === 'student' ? (
                                                u.studentId ? (
                                                    <div className="flex items-center gap-2 text-xs text-slate-700 font-medium">
                                                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                                        {students.find(s => s.id === u.studentId)?.name || 'Siswa tidak ditemukan'}
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center gap-2 text-[10px] text-red-500 font-black uppercase tracking-tighter italic">
                                                        <AlertCircle size={10} /> Belum ditautkan
                                                    </div>
                                                )
                                            ) : <span className="text-slate-300">—</span>}
                                        </td>
                                        <td className="p-4">
                                            <div className="flex justify-end gap-1">
                                                <button
                                                    onClick={() => setShowPrintAccount(u)}
                                                    className="p-2 hover:bg-slate-200 rounded-lg text-slate-500 transition-all active:scale-95"
                                                    title="Cetak Kartu Akses"
                                                >
                                                    <Printer size={16} />
                                                </button>
                                                <button
                                                    onClick={() => { setEditingUser(u); setFormData(u); setShowAdd(true); }}
                                                    className="p-2 hover:bg-slate-200 rounded-lg text-slate-500 transition-all active:scale-95"
                                                >
                                                    <Edit size={16} />
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(u.id)}
                                                    className="p-2 hover:bg-red-50 rounded-lg text-red-500 transition-all active:scale-95"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <AnimatePresence>
                {showPrintAccount && (
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[110]">
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            className="bg-white rounded-3xl p-8 w-full max-w-lg shadow-2xl overflow-hidden relative"
                        >
                            <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-accent via-indigo-500 to-purple-500" />
                            <div className="flex justify-between items-center mb-8 no-print">
                                <h3 className="text-xl font-black tracking-tighter uppercase">Preview Kartu Akses</h3>
                                <button onClick={() => setShowPrintAccount(null)} className="p-2 hover:bg-slate-100 rounded-full" title="Tutup Preview">
                                    <X size={20} />
                                </button>
                            </div>

                            {/* MODERN PRINT CARD */}
                            <div id="print-area" className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-3xl p-8 relative overflow-hidden print:border-none print:bg-white print:p-0">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-accent/5 rounded-full -mr-16 -mt-16" />
                                <div className="flex items-center gap-4 mb-8">
                                    <div className="w-16 h-16 rounded-2xl bg-slate-900 flex items-center justify-center text-yellow-400">
                                        <Activity size={32} />
                                    </div>
                                    <div>
                                        <h4 className="font-black text-xl tracking-tight text-slate-900">EduFlow Access</h4>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.3em]">Credentials Card</p>
                                    </div>
                                </div>

                                <div className="space-y-6 relative z-10">
                                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                                        <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-4">Informasi Pengguna</p>
                                        <div className="space-y-4">
                                            <div>
                                                <p className="text-[10px] text-slate-500 mb-1 font-bold">NAMA LENGKAP</p>
                                                <p className="font-black text-lg text-slate-900">{showPrintAccount.displayName}</p>
                                            </div>
                                            <div className="flex gap-8">
                                                <div>
                                                    <p className="text-[10px] text-slate-500 mb-1 font-bold">PERAN</p>
                                                    <p className="font-black text-slate-900 uppercase">{showPrintAccount.role}</p>
                                                </div>
                                                {showPrintAccount.role === 'student' && (
                                                    <div>
                                                        <p className="text-[10px] text-slate-500 mb-1 font-bold">STATUS</p>
                                                        <p className="font-bold text-emerald-600 text-sm italic">Terverifikasi</p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="bg-slate-900 text-white p-6 rounded-2xl shadow-xl">
                                        <p className="text-[9px] font-black uppercase text-yellow-400/60 tracking-widest mb-4">Login Kredensial</p>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <p className="text-[9px] text-slate-400 mb-0.5 font-bold uppercase">Username</p>
                                                <p className="font-mono font-black text-lg tracking-wider">{showPrintAccount.username || '-'}</p>
                                            </div>
                                            <div>
                                                <p className="text-[9px] text-slate-400 mb-0.5 font-bold uppercase">Password</p>
                                                <p className="font-mono font-black text-lg tracking-wider bg-white/10 px-2 rounded">{showPrintAccount.password || '-'}</p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="text-center pt-2">
                                        <p className="text-[9px] font-bold text-slate-400 leading-relaxed italic">
                                            Simpan kartu ini dengan baik. Jangan berikan akses <br />
                                            akun Anda kepada siapapun.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="mt-8 flex gap-3 no-print">
                                <button onClick={() => setShowPrintAccount(null)} className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-slate-200 transition-all">Tutup</button>
                                <button onClick={() => downloadCardJpg(showPrintAccount)} className="flex-1 py-4 bg-emerald-600 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-lg shadow-emerald-500/30 hover:bg-emerald-700 transition-all flex items-center justify-center gap-2">
                                    <Download size={14} /> Download JPG
                                </button>
                                <button onClick={() => window.print()} className="flex-1 py-4 bg-accent text-white rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-lg shadow-accent/30 hover:bg-accent-dark transition-all">Print Kartu</button>
                            </div>
                        </motion.div>
                    </div>
                )}

                {showAdd && (
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.95, opacity: 0, y: 20 }}
                            className="bg-white rounded-3xl p-8 w-full max-w-md shadow-2xl border border-white/20"
                        >
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-xl font-black tracking-tighter uppercase">{editingUser ? 'Edit Akun' : 'Tambah Akun baru'}</h3>
                                <button onClick={() => setShowAdd(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors" title="Tutup Modal">
                                    <X size={20} />
                                </button>
                            </div>
                            <form onSubmit={handleSave} className="space-y-5">
                                <div>
                                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] block mb-1.5 ml-1">Nama Lengkap</label>
                                    <input
                                        type="text"
                                        className="w-full p-3 border border-border rounded-xl font-bold text-sm focus:ring-4 focus:ring-accent/5 focus:border-accent outline-none transition-all"
                                        value={formData.displayName}
                                        onChange={e => setFormData({ ...formData, displayName: e.target.value })}
                                        placeholder="Nama tampilan pengguna"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] block mb-1.5 ml-1">Email</label>
                                    <input
                                        type="email"
                                        className="w-full p-3 border border-border rounded-xl font-mono text-sm focus:ring-4 focus:ring-accent/5 focus:border-accent outline-none transition-all"
                                        value={formData.email}
                                        onChange={e => setFormData({ ...formData, email: e.target.value })}
                                        placeholder="user@sekolah.id"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] block mb-1.5 ml-1">Username</label>
                                        <input
                                            type="text"
                                            className="w-full p-3 border border-border rounded-xl font-mono text-sm focus:ring-4 focus:ring-accent/5 focus:border-accent outline-none transition-all"
                                            value={formData.username}
                                            onChange={e => setFormData({ ...formData, username: e.target.value })}
                                            placeholder="admin / NISN"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] block mb-1.5 ml-1">Password</label>
                                        <input
                                            type="text"
                                            className="w-full p-3 border border-border rounded-xl font-mono text-sm focus:ring-4 focus:ring-accent/5 focus:border-accent outline-none transition-all"
                                            value={formData.password}
                                            onChange={e => setFormData({ ...formData, password: e.target.value })}
                                            placeholder="******"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] block mb-1.5 ml-1">Peran (Role)</label>
                                    <select
                                        title="Pilih Peran Akun"
                                        className="w-full p-3 border border-border rounded-xl font-bold text-sm bg-white focus:ring-4 focus:ring-accent/5 focus:border-accent outline-none transition-all appearance-none cursor-pointer"
                                        value={formData.role}
                                        onChange={e => setFormData({ ...formData, role: e.target.value as UserRole, studentId: e.target.value === 'admin' ? '' : formData.studentId })}
                                    >
                                        <option value="student">Siswa / Orang Tua</option>
                                        <option value="admin">Administrator Sekolah</option>
                                    </select>
                                </div>
                                {formData.role === 'student' && (
                                    <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: 'auto', opacity: 1 }}
                                        className="overflow-hidden"
                                    >
                                        <label className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] block mb-1.5 ml-1">Tautkan Berdasarkan Nama Siswa</label>
                                        <select
                                            title="Tautkan ke Data Siswa"
                                            className="w-full p-3 border border-border rounded-xl font-bold text-sm bg-white focus:ring-4 focus:ring-accent/5 focus:border-accent outline-none transition-all appearance-none cursor-pointer"
                                            value={formData.studentId}
                                            onChange={e => setFormData({ ...formData, studentId: e.target.value })}
                                        >
                                            <option value="">-- Pilih Siswa --</option>
                                            {sortStudentsForSelect(students).map(s => (
                                                <option key={s.id} value={s.id}>{s.name} ({s.nisn || 'No NISN'})</option>
                                            ))}
                                        </select>
                                    </motion.div>
                                )}
                                <div className="flex gap-3 pt-4">
                                    <button type="button" onClick={() => setShowAdd(false)} className="flex-1 p-4 bg-slate-100 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-slate-200 transition-colors">Batal</button>
                                    <button type="submit" className="flex-1 p-4 bg-slate-900 text-yellow-400 rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-lg shadow-slate-900/30 hover:bg-slate-950 transition-all active:scale-[0.98]">Simpan</button>
                                </div>
                            </form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}

function StudentDashboardView({
    settings,
    attendance,
    grades,
    studentId,
    students,
    payments,
    savings,
    classCash,
    feeItems,
    classes,
    holidays
}: {
    settings: AppSettings | null,
    attendance: AttendanceRecord[],
    grades: Grade[],
    studentId: string | null,
    students: Student[],
    payments: StudentPayment[],
    savings: SavingsTransaction[],
    classCash: ClassCashTransaction[],
    feeItems: FeeItem[],
    classes: Class[],
    holidays: Holiday[]
}) {
    const displaySettings = settings?.studentDisplaySettings || {
        showGrades: true,
        showAttendance: true,
        showPayments: true,
        showSavings: true,
        showClassCash: true
    };

    const student = students.find(s => s.id === studentId);
    const myGrades = grades.filter(g => g.studentId === studentId);
    const myAttendance = attendance.filter(a => a.studentId === studentId);
    const myPayments = payments.filter(p => p.studentId === studentId);
    const mySavings = savings.filter(s => s.studentId === studentId);
    const myClassCash = classCash.filter(c => c.studentId === studentId);

    const [academicRecord, setAcademicRecord] = useState<any>(null);
    const [academicLoading, setAcademicLoading] = useState(false);
    const [activeRapotSem, setActiveRapotSem] = useState<'s41' | 's42' | 's51' | 's52' | 's61'>('s41');

    const [academicConfig, setAcademicConfig] = useState<{ subjects: { id: string, name: string }[] }>({ subjects: [] });
    const [ijazahConfig, setIjazahConfig] = useState<{ subjects: { id: string, name: string }[] }>({ subjects: [] });

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(amount);
    };

    useEffect(() => {
        if (!studentId) return;
        let cancelled = false;
        (async () => {
            try {
                setAcademicLoading(true);
                const configSnap = await getDoc(doc(db, 'settings', 'academic_config'));
                if (!cancelled && configSnap.exists()) {
                    setAcademicConfig({ subjects: configSnap.data().subjects || [] });
                }
                const ijazahSnap = await getDoc(doc(db, 'settings', 'ijazah_config'));
                if (!cancelled) {
                    if (ijazahSnap.exists()) {
                        setIjazahConfig({ subjects: ijazahSnap.data().subjects || [] });
                    } else {
                        const initIjazah = [
                            'Pendidikan Agama & Budi Pekerti', 'PPKn', 'Bahasa Indonesia', 'Matematika',
                            'IPA', 'IPS', 'SBdP', 'PJOK', 'Bahasa Jawa', 'Bahasa Inggris'
                        ].map((m, i) => ({ id: `ij${i}`, name: m }));
                        setIjazahConfig({ subjects: initIjazah });
                    }
                }

                const snap = await getDoc(doc(db, 'academicRecords', String(studentId)));
                if (cancelled) return;
                if (snap.exists()) {
                    const d = snap.data();
                    const rawIjazah = d?.ijazah || {};
                    const ijazahMap = Array.isArray(rawIjazah) 
                        ? rawIjazah.reduce((acc: any, curr: any, idx: number) => {
                            const id = curr.id || `ij${idx}`;
                            acc[id] = curr;
                            return acc;
                        }, {})
                        : rawIjazah;

                    setAcademicRecord({
                        ...d,
                        tka: d?.tka ?? '',
                        rapot: d?.rapot ?? {},
                        prestasi: Array.isArray(d?.prestasi) ? d.prestasi : [],
                        ijazah: ijazahMap
                    });
                } else {
                    setAcademicRecord({ studentId: String(studentId), rapot: {}, prestasi: [], ijazah: {}, tka: '' });
                }
            } catch (error) {
                console.error("Student academic fetch error:", error);
                if (!cancelled) setAcademicRecord({ studentId: String(studentId), rapot: {}, prestasi: [], ijazah: {}, tka: '' });
            } finally {
                if (!cancelled) setAcademicLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [studentId]);

    const monthStr = new Date().toISOString().slice(0, 7);
    const countTargetDays = (type: 'gemari' | 'infaq') => {
        const year = parseInt(monthStr.split('-')[0]);
        const month = parseInt(monthStr.split('-')[1]) - 1;
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        let targetDays = 0;
        for (let day = 1; day <= daysInMonth; day++) {
            const d = new Date(year, month, day);
            const dateStr = [d.getFullYear(), ('0' + (d.getMonth() + 1)).slice(-2), ('0' + d.getDate()).slice(-2)].join('-');
            const isHoliday = holidays.some(h => h.date === dateStr);
            const dayOfWeek = d.getDay();
            if (type === 'gemari') {
                if (dayOfWeek !== 0 && !isHoliday) targetDays++;
            } else {
                if (dayOfWeek === 5 && !isHoliday) targetDays++;
            }
        }
        return targetDays;
    };

    const cashNominal = (type: 'gemari' | 'infaq') => type === 'gemari' ? 500 : 1000;
    const getCashRecap = (type: 'gemari' | 'infaq') => {
        if (!student?.classId || !studentId) return { targetDays: 0, bebasDays: 0, target: 0, paid: 0, kurang: 0 };
        const nominal = cashNominal(type);
        const targetDays = countTargetDays(type);
        const target = targetDays * nominal;
        const bebasDates = new Set(
            classCash
                .filter(t => String((t as any)?.classId || '') === String(student.classId))
                .filter(t => t.type === type && (t.date || '').startsWith(monthStr) && Number(t.amount) === 0)
                .map(t => t.date)
        );
        const targetReal = Math.max(0, target - (bebasDates.size * nominal));
        const paid = myClassCash
            .filter(t => t.type === type && (t.date || '').startsWith(monthStr))
            .filter(t => (t as any).transactionType ? (t as any).transactionType === 'deposit' : true)
            .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
        const kurang = Math.max(0, targetReal - paid);
        return { targetDays, bebasDays: bebasDates.size, target: targetReal, paid, kurang };
    };

    const gemari = getCashRecap('gemari');
    const infaq = getCashRecap('infaq');

    const paymentsByItem: Record<string, number> = {};
    myPayments.forEach(p => { paymentsByItem[p.feeItemId] = (paymentsByItem[p.feeItemId] || 0) + (Number(p.amountPaid) || 0); });

    const extraBills = (student?.paymentExtraBills || []).map(b => ({ ...b, amount: Number(b.amount) || 0 }));
    const extraBillsTotal = extraBills.reduce((sum, b) => sum + (Number(b.amount) || 0), 0);

    return (
        <div className="p-6 space-y-8 overflow-y-auto h-full pb-20 max-w-4xl mx-auto">
            <header className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-black tracking-tighter uppercase mb-1">Halo, {student?.name || 'Siswa'}</h1>
                    <p className="text-sm text-text-secondary font-medium tracking-tight">Berikut adalah ringkasan perkembangan dan administrasi Anda.</p>
                </div>
                <div className="hidden md:block text-right">
                    <div className="text-[10px] font-black uppercase text-slate-400 tracking-widest">{student?.nisn || 'No NISN'}</div>
                    <div className="font-bold text-sm text-accent uppercase tracking-tighter">{classes.find(c => c.id === student?.classId)?.name || 'Tanpa Kelas'}</div>
                </div>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {displaySettings.showAttendance && (
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="card space-y-4">
                        <div className="flex items-center gap-2 text-emerald-600 mb-2">
                            <CalendarCheck size={18} />
                            <h3 className="font-black text-sm uppercase tracking-tight">Kehadiran</h3>
                        </div>
                        <div className="flex items-end gap-3 p-4 bg-emerald-50/50 rounded-2xl border border-emerald-100">
                            <div className="text-4xl font-black text-emerald-600">{student?.attendance || 0}%</div>
                            <div className="text-[10px] font-bold text-emerald-500 uppercase pb-1 tracking-widest leading-none">Kehadiran<br />Rata-Rata</div>
                        </div>
                        <div className="flex justify-between text-[10px] font-black text-slate-400 px-1 uppercase tracking-widest">
                            <span>Hadir: {myAttendance.filter(a => a.status === 'hadir').length}</span>
                            <span>Izin/Sakit: {myAttendance.filter(a => a.status !== 'hadir').length}</span>
                        </div>
                    </motion.div>
                )}

            </div>


            {/* Akademik (Rapot/TKA/Ijazah/Prestasi) */}
            {displaySettings.showGrades && (
                <div className="card space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-purple-700">
                            <FileText size={18} />
                            <h3 className="font-black text-sm uppercase tracking-tight">Nilai Rapot, TKA, Ijazah & Prestasi</h3>
                        </div>
                        {academicLoading && <span className="text-[10px] font-bold text-slate-400 italic">Memuat...</span>}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="p-3 bg-slate-50 rounded-xl border border-border">
                            <div className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Nilai TKA</div>
                            <div className="text-2xl font-black text-purple-700">{academicRecord?.tka ?? '-'}</div>
                        </div>
                        <div className="p-3 bg-slate-50 rounded-xl border border-border md:col-span-2">
                            <div className="overflow-x-auto shadow-sm rounded-xl border border-border">
                                <table className="w-full text-xs border-collapse">
                                    <thead>
                                        <tr className="bg-slate-100/50">
                                            <th rowSpan={2} className="border-b border-r border-border p-2 text-left text-[9px] font-black uppercase tracking-widest text-slate-500">Mata Pelajaran</th>
                                            <th colSpan={2} className="border-b border-r border-border p-1 text-center bg-blue-50/50 text-[9px] font-black text-blue-700">Kelas 4</th>
                                            <th colSpan={2} className="border-b border-r border-border p-1 text-center bg-emerald-50/50 text-[9px] font-black text-emerald-700">Kelas 5</th>
                                            <th className="border-b border-border p-1 text-center bg-amber-50/50 text-[9px] font-black text-amber-700">Kelas 6</th>
                                        </tr>
                                        <tr className="bg-slate-50/50">
                                            <th className="border-b border-r border-border p-1 text-center w-12 text-[8px] font-bold text-slate-400">S1</th>
                                            <th className="border-b border-r border-border p-1 text-center w-12 text-[8px] font-bold text-slate-400">S2</th>
                                            <th className="border-b border-r border-border p-1 text-center w-12 text-[8px] font-bold text-slate-400">S1</th>
                                            <th className="border-b border-r border-border p-1 text-center w-12 text-[8px] font-bold text-slate-400">S2</th>
                                            <th className="border-b border-border p-1 text-center w-12 text-[8px] font-bold text-slate-400">S1</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {academicConfig.subjects.length === 0 ? (
                                            <tr><td colSpan={6} className="py-8 text-center text-slate-400 italic font-medium">Data mata pelajaran belum dikonfigurasi admin.</td></tr>
                                        ) : (() => {
                                            const getColTot = (k: 's41'|'s42'|'s51'|'s52'|'s61') => {
                                                let s = 0, c = 0;
                                                academicConfig.subjects.forEach(sub => {
                                                    const v = Number(academicRecord?.rapot?.[sub.id]?.[k]);
                                                    if (!isNaN(v) && v > 0) { s += v; c++; }
                                                });
                                                return { sum: s, avg: c > 0 ? (s/c).toFixed(1) : '-' };
                                            };
                                            const t41 = getColTot('s41'); const t42 = getColTot('s42'); const t51 = getColTot('s51'); const t52 = getColTot('s52'); const t61 = getColTot('s61');
                                            return (
                                                <>
                                                    {academicConfig.subjects.map((sub) => {
                                                        const g = academicRecord?.rapot?.[sub.id] || {};
                                                        return (
                                                            <tr key={sub.id} className="hover:bg-slate-50 transition-colors">
                                                                <td className="p-2 border-b border-r border-border font-bold text-slate-700">{sub.name}</td>
                                                                <td className="p-2 border-b border-r border-border text-center font-mono font-black text-blue-600">{g.s41 || '-'}</td>
                                                                <td className="p-2 border-b border-r border-border text-center font-mono font-black text-blue-600">{g.s42 || '-'}</td>
                                                                <td className="p-2 border-b border-r border-border text-center font-mono font-black text-emerald-600">{g.s51 || '-'}</td>
                                                                <td className="p-2 border-b border-r border-border text-center font-mono font-black text-emerald-600">{g.s52 || '-'}</td>
                                                                <td className="p-2 border-b border-border text-center font-mono font-black text-amber-600">{g.s61 || '-'}</td>
                                                            </tr>
                                                        );
                                                    })}
                                                    <tr className="bg-slate-50/80 hover:bg-slate-50 transition-colors border-t-2 border-slate-200">
                                                        <td className="p-2 border-b border-r border-border font-black text-right text-[10px] uppercase tracking-widest text-slate-500">Jumlah</td>
                                                        <td className="p-2 border-b border-r border-border text-center font-mono font-black text-blue-600">{t41.sum || '-'}</td>
                                                        <td className="p-2 border-b border-r border-border text-center font-mono font-black text-blue-600">{t42.sum || '-'}</td>
                                                        <td className="p-2 border-b border-r border-border text-center font-mono font-black text-emerald-600">{t51.sum || '-'}</td>
                                                        <td className="p-2 border-b border-r border-border text-center font-mono font-black text-emerald-600">{t52.sum || '-'}</td>
                                                        <td className="p-2 border-b border-border text-center font-mono font-black text-amber-600">{t61.sum || '-'}</td>
                                                    </tr>
                                                    <tr className="bg-slate-100/50 hover:bg-slate-100 transition-colors border-t border-slate-200">
                                                        <td className="p-2 border-b border-r border-border font-black text-right text-[10px] uppercase tracking-widest text-slate-500">Rata-Rata</td>
                                                        <td className="p-2 border-b border-r border-border text-center font-mono font-black text-blue-800">{t41.avg}</td>
                                                        <td className="p-2 border-b border-r border-border text-center font-mono font-black text-blue-800">{t42.avg}</td>
                                                        <td className="p-2 border-b border-r border-border text-center font-mono font-black text-emerald-800">{t51.avg}</td>
                                                        <td className="p-2 border-b border-r border-border text-center font-mono font-black text-emerald-800">{t52.avg}</td>
                                                        <td className="p-2 border-b border-border text-center font-mono font-black text-amber-800">{t61.avg}</td>
                                                    </tr>
                                                </>
                                            );
                                        })()}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="p-4 bg-amber-50/40 rounded-2xl border border-amber-100 space-y-2">
                            <div className="flex items-center justify-between">
                                <div className="text-[10px] font-black uppercase text-amber-700 tracking-widest">Nilai Ijazah</div>
                                <div className="text-[10px] text-amber-700 font-bold">{ijazahConfig.subjects.length} mapel</div>
                            </div>
                            {ijazahConfig.subjects.length === 0 ? (
                                <div className="text-xs text-slate-400 italic text-center py-3">Belum ada konfigurasi mapel ijazah.</div>
                            ) : (
                                <div className="space-y-2">
                                    {ijazahConfig.subjects.slice(0, 10).map((sub, i) => {
                                        const iz = academicRecord?.ijazah?.[sub.id] || { grade_p: '', grade_k: '' };
                                        return (
                                            <div key={sub.id} className="flex justify-between items-center bg-white rounded-xl p-3 border border-amber-100 shadow-sm">
                                                <div className="text-xs font-bold text-slate-700 truncate pr-2">{sub.name}</div>
                                                <div className="flex gap-1 shrink-0">
                                                    <span className="w-10 text-center font-mono text-xs font-black text-blue-700 bg-blue-50 py-1 rounded border border-blue-100">{iz.grade_p || '-'}</span>
                                                    <span className="w-10 text-center font-mono text-xs font-black text-emerald-700 bg-emerald-50 py-1 rounded border border-emerald-100">{iz.grade_k || '-'}</span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                    {ijazahConfig.subjects.length > 10 && (
                                        <div className="text-[10px] text-amber-700 text-center italic font-bold uppercase tracking-widest pt-1">+{ijazahConfig.subjects.length - 10} mapel lainnya</div>
                                    )}
                                </div>
                            )}
                        </div>
                        <div className="p-4 bg-violet-50/40 rounded-2xl border border-violet-100 space-y-2">
                            <div className="flex items-center justify-between">
                                <div className="text-[10px] font-black uppercase text-violet-700 tracking-widest">Prestasi</div>
                                <div className="text-[10px] text-violet-700 font-bold">{(academicRecord?.prestasi || []).length} data</div>
                            </div>
                            {(academicRecord?.prestasi || []).length === 0 ? (
                                <div className="text-xs text-slate-400 italic text-center py-3">Belum ada data prestasi.</div>
                            ) : (
                                <div className="space-y-2">
                                    {(academicRecord?.prestasi || []).slice(0, 6).map((p: any, i: number) => (
                                        <div key={i} className="bg-white rounded-xl p-3 border border-violet-100">
                                            <div className="flex justify-between items-start gap-3">
                                                <div className="min-w-0">
                                                    <div className="text-xs font-bold truncate">{p.name || '-'}</div>
                                                    <div className="text-[10px] text-slate-400 font-mono">{p.level || '-'} • {p.year || '-'}</div>
                                                </div>
                                                <div className="text-xs font-black text-violet-700">{p.poin ?? ''}</div>
                                            </div>
                                        </div>
                                    ))}
                                    {(academicRecord?.prestasi || []).length > 6 && (
                                        <div className="text-[10px] text-violet-700 text-center italic">+{(academicRecord?.prestasi || []).length - 6} prestasi lainnya</div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Keuangan (Tabungan + Pembayaran + Gemari/Infaq) */}
            {(displaySettings.showPayments || displaySettings.showSavings || displaySettings.showClassCash) && (
                <div className="card space-y-4">
                    <div className="flex items-center gap-2 text-emerald-700">
                        <Wallet size={18} />
                        <h3 className="font-black text-sm uppercase tracking-tight">Rekap Keuangan</h3>
                    </div>

                    {displaySettings.showSavings && (
                        <div className="p-4 bg-emerald-50/40 rounded-2xl border border-emerald-100 space-y-3">
                            <div className="flex justify-between items-center">
                                <div className="text-[10px] font-black uppercase text-emerald-700 tracking-widest">Tabungan</div>
                                <div className="text-sm font-black text-emerald-700">
                                    {formatCurrency(mySavings.filter(t => t.type === 'deposit').reduce((a, t) => a + t.amount, 0) - mySavings.filter(t => t.type === 'withdrawal').reduce((a, t) => a + t.amount, 0))}
                                </div>
                            </div>
                            {(mySavings.length === 0) ? (
                                <div className="text-xs text-slate-400 italic text-center py-2">Belum ada transaksi tabungan.</div>
                            ) : (
                                <div className="space-y-2">
                                    {[...mySavings].sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 8).map(t => (
                                        <div key={t.id} className="flex justify-between items-center bg-white rounded-xl p-3 border border-emerald-100">
                                            <div>
                                                <div className="text-xs font-bold">{t.type === 'deposit' ? 'Setor' : 'Tarik'}</div>
                                                <div className="text-[10px] text-slate-400 font-mono">{t.date}</div>
                                            </div>
                                            <div className={`text-xs font-black font-mono ${t.type === 'deposit' ? 'text-emerald-700' : 'text-red-600'}`}>{formatCurrency(t.amount)}</div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {displaySettings.showPayments && (
                        <div className="p-4 bg-blue-50/40 rounded-2xl border border-blue-100 space-y-3">
                            <div className="flex justify-between items-center">
                                <div className="text-[10px] font-black uppercase text-blue-700 tracking-widest">Rekap Pembayaran</div>
                                <div className="text-sm font-black text-blue-700">{formatCurrency(myPayments.reduce((acc, p) => acc + (Number(p.amountPaid) || 0), 0))}</div>
                            </div>

                            <div className="overflow-x-auto">
                                <table className="w-full text-xs">
                                    <thead>
                                        <tr className="text-[10px] uppercase tracking-widest text-slate-400">
                                            <th className="text-left py-2 pr-3">Item</th>
                                            <th className="text-right py-2 px-2">Tagihan</th>
                                            <th className="text-right py-2 px-2">Dibayar</th>
                                            <th className="text-right py-2 pl-2">Kurang</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {feeItems.length === 0 ? (
                                            <tr><td colSpan={4} className="py-6 text-center text-slate-400 italic">Belum ada item tagihan.</td></tr>
                                        ) : (
                                            feeItems.map(i => {
                                                const due = Number((i as any).amount) || 0;
                                                const paid = Number(paymentsByItem[i.id]) || 0;
                                                const kurang = Math.max(0, due - paid);
                                                return (
                                                    <tr key={i.id} className="border-t border-blue-100/60">
                                                        <td className="py-2 pr-3">
                                                            <div className="font-bold">{i.name}</div>
                                                            <div className="text-[10px] text-slate-400 uppercase">{i.category}</div>
                                                        </td>
                                                        <td className="py-2 px-2 text-right font-mono">{formatCurrency(due)}</td>
                                                        <td className="py-2 px-2 text-right font-mono text-emerald-700 font-black">{formatCurrency(paid)}</td>
                                                        <td className="py-2 pl-2 text-right font-mono text-red-600 font-black">{formatCurrency(kurang)}</td>
                                                    </tr>
                                                );
                                            })
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            {extraBills.length > 0 && (
                                <div className="pt-2 border-t border-blue-100 space-y-2">
                                    <div className="text-[10px] font-black uppercase tracking-widest text-blue-600">Tagihan Lain-lain</div>
                                    {extraBills.map(b => (
                                        <div key={b.id} className="flex justify-between items-center bg-white rounded-xl p-3 border border-blue-100">
                                            <div className="text-xs font-bold">{b.label}</div>
                                            <div className="text-xs font-black font-mono text-red-600">{formatCurrency(b.amount)}</div>
                                        </div>
                                    ))}
                                    <div className="flex justify-between items-center text-xs font-black text-blue-700 pt-1">
                                        <span>Total Lain-lain</span>
                                        <span className="font-mono">{formatCurrency(extraBillsTotal)}</span>
                                    </div>
                                </div>
                            )}

                            <div className="pt-2 border-t border-blue-100 space-y-2">
                                <div className="text-[10px] font-black uppercase tracking-widest text-blue-600">Gemari & Infaq ({monthStr})</div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                    <div className="bg-white rounded-xl p-3 border border-blue-100 flex justify-between items-center">
                                        <div className="text-xs font-black text-slate-700">Gemari</div>
                                        <div className="text-xs font-black font-mono text-red-600">{formatCurrency(gemari.kurang)}</div>
                                    </div>
                                    <div className="bg-white rounded-xl p-3 border border-blue-100 flex justify-between items-center">
                                        <div className="text-xs font-black text-slate-700">Infaq Jumat</div>
                                        <div className="text-xs font-black font-mono text-red-600">{formatCurrency(infaq.kurang)}</div>
                                    </div>
                                </div>
                            </div>

                            <div className="pt-2 border-t border-blue-100 space-y-2">
                                <div className="text-[10px] font-black uppercase tracking-widest text-blue-600">Riwayat Pembayaran Terbaru</div>
                                {(myPayments.length === 0) ? (
                                    <div className="text-xs text-slate-400 italic text-center py-2">Belum ada transaksi pembayaran.</div>
                                ) : (
                                    <div className="space-y-2">
                                        {[...myPayments].sort((a, b) => (b.paymentDate || '').localeCompare(a.paymentDate || '')).slice(0, 10).map(p => (
                                            <div key={p.id} className="flex justify-between items-center bg-white rounded-xl p-3 border border-blue-100">
                                                <div className="min-w-0">
                                                    <div className="text-xs font-bold truncate">{feeItems.find(i => i.id === p.feeItemId)?.name || p.feeItemId}</div>
                                                    <div className="text-[10px] text-slate-400 font-mono">{p.paymentDate} • {(p.paymentMethod || '').toUpperCase()}</div>
                                                </div>
                                                <div className="text-xs font-black font-mono text-blue-700">{formatCurrency(Number(p.amountPaid) || 0)}</div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {!displaySettings.showGrades && !displaySettings.showAttendance && !displaySettings.showPayments && !displaySettings.showSavings && !displaySettings.showClassCash && (
                <div className="card p-12 text-center space-y-4">
                    <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto">
                        <AlertCircle size={32} className="text-slate-300" />
                    </div>
                    <div>
                        <h3 className="font-bold text-lg">Informasi Dibatasi</h3>
                        <p className="text-sm text-text-secondary">Administrator sekolah membatasi visibilitas informasi saat ini.</p>
                    </div>
                </div>
            )}
        </div>
    );
}

function SettingsView({ settings, onSettingsSaved }: { settings: AppSettings, onSettingsSaved: () => void }) {
    const [formData, setFormData] = useState<AppSettings>(withDefaultFeatures(settings));
    const [saving, setSaving] = useState(false);

    const colors = [
        { label: 'Biru (Default)', value: '#3B82F6' },
        { label: 'Hijau', value: '#10B981' },
        { label: 'Merah', value: '#EF4444' },
        { label: 'Ungu', value: '#8B5CF6' },
        { label: 'Kuning', value: '#F59E0B' },
        { label: 'Hitam', value: '#0F172A' }
    ];

    const handleSave = async () => {
        setSaving(true);
        await setDoc(doc(db, 'settings', 'global'), formData);
        setSaving(false);
        onSettingsSaved();
        alert('Pengaturan berhasil disimpan!');
        window.location.reload(); // Reload to apply theme
    };

    const toggleFeature = (feature: keyof NonNullable<AppSettings['features']>) => {
        setFormData({
            ...formData,
            features: {
                ...DEFAULT_APP_FEATURES,
                ...(formData.features || {}),
                [feature]: !(formData.features?.[feature] ?? true)
            }
        });
    };

    return (
        <div className="p-6 max-w-5xl mx-auto space-y-6 overflow-y-auto h-full pb-20">
            <div>
                <h2 className="text-3xl font-black tracking-tighter uppercase whitespace-nowrap overflow-hidden text-ellipsis w-full">Konfigurasi Sistem</h2>
                <p className="text-sm text-text-secondary whitespace-nowrap overflow-hidden text-ellipsis w-full">Kelola identitas institusi, preferensi visual, dan modul aktif aplikasi.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                    <div className="card space-y-4">
                        <h3 className="font-bold border-b border-border pb-2 flex items-center gap-2">
                            <Building2 size={18} /> Profil & Identitas Sekolah
                        </h3>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                            <div className="col-span-full">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Nama Aplikasi / Branding</label>
                                <input
                                    type="text"
                                    className="w-full p-3 border border-border rounded-xl mt-1 font-bold text-sm bg-slate-50 focus:bg-white outline-none focus:border-accent transition-all"
                                    value={formData.appName}
                                    onChange={(e) => setFormData({ ...formData, appName: e.target.value })}
                                    placeholder="Misal: Siakad Pintar"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Nama Sekolah Lengkap</label>
                                <input
                                    type="text"
                                    className="w-full p-3 border border-border rounded-xl mt-1 font-bold text-sm bg-slate-50 focus:bg-white outline-none focus:border-accent transition-all"
                                    value={formData.schoolName}
                                    onChange={(e) => setFormData({ ...formData, schoolName: e.target.value })}
                                    placeholder="SD Negeri Contoh"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">NPSN Sekolah</label>
                                <input
                                    type="text"
                                    className="w-full p-3 border border-border rounded-xl mt-1 font-mono text-sm bg-slate-50 focus:bg-white outline-none focus:border-accent transition-all"
                                    value={formData.schoolNpsn || ''}
                                    onChange={(e) => setFormData({ ...formData, schoolNpsn: e.target.value })}
                                    placeholder="8 Digit NPSN"
                                />
                            </div>
                            <div className="col-span-full">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Kontak & Email</label>
                                <input
                                    type="text"
                                    className="w-full p-3 border border-border rounded-xl mt-1 text-sm bg-slate-50 focus:bg-white outline-none focus:border-accent transition-all"
                                    value={formData.schoolContact || ''}
                                    onChange={(e) => setFormData({ ...formData, schoolContact: e.target.value })}
                                    placeholder="Email / Telepon"
                                />
                            </div>
                            <div className="col-span-full">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Alamat Lengkap Sekolah</label>
                                <textarea
                                    className="w-full p-3 border border-border rounded-xl mt-1 min-h-[80px] text-sm bg-slate-50 focus:bg-white outline-none focus:border-accent transition-all"
                                    value={formData.schoolAddress}
                                    onChange={(e) => setFormData({ ...formData, schoolAddress: e.target.value })}
                                    placeholder="Alamat sekolah..."
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Kepala Sekolah</label>
                                <input
                                    type="text"
                                    className="w-full p-3 border border-border rounded-xl mt-1 font-bold text-sm bg-slate-50 focus:bg-white outline-none focus:border-accent transition-all"
                                    value={formData.headmasterName}
                                    onChange={(e) => setFormData({ ...formData, headmasterName: e.target.value })}
                                    placeholder="Nama Lengkap & Gelar"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">NIP Kepala Sekolah</label>
                                <input
                                    type="text"
                                    className="w-full p-3 border border-border rounded-xl mt-1 font-mono text-sm bg-slate-50 focus:bg-white outline-none focus:border-accent transition-all"
                                    value={formData.headmasterNip || ''}
                                    onChange={(e) => setFormData({ ...formData, headmasterNip: e.target.value })}
                                    placeholder="18 Digit NIP"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="card space-y-4">
                        <h3 className="font-bold border-b border-border pb-2 flex items-center gap-2 text-blue-600">
                            <Zap size={18} /> Modul & Fitur Aplikasi
                        </h3>
                        <p className="text-[10px] uppercase font-black text-slate-400 tracking-widest">Aktifkan atau nonaktifkan fitur untuk merampingkan navigasi.</p>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                            {[
                                { key: 'enableAttendance', label: 'Modul Presensi', icon: <CalendarCheck size={16} /> },
                                { key: 'enablePayments', label: 'Manajemen Pembayaran', icon: <CreditCard size={16} /> },
                                { key: 'enableSavings', label: 'Tabungan Siswa', icon: <Wallet size={16} /> },
                                { key: 'enableClassCash', label: 'GEMARI', icon: <Coins size={16} /> },
                                { key: 'enableInfaq', label: 'INFAQ Jumat', icon: <Sparkles size={16} /> },
                                { key: 'enableAcademic', label: 'Akademik & Ijazah', icon: <FileSpreadsheet size={16} /> },
                            ].map(feature => (
                                <div key={feature.key} className="flex items-center justify-between p-3 border border-border rounded-xl bg-slate-50/50">
                                    <div className="flex items-center gap-2">
                                        <div className="text-slate-400">{feature.icon}</div>
                                        <span className="text-xs font-bold">{feature.label}</span>
                                    </div>
                                    <button
                                        onClick={() => toggleFeature(feature.key as any)}
                                        className={`w-10 h-5 rounded-full transition-all relative ${formData.features?.[feature.key as keyof typeof formData.features] ?? true ? 'bg-success' : 'bg-slate-300'}`}
                                    >
                                        <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${formData.features?.[feature.key as keyof typeof formData.features] ?? true ? 'left-5.5' : 'left-0.5'}`} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="card space-y-4">
                        <h3 className="font-bold border-b border-border pb-2 flex items-center gap-2 text-amber-600">
                            <AlertCircle size={18} /> Batasan Akses Siswa
                        </h3>
                        <p className="text-[10px] uppercase font-black text-slate-400 tracking-widest">Tentukan data apa saja yang dapat dilihat oleh akun siswa di dashboard mereka.</p>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                            {[
                                { key: 'showGrades', label: 'Tampilkan Nilai', icon: <Grid size={16} /> },
                                { key: 'showAttendance', label: 'Tampilkan Presensi', icon: <CalendarCheck size={16} /> },
                                { key: 'showPayments', label: 'Tampilkan Pembayaran', icon: <CreditCard size={16} /> },
                                { key: 'showSavings', label: 'Tampilkan Tabungan', icon: <Wallet size={16} /> },
                                { key: 'showClassCash', label: 'Tampilkan GEMARI', icon: <Coins size={16} /> },
                            ].map(item => (
                                <div key={item.key} className="flex items-center justify-between p-3 border border-border rounded-xl bg-amber-50/20">
                                    <div className="flex items-center gap-2">
                                        <div className="text-amber-500">{item.icon}</div>
                                        <span className="text-xs font-bold">{item.label}</span>
                                    </div>
                                    <button
                                        onClick={() => {
                                            setFormData({
                                                ...formData,
                                                studentDisplaySettings: {
                                                    ...(formData.studentDisplaySettings || { showGrades: true, showAttendance: true, showPayments: false, showSavings: false, showClassCash: false }),
                                                    [item.key]: !(formData.studentDisplaySettings?.[item.key as keyof StudentDisplaySettings] ?? false)
                                                }
                                            });
                                        }}
                                        className={`w-10 h-5 rounded-full transition-all relative ${formData.studentDisplaySettings?.[item.key as keyof StudentDisplaySettings] ? 'bg-amber-500' : 'bg-slate-300'}`}
                                    >
                                        <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${formData.studentDisplaySettings?.[item.key as keyof StudentDisplaySettings] ? 'left-5.5' : 'left-0.5'}`} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="space-y-6">
                    <div className="card h-min space-y-4">
                        <h3 className="font-bold border-b border-border pb-2 flex items-center gap-2 text-accent">
                            <Palette size={18} /> Kustomisasi Visual
                        </h3>

                        <div className="pt-2">
                            <label className="text-[10px] font-black text-slate-500 uppercase block mb-3 tracking-widest">Warna Aksen Utama</label>
                            <div className="grid grid-cols-2 gap-2">
                                {colors.map(c => (
                                    <button
                                        key={c.value}
                                        onClick={() => setFormData({ ...formData, themeColor: c.value })}
                                        className={`flex items-center gap-2 p-2 rounded-lg border transition-all ${formData.themeColor === c.value ? 'bg-slate-50 border-2 shadow-sm scale-[1.02]' : 'border border-border opacity-70 hover:opacity-100 bg-white'}`}
                                        style={{ borderColor: formData.themeColor === c.value ? c.value : '' }}
                                    >
                                        <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: c.value }} />
                                        <span className="text-[10px] font-black truncate">{c.label}</span>
                                    </button>
                                ))}
                                <div className="col-span-full mt-2">
                                    <label className="text-[10px] uppercase font-black text-slate-400 mb-1 block tracking-tighter">Hex Kustom</label>
                                    <div className="flex gap-2">
                                        <input
                                            type="color"
                                            value={formData.themeColor}
                                            onChange={e => setFormData({ ...formData, themeColor: e.target.value })}
                                            className="w-10 h-10 p-1 border border-border rounded-xl cursor-pointer"
                                        />
                                        <input
                                            type="text"
                                            value={formData.themeColor}
                                            onChange={e => setFormData({ ...formData, themeColor: e.target.value })}
                                            className="flex-1 px-3 border border-border rounded-xl outline-none font-mono text-xs uppercase font-bold focus:border-accent"
                                            placeholder="#3B82F6"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="card bg-slate-900 text-white border-slate-800 shadow-xl relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-all">
                            <Settings size={120} className="animate-spin-slow" />
                        </div>
                        <div className="relative z-10">
                            <h4 className="font-black text-sm uppercase mb-2">Simpan Perubahan</h4>
                            <p className="text-xs text-slate-400 mb-6">Pastikan seluruh data profil sudah benar sebelum disimpan. Sistem akan memuat ulang untuk menerapkan tema.</p>
                            <button
                                onClick={handleSave}
                                disabled={saving}
                                className="w-full py-4 bg-slate-800 hover:bg-slate-700 text-yellow-400 rounded-xl font-black uppercase tracking-[0.2em] text-[10px] shadow-lg shadow-black/30 transition-all flex items-center justify-center gap-3 disabled:opacity-50 border border-slate-700"
                            >
                                {saving ? <Activity className="animate-spin" size={16} /> : <Save size={16} />}
                                Terapkan Setting
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
