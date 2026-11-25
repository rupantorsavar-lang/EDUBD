import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { StorageService } from '../../services/storage';
import {
  Users,
  GraduationCap,
  CalendarCheck2,
  Wallet,
  AlertCircle,
  TrendingUp,
  Award,
  BookOpen,
  Bell,
  Clock,
  ArrowUpRight,
  CheckCircle2,
  PlusCircle,
  FileText,
  DollarSign,
  UserCheck,
  MessageSquare,
  QrCode,
  Sparkles,
  FileCheck,
  CalendarDays,
  Layers,
  UserPlus,
  Library,
  Bus,
  Package,
  Newspaper,
  BarChart3,
  CreditCard,
  Settings,
  Headphones,
  FileSpreadsheet,
} from 'lucide-react';
import { useState, useMemo, useEffect } from 'react';
import { SuperAdminStaffRBAC } from './SuperAdminStaffRBAC';
import { isTabAuthorized } from '../../utils/permissions';
import { WebsiteMessagesModal } from '../auth/WebsiteMessagesModal';
import { StudentDedicatedDashboard } from './StudentDedicatedDashboard';
import { TeacherDedicatedDashboard } from './TeacherDedicatedDashboard';
import { SuperAdminDraftApprovals } from './SuperAdminDraftApprovals';
import { LauncherIconGrid, LauncherTileItem } from '../common/LauncherIconGrid';

interface DashboardViewProps {
  onNavigate: (tab: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ onNavigate }) => {
  const { activeRole, currentUser } = useAuth();
  const { t, language, formatTaka, toBnNumber } = useLanguage();

  const [showMessagesModal, setShowMessagesModal] = useState<boolean>(false);
  const [, setSyncTick] = useState<number>(0);

  useEffect(() => {
    const handleSync = () => setSyncTick((n) => n + 1);
    window.addEventListener('school_cloud_data_synced', handleSync);
    window.addEventListener('online_payments_updated', handleSync);
    if (activeRole === 'super_admin' || activeRole === 'admin' || activeRole === 'receptionist') {
      void StorageService.syncPublicInboxFromCloud();
      void StorageService.syncPublicWebsite();
    }
    return () => {
      window.removeEventListener('school_cloud_data_synced', handleSync);
      window.removeEventListener('online_payments_updated', handleSync);
    };
  }, [activeRole]);

  // If student or guardian logs in, show dedicated student/guardian portal with strict data isolation
  if (activeRole === 'student' || activeRole === 'guardian') {
    return <StudentDedicatedDashboard onNavigateTab={onNavigate} />;
  }

  // Dedicated Teacher Workspace Dashboard
  if (activeRole === 'teacher') {
    return <TeacherDedicatedDashboard onNavigate={onNavigate} />;
  }

  const students = StorageService.getStudents();
  const staff = StorageService.getStaff();
  const messages = StorageService.getWebsiteMessages();
  const unreadMessagesCount = messages.filter((m) => !m.isRead).length;
  const onlineRequests = StorageService.getOnlinePaymentRequests();
  const pendingOnlineRequests = onlineRequests.filter((r) => r.status === 'pending');
  const attendance = StorageService.getAttendance();
  const invoices = StorageService.getInvoices();
  const payments = StorageService.getPayments();
  const expenses = StorageService.getExpenses();
  const notices = StorageService.getNotices();
  const routines = StorageService.getRoutines();
  const exams = StorageService.getExams();
  const enquiries = StorageService.getEnquiries();

  // Dynamic Metrics
  const activeStudents = students.filter((s) => s.status !== 'inactive' && s.status !== 'transferred');
  const activeStudentsCount = activeStudents.length;
  const activeStaffCount = staff.filter((s) => s.status === 'active').length;

  const todayStr = useMemo(() => {
    const realToday = new Date().toISOString().split('T')[0];
    if (attendance.some((a) => a.date === realToday)) return realToday;
    if (attendance.length > 0) {
      const dates = Array.from(new Set(attendance.map((a) => a.date).filter(Boolean))).sort().reverse();
      if (dates.length > 0) return dates[0];
    }
    return realToday;
  }, [attendance]);
  const todayAttendance = attendance.filter((a) => a.targetType === 'student' && a.date === todayStr);
  const presentCount = todayAttendance.filter((a) => a.status === 'Present').length;
  const attendanceRate =
    todayAttendance.length > 0 ? Math.round((presentCount / todayAttendance.length) * 100) : 0;

  const incomeVouchers = StorageService.getIncomeVouchers();
  const totalIncomeVoucherCollected = incomeVouchers.reduce((sum, v) => sum + (Number(v.amount) || 0), 0);
  const totalFeeCollected = payments.reduce((sum, p) => sum + p.amount, 0) + totalIncomeVoucherCollected;
  const totalDues = (() => {
    const studentDueSum = students.reduce((sum, st) => {
      const dues = StorageService.getStudentDueFees(st);
      return sum + dues.reduce((s, d) => s + (Number(d.amount) || 0), 0);
    }, 0);
    const matchedIds = new Set<string>();
    students.forEach((s) => {
      matchedIds.add(s.id);
      if (s.studentId) matchedIds.add(s.studentId);
    });
    const orphanInvoiceDues = invoices
      .filter((i) => i.dueAmount > 0 && !matchedIds.has(i.studentId))
      .reduce((sum, i) => sum + i.dueAmount, 0);
    return studentDueSum + orphanInvoiceDues;
  })();
  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);

  // Class wise distribution (matches active enrollment count)
  const classCounts: Record<string, number> = {};
  activeStudents.forEach((s) => {
    classCounts[s.className] = (classCounts[s.className] || 0) + 1;
  });

  const dashboardLaunchTiles: LauncherTileItem[] = (() => {
    const raw: {
      id: string;
      tabId: string;
      label: string;
      icon: typeof Users;
      color: LauncherTileItem['color'];
      badge?: number;
    }[] = [
      { id: 'students', tabId: 'students', label: language === 'bn' ? 'শিক্ষার্থী প্রোফাইল' : 'Students', icon: GraduationCap, color: 'green' },
      { id: 'admissions', tabId: 'admissions', label: language === 'bn' ? 'ভর্তি ও আবেদন' : 'Admissions', icon: UserPlus, color: 'sky' },
      { id: 'fees', tabId: 'fees', label: language === 'bn' ? 'ফিস ও হিসাব' : 'Fees & Cash', icon: Wallet, color: 'blue', badge: pendingOnlineRequests.length || undefined },
      { id: 'attendance', tabId: 'attendance', label: language === 'bn' ? 'উপস্থিতি ও হাজিরা' : 'Attendance', icon: CalendarCheck2, color: 'teal' },
      { id: 'examinations', tabId: 'examinations', label: language === 'bn' ? 'পরীক্ষা ও ফলাফল' : 'Exams & Results', icon: Award, color: 'red' },
      { id: 'staff', tabId: 'staff', label: language === 'bn' ? 'শিক্ষক ও বেতন' : 'Staff & Payroll', icon: Users, color: 'amber' },
      { id: 'academic', tabId: 'academic', label: language === 'bn' ? 'একাডেমিক ও ছুটি' : 'Academic', icon: Layers, color: 'red' },
      { id: 'routine', tabId: 'routine', label: language === 'bn' ? 'ক্লাস রুটিন' : 'Class Routine', icon: CalendarDays, color: 'sky' },
      { id: 'homework', tabId: 'homework', label: language === 'bn' ? 'বাড়ির কাজ (AI)' : 'AI Homework', icon: FileCheck, color: 'purple' },
      { id: 'qr_attendance', tabId: 'qr_attendance', label: language === 'bn' ? 'QR গেট হাজিরা' : 'QR Attendance', icon: QrCode, color: 'green' },
      { id: 'reports', tabId: 'reports', label: language === 'bn' ? 'রিপোর্ট ও এক্সপোর্ট' : 'Reports', icon: FileSpreadsheet, color: 'green' },
      { id: 'analytics', tabId: 'analytics', label: language === 'bn' ? 'AI পারফরম্যান্স' : 'AI Analytics', icon: BarChart3, color: 'purple' },
      { id: 'certificates', tabId: 'certificates', label: language === 'bn' ? 'সনদপত্র ও আইডি' : 'Certificates', icon: FileText, color: 'amber' },
      { id: 'notices', tabId: 'notices', label: language === 'bn' ? 'নোটিশ বোর্ড' : 'Notice Board', icon: Bell, color: 'red' },
      { id: 'library', tabId: 'library', label: language === 'bn' ? 'লাইব্রেরি' : 'Library', icon: Library, color: 'teal' },
      { id: 'transport', tabId: 'transport', label: language === 'bn' ? 'পরিবহন ও বাস' : 'Transport', icon: Bus, color: 'orange' },
      { id: 'inventory', tabId: 'inventory', label: language === 'bn' ? 'সম্পদ ও স্টক' : 'Inventory', icon: Package, color: 'sky' },
      { id: 'blog', tabId: 'blog', label: language === 'bn' ? 'স্কুল ব্লগ' : 'School Blog', icon: Newspaper, color: 'indigo' },
      { id: 'subscription_billing', tabId: 'subscription_billing', label: language === 'bn' ? 'সাবস্ক্রিপশন' : 'Billing', icon: CreditCard, color: 'amber' },
      { id: 'settings', tabId: 'settings', label: language === 'bn' ? 'বিদ্যালয় সেটিংস' : 'Settings', icon: Settings, color: 'teal' },
      { id: 'support', tabId: 'support', label: language === 'bn' ? 'সাপোর্ট টিম' : 'Support Team', icon: Headphones, color: 'red' },
    ];

    const authorized = raw
      .filter((item) => isTabAuthorized(item.tabId, activeRole, currentUser))
      .map<LauncherTileItem>((item) => ({
        id: item.id,
        label: item.label,
        icon: item.icon,
        color: item.color,
        badge: item.badge,
        onClick: () => onNavigate(item.tabId),
      }));

    if (activeRole === 'super_admin' || activeRole === 'master_admin') {
      authorized.push({
        id: 'website_messages',
        label: language === 'bn' ? 'ওয়েবসাইট বার্তা' : 'Site Messages',
        icon: MessageSquare,
        color: 'sky',
        badge: unreadMessagesCount || undefined,
        onClick: () => setShowMessagesModal(true),
      });
    }

    return authorized;
  })();

  return (
    <div className="space-y-5">
      {/* Primary App-Launcher Icon Grid */}
      <LauncherIconGrid items={dashboardLaunchTiles} columns={5} />

      {/* Super Admin / Admin / Accountant: Pending Online Fee Payment Approval Alert Strip */}
      {(activeRole === 'super_admin' ||
        activeRole === 'admin' ||
        activeRole === 'accountant' ||
        activeRole === 'master_admin') &&
        isTabAuthorized('fees', activeRole, currentUser) &&
        pendingOnlineRequests.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3">
            <div className="flex items-start space-x-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-amber-100 border border-amber-200 flex items-center justify-center shrink-0">
                <Bell className="w-5 h-5 text-amber-700" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-bold text-amber-950 text-xs sm:text-sm">
                    নতুন অনলাইন ফি পেমেন্ট অনুমোদন অপেক্ষমাণ ({toBnNumber(pendingOnlineRequests.length)}টি •{' '}
                    {formatTaka(
                      pendingOnlineRequests.reduce((sum, r) => sum + (Number(r.amount) || 0), 0)
                    )}
                    )
                  </h3>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {pendingOnlineRequests.slice(0, 3).map((req) => (
                    <span
                      key={req.id}
                      className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-lg bg-white border border-amber-200 text-[11px] font-semibold text-slate-800"
                    >
                      <span>{req.studentName}</span>
                      <span className="text-amber-700 font-bold">
                        ({req.paymentMethod === 'bKash' ? 'বিকাশ' : req.paymentMethod === 'Rocket' ? 'রকেট' : 'নগদ'}{' '}
                        {formatTaka(req.amount)})
                      </span>
                      <span className="font-mono text-[10px] text-slate-500">
                        Trx: {req.transactionId}
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('fees:online_approvals')}
              className="flex items-center space-x-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs transition-colors shadow-xs shrink-0"
            >
              <Wallet className="w-4 h-4" />
              <span>অনলাইন অনুমোদনে যান</span>
              <ArrowUpRight className="w-4 h-4" />
            </button>
          </div>
        )}

      {/* Compact Clean Welcome & Quick Inbox Bar */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base sm:text-lg font-bold text-slate-900">
            {language === 'bn'
              ? `স্বাগতম, ${currentUser.nameBn || currentUser.name}`
              : `Welcome back, ${currentUser.name}`}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {language === 'bn'
              ? 'প্লে / নার্সারি থেকে দশম শ্রেণি পর্যন্ত সম্পূর্ণ একাডেমিক, হাজিরা, পরীক্ষা, ফি ও হিসাব খাতা'
              : 'Unified Academic, Attendance, Examinations, Fee Collection & Institutional Records'}
          </p>
        </div>
        {(activeRole === 'super_admin' || activeRole === 'master_admin') && (
          <button
            type="button"
            onClick={() => setShowMessagesModal(true)}
            className="inline-flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs transition-colors shadow-xs shrink-0 self-start md:self-auto"
          >
            <MessageSquare className="w-4 h-4" />
            <span>
              {language === 'bn' ? 'ওয়েবসাইট বার্তা ইনবক্স' : 'Website Inbox'}
              {unreadMessagesCount > 0 ? ` (${language === 'bn' ? toBnNumber(unreadMessagesCount) : unreadMessagesCount})` : ''}
            </span>
          </button>
        )}
      </div>

      {/* Primary KPI Stats Grid */}
      {/* Primary KPI Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Students */}
        <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-xs hover:border-blue-400 hover:shadow-sm transition-all">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-slate-600">{t('totalStudents')}</span>
            <div className="p-2.5 rounded-xl bg-blue-50 text-blue-700">
              <GraduationCap className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-3xl font-extrabold text-slate-900 tracking-tight">
              {language === 'bn' ? toBnNumber(activeStudentsCount) : activeStudentsCount}
            </span>
            <span className="text-xs text-emerald-600 font-bold flex items-center bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-200">
              <TrendingUp className="w-3.5 h-3.5 mr-0.5" />
              Nursery-10
            </span>
          </div>
          <div className="mt-3 text-xs text-slate-500 font-medium flex items-center justify-between border-t border-slate-100 pt-2.5">
            <span>{language === 'bn' ? '12টি সক্রিয় শ্রেণি' : '12 Active Classes'}</span>
            {isTabAuthorized('students', activeRole, currentUser) && (
              <button onClick={() => onNavigate('students')} className="text-blue-600 font-bold hover:underline">
                {t('details')} &rarr;
              </button>
            )}
          </div>
        </div>

        {/* Total Teachers & Staff */}
        <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-xs hover:border-emerald-400 hover:shadow-sm transition-all">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-slate-600">{t('totalStaff')}</span>
            <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-700">
              <Users className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-3xl font-extrabold text-slate-900 tracking-tight">
              {language === 'bn' ? toBnNumber(activeStaffCount) : activeStaffCount}
            </span>
            <span className="text-xs text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-200">
              {language === 'bn' ? 'অন ডিউটি' : 'On Duty'}
            </span>
          </div>
          <div className="mt-3 text-xs text-slate-500 font-medium flex items-center justify-between border-t border-slate-100 pt-2.5">
            <span>{language === 'bn' ? 'শিক্ষক ও কর্মচারী' : 'Teachers & Personnel'}</span>
            {isTabAuthorized('staff', activeRole, currentUser) && (
              <button onClick={() => onNavigate('staff')} className="text-emerald-700 font-bold hover:underline">
                {t('details')} &rarr;
              </button>
            )}
          </div>
        </div>

        {/* Today's Attendance Rate */}
        <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-xs hover:border-cyan-400 hover:shadow-sm transition-all">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-slate-600">{t('todaysAttendance')}</span>
            <div className="p-2.5 rounded-xl bg-cyan-50 text-cyan-700">
              <CalendarCheck2 className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-3xl font-extrabold text-slate-900 tracking-tight">
              {language === 'bn' ? `${toBnNumber(attendanceRate)}%` : `${attendanceRate}%`}
            </span>
            <span className="text-xs text-blue-700 font-bold bg-blue-50 px-2 py-0.5 rounded-lg border border-blue-200">
              {language === 'bn' ? 'আজকের রোল কল' : "Today's Register"}
            </span>
          </div>
          <div className="mt-3 text-xs text-slate-500 font-medium flex items-center justify-between border-t border-slate-100 pt-2.5">
            <span>{language === 'bn' ? 'নিয়মিত শিক্ষার্থী' : 'Enrolled Students'}</span>
            {isTabAuthorized('attendance', activeRole, currentUser) && (
              <button onClick={() => onNavigate('attendance')} className="text-cyan-700 font-bold hover:underline">
                {language === 'bn' ? 'হাজিরা খাতা' : 'Register'} &rarr;
              </button>
            )}
          </div>
        </div>

        {/* 4th Card: Fee Collection (for accounts/admin) OR Examinations (for teachers/staff) */}
        {isTabAuthorized('fees', activeRole, currentUser) ? (
          <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-xs hover:border-amber-400 hover:shadow-sm transition-all">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-slate-600">
                {activeRole === 'accountant' ? t('todaysCollection') : t('totalDues')}
              </span>
              <div className="p-2.5 rounded-xl bg-amber-50 text-amber-700">
                <Wallet className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline justify-between">
              <span className="text-3xl font-extrabold text-slate-900 tracking-tight">
                {formatTaka(activeRole === 'accountant' ? totalFeeCollected : totalDues)}
              </span>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-lg border ${totalDues > 0 ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                {language === 'bn' ? 'মোট বকেয়া' : 'Receivables'}
              </span>
            </div>
            <div className="mt-3 text-xs text-slate-500 font-medium flex items-center justify-between border-t border-slate-100 pt-2.5">
              <span>{language === 'bn' ? 'অক্টোবর 2026 সেশন' : 'October 2026 Invoices'}</span>
              <button onClick={() => onNavigate('fees')} className="text-amber-700 font-bold hover:underline">
                {t('details')} &rarr;
              </button>
            </div>
          </div>
        ) : (
          <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-xs hover:border-purple-400 hover:shadow-sm transition-all">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-slate-600">
                {language === 'bn' ? 'পরীক্ষা ও ফলাফল' : 'Examinations'}
              </span>
              <div className="p-2.5 rounded-xl bg-purple-50 text-purple-700">
                <Award className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline justify-between">
              <span className="text-3xl font-extrabold text-slate-900 tracking-tight">
                {language === 'bn' ? toBnNumber(exams.length) : exams.length}
              </span>
              <span className="text-xs text-purple-700 font-bold bg-purple-50 px-2 py-0.5 rounded-lg border border-purple-200">
                {language === 'bn' ? 'সক্রিয় পরীক্ষা' : 'Term Exams'}
              </span>
            </div>
            <div className="mt-3 text-xs text-slate-500 font-medium flex items-center justify-between border-t border-slate-100 pt-2.5">
              <span>{language === 'bn' ? 'মার্কস ও ফলাফল ড্যাশবোর্ড' : 'Marks & Results'}</span>
              {isTabAuthorized('examinations', activeRole, currentUser) && (
                <button onClick={() => onNavigate('examinations')} className="text-purple-700 font-bold hover:underline">
                  {language === 'bn' ? 'প্রবেশ করুন' : 'Open'} &rarr;
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Super Admin & Master Admin: Teacher Draft Approvals & Publishing Queue */}
      {(activeRole === 'super_admin' || activeRole === 'master_admin') && (
        <SuperAdminDraftApprovals
          onNavigate={onNavigate}
          language={language}
          toBnNumber={toBnNumber}
        />
      )}

      {/* Super Admin & Master Admin Staff RBAC Access Control Panel */}
      {(activeRole === 'super_admin' || activeRole === 'master_admin') && <SuperAdminStaffRBAC />}

      {/* Middle Row: Class Enrollment Distribution & Upcoming Exams / Notices */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Class Enrollment Breakdown */}
        <div className="lg:col-span-2 p-5 bg-white rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                {language === 'bn' ? 'শ্রেণিভিত্তিক শিক্ষার্থী সংখ্যা (প্লে - দশম শ্রেণি)' : 'Class-wise Enrollment (Nursery to Class 10)'}
              </h3>
              <p className="text-xs text-slate-500">
                {language === 'bn' ? 'প্রভাতি ও দিবা শিফটের মোট উপস্থিতি' : 'Distribution across Morning and Day shifts'}
              </p>
            </div>
            <button
              onClick={() => onNavigate('students')}
              className="text-xs font-semibold text-blue-600 hover:text-blue-800"
            >
              {language === 'bn' ? 'সকল শিক্ষার্থী' : 'View Directory'} &rarr;
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {[
              { cls: 'Nursery', bn: 'প্লে / নার্সারি' },
              { cls: 'KG', bn: 'কেজি (KG)' },
              { cls: 'Class 1', bn: '1ম শ্রেণি' },
              { cls: 'Class 2', bn: '2য় শ্রেণি' },
              { cls: 'Class 3', bn: '3য় শ্রেণি' },
              { cls: 'Class 4', bn: '4র্থ শ্রেণি' },
              { cls: 'Class 5', bn: '5ম শ্রেণি' },
              { cls: 'Class 6', bn: '6ষ্ঠ শ্রেণি' },
              { cls: 'Class 7', bn: '7ম শ্রেণি' },
              { cls: 'Class 8', bn: '8ম শ্রেণি' },
              { cls: 'Class 9', bn: '9ম শ্রেণি' },
              { cls: 'Class 10', bn: '10ম শ্রেণি' },
            ].map((item) => {
              const count = classCounts[item.cls] || 0;
              return (
                <div
                  key={item.cls}
                  className="p-3 rounded-lg border border-slate-100 bg-slate-50 hover:bg-blue-50/50 hover:border-blue-200 transition-all text-center"
                >
                  <div className="text-[11px] font-semibold text-slate-600">
                    {language === 'bn' ? item.bn : item.cls}
                  </div>
                  <div className="text-lg font-bold text-slate-900 mt-0.5">
                    {language === 'bn' ? toBnNumber(count) : count}
                  </div>
                  <div className="text-[10px] text-slate-400">
                    {language === 'bn' ? 'জন শিক্ষার্থী' : 'Students'}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Quick Academic Highlights */}
          <div className="mt-5 pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-4 text-xs">
            <div className="flex items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-600" />
              <span className="text-slate-600">
                {language === 'bn' ? 'বিজ্ঞান, ব্যবসায়, মানবিক ও ভোকেশনাল বিভাগ (9ম-10ম)' : 'Science, Commerce, Arts & Vocational Groups (9-10)'}
              </span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded-full bg-teal-500" />
              <span className="text-slate-600">
                {language === 'bn' ? 'শাখা সমুহ (A, B, C)' : 'Sections: A, B, C'}
              </span>
            </div>
          </div>
        </div>

        {/* Notices & Announcements Board */}
        <div className="p-5 bg-white rounded-xl border border-slate-200 shadow-xs flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-2">
              <Bell className="w-4 h-4 text-amber-500" />
              <h3 className="text-sm font-bold text-slate-900">{t('notices')}</h3>
            </div>
            <button
              onClick={() => onNavigate('notices')}
              className="text-xs font-semibold text-blue-600 hover:text-blue-800"
            >
              {language === 'bn' ? 'সকল নোটিশ' : 'View All'}
            </button>
          </div>
          <div className="space-y-3 flex-1 overflow-y-auto max-h-72">
            {notices.map((n) => (
              <div
                key={n.id}
                className="p-3 rounded-lg border border-slate-100 bg-slate-50 hover:bg-slate-100/70 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="px-1.5 py-0.5 text-[10px] font-bold rounded uppercase bg-blue-100 text-blue-700">
                    {n.category}
                  </span>
                  <span className="text-[10px] text-slate-400">{n.date}</span>
                </div>
                <h4 className="text-xs font-bold text-slate-800 mt-1.5 line-clamp-1">
                  {n.title}
                </h4>
                <p className="text-[11px] text-slate-600 mt-1 line-clamp-2">
                  {n.content}
                </p>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100">
            <button
              onClick={() => onNavigate('notices')}
              className="w-full py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors text-center"
            >
              {language === 'bn' ? '+ নতুন নোটিশ প্রকাশ' : '+ Post New Announcement'}
            </button>
          </div>
        </div>
      </div>

      {/* Bottom Row: Quick Routine / Today's Schedule & Financial Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Today's Period Routine Overview */}
        <div className="p-5 bg-white rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-2">
              <Clock className="w-4 h-4 text-blue-600" />
              <h3 className="text-sm font-bold text-slate-900">
                {language === 'bn' ? 'আজকের ক্লাস রুটিন (পিরিয়ড সূচি)' : "Today's Period Timetable"}
              </h3>
            </div>
            <button
              onClick={() => onNavigate('routine')}
              className="text-xs font-semibold text-blue-600 hover:text-blue-800"
            >
              {language === 'bn' ? 'সম্পূর্ণ রুটিন' : 'Full Timetable'} &rarr;
            </button>
          </div>
          <div className="divide-y divide-slate-100 overflow-x-auto">
            {routines.slice(0, 4).map((rt) => (
              <div key={rt.id} className="py-2.5 flex items-center justify-between text-xs">
                <div className="flex items-center space-x-3">
                  <span className="w-16 font-bold text-slate-700">{rt.startTime}</span>
                  <div>
                    <span className="font-semibold text-slate-900">{rt.subjectName}</span>
                    <span className="text-[11px] text-slate-500 ml-2">
                      ({rt.className} - {rt.section})
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-[11px] font-medium text-slate-700">{rt.teacherName}</span>
                  <div className="text-[10px] text-slate-400">{rt.roomNo}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Academic Examination & Result Glance */}
        <div className="p-5 bg-white rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-2">
              <Award className="w-4 h-4 text-emerald-600" />
              <h3 className="text-sm font-bold text-slate-900">
                {language === 'bn' ? 'পরীক্ষা ও ফলাফল প্রকাশ' : 'Examinations & Publications'}
              </h3>
            </div>
            <button
              onClick={() => onNavigate('examinations')}
              className="text-xs font-semibold text-emerald-700 hover:underline"
            >
              {language === 'bn' ? 'মার্কশিট প্রিন্ট' : 'Print Marksheets'} &rarr;
            </button>
          </div>
          <div className="space-y-3">
            {exams.map((ex) => (
              <div
                key={ex.id}
                className="p-3 rounded-lg border border-slate-100 bg-slate-50 flex items-center justify-between"
              >
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-bold text-slate-900">
                      {language === 'bn' ? ex.nameBn : ex.nameEn}
                    </span>
                    {ex.isPublished ? (
                      <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-emerald-100 text-emerald-700 rounded">
                        {language === 'bn' ? 'ফলাফল প্রকাশিত' : 'Published'}
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-amber-100 text-amber-700 rounded">
                        {language === 'bn' ? 'খসড়া' : 'Draft'}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    {language === 'bn' ? `তারিখ: ${ex.startDate} থেকে ${ex.endDate}` : `Dates: ${ex.startDate} to ${ex.endDate}`}
                  </p>
                </div>
                <button
                  onClick={() => onNavigate('examinations')}
                  className="px-2.5 py-1 text-xs font-semibold bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-100"
                >
                  {language === 'bn' ? 'ফলাফল দেখুন' : 'Results'}
                </button>
              </div>
            ))}
          </div>

          {/* NCTB Grading Scale Reminder */}
          <div className="mt-4 p-2.5 bg-blue-50/60 border border-blue-100 rounded-lg text-[11px] text-blue-900 flex items-center justify-between">
            <span>
              {language === 'bn'
                ? 'জাতীয় শিক্ষাক্রম ও পাঠ্যপুস্তক বোর্ড (NCTB) অনুমোদিত GPA 5.00 গ্রেডিং স্কেল।'
                : 'Configured with National Curriculum & Textbook Board (NCTB) 5.00 GPA Grading Scale.'}
            </span>
            <span className="font-bold text-blue-700">A+ (80-100)</span>
          </div>
        </div>
      </div>

      {/* Website Messages Modal for Super Admin */}
      <WebsiteMessagesModal
        isOpen={showMessagesModal}
        onClose={() => setShowMessagesModal(false)}
      />
    </div>
  );
};
