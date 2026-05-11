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

  const normalizedRows = rows.map((row) => {
    if (tableName === 'students') {
      return {
        ...row,
        studentId: String(row?.studentId || row?.id || '').trim(),
        studentName: row?.studentName || row?.name || ''
      };
    }

    if (tableName === 'academicRecords') {
      return {
        ...row,
        studentId: String(row?.studentId || row?.id || '').trim()
      };
    }

    return row;
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

for (const item of TABLES) {
  await backfillTable(item);
}

console.log('\nBackfill selesai.');
