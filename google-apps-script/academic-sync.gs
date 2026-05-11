const DEFAULT_REKAP_SHEET_NAME = 'Rekap Akademik';
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

function doPost(e) {
  const payload = parsePayload_(e);
  const mode = String(payload.mode || 'upsert').trim().toLowerCase();
  const spreadsheetId = String(payload.spreadsheetId || getParam_(e, 'spreadsheetId') || '').trim();
  const sheetName = String(payload.targetSheet || payload.sheetName || getParam_(e, 'sheetName') || DEFAULT_REKAP_SHEET_NAME).trim();

  if (!spreadsheetId) {
    return jsonResponse_({ status: 'error', message: 'spreadsheetId wajib diisi.' }, 400);
  }

  const records = Array.isArray(payload.records)
    ? payload.records
    : (payload.record ? [payload.record] : []);

  if (!records.length) {
    return jsonResponse_({ status: 'error', message: 'Tidak ada record untuk disimpan.' }, 400);
  }

  const sheet = getOrCreateSheet_(spreadsheetId, sheetName);
  const existing = readSheet_(sheet);

  if (mode === 'delete') {
    const keys = records
      .map((record) => getRecordKey_(record))
      .filter(Boolean);
    deleteRowsByKeys_(sheet, existing.headers, keys);
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
  const rowIndexByStudentId = buildRowIndex_(existing.rows, 'studentId');

  records.forEach((record) => {
    const rowObject = normalizeRecord_(record);
    const rowValues = headers.map((header) => toCellValue_(rowObject[header]));
    const studentId = String(rowObject.studentId || '').trim();

    if (!studentId) {
      return;
    }

    const existingRowIndex = rowIndexByStudentId[studentId];
    if (existingRowIndex) {
      sheet.getRange(existingRowIndex, 1, 1, headers.length).setValues([rowValues]);
    } else {
      sheet.appendRow(rowValues);
    }
  });

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
  Object.keys(record || {}).forEach((key) => {
    if (key === 'records') return;
    const value = record[key];
    if (value === undefined || value === null) {
      row[key] = '';
      return;
    }
    if (typeof value === 'object') {
      row[key] = JSON.stringify(value);
      return;
    }
    row[key] = value;
  });
  if (!row.updatedAt) row.updatedAt = new Date().toISOString();
  if (!row.source) row.source = 'EduFlow-Academic';
  return row;
}

function buildRowIndex_(rows, keyName) {
  const index = {};
  rows.forEach((row, idx) => {
    const key = String(row[keyName] || '').trim();
    if (key) {
      index[key] = idx + 2; // account for header row
    }
  });
  return index;
}

function getRecordKey_(record) {
  const normalized = normalizeRecord_(record);
  return String(normalized.studentId || normalized.id || normalized.key || '').trim();
}

function deleteRowsByKeys_(sheet, headers, keys) {
  if (!headers.length || !keys.length) return;
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return;

  const keyIndex = headers.includes('studentId') ? headers.indexOf('studentId') : headers.indexOf('id');
  if (keyIndex < 0) return;

  const rowsToDelete = [];
  for (let rowIndex = values.length - 1; rowIndex >= 2; rowIndex--) {
    const currentKey = String(values[rowIndex - 1][keyIndex] || '').trim();
    if (currentKey && keys.includes(currentKey)) {
      rowsToDelete.push(rowIndex);
    }
  }

  rowsToDelete.forEach((rowNumber) => sheet.deleteRow(rowNumber));
}

function writeHeaders_(sheet, headers) {
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.setFrozenRows(1);
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
