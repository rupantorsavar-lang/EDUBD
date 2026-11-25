import React, { useEffect, useRef, useState } from 'react';
import {
  Lock,
  ShieldCheck,
  KeyRound,
  Eye,
  EyeOff,
  X,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Shield,
  Unlock,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { StorageService } from '../../services/storage';
import {
  hasPasswordProvider,
  reauthenticateWithCurrentPassword,
  reauthenticateWithGoogleAccount,
} from '../../services/firebase';
import { TransactionAuthMethod, TransactionSecurityConfig } from '../../types';
import {
  buildTransactionPinUpdate,
  getPrimaryUserUnlockKey,
  getRemainingCooldownSeconds,
  hasConfiguredTransactionPin,
  isTransactionSessionUnlocked,
  lockTransactionSession,
  markTransactionSessionUnlocked,
  verifyAccountOwnerIdentity,
  verifyTransactionSecret,
} from '../../utils/transactionAuth';

export interface TransactionAuthActionInfo {
  titleBn: string;
  titleEn: string;
  summaryBn?: string;
  summaryEn?: string;
  amountLabel?: string;
  tone?: 'emerald' | 'rose' | 'blue' | 'amber';
}

export interface TransactionAuthStamp {
  authVerifiedAt?: string;
  authMethod?: TransactionAuthMethod;
}

interface TransactionPasswordModalProps {
  isOpen: boolean;
  actionInfo: TransactionAuthActionInfo | null;
  language: 'bn' | 'en';
  onAuthorized: (method: TransactionAuthMethod) => void;
  onCancel: () => void;
  onOpenSecuritySettings?: () => void;
}

export const TransactionPasswordModal: React.FC<TransactionPasswordModalProps> = ({
  isOpen,
  actionInfo,
  language,
  onAuthorized,
  onCancel,
  onOpenSecuritySettings,
}) => {
  const { currentUser, activeRole } = useAuth();
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [cooldownSec, setCooldownSec] = useState(0);
  const [setupPin, setSetupPin] = useState('');
  const [setupConfirmPin, setSetupConfirmPin] = useState('');
  const [showSetupPin, setShowSetupPin] = useState(false);
  const [showFirstTimeSetup, setShowFirstTimeSetup] = useState(false);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const setupInputRef = useRef<HTMLInputElement | null>(null);

  const staffList = StorageService.getStaff();
  const config = StorageService.getTransactionSecurityConfig();
  const userHasTxPin = hasConfiguredTransactionPin(currentUser, staffList, config);

  useEffect(() => {
    if (!isOpen) return;
    const latestStaff = StorageService.getStaff();
    const latestConfig = StorageService.getTransactionSecurityConfig();
    const configured = hasConfiguredTransactionPin(currentUser, latestStaff, latestConfig);

    setPin('');
    setShowPin(false);
    setVerifying(false);
    setErrorMsg('');
    setShowFirstTimeSetup(!configured);
    setSetupPin('');
    setSetupConfirmPin('');
    setShowSetupPin(false);
    setCooldownSec(getRemainingCooldownSeconds());

    setTimeout(() => {
      if (configured) {
        inputRef.current?.focus();
      } else {
        setupInputRef.current?.focus();
      }
    }, 60);
  }, [isOpen, currentUser?.id, currentUser?.email]);

  useEffect(() => {
    if (!isOpen || cooldownSec <= 0) return;
    const t = setInterval(() => {
      const rem = getRemainingCooldownSeconds();
      setCooldownSec(rem);
      if (rem <= 0) {
        setErrorMsg('');
      }
    }, 1000);
    return () => clearInterval(t);
  }, [isOpen, cooldownSec]);

  if (!isOpen || !actionInfo) return null;

  const toneClasses =
    actionInfo.tone === 'rose'
      ? 'bg-rose-50 border-rose-200 text-rose-900'
      : actionInfo.tone === 'amber'
      ? 'bg-amber-50 border-amber-200 text-amber-900'
      : actionInfo.tone === 'blue'
      ? 'bg-blue-50 border-blue-200 text-blue-900'
      : 'bg-emerald-50 border-emerald-200 text-emerald-900';

  const handleSubmitPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (verifying) return;
    setErrorMsg('');

    const rem = getRemainingCooldownSeconds();
    if (rem > 0) {
      setCooldownSec(rem);
      setErrorMsg(
        language === 'bn'
          ? `একাধিক ভুল পিন দেওয়ায় ${rem} সেকেন্ড অপেক্ষা করুন।`
          : `Too many failed attempts. Wait ${rem} seconds.`
      );
      return;
    }

    if (!pin.trim()) {
      setErrorMsg(
        language === 'bn'
          ? 'লেনদেন সম্পন্ন করতে আপনার ব্যক্তিগত ট্রানজেকশন পিন দিন।'
          : 'Please enter your personal Transaction PIN to authorize this transaction.'
      );
      return;
    }

    setVerifying(true);
    try {
      const result = await verifyTransactionSecret({
        password: pin,
        user: currentUser,
        staffList: StorageService.getStaff(),
        config: StorageService.getTransactionSecurityConfig(),
      });

      if (result.valid) {
        onAuthorized('transaction_pin');
        return;
      }

      if (result.reason === 'NEEDS_PIN_SETUP') {
        setShowFirstTimeSetup(true);
        setErrorMsg('');
        return;
      }

      if (result.reason === 'COOLDOWN' && result.cooldownSeconds) {
        setCooldownSec(result.cooldownSeconds);
        setErrorMsg(
          language === 'bn'
            ? `৫ বার ভুল পিন দেওয়ায় নিরাপত্তা লক চালু হয়েছে। ${result.cooldownSeconds} সেকেন্ড পর আবার চেষ্টা করুন।`
            : `Locked for ${result.cooldownSeconds}s due to repeated wrong PIN attempts.`
        );
        return;
      }

      setErrorMsg(
        language === 'bn'
          ? 'ট্রানজেকশন পিন সঠিক নয়! লগইন পাসওয়ার্ড নয়, আপনার ব্যক্তিগত ট্রানজেকশন পিন দিন।'
          : 'Incorrect Transaction PIN! Only your personal Transaction PIN is accepted (not login password).'
      );
    } finally {
      setVerifying(false);
    }
  };

  const handleSetFirstTransactionPin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    const cleanPin = setupPin.trim();
    if (cleanPin.length < 4) {
      setErrorMsg(
        language === 'bn'
          ? 'ট্রানজেকশন পিন কমপক্ষে ৪ অক্ষর বা সংখ্যার হতে হবে।'
          : 'Transaction PIN must be at least 4 characters or digits.'
      );
      return;
    }
    if (cleanPin !== setupConfirmPin.trim()) {
      setErrorMsg(
        language === 'bn'
          ? 'নতুন পিন এবং কনফার্ম পিন মিলছে না।'
          : 'PIN and Confirm PIN do not match.'
      );
      return;
    }
    setVerifying(true);
    try {
      const latestConfig = StorageService.getTransactionSecurityConfig();
      const latestStaff = StorageService.getStaff();
      const { nextConfig, updatedStaff } = await buildTransactionPinUpdate(
        currentUser,
        cleanPin,
        latestStaff,
        latestConfig
      );
      StorageService.saveTransactionSecurityConfig(nextConfig);
      if (updatedStaff) {
        StorageService.updateStaff(updatedStaff);
      }
      onAuthorized('transaction_pin');
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-4 bg-slate-900/70 backdrop-blur-xs">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden text-xs animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-extrabold truncate">
                {showFirstTimeSetup
                  ? language === 'bn'
                    ? 'ব্যক্তিগত ট্রানজেকশন পিন সেট করুন'
                    : 'Set Personal Transaction PIN'
                  : language === 'bn'
                  ? 'ট্রানজেকশন পিন যাচাইকরণ'
                  : 'Transaction PIN Required'}
              </h3>
              <p className="text-[10px] text-slate-300 truncate">
                {language === 'bn'
                  ? 'সকল লেনদেন ও ইনভয়েস শুধুমাত্র ব্যক্তিগত পিন দিয়ে সম্পন্ন হবে'
                  : 'All financial transactions require your private Transaction PIN'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Action Summary */}
          <div className={`p-3.5 rounded-xl border ${toneClasses}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="font-extrabold text-xs">
                {language === 'bn' ? actionInfo.titleBn : actionInfo.titleEn}
              </span>
              {actionInfo.amountLabel && (
                <span className="px-2 py-0.5 rounded-lg bg-white/90 font-black text-xs tabular-nums border border-current/20">
                  {actionInfo.amountLabel}
                </span>
              )}
            </div>
            {(actionInfo.summaryBn || actionInfo.summaryEn) && (
              <p className="text-[11px] mt-1 opacity-90">
                {language === 'bn' ? actionInfo.summaryBn : actionInfo.summaryEn}
              </p>
            )}
          </div>

          {/* Logged-in User Chip */}
          <div className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[10px] text-slate-500">
                {language === 'bn' ? 'অনুমোদনকারী ইউজার:' : 'Authorizing User:'}
              </div>
              <div className="font-bold text-slate-900 truncate">
                {currentUser.nameBn || currentUser.name}{' '}
                <span className="text-[10px] font-semibold text-indigo-700">({activeRole})</span>
              </div>
              {currentUser.email && (
                <div className="text-[10px] font-mono text-slate-500 truncate">{currentUser.email}</div>
              )}
            </div>
            <Lock className="w-4 h-4 text-slate-400 shrink-0" />
          </div>

          {/* PIN Verification Form vs First-Time Personal PIN Setup */}
          {!showFirstTimeSetup && userHasTxPin ? (
            <form onSubmit={handleSubmitPin} className="space-y-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1.5">
                  {language === 'bn' ? 'আপনার ব্যক্তিগত ট্রানজেকশন পিন দিন *' : 'Enter Your Transaction PIN *'}
                </label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    ref={inputRef}
                    type={showPin ? 'text' : 'password'}
                    autoComplete="one-time-code"
                    value={pin}
                    onChange={(e) => {
                      setPin(e.target.value);
                      if (errorMsg) setErrorMsg('');
                    }}
                    disabled={verifying || cooldownSec > 0}
                    placeholder={language === 'bn' ? 'ট্রানজেকশন পিন লিখুন...' : 'Enter Transaction PIN...'}
                    className="w-full pl-9 pr-10 py-2.5 border-2 border-slate-200 focus:border-indigo-500 rounded-xl bg-slate-50 focus:bg-white text-sm font-bold tracking-widest outline-none transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPin((prev) => !prev)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                    tabIndex={-1}
                  >
                    {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[10px] text-slate-500 mt-1">
                  {language === 'bn'
                    ? 'লগইন পাসওয়ার্ড দিয়ে লেনদেন হবে না — শুধুমাত্র আপনার ব্যক্তিগত পিন দিন।'
                    : 'Login password is not accepted — enter your private Transaction PIN only.'}
                </p>
              </div>

              {errorMsg && (
                <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-[11px] font-semibold flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <div className="flex items-center justify-between gap-2 pt-1">
                {onOpenSecuritySettings ? (
                  <button
                    type="button"
                    onClick={() => {
                      onCancel();
                      onOpenSecuritySettings();
                    }}
                    className="text-[11px] font-semibold text-indigo-700 hover:underline cursor-pointer"
                  >
                    {language === 'bn' ? 'পিন পরিবর্তন / ভুলে গেছেন?' : 'Change / Forgot PIN?'}
                  </button>
                ) : (
                  <span />
                )}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onCancel}
                    disabled={verifying}
                    className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 cursor-pointer"
                  >
                    {language === 'bn' ? 'বাতিল' : 'Cancel'}
                  </button>
                  <button
                    type="submit"
                    disabled={verifying || cooldownSec > 0}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-400 text-white font-extrabold flex items-center gap-1.5 shadow-xs cursor-pointer"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>
                      {verifying
                        ? language === 'bn'
                          ? 'যাচাই হচ্ছে...'
                          : 'Verifying...'
                        : cooldownSec > 0
                        ? `${cooldownSec}s`
                        : language === 'bn'
                        ? 'অনুমোদন ও সম্পন্ন'
                        : 'Authorize & Save'}
                    </span>
                  </button>
                </div>
              </div>
            </form>
          ) : (
            <form onSubmit={handleSetFirstTransactionPin} className="space-y-3">
              <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-950 text-[11px] space-y-1">
                <div className="font-extrabold flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-indigo-700" />
                  <span>
                    {language === 'bn'
                      ? 'প্রথমবার ব্যক্তিগত ট্রানজেকশন পিন সেট করুন'
                      : 'Set Your Private Transaction PIN'}
                  </span>
                </div>
                <p className="leading-relaxed">
                  {language === 'bn'
                    ? 'সকল লেনদেন শুধুমাত্র পিন দিয়ে সম্পন্ন হবে (লগইন পাসওয়ার্ড দিয়ে নয়)। আপনার পিন সম্পূর্ণ গোপন থাকবে — সুপার অ্যাডমিনসহ কেউ আপনার পিন দেখতে বা পরিবর্তন করতে পারবেন না।'
                    : 'All transactions use your personal PIN only (never login password). Your PIN is private and encrypted — nobody, including Super Admin, can see it.'}
                </p>
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  {language === 'bn' ? 'নতুন ট্রানজেকশন পিন (কমপক্ষে ৪ অক্ষর/সংখ্যা) *' : 'New Transaction PIN (min 4 chars) *'}
                </label>
                <div className="relative">
                  <input
                    ref={setupInputRef}
                    type={showSetupPin ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={setupPin}
                    onChange={(e) => {
                      setSetupPin(e.target.value);
                      if (errorMsg) setErrorMsg('');
                    }}
                    placeholder="••••"
                    className="w-full px-3 pr-9 py-2 border border-slate-200 rounded-xl bg-slate-50 font-bold tracking-widest"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSetupPin((p) => !p)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                    tabIndex={-1}
                  >
                    {showSetupPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  {language === 'bn' ? 'পুনরায় পিন দিন (Confirm PIN) *' : 'Confirm PIN *'}
                </label>
                <input
                  type={showSetupPin ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={setupConfirmPin}
                  onChange={(e) => {
                    setSetupConfirmPin(e.target.value);
                    if (errorMsg) setErrorMsg('');
                  }}
                  placeholder="••••"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 font-bold tracking-widest"
                />
              </div>
              {errorMsg && (
                <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-[11px] font-semibold">
                  {errorMsg}
                </div>
              )}
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={onCancel}
                  disabled={verifying}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 cursor-pointer"
                >
                  {language === 'bn' ? 'বাতিল' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={verifying}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold cursor-pointer"
                >
                  {verifying
                    ? language === 'bn'
                      ? 'সংরক্ষণ হচ্ছে...'
                      : 'Saving...'
                    : language === 'bn'
                    ? 'পিন সেট ও লেনদেন সম্পন্ন করুন'
                    : 'Set PIN & Authorize'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

interface TransactionSecuritySettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  language: 'bn' | 'en';
  canManagePolicy: boolean;
  onPolicyUpdated?: (config: TransactionSecurityConfig) => void;
}

export const TransactionSecuritySettingsModal: React.FC<TransactionSecuritySettingsModalProps> = ({
  isOpen,
  onClose,
  language,
  canManagePolicy,
  onPolicyUpdated,
}) => {
  const { currentUser, activeRole, firebaseUser } = useAuth();
  const [config, setConfig] = useState<TransactionSecurityConfig>(() =>
    StorageService.getTransactionSecurityConfig()
  );
  const [staffList, setStaffList] = useState(() => StorageService.getStaff());
  const [activeSubTab, setActiveSubTab] = useState<'my_pin' | 'policy'>('my_pin');

  // Self-only PIN form (change via current PIN OR self-service forgot-PIN recovery)
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [currentPinInput, setCurrentPinInput] = useState('');
  const [accountPasswordInput, setAccountPasswordInput] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [showPins, setShowPins] = useState(false);
  const [myPinFeedback, setMyPinFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [savingMyPin, setSavingMyPin] = useState(false);
  const [policyFeedback, setPolicyFeedback] = useState<string>('');

  useEffect(() => {
    if (!isOpen) return;
    setConfig(StorageService.getTransactionSecurityConfig());
    setStaffList(StorageService.getStaff());
    setActiveSubTab('my_pin');
    setRecoveryMode(false);
    setCurrentPinInput('');
    setAccountPasswordInput('');
    setNewPin('');
    setConfirmPin('');
    setShowPins(false);
    setMyPinFeedback(null);
    setPolicyFeedback('');
  }, [isOpen, canManagePolicy]);

  if (!isOpen) return null;

  const userHasFirebasePassword = hasPasswordProvider(firebaseUser);
  const myHasPin = hasConfiguredTransactionPin(currentUser, staffList, config);

  const handleSaveMyPin = async (e: React.FormEvent) => {
    e.preventDefault();
    setMyPinFeedback(null);

    const cleanNewPin = newPin.trim();
    if (cleanNewPin.length < 4) {
      setMyPinFeedback({
        type: 'error',
        text:
          language === 'bn'
            ? 'নতুন ট্রানজেকশন পিন কমপক্ষে ৪ অক্ষর বা সংখ্যার হতে হবে।'
            : 'Transaction PIN must be at least 4 characters or digits.',
      });
      return;
    }
    if (cleanNewPin !== confirmPin.trim()) {
      setMyPinFeedback({
        type: 'error',
        text: language === 'bn' ? 'নতুন পিন ও কনফার্ম পিন মিলছে না।' : 'New PINs do not match.',
      });
      return;
    }

    setSavingMyPin(true);
    try {
      const latestConfig = StorageService.getTransactionSecurityConfig();
      const latestStaff = StorageService.getStaff();

      if (myHasPin) {
        if (!recoveryMode) {
          // Verify using Current Transaction PIN ONLY
          if (!currentPinInput.trim()) {
            setMyPinFeedback({
              type: 'error',
              text:
                language === 'bn'
                  ? 'পিন পরিবর্তন করতে আপনার বর্তমান ট্রানজেকশন পিন দিন।'
                  : 'Enter your current Transaction PIN to change it.',
            });
            setSavingMyPin(false);
            return;
          }
          const check = await verifyTransactionSecret({
            password: currentPinInput,
            user: currentUser,
            staffList: latestStaff,
            config: latestConfig,
          });
          if (!check.valid) {
            setMyPinFeedback({
              type: 'error',
              text:
                check.reason === 'COOLDOWN' && check.cooldownSeconds
                  ? language === 'bn'
                    ? `একাধিক ভুল পিন দেওয়ায় ${check.cooldownSeconds} সেকেন্ড অপেক্ষা করুন।`
                    : `Too many wrong attempts. Wait ${check.cooldownSeconds}s.`
                  : language === 'bn'
                  ? 'বর্তমান ট্রানজেকশন পিন সঠিক নয়!'
                  : 'Current Transaction PIN is incorrect.',
            });
            setSavingMyPin(false);
            return;
          }
        } else {
          // Forgot PIN recovery: verify ONLY own account login password (never grants direct transaction access)
          if (!accountPasswordInput.trim()) {
            setMyPinFeedback({
              type: 'error',
              text:
                language === 'bn'
                  ? 'পিন রিসেট করতে নিজের অ্যাকাউন্টের লগইন পাসওয়ার্ড দিন অথবা নিচে Google দিয়ে যাচাই করুন।'
                  : 'Enter your own account login password or verify with Google below to reset your PIN.',
            });
            setSavingMyPin(false);
            return;
          }
          const ownerCheck = await verifyAccountOwnerIdentity({
            loginPassword: accountPasswordInput,
            user: currentUser,
            hasFirebasePasswordProvider: userHasFirebasePassword,
            verifyFirebasePassword: reauthenticateWithCurrentPassword,
          });
          if (!ownerCheck.verified) {
            setMyPinFeedback({
              type: 'error',
              text: ownerCheck.needsGoogleReauth
                ? language === 'bn'
                  ? 'আপনি Google দিয়ে লগইন করেছেন — নিচের "Google দিয়ে যাচাই ও নতুন পিন সেট" বাটন ব্যবহার করুন।'
                  : 'Use the "Verify with Google & Set New PIN" button below.'
                : language === 'bn'
                ? 'আপনার অ্যাকাউন্টের লগইন পাসওয়ার্ড সঠিক নয়!'
                : 'Account login password is incorrect.',
            });
            setSavingMyPin(false);
            return;
          }
        }
      }

      const { nextConfig, updatedStaff } = await buildTransactionPinUpdate(
        currentUser,
        cleanNewPin,
        latestStaff,
        latestConfig
      );
      StorageService.saveTransactionSecurityConfig(nextConfig);
      if (updatedStaff) {
        StorageService.updateStaff(updatedStaff);
        setStaffList(StorageService.getStaff());
      }
      setConfig(nextConfig);
      onPolicyUpdated?.(nextConfig);
      setCurrentPinInput('');
      setAccountPasswordInput('');
      setNewPin('');
      setConfirmPin('');
      setRecoveryMode(false);
      setMyPinFeedback({
        type: 'success',
        text:
          language === 'bn'
            ? '✓ আপনার ব্যক্তিগত ট্রানজেকশন পিন সফলভাবে সংরক্ষিত হয়েছে!'
            : '✓ Your personal Transaction PIN has been updated!',
      });
    } finally {
      setSavingMyPin(false);
    }
  };

  const handleGoogleRecoverPin = async () => {
    setMyPinFeedback(null);
    const cleanNewPin = newPin.trim();
    if (cleanNewPin.length < 4) {
      setMyPinFeedback({
        type: 'error',
        text:
          language === 'bn'
            ? 'প্রথমে নিচে ৪+ অক্ষরের নতুন ট্রানজেকশন পিন লিখুন।'
            : 'Enter your new Transaction PIN (4+ chars) below first.',
      });
      return;
    }
    if (cleanNewPin !== confirmPin.trim()) {
      setMyPinFeedback({
        type: 'error',
        text: language === 'bn' ? 'নতুন পিন ও কনফার্ম পিন মিলছে না।' : 'New PINs do not match.',
      });
      return;
    }
    setSavingMyPin(true);
    try {
      await reauthenticateWithGoogleAccount();
      const latestConfig = StorageService.getTransactionSecurityConfig();
      const latestStaff = StorageService.getStaff();
      const { nextConfig, updatedStaff } = await buildTransactionPinUpdate(
        currentUser,
        cleanNewPin,
        latestStaff,
        latestConfig
      );
      StorageService.saveTransactionSecurityConfig(nextConfig);
      if (updatedStaff) {
        StorageService.updateStaff(updatedStaff);
        setStaffList(StorageService.getStaff());
      }
      setConfig(nextConfig);
      onPolicyUpdated?.(nextConfig);
      setNewPin('');
      setConfirmPin('');
      setRecoveryMode(false);
      setMyPinFeedback({
        type: 'success',
        text:
          language === 'bn'
            ? '✓ Google অ্যাকাউন্ট যাচাই করে আপনার নতুন ব্যক্তিগত পিন সেভ হয়েছে!'
            : '✓ Google verified & your new personal PIN has been saved!',
      });
    } catch (err: any) {
      setMyPinFeedback({
        type: 'error',
        text: err?.message || 'Google verification failed.',
      });
    } finally {
      setSavingMyPin(false);
    }
  };

  const updatePolicy = (patch: Partial<TransactionSecurityConfig>) => {
    const next: TransactionSecurityConfig = {
      ...config,
      ...patch,
      allowDedicatedPin: true,
      updatedAt: new Date().toISOString(),
      updatedBy: currentUser.name,
    };
    StorageService.saveTransactionSecurityConfig(next);
    if (next.promptFrequency === 'always' || !next.requireTransactionPassword) {
      lockTransactionSession();
    }
    setConfig(next);
    onPolicyUpdated?.(next);
    setPolicyFeedback(
      language === 'bn' ? '✓ সিকিউরিটি নীতি আপডেট হয়েছে।' : '✓ Security policy updated.'
    );
    setTimeout(() => setPolicyFeedback(''), 3000);
  };

  return (
    <div className="fixed inset-0 z-[75] flex items-center justify-center p-3 sm:p-4 bg-slate-900/65 backdrop-blur-xs">
      <div className="bg-white rounded-2xl max-w-xl w-full shadow-2xl border border-slate-200 max-h-[90vh] flex flex-col overflow-hidden text-xs">
        <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-600 text-white">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-slate-900">
                {language === 'bn'
                  ? 'ট্রানজেকশন পিন ও নিরাপত্তা সেটিংস'
                  : 'Transaction PIN & Security Settings'}
              </h3>
              <p className="text-[11px] text-slate-500">
                {language === 'bn'
                  ? 'যে যার ব্যক্তিগত পিন পরিবর্তন ও লেনদেন সুরক্ষা নীতি'
                  : 'Personal Transaction PIN management & school enforcement policy'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 pt-2.5 border-b border-slate-200 flex items-center gap-2 bg-white">
          <button
            type="button"
            onClick={() => setActiveSubTab('my_pin')}
            className={`px-3 py-2 text-xs font-bold border-b-2 cursor-pointer flex items-center gap-1.5 ${
              activeSubTab === 'my_pin'
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent text-slate-600'
            }`}
          >
            <Lock className="w-3.5 h-3.5" />
            <span>{language === 'bn' ? 'আমার ট্রানজেকশন পিন' : 'My Transaction PIN'}</span>
          </button>
          {canManagePolicy && (
            <button
              type="button"
              onClick={() => setActiveSubTab('policy')}
              className={`px-3 py-2 text-xs font-bold border-b-2 cursor-pointer flex items-center gap-1.5 ${
                activeSubTab === 'policy'
                  ? 'border-indigo-600 text-indigo-700'
                  : 'border-transparent text-slate-600'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>{language === 'bn' ? 'সুপার অ্যাডমিন সিকিউরিটি নীতি' : 'Security Policy'}</span>
            </button>
          )}
        </div>

        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {activeSubTab === 'my_pin' && (
            <form onSubmit={handleSaveMyPin} className="space-y-3.5">
              {/* Strict Privacy Notice */}
              <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-950 space-y-1">
                <div className="font-extrabold text-xs flex items-center gap-1.5">
                  <Shield className="w-4 h-4 text-emerald-700 shrink-0" />
                  <span>
                    {language === 'bn'
                      ? 'গোপনীয়তা নিশ্চয়তা: আপনার পিন শুধুমাত্র আপনিই জানেন'
                      : 'Strict Privacy Guarantee: Zero Visibility By Others'}
                  </span>
                </div>
                <p className="text-[11px] leading-relaxed">
                  {language === 'bn'
                    ? 'সুপার অ্যাডমিন, অন্য কোনো অ্যাডমিন বা হিসাবরক্ষক—কেউই কারো ট্রানজেকশন পিন দেখতে বা পরিবর্তন করতে পারবেন না। লেনদেন শুধুমাত্র আপনার নিজের পিন দিয়েই হবে (লগইন পাসওয়ার্ড দিয়ে নয়)।'
                    : 'No one — not even Super Admin — can view, set, or change your Transaction PIN. All financial transactions require your personal PIN only.'}
                </p>
              </div>

              <div className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-slate-500 block">
                    {language === 'bn' ? 'বর্তমান অ্যাকাউন্ট:' : 'Logged-in Account:'}
                  </span>
                  <span className="font-bold text-slate-900">
                    {currentUser.nameBn || currentUser.name} ({activeRole})
                  </span>
                </div>
                <span
                  className={`px-2.5 py-0.5 rounded-lg text-[10px] font-bold border ${
                    myHasPin
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-amber-50 text-amber-800 border-amber-200'
                  }`}
                >
                  {myHasPin
                    ? language === 'bn'
                      ? '✓ আপনার পিন সেট আছে'
                      : '✓ Personal PIN Active'
                    : language === 'bn'
                    ? 'পিন সেট করা নেই'
                    : 'Not Set Yet'}
                </span>
              </div>

              {myHasPin && !recoveryMode && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-bold text-slate-700">
                      {language === 'bn' ? 'বর্তমান ট্রানজেকশন পিন *' : 'Current Transaction PIN *'}
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setRecoveryMode(true);
                        setMyPinFeedback(null);
                      }}
                      className="text-[11px] font-semibold text-indigo-700 hover:underline cursor-pointer"
                    >
                      {language === 'bn' ? 'পিন ভুলে গেছেন?' : 'Forgot PIN?'}
                    </button>
                  </div>
                  <input
                    type={showPins ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={currentPinInput}
                    onChange={(e) => setCurrentPinInput(e.target.value)}
                    placeholder="••••"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 font-bold tracking-widest"
                  />
                </div>
              )}

              {myHasPin && recoveryMode && (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-amber-950 text-[11px]">
                      {language === 'bn'
                        ? 'নিজের অ্যাকাউন্ট যাচাই করে পিন রিসেট করুন'
                        : 'Self-Service PIN Reset (Account Owner Only)'}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setRecoveryMode(false);
                        setMyPinFeedback(null);
                      }}
                      className="text-[11px] font-semibold text-slate-600 hover:underline cursor-pointer"
                    >
                      {language === 'bn' ? '← বর্তমান পিন দিয়ে বদলান' : '← Use Current PIN'}
                    </button>
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      {language === 'bn'
                        ? 'নিজের লগইন পাসওয়ার্ড দিন (শুধু রিসেটের জন্য):'
                        : 'Your Account Login Password (for reset only):'}
                    </label>
                    <input
                      type="password"
                      autoComplete="current-password"
                      value={accountPasswordInput}
                      onChange={(e) => setAccountPasswordInput(e.target.value)}
                      placeholder="••••••"
                      className="w-full px-3 py-2 border border-amber-300 rounded-xl bg-white"
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    {language === 'bn' ? 'নতুন ট্রানজেকশন পিন (৪+ অক্ষর)' : 'New Transaction PIN (4+ chars)'}
                  </label>
                  <div className="relative">
                    <input
                      type={showPins ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={newPin}
                      onChange={(e) => setNewPin(e.target.value)}
                      placeholder="••••"
                      className="w-full px-3 pr-9 py-2 border border-slate-200 rounded-xl bg-slate-50 font-bold tracking-widest"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPins((p) => !p)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                      tabIndex={-1}
                    >
                      {showPins ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    {language === 'bn' ? 'পুনরায় নতুন পিন দিন' : 'Confirm New PIN'}
                  </label>
                  <input
                    type={showPins ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={confirmPin}
                    onChange={(e) => setConfirmPin(e.target.value)}
                    placeholder="••••"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 font-bold tracking-widest"
                  />
                </div>
              </div>

              {myPinFeedback && (
                <div
                  className={`p-3 rounded-xl text-[11px] font-semibold border ${
                    myPinFeedback.type === 'success'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                      : 'bg-rose-50 border-rose-200 text-rose-700'
                  }`}
                >
                  {myPinFeedback.text}
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                {myHasPin && recoveryMode && !userHasFirebasePassword ? (
                  <button
                    type="button"
                    onClick={handleGoogleRecoverPin}
                    disabled={savingMyPin}
                    className="px-3 py-2 rounded-xl border border-indigo-300 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 font-bold cursor-pointer"
                  >
                    {language === 'bn' ? 'Google দিয়ে যাচাই ও নতুন পিন সেভ' : 'Verify Google & Save New PIN'}
                  </button>
                ) : (
                  <span />
                )}
                <button
                  type="submit"
                  disabled={savingMyPin}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold cursor-pointer"
                >
                  {savingMyPin
                    ? language === 'bn'
                      ? 'সংরক্ষণ হচ্ছে...'
                      : 'Saving...'
                    : myHasPin
                    ? language === 'bn'
                      ? 'আমার পিন পরিবর্তন করুন'
                      : 'Change My PIN'
                    : language === 'bn'
                    ? 'ব্যক্তিগত পিন সেভ করুন'
                    : 'Save Personal PIN'}
                </button>
              </div>
            </form>
          )}

          {activeSubTab === 'policy' && canManagePolicy && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-bold text-slate-900 text-xs">
                      {language === 'bn'
                        ? 'সকল আর্থিক লেনদেন ও ইনভয়েসে ট্রানজেকশন পিন বাধ্যতামূলক করুন'
                        : 'Require Transaction PIN for All Fee, Income, Expense & Invoice Actions'}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {language === 'bn'
                        ? 'চালু থাকলে কোনো হিসাবরক্ষক বা অ্যাডমিন নিজের ট্রানজেকশন পিন ছাড়া ফি, ইনভয়েস, আয়, ব্যয় বা বেতন সম্পন্ন করতে পারবেন না।'
                        : 'When enabled, every fee receipt, invoice, income/expense voucher, and payroll action requires the operator’s own Transaction PIN.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      updatePolicy({ requireTransactionPassword: !config.requireTransactionPassword })
                    }
                    className={`px-3.5 py-1.5 rounded-xl font-extrabold text-xs shrink-0 cursor-pointer transition-colors ${
                      config.requireTransactionPassword
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {config.requireTransactionPassword
                      ? language === 'bn'
                        ? 'চালু (ON)'
                        : 'ON'
                      : language === 'bn'
                      ? 'বন্ধ (OFF)'
                      : 'OFF'}
                  </button>
                </div>

                {config.requireTransactionPassword && (
                  <div className="pt-3 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => updatePolicy({ promptFrequency: 'always' })}
                      className={`p-3 rounded-xl border text-left cursor-pointer transition-colors ${
                        config.promptFrequency === 'always'
                          ? 'bg-indigo-50 border-indigo-400 text-indigo-950'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <div className="font-extrabold flex items-center gap-1.5">
                        <Lock className="w-3.5 h-3.5 text-indigo-600" />
                        <span>
                          {language === 'bn' ? 'প্রতিটি লেনদেনে পিন চাইবে' : 'Ask PIN On Every Transaction'}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-500 mt-1">
                        {language === 'bn'
                          ? 'প্রতিবার ফি আদায়, ইনভয়েস, আয় ও ব্যয়ে পিন দিতে হবে (সর্বোচ্চ নিরাপত্তা)।'
                          : 'Maximum security: prompts PIN on every single receipt or voucher.'}
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => updatePolicy({ promptFrequency: 'timed_15m' })}
                      className={`p-3 rounded-xl border text-left cursor-pointer transition-colors ${
                        config.promptFrequency === 'timed_15m'
                          ? 'bg-indigo-50 border-indigo-400 text-indigo-950'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <div className="font-extrabold flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-blue-600" />
                        <span>
                          {language === 'bn' ? 'একবার পিন দিলে ১৫ মিনিট আনলক থাকবে' : 'Unlock for 15 Minutes'}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-500 mt-1">
                        {language === 'bn'
                          ? 'একবার পিন যাচাই করলে ১৫ মিনিট দ্রুত বিলিং করা যাবে (যেকোনো সময় Lock করা যাবে)।'
                          : 'Fast counter mode: stay unlocked for 15m per login session.'}
                      </p>
                    </button>
                  </div>
                )}

                {policyFeedback && (
                  <div className="text-[11px] font-bold text-emerald-700">{policyFeedback}</div>
                )}
              </div>

              {/* Privacy Isolation Info Box — No Staff PIN viewing or resetting by Super Admin */}
              <div className="p-4 rounded-xl border border-indigo-200 bg-indigo-50/70 text-indigo-950 space-y-1.5">
                <div className="font-extrabold flex items-center gap-1.5 text-xs">
                  <ShieldCheck className="w-4 h-4 text-indigo-700 shrink-0" />
                  <span>
                    {language === 'bn'
                      ? 'স্টাফ ও হিসাবরক্ষকের পিন গোপনীয়তা নীতি'
                      : 'Staff & Accountant PIN Privacy Policy'}
                  </span>
                </div>
                <p className="text-[11px] leading-relaxed text-indigo-900">
                  {language === 'bn'
                    ? 'সকল হিসাবরক্ষক ও অ্যাডমিন নিজ নিজ অ্যাকাউন্ট থেকে ব্যক্তিগত ট্রানজেকশন পিন সেট ও পরিবর্তন করবেন। গোপনীয়তা রক্ষার্থে সুপার অ্যাডমিনও কোনো হিসাবরক্ষক বা স্টাফের পিন দেখতে, সেট করতে বা পরিবর্তন করতে পারবেন না।'
                    : 'Every accountant and admin sets and changes their own private Transaction PIN independently. Super Admin cannot view, set, or override any staff member’s PIN.'}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export function useTransactionPasswordGuard(language: 'bn' | 'en') {
  const { currentUser, activeRole } = useAuth();
  const [pendingRequest, setPendingRequest] = useState<{
    actionInfo: TransactionAuthActionInfo;
    onAuthorized: (stamp: TransactionAuthStamp) => void;
  } | null>(null);
  const [showSecurityModal, setShowSecurityModal] = useState(false);
  const [securityTick, setSecurityTick] = useState(0);

  const canManagePolicy = activeRole === 'super_admin' || activeRole === 'master_admin';
  const unlockKey = getPrimaryUserUnlockKey(currentUser);

  const authorizeTransaction = (
    actionInfo: TransactionAuthActionInfo,
    onAuthorized: (stamp: TransactionAuthStamp) => void
  ) => {
    const config = StorageService.getTransactionSecurityConfig();
    if (!config.requireTransactionPassword) {
      onAuthorized({});
      return;
    }
    if (isTransactionSessionUnlocked(unlockKey, config)) {
      onAuthorized({
        authVerifiedAt: new Date().toISOString(),
        authMethod: 'transaction_pin',
      });
      return;
    }
    setPendingRequest({ actionInfo, onAuthorized });
  };

  const lockNow = () => {
    lockTransactionSession();
    setSecurityTick((t) => t + 1);
  };

  const currentConfig = StorageService.getTransactionSecurityConfig();
  const isTimedUnlocked =
    currentConfig.requireTransactionPassword &&
    currentConfig.promptFrequency === 'timed_15m' &&
    isTransactionSessionUnlocked(unlockKey, currentConfig);

  const authModalElement = (
    <>
      <TransactionPasswordModal
        isOpen={Boolean(pendingRequest)}
        actionInfo={pendingRequest?.actionInfo || null}
        language={language}
        onAuthorized={() => {
          const cb = pendingRequest?.onAuthorized;
          const cfg = StorageService.getTransactionSecurityConfig();
          if (cfg.promptFrequency === 'timed_15m') {
            markTransactionSessionUnlocked(unlockKey);
          }
          setPendingRequest(null);
          setSecurityTick((t) => t + 1);
          cb?.({
            authVerifiedAt: new Date().toISOString(),
            authMethod: 'transaction_pin',
          });
        }}
        onCancel={() => setPendingRequest(null)}
        onOpenSecuritySettings={() => setShowSecurityModal(true)}
      />
      <TransactionSecuritySettingsModal
        isOpen={showSecurityModal}
        onClose={() => {
          setShowSecurityModal(false);
          setSecurityTick((t) => t + 1);
        }}
        language={language}
        canManagePolicy={canManagePolicy}
        onPolicyUpdated={() => setSecurityTick((t) => t + 1)}
      />
    </>
  );

  return {
    authorizeTransaction,
    authModalElement,
    openSecuritySettings: () => setShowSecurityModal(true),
    lockNow,
    isTimedUnlocked,
    securityConfig: currentConfig,
    securityTick,
    UnlockIcon: Unlock,
  };
}
