/**
 * KAS (Kas Kelas) Utility Functions
 * Gemari: Rp 500/hari (Senin-Jumat kecuali libur)
 * Infaq: Rp 1.000/hari (Jumat kecuali libur)
 */

import { Holiday } from '../types';
import { ClassCalendar, MonthlyPaymentSummary } from '../types';

export const GEMARI_RATE = 500;
export const INFAQ_RATE = 1000;

/**
 * Generate school calendar for a specific month
 */
export function generateSchoolCalendar(
  classId: string,
  year: number,
  month: number, // 0-based (0 = January)
  holidays: Holiday[]
): ClassCalendar {
  const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const schedule: Record<string, any> = {};

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day);
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dayOfWeek = date.getDay(); // 0 = Sunday, 1 = Monday, ..., 5 = Friday, 6 = Saturday
    const holiday = holidays.find(h => h.date === dateStr);

    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const isHoliday = !!holiday;
    const isSchoolDay = !isWeekend && !isHoliday;

    schedule[dateStr] = {
      isSchoolDay,
      isHoliday,
      holidayName: holiday?.name,
      gemariExpected: isSchoolDay, // Gemari setiap hari sekolah
      infaqExpected: isSchoolDay && dayOfWeek === 5, // Infaq hanya Jumat
    };
  }

  return {
    id: `${classId}_${monthStr}`,
    classId,
    month: monthStr,
    year,
    monthNumber: month + 1,
    schedule,
    studentAttendance: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Calculate expected days for a given type in a calendar
 */
export function calculateExpectedDays(
  calendar: ClassCalendar,
  type: 'gemari' | 'infaq'
): { dateCount: number; dates: string[] } {
  const dates: string[] = [];
  Object.entries(calendar.schedule).forEach(([dateStr, info]) => {
    if (info[`${type}Expected`]) {
      dates.push(dateStr);
    }
  });
  return { dateCount: dates.length, dates };
}

/**
 * Calculate actual days from student attendance
 */
export function calculateActualDays(
  calendar: ClassCalendar,
  studentId: string,
  type: 'gemari' | 'infaq'
): { actual: number; expected: number } {
  const studentData = calendar.studentAttendance?.[studentId];
  if (!studentData) {
    const expected = calculateExpectedDays(calendar, type).dateCount;
    return { expected, actual: expected };
  }

  const expected = type === 'gemari' ? studentData.gemariDaysExpected : studentData.infaqDaysExpected;
  const actual = type === 'gemari' ? studentData.gemariDaysActual : studentData.infaqDaysActual;

  return { expected, actual };
}

/**
 * Auto-generate monthly payment summaries for all students in a class
 */
export function generateMonthlySummaries(
  calendar: ClassCalendar,
  studentIds: string[],
  existingSummaries: MonthlyPaymentSummary[] = []
): MonthlyPaymentSummary[] {
  const summaries: MonthlyPaymentSummary[] = [];

  studentIds.forEach(studentId => {
    const gemariExpected = calculateExpectedDays(calendar, 'gemari').dateCount;
    const infaqExpected = calculateExpectedDays(calendar, 'infaq').dateCount;

    const studentData = calendar.studentAttendance?.[studentId];
    const gemariActual = studentData?.gemariDaysActual ?? gemariExpected;
    const infaqActual = studentData?.infaqDaysActual ?? infaqExpected;

    const gemariAmount = gemariActual * GEMARI_RATE;
    const infaqAmount = infaqActual * INFAQ_RATE;
    const totalExpected = gemariExpected * GEMARI_RATE + infaqExpected * INFAQ_RATE;
    const totalActual = gemariAmount + infaqAmount;

    // Find existing summary
    const existing = existingSummaries.find(
      s => s.studentId === studentId && s.month === calendar.month
    );

    // Find payments for this summary
    const payments = existing?.payments || [];
    const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);

    let status: 'lunas' | 'belum_lunas' | 'lebih_bayar' = 'belum_lunas';
    if (totalPaid >= totalActual) {
      status = totalPaid > totalActual ? 'lebih_bayar' : 'lunas';
    }

     summaries.push({
       id: existing?.id || `${studentId}_${calendar.month}`,
       studentId,
       classId: calendar.classId,
       month: calendar.month,
       year: calendar.year,
       gemariDaysExpected: gemariExpected,
       gemariDaysActual: gemariActual,
       gemariAmount,
       infaqDaysExpected: infaqExpected,
       infaqDaysActual: infaqActual,
       infaqAmount,
       totalExpected,
       totalActual,
       payments,
       status,
       notes: existing?.notes,
       createdAt: existing?.createdAt || new Date().toISOString(),
       updatedAt: new Date().toISOString(),
     });
  });

  return summaries;
}

/**
 * Match a payment to monthly summaries
 */
export function matchPaymentToSummary(
  payment: { studentId: string; amount: number; id: string; date: string },
  summaries: MonthlyPaymentSummary[]
): { matched: boolean; summaryId?: string; remainingAmount: number } {
  const studentSummaries = summaries
    .filter(s => s.studentId === payment.studentId)
    .sort((a, b) => {
      // Sort by status: belum_lunas first
      if (a.status === 'belum_lunas' && b.status !== 'belum_lunas') return -1;
      if (a.status !== 'belum_lunas' && b.status === 'belum_lunas') return 1;
      return a.month.localeCompare(b.month);
    });

  let remainingAmount = payment.amount;
  let matched = false;

  for (const summary of studentSummaries) {
    if (remainingAmount <= 0) break;

    const outstanding = summary.totalActual - summary.payments.reduce((sum, p) => sum + p.amount, 0);
    if (outstanding > 0) {
      const paymentAmount = Math.min(outstanding, remainingAmount);
      summary.payments.push({
        paymentId: payment.id,
        amount: paymentAmount,
        date: payment.date,
        type: 'combined',
      });
      remainingAmount -= paymentAmount;
      matched = true;
      // Update status
      const totalPaid = summary.payments.reduce((sum, p) => sum + p.amount, 0);
      summary.status = totalPaid >= summary.totalActual
        ? totalPaid > summary.totalActual
          ? 'lebih_bayar'
          : 'lunas'
        : 'belum_lunas';
    }
  }

  return { matched, remainingAmount };
}

/**
 * Format currency IDR
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('id-ID', { 
    style: 'currency', 
    currency: 'IDR', 
    minimumFractionDigits: 0 
  }).format(amount);
}

/**
 * Get month name in Indonesian
 */
export function getMonthName(month: number): string {
  const names = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ];
  return names[month] || '';
}

/**
 * Get all months in a year
 */
export function getMonthsInYear(year: number): string[] {
  return Array.from({ length: 12 }, (_, i) => 
    `${year}-${String(i + 1).padStart(2, '0')}`
  );
}
