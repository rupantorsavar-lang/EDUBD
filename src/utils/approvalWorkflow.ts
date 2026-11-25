import {
  DraftApprovalStatus,
  Exam,
  ExamScheduleItem,
  ExamSeatPlanConfig,
  MarksEntry,
  RoutinePeriod,
  Subject,
  UserProfile,
  UserRole,
} from '../types';

export interface ApprovalMetadata {
  approvalStatus: DraftApprovalStatus;
  submittedBy?: string;
  submittedById?: string;
  submittedAt?: string;
  approvedBy?: string;
  approvedAt?: string;
  rejectionNote?: string;
}

/**
 * Only Super Admin (or Master Admin on tenant) can approve and publish teacher drafts.
 */
export function isSuperAdminApprover(role?: UserRole | null): boolean {
  return role === 'super_admin' || role === 'master_admin';
}

/**
 * Resolves effective approval status while remaining backward-compatible with
 * legacy pre-existing records that did not have `approvalStatus` stored.
 */
export function resolveEffectiveApprovalStatus(
  status?: DraftApprovalStatus | null
): DraftApprovalStatus {
  if (
    status === 'draft' ||
    status === 'pending_approval' ||
    status === 'published' ||
    status === 'rejected'
  ) {
    return status;
  }
  return 'published';
}

/**
 * Returns true only if the item should be visible in Student/Guardian portals.
 * Any draft, pending_approval, or rejected record is strictly hidden.
 */
export function isPublishedForStudents(status?: DraftApprovalStatus | null): boolean {
  return resolveEffectiveApprovalStatus(status) === 'published';
}

/**
 * Seat plan publication check combining explicit `isPublished` flag and `approvalStatus`.
 */
export function isSeatPlanPublishedForStudents(plan?: ExamSeatPlanConfig | null): boolean {
  if (!plan) return false;
  if (plan.isPublished === false) return false;
  return isPublishedForStudents(plan.approvalStatus);
}

export function buildTeacherDraftMeta(
  user?: Pick<UserProfile, 'id' | 'name' | 'nameBn'> | null,
  status: 'draft' | 'pending_approval' = 'draft'
): ApprovalMetadata {
  const actorName = user?.nameBn || user?.name || 'Teacher';
  return {
    approvalStatus: status,
    submittedBy: actorName,
    submittedById: user?.id,
    submittedAt: new Date().toISOString(),
    approvedBy: undefined,
    approvedAt: undefined,
    rejectionNote: undefined,
  };
}

export function buildSuperAdminPublishMeta(adminName?: string): ApprovalMetadata {
  return {
    approvalStatus: 'published',
    approvedBy: adminName || 'Super Admin',
    approvedAt: new Date().toISOString(),
    rejectionNote: undefined,
  };
}

export function buildSuperAdminRejectMeta(adminName?: string, reason?: string): ApprovalMetadata {
  return {
    approvalStatus: 'rejected',
    approvedBy: adminName || 'Super Admin',
    approvedAt: new Date().toISOString(),
    rejectionNote: reason?.trim() || 'সংশোধনের জন্য ফেরত পাঠানো হয়েছে।',
  };
}

export function getApprovalStatusBadgeInfo(
  status: DraftApprovalStatus | undefined,
  language: 'bn' | 'en'
): {
  status: DraftApprovalStatus;
  label: string;
  badgeClass: string;
} {
  const effective = resolveEffectiveApprovalStatus(status);
  if (effective === 'published') {
    return {
      status: 'published',
      label: language === 'bn' ? 'প্রকাশিত' : 'Published',
      badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    };
  }
  if (effective === 'pending_approval') {
    return {
      status: 'pending_approval',
      label: language === 'bn' ? 'অনুমোদনের অপেক্ষায়' : 'Pending Approval',
      badgeClass: 'bg-amber-50 text-amber-800 border-amber-300',
    };
  }
  if (effective === 'rejected') {
    return {
      status: 'rejected',
      label: language === 'bn' ? 'ফেরত পাঠানো' : 'Returned',
      badgeClass: 'bg-rose-50 text-rose-700 border-rose-200',
    };
  }
  return {
    status: 'draft',
    label: language === 'bn' ? 'খসড়া (Draft)' : 'Draft',
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-300',
  };
}

export interface PendingExamRoutineGroup {
  key: string;
  examId: string;
  examName: string;
  className: string;
  itemIds: string[];
  count: number;
  status: 'pending_approval' | 'draft';
  submittedBy?: string;
  submittedAt?: string;
}

export interface PendingSeatPlanItem {
  examId: string;
  examName: string;
  roomCount: number;
  assignedCount: number;
  classesLabel: string;
  status: 'pending_approval' | 'draft';
  submittedBy?: string;
  submittedAt?: string;
}

export interface PendingMarksGroup {
  key: string;
  examId: string;
  examName: string;
  subjectId: string;
  subjectName: string;
  className: string;
  studentCount: number;
  status: 'pending_approval' | 'draft';
  submittedBy?: string;
  submittedAt?: string;
}

export interface PendingApprovalsSummary {
  totalPendingCount: number;
  totalDraftCount: number;
  classRoutinePending: RoutinePeriod[];
  classRoutineDrafts: RoutinePeriod[];
  examRoutinePendingGroups: PendingExamRoutineGroup[];
  examRoutineDraftGroups: PendingExamRoutineGroup[];
  seatPlansPending: PendingSeatPlanItem[];
  seatPlansDrafts: PendingSeatPlanItem[];
  marksPendingGroups: PendingMarksGroup[];
  marksDraftGroups: PendingMarksGroup[];
}

export function summarizePendingApprovals(params: {
  routines: RoutinePeriod[];
  examRoutines: ExamScheduleItem[];
  seatPlans: Record<string, ExamSeatPlanConfig>;
  marks: MarksEntry[];
  exams: Exam[];
  subjects: Subject[];
}): PendingApprovalsSummary {
  const { routines, examRoutines, seatPlans, marks, exams, subjects } = params;

  const examMap = new Map(exams.map((e) => [e.id, e]));
  const subjectMap = new Map(subjects.map((s) => [s.id, s]));

  // 1. Class Routines
  const classRoutinePending = routines.filter((r) => r.approvalStatus === 'pending_approval');
  const classRoutineDrafts = routines.filter((r) => r.approvalStatus === 'draft');

  // 2. Exam Routines grouped by examId + className + status
  const groupExamRoutines = (targetStatus: 'pending_approval' | 'draft'): PendingExamRoutineGroup[] => {
    const map = new Map<string, PendingExamRoutineGroup>();
    examRoutines
      .filter((er) => er.approvalStatus === targetStatus)
      .forEach((er) => {
        const key = `${er.examId}__${er.className}__${targetStatus}`;
        const existing = map.get(key);
        const ex = examMap.get(er.examId);
        if (existing) {
          existing.itemIds.push(er.id);
          existing.count += 1;
          if (!existing.submittedBy && er.submittedBy) existing.submittedBy = er.submittedBy;
          if (er.submittedAt && (!existing.submittedAt || er.submittedAt > existing.submittedAt)) {
            existing.submittedAt = er.submittedAt;
          }
        } else {
          map.set(key, {
            key,
            examId: er.examId,
            examName: ex?.nameBn || ex?.nameEn || er.examId,
            className: er.className,
            itemIds: [er.id],
            count: 1,
            status: targetStatus,
            submittedBy: er.submittedBy,
            submittedAt: er.submittedAt,
          });
        }
      });
    return Array.from(map.values());
  };

  const examRoutinePendingGroups = groupExamRoutines('pending_approval');
  const examRoutineDraftGroups = groupExamRoutines('draft');

  // 3. Seat Plans
  const groupSeatPlans = (targetStatus: 'pending_approval' | 'draft'): PendingSeatPlanItem[] => {
    return Object.values(seatPlans || {})
      .filter((sp) => sp && sp.approvalStatus === targetStatus)
      .map((sp) => {
        const ex = examMap.get(sp.examId);
        return {
          examId: sp.examId,
          examName: ex?.nameBn || ex?.nameEn || sp.examId,
          roomCount: sp.rooms?.length || 0,
          assignedCount: sp.assignments?.length || 0,
          classesLabel: sp.selectedClasses?.join(', ') || 'All',
          status: targetStatus,
          submittedBy: sp.submittedBy,
          submittedAt: sp.submittedAt || sp.updatedAt,
        };
      });
  };

  const seatPlansPending = groupSeatPlans('pending_approval');
  const seatPlansDrafts = groupSeatPlans('draft');

  // 4. Marks Entries grouped by examId + subjectId + status
  const groupMarks = (targetStatus: 'pending_approval' | 'draft'): PendingMarksGroup[] => {
    const map = new Map<string, PendingMarksGroup>();
    marks
      .filter((m) => m.approvalStatus === targetStatus)
      .forEach((m) => {
        const key = `${m.examId}__${m.subjectId}__${targetStatus}`;
        const existing = map.get(key);
        const ex = examMap.get(m.examId);
        const sub = subjectMap.get(m.subjectId);
        if (existing) {
          existing.studentCount += 1;
          if (!existing.submittedBy && m.submittedBy) existing.submittedBy = m.submittedBy;
          if (m.submittedAt && (!existing.submittedAt || m.submittedAt > existing.submittedAt)) {
            existing.submittedAt = m.submittedAt;
          }
        } else {
          map.set(key, {
            key,
            examId: m.examId,
            examName: ex?.nameBn || ex?.nameEn || m.examId,
            subjectId: m.subjectId,
            subjectName: sub?.nameBn || sub?.nameEn || m.subjectName || m.subjectId,
            className: m.className || sub?.className || '',
            studentCount: 1,
            status: targetStatus,
            submittedBy: m.submittedBy,
            submittedAt: m.submittedAt,
          });
        }
      });
    return Array.from(map.values());
  };

  const marksPendingGroups = groupMarks('pending_approval');
  const marksDraftGroups = groupMarks('draft');

  const totalPendingCount =
    classRoutinePending.length +
    examRoutinePendingGroups.length +
    seatPlansPending.length +
    marksPendingGroups.length;

  const totalDraftCount =
    classRoutineDrafts.length +
    examRoutineDraftGroups.length +
    seatPlansDrafts.length +
    marksDraftGroups.length;

  return {
    totalPendingCount,
    totalDraftCount,
    classRoutinePending,
    classRoutineDrafts,
    examRoutinePendingGroups,
    examRoutineDraftGroups,
    seatPlansPending,
    seatPlansDrafts,
    marksPendingGroups,
    marksDraftGroups,
  };
}
