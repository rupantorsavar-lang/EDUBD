import React, { useEffect, useMemo, useState } from 'react';
import { ClassLevel, Exam, SchoolProfile, Student } from '../../types';
import { StorageService } from '../../services/storage';
import { buildClassSequence } from '../../utils/academicClasses';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  GraduationCap,
  X,
} from 'lucide-react';

export interface MeritListEntry {
  student: Student;
  totalObtained: number;
  fullMarks: number;
  percentage: number;
  gpa: number;
  overallGrade: string;
  hasFail: boolean;
  failedCount: number;
  subjectsWithMarksCount: number;
}

interface MeritPromotionModalProps {
  isOpen: boolean;
  onClose: () => void;
  school: SchoolProfile;
  currentExam?: Exam;
  selectedClass: string;
  passedStudents: MeritListEntry[];
  failedStudents: MeritListEntry[];
  isCombinedCGPA?: boolean;
  includedExamsCount?: number;
  language: 'bn' | 'en';
  toBnNumber: (num: number | string | undefined | null) => string;
  onPromoted: (summaryMessage: string) => void;
}

function getClassSequenceFromStorage(): string[] {
  const seq = buildClassSequence(StorageService.getClasses());
  return seq.length > 0
    ? seq
    : [
        'Play',
        'Nurany',
        'Nursery',
        'KG',
        'Class 1',
        'Class 2',
        'Class 3',
        'Class 4',
        'Class 5',
        'Class 6',
        'Class 7',
        'Class 8',
        'Class 9',
        'Class 10',
      ];
}

function getDefaultNextClass(currentClass: string, sequence: string[]): string {
  const idx = sequence.indexOf(currentClass);
  if (idx === -1) return currentClass;
  if (idx === sequence.length - 1) return '__GRADUATED__';
  return sequence[idx + 1];
}

function getDefaultNextSession(currentSession?: string): string {
  const numeric = parseInt(String(currentSession || '2026').replace(/\D/g, ''), 10);
  if (!Number.isNaN(numeric) && numeric >= 2000 && numeric < 2100) {
    return String(numeric + 1);
  }
  return String(new Date().getFullYear() + 1);
}

export const MeritPromotionModal: React.FC<MeritPromotionModalProps> = ({
  isOpen,
  onClose,
  school,
  currentExam,
  selectedClass,
  passedStudents,
  failedStudents,
  isCombinedCGPA = false,
  includedExamsCount = 1,
  language,
  toBnNumber,
  onPromoted,
}) => {
  const classSequence = useMemo(() => getClassSequenceFromStorage(), [isOpen]);
  const [targetClass, setTargetClass] = useState<string>(() =>
    getDefaultNextClass(selectedClass, getClassSequenceFromStorage())
  );

  useEffect(() => {
    if (isOpen) {
      setTargetClass(getDefaultNextClass(selectedClass, getClassSequenceFromStorage()));
    }
  }, [isOpen, selectedClass]);
  const [newSession, setNewSession] = useState<string>(() =>
    getDefaultNextSession(school.currentSession)
  );
  const [updateGlobalSession, setUpdateGlobalSession] = useState<boolean>(true);
  const [rollMode, setRollMode] = useState<'by_merit_class' | 'by_merit_section' | 'keep_existing'>(
    'by_merit_class'
  );
  const [failedPolicy, setFailedPolicy] = useState<
    'detain_same_class' | 'promote_conditional' | 'skip'
  >('detain_same_class');

  const allEntries = useMemo(
    () => [
      ...passedStudents.map((item, idx) => ({ ...item, rank: idx + 1, isPassed: true })),
      ...failedStudents.map((item) => ({ ...item, rank: null as number | null, isPassed: false })),
    ],
    [passedStudents, failedStudents]
  );

  const [excludedIds, setExcludedIds] = useState<Set<string>>(() => new Set());

  const toggleStudentIncluded = (studentId: string) => {
    setExcludedIds((prev) => {
      const next = new Set(prev);
      if (next.has(studentId)) {
        next.delete(studentId);
      } else {
        next.add(studentId);
      }
      return next;
    });
  };

  // Compute exact preview of before -> after for every student
  const promotionPreview = useMemo(() => {
    const classRollCounter = { count: 0 };
    const sectionCounters = new Map<string, number>();
    const detainedSectionCounters = new Map<string, number>();
    let detainedClassRoll = 0;

    return allEntries.map((entry) => {
      const isIncluded = !excludedIds.has(entry.student.id);
      const isPassed = entry.isPassed;

      if (!isIncluded || (!isPassed && failedPolicy === 'skip')) {
        return {
          ...entry,
          willUpdate: false,
          nextClass: entry.student.className,
          nextRoll: entry.student.roll,
          nextSession: entry.student.session,
          nextStatus: entry.student.status,
          actionLabel: language === 'bn' ? 'অপরিবর্তিত' : 'Skipped',
        };
      }

      if (isPassed || failedPolicy === 'promote_conditional') {
        const isGraduating = targetClass === '__GRADUATED__';
        const resolvedClass = isGraduating
          ? entry.student.className
          : (targetClass as ClassLevel);
        const resolvedStatus: Student['status'] = isGraduating ? 'graduated' : 'active';

        let nextRoll = entry.student.roll;
        if (rollMode === 'by_merit_class') {
          classRollCounter.count += 1;
          nextRoll = String(classRollCounter.count);
        } else if (rollMode === 'by_merit_section') {
          const sec = entry.student.section || 'A';
          const nextSecRoll = (sectionCounters.get(sec) || 0) + 1;
          sectionCounters.set(sec, nextSecRoll);
          nextRoll = String(nextSecRoll);
        }

        return {
          ...entry,
          willUpdate: true,
          nextClass: resolvedClass,
          nextRoll,
          nextSession: newSession.trim() || school.currentSession,
          nextStatus: resolvedStatus,
          actionLabel: isGraduating
            ? language === 'bn'
              ? 'উত্তীর্ণ / প্রাক্তন (Graduated)'
              : 'Graduated'
            : isPassed
            ? language === 'bn'
              ? 'প্রমোশন (Promoted)'
              : 'Promoted'
            : language === 'bn'
            ? 'বিবেচনায় প্রমোশন'
            : 'Conditional Promote',
        };
      }

      // Detain in same class with new session
      let nextRoll = entry.student.roll;
      if (rollMode === 'by_merit_class') {
        detainedClassRoll += 1;
        nextRoll = String(detainedClassRoll);
      } else if (rollMode === 'by_merit_section') {
        const sec = entry.student.section || 'A';
        const nextSecRoll = (detainedSectionCounters.get(sec) || 0) + 1;
        detainedSectionCounters.set(sec, nextSecRoll);
        nextRoll = String(nextSecRoll);
      }

      return {
        ...entry,
        willUpdate: true,
        nextClass: entry.student.className,
        nextRoll,
        nextSession: newSession.trim() || school.currentSession,
        nextStatus: 'active' as Student['status'],
        actionLabel:
          language === 'bn' ? 'একই শ্রেণিতে বর্ষ পরিবর্তন' : 'Same Class (New Year)',
      };
    });
  }, [
    allEntries,
    excludedIds,
    failedPolicy,
    targetClass,
    rollMode,
    newSession,
    school.currentSession,
    language,
  ]);

  if (!isOpen) return null;

  const updatesToApply = promotionPreview.filter((p) => p.willUpdate);
  const promotedCount = updatesToApply.filter(
    (p) => p.isPassed || failedPolicy === 'promote_conditional'
  ).length;
  const detainedCount = updatesToApply.length - promotedCount;

  const handleConfirmPromotion = () => {
    if (updatesToApply.length === 0) return;

    const batchPayload = updatesToApply.map((item) => ({
      studentId: item.student.id,
      className: item.nextClass,
      roll: item.nextRoll,
      session: item.nextSession,
      status: item.nextStatus,
    }));

    StorageService.promoteStudentsBatch(
      batchPayload,
      updateGlobalSession ? newSession.trim() : undefined
    );

    const msg =
      language === 'bn'
        ? `সফল! ${toBnNumber(promotedCount)} জন শিক্ষার্থী ${
            targetClass === '__GRADUATED__' ? 'গ্র্যাজুয়েট' : targetClass
          }-এ প্রমোশন পেয়েছে এবং ${toBnNumber(detainedCount)} জন একই শ্রেণিতে নতুন শিক্ষাবর্ষ (${newSession}) হিসেবে আপডেট হয়েছে।`
        : `Completed! ${promotedCount} students promoted to ${
            targetClass === '__GRADUATED__' ? 'Graduated' : targetClass
          } and ${detainedCount} updated in same class for session ${newSession}.`;

    onPromoted(msg);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs overflow-y-auto print:hidden">
      <div className="bg-white rounded-2xl max-w-4xl w-full p-5 sm:p-6 text-xs text-slate-800 shadow-2xl border border-slate-200 max-h-[92vh] flex flex-col">
        {/* Modal Header */}
        <div className="flex items-start justify-between gap-3 pb-3.5 border-b border-slate-200 shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
              <GraduationCap className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-slate-900 text-sm sm:text-base">
                {language === 'bn'
                  ? 'চূড়ান্ত মেধা তালিকা থেকে শ্রেণি ও শিক্ষাবর্ষ পরিবর্তন (Class Promotion & Year Change)'
                  : 'Promote Class & Change Academic Year from Final Merit List'}
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {isCombinedCGPA
                  ? language === 'bn'
                    ? `সকল ${toBnNumber(includedExamsCount)}টি পরীক্ষার সমন্বিত ফাইনাল CGPA ভিত্তিক মেধা তালিকা`
                    : `Combined Final CGPA Merit List (${includedExamsCount} Exams)`
                  : currentExam
                  ? language === 'bn'
                    ? currentExam.nameBn
                    : currentExam.nameEn
                  : 'Exam'}{' '}
                • {selectedClass} →{' '}
                {targetClass === '__GRADUATED__'
                  ? language === 'bn'
                    ? 'উত্তীর্ণ / প্রাক্তন (Graduated)'
                    : 'Graduated'
                  : targetClass}{' '}
                • {language === 'bn' ? 'শিক্ষাবর্ষ:' : 'Session:'} {school.currentSession} →{' '}
                {newSession}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Settings Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 py-4 border-b border-slate-100 shrink-0">
          <div>
            <label className="block font-bold text-slate-700 mb-1 text-[11px]">
              {language === 'bn' ? 'পরবর্তী শ্রেণি (Target Class)' : 'Promote To Class'}
            </label>
            <select
              value={targetClass}
              onChange={(e) => setTargetClass(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white font-bold text-blue-900"
            >
              {classSequence.map((cls) => (
                <option key={cls} value={cls}>
                  {cls}
                </option>
              ))}
              <option value="__GRADUATED__">
                {language === 'bn'
                  ? 'উত্তীর্ণ / প্রাক্তন শিক্ষার্থী (Graduated)'
                  : 'Graduated / Alumni'}
              </option>
            </select>
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1 text-[11px]">
              {language === 'bn' ? 'নতুন শিক্ষাবর্ষ (New Year/Session)' : 'New Academic Session'}
            </label>
            <input
              type="text"
              value={newSession}
              onChange={(e) => setNewSession(e.target.value)}
              placeholder="e.g. 2027"
              className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold text-slate-900"
            />
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1 text-[11px]">
              {language === 'bn' ? 'নতুন রোল নম্বর পদ্ধতি' : 'New Roll Assignment'}
            </label>
            <select
              value={rollMode}
              onChange={(e) => setRollMode(e.target.value as any)}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white font-semibold"
            >
              <option value="by_merit_class">
                {language === 'bn'
                  ? 'মেধা স্থান অনুযায়ী নতুন রোল (১, ২, ৩...)'
                  : 'By Merit Rank (1, 2, 3...)'}
              </option>
              <option value="by_merit_section">
                {language === 'bn'
                  ? 'শাখাভিত্তিক মেধা অনুযায়ী রোল'
                  : 'By Merit Rank (Per Section)'}
              </option>
              <option value="keep_existing">
                {language === 'bn' ? 'পূর্বের রোল অপরিবর্তিত রাখুন' : 'Keep Existing Rolls'}
              </option>
            </select>
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1 text-[11px]">
              {language === 'bn' ? 'অনুত্তীর্ণ শিক্ষার্থীদের ক্ষেত্রে' : 'Failed / Unranked Policy'}
            </label>
            <select
              value={failedPolicy}
              onChange={(e) => setFailedPolicy(e.target.value as any)}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white font-semibold"
            >
              <option value="detain_same_class">
                {language === 'bn'
                  ? 'একই শ্রেণিতে রেখে শিক্ষাবর্ষ বদলান'
                  : 'Keep Same Class (Update Year)'}
              </option>
              <option value="promote_conditional">
                {language === 'bn'
                  ? 'সকলকে পরবর্তী শ্রেণিতে প্রমোশন দিন'
                  : 'Promote Conditionally'}
              </option>
              <option value="skip">
                {language === 'bn' ? 'অপরিবর্তিত রাখুন (Skip)' : 'Skip (Leave Unchanged)'}
              </option>
            </select>
          </div>
        </div>

        {/* Global Session Checkbox & Warning */}
        <div className="py-2.5 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 shrink-0">
          <label className="flex items-center space-x-2 cursor-pointer font-semibold text-slate-700">
            <input
              type="checkbox"
              checked={updateGlobalSession}
              onChange={(e) => setUpdateGlobalSession(e.target.checked)}
              className="w-4 h-4 text-emerald-600 rounded"
            />
            <span>
              {language === 'bn'
                ? `বিদ্যালয়ের মূল শিক্ষাবর্ষ (School Global Session) "${newSession}" হিসেবে আপডেট করুন`
                : `Also update School Global Session to "${newSession}"`}
            </span>
          </label>

          <div className="flex items-center space-x-2 text-[11px] font-bold">
            <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800">
              {language === 'bn'
                ? `প্রমোশন: ${toBnNumber(promotedCount)} জন`
                : `Promote: ${promotedCount}`}
            </span>
            {detainedCount > 0 && (
              <span className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-800">
                {language === 'bn'
                  ? `একই শ্রেণি: ${toBnNumber(detainedCount)} জন`
                  : `Same Class: ${detainedCount}`}
              </span>
            )}
          </div>
        </div>

        {/* Preview Table */}
        <div className="flex-1 overflow-y-auto mt-3 border border-slate-200 rounded-xl">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="sticky top-0 bg-slate-100 border-b border-slate-200 text-slate-700 font-bold text-[11px] z-10">
              <tr>
                <th className="py-2.5 px-3 w-10 text-center">✓</th>
                <th className="py-2.5 px-3 text-center">
                  {language === 'bn' ? 'মেধা স্থান' : 'Rank'}
                </th>
                <th className="py-2.5 px-3">
                  {language === 'bn' ? 'শিক্ষার্থীর নাম' : 'Student Name'}
                </th>
                <th className="py-2.5 px-3 text-center">
                  {isCombinedCGPA ? 'CGPA / Marks' : 'GPA / Marks'}
                </th>
                <th className="py-2.5 px-3">
                  {language === 'bn' ? 'বর্তমান শ্রেণি ও রোল' : 'Current Class & Roll'}
                </th>
                <th className="py-2.5 px-3">
                  {language === 'bn' ? 'পরিবর্তিত শ্রেণি ও নতুন রোল' : 'New Class & Roll'}
                </th>
                <th className="py-2.5 px-3 text-center">
                  {language === 'bn' ? 'অবস্থা' : 'Action'}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {promotionPreview.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-slate-400">
                    {language === 'bn'
                      ? 'এই শ্রেণির কোনো সক্রিয় শিক্ষার্থী পাওয়া যায়নি।'
                      : 'No active students found in this class.'}
                  </td>
                </tr>
              ) : (
                promotionPreview.map((item) => {
                  const isChecked = !excludedIds.has(item.student.id);
                  return (
                    <tr
                      key={item.student.id}
                      className={
                        !item.willUpdate
                          ? 'bg-slate-50/70 opacity-60'
                          : item.isPassed
                          ? 'hover:bg-emerald-50/40'
                          : 'bg-rose-50/20 hover:bg-rose-50/40'
                      }
                    >
                      <td className="py-2.5 px-3 text-center">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleStudentIncluded(item.student.id)}
                          className="w-4 h-4 text-emerald-600 rounded cursor-pointer"
                        />
                      </td>
                      <td className="py-2.5 px-3 text-center font-black">
                        {item.rank ? (
                          <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-900">
                            {language === 'bn' ? `${toBnNumber(item.rank)}ম` : `#${item.rank}`}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 text-[10px]">
                            {language === 'bn' ? 'অনুত্তীর্ণ' : 'Fail'}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-bold text-slate-900">
                          {language === 'bn'
                            ? item.student.nameBn || item.student.nameEn
                            : item.student.nameEn}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          ID: {item.student.studentId} • Sec {item.student.section}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span className="font-bold text-blue-800">{item.gpa.toFixed(2)}</span>
                        <span className="text-[10px] text-slate-500 block">
                          ({item.totalObtained})
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 font-medium">
                        {item.student.className} • Roll {item.student.roll} ({item.student.session})
                      </td>
                      <td className="py-2.5 px-3 font-bold text-slate-900">
                        {item.willUpdate ? (
                          <span className="inline-flex items-center space-x-1 text-emerald-800">
                            <ArrowRight className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            <span>
                              {item.nextStatus === 'graduated'
                                ? language === 'bn'
                                  ? 'গ্র্যাজুয়েট'
                                  : 'Graduated'
                                : item.nextClass}{' '}
                              • Roll {item.nextRoll} ({item.nextSession})
                            </span>
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            !item.willUpdate
                              ? 'bg-slate-200 text-slate-600'
                              : item.isPassed
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {item.actionLabel}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Warning + Footer Buttons */}
        <div className="pt-4 mt-3 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
          <div className="flex items-start space-x-2 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 px-3 py-2 rounded-xl">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <span>
              {language === 'bn'
                ? 'টিপস: প্রমোশন করার আগে চাইলে "মেধা তালিকা প্রিন্ট করুন" বাটনে ক্লিক করে চূড়ান্ত মেধা তালিকা প্রিন্ট বা PDF সেভ করে নিন।'
                : 'Tip: Print or save the Final Merit List PDF before promoting students to the new class.'}
            </span>
          </div>

          <div className="flex items-center justify-end space-x-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-200 rounded-xl font-semibold text-slate-700 hover:bg-slate-50"
            >
              {language === 'bn' ? 'বাতিল' : 'Cancel'}
            </button>
            <button
              type="button"
              onClick={handleConfirmPromotion}
              disabled={updatesToApply.length === 0}
              className="px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50 text-white rounded-xl font-black shadow-md flex items-center space-x-1.5 cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>
                {language === 'bn'
                  ? `নিশ্চিত করুন (${toBnNumber(updatesToApply.length)} জন)`
                  : `Confirm Promotion (${updatesToApply.length})`}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
