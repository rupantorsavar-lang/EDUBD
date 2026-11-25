import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { StorageService } from '../../services/storage';
import { calculateSubjectGrade, calculateTotalGPA } from '../../utils/grading';
import { compareStudentsByClassAndRoll, compareStudentsByRoll } from '../../utils/studentSort';
import {
  BarChart3,
  Printer,
  Download,
  Users,
  Wallet,
  CalendarCheck2,
  Award,
  BookOpen,
} from 'lucide-react';
import { LauncherIconGrid, LauncherTileItem } from '../common/LauncherIconGrid';

export type ReportType = 'students' | 'attendance' | 'exam_results' | 'homework' | 'fees' | 'staff';

interface ReportsViewProps {
  initialReportType?: ReportType;
  jumpNonce?: number;
}

export const ReportsView: React.FC<ReportsViewProps> = ({ initialReportType, jumpNonce }) => {
  const { activeRole, currentUser } = useAuth();
  const { language, formatTaka, toBnNumber } = useLanguage();

  const canSeeFinancialAndPayroll =
    activeRole === 'super_admin' ||
    activeRole === 'admin' ||
    activeRole === 'master_admin' ||
    activeRole === 'accountant' ||
    Boolean(currentUser?.permissions?.manageFees);

  const resolveAuthorizedReportType = (requested?: ReportType): ReportType => {
    const fallback: ReportType = activeRole === 'teacher' ? 'attendance' : 'students';
    if (!requested) return fallback;
    if (!canSeeFinancialAndPayroll && (requested === 'fees' || requested === 'staff')) {
      return fallback;
    }
    return requested;
  };

  const [reportType, setReportType] = useState<ReportType>(() =>
    resolveAuthorizedReportType(initialReportType)
  );
  const [selectedClass, setSelectedClass] = useState<string>('all');
  const [selectedMonthYear, setSelectedMonthYear] = useState<string>(() =>
    new Date().toISOString().slice(0, 7)
  );

  useEffect(() => {
    if (jumpNonce && jumpNonce > 0 && initialReportType) {
      setReportType(resolveAuthorizedReportType(initialReportType));
    }
  }, [jumpNonce, initialReportType, canSeeFinancialAndPayroll, activeRole]);

  const students = StorageService.getStudents().filter((s) => s.status === 'active');
  const staff = StorageService.getStaff().filter((s) => s.status !== 'resigned');
  const invoices = canSeeFinancialAndPayroll ? StorageService.getInvoices() : [];
  const attendance = StorageService.getAttendance();
  const exams = StorageService.getExams();
  const subjects = StorageService.getSubjects();
  const allMarks = StorageService.getMarks();
  const homeworkList = StorageService.getHomework();
  const homeworkSubmissions = StorageService.getHomeworkSubmissions();
  const classList = StorageService.getClasses();

  const [selectedExamId, setSelectedExamId] = useState<string>(() => exams[0]?.id || '');

  const classOptions = useMemo(() => {
    if (classList.length > 0) return classList.map((c) => c.name);
    return Array.from(new Set(students.map((s) => s.className).filter(Boolean)));
  }, [classList, students]);

  const filteredStudents = useMemo(() => {
    const base = selectedClass === 'all' ? students : students.filter((s) => s.className === selectedClass);
    return [...base].sort(compareStudentsByClassAndRoll);
  }, [students, selectedClass]);

  // Student Attendance Report Rows for selectedMonthYear
  const attendanceReportRows = useMemo(() => {
    const monthRecords = attendance.filter(
      (a) => (a.targetType === 'student' || !a.targetType) && a.date?.startsWith(selectedMonthYear)
    );
    return filteredStudents.map((st) => {
      const recs = monthRecords.filter((r) => r.targetId === st.id);
      const present = recs.filter((r) => r.status === 'Present').length;
      const late = recs.filter((r) => r.status === 'Late').length;
      const absent = recs.filter((r) => r.status === 'Absent').length;
      const excused = recs.filter((r) => r.status === 'Excused').length;
      const total = recs.length;
      const rate = total > 0 ? Math.round(((present + late) / total) * 100) : 0;
      return {
        student: st,
        present,
        late,
        absent,
        excused,
        total,
        rate,
      };
    });
  }, [attendance, filteredStudents, selectedMonthYear]);

  // Exam Merit & GPA Report Rows
  const examReportRows = useMemo(() => {
    const targetExamId = selectedExamId || exams[0]?.id || '';
    if (!targetExamId) return [];

    const rows = filteredStudents.map((st) => {
      const classSubjects = subjects.filter((sub) => sub.className === st.className);
      const studentMarks = allMarks.filter((m) => m.examId === targetExamId && m.studentId === st.id);

      let totalObtained = 0;
      let totalFull = 0;
      let hasFail = false;
      const subjectGpas: number[] = [];

      studentMarks.forEach((m) => {
        const sub = classSubjects.find((s) => s.id === m.subjectId);
        const fullMarks = sub?.fullMarks || 100;
        const obtained = Number(m.totalMarks ?? m.total) || 0;
        const gradeInfo = calculateSubjectGrade(obtained, fullMarks);
        totalObtained += obtained;
        totalFull += fullMarks;
        if (gradeInfo.grade === 'F' || m.grade === 'F' || m.isPassed === false) hasFail = true;
        subjectGpas.push(gradeInfo.gpa);
      });

      const summary = calculateTotalGPA(subjectGpas, hasFail);
      return {
        student: st,
        subjectsEntered: studentMarks.length,
        totalObtained,
        totalFull,
        gpa: summary.totalGPA,
        grade: summary.overallGrade,
        status: studentMarks.length === 0 ? 'PENDING' : summary.status,
      };
    });

    const ranked = [...rows].sort((a, b) => {
      if (a.status === 'PASSED' && b.status !== 'PASSED') return -1;
      if (a.status !== 'PASSED' && b.status === 'PASSED') return 1;
      if (b.gpa !== a.gpa) return b.gpa - a.gpa;
      if (b.totalObtained !== a.totalObtained) return b.totalObtained - a.totalObtained;
      return compareStudentsByRoll(a.student, b.student);
    });

    let meritCounter = 0;
    return ranked.map((r) => {
      if (r.status === 'PASSED') {
        meritCounter += 1;
        return { ...r, meritRank: meritCounter };
      }
      return { ...r, meritRank: null as number | null };
    });
  }, [selectedExamId, exams, filteredStudents, subjects, allMarks]);

  // Homework Report Rows
  const homeworkReportRows = useMemo(() => {
    const filteredHw =
      selectedClass === 'all'
        ? homeworkList
        : homeworkList.filter((hw) => hw.className === selectedClass);

    return filteredHw.map((hw) => {
      const subs = homeworkSubmissions.filter((s) => s.homeworkId === hw.id);
      const reviewed = subs.filter(
        (s) => s.status === 'approved' || s.teacherMarks !== undefined || s.status === 'ai_evaluated'
      );
      const avgMarks =
        reviewed.length > 0
          ? Number(
              (
                reviewed.reduce(
                  (sum, s) => sum + Number(s.teacherMarks ?? s.aiEvaluation?.suggestedMarks ?? 0),
                  0
                ) / reviewed.length
              ).toFixed(1)
            )
          : 0;
      return {
        hw,
        submissionCount: subs.length,
        reviewedCount: reviewed.length,
        avgMarks,
      };
    });
  }, [homeworkList, homeworkSubmissions, selectedClass]);

  const handleExportCSV = (filename: string, headers: string[], rows: (string | number)[][]) => {
    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((e) => e.map((val) => `"${String(val).replace(/"/g, '""')}"`).join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `${filename}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportCurrent = () => {
    if (reportType === 'students') {
      const headers = ['Student ID', 'Roll', 'Name (EN)', 'Name (BN)', 'Class', 'Section', 'Shift', 'Guardian Phone'];
      const rows = filteredStudents.map((s) => [
        s.studentId,
        s.roll,
        s.nameEn,
        s.nameBn,
        s.className,
        s.section,
        s.shift,
        s.guardianPhone,
      ]);
      handleExportCSV('student_register_report', headers, rows);
    } else if (reportType === 'attendance') {
      const headers = ['Student ID', 'Roll', 'Name', 'Class', 'Month', 'Present', 'Late', 'Absent', 'Excused', 'Rate %'];
      const rows = attendanceReportRows.map((r) => [
        r.student.studentId,
        r.student.roll,
        r.student.nameEn,
        `${r.student.className} (${r.student.section})`,
        selectedMonthYear,
        r.present,
        r.late,
        r.absent,
        r.excused,
        `${r.rate}%`,
      ]);
      handleExportCSV(`student_attendance_report_${selectedMonthYear}`, headers, rows);
    } else if (reportType === 'exam_results') {
      const headers = ['Merit Rank', 'Roll', 'Student Name', 'Class', 'Subjects', 'Obtained', 'Full Marks', 'GPA', 'Grade', 'Result'];
      const rows = examReportRows.map((r) => [
        r.meritRank ?? '-',
        r.student.roll,
        r.student.nameEn,
        `${r.student.className} (${r.student.section})`,
        r.subjectsEntered,
        r.totalObtained,
        r.totalFull,
        r.gpa.toFixed(2),
        r.grade,
        r.status,
      ]);
      handleExportCSV('exam_merit_report', headers, rows);
    } else if (reportType === 'homework') {
      const headers = ['Date', 'Due Date', 'Class', 'Subject', 'Title', 'Submissions', 'Reviewed', 'Avg Marks', 'Full Marks'];
      const rows = homeworkReportRows.map((r) => [
        r.hw.assignedDate || r.hw.homeworkDate || '',
        r.hw.dueDate,
        `${r.hw.className} (${r.hw.section})`,
        r.hw.subjectName,
        r.hw.title,
        r.submissionCount,
        r.reviewedCount,
        r.avgMarks,
        r.hw.fullMarks || 10,
      ]);
      handleExportCSV('homework_performance_report', headers, rows);
    } else if (reportType === 'fees' && canSeeFinancialAndPayroll) {
      const headers = ['Invoice No', 'Student Name', 'Class', 'Fee Type', 'Net Amount', 'Paid Amount', 'Due Amount', 'Status'];
      const rows = invoices.map((i) => [
        i.invoiceNo,
        i.studentNameEn,
        `${i.className} (${i.section})`,
        i.feeType,
        i.netAmount,
        i.paidAmount,
        i.dueAmount,
        i.status,
      ]);
      handleExportCSV('fee_collection_dues_report', headers, rows);
    } else if (reportType === 'staff' && canSeeFinancialAndPayroll) {
      const headers = ['Employee ID', 'Name', 'Designation', 'Department', 'Phone', 'Basic Salary'];
      const rows = staff.map((st) => [st.employeeId, st.nameEn, st.designation, st.department, st.phone, st.basicSalary]);
      handleExportCSV('staff_payroll_directory', headers, rows);
    }
  };

  const reportCards = [
    {
      id: 'attendance' as ReportType,
      label: language === 'bn' ? 'হাজিরা রিপোর্ট' : 'Attendance Report',
      icon: CalendarCheck2,
      count: attendanceReportRows.length,
    },
    {
      id: 'exam_results' as ReportType,
      label: language === 'bn' ? 'পরীক্ষা ও মেধা রিপোর্ট' : 'Exam & Merit Report',
      icon: Award,
      count: examReportRows.length,
    },
    {
      id: 'homework' as ReportType,
      label: language === 'bn' ? 'হোমওয়ার্ক রিপোর্ট' : 'Homework Report',
      icon: BookOpen,
      count: homeworkReportRows.length,
    },
    {
      id: 'students' as ReportType,
      label: language === 'bn' ? 'শিক্ষার্থী তালিকা' : 'Student Register',
      icon: Users,
      count: filteredStudents.length,
    },
    ...(canSeeFinancialAndPayroll
      ? [
          {
            id: 'fees' as ReportType,
            label: language === 'bn' ? 'ফি ও বকেয়া হিসাব' : 'Fee Collection & Dues',
            icon: Wallet,
            count: invoices.length,
          },
          {
            id: 'staff' as ReportType,
            label: language === 'bn' ? 'স্টাফ ও বেতন' : 'Faculty & Payroll',
            icon: BarChart3,
            count: staff.length,
          },
        ]
      : []),
  ];

  const activeExamObj = exams.find((e) => e.id === (selectedExamId || exams[0]?.id));

  const reportLauncherItems: LauncherTileItem[] = reportCards.map((rep, idx) => {
    const palette: LauncherTileItem['color'][] = ['green', 'sky', 'red', 'purple', 'blue', 'amber'];
    return {
      id: rep.id,
      label: rep.label,
      icon: rep.icon,
      color: palette[idx % palette.length],
      badge: language === 'bn' ? toBnNumber(rep.count) : rep.count,
      active: reportType === rep.id,
      onClick: () => setReportType(rep.id),
    };
  });

  return (
    <div className="space-y-5">
      {/* Report Categories Colorful Launcher Grid */}
      <LauncherIconGrid items={reportLauncherItems} columns={6} />

      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 print:hidden">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-slate-900">
            {language === 'bn' ? 'একাডেমিক ও হাজিরা রিপোর্ট সেন্টার' : 'Academic & Attendance Reports Center'}
          </h2>
          <p className="text-xs text-slate-500">
            {canSeeFinancialAndPayroll
              ? language === 'bn'
                ? 'শিক্ষার্থী হাজিরা, পরীক্ষার ফলাফল, হোমওয়ার্ক এবং আর্থিক বিবরণী প্রিন্ট ও ডাউনলোড করুন'
                : 'Generate printable registers and CSV exports for attendance, exams, homework & accounts'
              : language === 'bn'
              ? 'শিক্ষার্থীর মাসিক হাজিরা, পরীক্ষার মেধা ও হোমওয়ার্ক রিপোর্ট দেখুন এবং প্রিন্ট করুন'
              : 'View, export CSV, and print attendance, exam merit, and homework performance reports'}
          </p>
        </div>
        <div className="flex items-center space-x-2 shrink-0">
          <button
            onClick={handleExportCurrent}
            className="flex items-center space-x-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs whitespace-nowrap"
          >
            <Download className="w-4 h-4" />
            <span>{language === 'bn' ? 'CSV ডাউনলোড' : 'Export CSV'}</span>
          </button>
          <button
            onClick={() => window.print()}
            className="flex items-center space-x-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs whitespace-nowrap"
          >
            <Printer className="w-4 h-4" />
            <span>{language === 'bn' ? 'রিপোর্ট প্রিন্ট' : 'Print Report'}</span>
          </button>
        </div>
      </div>

      {/* Filters Bar */}
      {(reportType === 'students' ||
        reportType === 'attendance' ||
        reportType === 'exam_results' ||
        reportType === 'homework') && (
        <div className="p-3.5 bg-white rounded-xl border border-slate-200 flex flex-wrap items-center gap-3 text-xs print:hidden">
          <div className="flex items-center space-x-2">
            <label className="font-bold text-slate-700">{language === 'bn' ? 'শ্রেণি:' : 'Class:'}</label>
            <select
              value={selectedClass}
              onChange={(e) => setSelectedClass(e.target.value)}
              className="px-3 py-1.5 border border-slate-200 rounded-lg bg-white font-semibold text-slate-800"
            >
              <option value="all">{language === 'bn' ? 'সকল শ্রেণি' : 'All Classes'}</option>
              {classOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {reportType === 'attendance' && (
            <div className="flex items-center space-x-2">
              <label className="font-bold text-slate-700">{language === 'bn' ? 'মাস:' : 'Month:'}</label>
              <input
                type="month"
                value={selectedMonthYear}
                onChange={(e) => setSelectedMonthYear(e.target.value)}
                className="px-3 py-1.5 border border-slate-200 rounded-lg bg-white font-semibold text-slate-800"
              />
            </div>
          )}

          {reportType === 'exam_results' && (
            <div className="flex items-center space-x-2">
              <label className="font-bold text-slate-700">{language === 'bn' ? 'পরীক্ষা:' : 'Exam:'}</label>
              <select
                value={selectedExamId || exams[0]?.id || ''}
                onChange={(e) => setSelectedExamId(e.target.value)}
                className="px-3 py-1.5 border border-slate-200 rounded-lg bg-white font-semibold text-slate-800"
              >
                {exams.map((ex) => (
                  <option key={ex.id} value={ex.id}>
                    {language === 'bn' ? ex.nameBn || ex.nameEn : ex.nameEn}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      {/* Report Table Container */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between text-xs">
          <span className="font-bold text-slate-900">
            {reportType === 'students' && (language === 'bn' ? 'শিক্ষার্থী রেজিস্ট্রি তালিকা' : 'Student Enrollment Register')}
            {reportType === 'attendance' &&
              (language === 'bn'
                ? `শিক্ষার্থী মাসিক হাজিরা রিপোর্ট (${selectedMonthYear})`
                : `Student Monthly Attendance Report (${selectedMonthYear})`)}
            {reportType === 'exam_results' &&
              (language === 'bn'
                ? `পরীক্ষার নম্বর ও মেধা রিপোর্ট (${activeExamObj?.nameBn || activeExamObj?.nameEn || 'Exam'})`
                : `Exam Marks & Merit Report (${activeExamObj?.nameEn || 'Exam'})`)}
            {reportType === 'homework' && (language === 'bn' ? 'হোমওয়ার্ক মূল্যায়ন রিপোর্ট' : 'Homework Performance Report')}
            {reportType === 'fees' && canSeeFinancialAndPayroll && 'Fee Invoices and Receivables Audit Log'}
            {reportType === 'staff' && canSeeFinancialAndPayroll && 'Employee Personnel & Salary Scale Report'}
          </span>
          <span className="text-slate-500 font-medium font-mono">Session: 2026</span>
        </div>

        <div className="overflow-x-auto">
          {reportType === 'attendance' && (
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase">
                  <th className="py-2.5 px-4">{language === 'bn' ? 'রোল' : 'Roll'}</th>
                  <th className="py-2.5 px-4">{language === 'bn' ? 'শিক্ষার্থীর নাম' : 'Student Name'}</th>
                  <th className="py-2.5 px-4">{language === 'bn' ? 'শ্রেণি' : 'Class'}</th>
                  <th className="py-2.5 px-4 text-center">{language === 'bn' ? 'উপস্থিত' : 'Present'}</th>
                  <th className="py-2.5 px-4 text-center">{language === 'bn' ? 'দেরি' : 'Late'}</th>
                  <th className="py-2.5 px-4 text-center">{language === 'bn' ? 'অনুপস্থিত' : 'Absent'}</th>
                  <th className="py-2.5 px-4 text-center">{language === 'bn' ? 'ছুটি' : 'Excused'}</th>
                  <th className="py-2.5 px-4 text-right">{language === 'bn' ? 'উপস্থিতি হার' : 'Rate %'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {attendanceReportRows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-10 text-center text-slate-400">
                      {language === 'bn' ? 'কোনো শিক্ষার্থী পাওয়া যায়নি।' : 'No student attendance data found.'}
                    </td>
                  </tr>
                ) : (
                  attendanceReportRows.map((row) => (
                    <tr key={row.student.id} className="hover:bg-slate-50/60">
                      <td className="py-2.5 px-4 font-mono font-bold text-slate-800 tabular-nums">{row.student.roll}</td>
                      <td className="py-2.5 px-4">
                        <div className="font-semibold text-slate-900">{row.student.nameEn}</div>
                        <div className="text-[11px] text-slate-500">{row.student.nameBn}</div>
                      </td>
                      <td className="py-2.5 px-4 text-slate-700">
                        {row.student.className} ({row.student.section})
                      </td>
                      <td className="py-2.5 px-4 text-center font-mono font-bold text-emerald-700 tabular-nums">{row.present}</td>
                      <td className="py-2.5 px-4 text-center font-mono font-bold text-amber-700 tabular-nums">{row.late}</td>
                      <td className="py-2.5 px-4 text-center font-mono font-bold text-rose-600 tabular-nums">{row.absent}</td>
                      <td className="py-2.5 px-4 text-center font-mono text-blue-700 tabular-nums">{row.excused}</td>
                      <td className="py-2.5 px-4 text-right font-mono font-black text-slate-900 tabular-nums">
                        {row.total > 0 ? `${row.rate}%` : '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}

          {reportType === 'exam_results' && (
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase">
                  <th className="py-2.5 px-4 text-center">{language === 'bn' ? 'মেধাক্রম' : 'Rank'}</th>
                  <th className="py-2.5 px-4">{language === 'bn' ? 'রোল' : 'Roll'}</th>
                  <th className="py-2.5 px-4">{language === 'bn' ? 'শিক্ষার্থীর নাম' : 'Student Name'}</th>
                  <th className="py-2.5 px-4">{language === 'bn' ? 'শ্রেণি' : 'Class'}</th>
                  <th className="py-2.5 px-4 text-right">{language === 'bn' ? 'প্রাপ্ত নম্বর' : 'Marks'}</th>
                  <th className="py-2.5 px-4 text-center">GPA</th>
                  <th className="py-2.5 px-4 text-center">{language === 'bn' ? 'গ্রেড' : 'Grade'}</th>
                  <th className="py-2.5 px-4 text-center">{language === 'bn' ? 'ফলাফল' : 'Status'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {examReportRows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-10 text-center text-slate-400">
                      {language === 'bn' ? 'নম্বর এন্ট্রি তথ্য পাওয়া যায়নি।' : 'No exam results available.'}
                    </td>
                  </tr>
                ) : (
                  examReportRows.map((row) => (
                    <tr key={row.student.id} className="hover:bg-slate-50/60">
                      <td className="py-2.5 px-4 text-center font-mono font-black text-blue-700 tabular-nums">
                        {row.meritRank ? `#${row.meritRank}` : '—'}
                      </td>
                      <td className="py-2.5 px-4 font-mono font-bold text-slate-700 tabular-nums">{row.student.roll}</td>
                      <td className="py-2.5 px-4">
                        <div className="font-semibold text-slate-900">{row.student.nameEn}</div>
                        <div className="text-[11px] text-slate-500">{row.student.nameBn}</div>
                      </td>
                      <td className="py-2.5 px-4 text-slate-700">
                        {row.student.className} ({row.student.section})
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono font-bold text-slate-900 tabular-nums">
                        {row.totalObtained} / {row.totalFull}
                      </td>
                      <td className="py-2.5 px-4 text-center font-mono font-bold text-slate-900 tabular-nums">
                        {row.gpa.toFixed(2)}
                      </td>
                      <td className="py-2.5 px-4 text-center font-bold text-slate-800">{row.grade}</td>
                      <td className="py-2.5 px-4 text-center">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            row.status === 'PASSED'
                              ? 'bg-emerald-100 text-emerald-800'
                              : row.status === 'FAILED'
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {row.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}

          {reportType === 'homework' && (
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase">
                  <th className="py-2.5 px-4">{language === 'bn' ? 'তারিখ' : 'Date'}</th>
                  <th className="py-2.5 px-4">{language === 'bn' ? 'শ্রেণি ও বিষয়' : 'Class & Subject'}</th>
                  <th className="py-2.5 px-4">{language === 'bn' ? 'শিরোনাম' : 'Assignment Title'}</th>
                  <th className="py-2.5 px-4 text-center">{language === 'bn' ? 'সাবমিশন' : 'Submissions'}</th>
                  <th className="py-2.5 px-4 text-center">{language === 'bn' ? 'মূল্যায়িত' : 'Evaluated'}</th>
                  <th className="py-2.5 px-4 text-right">{language === 'bn' ? 'গড় নম্বর' : 'Avg Score'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {homeworkReportRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-slate-400">
                      {language === 'bn' ? 'কোনো হোমওয়ার্ক রেকর্ড পাওয়া যায়নি।' : 'No homework assignments found.'}
                    </td>
                  </tr>
                ) : (
                  homeworkReportRows.map((row) => (
                    <tr key={row.hw.id} className="hover:bg-slate-50/60">
                      <td className="py-2.5 px-4 font-mono text-slate-700 tabular-nums">
                        {row.hw.assignedDate || row.hw.homeworkDate || row.hw.dueDate}
                      </td>
                      <td className="py-2.5 px-4">
                        <div className="font-semibold text-slate-900">{row.hw.subjectName}</div>
                        <div className="text-[11px] text-slate-500">
                          {row.hw.className} ({row.hw.section}) · Due {row.hw.dueDate}
                        </div>
                      </td>
                      <td className="py-2.5 px-4 font-medium text-slate-800">{row.hw.title}</td>
                      <td className="py-2.5 px-4 text-center font-mono font-bold text-blue-700 tabular-nums">
                        {row.submissionCount}
                      </td>
                      <td className="py-2.5 px-4 text-center font-mono font-bold text-emerald-700 tabular-nums">
                        {row.reviewedCount}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono font-bold text-slate-900 tabular-nums">
                        {row.avgMarks} / {row.hw.fullMarks || 10}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}

          {reportType === 'students' && (
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase">
                  <th className="py-2.5 px-4">ID & Roll</th>
                  <th className="py-2.5 px-4">Student Name (EN / BN)</th>
                  <th className="py-2.5 px-4">Class & Shift</th>
                  <th className="py-2.5 px-4">Guardian Contact</th>
                  <th className="py-2.5 px-4">Admission Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredStudents.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50/60">
                    <td className="py-2.5 px-4 font-bold text-blue-700 font-mono tabular-nums">
                      {s.studentId} (Roll {s.roll})
                    </td>
                    <td className="py-2.5 px-4 font-semibold text-slate-900">
                      {s.nameEn} ({s.nameBn})
                    </td>
                    <td className="py-2.5 px-4">
                      {s.className} - {s.section} ({s.shift})
                    </td>
                    <td className="py-2.5 px-4 text-slate-700">
                      {s.guardianName} ({s.guardianPhone})
                    </td>
                    <td className="py-2.5 px-4 text-slate-500 font-mono tabular-nums">{s.admissionDate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {reportType === 'fees' && canSeeFinancialAndPayroll && (
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase">
                  <th className="py-2.5 px-4">Invoice No</th>
                  <th className="py-2.5 px-4">Student Name</th>
                  <th className="py-2.5 px-4">Fee Month</th>
                  <th className="py-2.5 px-4 text-right">Net Amount</th>
                  <th className="py-2.5 px-4 text-right">Paid</th>
                  <th className="py-2.5 px-4 text-right">Due</th>
                  <th className="py-2.5 px-4 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {invoices.map((i) => (
                  <tr key={i.id} className="hover:bg-slate-50/60">
                    <td className="py-2.5 px-4 font-bold text-blue-700 font-mono">{i.invoiceNo}</td>
                    <td className="py-2.5 px-4 font-semibold text-slate-900">{i.studentNameEn}</td>
                    <td className="py-2.5 px-4 text-slate-700">{i.month || i.feeType}</td>
                    <td className="py-2.5 px-4 text-right font-bold text-slate-800 tabular-nums">{formatTaka(i.netAmount)}</td>
                    <td className="py-2.5 px-4 text-right font-bold text-emerald-700 tabular-nums">{formatTaka(i.paidAmount)}</td>
                    <td className="py-2.5 px-4 text-right font-bold text-rose-600 tabular-nums">{formatTaka(i.dueAmount)}</td>
                    <td className="py-2.5 px-4 text-center">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          i.status === 'Paid' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {i.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {reportType === 'staff' && canSeeFinancialAndPayroll && (
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase">
                  <th className="py-2.5 px-4">Emp ID</th>
                  <th className="py-2.5 px-4">Full Name</th>
                  <th className="py-2.5 px-4">Designation & Department</th>
                  <th className="py-2.5 px-4">Phone</th>
                  <th className="py-2.5 px-4 text-right">Basic Salary</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {staff.map((st) => (
                  <tr key={st.id} className="hover:bg-slate-50/60">
                    <td className="py-2.5 px-4 font-bold text-slate-700 font-mono">{st.employeeId}</td>
                    <td className="py-2.5 px-4 font-semibold text-slate-900">
                      {st.nameEn} ({st.nameBn})
                    </td>
                    <td className="py-2.5 px-4 text-slate-700">
                      {st.designation} • {st.department}
                    </td>
                    <td className="py-2.5 px-4 text-slate-600 font-mono">{st.phone}</td>
                    <td className="py-2.5 px-4 text-right font-bold text-emerald-700 tabular-nums">
                      {formatTaka(st.basicSalary)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};
