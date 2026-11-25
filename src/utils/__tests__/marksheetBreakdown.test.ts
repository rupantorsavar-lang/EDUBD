import { describe, it, expect } from 'vitest';
import { getMarksheetRowBreakdown, findSubjectForMark } from '../marksheetBreakdown';
import { Subject, MarksEntry } from '../../types';

describe('marksheetBreakdown', () => {
  it('keeps Written (CQ), MCQ, and Practical strictly separate for Physics (136)', () => {
    const physics: Partial<Subject> = {
      fullMarks: 100,
      writtenMarks: 50,
      mcqMarks: 25,
      practicalMarks: 25,
    };
    const mark: Partial<MarksEntry> = {
      written: 55,
      mcq: 20,
      practical: 20,
      total: 95,
    };

    const breakdown = getMarksheetRowBreakdown(mark, physics);
    expect(breakdown.fullMarks).toBe(100);
    expect(breakdown.written).toBe(55);
    expect(breakdown.mcq).toBe(20);
    expect(breakdown.practical).toBe(20);
    expect(breakdown.total).toBe(95);
    expect(breakdown.hasWritten).toBe(true);
    expect(breakdown.hasMcq).toBe(true);
    expect(breakdown.hasPractical).toBe(true);
  });

  it('marks hasPractical as false for non-practical subjects like Bangla (101)', () => {
    const bangla: Partial<Subject> = {
      fullMarks: 100,
      writtenMarks: 70,
      mcqMarks: 30,
    };
    const mark: Partial<MarksEntry> = {
      written: 55,
      mcq: 26,
      practical: 0,
      total: 81,
    };

    const breakdown = getMarksheetRowBreakdown(mark, bangla);
    expect(breakdown.written).toBe(55);
    expect(breakdown.mcq).toBe(26);
    expect(breakdown.practical).toBe(0);
    expect(breakdown.total).toBe(81);
    expect(breakdown.hasMcq).toBe(true);
    expect(breakdown.hasPractical).toBe(false);
  });

  it('handles Written + Practical subjects without MCQ (ICT 154, fullMarks 50)', () => {
    const ict: Partial<Subject> = {
      fullMarks: 50,
      writtenMarks: 25,
      practicalMarks: 25,
    };
    const mark: Partial<MarksEntry> = {
      written: 22,
      mcq: 0,
      practical: 24,
      total: 46,
    };

    const breakdown = getMarksheetRowBreakdown(mark, ict);
    expect(breakdown.fullMarks).toBe(50);
    expect(breakdown.written).toBe(22);
    expect(breakdown.mcq).toBe(0);
    expect(breakdown.practical).toBe(24);
    expect(breakdown.total).toBe(46);
    expect(breakdown.hasWritten).toBe(true);
    expect(breakdown.hasMcq).toBe(false);
    expect(breakdown.hasPractical).toBe(true);
  });

  it('keeps hasPractical true when subject defines practicalMarks and student scored 0', () => {
    const physics: Partial<Subject> = {
      fullMarks: 100,
      writtenMarks: 50,
      mcqMarks: 25,
      practicalMarks: 25,
    };
    const mark: Partial<MarksEntry> = {
      written: 40,
      mcq: 15,
      practical: 0,
      total: 55,
    };

    const breakdown = getMarksheetRowBreakdown(mark, physics);
    expect(breakdown.hasPractical).toBe(true);
    expect(breakdown.practical).toBe(0);
    expect(breakdown.mcq).toBe(15);
  });

  it('finds matching subject by ID first and falls back to className + name', () => {
    const subjects: Subject[] = [
      {
        id: 'sub_10_phy',
        code: '136',
        nameEn: 'Physics',
        nameBn: 'পদার্থবিজ্ঞান',
        className: 'Class 10',
        group: 'Science',
        fullMarks: 100,
        passMarks: 33,
        writtenMarks: 50,
        mcqMarks: 25,
        practicalMarks: 25,
      },
      {
        id: 'sub_9_phy',
        code: '136',
        nameEn: 'Physics',
        nameBn: 'পদার্থবিজ্ঞান',
        className: 'Class 9',
        group: 'Science',
        fullMarks: 100,
        passMarks: 33,
        writtenMarks: 50,
        mcqMarks: 25,
        practicalMarks: 25,
      },
    ];

    const byId = findSubjectForMark(
      subjects,
      { subjectId: 'sub_10_phy', subjectName: 'Physics', className: 'Class 10' },
      'Class 10'
    );
    expect(byId?.id).toBe('sub_10_phy');

    const byFallback = findSubjectForMark(
      subjects,
      { subjectId: 'legacy_phy', subjectName: 'Physics' },
      'Class 10'
    );
    expect(byFallback?.id).toBe('sub_10_phy');
  });
});
