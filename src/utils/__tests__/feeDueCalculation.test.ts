import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ClassFeeConfig, FeeInvoice, FeePayment, OnlinePaymentRequest, Student } from '../../types';

// Provide an isolated in-memory localStorage & sessionStorage for StorageService tests in Node
const memStore: Record<string, string> = {};
if (typeof globalThis.localStorage === 'undefined') {
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: (k: string) => (k in memStore ? memStore[k] : null),
      setItem: (k: string, v: string) => {
        memStore[k] = String(v);
      },
      removeItem: (k: string) => {
        delete memStore[k];
      },
      clear: () => {
        Object.keys(memStore).forEach((k) => delete memStore[k]);
      },
      key: (i: number) => Object.keys(memStore)[i] ?? null,
      get length() {
        return Object.keys(memStore).length;
      },
    },
    configurable: true,
  });
}

if (typeof globalThis.sessionStorage === 'undefined') {
  const sessStore: Record<string, string> = {};
  Object.defineProperty(globalThis, 'sessionStorage', {
    value: {
      getItem: (k: string) => (k in sessStore ? sessStore[k] : null),
      setItem: (k: string, v: string) => {
        sessStore[k] = String(v);
      },
      removeItem: (k: string) => {
        delete sessStore[k];
      },
      clear: () => {
        Object.keys(sessStore).forEach((k) => delete sessStore[k]);
      },
      key: (i: number) => Object.keys(sessStore)[i] ?? null,
      get length() {
        return Object.keys(sessStore).length;
      },
    },
    configurable: true,
  });
}

vi.mock('../../services/firebase', () => ({
  db: {},
  handleFirestoreError: vi.fn(),
  OperationType: { WRITE: 'write', DELETE: 'delete', GET: 'get', LIST: 'list' },
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => ({})),
  setDoc: vi.fn(() => Promise.resolve()),
  deleteDoc: vi.fn(() => Promise.resolve()),
}));

vi.mock('../../services/cloudSync', () => ({
  SAAS_ACTIVE_SCHOOL_KEY: 'school_erp_saas_active_school_id',
  CloudSyncService: {
    pushSliceToCloud: vi.fn(),
    pushLocalToCloud: vi.fn(),
    scheduleCloudSync: vi.fn(),
  },
}));

import { StorageService } from '../../services/storage';

const createTestStudent = (): Student => ({
  id: 'stu_mahid_1',
  studentId: 'SCH001-S-2026-1001',
  admissionNo: 'ADM-1001',
  roll: '01',
  session: '2026',
  nameEn: 'Mahid Yafee',
  nameBn: 'মাহিদ ইয়াফি',
  className: 'Class 10',
  section: 'A',
  shift: 'Day',
  guardianName: 'Shafiq Ahmed',
  guardianPhone: '01942529984',
  guardianRelation: 'Father',
  fatherNameEn: 'Shafiq Ahmed',
  fatherNameBn: 'শফিক আহমেদ',
  motherNameEn: 'Mother Name',
  motherNameBn: 'মাতার নাম',
  presentAddress: 'Dhaka',
  permanentAddress: 'Dhaka',
  admissionDate: '2026-01-01',
  status: 'active',
  gender: 'Male',
  religion: 'Islam',
  bloodGroup: 'O+',
  dob: '2011-05-10',
});

const setupClassFeeAndCleanState = (tuitionFee = 1200) => {
  globalThis.localStorage.clear();
  globalThis.sessionStorage.clear();

  const classFee: ClassFeeConfig = {
    className: 'Class 10',
    classNameBn: 'দশম শ্রেণি',
    tuitionFee,
    sessionFee: 0,
    admissionFee: 0,
  };
  globalThis.localStorage.setItem('school_erp_class_fees', JSON.stringify([classFee]));
  globalThis.localStorage.setItem('school_erp_scheduled_fees', JSON.stringify([]));
  globalThis.localStorage.setItem('school_erp_transport_students', JSON.stringify([]));
  globalThis.localStorage.setItem('school_erp_invoices', JSON.stringify([]));
  globalThis.localStorage.setItem('school_erp_payments', JSON.stringify([]));
  globalThis.localStorage.setItem('school_erp_online_payment_requests', JSON.stringify([]));
};

describe('StorageService.getStudentDueFees — Online bKash Pay-All & Deduplication', () => {
  beforeEach(() => {
    setupClassFeeAndCleanState(1200);
  });

  it('clears all Feb–Nov 2026 dues after legacy approved "All Outstanding Dues" bKash payment without double-crediting future months', () => {
    const student = createTestStudent();

    // Legacy approvals had separate timestamp IDs for invoice and payment, and no itemized `items` array on Pay-All
    const invoices: FeeInvoice[] = [
      {
        id: 'inv_451484',
        invoiceNo: 'INV-451484',
        studentId: student.id,
        studentNameEn: student.nameEn,
        studentNameBn: student.nameBn,
        className: 'Class 10',
        section: 'A',
        roll: '01',
        session: '2026',
        feeType: 'মাসিক টিউশন ফি (Tuition Fee - জানুয়ারি 2026)',
        month: '2026-11-16',
        amount: 1200,
        discount: 0,
        netAmount: 1200,
        paidAmount: 1200,
        dueAmount: 0,
        dueDate: '2026-11-16',
        status: 'Paid',
      },
      {
        id: 'inv_544200',
        invoiceNo: 'INV-544200',
        studentId: student.id,
        studentNameEn: student.nameEn,
        studentNameBn: student.nameBn,
        className: 'Class 10',
        section: 'A',
        roll: '01',
        session: '2026',
        feeType: 'সকল বকেয়া ফি (All Outstanding Dues)',
        month: '2026-11-16',
        amount: 12000,
        discount: 0,
        netAmount: 12000,
        paidAmount: 12000,
        dueAmount: 0,
        dueDate: '2026-11-16',
        status: 'Paid',
      },
    ];

    const payments: FeePayment[] = [
      {
        id: 'pay_451434',
        receiptNo: 'MR-451434',
        invoiceId: 'inv_mismatched_451434',
        studentId: student.id,
        studentName: student.nameBn,
        className: 'Class 10',
        roll: '01',
        amount: 1200,
        paidDate: '2026-11-16',
        paymentMethod: 'bKash',
        transactionId: 'JFCC',
        collectedBy: 'bKash Online',
        notes: 'মাসিক টিউশন ফি (Tuition Fee - জানুয়ারি 2026) - অনলাইন পেমেন্ট অনুমোদন। প্রেরক: 01942529984, TrxID: JFCC',
      },
      {
        id: 'pay_544163',
        receiptNo: 'MR-544163',
        invoiceId: 'inv_mismatched_544163',
        studentId: student.id,
        studentName: student.nameBn,
        className: 'Class 10',
        roll: '01',
        amount: 12000,
        paidDate: '2026-11-16',
        paymentMethod: 'bKash',
        transactionId: 'HFVBNJ',
        collectedBy: 'bKash Online',
        notes: 'সকল বকেয়া ফি (All Outstanding Dues) - অনলাইন পেমেন্ট অনুমোদন। প্রেরক: 01942529984, TrxID: HFVBNJ',
      },
    ];

    const onlineRequests: OnlinePaymentRequest[] = [
      {
        id: 'opr_1',
        receiptNo: 'MR-451434',
        studentId: student.id,
        studentName: student.nameBn,
        studentRoll: '01',
        className: 'Class 10',
        section: 'A',
        feeTitle: 'মাসিক টিউশন ফি (Tuition Fee - জানুয়ারি 2026)',
        amount: 1200,
        paymentMethod: 'bKash',
        senderPhone: '01942529984',
        transactionId: 'JFCC',
        requestDate: '2026-11-16',
        status: 'approved',
        approvedAt: '2026-11-16T10:05:00.000Z',
      },
      {
        id: 'opr_2',
        receiptNo: 'MR-544163',
        studentId: student.id,
        studentName: student.nameBn,
        studentRoll: '01',
        className: 'Class 10',
        section: 'A',
        feeTitle: 'সকল বকেয়া ফি (All Outstanding Dues)',
        amount: 12000,
        paymentMethod: 'bKash',
        senderPhone: '01942529984',
        transactionId: 'HFVBNJ',
        requestDate: '2026-11-16',
        status: 'approved',
        approvedAt: '2026-11-16T10:08:00.000Z',
      },
    ];

    globalThis.localStorage.setItem('school_erp_invoices', JSON.stringify(invoices));
    globalThis.localStorage.setItem('school_erp_payments', JSON.stringify(payments));
    globalThis.localStorage.setItem('school_erp_online_payment_requests', JSON.stringify(onlineRequests));

    // On 2026-11-16, all 10 months (Feb..Nov) should now be cleared (0 due)
    const novDues = StorageService.getStudentDueFees(student, '2026-11-16');
    expect(novDues).toEqual([]);

    // On 2026-12-15, ONLY December 2026 should become due (৳1,200); Nov payment must NOT bleed into December
    const decDues = StorageService.getStudentDueFees(student, '2026-12-15');
    expect(decDues).toHaveLength(1);
    expect(decDues[0].month).toBe('December 2026');
    expect(decDues[0].amount).toBe(1200);
  });

  it('clears dues covered by an approved online request with explicit items even before finance invoice syncs', () => {
    const student = createTestStudent();

    const approvedReq: OnlinePaymentRequest = {
      id: 'opr_explicit_1',
      receiptNo: 'MR-888111',
      studentId: student.id,
      studentName: student.nameBn,
      studentRoll: '01',
      className: 'Class 10',
      section: 'A',
      feeTitle: 'সকল বকেয়া ফি (All Outstanding Dues)',
      amount: 2400,
      isPayAll: true,
      items: [
        {
          id: `due_tuit_2026_01_${student.id}`,
          headName: 'মাসিক টিউশন ফি (Tuition Fee - জানুয়ারি 2026)',
          month: 'January 2026',
          dueDate: '2026-01-10',
          amount: 1200,
        },
        {
          id: `due_tuit_2026_02_${student.id}`,
          headName: 'মাসিক টিউশন ফি (Tuition Fee - ফেব্রুয়ারি 2026)',
          month: 'February 2026',
          dueDate: '2026-02-10',
          amount: 1200,
        },
      ],
      paymentMethod: 'bKash',
      senderPhone: '01942529984',
      transactionId: 'TRX999',
      requestDate: '2026-02-15',
      status: 'approved',
      approvedAt: '2026-02-15T12:00:00.000Z',
    };

    globalThis.localStorage.setItem('school_erp_online_payment_requests', JSON.stringify([approvedReq]));

    const marchDues = StorageService.getStudentDueFees(student, '2026-03-15');
    expect(marchDues).toHaveLength(1);
    expect(marchDues[0].month).toBe('March 2026');
  });

  it('does NOT clear dues when an online bKash request is still pending approval', () => {
    const student = createTestStudent();

    const pendingReq: OnlinePaymentRequest = {
      id: 'opr_pending_1',
      receiptNo: 'REQ-111222',
      studentId: student.id,
      studentName: student.nameBn,
      studentRoll: '01',
      className: 'Class 10',
      section: 'A',
      feeTitle: 'সকল বকেয়া ফি (All Outstanding Dues)',
      amount: 3600,
      isPayAll: true,
      items: [
        {
          id: `due_tuit_2026_01_${student.id}`,
          headName: 'মাসিক টিউশন ফি (Tuition Fee - জানুয়ারি 2026)',
          month: 'January 2026',
          dueDate: '2026-01-10',
          amount: 1200,
        },
      ],
      paymentMethod: 'bKash',
      senderPhone: '01942529984',
      transactionId: 'PENDING1',
      requestDate: '2026-03-15',
      status: 'pending',
    };

    globalThis.localStorage.setItem('school_erp_online_payment_requests', JSON.stringify([pendingReq]));

    const marchDues = StorageService.getStudentDueFees(student, '2026-03-15');
    expect(marchDues).toHaveLength(3); // Jan, Feb, Mar remain due until approved
  });

  it('settles pre-existing unpaid invoices via approved Pay-All online request when items were omitted', () => {
    const student = createTestStudent();

    const unpaidInvoice: FeeInvoice = {
      id: 'inv_unpaid_session',
      invoiceNo: 'INV-1001',
      studentId: student.id,
      studentNameEn: student.nameEn,
      studentNameBn: student.nameBn,
      className: 'Class 10',
      section: 'A',
      roll: '01',
      session: '2026',
      feeType: 'Session Charge',
      month: 'January 2026',
      amount: 1800,
      discount: 0,
      netAmount: 1800,
      paidAmount: 0,
      dueAmount: 1800,
      dueDate: '2026-01-05',
      status: 'Unpaid',
    };

    // Session Charge (1800) + Jan Tuition (1200) = 3000 paid via approved Pay-All request
    const approvedPayAll: OnlinePaymentRequest = {
      id: 'opr_payall_only',
      receiptNo: 'MR-300001',
      studentId: student.id,
      studentName: student.nameBn,
      studentRoll: '01',
      className: 'Class 10',
      section: 'A',
      feeTitle: 'সকল বকেয়া ফি (All Outstanding Dues)',
      amount: 3000,
      isPayAll: true,
      paymentMethod: 'Nagad',
      senderPhone: '01711000000',
      transactionId: 'NGD3000',
      requestDate: '2026-01-20',
      status: 'approved',
      approvedAt: '2026-01-20T09:00:00.000Z',
    };

    globalThis.localStorage.setItem('school_erp_invoices', JSON.stringify([unpaidInvoice]));
    globalThis.localStorage.setItem('school_erp_online_payment_requests', JSON.stringify([approvedPayAll]));

    const janDues = StorageService.getStudentDueFees(student, '2026-01-20');
    expect(janDues).toEqual([]);
  });
});
