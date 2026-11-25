import React, { useMemo, useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { StorageService } from '../../services/storage';
import { resolveTeacherStaffProfile } from '../../utils/teacherResolver';
import { summarizePendingApprovals } from '../../utils/approvalWorkflow';
import {
  CalendarCheck2,
  CalendarDays,
  UserCheck,
  Clock,
  BookOpen,
  FileSpreadsheet,
  Award,
  Trophy,
  BarChart3,
  FileCheck,
  Bell,
  ArrowRight,
  ClipboardEdit,
  AlertCircle,
  Send,
  Grid,
  CheckCircle2,
  RotateCcw,
} from 'lucide-react';
import { LauncherIconGrid, LauncherTileItem } from '../common/LauncherIconGrid';

interface TeacherDedicatedDashboardProps {
  onNavigate: (tab: string) => void;
}

const WEEKDAY_NAMES: string[] = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

const WEEKDAY_BN: Record<string, string> = {
  Sunday: 'রবিবার',
  Monday: 'সোমবার',
  Tuesday: 'মঙ্গলবার',
  Wednesday: 'বুধবার',
  Thursday: 'বৃহস্পতিবার',
  Friday: 'শুক্রবার',
  Saturday: 'শনিবার',
};

export const TeacherDedicatedDashboard: React.FC<TeacherDedicatedDashboardProps> = ({ onNavigate }) => {
  const { currentUser } = useAuth();
  const { language, toBnNumber } = useLanguage();
  const [, setSyncTick] = useState<number>(0);

  useEffect(() => {
    const refresh = () => setSyncTick((n) => n + 1);
    window.addEventListener('school_cloud_data_synced', refresh);
    window.addEventListener('saturday_off_toggled', refresh);
    return () => {
      window.removeEventListener('school_cloud_data_synced', refresh);
      window.removeEventListener('saturday_off_toggled', refresh);
    };
  }, []);

  const toLocalDateStr = (d: Date = new Date()) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const todayStr = useMemo(() => toLocalDateStr(), []);
  const currentMonthStr = todayStr.slice(0, 7);
  const todayDayName = WEEKDAY_NAMES[new Date().getDay()] || 'Sunday';

  const staffList = StorageService.getStaff();
  const students = StorageService.getStudents().filter((s) => s.status === 'active');
  const attendance = StorageService.getAttendance();
  const routines = StorageService.getRoutines();
  const exams = StorageService.getExams();
  const examRoutines = StorageService.getExamRoutines();
  const seatPlans = StorageService.getExamSeatPlans();
  const marks = StorageService.getMarks();
  const subjects = StorageService.getSubjects();
  const homeworkList = StorageService.getHomework();
  const homeworkSubmissions = StorageService.getHomeworkSubmissions();
  const notices = StorageService.getNotices();
  const isSaturdayOff = StorageService.isSaturdayOff();
  const todayHoliday = StorageService.isDateHoliday(todayStr);

  const approvalSummary = useMemo(
    () =>
      summarizePendingApprovals({
        routines,
        examRoutines,
        seatPlans,
        marks,
        exams,
        subjects,
      }),
    [routines, examRoutines, seatPlans, marks, exams, subjects]
  );

  const returnedDraftItems = useMemo(() => {
    const items: { id: string; title: string; note?: string; targetTab: string }[] = [];
    const rejRoutines = routines.filter((r) => r.approvalStatus === 'rejected');
    if (rejRoutines.length > 0) {
      items.push({
        id: 'rej_cr',
        title: `ক্লাস রুটিন (${rejRoutines.length}টি পিরিয়ড)`,
        note: rejRoutines[0].rejectionNote,
        targetTab: 'routine',
      });
    }
    const rejExamRoutines = examRoutines.filter((r) => r.approvalStatus === 'rejected');
    if (rejExamRoutines.length > 0) {
      items.push({
        id: 'rej_er',
        title: `পরীক্ষার রুটিন (${rejExamRoutines.length}টি বিষয়)`,
        note: rejExamRoutines[0].rejectionNote,
        targetTab: 'examinations:exam_routine',
      });
    }
    Object.values(seatPlans || {})
      .filter((sp) => sp && sp.approvalStatus === 'rejected')
      .forEach((sp) => {
        const ex = exams.find((e) => e.id === sp.examId);
        items.push({
          id: `rej_sp_${sp.examId}`,
          title: `আসন বিন্যাস (${ex?.nameBn || ex?.nameEn || sp.examId})`,
          note: sp.rejectionNote,
          targetTab: 'examinations:seat_plan',
        });
      });
    const rejMarksSubs = new Set<string>();
    marks
      .filter((m) => m.approvalStatus === 'rejected')
      .forEach((m) => {
        const key = `${m.examId}_${m.subjectId}`;
        if (!rejMarksSubs.has(key)) {
          rejMarksSubs.add(key);
          items.push({
            id: `rej_mk_${key}`,
            title: `নম্বর এন্ট্রি (${m.subjectName})`,
            note: m.rejectionNote,
            targetTab: 'examinations:marks_entry',
          });
        }
      });
    return items;
  }, [routines, examRoutines, seatPlans, marks, exams]);

  // Strictly match ONLY the logged-in teacher's own staff record (never fallback to someone else)
  const teacherStaff = useMemo(
    () => resolveTeacherStaffProfile(currentUser, staffList),
    [currentUser, staffList]
  );

  // Today's student attendance summary
  const todayStudentAtt = attendance.filter(
    (a) => (a.targetType === 'student' || !a.targetType) && a.date === todayStr
  );
  const studentPresentToday = todayStudentAtt.filter(
    (a) => a.status === 'Present' || a.status === 'Late'
  ).length;
  const studentAttRate =
    todayStudentAtt.length > 0 ? Math.round((studentPresentToday / todayStudentAtt.length) * 100) : 0;

  // Teacher's own attendance (strictly scoped to teacherStaff.id)
  const selfTodayRecord = useMemo(() => {
    if (!teacherStaff) return null;
    return (
      attendance.find(
        (a) => a.targetType === 'staff' && a.targetId === teacherStaff.id && a.date === todayStr
      ) || null
    );
  }, [teacherStaff, attendance, todayStr]);

  const selfMonthlyCalendar = useMemo(() => {
    const [yStr, mStr] = currentMonthStr.split('-');
    const year = parseInt(yStr, 10) || new Date().getFullYear();
    const month = parseInt(mStr, 10) || new Date().getMonth() + 1;
    const daysInMonth = new Date(year, month, 0).getDate();
    const days: {
      day: number;
      dateStr: string;
      code: 'P' | 'L' | 'A' | 'LV' | 'H' | '-';
      isWeeklyOff: boolean;
    }[] = [];

    let present = 0;
    let late = 0;
    let absent = 0;
    let excused = 0;
    let workingDays = 0;

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dt = new Date(year, month - 1, d);
      const isWeeklyOff = dt.getDay() === 5 || (dt.getDay() === 6 && isSaturdayOff);
      const holiday = StorageService.isDateHoliday(dateStr);

      const rec = teacherStaff
        ? attendance.find(
            (a) => a.targetType === 'staff' && a.targetId === teacherStaff.id && a.date === dateStr
          )
        : undefined;

      let code: 'P' | 'L' | 'A' | 'LV' | 'H' | '-' = '-';
      if ((isWeeklyOff || Boolean(holiday)) && !rec) {
        code = 'H';
      } else {
        workingDays++;
        if (rec?.status === 'Present') {
          code = 'P';
          present++;
        } else if (rec?.status === 'Late') {
          code = 'L';
          late++;
        } else if (rec?.status === 'Absent') {
          code = 'A';
          absent++;
        } else if (rec?.status === 'Excused') {
          code = 'LV';
          excused++;
        }
      }

      days.push({ day: d, dateStr, code, isWeeklyOff });
    }

    const rate = workingDays > 0 ? Math.round(((present + late) / workingDays) * 100) : 0;
    return { days, present, late, absent, excused, workingDays, rate };
  }, [teacherStaff, attendance, currentMonthStr, isSaturdayOff]);

  // Teacher's classes today
  const myTodayPeriods = useMemo(() => {
    const todaysAll = routines
      .filter((r) => r.day === todayDayName)
      .sort((a, b) => a.periodNumber - b.periodNumber);

    if (!teacherStaff) return todaysAll.slice(0, 6);

    const mine = todaysAll.filter(
      (r) =>
        r.teacherId === teacherStaff.id ||
        r.teacherName?.trim().toLowerCase() === teacherStaff.nameEn?.trim().toLowerCase()
    );
    return mine;
  }, [routines, todayDayName, teacherStaff]);

  const fallbackTodayPeriods = useMemo(() => {
    return routines
      .filter((r) => r.day === todayDayName)
      .sort((a, b) => a.periodNumber - b.periodNumber)
      .slice(0, 6);
  }, [routines, todayDayName]);

  const displayedPeriods = myTodayPeriods.length > 0 ? myTodayPeriods : fallbackTodayPeriods;

  // Pending homework reviews
  const pendingReviewCount = homeworkSubmissions.filter(
    (s) => s.status === 'pending' || s.status === 'submitted' || s.status === 'ai_evaluated' || s.status === 'review_required'
  ).length;

  // Upcoming exam routine items
  const upcomingExamSchedules = useMemo(() => {
    return [...examRoutines]
      .sort((a, b) => (a.examDate || '').localeCompare(b.examDate || ''))
      .slice(0, 5);
  }, [examRoutines]);

  // Teacher/All notices
  const visibleNotices = useMemo(() => {
    return notices
      .filter((n) => !n.targetAudience || n.targetAudience === 'All' || n.targetAudience === 'Teachers')
      .slice(0, 4);
  }, [notices]);

  const teacherDisplayName =
    language === 'bn'
      ? teacherStaff?.nameBn || currentUser?.nameBn || currentUser?.name || 'শিক্ষক'
      : teacherStaff?.nameEn || currentUser?.name || 'Teacher';

  const quickActions = [
    {
      id: 'attendance:daily',
      label: language === 'bn' ? 'শিক্ষার্থীর হাজিরা নিন' : 'Mark Student Attendance',
      sub: language === 'bn' ? 'দৈনিক রোল কল' : 'Daily class roll call',
      icon: CalendarCheck2,
      accent: 'text-blue-700 bg-blue-50',
    },
    {
      id: 'attendance:monthly_sheet',
      label: language === 'bn' ? 'মাসিক হাজিরা শিট' : 'Monthly Attendance Sheet',
      sub: language === 'bn' ? 'পূর্ণাঙ্গ মাসিক রেজিস্টার' : '1-31 day master sheet',
      icon: FileSpreadsheet,
      accent: 'text-emerald-700 bg-emerald-50',
    },
    {
      id: 'attendance:my_attendance',
      label: language === 'bn' ? 'আমার নিজের হাজিরা' : 'My Attendance Only',
      sub: language === 'bn' ? 'দৈনিক, মাসিক ও বার্ষিক' : 'Personal log & stats',
      icon: UserCheck,
      accent: 'text-indigo-700 bg-indigo-50',
    },
    {
      id: 'routine',
      label: language === 'bn' ? 'ক্লাস রুটিন' : 'Class Routine',
      sub: language === 'bn' ? 'শ্রেণি ও নিজস্ব সময়সূচি' : 'Class & my timetable',
      icon: CalendarDays,
      accent: 'text-sky-700 bg-sky-50',
    },
    {
      id: 'examinations:exam_routine',
      label: language === 'bn' ? 'পরীক্ষার রুটিন' : 'Exam Routine',
      sub: language === 'bn' ? 'সময়সূচি ও কেন্দ্র' : 'Exam date & schedule',
      icon: Clock,
      accent: 'text-amber-700 bg-amber-50',
    },
    {
      id: 'homework:assignments',
      label: language === 'bn' ? 'হোমওয়ার্ক প্রদান' : 'Assign Homework',
      sub: language === 'bn' ? 'নতুন বাড়ির কাজ ও রিভিউ' : 'Create & review tasks',
      icon: BookOpen,
      accent: 'text-teal-700 bg-teal-50',
    },
    {
      id: 'homework:reports',
      label: language === 'bn' ? 'হোমওয়ার্ক রিপোর্ট' : 'Homework Reports',
      sub: language === 'bn' ? 'সাবমিশন ও গড় নম্বর' : 'Submission analytics',
      icon: FileCheck,
      accent: 'text-cyan-700 bg-cyan-50',
    },
    {
      id: 'examinations:marks_entry',
      label: language === 'bn' ? 'পরীক্ষার নম্বর এন্ট্রি' : 'Exam Mark Entry',
      sub: language === 'bn' ? 'বিষয়ভিত্তিক নম্বর প্রদান' : 'Enter subject marks',
      icon: ClipboardEdit,
      accent: 'text-violet-700 bg-violet-50',
    },
    {
      id: 'examinations:merit_list',
      label: language === 'bn' ? 'মেধা তালিকা (Merit List)' : 'Merit List',
      sub: language === 'bn' ? 'র‍্যাংক ও GPA বিশ্লেষণ' : 'Class rank & GPA',
      icon: Trophy,
      accent: 'text-orange-700 bg-orange-50',
    },
    {
      id: 'reports:attendance',
      label: language === 'bn' ? 'রিপোর্ট সেন্টার' : 'Academic Reports',
      sub: language === 'bn' ? 'হাজিরা ও পরীক্ষার রিপোর্ট' : 'Export & print sheets',
      icon: BarChart3,
      accent: 'text-slate-700 bg-slate-100',
    },
  ];

  return (
    <div className="space-y-5">
      {/* Header Workspace Card */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start sm:items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-slate-900 text-white flex items-center justify-center font-bold text-lg overflow-hidden shrink-0">
            {teacherStaff?.photoUrl ? (
              <img src={teacherStaff.photoUrl} alt={teacherDisplayName} className="w-full h-full object-cover" />
            ) : (
              teacherDisplayName.charAt(0)
            )}
          </div>
          <div>
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
              {language === 'bn' ? 'শিক্ষক ওয়ার্কস্পেস' : 'Teacher Workspace'} ·{' '}
              {language === 'bn' ? WEEKDAY_BN[todayDayName] || todayDayName : todayDayName}, {todayStr}
            </div>
            <h1 className="text-xl font-bold text-slate-900 mt-0.5">
              {language === 'bn' ? `স্বাগতম, ${teacherDisplayName}` : `Welcome, ${teacherDisplayName}`}
            </h1>
            <div className="text-xs text-slate-600 mt-0.5 flex flex-wrap items-center gap-x-2">
              <span>{teacherStaff?.designation || (language === 'bn' ? 'সহকারী শিক্ষক' : 'Teacher')}</span>
              {teacherStaff?.department && (
                <>
                  <span className="text-slate-300">·</span>
                  <span>{teacherStaff.department}</span>
                </>
              )}
              {teacherStaff?.employeeId && (
                <>
                  <span className="text-slate-300">·</span>
                  <span className="font-mono text-slate-700">ID: {teacherStaff.employeeId}</span>
                </>
              )}
              {teacherStaff?.assignedClasses && teacherStaff.assignedClasses.length > 0 && (
                <>
                  <span className="text-slate-300">·</span>
                  <span className="text-blue-700 font-medium">
                    {teacherStaff.assignedClasses.join(', ')}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            onClick={() => onNavigate('attendance:daily')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors whitespace-nowrap"
          >
            <CalendarCheck2 className="w-4 h-4" />
            <span>{language === 'bn' ? 'শিক্ষার্থীর হাজিরা নিন' : 'Take Attendance'}</span>
          </button>
          <button
            onClick={() => onNavigate('examinations:marks_entry')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold transition-colors whitespace-nowrap"
          >
            <ClipboardEdit className="w-4 h-4 text-blue-600" />
            <span>{language === 'bn' ? 'নম্বর এন্ট্রি' : 'Enter Marks'}</span>
          </button>
        </div>
      </div>

      {/* 4 KPI Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <button
          onClick={() => onNavigate('attendance:my_attendance')}
          className="bg-white rounded-2xl border border-slate-200 hover:border-blue-300 p-4 text-left transition-colors"
        >
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
            <span>{language === 'bn' ? 'আমার মাসিক হাজিরা' : 'My Monthly Attendance'}</span>
            <UserCheck className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900 font-mono tabular-nums">
            {teacherStaff ? `${selfMonthlyCalendar.rate}%` : '—'}
          </div>
          <div className="mt-1 text-[11px] text-slate-500 tabular-nums">
            {teacherStaff
              ? language === 'bn'
                ? `উপস্থিত ${toBnNumber(selfMonthlyCalendar.present)} · দেরি ${toBnNumber(selfMonthlyCalendar.late)} · অনুপস্থিত ${toBnNumber(selfMonthlyCalendar.absent)}`
                : `${selfMonthlyCalendar.present} Present · ${selfMonthlyCalendar.late} Late · ${selfMonthlyCalendar.absent} Absent`
              : language === 'bn'
              ? 'প্রোফাইল লিংক প্রয়োজন'
              : 'Staff ID not linked'}
          </div>
        </button>

        <button
          onClick={() => onNavigate(teacherStaff ? 'routine:teacher' : 'routine')}
          className="bg-white rounded-2xl border border-slate-200 hover:border-blue-300 p-4 text-left transition-colors"
        >
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
            <span>{language === 'bn' ? 'আজকের আমার ক্লাস' : "Today's Classes"}</span>
            <CalendarDays className="w-4 h-4 text-blue-600" />
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900 font-mono tabular-nums">
            {language === 'bn' ? toBnNumber(myTodayPeriods.length) : myTodayPeriods.length}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            {todayHoliday
              ? todayHoliday.titleBn || todayHoliday.titleEn
              : myTodayPeriods.length > 0
              ? language === 'bn'
                ? 'নির্ধারিত পিরিয়ড আজকের জন্য'
                : 'Scheduled periods today'
              : language === 'bn'
              ? 'সম্পূর্ণ ক্লাস রুটিন দেখুন'
              : 'Browse class timetable'}
          </div>
        </button>

        <button
          onClick={() => onNavigate('attendance:daily')}
          className="bg-white rounded-2xl border border-slate-200 hover:border-blue-300 p-4 text-left transition-colors"
        >
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
            <span>{language === 'bn' ? 'শিক্ষার্থী উপস্থিতি (আজ)' : "Students Present Today"}</span>
            <CalendarCheck2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900 font-mono tabular-nums">
            {todayStudentAtt.length > 0 ? `${studentAttRate}%` : `${students.length}`}
          </div>
          <div className="mt-1 text-[11px] text-slate-500 tabular-nums">
            {todayStudentAtt.length > 0
              ? language === 'bn'
                ? `হাজিরা নেওয়া হয়েছে ${toBnNumber(todayStudentAtt.length)} জনের`
                : `${studentPresentToday} of ${todayStudentAtt.length} marked`
              : language === 'bn'
              ? `মোট সক্রিয় শিক্ষার্থী ${toBnNumber(students.length)} জন`
              : `${students.length} active students`}
          </div>
        </button>

        <button
          onClick={() => onNavigate('homework:assignments')}
          className="bg-white rounded-2xl border border-slate-200 hover:border-blue-300 p-4 text-left transition-colors"
        >
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
            <span>{language === 'bn' ? 'হোমওয়ার্ক ও পরীক্ষা' : 'Homework & Exams'}</span>
            <BookOpen className="w-4 h-4 text-teal-600" />
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900 font-mono tabular-nums">
            {language === 'bn' ? toBnNumber(homeworkList.length) : homeworkList.length} /{' '}
            {language === 'bn' ? toBnNumber(exams.length) : exams.length}
          </div>
          <div className="mt-1 text-[11px] text-slate-500 tabular-nums">
            {language === 'bn'
              ? `রিভিউ বাকি ${toBnNumber(pendingReviewCount)} টি · ${toBnNumber(exams.length)} টি পরীক্ষা`
              : `${pendingReviewCount} pending reviews · ${exams.length} active exams`}
          </div>
        </button>
      </div>

      {/* Quick Action Workflow Launcher Grid */}
      <div className="space-y-3">
        <LauncherIconGrid
          columns={5}
          items={quickActions.map((item, idx): LauncherTileItem => {
            const palette: LauncherTileItem['color'][] = [
              'red', 'green', 'sky', 'amber', 'purple',
              'teal', 'green', 'orange', 'blue', 'red',
            ];
            return {
              id: item.id,
              label: item.label,
              icon: item.icon,
              color: palette[idx % palette.length],
              title: item.sub,
              onClick: () => onNavigate(item.id),
            };
          })}
        />
      </div>

      {/* Teacher Drafts & SuperAdmin Approval Status Tracker */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-amber-50 text-amber-700">
              <Send className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                {language === 'bn'
                  ? 'খসড়া ও সুপার অ্যাডমিন অনুমোদনের অবস্থা (Draft & Approval Status)'
                  : 'My Drafts & SuperAdmin Approval Status'}
              </h2>
              <p className="text-[11px] text-slate-500">
                {language === 'bn'
                  ? 'আপনার তৈরি খসড়া অনুমোদনের জন্য পাঠান — সুপার অ্যাডমিন অনুমোদন করলে শিক্ষার্থী পোর্টালে প্রকাশিত হবে।'
                  : 'Draft class routines, exam routines, seat plans, and marks are published to students once SuperAdmin approves.'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-[11px] font-bold">
            <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 border border-slate-200">
              {language === 'bn'
                ? `খসড়া: ${toBnNumber(approvalSummary.totalDraftCount)}`
                : `Drafts: ${approvalSummary.totalDraftCount}`}
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-amber-50 text-amber-800 border border-amber-200">
              {language === 'bn'
                ? `অনুমোদনের অপেক্ষায়: ${toBnNumber(approvalSummary.totalPendingCount)}`
                : `Pending: ${approvalSummary.totalPendingCount}`}
            </span>
          </div>
        </div>

        {/* Returned / Rejected Draft Alert */}
        {returnedDraftItems.length > 0 && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-rose-800">
              <RotateCcw className="w-3.5 h-3.5" />
              <span>
                {language === 'bn'
                  ? 'সুপার অ্যাডমিন সংশোধনের জন্য ফেরত পাঠিয়েছেন:'
                  : 'Returned by SuperAdmin for revision:'}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {returnedDraftItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onNavigate(item.targetTab)}
                  className="p-2.5 rounded-lg bg-white border border-rose-200 hover:border-rose-400 text-left flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-900 truncate">{item.title}</div>
                    {item.note && (
                      <div className="text-[11px] text-rose-700 truncate">{item.note}</div>
                    )}
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 4 Draft Workflow Module Tiles */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
          {[
            {
              title: language === 'bn' ? 'ক্লাস রুটিন' : 'Class Routine',
              icon: CalendarDays,
              drafts: approvalSummary.classRoutineDrafts.length,
              pending: approvalSummary.classRoutinePending.length,
              tab: 'routine',
              color: 'text-sky-700 bg-sky-50',
            },
            {
              title: language === 'bn' ? 'পরীক্ষার রুটিন' : 'Exam Routine',
              icon: Clock,
              drafts: approvalSummary.examRoutineDraftGroups.length,
              pending: approvalSummary.examRoutinePendingGroups.length,
              tab: 'examinations:exam_routine',
              color: 'text-amber-700 bg-amber-50',
            },
            {
              title: language === 'bn' ? 'আসন বিন্যাস (Seat Plan)' : 'Exam Seat Plan',
              icon: Grid,
              drafts: approvalSummary.seatPlansDrafts.length,
              pending: approvalSummary.seatPlansPending.length,
              tab: 'examinations:seat_plan',
              color: 'text-violet-700 bg-violet-50',
            },
            {
              title: language === 'bn' ? 'নম্বর এন্ট্রি (Marks)' : 'Marks Entry',
              icon: ClipboardEdit,
              drafts: approvalSummary.marksDraftGroups.length,
              pending: approvalSummary.marksPendingGroups.length,
              tab: 'examinations:marks_entry',
              color: 'text-emerald-700 bg-emerald-50',
            },
          ].map((mod) => {
            const Icon = mod.icon;
            return (
              <button
                key={mod.tab}
                type="button"
                onClick={() => onNavigate(mod.tab)}
                className="p-3 rounded-xl border border-slate-200 hover:border-blue-300 bg-slate-50/70 hover:bg-white text-left transition-all flex flex-col justify-between gap-2"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`p-1.5 rounded-lg ${mod.color}`}>
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <span className="font-bold text-slate-900">{mod.title}</span>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                </div>
                <div className="flex items-center gap-2 text-[11px]">
                  {mod.drafts === 0 && mod.pending === 0 ? (
                    <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                      <CheckCircle2 className="w-3 h-3" />
                      {language === 'bn' ? 'সব প্রকাশিত / প্রস্তুত' : 'Up to date'}
                    </span>
                  ) : (
                    <>
                      {mod.drafts > 0 && (
                        <span className="px-1.5 py-0.5 rounded bg-slate-200 text-slate-800 font-bold">
                          {language === 'bn' ? `খসড়া ${toBnNumber(mod.drafts)}` : `${mod.drafts} Draft`}
                        </span>
                      )}
                      {mod.pending > 0 && (
                        <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-bold">
                          {language === 'bn' ? `অপেক্ষমাণ ${toBnNumber(mod.pending)}` : `${mod.pending} Pending`}
                        </span>
                      )}
                    </>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Strictly Own Personal Attendance Section */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              {language === 'bn'
                ? 'আমার নিজস্ব হাজিরা (শুধুমাত্র ব্যক্তিগত)'
                : 'My Personal Attendance (Private Self View)'}
            </h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {language === 'bn'
                ? `মাস: ${currentMonthStr} · শুধুমাত্র আপনার নিজের উপস্থিতির রেকর্ড`
                : `Month: ${currentMonthStr} · Only your own attendance record is visible`}
            </p>
          </div>
          <button
            onClick={() => onNavigate('attendance:my_attendance')}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-blue-700 whitespace-nowrap"
          >
            <span>{language === 'bn' ? 'মাসিক ও বার্ষিক বিস্তারিত' : 'Full Monthly & Yearly View'}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {!teacherStaff ? (
          <div className="mt-3 p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <span>
              {language === 'bn'
                ? 'আপনার শিক্ষক অ্যাকাউন্টের সাথে এখনো কোনো স্টাফ প্রোফাইল লিংক করা হয়নি। নিরাপত্তার জন্য অন্য কারো হাজিরা দেখানো হচ্ছে না।'
                : 'No Staff profile is linked to your account yet. Other staff attendance records remain strictly hidden.'}
            </span>
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs">
              <div className="flex flex-wrap items-center gap-4">
                <div>
                  <span className="text-slate-500 block text-[11px]">
                    {language === 'bn' ? 'আজকের অবস্থা' : "Today's Status"}
                  </span>
                  <span className="font-bold text-slate-900">
                    {selfTodayRecord?.status || (language === 'bn' ? 'এখনো এন্ট্রি হয়নি' : 'Unmarked')}
                  </span>
                </div>
                <div className="font-mono tabular-nums">
                  <span className="text-slate-500 block text-[11px] font-sans">
                    {language === 'bn' ? 'প্রবেশ ও প্রস্থান' : 'In & Out Time'}
                  </span>
                  <span className="font-semibold text-slate-800">
                    {selfTodayRecord?.inTime || selfTodayRecord?.scanTime || '—'} / {selfTodayRecord?.outTime || '—'}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-3 font-mono text-[11px] tabular-nums">
                <span className="text-emerald-700 font-bold">P: {selfMonthlyCalendar.present}</span>
                <span className="text-amber-700 font-bold">L: {selfMonthlyCalendar.late}</span>
                <span className="text-rose-700 font-bold">A: {selfMonthlyCalendar.absent}</span>
                <span className="text-blue-700 font-bold">LV: {selfMonthlyCalendar.excused}</span>
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {selfMonthlyCalendar.days.map((d) => {
                const color =
                  d.code === 'P'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : d.code === 'L'
                    ? 'bg-amber-50 border-amber-200 text-amber-800'
                    : d.code === 'A'
                    ? 'bg-rose-50 border-rose-200 text-rose-700'
                    : d.code === 'LV'
                    ? 'bg-blue-50 border-blue-200 text-blue-700'
                    : d.code === 'H'
                    ? 'bg-slate-100 border-slate-200 text-slate-400'
                    : 'bg-white border-slate-200 text-slate-300';
                return (
                  <div
                    key={d.day}
                    title={`${d.dateStr}: ${d.code}`}
                    className={`w-9 py-1 rounded-lg border text-center font-mono tabular-nums ${color}`}
                  >
                    <div className="text-[9px] text-slate-500 leading-none">{d.day}</div>
                    <div className="text-[11px] font-bold mt-0.5">{d.code}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Bottom 2-Column Split: Today's Routine & Exam Routine / Notices */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Today's Class Schedule */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-col">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                {myTodayPeriods.length > 0
                  ? language === 'bn'
                    ? 'আজকের আমার ক্লাস সময়সূচি'
                    : "My Today's Class Schedule"
                  : language === 'bn'
                  ? 'আজকের ক্লাস রুটিন প্রিভিউ'
                  : "Today's School Timetable"}
              </h3>
              <p className="text-[11px] text-slate-500">
                {language === 'bn' ? WEEKDAY_BN[todayDayName] || todayDayName : todayDayName}
              </p>
            </div>
            <button
              onClick={() => onNavigate('routine')}
              className="text-xs font-semibold text-blue-700 hover:text-blue-800 inline-flex items-center gap-1 whitespace-nowrap"
            >
              <span>{language === 'bn' ? 'পূর্ণ রুটিন' : 'Full Routine'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="mt-3 divide-y divide-slate-100 flex-1">
            {displayedPeriods.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                {language === 'bn' ? 'আজ কোনো নির্ধারিত ক্লাস পিরিয়ড নেই।' : 'No class periods scheduled for today.'}
              </div>
            ) : (
              displayedPeriods.map((p) => (
                <div key={p.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                  <div className="min-w-0">
                    <div className="font-bold text-slate-900 truncate">{p.subjectName}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {p.className} ({p.section}) · {p.roomNo} · {p.teacherName}
                    </div>
                  </div>
                  <div className="text-right shrink-0 font-mono text-[11px] tabular-nums">
                    <div className="font-bold text-blue-700">
                      {language === 'bn' ? `${toBnNumber(p.periodNumber)}ম পিরিয়ড` : `Period ${p.periodNumber}`}
                    </div>
                    <div className="text-slate-500">
                      {p.startTime} - {p.endTime}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Upcoming Exam Schedule + Notices */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-col justify-between gap-4">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Award className="w-4 h-4 text-amber-600" />
                <h3 className="text-sm font-bold text-slate-900">
                  {language === 'bn' ? 'পরীক্ষার রুটিন ও ফলাফল' : 'Exam Schedule & Results'}
                </h3>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => onNavigate('examinations:exam_routine')}
                  className="text-xs font-semibold text-blue-700 hover:text-blue-800 whitespace-nowrap"
                >
                  {language === 'bn' ? 'পরীক্ষার রুটিন' : 'Exam Routine'}
                </button>
                <button
                  onClick={() => onNavigate('examinations:merit_list')}
                  className="text-xs font-semibold text-amber-700 hover:text-amber-800 whitespace-nowrap"
                >
                  {language === 'bn' ? 'মেধা তালিকা' : 'Merit List'}
                </button>
              </div>
            </div>

            <div className="mt-2.5 divide-y divide-slate-100">
              {upcomingExamSchedules.length === 0 ? (
                <div className="py-5 text-center text-xs text-slate-400">
                  {language === 'bn' ? 'কোনো পরীক্ষার সময়সূচি নির্ধারিত নেই।' : 'No exam routine entries added yet.'}
                </div>
              ) : (
                upcomingExamSchedules.map((er) => (
                  <div key={er.id} className="py-2 flex items-center justify-between gap-3 text-xs">
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-900 truncate">
                        {language === 'bn' ? er.subjectNameBn || er.subjectNameEn : er.subjectNameEn}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {er.className} · {er.roomNo || 'Hall Room'}
                      </div>
                    </div>
                    <div className="text-right font-mono text-[11px] shrink-0 tabular-nums">
                      <div className="font-bold text-slate-800">{er.examDate}</div>
                      <div className="text-slate-500">
                        {er.startTime} - {er.endTime}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                <Bell className="w-3.5 h-3.5 text-blue-600" />
                <span>{language === 'bn' ? 'সাম্প্রতিক নোটিশ' : 'Recent Notices'}</span>
              </div>
              <button
                onClick={() => onNavigate('notices')}
                className="text-[11px] font-semibold text-blue-700 hover:text-blue-800 whitespace-nowrap"
              >
                {language === 'bn' ? 'সব দেখুন' : 'View All'}
              </button>
            </div>
            {visibleNotices.length === 0 ? (
              <p className="text-xs text-slate-400">
                {language === 'bn' ? 'কোনো নোটিশ নেই।' : 'No recent notices.'}
              </p>
            ) : (
              <div className="space-y-1.5">
                {visibleNotices.map((n) => (
                  <div key={n.id} className="p-2 rounded-lg bg-slate-50 border border-slate-100 text-xs flex items-center justify-between gap-2">
                    <span className="font-medium text-slate-800 truncate">{n.title}</span>
                    <span className="text-[10px] font-mono text-slate-500 shrink-0 tabular-nums">{n.date}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
