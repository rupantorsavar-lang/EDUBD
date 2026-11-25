export interface SchoolCodeContext {
  id?: string | null;
  schoolCode?: string | null;
}

const TENANT_ID_PATTERN = /^SCH\d+$/i;

/**
 * Normalizes a candidate school ID (e.g., "sch001" -> "SCH001").
 */
export function normalizeSchoolCode(value?: string | null): string {
  if (!value || typeof value !== 'string') return '';
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '');
}

function isUsableTenantSchoolId(candidate: string): boolean {
  if (!candidate) return false;
  if (candidate === 'SCHOOL_MAIN' || candidate === 'DEFAULT') return false;
  if (candidate.startsWith('DOMAIN_') || candidate.startsWith('WORKSPACE_')) return false;
  return true;
}

/**
 * Resolves the active school tenant identifier (e.g., "SCH001", "SCH002")
 * strictly prioritizing the authenticated SaaS schoolId, active tenant storage,
 * and tenant profile ID.
 */
export function resolveSchoolCode(
  explicitSchoolId?: string | null,
  profile?: SchoolCodeContext | null,
  saasActiveSchoolId?: string | null
): string {
  const explicit = normalizeSchoolCode(explicitSchoolId);
  if (isUsableTenantSchoolId(explicit)) {
    return explicit;
  }

  const activeSaas = normalizeSchoolCode(saasActiveSchoolId);
  if (isUsableTenantSchoolId(activeSaas)) {
    return activeSaas;
  }

  const profileId = normalizeSchoolCode(profile?.id);
  if (isUsableTenantSchoolId(profileId)) {
    return profileId;
  }

  const profileCode = normalizeSchoolCode(profile?.schoolCode);
  if (TENANT_ID_PATTERN.test(profileCode)) {
    return profileCode;
  }

  return 'SCH001';
}

/**
 * Formats an ID (Student ID or Staff Employee ID) with the active school prefix
 * (e.g., "EMP-101" in SCH002 -> "SCH002-EMP-101", "S-2026-1001" in SCH001 -> "SCH001-S-2026-1001").
 * Avoids double-prefixing if the ID already starts with a school prefix like "SCH001-".
 */
export function formatSchoolScopedId(rawId?: string | null, schoolCode?: string | null): string {
  const trimmed = (rawId || '').trim();
  if (!trimmed) return '';

  const normalizedSchool = resolveSchoolCode(schoolCode);
  const upperTrimmed = trimmed.toUpperCase();

  if (
    upperTrimmed.startsWith(`${normalizedSchool}-`) ||
    /^SCH\d+-/i.test(upperTrimmed)
  ) {
    return trimmed;
  }

  return `${normalizedSchool}-${trimmed}`;
}

/**
 * Strips an optional leading school code prefix like "SCH001-" for fallback matching.
 */
export function stripSchoolPrefix(rawId?: string | null): string {
  const trimmed = (rawId || '').trim();
  return trimmed.replace(/^SCH\d+-/i, '');
}

/**
 * Checks whether a candidate code matches a stored ID directly or via school-prefix normalization.
 */
export function isMatchingScopedId(storedId?: string | null, scannedId?: string | null): boolean {
  const a = (storedId || '').trim().toLowerCase();
  const b = (scannedId || '').trim().toLowerCase();
  if (!a || !b) return false;
  if (a === b) return true;

  const strippedA = stripSchoolPrefix(a).toLowerCase();
  const strippedB = stripSchoolPrefix(b).toLowerCase();
  if (strippedA && strippedA === strippedB) {
    // Only match stripped versions if at least one side lacks a SCHxxx prefix,
    // preventing SCH001-EMP-101 from colliding with SCH002-EMP-101.
    const aHasPrefix = /^sch\d+-/i.test(a);
    const bHasPrefix = /^sch\d+-/i.test(b);
    if (!aHasPrefix || !bHasPrefix) {
      return true;
    }
  }

  return (
    a.replace(/[^a-z0-9]/g, '') === b.replace(/[^a-z0-9]/g, '')
  );
}

/**
 * Generates the next sequential Student ID scoped to a school & academic session:
 * e.g., "SCH001-S-2026-1001", "SCH002-S-2026-1001"
 */
export function generateNextSchoolStudentId(
  students: Array<{ studentId?: string; admissionNo?: string }>,
  session: string,
  schoolCode: string,
  variant: 'S' | 'STU' = 'S'
): string {
  const normalizedSchool = resolveSchoolCode(schoolCode);
  const effectiveSession = (session || '2026').trim();
  const scopedPrefix = `${normalizedSchool}-${variant}-${effectiveSession}-`;
  const legacyPrefix = `${variant}-${effectiveSession}-`;

  let maxNum = 1000;
  for (const s of students || []) {
    const idStr = (s.studentId || s.admissionNo || '').trim();
    if (!idStr) continue;

    let tail = '';
    if (idStr.toUpperCase().startsWith(scopedPrefix.toUpperCase())) {
      tail = idStr.slice(scopedPrefix.length);
    } else if (idStr.toUpperCase().startsWith(legacyPrefix.toUpperCase())) {
      tail = idStr.slice(legacyPrefix.length);
    } else {
      const anyVariantRe = new RegExp(`^(?:${normalizedSchool}-)?(?:S|STU)-${effectiveSession}-(\\d+)$`, 'i');
      const m = idStr.match(anyVariantRe);
      if (m) tail = m[1];
    }

    if (tail) {
      const numPart = parseInt(tail, 10);
      if (!isNaN(numPart) && numPart > maxNum) {
        maxNum = numPart;
      }
    }
  }

  return `${scopedPrefix}${String(maxNum + 1).padStart(4, '0')}`;
}

/**
 * Generates the next sequential Staff Employee ID scoped to a school:
 * e.g., "SCH001-EMP-101", "SCH002-EMP-101"
 */
export function generateNextSchoolEmployeeId(
  staffList: Array<{ employeeId?: string }>,
  schoolCode: string
): string {
  const normalizedSchool = resolveSchoolCode(schoolCode);
  const scopedPrefix = `${normalizedSchool}-EMP-`;

  let maxNum = 100;
  for (const st of staffList || []) {
    const empId = (st.employeeId || '').trim();
    if (!empId) continue;

    let numPart = NaN;
    if (empId.toUpperCase().startsWith(scopedPrefix.toUpperCase())) {
      numPart = parseInt(empId.slice(scopedPrefix.length), 10);
    } else if (/^EMP-(\d+)$/i.test(empId)) {
      const m = empId.match(/^EMP-(\d+)$/i);
      if (m) numPart = parseInt(m[1], 10);
    }

    if (!isNaN(numPart) && numPart > maxNum) {
      maxNum = numPart;
    }
  }

  const countFloor = 100 + (staffList?.length || 0);
  const nextNum = Math.max(maxNum, countFloor) + 1;
  return `${scopedPrefix}${nextNum}`;
}
