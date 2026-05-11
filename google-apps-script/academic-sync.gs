const DEFAULT_REKAP_SHEET_NAME = 'Rekap Akademik';
const DEFAULT_STUDENT_SHEET_NAME = 'Database Siswa';
const DEFAULT_GRADE_SHEET_NAME = 'Input Nilai';
const FIXED_HEADERS = [
  'updatedAt',
  'studentId',
  'studentName',
  'classId',
  'className',
  'attendanceNumber',
  'tka',
  'avgRapot',
  'finalScore',
  'totalPrestasi',
  'source'
];

const SHEET_KEY_RULES = {
  'Database Siswa': ['id', 'studentId', 'nisn', 'nis'],
  'Students': ['id', 'studentId', 'nisn', 'nis'],
  'Input Nilai': ['id', 'studentId', 'materialId', 'scoreType'],
  'Grades': ['id', 'studentId', 'materialId', 'scoreType'],
  'Rekap Akademik': ['studentId', 'id'],
  'Akademik & Ijazah': ['studentId', 'id']
};

function doPost(e) {
  const payload = parsePayload_(e);
  const mode = String(payload.mode || 'upsert').trim().toLowerCase();
  const spreadsheetId = String(payload.spreadsheetId || getParam_(e, 'spreadsheetId') || '').trim();
  const sheetName = String(payload.targetSheet || payload.sheetName || getParam_(e, 'sheetName') || DEFAULT_REKAP_SHEET_NAME).trim();
  const tableName = String(payload.tableName || '').trim();

  if (!spreadsheetId) {
    return jsonResponse_({ status: 'error', message: 'spreadsheetId wajib diisi.' }, 400);
  }

  const sheet = getOrCreateSheet_(spreadsheetId, sheetName);

  if (mode === 'truncate') {
    sheet.clearContents();
    return jsonResponse_({
      status: 'success',
      message: 'Sheet berhasil dikosongkan.',
      sheetName: sheetName,
      updatedAt: new Date().toISOString()
    });
  }

  if (mode === 'replace') {
    const replaceRecords = Array.isArray(payload.records)
      ? payload.records
      : (payload.record ? [payload.record] : []);

    sheet.clearContents();

    let headers = FIXED_HEADERS.slice();
    replaceRecords.forEach((record) => {
      headers = mergeHeaders_(headers, record);
    });

    writeHeaders_(sheet, headers);

    if (!replaceRecords.length) {
      return jsonResponse_({
        status: 'success',
        message: 'Sheet berhasil diganti.',
        sheetName: sheetName,
        updatedAt: new Date().toISOString(),
        count: 0
      });
    }

    const rows = replaceRecords.map((record) => {
      const rowObject = normalizeRecord_(record);
      return headers.map((header) => toCellValue_(rowObject[header]));
    });

    sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
    trimExtraColumns_(sheet, headers.length);

    return jsonResponse_({
      status: 'success',
      message: 'Sheet berhasil diganti.',
      sheetName: sheetName,
      updatedAt: new Date().toISOString(),
      count: replaceRecords.length
    });
  }

  const records = Array.isArray(payload.records)
    ? payload.records
    : (payload.record ? [payload.record] : []);

  if (!records.length) {
    return jsonResponse_({ status: 'error', message: 'Tidak ada record untuk disimpan.' }, 400);
  }

  const existing = readSheet_(sheet);
  const keyFields = getKeyFields_(sheetName, tableName);

  if (mode === 'delete') {
    const keys = records
      .map((record) => getRecordKey_(record, sheetName, tableName, keyFields))
      .filter(Boolean);
    deleteRowsByKeys_(sheet, existing.headers, existing.rows, sheetName, tableName, keyFields, keys);
    return jsonResponse_({
      status: 'success',
      message: 'Data berhasil dihapus dari Google Sheets.',
      sheetName: sheetName,
      updatedAt: new Date().toISOString(),
      count: keys.length
    });
  }

  let headers = existing.headers.length ? existing.headers.slice() : FIXED_HEADERS.slice();
  records.forEach((record) => {
    headers = mergeHeaders_(headers, record);
  });

  writeHeaders_(sheet, headers);
  const rowIndexByKey = buildRowIndex_(existing.rows, sheetName, tableName, keyFields);

  records.forEach((record) => {
    const rowObject = normalizeRecord_(record);
    const rowValues = headers.map((header) => toCellValue_(rowObject[header]));
    const recordKey = getRecordKey_(rowObject, sheetName, tableName, keyFields);

    if (!recordKey) {
      return;
    }

    const existingRowIndex = rowIndexByKey[recordKey];
    if (existingRowIndex) {
      sheet.getRange(existingRowIndex, 1, 1, headers.length).setValues([rowValues]);
    } else {
      sheet.appendRow(rowValues);
    }
  });

  trimExtraColumns_(sheet, headers.length);

  return jsonResponse_({
    status: 'success',
    message: 'Data berhasil disimpan ke Google Sheets.',
    sheetName: sheetName,
    updatedAt: new Date().toISOString(),
    count: records.length
  });
}

function doGet(e) {
  const spreadsheetId = String(getParam_(e, 'spreadsheetId') || '').trim();
  const sheetName = String(getParam_(e, 'sheetName') || DEFAULT_REKAP_SHEET_NAME).trim();

  if (!spreadsheetId) {
    return jsonResponse_({ status: 'error', message: 'spreadsheetId wajib diisi.' }, 400);
  }

  const sheet = getOrCreateSheet_(spreadsheetId, sheetName);
  const snapshot = readSheet_(sheet);

  return jsonResponse_({
    status: 'success',
    sheetName: sheetName,
    updatedAt: new Date().toISOString(),
    lastRow: sheet.getLastRow(),
    lastColumn: sheet.getLastColumn(),
    headers: snapshot.headers,
    records: snapshot.rows
  });
}

function getOrCreateSheet_(spreadsheetId, sheetName) {
  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  let sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(sheetName);
  }
  return sheet;
}

function readSheet_(sheet) {
  const values = sheet.getDataRange().getValues();
  if (!values.length || !values[0].length) {
    return { headers: [], rows: [] };
  }

  const headers = values[0].map((header) => String(header || '').trim()).filter(Boolean);
  const rows = values.slice(1).filter((row) => row.some((cell) => cell !== '' && cell !== null && cell !== undefined)).map((row) => {
    const obj = {};
    headers.forEach((header, index) => {
      obj[header] = row[index] ?? '';
    });
    return obj;
  });

  return { headers, rows };
}

function mergeHeaders_(existingHeaders, record) {
  const headers = existingHeaders.slice();
  Object.keys(normalizeRecord_(record)).forEach((key) => {
    if (!headers.includes(key)) {
      headers.push(key);
    }
  });
  return headers;
}

function normalizeRecord_(record) {
  const row = {};
  flattenRecord_(record || {}, row);
  if (!row.updatedAt) row.updatedAt = new Date().toISOString();
  if (!row.source) row.source = 'EduFlow-Supabase';
  return row;
}

function flattenRecord_(input, output, prefix) {
  Object.keys(input || {}).forEach((key) => {
    if (key === 'records') return;
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
          flattenRecord_(item, output, `${nextKey}_${index + 1}`);
        });
        return;
      }

      output[nextKey] = value.join(', ');
      return;
    }

    if (typeof value === 'object') {
      flattenRecord_(value, output, nextKey);
      return;
    }

    output[nextKey] = value;
  });
}

function getKeyFields_(sheetName, tableName) {
  return SHEET_KEY_RULES[sheetName] || SHEET_KEY_RULES[tableName] || ['id', 'studentId'];
}

function buildRowIndex_(rows, sheetName, tableName, keyFields) {
  const index = {};
  rows.forEach((row, idx) => {
    const key = getRecordKey_(row, sheetName, tableName, keyFields);
    if (key) {
      index[key] = idx + 2; // account for header row
    }
  });
  return index;
}

function getRecordKey_(record, sheetName, tableName, keyFields) {
  const normalized = normalizeRecord_(record);
  const fields = keyFields || getKeyFields_(sheetName, tableName);

  for (let i = 0; i < fields.length; i++) {
    const field = fields[i];
    const value = String(normalized[field] || '').trim();
    if (value) return value;
  }

  if (sheetName === 'Input Nilai' || tableName === 'grades') {
    const studentId = String(normalized.studentId || '').trim();
    const materialId = String(normalized.materialId || '').trim();
    const scoreType = String(normalized.scoreType || '').trim();
    const fallback = [studentId, materialId, scoreType].filter(Boolean).join('__');
    if (fallback) return fallback;
  }

  if (sheetName === 'Rekap Akademik' || sheetName === 'Akademik & Ijazah' || tableName === 'academicRecords') {
    const studentId = String(normalized.studentId || '').trim();
    if (studentId) return studentId;
  }

  return String(normalized.id || normalized.studentId || normalized.key || '').trim();
}

function deleteRowsByKeys_(sheet, headers, rows, sheetName, tableName, keyFields, keys) {
  if (!headers.length || !keys.length) return;

  const rowsToDelete = [];
  for (let rowIndex = rows.length - 1; rowIndex >= 0; rowIndex--) {
    const currentKey = getRecordKey_(rows[rowIndex], sheetName, tableName, keyFields);
    if (currentKey && keys.includes(currentKey)) {
      rowsToDelete.push(rowIndex + 2);
    }
  }

  rowsToDelete.forEach((rowNumber) => sheet.deleteRow(rowNumber));
}

function writeHeaders_(sheet, headers) {
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.setFrozenRows(1);
}

function trimExtraColumns_(sheet, desiredColumns) {
  const maxColumns = sheet.getMaxColumns();
  if (maxColumns > desiredColumns) {
    sheet.deleteColumns(desiredColumns + 1, maxColumns - desiredColumns);
  }
}

function toCellValue_(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return value;
}

function parsePayload_(e) {
  if (e && e.postData && e.postData.contents) {
    try {
      return JSON.parse(e.postData.contents);
    } catch (error) {
      return {};
    }
  }
  return {};
}

function getParam_(e, key) {
  if (!e || !e.parameter) return '';
  return e.parameter[key] || '';
}

function jsonResponse_(payload, statusCode) {
  const output = ContentService.createTextOutput(JSON.stringify(payload));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}
