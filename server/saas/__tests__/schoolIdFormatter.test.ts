import { describe, it, expect } from 'vitest';
import {
  resolveSchoolCode,
  formatSchoolScopedId,
  generateNextSchoolStudentId,
  generateNextSchoolEmployeeId,
  isMatchingScopedId,
} from '../../../src/utils/schoolIdFormatter';

describe('School-Scoped Student & Staff ID Utilities', () => {
  it('resolves distinct school IDs (SCH001 vs SCH002) with proper precedence', () => {
    expect(resolveSchoolCode('SCH002', { id: 'SCH001', schoolCode: 'IMSC' })).toBe('SCH002');
    expect(resolveSchoolCode(undefined, { id: 'SCH003' })).toBe('SCH003');
    expect(resolveSchoolCode(undefined, { id: 'school_main', schoolCode: 'SCH004' })).toBe('SCH004');
    expect(resolveSchoolCode(undefined, { id: 'school_main', schoolCode: 'IMSC-2026' })).toBe('SCH001');
  });

  it('generates separate sequential Student IDs for SCH001 and SCH002', () => {
    const sch1Students = [
      { studentId: 'SCH001-S-2026-1001' },
      { studentId: 'SCH001-S-2026-1002' },
    ];
    const sch2Students: Array<{ studentId?: string }> = [];

    expect(generateNextSchoolStudentId(sch1Students, '2026', 'SCH001')).toBe('SCH001-S-2026-1003');
    expect(generateNextSchoolStudentId(sch2Students, '2026', 'SCH002')).toBe('SCH002-S-2026-1001');
    expect(generateNextSchoolStudentId(sch2Students, '2027', 'SCH002', 'STU')).toBe('SCH002-STU-2027-1001');
  });

  it('generates separate sequential Staff Employee IDs for SCH001 and SCH002', () => {
    const sch1Staff = [{ employeeId: 'SCH001-EMP-101' }, { employeeId: 'SCH001-EMP-102' }];
    const sch2Staff = [{ employeeId: 'EMP-101' }];

    expect(generateNextSchoolEmployeeId(sch1Staff, 'SCH001')).toBe('SCH001-EMP-103');
    expect(generateNextSchoolEmployeeId(sch2Staff, 'SCH002')).toBe('SCH002-EMP-102');
    expect(generateNextSchoolEmployeeId([], 'SCH002')).toBe('SCH002-EMP-101');
  });

  it('formats legacy IDs with school prefix without double-prefixing already scoped IDs', () => {
    expect(formatSchoolScopedId('EMP-101', 'SCH002')).toBe('SCH002-EMP-101');
    expect(formatSchoolScopedId('SCH002-EMP-101', 'SCH002')).toBe('SCH002-EMP-101');
    expect(formatSchoolScopedId('SCH001-S-2026-1001', 'SCH002')).toBe('SCH001-S-2026-1001');
    expect(formatSchoolScopedId('S-2026-1005', 'SCH001')).toBe('SCH001-S-2026-1005');
  });

  it('matches legacy IDs cleanly while preventing SCH001 vs SCH002 ID collision', () => {
    expect(isMatchingScopedId('SCH002-EMP-101', 'SCH002-EMP-101')).toBe(true);
    expect(isMatchingScopedId('EMP-101', 'SCH002-EMP-101')).toBe(true);
    expect(isMatchingScopedId('SCH001-EMP-101', 'SCH002-EMP-101')).toBe(false);
    expect(isMatchingScopedId('SCH001-S-2026-1001', 'SCH002-S-2026-1001')).toBe(false);
  });
});
