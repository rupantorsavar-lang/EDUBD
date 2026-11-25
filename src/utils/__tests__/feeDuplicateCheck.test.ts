import { describe, it, expect } from 'vitest';
import { FeeInvoice } from '../../types';
import { findDuplicatePaidFee } from '../feeDuplicateCheck';

const makeClass10Presets = () => [
  { id: 'admission', nameEn: 'Admission Fee', nameBn: 'নতুন ভর্তি ফি' },
  { id: 'tuition', nameEn: 'Monthly Tuition Fee', nameBn: 'মাসিক বেতন' },
  { id: 'session', nameEn: 'Session Charge', nameBn: 'বাৎসরিক সেশন ফি' },
  { id: 'exam_mt1', nameEn: '1st Model Test Fee', nameBn: '১ম মডেল টেস্ট ফি' },
  { id: 'exam_sem1', nameEn: '1st Semester Exam Fee', nameBn: '১ম সেমিস্টার পরীক্ষা ফি' },
  { id: 'exam_mt2', nameEn: '2nd Model Test Fee', nameBn: '২য় মডেল টেস্ট ফি' },
  { id: 'exam_sem2', nameEn: '2nd Semester Exam Fee', nameBn: '২য় সেমিস্টার পরীক্ষা ফি' },
  { id: 'exam_mt3', nameEn: '3rd Model Test Fee', nameBn: '৩য় মডেল টেস্ট ফি' },
  { id: 'exam_sem3', nameEn: '3rd Semester Exam Fee', nameBn: '৩য় সেমিস্টার পরীক্ষা ফি' },
  { id: 'transport', nameEn: 'Transport Bus Fee', nameBn: 'পরিবহন বাস ফি' },
  { id: 'tour', nameEn: 'Educational Study Tour', nameBn: 'শিক্ষা সফর ফি' },
  { id: 'sports', nameEn: 'Sports & Cultural Fee', nameBn: 'ক্রীড়া ও সাংস্কৃতিক ফি' },
];

describe('findDuplicatePaidFee — strict exam & preset matching', () => {
  it('marks ONLY 2nd Semester Exam Fee as paid when an invoice includes Feb/Mar tuition + 2nd Semester Exam Fee', () => {
    const invoiceWith2ndSemester: FeeInvoice = {
      id: 'inv_64086',
      invoiceNo: 'INV-2026-64086',
      studentId: 'std_1',
      studentNameEn: 'Mahid hvv',
      studentNameBn: 'Mahid hvv',
      className: 'Class 10',
      section: 'A',
      roll: '01',
      session: '2026',
      feeType:
        'মাসিক টিউশন ফি (Tuition Fee - ফেব্রুয়ারি 2026) + 2nd Semester Exam Fee (২য় সেমিস্টার পরীক্ষা ফি) + Monthly Tuition Fee (মার্চ - মাসিক বেতন)',
      month: 'February 2026, 2026 Session, March 2026',
      items: [
        {
          id: 'item_feb',
          headName: 'মাসিক টিউশন ফি (Tuition Fee - ফেব্রুয়ারি 2026)',
          month: 'February 2026',
          amount: 1200,
        },
        {
          id: 'preset_exam_sem2_1',
          headName: '2nd Semester Exam Fee (২য় সেমিস্টার পরীক্ষা ফি)',
          month: '2026 Session',
          amount: 800,
        },
        {
          id: 'item_mar',
          headName: 'Monthly Tuition Fee (মার্চ - মাসিক বেতন)',
          month: 'March 2026',
          amount: 1200,
        },
      ],
      amount: 3200,
      discount: 0,
      netAmount: 3200,
      paidAmount: 3200,
      dueAmount: 0,
      dueDate: '2026-11-16',
      status: 'Paid',
    };

    const matchedPresetIds = makeClass10Presets()
      .filter(
        (preset) =>
          findDuplicatePaidFee([invoiceWith2ndSemester], preset.nameBn, '2026 Session', [preset.nameEn])
            .isDuplicate
      )
      .map((p) => p.id);

    expect(matchedPresetIds).toEqual(['exam_sem2']);
  });

  it('correctly flags paid February and March tuition months without flagging April or generic tuition preset', () => {
    const invoice: FeeInvoice = {
      id: 'inv_1',
      invoiceNo: 'INV-1',
      studentId: 'std_1',
      studentNameEn: 'Mahid',
      studentNameBn: 'মাহিদ',
      className: 'Class 10',
      section: 'A',
      roll: '01',
      session: '2026',
      feeType: 'Tuition + 2nd Model Test',
      month: 'February 2026, 2026 Session',
      items: [
        { id: '1', headName: 'Monthly Tuition Fee (ফেব্রুয়ারি - মাসিক বেতন)', month: 'February 2026', amount: 1200 },
        { id: '2', headName: '2nd Model Test Fee (২য় মডেল টেস্ট ফি)', month: '2026 Session', amount: 700 },
      ],
      amount: 1900,
      discount: 0,
      netAmount: 1900,
      paidAmount: 1900,
      dueAmount: 0,
      dueDate: '2026-02-10',
      status: 'Paid',
    };

    expect(findDuplicatePaidFee([invoice], 'মাসিক বেতন (ফেব্রুয়ারি)', 'February 2026').isDuplicate).toBe(true);
    expect(findDuplicatePaidFee([invoice], 'মাসিক বেতন (এপ্রিল)', 'April 2026').isDuplicate).toBe(false);
    expect(findDuplicatePaidFee([invoice], '২য় মডেল টেস্ট ফি', '2026 Session', ['2nd Model Test Fee']).isDuplicate).toBe(true);
    expect(findDuplicatePaidFee([invoice], '১ম মডেল টেস্ট ফি', '2026 Session', ['1st Model Test Fee']).isDuplicate).toBe(false);
    expect(findDuplicatePaidFee([invoice], '৩য় মডেল টেস্ট ফি', '2026 Session', ['3rd Model Test Fee']).isDuplicate).toBe(false);
    expect(findDuplicatePaidFee([invoice], '২য় সেমিস্টার পরীক্ষা ফি', '2026 Session', ['2nd Semester Exam Fee']).isDuplicate).toBe(false);
  });

  it('does NOT mark presets as already paid when an invoice is Unpaid with zero paidAmount', () => {
    const unpaidAdmissionInvoice: FeeInvoice = {
      id: 'inv_adm_unpaid',
      invoiceNo: 'INV-2026-99999',
      studentId: 'std_1',
      studentNameEn: 'Mahid',
      studentNameBn: 'মাহিদ',
      className: 'Class 10',
      section: 'A',
      roll: '01',
      session: '2026',
      feeType: 'নতুন ভর্তি ফি (2026 সেশন)',
      month: '2026 Session Admission',
      items: [
        {
          id: 'item_adm',
          headName: 'নতুন ভর্তি ফি (Admission Fee - 2026)',
          month: '2026 Session',
          amount: 2500,
        },
      ],
      amount: 2500,
      discount: 0,
      netAmount: 2500,
      paidAmount: 0,
      dueAmount: 2500,
      dueDate: '2026-01-01',
      status: 'Unpaid',
    };

    expect(
      findDuplicatePaidFee([unpaidAdmissionInvoice], 'নতুন ভর্তি ফি', '2026 Session', ['Admission Fee']).isDuplicate
    ).toBe(false);
  });

  it('does NOT falsely match Session Charge against an Admission Fee title containing "সেশন"', () => {
    const paidAdmissionInvoice: FeeInvoice = {
      id: 'inv_adm_paid',
      invoiceNo: 'INV-2026-88888',
      studentId: 'std_1',
      studentNameEn: 'Mahid',
      studentNameBn: 'মাহিদ',
      className: 'Class 10',
      section: 'A',
      roll: '01',
      session: '2026',
      feeType: 'নতুন ভর্তি ফি (2026 সেশন)',
      month: '2026 Session',
      amount: 2500,
      discount: 0,
      netAmount: 2500,
      paidAmount: 2500,
      dueAmount: 0,
      dueDate: '2026-01-01',
      status: 'Paid',
    };

    expect(
      findDuplicatePaidFee([paidAdmissionInvoice], 'নতুন ভর্তি ফি', '2026 Session', ['Admission Fee']).isDuplicate
    ).toBe(true);
    expect(
      findDuplicatePaidFee([paidAdmissionInvoice], 'বাৎসরিক সেশন ফি', '2026 Session', ['Session Charge']).isDuplicate
    ).toBe(false);
  });
});
