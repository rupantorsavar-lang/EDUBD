import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  resetFirebasePassword,
  isEmbeddedIframe,
  isMobileBrowser,
} from '../../services/firebase';
import { SaaSApi, isSaaSBackendUnavailableError } from '../../services/saasApi';
import { validateLoginIdentifier } from '../../utils/loginIdentifier';
import { formatFirebaseAuthErrorMessage } from '../../utils/firebaseAuthErrors';
import campusBackdropImg from '../../assets/images/smart_school_campus_1794653963006.jpg';
import firebaseConfig from '../../../firebase-applet-config.json';
import {
  User,
  Lock,
  Eye,
  EyeOff,
  LogIn,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  ArrowLeft,
  Mail,
  ExternalLink,
  Copy,
  Check,
  X,
} from 'lucide-react';

interface HeroLoginViewProps {
  isModal?: boolean;
  onClose?: () => void;
  schoolName?: string;
  schoolLogoUrl?: string;
}

const REMEMBERED_EMAIL_KEY = 'smartschool_remembered_email';

const GraduationBookEmblem: React.FC<{ className?: string }> = ({ className = 'w-28 h-20' }) => (
  <svg
    viewBox="0 0 180 120"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden="true"
  >
    {/* Mortarboard cap */}
    <path d="M90 8L32 34L90 58L148 34L90 8Z" fill="#0B47B8" />
    <path
      d="M52 44V62C52 68.5 69 75 90 75C111 75 128 68.5 128 62V44L90 59.5L52 44Z"
      fill="#0B2D7A"
    />
    {/* Left cord */}
    <path d="M44 39V63" stroke="#1D63ED" strokeWidth="3.5" strokeLinecap="round" />
    <circle cx="44" cy="66" r="3.5" fill="#1D63ED" />
    {/* Right gold tassel */}
    <path d="M134 38V68" stroke="#F59E0B" strokeWidth="4" strokeLinecap="round" />
    <path d="M128 69C128 65 140 65 140 69L143 87H125L128 69Z" fill="#F59E0B" />
    {/* Open book inner amber pages */}
    <path
      d="M88 99C73 86 50 82 28 86L34 73C56 71 75 78 88 92V99Z"
      fill="#F59E0B"
    />
    <path
      d="M92 99C107 86 130 82 152 86L146 73C124 71 105 78 92 92V99Z"
      fill="#F59E0B"
    />
    {/* Open book outer blue pages */}
    <path
      d="M88 108C71 95 44 93 18 98L24 89C48 85 72 89 88 102V108Z"
      fill="#0B47B8"
    />
    <path
      d="M92 108C109 95 136 93 162 98L156 89C132 85 108 89 92 102V108Z"
      fill="#0B2D7A"
    />
  </svg>
);

const SchoolBadgeIcon: React.FC<{ className?: string }> = ({ className = 'w-11 h-11' }) => (
  <svg
    viewBox="0 0 64 64"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden="true"
  >
    {/* Flagpole & Flag */}
    <path d="M32 6V16" stroke="white" strokeWidth="2.4" strokeLinecap="round" />
    <path d="M32 7H43L40.5 10.5L43 14H32V7Z" fill="white" />
    {/* Central Roof Pediment */}
    <path d="M21 24L32 15L43 24H21Z" fill="white" />
    {/* Left & Right Wings */}
    <rect x="10" y="29" width="11" height="23" rx="1" fill="white" />
    <rect x="43" y="29" width="11" height="23" rx="1" fill="white" />
    {/* Central Building Body */}
    <rect x="21" y="24" width="22" height="28" fill="white" />
    {/* Clock */}
    <circle cx="32" cy="30" r="3" fill="#0A58DF" />
    {/* Windows Left */}
    <rect x="13" y="33" width="2.4" height="3.5" rx="0.4" fill="#0A58DF" />
    <rect x="16.8" y="33" width="2.4" height="3.5" rx="0.4" fill="#0A58DF" />
    <rect x="13" y="39" width="2.4" height="3.5" rx="0.4" fill="#0A58DF" />
    <rect x="16.8" y="39" width="2.4" height="3.5" rx="0.4" fill="#0A58DF" />
    {/* Windows Right */}
    <rect x="44.8" y="33" width="2.4" height="3.5" rx="0.4" fill="#0A58DF" />
    <rect x="48.6" y="33" width="2.4" height="3.5" rx="0.4" fill="#0A58DF" />
    <rect x="44.8" y="39" width="2.4" height="3.5" rx="0.4" fill="#0A58DF" />
    <rect x="48.6" y="39" width="2.4" height="3.5" rx="0.4" fill="#0A58DF" />
    {/* Center Door */}
    <path d="M28.5 52V41C28.5 39.1 30.1 37.5 32 37.5C33.9 37.5 35.5 39.1 35.5 41V52H28.5Z" fill="#0A58DF" />
    {/* Base */}
    <rect x="7" y="52" width="50" height="2.6" rx="1.3" fill="white" />
  </svg>
);

export const HeroLoginView: React.FC<HeroLoginViewProps> = ({
  isModal = false,
  onClose,
  schoolName,
  schoolLogoUrl,
}) => {
  const {
    loginWithCredentials,
    loginWithGooglePopup,
    loginWithGoogleRedirectFallback,
    redirectAuthError,
    clearRedirectAuthError,
    systemAccessControl,
  } = useAuth();

  const [username, setUsername] = useState<string>(() => {
    try {
      return localStorage.getItem(REMEMBERED_EMAIL_KEY) || '';
    } catch {
      return '';
    }
  });
  const [password, setPassword] = useState<string>('');
  const [rememberMe, setRememberMe] = useState<boolean>(() => {
    try {
      return Boolean(localStorage.getItem(REMEMBERED_EMAIL_KEY));
    } catch {
      return false;
    }
  });
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [needsStandaloneTab, setNeedsStandaloneTab] = useState<boolean>(false);
  const [canUseRedirect, setCanUseRedirect] = useState<boolean>(false);
  const [isAccessBlocked, setIsAccessBlocked] = useState<boolean>(false);
  const [blockedReason, setBlockedReason] = useState<string>('');
  const [copiedDomain, setCopiedDomain] = useState<boolean>(false);
  const inIframeMobile = isEmbeddedIframe() && isMobileBrowser();
  const standaloneUrl = typeof window !== 'undefined' ? window.location.href : '#';
  const currentHost = typeof window !== 'undefined' ? window.location.hostname : '';
  const activeAuthError = errorMessage || redirectAuthError || '';
  const isUnauthorizedDomainError =
    !isAccessBlocked &&
    Boolean(currentHost) &&
    (activeAuthError.includes('Authorized domains') || activeAuthError.includes('unauthorized-domain'));
  const firebaseAuthSettingsUrl = `https://console.firebase.google.com/project/${firebaseConfig.projectId}/authentication/settings`;

  const handleCopyHost = async () => {
    if (!currentHost) return;
    try {
      await navigator.clipboard.writeText(currentHost);
      setCopiedDomain(true);
      setTimeout(() => setCopiedDomain(false), 2500);
    } catch {
      // Fallback ignored if clipboard unavailable
    }
  };

  // Inline Forgot Password view state
  const [showResetView, setShowResetView] = useState<boolean>(false);
  const [resetEmail, setResetEmail] = useState<string>('');
  const [resetStatus, setResetStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isResetting, setIsResetting] = useState<boolean>(false);

  useEffect(() => {
    if (!isModal) {
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
  }, [isModal]);

  const persistRememberedEmail = (emailValue: string, shouldRemember: boolean) => {
    try {
      if (shouldRemember && emailValue.trim()) {
        localStorage.setItem(REMEMBERED_EMAIL_KEY, emailValue.trim());
      } else {
        localStorage.removeItem(REMEMBERED_EMAIL_KEY);
      }
    } catch {
      // Ignore storage failures in restricted contexts
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedUser = username.trim();
    if (!trimmedUser || !password.trim()) {
      setErrorMessage('Please enter your email, mobile number, or username and password.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    clearRedirectAuthError();
    setNeedsStandaloneTab(false);
    setCanUseRedirect(false);
    setIsAccessBlocked(false);
    setBlockedReason('');

    try {
      persistRememberedEmail(trimmedUser, rememberMe);
      const result = await loginWithCredentials(trimmedUser, password);
      setIsLoading(false);

      if (!result.success) {
        if (result.errorType === 'SYSTEM_LOCKED' || result.errorType === 'ROLE_DISABLED') {
          setIsAccessBlocked(true);
          setBlockedReason(result.errorMessage || systemAccessControl.disabledMessage);
        } else {
          setErrorMessage(
            result.errorMessage || 'Invalid username/email or password. Please try again.'
          );
        }
      } else {
        setPassword('');
        setErrorMessage(null);
      }
    } catch (err: any) {
      setIsLoading(false);
      setErrorMessage(err?.message || 'Unable to verify credentials. Please try again.');
    }
  };

  const handleGoogleSignIn = async () => {
    setIsGoogleLoading(true);
    setErrorMessage(null);
    clearRedirectAuthError();
    setNeedsStandaloneTab(false);
    setCanUseRedirect(false);
    setIsAccessBlocked(false);
    setBlockedReason('');

    try {
      const result = await loginWithGooglePopup();
      setIsGoogleLoading(false);
      if (!result.success) {
        setNeedsStandaloneTab(Boolean(result.needsStandaloneTab));
        setCanUseRedirect(Boolean(result.canUseRedirect));
        if (result.errorType === 'SYSTEM_LOCKED' || result.errorType === 'ROLE_DISABLED') {
          setIsAccessBlocked(true);
          setBlockedReason(result.errorMessage || systemAccessControl.disabledMessage);
        } else {
          setErrorMessage(result.errorMessage || 'Google sign-in failed. Please try again.');
        }
      }
    } catch (err: any) {
      setIsGoogleLoading(false);
      setErrorMessage(err?.message || 'Google sign-in failed. Please try again.');
    }
  };

  const handleGoogleRedirectSignIn = async () => {
    setIsGoogleLoading(true);
    setErrorMessage(null);
    clearRedirectAuthError();
    const result = await loginWithGoogleRedirectFallback();
    if (!result.success) {
      setIsGoogleLoading(false);
      setErrorMessage(result.errorMessage || 'Google redirect sign-in failed.');
    }
  };

  const handlePasswordResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetInput = resetEmail.trim();
    const parsed = validateLoginIdentifier(targetInput);
    if (!parsed.valid) {
      setResetStatus({
        type: 'error',
        text: parsed.error || 'Please enter a valid email address, mobile number, or username.',
      });
      return;
    }

    setIsResetting(true);
    setResetStatus(null);
    try {
      let emailToReset = parsed.kind === 'email' ? parsed.displayValue : '';
      if (!emailToReset) {
        const resolved = await SaaSApi.resolveLoginIdentifier(targetInput);
        if (resolved.isSyntheticEmail) {
          setIsResetting(false);
          setResetStatus({
            type: 'error',
            text: 'This account uses a Mobile/Username login without a personal email inbox. Please contact your School Admin to reset your password.',
          });
          return;
        }
        emailToReset = resolved.resolvedEmail;
      }

      await resetFirebasePassword(emailToReset);
      setIsResetting(false);
      setResetStatus({
        type: 'success',
        text: 'Password reset link sent. Check your inbox (or spam folder), or contact your School Admin.',
      });
    } catch (err: any) {
      setIsResetting(false);
      const fallbackMsg = isSaaSBackendUnavailableError(err)
        ? 'Username/mobile lookup requires server connection. Enter your registered @ email or contact your School Admin.'
        : err?.code === 'USER_NOT_FOUND'
        ? 'No account matched this username or mobile number.'
        : formatFirebaseAuthErrorMessage({
            code: err?.code,
            rawMessage: err?.message,
            flow: 'password-reset',
            isOffline: typeof navigator !== 'undefined' && navigator.onLine === false,
          }).message;
      setResetStatus({
        type: 'error',
        text: fallbackMsg,
      });
    }
  };

  const openResetView = () => {
    setResetEmail(username.trim());
    setResetStatus(null);
    setShowResetView(true);
  };

  return (
    <div
      className={
        isModal
          ? 'w-full max-w-[445px] mx-auto relative'
          : 'relative min-h-screen w-full overflow-x-hidden flex flex-col justify-center bg-sky-100'
      }
    >
      {!isModal && (
        <div className="fixed inset-0 z-0 pointer-events-none select-none">
          <img
            src={campusBackdropImg}
            alt="Smart School Campus"
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover object-center"
          />
          <div
            className="absolute inset-0 bg-gradient-to-b from-sky-50/90 via-sky-100/35 to-slate-900/15 lg:bg-gradient-to-r lg:from-sky-50/75 lg:via-sky-100/20 lg:to-sky-900/10"
            aria-hidden="true"
          />
        </div>
      )}

      <main
        className={
          isModal
            ? 'relative z-10 w-full'
            : 'relative z-10 w-full max-w-[1340px] mx-auto px-4 sm:px-8 lg:px-12 py-6 sm:py-8 lg:py-10'
        }
      >
        <div
          className={
            isModal
              ? 'w-full'
              : 'grid grid-cols-1 lg:grid-cols-12 items-center gap-6 sm:gap-8 lg:gap-10'
          }
        >
          {!isModal && (
            <div className="lg:col-span-7 flex flex-col items-center text-center lg:pb-44 pt-1 sm:pt-2">
              <div className="px-4 py-2 sm:px-6 sm:py-3 rounded-3xl bg-white/45 lg:bg-transparent backdrop-blur-[2px] lg:backdrop-blur-none">
                <GraduationBookEmblem className="w-24 h-16 sm:w-32 sm:h-22 lg:w-36 lg:h-24 mx-auto drop-shadow-xs" />

                <h1 className="mt-1 text-3xl sm:text-5xl xl:text-[56px] font-extrabold tracking-tight leading-none drop-shadow-[0_1px_10px_rgba(255,255,255,0.85)]">
                  <span className="text-[#0A58DF]">Smart</span>{' '}
                  <span className="text-[#0B245B]">School</span>
                </h1>

                <p className="mt-1 sm:mt-1.5 text-xl sm:text-3xl xl:text-[36px] font-extrabold tracking-tight text-[#0B245B] leading-tight drop-shadow-[0_1px_10px_rgba(255,255,255,0.85)]">
                  Management System
                </p>

                <p className="mt-1.5 sm:mt-2.5 text-sm sm:text-lg xl:text-xl italic font-semibold text-[#0A58DF] tracking-wide drop-shadow-[0_1px_8px_rgba(255,255,255,0.9)]">
                  Learn &nbsp;•&nbsp; Manage &nbsp;•&nbsp; Grow
                </p>
              </div>
            </div>
          )}

          {/* Login Card Column */}
          <div className={isModal ? 'w-full' : 'lg:col-span-5 flex justify-center lg:justify-end w-full'}>
            <section
              aria-label="Account Login"
              className="relative w-full max-w-[445px] bg-white rounded-[26px] shadow-[0_24px_64px_-12px_rgba(11,36,91,0.30)] border border-slate-100 px-5 py-7 sm:px-8 sm:py-8"
            >
              {isModal && onClose && (
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close login dialog"
                  className="absolute top-4 right-4 w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              )}

              {/* Circular Blue School Icon / Logo */}
              <div className="w-18 h-18 sm:w-20 sm:h-20 rounded-full bg-gradient-to-b from-[#0D5CEB] to-[#0844BA] mx-auto flex items-center justify-center shadow-lg shadow-blue-700/25 overflow-hidden">
                {isModal && schoolLogoUrl ? (
                  <img
                    src={schoolLogoUrl}
                    alt={schoolName || 'School Logo'}
                    className="w-full h-full object-contain bg-white p-2"
                  />
                ) : (
                  <SchoolBadgeIcon className="w-10 h-10 sm:w-11 sm:h-11" />
                )}
              </div>

              {/* Card Title & Subtitle */}
              <div className="text-center mt-4">
                <h2 className="text-xl sm:text-[22px] font-extrabold text-[#0B245B] tracking-tight leading-snug">
                  {schoolName || 'School Management System'}
                </h2>
                <p className="text-xs sm:text-sm text-slate-600 mt-1 font-medium">
                  {showResetView
                    ? 'Reset your account password'
                    : 'Login for Admin, Teachers, Students & Parents'}
                </p>
              </div>

              {/* Horizontal Blue Divider */}
              <div className="h-[1.5px] w-full bg-[#1D63ED] my-5 rounded-full opacity-85" />

              {/* System Maintenance Alert */}
              {systemAccessControl.isSystemLocked && (
                <div
                  role="alert"
                  className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2.5"
                >
                  <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold">System Maintenance Active</p>
                    <p className="mt-0.5">{systemAccessControl.disabledMessage}</p>
                  </div>
                </div>
              )}

              {/* Role Blocked or Auth Error Alert */}
              {(isAccessBlocked || errorMessage || redirectAuthError) && !showResetView && (
                <div
                  role="alert"
                  className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs space-y-2.5"
                >
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    <span className="leading-relaxed">
                      {isAccessBlocked ? blockedReason : errorMessage || redirectAuthError}
                    </span>
                  </div>

                  {isUnauthorizedDomainError && (
                    <div className="pt-1 space-y-2 border-t border-rose-200/80">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={handleCopyHost}
                          className="flex-1 py-2 px-3 rounded-lg bg-white hover:bg-rose-100/70 text-rose-900 border border-rose-300 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                        >
                          {copiedDomain ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                              <span>কপি হয়েছে ({currentHost.slice(0, 18)}...)</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              <span>ডোমেইন কপি করুন (Copy Domain)</span>
                            </>
                          )}
                        </button>
                        <a
                          href={firebaseAuthSettingsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="py-2 px-3 rounded-lg bg-[#0A58DF] hover:bg-[#0844BA] text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs transition-colors"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span>Firebase Console</span>
                        </a>
                      </div>
                      <p className="text-[11px] text-rose-700 leading-snug">
                        টিপস: আপনি চাইলে উপরের ফর্মে <strong>Email Address ও Password</strong> দিয়ে এখনই লগইন করতে পারেন।
                      </p>
                    </div>
                  )}

                  {needsStandaloneTab && (
                    <a
                      href={standaloneUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full py-2 px-3 rounded-lg bg-[#0A58DF] hover:bg-[#0844BA] text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs transition-colors"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>নতুন ট্যাবে খুলে Google Login করুন (Open in New Tab)</span>
                    </a>
                  )}

                  {canUseRedirect && !needsStandaloneTab && (
                    <button
                      type="button"
                      onClick={handleGoogleRedirectSignIn}
                      disabled={isGoogleLoading}
                      className="w-full py-2 px-3 rounded-lg bg-[#0A58DF] hover:bg-[#0844BA] text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs transition-colors cursor-pointer disabled:opacity-60"
                    >
                      <span>Redirect পদ্ধতিতে Google Login করুন</span>
                    </button>
                  )}
                </div>
              )}

              {showResetView ? (
                /* Inline Password Reset Form */
                <form onSubmit={handlePasswordResetSubmit} className="space-y-4">
                  {resetStatus && (
                    <div
                      role="status"
                      className={`p-3 rounded-xl border text-xs flex items-start gap-2.5 ${
                        resetStatus.type === 'success'
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                          : 'bg-rose-50 border-rose-200 text-rose-800'
                      }`}
                    >
                      {resetStatus.type === 'success' ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                      )}
                      <span className="leading-relaxed">{resetStatus.text}</span>
                    </div>
                  )}

                  <div className="flex items-center h-12 rounded-xl border border-slate-300 bg-white px-3.5 focus-within:border-[#0A58DF] focus-within:ring-2 focus-within:ring-[#0A58DF]/15 transition-all">
                    <Mail className="w-5 h-5 text-[#0A58DF] shrink-0 mr-3" />
                    <input
                      type="text"
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      placeholder="Email, Mobile Number, or Username"
                      aria-label="Registered Email, Mobile Number, or Username"
                      autoComplete="username"
                      className="w-full h-full bg-transparent text-slate-800 placeholder:text-slate-400 text-sm sm:text-[15px] focus:outline-none"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isResetting}
                    className="w-full h-12 rounded-xl bg-gradient-to-b from-[#0D5CEB] to-[#0844BA] hover:from-[#0A52D4] hover:to-[#073BA3] active:scale-[0.99] text-white font-bold text-sm sm:text-base shadow-md shadow-blue-700/25 flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-60"
                  >
                    {isResetting ? (
                      <>
                        <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>Sending Reset Link...</span>
                      </>
                    ) : (
                      <span>Send Password Reset Link</span>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowResetView(false)}
                    className="w-full h-11 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>Back to Login</span>
                  </button>
                </form>
              ) : (
                /* Primary Login Form */
                <form onSubmit={handleLoginSubmit} className="space-y-4">
                  {/* Username / Email Input */}
                  <div className="flex items-center h-12 rounded-xl border border-slate-300 bg-white px-3.5 focus-within:border-[#0A58DF] focus-within:ring-2 focus-within:ring-[#0A58DF]/15 transition-all">
                    <User className="w-5 h-5 text-[#0A58DF] shrink-0 mr-3" />
                    <input
                      type="text"
                      inputMode="text"
                      autoComplete="username"
                      value={username}
                      onChange={(e) => {
                        setUsername(e.target.value);
                        if (errorMessage) setErrorMessage(null);
                      }}
                      placeholder="Email, Mobile Number, or Username"
                      aria-label="Email, Mobile Number, or Username"
                      className="w-full h-full bg-transparent text-slate-800 placeholder:text-slate-400 text-sm sm:text-[15px] focus:outline-none"
                    />
                  </div>

                  {/* Password Input */}
                  <div className="flex items-center h-12 rounded-xl border border-slate-300 bg-white px-3.5 focus-within:border-[#0A58DF] focus-within:ring-2 focus-within:ring-[#0A58DF]/15 transition-all">
                    <Lock className="w-5 h-5 text-[#0A58DF] shrink-0 mr-3" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (errorMessage) setErrorMessage(null);
                      }}
                      placeholder="Password"
                      aria-label="Password"
                      className="w-full h-full bg-transparent text-slate-800 placeholder:text-slate-400 text-sm sm:text-[15px] focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      className="w-9 h-9 -mr-1.5 flex items-center justify-center rounded-lg text-slate-500 hover:text-[#0A58DF] transition-colors cursor-pointer shrink-0"
                    >
                      {showPassword ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
                    </button>
                  </div>

                  {/* Primary Login Button */}
                  <button
                    type="submit"
                    disabled={isLoading || isGoogleLoading}
                    className="w-full h-12 rounded-xl bg-gradient-to-b from-[#0D5CEB] to-[#0844BA] hover:from-[#0A52D4] hover:to-[#073BA3] active:scale-[0.99] text-white font-bold text-base shadow-md shadow-blue-700/25 flex items-center justify-center gap-2.5 transition-all cursor-pointer disabled:opacity-60"
                  >
                    {isLoading ? (
                      <>
                        <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>Signing in...</span>
                      </>
                    ) : (
                      <>
                        <LogIn className="w-5 h-5" />
                        <span>Login</span>
                      </>
                    )}
                  </button>

                  {/* Secondary Google Sign-In for Admin / Master Admin */}
                  <button
                    type="button"
                    onClick={handleGoogleSignIn}
                    disabled={isLoading || isGoogleLoading}
                    className="w-full h-11 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-sm flex items-center justify-center gap-2.5 transition-colors cursor-pointer disabled:opacity-60"
                  >
                    {isGoogleLoading ? (
                      <span className="w-4 h-4 border-2 border-[#0A58DF] border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                        <path
                          fill="#4285F4"
                          d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                        />
                        <path
                          fill="#34A853"
                          d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
                        />
                        <path
                          fill="#FBBC05"
                          d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
                        />
                        <path
                          fill="#EA4335"
                          d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
                        />
                      </svg>
                    )}
                    <span>Sign in with Google</span>
                  </button>

                  {inIframeMobile && (
                    <div className="text-center">
                      <a
                        href={standaloneUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#0A58DF] hover:underline"
                      >
                        <ExternalLink className="w-3 h-3" />
                        <span>মোবাইলে Google Login-এ পপ-আপ সমস্যা হলে নতুন ট্যাবে খুলুন</span>
                      </a>
                    </div>
                  )}

                  {/* Remember Me & Forgot Password */}
                  <div className="flex items-center justify-between pt-1 text-xs sm:text-sm">
                    <label className="inline-flex items-center gap-2 text-slate-700 font-medium cursor-pointer select-none min-h-9">
                      <input
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setRememberMe(checked);
                          if (!checked) {
                            persistRememberedEmail('', false);
                          }
                        }}
                        className="w-4 h-4 rounded border-slate-300 text-[#0A58DF] focus:ring-[#0A58DF] cursor-pointer"
                      />
                      <span>Remember Me</span>
                    </label>

                    <button
                      type="button"
                      onClick={openResetView}
                      className="text-[#0A58DF] hover:text-[#0844BA] hover:underline font-semibold min-h-9 px-1 cursor-pointer"
                    >
                      Forgot Password?
                    </button>
                  </div>
                </form>
              )}

              {/* Card Footer */}
              <div className="mt-5 pt-4 border-t border-slate-200 text-center text-xs sm:text-sm text-slate-600">
                Powered by <span className="font-bold text-[#0A58DF]">Smart School BD</span>
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
};
