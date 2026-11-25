import { describe, it, expect } from 'vitest';
import {
  normalizeStudentGender,
  normalizeStudentReligion,
  computeStudentDemographics,
  computeClassWiseDemographics,
  formatGenderLabel,
  formatReligionLabel,
} from '../studentDemographics';
import { Student } from '../../types';

const makeStudent = (overrides: Partial<Student>): Student => ({
  id: 'st_1',
  studentId: 'S-2026-1001',
  nameEn: 'Student One',
  nameBn: 'শিক্ষার্থী ১',
  gender: 'Male',
  dob: '2012-01-01',
  bloodGroup: 'O+',
  religion: 'Islam',
  className: 'Class 10',
  section: 'A',
  shift: 'Day',
  roll: '01',
  session: '2026',
  fatherNameEn: 'Father',
  fatherNameBn: 'পিতা',
  motherNameEn: 'Mother',
  motherNameBn: 'মাতা',
  guardianName: 'Father',
  guardianPhone: '01700000000',
  guardianRelation: 'Father',
  presentAddress: 'Dhaka',
  permanentAddress: 'Dhaka',
  status: 'active',
  admissionDate: '2026-01-01',
  ...overrides,
});

describe('studentDemographics', () => {
  it('normalizes gender variants in English and Bangla', () => {
    expect(normalizeStudentGender('Male')).toBe('male');
    expect(normalizeStudentGender('boy')).toBe('male');
    expect(normalizeStudentGender('ছাত্র')).toBe('male');
    expect(normalizeStudentGender('Female')).toBe('female');
    expect(normalizeStudentGender('girl')).toBe('female');
    expect(normalizeStudentGender('ছাত্রী')).toBe('female');
    expect(normalizeStudentGender('Other')).toBe('other');
    expect(normalizeStudentGender('')).toBe('other');
  });

  it('normalizes religion variants for Muslim, Hindu, Christian, Buddhist, and Other', () => {
    expect(normalizeStudentReligion('Islam')).toBe('islam');
    expect(normalizeStudentReligion('Muslim')).toBe('islam');
    expect(normalizeStudentReligion('মুসলিম')).toBe('islam');
    expect(normalizeStudentReligion('Hinduism')).toBe('hinduism');
    expect(normalizeStudentReligion('Hindu')).toBe('hinduism');
    expect(normalizeStudentReligion('হিন্দু')).toBe('hinduism');
    expect(normalizeStudentReligion('Christianity')).toBe('christianity');
    expect(normalizeStudentReligion('Christian')).toBe('christianity');
    expect(normalizeStudentReligion('খ্রিস্টান')).toBe('christianity');
    expect(normalizeStudentReligion('খ্রিষ্টান')).toBe('christianity');
    expect(normalizeStudentReligion('Buddhism')).toBe('buddhism');
    expect(normalizeStudentReligion('Buddhist')).toBe('buddhism');
    expect(normalizeStudentReligion('বৌদ্ধ')).toBe('buddhism');
    expect(normalizeStudentReligion('Other')).toBe('other');
  });

  it('formats labels in Bangla and English cleanly', () => {
    expect(formatGenderLabel('Male', 'bn')).toBe('ছাত্র');
    expect(formatGenderLabel('Female', 'en')).toBe('Girl');
    expect(formatReligionLabel('Christianity', 'bn')).toBe('খ্রিস্টান');
    expect(formatReligionLabel('Buddhism', 'en')).toBe('Buddhist');
  });

  it('computes accurate total, gender, and religion demographics', () => {
    const students = [
      makeStudent({ id: '1', gender: 'Male', religion: 'Islam', shift: 'Morning' }),
      makeStudent({ id: '2', gender: 'Female', religion: 'Muslim', shift: 'Day' }),
      makeStudent({ id: '3', gender: 'Female', religion: 'Hinduism', shift: 'Day' }),
      makeStudent({ id: '4', gender: 'Male', religion: 'Christianity', shift: 'Day' }),
      makeStudent({ id: '5', gender: 'Female', religion: 'Buddhism', shift: 'Morning', status: 'inactive' }),
      makeStudent({ id: '6', gender: 'Other', religion: 'Other', shift: 'Day' }),
    ];

    const stats = computeStudentDemographics(students);
    expect(stats).toEqual({
      total: 6,
      active: 5,
      male: 2,
      female: 3,
      otherGender: 1,
      islam: 2,
      hinduism: 1,
      christianity: 1,
      buddhism: 1,
      otherReligion: 1,
      morningShift: 2,
      dayShift: 4,
    });
  });

  it('groups class-wise counts in canonical class order with accurate totals', () => {
    const students = [
      makeStudent({ id: '1', className: 'Class 10', section: 'B', gender: 'Female', religion: 'Hinduism' }),
      makeStudent({ id: '2', className: 'Nursery', section: 'A', gender: 'Male', religion: 'Islam' }),
      makeStudent({ id: '3', className: 'Class 10', section: 'A', gender: 'Male', religion: 'Christianity' }),
      makeStudent({ id: '4', className: 'Class 5', section: 'A', gender: 'Female', religion: 'Buddhism' }),
    ];

    const { rows, totals } = computeClassWiseDemographics(students);
    expect(rows.map((r) => r.className)).toEqual(['Nursery', 'Class 5', 'Class 10']);

    expect(rows[2]).toMatchObject({
      className: 'Class 10',
      sections: ['A', 'B'],
      total: 2,
      male: 1,
      female: 1,
      islam: 0,
      hinduism: 1,
      christianity: 1,
      buddhism: 0,
    });

    expect(totals).toMatchObject({
      total: 4,
      male: 2,
      female: 2,
      islam: 1,
      hinduism: 1,
      christianity: 1,
      buddhism: 1,
    });
  });
});
