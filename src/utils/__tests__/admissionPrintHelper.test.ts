import { describe, it, expect } from 'vitest';
import {
  formatRecordDate,
  buildStudentAdmissionPrintHtml,
  buildStaffJoiningPrintHtml,
} from '../admissionPrintHelper';
import { SchoolProfile, Staff, Student } from '../../types';

const mockSchool: Partial<SchoolProfile> = {
  schoolCode: 'SCH003',
  nameBn: 'ঢাকা মডেল স্কুল',
  nameEn: 'Dhaka Model School',
  eiin: '108245',
  addressBn: 'মিরপুর-১০, ঢাকা',
  phone: '01700000000',
  currentSession: '2026',
  principalNameEn: 'Prof. Rafiqul Islam',
};

const mockStudent: Student = {
  id: 'std_1',
  studentId: 'SCH003-S-2026-1001',
  admissionNo: 'SCH003-S-2026-1001',
  nameEn: 'Hiya Akhter',
  nameBn: 'হিয়া আক্তার',
  gender: 'Female',
  dob: '2012-05-10',
  bloodGroup: 'B+',
  religion: 'Islam',
  className: 'Class 10',
  section: 'A',
  shift: 'Day',
  group: 'Science',
  roll: '01',
  session: '2026',
  fatherNameEn: 'Habibur Rahman',
  fatherNameBn: 'হাবিবুর রহমান',
  motherNameEn: 'Josna',
  motherNameBn: 'জোসনা',
  guardianName: 'Habibur Rahman',
  guardianPhone: '01987541232',
  guardianRelation: 'Father',
  presentAddress: 'Arapara, Savar, Dhaka',
  permanentAddress: 'Arapara, Savar, Dhaka',
  birthCertificateNo: '20121234567890123',
  status: 'active',
  admissionDate: '2026-01-15',
};

const mockStaff: Staff = {
  id: 'st_1',
  employeeId: 'SCH003-EMP-101',
  nameEn: 'Md. Abdul Karim',
  nameBn: 'মোঃ আব্দুল করিম',
  gender: 'Male',
  designation: 'Senior Assistant Teacher',
  department: 'Science',
  role: 'teacher',
  email: 'karim@school.edu.bd',
  phone: '01711223344',
  qualification: 'M.Sc in Physics, B.Ed',
  subject: 'Physics',
  joiningDate: '2022-03-10',
  basicSalary: 35000,
  houseRentAllowance: 10000,
  medicalAllowance: 2500,
  otherAllowance: 1500,
  providentFundDeduction: 3500,
  status: 'active',
  assignedClasses: ['Class 9', 'Class 10'],
};

describe('admissionPrintHelper', () => {
  it('formats ISO record dates cleanly in English and Bangla', () => {
    expect(formatRecordDate('2026-01-15', 'en')).toBe('15 Jan 2026');
    expect(formatRecordDate('2026-01-15', 'bn')).toBe('১৫ জানু ২০২৬');
    expect(formatRecordDate('', 'en')).toBe('Not specified');
    expect(formatRecordDate(undefined, 'bn')).toBe('উল্লেখ নেই');
  });

  it('builds Student Admission Print HTML with admissionDate, student details, and XSS protection', () => {
    const html = buildStudentAdmissionPrintHtml({
      student: {
        ...mockStudent,
        nameEn: '<script>alert(1)</script>Hiya',
        photoUrl: 'javascript:alert(2)',
      },
      school: {
        ...mockSchool,
        logoUrl: 'data:text/html,<script>alert(3)</script>',
      },
      schoolCode: 'SCH003',
      language: 'en',
    });

    expect(html).toContain('15 Jan 2026');
    expect(html).toContain('SCH003-S-2026-1001');
    expect(html).toContain('STUDENT ADMISSION FORM');
    expect(html).toContain('Class 10 (A)');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;Hiya');
    expect(html).not.toContain('javascript:alert(2)');
    expect(html).not.toContain('data:text/html');
  });

  it('builds Staff Joining Print HTML with joiningDate, staff details, and XSS protection', () => {
    const html = buildStaffJoiningPrintHtml({
      staff: {
        ...mockStaff,
        designation: '<img src=x onerror=alert(1)>Teacher',
        photoUrl: 'https://example.com/photo.jpg" onclick="alert(1)',
      },
      school: mockSchool,
      schoolCode: 'SCH003',
      language: 'bn',
    });

    expect(html).toContain('১০ মার্চ ২০২২');
    expect(html).toContain('SCH003-EMP-101');
    expect(html).toContain('TEACHER / STAFF JOINING');
    expect(html).toContain('Class 9, Class 10');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;Teacher');
    expect(html).not.toContain('onclick="alert(1)');
  });
});
