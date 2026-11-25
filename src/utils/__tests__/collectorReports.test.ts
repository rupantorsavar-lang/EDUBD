import { describe, it, expect } from 'vitest';
import {
  canViewAllCollectorReports,
  computeIncomeExpenseStats,
  extractCollectorDisplayName,
  filterCollectorTransactions,
  normalizeCollectorTransactions,
  summarizeByCollector,
} from '../collectorReports';
import { Expense, FeePayment, IncomeVoucher, Staff, UserProfile } from '../../types';

const makeStaff = (overrides: Partial<Staff> & Pick<Staff, 'id' | 'nameEn' | 'nameBn' | 'email' | 'role'>): Staff => ({
  id: overrides.id,
  employeeId: overrides.employeeId || `EMP-${overrides.id}`,
  nameEn: overrides.nameEn,
  nameBn: overrides.nameBn,
  gender: 'Male',
  designation: overrides.role === 'accountant' ? 'Accountant' : 'Admin',
  department: 'Accounts',
  role: overrides.role,
  email: overrides.email,
  phone: '01700000000',
  qualification: 'M.Com',
  joiningDate: '2024-01-01',
  basicSalary: 20000,
  houseRentAllowance: 5000,
  medicalAllowance: 2000,
  otherAllowance: 1000,
  providentFundDeduction: 1000,
  status: overrides.status || 'active',
  permissions: overrides.permissions,
});

describe('collectorReports utilities (Accountant personal & Super Admin Income + Expense audit)', () => {
  const refDate = new Date(2026, 10, 19); // 2026-11-19 (Thursday)

  const staffList: Staff[] = [
    makeStaff({ id: 'st_acc1', nameEn: 'Md. Rahim Uddin', nameBn: 'মো. রহিম উদ্দিন', email: 'rahim@school.edu', role: 'accountant' }),
    makeStaff({ id: 'st_acc2', nameEn: 'Fatema Begum', nameBn: 'ফাতেমা বেগম', email: 'fatema@school.edu', role: 'accountant' }),
    makeStaff({ id: 'st_acc3', nameEn: 'Karim Mia', nameBn: 'করিম মিয়া', email: 'karim@school.edu', role: 'accountant' }),
    makeStaff({ id: 'st_acc4', nameEn: 'Sumon Das', nameBn: 'সুমন দাস', email: 'sumon@school.edu', role: 'accountant' }),
    makeStaff({ id: 'st_sa', nameEn: 'Principal Admin', nameBn: 'সুপার অ্যাডমিন', email: 'admin@school.edu', role: 'super_admin' }),
  ];

  const accountant1User: UserProfile = {
    id: 'usr_rahim',
    linkedStaffId: 'st_acc1',
    email: 'rahim@school.edu',
    name: 'Md. Rahim Uddin',
    nameBn: 'মো. রহিম উদ্দিন',
    role: 'accountant',
  };

  const superAdminUser: UserProfile = {
    id: 'usr_sa',
    linkedStaffId: 'st_sa',
    email: 'admin@school.edu',
    name: 'Principal Admin',
    nameBn: 'সুপার অ্যাডমিন',
    role: 'super_admin',
  };

  const payments: FeePayment[] = [
    {
      id: 'p1',
      receiptNo: 'RCP-001',
      invoiceId: 'inv1',
      studentId: 's1',
      studentName: 'Tanvir',
      className: 'Class 8',
      roll: '01',
      amount: 1500,
      paidDate: '2026-11-19',
      paymentMethod: 'Cash',
      collectedBy: 'Md. Rahim Uddin',
      collectedById: 'st_acc1',
      collectedByEmail: 'rahim@school.edu',
      collectedByRole: 'accountant',
    },
    {
      id: 'p2',
      receiptNo: 'RCP-002',
      invoiceId: 'inv2',
      studentId: 's2',
      studentName: 'Nadia',
      className: 'Class 9',
      roll: '03',
      amount: 2000,
      paidDate: '2026-11-19',
      paymentMethod: 'bKash',
      transactionId: 'TRX9981',
      collectedBy: 'bKash Online (Approved by Fatema Begum)',
    },
    {
      id: 'p3',
      receiptNo: 'RCP-003',
      invoiceId: 'inv3',
      studentId: 's3',
      studentName: 'Rafiq',
      className: 'Class 6',
      roll: '10',
      amount: 1000,
      paidDate: '2026-11-15', // same week (Sat Nov 14 – Fri Nov 20)
      paymentMethod: 'Nagad',
      collectedBy: 'করিম মিয়া',
    },
    {
      id: 'p4',
      receiptNo: 'RCP-004',
      invoiceId: 'inv4',
      studentId: 's4',
      studentName: 'Sajib',
      className: 'Class 7',
      roll: '05',
      amount: 3000,
      paidDate: '2026-11-02', // same month, earlier week
      paymentMethod: 'Bank',
      collectedBy: 'Md. Rahim Uddin',
      collectedById: 'st_acc1',
    },
    {
      id: 'p5',
      receiptNo: 'RCP-005',
      invoiceId: 'inv5',
      studentId: 's5',
      studentName: 'Mina',
      className: 'Class 5',
      roll: '02',
      amount: 1200,
      paidDate: '2026-06-10', // same year, earlier month
      paymentMethod: 'Cash',
      collectedBy: 'Fatema Begum',
      collectedByEmail: 'fatema@school.edu',
    },
  ];

  const incomeVouchers: IncomeVoucher[] = [
    {
      id: 'iv1',
      voucherNo: 'INC-2026-01',
      category: 'Books',
      title: 'Note Book ×2',
      items: [{ id: 'li1', name: 'Note Book', category: 'Books', quantity: 2, unitPrice: 150, total: 300 }],
      subtotal: 300,
      discount: 0,
      amount: 300,
      date: '2026-11-19',
      receivedFrom: 'Walk-in Guardian',
      paymentMethod: 'Cash',
      receivedBy: 'Md. Rahim Uddin',
      receivedById: 'st_acc1',
      receivedByEmail: 'rahim@school.edu',
      receivedByRole: 'accountant',
    },
  ];

  const expenses: Expense[] = [
    {
      id: 'exp1',
      voucherNo: 'EXP-2026-01',
      category: 'Stationery',
      title: 'Marker & Paper',
      amount: 500,
      date: '2026-11-19',
      paidTo: 'Dhaka Stationery',
      paymentMethod: 'Cash',
      approvedBy: 'Md. Rahim Uddin',
      approvedById: 'st_acc1',
      approvedByEmail: 'rahim@school.edu',
      approvedByRole: 'accountant',
    },
    {
      id: 'exp2',
      voucherNo: 'EXP-2026-02',
      category: 'Entertainment',
      title: 'Tea & Snacks',
      amount: 400,
      date: '2026-11-19',
      paidTo: 'Canteen',
      paymentMethod: 'Cash',
      approvedBy: 'করিম মিয়া',
    },
  ];

  it('grants full collector audit access only to super_admin and master_admin', () => {
    expect(canViewAllCollectorReports('super_admin')).toBe(true);
    expect(canViewAllCollectorReports('master_admin')).toBe(true);
    expect(canViewAllCollectorReports('accountant')).toBe(false);
    expect(canViewAllCollectorReports('admin')).toBe(false);
    expect(canViewAllCollectorReports('receptionist')).toBe(false);
    expect(canViewAllCollectorReports('teacher')).toBe(false);
    expect(canViewAllCollectorReports(null)).toBe(false);
  });

  it('extracts approver display name from online approval labels', () => {
    expect(extractCollectorDisplayName('bKash Online (Approved by Fatema Begum)')).toBe('Fatema Begum');
    expect(extractCollectorDisplayName('  Md. Rahim Uddin  ')).toBe('Md. Rahim Uddin');
    expect(extractCollectorDisplayName('')).toBe('');
  });

  it('attributes income receipts, vouchers, and expenses cleanly across 4 accountants with net cash handover', () => {
    const { transactions, directory } = normalizeCollectorTransactions(
      payments,
      incomeVouchers,
      staffList,
      accountant1User,
      expenses
    );
    const rahimKey = directory.resolveUserKey(accountant1User);
    expect(rahimKey).toBe('staff:st_acc1');

    // Today's transactions for Rahim: p1 (+1500 Cash) + iv1 (+300 Cash) + exp1 (-500 Cash)
    const rahimToday = filterCollectorTransactions(transactions, {
      period: 'today',
      collectorKey: rahimKey,
      referenceDate: refDate,
    });
    expect(rahimToday).toHaveLength(3);
    const rahimStats = computeIncomeExpenseStats(rahimToday);
    expect(rahimStats.incomeTotal).toBe(1800);
    expect(rahimStats.expenseTotal).toBe(500);
    expect(rahimStats.netCashInHand).toBe(1300);
    expect(rahimStats.netBalance).toBe(1300);

    // Super Admin today summary across all 4 accountants
    const saKey = directory.resolveUserKey(superAdminUser);
    const allToday = filterCollectorTransactions(transactions, {
      period: 'today',
      collectorKey: 'all',
      referenceDate: refDate,
    });
    const summaries = summarizeByCollector(allToday, directory.identities, saKey, true);

    const fatema = summaries.find((s) => s.collectorKey === 'staff:st_acc2');
    const rahim = summaries.find((s) => s.collectorKey === 'staff:st_acc1');
    const karim = summaries.find((s) => s.collectorKey === 'staff:st_acc3');
    const sumon = summaries.find((s) => s.collectorKey === 'staff:st_acc4');

    expect(fatema?.totalAmount).toBe(2000);
    expect(fatema?.expenseAmount).toBe(0);
    expect(fatema?.mfsAndBankAmount).toBe(2000);
    expect(fatema?.netBalance).toBe(2000);

    expect(rahim?.totalAmount).toBe(1800);
    expect(rahim?.expenseAmount).toBe(500);
    expect(rahim?.netCashInHand).toBe(1300);
    expect(rahim?.netBalance).toBe(1300);

    // Karim made 0 income today, but 400 Cash expense today => netCashInHand -400
    expect(karim?.totalAmount).toBe(0);
    expect(karim?.expenseAmount).toBe(400);
    expect(karim?.netCashInHand).toBe(-400);
    expect(karim?.netBalance).toBe(-400);

    // Sumon has 0 activity today, yet remains visible in Super Admin audit table
    expect(sumon?.totalAmount).toBe(0);
    expect(sumon?.expenseAmount).toBe(0);
  });

  it('filters accurately by today, week, month, year, custom From–To date ranges, and source types', () => {
    const { transactions } = normalizeCollectorTransactions(
      payments,
      incomeVouchers,
      staffList,
      superAdminUser,
      expenses
    );

    const todayStats = computeIncomeExpenseStats(
      filterCollectorTransactions(transactions, { period: 'today', referenceDate: refDate })
    );
    expect(todayStats.incomeTotal).toBe(1500 + 2000 + 300);
    expect(todayStats.expenseTotal).toBe(500 + 400);
    expect(todayStats.netBalance).toBe(2900);

    const onlyExpensesToday = filterCollectorTransactions(transactions, {
      period: 'today',
      sourceFilter: 'expense_voucher',
      referenceDate: refDate,
    });
    expect(onlyExpensesToday).toHaveLength(2);
    expect(onlyExpensesToday.reduce((s, t) => s + t.amount, 0)).toBe(900);

    const allIncomeWeek = filterCollectorTransactions(transactions, {
      period: 'week',
      sourceFilter: 'income_all',
      referenceDate: refDate,
    });
    expect(allIncomeWeek.reduce((s, t) => s + t.amount, 0)).toBe(1500 + 2000 + 300 + 1000);

    const monthIncome = filterCollectorTransactions(transactions, {
      period: 'month',
      sourceFilter: 'income_all',
      referenceDate: refDate,
    }).reduce((s, t) => s + t.amount, 0);
    expect(monthIncome).toBe(1500 + 2000 + 300 + 1000 + 3000);

    const yearIncome = filterCollectorTransactions(transactions, {
      period: 'year',
      sourceFilter: 'income_all',
      referenceDate: refDate,
    }).reduce((s, t) => s + t.amount, 0);
    expect(yearIncome).toBe(1500 + 2000 + 300 + 1000 + 3000 + 1200);

    const customSum = filterCollectorTransactions(transactions, {
      period: 'custom',
      customStart: '2026-11-01',
      customEnd: '2026-11-16',
      referenceDate: refDate,
    }).reduce((s, t) => s + t.amount, 0);
    expect(customSum).toBe(1000 + 3000);
  });
});
