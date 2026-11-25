import { describe, expect, it } from 'vitest';
import { Exam, MarksEntry, SchoolProfile, Student, Subject } from '../../types';
import { computeClassExamMeritMap, computeSingleExamStudentMeritRank } from '../examMeritHelper';
import {
  buildMarksheetsPrintableHtml,
  formatMeritSummaryTexts,
  formatParentDisplayName,
  formatSubjectDisplayName,
  getMarksheetTexts,
} from '../marksheetLocale';

const mockSchool: SchoolProfile = {
  id: 'sch_1',
  nameEn: 'Dhaka Model School and College',
  nameBn: 'ঢাকা মডেল স্কুল এন্ড কলেজ',
  eiin: 'SCH001',
  schoolCode: 'SCH003',
  addressEn: 'Mirpur-10, Dhaka',
  addressBn: 'মিরপুর-১০, ঢাকা',
  phone: '01700000000',
  email: 'info@school.edu.bd',
  website: 'https://school.edu.bd',
  principalNameEn: 'Pro. MD Rafiqul Islam',
  principalNameBn: 'প্রফেসর মো: রফিকুল ইসলাম',
  establishedYear: '2026',
  currentSession: '2026',
  currencySymbol: '৳',
  timezone: 'Asia/Dhaka',
};

const mockExam: Exam = {
  id: 'ex_1',
  nameEn: '3rd Model Test Examination',
  nameBn: '৩য় মডেল টেস্ট পরীক্ষা',
  term: 'model_test',
  session: '2026',
  startDate: '2026-10-01',
  endDate: '2026-10-15',
  isPublished: true,
  applicableClasses: ['Class 10'],
};

const mockSubjects: Subject[] = [
  {
    id: 'sub_bn',
    code: '101',
    nameEn: 'Bangla 1st & 2nd Paper',
    nameBn: 'বাংলা ১ম ও ২য় পত্র',
    className: 'Class 10',
    fullMarks: 100,
    passMarks: 33,
    writtenMarks: 70,
    mcqMarks: 30,
  },
  {
    id: 'sub_en',
    code: '107',
    nameEn: 'English 1st & 2nd Paper',
    nameBn: 'ইংরেজি ১ম ও ২য় পত্র',
    className: 'Class 10',
    fullMarks: 100,
    passMarks: 33,
    writtenMarks: 100,
  },
];

function makeStudent(id: string, roll: string, section: string, overrides: Partial<Student> = {}): Student {
  return {
    id,
    studentId: `SCH003-S-2026-${roll}`,
    nameEn: `Student ${roll}`,
    nameBn: `শিক্ষার্থী ${roll}`,
    gender: 'Female',
    dob: '2010-01-01',
    bloodGroup: 'A+',
    religion: 'Islam',
    className: 'Class 10',
    section,
    shift: 'Morning',
    group: 'Science',
    roll,
    session: '2026',
    fatherNameEn: `Father ${roll}`,
    fatherNameBn: `পিতা ${roll}`,
    motherNameEn: `Mother ${roll}`,
    motherNameBn: `মাতা ${roll}`,
    guardianName: `Father ${roll}`,
    guardianPhone: '01711111111',
    guardianRelation: 'Father',
    presentAddress: 'Dhaka',
    permanentAddress: 'Dhaka',
    status: 'active',
    admissionDate: '2026-01-01',
    ...overrides,
  };
}

describe('marksheetLocale & bulk merit helpers', () => {
  it('computes identical class and section merit ranks in O(N) bulk map as single-student helper', () => {
    const students = [
      makeStudent('s1', '01', 'A'),
      makeStudent('s2', '02', 'A'),
      makeStudent('s3', '03', 'B'),
    ];

    const marks: Record<string, MarksEntry> = {
      's1:sub_bn': {
        id: 'm1', examId: 'ex_1', studentId: 's1', className: 'Class 10', subjectId: 'sub_bn',
        subjectName: 'Bangla', written: 60, mcq: 25, practical: 0, total: 85, grade: 'A+', gpa: 5.0,
      },
      's1:sub_en': {
        id: 'm2', examId: 'ex_1', studentId: 's1', className: 'Class 10', subjectId: 'sub_en',
        subjectName: 'English', written: 75, mcq: 0, practical: 0, total: 75, grade: 'A', gpa: 4.0,
      },
      's2:sub_bn': {
        id: 'm3', examId: 'ex_1', studentId: 's2', className: 'Class 10', subjectId: 'sub_bn',
        subjectName: 'Bangla', written: 15, mcq: 5, practical: 0, total: 20, grade: 'F', gpa: 0.0,
      },
      's3:sub_bn': {
        id: 'm4', examId: 'ex_1', studentId: 's3', className: 'Class 10', subjectId: 'sub_bn',
        subjectName: 'Bangla', written: 65, mcq: 25, practical: 0, total: 90, grade: 'A+', gpa: 5.0,
      },
      's3:sub_en': {
        id: 'm5', examId: 'ex_1', studentId: 's3', className: 'Class 10', subjectId: 'sub_en',
        subjectName: 'English', written: 82, mcq: 0, practical: 0, total: 82, grade: 'A+', gpa: 5.0,
      },
    };

    const getMark = (sid: string, subId: string) => marks[`${sid}:${subId}`];
    const getSubs = (_std: Student, subs: Subject[]) => subs;

    const bulkMap = computeClassExamMeritMap({
      classStudents: students,
      classSubjects: mockSubjects,
      getSubjectsForStudent: getSubs,
      getStudentMarkForSubject: getMark,
    });

    for (const st of students) {
      const single = computeSingleExamStudentMeritRank({
        targetStudent: st,
        classStudents: students,
        classSubjects: mockSubjects,
        getSubjectsForStudent: getSubs,
        getStudentMarkForSubject: getMark,
      });
      expect(bulkMap.get(st.id)).toEqual(single);
    }

    expect(bulkMap.get('s3')?.classRank).toBe(1);
    expect(bulkMap.get('s1')?.classRank).toBe(2);
    expect(bulkMap.get('s2')?.status).toBe('failed');
  });

  it('formats labels and subjects accurately across bn, bilingual, and en modes', () => {
    const enTexts = getMarksheetTexts('en', mockExam, '2026');
    const biTexts = getMarksheetTexts('bilingual', mockExam, '2026');
    const bnTexts = getMarksheetTexts('bn', mockExam, '2026');

    expect(enTexts.colSubject).toBe('Subject');
    expect(enTexts.classTeacherSig).toBe('Class Teacher Signature');
    expect(biTexts.colSubject).toContain('বিষয়');
    expect(biTexts.colSubject).toContain('Subject');
    expect(bnTexts.colFullMarks).toBe('পূর্ণমান');

    expect(formatSubjectDisplayName(mockSubjects[0], 'en')).toEqual({
      primary: 'Bangla 1st & 2nd Paper',
    });
    expect(formatSubjectDisplayName(mockSubjects[0], 'bilingual')).toEqual({
      primary: 'বাংলা ১ম ও ২য় পত্র',
      secondary: 'Bangla 1st & 2nd Paper',
    });
    expect(formatParentDisplayName('হাবিবুর রহমান', 'Habibur Rahman', 'bilingual')).toBe(
      'হাবিবুর রহমান (Habibur Rahman)'
    );
    expect(formatParentDisplayName('হাবিবুর রহমান', 'Habibur Rahman', 'en')).toBe('Habibur Rahman');

    const meritSummary = formatMeritSummaryTexts(
      {
        status: 'passed',
        classRank: 1,
        classPassedCount: 5,
        classTotalStudents: 6,
        sectionRank: 1,
        sectionPassedCount: 3,
        sectionTotalStudents: 4,
        totalObtained: 172,
        totalFullMarks: 200,
        gpa: 5.0,
        overallGrade: 'A+',
        failedCount: 0,
      },
      'A',
      'bilingual'
    );
    expect(meritSummary.rankText).toContain('1st in Class');
    expect(meritSummary.rankText).toContain('১ম স্থান');
  });

  it('builds whole-class printable HTML with A4 page breaks between students and escaped XSS strings', () => {
    const students = [
      makeStudent('s1', '01', 'A', { nameEn: 'Hiya <script>alert(1)</script>', nameBn: 'হিয়া আক্তার' }),
      makeStudent('s2', '02', 'A', { nameEn: 'Nadia Islam', nameBn: 'নাদিয়া ইসলাম' }),
    ];

    const meritMap = computeClassExamMeritMap({
      classStudents: students,
      classSubjects: mockSubjects,
      getSubjectsForStudent: (_s, subs) => subs,
      getStudentMarkForSubject: () => undefined,
    });

    const html = buildMarksheetsPrintableHtml({
      studentsToRender: students,
      school: mockSchool,
      defaultLogoUrl: '/logo.png',
      exam: mockExam,
      classSubjects: mockSubjects,
      staffList: [],
      langMode: 'bilingual',
      getSubjectsForStudent: (_s, subs) => subs,
      getStudentMarkForSubject: () => undefined,
      meritMap,
      title: 'Class 10 - All Marksheets',
    });

    expect(html).toContain('class="sheet page-break"');
    expect(html).toContain('class="sheet"');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('Bangla 1st &amp; 2nd Paper');
    expect(html).toContain('বাংলা ১ম ও ২য় পত্র');
  });
});
