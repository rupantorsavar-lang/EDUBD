import { FeeInvoice } from '../types';

export interface DuplicateFeeRecord {
  feeName: string;
  month?: string;
  amount: number;
  invoiceNo: string;
  date: string;
  status: string;
}

export interface DuplicateFeeCheckResult {
  isDuplicate: boolean;
  record?: DuplicateFeeRecord;
}

const MONTH_TOKENS: Array<{ key: string; patterns: string[] }> = [
  { key: 'january', patterns: ['january', 'জানুয়ারি', 'জানুয়ারি'] },
  { key: 'february', patterns: ['february', 'ফেব্রুয়ারি', 'ফেব্রুয়ারি'] },
  { key: 'march', patterns: ['march', 'মার্চ'] },
  { key: 'april', patterns: ['april', 'এপ্রিল'] },
  { key: 'may', patterns: ['may', 'মে'] },
  { key: 'june', patterns: ['june', 'জুন'] },
  { key: 'july', patterns: ['july', 'জুলাই'] },
  { key: 'august', patterns: ['august', 'আগস্ট'] },
  { key: 'september', patterns: ['september', 'সেপ্টেম্বর'] },
  { key: 'october', patterns: ['october', 'অক্টোবর'] },
  { key: 'november', patterns: ['november', 'নভেম্বর'] },
  { key: 'december', patterns: ['december', 'ডিসেম্বর'] },
];

const normalizeClean = (val?: string): string =>
  (val || '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^a-z0-9\u0980-\u09FF]/g, '');

const extractYear = (val?: string): string | null => {
  const m = (val || '').match(/\b(20\d{2})\b/);
  return m ? m[1] : null;
};

const extractCalendarMonth = (val?: string): string | null => {
  const norm = (val || '').normalize('NFC').toLowerCase();
  for (const m of MONTH_TOKENS) {
    for (const p of m.patterns) {
      const pNorm = p.normalize('NFC').toLowerCase();
      if (/^[a-z]+$/.test(pNorm)) {
        if (new RegExp(`\\b${pNorm}\\b`, 'i').test(norm)) {
          return m.key;
        }
      } else if (norm.includes(pNorm)) {
        return m.key;
      }
    }
  }
  return null;
};

type FeeKind =
  | 'model_test'
  | 'semester_exam'
  | 'tuition'
  | 'admission'
  | 'session'
  | 'transport'
  | 'tour'
  | 'sports'
  | 'custom';

function detectFeeKind(cleanText: string): FeeKind {
  if (cleanText.includes('মডেলটেস্ট') || cleanText.includes('modeltest')) {
    return 'model_test';
  }
  if (
    cleanText.includes('সেমিস্টার') ||
    cleanText.includes('semester') ||
    cleanText.includes('অর্ধবার্ষিক') ||
    cleanText.includes('halfyearly') ||
    cleanText.includes('বার্ষিকপরীক্ষা') ||
    cleanText.includes('annualexam')
  ) {
    return 'semester_exam';
  }
  if (
    cleanText.includes('ভর্তি') ||
    cleanText.includes('admission')
  ) {
    return 'admission';
  }
  if (
    cleanText.includes('সেশনফি') ||
    cleanText.includes('সেশনচার্জ') ||
    cleanText.includes('বাৎসরিকসেশন') ||
    cleanText.includes('sessionfee') ||
    cleanText.includes('sessioncharge')
  ) {
    return 'session';
  }
  if (
    cleanText.includes('পরিবহন') ||
    cleanText.includes('বাসফি') ||
    cleanText.includes('transport') ||
    cleanText.includes('busfee')
  ) {
    return 'transport';
  }
  if (cleanText.includes('শিক্ষাসফর') || cleanText.includes('studytour')) {
    return 'tour';
  }
  if (
    cleanText.includes('ক্রীড়া'.normalize('NFC')) ||
    cleanText.includes('সাংস্কৃতিক') ||
    cleanText.includes('sports') ||
    cleanText.includes('cultural')
  ) {
    return 'sports';
  }
  if (
    cleanText.includes('tuition') ||
    cleanText.includes('টিউশন') ||
    cleanText.includes('মাসিকবেতন') ||
    cleanText.includes('বেতন')
  ) {
    return 'tuition';
  }
  return 'custom';
}

function extractOrdinal(cleanText: string, kind: 'model_test' | 'semester_exam'): '1' | '2' | '3' | null {
  if (
    cleanText.includes('১ম') ||
    cleanText.includes('1ম') ||
    cleanText.includes('1st') ||
    (kind === 'model_test' && cleanText.includes('mt1')) ||
    (kind === 'semester_exam' &&
      (cleanText.includes('sem1') || cleanText.includes('অর্ধবার্ষিক') || cleanText.includes('halfyearly')))
  ) {
    return '1';
  }
  if (
    cleanText.includes('২য়') ||
    cleanText.includes('২য়') ||
    cleanText.includes('2য়') ||
    cleanText.includes('2য়') ||
    cleanText.includes('2nd') ||
    (kind === 'model_test' && cleanText.includes('mt2')) ||
    (kind === 'semester_exam' && cleanText.includes('sem2'))
  ) {
    return '2';
  }
  if (
    cleanText.includes('৩য়') ||
    cleanText.includes('৩য়') ||
    cleanText.includes('3য়') ||
    cleanText.includes('3য়') ||
    cleanText.includes('3rd') ||
    (kind === 'model_test' && cleanText.includes('mt3')) ||
    (kind === 'semester_exam' &&
      (cleanText.includes('sem3') ||
        (!cleanText.includes('অর্ধবার্ষিক') && cleanText.includes('বার্ষিক')) ||
        cleanText.includes('annual')))
  ) {
    return '3';
  }
  return null;
}

function periodsCompatible(targetPeriodRaw: string, existingPeriodRaw: string): boolean {
  const targetYear = extractYear(targetPeriodRaw);
  const existingYear = extractYear(existingPeriodRaw);
  if (targetYear && existingYear && targetYear !== existingYear) {
    return false;
  }
  return true;
}

function matchSingleEntry(
  targetTitles: string[],
  targetPeriod: string,
  existingTitle: string,
  existingPeriod: string
): boolean {
  const existingClean = normalizeClean(existingTitle);
  if (!existingClean) return false;

  const targetCleans = targetTitles.map((t) => normalizeClean(t)).filter(Boolean);
  if (targetCleans.length === 0) return false;

  const existingKind = detectFeeKind(existingClean);
  const targetCombinedClean = targetCleans.join(' ');
  const targetKind = detectFeeKind(targetCombinedClean);

  // Different canonical fee categories must NEVER match each other
  if (targetKind !== existingKind) {
    return false;
  }

  // Year compatibility guard when both sides specify a year
  const targetYearCtx = `${targetTitles.join(' ')} ${targetPeriod}`;
  const existingYearCtx = `${existingTitle} ${existingPeriod}`;
  if (!periodsCompatible(targetYearCtx, existingYearCtx)) {
    return false;
  }

  if (targetKind === 'model_test' || targetKind === 'semester_exam') {
    const targetOrd = extractOrdinal(targetCombinedClean, targetKind);
    const existingOrd = extractOrdinal(existingClean, targetKind);
    if (targetOrd && existingOrd) {
      return targetOrd === existingOrd;
    }
    if (targetOrd || existingOrd) {
      return false;
    }
    return true;
  }

  if (targetKind === 'tuition' || targetKind === 'transport') {
    const targetMonth = extractCalendarMonth(`${targetTitles.join(' ')} ${targetPeriod}`);
    const existingMonth = extractCalendarMonth(`${existingTitle} ${existingPeriod}`);
    if (targetMonth && existingMonth) {
      return targetMonth === existingMonth;
    }
    if (!targetMonth && existingMonth) {
      // A monthly payment (e.g. February 2026) should not mark the generic class preset button as fully paid
      return false;
    }
    if (targetMonth && !existingMonth) {
      return false;
    }
    const cleanTargetPeriod = normalizeClean(targetPeriod);
    const cleanExistingPeriod = normalizeClean(existingPeriod);
    return Boolean(
      cleanTargetPeriod &&
        cleanExistingPeriod &&
        (cleanExistingPeriod.includes(cleanTargetPeriod) || cleanTargetPeriod.includes(cleanExistingPeriod))
    );
  }

  if (
    targetKind === 'admission' ||
    targetKind === 'session' ||
    targetKind === 'tour' ||
    targetKind === 'sports'
  ) {
    return true;
  }

  // Custom fee name matching
  return targetCleans.some(
    (tc) =>
      (tc.length > 3 && existingClean.includes(tc)) ||
      (existingClean.length > 3 && tc.includes(existingClean))
  );
}

/**
 * Checks whether a student has an already-paid/partially-paid invoice matching a specific fee item.
 * Strictly matches per-item name, exam ordinal (1st/2nd/3rd Model Test vs 1st/2nd/3rd Semester),
 * and month/session so paying one exam or month never falsely flags other exams as "Already Paid".
 */
export function findDuplicatePaidFee(
  studentInvoices: FeeInvoice[],
  feeTitle: string,
  period?: string,
  alternateTitles: string[] = []
): DuplicateFeeCheckResult {
  const targetTitles = [feeTitle, ...alternateTitles].filter(Boolean);
  const targetPeriod = period || '';

  const paidOrPartialInvoices = studentInvoices.filter(
    (inv) => inv.status === 'Paid' || (Number(inv.paidAmount) || 0) > 0
  );

  for (const inv of paidOrPartialInvoices) {
    if (Array.isArray(inv.items) && inv.items.length > 0) {
      for (const it of inv.items) {
        if (matchSingleEntry(targetTitles, targetPeriod, it.headName || '', it.month || inv.month || inv.session || '')) {
          return {
            isDuplicate: true,
            record: {
              feeName: it.headName,
              month: it.month || inv.month,
              amount: it.amount,
              invoiceNo: inv.invoiceNo,
              date: inv.dueDate || inv.session || '2026',
              status: inv.status,
            },
          };
        }
      }
      // When itemized items exist, never fall back to blind header/month string matching
      continue;
    }

    // Legacy invoice without itemized lines
    if (matchSingleEntry(targetTitles, targetPeriod, inv.feeType || '', inv.month || inv.session || '')) {
      return {
        isDuplicate: true,
        record: {
          feeName: inv.feeType,
          month: inv.month,
          amount: inv.paidAmount > 0 ? inv.paidAmount : inv.netAmount,
          invoiceNo: inv.invoiceNo,
          date: inv.dueDate || inv.session || '2026',
          status: inv.status,
        },
      };
    }
  }

  return { isDuplicate: false };
}
