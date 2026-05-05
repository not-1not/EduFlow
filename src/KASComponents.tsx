import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { db, collection, getDocs, doc, setDoc, query, where } from './firebase';
import { Student, Class, Holiday, MonthlyPaymentSummary, ClassCalendar } from './types';
import { generateSchoolCalendar, calculateExpectedDays, formatCurrency, getMonthName, GEMARI_RATE, INFAQ_RATE } from './utils/kasUtils';
import { Coins, Wallet, CreditCard, FileText, Search, Save, X, Plus } from 'lucide-react';

interface KASDashboardViewProps {
    classes: Class[];
    classCash: any[];
    studentPayments: any[];
    monthlySummaries: MonthlyPaymentSummary[];
}

export function KASDashboardView({
    classes,
    classCash,
    studentPayments,
    monthlySummaries,
}: KASDashboardViewProps) {
    const totalGemari = classCash.filter(t => t.type === 'gemari').reduce((acc, t) => acc + t.amount, 0);
    const totalInfaq = classCash.filter(t => t.type === 'infaq').reduce((acc, t) => acc + t.amount, 0);
    const totalKas = totalGemari + totalInfaq;
    const totalPaid = studentPayments.reduce((acc, p) => acc + p.amountPaid, 0);
    const pendingCount = monthlySummaries.filter(s => s.status === 'belum_lunas').length;
    const paidCount = monthlySummaries.filter(s => s.status === 'lunas').length;

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-black tracking-tighter uppercase">Dashboard KAS Kelas</h2>
                    <p className="text-xs text-text-secondary">Ringkasan kas gemari & infaq per kelas</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="card">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center">
                            <Coins size={24} className="text-accent" />
                        </div>
                        <div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase">Total Kas Gemari</p>
                            <p className="text-xl font-black text-accent">{formatCurrency(totalGemari)}</p>
                        </div>
                    </div>
                </div>

                <div className="card">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                            <Wallet size={24} className="text-emerald-500" />
                        </div>
                        <div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase">Total Infaq Jumat</p>
                            <p className="text-xl font-black text-emerald-500">{formatCurrency(totalInfaq)}</p>
                        </div>
                    </div>
                </div>

                <div className="card">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center">
                            <CreditCard size={24} className="text-blue-500" />
                        </div>
                        <div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase">Total Kas (Keseluruhan)</p>
                            <p className="text-xl font-black text-blue-500">{formatCurrency(totalKas)}</p>
                        </div>
                    </div>
                </div>

                <div className="card">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-orange-500/10 flex items-center justify-center">
                            <FileText size={24} className="text-orange-500" />
                        </div>
                        <div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase">Status Tagihan</p>
                            <p className="text-xl font-black text-orange-500">{paidCount} / {paidCount + pendingCount}</p>
                            <p className="text-[10px] text-slate-400">{pendingCount} belum lunas</p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="card">
                    <div className="p-4 border-b border-border flex justify-between items-center">
                        <h3 className="font-black uppercase tracking-widest text-sm">Kelas Terbanyak Kas</h3>
                        <button className="text-[10px] font-bold text-accent hover:underline">Lihat Detail</button>
                    </div>
                    <div className="space-y-3 p-4">
                        {classes.slice(0, 5).map(cls => {
                            const classKas = classCash.filter(t => t.classId === cls.id);
                            const total = classKas.reduce((acc, t) => acc + t.amount, 0);
                            return (
                                <div key={cls.id} className="flex justify-between items-center p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-all">
                                    <div>
                                        <p className="font-bold text-sm">{cls.name}</p>
                                        <p className="text-[10px] text-slate-400">{classKas.length} transaksi</p>
                                    </div>
                                    <p className="font-black text-accent">{formatCurrency(total)}</p>
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div className="card">
                    <div className="p-4 border-b border-border flex justify-between items-center">
                        <h3 className="font-black uppercase tracking-widest text-sm">Transaksi Terbaru</h3>
                        <button className="text-[10px] font-bold text-accent hover:underline">Lihat Semua</button>
                    </div>
                    <div className="space-y-3 p-4 max-h-80 overflow-y-auto">
                        {classCash.slice(-5).reverse().map(tx => (
                            <div key={tx.id} className="flex justify-between items-center p-3 bg-slate-50 rounded-lg">
                                <div>
                                    <p className="font-bold text-sm capitalize">{tx.type}</p>
                                    <p className="text-[10px] text-slate-400">{tx.date}</p>
                                </div>
                                <div className="text-right">
                                    <p className={`font-black ${tx.type === 'gemari' ? 'text-accent' : 'text-emerald-500'}`}>
                                        {formatCurrency(tx.amount)}
                                    </p>
                                    {tx.notes && <p className="text-[9px] text-slate-400 truncate max-w-[150px]">{tx.notes}</p>}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

interface KASMonthlyTrackerProps {
    classes: Class[];
    students: Student[];
    holidays: Holiday[];
    onRefresh: () => void;
}

export function KASMonthlyTracker({
    classes,
    students,
    holidays,
    onRefresh,
}: KASMonthlyTrackerProps) {
    const [selectedClassId, setSelectedClassId] = useState(classes[0]?.id || '');
    const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
    const [studentAmounts, setStudentAmounts] = useState<Record<string, { gemari: number; infaq: number }>>({});
    const [loading, setLoading] = useState(false);

    const selectedClass = classes.find(c => c.id === selectedClassId);
    const filteredStudents = students.filter(s => s.classId === selectedClassId);

    const year = parseInt(selectedMonth.split('-')[0]);
    const month = parseInt(selectedMonth.split('-')[1]) - 1;

    const calendar = generateSchoolCalendar(selectedClassId, year, month, holidays);
    const gemariExpected = calculateExpectedDays(calendar, 'gemari').dateCount;
    const infaqExpected = calculateExpectedDays(calendar, 'infaq').dateCount;

    useEffect(() => {
        const amounts: Record<string, { gemari: number; infaq: number }> = {};
        filteredStudents.forEach(s => {
            amounts[s.id] = { gemari: gemariExpected, infaq: infaqExpected };
        });
        setStudentAmounts(amounts);
    }, [filteredStudents, gemariExpected, infaqExpected]);

    const handleApplyAll = () => {
        const amounts: Record<string, { gemari: number; infaq: number }> = {};
        filteredStudents.forEach(s => {
            amounts[s.id] = { gemari: gemariExpected, infaq: infaqExpected };
        });
        setStudentAmounts(amounts);
    };

    const handleReset = () => {
        setStudentAmounts({});
    };

    const handleSave = async () => {
        if (Object.keys(studentAmounts).length === 0) {
            alert('Belum ada data untuk disimpan');
            return;
        }

        setLoading(true);
        try {
            const summaries = Object.entries(studentAmounts).map(([studentId, amounts]) => ({
                id: `${studentId}_${selectedMonth}`,
                studentId,
                classId: selectedClassId,
                month: selectedMonth,
                year,
                gemariDaysExpected: gemariExpected,
                gemariDaysActual: amounts.gemari,
                gemariAmount: amounts.gemari * GEMARI_RATE,
                infaqDaysExpected: infaqExpected,
                infaqDaysActual: amounts.infaq,
                infaqAmount: amounts.infaq * INFAQ_RATE,
                totalExpected: gemariExpected * GEMARI_RATE + infaqExpected * INFAQ_RATE,
                totalActual: amounts.gemari * GEMARI_RATE + amounts.infaq * INFAQ_RATE,
                payments: [],
                status: 'belum_lunas' as const,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            }));

            for (const summary of summaries) {
                await setDoc(doc(db, 'monthlyPaymentSummaries', summary.id), summary);
            }

            const calendarId = `${selectedClassId}_${selectedMonth}`;
            await setDoc(doc(db, 'classCalendars', calendarId), {
                ...calendar,
                studentAttendance: filteredStudents.reduce((acc, s) => {
                    acc[s.id] = {
                        gemariDaysExpected: gemariExpected,
                        gemariDaysActual: studentAmounts[s.id]?.gemari || gemariExpected,
                        infaqDaysExpected: infaqExpected,
                        infaqDaysActual: studentAmounts[s.id]?.infaq || infaqExpected,
                        adjustments: [],
                    };
                    return acc;
                }, {} as Record<string, any>),
                updatedAt: new Date().toISOString(),
            });

            onRefresh();
            alert(`Berhasil menyimpan data untuk ${summaries.length} siswa`);
        } catch (error) {
            console.error('Gagal menyimpan data:', error);
            alert('Gagal menyimpan data. Silakan coba lagi.');
        } finally {
            setLoading(false);
        }
    };

    const totalGemari = Object.values(studentAmounts).reduce((acc, v) => acc + v.gemari, 0);
    const totalInfaq = Object.values(studentAmounts).reduce((acc, v) => acc + v.infaq, 0);
    const totalAmount = totalGemari * GEMARI_RATE + totalInfaq * INFAQ_RATE;

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h2 className="text-2xl font-black tracking-tighter uppercase">Input Bulanan KAS</h2>
                    <p className="text-xs text-text-secondary">Rekap kehadiran gemari & infaq per siswa</p>
                </div>
                <div className="flex gap-2">
                    <select
                        className="bg-white border border-border rounded-lg px-3 py-2 text-sm font-bold outline-none"
                        value={selectedClassId}
                        onChange={e => setSelectedClassId(e.target.value)}
                    >
                        {classes.map(c => <option key={c.id} value={c.id}>Kelas {c.name}</option>)}
                    </select>
                    <input
                        type="month"
                        className="bg-white border border-border rounded-lg px-3 py-2 text-sm font-bold outline-none"
                        value={selectedMonth}
                        onChange={e => setSelectedMonth(e.target.value)}
                    />
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-4">
                    <div className="card p-6">
                        <div className="flex justify-between items-center mb-6">
                            <div>
                                <h3 className="font-black text-lg uppercase">Kalender Sekolah - {getMonthName(month)} {year}</h3>
                                <p className="text-[10px] text-slate-400">Hari efektif: Senin-Jumat kecuali libur nasional</p>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={handleApplyAll} className="btn-small bg-green-500 text-white hover:bg-green-600">
                                    Terapkan Ke Semua
                                </button>
                                <button onClick={handleReset} className="btn-small bg-slate-500 text-white hover:bg-slate-600">
                                    Reset Grid
                                </button>
                            </div>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="bg-slate-100">
                                        <th className="p-2 border font-bold">Hari</th>
                                        <th className="p-2 border font-bold">Tanggal</th>
                                        <th className="p-2 border font-bold">Status</th>
                                        <th className="p-2 border font-bold">Gemari</th>
                                        <th className="p-2 border font-bold">Infaq</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {Object.entries(calendar.schedule).map(([dateStr, info]) => {
                                        const day = new Date(dateStr).getDate();
                                        const dayName = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamu', 'Jumat', 'Sabtu'][new Date(dateStr).getDay()];
                                        return (
                                            <tr key={dateStr} className={`${info.isSchoolDay ? 'bg-white' : 'bg-slate-50'} border-b`}>
                                                <td className="p-2 border text-center font-bold">{dayName.substring(0, 3)}</td>
                                                <td className="p-2 border text-center">{day}</td>
                                                <td className="p-2 border text-center">
                                                    {info.isHoliday ? (
                                                        <span className="px-2 py-1 bg-red-100 text-red-600 rounded text-[10px] font-bold">Libur</span>
                                                    ) : info.isSchoolDay ? (
                                                        <span className="px-2 py-1 bg-green-100 text-green-600 rounded text-[10px] font-bold">Sekolah</span>
                                                    ) : (
                                                        <span className="px-2 py-1 bg-slate-100 text-slate-400 rounded text-[10px] font-bold">Libur</span>
                                                    )}
                                                </td>
                                                <td className="p-2 border text-center">
                                                    {info.gemariExpected ? (
                                                        <span className="px-2 py-1 bg-accent/10 text-accent rounded text-[10px] font-bold">✓ Rp 500</span>
                                                    ) : (
                                                        <span className="text-slate-300 text-[10px]">-</span>
                                                    )}
                                                </td>
                                                <td className="p-2 border text-center">
                                                    {info.infaqExpected ? (
                                                        <span className="px-2 py-1 bg-emerald-100 text-emerald-600 rounded text-[10px] font-bold">✓ Rp 1.000</span>
                                                    ) : (
                                                        <span className="text-slate-300 text-[10px]">-</span>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className="card">
                        <div className="p-5 border-b border-border">
                            <h3 className="font-black uppercase tracking-widest text-sm">Daftar Siswa</h3>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full data-table">
                                <thead>
                                    <tr>
                                        <th className="w-8">No</th>
                                        <th>Nama Siswa</th>
                                        <th className="w-24">Gemari (Rp 500)</th>
                                        <th className="w-24">Infaq (Rp 1.000)</th>
                                        <th className="w-32">Total</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredStudents.map((s, i) => (
                                        <tr key={s.id} className="hover:bg-slate-50">
                                            <td className="text-center font-mono text-xs text-slate-400">{i + 1}</td>
                                            <td className="font-bold">{s.name}</td>
                                            <td>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    max={gemariExpected}
                                                    className="w-full bg-white border border-border rounded px-2 py-1 text-center text-sm font-mono focus:border-accent outline-none"
                                                    value={studentAmounts[s.id]?.gemari || 0}
                                                    onChange={e => {
                                                        const val = parseInt(e.target.value) || 0;
                                                        setStudentAmounts(prev => ({
                                                            ...prev,
                                                            [s.id]: {
                                                                ...prev[s.id],
                                                                gemari: Math.min(val, gemariExpected),
                                                            },
                                                        }));
                                                    }}
                                                />
                                            </td>
                                            <td>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    max={infaqExpected}
                                                    className="w-full bg-white border border-border rounded px-2 py-1 text-center text-sm font-mono focus:border-accent outline-none"
                                                    value={studentAmounts[s.id]?.infaq || 0}
                                                    onChange={e => {
                                                        const val = parseInt(e.target.value) || 0;
                                                        setStudentAmounts(prev => ({
                                                            ...prev,
                                                            [s.id]: {
                                                                ...prev[s.id],
                                                                infaq: Math.min(val, infaqExpected),
                                                            },
                                                        }));
                                                    }}
                                                />
                                            </td>
                                            <td className="text-right font-black text-accent font-mono text-sm">
                                                Rp {((studentAmounts[s.id]?.gemari || 0) * GEMARI_RATE + (studentAmounts[s.id]?.infaq || 0) * INFAQ_RATE).toLocaleString('id-ID')}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <div className="space-y-4">
                    <div className="card border-l-4 border-l-accent">
                        <h4 className="font-black text-sm uppercase mb-3">Ringkasan Perhitungan</h4>
                        <div className="space-y-3">
                            <div className="flex justify-between">
                                <span className="text-sm text-slate-500">Jumlah Siswa</span>
                                <span className="font-black">{filteredStudents.length}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-sm text-slate-500">Hari Gemari Efektif</span>
                                <span className="font-black">{gemariExpected} hari</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-sm text-slate-500">Hari Infaq Efektif</span>
                                <span className="font-black">{infaqExpected} hari</span>
                            </div>
                            <div className="border-t border-border pt-3 mt-3">
                                <div className="flex justify-between">
                                    <span className="text-sm text-slate-500">Total Gemari (Rp 500 × hari × siswa)</span>
                                    <span className="font-black text-accent">{formatCurrency(totalGemari * GEMARI_RATE)}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-sm text-slate-500">Total Infaq (Rp 1.000 × hari × siswa)</span>
                                    <span className="font-black text-emerald-600">{formatCurrency(totalInfaq * INFAQ_RATE)}</span>
                                </div>
                                <div className="flex justify-between pt-2 border-t border-border mt-2">
                                    <span className="font-bold text-lg">Total Keseluruhan</span>
                                    <span className="font-black text-2xl text-accent">{formatCurrency(totalAmount)}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="card">
                        <h4 className="font-black text-sm uppercase mb-3">Legenda</h4>
                        <div className="space-y-2 text-[10px]">
                            <div className="flex items-center gap-2">
                                <span className="w-3 h-3 rounded bg-slate-100"></span>
                                <span>Hari Libur (Tidak Sekolah)</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="w-3 h-3 rounded bg-slate-300"></span>
                                <span>Hari Libur Akhir Pekan</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="w-3 h-3 rounded bg-green-100"></span>
                                <span>Hari Sekolah (Gemari)</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="w-3 h-3 rounded bg-emerald-100"></span>
                                <span>Hari Jumat (Gemari + Infaq)</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex justify-end gap-2">
                <button onClick={handleReset} className="btn-small bg-slate-500 text-white hover:bg-slate-600">
                    Reset Semua
                </button>
                <button
                    onClick={handleSave}
                    disabled={loading}
                    className="btn-primary px-6 py-3 rounded-xl font-bold flex items-center gap-2"
                >
                    {loading ? (
                        <>
                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                            Menyimpan...
                        </>
                    ) : (
                        <>
                            <Save size={16} />
                            Simpan Data
                        </>
                    )}
                </button>
            </div>
        </div>
    );
}

interface KASIndividualRecapProps {
    students: Student[];
    monthlySummaries: MonthlyPaymentSummary[];
}

export function KASIndividualRecap({
    students,
    monthlySummaries,
}: KASIndividualRecapProps) {
    const [selectedStudentId, setSelectedStudentId] = useState<string>('');
    const [filterMonth, setFilterMonth] = useState('');
    const [filterStatus, setFilterStatus] = useState<'all' | 'lunas' | 'belum_lunas'>('all');

    const selectedStudent = students.find(s => s.id === selectedStudentId);

    const filteredSummaries = monthlySummaries
        .filter(s => s.studentId === selectedStudentId)
        .filter(s => !filterMonth || s.month === filterMonth)
        .filter(s => {
            if (filterStatus === 'lunas') return s.status === 'lunas';
            if (filterStatus === 'belum_lunas') return s.status === 'belum_lunas';
            return true;
        })
        .sort((a, b) => b.month.localeCompare(a.month));

    const totalExpected = filteredSummaries.reduce((acc, s) => acc + s.totalExpected, 0);
    const totalActual = filteredSummaries.reduce((acc, s) => acc + s.totalActual, 0);
    const totalPaid = filteredSummaries.reduce((acc, s) => acc + s.payments.reduce((sum, p) => sum + p.amount, 0), 0);
    const totalOutstanding = totalActual - totalPaid;

    const allMonths = [...new Set(monthlySummaries.map(s => s.month))].sort().reverse();

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-black tracking-tighter uppercase">Rekap Pembayaran Individu</h2>
                    <p className="text-xs text-text-secondary">Riwayat transaksi gemari & infaq per siswa</p>
                </div>
            </div>

            <div className="card p-6">
                <div className="flex flex-col sm:flex-row gap-4 items-end">
                    <div className="flex-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase block mb-2">Pilih Siswa</label>
                        <select
                            className="w-full bg-white border border-border rounded-lg px-3 py-2 font-bold outline-none focus:border-accent"
                            value={selectedStudentId}
                            onChange={e => setSelectedStudentId(e.target.value)}
                        >
                            <option value="">-- Pilih Siswa --</option>
                            {students.map(s => (
                                <option key={s.id} value={s.id}>{s.name} - {s.attendanceNumber}</option>
                            ))}
                        </select>
                    </div>
                    <div className="flex gap-2">
                        <select
                            className="bg-white border border-border rounded-lg px-3 py-2 text-sm font-bold outline-none"
                            value={filterMonth}
                            onChange={e => setFilterMonth(e.target.value)}
                        >
                            <option value="">Semua Bulan</option>
                            {allMonths.map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                        <select
                            className="bg-white border border-border rounded-lg px-3 py-2 text-sm font-bold outline-none"
                            value={filterStatus}
                            onChange={e => setFilterStatus(e.target.value as any)}
                        >
                            <option value="all">Semua Status</option>
                            <option value="lunas">Lunas</option>
                            <option value="belum_lunas">Belum Lunas</option>
                        </select>
                    </div>
                </div>
            </div>

            {selectedStudent && (
                <>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                        <div className="card border-l-4 border-l-accent">
                            <p className="text-[10px] font-bold text-slate-400 uppercase">Total Tagihan</p>
                            <p className="text-2xl font-black text-slate-700">{formatCurrency(totalExpected)}</p>
                        </div>
                        <div className="card border-l-4 border-l-emerald-500">
                            <p className="text-[10px] font-bold text-slate-400 uppercase">Total Dibayar</p>
                            <p className="text-2xl font-black text-emerald-600">{formatCurrency(totalPaid)}</p>
                        </div>
                        <div className="card border-l-4 border-l-red-500">
                            <p className="text-[10px] font-bold text-slate-400 uppercase">Belum Dibayar</p>
                            <p className="text-2xl font-black text-red-500">{formatCurrency(Math.max(0, totalOutstanding))}</p>
                        </div>
                        <div className="card border-l-4 border-l-blue-500">
                            <p className="text-[10px] font-bold text-slate-400 uppercase">Status</p>
                            <p className={`text-xl font-black ${totalOutstanding <= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                {totalOutstanding <= 0 ? 'LUNAS' : 'BELUM LUNAS'}
                            </p>
                        </div>
                    </div>

                    <div className="card">
                        <div className="p-5 border-b border-border">
                            <h3 className="font-black uppercase tracking-widest text-sm">Detail Per Bulan</h3>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full data-table">
                                <thead>
                                    <tr>
                                        <th>Bulan</th>
                                        <th>Gemari (Hari)</th>
                                        <th>Infaq (Hari)</th>
                                        <th>Tagihan</th>
                                        <th>Dibayar</th>
                                        <th>Status</th>
                                        <th>Aksi</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredSummaries.length === 0 ? (
                                        <tr>
                                            <td colSpan={7} className="text-center py-10 text-slate-400 italic">
                                                Tidak ada data untuk siswa ini
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredSummaries.map(summary => {
                                            const totalPaidMonth = summary.payments.reduce((sum, p) => sum + p.amount, 0);
                                            const outstanding = summary.totalActual - totalPaidMonth;
                                            return (
                                                <tr key={summary.id} className="hover:bg-slate-50">
                                                    <td className="font-bold">{summary.month}</td>
                                                    <td>{summary.gemariDaysActual} / {summary.gemariDaysExpected}</td>
                                                    <td>{summary.infaqDaysActual} / {summary.infaqDaysExpected}</td>
                                                    <td className="font-mono">{formatCurrency(summary.totalActual)}</td>
                                                    <td className="font-mono text-emerald-600">{formatCurrency(totalPaidMonth)}</td>
                                                    <td>
                                                        <span className={`px-2 py-1 rounded text-[10px] font-bold ${
                                                            summary.status === 'lunas' ? 'bg-emerald-100 text-emerald-700' :
                                                            summary.status === 'lebih_bayar' ? 'bg-blue-100 text-blue-700' :
                                                            'bg-red-100 text-red-700'
                                                        }`}>
                                                            {summary.status === 'lunas' ? 'Lunas' :
                                                             summary.status === 'lebih_bayar' ? 'Lebih Bayar' :
                                                             'Belum Lunas'}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        <button className="p-2 hover:bg-slate-100 rounded text-accent transition-all" aria-label="Detail">
                                                            <Search size={14} />
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}

            {!selectedStudent && (
                <div className="card p-20 text-center text-slate-400">
                    <p className="text-lg font-bold italic">Pilih siswa untuk melihat rekap pembayaran</p>
                </div>
            )}
        </div>
    );
}
