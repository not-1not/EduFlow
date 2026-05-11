import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || '';
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || '';
const WEBHOOK_URL = process.env.VITE_ACADEMIC_SHEET_WEBHOOK_URL || 'https://script.google.com/macros/s/AKfycbzHdQC1AQDWXQfG5LKTeP1QNuOq5q6ZouVZucX3Eb_56IRuNoemEi8YUKB4LvXs5Gvo/exec';
const SPREADSHEET_ID = process.env.VITE_ACADEMIC_SPREADSHEET_ID || '1TurKpEmt-gA-5pF-BQvyVikslV8YAQ8vZqGj5sXkZQg';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error('Supabase env belum lengkap.');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const TABLES = [
  { tableName: 'students', targetSheet: 'Database Siswa' },
  { tableName: 'grades', targetSheet: 'Input Nilai' },
  { tableName: 'academicRecords', targetSheet: 'Rekap Akademik' }
];

const DEFAULT_ACADEMIC_CONFIG = [
  'Pendidikan Agama & Budi Pekerti',
  'PPKn',
  'Bahasa Indonesia',
  'Matematika',
  'Ilmu Pengetahuan Alam dan Sosial',
  'Seni Budaya & Prakarya',
  'Pendidikan Jasmani',
  'Mulok Bahasa Jawa',
  'Bahasa Inggris'
].map((name, index) => ({ id: `s${index}`, name }));

const DEFAULT_IIJAZAH_CONFIG = [
  'Pendidikan Agama & Budi Pekerti',
  'PPKn',
  'Bahasa Indonesia',
  'Matematika',
  'IPAS',
  'SBdP',
  'PJOK',
  'Bahasa Jawa',
  'Bahasa Inggris'
].map((name, index) => ({ id: `ij${index}`, name }));

async function fetchAll(tableName) {
  const rows = [];
  const pageSize = 500;
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from(tableName)
      .select('*')
      .range(offset, offset + pageSize - 1);

    if (error) throw error;
    if (!Array.isArray(data) || data.length === 0) break;

    rows.push(...data);
    if (data.length < pageSize) break;
    offset += pageSize;
  }

  return rows;
}

async function fetchSettingsConfig() {
  const [academicSnap, ijazahSnap] = await Promise.all([
    supabase.from('settings').select('*').eq('id', 'academic_config').maybeSingle(),
    supabase.from('settings').select('*').eq('id', 'ijazah_config').maybeSingle()
  ]);

  const academicSubjects = academicSnap.data?.subjects || DEFAULT_ACADEMIC_CONFIG;
  const ijazahSubjects = ijazahSnap.data?.subjects || DEFAULT_IIJAZAH_CONFIG;

  return { academicSubjects, ijazahSubjects };
}

async function fetchLookups() {
  const [students, classes] = await Promise.all([
    fetchAll('students'),
    fetchAll('classes')
  ]);

  const studentMap = new Map(
    students.map((student) => [String(student?.id || '').trim(), student])
  );
  const classMap = new Map(
    classes.map((klass) => [String(klass?.id || '').trim(), klass])
  );

  return { studentMap, classMap };
}

async function postSheet(payload) {
  const response = await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      spreadsheetId: SPREADSHEET_ID,
      source: 'EduFlow-Backfill',
      ...payload
    })
  });

  const text = await response.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { raw: text };
  }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${parsed?.message || text}`);
  }

  return parsed;
}

async function backfillTable({ tableName, targetSheet }) {
  console.log(`\n==> ${tableName} -> ${targetSheet}`);
  const rows = await fetchAll(tableName);
  console.log(`Fetched ${rows.length} rows`);

  const { academicSubjects, ijazahSubjects } = await fetchSettingsConfig();
  const { studentMap, classMap } = await fetchLookups();

  const normalizedRows = rows.map((row) => {
    const base = { ...row };

    if (tableName === 'students') {
      base.studentId = String(row?.studentId || row?.id || '').trim();
      base.studentName = row?.studentName || row?.name || '';
    }

    if (tableName === 'academicRecords') {
      return buildAcademicSheetRow(row, academicSubjects, ijazahSubjects, studentMap, classMap);
    }

    return flattenRecord(base);
  });

  await postSheet({
    mode: 'replace',
    tableName,
    targetSheet,
    records: normalizedRows
  });

  if (rows.length === 0) {
    console.log('Sheet dikosongkan, data kosong.');
    return;
  }

  console.log(`Replaced ${rows.length} rows successfully.`);
}

function buildAcademicSheetRow(payload, academicSubjects, ijazahSubjects, studentMap, classMap) {
  const studentId = String(payload?.studentId || payload?.id || '').trim();
  const student = studentMap.get(studentId) || {};
  const studentClassId = String(payload?.classId || student?.classId || '').trim();
  const klass = classMap.get(studentClassId) || classMap.get(String(student?.classId || '').trim()) || {};
  const rapot = payload?.rapot || {};
  const ijazah = normalizeIjazahPayload(payload?.ijazah || {});
  const totalPrestasi = Array.isArray(payload?.prestasi)
    ? payload.prestasi.reduce((acc, p) => acc + (Number(p?.poin) || 0), 0)
    : Number(payload?.totalPrestasi || 0);
  const avgRapot = getAverageRapot(payload, academicSubjects);
  const finalScore = Number(payload?.finalScore ?? ((avgRapot * 0.5) + (Number(payload?.tka || 0) * 0.5) + totalPrestasi));

  const row = {
    updatedAt: payload?.updatedAt || new Date().toISOString(),
    studentId,
    studentName: payload?.studentName || payload?.name || student?.name || '',
    classId: studentClassId,
    className: payload?.className || klass?.name || studentClassId || '',
    attendanceNumber: payload?.attendanceNumber ?? student?.attendanceNumber ?? '',
    tka: payload?.tka ?? '',
    avgRapot,
    finalScore,
    totalPrestasi,
    source: payload?.source || 'EduFlow-Academic'
  };

  academicSubjects.forEach((sub) => {
    const g = rapot?.[sub.id] || {};
    row[`${sub.name} S4.1`] = g.s41 ?? '';
    row[`${sub.name} S4.2`] = g.s42 ?? '';
    row[`${sub.name} S5.1`] = g.s51 ?? '';
    row[`${sub.name} S5.2`] = g.s52 ?? '';
    row[`${sub.name} S6.1`] = g.s61 ?? '';
  });

  ijazahSubjects.forEach((sub) => {
    const iz = ijazah?.[sub.id] || {};
    row[`${sub.name} (P)`] = iz.grade_p ?? '';
    row[`${sub.name} (K)`] = iz.grade_k ?? '';
  });

  return row;
}

function getAverageRapot(payload, academicSubjects) {
  let total = 0;
  let count = 0;
  academicSubjects.forEach((sub) => {
    const g = payload?.rapot?.[sub.id] || {};
    ['s41', 's42', 's51', 's52', 's61'].forEach((k) => {
      const value = g?.[k];
      if (value !== '' && value !== null && value !== undefined && !Number.isNaN(Number(value))) {
        total += Number(value);
        count++;
      }
    });
  });
  return count > 0 ? total / count : 0;
}

function normalizeIjazahPayload(raw) {
  if (Array.isArray(raw)) {
    return raw.reduce((acc, curr, idx) => {
      const key = curr?.id || `ij_${idx}`;
      acc[key] = curr;
      return acc;
    }, {});
  }
  return raw || {};
}

function flattenRecord(input, output = {}, prefix = '') {
  Object.keys(input || {}).forEach((key) => {
    const value = input[key];
    const nextKey = prefix ? `${prefix}_${key}` : key;

    if (value === undefined || value === null) {
      output[nextKey] = '';
      return;
    }

    if (Array.isArray(value)) {
      if (!value.length) {
        output[nextKey] = '';
        return;
      }

      if (value.every((item) => item && typeof item === 'object' && !Array.isArray(item))) {
        value.forEach((item, index) => {
          flattenRecord(item, output, `${nextKey}_${index + 1}`);
        });
        return;
      }

      output[nextKey] = value.join(', ');
      return;
    }

    if (typeof value === 'object') {
      flattenRecord(value, output, nextKey);
      return;
    }

    output[nextKey] = value;
  });

  return output;
}

for (const item of TABLES) {
  await backfillTable(item);
}

console.log('\nBackfill selesai.');
