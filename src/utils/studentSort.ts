import { Student } from '../types';

export const CLASS_SEQUENCE_ORDER: string[] = [
  'Play',
  'Nurany',
  'Nursery',
  'KG',
  'Class 1',
  'Class 2',
  'Class 3',
  'Class 4',
  'Class 5',
  'Class 6',
  'Class 7',
  'Class 8',
  'Class 9',
  'Class 10',
  'Class 11',
  'Class 12',
];

const BENGALI_TO_ENGLISH_DIGITS: Record<string, string> = {
  '০': '0',
  '১': '1',
  '২': '2',
  '৩': '3',
  '৪': '4',
  '৫': '5',
  '৬': '6',
  '৭': '7',
  '৮': '8',
  '৯': '9',
};

export function normalizeRollDigits(val?: string | number | null): string {
  if (val === undefined || val === null) return '';
  return String(val).replace(/[০-৯]/g, (d) => BENGALI_TO_ENGLISH_DIGITS[d] ?? d);
}

export function parseRollNumber(roll?: string | number | null): number {
  const normalized = normalizeRollDigits(roll).trim();
  if (!normalized) return Number.MAX_SAFE_INTEGER;
  const match = normalized.match(/\d+/);
  if (!match) return Number.MAX_SAFE_INTEGER;
  const parsed = parseInt(match[0], 10);
  return Number.isNaN(parsed) ? Number.MAX_SAFE_INTEGER : parsed;
}

export function compareRolls(rollA?: string | number | null, rollB?: string | number | null): number {
  const numA = parseRollNumber(rollA);
  const numB = parseRollNumber(rollB);
  if (numA !== numB) return numA - numB;

  const strA = normalizeRollDigits(rollA).trim();
  const strB = normalizeRollDigits(rollB).trim();
  return strA.localeCompare(strB, undefined, { numeric: true, sensitivity: 'base' });
}

export function getClassOrderIndex(className?: string | null): number {
  if (!className) return Number.MAX_SAFE_INTEGER;
  const clean = normalizeRollDigits(className).trim().toLowerCase();
  const exactIdx = CLASS_SEQUENCE_ORDER.findIndex((c) => c.toLowerCase() === clean);
  if (exactIdx !== -1) return exactIdx;

  const classMatch = clean.match(/class\s*(\d+)/);
  if (classMatch) {
    return 100 + parseInt(classMatch[1], 10);
  }
  return Number.MAX_SAFE_INTEGER;
}

export type SortableStudentLike = Pick<Student, 'roll' | 'className' | 'section' | 'nameEn'>;

export function compareStudentsByRoll(a: SortableStudentLike, b: SortableStudentLike): number {
  const rollDiff = compareRolls(a.roll, b.roll);
  if (rollDiff !== 0) return rollDiff;

  const clsA = getClassOrderIndex(a.className);
  const clsB = getClassOrderIndex(b.className);
  if (clsA !== clsB) return clsA - clsB;

  const secDiff = String(a.section || '').localeCompare(String(b.section || ''), undefined, {
    sensitivity: 'base',
  });
  if (secDiff !== 0) return secDiff;

  return String(a.nameEn || '').localeCompare(String(b.nameEn || ''), undefined, {
    sensitivity: 'base',
  });
}

export function compareStudentsByClassAndRoll(
  a: SortableStudentLike,
  b: SortableStudentLike
): number {
  const clsA = getClassOrderIndex(a.className);
  const clsB = getClassOrderIndex(b.className);
  if (clsA !== clsB) return clsA - clsB;

  if (clsA === Number.MAX_SAFE_INTEGER) {
    const clsNameDiff = String(a.className || '').localeCompare(String(b.className || ''), undefined, {
      numeric: true,
      sensitivity: 'base',
    });
    if (clsNameDiff !== 0) return clsNameDiff;
  }

  const rollDiff = compareRolls(a.roll, b.roll);
  if (rollDiff !== 0) return rollDiff;

  const secDiff = String(a.section || '').localeCompare(String(b.section || ''), undefined, {
    sensitivity: 'base',
  });
  if (secDiff !== 0) return secDiff;

  return String(a.nameEn || '').localeCompare(String(b.nameEn || ''), undefined, {
    sensitivity: 'base',
  });
}

export function sortStudentsByRoll<T extends SortableStudentLike>(list: T[]): T[] {
  return [...list].sort(compareStudentsByRoll);
}

export function sortStudentsByClassAndRoll<T extends SortableStudentLike>(list: T[]): T[] {
  return [...list].sort(compareStudentsByClassAndRoll);
}
