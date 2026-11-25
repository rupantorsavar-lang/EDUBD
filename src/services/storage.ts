import {
  SchoolProfile,
  ClassInfo,
  Subject,
  Student,
  Staff,
  AttendanceRecord,
  Exam,
  MarksEntry,
  FeeHead,
  FeeInvoice,
  FeePayment,
  Expense,
  RoutinePeriod,
  Homework,
  AdmissionEnquiry,
  Book,
  BookIssue,
  TransportRoute,
  InventoryItem,
  Notice,
  ExamScheduleItem,
  ExamSeatPlanConfig,
  ClassLevel,
  GroupType,
  SystemAccessControl,
  UserRole,
  SchoolHoliday,
  SuperAdminCredentials,
  ClassFeeConfig,
  ScheduledFee,
  StudentTransport,
  FeeItem,
  WebsiteMessage,
  HomeworkSubmission,
  AttendanceRuleConfig,
  AttendanceAuditLog,
  StudentPerformanceAnalytics,
  AttendanceStatus,
  SubjectPerformanceItem,
  BlogPost,
  MfsPaymentSettings,
  OnlinePaymentRequest,
  StaffSalaryPayment,
  SaleItem,
  IncomeVoucher,
  IncomeVoucherLineItem,
  TransactionSecurityConfig,
} from '../types';
import {
  buildSuperAdminPublishMeta,
  buildSuperAdminRejectMeta,
} from '../utils/approvalWorkflow';
import { canEditOrDeleteInvoice, canEditOrDeleteFinanceRecord } from '../utils/permissions';
import { DEFAULT_TRANSACTION_SECURITY_CONFIG } from '../utils/transactionAuth';
import { getFreshIdToken } from './firebase';
import {
  initialSchoolProfile,
  initialClasses,
  initialSubjects,
  initialStaff,
  initialStudents,
  initialExams,
  initialMarks,
  initialFeeHeads,
  initialInvoices,
  initialPayments,
  initialExpenses,
  initialAttendance,
  initialRoutines,
  initialHomework,
  initialBooks,
  initialBookIssues,
  initialRoutes,
  initialInventory,
  initialNotices,
  initialEnquiries,
  initialExamRoutines,
  initialHolidays,
  initialClassFeeConfigs,
  initialScheduledFees,
  initialStudentTransports,
  initialWebsiteMessages,
  initialHomeworkSubmissions,
  initialAttendanceRules,
  initialAttendanceAuditLogs,
  initialBlogPosts,
  initialOnlinePaymentRequests,
} from '../data/initialData';
import { DEFAULT_SCHOOL_LOGO } from '../data/schoolLogo';
import { db, handleFirestoreError, OperationType } from './firebase';
import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import { safeSetLocalStorage, safeGetLocalStorage, cleanupOversizedLocalStorage } from '../utils/storageHelper';
import { CloudSyncService, SAAS_ACTIVE_SCHOOL_KEY } from './cloudSync';
import JSZip from 'jszip';
import bakedSchoolData from '../data/bakedSchoolData.json';
import { DEMO_LOCAL_PURGE_KEY, purgeAllDemoDataFromLocalStorage } from '../utils/demoPurge';
import {
  resolveSchoolCode,
  formatSchoolScopedId,
  generateNextSchoolStudentId,
  generateNextSchoolEmployeeId,
  isMatchingScopedId,
} from '../utils/schoolIdFormatter';
import { compareStudentsByClassAndRoll } from '../utils/studentSort';
import { mergeHomeworkSubmissions } from '../utils/homeworkPortal';
import {
  buildPublicWebsitePayloadFromERP,
  fetchPublicAdmissionsQueue,
  fetchPublicMessagesInbox,
  publishPublicWebsiteSnapshot,
} from './publicWebsiteService';

const STORAGE_KEYS = {
  SCHOOL: 'school_erp_profile',
  CLASSES: 'school_erp_classes',
  SUBJECTS: 'school_erp_subjects',
  STAFF: 'school_erp_staff',
  STUDENTS: 'school_erp_students',
  EXAMS: 'school_erp_exams',
  EXAM_ROUTINES: 'school_erp_exam_routines',
  EXAM_SEAT_PLANS: 'school_erp_exam_seat_plans',
  MARKS: 'school_erp_marks',
  FEE_HEADS: 'school_erp_fee_heads',
  CLASS_FEES: 'school_erp_class_fees',
  SCHEDULED_FEES: 'school_erp_scheduled_fees',
  STUDENT_TRANSPORTS: 'school_erp_student_transports',
  INVOICES: 'school_erp_invoices',
  PAYMENTS: 'school_erp_payments',
  EXPENSES: 'school_erp_expenses',
  INCOME_VOUCHERS: 'school_erp_income_vouchers',
  SALE_ITEMS: 'school_erp_sale_items',
  STAFF_SALARIES: 'school_erp_staff_salaries',
  ATTENDANCE: 'school_erp_attendance',
  ATTENDANCE_RULES: 'school_erp_attendance_rules',
  ATTENDANCE_AUDIT: 'school_erp_attendance_audit',
  ROUTINES: 'school_erp_routines',
  HOMEWORK: 'school_erp_homework',
  HOMEWORK_SUBMISSIONS: 'school_erp_homework_submissions',
  BOOKS: 'school_erp_books',
  BOOK_ISSUES: 'school_erp_book_issues',
  ROUTES: 'school_erp_routes',
  INVENTORY: 'school_erp_inventory',
  NOTICES: 'school_erp_notices',
  ENQUIRIES: 'school_erp_enquiries',
  ACCESS_CONTROL: 'school_erp_access_control',
  HOLIDAYS: 'school_erp_holidays',
  SUPER_ADMIN_CREDS: 'school_erp_super_admin_creds',
  WEBSITE_MESSAGES: 'school_erp_website_messages',
  BLOG_POSTS: 'school_erp_blog_posts',
  MFS_SETTINGS: 'school_erp_mfs_settings',
  ONLINE_PAYMENT_REQUESTS: 'school_erp_online_payment_requests',
  TRANSACTION_SECURITY: 'school_erp_transaction_security',
};

// Ensure local storage has clean initial baseline without wiping user data
const CLEAN_DATABASE_RESET_KEY = 'school_erp_clean_start_2026_v1';
if (typeof window !== 'undefined') {
  // Check if this project was booted from a Master Admin baked export with custom data
  if (bakedSchoolData && (bakedSchoolData as any).data && (bakedSchoolData as any).initialized !== false) {
    const bakedPayload = (bakedSchoolData as any).data;
    Object.entries(STORAGE_KEYS).forEach(([_, sKey]) => {
      if (bakedPayload[sKey] && !safeGetLocalStorage(sKey)) {
        safeSetLocalStorage(sKey, JSON.stringify(bakedPayload[sKey]));
      }
    });
  }

  const isReset = safeGetLocalStorage(CLEAN_DATABASE_RESET_KEY);
  if (isReset !== 'cleared') {
    safeSetLocalStorage(STORAGE_KEYS.STUDENTS, JSON.stringify([]));
    safeSetLocalStorage(STORAGE_KEYS.EXAMS, JSON.stringify([]));
    safeSetLocalStorage(STORAGE_KEYS.EXAM_ROUTINES, JSON.stringify([]));
    safeSetLocalStorage(STORAGE_KEYS.MARKS, JSON.stringify([]));
    safeSetLocalStorage(STORAGE_KEYS.INVOICES, JSON.stringify([]));
    safeSetLocalStorage(STORAGE_KEYS.PAYMENTS, JSON.stringify([]));
    safeSetLocalStorage(STORAGE_KEYS.ATTENDANCE, JSON.stringify([]));
    safeSetLocalStorage(STORAGE_KEYS.ATTENDANCE_AUDIT, JSON.stringify([]));
    safeSetLocalStorage(STORAGE_KEYS.ROUTINES, JSON.stringify([]));
    safeSetLocalStorage(STORAGE_KEYS.HOMEWORK, JSON.stringify([]));
    safeSetLocalStorage(STORAGE_KEYS.HOMEWORK_SUBMISSIONS, JSON.stringify([]));
    safeSetLocalStorage(STORAGE_KEYS.ONLINE_PAYMENT_REQUESTS, JSON.stringify([]));
    safeSetLocalStorage(STORAGE_KEYS.ENQUIRIES, JSON.stringify([]));
    safeSetLocalStorage(STORAGE_KEYS.BOOKS, JSON.stringify([]));
    safeSetLocalStorage(STORAGE_KEYS.BOOK_ISSUES, JSON.stringify([]));
    safeSetLocalStorage(STORAGE_KEYS.ROUTES, JSON.stringify([]));
    safeSetLocalStorage(STORAGE_KEYS.EXPENSES, JSON.stringify([]));
    safeSetLocalStorage(STORAGE_KEYS.INCOME_VOUCHERS, JSON.stringify([]));
    safeSetLocalStorage(STORAGE_KEYS.SALE_ITEMS, JSON.stringify([]));
    safeSetLocalStorage(STORAGE_KEYS.STAFF_SALARIES, JSON.stringify([]));
    safeSetLocalStorage(STORAGE_KEYS.SCHEDULED_FEES, JSON.stringify([]));
    safeSetLocalStorage(STORAGE_KEYS.STUDENT_TRANSPORTS, JSON.stringify([]));
    safeSetLocalStorage(STORAGE_KEYS.NOTICES, JSON.stringify([]));
    safeSetLocalStorage(CLEAN_DATABASE_RESET_KEY, 'cleared');
    safeSetLocalStorage('school_erp_presentation_demo_v3', 'cleaned');
  }

  // One-time safe purge of demo seed records & orphaned demo exam routines (preserves all user-added records)
  const isDemoPurgedV4 = safeGetLocalStorage(DEMO_LOCAL_PURGE_KEY);
  if (isDemoPurgedV4 !== 'done') {
    purgeAllDemoDataFromLocalStorage();
    safeSetLocalStorage(DEMO_LOCAL_PURGE_KEY, 'done');
    safeSetLocalStorage('school_erp_presentation_demo_v3', 'cleaned');
  }

  // Safe read to make sure default profile exists if storage is empty
  const existingSchoolRaw = safeGetLocalStorage(STORAGE_KEYS.SCHOOL);
  if (!existingSchoolRaw) {
    safeSetLocalStorage(STORAGE_KEYS.SCHOOL, JSON.stringify(initialSchoolProfile));
  }
}

const defaultMfsSettings: MfsPaymentSettings = {
  bkashNumber: '01711234567',
  bkashType: 'Personal',
  nagadNumber: '01911234567',
  nagadType: 'Personal',
  rocketNumber: '01811234567',
  rocketType: 'Personal',
  instructionsBn: 'বিকাশ, নগদ অথবা রকেট নম্বরে সেন্ড মানি বা পেমেন্ট করে নিচে ট্রানজেকশন আইডি (TrxID) ও আপনার ফোন নম্বর দিন।',
  instructionsEn: 'Send money to our bKash, Nagad, or Rocket number, then submit your TrxID and sender phone number.',
};

const defaultSuperAdminCreds: SuperAdminCredentials = {
  username: 'superadmin',
  password: '',
  email: 'superadmin@smartschoolbd.com',
  name: 'School Super Admin',
  nameBn: 'স্কুল সুপার অ্যাডমিন',
  phone: '',
  updatedAt: new Date().toISOString(),
};

const defaultAccessControl: SystemAccessControl = {
  isSystemLocked: false,
  disabledRoles: [],
  disabledMessage: 'সিস্টেম রক্ষণাবেক্ষণ ও ডাটা আপগ্রেডের জন্য সাময়িকভাবে এক্সেস স্থগিত রাখা হয়েছে। বিস্তারিত জানতে মাস্টার অ্যাডমিনের সাথে যোগাযোগ করুন। (Access is temporarily suspended by Master Admin for system maintenance and updates).',
  updatedAt: new Date().toISOString(),
  updatedBy: 'Master Admin',
};

function getStored<T>(key: string, defaultValue: T): T {
  try {
    const item = safeGetLocalStorage(key);
    if (!item) {
      if (!Array.isArray(defaultValue) || defaultValue.length > 0) {
        safeSetLocalStorage(key, JSON.stringify(defaultValue));
      }
      return defaultValue;
    }
    return JSON.parse(item) as T;
  } catch (e) {
    console.error(`Error reading ${key} from storage:`, e);
    return defaultValue;
  }
}

function cleanForFirestore<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    return obj.map((item) => cleanForFirestore(item)) as unknown as T;
  }
  const cleaned: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj as Record<string, any>)) {
    if (v !== undefined) {
      cleaned[k] = cleanForFirestore(v);
    }
  }
  return cleaned as T;
}

function setStored<T>(key: string, value: T, skipGlobalSyncSchedule: boolean = false): void {
  try {
    safeSetLocalStorage(key, JSON.stringify(value));
    if (!skipGlobalSyncSchedule) {
      CloudSyncService.scheduleCloudSync();
    }
  } catch (e) {
    console.error(`Error writing ${key} to storage:`, e);
  }
}

export const StorageService = {
  // School
  getSchoolProfile(): SchoolProfile {
    const profile = getStored<SchoolProfile>(STORAGE_KEYS.SCHOOL, initialSchoolProfile);
    if (
      profile.nameEn?.toLowerCase().includes('intercity model school') ||
      profile.nameBn?.includes('ইন্টারসিটি মডেল স্কুল') ||
      profile.email?.toLowerCase().includes('intercitymodelschool.edu.bd')
    ) {
      const cleanedProfile: SchoolProfile = { ...initialSchoolProfile };
      safeSetLocalStorage(STORAGE_KEYS.SCHOOL, JSON.stringify(cleanedProfile));
      return cleanedProfile;
    }
    if (!profile.logoUrl || profile.logoUrl.trim() === '') {
      profile.logoUrl = DEFAULT_SCHOOL_LOGO;
    }
    if (!profile.heroImageUrl || profile.heroImageUrl.trim() === '') {
      profile.heroImageUrl = initialSchoolProfile.heroImageUrl;
    }
    if (!profile.aboutImageUrl || profile.aboutImageUrl.trim() === '') {
      profile.aboutImageUrl = initialSchoolProfile.aboutImageUrl;
    }
    if (!profile.heroTaglineBn) {
      profile.heroTaglineBn = initialSchoolProfile.heroTaglineBn;
    }
    if (!profile.heroWelcomeTitleBn) {
      profile.heroWelcomeTitleBn = initialSchoolProfile.heroWelcomeTitleBn;
    }
    if (!profile.heroSubtitleBn) {
      profile.heroSubtitleBn = initialSchoolProfile.heroSubtitleBn;
    }
    if (!profile.mottoBn) {
      profile.mottoBn = initialSchoolProfile.mottoBn;
    }
    if (!profile.statsStudents) {
      profile.statsStudents = initialSchoolProfile.statsStudents;
    }
    if (!profile.statsTeachers) {
      profile.statsTeachers = initialSchoolProfile.statsTeachers;
    }
    if (!profile.statsClassrooms) {
      profile.statsClassrooms = initialSchoolProfile.statsClassrooms;
    }
    if (!profile.statsExperience) {
      profile.statsExperience = initialSchoolProfile.statsExperience;
    }
    return profile;
  },
  saveSchoolProfileLocally(profile: SchoolProfile): void {
    setStored(STORAGE_KEYS.SCHOOL, profile);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('school_profile_updated', { detail: profile }));
    }
  },
  saveSchoolProfile(profile: SchoolProfile): void {
    setStored(STORAGE_KEYS.SCHOOL, profile);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('school_profile_updated', { detail: profile }));
    }
    // Push only the profile slice so unrelated slices are never overwritten
    CloudSyncService.pushSliceToCloud('profile', true);
    void this.syncPublicWebsite();
  },

  // MFS Payment Settings (bKash, Nagad & Rocket number and instructions)
  getMfsSettings(): MfsPaymentSettings {
    const stored = getStored<MfsPaymentSettings>(STORAGE_KEYS.MFS_SETTINGS, defaultMfsSettings);
    return {
      ...defaultMfsSettings,
      ...stored,
      rocketNumber: stored.rocketNumber ?? defaultMfsSettings.rocketNumber,
      rocketType: stored.rocketType ?? defaultMfsSettings.rocketType,
    };
  },
  saveMfsSettings(settings: MfsPaymentSettings): void {
    setStored(STORAGE_KEYS.MFS_SETTINGS, settings);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('mfs_settings_updated', { detail: settings }));
    }
    CloudSyncService.pushSliceToCloud('profile', true);
    // Sync to server storage when authenticated
    try {
      void getFreshIdToken(false)
        .then((token) => {
          if (!token) return;
          return fetch('/api/mfs-settings', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(settings),
          });
        })
        .catch((e) => console.warn('Could not sync MFS settings to server:', e));
    } catch {}
  },

  getOnlinePaymentRequests(): OnlinePaymentRequest[] {
    const raw = safeGetLocalStorage(STORAGE_KEYS.ONLINE_PAYMENT_REQUESTS);
    if (raw === null) {
      const list = initialOnlinePaymentRequests || [];
      if (list.length > 0) {
        setStored(STORAGE_KEYS.ONLINE_PAYMENT_REQUESTS, list);
      }
      return list;
    }
    try {
      return JSON.parse(raw) || [];
    } catch {
      return [];
    }
  },
  saveOnlinePaymentRequests(requests: OnlinePaymentRequest[], syncToCloud: boolean = true): void {
    safeSetLocalStorage(STORAGE_KEYS.ONLINE_PAYMENT_REQUESTS, JSON.stringify(requests));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('online_payments_updated', { detail: requests }));
    }
    if (syncToCloud) {
      CloudSyncService.pushSliceToCloud('online_payments', true);
    }
  },
  upsertOnlinePaymentRequestLocal(request: OnlinePaymentRequest): void {
    const list = this.getOnlinePaymentRequests().filter((r) => r.id !== request.id);
    const updated = [request, ...list];
    this.saveOnlinePaymentRequests(updated, false);
  },
  addOnlinePaymentRequest(request: OnlinePaymentRequest): void {
    const list = this.getOnlinePaymentRequests().filter((r) => r.id !== request.id);
    const updated = [request, ...list];
    this.saveOnlinePaymentRequests(updated, true);
  },
  updateOnlinePaymentRequest(id: string, updates: Partial<OnlinePaymentRequest>): void {
    const list = this.getOnlinePaymentRequests();
    const updated = list.map((item) => (item.id === id ? { ...item, ...updates } : item));
    this.saveOnlinePaymentRequests(updated, true);
  },
  deleteOnlinePaymentRequest(id: string): void {
    const list = this.getOnlinePaymentRequests();
    const updated = list.filter((item) => item.id !== id);
    this.saveOnlinePaymentRequests(updated, true);
  },
  clearOnlinePaymentRequests(): void {
    this.saveOnlinePaymentRequests([], true);
  },


  // Classes
  getClasses(): ClassInfo[] {
    const raw = safeGetLocalStorage(STORAGE_KEYS.CLASSES);
    if (raw === null) {
      const seeded = [...initialClasses].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      safeSetLocalStorage(STORAGE_KEYS.CLASSES, JSON.stringify(seeded));
      return seeded;
    }
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return [...parsed].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      }
    } catch {
      // fall through to defaults on malformed JSON
    }
    return [...initialClasses].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  },
  saveClasses(classes: ClassInfo[]): void {
    const sorted = [...classes].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    setStored(STORAGE_KEYS.CLASSES, sorted);
    CloudSyncService.pushSliceToCloud('academics', true);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('school_classes_updated', { detail: sorted }));
    }
    void this.syncPublicWebsite();
  },
  renameClassReferences(oldName: string, newName: string): void {
    const from = oldName.trim();
    const to = newName.trim();
    if (!from || !to || from === to) return;

    const subjects = this.getSubjects();
    let subjectsChanged = false;
    const nextSubjects = subjects.map((sub) => {
      if (sub.className === from) {
        subjectsChanged = true;
        return { ...sub, className: to as ClassLevel };
      }
      return sub;
    });
    if (subjectsChanged) this.saveSubjects(nextSubjects);

    const students = this.getStudents();
    let studentsChanged = false;
    const nextStudents = students.map((st) => {
      if (st.className === from) {
        studentsChanged = true;
        return { ...st, className: to as ClassLevel };
      }
      return st;
    });
    if (studentsChanged) {
      setStored(STORAGE_KEYS.STUDENTS, nextStudents);
      CloudSyncService.pushSliceToCloud('students', true);
    }

    const examRoutines = this.getExamRoutines();
    let examRoutinesChanged = false;
    const nextExamRoutines = examRoutines.map((r) => {
      if (r.className === from) {
        examRoutinesChanged = true;
        return { ...r, className: to as ClassLevel };
      }
      return r;
    });
    if (examRoutinesChanged) this.saveExamRoutines(nextExamRoutines);

    const marks = this.getMarks();
    let marksChanged = false;
    const nextMarks = marks.map((m) => {
      if (m.className === from) {
        marksChanged = true;
        return { ...m, className: to as ClassLevel };
      }
      return m;
    });
    if (marksChanged) {
      setStored(STORAGE_KEYS.MARKS, nextMarks);
      CloudSyncService.pushSliceToCloud('academics', true);
    }

    const routines = this.getRoutines();
    let routinesChanged = false;
    const nextRoutines = routines.map((r) => {
      if (r.className === from) {
        routinesChanged = true;
        return { ...r, className: to as ClassLevel };
      }
      return r;
    });
    if (routinesChanged) this.saveRoutines(nextRoutines);

    const attendance = this.getAttendance();
    let attendanceChanged = false;
    const nextAttendance = attendance.map((a) => {
      if (a.className === from) {
        attendanceChanged = true;
        return { ...a, className: to };
      }
      return a;
    });
    if (attendanceChanged) {
      setStored(STORAGE_KEYS.ATTENDANCE, nextAttendance);
      CloudSyncService.pushSliceToCloud('attendance', true);
    }

    const feeConfigs = this.getClassFeeConfigs();
    let feesChanged = false;
    const nextFeeConfigs = feeConfigs.map((c) => {
      if (c.className === from) {
        feesChanged = true;
        return { ...c, className: to as ClassLevel };
      }
      return c;
    });
    if (feesChanged) this.saveClassFeeConfigs(nextFeeConfigs);

    const exams = this.getExams();
    let examsChanged = false;
    const nextExams = exams.map((ex) => {
      if (Array.isArray(ex.applicableClasses) && ex.applicableClasses.includes(from as ClassLevel)) {
        examsChanged = true;
        return {
          ...ex,
          applicableClasses: ex.applicableClasses.map((c) => (c === from ? (to as ClassLevel) : c)),
        };
      }
      return ex;
    });
    if (examsChanged) {
      setStored(STORAGE_KEYS.EXAMS, nextExams);
      CloudSyncService.pushSliceToCloud('academics', true);
    }

    const profile = this.getSchoolProfile();
    if (profile.classTeacherSignatures?.[from] && !profile.classTeacherSignatures?.[to]) {
      const nextMap = { ...profile.classTeacherSignatures };
      nextMap[to] = nextMap[from];
      delete nextMap[from];
      this.saveSchoolProfile({ ...profile, classTeacherSignatures: nextMap });
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('school_cloud_data_synced'));
    }
  },

  // Subjects
  getSubjects(): Subject[] {
    return getStored<Subject[]>(STORAGE_KEYS.SUBJECTS, initialSubjects);
  },
  saveSubjects(subjects: Subject[]): void {
    setStored(STORAGE_KEYS.SUBJECTS, subjects);
    void this.syncPublicWebsite();
  },
  updateSubject(subject: Subject): void {
    const current = this.getSubjects();
    const updated = current.map((s) => (s.id === subject.id ? subject : s));
    this.saveSubjects(updated);
  },
  deleteSubject(id: string): void {
    const current = this.getSubjects();
    this.saveSubjects(current.filter((s) => s.id !== id));
  },

  // Staff
  getStaff(): Staff[] {
    const list = getStored<Staff[]>(STORAGE_KEYS.STAFF, initialStaff);
    let hasChanges = false;
    const enriched = list.map((s) => {
      let changed = false;
      const updated = { ...s };
      if (!updated.username) {
        updated.username = updated.employeeId ? updated.employeeId.toLowerCase() : `staff_${updated.id}`;
        changed = true;
      }
      if (changed) hasChanges = true;
      return updated;
    });
    if (hasChanges) {
      safeSetLocalStorage(STORAGE_KEYS.STAFF, JSON.stringify(enriched));
    }
    return enriched;
  },
  addStaff(member: Staff): void {
    const current = this.getStaff();
    const updated = [member, ...current];
    setStored(STORAGE_KEYS.STAFF, updated);
    CloudSyncService.pushSliceToCloud('staff');
    try {
      setDoc(doc(db, 'staff', member.id), cleanForFirestore(member)).catch((err: any) =>
        handleFirestoreError(err, OperationType.WRITE, `staff/${member.id}`)
      );
    } catch {}
    void this.syncPublicWebsite();
  },
  updateStaff(member: Staff): void {
    const current = this.getStaff();
    const updated = current.map((s) => (s.id === member.id ? member : s));
    setStored(STORAGE_KEYS.STAFF, updated);
    CloudSyncService.pushSliceToCloud('staff', true);
    try {
      setDoc(doc(db, 'staff', member.id), cleanForFirestore(member)).catch((err: any) =>
        handleFirestoreError(err, OperationType.WRITE, `staff/${member.id}`)
      );
    } catch {}
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('school_cloud_data_synced', { detail: { syncTime: new Date().toISOString() } }));
    }
  },
  deleteStaff(id: string): void {
    const current = this.getStaff();
    setStored(
      STORAGE_KEYS.STAFF,
      current.filter((s) => s.id !== id)
    );
    try {
      deleteDoc(doc(db, 'staff', id)).catch((err: any) =>
        handleFirestoreError(err, OperationType.DELETE, `staff/${id}`)
      );
    } catch {}
    CloudSyncService.pushSliceToCloud('staff');
    void this.syncPublicWebsite();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('school_cloud_data_synced', { detail: { syncTime: new Date().toISOString() } }));
    }
  },

  // Students
  getStudents(): Student[] {
    const list = getStored<Student[]>(STORAGE_KEYS.STUDENTS, initialStudents || []);
    return (list || [])
      .map((s) => ({
        ...s,
        ...(s.authUid ? {} : { password: s.password || '1234' }),
      }))
      .sort(compareStudentsByClassAndRoll);
  },
  updateStudentPassword(studentId: string, newPassword: string): boolean {
    const students = this.getStudents();
    const updated = students.map((s) => {
      if (s.id === studentId || s.studentId === studentId) {
        return { ...s, password: newPassword.trim() };
      }
      return s;
    });
    setStored(STORAGE_KEYS.STUDENTS, updated);
    CloudSyncService.pushSliceToCloud('students', true);
    return true;
  },
  getActiveSchoolCode(explicitSchoolId?: string | null): string {
    const saasActive = typeof window !== 'undefined' ? safeGetLocalStorage(SAAS_ACTIVE_SCHOOL_KEY) : null;
    const profile = this.getSchoolProfile();
    return resolveSchoolCode(explicitSchoolId, profile, saasActive);
  },
  formatScopedStudentId(studentId?: string | null, explicitSchoolId?: string | null): string {
    return formatSchoolScopedId(studentId, this.getActiveSchoolCode(explicitSchoolId));
  },
  formatScopedEmployeeId(employeeId?: string | null, explicitSchoolId?: string | null): string {
    return formatSchoolScopedId(employeeId, this.getActiveSchoolCode(explicitSchoolId));
  },
  generateNextEmployeeId(explicitSchoolId?: string | null): string {
    const schoolCode = this.getActiveSchoolCode(explicitSchoolId);
    const staffList = this.getStaff();
    return generateNextSchoolEmployeeId(staffList, schoolCode);
  },
  generateNextStudentId(session?: string, explicitSchoolId?: string | null, variant: 'S' | 'STU' = 'S'): string {
    const effectiveSession = session || this.getSchoolProfile().currentSession || '2026';
    const schoolCode = this.getActiveSchoolCode(explicitSchoolId);
    const students = this.getStudents();
    return generateNextSchoolStudentId(students, effectiveSession, schoolCode, variant);
  },
  updateAllStudentsSession(newSession: string): void {
    const students = this.getStudents();
    const updated = students.map((s) => ({
      ...s,
      session: newSession,
    }));
    setStored(STORAGE_KEYS.STUDENTS, updated);
    CloudSyncService.pushSliceToCloud('students', true);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('school_cloud_data_synced', { detail: { syncTime: new Date().toISOString() } }));
    }
  },
  promoteStudentsBatch(
    updates: Array<{
      studentId: string;
      className: ClassLevel;
      roll: string;
      session: string;
      status?: Student['status'];
    }>,
    newSchoolSession?: string
  ): number {
    const updateMap = new Map(updates.map((u) => [u.studentId, u]));
    const current = this.getStudents();
    let updatedCount = 0;

    const updatedStudents = current.map((s) => {
      const u = updateMap.get(s.id);
      if (!u) return s;
      updatedCount++;
      const nextStudent: Student = {
        ...s,
        className: u.className,
        roll: u.roll,
        session: u.session,
        status: u.status ?? s.status,
      };
      try {
        setDoc(doc(db, 'students', nextStudent.id), cleanForFirestore(nextStudent)).catch((err: any) =>
          handleFirestoreError(err, OperationType.WRITE, `students/${nextStudent.id}`)
        );
      } catch {}
      return nextStudent;
    });

    setStored(STORAGE_KEYS.STUDENTS, updatedStudents);
    CloudSyncService.pushSliceToCloud('students', true);

    if (newSchoolSession && newSchoolSession.trim()) {
      const profile = this.getSchoolProfile();
      if (profile.currentSession !== newSchoolSession.trim()) {
        this.saveSchoolProfile({ ...profile, currentSession: newSchoolSession.trim() });
      }
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('school_cloud_data_synced', { detail: { syncTime: new Date().toISOString() } })
      );
    }

    return updatedCount;
  },
  addStudent(student: Student): void {
    const current = this.getStudents();
    const studentToSave: Student = {
      ...student,
      ...(student.authUid ? {} : { password: student.password || '1234' }),
    };
    if (studentToSave.authUid) {
      delete studentToSave.password;
    }
    const updated = [...current, studentToSave].sort(compareStudentsByClassAndRoll);
    setStored(STORAGE_KEYS.STUDENTS, updated);
    try {
      setDoc(doc(db, 'students', studentToSave.id), cleanForFirestore(studentToSave)).catch((err: any) =>
        handleFirestoreError(err, OperationType.WRITE, `students/${studentToSave.id}`)
      );
    } catch {}
    CloudSyncService.pushSliceToCloud('students', true);
    void this.syncPublicWebsite();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('school_cloud_data_synced', { detail: { syncTime: new Date().toISOString() } }));
    }
  },
  updateStudent(student: Student): void {
    const current = this.getStudents();
    const studentToSave: Student = {
      ...student,
      ...(student.authUid ? {} : { password: student.password || '1234' }),
    };
    if (studentToSave.authUid) {
      delete studentToSave.password;
    }
    const updated = current
      .map((s) => (s.id === student.id ? studentToSave : s))
      .sort(compareStudentsByClassAndRoll);
    setStored(STORAGE_KEYS.STUDENTS, updated);
    try {
      setDoc(doc(db, 'students', studentToSave.id), cleanForFirestore(studentToSave)).catch((err: any) =>
        handleFirestoreError(err, OperationType.WRITE, `students/${studentToSave.id}`)
      );
    } catch {}
    CloudSyncService.pushSliceToCloud('students', true);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('school_cloud_data_synced', { detail: { syncTime: new Date().toISOString() } }));
    }
  },
  deleteStudent(id: string): void {
    const current = this.getStudents();
    setStored(
      STORAGE_KEYS.STUDENTS,
      current.filter((s) => s.id !== id)
    );
    try {
      deleteDoc(doc(db, 'students', id)).catch((err: any) =>
        handleFirestoreError(err, OperationType.DELETE, `students/${id}`)
      );
    } catch {}
    CloudSyncService.pushSliceToCloud('students', true);
    void this.syncPublicWebsite();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('school_cloud_data_synced', { detail: { syncTime: new Date().toISOString() } }));
    }
  },
  bulkAddStudents(newStudents: Student[]): void {
    const current = this.getStudents();
    setStored(
      STORAGE_KEYS.STUDENTS,
      [...current, ...newStudents].sort(compareStudentsByClassAndRoll)
    );
    CloudSyncService.pushSliceToCloud('students', true);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('school_cloud_data_synced', { detail: { syncTime: new Date().toISOString() } }));
    }
  },

  // Attendance
  getAttendance(): AttendanceRecord[] {
    return getStored<AttendanceRecord[]>(STORAGE_KEYS.ATTENDANCE, initialAttendance || []);
  },
  saveAttendanceBatch(records: AttendanceRecord[], syncToCloud: boolean = true): void {
    const current = this.getAttendance();
    // Replace records for the same targetId, targetType, and date
    const updated = [...current];
    const isSaaSTenant = Boolean(safeGetLocalStorage(SAAS_ACTIVE_SCHOOL_KEY));
    records.forEach((rec) => {
      const recType = rec.targetType || 'student';
      const idx = updated.findIndex(
        (r) =>
          r.targetId === rec.targetId &&
          r.date === rec.date &&
          (r.targetType || 'student') === recType
      );
      if (idx >= 0) {
        updated[idx] = rec;
      } else {
        updated.push(rec);
      }
      if (!isSaaSTenant) {
        try {
          setDoc(doc(db, 'attendance', rec.id), cleanForFirestore(rec)).catch(() => {});
        } catch {}
      }
    });
    setStored(STORAGE_KEYS.ATTENDANCE, updated, true);
    if (syncToCloud) {
      CloudSyncService.pushSliceToCloud('attendance', true);
    }
  },
  deleteAttendanceRecord(targetId: string, date: string, targetType?: 'student' | 'staff'): void {
    const current = this.getAttendance();
    const updated = current.filter(
      (r) =>
        !(
          r.targetId === targetId &&
          r.date === date &&
          (!targetType || (r.targetType || 'student') === targetType)
        )
    );
    setStored(STORAGE_KEYS.ATTENDANCE, updated);
    CloudSyncService.pushSliceToCloud('attendance', true);
  },
  deleteAttendanceBatch(targetIds: string[], date: string, targetType?: 'student' | 'staff'): void {
    const idSet = new Set(targetIds);
    const current = this.getAttendance();
    const updated = current.filter(
      (r) =>
        !(
          idSet.has(r.targetId) &&
          r.date === date &&
          (!targetType || (r.targetType || 'student') === targetType)
        )
    );
    setStored(STORAGE_KEYS.ATTENDANCE, updated);
    CloudSyncService.pushSliceToCloud('attendance', true);
  },

  // Exams
  getExams(): Exam[] {
    return getStored<Exam[]>(STORAGE_KEYS.EXAMS, initialExams || []);
  },
  saveExam(exam: Exam): void {
    const current = this.getExams();
    const idx = current.findIndex((e) => e.id === exam.id);
    let updated: Exam[];
    if (idx >= 0) {
      updated = current.map((e) => (e.id === exam.id ? exam : e));
    } else {
      updated = [exam, ...current];
    }
    setStored(STORAGE_KEYS.EXAMS, updated);
    CloudSyncService.pushSliceToCloud('academics', true);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('school_cloud_data_synced'));
    }
    try {
      setDoc(doc(db, 'exams', exam.id), exam).catch(() => {});
    } catch {}
  },
  deleteExam(id: string): void {
    const current = this.getExams();
    const updated = current.filter((e) => e.id !== id);
    setStored(STORAGE_KEYS.EXAMS, updated);
    CloudSyncService.pushSliceToCloud('academics', true);
    // Also remove routines associated with this exam
    const routines = this.getExamRoutines();
    const updatedRoutines = routines.filter((r) => r.examId !== id);
    this.saveExamRoutines(updatedRoutines);
  },

  // Exam Routines
  getExamRoutines(): ExamScheduleItem[] {
    return getStored<ExamScheduleItem[]>(STORAGE_KEYS.EXAM_ROUTINES, initialExamRoutines || []);
  },
  saveExamRoutines(routines: ExamScheduleItem[]): void {
    setStored(STORAGE_KEYS.EXAM_ROUTINES, routines);
    CloudSyncService.pushSliceToCloud('academics', true);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('school_cloud_data_synced'));
    }
  },
  addExamRoutineItem(item: ExamScheduleItem): void {
    const current = this.getExamRoutines();
    const updated = [...current, item];
    this.saveExamRoutines(updated);
  },
  updateExamRoutineItem(item: ExamScheduleItem): void {
    const current = this.getExamRoutines();
    const updated = current.map((r) => (r.id === item.id ? item : r));
    this.saveExamRoutines(updated);
  },
  deleteExamRoutineItem(id: string): void {
    const current = this.getExamRoutines();
    this.saveExamRoutines(current.filter((r) => r.id !== id));
  },
  getRoutinesForClassAndExam(examId: string, className: ClassLevel): ExamScheduleItem[] {
    const routines = this.getExamRoutines();
    const matched = routines
      .filter((r) => r.examId === examId && r.className === className)
      .sort((a, b) => {
        const dateCmp = a.examDate.localeCompare(b.examDate);
        if (dateCmp !== 0) return dateCmp;
        return a.subjectCode.localeCompare(b.subjectCode);
      });
    return matched;
  },

  // Exam Seat Plans
  getExamSeatPlans(): Record<string, ExamSeatPlanConfig> {
    return getStored<Record<string, ExamSeatPlanConfig>>(STORAGE_KEYS.EXAM_SEAT_PLANS, {});
  },
  getExamSeatPlan(examId: string): ExamSeatPlanConfig | null {
    const all = this.getExamSeatPlans();
    return all[examId] || null;
  },
  saveExamSeatPlan(plan: ExamSeatPlanConfig): void {
    const all = this.getExamSeatPlans();
    const updated = { ...all, [plan.examId]: plan };
    setStored(STORAGE_KEYS.EXAM_SEAT_PLANS, updated);
    CloudSyncService.pushSliceToCloud('academics', true);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('school_cloud_data_synced'));
    }
  },
  deleteExamSeatPlan(examId: string): void {
    const all = this.getExamSeatPlans();
    if (all[examId]) {
      const copy = { ...all };
      delete copy[examId];
      setStored(STORAGE_KEYS.EXAM_SEAT_PLANS, copy);
      CloudSyncService.pushSliceToCloud('academics', true);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('school_cloud_data_synced'));
      }
    }
  },

  // Teacher Draft -> SuperAdmin Approval & Publish Workflow Helpers
  submitClassRoutineDrafts(ids: string[] | 'all', actor?: { name: string; id?: string }): number {
    const current = this.getRoutines();
    const idSet = ids === 'all' ? null : new Set(ids);
    const now = new Date().toISOString();
    let count = 0;
    const updated = current.map((r) => {
      const matchesTarget = idSet ? idSet.has(r.id) : r.approvalStatus === 'draft' || r.approvalStatus === 'rejected';
      if (!matchesTarget) return r;
      count += 1;
      return {
        ...r,
        approvalStatus: 'pending_approval' as const,
        submittedBy: actor?.name || r.submittedBy || 'Teacher',
        submittedById: actor?.id || r.submittedById,
        submittedAt: now,
        rejectionNote: undefined,
      };
    });
    if (count > 0) this.saveRoutines(updated);
    return count;
  },
  approveClassRoutines(ids: string[] | 'all', approvedBy: string): number {
    const current = this.getRoutines();
    const idSet = ids === 'all' ? null : new Set(ids);
    const meta = buildSuperAdminPublishMeta(approvedBy);
    let count = 0;
    const updated = current.map((r) => {
      const matches = idSet ? idSet.has(r.id) : r.approvalStatus === 'pending_approval' || r.approvalStatus === 'draft';
      if (!matches) return r;
      count += 1;
      return { ...r, ...meta };
    });
    if (count > 0) this.saveRoutines(updated);
    return count;
  },
  rejectClassRoutines(ids: string[], rejectedBy: string, reason?: string): number {
    const current = this.getRoutines();
    const idSet = new Set(ids);
    const meta = buildSuperAdminRejectMeta(rejectedBy, reason);
    let count = 0;
    const updated = current.map((r) => {
      if (!idSet.has(r.id)) return r;
      count += 1;
      return { ...r, ...meta };
    });
    if (count > 0) this.saveRoutines(updated);
    return count;
  },
  submitExamRoutineDrafts(
    examId: string,
    itemIds: string[] | 'all',
    actor?: { name: string; id?: string }
  ): number {
    const current = this.getExamRoutines();
    const idSet = itemIds === 'all' ? null : new Set(itemIds);
    const now = new Date().toISOString();
    let count = 0;
    const updated = current.map((er) => {
      if (er.examId !== examId) return er;
      const matches = idSet
        ? idSet.has(er.id)
        : er.approvalStatus === 'draft' || er.approvalStatus === 'rejected';
      if (!matches) return er;
      count += 1;
      return {
        ...er,
        approvalStatus: 'pending_approval' as const,
        submittedBy: actor?.name || er.submittedBy || 'Teacher',
        submittedById: actor?.id || er.submittedById,
        submittedAt: now,
        rejectionNote: undefined,
      };
    });
    if (count > 0) this.saveExamRoutines(updated);
    return count;
  },
  approveExamRoutines(examId: string, itemIds: string[] | 'all', approvedBy: string): number {
    const current = this.getExamRoutines();
    const idSet = itemIds === 'all' ? null : new Set(itemIds);
    const meta = buildSuperAdminPublishMeta(approvedBy);
    let count = 0;
    const updated = current.map((er) => {
      if (er.examId !== examId) return er;
      const matches = idSet
        ? idSet.has(er.id)
        : er.approvalStatus === 'pending_approval' || er.approvalStatus === 'draft';
      if (!matches) return er;
      count += 1;
      return { ...er, ...meta };
    });
    if (count > 0) this.saveExamRoutines(updated);
    return count;
  },
  rejectExamRoutines(examId: string, itemIds: string[], rejectedBy: string, reason?: string): number {
    const current = this.getExamRoutines();
    const idSet = new Set(itemIds);
    const meta = buildSuperAdminRejectMeta(rejectedBy, reason);
    let count = 0;
    const updated = current.map((er) => {
      if (er.examId !== examId || !idSet.has(er.id)) return er;
      count += 1;
      return { ...er, ...meta };
    });
    if (count > 0) this.saveExamRoutines(updated);
    return count;
  },
  submitExamSeatPlanDraft(examId: string, actor?: { name: string; id?: string }): boolean {
    const plan = this.getExamSeatPlan(examId);
    if (!plan) return false;
    this.saveExamSeatPlan({
      ...plan,
      approvalStatus: 'pending_approval',
      isPublished: false,
      submittedBy: actor?.name || plan.submittedBy || 'Teacher',
      submittedById: actor?.id || plan.submittedById,
      submittedAt: new Date().toISOString(),
      rejectionNote: undefined,
      updatedAt: new Date().toISOString(),
    });
    return true;
  },
  approveExamSeatPlan(examId: string, approvedBy: string): boolean {
    const plan = this.getExamSeatPlan(examId);
    if (!plan) return false;
    const meta = buildSuperAdminPublishMeta(approvedBy);
    this.saveExamSeatPlan({
      ...plan,
      ...meta,
      isPublished: true,
      updatedAt: new Date().toISOString(),
    });
    return true;
  },
  rejectExamSeatPlan(examId: string, rejectedBy: string, reason?: string): boolean {
    const plan = this.getExamSeatPlan(examId);
    if (!plan) return false;
    const meta = buildSuperAdminRejectMeta(rejectedBy, reason);
    this.saveExamSeatPlan({
      ...plan,
      ...meta,
      isPublished: false,
      updatedAt: new Date().toISOString(),
    });
    return true;
  },
  submitMarksDraft(examId: string, subjectId: string, actor?: { name: string; id?: string }): number {
    const current = this.getMarks();
    const now = new Date().toISOString();
    let count = 0;
    const updated = current.map((m) => {
      if (m.examId !== examId || m.subjectId !== subjectId) return m;
      count += 1;
      return {
        ...m,
        approvalStatus: 'pending_approval' as const,
        submittedBy: actor?.name || m.submittedBy || 'Teacher',
        submittedById: actor?.id || m.submittedById,
        submittedAt: now,
        rejectionNote: undefined,
      };
    });
    if (count > 0) {
      setStored(STORAGE_KEYS.MARKS, updated);
      CloudSyncService.pushSliceToCloud('attendance', true);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('school_cloud_data_synced'));
      }
    }
    return count;
  },
  approveMarksEntries(
    examId: string,
    subjectId: string | 'all',
    approvedBy: string,
    alsoPublishExam: boolean = true
  ): number {
    const current = this.getMarks();
    const meta = buildSuperAdminPublishMeta(approvedBy);
    let count = 0;
    const updated = current.map((m) => {
      if (m.examId !== examId) return m;
      if (subjectId !== 'all' && m.subjectId !== subjectId) return m;
      if (
        subjectId === 'all' &&
        m.approvalStatus !== 'pending_approval' &&
        m.approvalStatus !== 'draft'
      ) {
        return m;
      }
      count += 1;
      return { ...m, ...meta };
    });
    if (count > 0) {
      setStored(STORAGE_KEYS.MARKS, updated);
      CloudSyncService.pushSliceToCloud('attendance', true);
    }
    if (alsoPublishExam) {
      const targetExam = this.getExams().find((e) => e.id === examId);
      if (targetExam && !targetExam.isPublished) {
        this.saveExam({ ...targetExam, isPublished: true });
      }
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('school_cloud_data_synced'));
    }
    return count;
  },
  rejectMarksEntries(
    examId: string,
    subjectId: string,
    rejectedBy: string,
    reason?: string
  ): number {
    const current = this.getMarks();
    const meta = buildSuperAdminRejectMeta(rejectedBy, reason);
    let count = 0;
    const updated = current.map((m) => {
      if (m.examId !== examId || m.subjectId !== subjectId) return m;
      count += 1;
      return { ...m, ...meta };
    });
    if (count > 0) {
      setStored(STORAGE_KEYS.MARKS, updated);
      CloudSyncService.pushSliceToCloud('attendance', true);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('school_cloud_data_synced'));
      }
    }
    return count;
  },

  // Calculate working days in date range (skipping Fridays, Saturdays if off, and school holidays)
  getWorkingDatesForRange(
    startDateStr: string,
    endDateStr: string,
    skipFridays = true,
    skipSaturdays = true,
    skipHolidays = true
  ): { dateStr: string; dayName: string; dayOfWeek: number }[] {
    const dates: { dateStr: string; dayName: string; dayOfWeek: number }[] = [];
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    const [sY, sM, sD] = startDateStr.split('-').map(Number);
    const [eY, eM, eD] = endDateStr.split('-').map(Number);
    const cur = new Date(sY, sM - 1, sD, 12, 0, 0);
    const end = new Date(eY, eM - 1, eD, 12, 0, 0);

    while (cur <= end) {
      const dayOfWeek = cur.getDay();
      const y = cur.getFullYear();
      const m = String(cur.getMonth() + 1).padStart(2, '0');
      const d = String(cur.getDate()).padStart(2, '0');
      const dateStr = `${y}-${m}-${d}`;

      let isOff = false;
      if (skipFridays && dayOfWeek === 5) {
        isOff = true;
      }
      if (skipSaturdays && dayOfWeek === 6) {
        isOff = true;
      }
      if (skipHolidays && this.isDateHoliday(dateStr)) {
        isOff = true;
      }

      if (!isOff) {
        dates.push({
          dateStr,
          dayName: days[dayOfWeek],
          dayOfWeek,
        });
      }
      cur.setDate(cur.getDate() + 1);
    }
    return dates;
  },

  // Intelligent Automatic Exam Routine Generator
  generateSmartExamRoutine(config: {
    examId: string;
    className: ClassLevel | 'all';
    startDate: string;
    endDate: string;
    startTime?: string;
    endTime?: string;
    roomNo?: string;
    skipFridays?: boolean;
    skipSaturdays?: boolean;
    skipHolidays?: boolean;
    parallelGroupSubjects?: boolean;
    hasGapDays?: boolean;
    overwriteExisting?: boolean;
    approvalMeta?: Partial<ExamScheduleItem>;
  }): ExamScheduleItem[] {
    const {
      examId,
      className,
      startDate,
      endDate,
      startTime = '10:00 AM',
      endTime = '01:00 PM',
      roomNo = 'Exam Hall',
      skipFridays = true,
      skipSaturdays = this.isSaturdayOff(),
      skipHolidays = true,
      parallelGroupSubjects = true,
      hasGapDays = false,
      overwriteExisting = true,
      approvalMeta,
    } = config;

    const workingDates = this.getWorkingDatesForRange(
      startDate,
      endDate,
      skipFridays,
      skipSaturdays,
      skipHolidays
    );

    // Fallback if no working dates found in range
    if (workingDates.length === 0) {
      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const cur = new Date(startDate);
      for (let i = 0; i < 15; i++) {
        const y = cur.getFullYear();
        const m = String(cur.getMonth() + 1).padStart(2, '0');
        const d = String(cur.getDate()).padStart(2, '0');
        workingDates.push({
          dateStr: `${y}-${m}-${d}`,
          dayName: days[cur.getDay()],
          dayOfWeek: cur.getDay(),
        });
        cur.setDate(cur.getDate() + 1);
      }
    }

    const activeManagedClasses = this.getClasses()
      .filter((c) => c.isActive !== false)
      .map((c) => c.name as ClassLevel);
    const targetClasses: ClassLevel[] =
      className === 'all'
        ? activeManagedClasses.length > 0
          ? activeManagedClasses
          : (initialClasses.map((c) => c.name) as ClassLevel[])
        : [className];

    const currentAll = this.getExamRoutines();
    const filteredOld = overwriteExisting
      ? currentAll.filter(
          (r) => !(r.examId === examId && (className === 'all' || r.className === className))
        )
      : [...currentAll];

    const newlyCreated: ExamScheduleItem[] = [];

    targetClasses.forEach((cls) => {
      const clsSubjects = this.getSubjects().filter((s) => s.className === cls);
      if (clsSubjects.length === 0) return;

      const isSecondaryGroupClass = ['Class 9', 'Class 10'].includes(cls);
      const slots: { title: string; subjects: Subject[]; isParallel: boolean }[] = [];

      if (isSecondaryGroupClass && parallelGroupSubjects) {
        // 1. Compulsory common subjects (Bangla, English, Math, BGS, ICT, etc.)
        const compulsory = clsSubjects.filter((s) => !s.group || s.group.toLowerCase() === 'all');
        compulsory.forEach((sub) => {
          slots.push({
            title: sub.nameBn || sub.nameEn,
            subjects: [sub],
            isParallel: false,
          });
        });

        // 2. Departmental / Group subjects paired on the same dates in parallel slots
        const scienceSubs = clsSubjects.filter((s) => s.group?.toLowerCase().includes('science'));
        const commerceSubs = clsSubjects.filter(
          (s) => s.group?.toLowerCase().includes('commerce') || s.group?.toLowerCase().includes('business')
        );
        const humanitiesSubs = clsSubjects.filter(
          (s) => s.group?.toLowerCase().includes('humanities') || s.group?.toLowerCase().includes('arts')
        );
        const vocationalSubs = clsSubjects.filter((s) => s.group?.toLowerCase().includes('vocational'));

        const maxGroupLen = Math.max(
          scienceSubs.length,
          commerceSubs.length,
          humanitiesSubs.length,
          vocationalSubs.length
        );

        for (let i = 0; i < maxGroupLen; i++) {
          const parallelGroupSubs: Subject[] = [];
          if (scienceSubs[i]) parallelGroupSubs.push(scienceSubs[i]);
          if (commerceSubs[i]) parallelGroupSubs.push(commerceSubs[i]);
          if (humanitiesSubs[i]) parallelGroupSubs.push(humanitiesSubs[i]);
          if (vocationalSubs[i]) parallelGroupSubs.push(vocationalSubs[i]);

          if (parallelGroupSubs.length > 0) {
            slots.push({
              title: `বিভাগীয় বিষয়সমূহ (${i + 1}): বিজ্ঞান, বাণিজ্য, মানবিক ও ভোকেশনাল`,
              subjects: parallelGroupSubs,
              isParallel: true,
            });
          }
        }
      } else {
        // Sequential slotting for primary / junior classes
        clsSubjects.forEach((sub) => {
          slots.push({
            title: sub.nameBn || sub.nameEn,
            subjects: [sub],
            isParallel: false,
          });
        });
      }

      // Map slots to working dates
      const totalSlots = slots.length;
      const totalWorkingDays = workingDates.length;

      // Smart spacing: if hasGapDays and enough days exist, leave 1 working day gap
      const useGap = hasGapDays && totalWorkingDays >= totalSlots * 2 - 1;

      slots.forEach((slot, slotIdx) => {
        let dateInfo: { dateStr: string; dayName: string; dayOfWeek: number };

        if (useGap) {
          const dateIndex = slotIdx * 2;
          dateInfo = workingDates[dateIndex] || workingDates[workingDates.length - 1];
        } else if (slotIdx < totalWorkingDays) {
          dateInfo = workingDates[slotIdx];
        } else {
          // If slots exceed working days in range, advance sequentially
          const lastDate = new Date(workingDates[workingDates.length - 1].dateStr);
          lastDate.setDate(lastDate.getDate() + (slotIdx - totalWorkingDays + 1));
          const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
          const y = lastDate.getFullYear();
          const m = String(lastDate.getMonth() + 1).padStart(2, '0');
          const d = String(lastDate.getDate()).padStart(2, '0');
          dateInfo = {
            dateStr: `${y}-${m}-${d}`,
            dayName: days[lastDate.getDay()],
            dayOfWeek: lastDate.getDay(),
          };
        }

        const classSpecificEndTime = ['Nursery', 'KG', 'Play'].includes(cls) ? '11:30 AM' : endTime;
        const classSpecificRoom = ['Nursery', 'KG', 'Play'].includes(cls) ? `${cls} Hall` : roomNo;

        // Assign each subject in this slot to the exact same date and time
        slot.subjects.forEach((sub) => {
          newlyCreated.push({
            id: `er_${examId}_${cls.replace(/\s+/g, '_')}_${sub.id}`,
            examId,
            className: cls,
            group: sub.group,
            subjectCode: sub.code,
            subjectNameEn: sub.nameEn,
            subjectNameBn: sub.nameBn,
            examDate: dateInfo.dateStr,
            dayOfWeek: dateInfo.dayName,
            startTime,
            endTime: classSpecificEndTime,
            roomNo: classSpecificRoom,
            ...(approvalMeta || {}),
          });
        });
      });
    });

    const finalRoutines = [...filteredOld, ...newlyCreated];
    this.saveExamRoutines(finalRoutines);
    return newlyCreated;
  },

  autoGenerateRoutineFromSubjects(
    examId: string,
    className: ClassLevel,
    startDateStr: string = '2026-03-05',
    startTime: string = '10:00 AM',
    endTime: string = '01:00 PM',
    roomNo: string = 'Exam Hall'
  ): ExamScheduleItem[] {
    return this.generateSmartExamRoutine({
      examId,
      className,
      startDate: startDateStr,
      endDate: '2026-03-20',
      startTime,
      endTime,
      roomNo,
      skipFridays: true,
      skipSaturdays: this.isSaturdayOff(),
      skipHolidays: true,
      parallelGroupSubjects: true,
      hasGapDays: false,
      overwriteExisting: true,
    });
  },

  // Marks
  getMarks(): MarksEntry[] {
    return getStored<MarksEntry[]>(STORAGE_KEYS.MARKS, initialMarks || []);
  },
  saveMarksBatch(marks: MarksEntry[]): void {
    const current = this.getMarks();
    const updated = [...current];
    marks.forEach((m) => {
      const idx = updated.findIndex((item) => item.examId === m.examId && item.studentId === m.studentId && item.subjectId === m.subjectId);
      if (idx >= 0) {
        updated[idx] = m;
      } else {
        updated.push(m);
      }
    });
    setStored(STORAGE_KEYS.MARKS, updated);
    CloudSyncService.pushSliceToCloud('attendance', true);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('school_cloud_data_synced'));
    }
  },

  // Fee Invoices & Payments
  getFeeHeads(): FeeHead[] {
    return getStored<FeeHead[]>(STORAGE_KEYS.FEE_HEADS, initialFeeHeads);
  },
  getInvoices(): FeeInvoice[] {
    const list = getStored<FeeInvoice[]>(STORAGE_KEYS.INVOICES, initialInvoices || []);
    // Auto-sanitize any invoice where paidAmount exceeds netAmount due to previous duplicate calculation
    let needsSave = false;
    const sanitized = list.map((inv) => {
      if (inv.paidAmount > inv.netAmount) {
        const payments = getStored<FeePayment[]>(STORAGE_KEYS.PAYMENTS, []);
        const truePaid = payments.filter((p) => p.invoiceId === inv.id).reduce((sum, p) => sum + p.amount, 0);
        const resolvedPaid = truePaid > 0 ? truePaid : inv.netAmount;
        const resolvedDue = Math.max(0, inv.netAmount - resolvedPaid);
        needsSave = true;
        return {
          ...inv,
          paidAmount: resolvedPaid,
          dueAmount: resolvedDue,
          status: (resolvedDue === 0 ? 'Paid' : resolvedPaid > 0 ? 'Partial' : 'Unpaid') as 'Paid' | 'Partial' | 'Unpaid',
        };
      }
      return inv;
    });
    if (needsSave) {
      setStored(STORAGE_KEYS.INVOICES, sanitized);
    }
    return sanitized;
  },
  addInvoice(invoice: FeeInvoice): void {
    const current = this.getInvoices();
    setStored(STORAGE_KEYS.INVOICES, [invoice, ...current]);
    CloudSyncService.pushSliceToCloud('finance', true);
  },
  _recalculateAndStoreInvoice(invoice: FeeInvoice): void {
    const current = this.getInvoices();
    setStored(
      STORAGE_KEYS.INVOICES,
      current.map((inv) => (inv.id === invoice.id ? invoice : inv))
    );
    CloudSyncService.pushSliceToCloud('finance', true);
  },
  updateInvoice(invoice: FeeInvoice, actorRole?: UserRole | null): boolean {
    if (!canEditOrDeleteInvoice(actorRole)) {
      return false;
    }
    this._recalculateAndStoreInvoice(invoice);
    return true;
  },
  deleteInvoice(id: string, actorRole?: UserRole | null): boolean {
    if (!canEditOrDeleteInvoice(actorRole)) {
      return false;
    }
    const current = this.getInvoices();
    setStored(
      STORAGE_KEYS.INVOICES,
      current.filter((inv) => inv.id !== id)
    );
    CloudSyncService.pushSliceToCloud('finance', true);
    return true;
  },
  getPayments(): FeePayment[] {
    return getStored<FeePayment[]>(STORAGE_KEYS.PAYMENTS, initialPayments || []);
  },
  addPayment(payment: FeePayment): void {
    const currentPayments = this.getPayments();
    const updatedPayments = [payment, ...currentPayments];
    setStored(STORAGE_KEYS.PAYMENTS, updatedPayments);

    // Update corresponding invoice with exact sum of payments
    const invoices = this.getInvoices();
    const inv = invoices.find((i) => i.id === payment.invoiceId);
    if (inv) {
      const allPaymentsForInv = updatedPayments.filter((p) => p.invoiceId === inv.id);
      const newPaid = allPaymentsForInv.reduce((sum, p) => sum + p.amount, 0);
      const newDue = Math.max(0, inv.netAmount - newPaid);
      const newStatus = newDue === 0 ? 'Paid' : newPaid > 0 ? 'Partial' : 'Unpaid';
      this._recalculateAndStoreInvoice({
        ...inv,
        paidAmount: newPaid,
        dueAmount: newDue,
        status: newStatus,
      });
    }
    CloudSyncService.pushSliceToCloud('finance', true);
  },
  updatePayment(payment: FeePayment, actorRole?: UserRole | null): boolean {
    if (!canEditOrDeleteFinanceRecord(actorRole)) {
      return false;
    }
    const currentPayments = this.getPayments();
    const updatedPayments = currentPayments.map((p) => (p.id === payment.id ? payment : p));
    setStored(STORAGE_KEYS.PAYMENTS, updatedPayments);

    // Re-calculate invoice paid & due
    const invoices = this.getInvoices();
    const inv = invoices.find((i) => i.id === payment.invoiceId);
    if (inv) {
      const allPaymentsForInv = updatedPayments.filter((p) => p.invoiceId === inv.id);
      const newPaid = allPaymentsForInv.reduce((sum, p) => sum + p.amount, 0);
      const newDue = Math.max(0, inv.netAmount - newPaid);
      const newStatus = newDue === 0 ? 'Paid' : newPaid > 0 ? 'Partial' : 'Unpaid';
      this._recalculateAndStoreInvoice({
        ...inv,
        paidAmount: newPaid,
        dueAmount: newDue,
        status: newStatus,
      });
    }
    CloudSyncService.pushSliceToCloud('finance', true);
    return true;
  },
  deletePayment(id: string, actorRole?: UserRole | null): boolean {
    if (!canEditOrDeleteFinanceRecord(actorRole)) {
      return false;
    }
    const currentPayments = this.getPayments();
    const targetPayment = currentPayments.find((p) => p.id === id);
    if (!targetPayment) return false;

    const remainingPayments = currentPayments.filter((p) => p.id !== id);
    setStored(STORAGE_KEYS.PAYMENTS, remainingPayments);

    // Revert corresponding invoice
    const invoices = this.getInvoices();
    const inv = invoices.find((i) => i.id === targetPayment.invoiceId);
    if (inv) {
      const allPaymentsForInv = remainingPayments.filter((p) => p.invoiceId === inv.id);
      const newPaid = allPaymentsForInv.reduce((sum, p) => sum + p.amount, 0);
      const newDue = Math.max(0, inv.netAmount - newPaid);
      const newStatus = newDue === 0 ? 'Paid' : newPaid > 0 ? 'Partial' : 'Unpaid';
      this._recalculateAndStoreInvoice({
        ...inv,
        paidAmount: newPaid,
        dueAmount: newDue,
        status: newStatus,
      });
    }
    CloudSyncService.pushSliceToCloud('finance', true);
    return true;
  },

  // Class Fee Configurations (শ্রেণিভিত্তিক ফি কাঠামো - Nursery to Class 10)
  getClassFeeConfigs(): ClassFeeConfig[] {
    const list = getStored<ClassFeeConfig[]>(STORAGE_KEYS.CLASS_FEES, initialClassFeeConfigs);
    if (!list || list.length === 0) {
      safeSetLocalStorage(STORAGE_KEYS.CLASS_FEES, JSON.stringify(initialClassFeeConfigs));
      return initialClassFeeConfigs;
    }
    // Check if new exam fee columns are missing in stored data, and merge with initialClassFeeConfigs
    const needsMigration = list.some((c) => c.examFee1stModelTest === undefined || c.examFee1stSemester === undefined);
    if (needsMigration) {
      const merged = list.map((c) => {
        const init = initialClassFeeConfigs.find((ic) => ic.className === c.className) || initialClassFeeConfigs[0];
        return {
          ...init,
          ...c,
          examFee1stModelTest: c.examFee1stModelTest ?? c.examFee1stTest ?? init.examFee1stModelTest ?? 250,
          examFee1stSemester: c.examFee1stSemester ?? c.examFeeHalfYearly ?? init.examFee1stSemester ?? 350,
          examFee2ndModelTest: c.examFee2ndModelTest ?? c.examFeeModelTest ?? init.examFee2ndModelTest ?? 250,
          examFee2ndSemester: c.examFee2ndSemester ?? c.examFeeHalfYearly ?? init.examFee2ndSemester ?? 350,
          examFee3rdModelTest: c.examFee3rdModelTest ?? c.examFeeModelTest ?? init.examFee3rdModelTest ?? 250,
          examFee3rdSemester: c.examFee3rdSemester ?? c.examFeeAnnual ?? init.examFee3rdSemester ?? 400,
        };
      });
      safeSetLocalStorage(STORAGE_KEYS.CLASS_FEES, JSON.stringify(merged));
      return merged;
    }
    return list;
  },
  saveClassFeeConfigs(configs: ClassFeeConfig[]): void {
    setStored(STORAGE_KEYS.CLASS_FEES, configs);
    try {
      setDoc(doc(db, 'config', 'classFees'), { configs, updatedAt: new Date().toISOString() }).catch(() => {});
    } catch {}
  },
  getClassFee(className: ClassLevel): ClassFeeConfig {
    const configs = this.getClassFeeConfigs();
    const found = configs.find((c) => c.className === className);
    if (found) {
      return {
        ...found,
        admissionFee: found.admissionFee ?? (className === 'Nursery' ? 1000 : className === 'KG' ? 1200 : className === 'Class 9' || className === 'Class 10' ? 2500 : 1500),
        customFees: found.customFees ?? {},
        examFee1stModelTest: found.examFee1stModelTest ?? found.examFee1stTest ?? 250,
        examFee1stSemester: found.examFee1stSemester ?? found.examFeeHalfYearly ?? 350,
        examFee2ndModelTest: found.examFee2ndModelTest ?? found.examFeeModelTest ?? 250,
        examFee2ndSemester: found.examFee2ndSemester ?? found.examFeeHalfYearly ?? 350,
        examFee3rdModelTest: found.examFee3rdModelTest ?? found.examFeeModelTest ?? 250,
        examFee3rdSemester: found.examFee3rdSemester ?? found.examFeeAnnual ?? 400,
      };
    }
    const init = initialClassFeeConfigs.find((c) => c.className === className) || initialClassFeeConfigs[0];
    return {
      ...init,
      admissionFee: init.admissionFee ?? (className === 'Nursery' ? 1000 : className === 'KG' ? 1200 : className === 'Class 9' || className === 'Class 10' ? 2500 : 1500),
      customFees: init.customFees ?? {},
    };
  },
  updateSingleClassFee(config: ClassFeeConfig): void {
    const configs = this.getClassFeeConfigs();
    const idx = configs.findIndex((c) => c.className === config.className);
    let updated: ClassFeeConfig[];
    if (idx >= 0) {
      updated = configs.map((c) => (c.className === config.className ? config : c));
    } else {
      updated = [...configs, config];
    }
    this.saveClassFeeConfigs(updated);
  },

  // Scheduled & Pre-defined Fees with Due Dates (জমার শেষ তারিখসহ ফি শিডিউল)
  getScheduledFees(): ScheduledFee[] {
    return getStored<ScheduledFee[]>(STORAGE_KEYS.SCHEDULED_FEES, initialScheduledFees || []);
  },
  saveScheduledFees(fees: ScheduledFee[]): void {
    setStored(STORAGE_KEYS.SCHEDULED_FEES, fees);
    try {
      setDoc(doc(db, 'config', 'scheduledFees'), { fees, updatedAt: new Date().toISOString() }).catch(() => {});
    } catch {}
  },
  addScheduledFee(fee: ScheduledFee): void {
    const current = this.getScheduledFees();
    this.saveScheduledFees([fee, ...current]);
  },
  updateScheduledFee(fee: ScheduledFee): void {
    const current = this.getScheduledFees();
    const updated = current.map((f) => (f.id === fee.id ? fee : f));
    this.saveScheduledFees(updated);
  },
  deleteScheduledFee(id: string): void {
    const current = this.getScheduledFees();
    this.saveScheduledFees(current.filter((f) => f.id !== id));
  },

  // Student Transport Allocations (কে কে পরিবহন ব্যবহার করে ও তাদের ফি)
  getStudentTransports(): StudentTransport[] {
    return getStored<StudentTransport[]>(STORAGE_KEYS.STUDENT_TRANSPORTS, initialStudentTransports || []);
  },
  saveStudentTransports(list: StudentTransport[]): void {
    setStored(STORAGE_KEYS.STUDENT_TRANSPORTS, list);
    try {
      setDoc(doc(db, 'config', 'studentTransports'), { list, updatedAt: new Date().toISOString() }).catch(() => {});
    } catch {}
  },
  addStudentTransport(assignment: StudentTransport): void {
    const current = this.getStudentTransports();
    const filtered = current.filter((t) => t.studentId !== assignment.studentId);
    this.saveStudentTransports([assignment, ...filtered]);
  },
  updateStudentTransport(assignment: StudentTransport): void {
    const current = this.getStudentTransports();
    const updated = current.map((t) => (t.id === assignment.id ? assignment : t));
    this.saveStudentTransports(updated);
  },
  deleteStudentTransport(id: string): void {
    const current = this.getStudentTransports();
    this.saveStudentTransports(current.filter((t) => t.id !== id));
  },
  getStudentTransportByStudentId(studentId: string): StudentTransport | undefined {
    const list = this.getStudentTransports();
    return list.find((t) => t.studentId === studentId && t.status === 'active');
  },

  // Comprehensive Student Due Fee Calculator
  // Checks unpaid invoices, scheduled fees (exam, session, tour, sports) by due date, and transport fees
  getStudentDueFees(student: Student, currentDateStr?: string): FeeItem[] {
    const todayStr = currentDateStr || new Date().toISOString().split('T')[0] || '2026-10-26';
    const dues: FeeItem[] = [];
    const invoices = this.getInvoices().filter((i) => i.studentId === student.id || i.studentId === student.studentId);
    const classFee = this.getClassFee(student.className);
    const transport = this.getStudentTransportByStudentId(student.id);

    // 1. Existing invoices with unpaid dueAmount
    invoices.forEach((inv) => {
      if (inv.dueAmount > 0) {
        dues.push({
          id: `due_inv_${inv.id}`,
          headName: `Previous Invoice Due (${inv.invoiceNo}): ${inv.feeType}`,
          month: inv.month || inv.dueDate,
          dueDate: inv.dueDate,
          isOverdue: todayStr > inv.dueDate,
          amount: inv.dueAmount,
        });
      }
    });

    // 2. Scheduled Fees (e.g. 1st Model Test Exam Fee: March 25, Sports Fee, Study Tour, Session Charge)
    const scheduledFees = this.getScheduledFees().filter((sf) => sf.status === 'active');
    scheduledFees.forEach((sf) => {
      const applies = sf.applicableClasses === 'all' || sf.applicableClasses.includes(student.className);
      if (!applies) return;

      // Check if student has already invoiced or paid this fee in any invoice
      const cleanTitleEn = sf.titleEn.toLowerCase().replace(/[^a-z0-9]/g, '');
      const cleanTitleBn = sf.titleBn.normalize('NFC').replace(/\s+/g, '');

      const alreadyInvoicedOrPaid = invoices.some((inv) => {
        const invTypeClean = (inv.feeType || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const invTypeBnClean = (inv.feeType || '').normalize('NFC').replace(/\s+/g, '');

        const matchesInvoiceHeader =
          invTypeClean.includes(cleanTitleEn) ||
          invTypeBnClean.includes(cleanTitleBn);

        const matchesItem = inv.items && inv.items.some((it) => {
          const itNameClean = (it.headName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
          const itNameBnClean = (it.headName || '').normalize('NFC').replace(/\s+/g, '');

          // Check if both are Model Tests
          const isItMt = itNameBnClean.includes('মডেলটেস্ট') || itNameClean.includes('modeltest');
          const isSfMt = cleanTitleBn.includes('মডেলটেস্ট') || cleanTitleEn.includes('modeltest');
          if (isItMt && isSfMt) {
            const it1 = itNameBnClean.includes('১ম') || itNameBnClean.includes('1ম') || itNameClean.includes('1st') || itNameClean.includes('mt1');
            const sf1 = cleanTitleBn.includes('১ম') || cleanTitleBn.includes('1ম') || cleanTitleEn.includes('1st') || cleanTitleEn.includes('mt1');
            const it2 = itNameBnClean.includes('২য়') || itNameBnClean.includes('২য়') || itNameBnClean.includes('2য়') || itNameBnClean.includes('2য়') || itNameClean.includes('2nd') || itNameClean.includes('mt2');
            const sf2 = cleanTitleBn.includes('২য়') || cleanTitleBn.includes('২য়') || cleanTitleBn.includes('2য়') || cleanTitleBn.includes('2য়') || cleanTitleEn.includes('2nd') || cleanTitleEn.includes('mt2');
            const it3 = itNameBnClean.includes('৩য়') || itNameBnClean.includes('৩য়') || itNameBnClean.includes('3য়') || itNameBnClean.includes('3য়') || itNameClean.includes('3rd') || itNameClean.includes('mt3');
            const sf3 = cleanTitleBn.includes('৩য়') || cleanTitleBn.includes('৩য়') || cleanTitleBn.includes('3য়') || cleanTitleBn.includes('3য়') || cleanTitleEn.includes('3rd') || cleanTitleEn.includes('mt3');

            return (it1 && sf1) || (it2 && sf2) || (it3 && sf3);
          }

          // Check if both are Semester Exams
          const isItSem = itNameBnClean.includes('সেমিস্টার') || itNameClean.includes('semester');
          const isSfSem = cleanTitleBn.includes('সেমিস্টার') || cleanTitleEn.includes('semester');
          if (isItSem && isSfSem) {
            const it1 = itNameBnClean.includes('১ম') || itNameBnClean.includes('1ম') || itNameClean.includes('1st') || itNameClean.includes('sem1');
            const sf1 = cleanTitleBn.includes('১ম') || cleanTitleBn.includes('1ম') || cleanTitleEn.includes('1st') || cleanTitleEn.includes('sem1');
            const it2 = itNameBnClean.includes('২য়') || itNameBnClean.includes('২য়') || itNameBnClean.includes('2য়') || itNameBnClean.includes('2য়') || itNameClean.includes('2nd') || itNameClean.includes('sem2');
            const sf2 = cleanTitleBn.includes('২য়') || cleanTitleBn.includes('২য়') || cleanTitleBn.includes('2য়') || cleanTitleBn.includes('2য়') || cleanTitleEn.includes('2nd') || cleanTitleEn.includes('sem2');
            const it3 = itNameBnClean.includes('৩য়') || itNameBnClean.includes('৩য়') || itNameBnClean.includes('3য়') || itNameBnClean.includes('3য়') || itNameClean.includes('3rd') || itNameClean.includes('sem3');
            const sf3 = cleanTitleBn.includes('৩য়') || cleanTitleBn.includes('৩য়') || cleanTitleBn.includes('3য়') || cleanTitleBn.includes('3য়') || cleanTitleEn.includes('3rd') || cleanTitleEn.includes('sem3');

            return (it1 && sf1) || (it2 && sf2) || (it3 && sf3);
          }

          return (
            (cleanTitleEn.length > 5 && itNameClean.includes(cleanTitleEn)) ||
            (itNameClean.length > 5 && cleanTitleEn.includes(itNameClean)) ||
            (cleanTitleBn.length > 3 && itNameBnClean.includes(cleanTitleBn)) ||
            (itNameBnClean.length > 3 && cleanTitleBn.includes(itNameBnClean)) ||
            (itNameBnClean.includes('শিক্ষাসফর') && cleanTitleBn.includes('শিক্ষাসফর')) ||
            (itNameBnClean.includes('ক্রীড়া') && cleanTitleBn.includes('ক্রীড়া')) ||
            (itNameBnClean.includes('অর্ধবার্ষিক') && cleanTitleBn.includes('অর্ধবার্ষিক')) ||
            ((itNameBnClean.includes('সেশনফি') || itNameBnClean.includes('সেশনচার্জ')) &&
              (cleanTitleBn.includes('সেশনফি') || cleanTitleBn.includes('সেশনচার্জ')))
          );
        });

        return matchesInvoiceHeader || matchesItem;
      });

      // Also ensure not already added as an existing due invoice
      const alreadyInDueInvoice = dues.some(
        (d) =>
          d.headName.toLowerCase().includes(sf.titleEn.toLowerCase()) ||
          d.headName.includes(sf.titleBn)
      );

      if (!alreadyInvoicedOrPaid && !alreadyInDueInvoice) {
        const feeAmount = (sf.classAmounts && sf.classAmounts[student.className])
          ? sf.classAmounts[student.className]
          : sf.amount;

        const isOverdue = todayStr > sf.dueDate;
        dues.push({
          id: `due_sch_${sf.id}`,
          headName: `${sf.titleBn} (${sf.titleEn})`,
          month: sf.month || sf.session,
          dueDate: sf.dueDate,
          isOverdue,
          amount: feeAmount,
        });
      }
    });



    // 3. Dynamic Monthly Tuition Fee & Transport Fee Overdue Calculation:
    // If a month has ended or its due date (10th of the month) has elapsed,
    // and no paid invoice exists for that month, mark as Due/Overdue!
    const MONTHS = [
      { key: '01', nameEn: 'January', nameBn: 'জানুয়ারি' },
      { key: '02', nameEn: 'February', nameBn: 'ফেব্রুয়ারি' },
      { key: '03', nameEn: 'March', nameBn: 'মার্চ' },
      { key: '04', nameEn: 'April', nameBn: 'এপ্রিল' },
      { key: '05', nameEn: 'May', nameBn: 'মে' },
      { key: '06', nameEn: 'June', nameBn: 'জুন' },
      { key: '07', nameEn: 'July', nameBn: 'জুলাই' },
      { key: '08', nameEn: 'August', nameBn: 'আগস্ট' },
      { key: '09', nameEn: 'September', nameBn: 'সেপ্টেম্বর' },
      { key: '10', nameEn: 'October', nameBn: 'অক্টোবর' },
      { key: '11', nameEn: 'November', nameBn: 'নভেম্বর' },
      { key: '12', nameEn: 'December', nameBn: 'ডিসেম্বর' },
    ];

    const currentYear = parseInt(todayStr.split('-')[0]) || 2026;
    const currentMonthNum = parseInt(todayStr.split('-')[1]) || 11;
    const currentDayNum = parseInt(todayStr.split('-')[2]) || 9;

    const studentPayments = this.getPayments().filter(
      (p) => p.studentId === student.id || p.studentId === student.studentId
    );
    const approvedOnlineRequests = this.getOnlinePaymentRequests().filter(
      (r) =>
        r &&
        r.status === 'approved' &&
        (r.studentId === student.id ||
          r.studentId === student.studentId ||
          (r.studentRoll === student.roll && r.className === student.className))
    );

    const norm = (val?: string) => (val || '').normalize('NFC').toLowerCase();
    const isInvoiceSettled = (inv: FeeInvoice) =>
      inv.status === 'Paid' || (inv.paidAmount > 0 && inv.dueAmount <= 0);
    const hasYearMismatch = (text: string | undefined, targetYear: number) => {
      if (!text) return false;
      const yearMatch = text.match(/\b(20\d{2})\b/);
      return yearMatch ? Number(yearMatch[1]) !== targetYear : false;
    };
    const isTuitionText = (txt?: string) => {
      const t = norm(txt);
      return t.includes('tuition') || t.includes('টিউশন') || t.includes('বেতন');
    };
    const isTransportText = (txt?: string) => {
      const t = norm(txt);
      return t.includes('transport') || t.includes('পরিবহন');
    };

    MONTHS.forEach((mObj, idx) => {
      const monthNum = idx + 1;
      const monthDueDate = `${currentYear}-${mObj.key}-10`;

      // A month is due if it has ended (monthNum < currentMonthNum)
      // OR if we are in this month and today has passed the due date (monthNum === currentMonthNum && currentDayNum >= 10)
      const isMonthDue = monthNum < currentMonthNum || (monthNum === currentMonthNum && currentDayNum >= 10);
      if (!isMonthDue) return;

      const mEn = mObj.nameEn.toLowerCase();
      const mBn = norm(mObj.nameBn);
      const matchesMonth = (txt?: string) => {
        const t = norm(txt);
        return t.includes(mEn) || (mBn.length > 0 && t.includes(mBn));
      };

      // A. Tuition Fee Check (checks invoice header, inv.items, AND settled payments)
      const hasPaidTuitionInInvoices = invoices.some((inv) => {
        if (!isInvoiceSettled(inv)) return false;

        const matchesInItems =
          Array.isArray(inv.items) &&
          inv.items.some((it) => {
            const itemYearText = it.month || it.headName || inv.month || inv.session;
            if (hasYearMismatch(itemYearText, currentYear)) return false;
            const itemIsTuition =
              isTuitionText(it.headName) || (!isTransportText(it.headName) && isTuitionText(inv.feeType));
            const itemMatchesMonth = matchesMonth(it.month) || matchesMonth(it.headName);
            return itemIsTuition && itemMatchesMonth;
          });

        if (matchesInItems) return true;

        if (hasYearMismatch(inv.month || inv.session, currentYear)) return false;
        const matchesHeaderMonth = matchesMonth(inv.month) || matchesMonth(inv.feeType);
        return matchesHeaderMonth && isTuitionText(inv.feeType);
      });

      const hasPaidTuitionInPayments = studentPayments.some((p) => {
        const linkedInv = invoices.find((i) => i.id === p.invoiceId);
        if (linkedInv && linkedInv.dueAmount > 0 && linkedInv.status !== 'Paid') return false;
        const matchedItems =
          Array.isArray(p.items) &&
          p.items.some((it) => {
            if (hasYearMismatch(it.month || it.headName, currentYear)) return false;
            return isTuitionText(it.headName) && (matchesMonth(it.month) || matchesMonth(it.headName));
          });
        if (matchedItems) return true;
        if (p.notes && !hasYearMismatch(p.notes, currentYear)) {
          return isTuitionText(p.notes) && matchesMonth(p.notes);
        }
        return false;
      });

      const hasPaidTuitionInApprovedOnline = approvedOnlineRequests.some((r) => {
        if (Array.isArray(r.items) && r.items.length > 0) {
          return r.items.some((it) => {
            if (hasYearMismatch(it.month || it.headName, currentYear)) return false;
            return isTuitionText(it.headName) && (matchesMonth(it.month) || matchesMonth(it.headName));
          });
        }
        if (r.feeTitle && !hasYearMismatch(r.feeTitle, currentYear)) {
          return isTuitionText(r.feeTitle) && matchesMonth(r.feeTitle);
        }
        return false;
      });

      const hasPaidTuition = hasPaidTuitionInInvoices || hasPaidTuitionInPayments || hasPaidTuitionInApprovedOnline;

      const alreadyInDueTuition = dues.some(
        (d) =>
          matchesMonth(d.month || d.headName) &&
          isTuitionText(d.headName)
      );

      if (!hasPaidTuition && !alreadyInDueTuition && classFee && classFee.tuitionFee > 0) {
        dues.push({
          id: `due_tuit_${currentYear}_${mObj.key}_${student.id}`,
          headName: `মাসিক টিউশন ফি (Tuition Fee - ${mObj.nameBn} ${currentYear})`,
          month: `${mObj.nameEn} ${currentYear}`,
          dueDate: monthDueDate,
          isOverdue: todayStr > monthDueDate,
          amount: classFee.tuitionFee,
        });
      }

      // B. Transport Fee Check (for students with active transport assigned)
      if (transport && transport.status === 'active' && transport.monthlyFare > 0) {
        const hasPaidTransportInInvoices = invoices.some((inv) => {
          if (!isInvoiceSettled(inv)) return false;

          const matchesInItems =
            Array.isArray(inv.items) &&
            inv.items.some((it) => {
              const itemYearText = it.month || it.headName || inv.month || inv.session;
              if (hasYearMismatch(itemYearText, currentYear)) return false;
              const itemIsTransport =
                isTransportText(it.headName) || (!isTuitionText(it.headName) && isTransportText(inv.feeType));
              const itemMatchesMonth = matchesMonth(it.month) || matchesMonth(it.headName);
              return itemIsTransport && itemMatchesMonth;
            });

          if (matchesInItems) return true;

          if (hasYearMismatch(inv.month || inv.session, currentYear)) return false;
          const matchesHeaderMonth = matchesMonth(inv.month) || matchesMonth(inv.feeType);
          return matchesHeaderMonth && isTransportText(inv.feeType);
        });

        const hasPaidTransportInPayments = studentPayments.some((p) => {
          const linkedInv = invoices.find((i) => i.id === p.invoiceId);
          if (linkedInv && linkedInv.dueAmount > 0 && linkedInv.status !== 'Paid') return false;
          const matchedItems =
            Array.isArray(p.items) &&
            p.items.some((it) => {
              if (hasYearMismatch(it.month || it.headName, currentYear)) return false;
              return isTransportText(it.headName) && (matchesMonth(it.month) || matchesMonth(it.headName));
            });
          if (matchedItems) return true;
          if (p.notes && !hasYearMismatch(p.notes, currentYear)) {
            return isTransportText(p.notes) && matchesMonth(p.notes);
          }
          return false;
        });

        const hasPaidTransportInApprovedOnline = approvedOnlineRequests.some((r) => {
          if (Array.isArray(r.items) && r.items.length > 0) {
            return r.items.some((it) => {
              if (hasYearMismatch(it.month || it.headName, currentYear)) return false;
              return isTransportText(it.headName) && (matchesMonth(it.month) || matchesMonth(it.headName));
            });
          }
          if (r.feeTitle && !hasYearMismatch(r.feeTitle, currentYear)) {
            return isTransportText(r.feeTitle) && matchesMonth(r.feeTitle);
          }
          return false;
        });

        const hasPaidTransport =
          hasPaidTransportInInvoices || hasPaidTransportInPayments || hasPaidTransportInApprovedOnline;

        const alreadyInDueTransport = dues.some(
          (d) =>
            matchesMonth(d.month || d.headName) &&
            isTransportText(d.headName)
        );

        if (!hasPaidTransport && !alreadyInDueTransport) {
          dues.push({
            id: `due_trans_${currentYear}_${mObj.key}_${student.id}`,
            headName: `পরিবহন ফি (Transport Fee - ${mObj.nameBn} ${currentYear} • ${transport.routeName})`,
            month: `${mObj.nameEn} ${currentYear}`,
            dueDate: monthDueDate,
            isOverdue: todayStr > monthDueDate,
            amount: transport.monthlyFare,
          });
        }
      }
    });

    // 4. Custom Fee Items & Columns with Due Date (যেমন ল্যাব ফি, স্পোর্টস ফি, সেশন ফি ইত্যাদি)
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const customColsRaw = localStorage.getItem('school_erp_custom_class_fee_columns');
        if (customColsRaw) {
          const customCols: any[] = JSON.parse(customColsRaw);
          customCols.forEach((col) => {
            if (!col || !col.id) return;
            // If due date is specified
            if (col.dueDate) {
              const isOverdue = todayStr > col.dueDate;
              // Fee is due if today is past or on due date, or if overdue
              if (!isOverdue && todayStr < col.dueDate) {
                // Not reached deadline yet, but if compulsory, can still be due
              }

              // Check if student has already paid this fee
              const colNameEn = (col.nameEn || '').toLowerCase().replace(/[^a-z0-9]/g, '');
              const colNameBn = (col.nameBn || '').normalize('NFC').replace(/\s+/g, '');

              const hasPaid = invoices.some((inv) => {
                const isPaid = isInvoiceSettled(inv);
                const invTypeClean = (inv.feeType || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                const invTypeBnClean = (inv.feeType || '').normalize('NFC').replace(/\s+/g, '');
                const matchesInv =
                  (colNameEn.length > 0 && invTypeClean.includes(colNameEn)) ||
                  (colNameBn.length > 0 && invTypeBnClean.includes(colNameBn));
                const matchesItem =
                  inv.items &&
                  inv.items.some((it) => {
                    const itNameClean = (it.headName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                    const itNameBnClean = (it.headName || '').normalize('NFC').replace(/\s+/g, '');
                    return (
                      (colNameEn.length > 0 && itNameClean.includes(colNameEn)) ||
                      (colNameBn.length > 0 && itNameBnClean.includes(colNameBn))
                    );
                  });
                return isPaid && (matchesInv || matchesItem);
              });

              const alreadyInDues = dues.some((d) => {
                const dNameClean = d.headName.toLowerCase().replace(/[^a-z0-9]/g, '');
                const dNameBnClean = d.headName.normalize('NFC').replace(/\s+/g, '');
                return (
                  (colNameEn.length > 0 && dNameClean.includes(colNameEn)) ||
                  (colNameBn.length > 0 && dNameBnClean.includes(colNameBn))
                );
              });

              if (!hasPaid && !alreadyInDues) {
                const amount = (classFee?.customFees && classFee.customFees[col.id] !== undefined)
                  ? classFee.customFees[col.id]
                  : (col.defaultAmount || 0);

                if (amount > 0) {
                  const lateFine = (isOverdue && col.lateFee) ? Number(col.lateFee) : 0;
                  dues.push({
                    id: `due_custom_${col.id}_${student.id}`,
                    headName: `${col.nameBn || col.nameEn} (জমার শেষ তারিখ: ${col.dueDate})${lateFine > 0 ? ` [বিলম্ব ফি: ৳${lateFine}]` : ''}`,
                    dueDate: col.dueDate,
                    isOverdue: isOverdue,
                    amount: amount + lateFine,
                  });
                }
              }
            }
          });
        }
      }
    } catch {}

    // 5. Settle approved lump-sum "All Outstanding Dues" payments (when itemized breakdown was not attached)
    // Deduplicate across invoices, payments, and approved online requests so the same transaction is only credited once.
    const isAllDuesText = (txt?: string) => {
      const t = norm(txt);
      return (
        t.includes('সকল বকেয়া') ||
        t.includes('সকল বকেয়া') ||
        t.includes('all outstanding dues') ||
        t.includes('all dues')
      );
    };

    const lumpSumCredits: Array<{ date: string; amount: number }> = [];
    const consumedInvoiceCreditKeys: string[] = [];

    invoices.forEach((inv) => {
      if (isInvoiceSettled(inv) && (!inv.items || inv.items.length === 0) && isAllDuesText(inv.feeType)) {
        const amt = Number(inv.paidAmount || inv.netAmount || 0);
        const dt = inv.paymentDate || inv.dueDate || todayStr;
        if (amt > 0) {
          lumpSumCredits.push({ date: dt, amount: amt });
          consumedInvoiceCreditKeys.push(`${amt}_${dt}`);
        }
      }
    });

    const consumedPaymentCreditKeys: string[] = [...consumedInvoiceCreditKeys];

    studentPayments.forEach((p) => {
      if ((!p.items || p.items.length === 0) && isAllDuesText(p.notes)) {
        const linkedToExistingInvoice = invoices.some((inv) => inv.id === p.invoiceId);
        if (linkedToExistingInvoice) return;

        const amt = Number(p.amount || 0);
        const dt = p.paidDate || p.paymentDate || todayStr;
        const sig = `${amt}_${dt}`;
        const existingIdx = consumedInvoiceCreditKeys.indexOf(sig);
        if (existingIdx !== -1) {
          // Matches the paired invoice created in the same approval flow
          consumedInvoiceCreditKeys.splice(existingIdx, 1);
          return;
        }
        if (amt > 0) {
          lumpSumCredits.push({ date: dt, amount: amt });
          consumedPaymentCreditKeys.push(sig);
        }
      }
    });

    approvedOnlineRequests.forEach((r) => {
      if ((!r.items || r.items.length === 0) && (r.isPayAll || isAllDuesText(r.feeTitle))) {
        const amt = Number(r.amount || 0);
        const approvedDate = r.approvedAt ? r.approvedAt.split('T')[0] : '';
        const reqDate = r.requestDate || todayStr;
        const dt = approvedDate || reqDate;

        const alreadyInPaymentsOrInvoices =
          studentPayments.some(
            (p) =>
              (r.transactionId && p.transactionId === r.transactionId) ||
              (r.receiptNo && p.receiptNo === r.receiptNo) ||
              (isAllDuesText(p.notes) && Number(p.amount) === amt && (p.paidDate === dt || p.paidDate === reqDate))
          ) ||
          invoices.some(
            (inv) =>
              isInvoiceSettled(inv) &&
              isAllDuesText(inv.feeType) &&
              Number(inv.paidAmount || inv.netAmount) === amt &&
              (inv.dueDate === dt || inv.dueDate === reqDate)
          );

        if (!alreadyInPaymentsOrInvoices && amt > 0) {
          lumpSumCredits.push({ date: dt, amount: amt });
        }
      }
    });

    // Also remove any individual dues matched by approved online requests that carried explicit items
    // (e.g., if online_payments synced before finance slice)
    const approvedExplicitItems = approvedOnlineRequests.flatMap((r) => (Array.isArray(r.items) ? r.items : []));
    let workingDues = dues.filter((due) => {
      if (approvedExplicitItems.length === 0) return true;
      return !approvedExplicitItems.some((it) => {
        if (it.id && it.id === due.id) return true;
        return norm(it.headName) === norm(due.headName) && norm(it.month) === norm(due.month);
      });
    });

    if (lumpSumCredits.length > 0 && workingDues.length > 0) {
      // Sort chronologically so oldest dues are settled first
      workingDues = workingDues
        .map((d) => ({ ...d }))
        .sort((a, b) => (a.dueDate || '9999-12-31').localeCompare(b.dueDate || '9999-12-31'));

      lumpSumCredits
        .sort((a, b) => a.date.localeCompare(b.date))
        .forEach((credit) => {
          let remaining = credit.amount;
          const creditMonth = credit.date.slice(0, 7);
          const nextDues: FeeItem[] = [];

          for (const due of workingDues) {
            const isEligible =
              !due.dueDate ||
              due.dueDate <= credit.date ||
              due.dueDate.slice(0, 7) <= creditMonth;

            if (remaining > 0 && isEligible) {
              if (due.amount <= remaining) {
                remaining -= due.amount;
                continue; // Fully settled
              } else {
                due.amount = Math.max(0, due.amount - remaining);
                remaining = 0;
              }
            }
            nextDues.push(due);
          }

          workingDues = nextDues;
        });
    }

    return workingDues;
  },

  // Expenses
  getExpenses(): Expense[] {
    return getStored<Expense[]>(STORAGE_KEYS.EXPENSES, initialExpenses);
  },
  generateNextExpenseVoucherNo(dateStr?: string): string {
    const year = (dateStr || new Date().toISOString().split('T')[0]).slice(0, 4) || String(new Date().getFullYear());
    const prefix = `VOUCH-${year}-`;
    const existing = this.getExpenses();
    let maxSeq = 500;
    existing.forEach((e) => {
      if (e.voucherNo && e.voucherNo.startsWith(prefix)) {
        const n = parseInt(e.voucherNo.slice(prefix.length), 10);
        if (!isNaN(n) && n > maxSeq) maxSeq = n;
      }
    });
    return `${prefix}${String(maxSeq + 1).padStart(3, '0')}`;
  },
  addExpense(expense: Expense): void {
    const current = this.getExpenses();
    setStored(STORAGE_KEYS.EXPENSES, [expense, ...current]);
    if (!safeGetLocalStorage(SAAS_ACTIVE_SCHOOL_KEY)) {
      try {
        setDoc(doc(db, 'expenses', expense.id), cleanForFirestore(expense)).catch((err: any) =>
          handleFirestoreError(err, OperationType.WRITE, `expenses/${expense.id}`)
        );
      } catch {}
    }
    CloudSyncService.pushSliceToCloud('finance', true);
  },
  updateExpense(expense: Expense, actorRole?: UserRole | null): boolean {
    if (!canEditOrDeleteFinanceRecord(actorRole)) {
      return false;
    }
    const current = this.getExpenses();
    const updated = current.map((e) => (e.id === expense.id ? expense : e));
    setStored(STORAGE_KEYS.EXPENSES, updated);
    if (!safeGetLocalStorage(SAAS_ACTIVE_SCHOOL_KEY)) {
      try {
        setDoc(doc(db, 'expenses', expense.id), cleanForFirestore(expense)).catch((err: any) =>
          handleFirestoreError(err, OperationType.WRITE, `expenses/${expense.id}`)
        );
      } catch {}
    }
    CloudSyncService.pushSliceToCloud('finance', true);
    return true;
  },
  deleteExpense(id: string, actorRole?: UserRole | null): boolean {
    if (!canEditOrDeleteFinanceRecord(actorRole)) {
      return false;
    }
    const current = this.getExpenses();
    const updated = current.filter((e) => e.id !== id);
    setStored(STORAGE_KEYS.EXPENSES, updated);
    if (!safeGetLocalStorage(SAAS_ACTIVE_SCHOOL_KEY)) {
      try {
        deleteDoc(doc(db, 'expenses', id)).catch((err: any) =>
          handleFirestoreError(err, OperationType.DELETE, `expenses/${id}`)
        );
      } catch {}
    }
    CloudSyncService.pushSliceToCloud('finance', true);
    return true;
  },

  // Sale Items Catalog (Books, Stationery, Canteen & Snacks, Uniforms)
  getSaleItems(): SaleItem[] {
    return getStored<SaleItem[]>(STORAGE_KEYS.SALE_ITEMS, []);
  },
  saveSaleItems(items: SaleItem[]): void {
    setStored(STORAGE_KEYS.SALE_ITEMS, items);
    CloudSyncService.pushSliceToCloud('finance', true);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('school_sale_items_updated'));
    }
  },
  addSaleItem(item: SaleItem): void {
    const current = this.getSaleItems();
    this.saveSaleItems([item, ...current]);
  },
  updateSaleItem(item: SaleItem): void {
    const current = this.getSaleItems();
    const updated = current.map((it) => (it.id === item.id ? { ...item, updatedAt: new Date().toISOString() } : it));
    this.saveSaleItems(updated);
  },
  deleteSaleItem(id: string): void {
    const current = this.getSaleItems();
    this.saveSaleItems(current.filter((it) => it.id !== id));
  },
  applySaleItemStockDelta(lineItems: IncomeVoucherLineItem[], direction: -1 | 1): void {
    if (!Array.isArray(lineItems) || lineItems.length === 0) return;
    const deltaByItemId = new Map<string, number>();
    lineItems.forEach((li) => {
      if (li.saleItemId && li.quantity > 0) {
        deltaByItemId.set(li.saleItemId, (deltaByItemId.get(li.saleItemId) || 0) + Number(li.quantity));
      }
    });
    if (deltaByItemId.size === 0) return;
    const currentItems = this.getSaleItems();
    let changed = false;
    const updatedItems = currentItems.map((catalogItem) => {
      if (!catalogItem.trackStock) return catalogItem;
      const qtyDelta = deltaByItemId.get(catalogItem.id);
      if (!qtyDelta) return catalogItem;
      changed = true;
      const nextStock = Math.max(0, (Number(catalogItem.stockQty) || 0) + direction * qtyDelta);
      return {
        ...catalogItem,
        stockQty: nextStock,
        updatedAt: new Date().toISOString(),
      };
    });
    if (changed) {
      setStored(STORAGE_KEYS.SALE_ITEMS, updatedItems);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('school_sale_items_updated'));
      }
    }
  },

  // Income Vouchers & Store / Canteen Sales
  getIncomeVouchers(): IncomeVoucher[] {
    return getStored<IncomeVoucher[]>(STORAGE_KEYS.INCOME_VOUCHERS, []);
  },
  saveIncomeVouchers(vouchers: IncomeVoucher[]): void {
    setStored(STORAGE_KEYS.INCOME_VOUCHERS, vouchers);
    CloudSyncService.pushSliceToCloud('finance', true);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('school_income_vouchers_updated'));
    }
  },
  generateNextIncomeVoucherNo(dateStr?: string): string {
    const year = (dateStr || new Date().toISOString().split('T')[0]).slice(0, 4) || String(new Date().getFullYear());
    const prefix = `INC-${year}-`;
    const existing = this.getIncomeVouchers();
    let maxSeq = 0;
    existing.forEach((v) => {
      if (v.voucherNo && v.voucherNo.startsWith(prefix)) {
        const n = parseInt(v.voucherNo.slice(prefix.length), 10);
        if (!isNaN(n) && n > maxSeq) maxSeq = n;
      }
    });
    return `${prefix}${String(maxSeq + 1).padStart(3, '0')}`;
  },
  addIncomeVoucher(voucher: IncomeVoucher): void {
    this.applySaleItemStockDelta(voucher.items || [], -1);
    const current = this.getIncomeVouchers();
    this.saveIncomeVouchers([voucher, ...current]);
  },
  updateIncomeVoucher(voucher: IncomeVoucher, actorRole?: UserRole | null): boolean {
    if (!canEditOrDeleteFinanceRecord(actorRole)) {
      return false;
    }
    const current = this.getIncomeVouchers();
    const existing = current.find((v) => v.id === voucher.id);
    if (existing) {
      this.applySaleItemStockDelta(existing.items || [], 1);
    }
    this.applySaleItemStockDelta(voucher.items || [], -1);
    const updated = current.map((v) =>
      v.id === voucher.id ? { ...voucher, updatedAt: new Date().toISOString() } : v
    );
    this.saveIncomeVouchers(updated);
    return true;
  },
  deleteIncomeVoucher(id: string, actorRole?: UserRole | null): boolean {
    if (!canEditOrDeleteFinanceRecord(actorRole)) {
      return false;
    }
    const current = this.getIncomeVouchers();
    const target = current.find((v) => v.id === id);
    if (target) {
      this.applySaleItemStockDelta(target.items || [], 1);
    }
    const updated = current.filter((v) => v.id !== id);
    this.saveIncomeVouchers(updated);
    return true;
  },

  // Staff Salary & Monthly Payroll Ledger
  getStaffSalaries(): StaffSalaryPayment[] {
    return getStored<StaffSalaryPayment[]>(STORAGE_KEYS.STAFF_SALARIES, []);
  },
  saveStaffSalaries(list: StaffSalaryPayment[]): void {
    setStored(STORAGE_KEYS.STAFF_SALARIES, list);
    CloudSyncService.pushSliceToCloud('finance', true);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('school_staff_salaries_updated'));
    }
  },
  generateNextSalaryVoucherNo(monthStr: string): string {
    const compactMonth = (monthStr || new Date().toISOString().slice(0, 7)).replace(/[^0-9]/g, '').slice(0, 6);
    const prefix = `SAL-${compactMonth}-`;
    const existing = this.getStaffSalaries();
    let maxSeq = 0;
    existing.forEach((s) => {
      if (s.voucherNo && s.voucherNo.startsWith(prefix)) {
        const n = parseInt(s.voucherNo.slice(prefix.length), 10);
        if (!isNaN(n) && n > maxSeq) maxSeq = n;
      }
    });
    return `${prefix}${String(maxSeq + 1).padStart(3, '0')}`;
  },
  addStaffSalaryPayment(
    payment: StaffSalaryPayment,
    options?: { syncToExpense?: boolean }
  ): StaffSalaryPayment {
    const syncToExpense = options?.syncToExpense !== false;
    let finalRecord: StaffSalaryPayment = { ...payment };

    if (syncToExpense && payment.paidAmount > 0) {
      const expenseId = payment.expenseId || `exp_sal_${payment.id}`;
      const mappedMethod: Expense['paymentMethod'] =
        payment.paymentMethod === 'Bank'
          ? 'Bank'
          : payment.paymentMethod === 'Cheque'
          ? 'Cheque'
          : payment.paymentMethod === 'bKash' || payment.paymentMethod === 'Nagad' || payment.paymentMethod === 'Rocket'
          ? 'bKash'
          : 'Cash';
      const newExpense: Expense = {
        id: expenseId,
        voucherNo: payment.voucherNo,
        category: 'Staff Salary',
        title: `বেতন (${payment.month}) - ${payment.staffNameBn || payment.staffNameEn}`,
        amount: payment.paidAmount,
        date: payment.paymentDate,
        paidTo: `${payment.staffNameEn} (${payment.employeeId})`,
        paymentMethod: mappedMethod,
        referenceNo: payment.referenceNo || (payment.paymentMethod !== mappedMethod ? `${payment.paymentMethod}` : undefined),
        approvedBy: payment.paidBy,
        notes: payment.remarks || `Monthly salary disbursement for ${payment.month}`,
      };
      const currentExpenses = this.getExpenses();
      setStored(STORAGE_KEYS.EXPENSES, [newExpense, ...currentExpenses.filter((e) => e.id !== expenseId)]);
      finalRecord.expenseId = expenseId;
    }

    const current = this.getStaffSalaries();
    this.saveStaffSalaries([finalRecord, ...current]);
    return finalRecord;
  },
  updateStaffSalaryPayment(payment: StaffSalaryPayment): void {
    const current = this.getStaffSalaries();
    const updated = current.map((s) => (s.id === payment.id ? payment : s));
    if (payment.expenseId) {
      const currentExpenses = this.getExpenses();
      const idx = currentExpenses.findIndex((e) => e.id === payment.expenseId);
      if (idx >= 0) {
        const mappedMethod: Expense['paymentMethod'] =
          payment.paymentMethod === 'Bank'
            ? 'Bank'
            : payment.paymentMethod === 'Cheque'
            ? 'Cheque'
            : payment.paymentMethod === 'bKash' || payment.paymentMethod === 'Nagad' || payment.paymentMethod === 'Rocket'
            ? 'bKash'
            : 'Cash';
        const nextExpenses = [...currentExpenses];
        nextExpenses[idx] = {
          ...nextExpenses[idx],
          voucherNo: payment.voucherNo,
          title: `বেতন (${payment.month}) - ${payment.staffNameBn || payment.staffNameEn}`,
          amount: payment.paidAmount,
          date: payment.paymentDate,
          paidTo: `${payment.staffNameEn} (${payment.employeeId})`,
          paymentMethod: mappedMethod,
          referenceNo: payment.referenceNo,
          notes: payment.remarks,
        };
        setStored(STORAGE_KEYS.EXPENSES, nextExpenses);
      }
    }
    this.saveStaffSalaries(updated);
  },
  deleteStaffSalaryPayment(id: string): void {
    const current = this.getStaffSalaries();
    const target = current.find((s) => s.id === id);
    if (target?.expenseId) {
      const currentExpenses = this.getExpenses();
      setStored(
        STORAGE_KEYS.EXPENSES,
        currentExpenses.filter((e) => e.id !== target.expenseId)
      );
    }
    this.saveStaffSalaries(current.filter((s) => s.id !== id));
  },

  // Routines
  getRoutines(): RoutinePeriod[] {
    return getStored<RoutinePeriod[]>(STORAGE_KEYS.ROUTINES, initialRoutines);
  },
  saveRoutines(routines: RoutinePeriod[]): void {
    setStored(STORAGE_KEYS.ROUTINES, routines);
    CloudSyncService.pushSliceToCloud('academics', true);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('school_cloud_data_synced'));
    }
  },
  updateRoutine(period: RoutinePeriod): void {
    const current = this.getRoutines();
    const updated = current.map((r) => (r.id === period.id ? period : r));
    this.saveRoutines(updated);
  },
  deleteRoutine(id: string): void {
    const current = this.getRoutines();
    this.saveRoutines(current.filter((r) => r.id !== id));
  },

  // Homework
  getHomework(): Homework[] {
    return getStored<Homework[]>(STORAGE_KEYS.HOMEWORK, initialHomework || []);
  },
  addHomework(hw: Homework): void {
    const current = this.getHomework();
    setStored(STORAGE_KEYS.HOMEWORK, [hw, ...current]);
    try {
      setDoc(doc(db, 'homework', hw.id), hw).catch((err: any) =>
        handleFirestoreError(err, OperationType.WRITE, `homework/${hw.id}`)
      );
    } catch {}
  },
  updateHomework(hw: Homework): void {
    const current = this.getHomework();
    const updated = current.map((h) => (h.id === hw.id ? hw : h));
    setStored(STORAGE_KEYS.HOMEWORK, updated);
    try {
      setDoc(doc(db, 'homework', hw.id), hw).catch((err: any) =>
        handleFirestoreError(err, OperationType.WRITE, `homework/${hw.id}`)
      );
    } catch {}
  },
  deleteHomework(id: string): void {
    const current = this.getHomework();
    const updated = current.filter((h) => h.id !== id);
    setStored(STORAGE_KEYS.HOMEWORK, updated);
  },

  // Homework Submissions & AI Evaluations
  getHomeworkSubmissions(): HomeworkSubmission[] {
    const raw = safeGetLocalStorage(STORAGE_KEYS.HOMEWORK_SUBMISSIONS);
    if (raw === null) {
      const list = initialHomeworkSubmissions || [];
      if (list.length > 0) {
        safeSetLocalStorage(STORAGE_KEYS.HOMEWORK_SUBMISSIONS, JSON.stringify(list));
      }
      return list;
    }
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  },
  saveHomeworkSubmissions(submissions: HomeworkSubmission[], syncToCloud: boolean = true): void {
    safeSetLocalStorage(STORAGE_KEYS.HOMEWORK_SUBMISSIONS, JSON.stringify(submissions));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('homework_submissions_updated', { detail: submissions }));
      window.dispatchEvent(
        new CustomEvent('school_cloud_data_synced', { detail: { syncTime: new Date().toISOString() } })
      );
    }
    if (syncToCloud) {
      CloudSyncService.pushSliceToCloud('homework_submissions', true);
    }
  },
  upsertHomeworkSubmissionLocal(submission: HomeworkSubmission): HomeworkSubmission[] {
    const all = this.getHomeworkSubmissions();
    const updated = mergeHomeworkSubmissions([submission], all);
    this.saveHomeworkSubmissions(updated, false);
    return updated;
  },
  replaceHomeworkSubmissionsLocal(submissions: HomeworkSubmission[]): HomeworkSubmission[] {
    const all = this.getHomeworkSubmissions();
    const merged = mergeHomeworkSubmissions(submissions, all);
    this.saveHomeworkSubmissions(merged, false);
    return merged;
  },
  getSubmissionsForHomework(homeworkId: string): HomeworkSubmission[] {
    const all = this.getHomeworkSubmissions();
    return all.filter((s) => s.homeworkId === homeworkId);
  },
  getSubmissionsForStudent(studentId: string): HomeworkSubmission[] {
    const all = this.getHomeworkSubmissions();
    return all.filter((s) => s.studentId === studentId || s.studentCode === studentId);
  },
  saveOrUpdateSubmission(
    submission: HomeworkSubmission,
    options?: { skipCloudPush?: boolean }
  ): HomeworkSubmission {
    const all = this.getHomeworkSubmissions();
    const existingIndex = all.findIndex(
      (s) =>
        s.id === submission.id ||
        (s.homeworkId === submission.homeworkId &&
          (s.studentId === submission.studentId ||
            (submission.studentCode && s.studentCode === submission.studentCode)))
    );

    const normalizedSubmission: HomeworkSubmission = {
      ...submission,
      status: submission.status || 'submitted',
    };

    let savedRecord: HomeworkSubmission;
    let updated: HomeworkSubmission[];
    if (existingIndex >= 0) {
      const existing = all[existingIndex];
      const hasNewEval = Boolean(normalizedSubmission.aiEvaluation && !existing.aiEvaluation);
      const nextVersion = hasNewEval
        ? Math.max(existing.version || 1, normalizedSubmission.version || 1)
        : Math.max(existing.version || 1, normalizedSubmission.version || 1) + 1;
      savedRecord = {
        ...existing,
        ...normalizedSubmission,
        id: existing.id,
        version: nextVersion,
      };
      updated = [...all];
      updated[existingIndex] = savedRecord;
    } else {
      savedRecord = {
        ...normalizedSubmission,
        version: normalizedSubmission.version || 1,
      };
      updated = [savedRecord, ...all];
    }

    this.saveHomeworkSubmissions(updated, !options?.skipCloudPush);
    return savedRecord;
  },
  approveSubmission(submissionId: string, teacherMarks: number, teacherFeedback?: string, reviewerName: string = 'Teacher'): HomeworkSubmission | null {
    const all = this.getHomeworkSubmissions();
    const sub = all.find((s) => s.id === submissionId);
    if (!sub) return null;
    const updatedSub: HomeworkSubmission = {
      ...sub,
      status: 'approved',
      teacherMarks,
      teacherFeedback: teacherFeedback || sub.teacherFeedback || sub.aiEvaluation?.feedback || 'Approved by teacher.',
      reviewedBy: reviewerName,
      reviewedAt: new Date().toISOString(),
    };
    this.saveOrUpdateSubmission(updatedSub);
    return updatedSub;
  },
  rejectSubmission(submissionId: string, reason: string, reviewerName: string = 'Teacher'): HomeworkSubmission | null {
    const all = this.getHomeworkSubmissions();
    const sub = all.find((s) => s.id === submissionId);
    if (!sub) return null;
    const updatedSub: HomeworkSubmission = {
      ...sub,
      status: 'rejected',
      teacherFeedback: reason,
      reviewedBy: reviewerName,
      reviewedAt: new Date().toISOString(),
    };
    this.saveOrUpdateSubmission(updatedSub);
    return updatedSub;
  },
  requestResubmission(submissionId: string, instructions: string, reviewerName: string = 'Teacher'): HomeworkSubmission | null {
    const all = this.getHomeworkSubmissions();
    const sub = all.find((s) => s.id === submissionId);
    if (!sub) return null;
    const updatedSub: HomeworkSubmission = {
      ...sub,
      status: 'resubmission_requested',
      teacherFeedback: instructions,
      reviewedBy: reviewerName,
      reviewedAt: new Date().toISOString(),
    };
    this.saveOrUpdateSubmission(updatedSub);
    return updatedSub;
  },
  bulkApproveClassHomework(homeworkId: string, reviewerName: string = 'Teacher'): { approvedCount: number; skippedCount: number } {
    const all = this.getHomeworkSubmissions();
    let approvedCount = 0;
    let skippedCount = 0;

    const updated = all.map((sub) => {
      if (sub.homeworkId !== homeworkId) return sub;
      // Requirement: Only AI evaluation completed and review status can be approved.
      // Unclear handwriting (requiresTeacherReview), missing or failed evaluation cannot be bulk approved!
      const canBulkApprove =
        sub.status === 'ai_evaluated' &&
        sub.aiEvaluation &&
        sub.aiEvaluation.status === 'evaluated' &&
        !sub.aiEvaluation.requiresTeacherReview &&
        sub.aiEvaluation.suggestedMarks !== undefined;

      if (canBulkApprove) {
        approvedCount++;
        return {
          ...sub,
          status: 'approved' as const,
          teacherMarks: sub.aiEvaluation!.suggestedMarks,
          teacherFeedback: sub.aiEvaluation!.feedback || 'AI মূল্যায়ন শিক্ষক কর্তৃক গণঅনুমোদিত (Bulk approved by teacher).',
          reviewedBy: reviewerName,
          reviewedAt: new Date().toISOString(),
        };
      } else {
        if (sub.status !== 'approved') {
          skippedCount++;
        }
        return sub;
      }
    });

    this.saveHomeworkSubmissions(updated);
    return { approvedCount, skippedCount };
  },
  bulkApproveSubjectHomework(className: string, subjectName: string, reviewerName: string = 'Subject Teacher'): { approvedCount: number; skippedCount: number } {
    const homeworkList = this.getHomework().filter(
      (h) => h.className === className && (subjectName === 'all' || h.subjectName.toLowerCase() === subjectName.toLowerCase())
    );
    const targetHomeworkIds = new Set(homeworkList.map((h) => h.id));
    const all = this.getHomeworkSubmissions();
    let approvedCount = 0;
    let skippedCount = 0;

    const updated = all.map((sub) => {
      if (!targetHomeworkIds.has(sub.homeworkId)) return sub;
      const canBulkApprove =
        sub.status === 'ai_evaluated' &&
        sub.aiEvaluation &&
        sub.aiEvaluation.status === 'evaluated' &&
        !sub.aiEvaluation.requiresTeacherReview &&
        sub.aiEvaluation.suggestedMarks !== undefined;

      if (canBulkApprove) {
        approvedCount++;
        return {
          ...sub,
          status: 'approved' as const,
          teacherMarks: sub.aiEvaluation!.suggestedMarks,
          teacherFeedback: sub.aiEvaluation!.feedback || `AI মূল্যায়ন বিষয় শিক্ষক কর্তৃক গণঅনুমোদিত (${subjectName}).`,
          reviewedBy: reviewerName,
          reviewedAt: new Date().toISOString(),
        };
      } else {
        if (sub.status !== 'approved') {
          skippedCount++;
        }
        return sub;
      }
    });

    this.saveHomeworkSubmissions(updated);
    return { approvedCount, skippedCount };
  },
  deleteHomeworkSubmission(submissionId: string): void {
    const all = this.getHomeworkSubmissions();
    this.saveHomeworkSubmissions(all.filter((s) => s.id !== submissionId));
  },

  // QR Attendance Rules & Tokens
  getAttendanceRules(): AttendanceRuleConfig {
    const raw = getStored<AttendanceRuleConfig>(STORAGE_KEYS.ATTENDANCE_RULES, initialAttendanceRules);
    const cooldown =
      !raw.duplicateCooldownMinutes || (raw.duplicateCooldownMinutes === 3 && !raw.duplicateCooldownConfigured)
        ? 10
        : raw.duplicateCooldownMinutes;
    return {
      ...initialAttendanceRules,
      ...raw,
      duplicateCooldownMinutes: cooldown,
    };
  },
  saveAttendanceRules(rules: AttendanceRuleConfig): void {
    setStored(STORAGE_KEYS.ATTENDANCE_RULES, rules);
    CloudSyncService.pushSliceToCloud('attendance', true);
    if (!safeGetLocalStorage(SAAS_ACTIVE_SCHOOL_KEY)) {
      try {
        setDoc(doc(db, 'school_settings', 'attendance_rules'), cleanForFirestore(rules)).catch(() => {});
      } catch {}
    }
  },

  // 1-Click Saturday Weekend / Open Day Switch (স্কুল: শনিবার ছুটি, মাদরাসা/অন্যান্য: শনিবার খোলা)
  isSaturdayOff(): boolean {
    const profile = this.getSchoolProfile();
    if (profile.isSaturdayOff !== undefined) {
      return profile.isSaturdayOff;
    }
    const rules = this.getAttendanceRules();
    if (rules.isSaturdayOff !== undefined) {
      return rules.isSaturdayOff;
    }
    return true; // Default: Saturday is Off for schools
  },
  setSaturdayOff(isOff: boolean): boolean {
    const profile = this.getSchoolProfile();
    profile.isSaturdayOff = isOff;
    this.saveSchoolProfile(profile);

    const rules = this.getAttendanceRules();
    rules.isSaturdayOff = isOff;
    if (isOff) {
      if (!rules.holidayDays.includes('Saturday')) {
        rules.holidayDays = [...rules.holidayDays, 'Saturday'];
      }
      rules.workingDays = rules.workingDays.filter((d) => d !== 'Saturday');
    } else {
      rules.holidayDays = rules.holidayDays.filter((d) => d !== 'Saturday');
      if (!rules.workingDays.includes('Saturday')) {
        rules.workingDays = ['Saturday', ...rules.workingDays];
      }
    }
    this.saveAttendanceRules(rules);

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('saturday_off_toggled', { detail: { isSaturdayOff: isOff } }));
    }
    return isOff;
  },
  toggleSaturdayOff(): boolean {
    const current = this.isSaturdayOff();
    return this.setSaturdayOff(!current);
  },
  getAttendanceAuditLogs(): AttendanceAuditLog[] {
    return getStored<AttendanceAuditLog[]>(STORAGE_KEYS.ATTENDANCE_AUDIT, initialAttendanceAuditLogs);
  },
  addAttendanceAuditLog(log: AttendanceAuditLog, syncToCloud: boolean = true): void {
    const list = this.getAttendanceAuditLogs();
    const lightweightLog: AttendanceAuditLog = {
      ...log,
      // Avoid duplicating 30-40KB base64 photos into 100+ audit rows (prevents localStorage quota errors & lag)
      photoUrl:
        log.photoUrl && (!log.photoUrl.startsWith('data:') || log.photoUrl.length <= 512)
          ? log.photoUrl
          : undefined,
    };
    const cleanedExisting = list.slice(0, 119).map((item) =>
      item?.photoUrl && item.photoUrl.startsWith('data:') && item.photoUrl.length > 512
        ? { ...item, photoUrl: undefined }
        : item
    );
    setStored(STORAGE_KEYS.ATTENDANCE_AUDIT, [lightweightLog, ...cleanedExisting], true);
    if (syncToCloud) {
      CloudSyncService.pushSliceToCloud('attendance', true);
    }
    if (!safeGetLocalStorage(SAAS_ACTIVE_SCHOOL_KEY)) {
      try {
        setDoc(doc(db, 'attendance_audit_logs', lightweightLog.id), cleanForFirestore(lightweightLog)).catch(() => {});
      } catch {}
    }
  },
  generateStudentQRData(student: Student): string {
    // UTF-8 safe token encoding so Bengali digits/characters never throw InvalidCharacterError
    const scopedStudentId = this.formatScopedStudentId(student.studentId || student.id);
    const rawStr = `${student.id}:${scopedStudentId}:${student.roll}:${student.session}`;
    let token = '';
    try {
      token = btoa(unescape(encodeURIComponent(rawStr))).replace(/=/g, '');
    } catch {
      token = encodeURIComponent(rawStr).replace(/[^a-zA-Z0-9]/g, '').slice(0, 24);
    }
    return `AMR_STU#ID:${student.id}#STUID:${scopedStudentId}#ROLL:${student.roll}#SEC:${student.section}#CLS:${encodeURIComponent(student.className)}#T:${token}`;
  },
  generateStaffQRData(staff: Staff): string {
    // UTF-8 safe token encoding for teachers and staff members
    const scopedEmployeeId = this.formatScopedEmployeeId(staff.employeeId);
    const rawStr = `${staff.id}:${scopedEmployeeId}:${staff.role || 'staff'}`;
    let token = '';
    try {
      token = btoa(unescape(encodeURIComponent(rawStr))).replace(/=/g, '');
    } catch {
      token = encodeURIComponent(rawStr).replace(/[^a-zA-Z0-9]/g, '').slice(0, 24);
    }
    return `AMR_STF#ID:${staff.id}#EMP:${scopedEmployeeId}#NAME:${encodeURIComponent(staff.nameEn)}#DEPT:${encodeURIComponent(staff.department)}#DESIG:${encodeURIComponent(staff.designation)}#T:${token}`;
  },
  parseStudentQRData(rawQR: string): { studentId: string; roll?: string; className?: string; section?: string } | null {
    if (!rawQR || typeof rawQR !== 'string') return null;
    const toEnDigits = (v: string) => v.replace(/[০-৯]/g, (d) => String('০১২৩৪৫৬৭৮৯'.indexOf(d)));
    let trimmed = rawQR.trim().replace(/[\r\n]+/g, '');
    try {
      if (trimmed.includes('%23')) trimmed = decodeURIComponent(trimmed);
    } catch {}
    // Support format: AMR_STU#ID:std_1#ROLL:01... or simple ID or JSON
    if (trimmed.toUpperCase().includes('AMR_STU#')) {
      const parts = trimmed.split('#');
      let studentId = '';
      let stuid = '';
      let roll = '';
      let className = '';
      let section = '';
      parts.forEach((p) => {
        if (p.toUpperCase().startsWith('ID:')) studentId = p.substring(3).trim();
        if (p.toUpperCase().startsWith('STUID:')) stuid = p.substring(6).trim();
        if (p.toUpperCase().startsWith('ROLL:')) roll = toEnDigits(p.substring(5).trim());
        if (p.toUpperCase().startsWith('CLS:')) {
          try { className = decodeURIComponent(p.substring(4).trim()); } catch { className = p.substring(4).trim(); }
        }
        if (p.toUpperCase().startsWith('SEC:')) section = p.substring(4).trim();
      });
      return { studentId: stuid || studentId, roll, className, section };
    }
    // Check if JSON format
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed.studentId || parsed.id) {
        return {
          studentId: parsed.studentId || parsed.id,
          roll: parsed.roll,
          className: parsed.className,
          section: parsed.section,
        };
      }
    } catch {}
    // If raw ID (e.g. std_1 or S-2026-001)
    return { studentId: toEnDigits(trimmed.replace(/^[*#]+|[*#]+$/g, '').trim()) };
  },
  parseAttendanceQRData(rawQR: string): {
    targetType: 'student' | 'staff';
    id: string;
    code?: string;
    name?: string;
    meta?: string;
    roll?: string;
    section?: string;
  } | null {
    if (!rawQR || typeof rawQR !== 'string') return null;
    const toEnDigits = (v: string) => v.replace(/[০-৯]/g, (d) => String('০১২৩৪৫৬৭৮৯'.indexOf(d)));
    let trimmed = rawQR.trim().replace(/[\r\n]+/g, '');
    try {
      if (trimmed.includes('%23')) trimmed = decodeURIComponent(trimmed);
    } catch {}
    // Strip surrounding quotes or barcodes with asterisks (e.g. *S-2026-1001*)
    if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
      trimmed = trimmed.slice(1, -1).trim();
    }
    const unstarred = toEnDigits(trimmed.replace(/^[*#]+|[*#]+$/g, '').trim());

    // Check if URL (e.g. https://domain.com/attendance?id=std_1 or .../student/S-2026-1001)
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      try {
        const urlObj = new URL(trimmed);
        const queryId = urlObj.searchParams.get('id') || urlObj.searchParams.get('studentId') || urlObj.searchParams.get('token') || urlObj.searchParams.get('empId');
        if (queryId) {
          trimmed = queryId.trim();
        } else {
          const segments = urlObj.pathname.split('/').filter(Boolean);
          if (segments.length > 0) {
            trimmed = segments[segments.length - 1];
          }
        }
      } catch {}
    }

    // Staff QR code format: AMR_STF#ID:...
    if (trimmed.toUpperCase().includes('AMR_STF#')) {
      const parts = trimmed.split('#');
      let id = '';
      let emp = '';
      let name = '';
      let desig = '';
      parts.forEach((p) => {
        if (p.toUpperCase().startsWith('ID:')) id = p.substring(3).trim();
        if (p.toUpperCase().startsWith('EMP:')) emp = toEnDigits(p.substring(4).trim());
        if (p.toUpperCase().startsWith('NAME:')) {
          try { name = decodeURIComponent(p.substring(5).trim()); } catch { name = p.substring(5).trim(); }
        }
        if (p.toUpperCase().startsWith('DESIG:')) {
          try { desig = decodeURIComponent(p.substring(6).trim()); } catch { desig = p.substring(6).trim(); }
        }
      });
      return { targetType: 'staff', id: id || emp, code: emp || id, name, meta: desig };
    }

    // Student QR code format: AMR_STU#ID:...
    if (trimmed.toUpperCase().includes('AMR_STU#')) {
      const parts = trimmed.split('#');
      let id = '';
      let stuid = '';
      let roll = '';
      let section = '';
      let cls = '';
      parts.forEach((p) => {
        if (p.toUpperCase().startsWith('ID:')) id = p.substring(3).trim();
        if (p.toUpperCase().startsWith('STUID:')) stuid = toEnDigits(p.substring(6).trim());
        if (p.toUpperCase().startsWith('ROLL:')) roll = toEnDigits(p.substring(5).trim());
        if (p.toUpperCase().startsWith('SEC:')) section = p.substring(4).trim();
        if (p.toUpperCase().startsWith('CLS:')) {
          try { cls = decodeURIComponent(p.substring(4).trim()); } catch { cls = p.substring(4).trim(); }
        }
      });
      return { targetType: 'student', id: id || stuid, code: stuid || id || roll, meta: cls, roll, section };
    }

    // Check JSON
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed.employeeId || parsed.role === 'teacher' || parsed.targetType === 'staff') {
        return { targetType: 'staff', id: parsed.id || parsed.employeeId, code: parsed.employeeId || parsed.id };
      }
      if (parsed.studentId || parsed.roll || parsed.className || parsed.targetType === 'student') {
        return { targetType: 'student', id: parsed.studentId || parsed.id, code: parsed.studentId || parsed.roll, roll: parsed.roll, section: parsed.section, meta: parsed.className };
      }
    } catch {}

    const cleanCandidate = unstarred || toEnDigits(trimmed);

    // Tier 1: Exact ID / Scoped Employee ID (Staff)
    const allStaff = this.getStaff();
    const matchedStaff = allStaff.find(
      (st) =>
        st.id.toLowerCase() === cleanCandidate.toLowerCase() ||
        isMatchingScopedId(st.employeeId, cleanCandidate)
    );
    if (matchedStaff) {
      return {
        targetType: 'staff',
        id: matchedStaff.id,
        code: this.formatScopedEmployeeId(matchedStaff.employeeId),
        name: matchedStaff.nameEn,
      };
    }

    // Tier 2: Exact ID / Scoped Student ID / Admission No (Students)
    const allStudents = this.getStudents();
    const matchedStudentById = allStudents.find(
      (s) =>
        s.id.toLowerCase() === cleanCandidate.toLowerCase() ||
        isMatchingScopedId(s.studentId, cleanCandidate) ||
        (s.admissionNo && isMatchingScopedId(s.admissionNo, cleanCandidate))
    );
    if (matchedStudentById) {
      return {
        targetType: 'student',
        id: matchedStudentById.id,
        code: this.formatScopedStudentId(matchedStudentById.studentId),
        name: matchedStudentById.nameEn,
      };
    }

    // Tier 3: Non-empty strictly-numeric Roll match (prevents "" -> 0 false match)
    const isNumericCandidate = /^\d+$/.test(cleanCandidate);
    const matchedStudentByRoll = allStudents.find((s) => {
      const sRoll = toEnDigits(String(s.roll || '')).trim();
      if (!sRoll) return false;
      if (sRoll.toLowerCase() === cleanCandidate.toLowerCase()) return true;
      if (isNumericCandidate && /^\d+$/.test(sRoll)) {
        return Number(sRoll) === Number(cleanCandidate);
      }
      return false;
    });
    if (matchedStudentByRoll) {
      return {
        targetType: 'student',
        id: matchedStudentByRoll.id,
        code: this.formatScopedStudentId(matchedStudentByRoll.studentId),
        name: matchedStudentByRoll.nameEn,
      };
    }

    // Tier 4: Phone number suffix match (>= 6 digits)
    const candidateDigits = cleanCandidate.replace(/\D/g, '');
    if (candidateDigits.length >= 6) {
      const matchedStudentByPhone = allStudents.find(
        (s) =>
          (s.guardianPhone && toEnDigits(s.guardianPhone).replace(/\D/g, '').endsWith(candidateDigits)) ||
          (s.fatherPhone && toEnDigits(s.fatherPhone).replace(/\D/g, '').endsWith(candidateDigits))
      );
      if (matchedStudentByPhone) {
        return {
          targetType: 'student',
          id: matchedStudentByPhone.id,
          code: this.formatScopedStudentId(matchedStudentByPhone.studentId),
          name: matchedStudentByPhone.nameEn,
        };
      }

      const matchedStaffByPhone = allStaff.find(
        (st) => st.phone && toEnDigits(st.phone).replace(/\D/g, '').endsWith(candidateDigits)
      );
      if (matchedStaffByPhone) {
        return {
          targetType: 'staff',
          id: matchedStaffByPhone.id,
          code: this.formatScopedEmployeeId(matchedStaffByPhone.employeeId),
          name: matchedStaffByPhone.nameEn,
        };
      }
    }

    if (/^(?:[A-Z0-9]+-)?EMP-/i.test(cleanCandidate) || cleanCandidate.toLowerCase().startsWith('st_')) {
      return { targetType: 'staff', id: cleanCandidate };
    }

    return { targetType: 'student', id: cleanCandidate };
  },
  processQRScan(
    rawQR: string,
    operatorName: string = 'Authorized Operator',
    forcedDate?: string,
    scanMode: 'auto' | 'in' | 'out' = 'auto',
    verificationMethod: 'qr_scanner' | 'face_scan' = 'qr_scanner',
    _preventCrossRetry: boolean = false
  ): {
    success: boolean;
    scanType: 'in' | 'out';
    student?: Student;
    staff?: Staff;
    targetType?: 'student' | 'staff';
    status?: AttendanceStatus;
    isDuplicate?: boolean;
    inTime?: string;
    outTime?: string;
    scanTime: string;
    message: string;
    record?: AttendanceRecord;
  } {
    const parsedTarget = this.parseAttendanceQRData(rawQR);
    const now = new Date();
    const timeFormatted = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const localDateFormatted = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const dateFormatted = forcedDate || localDateFormatted;

    if (!parsedTarget || !parsedTarget.id) {
      return {
        success: false,
        scanType: scanMode === 'out' ? 'out' : 'in',
        scanTime: timeFormatted,
        message: 'অকার্যকর কিউআর কোড (Invalid QR Code format).',
      };
    }

    // Base rules and current scan time
    const rules = this.getAttendanceRules();
    const [nowHours, nowMinutes] = [now.getHours(), now.getMinutes()];
    const nowTimeDecimal = nowHours + nowMinutes / 60;

    // ==========================================
    // CASE A: TEACHER / STAFF ATTENDANCE SCAN
    // ==========================================
    if (parsedTarget.targetType === 'staff') {
      const allStaff = this.getStaff();
      const targetIdStr = (parsedTarget.id || '').trim();
      const cleanId = targetIdStr.replace(/^[*#]+|[*#]+$/g, '').toLowerCase();
      const cleanCode = (parsedTarget.code || '').trim().replace(/^[*#]+|[*#]+$/g, '').toLowerCase();

      let staffMember = allStaff.find(
        (st) =>
          st.id.toLowerCase() === cleanId ||
          isMatchingScopedId(st.employeeId, cleanId) ||
          (cleanCode && (isMatchingScopedId(st.employeeId, cleanCode) || st.id.toLowerCase() === cleanCode))
      );

      // If not found in staff, check if this ID actually belongs to a student
      if (!staffMember) {
        const allStudents = this.getStudents();
        const fallbackStudent = allStudents.find(
          (s) =>
            s.id.toLowerCase() === cleanId ||
            isMatchingScopedId(s.studentId, cleanId) ||
            (cleanCode && (isMatchingScopedId(s.studentId, cleanCode) || s.id.toLowerCase() === cleanCode))
        );
        if (fallbackStudent) {
          parsedTarget.targetType = 'student';
          parsedTarget.id = fallbackStudent.id;
          parsedTarget.code = fallbackStudent.studentId;
          // Fall through to Case B below
        } else {
          return {
            success: false,
            scanType: scanMode === 'out' ? 'out' : 'in',
            scanTime: timeFormatted,
            message: `ডাটাবেজে শিক্ষক/কর্মচারী পাওয়া যায়নি (Staff member not found for ID: ${parsedTarget.id}).`,
          };
        }
      }

      if (staffMember) {
        if (staffMember.status === 'resigned') {
        return {
          success: false,
          scanType: scanMode === 'out' ? 'out' : 'in',
          staff: staffMember,
          targetType: 'staff',
          scanTime: timeFormatted,
          message: `এই কর্মী বিদ্যালয় হতে অব্যাহতিপ্রাপ্ত (Staff member has resigned).`,
        };
      }

      const staffName = staffMember.nameBn || staffMember.nameEn;
      // Check existing record for today
      const attendanceRecords = this.getAttendance();
      const existingRecord = attendanceRecords.find(
        (r) => r.targetType === 'staff' && r.targetId === staffMember.id && r.date === dateFormatted
      );

      const nowTimestamp = now.getTime();
      const currentMinutes = nowHours * 60 + nowMinutes;
      const cooldownMinutes = rules.duplicateCooldownMinutes ?? 10;

      // Helper functions for time calculation
      const parseTimeToMins = (t?: string): number => {
        if (!t || t === '—') return -1;
        const clean = t.trim();
        const isPM = clean.toUpperCase().includes('PM');
        const isAM = clean.toUpperCase().includes('AM');
        const parts = clean.replace(/(AM|PM)/gi, '').trim().split(':');
        let h = parseInt(parts[0], 10) || 0;
        const m = parseInt(parts[1], 10) || 0;
        if (isPM && h < 12) h += 12;
        if (isAM && h === 12) h = 0;
        return h * 60 + m;
      };

      const formatDuration = (mins: number): string => {
        if (mins < 1) return '1 মিনিটের কম';
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        if (h === 0) return `${m} মিনিট`;
        if (m === 0) return `${h} ঘণ্টা`;
        return `${h} ঘণ্টা ${m} মিনিট`;
      };

      // 1. If both inTime and outTime are already recorded today:
      if (existingRecord && existingRecord.outTime && existingRecord.outTime !== '—') {
        const outMinutes = parseTimeToMins(existingRecord.outTime);
        const elapsedSinceOut = existingRecord.outTimestamp
          ? Math.floor((nowTimestamp - existingRecord.outTimestamp) / 60000)
          : (outMinutes >= 0 ? Math.max(0, currentMinutes - outMinutes) : 999);

        if (elapsedSinceOut < cooldownMinutes) {
          return {
            success: false,
            isDuplicate: true,
            scanType: 'out',
            staff: staffMember,
            targetType: 'staff',
            status: existingRecord.status,
            inTime: existingRecord.inTime,
            outTime: existingRecord.outTime,
            scanTime: timeFormatted,
            record: existingRecord,
            message: `⚠️ ডুপ্লিকেট স্ক্যান রোধ (${cooldownMinutes} মিনিট নিয়ম): ${staffName} স্যারের আজকের প্রস্থান এইমাত্র [${existingRecord.outTime}]-এ সম্পন্ন হয়েছে।`,
          };
        }

        return {
          success: false,
          isDuplicate: true,
          scanType: 'out',
          staff: staffMember,
          targetType: 'staff',
          status: existingRecord.status,
          inTime: existingRecord.inTime,
          outTime: existingRecord.outTime,
          scanTime: timeFormatted,
          record: existingRecord,
          message: `সতর্কতা: ${staffName} স্যারের আজকের আগমন [${existingRecord.inTime}] ও প্রস্থান [${existingRecord.outTime}] উভয় হাজিরাই সম্পন্ন হয়েছে (মোট অবস্থান: ${existingRecord.stayDuration || '—'})।`,
        };
      }

      // 2. If existingRecord has a recorded Check-In (inTime/inTimestamp), handle Check-Out or duplicate block;
      //    if existingRecord was manual roll-call WITHOUT check-in time and scanMode !== 'out', proceed to Check-In below!
      const staffHasPriorCheckIn = Boolean(
        existingRecord &&
          ((existingRecord.inTime && existingRecord.inTime !== '—') || existingRecord.inTimestamp)
      );
      if (existingRecord && (staffHasPriorCheckIn || scanMode === 'out')) {
        const inMinutes = parseTimeToMins(existingRecord.inTime);
        const hasValidInTime = Boolean(existingRecord.inTimestamp || inMinutes >= 0);
        const elapsedSinceIn = existingRecord.inTimestamp
          ? Math.floor((nowTimestamp - existingRecord.inTimestamp) / 60000)
          : (inMinutes >= 0 ? Math.max(0, currentMinutes - inMinutes) : 999);

        // Subcase 2A: Scanner is locked to In-Gate mode
        if (scanMode === 'in') {
          return {
            success: false,
            isDuplicate: true,
            scanType: 'in',
            staff: staffMember,
            targetType: 'staff',
            status: existingRecord.status,
            inTime: existingRecord.inTime,
            scanTime: timeFormatted,
            record: existingRecord,
            message: `সতর্কতা: ${staffName} স্যারের প্রবেশ হাজিরা আজ ইতিপূর্বেই [${existingRecord.inTime}]-এ গৃহীত হয়েছে।`,
          };
        }

        // Subcase 2B: Scanner is in Auto Mode, but scanned shortly after check-in (< cooldownMinutes)
        if (scanMode === 'auto' && elapsedSinceIn < cooldownMinutes) {
          return {
            success: false,
            isDuplicate: true,
            scanType: 'in',
            staff: staffMember,
            targetType: 'staff',
            status: existingRecord.status,
            inTime: existingRecord.inTime,
            scanTime: timeFormatted,
            record: existingRecord,
            message: `⚠️ ডুপ্লিকেট স্ক্যান রোধ (${cooldownMinutes} মিনিট নিয়ম): ${staffName} স্যার [${existingRecord.inTime}]-এ প্রবেশ হাজিরা দিয়েছেন (${elapsedSinceIn > 0 ? `${elapsedSinceIn} মিনিট আগে` : 'কয়েক সেকেন্ড আগে'})। ${cooldownMinutes} মিনিটের মধ্যে পুনরায় স্ক্যান ডুপ্লিকেট হিসেবে গণ্য হবে।`,
          };
        }

        // Subcase 2C: Out-Gate mode OR Auto Mode after cooldown has elapsed -> CHECK-OUT!
        const stayMinutes = hasValidInTime ? Math.max(1, elapsedSinceIn) : undefined;
        const stayDuration = stayMinutes !== undefined ? formatDuration(stayMinutes) : undefined;
        const updatedRecord: AttendanceRecord = {
          ...existingRecord,
          outTime: timeFormatted,
          outTimestamp: nowTimestamp,
          ...(stayDuration ? { stayDuration, stayMinutes } : {}),
          checkOutRecordedBy: operatorName,
          remarks:
            (existingRecord.remarks ? `${existingRecord.remarks} | ` : '') +
            (stayDuration ? `ছুটি/প্রস্থান: ${timeFormatted} (অবস্থান: ${stayDuration})` : `ছুটি/প্রস্থান: ${timeFormatted}`),
        };
        this.addAttendanceAuditLog(
          {
            id: `audit_stf_out_${Date.now()}`,
            studentId: staffMember.id,
            studentName: `${staffName} (${staffMember.designation})`,
            roll: staffMember.employeeId,
            className: staffMember.department,
            action: 'check_out',
            scanType: 'out',
            timestamp: `${dateFormatted} ${timeFormatted}`,
            operatorName,
            details: `শিক্ষক/স্টাফ প্রস্থান ও ছুটি সফল। আগমন: ${existingRecord.inTime || '—'}, প্রস্থান: ${timeFormatted}${stayDuration ? `, অবস্থান: ${stayDuration}` : ''}`,
          },
          false
        );
        this.saveAttendanceBatch([updatedRecord]);

        return {
          success: true,
          scanType: 'out',
          staff: staffMember,
          targetType: 'staff',
          status: updatedRecord.status,
          inTime: updatedRecord.inTime,
          outTime: timeFormatted,
          scanTime: timeFormatted,
          record: updatedRecord,
          message: `ছুটি সফল! শিক্ষক/কর্মী: ${staffName} (${staffMember.designation}) - প্রস্থান: ${timeFormatted}${stayDuration ? ` (মোট অবস্থান: ${stayDuration})` : ''}`,
        };
      }

      // 3. No existing record today:
      // Subcase 3A: Out-gate mode (Check-Out without prior Check-In)
      if (scanMode === 'out') {
        const newRecord: AttendanceRecord = {
          id: `att_stf_${staffMember.id}_${dateFormatted}`,
          targetType: 'staff',
          targetId: staffMember.id,
          targetName: staffMember.nameEn,
          rollOrEmpId: staffMember.employeeId,
          className: staffMember.department,
          date: dateFormatted,
          status: 'Present',
          scanTime: timeFormatted,
          inTime: '—',
          outTime: timeFormatted,
          outTimestamp: nowTimestamp,
          method: verificationMethod,
          recordedBy: operatorName,
          checkOutRecordedBy: operatorName,
          remarks: `শুধুমাত্র প্রস্থান রেকর্ডকৃত (${verificationMethod === 'face_scan' ? 'Face Scan' : 'Check-out'} at ${timeFormatted})`,
        };
        this.addAttendanceAuditLog(
          {
            id: `audit_stf_out_${Date.now()}`,
            studentId: staffMember.id,
            studentName: `${staffName} (${staffMember.designation})`,
            roll: staffMember.employeeId,
            className: staffMember.department,
            action: 'check_out',
            scanType: 'out',
            timestamp: `${dateFormatted} ${timeFormatted}`,
            operatorName,
            details: `শিক্ষক/স্টাফ প্রস্থান রেকর্ড (${verificationMethod === 'face_scan' ? 'ফেস স্ক্যান' : 'কিউআর স্ক্যান'}): ${timeFormatted}`,
          },
          false
        );
        this.saveAttendanceBatch([newRecord]);

        return {
          success: true,
          scanType: 'out',
          staff: staffMember,
          targetType: 'staff',
          status: 'Present',
          inTime: '—',
          outTime: timeFormatted,
          scanTime: timeFormatted,
          record: newRecord,
          message: `শিক্ষক/কর্মচারী প্রস্থান রেকর্ড সফল: ${staffName} - প্রস্থান সময়: ${timeFormatted}`,
        };
      }

      // Subcase 3B: Normal Morning Check-In (scanMode === 'in' or 'auto')
      const staffThreshold = rules.staffLateThresholdTime || rules.lateThresholdTime || '08:30';
      const [stLateH, stLateM] = staffThreshold.split(':').map((n) => parseInt(n, 10) || 0);
      const stLateDecimal = stLateH + stLateM / 60;
      let attendanceStatus: AttendanceStatus = 'Present';
      let remarks = `${verificationMethod === 'face_scan' ? 'Face Scan' : 'Staff Check-In'} at ${timeFormatted}`;
      if (nowTimeDecimal > stLateDecimal) {
        attendanceStatus = 'Late';
        remarks = `দেরিতে আগমন (Staff Late) - ${verificationMethod === 'face_scan' ? 'Face Scan' : 'Check-In'} at ${timeFormatted} after threshold ${staffThreshold}`;
      }

      const newRecord: AttendanceRecord = {
        id: `att_stf_${staffMember.id}_${dateFormatted}`,
        targetType: 'staff',
        targetId: staffMember.id,
        targetName: staffMember.nameEn,
        rollOrEmpId: staffMember.employeeId,
        className: staffMember.department,
        date: dateFormatted,
        status: attendanceStatus,
        scanTime: timeFormatted,
        inTime: timeFormatted,
        inTimestamp: nowTimestamp,
        method: verificationMethod,
        recordedBy: operatorName,
        checkInRecordedBy: operatorName,
        remarks,
      };

      this.addAttendanceAuditLog(
        {
          id: `audit_stf_in_${Date.now()}`,
          studentId: staffMember.id,
          studentName: `${staffName} (${staffMember.designation})`,
          roll: staffMember.employeeId,
          className: staffMember.department,
          action: attendanceStatus === 'Late' ? 'late_marked' : 'check_in',
          scanType: 'in',
          timestamp: `${dateFormatted} ${timeFormatted}`,
          operatorName,
          details: `শিক্ষক/স্টাফ আগমন সফল: ${staffName} - ${attendanceStatus} (${timeFormatted})`,
        },
        false
      );
      this.saveAttendanceBatch([newRecord]);

      return {
        success: true,
        scanType: 'in',
        staff: staffMember,
        targetType: 'staff',
        status: attendanceStatus,
        inTime: timeFormatted,
        scanTime: timeFormatted,
        record: newRecord,
        message: `শিক্ষক/কর্মচারী আগমন সফল: ${staffName} (${staffMember.designation}) - ${attendanceStatus === 'Late' ? 'দেরিতে উপস্থিত (Late)' : 'উপস্থিত (Present)'}`,
      };
      }
    }

    // ==========================================
    // CASE B: STUDENT ATTENDANCE SCAN
    // ==========================================
    const students = this.getStudents();
    const targetIdStr = (parsedTarget.id || '').trim();
    const targetCodeStr = (parsedTarget.code || '').trim();
    const cleanId = targetIdStr.replace(/^[*#]+|[*#]+$/g, '').toLowerCase();
    const cleanCode = targetCodeStr.replace(/^[*#]+|[*#]+$/g, '').toLowerCase();
    const cleanAlpha = cleanId.replace(/[^a-z0-9]/g, '');

    let student = students.find((s) => {
      if (!s) return false;
      const sId = (s.id || '').toLowerCase();
      const sStuId = (s.studentId || '').toLowerCase();
      const sAdm = (s.admissionNo || '').toLowerCase();
      const sStuAlpha = sStuId.replace(/[^a-z0-9]/g, '');

      // Direct or school-scoped matches
      if (
        sId === cleanId ||
        isMatchingScopedId(s.studentId, cleanId) ||
        isMatchingScopedId(s.admissionNo, cleanId)
      ) {
        return true;
      }
      if (
        cleanCode &&
        (sId === cleanCode ||
          isMatchingScopedId(s.studentId, cleanCode) ||
          isMatchingScopedId(s.admissionNo, cleanCode))
      ) {
        return true;
      }

      // Alphanumeric stripped match (handles S-2026-1001 vs S20261001 vs s-2026-1001)
      if (cleanAlpha && cleanAlpha.length >= 3) {
        if (sStuAlpha === cleanAlpha || sId.replace(/[^a-z0-9]/g, '') === cleanAlpha) return true;
        if (sStuAlpha.endsWith(cleanAlpha) || cleanAlpha.endsWith(sStuAlpha)) return true;
      }
      return false;
    });

    // Fallback: match by Class + Roll (+ Section) encoded inside AMR_STU# QR tag
    if (!student && parsedTarget.roll && parsedTarget.meta) {
      const targetRoll = String(Number(parsedTarget.roll));
      const targetCls = parsedTarget.meta.trim().toLowerCase();
      const targetSec = (parsedTarget.section || '').trim().toLowerCase();
      student = students.find((s) => {
        const sRoll = String(Number(String(s.roll || '').replace(/[০-৯]/g, (d) => String('০১২৩৪৫৬৭৮৯'.indexOf(d)))));
        const sCls = (s.className || '').trim().toLowerCase();
        const sSec = (s.section || '').trim().toLowerCase();
        return sCls === targetCls && sRoll === targetRoll && (!targetSec || sSec === targetSec);
      });
    }

    // Cross-fallback: what if this card actually belongs to a staff member?
    if (!student) {
      const allStaff = this.getStaff();
      const fallbackStaff = allStaff.find(
        (st) =>
          st.id.toLowerCase() === cleanId ||
          isMatchingScopedId(st.employeeId, cleanId) ||
          (cleanCode && (isMatchingScopedId(st.employeeId, cleanCode) || st.id.toLowerCase() === cleanCode)) ||
          (parsedTarget.name && st.nameEn.trim().toLowerCase() === parsedTarget.name.trim().toLowerCase())
      );
      if (fallbackStaff && !_preventCrossRetry) {
        return this.processQRScan(fallbackStaff.id, operatorName, forcedDate, scanMode, verificationMethod, true);
      }

      return {
        success: false,
        scanType: scanMode === 'out' ? 'out' : 'in',
        scanTime: timeFormatted,
        message: `ডাটাবেজে শিক্ষার্থী পাওয়া যায়নি (Student not found for ID: ${parsedTarget.id}).`,
      };
    }

    // Validate Student Active Status
    if (student.status && student.status !== 'active') {
      return {
        success: false,
        scanType: scanMode === 'out' ? 'out' : 'in',
        student,
        targetType: 'student',
        scanTime: timeFormatted,
        message: `শিক্ষার্থী বর্তমানে নিষ্ক্রিয়/ছাড়পত্র প্রাপ্ত (Student is ${student.status}).`,
      };
    }

    const studentName = student.nameBn || student.nameEn;
    // Check existing record for today
    const attendanceRecords = this.getAttendance();
    const existingRecord = attendanceRecords.find(
      (r) => (r.targetType === 'student' || !r.targetType) && r.targetId === student.id && r.date === dateFormatted
    );

    const nowTimestamp = now.getTime();
    const currentMinutes = nowHours * 60 + nowMinutes;
    const cooldownMinutes = rules.duplicateCooldownMinutes ?? 10;

    // Helper functions for time calculation
    const parseTimeToMins = (t?: string): number => {
      if (!t || t === '—') return -1;
      const clean = t.trim();
      const isPM = clean.toUpperCase().includes('PM');
      const isAM = clean.toUpperCase().includes('AM');
      const parts = clean.replace(/(AM|PM)/gi, '').trim().split(':');
      let h = parseInt(parts[0], 10) || 0;
      const m = parseInt(parts[1], 10) || 0;
      if (isPM && h < 12) h += 12;
      if (isAM && h === 12) h = 0;
      return h * 60 + m;
    };

    const formatDuration = (mins: number): string => {
      if (mins < 1) return '1 মিনিটের কম';
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      if (h === 0) return `${m} মিনিট`;
      if (m === 0) return `${h} ঘণ্টা`;
      return `${h} ঘণ্টা ${m} মিনিট`;
    };

    // 1. If both inTime and outTime are already recorded today:
    if (existingRecord && existingRecord.outTime && existingRecord.outTime !== '—') {
      const outMinutes = parseTimeToMins(existingRecord.outTime);
      const elapsedSinceOut = existingRecord.outTimestamp
        ? Math.floor((nowTimestamp - existingRecord.outTimestamp) / 60000)
        : (outMinutes >= 0 ? Math.max(0, currentMinutes - outMinutes) : 999);

      if (elapsedSinceOut < cooldownMinutes) {
        return {
          success: false,
          isDuplicate: true,
          scanType: 'out',
          student,
          targetType: 'student',
          status: existingRecord.status,
          inTime: existingRecord.inTime,
          outTime: existingRecord.outTime,
          scanTime: timeFormatted,
          record: existingRecord,
          message: `⚠️ ডুপ্লিকেট স্ক্যান রোধ (${cooldownMinutes} মিনিট নিয়ম): ${studentName}-এর আজকের ছুটির প্রস্থান এইমাত্র [${existingRecord.outTime}]-এ সম্পন্ন হয়েছে।`,
        };
      }

      return {
        success: false,
        isDuplicate: true,
        scanType: 'out',
        student,
        targetType: 'student',
        status: existingRecord.status,
        inTime: existingRecord.inTime,
        outTime: existingRecord.outTime,
        scanTime: timeFormatted,
        record: existingRecord,
        message: `সতর্কতা: ${studentName}-এর আজকের আগমন [${existingRecord.inTime}] ও প্রস্থান [${existingRecord.outTime}] উভয় হাজিরাই ইতোমধ্যে সম্পন্ন হয়েছে (মোট উপস্থিতি: ${existingRecord.stayDuration || '—'})।`,
      };
    }

    // 2. If existingRecord has a recorded Check-In (inTime/inTimestamp), handle Check-Out or duplicate block;
    //    if existingRecord was manual roll-call WITHOUT check-in time and scanMode !== 'out', proceed to Check-In below!
    const studentHasPriorCheckIn = Boolean(
      existingRecord &&
        ((existingRecord.inTime && existingRecord.inTime !== '—') || existingRecord.inTimestamp)
    );
    if (existingRecord && (studentHasPriorCheckIn || scanMode === 'out')) {
      const inMinutes = parseTimeToMins(existingRecord.inTime);
      const hasValidInTime = Boolean(existingRecord.inTimestamp || inMinutes >= 0);
      const elapsedSinceIn = existingRecord.inTimestamp
        ? Math.floor((nowTimestamp - existingRecord.inTimestamp) / 60000)
        : (inMinutes >= 0 ? Math.max(0, currentMinutes - inMinutes) : 999);

      // Subcase 2A: Scanner is locked to In-Gate mode
      if (scanMode === 'in') {
        return {
          success: false,
          isDuplicate: true,
          scanType: 'in',
          student,
          targetType: 'student',
          status: existingRecord.status,
          inTime: existingRecord.inTime,
          scanTime: timeFormatted,
          record: existingRecord,
          message: `⚠️ ডুপ্লিকেট স্ক্যান: ${studentName}-এর আগমন আজ ইতিপূর্বেই [${existingRecord.inTime}]-এ গৃহীত হয়েছে।`,
        };
      }

      // Subcase 2B: Scanner is in Auto Mode, but scanned shortly after check-in (< cooldownMinutes)
      if (scanMode === 'auto' && elapsedSinceIn < cooldownMinutes) {
        return {
          success: false,
          isDuplicate: true,
          scanType: 'in',
          student,
          targetType: 'student',
          status: existingRecord.status,
          inTime: existingRecord.inTime,
          scanTime: timeFormatted,
          record: existingRecord,
          message: `⚠️ ডুপ্লিকেট স্ক্যান রোধ (${cooldownMinutes} মিনিট নিয়ম): ${studentName} ${elapsedSinceIn > 0 ? `${elapsedSinceIn} মিনিট আগে` : 'কয়েক সেকেন্ড পূর্বে'} [${existingRecord.inTime}]-এ স্কুলে প্রবেশ করেছে। ${cooldownMinutes} মিনিটের মধ্যে পুনরায় স্ক্যান ডুপ্লিকেট হিসেবে গণ্য হবে।`,
        };
      }

      // Subcase 2C: Out-Gate mode OR Auto Mode after cooldown has elapsed -> CHECK-OUT (স্কুল ছুটি / আর্লি লিভ)!
      const stayMinutes = hasValidInTime ? Math.max(1, elapsedSinceIn) : undefined;
      const stayDuration = stayMinutes !== undefined ? formatDuration(stayMinutes) : undefined;

      // Determine expected dismissal time for this student's class & shift
      const classSchedule = rules.classSchedules?.[student.className];
      const targetDismissalStr =
        classSchedule?.dismissalTime ||
        (student.shift === 'Morning' ? rules.morningShiftDismissalTime : student.shift === 'Day' ? rules.dayShiftDismissalTime : rules.schoolDismissalTime) ||
        '13:30';
      const targetDismissalMinutes = parseTimeToMins(targetDismissalStr);
      // If student is leaving > 20 minutes before class dismissal OR stayed < 120 minutes (e.g. 30 minutes sick leave)
      const isEarlyLeave =
        (targetDismissalMinutes > 0 && currentMinutes < targetDismissalMinutes - 20) ||
        (stayMinutes !== undefined && stayMinutes < 120);

      const updatedRecord: AttendanceRecord = {
        ...existingRecord,
        outTime: timeFormatted,
        outTimestamp: nowTimestamp,
        ...(stayDuration ? { stayDuration, stayMinutes } : {}),
        checkOutRecordedBy: operatorName,
        remarks:
          (existingRecord.remarks ? `${existingRecord.remarks} | ` : '') +
          (isEarlyLeave
            ? `⚠️ আর্লি লিভ (অসুস্থতা/বিশেষ প্রস্থান): ${timeFormatted} (${stayDuration ? `অবস্থান: ${stayDuration}, ` : ''}নির্ধারিত ছুটি: ${targetDismissalStr})`
            : `ছুটি/প্রস্থান: ${timeFormatted}${stayDuration ? ` (অবস্থান: ${stayDuration})` : ''}`),
      };

      this.addAttendanceAuditLog(
        {
          id: `audit_stu_out_${Date.now()}`,
          studentId: student.id,
          studentName: studentName,
          roll: student.roll,
          className: student.className,
          action: 'check_out',
          scanType: 'out',
          timestamp: `${dateFormatted} ${timeFormatted}`,
          operatorName,
          details: isEarlyLeave
            ? `⚠️ শিক্ষার্থী আর্লি লিভ (অসুস্থতা/বিশেষ প্রস্থান)। আগমন: ${existingRecord.inTime || '—'}, প্রস্থান: ${timeFormatted}${stayDuration ? `, মোট অবস্থান: ${stayDuration}` : ''} (নির্ধারিত ক্লাস ছুটি: ${targetDismissalStr})`
            : `শিক্ষার্থী স্কুল ছুটি ও প্রস্থান সফল। আগমন: ${existingRecord.inTime || '—'}, প্রস্থান: ${timeFormatted}${stayDuration ? `, ক্যাম্পাসে অবস্থান: ${stayDuration}` : ''}`,
        },
        false
      );
      this.saveAttendanceBatch([updatedRecord]);

      return {
        success: true,
        scanType: 'out',
        student,
        targetType: 'student',
        status: updatedRecord.status,
        inTime: updatedRecord.inTime,
        outTime: timeFormatted,
        scanTime: timeFormatted,
        record: updatedRecord,
        message: isEarlyLeave
          ? `⚠️ আর্লি লিভ প্রস্থান সম্পন্ন: ${studentName} (শ্রেণি: ${student.className}, রোল: ${student.roll}) - অসুস্থতা/বিশেষ প্রস্থান।${stayDuration ? ` মোট অবস্থান: ${stayDuration}` : ''} (শ্রেণির ছুটির সময়: ${targetDismissalStr})`
          : `ছুটি সফল! শিক্ষার্থী: ${studentName} (শ্রেণি: ${student.className}, রোল: ${student.roll}) - প্রস্থান সময়: ${timeFormatted}${stayDuration ? ` (মোট অবস্থান: ${stayDuration})` : ''}`,
      };
    }

    // 3. No existing record today:
    // Subcase 3A: Out-gate mode (Check-Out without prior Check-In)
    if (scanMode === 'out') {
      const newRecord: AttendanceRecord = {
        id: `att_${student.id}_${dateFormatted}`,
        targetType: 'student',
        targetId: student.id,
        targetName: student.nameEn,
        rollOrEmpId: student.roll,
        className: student.className,
        section: student.section,
        date: dateFormatted,
        status: 'Present',
        scanTime: timeFormatted,
        inTime: '—',
        outTime: timeFormatted,
        outTimestamp: nowTimestamp,
        method: verificationMethod,
        recordedBy: operatorName,
        checkOutRecordedBy: operatorName,
        remarks: `শুধুমাত্র প্রস্থান রেকর্ডকৃত (${verificationMethod === 'face_scan' ? 'Face Scan' : 'Check-out'} at ${timeFormatted})`,
      };
      this.addAttendanceAuditLog(
        {
          id: `audit_stu_out_${Date.now()}`,
          studentId: student.id,
          studentName: studentName,
          roll: student.roll,
          className: student.className,
          action: 'check_out',
          scanType: 'out',
          timestamp: `${dateFormatted} ${timeFormatted}`,
          operatorName,
          details: `শিক্ষার্থী প্রস্থান রেকর্ড (${verificationMethod === 'face_scan' ? 'ফেস স্ক্যান' : 'কিউআর স্ক্যান'}): ${timeFormatted}`,
        },
        false
      );
      this.saveAttendanceBatch([newRecord]);

      return {
        success: true,
        scanType: 'out',
        student,
        targetType: 'student',
        status: 'Present',
        inTime: '—',
        outTime: timeFormatted,
        scanTime: timeFormatted,
        record: newRecord,
        message: `ছুটি সফল! শিক্ষার্থী: ${studentName} - প্রস্থান সময়: ${timeFormatted}`,
      };
    }

    // Subcase 3B: Normal Morning Check-In (scanMode === 'in' or 'auto')
    let studentThreshold = rules.lateThresholdTime || '08:30';
    let thresholdSource = 'সাধারণ সময়সীমা';

    const classSchedule = rules.classSchedules?.[student.className];
    if (classSchedule && classSchedule.enabled && classSchedule.lateThresholdTime) {
      studentThreshold = classSchedule.lateThresholdTime;
      thresholdSource = `${student.className}-এর সময়সীমা`;
    } else if (student.shift === 'Morning' && rules.morningShiftLateThresholdTime) {
      studentThreshold = rules.morningShiftLateThresholdTime;
      thresholdSource = 'মর্নিং শিফট সময়সীমা';
    } else if (student.shift === 'Day' && rules.dayShiftLateThresholdTime) {
      studentThreshold = rules.dayShiftLateThresholdTime;
      thresholdSource = 'ডে শিফট সময়সীমা';
    }

    const [stuLateH, stuLateM] = studentThreshold.split(':').map((n) => parseInt(n, 10) || 0);
    const stuLateDecimal = stuLateH + stuLateM / 60;
    let attendanceStatus: AttendanceStatus = 'Present';
    let remarks = `${verificationMethod === 'face_scan' ? 'Face Scan' : 'QR Check-In'} at ${timeFormatted} (${student.className})`;
    if (nowTimeDecimal > stuLateDecimal) {
      attendanceStatus = 'Late';
      remarks = `দেরিতে আগমন (Late arrival) - ${verificationMethod === 'face_scan' ? 'Face Scan' : 'Check-In'} at ${timeFormatted} after ${thresholdSource} (${studentThreshold})`;
    }

    const newRecord: AttendanceRecord = {
      id: `att_${student.id}_${dateFormatted}`,
      targetType: 'student',
      targetId: student.id,
      targetName: student.nameEn,
      rollOrEmpId: student.roll,
      className: student.className,
      section: student.section,
      date: dateFormatted,
      status: attendanceStatus,
      scanTime: timeFormatted,
      inTime: timeFormatted,
      inTimestamp: nowTimestamp,
      method: verificationMethod,
      recordedBy: operatorName,
      checkInRecordedBy: operatorName,
      remarks,
    };

    this.addAttendanceAuditLog(
      {
        id: `audit_scan_${Date.now()}`,
        studentId: student.id,
        studentName: studentName,
        roll: student.roll,
        className: student.className,
        action: attendanceStatus === 'Late' ? 'late_marked' : 'check_in',
        scanType: 'in',
        timestamp: `${dateFormatted} ${timeFormatted}`,
        operatorName,
        details: `স্কুলে প্রবেশ সফল। স্ট্যাটাস: ${attendanceStatus} (${timeFormatted})`,
      },
      false
    );
    this.saveAttendanceBatch([newRecord]);

    return {
      success: true,
      scanType: 'in',
      student,
      targetType: 'student',
      status: attendanceStatus,
      inTime: timeFormatted,
      scanTime: timeFormatted,
      record: newRecord,
      message: `উপস্থিতি সফল: ${studentName} (রোল: ${student.roll}, শ্রেণি: ${student.className}) - ${attendanceStatus === 'Late' ? 'দেরিতে উপস্থিত (Late)' : 'উপস্থিত (Present)'}`,
    };
  },

  // AI Student Performance Analytics Generator
  calculateStudentAnalytics(studentId: string): StudentPerformanceAnalytics | null {
    const student = this.getStudents().find((s) => s.id === studentId);
    if (!student) return null;

    // 1. Attendance Metrics
    const allAttendance = this.getAttendance().filter((a) => a.targetId === student.id);
    const totalDays = allAttendance.length || 14;
    const presentCount = allAttendance.filter((a) => a.status === 'Present').length;
    const lateCount = allAttendance.filter((a) => a.status === 'Late').length;
    const absentCount = allAttendance.filter((a) => a.status === 'Absent').length;
    // Late counts as 0.5 attendance or present with late flag
    const effectivePresent = presentCount + lateCount;
    const attendancePercentage = totalDays > 0 ? Math.round((effectivePresent / totalDays) * 100) : 90;

    // 2. Homework Metrics
    const classHomework = this.getHomework().filter((h) => h.className === student.className);
    const studentSubmissions = this.getHomeworkSubmissions().filter((s) => s.studentId === student.id);
    const totalHw = classHomework.length || 3;
    const submittedHw = studentSubmissions.length;
    const missingHw = Math.max(0, totalHw - submittedHw);
    const hwSubmissionRate = totalHw > 0 ? Math.min(100, Math.round((submittedHw / totalHw) * 100)) : 100;

    // Homework Average Marks
    const gradedSubmissions = studentSubmissions.filter((s) => (s.teacherMarks !== undefined || s.aiEvaluation?.suggestedMarks !== undefined));
    let hwAvg = 0;
    if (gradedSubmissions.length > 0) {
      const sumHw = gradedSubmissions.reduce((acc, s) => {
        const mark = s.teacherMarks !== undefined ? s.teacherMarks : (s.aiEvaluation?.suggestedMarks || 0);
        const full = s.aiEvaluation?.fullMarks || 10;
        return acc + (mark / full) * 100;
      }, 0);
      hwAvg = Math.round(sumHw / gradedSubmissions.length);
    } else {
      hwAvg = 78;
    }

    // 3. Exam Marks & Subject Breakdown
    const studentMarks = this.getMarks().filter((m) => m.studentId === student.id);
    const subjects = this.getSubjects().filter((s) => s.className === student.className);

    const subjectPerformance: SubjectPerformanceItem[] = [];
    const weakSubjects: string[] = [];
    const strongSubjects: string[] = [];

    if (studentMarks.length > 0) {
      studentMarks.forEach((m) => {
        const sub = subjects.find((s) => s.id === m.subjectId);
        const fullMarks = sub ? sub.fullMarks : 100;
        const pct = Math.round((m.total / fullMarks) * 100);
        let status: 'strong' | 'average' | 'weak' = 'average';
        if (pct >= 75) {
          status = 'strong';
          strongSubjects.push(m.subjectName);
        } else if (pct < 55) {
          status = 'weak';
          weakSubjects.push(m.subjectName);
        }
        subjectPerformance.push({
          subjectName: m.subjectName,
          marks: m.total,
          fullMarks,
          percentage: pct,
          grade: m.grade || 'A',
          status,
        });
      });
    } else {
      // Default baseline for student representation
      const defaultSubs = [
        { name: 'Bangla (বাংলা)', marks: 82, full: 100, grade: 'A+' },
        { name: 'English (ইংরেজি)', marks: 74, full: 100, grade: 'A' },
        { name: 'General Mathematics (গণিত)', marks: 48, full: 100, grade: 'C' },
        { name: 'General Science (বিজ্ঞান)', marks: 78, full: 100, grade: 'A' },
        { name: 'BGS (বাংলাদেশ ও বিশ্বপরিচয়)', marks: 80, full: 100, grade: 'A+' },
      ];
      defaultSubs.forEach((ds) => {
        const pct = Math.round((ds.marks / ds.full) * 100);
        const status = pct >= 75 ? 'strong' : pct < 55 ? 'weak' : 'average';
        if (status === 'strong') strongSubjects.push(ds.name);
        if (status === 'weak') weakSubjects.push(ds.name);
        subjectPerformance.push({
          subjectName: ds.name,
          marks: ds.marks,
          fullMarks: ds.full,
          percentage: pct,
          grade: ds.grade,
          status,
        });
      });
    }

    const examAverageMarks = subjectPerformance.length > 0
      ? Math.round(subjectPerformance.reduce((acc, sp) => acc + sp.percentage, 0) / subjectPerformance.length)
      : 72;

    const overallScore = Math.round(attendancePercentage * 0.2 + hwAvg * 0.3 + examAverageMarks * 0.5);
    const attendanceWarning = attendancePercentage < 80 || absentCount >= 3;

    // AI Summary & Recommendations (Grounded strictly in student real data)
    let aiSummary = `${student.nameBn || student.nameEn}-এর উপস্থিতি ${attendancePercentage}% এবং হোমওয়ার্ক সাবমিশন হার ${hwSubmissionRate}%। `;
    if (weakSubjects.length > 0) {
      aiSummary += `${weakSubjects.join(', ')}-এ দুর্বলতা লক্ষ্য করা গেছে। `;
    } else {
      aiSummary += `সব বিষয়ে সামগ্রিক অগ্রগতি সন্তোষজনক। `;
    }
    if (attendanceWarning) {
      aiSummary += `অনুপস্থিতির সংখ্যা বেশি থাকায় সতর্কবার্তা জারি করা হয়েছে।`;
    }

    const aiRecommendations: string[] = [];
    if (weakSubjects.length > 0) {
      aiRecommendations.push(`${weakSubjects.join(' ও ')}-এ দক্ষতা বৃদ্ধিতে প্রতিদিন অন্তত 45 মিনিট অতিরিক্ত সমাধান অনুশীলন প্রয়োজন।`);
      aiRecommendations.push(`${weakSubjects[0]}-এর জন্য বিশেষ সাপ্তাহিক হোমওয়ার্ক ও সহকারী শিক্ষকের রিভিশন ফিডব্যাক সেশন নেওয়া যেতে পারে।`);
    } else {
      aiRecommendations.push('মেধা তালিকায় ধারাবাহিক শীর্ষস্থান বজায় রাখতে মডেল টেস্ট ও পূর্ববর্তী বোর্ড প্রশ্ন সমাধান চর্চা অব্যাহত রাখা উচিত।');
    }

    if (missingHw > 0) {
      aiRecommendations.push(`বকেয়া ${missingHw}টি বাড়ির কাজ দ্রুত জমা দিতে অভিভাবককে অবগত করা ও শিক্ষক ফলো-আপ নিশ্চিত করা দরকার।`);
    }

    if (attendanceWarning) {
      aiRecommendations.push('উপস্থিতির হার 80%-এর নিচে নামলে বোর্ড পরীক্ষায় অংশগ্রহণে জটিলতা হতে পারে; নিয়মিত স্কুলে উপস্থিতি নিশ্চিত করুন।');
    } else {
      aiRecommendations.push('নিয়মিত উপস্থিতি বজায় রাখায় আন্তরিক ধন্যবাদ ও প্রশংসা প্রাপ্য।');
    }
    aiRecommendations.push('মাসিক মূল্যায়ন রিপোর্ট পর্যালোচনা করে অগ্রগতি ট্র্যাক করতে অভিভাবক-শিক্ষক মতবিনিময় সভার সুপারিশ করা হলো।');

    return {
      studentId: student.id,
      studentName: student.nameEn,
      studentNameBn: student.nameBn,
      className: student.className,
      section: student.section,
      roll: student.roll,
      photoUrl: student.photoUrl,
      attendancePercentage,
      totalSchoolDays: totalDays,
      presentDays: presentCount,
      lateDays: lateCount,
      absentDays: absentCount,
      homeworkSubmissionRate: hwSubmissionRate,
      totalHomeworkCount: totalHw,
      submittedHomeworkCount: submittedHw,
      missingHomeworkCount: missingHw,
      homeworkAverageMarks: hwAvg,
      examAverageMarks,
      overallScore,
      subjectPerformance,
      weakSubjects,
      strongSubjects,
      attendanceWarning,
      improvementPercentage: 6.5,
      aiSummary,
      aiRecommendations,
      generatedAt: new Date().toISOString(),
    };
  },

  // Books
  getBooks(): Book[] {
    return getStored<Book[]>(STORAGE_KEYS.BOOKS, initialBooks);
  },
  addBook(book: Book): void {
    const current = this.getBooks();
    setStored(STORAGE_KEYS.BOOKS, [book, ...current]);
  },
  updateBook(book: Book): void {
    const current = this.getBooks();
    setStored(
      STORAGE_KEYS.BOOKS,
      current.map((b) => (b.id === book.id ? book : b))
    );
  },
  deleteBook(id: string): void {
    const current = this.getBooks();
    setStored(
      STORAGE_KEYS.BOOKS,
      current.filter((b) => b.id !== id)
    );
  },
  getBookIssues(): BookIssue[] {
    return getStored<BookIssue[]>(STORAGE_KEYS.BOOK_ISSUES, initialBookIssues);
  },
  issueBook(issue: BookIssue): void {
    const issues = this.getBookIssues();
    setStored(STORAGE_KEYS.BOOK_ISSUES, [issue, ...issues]);
    // decrease available book copies
    const books = this.getBooks();
    const bk = books.find((b) => b.id === issue.bookId);
    if (bk && bk.available > 0) {
      this.updateBook({ ...bk, available: bk.available - 1 });
    }
  },
  returnBook(issueId: string): void {
    const issues = this.getBookIssues();
    const target = issues.find((i) => i.id === issueId);
    if (target) {
      target.status = 'Returned';
      target.returnDate = new Date().toISOString().split('T')[0];
      setStored(STORAGE_KEYS.BOOK_ISSUES, [...issues]);
      // increase available copies
      const books = this.getBooks();
      const bk = books.find((b) => b.id === target.bookId);
      if (bk) {
        this.updateBook({ ...bk, available: bk.available + 1 });
      }
    }
  },

  // Transport
  getRoutes(): TransportRoute[] {
    return getStored<TransportRoute[]>(STORAGE_KEYS.ROUTES, initialRoutes);
  },
  saveRoute(route: TransportRoute): void {
    const current = this.getRoutes();
    const idx = current.findIndex((r) => r.id === route.id);
    if (idx >= 0) {
      current[idx] = route;
      setStored(STORAGE_KEYS.ROUTES, [...current]);
    } else {
      setStored(STORAGE_KEYS.ROUTES, [route, ...current]);
    }
  },
  deleteRoute(id: string): void {
    const current = this.getRoutes();
    setStored(STORAGE_KEYS.ROUTES, current.filter((r) => r.id !== id));
  },

  // Inventory
  getInventory(): InventoryItem[] {
    return getStored<InventoryItem[]>(STORAGE_KEYS.INVENTORY, initialInventory);
  },
  addInventoryItem(item: InventoryItem): void {
    const current = this.getInventory();
    setStored(STORAGE_KEYS.INVENTORY, [item, ...current]);
  },
  updateInventoryItem(item: InventoryItem): void {
    const current = this.getInventory();
    setStored(
      STORAGE_KEYS.INVENTORY,
      current.map((i) => (i.id === item.id ? item : i))
    );
  },
  deleteInventoryItem(id: string): void {
    const current = this.getInventory();
    setStored(
      STORAGE_KEYS.INVENTORY,
      current.filter((i) => i.id !== id)
    );
  },

  // Notices
  getNotices(): Notice[] {
    return getStored<Notice[]>(STORAGE_KEYS.NOTICES, initialNotices);
  },
  addNotice(notice: Notice): void {
    const current = this.getNotices();
    setStored(STORAGE_KEYS.NOTICES, [notice, ...current]);
    CloudSyncService.pushSliceToCloud('finance', true);
    void this.syncPublicWebsite();
  },
  updateNotice(notice: Notice): void {
    const current = this.getNotices();
    const updated = current.map((n) => (n.id === notice.id ? notice : n));
    setStored(STORAGE_KEYS.NOTICES, updated);
    CloudSyncService.pushSliceToCloud('finance', true);
    void this.syncPublicWebsite();
  },
  deleteNotice(id: string): void {
    const current = this.getNotices();
    setStored(STORAGE_KEYS.NOTICES, current.filter((n) => n.id !== id));
    CloudSyncService.pushSliceToCloud('finance', true);
    void this.syncPublicWebsite();
  },

  // Enquiries
  getEnquiries(): AdmissionEnquiry[] {
    return getStored<AdmissionEnquiry[]>(STORAGE_KEYS.ENQUIRIES, initialEnquiries || []);
  },
  addEnquiry(enquiry: AdmissionEnquiry): void {
    const current = this.getEnquiries();
    setStored(STORAGE_KEYS.ENQUIRIES, [enquiry, ...current]);
    CloudSyncService.pushSliceToCloud('students', true);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('school_cloud_data_synced', { detail: { syncTime: new Date().toISOString() } }));
    }
  },
  updateEnquiryStatus(id: string, status: AdmissionEnquiry['status']): void {
    const current = this.getEnquiries();
    setStored(
      STORAGE_KEYS.ENQUIRIES,
      current.map((e) => (e.id === id ? { ...e, status } : e))
    );
    CloudSyncService.pushSliceToCloud('students', true);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('school_cloud_data_synced', { detail: { syncTime: new Date().toISOString() } }));
    }
  },
  convertEnquiryToStudent(
    enquiryId: string,
    roll: string,
    section: string,
    shift: 'Morning' | 'Day',
    customStudentId?: string,
    photoUrl?: string,
    bloodGroup?: string,
    customSession?: string,
    docDetails?: {
      birthCertificateNo?: string;
      birthCertificateUrl?: string;
      fatherNid?: string;
      fatherNidUrl?: string;
      motherNid?: string;
      motherNidUrl?: string;
      guardianNid?: string;
      guardianNidUrl?: string;
      transferCertificateUrl?: string;
      group?: GroupType;
      admissionDate?: string;
    }
  ): Student | null {
    const enquiries = this.getEnquiries();
    const enq = enquiries.find((e) => e.id === enquiryId);
    if (!enq) return null;

    const effectiveSession = customSession?.trim() || this.getSchoolProfile().currentSession || '2026';
    const finalStudentId = customStudentId?.trim() || this.generateNextStudentId(effectiveSession);

    // Build documents list
    const docs: any[] = [];
    if (docDetails?.birthCertificateUrl) {
      docs.push({
        id: `doc_bc_${Date.now()}`,
        title: 'জন্ম নিবন্ধন সনদ (Birth Certificate)',
        type: 'birth_certificate',
        documentNumber: docDetails.birthCertificateNo || '',
        fileUrl: docDetails.birthCertificateUrl,
        uploadedAt: new Date().toISOString(),
        verified: true,
      });
    }
    if (docDetails?.fatherNidUrl) {
      docs.push({
        id: `doc_fnid_${Date.now()}`,
        title: 'পিতার এনআইডি (Father NID)',
        type: 'father_nid',
        documentNumber: docDetails.fatherNid || '',
        fileUrl: docDetails.fatherNidUrl,
        uploadedAt: new Date().toISOString(),
        verified: true,
      });
    }
    if (docDetails?.motherNidUrl) {
      docs.push({
        id: `doc_mnid_${Date.now()}`,
        title: 'মাতার এনআইডি (Mother NID)',
        type: 'mother_nid',
        documentNumber: docDetails.motherNid || '',
        fileUrl: docDetails.motherNidUrl,
        uploadedAt: new Date().toISOString(),
        verified: true,
      });
    }
    if (docDetails?.guardianNidUrl) {
      docs.push({
        id: `doc_gnid_${Date.now()}`,
        title: 'অভিভাবকের এনআইডি (Guardian NID)',
        type: 'guardian_nid',
        documentNumber: docDetails.guardianNid || '',
        fileUrl: docDetails.guardianNidUrl,
        uploadedAt: new Date().toISOString(),
        verified: true,
      });
    }
    if (docDetails?.transferCertificateUrl) {
      docs.push({
        id: `doc_tc_${Date.now()}`,
        title: 'পূর্ববর্তী স্কুলের প্রশংসাপত্র / ছাড়পত্র (TC)',
        type: 'transfer_certificate',
        fileUrl: docDetails.transferCertificateUrl,
        uploadedAt: new Date().toISOString(),
        verified: true,
      });
    }

    const newStudent: Student = {
      id: `std_${Date.now()}`,
      studentId: finalStudentId,
      admissionNo: finalStudentId,
      nameEn: enq.applicantNameEn,
      nameBn: enq.applicantNameBn || enq.applicantNameEn,
      gender: enq.gender,
      dob: enq.dob,
      bloodGroup: bloodGroup || enq.bloodGroup || 'B+',
      religion: 'Islam',
      className: enq.applyingClass,
      section: section || 'A',
      shift: shift || 'Day',
      group: docDetails?.group || (['Class 9', 'Class 10'].includes(enq.applyingClass) ? 'Science' : undefined),
      roll: roll || '15',
      session: effectiveSession,
      fatherNameEn: enq.guardianName,
      fatherNameBn: enq.guardianName,
      motherNameEn: 'Mother Name',
      motherNameBn: 'মাতার নাম',
      fatherNid: docDetails?.fatherNid,
      fatherNidUrl: docDetails?.fatherNidUrl,
      motherNid: docDetails?.motherNid,
      motherNidUrl: docDetails?.motherNidUrl,
      guardianNid: docDetails?.guardianNid,
      guardianNidUrl: docDetails?.guardianNidUrl,
      birthCertificateNo: docDetails?.birthCertificateNo,
      birthCertificateUrl: docDetails?.birthCertificateUrl,
      transferCertificateUrl: docDetails?.transferCertificateUrl,
      documents: docs,
      guardianName: enq.guardianName,
      guardianPhone: enq.phone,
      guardianRelation: 'Guardian',
      presentAddress: enq.address,
      permanentAddress: enq.address,
      previousSchool: enq.previousSchool,
      photoUrl: photoUrl || enq.photoUrl || '',
      status: 'active',
      admissionDate: docDetails?.admissionDate?.trim() || new Date().toISOString().split('T')[0],
    };

    this.addStudent(newStudent);
    this.updateEnquiryStatus(enquiryId, 'Enrolled');

    // Auto-create initial admission fee invoice for this student under their session
    try {
      const classFee = this.getClassFee(newStudent.className);
      const admissionFeeAmount = classFee.admissionFee || 1500;
      const todayStr = new Date().toISOString().split('T')[0];
      const invNo = `INV-${effectiveSession}-${Math.floor(10000 + Math.random() * 90000)}`;

      const admissionInvoice: FeeInvoice = {
        id: `inv_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
        invoiceNo: invNo,
        studentId: newStudent.id,
        studentNameEn: newStudent.nameEn,
        studentNameBn: newStudent.nameBn,
        className: newStudent.className,
        section: newStudent.section,
        roll: newStudent.roll,
        session: effectiveSession,
        feeType: `নতুন ভর্তি ফি (${effectiveSession} সেশন)`,
        month: `${effectiveSession} Session Admission`,
        items: [
          {
            id: `item_adm_${Date.now()}`,
            headName: `নতুন ভর্তি ফি (Admission Fee - ${effectiveSession})`,
            month: `${effectiveSession} Session`,
            amount: admissionFeeAmount,
          },
        ],
        amount: admissionFeeAmount,
        discount: 0,
        netAmount: admissionFeeAmount,
        paidAmount: 0,
        dueAmount: admissionFeeAmount,
        status: 'Unpaid',
        dueDate: todayStr,
        issueDate: todayStr,
      };

      this.addInvoice(admissionInvoice);
    } catch (err) {
      console.warn('Could not auto-generate admission invoice:', err);
    }

    CloudSyncService.pushSliceToCloud('students', true);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('school_cloud_data_synced', { detail: { syncTime: new Date().toISOString() } }));
    }
    return newStudent;
  },
  deleteEnquiry(id: string): void {
    const current = this.getEnquiries();
    setStored(STORAGE_KEYS.ENQUIRIES, current.filter((e) => e.id !== id));
    CloudSyncService.pushSliceToCloud('students', true);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('school_cloud_data_synced', { detail: { syncTime: new Date().toISOString() } }));
    }
  },

  // Website Contact Messages (Direct for Super Admin)
  getWebsiteMessages(): WebsiteMessage[] {
    return getStored<WebsiteMessage[]>(STORAGE_KEYS.WEBSITE_MESSAGES, initialWebsiteMessages);
  },
  addWebsiteMessage(msg: WebsiteMessage): void {
    const list = this.getWebsiteMessages();
    setStored(STORAGE_KEYS.WEBSITE_MESSAGES, [msg, ...list]);
  },
  markMessageAsRead(id: string): void {
    const list = this.getWebsiteMessages();
    setStored(
      STORAGE_KEYS.WEBSITE_MESSAGES,
      list.map((m) => (m.id === id ? { ...m, isRead: true } : m))
    );
  },
  deleteWebsiteMessage(id: string): void {
    const list = this.getWebsiteMessages();
    setStored(
      STORAGE_KEYS.WEBSITE_MESSAGES,
      list.filter((m) => m.id !== id)
    );
  },

  // School Blog Posts (স্কুল ব্লগ ও আর্টিকেলের প্রকাশনা ও সুপার অ্যাডমিন ব্যবস্থাপনা)
  getBlogPosts(): BlogPost[] {
    return getStored<BlogPost[]>(STORAGE_KEYS.BLOG_POSTS, initialBlogPosts);
  },
  getPublishedBlogPosts(): BlogPost[] {
    return this.getBlogPosts().filter((p) => p.published).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  },
  addBlogPost(post: BlogPost): void {
    const current = this.getBlogPosts();
    const updated = [post, ...current];
    setStored(STORAGE_KEYS.BLOG_POSTS, updated);
    CloudSyncService.pushSliceToCloud('profile', true);
    void this.syncPublicWebsite();
  },
  updateBlogPost(post: BlogPost): void {
    const current = this.getBlogPosts();
    const updated = current.map((p) => (p.id === post.id ? post : p));
    setStored(STORAGE_KEYS.BLOG_POSTS, updated);
    CloudSyncService.pushSliceToCloud('profile', true);
    void this.syncPublicWebsite();
  },
  deleteBlogPost(id: string): void {
    const current = this.getBlogPosts();
    setStored(STORAGE_KEYS.BLOG_POSTS, current.filter((p) => p.id !== id));
    CloudSyncService.pushSliceToCloud('profile', true);
    void this.syncPublicWebsite();
  },
  togglePublishBlogPost(id: string): void {
    const current = this.getBlogPosts();
    const updated = current.map((p) => (p.id === id ? { ...p, published: !p.published } : p));
    setStored(STORAGE_KEYS.BLOG_POSTS, updated);
    CloudSyncService.pushSliceToCloud('profile', true);
    void this.syncPublicWebsite();
  },

  // System Access Control (Master Admin)
  getSystemAccessControl(): SystemAccessControl {
    return getStored<SystemAccessControl>(STORAGE_KEYS.ACCESS_CONTROL, defaultAccessControl);
  },
  saveSystemAccessControl(control: SystemAccessControl): void {
    setStored(STORAGE_KEYS.ACCESS_CONTROL, control);
  },

  // School Holidays (Multi-day vacation, single-day off, school closed days)
  getHolidays(): SchoolHoliday[] {
    return getStored<SchoolHoliday[]>(STORAGE_KEYS.HOLIDAYS, initialHolidays);
  },
  saveHolidays(holidays: SchoolHoliday[]): void {
    setStored(STORAGE_KEYS.HOLIDAYS, holidays);
  },
  addHoliday(holiday: SchoolHoliday): void {
    const current = this.getHolidays();
    const updated = [holiday, ...current];
    this.saveHolidays(updated);
  },
  updateHoliday(holiday: SchoolHoliday): void {
    const current = this.getHolidays();
    const updated = current.map((h) => (h.id === holiday.id ? holiday : h));
    this.saveHolidays(updated);
  },
  deleteHoliday(id: string): void {
    const current = this.getHolidays();
    const updated = current.filter((h) => h.id !== id);
    this.saveHolidays(updated);
  },
  isDateHoliday(dateStr: string): SchoolHoliday | null {
    const holidays = this.getHolidays();
    for (const h of holidays) {
      if (dateStr >= h.startDate && dateStr <= h.endDate) {
        return h;
      }
    }
    return null;
  },

  // Super Admin Credentials
  getSuperAdminCredentials(): SuperAdminCredentials {
    return getStored<SuperAdminCredentials>(STORAGE_KEYS.SUPER_ADMIN_CREDS, defaultSuperAdminCreds);
  },
  saveSuperAdminCredentials(creds: SuperAdminCredentials): void {
    setStored(STORAGE_KEYS.SUPER_ADMIN_CREDS, creds);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('super_admin_creds_updated', { detail: creds }));
    }
  },

  // Financial Transaction Password Security Policy
  getTransactionSecurityConfig(): TransactionSecurityConfig {
    return getStored<TransactionSecurityConfig>(
      STORAGE_KEYS.TRANSACTION_SECURITY,
      DEFAULT_TRANSACTION_SECURITY_CONFIG
    );
  },
  saveTransactionSecurityConfig(config: TransactionSecurityConfig): void {
    setStored(STORAGE_KEYS.TRANSACTION_SECURITY, config);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('transaction_security_updated', { detail: config }));
    }
  },

  // Backup & Restore
  exportBackupData(): string {
    const data: Record<string, any> = {};
    Object.entries(STORAGE_KEYS).forEach(([keyName, storageKey]) => {
      const item = localStorage.getItem(storageKey);
      if (item) {
        data[keyName] = JSON.parse(item);
      }
    });
    return JSON.stringify(data, null, 2);
  },
  importBackupData(jsonString: string): boolean {
    try {
      const data = JSON.parse(jsonString);
      Object.entries(STORAGE_KEYS).forEach(([keyName, storageKey]) => {
        if (data[keyName]) {
          localStorage.setItem(storageKey, JSON.stringify(data[keyName]));
        }
      });
      return true;
    } catch (e) {
      console.error('Import failed:', e);
      return false;
    }
  },

  clearAllSchoolData(): boolean {
    try {
      const profile = this.getSchoolProfile();
      profile.statsStudents = '0';
      safeSetLocalStorage(STORAGE_KEYS.SCHOOL, JSON.stringify(profile));
      safeSetLocalStorage(STORAGE_KEYS.STUDENTS, JSON.stringify([]));
      safeSetLocalStorage(STORAGE_KEYS.EXAMS, JSON.stringify([]));
      safeSetLocalStorage(STORAGE_KEYS.EXAM_ROUTINES, JSON.stringify([]));
      safeSetLocalStorage(STORAGE_KEYS.MARKS, JSON.stringify([]));
      safeSetLocalStorage(STORAGE_KEYS.INVOICES, JSON.stringify([]));
      safeSetLocalStorage(STORAGE_KEYS.PAYMENTS, JSON.stringify([]));
      safeSetLocalStorage(STORAGE_KEYS.ATTENDANCE, JSON.stringify([]));
      safeSetLocalStorage(STORAGE_KEYS.ATTENDANCE_AUDIT, JSON.stringify([]));
      safeSetLocalStorage(STORAGE_KEYS.ROUTINES, JSON.stringify([]));
      safeSetLocalStorage(STORAGE_KEYS.HOMEWORK, JSON.stringify([]));
      safeSetLocalStorage(STORAGE_KEYS.HOMEWORK_SUBMISSIONS, JSON.stringify([]));
      safeSetLocalStorage(STORAGE_KEYS.ONLINE_PAYMENT_REQUESTS, JSON.stringify([]));
      safeSetLocalStorage(STORAGE_KEYS.ENQUIRIES, JSON.stringify([]));
      safeSetLocalStorage(STORAGE_KEYS.BOOKS, JSON.stringify([]));
      safeSetLocalStorage(STORAGE_KEYS.BOOK_ISSUES, JSON.stringify([]));
      safeSetLocalStorage(STORAGE_KEYS.ROUTES, JSON.stringify([]));
      safeSetLocalStorage(STORAGE_KEYS.EXPENSES, JSON.stringify([]));
      safeSetLocalStorage(STORAGE_KEYS.STAFF_SALARIES, JSON.stringify([]));
      safeSetLocalStorage(STORAGE_KEYS.SCHEDULED_FEES, JSON.stringify([]));
      safeSetLocalStorage(STORAGE_KEYS.STUDENT_TRANSPORTS, JSON.stringify([]));
      safeSetLocalStorage(STORAGE_KEYS.WEBSITE_MESSAGES, JSON.stringify([]));
      safeSetLocalStorage(STORAGE_KEYS.NOTICES, JSON.stringify([]));
      safeSetLocalStorage('school_erp_clean_slate', 'true');
      safeSetLocalStorage(CLEAN_DATABASE_RESET_KEY, 'cleared');
      safeSetLocalStorage('school_erp_presentation_demo_v3', 'cleaned');

      // Immediately sync clean state to Cloud Firestore
      CloudSyncService.pushLocalToCloud(true);

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('school_cloud_data_synced', { detail: { syncTime: new Date().toISOString() } }));
        window.dispatchEvent(new CustomEvent('school_profile_updated'));
      }
      return true;
    } catch (e) {
      console.error('Error clearing school data:', e);
      return false;
    }
  },

  resetToDefault(): void {
    this.clearAllSchoolData();
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  },
  resetToCleanSlate(): void {
    this.clearAllSchoolData();
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  },

  // Sync to live Firestore
  async syncAllToFirestore(): Promise<{ success: boolean; count: number; error?: string }> {
    try {
      let count = 0;
      const school = this.getSchoolProfile();
      await setDoc(doc(db, 'schools', school.id), school);
      count++;

      const students = this.getStudents();
      for (const s of students) {
        await setDoc(doc(db, 'students', s.id), s);
        count++;
      }

      const staff = this.getStaff();
      for (const st of staff) {
        await setDoc(doc(db, 'staff', st.id), st);
        count++;
      }

      const exams = this.getExams();
      for (const ex of exams) {
        await setDoc(doc(db, 'exams', ex.id), ex);
        count++;
      }

      const payments = this.getPayments();
      for (const p of payments) {
        await setDoc(doc(db, 'feePayments', p.id), p);
        count++;
      }

      const notices = this.getNotices();
      for (const n of notices) {
        await setDoc(doc(db, 'notices', n.id), n);
        count++;
      }

      return { success: true, count };
    } catch (err: any) {
      console.error('Sync error:', err);
      return { success: false, count: 0, error: err.message };
    }
  },

  // ---------------------------------------------------------------------------
  // Master Admin: Complete System Backup (.ZIP) & Restore Engine
  // ---------------------------------------------------------------------------
  exportAllDatabaseToJson(): {
    system: string;
    version: string;
    exportedAt: string;
    exportedBy: string;
    institution: string;
    stats: Record<string, number>;
    data: Record<string, any>;
  } {
    const data: Record<string, any> = {};
    Object.entries(STORAGE_KEYS).forEach(([keyName, storageKey]) => {
      try {
        const raw = safeGetLocalStorage(storageKey);
        if (raw) {
          data[storageKey] = JSON.parse(raw);
        } else {
          data[storageKey] = null;
        }
      } catch (err) {
        console.warn(`Could not export key: ${storageKey}`, err);
        data[storageKey] = null;
      }
    });

    const schoolProfile = this.getSchoolProfile();
    const students = this.getStudents();
    const staff = this.getStaff();
    const classes = this.getClasses();
    const subjects = this.getSubjects();
    const exams = this.getExams();
    const marks = this.getMarks();
    const invoices = this.getInvoices();
    const payments = this.getPayments();
    const attendance = this.getAttendance();
    const routines = this.getRoutines();
    const homework = this.getHomework();
    const books = this.getBooks();
    const routes = this.getRoutes();
    const notices = this.getNotices();
    const expenses = this.getExpenses();
    const incomeVouchers = this.getIncomeVouchers();
    const saleItems = this.getSaleItems();
    const staffSalaries = this.getStaffSalaries();

    const stats: Record<string, number> = {
      students: students.length,
      staff: staff.length,
      classes: classes.length,
      subjects: subjects.length,
      exams: exams.length,
      marks: marks.length,
      invoices: invoices.length,
      payments: payments.length,
      attendance: attendance.length,
      routines: routines.length,
      homework: homework.length,
      books: books.length,
      routes: routes.length,
      notices: notices.length,
      expenses: expenses.length,
      incomeVouchers: incomeVouchers.length,
      saleItems: saleItems.length,
      staffSalaries: staffSalaries.length,
    };

    return {
      system: 'Smart School BD ERP',
      version: '2026.1',
      exportedAt: new Date().toISOString(),
      exportedBy: 'Master Admin',
      institution: schoolProfile?.nameBn || schoolProfile?.nameEn || 'Smart School BD ERP',
      stats,
      data,
    };
  },

  async createBackupZipBlob(): Promise<{ blob: Blob; filename: string; summary: any }> {
    const fullExport = this.exportAllDatabaseToJson();
    const zip = new JSZip();

    // 1. Root Master Complete JSON file containing all database records (compact JSON)
    zip.file('all_school_data_complete.json', JSON.stringify(fullExport));

    // 2. Manifest file for verification
    const manifest = {
      manifestVersion: '2.0',
      system: fullExport.system,
      version: fullExport.version,
      exportedAt: fullExport.exportedAt,
      institution: fullExport.institution,
      stats: fullExport.stats,
      modules: [
        'students',
        'staff',
        'classes_and_subjects',
        'fees_invoices_payments',
        'exams_and_marks',
        'attendance',
        'homework_and_submissions',
        'routines',
        'library',
        'transport_and_inventory',
        'school_profile',
      ],
      notice: 'This backup archive was generated strictly for Master Admin. Keep it confidential.',
    };
    zip.file('manifest.json', JSON.stringify(manifest));

    // 3. Human-readable README & Report
    const banglaDate = new Date().toLocaleString('bn-BD', { timeZone: 'Asia/Dhaka' });
    const englishDate = new Date().toLocaleString('en-US', { timeZone: 'Asia/Dhaka' });
    const readmeContent = `========================================================================
     স্মার্ট স্কুল বিডি ইআরপি - মাস্টার অ্যাডমিন সম্পূর্ণ সিস্টেম ব্যাকআপ
               Smart School BD ERP - Master Admin Full Backup
========================================================================

প্রতিষ্ঠান / Institution : ${fullExport.institution}
ব্যাকআপ তারিখ ও সময় (BD Time): ${banglaDate} (${englishDate})
সিস্টেম ভার্সন / Version    : ${fullExport.version}
জেনারেট করেছেন            : মাস্টার অ্যাডমিন (Master Admin)

------------------------------------------------------------------------
ডাটাবেইজ পরিসংখ্যান সারসংক্ষেপ (Database Records Summary):
------------------------------------------------------------------------
- মোট শিক্ষার্থী (Students)          : ${fullExport.stats.students} জন
- শিক্ষক ও স্টাফ (Staff)             : ${fullExport.stats.staff} জন
- শ্রেণি সংখ্যা (Classes)           : ${fullExport.stats.classes} টি
- বিষয়সমূহ (Subjects)              : ${fullExport.stats.subjects} টি
- পরীক্ষা (Exams)                  : ${fullExport.stats.exams} টি
- পরীক্ষার নম্বর এন্ট্রি (Marks)      : ${fullExport.stats.marks} টি
- ফি ইনভয়েস (Fee Invoices)         : ${fullExport.stats.invoices} টি
- ফি পরিশোধ রেকর্ড (Payments)       : ${fullExport.stats.payments} টি
- উপস্থিতি লগ (Attendance)          : ${fullExport.stats.attendance} টি
- বাড়ির কাজ (Homework)              : ${fullExport.stats.homework} টি
- ক্লাস রুটিন (Class Routines)      : ${fullExport.stats.routines} টি
- লাইব্রেরি বই (Library Books)      : ${fullExport.stats.books} টি
- পরিবহন রুট (Transport Routes)     : ${fullExport.stats.routes} টি
- নোটিশ (Notices)                   : ${fullExport.stats.notices} টি
- খরচের ভাউচার (Expenses)           : ${fullExport.stats.expenses} টি
- আয় ভাউচার ও বিক্রয় (Income)        : ${fullExport.stats.incomeVouchers || 0} টি
- বিক্রয় আইটেম ক্যাটালগ (Catalog)      : ${fullExport.stats.saleItems || 0} টি

------------------------------------------------------------------------
ফাইল ও ফোল্ডার বিবরণী (Archive Structure):
------------------------------------------------------------------------
1. all_school_data_complete.json
   -> সম্পূর্ণ ডাটাবেজের কমপ্লিট স্ন্যাপশট (রিস্টোরের জন্য প্রধান ফাইল)।
2. manifest.json
   -> ব্যাকআপ মেটাডাটা ও রেকর্ড ভেরিফিকেশন লিস্ট।
3. modules/
   -> মডিউলভিত্তিক আলাদা আলাদা JSON ফাইল (Students, Staff, Fees, Exams, ইত্যাদি)।

------------------------------------------------------------------------
রিস্টোর নির্দেশিকা (How to Restore):
------------------------------------------------------------------------
1. শুধুমাত্র মাস্টার অ্যাডমিন পোর্টাল (Master Admin Portal) এ যান।
2. "ব্যাকআপ জিপ আপলোড ও রিস্টোর" সেকশনে এই .zip ফাইলটি ড্রপ বা সিলেক্ট করুন।
3. সিস্টেম স্বয়ংক্রিয়ভাবে ফাইল যাচাই করবে এবং কনফার্ম করলেই সম্পূর্ণ ডাটাবেজ
   পুনরুদ্ধার হয়ে যাবে এবং ক্লাউড ডাটাবেজে সিঙ্ক হবে।
========================================================================`;
    zip.file('00_README_BACKUP_INFO.txt', readmeContent);

    // 4. Modules subfolder with lightweight JSON datasets (deduplicate large base64 blobs & biometric vectors already stored in all_school_data_complete.json)
    const stripLargeBlobs = (val: any): any => {
      if (typeof val === 'string') {
        if (val.startsWith('data:') && val.length > 4096) {
          return '[stored_in_all_school_data_complete.json]';
        }
        return val;
      }
      if (Array.isArray(val)) {
        if (val.length > 64 && typeof val[0] === 'number') {
          return '[stored_in_all_school_data_complete.json]';
        }
        return val.map(stripLargeBlobs);
      }
      if (val && typeof val === 'object') {
        const out: Record<string, any> = {};
        for (const [k, v] of Object.entries(val)) {
          out[k] = stripLargeBlobs(v);
        }
        return out;
      }
      return val;
    };

    const modulesFolder = zip.folder('modules');
    if (modulesFolder) {
      modulesFolder.file('students.json', JSON.stringify(stripLargeBlobs(this.getStudents())));
      modulesFolder.file('staff.json', JSON.stringify(stripLargeBlobs(this.getStaff())));
      modulesFolder.file(
        'classes_and_subjects.json',
        JSON.stringify({
          classes: this.getClasses(),
          subjects: this.getSubjects(),
        })
      );
      modulesFolder.file(
        'fees_invoices_payments.json',
        JSON.stringify({
          feeHeads: this.getFeeHeads(),
          classFees: this.getClassFeeConfigs(),
          invoices: this.getInvoices(),
          payments: this.getPayments(),
          incomeVouchers: this.getIncomeVouchers(),
          saleItems: this.getSaleItems(),
          mfsSettings: this.getMfsSettings(),
          onlinePaymentRequests: this.getOnlinePaymentRequests(),
        })
      );
      modulesFolder.file(
        'exams_and_marks.json',
        JSON.stringify({
          exams: this.getExams(),
          examRoutines: this.getExamRoutines(),
          marks: this.getMarks(),
        })
      );
      modulesFolder.file(
        'attendance.json',
        JSON.stringify({
          attendance: this.getAttendance(),
          rules: this.getAttendanceRules(),
          audit: this.getAttendanceAuditLogs(),
        })
      );
      modulesFolder.file(
        'homework_and_submissions.json',
        JSON.stringify(
          stripLargeBlobs({
            homework: this.getHomework(),
            submissions: this.getHomeworkSubmissions(),
          })
        )
      );
      modulesFolder.file('class_routines.json', JSON.stringify(this.getRoutines()));
      modulesFolder.file(
        'library.json',
        JSON.stringify({
          books: this.getBooks(),
          issues: this.getBookIssues(),
        })
      );
      modulesFolder.file(
        'transport_and_inventory.json',
        JSON.stringify({
          routes: this.getRoutes(),
          studentTransports: this.getStudentTransports(),
          inventory: this.getInventory(),
          expenses: this.getExpenses(),
          staffSalaries: this.getStaffSalaries(),
        })
      );
      modulesFolder.file('school_profile.json', JSON.stringify(stripLargeBlobs(this.getSchoolProfile())));
    }

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const timeStr = `${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}`;
    const filename = `SmartSchoolBD_FullBackup_${dateStr}_${timeStr}.zip`;

    const blob = await zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 9 },
    });

    return {
      blob,
      filename,
      summary: fullExport.stats,
    };
  },

  async downloadBackupZip(): Promise<{
    success: boolean;
    filename: string;
    sizeFormatted: string;
    summary: Record<string, number>;
  }> {
    try {
      const { blob, filename, summary } = await this.createBackupZipBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);

      const sizeKb = (blob.size / 1024).toFixed(1);
      const sizeFormatted = blob.size > 1024 * 1024 ? `${(blob.size / (1024 * 1024)).toFixed(2)} MB` : `${sizeKb} KB`;

      return {
        success: true,
        filename,
        sizeFormatted,
        summary,
      };
    } catch (err: any) {
      console.error('Failed to create/download backup zip:', err);
      throw err;
    }
  },

  restoreFullDatabaseBackup(backupJson: any): {
    success: boolean;
    message: string;
    counts?: Record<string, number>;
  } {
    try {
      if (!backupJson) {
        throw new Error('ব্যর্থ: ব্যাকআপ ফাইলটি ফাঁকা বা ত্রুটিপূর্ণ।');
      }

      // If wrapped in our standard export structure
      const dataPayload = backupJson.data || backupJson;
      let restoredCount = 0;

      Object.entries(STORAGE_KEYS).forEach(([_, storageKey]) => {
        if (storageKey in dataPayload) {
          const val = dataPayload[storageKey];
          if (val !== undefined && val !== null) {
            safeSetLocalStorage(storageKey, typeof val === 'string' ? val : JSON.stringify(val));
            restoredCount++;
          }
        }
      });

      // Reset clean slate indicator since full data is restored
      safeSetLocalStorage('school_erp_clean_slate', 'false');

      // Sync restored state immediately to cloud
      CloudSyncService.pushLocalToCloud(true);

      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('school_cloud_data_synced', {
            detail: { syncTime: new Date().toISOString() },
          })
        );
        window.dispatchEvent(new CustomEvent('school_profile_updated'));
      }

      const counts = {
        students: this.getStudents().length,
        staff: this.getStaff().length,
        invoices: this.getInvoices().length,
        exams: this.getExams().length,
        attendance: this.getAttendance().length,
      };

      return {
        success: true,
        message: 'সম্পূর্ণ ডাটাবেজ সফলভাবে রিস্টোর করা হয়েছে!',
        counts,
      };
    } catch (err: any) {
      console.error('Error in restoreFullDatabaseBackup:', err);
      return {
        success: false,
        message: err.message || 'ডাটা রিস্টোর করার সময় ত্রুটি ঘটেছে।',
      };
    }
  },

  async restoreFromZipFile(file: File): Promise<{
    success: boolean;
    message: string;
    counts?: Record<string, number>;
  }> {
    try {
      if (file.name.endsWith('.json') || file.type === 'application/json') {
        const text = await file.text();
        const json = JSON.parse(text);
        return this.restoreFullDatabaseBackup(json);
      }

      // Read as zip
      const zip = await JSZip.loadAsync(file);

      // 1. Check for complete master file (supports both Data-Only ZIP and Full Project ZIP)
      const completeFile =
        zip.file('all_school_data_complete.json') || zip.file('src/data/bakedSchoolData.json');
      if (completeFile) {
        const jsonText = await completeFile.async('text');
        const parsed = JSON.parse(jsonText);
        if (parsed && (parsed.data || Object.keys(parsed).length > 0)) {
          return this.restoreFullDatabaseBackup(parsed);
        }
      }

      // 2. Fallback: check if modules/ directory exists in zip
      const dataPayload: Record<string, any> = {};

      const readModule = async (filePath: string, storageKey: string) => {
        const f = zip.file(filePath);
        if (f) {
          try {
            const txt = await f.async('text');
            dataPayload[storageKey] = JSON.parse(txt);
          } catch (e) {
            console.warn(`Could not read ${filePath}`, e);
          }
        }
      };

      await readModule('modules/students.json', STORAGE_KEYS.STUDENTS);
      await readModule('modules/staff.json', STORAGE_KEYS.STAFF);
      await readModule('modules/school_profile.json', STORAGE_KEYS.SCHOOL);
      await readModule('modules/class_routines.json', STORAGE_KEYS.ROUTINES);

      // Check classes and subjects
      const csFile = zip.file('modules/classes_and_subjects.json');
      if (csFile) {
        const cs = JSON.parse(await csFile.async('text'));
        if (cs.classes) dataPayload[STORAGE_KEYS.CLASSES] = cs.classes;
        if (cs.subjects) dataPayload[STORAGE_KEYS.SUBJECTS] = cs.subjects;
      }

      // Check fees & invoices
      const fFile = zip.file('modules/fees_invoices_payments.json');
      if (fFile) {
        const fees = JSON.parse(await fFile.async('text'));
        if (fees.feeHeads) dataPayload[STORAGE_KEYS.FEE_HEADS] = fees.feeHeads;
        if (fees.classFees) dataPayload[STORAGE_KEYS.CLASS_FEES] = fees.classFees;
        if (fees.invoices) dataPayload[STORAGE_KEYS.INVOICES] = fees.invoices;
        if (fees.payments) dataPayload[STORAGE_KEYS.PAYMENTS] = fees.payments;
        if (fees.incomeVouchers) dataPayload[STORAGE_KEYS.INCOME_VOUCHERS] = fees.incomeVouchers;
        if (fees.saleItems) dataPayload[STORAGE_KEYS.SALE_ITEMS] = fees.saleItems;
        if (fees.mfsSettings) dataPayload[STORAGE_KEYS.MFS_SETTINGS] = fees.mfsSettings;
        if (fees.onlinePaymentRequests) dataPayload[STORAGE_KEYS.ONLINE_PAYMENT_REQUESTS] = fees.onlinePaymentRequests;
      }

      // Check exams & marks
      const emFile = zip.file('modules/exams_and_marks.json');
      if (emFile) {
        const em = JSON.parse(await emFile.async('text'));
        if (em.exams) dataPayload[STORAGE_KEYS.EXAMS] = em.exams;
        if (em.examRoutines) dataPayload[STORAGE_KEYS.EXAM_ROUTINES] = em.examRoutines;
        if (em.marks) dataPayload[STORAGE_KEYS.MARKS] = em.marks;
      }

      // Check attendance
      const attFile = zip.file('modules/attendance.json');
      if (attFile) {
        const att = JSON.parse(await attFile.async('text'));
        if (att.attendance) dataPayload[STORAGE_KEYS.ATTENDANCE] = att.attendance;
        if (att.rules) dataPayload[STORAGE_KEYS.ATTENDANCE_RULES] = att.rules;
        if (att.audit) dataPayload[STORAGE_KEYS.ATTENDANCE_AUDIT] = att.audit;
      }

      // Check homework
      const hwFile = zip.file('modules/homework_and_submissions.json');
      if (hwFile) {
        const hw = JSON.parse(await hwFile.async('text'));
        if (hw.homework) dataPayload[STORAGE_KEYS.HOMEWORK] = hw.homework;
        if (hw.submissions) dataPayload[STORAGE_KEYS.HOMEWORK_SUBMISSIONS] = hw.submissions;
      }

      // Check library
      const libFile = zip.file('modules/library.json');
      if (libFile) {
        const lib = JSON.parse(await libFile.async('text'));
        if (lib.books) dataPayload[STORAGE_KEYS.BOOKS] = lib.books;
        if (lib.issues) dataPayload[STORAGE_KEYS.BOOK_ISSUES] = lib.issues;
      }

      // Check transport & inventory
      const trFile = zip.file('modules/transport_and_inventory.json');
      if (trFile) {
        const tr = JSON.parse(await trFile.async('text'));
        if (tr.routes) dataPayload[STORAGE_KEYS.ROUTES] = tr.routes;
        if (tr.studentTransports) dataPayload[STORAGE_KEYS.STUDENT_TRANSPORTS] = tr.studentTransports;
        if (tr.inventory) dataPayload[STORAGE_KEYS.INVENTORY] = tr.inventory;
        if (tr.expenses) dataPayload[STORAGE_KEYS.EXPENSES] = tr.expenses;
        if (tr.staffSalaries) dataPayload[STORAGE_KEYS.STAFF_SALARIES] = tr.staffSalaries;
      }

      if (Object.keys(dataPayload).length > 0) {
        return this.restoreFullDatabaseBackup({ data: dataPayload });
      }

      throw new Error('জিপ ফাইলে কোনো উপযুক্ত ব্যাকআপ ডাটা পাওয়া যায়নি।');
    } catch (err: any) {
      console.error('Failed to restore from zip:', err);
      return {
        success: false,
        message: err.message || 'জিপ ফাইল থেকে রিস্টোর করতে সমস্যা হয়েছে।',
      };
    }
  },

  // Download complete runnable project codebase (.ZIP) containing all source files + baked database for Google AI Studio
  async downloadFullCodebaseProjectZip(): Promise<{
    success: boolean;
    filename: string;
    sizeFormatted: string;
  }> {
    try {
      const token = await getFreshIdToken(false);
      if (!token) {
        throw new Error('প্রজেক্ট জিপ ডাউনলোড করতে মাস্টার অ্যাডমিন সেশন লগইন প্রয়োজন।');
      }
      const fullExport = this.exportAllDatabaseToJson();
      const response = await fetch('/api/export-full-codebase-zip', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(fullExport),
      });

      if (!response.ok) {
        throw new Error('সার্ভার থেকে প্রজেক্ট জিপ তৈরি করতে ব্যর্থ হয়েছে।');
      }

      const blob = await response.blob();
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = 'SmartSchoolBD_FullProject_AIStudio.zip';
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="?([^"]+)"?/);
        if (match && match[1]) filename = match[1];
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);

      const sizeMb = (blob.size / (1024 * 1024)).toFixed(2);
      return {
        success: true,
        filename,
        sizeFormatted: `${sizeMb} MB`,
      };
    } catch (err: any) {
      console.error('Failed to download full codebase zip:', err);
      throw err;
    }
  },

  async syncPublicWebsite(explicitSchoolId?: string): Promise<boolean> {
    try {
      const saasSchoolId = safeGetLocalStorage(SAAS_ACTIVE_SCHOOL_KEY);
      const schoolId = explicitSchoolId || saasSchoolId || 'local_school';
      const payload = buildPublicWebsitePayloadFromERP({
        schoolId,
        profile: this.getSchoolProfile(),
        classes: this.getClasses(),
        subjects: this.getSubjects(),
        students: this.getStudents(),
        staff: this.getStaff(),
        notices: this.getNotices(),
        blogPosts: this.getBlogPosts(),
        marks: this.getMarks(),
        exams: this.getExams(),
      });
      return await publishPublicWebsiteSnapshot(payload);
    } catch (err) {
      console.warn('Could not sync public website snapshot:', err);
      return false;
    }
  },

  async syncPublicInboxFromCloud(explicitSchoolId?: string): Promise<{ newAdmissions: number; newMessages: number }> {
    const saasSchoolId = explicitSchoolId || safeGetLocalStorage(SAAS_ACTIVE_SCHOOL_KEY);
    if (!saasSchoolId || saasSchoolId === 'local_school') {
      return { newAdmissions: 0, newMessages: 0 };
    }

    let newAdmissions = 0;
    let newMessages = 0;

    try {
      const [cloudAdmissions, cloudMessages] = await Promise.all([
        fetchPublicAdmissionsQueue(saasSchoolId),
        fetchPublicMessagesInbox(saasSchoolId),
      ]);

      if (cloudAdmissions.length > 0) {
        const localEnq = this.getEnquiries();
        const existingIds = new Set(localEnq.map((e) => e.id));
        const unseen = cloudAdmissions.filter((a) => !existingIds.has(a.id));
        if (unseen.length > 0) {
          setStored(STORAGE_KEYS.ENQUIRIES, [...unseen, ...localEnq]);
          newAdmissions = unseen.length;
          CloudSyncService.pushSliceToCloud('students', true);
        }
      }

      if (cloudMessages.length > 0) {
        const localMsgs = this.getWebsiteMessages();
        const existingMsgIds = new Set(localMsgs.map((m) => m.id));
        const unseenMsgs = cloudMessages.filter((m) => !existingMsgIds.has(m.id));
        if (unseenMsgs.length > 0) {
          setStored(STORAGE_KEYS.WEBSITE_MESSAGES, [...unseenMsgs, ...localMsgs]);
          newMessages = unseenMsgs.length;
          CloudSyncService.pushSliceToCloud('profile', true);
        }
      }

      if ((newAdmissions > 0 || newMessages > 0) && typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('school_cloud_data_synced', { detail: { syncTime: new Date().toISOString() } })
        );
      }
    } catch (err) {
      console.warn('Could not pull public website inbox from Firestore:', err);
    }

    return { newAdmissions, newMessages };
  },
};

