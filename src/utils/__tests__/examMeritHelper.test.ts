import { describe, it, expect } from 'vitest';
import {
  computeSingleExamStudentMeritRank,
  formatBnOrdinal,
  formatEnOrdinal,
} from '../examMeritHelper';
import { MarksEntry, Student, Subject } from '../../types';

const makeStudent = (id: string, roll: string, section = 'A'): Student => ({
  id,
  studentId: `S-2026-${id}`,
  nameEn: `Student ${id}`,
  nameBn: `শিক্ষার্থী ${id}`,
  gender: 'Female',
  dob: '2010-01-01',
  bloodGroup: 'A+',
  religion: 'Islam',
  className: 'Class 10',
  section,
  shift: 'Day',
  group: 'Science',
  roll,
  session: '2026',
  fatherNameEn: 'Father',
  fatherNameBn: 'পিতা',
  motherNameEn: 'Mother',
  motherNameBn: 'মাতা',
  guardianName: 'Guardian',
  guardianPhone: '01700000000',
  guardianRelation: 'Father',
  presentAddress: 'Dhaka',
  permanentAddress: 'Dhaka',
  status: 'active',
  admissionDate: '2026-01-01',
});

const subjects: Subject[] = [
  {
    id: 'sub1',
    code: '101',
    nameEn: 'Bangla',
    nameBn: 'বাংলা',
    className: 'Class 10',
    fullMarks: 100,
    passMarks: 33,
    writtenMarks: 70,
    mcqMarks: 30,
  },
  {
    id: 'sub2',
    code: '107',
    nameEn: 'English',
    nameBn: 'ইংরেজি',
    className: 'Class 10',
    fullMarks: 100,
    passMarks: 33,
    writtenMarks: 100,
  },
];

const makeMark = (
  studentId: string,
  subjectId: string,
  total: number,
  grade: MarksEntry['grade'],
  gpa: number
): MarksEntry => ({
  id: `${studentId}_${subjectId}`,
  examId: 'ex_1',
  studentId,
  className: 'Class 10',
  subjectId,
  subjectName: subjectId,
  written: total,
  mcq: 0,
  practical: 0,
  total,
  grade,
  gpa,
});

describe('examMeritHelper', () => {
  it('formats Bengali and English ordinals accurately', () => {
    expect(formatBnOrdinal(1)).toBe('১ম');
    expect(formatBnOrdinal(2)).toBe('২য়');
    expect(formatBnOrdinal(3)).toBe('৩য়');
    expect(formatBnOrdinal(4)).toBe('৪র্থ');
    expect(formatBnOrdinal(5)).toBe('৫ম');
    expect(formatBnOrdinal(11)).toBe('১১তম');

    expect(formatEnOrdinal(1)).toBe('1st');
    expect(formatEnOrdinal(2)).toBe('2nd');
    expect(formatEnOrdinal(3)).toBe('3rd');
    expect(formatEnOrdinal(4)).toBe('4th');
    expect(formatEnOrdinal(11)).toBe('11th');
    expect(formatEnOrdinal(21)).toBe('21st');
  });

  it('ranks passing student within class and section using GPA -> total marks -> roll tie-breaker', () => {
    const s1 = makeStudent('s1', '01', 'A'); // GPA 5.00, total 170 -> 2nd in class & 2nd in A
    const s2 = makeStudent('s2', '02', 'B'); // GPA 5.00, total 180 -> 1st in class & 1st in B
    const s3 = makeStudent('s3', '03', 'A'); // GPA 5.00, total 170 -> ties s1 on GPA & marks, loses on roll -> 3rd in class
    const s4 = makeStudent('s4', '04', 'A'); // Failed one subject -> unranked

    const marks: MarksEntry[] = [
      makeMark('s1', 'sub1', 85, 'A+', 5.0),
      makeMark('s1', 'sub2', 85, 'A+', 5.0),

      makeMark('s2', 'sub1', 90, 'A+', 5.0),
      makeMark('s2', 'sub2', 90, 'A+', 5.0),

      makeMark('s3', 'sub1', 85, 'A+', 5.0),
      makeMark('s3', 'sub2', 85, 'A+', 5.0),

      makeMark('s4', 'sub1', 95, 'A+', 5.0),
      makeMark('s4', 'sub2', 20, 'F', 0.0),
    ];

    const getMark = (stdId: string, subId: string) =>
      marks.find((m) => m.studentId === stdId && m.subjectId === subId);

    const s1Rank = computeSingleExamStudentMeritRank({
      targetStudent: s1,
      classStudents: [s1, s2, s3, s4],
      classSubjects: subjects,
      getSubjectsForStudent: (_, subs) => subs,
      getStudentMarkForSubject: getMark,
    });

    expect(s1Rank).toMatchObject({
      status: 'passed',
      classRank: 2,
      classPassedCount: 3,
      classTotalStudents: 4,
      sectionRank: 1,
      sectionPassedCount: 2,
      sectionTotalStudents: 3,
      totalObtained: 170,
      gpa: 5.0,
      overallGrade: 'A+',
    });

    const s3Rank = computeSingleExamStudentMeritRank({
      targetStudent: s3,
      classStudents: [s1, s2, s3, s4],
      classSubjects: subjects,
      getSubjectsForStudent: (_, subs) => subs,
      getStudentMarkForSubject: getMark,
    });
    expect(s3Rank.classRank).toBe(3);
    expect(s3Rank.sectionRank).toBe(2);

    const s4Rank = computeSingleExamStudentMeritRank({
      targetStudent: s4,
      classStudents: [s1, s2, s3, s4],
      classSubjects: subjects,
      getSubjectsForStudent: (_, subs) => subs,
      getStudentMarkForSubject: getMark,
    });
    expect(s4Rank.status).toBe('failed');
    expect(s4Rank.classRank).toBeNull();
    expect(s4Rank.sectionRank).toBeNull();
  });

  it('returns pending status when no marks are entered for the target student', () => {
    const s1 = makeStudent('s1', '01', 'A');
    const result = computeSingleExamStudentMeritRank({
      targetStudent: s1,
      classStudents: [s1],
      classSubjects: subjects,
      getSubjectsForStudent: (_, subs) => subs,
      getStudentMarkForSubject: () => undefined,
    });
    expect(result.status).toBe('pending');
    expect(result.classRank).toBeNull();
  });
});
