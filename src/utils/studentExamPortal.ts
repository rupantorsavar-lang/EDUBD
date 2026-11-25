import {
  Exam,
  ExamScheduleItem,
  ExamSeatAssignment,
  ExamSeatPlanConfig,
  ExamSeatRoom,
  Student,
} from '../types';
import {
  isPublishedForStudents,
  isSeatPlanPublishedForStudents,
} from './approvalWorkflow';

export interface PublishedExamRoutineGroup {
  examId: string;
  examObj?: Exam;
  examTitle: string;
  session?: string;
  items: ExamScheduleItem[];
}

export interface StudentPersonalSeatPlan {
  examId: string;
  examObj?: Exam;
  examTitle: string;
  assignment: ExamSeatAssignment;
  room?: ExamSeatRoom;
  approvedAt?: string;
  updatedAt?: string;
}

/**
 * Strictly checks whether a seat assignment belongs exclusively to the active student.
 * Prevents cross-section/cross-student roll collisions and never leaks peer records.
 */
export function doesAssignmentBelongToStudent(
  assignment: ExamSeatAssignment | null | undefined,
  student: Pick<Student, 'id' | 'studentId' | 'className' | 'section' | 'shift' | 'roll'> | null | undefined
): boolean {
  if (!assignment || !student) return false;

  if (assignment.studentId && student.id && assignment.studentId === student.id) {
    return true;
  }
  if (assignment.studentId && student.studentId && assignment.studentId === student.studentId) {
    return true;
  }
  if (assignment.studentCode && student.studentId && assignment.studentCode === student.studentId) {
    return true;
  }
  if (assignment.studentCode && student.id && assignment.studentCode === student.id) {
    return true;
  }

  // If the assignment carries explicit IDs/codes for another student, reject immediately
  const assignmentHasId = Boolean(assignment.studentId || assignment.studentCode);
  const studentHasId = Boolean(student.id || student.studentId);
  if (assignmentHasId && studentHasId) {
    return false;
  }

  // Legacy fallback (only when explicit student IDs are unavailable)
  if (!assignment.roll || !student.roll || assignment.className !== student.className) {
    return false;
  }
  if (String(assignment.roll).trim() !== String(student.roll).trim()) {
    return false;
  }
  if (assignment.section && student.section && assignment.section !== student.section) {
    return false;
  }
  if (assignment.shift && student.shift && assignment.shift !== student.shift) {
    return false;
  }
  return true;
}

/**
 * Returns only SuperAdmin-published exam routine items for the student's class,
 * sorted chronologically and grouped by exam.
 */
export function getPublishedExamRoutineGroupsForStudent(
  allExamRoutines: ExamScheduleItem[],
  allExams: Exam[],
  student: Pick<Student, 'className'>
): {
  flatItems: ExamScheduleItem[];
  groups: PublishedExamRoutineGroup[];
} {
  const flatItems = (allExamRoutines || [])
    .filter(
      (er) =>
        er.className === student.className &&
        isPublishedForStudents(er.approvalStatus)
    )
    .sort((a, b) => {
      const dateCmp = (a.examDate || '').localeCompare(b.examDate || '');
      if (dateCmp !== 0) return dateCmp;
      return (a.startTime || '').localeCompare(b.startTime || '');
    });

  const examMap = new Map((allExams || []).map((e) => [e.id, e]));
  const groupMap = new Map<string, PublishedExamRoutineGroup>();

  for (const item of flatItems) {
    const key = item.examId || 'default_exam';
    const existing = groupMap.get(key);
    if (existing) {
      existing.items.push(item);
    } else {
      const examObj = examMap.get(item.examId);
      groupMap.set(key, {
        examId: key,
        examObj,
        examTitle: examObj?.nameBn || examObj?.nameEn || 'পরীক্ষার সময়সূচি',
        session: examObj?.session,
        items: [item],
      });
    }
  }

  return {
    flatItems,
    groups: Array.from(groupMap.values()),
  };
}

/**
 * Returns ONLY the active student's own seat allocation across all published seat plans.
 * Other students' seat assignments and full room rosters are strictly excluded.
 */
export function getPublishedSeatPlansForStudent(
  allSeatPlans: Record<string, ExamSeatPlanConfig> | undefined,
  allExams: Exam[],
  student: Pick<Student, 'id' | 'studentId' | 'className' | 'section' | 'shift' | 'roll'>
): StudentPersonalSeatPlan[] {
  const results: StudentPersonalSeatPlan[] = [];
  const examMap = new Map((allExams || []).map((e) => [e.id, e]));

  for (const plan of Object.values(allSeatPlans || {})) {
    if (!isSeatPlanPublishedForStudents(plan)) continue;

    const personalAssignment = (plan.assignments || []).find((a) =>
      doesAssignmentBelongToStudent(a, student)
    );
    if (!personalAssignment) continue;

    const room = (plan.rooms || []).find((r) => r.id === personalAssignment.roomId);
    const examObj = examMap.get(plan.examId);

    results.push({
      examId: plan.examId,
      examObj,
      examTitle: examObj?.nameBn || examObj?.nameEn || 'পরীক্ষা',
      assignment: personalAssignment,
      room,
      approvedAt: plan.approvedAt,
      updatedAt: plan.updatedAt,
    });
  }

  return results;
}
