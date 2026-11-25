import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Student } from '../../types';
import {
  compareRolls,
  compareStudentsByClassAndRoll,
  compareStudentsByRoll,
  parseRollNumber,
  sortStudentsByClassAndRoll,
  sortStudentsByRoll,
} from '../studentSort';

// Isolated in-memory localStorage & sessionStorage for Node test environment
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

const makeStudent = (overrides: Partial<Student>): Student => ({
  id: overrides.id || `stu_${Math.random()}`,
  studentId: overrides.studentId || 'SCH001-S-2026-1001',
  roll: overrides.roll || '01',
  session: '2026',
  nameEn: overrides.nameEn || 'Student Name',
  nameBn: overrides.nameBn || 'শিক্ষার্থী',
  className: overrides.className || 'Class 10',
  section: overrides.section || 'A',
  shift: 'Day',
  guardianName: 'Guardian',
  guardianPhone: '01700000000',
  guardianRelation: 'Father',
  fatherNameEn: 'Father',
  fatherNameBn: 'পিতা',
  motherNameEn: 'Mother',
  motherNameBn: 'মাতা',
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

describe('studentSort & StorageService roll ordering', () => {
  beforeEach(() => {
    globalThis.localStorage.clear();
    globalThis.sessionStorage.clear();
    globalThis.localStorage.setItem('school_erp_students', JSON.stringify([]));
  });

  it('parses and compares English and Bengali roll numbers numerically ascending (1 < 2 < 10)', () => {
    expect(parseRollNumber('01')).toBe(1);
    expect(parseRollNumber('০২')).toBe(2);
    expect(parseRollNumber('১০')).toBe(10);

    expect(compareRolls('01', '02')).toBeLessThan(0);
    expect(compareRolls('02', '10')).toBeLessThan(0);
    expect(compareRolls('০১', '০২')).toBeLessThan(0);
    expect(compareRolls('০২', '১০')).toBeLessThan(0);

    const unsorted = [
      makeStudent({ id: 's10', roll: '10', nameEn: 'Ten' }),
      makeStudent({ id: 's2', roll: '02', nameEn: 'Hiya Akhter' }),
      makeStudent({ id: 's1', roll: '01', nameEn: 'Mahid Yafee' }),
    ];

    const byRoll = sortStudentsByRoll(unsorted);
    expect(byRoll.map((s) => s.roll)).toEqual(['01', '02', '10']);
  });

  it('keeps Roll 1 above Roll 2 after StorageService.addStudent and getStudents regardless of insertion order', () => {
    // Roll 1 added first, then Roll 2 added second, then Roll 10, then Roll 3
    StorageService.addStudent(
      makeStudent({ id: 's_mahid', studentId: 'SCH001-S-2026-1001', roll: '01', nameEn: 'Mahid Yafee' })
    );
    StorageService.addStudent(
      makeStudent({ id: 's_hiya', studentId: 'SCH001-S-2026-1002', roll: '02', nameEn: 'Hiya Akhter' })
    );
    StorageService.addStudent(
      makeStudent({ id: 's_ten', studentId: 'SCH001-S-2026-1010', roll: '10', nameEn: 'Student Ten' })
    );
    StorageService.addStudent(
      makeStudent({ id: 's_three', studentId: 'SCH001-S-2026-1003', roll: '03', nameEn: 'Student Three' })
    );

    const fetched = StorageService.getStudents();
    expect(fetched.map((s) => s.roll)).toEqual(['01', '02', '03', '10']);
    expect(fetched[0].nameEn).toBe('Mahid Yafee');
    expect(fetched[1].nameEn).toBe('Hiya Akhter');
  });

  it('sorts legacy unsorted stored students so Roll 01 is always above Roll 02 on read', () => {
    const legacyReversed = [
      makeStudent({ id: 's2', roll: '02', nameEn: 'Hiya Akhter' }),
      makeStudent({ id: 's1', roll: '01', nameEn: 'Mahid Yafee' }),
    ];
    globalThis.localStorage.setItem('school_erp_students', JSON.stringify(legacyReversed));

    const fetched = StorageService.getStudents();
    expect(fetched.map((s) => s.roll)).toEqual(['01', '02']);
  });

  it('sorts across classes in academic order and ascending roll within each class', () => {
    const mixed = [
      makeStudent({ id: 'c10_2', className: 'Class 10', roll: '02' }),
      makeStudent({ id: 'c9_2', className: 'Class 9', roll: '02' }),
      makeStudent({ id: 'c10_1', className: 'Class 10', roll: '01' }),
      makeStudent({ id: 'c9_1', className: 'Class 9', roll: '01' }),
      makeStudent({ id: 'nur_1', className: 'Nursery', roll: '01' }),
    ];

    const sorted = sortStudentsByClassAndRoll(mixed);
    expect(sorted.map((s) => `${s.className}:${s.roll}`)).toEqual([
      'Nursery:01',
      'Class 9:01',
      'Class 9:02',
      'Class 10:01',
      'Class 10:02',
    ]);
    expect(compareStudentsByClassAndRoll(sorted[0], sorted[1])).toBeLessThan(0);
    expect(compareStudentsByRoll(mixed[2], mixed[0])).toBeLessThan(0);
  });
});
