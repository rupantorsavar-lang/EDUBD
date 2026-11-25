import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Homework, HomeworkSubmission, Student } from '../../types';

const mockLocalMap: Record<string, string> = {};
const mockSessionMap: Record<string, string> = {};

Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: (k: string) => (k in mockLocalMap ? mockLocalMap[k] : null),
    setItem: (k: string, v: string) => {
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
  },
  configurable: true,
});

Object.defineProperty(globalThis, 'sessionStorage', {
  value: {
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
  },
  configurable: true,
});

vi.mock('../../services/firebase', () => ({
  db: {},
  auth: { currentUser: null },
  handleFirestoreError: vi.fn(),
  OperationType: { WRITE: 'write', READ: 'read', DELETE: 'delete' },
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db: any, ...segments: string[]) => ({ path: segments.join('/') })),
  getDoc: vi.fn(async () => ({ exists: () => false, data: () => undefined })),
  setDoc: vi.fn(async () => {}),
  deleteDoc: vi.fn(async () => {}),
  onSnapshot: vi.fn(() => () => {}),
}));

import {
  normalizeStudentRoll,
  doesSubmissionBelongToStudent,
  getClassHomeworkForStudent,
  computeStudentHomeworkAccounting,
  mergeHomeworkSubmissions,
} from '../homeworkPortal';
import { StorageService } from '../../services/storage';

const sampleStudent: Student = {
  id: 'std_hiya_1',
  studentId: 'SCH001-S-2026-1002',
  nameEn: 'Hiya Akhter',
  nameBn: 'হিয়া আক্তার',
  gender: 'Female',
  dob: '2010-01-01',
  bloodGroup: 'A+',
  religion: 'Islam',
  className: 'Class 10',
  section: 'A',
  shift: 'Day',
  roll: '02',
  session: '2026',
  fatherNameEn: 'Habib',
  fatherNameBn: 'হাবিব',
  motherNameEn: 'Salma',
  motherNameBn: 'সালমা',
  guardianName: 'Habib',
  guardianPhone: '01700000000',
  guardianRelation: 'Father',
  presentAddress: 'Dhaka',
  permanentAddress: 'Dhaka',
  status: 'active',
  admissionDate: '2026-01-01',
};

const sampleHomework: Homework[] = [
  {
    id: 'hw_math_1',
    title: 'Math',
    subjectName: 'General Mathematics',
    className: 'Class 10',
    section: 'A',
    teacherName: 'Amzad Hossain',
    assignedDate: '2026-11-16',
    dueDate: '2026-11-18',
    description: '1-10 likho',
    fullMarks: 10,
  },
];

describe('Homework portal matching, accounting, and storage accuracy', () => {
  beforeEach(() => {
    Object.keys(mockLocalMap).forEach((k) => delete mockLocalMap[k]);
    Object.keys(mockSessionMap).forEach((k) => delete mockSessionMap[k]);
  });

  it('normalizes zero-padded and unpadded student rolls consistently', () => {
    expect(normalizeStudentRoll('02')).toBe('2');
    expect(normalizeStudentRoll('2')).toBe('2');
    expect(normalizeStudentRoll(' 007 ')).toBe('7');
  });

  it('matches submissions by studentId, studentCode, or class+section+normalized roll', () => {
    const subByInternalId: HomeworkSubmission = {
      id: 'sub_1',
      homeworkId: 'hw_math_1',
      studentId: 'std_hiya_1',
      studentName: 'Hiya Akhter',
      studentRoll: '02',
      className: 'Class 10',
      section: 'A',
      submissionDate: '2026-11-16 19:55',
      submissionType: 'text',
      imageUrls: [],
      textAnswer: '1, 2, 3, 4, 5, 6, 77, 88, 99, 10',
      status: 'approved',
      version: 1,
    };

    const subByCode: HomeworkSubmission = {
      ...subByInternalId,
      id: 'sub_2',
      studentId: 'SCH001-S-2026-1002',
    };

    const subByUnpaddedRoll: HomeworkSubmission = {
      ...subByInternalId,
      id: 'sub_3',
      studentId: 'other_id',
      studentRoll: '2',
    };

    const subOtherSection: HomeworkSubmission = {
      ...subByInternalId,
      id: 'sub_4',
      studentId: 'other_id',
      studentRoll: '02',
      section: 'B',
    };

    expect(doesSubmissionBelongToStudent(subByInternalId, sampleStudent)).toBe(true);
    expect(doesSubmissionBelongToStudent(subByCode, sampleStudent)).toBe(true);
    expect(doesSubmissionBelongToStudent(subByUnpaddedRoll, sampleStudent)).toBe(true);
    expect(doesSubmissionBelongToStudent(subOtherSection, sampleStudent)).toBe(false);
  });

  it('counts 1 submitted homework accurately as 1/1 submitted and 0 remaining', () => {
    const classHw = getClassHomeworkForStudent(sampleHomework, sampleStudent);
    const submissions: HomeworkSubmission[] = [
      {
        id: 'sub_1',
        homeworkId: 'hw_math_1',
        studentId: 'std_hiya_1',
        studentName: 'Hiya Akhter',
        studentRoll: '02',
        className: 'Class 10',
        section: 'A',
        submissionDate: '2026-11-16 19:55',
        submissionType: 'text',
        imageUrls: [],
        textAnswer: '1, 2, 3, 4, 5, 6, 7, 8, 9, 10',
        status: 'submitted',
        version: 1,
      },
      // Orphaned submission for a deleted homework must NOT inflate submitted count above classHomework.length
      {
        id: 'sub_old',
        homeworkId: 'hw_deleted',
        studentId: 'std_hiya_1',
        studentName: 'Hiya Akhter',
        studentRoll: '02',
        className: 'Class 10',
        section: 'A',
        submissionDate: '2026-11-10 10:00',
        submissionType: 'text',
        imageUrls: [],
        textAnswer: 'old',
        status: 'approved',
        version: 1,
      },
    ];

    const accounting = computeStudentHomeworkAccounting(classHw, submissions, '2026-11-16');
    expect(accounting).toEqual({
      total: 1,
      submitted: 1,
      expiredCount: 0,
      activePendingCount: 0,
      dueTotal: 0,
    });
  });

  it('merges submissions prioritizing evaluated/newer versions without losing records', () => {
    const initialSub: HomeworkSubmission = {
      id: 'sub_1',
      homeworkId: 'hw_math_1',
      studentId: 'std_hiya_1',
      studentName: 'Hiya Akhter',
      studentRoll: '02',
      className: 'Class 10',
      section: 'A',
      submissionDate: '2026-11-16 19:55',
      submissionType: 'text',
      imageUrls: [],
      textAnswer: '1, 2, 3, 4, 5, 6, 77, 88, 99, 10',
      status: 'submitted',
      version: 1,
    };

    const evaluatedSub: HomeworkSubmission = {
      ...initialSub,
      status: 'approved',
      teacherMarks: 7,
      reviewedAt: '2026-11-16T19:56:00.000Z',
      aiEvaluation: {
        status: 'evaluated',
        suggestedMarks: 7,
        fullMarks: 10,
        confidence: 0.96,
        correctAnswers: 7,
        partialAnswers: 0,
        incorrectAnswers: 3,
        feedback: '৭, ৮, ৯ নম্বরে ভুল আছে।',
        requiresTeacherReview: false,
        evaluatedAt: '2026-11-16T19:56:00.000Z',
      },
    };

    const merged = mergeHomeworkSubmissions([evaluatedSub], [initialSub]);
    expect(merged).toHaveLength(1);
    expect(merged[0].teacherMarks).toBe(7);
    expect(merged[0].aiEvaluation?.suggestedMarks).toBe(7);
  });

  it('StorageService does NOT fabricate fake 9/10 marks for unevaluated submissions', () => {
    const sub: HomeworkSubmission = {
      id: 'sub_real_1',
      homeworkId: 'hw_math_1',
      studentId: 'std_hiya_1',
      studentName: 'Hiya Akhter',
      studentRoll: '02',
      className: 'Class 10',
      section: 'A',
      submissionDate: '2026-11-16 19:55',
      submissionType: 'text',
      imageUrls: [],
      textAnswer: '1, 2, 3, 4, 5, 6, 77, 88, 99, 10',
      status: 'submitted',
      version: 1,
    };

    StorageService.saveOrUpdateSubmission(sub, { skipCloudPush: true });
    const stored = StorageService.getHomeworkSubmissions();
    expect(stored).toHaveLength(1);
    expect(stored[0].status).toBe('submitted');
    expect(stored[0].teacherMarks).toBeUndefined();
    expect(stored[0].aiEvaluation).toBeUndefined();
  });
});
