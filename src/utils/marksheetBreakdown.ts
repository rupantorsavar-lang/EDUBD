import { MarksEntry, Subject } from '../types';

export interface MarksheetRowBreakdown {
  fullMarks: number;
  written: number;
  mcq: number;
  practical: number;
  total: number;
  hasWritten: boolean;
  hasMcq: boolean;
  hasPractical: boolean;
}

/**
 * Computes strictly separated component marks (Written/CQ, MCQ, Practical)
 * and total marks for a subject row on marksheets and academic transcripts.
 * Never merges Practical marks into MCQ.
 */
export function getMarksheetRowBreakdown(
  mark: Partial<Pick<MarksEntry, 'written' | 'mcq' | 'practical' | 'total' | 'writtenCQ' | 'totalMarks'>>,
  subject?: Partial<Pick<Subject, 'fullMarks' | 'writtenMarks' | 'mcqMarks' | 'practicalMarks'>> | null
): MarksheetRowBreakdown {
  const written = Number(mark.written ?? mark.writtenCQ ?? 0) || 0;
  const mcq = Number(mark.mcq ?? 0) || 0;
  const practical = Number(mark.practical ?? 0) || 0;
  const computedTotal = written + mcq + practical;

  const rawStoredTotal = mark.total ?? mark.totalMarks;
  const parsedStoredTotal = rawStoredTotal !== undefined ? Number(rawStoredTotal) : NaN;
  const total =
    Number.isFinite(parsedStoredTotal) && (parsedStoredTotal > 0 || computedTotal === 0)
      ? parsedStoredTotal
      : computedTotal;

  const fullMarks = Number(subject?.fullMarks) > 0 ? Number(subject?.fullMarks) : 100;

  const hasWritten =
    subject?.writtenMarks !== undefined
      ? subject.writtenMarks > 0 || written > 0
      : written > 0 || (!subject?.mcqMarks && !subject?.practicalMarks);

  const hasMcq =
    subject?.mcqMarks !== undefined ? subject.mcqMarks > 0 || mcq > 0 : mcq > 0;

  const hasPractical =
    subject?.practicalMarks !== undefined
      ? subject.practicalMarks > 0 || practical > 0
      : practical > 0;

  return {
    fullMarks,
    written,
    mcq,
    practical,
    total,
    hasWritten,
    hasMcq,
    hasPractical,
  };
}

/**
 * Matches a MarksEntry to its corresponding Subject definition (by subjectId first,
 * then by className + English/Bengali subject name fallback).
 */
export function findSubjectForMark(
  subjects: Subject[],
  mark: Pick<MarksEntry, 'subjectId' | 'subjectName' | 'className'>,
  fallbackClassName?: string
): Subject | undefined {
  if (!Array.isArray(subjects) || subjects.length === 0) return undefined;
  const byId = subjects.find((s) => s.id === mark.subjectId);
  if (byId) return byId;

  const targetClass = mark.className || fallbackClassName;
  const normalizedName = (mark.subjectName || '').trim().toLowerCase();
  if (!normalizedName) return undefined;

  return subjects.find((s) => {
    const classMatch = !targetClass || s.className === targetClass;
    if (!classMatch) return false;
    return (
      s.nameEn.trim().toLowerCase() === normalizedName ||
      (s.nameBn || '').trim().toLowerCase() === normalizedName
    );
  });
}
