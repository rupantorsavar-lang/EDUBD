import { describe, it, expect } from 'vitest';
import {
  buildPrintableStatementHtml,
  buildStatementCsv,
  buildStudentFeeStatementEntries,
  filterAndSortFeeStatements,
  summarizeFeeStatements,
} from '../feeStatementHelper';
import { FeeItem, FeePayment, SchoolProfile, Student } from '../../types';

const makeStudent = (overrides: Partial<Student>): Student => ({
  id: 'st_1',
  studentId: 'SCH001-S-2026-0001',
  nameEn: 'Rahim Uddin',
  nameBn: 'রহিম উদ্দিন',
  gender: 'Male',
  dob: '2010-01-01',
  bloodGroup: 'O+',
  religion: 'Islam',
  className: 'Class 10',
  section: 'A',
  shift: 'Morning',
  roll: '1',
  session: '2026',
  fatherNameEn: 'Karim Uddin',
  fatherNameBn: 'করিম উদ্দিন',
  motherNameEn: 'Salma Begum',
  motherNameBn: 'সালমা বেগম',
  guardianName: 'Karim Uddin',
  guardianPhone: '01711111111',
  guardianRelation: 'Father',
  presentAddress: 'Dhaka',
  permanentAddress: 'Dhaka',
  admissionDate: '2026-01-01',
  status: 'active',
  ...overrides,
});

const makePayment = (overrides: Partial<FeePayment>): FeePayment => ({
  id: 'pay_1',
  receiptNo: 'REC-001',
  invoiceId: 'inv_1',
  studentId: 'st_1',
  studentName: 'Rahim Uddin',
  className: 'Class 10',
  roll: '1',
  amount: 2000,
  paymentMethod: 'Cash',
  paidDate: '2026-06-15',
  collectedBy: 'Admin',
  ...overrides,
});

const sampleSchool: SchoolProfile = {
  id: 'SCH001',
  schoolCode: 'SCH001',
  nameEn: 'Dhaka Model School',
  nameBn: 'ঢাকা মডেল স্কুল',
  addressEn: 'Mirpur-10, Dhaka',
  addressBn: 'মিরপুর-১০, ঢাকা',
  eiin: 'SCH001',
  phone: '01700000000',
  email: 'info@school.edu.bd',
  website: 'https://school.edu.bd',
  principalNameEn: 'Prof. Rafiqul Islam',
  principalNameBn: 'অধ্যাপক রফিকুল ইসলাম',
  establishedYear: '1998',
  currentSession: '2026',
  currencySymbol: '৳',
  timezone: 'Asia/Dhaka',
};

describe('feeStatementHelper', () => {
  const s1 = makeStudent({ id: 's1', studentId: 'S-101', nameEn: 'Rahim', roll: '2', className: 'Class 10', section: 'A' });
  const s2 = makeStudent({ id: 's2', studentId: 'S-102', nameEn: 'Karim', roll: '1', className: 'Class 10', section: 'B' });
  const s3 = makeStudent({ id: 's3', studentId: 'S-201', nameEn: 'Ayesha', roll: '1', className: 'Class 9', section: 'A' });

  const payments: FeePayment[] = [
    makePayment({ id: 'p1', studentId: 's1', studentName: 'Rahim', amount: 3000, paidDate: '2026-05-10' }),
    makePayment({ id: 'p2', studentId: 'S-102', studentName: 'Karim', amount: 5000, paidDate: '2026-07-01' }),
  ];

  const duesMap: Record<string, FeeItem[]> = {
    s1: [
      { id: 'd1', headName: 'Tuition July', amount: 1200, isOverdue: true, dueDate: '2026-07-10' },
      { id: 'd2', headName: 'Tuition Aug', amount: 1200, isOverdue: false, dueDate: '2026-08-10' },
    ],
    s2: [],
    s3: [{ id: 'd3', headName: 'Exam Fee', amount: 800, isOverdue: false, dueDate: '2026-09-01' }],
  };

  it('builds accurate paid, due, assessed, and status entries per student', () => {
    const entries = buildStudentFeeStatementEntries({
      students: [s1, s2, s3],
      payments,
      getDueFees: (st) => duesMap[st.id] || [],
    });

    expect(entries).toHaveLength(3);
    expect(entries[0]).toMatchObject({
      totalPaid: 3000,
      totalDue: 2400,
      totalAssessed: 5400,
      overdueCount: 1,
      status: 'overdue',
      lastPaidDate: '2026-05-10',
    });
    expect(entries[1]).toMatchObject({
      totalPaid: 5000,
      totalDue: 0,
      totalAssessed: 5000,
      status: 'cleared',
    });
    expect(entries[2]).toMatchObject({
      totalPaid: 0,
      totalDue: 800,
      totalAssessed: 800,
      status: 'due',
      lastPaidDate: null,
    });
  });

  it('filters by class, section, status, search query and sorts by class sequence + numeric roll', () => {
    const entries = buildStudentFeeStatementEntries({
      students: [s1, s2, s3],
      payments,
      getDueFees: (st) => duesMap[st.id] || [],
    });

    const sortedAll = filterAndSortFeeStatements(entries, {
      classFilter: 'all',
      sortBy: 'roll',
      classOrder: ['Class 9', 'Class 10'],
    });
    expect(sortedAll.map((e) => e.student.id)).toEqual(['s3', 's2', 's1']);

    const class10DueOnly = filterAndSortFeeStatements(entries, {
      classFilter: 'Class 10',
      statusFilter: 'with_dues',
    });
    expect(class10DueOnly.map((e) => e.student.id)).toEqual(['s1']);

    const overdueOnly = filterAndSortFeeStatements(entries, {
      statusFilter: 'overdue',
    });
    expect(overdueOnly.map((e) => e.student.id)).toEqual(['s1']);

    const byDueDesc = filterAndSortFeeStatements(entries, {
      sortBy: 'due_desc',
    });
    expect(byDueDesc.map((e) => e.student.id)).toEqual(['s1', 's3', 's2']);
  });

  it('summarizes school-wide and class-wise totals accurately', () => {
    const entries = buildStudentFeeStatementEntries({
      students: [s1, s2, s3],
      payments,
      getDueFees: (st) => duesMap[st.id] || [],
    });

    const summary = summarizeFeeStatements(entries, ['Class 9', 'Class 10']);
    expect(summary.studentCount).toBe(3);
    expect(summary.clearedCount).toBe(1);
    expect(summary.dueStudentCount).toBe(2);
    expect(summary.overdueStudentCount).toBe(1);
    expect(summary.totalPaid).toBe(8000);
    expect(summary.totalDue).toBe(3200);
    expect(summary.totalAssessed).toBe(11200);
    expect(summary.collectionRate).toBe(71);

    expect(summary.byClass.map((c) => c.className)).toEqual(['Class 9', 'Class 10']);
    expect(summary.byClass[1]).toMatchObject({
      className: 'Class 10',
      studentCount: 2,
      clearedCount: 1,
      dueStudentCount: 1,
      totalPaid: 8000,
      totalDue: 2400,
    });
  });

  it('exports valid UTF-8 BOM CSV and safe printable HTML for both register and individual-bulk modes', () => {
    const entries = buildStudentFeeStatementEntries({
      students: [s1, s2],
      payments,
      getDueFees: (st) => duesMap[st.id] || [],
    });
    const summary = summarizeFeeStatements(entries, ['Class 10']);

    const csv = buildStatementCsv(entries);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('S-101');
    expect(csv).toContain('S-102');
    expect(csv).toContain('Overdue');
    expect(csv).toContain('Cleared');

    const registerHtml = buildPrintableStatementHtml({
      mode: 'register',
      entries,
      summary,
      schoolProfile: sampleSchool,
      scopeTitle: 'Class 10',
      logoSrc: 'https://example.com/logo.png',
    });
    expect(registerHtml).toContain('CONSOLIDATED STUDENT FEE STATEMENT REGISTER');
    expect(registerHtml).toContain('Class 10');
    expect(registerHtml).toContain('GRAND TOTAL (2 Students)');

    const bulkHtml = buildPrintableStatementHtml({
      mode: 'individual-bulk',
      entries,
      summary,
      schoolProfile: sampleSchool,
      scopeTitle: 'Class 10',
      logoSrc: 'https://example.com/logo.png',
    });
    expect(bulkHtml).toContain('page-break-after: always');
    expect(bulkHtml).toContain('S-101');
    expect(bulkHtml).toContain('S-102');
  });
});
