import { describe, it, expect } from 'vitest';
import { computeStaffMonthSummary, shiftYearMonth, formatMonthLabel } from '../../../src/utils/payrollCalculator';
import { Staff, StaffSalaryPayment } from '../../../src/types';

const sampleStaff: Staff = {
  id: 'staff_test_1',
  employeeId: 'T-101',
  nameEn: 'Karim Uddin',
  nameBn: 'করিম উদ্দিন',
  gender: 'Male',
  designation: 'Senior Teacher',
  department: 'Mathematics & Science',
  role: 'teacher',
  email: 'karim@school.edu.bd',
  phone: '01711000000',
  qualification: 'M.Sc',
  joiningDate: '2026-03-10',
  basicSalary: 30000,
  houseRentAllowance: 8000,
  medicalAllowance: 2000,
  otherAllowance: 1000,
  providentFundDeduction: 3000,
  status: 'active',
};

describe('payrollCalculator', () => {
  it('marks months before joiningDate as BeforeJoining with 0 due', () => {
    const res = computeStaffMonthSummary(sampleStaff, '2026-02', [], '2026-11');
    expect(res.status).toBe('BeforeJoining');
    expect(res.dueAmount).toBe(0);
  });

  it('marks unpaid past/current months after joiningDate as Due with accurate Net Payable', () => {
    const res = computeStaffMonthSummary(sampleStaff, '2026-10', [], '2026-11');
    // Gross = 30000 + 8000 + 2000 + 1000 = 41000; PF = 3000; Net = 38000
    expect(res.grossSalary).toBe(41000);
    expect(res.netPayable).toBe(38000);
    expect(res.dueAmount).toBe(38000);
    expect(res.status).toBe('Due');
  });

  it('marks future months as Upcoming with 0 due', () => {
    const res = computeStaffMonthSummary(sampleStaff, '2026-12', [], '2026-11');
    expect(res.status).toBe('Upcoming');
    expect(res.dueAmount).toBe(0);
    expect(res.netPayable).toBe(38000);
  });

  it('tracks Partial and full Paid multi-installment payouts with Bonus and Other Deduction', () => {
    const p1: StaffSalaryPayment = {
      id: 'sal_1',
      voucherNo: 'SAL-202611-001',
      staffId: sampleStaff.id,
      employeeId: sampleStaff.employeeId,
      staffNameEn: sampleStaff.nameEn,
      staffNameBn: sampleStaff.nameBn,
      designation: sampleStaff.designation,
      department: sampleStaff.department,
      month: '2026-11',
      basicSalary: 30000,
      houseRentAllowance: 8000,
      medicalAllowance: 2000,
      otherAllowance: 1000,
      bonus: 5000, // +5000 bonus -> Gross 46000
      grossSalary: 46000,
      providentFundDeduction: 3000,
      otherDeduction: 1000, // -1000 advance -> Net 42000
      netPayable: 42000,
      paidAmount: 20000,
      dueAmount: 22000,
      status: 'Partial',
      paymentDate: '2026-11-05',
      paymentMethod: 'Cash',
      paidBy: 'Admin',
      createdAt: '2026-11-05T10:00:00Z',
    };

    const partialSummary = computeStaffMonthSummary(sampleStaff, '2026-11', [p1], '2026-11');
    expect(partialSummary.netPayable).toBe(42000);
    expect(partialSummary.paidAmount).toBe(20000);
    expect(partialSummary.dueAmount).toBe(22000);
    expect(partialSummary.status).toBe('Partial');

    const p2: StaffSalaryPayment = {
      ...p1,
      id: 'sal_2',
      voucherNo: 'SAL-202611-002',
      paidAmount: 22000,
      dueAmount: 0,
      status: 'Paid',
      paymentDate: '2026-11-15',
      createdAt: '2026-11-15T10:00:00Z',
    };

    const paidSummary = computeStaffMonthSummary(sampleStaff, '2026-11', [p1, p2], '2026-11');
    expect(paidSummary.paidAmount).toBe(42000);
    expect(paidSummary.dueAmount).toBe(0);
    expect(paidSummary.status).toBe('Paid');
  });

  it('shifts and formats YYYY-MM cleanly', () => {
    expect(shiftYearMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftYearMonth('2026-12', 1)).toBe('2027-01');
    expect(formatMonthLabel('2026-11', 'bn')).toBe('নভেম্বর 2026');
    expect(formatMonthLabel('2026-11', 'en')).toBe('November 2026');
  });
});
