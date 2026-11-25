import { Staff, StaffSalaryPayment } from '../types';

export interface PayrollMonthOption {
  key: string; // '01'..'12'
  index: number; // 1..12
  nameEn: string;
  shortEn: string;
  nameBn: string;
  shortBn: string;
}

export const PAYROLL_MONTHS: PayrollMonthOption[] = [
  { key: '01', index: 1, nameEn: 'January', shortEn: 'Jan', nameBn: 'জানুয়ারি', shortBn: 'জানু' },
  { key: '02', index: 2, nameEn: 'February', shortEn: 'Feb', nameBn: 'ফেব্রুয়ারি', shortBn: 'ফেব' },
  { key: '03', index: 3, nameEn: 'March', shortEn: 'Mar', nameBn: 'মার্চ', shortBn: 'মার্চ' },
  { key: '04', index: 4, nameEn: 'April', shortEn: 'Apr', nameBn: 'এপ্রিল', shortBn: 'এপ্রি' },
  { key: '05', index: 5, nameEn: 'May', shortEn: 'May', nameBn: 'মে', shortBn: 'মে' },
  { key: '06', index: 6, nameEn: 'June', shortEn: 'Jun', nameBn: 'জুন', shortBn: 'জুন' },
  { key: '07', index: 7, nameEn: 'July', shortEn: 'Jul', nameBn: 'জুলাই', shortBn: 'জুলা' },
  { key: '08', index: 8, nameEn: 'August', shortEn: 'Aug', nameBn: 'আগস্ট', shortBn: 'আগ' },
  { key: '09', index: 9, nameEn: 'September', shortEn: 'Sep', nameBn: 'সেপ্টেম্বর', shortBn: 'সেপ্টে' },
  { key: '10', index: 10, nameEn: 'October', shortEn: 'Oct', nameBn: 'অক্টোবর', shortBn: 'অক্টো' },
  { key: '11', index: 11, nameEn: 'November', shortEn: 'Nov', nameBn: 'নভেম্বর', shortBn: 'নভে' },
  { key: '12', index: 12, nameEn: 'December', shortEn: 'Dec', nameBn: 'ডিসেম্বর', shortBn: 'ডিসে' },
];

export function getCurrentYearMonth(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function getTodayDateStr(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatMonthLabel(ym: string, language: 'bn' | 'en'): string {
  if (!ym || !/^\d{4}-\d{2}$/.test(ym)) return ym;
  const [year, monthKey] = ym.split('-');
  const found = PAYROLL_MONTHS.find((m) => m.key === monthKey);
  if (!found) return ym;
  return language === 'bn' ? `${found.nameBn} ${year}` : `${found.nameEn} ${year}`;
}

export function shiftYearMonth(ym: string, deltaMonths: number): string {
  const [yStr, mStr] = (ym || getCurrentYearMonth()).split('-');
  const d = new Date(Number(yStr), Number(mStr) - 1 + deltaMonths, 15);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export type StaffMonthPayrollStatus =
  | 'Paid'
  | 'Partial'
  | 'Due'
  | 'Upcoming'
  | 'BeforeJoining'
  | 'Resigned'
  | 'Unconfigured';

export interface StaffMonthPayrollSummary {
  staff: Staff;
  month: string;
  basicSalary: number;
  houseRentAllowance: number;
  medicalAllowance: number;
  otherAllowance: number;
  bonus: number;
  grossSalary: number;
  providentFundDeduction: number;
  otherDeduction: number;
  deductionNote?: string;
  netPayable: number;
  paidAmount: number;
  dueAmount: number;
  status: StaffMonthPayrollStatus;
  payments: StaffSalaryPayment[];
  latestPayment?: StaffSalaryPayment;
}

export function computeStaffMonthSummary(
  member: Staff,
  ym: string,
  allPayments: StaffSalaryPayment[],
  currentYm: string = getCurrentYearMonth()
): StaffMonthPayrollSummary {
  const payments = allPayments
    .filter((p) => (p.staffId === member.id || p.employeeId === member.employeeId) && p.month === ym)
    .sort((a, b) => (b.createdAt || b.paymentDate).localeCompare(a.createdAt || a.paymentDate));

  const joiningYm = (member.joiningDate || '').trim().slice(0, 7);
  const isBeforeJoining = Boolean(joiningYm && /^\d{4}-\d{2}$/.test(joiningYm) && ym < joiningYm);

  if (payments.length > 0) {
    const latest = payments[0];
    const basicSalary = Number(latest.basicSalary) || 0;
    const houseRentAllowance = Number(latest.houseRentAllowance) || 0;
    const medicalAllowance = Number(latest.medicalAllowance) || 0;
    const otherAllowance = Number(latest.otherAllowance) || 0;
    const bonus = Number(latest.bonus) || 0;
    const grossSalary = basicSalary + houseRentAllowance + medicalAllowance + otherAllowance + bonus;
    const providentFundDeduction = Number(latest.providentFundDeduction) || 0;
    const otherDeduction = Number(latest.otherDeduction) || 0;
    const netPayable = Math.max(0, grossSalary - providentFundDeduction - otherDeduction);
    const paidAmount = payments.reduce((sum, p) => sum + Math.max(0, Number(p.paidAmount) || 0), 0);
    const dueAmount = Math.max(0, netPayable - paidAmount);

    let status: StaffMonthPayrollStatus = 'Paid';
    if (dueAmount === 0 && paidAmount >= netPayable) {
      status = 'Paid';
    } else if (paidAmount > 0) {
      status = 'Partial';
    } else {
      status = ym > currentYm ? 'Upcoming' : 'Due';
    }

    return {
      staff: member,
      month: ym,
      basicSalary,
      houseRentAllowance,
      medicalAllowance,
      otherAllowance,
      bonus,
      grossSalary,
      providentFundDeduction,
      otherDeduction,
      deductionNote: latest.deductionNote,
      netPayable,
      paidAmount,
      dueAmount,
      status,
      payments,
      latestPayment: latest,
    };
  }

  const basicSalary = Number(member.basicSalary) || 0;
  const houseRentAllowance = Number(member.houseRentAllowance) || 0;
  const medicalAllowance = Number(member.medicalAllowance) || 0;
  const otherAllowance = Number(member.otherAllowance) || 0;
  const grossSalary = basicSalary + houseRentAllowance + medicalAllowance + otherAllowance;
  const providentFundDeduction = Number(member.providentFundDeduction) || 0;
  const netPayable = Math.max(0, grossSalary - providentFundDeduction);

  let status: StaffMonthPayrollStatus;
  let dueAmount = 0;

  if (isBeforeJoining) {
    status = 'BeforeJoining';
  } else if (member.status === 'resigned') {
    status = 'Resigned';
  } else if (netPayable <= 0) {
    status = 'Unconfigured';
  } else if (ym > currentYm) {
    status = 'Upcoming';
  } else {
    status = 'Due';
    dueAmount = netPayable;
  }

  return {
    staff: member,
    month: ym,
    basicSalary,
    houseRentAllowance,
    medicalAllowance,
    otherAllowance,
    bonus: 0,
    grossSalary,
    providentFundDeduction,
    otherDeduction: 0,
    netPayable,
    paidAmount: 0,
    dueAmount,
    status,
    payments: [],
  };
}
