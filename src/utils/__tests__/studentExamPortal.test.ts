import { describe, it, expect } from 'vitest';
import {
  doesAssignmentBelongToStudent,
  getPublishedExamRoutineGroupsForStudent,
  getPublishedSeatPlansForStudent,
} from '../studentExamPortal';
import {
  Exam,
  ExamScheduleItem,
  ExamSeatAssignment,
  ExamSeatPlanConfig,
  Student,
} from '../../types';

type TestStudent = Pick<Student, 'id' | 'studentId' | 'className' | 'section' | 'shift' | 'roll'>;

const makeStudent = (overrides: Partial<TestStudent> = {}): TestStudent => ({
  id: 'stu_1002',
  studentId: 'SCH001-S-2026-1002',
  className: 'Class 10',
  section: 'A',
  shift: 'Morning',
  roll: '02',
  ...overrides,
});

const makeAssignment = (overrides: Partial<ExamSeatAssignment> = {}): ExamSeatAssignment => ({
  id: 'seat_1',
  examId: 'ex_1',
  roomId: 'room_101',
  roomNo: 'Room 101',
  columnIndex: 1,
  benchNumber: 1,
  seatPosition: 2,
  seatLabel: 'Room 101-B1-B',
  studentId: 'stu_1002',
  studentCode: 'SCH001-S-2026-1002',
  studentNameEn: 'Hiya Akhter',
  studentNameBn: 'হিয়া আক্তার',
  className: 'Class 10',
  section: 'A',
  shift: 'Morning',
  roll: '02',
  ...overrides,
});

describe('studentExamPortal helpers', () => {
  const exams: Exam[] = [
    {
      id: 'ex_half',
      nameEn: 'Half Yearly Exam',
      nameBn: 'অর্ধবার্ষিক পরীক্ষা',
      term: 'half_yearly',
      session: '2026',
      startDate: '2026-08-10',
      endDate: '2026-08-20',
      isPublished: false, // Result not published yet, exam routine & seat plan may still be published
      applicableClasses: ['Class 10', 'Class 6'],
    },
  ];

  it('returns only published exam routines for the student class sorted by date and time', () => {
    const hiya = makeStudent();
    const routines: ExamScheduleItem[] = [
      {
        id: 'er_2',
        examId: 'ex_half',
        className: 'Class 10',
        subjectCode: '107',
        subjectNameEn: 'English',
        subjectNameBn: 'ইংরেজি',
        examDate: '2026-08-11',
        startTime: '10:00 AM',
        endTime: '01:00 PM',
        roomNo: 'Room 201',
        approvalStatus: 'published',
      },
      {
        id: 'er_1',
        examId: 'ex_half',
        className: 'Class 10',
        subjectCode: '101',
        subjectNameEn: 'Bangla',
        subjectNameBn: 'বাংলা',
        examDate: '2026-08-10',
        startTime: '10:00 AM',
        endTime: '01:00 PM',
        roomNo: 'Room 201',
        approvalStatus: 'published',
      },
      {
        id: 'er_draft',
        examId: 'ex_half',
        className: 'Class 10',
        subjectCode: '109',
        subjectNameEn: 'Math',
        subjectNameBn: 'গণিত',
        examDate: '2026-08-12',
        startTime: '10:00 AM',
        endTime: '01:00 PM',
        approvalStatus: 'draft',
      },
      {
        id: 'er_pending',
        examId: 'ex_half',
        className: 'Class 10',
        subjectCode: '154',
        subjectNameEn: 'ICT',
        subjectNameBn: 'তথ্য ও যোগাযোগ প্রযুক্তি',
        examDate: '2026-08-13',
        startTime: '10:00 AM',
        endTime: '01:00 PM',
        approvalStatus: 'pending_approval',
      },
      {
        id: 'er_other_class',
        examId: 'ex_half',
        className: 'Class 6',
        subjectCode: '101',
        subjectNameEn: 'Bangla',
        subjectNameBn: 'বাংলা',
        examDate: '2026-08-10',
        startTime: '10:00 AM',
        endTime: '01:00 PM',
        approvalStatus: 'published',
      },
    ];

    const res = getPublishedExamRoutineGroupsForStudent(routines, exams, hiya);
    expect(res.flatItems.map((i) => i.id)).toEqual(['er_1', 'er_2']);
    expect(res.groups).toHaveLength(1);
    expect(res.groups[0].examTitle).toBe('অর্ধবার্ষিক পরীক্ষা');
    expect(res.groups[0].items).toHaveLength(2);
  });

  it('strictly isolates seat plan assignment to the active student and prevents cross-section roll collisions', () => {
    const hiya = makeStudent();
    const otherSectionSameRoll = makeAssignment({
      id: 'seat_other',
      studentId: 'stu_9999',
      studentCode: 'SCH001-S-2026-9999',
      studentNameEn: 'Rafi',
      section: 'B',
      roll: '02',
    });
    const hiyaSeat = makeAssignment({
      id: 'seat_hiya',
      examId: 'ex_half',
    });

    expect(doesAssignmentBelongToStudent(otherSectionSameRoll, hiya)).toBe(false);
    expect(doesAssignmentBelongToStudent(hiyaSeat, hiya)).toBe(true);

    // Legacy fallback without IDs also requires section & shift match
    const legacyOtherSection = makeAssignment({
      studentId: '',
      studentCode: '',
      section: 'B',
      roll: '02',
    });
    expect(doesAssignmentBelongToStudent(legacyOtherSection, hiya)).toBe(false);

    const legacyExactSection = makeAssignment({
      studentId: '',
      studentCode: '',
      section: 'A',
      shift: 'Morning',
      roll: '02',
    });
    expect(doesAssignmentBelongToStudent(legacyExactSection, hiya)).toBe(true);
  });

  it('returns only published personal seat plans and hides unpublished drafts', () => {
    const hiya = makeStudent();
    const peerSeat = makeAssignment({
      id: 'seat_peer',
      examId: 'ex_half',
      studentId: 'stu_1003',
      studentCode: 'SCH001-S-2026-1003',
      studentNameEn: 'Nadia',
      roll: '03',
      benchNumber: 2,
      seatLabel: 'Room 101-B2-A',
    });
    const hiyaSeat = makeAssignment({
      id: 'seat_hiya',
      examId: 'ex_half',
    });

    const seatPlans: Record<string, ExamSeatPlanConfig> = {
      ex_half: {
        examId: 'ex_half',
        rooms: [
          {
            id: 'room_101',
            roomNo: 'Room 101',
            building: 'Academic Building (Ground Floor)',
            columns: 2,
            benchesPerColumn: 5,
            seatsPerBench: 2,
            invigilatorName: 'Kamal Sir',
          },
        ],
        assignments: [peerSeat, hiyaSeat],
        strategy: 'sequential',
        selectedClasses: ['Class 10'],
        updatedAt: '2026-08-01T10:00:00Z',
        approvalStatus: 'published',
        isPublished: true,
      },
      ex_draft_seat: {
        examId: 'ex_draft_seat',
        rooms: [
          {
            id: 'room_102',
            roomNo: 'Room 102',
            columns: 2,
            benchesPerColumn: 5,
            seatsPerBench: 2,
          },
        ],
        assignments: [makeAssignment({ id: 'seat_draft', examId: 'ex_draft_seat', roomId: 'room_102', roomNo: 'Room 102' })],
        strategy: 'sequential',
        selectedClasses: ['Class 10'],
        updatedAt: '2026-08-02T10:00:00Z',
        approvalStatus: 'pending_approval',
        isPublished: false,
      },
    };

    const personalPlans = getPublishedSeatPlansForStudent(seatPlans, exams, hiya);
    expect(personalPlans).toHaveLength(1);
    expect(personalPlans[0].assignment.id).toBe('seat_hiya');
    expect(personalPlans[0].room?.roomNo).toBe('Room 101');
    expect(personalPlans[0].examTitle).toBe('অর্ধবার্ষিক পরীক্ষা');
    // Verify peer data is not exposed in returned personal plan structure
    expect((personalPlans[0] as unknown as { plan?: unknown }).plan).toBeUndefined();
  });
});
