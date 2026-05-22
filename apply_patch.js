import fs from 'fs';

let contentCurrent = fs.readFileSync('src/App.tsx', 'utf8');

const currStartIdx = contentCurrent.indexOf('function GemariView({');
const currEndIdx = contentCurrent.indexOf('function SavingsView({', currStartIdx);

const newGemariView = `function GemariView({
    classes,
    students,
    transactions,
    holidays = [],
    onRefresh,
    onOpenPrint,
    onSort,
    currentSort,
    sortedData,
    SortableTH
}: any) {
    const GEMARI_RATE = 500;
    const todayStr = new Date().toISOString().split('T')[0];
    const [activeTab, setActiveTab] = React.useState('overview');
    const [selectedClassId, setSelectedClassId] = React.useState(classes[0]?.id || '');
    const [selectedMonth, setSelectedMonth] = React.useState(new Date().toISOString().slice(0, 7));
    const [selectedStudentId, setSelectedStudentId] = React.useState('');
    const [showForm, setShowForm] = React.useState(false);
    const [editingTx, setEditingTx] = React.useState(null);
    const [form, setForm] = React.useState({
        studentId: '',
        transactionType: 'deposit',
        amount: 0,
        date: todayStr,
        notes: ''
    });

    const getStudentName = (s) => s?.name || s?.displayName || s?.fullName || s?.nama || 'Tanpa Nama';
    const formatCurrency = (amount) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(amount);
    
    // Memoization to prevent infinite render loops
    const selectedClass = React.useMemo(() => classes.find(c => c.id === selectedClassId), [classes, selectedClassId]);
    
    const filteredStudents = React.useMemo(() => {
        return students.filter(s => !selectedClassId || String(s.classId) === String(selectedClassId));
    }, [students, selectedClassId]);
    
    const monthTransactions = React.useMemo(() => {
        return transactions.filter(t => t.type === 'gemari' && (!selectedClassId || String(t.classId) === String(selectedClassId)) && (t.date || '').startsWith(selectedMonth));
    }, [transactions, selectedClassId, selectedMonth]);
    
    const monthSchoolDays = React.useMemo(() => {
        const [y, m] = selectedMonth.split('-').map(Number);
        if (!y || !m) return 0;
        const daysInMonth = new Date(y, m, 0).getDate();
        let total = 0;
        for (let day = 1; day <= daysInMonth; day++) {
            const d = new Date(y, m - 1, day);
            const dateStr = [d.getFullYear(), ('0' + (d.getMonth() + 1)).slice(-2), ('0' + d.getDate()).slice(-2)].join('-');
            const isHoliday = (holidays || []).some(h => h.date === dateStr);
            if (d.getDay() !== 0 && !isHoliday) total++;
        }
        return total;
    }, [selectedMonth, holidays]);
    
    const targetPerStudent = monthSchoolDays * GEMARI_RATE;

    const studentRows = React.useMemo(() => {
        return filteredStudents.map(s => {
            const studentTx = monthTransactions.filter(t => t.studentId === s.id);
            const paid = studentTx.reduce((sum, t) => sum + (t.transactionType === 'withdrawal' ? -Number(t.amount || 0) : Number(t.amount || 0)), 0);
            const kurang = Math.max(0, targetPerStudent - paid);
            const status = paid >= targetPerStudent && paid > 0 ? 'sudah_bayar' : paid <= 0 ? 'belum_bayar' : 'kurang_bayar';
            return { student: s, paid, kurang, status, txCount: studentTx.length };
        }).sort((a, b) => {
            const order = { kurang_bayar: 0, belum_bayar: 1, sudah_bayar: 2 };
            return order[a.status] - order[b.status] || a.student.name.localeCompare(b.student.name, 'id-ID', { numeric: true, sensitivity: 'base' });
        });
    }, [filteredStudents, monthTransactions, targetPerStudent]);

    const totalPaid = studentRows.reduce((sum, row) => sum + row.paid, 0);
    const totalTarget = targetPerStudent * filteredStudents.length;
    const totalKurang = studentRows.reduce((sum, row) => sum + row.kurang, 0);
    const countSudah = studentRows.filter(row => row.status === 'sudah_bayar').length;
    const countBelum = studentRows.filter(row => row.status === 'belum_bayar').length;
    const countKurang = studentRows.filter(row => row.status === 'kurang_bayar').length;

    React.useEffect(() => {
        if (!classes.length) return;
        if (!selectedClassId || !classes.some(c => c.id === selectedClassId)) {
            setSelectedClassId(classes[0].id);
        }
    }, [classes, selectedClassId]);

    React.useEffect(() => {
        if (!filteredStudents.length) {
            if (selectedStudentId !== '') setSelectedStudentId('');
            return;
        }
        if (!selectedStudentId || !filteredStudents.some(s => s.id === selectedStudentId)) {
            setSelectedStudentId(filteredStudents[0].id);
        }
    }, [filteredStudents, selectedStudentId]);

    const resetForm = () => setForm({
        studentId: selectedStudentId || '',
        transactionType: 'deposit',
        amount: 0,
        date: todayStr,
        notes: ''
    });

    const openEdit = (tx) => {
        setEditingTx(tx);
        setForm({
            studentId: tx.studentId || '',
            transactionType: tx.transactionType || 'deposit',
            amount: Math.abs(Number(tx.amount) || 0),
            date: tx.date,
            notes: tx.notes || ''
        });
    };

    const handleSaveTx = async () => {
        if (!form.studentId) return alert('Pilih siswa terlebih dahulu');
        if (!form.amount || form.amount <= 0) return alert('Nominal harus lebih dari 0');
        
        onRefresh();
        setShowForm(false);
        setEditingTx(null);
        resetForm();
    };

    const handleDeleteTx = async (tx) => {
        if (!confirm('Hapus transaksi ini?')) return;
        
        if (editingTx?.id === tx.id) setEditingTx(null);
        onRefresh();
    };

    const ledgerRows = React.useMemo(() => {
        return monthTransactions
            .filter(t => !selectedStudentId || t.studentId === selectedStudentId)
            .map(t => {
                const student = students.find(s => s.id === t.studentId);
                const target = targetPerStudent;
                const paid = monthTransactions.filter(x => x.studentId === t.studentId).reduce((sum, x) => sum + (x.transactionType === 'withdrawal' ? -Number(x.amount || 0) : Number(x.amount || 0)), 0);
                const status = paid >= target && paid > 0 ? 'sudah_bayar' : paid <= 0 ? 'belum_bayar' : 'kurang_bayar';
                return { ...t, student, status };
            });
    }, [monthTransactions, selectedStudentId, students, targetPerStudent]);

    return (
        <div className="p-10 card">
            <h2 className="text-2xl font-black mb-4">GEMARI</h2>
            <div className="flex gap-4">
                <div className="bg-slate-100 p-6 rounded-2xl flex-1">
                    <p className="text-xs font-bold uppercase text-slate-400">Total Target</p>
                    <p className="text-3xl font-black text-accent">{formatCurrency(totalTarget)}</p>
                </div>
                <div className="bg-slate-100 p-6 rounded-2xl flex-1">
                    <p className="text-xs font-bold uppercase text-slate-400">Total Terkumpul</p>
                    <p className="text-3xl font-black text-emerald-600">{formatCurrency(totalPaid)}</p>
                </div>
                <div className="bg-slate-100 p-6 rounded-2xl flex-1">
                    <p className="text-xs font-bold uppercase text-slate-400">Total Tunggakan</p>
                    <p className="text-3xl font-black text-red-500">{formatCurrency(totalKurang)}</p>
                </div>
            </div>
            
            <div className="mt-8">
                <h3 className="font-bold text-lg mb-4">Daftar Transaksi</h3>
                {ledgerRows.length === 0 ? <p className="text-slate-500">Tidak ada transaksi bulan ini</p> : (
                    <table className="data-table w-full text-sm">
                        <thead>
                            <tr>
                                <th className="text-left font-bold text-slate-500 border-b p-2">Siswa</th>
                                <th className="text-left font-bold text-slate-500 border-b p-2">Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {ledgerRows.map(row => (
                                <tr key={row.id}>
                                    <td className="p-2 border-b">{row.student?.name}</td>
                                    <td className="p-2 border-b">{row.status}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
`;

if (currStartIdx !== -1 && currEndIdx !== -1) {
    const newContent = contentCurrent.substring(0, currStartIdx) + newGemariView + contentCurrent.substring(currEndIdx);
    fs.writeFileSync('src/App.tsx', newContent, 'utf8');
    console.log('Successfully applied fixed GemariView');
}
