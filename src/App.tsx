import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SchoolProvider, useSchool } from './context/SchoolContext';
import { LanguageProvider } from './context/LanguageContext';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { Header } from './components/layout/Header';
import { Sidebar } from './components/layout/Sidebar';
import { PublicSchoolWebsite } from './components/public/PublicSchoolWebsite';

// Modules & Views
import { MasterAdminPortal } from './components/master/MasterAdminPortal';
import { DashboardView } from './components/dashboard/DashboardView';
import { StudentDedicatedDashboard } from './components/dashboard/StudentDedicatedDashboard';
import { StudentsView } from './components/students/StudentsView';
import { StaffView } from './components/staff/StaffView';
import { AttendanceView, AttendanceSubTab } from './components/attendance/AttendanceView';
import { SmartQRScannerTab } from './components/attendance/SmartQRScannerTab';
import { AcademicView } from './components/academic/AcademicView';
import { RoutineView } from './components/routine/RoutineView';
import { ExaminationsView, ExamSubTab } from './components/examinations/ExaminationsView';
import { FeesView, FeesSubTab } from './components/fees/FeesView';
import { HomeworkView, HomeworkSubTab } from './components/homework/HomeworkView';
import { AdmissionsView } from './components/admissions/AdmissionsView';
import { LibraryView } from './components/library/LibraryView';
import { TransportView } from './components/transport/TransportView';
import { InventoryView } from './components/inventory/InventoryView';
import { CertificatesView } from './components/certificates/CertificatesView';
import { NoticesView } from './components/notices/NoticesView';
import { BlogManagementView } from './components/blog/BlogManagementView';
import { ReportsView, ReportType } from './components/reports/ReportsView';
import { StudentPerformanceAnalyticsView } from './components/analytics/StudentPerformanceAnalyticsView';
import { SettingsView } from './components/settings/SettingsView';
import { SaaSAccessGate } from './components/saas/SaaSAccessGate';
import { SubscriptionBillingView } from './components/saas/SubscriptionBillingView';
import { SupportTeamView } from './components/support/SupportTeamView';
import {
  hasPasswordProvider,
  reauthenticateWithCurrentPassword,
  reauthenticateWithGoogleAccount,
} from './services/firebase';
import {
  Eye,
  EyeOff,
  Loader2,
  Lock,
  LogOut,
  QrCode,
  ScanFace,
  ShieldAlert,
  User,
  X,
  Bell,
  Smartphone,
  ArrowRight,
} from 'lucide-react';
import { OnlinePaymentRequest } from './types';
import { resolveSchoolDisplayName } from './utils/schoolNameResolver';

function AppContent() {
  const { isAuthenticated, activeRole, currentUser, saasSession, logout, firebaseUser } = useAuth();
  const { schoolProfile } = useSchool();
  const [activeTab, setActiveTab] = useState<string>(() => {
    if (activeRole === 'master_admin') return 'master_portal';
    if (activeRole === 'gatekeeper') return 'qr_attendance';
    return 'dashboard';
  });
  const [previewPublicWebsite, setPreviewPublicWebsite] = useState<boolean>(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [feesInitialSubTab, setFeesInitialSubTab] = useState<FeesSubTab>('counter');
  const [feesJumpNonce, setFeesJumpNonce] = useState<number>(0);
  const [attendanceInitialSubTab, setAttendanceInitialSubTab] = useState<AttendanceSubTab>('daily');
  const [attendanceJumpNonce, setAttendanceJumpNonce] = useState<number>(0);
  const [routineInitialMode, setRoutineInitialMode] = useState<'class' | 'teacher' | 'room'>('class');
  const [routineJumpNonce, setRoutineJumpNonce] = useState<number>(0);
  const [examsInitialSubTab, setExamsInitialSubTab] = useState<ExamSubTab>('exam_routine');
  const [examsJumpNonce, setExamsJumpNonce] = useState<number>(0);
  const [homeworkInitialSubTab, setHomeworkInitialSubTab] = useState<HomeworkSubTab>('assignments');
  const [homeworkJumpNonce, setHomeworkJumpNonce] = useState<number>(0);
  const [reportsInitialType, setReportsInitialType] = useState<ReportType>('students');
  const [reportsJumpNonce, setReportsJumpNonce] = useState<number>(0);
  const [onlinePaymentToast, setOnlinePaymentToast] = useState<{
    requests: OnlinePaymentRequest[];
    totalPending: number;
  } | null>(null);
  const [kioskScannerMode, setKioskScannerMode] = useState<'auto' | 'qr' | 'face'>(() => {
    try {
      const saved = localStorage.getItem('smart_attendance_scanner_mode_v2');
      if (saved === 'qr' || saved === 'face' || saved === 'auto') return saved;
      return 'auto';
    } catch {
      return 'auto';
    }
  });
  const [showKioskLogoutModal, setShowKioskLogoutModal] = useState(false);
  const [kioskLogoutUser, setKioskLogoutUser] = useState('');
  const [kioskLogoutPass, setKioskLogoutPass] = useState('');
  const [showKioskLogoutPass, setShowKioskLogoutPass] = useState(false);
  const [kioskLogoutError, setKioskLogoutError] = useState<string | null>(null);
  const [isVerifyingKioskLogout, setIsVerifyingKioskLogout] = useState(false);

  useEffect(() => {
    const syncMode = (e?: Event) => {
      const custom = e as CustomEvent<'auto' | 'qr' | 'face'>;
      if (custom?.detail === 'auto' || custom?.detail === 'face' || custom?.detail === 'qr') {
        setKioskScannerMode(custom.detail);
        return;
      }
      try {
        const saved = localStorage.getItem('smart_attendance_scanner_mode_v2');
        if (saved === 'qr' || saved === 'face' || saved === 'auto') {
          setKioskScannerMode(saved);
        } else {
          setKioskScannerMode('auto');
        }
      } catch {}
    };
    window.addEventListener('smart_scanner_mode_changed', syncMode);
    window.addEventListener('storage', syncMode);
    return () => {
      window.removeEventListener('smart_scanner_mode_changed', syncMode);
      window.removeEventListener('storage', syncMode);
    };
  }, []);

  // Sync initial tab when role changes (without blocking Master Admin from navigating sidebar tabs)
  const prevRoleRef = React.useRef<string>(activeRole);
  useEffect(() => {
    const roleChanged = prevRoleRef.current !== activeRole;
    prevRoleRef.current = activeRole;

    if (activeRole === 'gatekeeper' || currentUser?.permissions?.onlyQrAttendanceKiosk) {
      if (activeTab !== 'qr_attendance') {
        setActiveTab('qr_attendance');
      }
      return;
    }

    if (roleChanged) {
      if (activeRole === 'master_admin') {
        setActiveTab('master_portal');
      } else if (activeTab === 'master_portal') {
        setActiveTab('dashboard');
      }
    } else if (activeRole !== 'master_admin' && activeTab === 'master_portal') {
      setActiveTab('dashboard');
    }
  }, [activeRole, currentUser, activeTab]);

  useEffect(() => {
    if (!isAuthenticated) {
      setPreviewPublicWebsite(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }
    if ((activeRole === 'master_admin' || saasSession?.principal?.isMasterAdmin) && !saasSession?.school) {
      document.title = 'Smart School BD ERP • Master Admin Console';
      return;
    }
    const activeName = resolveSchoolDisplayName(schoolProfile, saasSession?.school, 'en');
    if (activeName && activeName !== 'Smart School BD ERP') {
      document.title = `${activeName} • Smart School BD ERP`;
    } else {
      document.title = 'Smart School BD ERP';
    }
  }, [isAuthenticated, activeRole, saasSession, schoolProfile]);

  // Listen for live real-time guardian online fee payment arrivals for Admin/Accountant
  useEffect(() => {
    const canSeeFeeNotifs =
      isAuthenticated &&
      (activeRole === 'super_admin' ||
        activeRole === 'admin' ||
        activeRole === 'accountant' ||
        activeRole === 'master_admin');

    if (!canSeeFeeNotifs) {
      setOnlinePaymentToast(null);
      return;
    }

    const handleNewOnlinePayment = (e: Event) => {
      const detail = (e as CustomEvent<{ newRequests?: OnlinePaymentRequest[]; totalPending?: number }>).detail;
      if (detail?.newRequests && detail.newRequests.length > 0) {
        setOnlinePaymentToast({
          requests: detail.newRequests,
          totalPending: detail.totalPending || detail.newRequests.length,
        });
      }
    };

    window.addEventListener('new_online_payment_notification', handleNewOnlinePayment);
    return () => window.removeEventListener('new_online_payment_notification', handleNewOnlinePayment);
  }, [isAuthenticated, activeRole]);

  // Close sidebar on tab change on mobile (supports colon deep-links like 'fees:online_approvals', 'attendance:my_attendance', etc.)
  const handleNavigate = (tab: string) => {
    const [baseTab, subTab] = tab.split(':');

    if (baseTab === 'fees') {
      if (subTab === 'online_approvals') {
        setFeesInitialSubTab('online_approvals');
        setFeesJumpNonce((n) => n + 1);
        setOnlinePaymentToast(null);
      } else {
        setFeesInitialSubTab('counter');
      }
      setActiveTab('fees');
      setSidebarOpen(false);
      return;
    }

    if (baseTab === 'attendance' && subTab) {
      setAttendanceInitialSubTab(subTab as AttendanceSubTab);
      setAttendanceJumpNonce((n) => n + 1);
      setActiveTab('attendance');
      setSidebarOpen(false);
      return;
    }

    if (baseTab === 'routine' && subTab) {
      setRoutineInitialMode(subTab as 'class' | 'teacher' | 'room');
      setRoutineJumpNonce((n) => n + 1);
      setActiveTab('routine');
      setSidebarOpen(false);
      return;
    }

    if (baseTab === 'examinations' && subTab) {
      setExamsInitialSubTab(subTab as ExamSubTab);
      setExamsJumpNonce((n) => n + 1);
      setActiveTab('examinations');
      setSidebarOpen(false);
      return;
    }

    if (baseTab === 'homework' && subTab) {
      setHomeworkInitialSubTab(subTab as HomeworkSubTab);
      setHomeworkJumpNonce((n) => n + 1);
      setActiveTab('homework');
      setSidebarOpen(false);
      return;
    }

    if (baseTab === 'reports' && subTab) {
      setReportsInitialType(subTab as ReportType);
      setReportsJumpNonce((n) => n + 1);
      setActiveTab('reports');
      setSidebarOpen(false);
      return;
    }

    setActiveTab(baseTab);
    setSidebarOpen(false);
  };

  // Public School Website Homepage with Topbar Login Modal before workspace access
  if (!isAuthenticated) {
    const wantsLogin =
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('login') === '1';
    return <PublicSchoolWebsite initialShowLoginModal={wantsLogin} />;
  }

  // Authenticated Admin/Staff Live Website Preview
  if (previewPublicWebsite) {
    return (
      <SaaSAccessGate>
        <PublicSchoolWebsite
          isAuthenticatedPreview={true}
          onBackToDashboard={() => setPreviewPublicWebsite(false)}
        />
      </SaaSAccessGate>
    );
  }

  // Dedicated Gatekeeper Kiosk mode: clean camera scanner view with zero peripheral noise
  if (activeRole === 'gatekeeper' || currentUser?.role === 'gatekeeper' || !!currentUser?.permissions?.onlyQrAttendanceKiosk) {
    const isAutoKiosk = kioskScannerMode === 'auto';
    const isFaceKiosk = !isAutoKiosk && (currentUser?.username === 'face' || kioskScannerMode === 'face');
    const hasPassword = hasPasswordProvider(firebaseUser);

    const openKioskLogoutModal = () => {
      setKioskLogoutUser('');
      setKioskLogoutPass('');
      setShowKioskLogoutPass(false);
      setKioskLogoutError(null);
      setIsVerifyingKioskLogout(false);
      setShowKioskLogoutModal(true);
    };

    const handleKioskLogoutSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (isVerifyingKioskLogout) return;
      setKioskLogoutError(null);

      const enteredUser = kioskLogoutUser.trim().toLowerCase();
      const accountEmail = (firebaseUser?.email || currentUser?.email || '').trim().toLowerCase();
      const emailLocal = accountEmail.includes('@') ? accountEmail.split('@')[0] : '';
      const accountUsername = (currentUser?.username || '').trim().toLowerCase();

      const isUserMatch =
        !!enteredUser &&
        !!accountEmail &&
        (enteredUser === accountEmail ||
          (!!emailLocal && enteredUser === emailLocal) ||
          (!!accountUsername && enteredUser === accountUsername));

      if (!isUserMatch) {
        setKioskLogoutError('ইউজারনেম বা ইমেইল সঠিক নয়। অনুগ্রহ করে সঠিক ইউজার/ইমেইল লিখুন।');
        return;
      }

      if (hasPassword && !kioskLogoutPass) {
        setKioskLogoutError('অনুগ্রহ করে পাসওয়ার্ড দিন।');
        return;
      }

      setIsVerifyingKioskLogout(true);
      try {
        if (hasPassword) {
          await reauthenticateWithCurrentPassword(kioskLogoutPass);
        } else {
          await reauthenticateWithGoogleAccount();
        }
        setShowKioskLogoutModal(false);
        setKioskLogoutUser('');
        setKioskLogoutPass('');
        await logout();
      } catch (err: any) {
        const code = err?.code || '';
        if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
          setKioskLogoutError('পাসওয়ার্ড ভুল হয়েছে! সঠিক পাসওয়ার্ড দিয়ে চেষ্টা করুন।');
        } else if (code === 'auth/too-many-requests') {
          setKioskLogoutError('অনেকবার ভুল চেষ্টা করা হয়েছে। কিছুক্ষণ পর আবার চেষ্টা করুন।');
        } else if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
          setKioskLogoutError('Google যাচাইকরণ সম্পন্ন হয়নি। আবার চেষ্টা করুন।');
        } else {
          setKioskLogoutError(err?.message || 'যাচাইকরণ ব্যর্থ হয়েছে। সঠিক তথ্য দিন।');
        }
      } finally {
        setIsVerifyingKioskLogout(false);
      }
    };

    return (
      <SaaSAccessGate>
        <div className="min-h-screen bg-slate-950 flex flex-col text-slate-100">
          <header className="h-14 px-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className={`p-1.5 rounded-lg ${isAutoKiosk ? 'bg-emerald-500/20 text-emerald-300' : isFaceKiosk ? 'bg-cyan-400/20 text-cyan-400' : 'bg-amber-400/20 text-amber-400'}`}>
                {isFaceKiosk || isAutoKiosk ? <ScanFace className="w-5 h-5" /> : <QrCode className="w-5 h-5" />}
              </div>
              <div>
                <span className="text-sm font-bold text-white tracking-wide">
                  {isAutoKiosk ? 'Auto Smart Attendance Kiosk (QR + Face)' : isFaceKiosk ? 'AI Face Attendance Kiosk' : 'Smart Gate Attendance Kiosk'}
                </span>
                <span className={`ml-2 text-xs px-2 py-0.5 rounded-full font-medium ${
                  isAutoKiosk ? 'bg-emerald-500/20 text-emerald-300' : isFaceKiosk ? 'bg-cyan-500/20 text-cyan-300' : 'bg-emerald-500/20 text-emerald-400'
                }`}>
                  {isAutoKiosk ? 'Auto QR + Face' : isFaceKiosk ? 'Face Scan Mode' : 'QR Scan Mode'}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={openKioskLogoutModal}
              className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold bg-rose-600/90 hover:bg-rose-600 text-white rounded-lg transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>লগআউট (Logout)</span>
            </button>
          </header>
          <main className="flex-1 p-2 sm:p-4 overflow-y-auto">
            <SmartQRScannerTab onAttendanceUpdated={() => {}} isGatekeeper={true} />
          </main>

          {/* Gatekeeper Kiosk Protected Logout Verification Modal */}
          {showKioskLogoutModal && (
            <div className="fixed inset-0 z-[220] flex items-center justify-center bg-slate-950/85 backdrop-blur-md p-4">
              <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-700/80 shadow-2xl overflow-hidden text-slate-100">
                <div className="px-5 py-4 bg-gradient-to-r from-rose-700 to-rose-600 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center">
                      <Lock className="w-4 h-4 text-white" />
                    </div>
                    <div>
                      <h3 className="text-sm font-black text-white">কিওস্ক লগআউট যাচাইকরণ</h3>
                      <p className="text-[11px] text-rose-100">লগআউট করতে ইউজার ও পাসওয়ার্ড দিন</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (!isVerifyingKioskLogout) {
                        setShowKioskLogoutModal(false);
                      }
                    }}
                    className="w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center text-white transition-colors"
                    aria-label="Close"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <form onSubmit={handleKioskLogoutSubmit} className="p-5 space-y-4">
                  <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-400/30 flex items-start gap-2.5 text-xs text-amber-200">
                    <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <span>
                      নিরাপত্তার জন্য শুধুমাত্র অনুমোদিত ইউজার/ইমেইল ও পাসওয়ার্ড যাচাই করেই এই কিওস্ক থেকে লগআউট করা যাবে।
                    </span>
                  </div>

                  {kioskLogoutError && (
                    <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/40 text-xs font-semibold text-rose-200">
                      {kioskLogoutError}
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-300">
                      ইউজারনেম / ইমেইল (User / Email)
                    </label>
                    <div className="relative">
                      <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={kioskLogoutUser}
                        onChange={(e) => {
                          setKioskLogoutUser(e.target.value);
                          if (kioskLogoutError) setKioskLogoutError(null);
                        }}
                        placeholder="ইউজারনেম অথবা ইমেইল লিখুন..."
                        autoComplete="off"
                        autoFocus
                        className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-rose-500"
                      />
                    </div>
                  </div>

                  {hasPassword ? (
                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-slate-300">
                        পাসওয়ার্ড (Password)
                      </label>
                      <div className="relative">
                        <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                          type={showKioskLogoutPass ? 'text' : 'password'}
                          value={kioskLogoutPass}
                          onChange={(e) => {
                            setKioskLogoutPass(e.target.value);
                            if (kioskLogoutError) setKioskLogoutError(null);
                          }}
                          placeholder="পাসওয়ার্ড লিখুন..."
                          autoComplete="new-password"
                          className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-rose-500"
                        />
                        <button
                          type="button"
                          onClick={() => setShowKioskLogoutPass((prev) => !prev)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                          tabIndex={-1}
                          aria-label={showKioskLogoutPass ? 'Hide password' : 'Show password'}
                        >
                          {showKioskLogoutPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700 text-[11px] text-slate-300">
                      এই অ্যাকাউন্টটি Google Sign-In দিয়ে চালু করা হয়েছে। ইউজার/ইমেইল মিলিয়ে নিচের বাটনে চাপ দিলে Google পপ-আপের মাধ্যমে যাচাই করে লগআউট হবে।
                    </div>
                  )}

                  <div className="flex items-center justify-end gap-2.5 pt-2">
                    <button
                      type="button"
                      disabled={isVerifyingKioskLogout}
                      onClick={() => setShowKioskLogoutModal(false)}
                      className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors disabled:opacity-50"
                    >
                      বাতিল
                    </button>
                    <button
                      type="submit"
                      disabled={isVerifyingKioskLogout}
                      className="px-4 py-2 rounded-xl text-xs font-black bg-rose-600 hover:bg-rose-500 text-white shadow-lg flex items-center gap-1.5 transition-colors disabled:opacity-60 cursor-pointer"
                    >
                      {isVerifyingKioskLogout ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>যাচাই করা হচ্ছে...</span>
                        </>
                      ) : (
                        <>
                          <LogOut className="w-3.5 h-3.5" />
                          <span>{hasPassword ? 'যাচাই ও লগআউট' : 'Google যাচাই ও লগআউট'}</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      </SaaSAccessGate>
    );
  }

  // Dedicated Student & Guardian Portal
  if (activeRole === 'student' || activeRole === 'guardian') {
    return (
      <SaaSAccessGate>
        <div className="min-h-screen bg-[#F1F5F9] flex flex-col">
          <Header
            onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
            activeTab={activeTab}
            onNavigate={handleNavigate}
          />
          <main className="flex-1 p-4 md:p-6 max-w-7xl w-full mx-auto">
            <StudentDedicatedDashboard onNavigateTab={handleNavigate} />
          </main>
        </div>
      </SaaSAccessGate>
    );
  }

  const renderActiveView = () => {
    switch (activeTab) {
      case 'master_portal':
        return <MasterAdminPortal />;
      case 'dashboard':
        return <DashboardView onNavigate={handleNavigate} />;
      case 'students':
        return <StudentsView onPrintCertificate={() => handleNavigate('certificates')} />;
      case 'staff':
        return <StaffView />;
      case 'attendance':
        return <AttendanceView initialSubTab={attendanceInitialSubTab} jumpNonce={attendanceJumpNonce} />;
      case 'qr_attendance':
        return <SmartQRScannerTab onAttendanceUpdated={() => {}} isGatekeeper={false} />;
      case 'academic':
        return <AcademicView />;
      case 'routine':
        return <RoutineView initialViewMode={routineInitialMode} jumpNonce={routineJumpNonce} />;
      case 'examinations':
        return <ExaminationsView initialSubTab={examsInitialSubTab} jumpNonce={examsJumpNonce} />;
      case 'fees':
        return <FeesView initialSubTab={feesInitialSubTab} jumpNonce={feesJumpNonce} />;
      case 'homework':
        return <HomeworkView initialSubTab={homeworkInitialSubTab} jumpNonce={homeworkJumpNonce} />;
      case 'admissions':
        return <AdmissionsView />;
      case 'library':
        return <LibraryView />;
      case 'transport':
        return <TransportView />;
      case 'inventory':
        return <InventoryView />;
      case 'certificates':
        return <CertificatesView />;
      case 'notices':
        return <NoticesView />;
      case 'blog':
        return <BlogManagementView />;
      case 'reports':
        return <ReportsView initialReportType={reportsInitialType} jumpNonce={reportsJumpNonce} />;
      case 'analytics':
        return <StudentPerformanceAnalyticsView />;
      case 'subscription_billing':
        return <SubscriptionBillingView />;
      case 'settings':
        return <SettingsView onPreviewWebsite={() => setPreviewPublicWebsite(true)} />;
      case 'support':
        return <SupportTeamView />;
      default:
        return <DashboardView onNavigate={handleNavigate} />;
    }
  };

  return (
    <SaaSAccessGate>
      <div className="flex h-screen bg-[#F1F5F9] overflow-hidden antialiased print:h-auto print:overflow-visible print:bg-white">
        {/* Sidebar Navigation */}
        <Sidebar
          activeTab={activeTab}
          setActiveTab={handleNavigate}
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden print:overflow-visible">
          <Header
            onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
            activeTab={activeTab}
            onNavigate={handleNavigate}
          />
          <main className="flex-1 overflow-y-auto p-3.5 pb-20 sm:p-5 sm:pb-16 lg:p-6 lg:pb-16 print:overflow-visible print:p-0">
            <div className="max-w-7xl mx-auto space-y-6 print:max-w-none">
              {renderActiveView()}
            </div>
          </main>
        </div>

        {/* Real-time Floating Toast Notification for New Guardian Online Payments */}
        {onlinePaymentToast && onlinePaymentToast.requests.length > 0 && (
          <div className="fixed bottom-5 right-5 z-[180] w-80 sm:w-96 bg-white rounded-2xl shadow-2xl border-2 border-amber-400 overflow-hidden text-xs print:hidden">
            <div className="px-4 py-2.5 bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 text-white flex items-center justify-between">
              <div className="flex items-center space-x-2 font-black">
                <Bell className="w-4 h-4 animate-bounce" />
                <span>নতুন অনলাইন ফি পেমেন্ট এসেছে!</span>
              </div>
              <button
                type="button"
                onClick={() => setOnlinePaymentToast(null)}
                className="p-0.5 rounded hover:bg-white/20 text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-3.5 space-y-2">
              {onlinePaymentToast.requests.slice(0, 2).map((req) => (
                <div key={req.id} className="p-2.5 rounded-xl bg-amber-50 border border-amber-200">
                  <div className="flex items-center justify-between font-bold text-slate-900">
                    <span className="truncate">{req.studentName}</span>
                    <span className="text-emerald-700 font-black">৳{req.amount}</span>
                  </div>
                  <div className="text-[11px] text-slate-600 mt-0.5 flex items-center justify-between">
                    <span>
                      {req.paymentMethod === 'bKash'
                        ? 'বিকাশ'
                        : req.paymentMethod === 'Rocket'
                        ? 'রকেট'
                        : 'নগদ'}{' '}
                      • {req.className}
                    </span>
                    <span className="font-mono font-bold text-indigo-700">
                      TrxID: {req.transactionId}
                    </span>
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={() => handleNavigate('fees:online_approvals')}
                className="w-full py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold flex items-center justify-center space-x-1.5 transition-colors shadow-xs"
              >
                <Smartphone className="w-3.5 h-3.5" />
                <span>অনলাইন ফি অনুমোদন পাতায় দেখুন ({onlinePaymentToast.totalPending})</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </SaaSAccessGate>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <LanguageProvider>
        <SchoolProvider>
          <AuthProvider>
            <AppContent />
          </AuthProvider>
        </SchoolProvider>
      </LanguageProvider>
    </ErrorBoundary>
  );
}
