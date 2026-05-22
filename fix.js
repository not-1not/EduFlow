const fs = require('fs');
let c = fs.readFileSync('src/App.tsx', 'utf8');
c = c.replace(/    \}\);\\n    \}, \[filteredStudents, monthTransactions, targetPerStudent\]\);/, '    });\n    }, [filteredStudents, monthTransactions, targetPerStudent]);');
c = c.replace(/        \}\);\\n    \}, \[monthTransactions, selectedStudentId, students, targetPerStudent\]\);/, '        });\n    }, [monthTransactions, selectedStudentId, students, targetPerStudent]);');
c = c.replace(/    \}\);\r?\n\r?\n    const totalPaid = studentRows\.reduce/, '    });\n    }, [filteredStudents, monthTransactions, targetPerStudent]);\n\n    const totalPaid = studentRows.reduce');
c = c.replace(/        \}\);\r?\n\r?\n    return \(/, '        });\n    }, [monthTransactions, selectedStudentId, students, targetPerStudent]);\n\n    return (');
fs.writeFileSync('src/App.tsx', c);
