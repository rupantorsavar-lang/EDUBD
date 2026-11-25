import { Staff, Student } from '../types';
import { toEnNumber } from './i18n';

export interface SearchFilterResult<T> {
  items: T[];
  totalMatches: number;
  hasMore: boolean;
}

export function normalizePersonSearchText(value?: string | number | null): string {
  if (value === undefined || value === null) return '';
  return toEnNumber(String(value))
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenizeQuery(query: string): string[] {
  const normalized = normalizePersonSearchText(query);
  if (!normalized) return [];
  return normalized.split(' ').filter(Boolean);
}

function matchesAllTokens(haystack: string, tokens: string[]): boolean {
  for (let i = 0; i < tokens.length; i++) {
    if (!haystack.includes(tokens[i])) {
      return false;
    }
  }
  return true;
}

function buildStudentHaystack(student: Student): string {
  const rollNorm = normalizePersonSearchText(student.roll);
  const parts = [
    student.studentId,
    student.admissionNo,
    student.nameBn,
    student.nameEn,
    student.roll,
    rollNorm ? `roll ${rollNorm}` : '',
    rollNorm ? `রোল ${rollNorm}` : '',
    student.className,
    student.section,
    student.shift,
    student.group,
    student.phone,
    student.guardianPhone,
    student.fatherPhone,
    student.motherPhone,
    student.guardianName,
    student.fatherNameBn,
    student.fatherNameEn,
    student.email,
    student.username,
  ];
  return normalizePersonSearchText(parts.filter(Boolean).join(' '));
}

function isStudentPriorityMatch(student: Student, normalizedQuery: string): boolean {
  const sid = normalizePersonSearchText(student.studentId);
  const adm = normalizePersonSearchText(student.admissionNo);
  const roll = normalizePersonSearchText(student.roll);
  const nameBn = normalizePersonSearchText(student.nameBn);
  const nameEn = normalizePersonSearchText(student.nameEn);
  const phone = normalizePersonSearchText(student.phone);
  const guardianPhone = normalizePersonSearchText(student.guardianPhone);

  return (
    sid === normalizedQuery ||
    sid.endsWith(normalizedQuery) ||
    adm === normalizedQuery ||
    roll === normalizedQuery ||
    nameBn.startsWith(normalizedQuery) ||
    nameEn.startsWith(normalizedQuery) ||
    phone.startsWith(normalizedQuery) ||
    guardianPhone.startsWith(normalizedQuery)
  );
}

export function filterStudentsByQuery(
  students: Student[],
  query: string,
  limit = 60
): SearchFilterResult<Student> {
  const safeLimit = Math.max(1, limit);
  const tokens = tokenizeQuery(query);
  if (tokens.length === 0) {
    return {
      items: students.slice(0, safeLimit),
      totalMatches: students.length,
      hasMore: students.length > safeLimit,
    };
  }

  const normalizedQuery = tokens.join(' ');
  const priorityMatches: Student[] = [];
  const otherMatches: Student[] = [];

  for (let i = 0; i < students.length; i++) {
    const student = students[i];
    const haystack = buildStudentHaystack(student);
    if (!matchesAllTokens(haystack, tokens)) continue;
    if (isStudentPriorityMatch(student, normalizedQuery)) {
      priorityMatches.push(student);
    } else {
      otherMatches.push(student);
    }
  }

  const totalMatches = priorityMatches.length + otherMatches.length;
  const combined =
    priorityMatches.length >= safeLimit
      ? priorityMatches.slice(0, safeLimit)
      : [...priorityMatches, ...otherMatches.slice(0, safeLimit - priorityMatches.length)];

  return {
    items: combined,
    totalMatches,
    hasMore: totalMatches > safeLimit,
  };
}

function buildStaffHaystack(staff: Staff): string {
  const parts = [
    staff.employeeId,
    staff.nameBn,
    staff.nameEn,
    staff.designation,
    staff.department,
    staff.role,
    staff.subject,
    staff.phone,
    staff.email,
    staff.username,
  ];
  return normalizePersonSearchText(parts.filter(Boolean).join(' '));
}

function isStaffPriorityMatch(staff: Staff, normalizedQuery: string): boolean {
  const empId = normalizePersonSearchText(staff.employeeId);
  const nameBn = normalizePersonSearchText(staff.nameBn);
  const nameEn = normalizePersonSearchText(staff.nameEn);
  const phone = normalizePersonSearchText(staff.phone);

  return (
    empId === normalizedQuery ||
    empId.startsWith(normalizedQuery) ||
    nameBn.startsWith(normalizedQuery) ||
    nameEn.startsWith(normalizedQuery) ||
    phone.startsWith(normalizedQuery)
  );
}

export function filterStaffByQuery(
  staffList: Staff[],
  query: string,
  limit = 60
): SearchFilterResult<Staff> {
  const safeLimit = Math.max(1, limit);
  const tokens = tokenizeQuery(query);
  if (tokens.length === 0) {
    return {
      items: staffList.slice(0, safeLimit),
      totalMatches: staffList.length,
      hasMore: staffList.length > safeLimit,
    };
  }

  const normalizedQuery = tokens.join(' ');
  const priorityMatches: Staff[] = [];
  const otherMatches: Staff[] = [];

  for (let i = 0; i < staffList.length; i++) {
    const staff = staffList[i];
    const haystack = buildStaffHaystack(staff);
    if (!matchesAllTokens(haystack, tokens)) continue;
    if (isStaffPriorityMatch(staff, normalizedQuery)) {
      priorityMatches.push(staff);
    } else {
      otherMatches.push(staff);
    }
  }

  const totalMatches = priorityMatches.length + otherMatches.length;
  const combined =
    priorityMatches.length >= safeLimit
      ? priorityMatches.slice(0, safeLimit)
      : [...priorityMatches, ...otherMatches.slice(0, safeLimit - priorityMatches.length)];

  return {
    items: combined,
    totalMatches,
    hasMore: totalMatches > safeLimit,
  };
}
