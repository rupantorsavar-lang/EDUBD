import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  FileEdit,
  RotateCcw,
  ShieldCheck,
  ArrowUpRight,
  CalendarDays,
  Grid,
  Award,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { StorageService } from '../../services/storage';
import {
  isSuperAdminApprover,
  summarizePendingApprovals,
} from '../../utils/approvalWorkflow';

interface SuperAdminDraftApprovalsProps {
  onNavigate: (tab: string) => void;
  language: 'bn' | 'en';
  toBnNumber: (num: number | string | undefined | null) => string;
}

type RejectTarget =
  | { kind: 'class_routine'; ids: string[]; label: string }
  | { kind: 'exam_routine'; examId: string; ids: string[]; label: string }
  | { kind: 'seat_plan'; examId: string; label: string }
  | { kind: 'marks'; examId: string; subjectId: string; label: string };

export const SuperAdminDraftApprovals: React.FC<SuperAdminDraftApprovalsProps> = ({
  onNavigate,
  language,
  toBnNumber,
}) => {
  const { activeRole, currentUser } = useAuth();
  const isApprover = isSuperAdminApprover(activeRole);

  const [tick, setTick] = useState(0);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<RejectTarget | null>(null);
  const [rejectReason, setRejectReason] = useState<string>('');
  const [showUnsentDrafts, setShowUnsentDrafts] = useState<boolean>(false);

  useEffect(() => {
    const onSync = () => setTick((n) => n + 1);
    window.addEventListener('school_cloud_data_synced', onSync);
    return () => window.removeEventListener('school_cloud_data_synced', onSync);
  }, []);

  const summary = useMemo(() => {
    return summarizePendingApprovals({
      routines: StorageService.getRoutines(),
      examRoutines: StorageService.getExamRoutines(),
      seatPlans: StorageService.getExamSeatPlans(),
      marks: StorageService.getMarks(),
      exams: StorageService.getExams(),
      subjects: StorageService.getSubjects(),
    });
  }, [tick]);

  if (!isApprover) return null;

  const adminName = currentUser?.nameBn || currentUser?.name || 'Super Admin';
  const hasAnyItems = summary.totalPendingCount > 0 || summary.totalDraftCount > 0;
  if (!hasAnyItems) return null;

  const showToast = (msg: string) => {
    setFeedback(msg);
    setTimeout(() => setFeedback(null), 4000);
  };

  const handleConfirmReject = () => {
    if (!rejectTarget) return;
    const reason = rejectReason.trim() || 'সংশোধনের জন্য ফেরত পাঠানো হয়েছে।';
    if (rejectTarget.kind === 'class_routine') {
      StorageService.rejectClassRoutines(rejectTarget.ids, adminName, reason);
    } else if (rejectTarget.kind === 'exam_routine') {
      StorageService.rejectExamRoutines(rejectTarget.examId, rejectTarget.ids, adminName, reason);
    } else if (rejectTarget.kind === 'seat_plan') {
      StorageService.rejectExamSeatPlan(rejectTarget.examId, adminName, reason);
    } else if (rejectTarget.kind === 'marks') {
      StorageService.rejectMarksEntries(
        rejectTarget.examId,
        rejectTarget.subjectId,
        adminName,
        reason
      );
    }
    showToast(
      language === 'bn'
        ? `"${rejectTarget.label}" সংশোধনের জন্য শিক্ষকের কাছে ফেরত পাঠানো হয়েছে।`
        : `"${rejectTarget.label}" returned to teacher for revision.`
    );
    setRejectTarget(null);
    setRejectReason('');
    setTick((n) => n + 1);
  };

  const classRoutinePendingClasses = Array.from(
    new Set(summary.classRoutinePending.map((r) => r.className))
  );
  const classRoutineDraftClasses = Array.from(
    new Set(summary.classRoutineDrafts.map((r) => r.className))
  );

  return (
    <div className="bg-white rounded-2xl border-2 border-indigo-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 bg-gradient-to-r from-indigo-900 via-blue-900 to-slate-900 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-xl bg-amber-400/20 border border-amber-300/40 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-6 h-6 text-amber-300" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm sm:text-base font-black text-white">
                {language === 'bn'
                  ? 'শিক্ষকের খসড়া অনুমোদন ও প্রকাশ কেন্দ্র (SuperAdmin Queue)'
                  : 'Teacher Draft Approvals & Publishing Queue'}
              </h3>
              {summary.totalPendingCount > 0 && (
                <span className="px-2.5 py-0.5 rounded-full bg-amber-400 text-slate-950 text-[11px] font-black">
                  {language === 'bn'
                    ? `${toBnNumber(summary.totalPendingCount)}টি অনুমোদনের অপেক্ষায়`
                    : `${summary.totalPendingCount} Pending`}
                </span>
              )}
              {summary.totalDraftCount > 0 && (
                <span className="px-2.5 py-0.5 rounded-full bg-white/15 text-indigo-100 text-[11px] font-bold">
                  {language === 'bn'
                    ? `${toBnNumber(summary.totalDraftCount)}টি অসম্পূর্ণ খসড়া`
                    : `${summary.totalDraftCount} Drafts`}
                </span>
              )}
            </div>
            <p className="text-xs text-indigo-200 mt-0.5">
              {language === 'bn'
                ? 'শিক্ষকদের তৈরি ক্লাস রুটিন, পরীক্ষার রুটিন, আসন বিন্যাস এবং নম্বর এন্ট্রি অনুমোদন না হওয়া পর্যন্ত শিক্ষার্থী পোর্টালে প্রকাশিত হবে না।'
                : 'Teacher drafts for Class Routine, Exam Routine, Seat Plan, and Marks remain hidden from students until approved and published here.'}
            </p>
          </div>
        </div>

        {summary.totalDraftCount > 0 && (
          <button
            type="button"
            onClick={() => setShowUnsentDrafts((v) => !v)}
            className="px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-white text-xs font-bold border border-white/20 shrink-0 transition-colors"
          >
            {showUnsentDrafts
              ? language === 'bn'
                ? 'অসম্পূর্ণ খসড়া লুকান'
                : 'Hide Unsent Drafts'
              : language === 'bn'
              ? `শিক্ষকের খসড়া দেখুন (${toBnNumber(summary.totalDraftCount)})`
              : `View Unsent Drafts (${summary.totalDraftCount})`}
          </button>
        )}
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div className="px-5 py-2.5 bg-emerald-50 border-b border-emerald-200 text-xs font-bold text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{feedback}</span>
        </div>
      )}

      {/* Reject Reason Box */}
      {rejectTarget && (
        <div className="px-5 py-3 bg-rose-50 border-b border-rose-200 flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
          <div className="text-xs font-bold text-rose-900 shrink-0">
            {language === 'bn'
              ? `ফেরত পাঠানোর কারণ (${rejectTarget.label}):`
              : `Return reason (${rejectTarget.label}):`}
          </div>
          <input
            type="text"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder={
              language === 'bn'
                ? 'যেমন: সময়সূচি বা নম্বর পুনরায় যাচাই করুন...'
                : 'e.g., Please double-check timing or marks...'
            }
            className="flex-1 px-3 py-1.5 rounded-lg border border-rose-300 bg-white text-xs text-slate-900"
          />
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleConfirmReject}
              className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold"
            >
              {language === 'bn' ? 'নিশ্চিত ফেরত' : 'Confirm Return'}
            </button>
            <button
              type="button"
              onClick={() => {
                setRejectTarget(null);
                setRejectReason('');
              }}
              className="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-100"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Pending Approval List */}
      <div className="p-4 sm:p-5 space-y-3">
        {summary.totalPendingCount === 0 ? (
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 flex items-center gap-2">
            <Clock className="w-4 h-4 text-slate-400 shrink-0" />
            <span>
              {language === 'bn'
                ? 'বর্তমানে শিক্ষকের পাঠানো কোনো পেন্ডিং আবেদন নেই; তবে নিচে খসড়া পর্যায়ের কাজ রয়েছে।'
                : 'No teacher submissions are pending approval right now; unsubmitted drafts exist.'}
            </span>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {/* 1. Class Routine Pending */}
            {summary.classRoutinePending.length > 0 && (
              <div className="p-3.5 rounded-xl border border-amber-200 bg-amber-50/50 flex flex-col justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <div className="p-2 rounded-lg bg-sky-100 text-sky-700 shrink-0">
                    <CalendarDays className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs font-black text-slate-900">
                        {language === 'bn' ? 'ক্লাস রুটিন খসড়া' : 'Class Routine Draft'}
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-amber-200 text-amber-900 text-[10px] font-bold">
                        {toBnNumber(summary.classRoutinePending.length)}টি পিরিয়ড
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 mt-0.5">
                      {language === 'bn' ? 'শ্রেণি:' : 'Classes:'}{' '}
                      {classRoutinePendingClasses.join(', ')}
                      {summary.classRoutinePending[0]?.submittedBy
                        ? ` · প্রেরক: ${summary.classRoutinePending[0].submittedBy}`
                        : ''}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      const ids = summary.classRoutinePending.map((r) => r.id);
                      StorageService.approveClassRoutines(ids, adminName);
                      showToast(
                        language === 'bn'
                          ? 'ক্লাস রুটিন অনুমোদন ও প্রকাশ করা হয়েছে!'
                          : 'Class routine approved and published!'
                      );
                      setTick((n) => n + 1);
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{language === 'bn' ? 'অনুমোদন ও প্রকাশ' : 'Approve & Publish'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRejectTarget({
                        kind: 'class_routine',
                        ids: summary.classRoutinePending.map((r) => r.id),
                        label: language === 'bn' ? 'ক্লাস রুটিন' : 'Class Routine',
                      });
                      setRejectReason('');
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-rose-200 text-rose-700 hover:bg-rose-50 text-[11px] font-bold"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>{language === 'bn' ? 'ফেরত' : 'Return'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigate('routine')}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-[11px] font-semibold ml-auto"
                  >
                    <span>{language === 'bn' ? 'পর্যালোচনা' : 'Review'}</span>
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* 2. Exam Routine Pending Groups */}
            {summary.examRoutinePendingGroups.map((grp) => (
              <div
                key={grp.key}
                className="p-3.5 rounded-xl border border-amber-200 bg-amber-50/50 flex flex-col justify-between gap-3"
              >
                <div className="flex items-start gap-2.5">
                  <div className="p-2 rounded-lg bg-amber-100 text-amber-800 shrink-0">
                    <Clock className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs font-black text-slate-900">
                        {language === 'bn' ? 'পরীক্ষার রুটিন' : 'Exam Routine'} · {grp.className}
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-amber-200 text-amber-900 text-[10px] font-bold">
                        {toBnNumber(grp.count)}টি বিষয়
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 mt-0.5">
                      {grp.examName}
                      {grp.submittedBy ? ` · প্রেরক: ${grp.submittedBy}` : ''}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                      onClick={() => {
                        StorageService.approveExamRoutines(grp.examId, grp.itemIds, adminName);
                        showToast(
                          language === 'bn'
                            ? `${grp.className}-এর পরীক্ষার রুটিন প্রকাশিত হয়েছে!`
                            : `${grp.className} exam routine published!`
                        );
                        setTick((n) => n + 1);
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>{language === 'bn' ? 'অনুমোদন ও প্রকাশ' : 'Approve & Publish'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRejectTarget({
                          kind: 'exam_routine',
                          examId: grp.examId,
                          ids: grp.itemIds,
                          label: `${grp.examName} (${grp.className})`,
                        });
                        setRejectReason('');
                      }}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-rose-200 text-rose-700 hover:bg-rose-50 text-[11px] font-bold"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>{language === 'bn' ? 'ফেরত' : 'Return'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigate('examinations:exam_routine')}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-[11px] font-semibold ml-auto"
                  >
                    <span>{language === 'bn' ? 'পর্যালোচনা' : 'Review'}</span>
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}

            {/* 3. Seat Plan Pending */}
            {summary.seatPlansPending.map((sp) => (
              <div
                key={sp.examId}
                className="p-3.5 rounded-xl border border-amber-200 bg-amber-50/50 flex flex-col justify-between gap-3"
              >
                <div className="flex items-start gap-2.5">
                  <div className="p-2 rounded-lg bg-violet-100 text-violet-700 shrink-0">
                    <Grid className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs font-black text-slate-900">
                        {language === 'bn' ? 'পরীক্ষার আসন বিন্যাস' : 'Exam Seat Plan'}
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-amber-200 text-amber-900 text-[10px] font-bold">
                        {toBnNumber(sp.roomCount)} কক্ষ · {toBnNumber(sp.assignedCount)} আসন
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 mt-0.5">
                      {sp.examName} ({sp.classesLabel})
                      {sp.submittedBy ? ` · প্রেরক: ${sp.submittedBy}` : ''}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      StorageService.approveExamSeatPlan(sp.examId, adminName);
                      showToast(
                        language === 'bn'
                          ? `${sp.examName}-এর আসন বিন্যাস প্রকাশিত হয়েছে!`
                          : `Seat plan for ${sp.examName} published!`
                      );
                      setTick((n) => n + 1);
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{language === 'bn' ? 'অনুমোদন ও প্রকাশ' : 'Approve & Publish'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRejectTarget({
                        kind: 'seat_plan',
                        examId: sp.examId,
                        label: `${sp.examName} আসন বিন্যাস`,
                      });
                      setRejectReason('');
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-rose-200 text-rose-700 hover:bg-rose-50 text-[11px] font-bold"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>{language === 'bn' ? 'ফেরত' : 'Return'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigate('examinations:seat_plan')}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-[11px] font-semibold ml-auto"
                  >
                    <span>{language === 'bn' ? 'পর্যালোচনা' : 'Review'}</span>
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}

            {/* 4. Marks Entry Pending Groups */}
            {summary.marksPendingGroups.map((mg) => (
              <div
                key={mg.key}
                className="p-3.5 rounded-xl border border-amber-200 bg-amber-50/50 flex flex-col justify-between gap-3"
              >
                <div className="flex items-start gap-2.5">
                  <div className="p-2 rounded-lg bg-emerald-100 text-emerald-700 shrink-0">
                    <Award className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs font-black text-slate-900">
                        {language === 'bn' ? 'নম্বর এন্ট্রি' : 'Marks Entry'} · {mg.subjectName}
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-amber-200 text-amber-900 text-[10px] font-bold">
                        {toBnNumber(mg.studentCount)} জন শিক্ষার্থী
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 mt-0.5">
                      {mg.examName} {mg.className ? `(${mg.className})` : ''}
                      {mg.submittedBy ? ` · প্রেরক: ${mg.submittedBy}` : ''}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      StorageService.approveMarksEntries(mg.examId, mg.subjectId, adminName);
                      showToast(
                        language === 'bn'
                          ? `${mg.subjectName}-এর নম্বর অনুমোদন ও প্রকাশ হয়েছে!`
                          : `Marks for ${mg.subjectName} approved & published!`
                      );
                      setTick((n) => n + 1);
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{language === 'bn' ? 'অনুমোদন ও প্রকাশ' : 'Approve & Publish'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRejectTarget({
                        kind: 'marks',
                        examId: mg.examId,
                        subjectId: mg.subjectId,
                        label: `${mg.subjectName} নম্বর এন্ট্রি`,
                      });
                      setRejectReason('');
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-rose-200 text-rose-700 hover:bg-rose-50 text-[11px] font-bold"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>{language === 'bn' ? 'ফেরত' : 'Return'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigate('examinations:marks_entry')}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-[11px] font-semibold ml-auto"
                  >
                    <span>{language === 'bn' ? 'পর্যালোচনা' : 'Review'}</span>
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Unsubmitted Teacher Drafts Preview (Optional Toggle) */}
        {showUnsentDrafts && summary.totalDraftCount > 0 && (
          <div className="pt-3 border-t border-slate-200 space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
              <FileEdit className="w-3.5 h-3.5 text-slate-500" />
              <span>
                {language === 'bn'
                  ? 'শিক্ষকের খসড়া (এখনো অনুমোদনের জন্য পাঠানো হয়নি)'
                  : 'Teacher Drafts (Not yet submitted for approval)'}
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 text-xs">
              {summary.classRoutineDrafts.length > 0 && (
                <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between gap-2">
                  <div>
                    <span className="font-bold text-slate-800">ক্লাস রুটিন খসড়া</span>
                    <span className="text-[11px] text-slate-500 block">
                      {toBnNumber(summary.classRoutineDrafts.length)}টি পিরিয়ড ({classRoutineDraftClasses.join(', ')})
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        StorageService.approveClassRoutines(
                          summary.classRoutineDrafts.map((r) => r.id),
                          adminName
                        );
                        showToast('ক্লাস রুটিন খসড়া প্রকাশ করা হয়েছে!');
                        setTick((n) => n + 1);
                      }}
                      className="px-2 py-1 rounded bg-emerald-600 text-white text-[10px] font-bold"
                    >
                      প্রকাশ
                    </button>
                    <button
                      type="button"
                      onClick={() => onNavigate('routine')}
                      className="px-2 py-1 rounded bg-white border border-slate-200 text-slate-700 text-[10px] font-semibold"
                    >
                      দেখুন
                    </button>
                  </div>
                </div>
              )}

              {summary.examRoutineDraftGroups.map((grp) => (
                <div
                  key={grp.key}
                  className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between gap-2"
                >
                  <div>
                    <span className="font-bold text-slate-800">
                      পরীক্ষার রুটিন ({grp.className})
                    </span>
                    <span className="text-[11px] text-slate-500 block">
                      {grp.examName} · {toBnNumber(grp.count)}টি বিষয়
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        StorageService.approveExamRoutines(grp.examId, grp.itemIds, adminName);
                        showToast(`${grp.className}-এর পরীক্ষার রুটিন প্রকাশিত হয়েছে!`);
                        setTick((n) => n + 1);
                      }}
                      className="px-2 py-1 rounded bg-emerald-600 text-white text-[10px] font-bold"
                    >
                      প্রকাশ
                    </button>
                    <button
                      type="button"
                      onClick={() => onNavigate('examinations:exam_routine')}
                      className="px-2 py-1 rounded bg-white border border-slate-200 text-slate-700 text-[10px] font-semibold"
                    >
                      দেখুন
                    </button>
                  </div>
                </div>
              ))}

              {summary.seatPlansDrafts.map((sp) => (
                <div
                  key={sp.examId}
                  className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between gap-2"
                >
                  <div>
                    <span className="font-bold text-slate-800">আসন বিন্যাস খসড়া</span>
                    <span className="text-[11px] text-slate-500 block">
                      {sp.examName} · {toBnNumber(sp.roomCount)} কক্ষ
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        StorageService.approveExamSeatPlan(sp.examId, adminName);
                        showToast('আসন বিন্যাস প্রকাশিত হয়েছে!');
                        setTick((n) => n + 1);
                      }}
                      className="px-2 py-1 rounded bg-emerald-600 text-white text-[10px] font-bold"
                    >
                      প্রকাশ
                    </button>
                    <button
                      type="button"
                      onClick={() => onNavigate('examinations:seat_plan')}
                      className="px-2 py-1 rounded bg-white border border-slate-200 text-slate-700 text-[10px] font-semibold"
                    >
                      দেখুন
                    </button>
                  </div>
                </div>
              ))}

              {summary.marksDraftGroups.map((mg) => (
                <div
                  key={mg.key}
                  className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between gap-2"
                >
                  <div>
                    <span className="font-bold text-slate-800">
                      নম্বর খসড়া · {mg.subjectName}
                    </span>
                    <span className="text-[11px] text-slate-500 block">
                      {mg.examName} ({mg.className}) · {toBnNumber(mg.studentCount)} জন
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        StorageService.approveMarksEntries(mg.examId, mg.subjectId, adminName);
                        showToast(`${mg.subjectName}-এর নম্বর প্রকাশিত হয়েছে!`);
                        setTick((n) => n + 1);
                      }}
                      className="px-2 py-1 rounded bg-emerald-600 text-white text-[10px] font-bold"
                    >
                      প্রকাশ
                    </button>
                    <button
                      type="button"
                      onClick={() => onNavigate('examinations:marks_entry')}
                      className="px-2 py-1 rounded bg-white border border-slate-200 text-slate-700 text-[10px] font-semibold"
                    >
                      দেখুন
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
