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
    LogOut
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db, collection, getDocs, doc, setDoc, updateDoc, deleteDoc, query, where, orderBy, getDoc, addDoc, supabase } from './firebase';
import { View, Student, Class, Assignment, Subject, Material, Grade, AttendanceRecord, AttendanceStatus, Holiday, AssessmentType, FeeItem, StudentPayment, SavingsTransaction, ClassCashTransaction, DashboardWidget, SchoolDeposit, AppSettings, UserAccount, UserRole, StudentDisplaySettings } from './types';
import { INDONESIA_HOLIDAYS_2026 } from './data/holidays';

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
    const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null);
    const [dashboardWidgets, setDashboardWidgets] = useState<DashboardWidget[]>([
        { id: '1', type: 'stats', title: 'Ringkasan Cepat', isVisible: true, order: 0 },
        { id: '2', type: 'arrears', title: 'Tunggakan Tertinggi', isVisible: true, order: 1 },
        { id: '3', type: 'recent_savings', title: 'Aktivitas Tabungan', isVisible: true, order: 2 },
        { id: '4', type: 'attendance_summary', title: 'Rekap Kehadiran', isVisible: true, order: 3 },
        { id: '5', type: 'cash_flow', title: 'Arus Kas Kelas', isVisible: true, order: 4 },
    ]);

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
            if (aVal === bVal) return 0;
            if (sortConfig.direction === 'asc') {
                return aVal < bVal ? -1 : 1;
            } else {
                return aVal > bVal ? -1 : 1;
            }
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

            const getCollectionData = async (colName: string) => {
                try {
                    const snap = await getDocs(collection(db, colName));
                    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                } catch (e) {
                    console.error(`Error fetching collection ${colName}:`, e);
                    return null;
                }
            };

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
                'classCashTransactions',
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
            const classCashData = dataMap.classCashTransactions;
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
                const settingsData = settingsDoc.data() as AppSettings;
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
                    features: {
                        enableSavings: true,
                        enableClassCash: true,
                        enableAcademic: true,
                        enablePayments: true,
                        enableAttendance: true
                    }
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
            case 'students':
                return <StudentsView
                    students={students}
                    classes={classes}
                    onRefresh={fetchData}
                    onViewProfile={(id) => {
                        setSelectedStudentId(id);
                        setCurrentView('student-profile');
                    }}
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
                    schoolDeposits={schoolDeposits}
                    onRefresh={fetchData}
                    onOpenPrint={() => setShowPrintModal(true)}
                    initialStudentId={selectedStudentId}
                    onCloseDetail={() => setSelectedStudentId(null)}
                    {...commonProps}
                />;
            case 'savings':
                return <SavingsView students={students} classes={classes} transactions={savings} onRefresh={fetchData} onOpenPrint={() => setShowPrintModal(true)} {...commonProps} />;
            case 'class-cash':
                return <ClassCashView
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
                return <UsersManagementView students={students} />;
            case 'settings':
                return <SettingsView settings={appSettings || { appName: '', schoolName: '', schoolAddress: '', headmasterName: '', themeColor: '#3B82F6', features: { enableSavings: true, enableClassCash: true, enableAcademic: true, enablePayments: true, enableAttendance: true } }} onSettingsSaved={fetchData} />;
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
                        active={currentView === 'dashboard'}
                        collapsed={isSidebarCollapsed}
                        onClick={() => { setCurrentView('dashboard'); if (window.innerWidth < 1024) setIsSidebarCollapsed(true); }}
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

                    {!isSidebarCollapsed && <div className="px-4 pt-4 pb-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Akademik</div>}
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
                    <NavItem
                        icon={<User size={20} />}
                        label="Manajemen Akun"
                        active={currentView === 'users'}
                        collapsed={isSidebarCollapsed}
                        onClick={() => { setCurrentView('users'); if (window.innerWidth < 1024) setIsSidebarCollapsed(true); }}
                    />

                    {!isSidebarCollapsed && (appSettings?.features?.enableAttendance || appSettings?.features?.enablePayments || appSettings?.features?.enableSavings) && (
                        <div className="px-4 pt-4 pb-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Administrasi</div>
                    )}
                    {(!appSettings?.features || appSettings.features.enableAttendance) && (
                        <NavItem
                            icon={<CalendarCheck size={20} />}
                            label="Presensi"
                            active={currentView === 'attendance'}
                            collapsed={isSidebarCollapsed}
                            onClick={() => { setCurrentView('attendance'); if (window.innerWidth < 1024) setIsSidebarCollapsed(true); }}
                        />
                    )}
                    {(!appSettings?.features || appSettings.features.enablePayments) && (
                        <NavItem
                            icon={<CreditCard size={20} />}
                            label="Pembayaran"
                            active={currentView === 'payments'}
                            collapsed={isSidebarCollapsed}
                            onClick={() => { setCurrentView('payments'); if (window.innerWidth < 1024) setIsSidebarCollapsed(true); }}
                        />
                    )}
                    {(!appSettings?.features || appSettings.features.enableSavings) && (
                        <NavItem
                            icon={<Wallet size={20} />}
                            label="Tabungan"
                            active={currentView === 'savings'}
                            collapsed={isSidebarCollapsed}
                            onClick={() => { setCurrentView('savings'); if (window.innerWidth < 1024) setIsSidebarCollapsed(true); }}
                        />
                    )}
                    {(!appSettings?.features || appSettings.features.enableClassCash) && (
                        <NavItem
                            icon={<Coins size={20} />}
                            label="KAS Kelas"
                            active={currentView === 'class-cash'}
                            collapsed={isSidebarCollapsed}
                            onClick={() => { setCurrentView('class-cash'); if (window.innerWidth < 1024) setIsSidebarCollapsed(true); }}
                        />
                    )}
                    {(!appSettings?.features || appSettings.features.enableAcademic) && (
                        <NavItem
                            icon={<FileSpreadsheet size={20} />}
                            label="Akademik & Ijazah"
                            active={currentView === 'academic'}
                            collapsed={isSidebarCollapsed}
                            onClick={() => { setCurrentView('academic'); if (window.innerWidth < 1024) setIsSidebarCollapsed(true); }}
                        />
                    )}
                    <NavItem
                        icon={<Settings size={20} />}
                        label="Pengaturan"
                        active={currentView === 'settings'}
                        collapsed={isSidebarCollapsed}
                        onClick={() => { setCurrentView('settings'); if (window.innerWidth < 1024) setIsSidebarCollapsed(true); }}
                    />
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
                            {currentView === 'dashboard' ? 'Ringkasan Dashboard' :
                                currentView === 'students' ? 'Database Siswa' :
                                    currentView === 'classes' ? 'Daftar Kelas' :
                                        currentView === 'subjects' ? 'Manajemen Mata Pelajaran' :
                                            currentView === 'grades' ? 'Manajemen Nilai Siswa' :
                                                currentView === 'payments' ? 'Pembayaran Uang Sekolah' :
                                                    currentView === 'savings' ? 'Tabungan Siswa' :
                                                        currentView === 'attendance' ? 'Presensi Siswa' :
                                                            currentView === 'class-cash' ? 'KAS & Infaq Kelas' : 'Pengaturan'}
                        </h1>
                        <div className="hidden sm:block h-4 w-px bg-border flex-shrink-0"></div>
                        <div className="hidden sm:block">
                            <ClockDisplay holidays={holidays} />
                        </div>
                    </div>
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
    const [selectedScoreType, setSelectedScoreType] = useState<'Pengetahuan' | 'Keterampilan'>('Pengetahuan');
    const [editMode, setEditMode] = useState<'manual' | 'bulk' | 'recap' | 'matrix'>('manual');
    const [bulkData, setBulkData] = useState<{ [key: string]: number }>({});
    const [savingId, setSavingId] = useState<string | null>(null);

    useEffect(() => {
        // Initialize bulk data with current values
        const initialBulk: { [key: string]: number } = {};
        students.forEach(s => {
            const grade = grades.find(g => g.studentId === s.id && g.materialId === selectedMaterialId && g.scoreType === selectedScoreType);
            initialBulk[s.id] = grade ? grade.value : 0;
        });
        setBulkData(initialBulk);
    }, [selectedMaterialId, selectedScoreType, grades, students]);

    const saveGradeEntries = async (entries: Array<{ studentId: string; materialId: string; scoreType: 'Pengetahuan' | 'Keterampilan'; value: number }>) => {
        for (const entry of entries) {
            const existing = grades.find(g =>
                g.studentId === entry.studentId &&
                g.materialId === entry.materialId &&
                g.scoreType === entry.scoreType
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
            scoreType: selectedScoreType,
            value: parseInt(value as any) || 0
        }));
        await saveGradeEntries(updates as Array<{ studentId: string; materialId: string; scoreType: 'Pengetahuan' | 'Keterampilan'; value: number }>);
        onRefresh();
    };

    const handleSaveSingle = async (studentId: string, value: number) => {
        setSavingId(studentId);
        await saveGradeEntries([{ studentId, materialId: selectedMaterialId, scoreType: selectedScoreType, value }]);
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

                                    {selectedMaterialId && (
                                        <div className="flex items-center gap-2">
                                            <label className="text-[10px] font-bold text-text-secondary uppercase tracking-widest" htmlFor="score-type-select">Jenis Nilai:</label>
                                            <select
                                                id="score-type-select"
                                                className="bg-white border border-border rounded px-2 py-1 text-xs font-bold outline-none"
                                                value={selectedScoreType}
                                                onChange={(e) => setSelectedScoreType(e.target.value as any)}
                                            >
                                                <option value="Pengetahuan">Pengetahuan</option>
                                                <option value="Keterampilan">Keterampilan</option>
                                            </select>
                                        </div>
                                    )}
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
                                                            value={editMode === 'manual' ? (grades.find(g => g.studentId === s.id && g.materialId === selectedMaterialId && g.scoreType === selectedScoreType)?.value ?? '') : (bulkData[s.id] || 0)}
                                                            onChange={e => {
                                                                const val = parseInt(e.target.value) || 0;
                                                                if (editMode === 'manual') {
                                                                    handleSaveSingle(s.id, val);
                                                                } else {
                                                                    setBulkData({ ...bulkData, [s.id]: val });
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
                                                    {grades.find(g => g.studentId === s.id && g.materialId === selectedMaterialId && g.scoreType === selectedScoreType) ? (
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
                                            <th colSpan={materials.filter(m => m.subjectId === selectedSubjectId && m.type === 'pengetahuan').length || 1} className="text-center border-r border-border text-blue-600 bg-blue-50/20">PENGETAHUAN</th>
                                            <th colSpan={materials.filter(m => m.subjectId === selectedSubjectId && m.type === 'keterampilan').length || 1} className="text-center border-r border-border text-emerald-600 bg-emerald-50/20">KETERAMPILAN</th>
                                            <th className="text-center border-r border-border text-orange-600 bg-orange-50/20">PTS</th>
                                            <th className="text-center border-r border-border text-purple-600 bg-purple-50/20">PAS</th>
                                            <th rowSpan={2} className="bg-accent/5 sticky right-0 z-10">NILAI AKHIR</th>
                                        </tr>
                                        <tr>
                                            {/* Pengetahuan */}
                                            {materials.filter(m => m.subjectId === selectedSubjectId && m.type === 'pengetahuan').map(m => (
                                                <th key={m.id} className="text-[9px] font-normal" title={m.title}>{m.title.substring(0, 10)}..</th>
                                            ))}
                                            {materials.filter(m => m.subjectId === selectedSubjectId && m.type === 'pengetahuan').length === 0 && <th className="text-[9px] opacity-30 text-center">-</th>}

                                            {/* Keterampilan */}
                                            {materials.filter(m => m.subjectId === selectedSubjectId && m.type === 'keterampilan').map(m => (
                                                <th key={m.id} className="text-[9px] font-normal" title={m.title}>{m.title.substring(0, 10)}..</th>
                                            ))}
                                            {materials.filter(m => m.subjectId === selectedSubjectId && m.type === 'keterampilan').length === 0 && <th className="text-[9px] opacity-30 text-center">-</th>}

                                            {/* PTS */}
                                            <th className="text-[9px] font-normal text-center">NILAI</th>

                                            {/* PAS */}
                                            <th className="text-[9px] font-normal text-center">NILAI</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {students.map(s => {
                                            const getAvg = (type: AssessmentType) => {
                                                const mats = materials.filter(m => m.subjectId === selectedSubjectId && m.type === type);
                                                if (mats.length === 0) return 0;
                                                let sum = 0;
                                                mats.forEach(m => {
                                                    const gp = grades.find(gr => gr.studentId === s.id && gr.materialId === m.id && gr.scoreType === 'Pengetahuan');
                                                    const gk = grades.find(gr => gr.studentId === s.id && gr.materialId === m.id && gr.scoreType === 'Keterampilan');
                                                    sum += gp ? gp.value : 0;
                                                    sum += gk ? gk.value : 0; // Or whatever formula. Just capturing both if exist
                                                });
                                                return sum / (mats.length * 2); // Taking average of P & K
                                            };

                                            const avgP = getAvg('pengetahuan');
                                            const avgK = getAvg('keterampilan');
                                            const avgPTS = getAvg('pts');
                                            const avgPAS = getAvg('pas');

                                            // Calculate NA based on 4 types
                                            const na = (avgP + avgK + avgPTS + avgPAS) / 4;

                                            return (
                                                <tr key={s.id}>
                                                    <td className="font-bold whitespace-nowrap border-r border-border px-4 py-2 sticky left-0 bg-white group-hover:bg-slate-50 z-10">{s.name}</td>
                                                    {/* Pengetahuan Grades */}
                                                    {materials.filter(m => m.subjectId === selectedSubjectId && m.type === 'pengetahuan').map(m => {
                                                        const gp = grades.find(gr => gr.studentId === s.id && gr.materialId === m.id && gr.scoreType === 'Pengetahuan');
                                                        return <td key={m.id} className="text-center font-mono text-xs">{gp ? gp.value : '-'}</td>;
                                                    })}
                                                    {materials.filter(m => m.subjectId === selectedSubjectId && m.type === 'pengetahuan').length === 0 && <td className="text-center opacity-30">-</td>}

                                                    {/* Keterampilan Grades */}
                                                    {materials.filter(m => m.subjectId === selectedSubjectId && m.type === 'keterampilan').map(m => {
                                                        const gk = grades.find(gr => gr.studentId === s.id && gr.materialId === m.id && gr.scoreType === 'Keterampilan');
                                                        return <td key={m.id} className="text-center font-mono text-xs">{gk ? gk.value : '-'}</td>;
                                                    })}
                                                    {materials.filter(m => m.subjectId === selectedSubjectId && m.type === 'keterampilan').length === 0 && <td className="text-center opacity-30">-</td>}

                                                    {/* PTS Grade */}
                                                    <td className="text-center font-mono text-xs border-l border-border bg-orange-50/5">{avgPTS > 0 ? avgPTS.toFixed(0) : '-'}</td>

                                                    {/* PAS Grade */}
                                                    <td className="text-center font-mono text-xs border-l border-border bg-purple-50/5">{avgPAS > 0 ? avgPAS.toFixed(0) : '-'}</td>

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
                                                            mats.forEach(m => {
                                                                const gp = grades.find(gr => gr.studentId === s.id && gr.materialId === m.id && gr.scoreType === 'Pengetahuan');
                                                                const gk = grades.find(gr => gr.studentId === s.id && gr.materialId === m.id && gr.scoreType === 'Keterampilan');
                                                                sum += gp ? gp.value : 0;
                                                                sum += gk ? gk.value : 0;
                                                            });
                                                            return sum / (mats.length * 2);
                                                        };

                                                        const avgP = getAvg('pengetahuan');
                                                        const avgK = getAvg('keterampilan');
                                                        const avgPTS = getAvg('pts');
                                                        const avgPAS = getAvg('pas');

                                                        const subMaterials = materials.filter(m => m.subjectId === sub.id);
                                                        const subTotal = subMaterials.length > 0 ? (avgP + avgK + avgPTS + avgPAS) / 4 : 0;

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
                                                onClick={() => onNavigate('class-cash')}
                                                className="w-full btn-small"
                                            >
                                                Lihat Rincian Kas
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

function StudentsView({ students, classes, onRefresh, onViewProfile, onSort, currentSort, sortedData, SortableTH }: { students: Student[], classes: Class[], onRefresh: () => void, onViewProfile: (id: string) => void, onSort: (k: string) => void, currentSort: any, sortedData: any, SortableTH: any }) {
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
        let p = '', row = [''], i = 0, s = true;
        for (let l of text) {
            if ('"' === l) {
                if (s && l === p) row[i] += l;
                s = !s;
            } else if (',' === l && s) { l = row[++i] = ''; }
            else row[i] += l;
            p = l;
        }
        return row;
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
                gender: (gender?.trim() ? (gender.trim().charAt(0).toUpperCase() === 'P' ? 'P' : 'L') : undefined) as 'L'|'P' | undefined,
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

function MonthlyAttendanceView({ students, month, attendanceRecords, classId, holidays }: { students: Student[], month: string, attendanceRecords: AttendanceRecord[], classId: string, holidays: Holiday[] }) {
    const [year, m] = month.split('-').map(Number);
    const daysInMonth = new Date(year, m, 0).getDate();
    const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

    const isHoliday = (date: Date) => {
        const day = date.getDay();
        const dateStr = date.toISOString().split('T')[0];

        if (day === 0) return { holiday: true, name: 'Minggu' }; // Sunday

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

    return (
        <div className="p-4 overflow-x-auto min-w-full">
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
                                const record = getAttendanceRecord(s.id, dateStr);
                                const holidayInfo = isHoliday(date);

                                return (
                                    <td key={d} className={`p-0 border border-border text-center ${holidayInfo.holiday ? 'bg-red-50/30' : ''}`}>
                                        {record ? (
                                            <div className={`w-full h-full min-h-[28px] flex items-center justify-center text-[10px] font-black ${record.status === 'hadir' ? 'text-success' :
                                                    record.status === 'izin' ? 'text-blue-500' :
                                                        record.status === 'sakit' ? 'text-yellow-500' :
                                                            'text-red-500'
                                                }`} title={`${dateStr}: ${record.status}`}>
                                                {record.status === 'hadir' ? '✓' : record.status[0].toUpperCase()}
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
                <div className="flex items-center gap-2"><div className="w-2 h-2 bg-success rounded-full"></div> Hadir (✓)</div>
                <div className="flex items-center gap-2"><div className="w-2 h-2 bg-blue-500 rounded-full"></div> Izin (I)</div>
                <div className="flex items-center gap-2"><div className="w-2 h-2 bg-yellow-500 rounded-full"></div> Sakit (S)</div>
                <div className="flex items-center gap-2"><div className="w-2 h-2 bg-red-500 rounded-full"></div> Alpa (A)</div>
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
        type: 'pengetahuan'
    });

    const handleAddMaterial = async () => {
        if (!selectedSubjectId || !newMaterial.title) return alert('Lengkapi data');
        await addDoc(collection(db, 'materials'), { ...newMaterial, subjectId: selectedSubjectId });
        setNewMaterial({ title: '', weight: 25, type: 'pengetahuan' });
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
                                                <span className={`text-[8px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-tighter ${m.type === 'pengetahuan' ? 'bg-blue-100 text-blue-600' :
                                                        m.type === 'keterampilan' ? 'bg-emerald-100 text-emerald-600' :
                                                            m.type === 'pts' ? 'bg-orange-100 text-orange-600' :
                                                                'bg-purple-100 text-purple-600'
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
                                    <option value="pengetahuan">Pengetahuan (Harian/Tugas)</option>
                                    <option value="keterampilan">Keterampilan (Praktek/Proyek)</option>
                                    <option value="pts">Penilaian Tengah Semester (PTS)</option>
                                    <option value="pas">Penilaian Akhir Semester (PAS)</option>
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

    const [newSchoolDeposit, setNewSchoolDeposit] = useState({
        classId: '',
        feeItemId: '',
        amount: 0,
        depositDate: new Date().toISOString().split('T')[0],
        notes: ''
    });

    const [newPayment, setNewPayment] = useState({
        studentId: initialStudentId || '',
        feeItemId: '',
        amountPaid: 0,
        paymentDate: new Date().toISOString().split('T')[0],
        paymentMethod: 'cash' as 'cash' | 'transfer' | 'bank',
        notes: '',
        isDeposit: false
    });

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
        await addDoc(collection(db, 'studentPayments'), newPayment);
        setShowAddPayment(false);
        setNewPayment({
            studentId: '',
            feeItemId: '',
            amountPaid: 0,
            paymentDate: new Date().toISOString().split('T')[0],
            paymentMethod: 'cash',
            notes: '',
            isDeposit: false
        });
        onRefresh();
    };

    const handleUpdatePayment = async () => {
        if (!editingPayment) return;
        const { id, ...payload } = editingPayment as any;
        await updateDoc(doc(db, 'studentPayments', id), payload);
        setEditingPayment(null);
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

    const filteredStudents = selectedClassId ? students.filter(s => s.classId === selectedClassId) : students;
    const totalRequired = feeItems.reduce((acc, item) => acc + (item.category === 'wajib' ? item.amount * students.length : 0), 0);
    const totalCollected = payments.reduce((acc, p) => acc + p.amountPaid, 0);

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
                    <button onClick={() => setShowAddPayment(true)} className="btn-primary flex items-center gap-2">
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
                                    <div className="w-10 h-10 bg-slate-900 text-yellow-400 rounded-full flex items-center justify-center font-black">
                                        {students.find(s => s.id === detailStudentId)?.name.charAt(0)}
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-lg">{students.find(s => s.id === detailStudentId)?.name}</h3>
                                        <p className="text-[10px] font-bold text-text-secondary uppercase">Rekapitulasi Pembayaran Personal</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => { setDetailStudentId(null); onCloseDetail?.(); }}
                                    className="p-2 hover:bg-slate-100 rounded-lg"
                                >
                                    <X size={20} />
                                </button>
                            </div>

                            <div className="flex-1 overflow-y-auto p-6 space-y-8">
                                {/* Summary Section */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="p-4 bg-white rounded-2xl border border-border">
                                        <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Total Terbayar</p>
                                        <p className="text-xl font-black text-accent">
                                            {formatCurrency(payments.filter(p => p.studentId === detailStudentId).reduce((acc, p) => acc + p.amountPaid, 0))}
                                        </p>
                                    </div>
                                    <div className="p-4 bg-white rounded-2xl border border-border">
                                        <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Status Tunggakan</p>
                                        {(() => {
                                            const paidAmount = payments.filter(p => p.studentId === detailStudentId).reduce((acc, p) => acc + p.amountPaid, 0);
                                            const required = feeItems.filter(i => i.category === 'wajib').reduce((acc, i) => acc + i.amount, 0);
                                            const bal = paidAmount - required;
                                            return (
                                                <p className={`text-xl font-black ${bal >= 0 ? 'text-success' : 'text-red-500'}`}>
                                                    {bal >= 0 ? 'LUNAS' : formatCurrency(Math.abs(bal))}
                                                </p>
                                            );
                                        })()}
                                    </div>
                                </div>

                                {/* Detailed History */}
                                <div className="space-y-4">
                                    <h4 className="text-xs font-bold text-text-secondary uppercase tracking-widest pl-1">Riwayat Transaksi</h4>
                                    <div className="space-y-3">
                                        {payments
                                            .filter(p => p.studentId === detailStudentId)
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
                                                        </div>
                                                    </div>
                                                    {p.notes && (
                                                        <div className="mt-3 p-2 bg-slate-50 rounded-lg text-[10px] font-medium text-slate-600 border border-slate-100">
                                                            Note: {p.notes}
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        {payments.filter(p => p.studentId === detailStudentId).length === 0 && (
                                            <div className="text-center py-12 bg-slate-50 rounded-3xl border border-dashed border-border">
                                                <p className="text-xs text-slate-400 italic">Belum ada catatan pembayaran</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="p-6 bg-white border-t border-border">
                                <button
                                    onClick={() => {
                                        setNewPayment(prev => ({ ...prev, studentId: detailStudentId || '' }));
                                        setShowAddPayment(true);
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
                                    onChange={e => setEditingPayment({ ...editingPayment, amountPaid: parseInt(e.target.value) })}
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
                                        {students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                    </select>
                                </div>
                            )}
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold uppercase text-text-secondary">Item Biaya</label>
                                <select
                                    className="w-full bg-slate-50 border border-border rounded-lg p-3 outline-none focus:border-accent"
                                    value={newPayment.feeItemId}
                                    onChange={e => setNewPayment({ ...newPayment, feeItemId: e.target.value })}
                                >
                                    <option value="">-- Item Wajib/Deposit --</option>
                                    {feeItems.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                                </select>
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold uppercase text-text-secondary">Nominal (Rp)</label>
                                <input
                                    type="number"
                                    className="w-full bg-slate-50 border border-border rounded-lg p-3 outline-none font-bold text-accent"
                                    value={newPayment.amountPaid}
                                    onChange={e => setNewPayment({ ...newPayment, amountPaid: parseInt(e.target.value) })}
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

function ClassCashView({
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
    const [activeTab, setActiveTab] = useState<'gemari' | 'infaq'>('gemari');
    const [viewMode, setViewMode] = useState<'daily' | 'monthly' | 'ledger'>('daily');
    const [selectedClassId, setSelectedClassId] = useState(classes[0]?.id || '');
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
    const [studentAmounts, setStudentAmounts] = useState<{ [key: string]: number }>({});

    const [showHistory, setShowHistory] = useState(false);
    const [showRangeModal, setShowRangeModal] = useState(false);

    const [rangeForm, setRangeForm] = useState({
        startDate: '',
        endDate: '',
        status: 'setor' as 'setor' | 'bebas_setor',
        customAmount: 0
    });

    const getStudentName = (s: any) => s?.name || s?.displayName || s?.fullName || s?.nama || 'Tanpa Nama';
    const selectedClass = classes.find(c => c.id === selectedClassId);
    const filteredStudents = students.filter(s => {
        const studentClass = String((s as any)?.classId || '').trim();
        if (!selectedClassId) return true;
        if (studentClass === String(selectedClassId)) return true;
        if (selectedClass && studentClass === String(selectedClass.name || '').trim()) return true;
        return false;
    });
    const holiday = holidays.find(h => h.date === selectedDate);
    const dateObj = new Date(selectedDate);
    const isWeekend = dateObj.getDay() === 0;
    const isFriday = dateObj.getDay() === 5;

    const getNominal = () => activeTab === 'gemari' ? 500 : 1000;

    // Calculate Monthly Recap
    const currentMonthStr = selectedDate.substring(0, 7);
    const getMonthlyRecap = () => {
        let targetDays = 0;
        const year = parseInt(currentMonthStr.split('-')[0]);
        const month = parseInt(currentMonthStr.split('-')[1]) - 1;
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        for (let day = 1; day <= daysInMonth; day++) {
            const d = new Date(year, month, day);
            const dateStr = [d.getFullYear(), ('0' + (d.getMonth() + 1)).slice(-2), ('0' + d.getDate()).slice(-2)].join('-');
            const isH = holidays.some(h => h.date === dateStr);
            const dayOfWeek = d.getDay();

            if (activeTab === 'gemari') {
                if (dayOfWeek !== 0 && !isH) {
                    targetDays++;
                }
            } else {
                if (dayOfWeek === 5 && !isH) {
                    targetDays++;
                }
            }
        }

        const totalSeharusnya = targetDays * getNominal() * filteredStudents.length;

        // Total sudah setor for this month
        const monthTx = transactions.filter(t => t.type === activeTab && t.classId === selectedClassId && t.date.startsWith(currentMonthStr));
        const sudahSetor = monthTx.reduce((acc, t) => acc + t.amount, 0);

        // Find unique days marked as bebas_setor for this class this month
        const bebasSetorDates = new Set(monthTx.filter(t => t.amount === 0).map(t => t.date));
        const bebasSetorDeduction = bebasSetorDates.size * getNominal() * filteredStudents.length;

        const totalSeharusnyaReal = Math.max(0, totalSeharusnya - bebasSetorDeduction);

        // As per user, "hari tanpa setor karena alasan tertentu" might be recorded as 0. Belum setor depends on expectations.
        const belumSetor = Math.max(0, totalSeharusnyaReal - sudahSetor);

        return { totalSeharusnya: totalSeharusnyaReal, sudahSetor, belumSetor };
    };

    const recap = getMonthlyRecap();

    useEffect(() => {
        if (!classes.length) return;
        if (!selectedClassId || !classes.some(c => c.id === selectedClassId)) {
            setSelectedClassId(classes[0].id);
        }
    }, [classes, selectedClassId]);

    const handleSaveRange = async () => {
        if (!rangeForm.startDate || !rangeForm.endDate) return alert('Pilih tanggal awal dan akhir!');

        const start = new Date(rangeForm.startDate);
        const end = new Date(rangeForm.endDate);
        if (start > end) return alert('Tanggal akhir harus lebih besar atau sama dengan tanggal awal!');

        const entries: any[] = [];
        let currentDate = new Date(start);

        while (currentDate <= end) {
            const dateStr = [currentDate.getFullYear(), ('0' + (currentDate.getMonth() + 1)).slice(-2), ('0' + currentDate.getDate()).slice(-2)].join('-');
            const isH = holidays.some(h => h.date === dateStr);
            const dayOfWeek = currentDate.getDay();

            let validDay = false;
            if (activeTab === 'gemari' && dayOfWeek !== 0 && !isH) validDay = true;
            if (activeTab === 'infaq' && dayOfWeek === 5 && !isH) validDay = true;

            if (validDay || rangeForm.status === 'bebas_setor') {
                filteredStudents.forEach(s => {
                    entries.push({
                        classId: selectedClassId,
                        studentId: s.id,
                        amount: rangeForm.status === 'setor' ? (rangeForm.customAmount || getNominal()) : 0,
                        date: dateStr,
                        type: activeTab,
                        notes: rangeForm.status === 'bebas_setor' ? 'Bebas Setor' : `Mass input - ${activeTab}`
                    });
                });
            }
            currentDate.setDate(currentDate.getDate() + 1);
        }

        if (entries.length === 0) return alert('Tidak ada hari valid untuk diinput dalam rentang ini.');

        for (const entry of entries) {
            await addDoc(collection(db, 'classCashTransactions'), entry);
        }

        onRefresh();
        setShowRangeModal(false);
        alert(`Berhasil merekam batch data (${entries.length} entri).`);
    };

    const handleSave = async () => {

        const entries = (Object.entries(studentAmounts) as [string, number][])
            .filter(([_, amount]) => amount > 0)
            .map(([studentId, amount]) => ({
                classId: selectedClassId,
                studentId,
                amount,
                date: selectedDate,
                type: activeTab,
                notes: `Input per siswa - ${activeTab}`
            }));

        if (entries.length === 0) return alert('Input nominal terlebih dahulu');

        for (const entry of entries) {
            await addDoc(collection(db, 'classCashTransactions'), entry);
        }

        setStudentAmounts({});
        onRefresh();
        alert(`Berhasil menyimpan ${entries.length} data ${activeTab}`);
    };

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(amount);
    };

    const filteredTx = transactions.filter(t => t.type === activeTab && (!selectedClassId || t.classId === selectedClassId));
    const total = filteredTx.reduce((acc, t) => acc + (t.transactionType === 'withdrawal' ? -t.amount : t.amount), 0);

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h2 className="text-2xl font-black tracking-tighter uppercase italic">{activeTab === 'gemari' ? 'Kas Gemari Harian' : 'Infaq Jumat Berkah'}</h2>
                    <p className="text-xs text-text-secondary font-bold">Sinkronisasi Kalender & Input Per Siswa</p>
                </div>
                <div className="flex gap-2 w-full sm:w-auto">
                    <select
                        className="bg-white border border-border rounded-lg px-3 py-2 text-xs font-bold font-mono outline-none"
                        value={selectedClassId}
                        onChange={e => setSelectedClassId(e.target.value)}
                    >
                        {classes.map(c => <option key={c.id} value={c.id}>Kelas {c.name}</option>)}
                    </select>
                    {viewMode === 'daily' && (
                        <button onClick={() => setShowHistory(!showHistory)} className="btn-small !bg-slate-700 flex items-center gap-2">
                            <History size={14} /> {showHistory ? 'Input Data' : 'Riwayat'}
                        </button>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Left Panel: Summary & Calendar Check */}
                <div className="lg:col-span-4 space-y-6">
                    <div className="card !p-0 overflow-hidden">
                        <div className="flex border-b border-border">
                            <button
                                onClick={() => setActiveTab('gemari')}
                                className={`flex-1 py-4 text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'gemari' ? 'bg-slate-900 text-yellow-400 shadow-lg' : 'bg-slate-50 text-slate-400 hover:bg-slate-100'}`}
                            >
                                KAS GEMARI
                            </button>
                            <button
                                onClick={() => setActiveTab('infaq')}
                                className={`flex-1 py-4 text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'infaq' ? 'bg-slate-900 text-yellow-400 shadow-lg' : 'bg-slate-50 text-slate-400 hover:bg-slate-100'}`}
                            >
                                INFAQ JUMAT
                            </button>
                        </div>

                        <div className="p-6 text-center bg-white">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-2">Total Saldo Terkumpul</p>
                            <p className={`text-4xl font-black font-mono ${activeTab === 'gemari' ? 'text-accent' : 'text-emerald-600'}`}>
                                {formatCurrency(total)}
                            </p>
                        </div>
                    </div>

                    <div className="flex bg-slate-200 p-1 rounded-xl w-full">
                        <button
                            onClick={() => setViewMode('daily')}
                            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${viewMode === 'daily' ? 'bg-white shadow' : 'text-slate-500 hover:bg-slate-300'}`}
                        >
                            Harian
                        </button>
                        <button
                            onClick={() => setViewMode('monthly')}
                            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${viewMode === 'monthly' ? 'bg-white shadow' : 'text-slate-500 hover:bg-slate-300'}`}
                        >
                            Bulanan
                        </button>
                        <button
                            onClick={() => setViewMode('ledger')}
                            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${viewMode === 'ledger' ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:bg-slate-300'}`}
                        >
                            Buku Kas
                        </button>
                    </div>

                    <div className="card space-y-4">
                        {viewMode === 'monthly' || viewMode === 'ledger' ? (
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold text-text-secondary uppercase tracking-widest">Pilih Bulan</label>
                                <input
                                    type={typeof document !== 'undefined' && document.createElement('input').type === 'month' ? 'month' : 'text'}
                                    placeholder="YYYY-MM"
                                    pattern="\d{4}-\d{2}"
                                    title="Format: YYYY-MM"
                                    className="w-full bg-slate-50 border border-border rounded-xl p-4 outline-none font-bold text-base focus:border-accent"
                                    value={selectedMonth}
                                    onChange={e => setSelectedMonth(e.target.value)}
                                />
                            </div>
                        ) : (
                            <>
                                <label className="text-[10px] font-bold text-text-secondary uppercase tracking-widest">Pilih Tanggal Transaksi</label>
                                <input
                                    type="date"
                                    className={`w-full bg-slate-50 border rounded-xl p-4 outline-none font-bold text-lg ${holiday || isWeekend ? 'border-red-200 text-red-500' : 'border-border'}`}
                                    value={selectedDate}
                                    onChange={e => setSelectedDate(e.target.value)}
                                />
                            </>
                        )}

                        {viewMode === 'daily' && holiday && (
                            <div className="p-4 bg-red-50 border border-red-100 rounded-xl flex items-start gap-3">
                                <AlertCircle className="text-red-500 flex-shrink-0" size={18} />

                                <div>
                                    <p className="text-xs font-bold text-red-700">Hari Libur Sekolah</p>
                                    <p className="text-[10px] text-red-600 font-medium">{holiday.name}</p>
                                </div>
                            </div>
                        )}
                        {viewMode === 'daily' && isWeekend && !holiday && (
                            <div className="p-4 bg-orange-50 border border-orange-100 rounded-xl flex items-start gap-3">
                                <Clock className="text-orange-500 flex-shrink-0" size={18} />
                                <div>
                                    <p className="text-xs font-bold text-orange-700">Hari Libur Akhir Pekan</p>
                                    <p className="text-[10px] text-orange-600 font-medium">Minggu adalah hari libur.</p>
                                </div>
                            </div>
                        )}
                        {viewMode === 'daily' && activeTab === 'infaq' && !isFriday && (
                            <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl flex items-start gap-3">
                                <CalendarCheck className="text-blue-500 flex-shrink-0" size={18} />
                                <div>
                                    <p className="text-xs font-bold text-blue-700">Bukan Hari Jumat</p>
                                    <p className="text-[10px] text-blue-600 font-medium">Infaq Jumat biasanya dilakukan di hari Jumat.</p>
                                </div>
                            </div>
                        )}
                        {viewMode === 'daily' && isFriday && activeTab === 'infaq' && (
                            <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-xl flex items-start gap-3">
                                <CheckSquare className="text-emerald-500 flex-shrink-0" size={18} />
                                <div>
                                    <p className="text-xs font-bold text-emerald-700">Jumat Berkah</p>
                                    <p className="text-[10px] text-emerald-600 font-medium">Waktunya input setoran Infaq Jumat.</p>
                                </div>
                            </div>
                        )}

                        <button
                            onClick={() => setShowRangeModal(true)}
                            className="w-full mt-4 py-3 border border-dashed border-border rounded-xl text-xs font-bold tracking-widest uppercase text-slate-500 flex justify-center items-center gap-2 hover:border-accent hover:text-accent transition-all bg-white"
                        >
                            <CalendarCheck size={16} /> Input Rentang Tanggal
                        </button>

                        <div className="card space-y-3 mt-4 border border-blue-100 bg-blue-50/20">
                            <h4 className="text-[10px] uppercase font-black tracking-widest text-blue-600 text-center mb-2">Rekap Bulanan ({new Date(selectedDate).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })})</h4>
                            <div className="grid grid-cols-2 gap-2 text-center">
                                <div className="bg-white p-2 rounded border border-blue-100 shadow-sm">
                                    <p className="text-[9px] font-bold text-slate-400 capitalize">Seharusnya</p>
                                    <p className="text-sm font-black text-slate-700">{formatCurrency(recap.totalSeharusnya)}</p>
                                </div>
                                <div className="bg-white p-2 rounded border border-blue-100 shadow-sm">
                                    <p className="text-[9px] font-bold text-slate-400 capitalize">Terkumpul</p>
                                    <p className="text-sm font-black text-blue-600">{formatCurrency(recap.sudahSetor)}</p>
                                </div>
                            </div>
                            <div className="bg-white p-2 rounded border border-red-100 text-center shadow-sm">
                                <p className="text-[9px] font-bold text-slate-400 capitalize">Belum Setor / Kurang</p>
                                <p className="text-sm font-black text-red-500">{formatCurrency(recap.belumSetor)}</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Panel: Grid Input or History */}
                <div className="lg:col-span-8">
                    {viewMode === 'ledger' ? (
                        <LedgerClassCashView
                            transactions={filteredTx}
                            students={students}
                            classId={selectedClassId}
                            type={activeTab}
                            month={selectedMonth}
                            onRefresh={onRefresh}
                            formatCurrency={formatCurrency}
                            onOpenPrint={onOpenPrint}
                            onSort={onSort}
                            currentSort={currentSort}
                            sortedData={sortedData}
                            SortableTH={SortableTH}
                        />
                    ) : viewMode === 'monthly' ? (
                        <MonthlyClassCashView
                            students={filteredStudents}
                            month={selectedMonth}
                            type={activeTab}
                            transactions={transactions}
                            classId={selectedClassId}
                            holidays={holidays}
                            onRefresh={onRefresh}
                        />
                    ) : showHistory ? (
                        <div className="card !p-0 flex flex-col h-full">
                            <div className="p-5 border-b border-border flex justify-between items-center bg-slate-50/50">
                                <h3 className="text-xs font-black uppercase tracking-widest">Riwayat Entri {activeTab}</h3>
                                <button onClick={onOpenPrint} className="p-2 hover:bg-slate-100 rounded-lg text-slate-500" aria-label="Cetak Riwayat"><Printer size={16} /></button>
                            </div>
                            <div className="table-container min-h-[400px]">
                                <table className="data-table">
                                    <thead>
                                        <tr>
                                            <SortableTH label="TANGGAL" sortKey="date" currentSort={currentSort} onSort={onSort} />
                                            <SortableTH label="SISWA" sortKey="studentId" currentSort={currentSort} onSort={onSort} />
                                            <SortableTH label="NOMINAL" sortKey="amount" currentSort={currentSort} onSort={onSort} />
                                            <th>AKSI</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {sortedData(filteredTx).map((t: any) => (
                                            <tr key={t.id} className="hover:bg-slate-50">
                                                <td className="font-mono text-xs font-bold">{t.date}</td>
                                                <td className="font-bold">{t.studentId ? getStudentName(students.find(s => s.id === t.studentId)) : 'Kolektif'}</td>
                                                <td className="font-black text-slate-700 text-sm">{formatCurrency(t.amount)}</td>
                                                <td>
                                                    <button className="p-1 hover:bg-red-50 text-red-400 rounded transition-all" title="Hapus Transaksi"><Trash2 size={12} /></button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="flex justify-between items-center">
                                <h3 className="stat-label">Input {activeTab === 'gemari' ? 'Gemari (Rp 500/hari)' : 'Infaq (Rp 1.000/hari)'} Per Siswa</h3>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => {
                                            const nominal = getNominal();
                                            const newAmounts: { [key: string]: number } = {};
                                            filteredStudents.forEach(s => newAmounts[s.id] = nominal);
                                            setStudentAmounts(newAmounts);
                                        }}
                                        className="text-[10px] font-bold bg-success/10 text-success px-3 py-1 rounded-lg hover:bg-success/20 uppercase transition-all"
                                    >
                                        Hadir Semua / Setor Semua
                                    </button>
                                    <button
                                        onClick={() => setStudentAmounts({})}
                                        className="text-[10px] font-bold bg-slate-100 text-slate-500 hover:bg-slate-200 px-3 py-1 rounded-lg uppercase"
                                    >
                                        Reset Grid
                                    </button>
                                </div>
                            </div>
                            <div className="card !p-0 overflow-hidden">
                                <table className="data-table">
                                    <thead>
                                        <tr>
                                            <th className="w-16">#</th>
                                            <th>NAMA SISWA</th>
                                            <th>STATUS SETORAN</th>
                                            <th className="w-48 text-right">NOMINAL (Rp)</th>
                                        </tr>
                                    </thead>
                                    <tbody className={(holiday || isWeekend) ? 'opacity-50 pointer-events-none' : ''}>
                                        {filteredStudents.map((s, idx) => {
                                            const nominal = getNominal();
                                            const isSetor = studentAmounts[s.id] !== undefined && studentAmounts[s.id] > 0;
                                            return (
                                                <tr key={s.id} className="hover:bg-slate-50 transition-all">
                                                    <td className="font-mono text-xs text-text-secondary">{idx + 1}</td>
                                                    <td className="font-bold cursor-pointer" onClick={() => {
                                                        setStudentAmounts(prev => ({
                                                            ...prev,
                                                            [s.id]: isSetor ? 0 : nominal
                                                        }));
                                                    }}>{getStudentName(s)}</td>
                                                    <td>
                                                        <div className="flex gap-2">
                                                            <button
                                                                onClick={() => {
                                                                    setStudentAmounts(prev => ({ ...prev, [s.id]: nominal }));
                                                                }}
                                                                className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs transition-all ${isSetor ? 'bg-success text-white' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}
                                                            >
                                                                S
                                                            </button>
                                                            <button
                                                                onClick={() => {
                                                                    const newAm = { ...studentAmounts };
                                                                    delete newAm[s.id];
                                                                    setStudentAmounts(newAm);
                                                                }}
                                                                className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs transition-all ${!isSetor ? 'bg-red-500 text-white' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}
                                                            >
                                                                T
                                                            </button>
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <div className="flex items-center gap-2 justify-end">
                                                            <span className="text-[10px] font-bold text-slate-400">Rp</span>
                                                            <input
                                                                type="number"
                                                                className="w-24 bg-white border border-border rounded px-2 py-1 text-right text-sm font-bold focus:border-accent outline-none"
                                                                value={studentAmounts[s.id] !== undefined ? studentAmounts[s.id] : ''}
                                                                placeholder="0"
                                                                onChange={e => setStudentAmounts({ ...studentAmounts, [s.id]: parseInt(e.target.value) || 0 })}
                                                            />
                                                        </div>
                                                    </td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            </div>
                            <div className="flex justify-between items-center bg-white p-6 rounded-2xl border border-border shadow-sm">
                                <div>
                                    <p className="text-[10px] font-black text-slate-400 uppercase">Total Setoran Sesi Ini</p>
                                    <p className="text-xl font-black text-accent">{formatCurrency((Object.values(studentAmounts) as number[]).reduce((a, b) => a + b, 0))}</p>
                                </div>
                                <button
                                    onClick={handleSave}
                                    disabled={!!holiday || isWeekend}
                                    className={`btn-primary px-10 py-3 rounded-xl flex items-center gap-2 font-bold uppercase tracking-widest text-xs ${(holiday || isWeekend) ? 'opacity-50 cursor-not-allowed' : ''}`}
                                >
                                    <Save size={16} /> Simpan Data
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {showRangeModal && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl border border-border mt-10">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold">Input Rentang Tanggal</h3>
                            <button onClick={() => setShowRangeModal(false)} aria-label="Tutup modal rentang tanggal"><X size={20} /></button>
                        </div>
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold uppercase text-text-secondary">Awal</label>
                                    <input
                                        type="date"
                                        className="w-full bg-slate-50 border border-border rounded-lg p-3 outline-none"
                                        value={rangeForm.startDate}
                                        onChange={e => setRangeForm({ ...rangeForm, startDate: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold uppercase text-text-secondary">Akhir</label>
                                    <input
                                        type="date"
                                        className="w-full bg-slate-50 border border-border rounded-lg p-3 outline-none"
                                        value={rangeForm.endDate}
                                        onChange={e => setRangeForm({ ...rangeForm, endDate: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold uppercase text-text-secondary">Status Inputan</label>
                                <select
                                    className="w-full bg-slate-50 border border-border rounded-lg p-3 outline-none font-bold"
                                    value={rangeForm.status}
                                    onChange={e => setRangeForm({ ...rangeForm, status: e.target.value as any })}
                                >
                                    <option value="setor">Setor / Hadir (Nominal Rp {getNominal()})</option>
                                    <option value="bebas_setor">Kosongkan (Rentang Tanpa Nominal)</option>
                                </select>
                            </div>
                            {rangeForm.status === 'setor' && (
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold uppercase text-text-secondary">Nominal (Kustomize Jika Perlu)</label>
                                    <input
                                        type="number"
                                        className="w-full bg-slate-50 border border-border rounded-lg p-3 outline-none font-bold text-accent"
                                        value={rangeForm.customAmount || getNominal()}
                                        onChange={e => setRangeForm({ ...rangeForm, customAmount: parseInt(e.target.value) || 0 })}
                                    />
                                </div>
                            )}
                            <button onClick={handleSaveRange} className="btn-primary w-full py-4 rounded-xl mt-4">
                                Simpan & Rekap
                            </button>
                        </div>
                    </div>
                </div>
            )}
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

    const [newTransaction, setNewTransaction] = useState({
        studentId: '',
        amount: 0,
        date: new Date().toISOString().split('T')[0],
        type: 'deposit' as 'deposit' | 'withdrawal',
        notes: ''
    });

    const handleAddTransaction = async () => {
        await addDoc(collection(db, 'savingsTransactions'), newTransaction);
        setShowForm(false);
        setNewTransaction({
            studentId: '',
            amount: 0,
            date: new Date().toISOString().split('T')[0],
            type: 'deposit',
            notes: ''
        });
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
                            <div className="mt-3 pt-3 border-t border-border flex justify-between items-center text-[10px] font-bold text-text-secondary">
                                <span>{s.txCount} Transaksi</span>
                                <span className="flex items-center gap-1 group-hover:text-accent">Detail <ChevronRight size={10} /></span>
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
                                {students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
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
                                            <td className="no-print"><button className="p-1.5 hover:bg-slate-100 rounded text-slate-400 transition-all" aria-label="Lihat Riwayat Transaksi"><History size={12} /></button></td>
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
                            <h3 className="text-xl font-bold">Transaksi Tabungan</h3>
                            <button onClick={() => setShowForm(false)} aria-label="Tutup form tabungan"><X size={20} /></button>
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
                                    {students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
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
                            <button onClick={handleAddTransaction} className="w-full btn-primary py-3 mt-4">Proses Transaksi</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function MonthlyClassCashView({
    students,
    month,
    type,
    transactions,
    classId,
    holidays,
    onRefresh
}: {
    students: Student[],
    month: string,
    type: 'gemari' | 'infaq',
    transactions: ClassCashTransaction[],
    classId: string,
    holidays: Holiday[],
    onRefresh: () => void
}) {
    const [year, m] = month.split('-').map(Number);
    const daysInMonth = new Date(year, m, 0).getDate();
    const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

    const [edits, setEdits] = useState<{ [key: string]: number }>({});
    const getStudentName = (s: any) => s?.name || s?.displayName || s?.fullName || s?.nama || 'Tanpa Nama';

    const getNominal = () => type === 'gemari' ? 500 : 1000;

    const isHoliday = (date: Date) => {
        const day = date.getDay();
        const dateStr = date.toISOString().split('T')[0];

        if (day === 0) return { holiday: true, name: 'Minggu' };
        if (type === 'infaq' && day !== 5) return { holiday: true, name: 'Bukan Jumat' };

        const holiday = holidays.find(h => h.date === dateStr);
        if (holiday) return { holiday: true, name: holiday.name };

        return { holiday: false };
    };

    const getCellKey = (studentId: string, d: number) => {
        const dateStr = `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        return `${studentId}_${dateStr}`;
    };

    const getRecordAmount = (studentId: string, d: number) => {
        const key = getCellKey(studentId, d);
        if (edits[key] !== undefined) return edits[key];

        const dateStr = `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const record = transactions.find(r => r.studentId === studentId && r.date === dateStr && r.classId === classId && r.type === type);
        return record ? record.amount : -1;
    };

    const handleToggle = (studentId: string, d: number) => {
        const current = getRecordAmount(studentId, d);
        let next = 0;
        if (current === -1) {
            next = getNominal();
        } else if (current > 0) {
            next = 0;
        } else {
            next = -1;
        }
        setEdits(prev => ({ ...prev, [getCellKey(studentId, d)]: next }));
    };

    const handleSaveAll = async () => {
        const keys = Object.keys(edits);
        if (keys.length === 0) return alert('Tidak ada perubahan untuk disimpan.');

        const entries = keys.map(k => {
            const [studentId, dateStr] = k.split('_');
            return {
                classId,
                studentId,
                amount: edits[k],
                date: dateStr,
                type,
                notes: `Mass Edit Bulanan - ${type}`
            };
        });

        for (const entry of entries) {
            await addDoc(collection(db, 'classCashTransactions'), entry);
        }

        setEdits({});
        onRefresh();
    };

    const hasEdits = Object.keys(edits).length > 0;

    return (
        <div className="card !p-0 overflow-x-auto min-w-full relative">
            {hasEdits && (
                <div className="sticky top-0 left-0 right-0 bg-blue-50/90 backdrop-blur-sm border-b border-blue-100 p-4 z-20 flex justify-between items-center">
                    <p className="text-xs font-bold text-blue-700">Terdapat {Object.keys(edits).length} perubahan yang belum disimpan.</p>
                    <div className="flex gap-2">
                        <button onClick={() => setEdits({})} className="text-xs font-bold text-slate-500 hover:text-slate-700">Batal</button>
                        <button onClick={handleSaveAll} className="btn-small !bg-blue-600 hover:!bg-blue-700 flex items-center gap-2" title="Simpan Perubahan"><Save size={14} /> Simpan Perubahan</button>
                    </div>
                </div>
            )}
            <table className="w-full border-collapse">
                <thead>
                    <tr>
                        <th className="text-left p-2 border border-border sticky left-0 bg-white z-10 min-w-[200px] text-xs">NAMA SISWA</th>
                        {days.map(d => {
                            const date = new Date(year, m - 1, d);
                            const holidayInfo = isHoliday(date);
                            return (
                                <th
                                    key={d}
                                    className={`p-1 border border-border font-mono text-[10px] min-w-[36px] ${holidayInfo.holiday ? 'bg-slate-50 text-slate-400' : ''}`}
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
                        <tr key={s.id} className="hover:bg-slate-50 transition-all group">
                            <td className="p-2 border border-border sticky left-0 bg-white group-hover:bg-slate-50 z-10 font-bold text-[11px] truncate whitespace-nowrap">{getStudentName(s)}</td>
                            {days.map(d => {
                                const date = new Date(year, m - 1, d);
                                const holidayInfo = isHoliday(date);
                                const amount = getRecordAmount(s.id, d);
                                const isEdited = edits[getCellKey(s.id, d)] !== undefined;

                                return (
                                    <td key={d} className={`p-0 border border-border text-center ${holidayInfo.holiday ? 'bg-slate-50/50 cursor-not-allowed opacity-50' : 'cursor-pointer hover:bg-slate-200'} ${isEdited ? 'bg-blue-50/50' : ''}`} onClick={() => !holidayInfo.holiday && handleToggle(s.id, d)}>
                                        <div className="w-full h-full min-h-[32px] flex items-center justify-center text-[10px] font-black">
                                            {amount > 0 ? (
                                                <span className="text-success h-full w-full flex items-center justify-center border-b-2 border-success">S</span>
                                            ) : amount === 0 ? (
                                                <span className="text-yellow-600 h-full w-full flex items-center justify-center border-b-2 border-yellow-500">B</span>
                                            ) : (
                                                <span className="text-slate-300">-</span>
                                            )}
                                        </div>
                                    </td>
                                );
                            })}
                        </tr>
                    ))}
                    {students.length === 0 && (
                        <tr>
                            <td colSpan={daysInMonth + 1} className="text-center py-20 opacity-30 italic">Pilih kelas untuk melihat grid bulanan</td>
                        </tr>
                    )}
                </tbody>
            </table>
            <div className="p-4 flex gap-6 text-[10px] font-bold uppercase tracking-widest text-text-secondary bg-slate-50">
                <div className="flex items-center gap-2"><div className="w-4 h-4 border-b-2 border-success text-success flex items-center justify-center">S</div> Setor Normal</div>
                <div className="flex items-center gap-2"><div className="w-4 h-4 border-b-2 border-yellow-500 text-yellow-600 flex items-center justify-center">B</div> Bebas Setor (Rp 0)</div>
                <div className="flex items-center gap-2"><div className="w-4 h-4 text-slate-300 flex items-center justify-center">-</div> Kosong / Hapus</div>
                <div className="flex items-center gap-2 ml-auto italic opacity-50">Klik sel tabel untuk mengedit data secara beruntun.</div>
            </div>
        </div>
    );
}

function LedgerClassCashView({
    transactions,
    students,
    classId,
    type,
    month,
    onRefresh,
    formatCurrency,
    onOpenPrint,
    onSort,
    currentSort,
    sortedData,
    SortableTH
}: {
    transactions: ClassCashTransaction[],
    students: Student[],
    classId: string,
    type: string,
    month: string,
    onRefresh: () => void,
    formatCurrency: (n: number) => string,
    onOpenPrint: () => void,
    onSort: (k: string) => void,
    currentSort: any,
    sortedData: any,
    SortableTH: any
}) {
    const [showAddForm, setShowAddForm] = useState(false);
    const [expense, setExpense] = useState({ date: new Date().toISOString().split('T')[0], amount: '', notes: '' });
    const getStudentName = (s: any) => s?.name || s?.displayName || s?.fullName || s?.nama || 'Tanpa Nama';

    // Running balance calculation must be independent of current sorting/view
    const allSortedTx = [...transactions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    let currentRB = 0;
    const ledgerDataMap = allSortedTx.map(tx => {
        const isWithdrawal = tx.transactionType === 'withdrawal';
        const debit = isWithdrawal ? 0 : tx.amount;
        const credit = isWithdrawal ? tx.amount : 0;
        currentRB += debit - credit;

        let desc = tx.notes || (isWithdrawal ? 'Pengeluaran/Penarikan' : 'Setoran Siswa');
        if (tx.studentId) {
            const stu = students.find(s => s.id === tx.studentId);
            if (stu) desc = `Setoran: ${getStudentName(stu)}`;
        }

        return { ...tx, debit, credit, balance: currentRB, desc };
    });

    const prevTx = allSortedTx.filter(t => t.date < month + '-01');
    const prevBalance = prevTx.reduce((acc, t) => acc + (t.transactionType === 'withdrawal' ? -t.amount : t.amount), 0);

    const monthItems = ledgerDataMap.filter(l => l.date.startsWith(month));
    const displayItems = sortedData(monthItems);

    const handleAddExpense = async () => {
        if (!expense.amount || isNaN(Number(expense.amount))) return alert('Nominal tidak valid!');
        if (!expense.notes) return alert('Keterangan pengeluaran wajib diisi!');

        const entry = {
            classId,
            type,
            transactionType: 'withdrawal',
            amount: Number(expense.amount),
            date: expense.date,
            notes: expense.notes
        };

        await addDoc(collection(db, 'classCashTransactions'), entry);

        setExpense({ date: new Date().toISOString().split('T')[0], amount: '', notes: '' });
        setShowAddForm(false);
        onRefresh();
    };

    return (
        <div className="card !p-0 flex flex-col h-full min-h-[500px]">
            <div className="p-5 border-b border-border flex justify-between items-center bg-slate-50/50">
                <div>
                    <h3 className="text-xs font-black uppercase tracking-widest text-slate-700">Buku Kas (Mutasi Saldo)</h3>
                    <p className="text-[10px] font-bold text-slate-400">Pemasukan & Pengeluaran {type.toUpperCase()}</p>
                </div>
                <div className="flex gap-2">
                    <button onClick={() => setShowAddForm(!showAddForm)} className="btn-small bg-red-100 text-red-600 hover:bg-red-200 font-bold flex items-center gap-2">
                        {showAddForm ? <X size={14} /> : <Plus size={14} />} {showAddForm ? 'Batal' : 'Tambah Pengeluaran'}
                    </button>
                    <button onClick={onOpenPrint} className="p-2 hover:bg-slate-200 rounded-lg text-slate-500" aria-label="Cetak Laporan Kas"><Printer size={16} /></button>
                </div>
            </div>

            {showAddForm && (
                <div className="p-4 bg-red-50 border-b border-red-100 flex gap-4 items-end">
                    <div className="space-y-1">
                        <label className="text-[10px] font-bold text-red-800 uppercase">Tanggal</label>
                        <input type="date" className="p-2 rounded border border-red-200 outline-none w-full font-mono text-sm" value={expense.date} onChange={e => setExpense({ ...expense, date: e.target.value })} />
                    </div>
                    <div className="space-y-1 flex-1">
                        <label className="text-[10px] font-bold text-red-800 uppercase">Keterangan Penggunaan</label>
                        <input type="text" className="p-2 rounded border border-red-200 outline-none w-full text-sm" placeholder="Contoh: Beli sapu & pel" value={expense.notes} onChange={e => setExpense({ ...expense, notes: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] font-bold text-red-800 uppercase">Nominal (Rp)</label>
                        <input type="number" className="p-2 rounded border border-red-200 outline-none w-full font-mono text-sm" placeholder="0" value={expense.amount} onChange={e => setExpense({ ...expense, amount: e.target.value })} />
                    </div>
                    <button onClick={handleAddExpense} className="btn-small bg-red-800 hover:bg-red-900 text-white h-[38px] shadow-lg">
                        Simpan Pengeluaran
                    </button>
                </div>
            )}

            <div className="table-container p-4">
                <table className="data-table">
                    <thead>
                        <tr>
                            <SortableTH label="TANGGAL" sortKey="date" currentSort={currentSort} onSort={onSort} />
                            <SortableTH label="KETERANGAN / URAIAN" sortKey="desc" currentSort={currentSort} onSort={onSort} />
                            <SortableTH label="DEBIT (MASUK)" sortKey="debit" currentSort={currentSort} onSort={onSort} />
                            <SortableTH label="KREDIT (KELUAR)" sortKey="credit" currentSort={currentSort} onSort={onSort} />
                            <th className="text-right w-32 bg-slate-50">SALDO AKHIR</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr className="bg-slate-50/50">
                            <td colSpan={4} className="text-right font-bold text-[10px] uppercase text-slate-500 py-3">Saldo Pindahan Bulan Lalu</td>
                            <td className="text-right font-black text-sm bg-slate-100 py-3">{formatCurrency(prevBalance)}</td>
                        </tr>
                        {displayItems.length === 0 ? (
                            <tr><td colSpan={5} className="text-center py-20 text-slate-400 italic">Tidak ada mutasi kas di bulan ini</td></tr>
                        ) : displayItems.map((l: any, i: number) => (
                            <tr key={l.id} className="hover:bg-slate-50">
                                <td className="font-mono text-xs text-slate-500">{l.date}</td>
                                <td className="font-bold text-sm">{l.desc}</td>
                                <td className="text-right text-success font-mono font-bold">{l.debit > 0 ? formatCurrency(l.debit) : '-'}</td>
                                <td className="text-right text-red-500 font-mono font-bold">{l.credit > 0 ? formatCurrency(l.credit) : '-'}</td>
                                <td className="text-right font-black font-mono bg-slate-50 text-accent">{formatCurrency(l.balance)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
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

const DEFAULT_MAPEL = [
    "Pend. Agama dan Budi Pekerti",
    "Pendidikan Pancasila dan Kewarganegaraan",
    "Bahasa Indonesia",
    "Matematika",
    "Ilmu Pengetahuan Alam",
    "Ilmu Pengetahuan Sosial",
    "Seni Budaya dan Prakarya",
    "Pendidikan Jasmani, Olahraga, dan Kesehatan",
    "Muatan Lokal"
];

function AcademicView({
    students,
    classes,
    onSort,
    currentSort,
    sortedData,
    SortableTH
}: {
    students: Student[],
    classes: Class[],
    onSort: (k: string) => void,
    currentSort: any,
    sortedData: any,
    SortableTH: any
}) {
    const [selectedClassId, setSelectedClassId] = useState(classes[0]?.id || '');
    const [selectedStudentId, setSelectedStudentId] = useState<string>('');
    const [record, setRecord] = useState<any>(null); // To store academic record
    const [weights, setWeights] = useState({ rapot: 50, tka: 50 });

    const getStudentName = (s: any) => s?.name || s?.displayName || s?.fullName || s?.nama || 'Tanpa Nama';
    const selectedClass = classes.find(c => c.id === selectedClassId);
    const filteredStudents = students.filter(s => {
        const studentClass = String((s as any)?.classId || '').trim();
        if (!selectedClassId) return true;
        if (studentClass === String(selectedClassId)) return true;
        if (selectedClass && studentClass === String(selectedClass.name || '').trim()) return true;
        return false;
    });

    useEffect(() => {
        if (!classes.length) return;
        if (!selectedClassId || !classes.some(c => c.id === selectedClassId)) {
            setSelectedClassId(classes[0].id);
            setSelectedStudentId('');
        }
    }, [classes, selectedClassId]);

    useEffect(() => {
        if (filteredStudents.length === 0) {
            if (selectedStudentId) setSelectedStudentId('');
            return;
        }
        if (!selectedStudentId || !filteredStudents.some(s => s.id === selectedStudentId)) {
            setSelectedStudentId(filteredStudents[0].id);
        }
    }, [filteredStudents, selectedStudentId]);

    const loadAcademicRecords = async () => {
        const snap = await getDocs(collection(db, 'academicRecords'));
        return snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
    };

    useEffect(() => {
        if (selectedStudentId) {
            loadAcademicRecords().then(data => {
                const rec = data.find((r: any) => r.studentId === selectedStudentId);
                if (rec) {
                    setRecord({
                        ...rec,
                        tka: rec.tka ?? '',
                        rapot: Array.isArray(rec.rapot) ? rec.rapot : [],
                        prestasi: Array.isArray(rec.prestasi) ? rec.prestasi : [],
                        ijazah: Array.isArray(rec.ijazah) ? rec.ijazah : [],
                    });
                } else {
                    setRecord({ studentId: selectedStudentId, rapot: [], prestasi: [], ijazah: [], tka: '' });
                }
            });
        } else {
            setRecord(null);
        }
    }, [selectedStudentId]);

    const validateData = () => {
        const errs: string[] = [];
        if (!record) return errs;

        if ((record.rapot || []).some((r: any) =>
            ['s41_p', 's41_k', 's42_p', 's42_k', 's51_p', 's51_k', 's52_p', 's52_k', 's61_p', 's61_k'].some(k =>
                r[k] !== '' && r[k] !== null && r[k] !== undefined && (Number(r[k]) < 0 || Number(r[k]) > 100)
            )
        )) {
            errs.push('Nilai rapot harus berada dalam rentang 0-100.');
        }
        if ((record.ijazah || []).some((r: any) =>
            (r.grade_p !== '' && r.grade_p !== null && r.grade_p !== undefined && (Number(r.grade_p) < 0 || Number(r.grade_p) > 100)) ||
            (r.grade_k !== '' && r.grade_k !== null && r.grade_k !== undefined && (Number(r.grade_k) < 0 || Number(r.grade_k) > 100))
        )) {
            errs.push('Nilai ijazah harus berada dalam rentang 0-100.');
        }
        if (record.tka !== '' && record.tka !== null && record.tka !== undefined && (Number(record.tka) < 0 || Number(record.tka) > 100)) {
            errs.push('Nilai TKA harus berada dalam rentang 0-100.');
        }
        if ((record.prestasi || []).some((p: any) => p.poin !== '' && p.poin !== null && Number(p.poin) < 0)) {
            errs.push('Poin prestasi tidak boleh kurang dari 0.');
        }
        return errs;
    };

    const validationErrors = validateData();

    const handleSave = async () => {
        if (validationErrors.length > 0) {
            return alert('Terdapat kesalahan pada data yang diisi. Pastikan semua nilai berada dalam batas yang benar (misalnya 0-100).');
        }
        await setDoc(doc(db, 'academicRecords', record.studentId), { ...record, studentId: record.studentId });
        alert('Data Akademik Berhasil Disimpan');
    };

    const handleApplyTemplate = () => {
        if (!record) return;
        if (record.rapot && record.rapot.length > 0) {
            if (!confirm('Mapel saat ini sudah ada. Terapkan template akan menambahkan mapel default di bawahnya. Lanjutkan?')) return;
        }
        const templates = DEFAULT_MAPEL.map(m => ({ subject: m, s41_p: '', s41_k: '', s42_p: '', s42_k: '', s51_p: '', s51_k: '', s52_p: '', s52_k: '', s61_p: '', s61_k: '' }));
        setRecord({ ...record, rapot: [...(record.rapot || []), ...templates] });
    };

    const handleApplyIjazahTemplate = () => {
        if (!record) return;
        if (record.ijazah && record.ijazah.length > 0) {
            if (!confirm('Mapel ijazah saat ini sudah ada. Tambahkan mapel default?')) return;
        }
        const currentLen = (record.ijazah || []).length;
        const templates = DEFAULT_MAPEL.map((m, i) => ({ id: Date.now().toString() + i, no: currentLen + i + 1, subject: m, grade_p: '', grade_k: '' }));
        setRecord({ ...record, ijazah: [...(record.ijazah || []), ...templates] });
    };

    const handleExportCSV = async () => {
        // Export Data Akademik Semua Siswa di Kelas Ini
        const data = await loadAcademicRecords();

        // Header format:
        let csv = 'ID Siswa,Nama Siswa,TKA,';
        for (let i = 1; i <= 15; i++) {
            csv += `Mapel${i},K4S1P_${i},K4S1K_${i},K4S2P_${i},K4S2K_${i},K5S1P_${i},K5S1K_${i},K5S2P_${i},K5S2K_${i},K6S1P_${i},K6S1K_${i},`;
        }
        csv += 'NumIjazah\n'; // Just an example structure

        filteredStudents.forEach(stu => {
            const rec = data.find((r: any) => r.studentId === stu.id) || { tka: '', rapot: [] };
            const row = [stu.id, `"${stu.name}"`, rec.tka || ''];

            for (let i = 0; i < 15; i++) {
                if (rec.rapot && rec.rapot[i]) {
                    const r = rec.rapot[i];
                    row.push(
                        `"${r.subject}"`,
                        r.s41_p || '', r.s41_k || '',
                        r.s42_p || '', r.s42_k || '',
                        r.s51_p || '', r.s51_k || '',
                        r.s52_p || '', r.s52_k || '',
                        r.s61_p || '', r.s61_k || ''
                    );
                } else {
                    row.push('', '', '', '', '', '', '', '', '', '', '');
                }
            }
            csv += row.join(',') + '\n';
        });

        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Template_Nilai_Akademik_${classes.find(c => c.id === selectedClassId)?.name}.csv`;
        a.click();
    };

    const handleImportCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (evt) => {
            const text = evt.target?.result as string;
            const lines = text.split('\n');

            const newRecords = [];
            const existing = await loadAcademicRecords();

            for (let i = 1; i < lines.length; i++) {
                if (!lines[i].trim()) continue;
                const cols = lines[i].match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g)?.map(s => s.replace(/(^"|"$)/g, '').trim()) || [];
                if (cols.length < 3) continue;

                const studentId = cols[0];
                const tka = cols[2];
                const rapot = [];

                let colIdx = 3;
                for (let m = 0; m < 15; m++) {
                    if (cols[colIdx]) {
                        rapot.push({
                            subject: cols[colIdx],
                            s41_p: cols[colIdx + 1] || '',
                            s41_k: cols[colIdx + 2] || '',
                            s42_p: cols[colIdx + 3] || '',
                            s42_k: cols[colIdx + 4] || '',
                            s51_p: cols[colIdx + 5] || '',
                            s51_k: cols[colIdx + 6] || '',
                            s52_p: cols[colIdx + 7] || '',
                            s52_k: cols[colIdx + 8] || '',
                            s61_p: cols[colIdx + 9] || '',
                            s61_k: cols[colIdx + 10] || ''
                        });
                    }
                    colIdx += 11;
                }

                const existingRec = existing.find((r: any) => r.studentId === studentId);
                newRecords.push({
                    ...(existingRec || { prestasi: [], ijazah: [] }),
                    studentId,
                    tka,
                    rapot
                });
            }

            // Save all records to Supabase
            for (const rec of newRecords) {
                await setDoc(doc(db, 'academicRecords', rec.studentId), { ...rec, studentId: rec.studentId });
            }

            alert('Import berhasil!');
            const selected = newRecords.find((r: any) => r.studentId === selectedStudentId);
            if (selected) setRecord({ ...selected, tka: selected.tka ?? '' });
        };
        reader.readAsText(file);
    };

    const handleAddMapelRapot = () => {
        setRecord({
            ...record,
            rapot: [...(record.rapot || []), { subject: '', s41_p: '', s41_k: '', s42_p: '', s42_k: '', s51_p: '', s51_k: '', s52_p: '', s52_k: '', s61_p: '', s61_k: '' }]
        });
    };

    const handleUpdateRapot = (idx: number, field: string, val: any) => {
        const newRapot = [...record.rapot];
        newRapot[idx] = { ...newRapot[idx], [field]: val };
        setRecord({ ...record, rapot: newRapot });
    };

    const handleRemoveRapot = (idx: number) => {
        const newRapot = record.rapot.filter((_: any, i: number) => i !== idx);
        setRecord({ ...record, rapot: newRapot });
    };

    const handleAddPrestasi = () => {
        setRecord({
            ...record,
            prestasi: [...(record.prestasi || []), { id: Date.now().toString(), name: '', level: 'Kabupaten', year: new Date().getFullYear().toString(), poin: '' }]
        });
    };

    const handleUpdatePrestasi = (idx: number, field: string, val: any) => {
        const newPrestasi = [...record.prestasi];
        newPrestasi[idx] = { ...newPrestasi[idx], [field]: val };
        setRecord({ ...record, prestasi: newPrestasi });
    };

    const handleRemovePrestasi = (idx: number) => {
        const newPrestasi = record.prestasi.filter((_: any, i: number) => i !== idx);
        setRecord({ ...record, prestasi: newPrestasi });
    };

    const handleAddIjazah = () => {
        setRecord({
            ...record,
            ijazah: [...(record.ijazah || []), { id: Date.now().toString(), no: (record.ijazah || []).length + 1, subject: '', grade: '' }]
        });
    };

    const handleUpdateIjazah = (idx: number, field: string, val: any) => {
        const newIjazah = [...record.ijazah];
        newIjazah[idx] = { ...newIjazah[idx], [field]: val };
        setRecord({ ...record, ijazah: newIjazah });
    };

    const handleRemoveIjazah = (idx: number) => {
        const newIjazah = record.ijazah.filter((_: any, i: number) => i !== idx);
        setRecord({ ...record, ijazah: newIjazah });
    };

    const getAverageRapot = () => {
        if (!record?.rapot || record.rapot.length === 0) return 0;
        let total = 0;
        let count = 0;
        record.rapot.forEach((r: any) => {
            ['s41_p', 's41_k', 's42_p', 's42_k', 's51_p', 's51_k', 's52_p', 's52_k', 's61_p', 's61_k'].forEach(k => {
                if (r[k] !== '' && r[k] !== null && !isNaN(Number(r[k]))) {
                    total += Number(r[k]);
                    count++;
                }
            });
        });
        return count > 0 ? total / count : 0;
    };

    const ijazahTotal = (record?.ijazah || []).reduce((acc: number, ii: any) => {
        let sum = acc;
        if (ii.grade_p !== '' && ii.grade_p !== null && !isNaN(Number(ii.grade_p))) sum += Number(ii.grade_p);
        if (ii.grade_k !== '' && ii.grade_k !== null && !isNaN(Number(ii.grade_k))) sum += Number(ii.grade_k);
        return sum;
    }, 0);

    const ijazahCountFilled = (record?.ijazah || []).reduce((acc: number, ii: any) => {
        let c = acc;
        if (ii.grade_p !== '' && ii.grade_p !== null && !isNaN(Number(ii.grade_p))) c++;
        if (ii.grade_k !== '' && ii.grade_k !== null && !isNaN(Number(ii.grade_k))) c++;
        return c;
    }, 0);

    const ijazahAverage = ijazahCountFilled > 0 ? (ijazahTotal / ijazahCountFilled).toFixed(2) : 0;

    const avgRapot = getAverageRapot();
    const tkaVal = Number(record?.tka) || 0;
    const prestasiSum = (record?.prestasi || []).reduce((acc: number, p: any) => acc + (Number(p.poin) || 0), 0);
    const finalSmpScore = (avgRapot * (weights.rapot / 100)) + (tkaVal * (weights.tka / 100)) + prestasiSum;

    return (
        <div className="p-6 space-y-6 overflow-y-auto h-full pb-20">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h2 className="text-2xl font-black tracking-tighter uppercase">Data Akademik & Ijazah</h2>
                    <p className="text-sm text-text-secondary">Nilai Rapot (Semester 7-11), Prestasi, dan Ijazah</p>
                </div>
                <div className="flex gap-2 items-center flex-wrap">
                    <select
                        className="bg-white border border-border rounded-lg px-3 py-2 text-sm font-bold outline-none focus:border-accent"
                        value={selectedClassId}
                        onChange={e => { setSelectedClassId(e.target.value); setSelectedStudentId(''); }}
                    >
                        {classes.map(c => <option key={c.id} value={c.id}>Kelas {c.name}</option>)}
                    </select>
                    <select
                        className="bg-white border border-border rounded-lg px-3 py-2 text-sm font-bold outline-none focus:border-accent"
                        value={selectedStudentId}
                        onChange={e => setSelectedStudentId(e.target.value)}
                    >
                        <option value="">-- Pilih Siswa --</option>
                        {filteredStudents.map(s => <option key={s.id} value={s.id}>{getStudentName(s)}</option>)}
                    </select>

                    <button onClick={handleExportCSV} className="btn-small bg-slate-100 text-slate-700 hover:bg-slate-200" title="Download Template per Kelas">
                        <Download size={16} /> Data Excel
                    </button>

                    <label className="btn-small bg-slate-900 text-yellow-400 hover:bg-slate-950 cursor-pointer flex items-center gap-2 border border-slate-800">
                        <Upload size={16} /> Import Excel
                        <input type="file" accept=".csv" className="hidden" onChange={handleImportCSV} />
                    </label>

                    <button
                        onClick={handleSave}
                        className="btn-primary flex items-center gap-2 text-sm px-4 disabled:opacity-50"
                        disabled={!record || validationErrors.length > 0}
                    >
                        <Save size={16} /> Simpan Data
                    </button>
                </div>
            </div>

            {validationErrors.length > 0 && (
                <div className="bg-red-50 border border-red-200 text-red-600 p-4 rounded-xl flex items-start gap-4">
                    <AlertCircle className="flex-shrink-0 mt-1" size={20} />
                    <div>
                        <p className="font-bold mb-1">Terdapat Kesalahan Input (Rentang Nilai 0-100):</p>
                        <ul className="list-disc pl-5 text-sm space-y-1">
                            {validationErrors.map((e, i) => <li key={i}>{e}</li>)}
                        </ul>
                    </div>
                </div>
            )}

            {!record ? (
                <div className="card p-10 text-center text-slate-400 font-bold italic">
                    Silakan pilih siswa untuk melihat/mengedit data
                </div>
            ) : (
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                    <div className="xl:col-span-2 space-y-6">
                        {/* Nilai Rapot */}
                        <div className="card space-y-4">
                            <div className="flex justify-between items-center bg-blue-50/50 p-4 -mx-6 -mt-6 border-b border-blue-100 mb-4 flex-wrap gap-2">
                                <h3 className="font-black text-blue-900 flex items-center gap-2"><BookOpen size={18} /> NILAI RAPOT (5 Semester)</h3>
                                <div className="flex gap-2">
                                    <button onClick={handleApplyTemplate} className="btn-small bg-indigo-100 text-indigo-700 hover:bg-indigo-200 flex items-center gap-1">
                                        <CheckSquare size={14} /> Terapkan Template Mapel
                                    </button>
                                    <button onClick={handleAddMapelRapot} className="btn-small bg-blue-100 text-blue-700 hover:bg-blue-200 flex items-center gap-1">
                                        <Plus size={14} /> Tambah Mapel
                                    </button>
                                </div>
                            </div>
                            {(!record.rapot || record.rapot.length === 0) ? (
                                <p className="text-sm text-slate-400 italic text-center py-4">Belum ada data nilai rapot.</p>
                            ) : (
                                <div className="table-container shadow-sm p-4 print:p-0">
                                    <table className="w-full text-sm data-table">
                                        <thead>
                                            <tr>
                                                <th rowSpan={2} className="border border-border p-2 min-w-[150px] sticky left-0 bg-slate-50 z-[5]">Mata Pelajaran</th>
                                                <th colSpan={4} className="border border-border p-2 text-center bg-blue-50/50">Kelas 4</th>
                                                <th colSpan={4} className="border border-border p-2 text-center bg-emerald-50/50">Kelas 5</th>
                                                <th colSpan={2} className="border border-border p-2 text-center bg-amber-50/50">Kelas 6</th>
                                                <th rowSpan={2} className="border border-border p-2 w-16 no-print">Aksi</th>
                                            </tr>
                                            <tr>
                                                {/* K4 */}
                                                <th colSpan={2} className="border border-border p-1 text-center text-[10px] font-black">SEM 1 (P|K)</th>
                                                <th colSpan={2} className="border border-border p-1 text-center text-[10px] font-black">SEM 2 (P|K)</th>
                                                {/* K5 */}
                                                <th colSpan={2} className="border border-border p-1 text-center text-[10px] font-black">SEM 1 (P|K)</th>
                                                <th colSpan={2} className="border border-border p-1 text-center text-[10px] font-black">SEM 2 (P|K)</th>
                                                {/* K6 */}
                                                <th colSpan={2} className="border border-border p-1 text-center text-[10px] font-black">SEM 1 (P|K)</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {record.rapot.map((r: any, i: number) => (
                                                <tr key={i} className="hover:bg-slate-50/50">
                                                    <td className="p-1 border border-border sticky left-0 bg-white group-hover:bg-slate-50/50 z-[5]">
                                                        <input type="text" className="w-full p-2 outline-none font-bold text-xs" value={r.subject} onChange={e => handleUpdateRapot(i, 'subject', e.target.value)} placeholder="Mapel..." />
                                                    </td>
                                                    <td className="p-0 border border-border w-12"><GradeInput value={r.s41_p} onChange={(v: any) => handleUpdateRapot(i, 's41_p', v)} /></td>
                                                    <td className="p-0 border border-border w-12 bg-slate-50/50"><GradeInput value={r.s41_k} onChange={(v: any) => handleUpdateRapot(i, 's41_k', v)} /></td>
                                                    <td className="p-0 border border-border w-12"><GradeInput value={r.s42_p} onChange={(v: any) => handleUpdateRapot(i, 's42_p', v)} /></td>
                                                    <td className="p-0 border border-border w-12 bg-slate-50/50"><GradeInput value={r.s42_k} onChange={(v: any) => handleUpdateRapot(i, 's42_k', v)} /></td>
                                                    <td className="p-0 border border-border w-12"><GradeInput value={r.s51_p} onChange={(v: any) => handleUpdateRapot(i, 's51_p', v)} /></td>
                                                    <td className="p-0 border border-border w-12 bg-slate-50/50"><GradeInput value={r.s51_k} onChange={(v: any) => handleUpdateRapot(i, 's51_k', v)} /></td>
                                                    <td className="p-0 border border-border w-12"><GradeInput value={r.s52_p} onChange={(v: any) => handleUpdateRapot(i, 's52_p', v)} /></td>
                                                    <td className="p-0 border border-border w-12 bg-slate-50/50"><GradeInput value={r.s52_k} onChange={(v: any) => handleUpdateRapot(i, 's52_k', v)} /></td>
                                                    <td className="p-0 border border-border w-12"><GradeInput value={r.s61_p} onChange={(v: any) => handleUpdateRapot(i, 's61_p', v)} /></td>
                                                    <td className="p-0 border border-border w-12 bg-slate-50/50"><GradeInput value={r.s61_k} onChange={(v: any) => handleUpdateRapot(i, 's61_k', v)} /></td>
                                                    <td className="p-1 border border-border text-center no-print">
                                                        <button onClick={() => handleRemoveRapot(i)} className="text-red-400 hover:text-red-600 transition-all"><Trash2 size={14} /></button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>

                        {/* Pencapaian / Prestasi */}
                        <div className="card space-y-4">
                            <div className="flex justify-between items-center bg-violet-50/50 p-4 -mx-6 -mt-6 border-b border-violet-100 mb-4">
                                <h3 className="font-black text-violet-900 flex items-center gap-2"><ArrowUpRight size={18} /> DATA PRESTASI</h3>
                                <button onClick={handleAddPrestasi} className="btn-small bg-violet-100 text-violet-700 hover:bg-violet-200 flex items-center gap-1">
                                    <Plus size={14} /> Tambah Prestasi
                                </button>
                            </div>
                            {(!record.prestasi || record.prestasi.length === 0) ? (
                                <p className="text-sm text-slate-400 italic text-center py-4">Belum ada data prestasi.</p>
                            ) : (
                                <div className="space-y-2">
                                    {record.prestasi.map((p: any, i: number) => (
                                        <div key={p.id} className="flex gap-2 items-center">
                                            <input type="text" className="flex-1 p-2 bg-slate-50 border border-border rounded outline-none font-bold text-sm" placeholder="Nama Prestasi" value={p.name} onChange={e => handleUpdatePrestasi(i, 'name', e.target.value)} />
                                            <select className="w-32 p-2 bg-slate-50 border border-border rounded outline-none text-sm" value={p.level} onChange={e => handleUpdatePrestasi(i, 'level', e.target.value)}>
                                                <option value="Sekolah">Sekolah</option>
                                                <option value="Kecamatan">Kecamatan</option>
                                                <option value="Kabupaten">Kabupaten</option>
                                                <option value="Provinsi">Provinsi</option>
                                                <option value="Nasional">Nasional</option>
                                                <option value="Internasional">Internasional</option>
                                            </select>
                                            <input type="text" className="w-20 p-2 bg-slate-50 border border-border rounded outline-none text-sm text-center" placeholder="Tahun" value={p.year} onChange={e => handleUpdatePrestasi(i, 'year', e.target.value)} />
                                            <div className="w-24">
                                                <input type="number" step="0.01" min="0" className={`w-full p-2 bg-slate-50 border rounded outline-none text-sm text-center ${Number(p.poin) < 0 ? 'border-red-500 text-red-500' : 'border-border'}`} placeholder="Poin" value={p.poin ?? ''} onChange={e => handleUpdatePrestasi(i, 'poin', e.target.value)} />
                                            </div>
                                            <button onClick={() => handleRemovePrestasi(i)} className="p-2 text-red-400 hover:bg-red-50 rounded"><Trash2 size={16} /></button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Ijazah */}
                        <div className="card space-y-4">
                            <div className="flex justify-between items-center bg-amber-50/50 p-4 -mx-6 -mt-6 border-b border-amber-100 mb-4 flex-wrap gap-2">
                                <div>
                                    <h3 className="font-black text-amber-900 flex items-center gap-2"><FileText size={18} /> PENILAIAN IJAZAH</h3>
                                    <p className="text-[10px] text-amber-700 mt-1 uppercase tracking-widest font-bold">Total: <span className="font-black">{ijazahTotal}</span> | Rata-rata: <span className="font-black">{ijazahAverage}</span></p>
                                </div>
                                <div className="flex gap-2">
                                    <button onClick={handleApplyIjazahTemplate} className="btn-small bg-orange-100 text-orange-700 hover:bg-orange-200 flex items-center gap-1">
                                        <CheckSquare size={14} /> Terapkan Template Mapel
                                    </button>
                                    <button onClick={handleAddIjazah} className="btn-small bg-amber-100 text-amber-700 hover:bg-amber-200 flex items-center gap-1">
                                        <Plus size={14} /> Tambah Mapel
                                    </button>
                                </div>
                            </div>
                            {(!record.ijazah || record.ijazah.length === 0) ? (
                                <p className="text-sm text-slate-400 italic text-center py-4">Belum ada data nilai ijazah.</p>
                            ) : (
                                <div className="table-container shadow-sm p-4 print:p-0">
                                    <table className="w-full text-sm data-table">
                                        <thead>
                                            <tr>
                                                <th className="border border-border p-2 w-16 text-center text-xs">NO</th>
                                                <th className="border border-border p-2 text-xs">MATA PELAJARAN</th>
                                                <th className="border border-border p-2 w-24 text-center text-blue-600 text-[10px] font-black">PENGETAHUAN</th>
                                                <th className="border border-border p-2 w-24 text-center text-emerald-600 text-[10px] font-black">KETERAMPILAN</th>
                                                <th className="border border-border p-2 w-16 text-center no-print">AKSI</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {record.ijazah.map((iz: any, i: number) => (
                                                <tr key={iz.id} className="hover:bg-slate-50/50">
                                                    <td className="p-1 border border-border text-center">
                                                        <input type="number" className="w-8 p-1 text-center outline-none bg-transparent font-mono text-xs" value={iz.no} onChange={e => handleUpdateIjazah(i, 'no', Number(e.target.value))} />
                                                    </td>
                                                    <td className="p-1 border border-border">
                                                        <input type="text" className="w-full p-2 outline-none font-bold bg-transparent text-sm" value={iz.subject} onChange={e => handleUpdateIjazah(i, 'subject', e.target.value)} placeholder="Mapel Ijazah..." />
                                                    </td>
                                                    <td className="p-1 border border-border">
                                                        <GradeInput value={iz.grade_p} onChange={(v: any) => handleUpdateIjazah(i, 'grade_p', v)} />
                                                    </td>
                                                    <td className="p-1 border border-border">
                                                        <GradeInput value={iz.grade_k} onChange={(v: any) => handleUpdateIjazah(i, 'grade_k', v)} />
                                                    </td>
                                                    <td className="p-1 border border-border text-center no-print">
                                                        <button onClick={() => handleRemoveIjazah(i)} className="text-red-400 hover:text-red-600 p-1 transition-all"><Trash2 size={14} /></button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="xl:col-span-1 space-y-6">
                        {/* Kalkulasi Nilai SMP */}
                        <div className="card space-y-4 bg-emerald-50/50 border-emerald-100">
                            <h3 className="font-black text-emerald-900 border-b border-emerald-100 pb-3 uppercase tracking-tighter flex items-center gap-2">
                                <Calculator size={18} /> Kalkulasi Nilai Daftar SMP
                            </h3>

                            <div className="space-y-3 pt-2">
                                <div className="flex items-center justify-between">
                                    <p className="text-sm font-bold text-slate-700">Rata-rata Rapot (5 Sem)</p>
                                    <p className="font-mono font-black text-slate-900">{avgRapot.toFixed(2)}</p>
                                </div>

                                <div className="flex items-center justify-between">
                                    <p className="text-sm font-bold text-slate-700">Nilai TKA</p>
                                    <div className="w-24">
                                        <GradeInput value={record.tka} onChange={(v: any) => setRecord({ ...record, tka: v })} placeholder="0-100" />
                                    </div>
                                </div>

                                <div className="flex items-center justify-between border-b pb-4">
                                    <p className="text-sm font-bold text-slate-700">Total Poin Prestasi</p>
                                    <p className="font-mono font-black text-slate-900">+{prestasiSum.toFixed(2)}</p>
                                </div>

                                <div className="pt-2">
                                    <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Pengaturan Bobot (%)</p>
                                    <div className="flex gap-4">
                                        <div className="flex-1 space-y-1">
                                            <label className="text-[10px] text-slate-500 font-bold">Rapot</label>
                                            <input type="number" className="w-full p-2 rounded border outline-none font-mono text-sm text-center" value={weights.rapot} onChange={e => setWeights({ ...weights, rapot: Number(e.target.value) })} />
                                        </div>
                                        <div className="flex-1 space-y-1">
                                            <label className="text-[10px] text-slate-500 font-bold">TKA</label>
                                            <input type="number" className="w-full p-2 rounded border outline-none font-mono text-sm text-center" value={weights.tka} onChange={e => setWeights({ ...weights, tka: Number(e.target.value) })} />
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-emerald-600 text-white p-4 rounded-xl mt-6 relative overflow-hidden">
                                    <div className="absolute -right-4 -bottom-4 opacity-10">
                                        <Calculator size={100} />
                                    </div>
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-200 mb-1 relative z-10">Total Nilai Akhir PPDB</p>
                                    <p className="text-4xl font-black font-mono relative z-10">{finalSmpScore.toFixed(2)}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function UsersManagementView({ students }: { students: Student[] }) {
    const [users, setUsers] = useState<UserAccount[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAdd, setShowAdd] = useState(false);
    const [showPrintAccount, setShowPrintAccount] = useState<UserAccount | null>(null);
    const [editingUser, setEditingUser] = useState<UserAccount | null>(null);
    const [roleFilter, setRoleFilter] = useState<string>('all');
    const [formData, setFormData] = useState<Partial<UserAccount>>({
        email: '',
        displayName: '',
        role: 'student',
        studentId: '',
        username: '',
        password: ''
    });

    const filteredUsers = users.filter(u => roleFilter === 'all' || u.role === roleFilter);

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
                        onClick={() => { setShowAdd(true); setEditingUser(null); setFormData({ email: '', displayName: '', role: 'student', studentId: '', username: '', password: '' }); }}
                        className="btn-primary flex items-center gap-2 flex-1 md:flex-initial justify-center"
                    >
                        <UserPlus size={18} /> Tambah Akun
                    </button>
                </div>
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
                                            {students.map(s => (
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
    classes
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
    classes: Class[]
}) {
    const displaySettings = settings?.studentDisplaySettings || {
        showGrades: true,
        showAttendance: true,
        showPayments: false,
        showSavings: false,
        showClassCash: false
    };

    const student = students.find(s => s.id === studentId);
    const myGrades = grades.filter(g => g.studentId === studentId);
    const myAttendance = attendance.filter(a => a.studentId === studentId);
    const myPayments = payments.filter(p => p.studentId === studentId);
    const mySavings = savings.filter(s => s.studentId === studentId);
    const myClassCash = classCash.filter(c => c.studentId === studentId);

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(amount);
    };

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
                {displaySettings.showGrades && (
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="card space-y-4">
                        <div className="flex items-center gap-2 text-purple-600 mb-2">
                            <Grid size={18} />
                            <h3 className="font-black text-sm uppercase tracking-tight">Akademik Terakhir</h3>
                        </div>
                        {myGrades.length > 0 ? (
                            <div className="space-y-3">
                                {myGrades.slice(0, 3).map(g => (
                                    <div key={g.id} className="flex justify-between items-center bg-slate-50 p-3 rounded-xl border border-border">
                                        <span className="text-xs font-bold truncate max-w-[150px]">Nilai Materi #{g.materialId.slice(-4)}</span>
                                        <span className="text-lg font-black text-purple-600">{g.value}</span>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="py-4 text-center text-xs text-slate-400 font-medium">Belum ada data nilai.</div>
                        )}
                    </motion.div>
                )}

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

                {displaySettings.showPayments && (
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="card space-y-4">
                        <div className="flex items-center gap-2 text-blue-600 mb-2">
                            <CreditCard size={18} />
                            <h3 className="font-black text-sm uppercase tracking-tight">Administrasi</h3>
                        </div>
                        {myPayments.length > 0 ? (
                            <div className="space-y-2">
                                {myPayments.slice(0, 2).map(p => (
                                    <div key={p.id} className="text-xs p-3 rounded-xl bg-blue-50/50 border border-blue-100">
                                        <div className="font-bold truncate text-blue-800">{feeItems.find(f => f.id === p.feeItemId)?.name}</div>
                                        <div className="flex justify-between mt-1 items-end">
                                            <span className="text-slate-400 font-mono">{p.paymentDate}</span>
                                            <span className="font-black text-blue-600">{formatCurrency(p.amountPaid)}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="py-4 text-center text-xs text-slate-400 font-medium">Belum ada riwayat bayar.</div>
                        )}
                    </motion.div>
                )}

                {(displaySettings.showSavings || displaySettings.showClassCash) && (
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="card md:col-span-2 lg:col-span-3 space-y-4">
                        <div className="flex items-center gap-2 text-amber-600 mb-2">
                            <Wallet size={18} />
                            <h3 className="font-black text-sm uppercase tracking-tight">Informasi Keuangan Siswa</h3>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {displaySettings.showSavings && (
                                <div className="p-4 bg-amber-50/30 rounded-2xl border border-amber-100 flex justify-between items-center">
                                    <div>
                                        <div className="text-[10px] font-black uppercase text-amber-500 tracking-widest">Saldo Tabungan</div>
                                        <div className="text-2xl font-black text-amber-700">{formatCurrency(mySavings.reduce((acc, s) => s.type === 'deposit' ? acc + s.amount : acc - s.amount, 0))}</div>
                                    </div>
                                    <PiggyBank size={32} className="text-amber-300 opacity-50" />
                                </div>
                            )}
                            {displaySettings.showClassCash && (
                                <div className="p-4 bg-indigo-50/30 rounded-2xl border border-indigo-100 flex justify-between items-center">
                                    <div>
                                        <div className="text-[10px] font-black uppercase text-indigo-500 tracking-widest">Kontribusi Kas (Gemari)</div>
                                        <div className="text-2xl font-black text-indigo-700">{formatCurrency(myClassCash.reduce((acc, c) => acc + c.amount, 0))}</div>
                                    </div>
                                    <Coins size={32} className="text-indigo-300 opacity-50" />
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </div>

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
    const [formData, setFormData] = useState<AppSettings>(settings);
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
                ...(formData.features || { enableSavings: true, enableClassCash: true, enableAcademic: true, enablePayments: true, enableAttendance: true }),
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
                                { key: 'enableClassCash', label: 'KAS & Infaq Kelas', icon: <Coins size={16} /> },
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
                                { key: 'showClassCash', label: 'Tampilkan Kas Kelas', icon: <Coins size={16} /> },
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
