import { Homework, HomeworkSubmission, Student } from '../types';

export function getLocalCalendarDateString(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function normalizeStudentRoll(roll?: string | number): string {
  if (roll === undefined || roll === null) return '';
  const trimmed = String(roll).trim();
  if (!trimmed) return '';
  if (/^\d+$/.test(trimmed)) {
    return String(Number(trimmed));
  }
  return trimmed.toLowerCase();
}

export function doesSubmissionBelongToStudent(
  sub: Partial<HomeworkSubmission> | null | undefined,
  student: Partial<Pick<Student, 'id' | 'studentId' | 'roll' | 'className' | 'section'>> | null | undefined
): boolean {
  if (!sub || !student) return false;

  const subStudentId = String(sub.studentId || '').trim();
  const stuInternalId = String(student.id || '').trim();
  const stuCode = String(student.studentId || '').trim();

  if (subStudentId && stuInternalId && subStudentId === stuInternalId) {
    return true;
  }
  if (subStudentId && stuCode && subStudentId === stuCode) {
    return true;
  }

  const subCode = String((sub as any).studentCode || '').trim();
  if (subCode && stuCode && subCode === stuCode) {
    return true;
  }

  // Fallback match by same class + normalized roll (and matching section when both are specified)
  const sameClass =
    Boolean(sub.className) &&
    Boolean(student.className) &&
    String(sub.className).trim() === String(student.className).trim();
  if (!sameClass) return false;

  const subRoll = normalizeStudentRoll(sub.studentRoll);
  const stuRoll = normalizeStudentRoll(student.roll);
  if (!subRoll || !stuRoll || subRoll !== stuRoll) return false;

  const subSec = String(sub.section || '').trim();
  const stuSec = String(student.section || '').trim();
  if (subSec && subSec !== 'all' && stuSec && subSec.toLowerCase() !== stuSec.toLowerCase()) {
    return false;
  }

  return true;
}

export function getClassHomeworkForStudent(
  allHomework: Homework[],
  student: Partial<Pick<Student, 'className' | 'section'>>
): Homework[] {
  return (allHomework || [])
    .filter(
      (h) =>
        h &&
        h.className === student.className &&
        (!h.section || h.section === 'all' || !student.section || h.section === student.section)
    )
    .sort((a, b) => (b.dueDate || '').localeCompare(a.dueDate || ''));
}

export interface StudentHomeworkAccounting {
  total: number;
  submitted: number;
  expiredCount: number;
  activePendingCount: number;
  dueTotal: number;
}

export function computeStudentHomeworkAccounting(
  classHomework: Homework[],
  studentSubmissions: HomeworkSubmission[],
  todayCalendarDate: string = getLocalCalendarDateString()
): StudentHomeworkAccounting {
  const total = classHomework.length;
  let submitted = 0;
  let expiredCount = 0;
  let activePendingCount = 0;

  classHomework.forEach((hw) => {
    const isSub = studentSubmissions.some((s) => s.homeworkId === hw.id);
    if (isSub) {
      submitted++;
    } else if (hw.dueDate && todayCalendarDate > hw.dueDate) {
      expiredCount++;
    } else {
      activePendingCount++;
    }
  });

  return {
    total,
    submitted,
    expiredCount,
    activePendingCount,
    dueTotal: expiredCount + activePendingCount,
  };
}

function getSubmissionPriorityScore(sub: HomeworkSubmission): number {
  const versionScore = Number(sub.version || 1) * 1_000_000_000_000;
  const tsRaw = sub.reviewedAt || sub.aiEvaluation?.evaluatedAt || sub.submissionDate || '';
  const tsScore = tsRaw ? Date.parse(tsRaw) || 0 : 0;
  const evalBonus = sub.aiEvaluation ? 10_000 : 0;
  const approvedBonus = sub.status === 'approved' ? 5_000 : 0;
  return versionScore + tsScore + evalBonus + approvedBonus;
}

export function getSubmissionDedupKey(sub: HomeworkSubmission): string {
  if (sub.homeworkId && sub.studentId) {
    return `${sub.homeworkId}::${sub.studentId}`;
  }
  return sub.id;
}

export function mergeHomeworkSubmissions(
  incomingList: HomeworkSubmission[],
  existingList: HomeworkSubmission[]
): HomeworkSubmission[] {
  const byKey = new Map<string, HomeworkSubmission>();

  for (const item of [...(existingList || []), ...(incomingList || [])]) {
    if (!item || !item.id) continue;
    const key = getSubmissionDedupKey(item);
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, item);
      continue;
    }

    const prevScore = getSubmissionPriorityScore(prev);
    const nextScore = getSubmissionPriorityScore(item);
    if (nextScore >= prevScore) {
      byKey.set(key, {
        ...item,
        id: prev.id || item.id,
        version: Math.max(prev.version || 1, item.version || 1),
      });
    }
  }

  return Array.from(byKey.values()).sort((a, b) =>
    (b.submissionDate || '').localeCompare(a.submissionDate || '')
  );
}
