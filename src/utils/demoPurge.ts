export const DEMO_LOCAL_PURGE_KEY = 'school_erp_demo_purged_v5';

const DEMO_EXAM_IDS = new Set([
  'exam_term1_2026',
  'exam_half_2026',
  'exam_1st_model_test_2026',
]);

const DEMO_HOMEWORK_IDS = new Set([
  'hw_math_c10_1',
  'hw_eng_c10_2',
  'hw_ict_c10_3',
  'hw_sci_c10_4',
]);

const DEMO_SCHEDULED_FEE_IDS = new Set([
  'sf_exam_sem1_2026',
  'sf_tuit_may_2026',
]);

const DEMO_STAFF_IDS = new Set([
  'st_1',
  'st_2',
  'st_3',
  'st_4',
  'st_5',
  'st_6',
  'st_7',
  'st_8',
  'st_9',
]);

const DEMO_BLOG_IDS = new Set(['blog_1', 'blog_2', 'blog_3']);

const DEMO_HOLIDAY_IDS = new Set(['hol_1', 'hol_2', 'hol_3', 'hol_4', 'hol_5', 'hol_6']);

const DEMO_STUDENT_ID_RE = /^std_c\d+[a-z]*_\d+$/;

export function isDemoRecord(
  storageKey: string,
  item: any,
  validExamIds?: Set<string>
): boolean {
  if (!item || typeof item !== 'object') return false;
  const id = String(item.id || '');

  switch (storageKey) {
    case 'school_erp_students':
      return DEMO_STUDENT_ID_RE.test(id);

    case 'school_erp_exams':
      return DEMO_EXAM_IDS.has(id);

    case 'school_erp_exam_routines': {
      const examId = String(item.examId || '');
      if (/^er_c\d+_\d+$/.test(id)) return true;
      if (DEMO_EXAM_IDS.has(examId)) return true;
      if (
        id.startsWith('er_exam_term1_2026_') ||
        id.startsWith('er_exam_half_2026_') ||
        id.startsWith('er_exam_1st_model_test_2026_')
      ) {
        return true;
      }
      // Remove orphaned exam routines whose parent exam does not exist
      if (validExamIds && !validExamIds.has(examId)) {
        return true;
      }
      return false;
    }

    case 'school_erp_marks':
      return (
        /^m_\d{2}_\d+$/.test(id) ||
        DEMO_EXAM_IDS.has(String(item.examId || '')) ||
        DEMO_STUDENT_ID_RE.test(String(item.studentId || ''))
      );

    case 'school_erp_attendance':
      return (
        /^att_today_\d+$/.test(id) ||
        DEMO_STUDENT_ID_RE.test(String(item.targetId || ''))
      );

    case 'school_erp_homework':
      return DEMO_HOMEWORK_IDS.has(id) || /^hw_[a-z]+_c\d+_\d+$/.test(id);

    case 'school_erp_homework_submissions':
      return (
        /^sub_[a-z]+_\d+$/.test(id) ||
        DEMO_HOMEWORK_IDS.has(String(item.homeworkId || '')) ||
        DEMO_STUDENT_ID_RE.test(String(item.studentId || ''))
      );

    case 'school_erp_invoices':
      return (
        /^(inv_(ex|tu)_10_\d+|fi_(ex|tu)_\d+_\d+)$/.test(id) ||
        DEMO_STUDENT_ID_RE.test(String(item.studentId || ''))
      );

    case 'school_erp_payments':
      return (
        /^pay_(ex|tu)_10_\d+$/.test(id) ||
        DEMO_STUDENT_ID_RE.test(String(item.studentId || ''))
      );

    case 'school_erp_online_payment_requests':
      return (
        /^onl_pay_\d+$/.test(id) ||
        DEMO_STUDENT_ID_RE.test(String(item.studentId || ''))
      );

    case 'school_erp_routines':
      return /^rt_c10_(sat|sun)_\d+$/.test(id);

    case 'school_erp_scheduled_fees':
      return DEMO_SCHEDULED_FEE_IDS.has(id);

    case 'school_erp_books':
      return id === 'bk_1' || id === 'bk_2' || id === 'bk_3';

    case 'school_erp_book_issues':
      return id === 'bi_1' || DEMO_STUDENT_ID_RE.test(String(item.borrowerId || ''));

    case 'school_erp_routes':
      return id === 'rt_1';

    case 'school_erp_student_transports':
      return id === 'st_tr_1' || DEMO_STUDENT_ID_RE.test(String(item.studentId || ''));

    case 'school_erp_notices':
      return id === 'not_1';

    case 'school_erp_expenses':
      return id === 'exp_1';

    case 'school_erp_staff': {
      const email = String(item.email || '').toLowerCase();
      return (
        DEMO_STAFF_IDS.has(id) ||
        email.endsWith('@intercitymodelschool.edu.bd')
      );
    }

    case 'school_erp_blog_posts': {
      const content = String(item.content || '');
      return (
        DEMO_BLOG_IDS.has(id) ||
        content.includes('ইন্টারসিটি মডেল স্কুল') ||
        content.toLowerCase().includes('intercity model school')
      );
    }

    case 'school_erp_holidays':
      return DEMO_HOLIDAY_IDS.has(id);

    default:
      return false;
  }
}

export function sanitizeDemoArray<T>(
  storageKey: string,
  items: T[],
  validExamIds?: Set<string>
): { cleaned: T[]; removedCount: number; changed: boolean } {
  if (!Array.isArray(items)) {
    return { cleaned: items, removedCount: 0, changed: false };
  }
  const cleaned = items.filter((item) => !isDemoRecord(storageKey, item, validExamIds));
  const removedCount = items.length - cleaned.length;
  return {
    cleaned,
    removedCount,
    changed: removedCount > 0,
  };
}

export const PURGEABLE_DATA_KEYS = [
  'school_erp_exams',
  'school_erp_exam_routines',
  'school_erp_students',
  'school_erp_staff',
  'school_erp_marks',
  'school_erp_attendance',
  'school_erp_homework',
  'school_erp_homework_submissions',
  'school_erp_invoices',
  'school_erp_payments',
  'school_erp_online_payment_requests',
  'school_erp_routines',
  'school_erp_scheduled_fees',
  'school_erp_books',
  'school_erp_book_issues',
  'school_erp_routes',
  'school_erp_student_transports',
  'school_erp_notices',
  'school_erp_expenses',
  'school_erp_blog_posts',
  'school_erp_holidays',
];

export function purgeAllDemoDataFromLocalStorage(): {
  changed: boolean;
  totalRemoved: number;
} {
  if (typeof window === 'undefined') return { changed: false, totalRemoved: 0 };

  let changed = false;
  let totalRemoved = 0;

  // 1. Clean exams first so we know exact real exam IDs for orphan check
  let validExamIds = new Set<string>();
  try {
    const rawExams = window.localStorage.getItem('school_erp_exams');
    if (rawExams) {
      const parsedExams = JSON.parse(rawExams);
      if (Array.isArray(parsedExams)) {
        const res = sanitizeDemoArray('school_erp_exams', parsedExams);
        if (res.changed) {
          window.localStorage.setItem('school_erp_exams', JSON.stringify(res.cleaned));
          changed = true;
          totalRemoved += res.removedCount;
        }
        validExamIds = new Set(res.cleaned.map((e: any) => String(e?.id || '')).filter(Boolean));
      }
    }
  } catch {}

  // 2. Clean remaining collections
  for (const key of PURGEABLE_DATA_KEYS) {
    if (key === 'school_erp_exams') continue;
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) continue;
      const res = sanitizeDemoArray(
        key,
        parsed,
        key === 'school_erp_exam_routines' ? validExamIds : undefined
      );
      if (res.changed) {
        window.localStorage.setItem(key, JSON.stringify(res.cleaned));
        changed = true;
        totalRemoved += res.removedCount;
      }
    } catch {}
  }

  // 3. Remove cached Intercity Model School & College profile if present
  try {
    const rawProfile = window.localStorage.getItem('school_erp_profile');
    if (rawProfile) {
      const parsedProfile = JSON.parse(rawProfile);
      const nameEn = String(parsedProfile?.nameEn || '').toLowerCase();
      const nameBn = String(parsedProfile?.nameBn || '');
      const email = String(parsedProfile?.email || '').toLowerCase();
      if (
        nameEn.includes('intercity model school') ||
        nameBn.includes('ইন্টারসিটি মডেল স্কুল') ||
        email.includes('intercitymodelschool.edu.bd')
      ) {
        window.localStorage.removeItem('school_erp_profile');
        changed = true;
      }
    }
  } catch {}

  try {
    const rawCreds = window.localStorage.getItem('school_erp_super_admin_creds');
    if (rawCreds) {
      const parsedCreds = JSON.parse(rawCreds);
      if (String(parsedCreds?.email || '').toLowerCase().includes('intercitymodelschool.edu.bd')) {
        window.localStorage.removeItem('school_erp_super_admin_creds');
        changed = true;
      }
    }
  } catch {}

  return { changed, totalRemoved };
}
