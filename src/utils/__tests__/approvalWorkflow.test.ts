import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  buildSuperAdminPublishMeta,
  buildSuperAdminRejectMeta,
  buildTeacherDraftMeta,
  getApprovalStatusBadgeInfo,
  isPublishedForStudents,
  isSeatPlanPublishedForStudents,
  isSuperAdminApprover,
  resolveEffectiveApprovalStatus,
  summarizePendingApprovals,
} from '../approvalWorkflow';
import {
  Exam,
  ExamScheduleItem,
  ExamSeatPlanConfig,
  MarksEntry,
  RoutinePeriod,
  Subject,
} from '../../types';

// Provide an isolated in-memory localStorage for StorageService lifecycle tests in Node
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

describe('approvalWorkflow utilities', () => {
  it('authorizes strictly super_admin and master_admin for final approval', () => {
    expect(isSuperAdminApprover('super_admin')).toBe(true);
    expect(isSuperAdminApprover('master_admin')).toBe(true);
    expect(isSuperAdminApprover('teacher')).toBe(false);
    expect(isSuperAdminApprover('admin')).toBe(false);
    expect(isSuperAdminApprover('accountant')).toBe(false);
    expect(isSuperAdminApprover('student')).toBe(false);
    expect(isSuperAdminApprover('guardian')).toBe(false);
    expect(isSuperAdminApprover(null)).toBe(false);
  });

  it('hides draft, pending_approval, and rejected records from students while staying backward compatible', () => {
    expect(resolveEffectiveApprovalStatus(undefined)).toBe('published');
    expect(isPublishedForStudents(undefined)).toBe(true);
    expect(isPublishedForStudents('published')).toBe(true);

    expect(isPublishedForStudents('draft')).toBe(false);
    expect(isPublishedForStudents('pending_approval')).toBe(false);
    expect(isPublishedForStudents('rejected')).toBe(false);
  });

  it('enforces both approvalStatus and isPublished flag for exam seat plans', () => {
    const basePlan: ExamSeatPlanConfig = {
      examId: 'ex1',
      rooms: [],
      assignments: [],
      strategy: 'sequential',
      selectedClasses: ['Class 6'],
      updatedAt: '2026-11-15T10:00:00Z',
    };

    expect(isSeatPlanPublishedForStudents({ ...basePlan, approvalStatus: 'draft', isPublished: false })).toBe(false);
    expect(isSeatPlanPublishedForStudents({ ...basePlan, approvalStatus: 'pending_approval', isPublished: false })).toBe(false);
    expect(isSeatPlanPublishedForStudents({ ...basePlan, approvalStatus: 'published', isPublished: false })).toBe(false);
    expect(isSeatPlanPublishedForStudents({ ...basePlan, approvalStatus: 'rejected', isPublished: false })).toBe(false);
    expect(isSeatPlanPublishedForStudents({ ...basePlan, approvalStatus: 'published', isPublished: true })).toBe(true);
  });

  it('builds consistent draft/publish/reject metadata and Bengali/English badges', () => {
    const draftMeta = buildTeacherDraftMeta({ id: 'u_t1', name: 'Hasan', nameBn: 'হাসান স্যার' }, 'draft');
    expect(draftMeta.approvalStatus).toBe('draft');
    expect(draftMeta.submittedBy).toBe('হাসান স্যার');
    expect(draftMeta.approvedBy).toBeUndefined();

    const pubMeta = buildSuperAdminPublishMeta('প্রধান শিক্ষক');
    expect(pubMeta.approvalStatus).toBe('published');
    expect(pubMeta.approvedBy).toBe('প্রধান শিক্ষক');
    expect(pubMeta.rejectionNote).toBeUndefined();

    const rejMeta = buildSuperAdminRejectMeta('সুপার অ্যাডমিন', 'সময় পরিবর্তন করুন');
    expect(rejMeta.approvalStatus).toBe('rejected');
    expect(rejMeta.rejectionNote).toBe('সময় পরিবর্তন করুন');

    expect(getApprovalStatusBadgeInfo('pending_approval', 'bn').label).toBe('অনুমোদনের অপেক্ষায়');
    expect(getApprovalStatusBadgeInfo('draft', 'en').label).toBe('Draft');
  });

  it('aggregates pending and draft items across all 4 workflows accurately', () => {
    const exams: Exam[] = [
      {
        id: 'ex_1',
        nameEn: 'Half Yearly',
        nameBn: 'অর্ধবার্ষিক পরীক্ষা',
        term: 'half_yearly',
        session: '2026',
        startDate: '2026-06-01',
        endDate: '2026-06-15',
        isPublished: false,
        applicableClasses: ['Class 6'],
      },
    ];
    const subjects: Subject[] = [
      {
        id: 'sub_math',
        code: '109',
        nameEn: 'Mathematics',
        nameBn: 'গণিত',
        className: 'Class 6',
        fullMarks: 100,
        passMarks: 33,
        writtenMarks: 70,
        mcqMarks: 30,
      },
    ];
    const routines: RoutinePeriod[] = [
      {
        id: 'r1',
        className: 'Class 6',
        section: 'A',
        shift: 'Day',
        day: 'Sunday',
        periodNumber: 1,
        subjectName: 'Bangla',
        teacherId: 'st_1',
        teacherName: 'Teacher 1',
        startTime: '09:00',
        endTime: '09:45',
        roomNo: '101',
        approvalStatus: 'pending_approval',
        submittedBy: 'Teacher 1',
      },
      {
        id: 'r2',
        className: 'Class 7',
        section: 'A',
        shift: 'Day',
        day: 'Sunday',
        periodNumber: 2,
        subjectName: 'English',
        teacherId: 'st_2',
        teacherName: 'Teacher 2',
        startTime: '09:45',
        endTime: '10:30',
        roomNo: '102',
        approvalStatus: 'draft',
      },
    ];
    const examRoutines: ExamScheduleItem[] = [
      {
        id: 'er1',
        examId: 'ex_1',
        className: 'Class 6',
        subjectCode: '109',
        subjectNameEn: 'Mathematics',
        subjectNameBn: 'গণিত',
        examDate: '2026-06-02',
        startTime: '10:00',
        endTime: '13:00',
        approvalStatus: 'pending_approval',
        submittedBy: 'Teacher 1',
      },
    ];
    const seatPlans: Record<string, ExamSeatPlanConfig> = {
      ex_1: {
        examId: 'ex_1',
        rooms: [
          {
            id: 'rm1',
            roomNo: '101',
            building: 'Main',
            columns: 2,
            benchesPerColumn: 5,
            seatsPerBench: 2,
          },
        ],
        assignments: [],
        strategy: 'sequential',
        selectedClasses: ['Class 6'],
        updatedAt: '2026-05-20',
        approvalStatus: 'pending_approval',
        isPublished: false,
      },
    };
    const marks: MarksEntry[] = [
      {
        id: 'm1',
        examId: 'ex_1',
        studentId: 's1',
        subjectId: 'sub_math',
        subjectName: 'Mathematics',
        className: 'Class 6',
        written: 65,
        mcq: 20,
        practical: 0,
        total: 85,
        gpa: 5,
        grade: 'A+',
        approvalStatus: 'pending_approval',
      },
      {
        id: 'm2',
        examId: 'ex_1',
        studentId: 's2',
        subjectId: 'sub_math',
        subjectName: 'Mathematics',
        className: 'Class 6',
        written: 50,
        mcq: 20,
        practical: 0,
        total: 70,
        gpa: 4,
        grade: 'A',
        approvalStatus: 'pending_approval',
      },
    ];

    const summary = summarizePendingApprovals({
      routines,
      examRoutines,
      seatPlans,
      marks,
      exams,
      subjects,
    });

    expect(summary.totalPendingCount).toBe(4); // 1 routine + 1 exam routine group + 1 seat plan + 1 marks group
    expect(summary.totalDraftCount).toBe(1);
    expect(summary.marksPendingGroups[0].studentCount).toBe(2);
    expect(summary.marksPendingGroups[0].subjectName).toBe('গণিত');
  });
});

describe('StorageService Teacher Draft -> SuperAdmin Approval end-to-end lifecycle', () => {
  beforeEach(() => {
    globalThis.localStorage.clear();
  });

  it('transitions Class Routine from draft -> pending_approval -> published and supports rejection', () => {
    const draftPeriod: RoutinePeriod = {
      id: 'rt_test_1',
      className: 'Class 6',
      section: 'A',
      shift: 'Day',
      day: 'Monday',
      periodNumber: 1,
      subjectName: 'গণিত',
      teacherId: 't1',
      teacherName: 'করিম স্যার',
      startTime: '09:00',
      endTime: '09:45',
      roomNo: '২০১',
      approvalStatus: 'draft',
    };
    StorageService.saveRoutines([draftPeriod]);
    expect(isPublishedForStudents(StorageService.getRoutines()[0].approvalStatus)).toBe(false);

    const submitted = StorageService.submitClassRoutineDrafts(['rt_test_1'], { name: 'করিম স্যার', id: 't1' });
    expect(submitted).toBe(1);
    expect(StorageService.getRoutines()[0].approvalStatus).toBe('pending_approval');
    expect(isPublishedForStudents(StorageService.getRoutines()[0].approvalStatus)).toBe(false);

    const rejected = StorageService.rejectClassRoutines(['rt_test_1'], 'সুপার অ্যাডমিন', 'রুম নম্বর পরিবর্তন করুন');
    expect(rejected).toBe(1);
    expect(StorageService.getRoutines()[0].approvalStatus).toBe('rejected');
    expect(StorageService.getRoutines()[0].rejectionNote).toBe('রুম নম্বর পরিবর্তন করুন');

    // Teacher resubmits and SuperAdmin publishes
    StorageService.submitClassRoutineDrafts(['rt_test_1'], { name: 'করিম স্যার' });
    const approved = StorageService.approveClassRoutines(['rt_test_1'], 'সুপার অ্যাডমিন');
    expect(approved).toBe(1);
    const finalRoutine = StorageService.getRoutines()[0];
    expect(finalRoutine.approvalStatus).toBe('published');
    expect(finalRoutine.approvedBy).toBe('সুপার অ্যাডমিন');
    expect(isPublishedForStudents(finalRoutine.approvalStatus)).toBe(true);
  });

  it('transitions Exam Routine from draft -> pending_approval -> published', () => {
    const draftExamSchedule: ExamScheduleItem = {
      id: 'er_test_1',
      examId: 'exam_half_2026',
      className: 'Class 8',
      subjectCode: '107',
      subjectNameEn: 'English',
      subjectNameBn: 'ইংরেজি',
      examDate: '2026-07-05',
      startTime: '10:00',
      endTime: '13:00',
      approvalStatus: 'draft',
    };
    StorageService.saveExamRoutines([draftExamSchedule]);
    expect(isPublishedForStudents(StorageService.getExamRoutines()[0].approvalStatus)).toBe(false);

    const submitted = StorageService.submitExamRoutineDrafts('exam_half_2026', ['er_test_1'], { name: 'শিক্ষক' });
    expect(submitted).toBe(1);
    expect(StorageService.getExamRoutines()[0].approvalStatus).toBe('pending_approval');

    const approved = StorageService.approveExamRoutines('exam_half_2026', ['er_test_1'], 'প্রধান শিক্ষক');
    expect(approved).toBe(1);
    expect(StorageService.getExamRoutines()[0].approvalStatus).toBe('published');
    expect(isPublishedForStudents(StorageService.getExamRoutines()[0].approvalStatus)).toBe(true);
  });

  it('transitions Exam Seat Plan from draft -> pending_approval -> rejected -> published', () => {
    const plan: ExamSeatPlanConfig = {
      examId: 'exam_seat_1',
      rooms: [
        {
          id: 'r1',
          roomNo: 'Hall 1',
          building: 'Main',
          columns: 2,
          benchesPerColumn: 5,
          seatsPerBench: 2,
        },
      ],
      assignments: [],
      strategy: 'sequential',
      selectedClasses: ['Class 9'],
      updatedAt: '2026-11-15T10:00:00Z',
      approvalStatus: 'draft',
      isPublished: false,
    };
    StorageService.saveExamSeatPlan(plan);
    expect(isSeatPlanPublishedForStudents(StorageService.getExamSeatPlan('exam_seat_1'))).toBe(false);

    expect(StorageService.submitExamSeatPlanDraft('exam_seat_1', { name: 'শিক্ষক' })).toBe(true);
    expect(StorageService.getExamSeatPlan('exam_seat_1')?.approvalStatus).toBe('pending_approval');
    expect(isSeatPlanPublishedForStudents(StorageService.getExamSeatPlan('exam_seat_1'))).toBe(false);

    expect(StorageService.rejectExamSeatPlan('exam_seat_1', 'সুপার অ্যাডমিন', 'জিগজ্যাগ বিন্যাস করুন')).toBe(true);
    expect(StorageService.getExamSeatPlan('exam_seat_1')?.approvalStatus).toBe('rejected');

    expect(StorageService.approveExamSeatPlan('exam_seat_1', 'সুপার অ্যাডমিন')).toBe(true);
    const finalPlan = StorageService.getExamSeatPlan('exam_seat_1');
    expect(finalPlan?.approvalStatus).toBe('published');
    expect(finalPlan?.isPublished).toBe(true);
    expect(isSeatPlanPublishedForStudents(finalPlan)).toBe(true);
  });

  it('transitions Marks Entry from draft -> pending_approval -> published and publishes Exam when requested', () => {
    const draftExam: Exam = {
      id: 'exam_final_test',
      nameEn: 'Final Exam',
      nameBn: 'বার্ষিক পরীক্ষা',
      term: 'annual',
      session: '2026',
      startDate: '2026-11-20',
      endDate: '2026-12-05',
      isPublished: false,
      applicableClasses: ['Class 5'],
    };
    StorageService.saveExam(draftExam);

    const markDraft: MarksEntry = {
      id: 'mk_test_1',
      examId: 'exam_final_test',
      studentId: 'stu_1',
      subjectId: 'sub_1',
      subjectName: 'বাংলা',
      className: 'Class 5',
      written: 70,
      mcq: 15,
      practical: 0,
      total: 85,
      gpa: 5,
      grade: 'A+',
      approvalStatus: 'draft',
    };
    StorageService.saveMarksBatch([markDraft]);

    const subCount = StorageService.submitMarksDraft('exam_final_test', 'sub_1', { name: 'বাংলা শিক্ষক' });
    expect(subCount).toBe(1);
    const pendingMark = StorageService.getMarks().find((m) => m.id === 'mk_test_1');
    expect(pendingMark?.approvalStatus).toBe('pending_approval');
    expect(isPublishedForStudents(pendingMark?.approvalStatus)).toBe(false);

    const appCount = StorageService.approveMarksEntries('exam_final_test', 'sub_1', 'সুপার অ্যাডমিন', true);
    expect(appCount).toBe(1);
    const publishedMark = StorageService.getMarks().find((m) => m.id === 'mk_test_1');
    expect(publishedMark?.approvalStatus).toBe('published');
    expect(isPublishedForStudents(publishedMark?.approvalStatus)).toBe(true);

    const updatedExam = StorageService.getExams().find((e) => e.id === 'exam_final_test');
    expect(updatedExam?.isPublished).toBe(true);
  });
});
