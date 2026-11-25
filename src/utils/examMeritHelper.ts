import { MarksEntry, Student, Subject } from '../types';
import { calculateTotalGPA } from './grading';
import { compareStudentsByRoll } from './studentSort';

export interface SingleExamMeritInput {
  targetStudent: Student;
  classStudents: Student[];
  classSubjects: Subject[];
  getSubjectsForStudent: (student: Student, subjects: Subject[]) => Subject[];
  getStudentMarkForSubject: (studentId: string, subjectId: string) => MarksEntry | undefined;
}

export interface SingleExamMeritResult {
  status: 'pending' | 'passed' | 'failed';
  classRank: number | null;
  classPassedCount: number;
  classTotalStudents: number;
  sectionRank: number | null;
  sectionPassedCount: number;
  sectionTotalStudents: number;
  totalObtained: number;
  totalFullMarks: number;
  gpa: number;
  overallGrade: string;
  failedCount: number;
}

const BN_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];

export function toBnDigits(value: number | string): string {
  return String(value).replace(/\d/g, (d) => BN_DIGITS[Number(d)] ?? d);
}

/**
 * Formats Bengali ordinal position strings cleanly (১ম, ২য়, ৩য়, ৪র্থ, ৫ম, ..., ১১তম).
 */
export function formatBnOrdinal(rank: number): string {
  if (!Number.isFinite(rank) || rank <= 0) return '—';
  const n = Math.floor(rank);
  if (n === 1) return '১ম';
  if (n === 2) return '২য়';
  if (n === 3) return '৩য়';
  if (n === 4) return '৪র্থ';
  if (n === 5) return '৫ম';
  if (n === 6) return '৬ষ্ঠ';
  if (n === 7) return '৭ম';
  if (n === 8) return '৮ম';
  if (n === 9) return '৯ম';
  if (n === 10) return '১০ম';
  return `${toBnDigits(n)}তম`;
}

/**
 * Formats English ordinal strings (1st, 2nd, 3rd, 4th, 11th, 21st, etc.).
 */
export function formatEnOrdinal(rank: number): string {
  if (!Number.isFinite(rank) || rank <= 0) return '—';
  const n = Math.floor(rank);
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/**
 * Computes ONLY the target student's Merit Position within their class and section
 * for a single selected exam, matching the canonical ExaminationsView merit ranking rules:
 * 1. Eligible passed students: !hasFail && subjectsWithMarksCount > 0
 * 2. Sort order: GPA desc -> Total Obtained Marks desc -> Roll asc
 */
export function computeSingleExamStudentMeritRank({
  targetStudent,
  classStudents,
  classSubjects,
  getSubjectsForStudent,
  getStudentMarkForSubject,
}: SingleExamMeritInput): SingleExamMeritResult {
  const poolMap = new Map<string, Student>();
  for (const s of classStudents) {
    if (s.className === targetStudent.className) {
      poolMap.set(s.id, s);
    }
  }
  if (!poolMap.has(targetStudent.id)) {
    poolMap.set(targetStudent.id, targetStudent);
  }
  const pool = Array.from(poolMap.values());

  const calculated = pool.map((std) => {
    const relevantSubs = getSubjectsForStudent(std, classSubjects);
    let totalObtained = 0;
    let totalFullMarks = 0;
    const gpas: number[] = [];
    let hasFail = false;
    let failedCount = 0;
    let subjectsWithMarksCount = 0;

    for (const sub of relevantSubs) {
      const m = getStudentMarkForSubject(std.id, sub.id);
      if (m) {
        totalFullMarks += sub.fullMarks;
        subjectsWithMarksCount++;
        totalObtained += m.total;
        gpas.push(m.gpa);
        if (m.grade === 'F') {
          hasFail = true;
          failedCount++;
        }
      }
    }

    const res = calculateTotalGPA(gpas, hasFail);
    const isPassed = subjectsWithMarksCount > 0 && !hasFail && res.status === 'PASSED' && res.overallGrade !== 'F';

    return {
      student: std,
      totalObtained,
      totalFullMarks,
      gpa: res.totalGPA,
      overallGrade: res.overallGrade,
      hasFail,
      failedCount,
      subjectsWithMarksCount,
      isPassed,
    };
  });

  const passedStudents = calculated
    .filter((entry) => entry.isPassed)
    .sort((a, b) => {
      if (b.gpa !== a.gpa) return b.gpa - a.gpa;
      if (b.totalObtained !== a.totalObtained) return b.totalObtained - a.totalObtained;
      return compareStudentsByRoll(a.student, b.student);
    });

  const targetEntry = calculated.find((c) => c.student.id === targetStudent.id);
  const targetSectionNorm = (targetStudent.section || '').trim().toLowerCase();

  const sectionTotalStudents = pool.filter(
    (s) => (s.section || '').trim().toLowerCase() === targetSectionNorm
  ).length;
  const sectionPassed = passedStudents.filter(
    (entry) => (entry.student.section || '').trim().toLowerCase() === targetSectionNorm
  );

  const classRankIdx = passedStudents.findIndex((entry) => entry.student.id === targetStudent.id);
  const sectionRankIdx = sectionPassed.findIndex((entry) => entry.student.id === targetStudent.id);

  const status: SingleExamMeritResult['status'] =
    !targetEntry || targetEntry.subjectsWithMarksCount === 0
      ? 'pending'
      : targetEntry.isPassed
      ? 'passed'
      : 'failed';

  return {
    status,
    classRank: classRankIdx >= 0 ? classRankIdx + 1 : null,
    classPassedCount: passedStudents.length,
    classTotalStudents: pool.length,
    sectionRank: sectionRankIdx >= 0 ? sectionRankIdx + 1 : null,
    sectionPassedCount: sectionPassed.length,
    sectionTotalStudents,
    totalObtained: targetEntry?.totalObtained ?? 0,
    totalFullMarks: targetEntry?.totalFullMarks ?? 0,
    gpa: targetEntry?.gpa ?? 0,
    overallGrade: targetEntry?.overallGrade ?? '—',
    failedCount: targetEntry?.failedCount ?? 0,
  };
}

export interface ClassExamMeritInput {
  classStudents: Student[];
  classSubjects: Subject[];
  getSubjectsForStudent: (student: Student, subjects: Subject[]) => Subject[];
  getStudentMarkForSubject: (studentId: string, subjectId: string) => MarksEntry | undefined;
}

/**
 * Computes SingleExamMeritResult for every student in `classStudents` in one O(N) pass,
 * ideal for bulk whole-class marksheet rendering and printing.
 */
export function computeClassExamMeritMap({
  classStudents,
  classSubjects,
  getSubjectsForStudent,
  getStudentMarkForSubject,
}: ClassExamMeritInput): Map<string, SingleExamMeritResult> {
  const resultMap = new Map<string, SingleExamMeritResult>();
  if (classStudents.length === 0) return resultMap;

  const calculated = classStudents.map((std) => {
    const relevantSubs = getSubjectsForStudent(std, classSubjects);
    let totalObtained = 0;
    let totalFullMarks = 0;
    const gpas: number[] = [];
    let hasFail = false;
    let failedCount = 0;
    let subjectsWithMarksCount = 0;

    for (const sub of relevantSubs) {
      const m = getStudentMarkForSubject(std.id, sub.id);
      if (m) {
        totalFullMarks += sub.fullMarks;
        subjectsWithMarksCount++;
        totalObtained += m.total;
        gpas.push(m.gpa);
        if (m.grade === 'F') {
          hasFail = true;
          failedCount++;
        }
      }
    }

    const res = calculateTotalGPA(gpas, hasFail);
    const isPassed = subjectsWithMarksCount > 0 && !hasFail && res.status === 'PASSED' && res.overallGrade !== 'F';

    return {
      student: std,
      totalObtained,
      totalFullMarks,
      gpa: res.totalGPA,
      overallGrade: res.overallGrade,
      hasFail,
      failedCount,
      subjectsWithMarksCount,
      isPassed,
    };
  });

  const passedStudents = calculated
    .filter((entry) => entry.isPassed)
    .sort((a, b) => {
      if (b.gpa !== a.gpa) return b.gpa - a.gpa;
      if (b.totalObtained !== a.totalObtained) return b.totalObtained - a.totalObtained;
      return compareStudentsByRoll(a.student, b.student);
    });

  const classRankMap = new Map<string, number>();
  passedStudents.forEach((entry, idx) => {
    classRankMap.set(entry.student.id, idx + 1);
  });

  const sectionTotals = new Map<string, number>();
  const sectionPassedCounts = new Map<string, number>();
  const sectionRankMap = new Map<string, number>();

  for (const std of classStudents) {
    const secKey = (std.section || '').trim().toLowerCase();
    sectionTotals.set(secKey, (sectionTotals.get(secKey) || 0) + 1);
  }

  for (const entry of passedStudents) {
    const secKey = (entry.student.section || '').trim().toLowerCase();
    const nextRank = (sectionPassedCounts.get(secKey) || 0) + 1;
    sectionPassedCounts.set(secKey, nextRank);
    sectionRankMap.set(entry.student.id, nextRank);
  }

  for (const entry of calculated) {
    const secKey = (entry.student.section || '').trim().toLowerCase();
    const status: SingleExamMeritResult['status'] =
      entry.subjectsWithMarksCount === 0 ? 'pending' : entry.isPassed ? 'passed' : 'failed';

    resultMap.set(entry.student.id, {
      status,
      classRank: classRankMap.get(entry.student.id) ?? null,
      classPassedCount: passedStudents.length,
      classTotalStudents: classStudents.length,
      sectionRank: sectionRankMap.get(entry.student.id) ?? null,
      sectionPassedCount: sectionPassedCounts.get(secKey) || 0,
      sectionTotalStudents: sectionTotals.get(secKey) || 0,
      totalObtained: entry.totalObtained,
      totalFullMarks: entry.totalFullMarks,
      gpa: entry.gpa,
      overallGrade: entry.overallGrade,
      failedCount: entry.failedCount,
    });
  }

  return resultMap;
}
