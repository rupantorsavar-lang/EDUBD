import { describe, expect, it } from 'vitest';
import { Staff, Student } from '../../types';
import { filterStaffByQuery, filterStudentsByQuery } from '../personSearchFilter';

function makeStudent(idx: number, overrides: Partial<Student> = {}): Student {
  return {
    id: `doc-stu-${idx}`,
    studentId: `SCH003-S-2026-${String(idx).padStart(4, '0')}`,
    nameEn: `Student Name ${idx}`,
    nameBn: `শিক্ষার্থী ${idx}`,
    gender: idx % 2 === 0 ? 'Female' : 'Male',
    dob: '2012-01-01',
    bloodGroup: 'O+',
    religion: 'Islam',
    className: idx % 2 === 0 ? 'Class 10' : 'Class 9',
    section: idx % 3 === 0 ? 'B' : 'A',
    shift: 'Morning',
    roll: String(idx),
    session: '2026',
    fatherNameEn: `Father ${idx}`,
    fatherNameBn: `পিতা ${idx}`,
    motherNameEn: `Mother ${idx}`,
    motherNameBn: `মাতা ${idx}`,
    guardianName: `Guardian ${idx}`,
    guardianPhone: `0170000${String(idx).padStart(4, '0')}`,
    guardianRelation: 'Father',
    presentAddress: 'Dhaka',
    permanentAddress: 'Dhaka',
    status: 'active',
    admissionDate: '2026-01-01',
    phone: `0180000${String(idx).padStart(4, '0')}`,
    ...overrides,
  };
}

function makeStaff(idx: number, overrides: Partial<Staff> = {}): Staff {
  return {
    id: `doc-stf-${idx}`,
    employeeId: `T-${100 + idx}`,
    nameEn: `Teacher ${idx}`,
    nameBn: `শিক্ষক ${idx}`,
    gender: 'Male',
    designation: 'Assistant Teacher',
    department: 'Science',
    role: 'teacher',
    email: `teacher${idx}@school.edu.bd`,
    phone: `0191100${String(idx).padStart(4, '0')}`,
    qualification: 'M.Sc',
    joiningDate: '2024-01-01',
    basicSalary: 20000,
    houseRentAllowance: 5000,
    medicalAllowance: 1500,
    otherAllowance: 500,
    providentFundDeduction: 1000,
    status: 'active',
    ...overrides,
  };
}

describe('personSearchFilter', () => {
  it('caps large 1200-student list efficiently when query is empty', () => {
    const students = Array.from({ length: 1200 }, (_, i) => makeStudent(i + 1));
    const res = filterStudentsByQuery(students, '', 60);

    expect(res.totalMatches).toBe(1200);
    expect(res.items).toHaveLength(60);
    expect(res.hasMore).toBe(true);
  });

  it('finds student among 1200 records by Bangla name, English name, ID, and phone', () => {
    const students = Array.from({ length: 1200 }, (_, i) => makeStudent(i + 1));
    students[999] = makeStudent(1000, {
      nameEn: 'Hiya Akter',
      nameBn: 'হিয়া আক্তার',
      studentId: 'SCH003-S-2026-1000',
      guardianName: 'Habibur Rahman',
      guardianPhone: '01987541232',
    });

    expect(filterStudentsByQuery(students, 'হিয়া').items[0].id).toBe('doc-stu-1000');
    expect(filterStudentsByQuery(students, 'Hiya').items[0].id).toBe('doc-stu-1000');
    expect(filterStudentsByQuery(students, 'SCH003-S-2026-1000').items[0].id).toBe('doc-stu-1000');
    expect(filterStudentsByQuery(students, '01987541232').items[0].id).toBe('doc-stu-1000');
    expect(filterStudentsByQuery(students, 'Habibur').items[0].id).toBe('doc-stu-1000');
  });

  it('normalizes Bangla numerals and prioritizes exact roll matches', () => {
    const students = [
      makeStudent(10, { roll: '10', nameEn: 'Ten' }),
      makeStudent(100, { roll: '100', nameEn: 'Hundred' }),
      makeStudent(1, { roll: '1', nameEn: 'One' }),
    ];

    const resEn = filterStudentsByQuery(students, '1');
    expect(resEn.items[0].id).toBe('doc-stu-1');

    const resBn = filterStudentsByQuery(students, '১');
    expect(resBn.items[0].id).toBe('doc-stu-1');
  });

  it('supports multi-token search across class, section, and name', () => {
    const students = [
      makeStudent(1, { nameEn: 'Karim', className: 'Class 8', section: 'A', roll: '5' }),
      makeStudent(2, { nameEn: 'Karim', className: 'Class 10', section: 'B', roll: '5' }),
    ];

    const res = filterStudentsByQuery(students, 'Karim 10 B');
    expect(res.totalMatches).toBe(1);
    expect(res.items[0].id).toBe('doc-stu-2');
  });

  it('searches staff by English/Bangla name, employeeId, role, designation, and phone', () => {
    const staff = Array.from({ length: 150 }, (_, i) => makeStaff(i + 1));
    staff[120] = makeStaff(121, {
      employeeId: 'ACC-202',
      nameEn: 'Safiqul Islam',
      nameBn: 'শফিকুল ইসলাম',
      designation: 'Senior Accountant',
      role: 'accountant',
      phone: '01942529984',
    });

    expect(filterStaffByQuery(staff, 'ACC-202').items[0].id).toBe('doc-stf-121');
    expect(filterStaffByQuery(staff, 'শফিকুল').items[0].id).toBe('doc-stf-121');
    expect(filterStaffByQuery(staff, 'Senior Accountant').items[0].id).toBe('doc-stf-121');
    expect(filterStaffByQuery(staff, '01942529984').items[0].id).toBe('doc-stf-121');
    expect(filterStaffByQuery(staff, 'accountant 0194').items[0].id).toBe('doc-stf-121');
  });
});
