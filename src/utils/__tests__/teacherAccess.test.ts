import { describe, expect, it } from 'vitest';
import { isTabAuthorized } from '../../utils/permissions';
import { resolveTeacherStaffProfile } from '../../utils/teacherResolver';
import { Staff, UserProfile } from '../../types';

const teacherUser: UserProfile = {
  id: 'usr_t1',
  schoolId: 'SCH01',
  role: 'teacher',
  name: 'Karim Uddin',
  nameBn: 'করিম উদ্দিন',
  username: 'karim',
  email: 'karim@school.edu.bd',
  linkedStaffId: 'stf_1',
  permissions: {
    manageStudents: true,
    manageAttendance: true,
    manageExams: true,
    manageFees: false,
    manageRoutine: true,
    manageHomework: true,
    manageLibrary: false,
  },
};

describe('Teacher RBAC & Strict Privacy Isolation', () => {
  it('authorizes teacher for dashboard, attendance, routine, examinations, homework, and reports', () => {
    expect(isTabAuthorized('dashboard', 'teacher', teacherUser)).toBe(true);
    expect(isTabAuthorized('students', 'teacher', teacherUser)).toBe(true);
    expect(isTabAuthorized('attendance', 'teacher', teacherUser)).toBe(true);
    expect(isTabAuthorized('routine', 'teacher', teacherUser)).toBe(true);
    expect(isTabAuthorized('examinations', 'teacher', teacherUser)).toBe(true);
    expect(isTabAuthorized('homework', 'teacher', teacherUser)).toBe(true);
    expect(isTabAuthorized('reports', 'teacher', teacherUser)).toBe(true);
    expect(isTabAuthorized('analytics', 'teacher', teacherUser)).toBe(true);
    expect(isTabAuthorized('notices', 'teacher', teacherUser)).toBe(true);
  });

  it('blocks teacher from fees, staff payroll, settings, master portal, qr kiosk, and certificates', () => {
    expect(isTabAuthorized('fees', 'teacher', teacherUser)).toBe(false);
    expect(isTabAuthorized('staff', 'teacher', teacherUser)).toBe(false);
    expect(isTabAuthorized('settings', 'teacher', teacherUser)).toBe(false);
    expect(isTabAuthorized('master_portal', 'teacher', teacherUser)).toBe(false);
    expect(isTabAuthorized('qr_attendance', 'teacher', teacherUser)).toBe(false);
    expect(isTabAuthorized('certificates', 'teacher', teacherUser)).toBe(false);
    expect(isTabAuthorized('blog', 'teacher', teacherUser)).toBe(false);
  });

  it('resolves strictly ONLY the logged-in teacher staff record with no fallback', () => {
    const staffList: Staff[] = [
      {
        id: 'stf_other',
        schoolId: 'SCH01',
        employeeId: 'EMP002',
        nameEn: 'Other Teacher',
        nameBn: 'অন্য শিক্ষক',
        gender: 'Male',
        designation: 'Teacher',
        department: 'Science',
        role: 'teacher',
        phone: '01700000002',
        email: 'other@school.edu.bd',
        qualification: 'B.Sc',
        joiningDate: '2022-01-01',
        basicSalary: 20000,
        houseRentAllowance: 0,
        medicalAllowance: 0,
        otherAllowance: 0,
        providentFundDeduction: 0,
        status: 'active',
      },
      {
        id: 'stf_1',
        schoolId: 'SCH01',
        employeeId: 'EMP001',
        nameEn: 'Karim Uddin',
        nameBn: 'করিম উদ্দিন',
        gender: 'Male',
        designation: 'Senior Teacher',
        department: 'Mathematics',
        role: 'teacher',
        phone: '01700000001',
        email: 'karim@school.edu.bd',
        qualification: 'M.Sc',
        joiningDate: '2020-01-01',
        basicSalary: 25000,
        houseRentAllowance: 0,
        medicalAllowance: 0,
        otherAllowance: 0,
        providentFundDeduction: 0,
        status: 'active',
      },
    ];

    const matched = resolveTeacherStaffProfile(teacherUser, staffList);
    expect(matched?.id).toBe('stf_1');

    const unlinkedTeacher: UserProfile = {
      id: 'usr_unlinked',
      schoolId: 'SCH01',
      role: 'teacher',
      name: 'Unlinked Teacher',
      nameBn: 'আনলিংকড শিক্ষক',
      username: 'unknown_user',
      email: 'unknown@school.edu.bd',
    };
    expect(resolveTeacherStaffProfile(unlinkedTeacher, staffList)).toBeNull();
  });
});
