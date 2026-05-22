import fs from 'fs';

let contentOld = fs.readFileSync('C:/Users/Administrator/AppData/Local/Temp/App_old_utf8.tsx', 'utf8');
let contentCurrent = fs.readFileSync('src/App.tsx', 'utf8');

const oldStartIdx = contentOld.indexOf('function GemariView({');
const oldEndIdx = contentOld.indexOf('function SavingsView({', oldStartIdx);
let oldGemariView = contentOld.substring(oldStartIdx, oldEndIdx).trim();

// Add useMemo to filteredStudents and monthTransactions, monthSchoolDays, studentRows, ledgerRows
oldGemariView = oldGemariView.replace(
    /const filteredStudents = students\.filter\(s => !selectedClassId \|\| String\(s\.classId\) === String\(selectedClassId\)\);/,
    'const filteredStudents = React.useMemo(() => students.filter(s => !selectedClassId || String(s.classId) === String(selectedClassId)), [students, selectedClassId]);'
);

oldGemariView = oldGemariView.replace(
    /const monthTransactions = transactions\.filter\(t => t\.type === 'gemari' && \(!selectedClassId \|\| String\(t\.classId\) === String\(selectedClassId\)\) && \(t\.date \|\| ''\)\.startsWith\(selectedMonth\)\);/,
    "const monthTransactions = React.useMemo(() => transactions.filter(t => t.type === 'gemari' && (!selectedClassId || String(t.classId) === String(selectedClassId)) && (t.date || '').startsWith(selectedMonth)), [transactions, selectedClassId, selectedMonth]);"
);

oldGemariView = oldGemariView.replace(
    /const monthSchoolDays = \(\(\) => \{/,
    'const monthSchoolDays = React.useMemo(() => {'
).replace(
    /        return total;\n    \}\)\(\);/,
    '        return total;\n    }, [selectedMonth, holidays]);'
);

oldGemariView = oldGemariView.replace(
    /const isHoliday = holidays\.some\(h => h\.date === dateStr\);/,
    'const isHoliday = (holidays || []).some((h: any) => h.date === dateStr);'
);

// FIX SYNTAX ERROR IN STUDENTROWS: 
// previous match: `}).sort(` -> we need to wrap the whole expression inside `useMemo(() => { return ... }, [deps])`
oldGemariView = oldGemariView.replace(
    /const studentRows = filteredStudents\.map\(s => \{/,
    'const studentRows = React.useMemo(() => filteredStudents.map(s => {'
).replace(
    /\}\)\.sort\(\(a, b\) => \{\n        const order: Record<string, number> = \{ kurang_bayar: 0, belum_bayar: 1, sudah_bayar: 2 \};\n        return order\[a\.status\] - order\[b\.status\] \|\| a\.student\.name\.localeCompare\(b\.student\.name, 'id-ID', \{ numeric: true, sensitivity: 'base' \}\);\n    \}\);/,
    "}).sort((a, b) => {\n        const order: Record<string, number> = { kurang_bayar: 0, belum_bayar: 1, sudah_bayar: 2 };\n        return order[a.status] - order[b.status] || a.student.name.localeCompare(b.student.name, 'id-ID', { numeric: true, sensitivity: 'base' });\n    });\n    }, [filteredStudents, monthTransactions, targetPerStudent]);"
);

// FIX SYNTAX ERROR IN LEDGERROWS:
oldGemariView = oldGemariView.replace(
    /const ledgerRows = monthTransactions/,
    'const ledgerRows = React.useMemo(() => monthTransactions'
).replace(
    /                return \{ \.\.\.t, student, status \};\n            \}\);/,
    '                return { ...t, student, status };\n            });\n    }, [monthTransactions, selectedStudentId, students, targetPerStudent]);'
);

const currStartIdx = contentCurrent.indexOf('function GemariView({');
const currEndIdx = contentCurrent.indexOf('function SavingsView({', currStartIdx);

if (currStartIdx !== -1 && currEndIdx !== -1) {
    const newContent = contentCurrent.substring(0, currStartIdx) + oldGemariView + '\n\n' + contentCurrent.substring(currEndIdx);
    fs.writeFileSync('src/App.tsx', newContent, 'utf8');
    console.log('Successfully patched GemariView in src/App.tsx');
} else {
    console.error('Could not find GemariView boundaries in src/App.tsx');
}
