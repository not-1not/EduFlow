# Google Sheets Akademik

Ini adalah struktur yang dipakai untuk sinkronisasi `Database Siswa`, `Input Nilai`, dan `Akademik & Ijazah`.

## Tab Utama

- `Database Siswa`
- `Input Nilai`
- `Rekap Akademik`

## Kunci Baris

- `Database Siswa` dan `Students` memakai kunci `id`.
- `Input Nilai` dan `Grades` memakai kunci `id`, lalu fallback `studentId + materialId + scoreType` jika `id` kosong.
- `Rekap Akademik` dan `Akademik & Ijazah` memakai kunci `studentId`.

## Tabel Yang Ikut Sinkron

Mirror otomatis sekarang berlaku untuk tabel inti berikut:

- `students`
- `classes`
- `subjects`
- `materials`
- `grades`
- `attendance`
- `feeItems`
- `studentPayments`
- `savingsTransactions`
- `schoolDeposits`
- `classCashTransactions_*`

Catatan:
- `academicRecords` disinkronkan langsung dari modul `Akademik & Ijazah` dalam bentuk baris datar, bukan auto-mirror generik Supabase.

Tabel tersebut tetap disimpan di Supabase sebagai sumber data utama, lalu setiap write akan dimirror ke Google Sheets.

## Kolom Tetap

Urutan kolom dasar yang disimpan di baris 1:

1. `updatedAt`
2. `studentId`
3. `studentName`
4. `classId`
5. `className`
6. `attendanceNumber`
7. `tka`
8. `avgRapot`
9. `finalScore`
10. `totalPrestasi`
11. `source`

## Kolom Dinamis Rapot

Untuk setiap mapel rapot, akan dibuat 5 kolom:

- `<Nama Mapel> S4.1`
- `<Nama Mapel> S4.2`
- `<Nama Mapel> S5.1`
- `<Nama Mapel> S5.2`
- `<Nama Mapel> S6.1`

## Kolom Dinamis Ijazah

Untuk setiap mapel ijazah, akan dibuat 2 kolom:

- `<Nama Mapel> (P)`
- `<Nama Mapel> (K)`

## Contoh Urutan Kolom

Jika ada 2 mapel rapot dan 1 mapel ijazah, urutannya akan terlihat seperti ini:

`updatedAt | studentId | studentName | classId | className | attendanceNumber | tka | avgRapot | finalScore | totalPrestasi | source | Mapel 1 S4.1 | ... | Mapel 1 S6.1 | Mapel 2 S4.1 | ... | Mapel 2 S6.1 | Ijazah 1 (P) | Ijazah 1 (K)`

## Catatan Operasional

- Satu baris = satu siswa.
- Data terbaru akan di-upsert berdasarkan kunci tab masing-masing.
- Saat mapel berubah, header otomatis diperbarui oleh Apps Script.
- Snapshot live di app dibaca dari endpoint proxy lokal `GET /api/academic-sheet-rekap`.

## Contoh Payload Awal

Payload awal yang dikirim aplikasi saat menulis data pertama ke sheet berbentuk seperti ini:

```json
{
  "mode": "upsert",
  "source": "EduFlow-Academic",
  "spreadsheetId": "1TurKpEmt-gA-5pF-BQvyVikslV8YAQ8vZqGj5sXkZQg",
  "targetSheet": "Rekap Akademik",
  "record": {
    "updatedAt": "2026-05-11T15:10:00.000Z",
    "studentId": "stu-001",
    "studentName": "Nama Siswa",
    "classId": "1",
    "className": "Kelas 6A",
    "attendanceNumber": 1,
    "tka": 87,
    "avgRapot": 84.5,
    "finalScore": 85.7,
    "totalPrestasi": 5,
    "source": "EduFlow-Academic",
    "Mapel 1 S4.1": 80,
    "Mapel 1 S4.2": 81,
    "Mapel 1 S5.1": 82,
    "Mapel 1 S5.2": 83,
    "Mapel 1 S6.1": 84,
    "Mapel 1 (P)": 90,
    "Mapel 1 (K)": 91
  }
}
```

Kalau mapel bertambah, Apps Script akan menambahkan kolom baru otomatis berdasarkan nama header yang masuk.

## Deploy Script

1. Buka Google Apps Script yang terhubung ke spreadsheet.
2. Tempel file `google-apps-script/academic-sync.gs`.
3. Deploy sebagai Web App.
4. Set akses ke `Anyone with the link` atau sesuai kebutuhan internal.
5. Isi `VITE_ACADEMIC_SHEET_WEBHOOK_URL` dengan URL Web App hasil deploy.
