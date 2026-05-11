const DEFAULT_SPREADSHEET_ID = '1TurKpEmt-gA-5pF-BQvyVikslV8YAQ8vZqGj5sXkZQg';
const DEFAULT_SHEET_NAME = 'Rekap Akademik';
const DEFAULT_WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbzHdQC1AQDWXQfG5LKTeP1QNuOq5q6ZouVZucX3Eb_56IRuNoemEi8YUKB4LvXs5Gvo/exec';

export default async function handler(req: any, res: any) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return res.status(405).json({ status: 'error', message: 'Method not allowed' });
    }

    const webhookUrl = String(process.env.VITE_ACADEMIC_SHEET_WEBHOOK_URL || DEFAULT_WEBHOOK_URL).trim();
    const spreadsheetId = String(req.query.spreadsheetId || process.env.VITE_ACADEMIC_SPREADSHEET_ID || DEFAULT_SPREADSHEET_ID).trim();
    const sheetName = String(req.query.sheetName || process.env.VITE_ACADEMIC_REKAP_SHEET_NAME || DEFAULT_SHEET_NAME).trim();

    if (!webhookUrl) {
        return res.status(400).json({
            status: 'error',
            message: 'VITE_ACADEMIC_SHEET_WEBHOOK_URL belum diatur di Vercel environment.'
        });
    }

    try {
        const url = new URL(webhookUrl);
        url.searchParams.set('mode', 'read');
        url.searchParams.set('spreadsheetId', spreadsheetId);
        url.searchParams.set('sheetName', sheetName);

        const response = await fetch(url.toString(), {
            method: 'GET',
            headers: { Accept: 'application/json' }
        });

        const text = await response.text();
        let data: any;
        try {
            data = JSON.parse(text);
        } catch {
            data = { raw: text };
        }

        if (!response.ok) {
            return res.status(response.status).json({
                status: 'error',
                message: data?.message || `Gagal mengambil data sheet (${response.status})`,
                details: data
            });
        }

        return res.status(200).json(data);
    } catch (error: any) {
        console.error('Error fetching academic sheet snapshot:', error);
        return res.status(500).json({
            status: 'error',
            message: error?.message || 'Gagal mengambil data Google Sheets.'
        });
    }
}
