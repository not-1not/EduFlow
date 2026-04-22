import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
    const app = express();
    const PORT = 3000;

    // Middleware for JSON parsing
    app.use(express.json());

    // Mock initial data
    let students = [
        {
            id: '1',
            name: 'Budi Santoso',
            email: 'budi@sekolah.id',
            classId: '1',
            attendance: 95,
            gradeValue: 88,
            nisn: '0012345678',
            nis: '12345',
            gender: 'L',
            phone: '081234567890',
            address: 'Jl. Merdeka No. 10',
            dusun: 'Dusun I',
            desa: 'Desa Menteng',
            kecamatan: 'Kecamatan Menteng',
            birthPlace: 'Jakarta',
            birthDate: '2008-05-15',
            nik: '3171234567890001',
            nkk: '3171234567890002',
            religion: 'Islam',
            weightSem1: 55,
            weightSem2: 57,
            heightSem1: 165,
            heightSem2: 168,
            fatherName: 'Suryo Santoso',
            fatherBirthYear: '1975',
            fatherNik: '3171234567890003',
            motherName: 'Siti Hartati',
            motherBirthYear: '1978',
            motherNik: '3171234567890004',
            guardianName: '-',
            guardianBirthYear: '-',
            guardianNik: '-',
            distanceToSchool: 2.5,
            attendanceNumber: 1
        },
        {
            id: '2',
            name: 'Siti Aminah',
            email: 'siti@sekolah.id',
            classId: '1',
            attendance: 98,
            gradeValue: 92,
            nisn: '0023456789',
            gender: 'P',
            phone: '082345678901',
            address: 'Jl. Mawar No. 5, Jakarta',
            birthDate: '2008-08-20'
        },
        {
            id: '3',
            name: 'Agus Pratama',
            email: 'agus@sekolah.id',
            classId: '2',
            attendance: 90,
            gradeValue: 85,
            nisn: '0034567890',
            gender: 'L',
            phone: '083456789012',
            address: 'Jl. Melati No. 2, Jakarta',
            birthDate: '2007-12-10'
        },
    ];

    let classes = [
        { id: '1', name: 'X-IPA-1', subject: 'IPA', teacher: 'John Doe', homeroomTeacher: 'John Doe', homeroomTeacherNip: '198501012010011001', academicYear: '2025/2026', studentCount: 24, schedule: 'Senin, Rabu 07:30' },
        { id: '2', name: 'X-IPA-2', subject: 'IPA', teacher: 'Jane Smith', homeroomTeacher: 'Jane Smith', homeroomTeacherNip: '198705052012012002', academicYear: '2025/2026', studentCount: 18, schedule: 'Selasa, Kamis 08:30' },
        { id: '3', name: 'XI-IPS-1', subject: 'IPS', teacher: 'Mike Ross', homeroomTeacher: 'Mike Ross', homeroomTeacherNip: '199010102015011003', academicYear: '2025/2026', studentCount: 15, schedule: 'Jumat 09:00' },
    ];

    let subjects = [
        { id: '1', name: 'Matematika', code: 'MTK-1', classId: '1', teacherName: 'John Doe' },
        { id: '2', name: 'Fisika', code: 'FIS-1', classId: '2', teacherName: 'Jane Smith' },
    ];

    let materials = [
        { id: '1', subjectId: '1', title: 'UTS Semester Ganjil', weight: 25, type: 'pts' },
        { id: '2', subjectId: '1', title: 'Tugas Fungsi Linear', weight: 25, type: 'pengetahuan' },
        { id: '3', subjectId: '2', title: 'Praktikum Panas', weight: 25, type: 'keterampilan' },
    ];

    let grades = [
        { id: '1', studentId: '1', materialId: '1', value: 85 },
        { id: '2', studentId: '1', materialId: '2', value: 90 },
        { id: '3', studentId: '2', materialId: '1', value: 70 },
    ];

    let attendanceRecords: any[] = [
        { id: '1', studentId: '1', classId: '1', date: '2023-10-18', status: 'hadir' },
        { id: '2', studentId: '2', classId: '1', date: '2023-10-18', status: 'sakit' },
    ];

    let feeItems = [
        { id: '1', name: 'SPP Juli 2025', amount: 250000, category: 'wajib', academicYear: '2025/2026' },
        { id: '2', name: 'Seragam Olahraga', amount: 150000, category: 'lainnya', academicYear: '2025/2026' },
        { id: '3', name: 'Buku Paket Semester 1', amount: 300000, category: 'wajib', academicYear: '2025/2026' },
    ];

    let studentPayments = [
        { id: '1', studentId: '1', feeItemId: '1', amountPaid: 250000, paymentDate: '2025-07-05', paymentMethod: 'cash' },
        { id: '2', studentId: '2', feeItemId: '1', amountPaid: 200000, paymentDate: '2025-07-06', paymentMethod: 'transfer', notes: 'Kurang 50rb' },
    ];

    let savingsTransactions = [
        { id: '1', studentId: '1', amount: 50000, date: '2025-07-01', type: 'deposit', notes: 'Tabungan Awal' },
        { id: '2', studentId: '1', amount: 20000, date: '2025-07-10', type: 'deposit' },
        { id: '3', studentId: '2', amount: 100000, date: '2025-07-02', type: 'deposit' },
    ];

    let classCashTransactions: any[] = [
        { id: '1', classId: '1', type: 'gemari', amount: 50000, date: '2025-07-01', notes: 'Kas Awal' },
    ];

    let schoolDeposits: any[] = [];
    let users: any[] = [
        { id: '1', email: 'admin@demo.id', username: 'admin', password: 'admin', displayName: 'Super Admin', role: 'admin', createdAt: new Date().toISOString() },
        { id: '2', email: 'budi@sekolah.id', username: '0012345678', password: '123', displayName: 'Budi Santoso', role: 'student', studentId: '1', createdAt: new Date().toISOString() }
    ];

    let appSettings = {
        appName: 'Aplikasi Akademik',
        schoolName: 'Sekolah Contoh',
        schoolAddress: 'Jl. Pendidikan No 1',
        headmasterName: 'Bapak Kepala Sekolah',
        themeColor: '#3b82f6'
    };

    // Mock login endpoint
    app.post('/api/login', (req, res) => {
        const { username, password } = req.body;
        
        // 1. Check in users managed table
        const userAccount = users.find(u => u.username === username && u.password === password);
        if (userAccount) {
            return res.json({
                status: 'success',
                user: { 
                    uid: userAccount.uid || userAccount.id, 
                    email: userAccount.email, 
                    displayName: userAccount.displayName,
                    id: userAccount.id
                },
                role: userAccount.role,
                studentId: userAccount.studentId
            });
        }

        // 2. Legacy check for students by NISN (if not in users table)
        const student = students.find(s => s.nisn === username && password === '12345');
        if (student) {
            return res.json({
                status: 'success',
                user: { uid: `student-${student.id}`, email: student.email, displayName: student.name },
                role: 'student',
                studentId: student.id
            });
        }

        res.status(401).json({ status: 'error', message: 'Username atau password salah.' });
    });

    // API Routes
    app.get('/api/settings', (req, res) => res.json(appSettings));
    app.post('/api/settings', (req, res) => {
        appSettings = { ...appSettings, ...req.body };
        res.json(appSettings);
    });

    app.get('/api/students', (req, res) => res.json(students));
    app.post('/api/students', (req, res) => {
        const newStudent = { ...req.body, id: Math.random().toString(36).substr(2, 9) };
        students.push(newStudent);
        res.json(newStudent);
    });
    app.post('/api/students/bulk', (req, res) => {
        const newStudents = req.body.map((s: any) => ({ ...s, id: Math.random().toString(36).substr(2, 9) }));
        students = [...students, ...newStudents];
        res.json({ status: 'success', count: newStudents.length });
    });
    app.post('/api/students/bulk-update', (req, res) => {
        const updates = req.body;
        updates.forEach((u: any) => {
            const idx = students.findIndex(s => s.id === u.id);
            if (idx > -1) {
                students[idx] = { ...students[idx], ...u };
            }
        });
        res.json({ status: 'success' });
    });

    app.get('/api/classes', (req, res) => res.json(classes));
    app.post('/api/classes', (req, res) => {
        const newClass = { ...req.body, id: Math.random().toString(36).substr(2, 9) };
        classes.push(newClass);
        res.json(newClass);
    });
    app.put('/api/classes/:id', (req, res) => {
        const { id } = req.params;
        const idx = classes.findIndex(c => c.id === id);
        if (idx > -1) {
            classes[idx] = { ...classes[idx], ...req.body };
            res.json(classes[idx]);
        } else {
            res.status(404).json({ error: 'Class not found' });
        }
    });
    app.delete('/api/classes/:id', (req, res) => {
        classes = classes.filter(c => c.id !== req.params.id);
        res.json({ status: 'success' });
    });

    app.get('/api/subjects', (req, res) => res.json(subjects));
    app.post('/api/subjects', (req, res) => {
        const newSubject = { ...req.body, id: Math.random().toString(36).substr(2, 9) };
        subjects.push(newSubject);
        res.json(newSubject);
    });
    app.put('/api/subjects/:id', (req, res) => {
        const { id } = req.params;
        const idx = subjects.findIndex(s => s.id === id);
        if (idx > -1) {
            subjects[idx] = { ...subjects[idx], ...req.body };
            res.json(subjects[idx]);
        } else {
            res.status(404).json({ error: 'Subject not found' });
        }
    });
    app.delete('/api/subjects/:id', (req, res) => {
        subjects = subjects.filter(s => s.id !== req.params.id);
        materials = materials.filter(m => m.subjectId !== req.params.id); // Cascade delete materials
        res.json({ status: 'success' });
    });

    app.get('/api/materials', (req, res) => res.json(materials));
    app.post('/api/materials', (req, res) => {
        const newMaterial = { ...req.body, id: Math.random().toString(36).substr(2, 9) };
        materials.push(newMaterial);
        res.json(newMaterial);
    });
    app.delete('/api/materials/:id', (req, res) => {
        materials = materials.filter(m => m.id !== req.params.id);
        res.json({ status: 'success' });
    });

    app.get('/api/grades', (req, res) => res.json(grades));
    app.post('/api/grades/bulk', (req, res) => {
        // Basic implementation for bulk updates
        const updates = req.body; // Array of {studentId, materialId, value, scoreType}
        updates.forEach((u: any) => {
            const idx = grades.findIndex((g: any) => g.studentId === u.studentId && g.materialId === u.materialId && g.scoreType === u.scoreType);
            if (idx > -1) {
                grades[idx].value = u.value;
            } else {
                grades.push({ ...u, id: Math.random().toString(36).substr(2, 9) });
            }
        });
        res.json({ status: 'success' });
    });

    app.get('/api/recap', (req, res) => {
        // Generate recap data
        const recap = students.map(s => {
            const studentGrades = grades.filter(g => g.studentId === s.id);
            return {
                ...s,
                grades: studentGrades
            };
        });
        res.json(recap);
    });

    app.get('/api/attendance', (req, res) => {
        const { classId, date } = req.query;
        let filtered = attendanceRecords;
        if (classId) filtered = filtered.filter(r => r.classId === classId);
        if (date) filtered = filtered.filter(r => r.date === date);
        res.json(filtered);
    });

    app.post('/api/attendance/bulk', (req, res) => {
        const updates = req.body; // Array of {studentId, classId, date, status}
        updates.forEach((u: any) => {
            const idx = attendanceRecords.findIndex(r => r.studentId === u.studentId && r.classId === u.classId && r.date === u.date);
            if (idx > -1) {
                attendanceRecords[idx].status = u.status;
            } else {
                attendanceRecords.push({ ...u, id: Math.random().toString(36).substr(2, 9) });
            }
        });
        res.json({ status: 'success' });
    });

    app.get('/api/fee-items', (req, res) => res.json(feeItems));
    app.post('/api/fee-items', (req, res) => {
        const newItem = { ...req.body, id: Math.random().toString(36).substr(2, 9) };
        feeItems.push(newItem);
        res.json(newItem);
    });
    app.delete('/api/fee-items/:id', (req, res) => {
        feeItems = feeItems.filter(i => i.id !== req.params.id);
        res.json({ status: 'success' });
    });

    app.get('/api/payments', (req, res) => res.json(studentPayments));
    app.post('/api/payments', (req, res) => {
        const newPayment = { ...req.body, id: Math.random().toString(36).substr(2, 9) };
        studentPayments.push(newPayment);
        res.json(newPayment);
    });
    app.put('/api/payments/:id', (req, res) => {
        const index = studentPayments.findIndex(p => p.id === req.params.id);
        if (index !== -1) {
            studentPayments[index] = { ...studentPayments[index], ...req.body };
            res.json(studentPayments[index]);
        } else {
            res.status(404).send('Payment not found');
        }
    });

    app.get('/api/savings', (req, res) => res.json(savingsTransactions));
    app.post('/api/savings', (req, res) => {
        const newTransaction = { ...req.body, id: Math.random().toString(36).substr(2, 9) };
        savingsTransactions.push(newTransaction);
        res.json(newTransaction);
    });

    app.get('/api/class-cash', (req, res) => res.json(classCashTransactions));
    app.post('/api/class-cash', (req, res) => {
        const newTxs = Array.isArray(req.body) ? req.body : [req.body];

        // Remove existing entries for the same studentId, date, and type before appending
        newTxs.forEach(newTx => {
            classCashTransactions = classCashTransactions.filter(
                t => !(t.studentId === newTx.studentId && t.date === newTx.date && t.type === newTx.type)
            );
        });

        const validTxs = newTxs.filter(tx => tx.amount >= 0);
        const created = validTxs.map(tx => ({ ...tx, id: Math.random().toString(36).substr(2, 9) }));
        classCashTransactions.push(...created);
        res.json(created);
    });

    app.get('/api/school-deposits', (req, res) => res.json(schoolDeposits));
    app.post('/api/school-deposits', (req, res) => {
        const newDeposit = { ...req.body, id: Math.random().toString(36).substr(2, 9) };
        schoolDeposits.push(newDeposit);
        res.json(newDeposit);
    });

    let academicRecords: any[] = [];
    app.get('/api/academic-records', (req, res) => {
        res.json(academicRecords);
    });
    app.post('/api/academic-records', (req, res) => {
        const data = req.body;
        const idx = academicRecords.findIndex(r => r.studentId === data.studentId);
        if (idx > -1) {
            academicRecords[idx] = { ...academicRecords[idx], ...data };
            res.json(academicRecords[idx]);
        } else {
            const newRecord = { ...data, id: Math.random().toString(36).substr(2, 9) };
            academicRecords.push(newRecord);
            res.json(newRecord);
        }
    });

    app.get('/api/users', (req, res) => res.json(users));
    app.post('/api/users', (req, res) => {
        const newUser = { ...req.body, id: Math.random().toString(36).substr(2, 9) };
        users.push(newUser);
        res.json(newUser);
    });
    app.put('/api/users/:id', (req, res) => {
        const index = users.findIndex(u => u.id === req.params.id);
        if (index !== -1) {
            users[index] = { ...users[index], ...req.body };
            res.json(users[index]);
        } else {
            res.status(404).send('User not found');
        }
    });
    app.delete('/api/users/:id', (req, res) => {
        users = users.filter(u => u.id !== req.params.id);
        res.json({ status: 'success' });
    });

    app.get('/api/health', (req, res) => {
        res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    // Vite integration
    if (process.env.NODE_ENV !== 'production') {
        const vite = await createViteServer({
            server: { middlewareMode: true },
            appType: 'spa',
        });
        app.use(vite.middlewares);
    } else {
        // Production setup
        const distPath = path.resolve(__dirname, 'dist');
        app.use(express.static(distPath));
        app.get('*', (req, res) => {
            res.sendFile(path.resolve(distPath, 'index.html'));
        });
    }

    app.listen(PORT, '0.0.0.0', () => {
        console.log(`EduFlow Server running at http://localhost:${PORT}`);
        console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    });
}

startServer();
