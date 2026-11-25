import { describe, it, expect, beforeEach, vi } from 'vitest';
import { safeGetLocalStorage, safeSetLocalStorage } from '../storageHelper';
import { FeeInvoice, FeePayment, MarksEntry, Student } from '../../types';

const mockLocalMap: Record<string, string> = {};
const mockSessionMap: Record<string, string> = {};
let forceLocalSetError = false;

const localStorageMock = {
  getItem: (k: string) => (k in mockLocalMap ? mockLocalMap[k] : null),
  setItem: (k: string, v: string) => {
    if (forceLocalSetError) {
      const err: any = new Error('QuotaExceededError');
      err.name = 'QuotaExceededError';
      throw err;
    }
    mockLocalMap[k] = String(v);
  },
  removeItem: (k: string) => {
    delete mockLocalMap[k];
  },
  clear: () => {
    Object.keys(mockLocalMap).forEach((k) => delete mockLocalMap[k]);
  },
  key: (i: number) => Object.keys(mockLocalMap)[i] ?? null,
  get length() {
    return Object.keys(mockLocalMap).length;
  },
};

const sessionStorageMock = {
  getItem: (k: string) => (k in mockSessionMap ? mockSessionMap[k] : null),
  setItem: (k: string, v: string) => {
    mockSessionMap[k] = String(v);
  },
  removeItem: (k: string) => {
    delete mockSessionMap[k];
  },
  clear: () => {
    Object.keys(mockSessionMap).forEach((k) => delete mockSessionMap[k]);
  },
  key: (i: number) => Object.keys(mockSessionMap)[i] ?? null,
  get length() {
    return Object.keys(mockSessionMap).length;
  },
};

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, configurable: true });
Object.defineProperty(globalThis, 'sessionStorage', { value: sessionStorageMock, configurable: true });

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

const { pushSliceMock, pushLocalMock, scheduleCloudSyncMock } = vi.hoisted(() => ({
  pushSliceMock: vi.fn(() => Promise.resolve(true)),
  pushLocalMock: vi.fn(() => Promise.resolve(true)),
  scheduleCloudSyncMock: vi.fn(),
}));

vi.mock('../../services/cloudSync', () => ({
  SAAS_ACTIVE_SCHOOL_KEY: 'school_erp_saas_active_school_id',
  CloudSyncService: {
    pushSliceToCloud: pushSliceMock,
    pushLocalToCloud: pushLocalMock,
    scheduleCloudSync: scheduleCloudSyncMock,
  },
}));

import { StorageService } from '../../services/storage';

const makeStudent = (overrides: Partial<Student> = {}): Student => ({
  id: overrides.id || 'std_1794817864178',
  studentId: overrides.studentId || 'SCH001-S-2026-1001',
  roll: overrides.roll || '01',
  session: '2026',
  nameEn: overrides.nameEn || 'Mahid Yafee',
  nameBn: overrides.nameBn || 'মাহিদ ইয়াফি',
  className: overrides.className || 'Class 10',
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
  dob: '2011-01-01',
  ...overrides,
});

describe('Storage & Quota Split-Brain Prevention', () => {
  beforeEach(() => {
    forceLocalSetError = false;
    localStorageMock.clear();
    sessionStorageMock.clear();
    vi.clearAllMocks();
  });

  it('clears stale empty array in localStorage when QuotaExceededError forces sessionStorage fallback', () => {
    // Simulate earlier mount leaving "[]" in localStorage
    localStorageMock.setItem('school_erp_students', '[]');
    expect(safeGetLocalStorage('school_erp_students')).toBe('[]');

    // Now simulate quota exceeded while writing admitted student
    forceLocalSetError = true;
    const savedPayload = JSON.stringify([makeStudent()]);
    const ok = safeSetLocalStorage('school_erp_students', savedPayload);
    expect(ok).toBe(true);

    // Must remove stale "[]" from localStorage so safeGetLocalStorage reads from sessionStorage
    expect(localStorageMock.getItem('school_erp_students')).toBeNull();
    expect(safeGetLocalStorage('school_erp_students')).toBe(savedPayload);

    // And once localStorage succeeds again, stale sessionStorage copy must be cleaned up
    forceLocalSetError = false;
    const updatedPayload = JSON.stringify([
      makeStudent(),
      makeStudent({ id: 'std_1794826430251', studentId: 'SCH001-S-2026-1002', roll: '02', nameEn: 'Hiya Akhter' }),
    ]);
    expect(safeSetLocalStorage('school_erp_students', updatedPayload)).toBe(true);
    expect(sessionStorageMock.getItem('school_erp_students')).toBeNull();
    expect(safeGetLocalStorage('school_erp_students')).toBe(updatedPayload);
  });

  it('does NOT poison localStorage with "[]" when reading uninitialized students, enquiries, or online payments', () => {
    expect(StorageService.getStudents()).toEqual([]);
    expect(StorageService.getEnquiries()).toEqual([]);
    expect(StorageService.getOnlinePaymentRequests()).toEqual([]);

    expect(localStorageMock.getItem('school_erp_students')).toBeNull();
    expect(localStorageMock.getItem('school_erp_enquiries')).toBeNull();
    expect(localStorageMock.getItem('school_erp_online_payment_requests')).toBeNull();
    expect(scheduleCloudSyncMock).not.toHaveBeenCalled();
  });

  it('uses slice-specific cloud pushes for profile, marks, and finance mutations instead of blasting all slices', () => {
    const student = makeStudent();
    StorageService.addStudent(student);
    expect(pushSliceMock).toHaveBeenCalledWith('students', true);
    expect(pushLocalMock).not.toHaveBeenCalled();

    vi.clearAllMocks();
    const profile = StorageService.getSchoolProfile();
    StorageService.saveSchoolProfile({ ...profile, nameEn: 'Dhakas school' });
    expect(pushSliceMock).toHaveBeenCalledWith('profile', true);
    expect(pushLocalMock).not.toHaveBeenCalled();

    vi.clearAllMocks();
    const marks: MarksEntry[] = [
      {
        id: 'm1',
        examId: 'ex1',
        studentId: student.id,
        subjectId: 'sub1',
        subjectName: 'Bangla',
        written: 60,
        mcq: 25,
        practical: 0,
        total: 85,
        gpa: 5,
        grade: 'A+',
      },
    ];
    StorageService.saveMarksBatch(marks);
    expect(pushSliceMock).toHaveBeenCalledWith('attendance', true);
    expect(pushLocalMock).not.toHaveBeenCalled();

    vi.clearAllMocks();
    const inv: FeeInvoice = {
      id: 'inv_1',
      invoiceNo: 'INV-1',
      studentId: student.id,
      studentNameEn: student.nameEn,
      studentNameBn: student.nameBn,
      className: 'Class 10',
      section: 'A',
      roll: '01',
      session: '2026',
      feeType: 'Tuition Fee',
      month: 'January 2026',
      amount: 1200,
      discount: 0,
      netAmount: 1200,
      paidAmount: 0,
      dueAmount: 1200,
      dueDate: '2026-01-10',
      status: 'Unpaid',
    };
    StorageService.addInvoice(inv);
    expect(pushSliceMock).toHaveBeenCalledWith('finance', true);
    expect(pushLocalMock).not.toHaveBeenCalled();

    vi.clearAllMocks();
    const pay: FeePayment = {
      id: 'pay_1',
      receiptNo: 'MR-1',
      invoiceId: 'inv_1',
      studentId: student.id,
      studentName: student.nameBn,
      className: 'Class 10',
      roll: '01',
      amount: 1200,
      paidDate: '2026-01-12',
      paymentMethod: 'bKash',
      collectedBy: 'Admin',
    };
    StorageService.addPayment(pay);
    expect(pushSliceMock).toHaveBeenCalledWith('finance', true);
    expect(pushLocalMock).not.toHaveBeenCalled();
  });
});
