import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import {
  DEFAULT_FALLBACK_CHANNELS,
  DEFAULT_FALLBACK_PLANS,
  SaaSApi,
  SaaSPaymentRequestDTO,
  SaaSPlanConfig,
  SaaSPlanId,
  SaaSPlatformPaymentChannels,
  SaaSSubscriptionHistoryDTO,
  getEffectivePlanPriceBdt,
  isSaaSBackendUnavailableError,
  isSaaSIamPermissionError,
  isNetlifyHostingEnvironment,
} from '../../services/saasApi';
import { auth, db, handleFirestoreError, OperationType } from '../../services/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { compressImageToPassportSize } from '../../utils/storageHelper';
import { DigitInput } from '../common/DigitInput';
import { parseLocaleNumber } from '../../utils/i18n';
import { LauncherIconGrid, LauncherTileItem } from '../common/LauncherIconGrid';
import {
  CreditCard,
  CheckCircle2,
  Clock,
  Send,
  Upload,
  Calendar,
  ShieldCheck,
  Building2,
  AlertTriangle,
  RefreshCw,
  FileText,
  Smartphone,
  Landmark,
  Copy,
  Check,
} from 'lucide-react';

interface SubscriptionBillingViewProps {
  compactMode?: boolean;
  previewMode?: boolean;
  previewSchool?: {
    schoolId: string;
    schoolName: string;
    schoolCode: string;
  };
  previewSubscription?: {
    planId: SaaSPlanId;
    planName: string;
    startDate: string;
    expiryDate: string;
    lastPaymentDate: string | null;
    effectiveStatus: string;
    isExpired: boolean;
    expiredDays: number;
    remainingDays: number;
  };
}

export const SubscriptionBillingView: React.FC<SubscriptionBillingViewProps> = ({
  compactMode = false,
  previewMode = false,
  previewSchool,
  previewSubscription,
}) => {
  const { saasSession, refreshSaasSession } = useAuth();
  const { language, formatTaka, toBnNumber } = useLanguage();

  const [plans, setPlans] = useState<SaaSPlanConfig[]>(DEFAULT_FALLBACK_PLANS);
  const [channels, setChannels] = useState<SaaSPlatformPaymentChannels>(DEFAULT_FALLBACK_CHANNELS);
  const [copiedChannel, setCopiedChannel] = useState<string | null>(null);
  const [paymentRequests, setPaymentRequests] = useState<SaaSPaymentRequestDTO[]>([]);
  const [history, setHistory] = useState<SaaSSubscriptionHistoryDTO[]>([]);
  const [loading, setLoading] = useState(true);

  // Form states
  const [selectedPlanId, setSelectedPlanId] = useState<SaaSPlanId>('monthly');
  const [amount, setAmount] = useState<string>('1500');
  const [paymentMethod, setPaymentMethod] = useState<'bKash' | 'Nagad' | 'Rocket' | 'Bank Transfer'>('bKash');
  const [senderNumber, setSenderNumber] = useState('');
  const [transactionId, setTransactionId] = useState('');
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [screenshotUrl, setScreenshotUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const loadFromFirestoreFallback = async () => {
    const order: Record<string, number> = {
      free: 1,
      monthly: 2,
      quarterly: 3,
      half_yearly: 4,
      yearly: 5,
      lifetime: 6,
    };
    let loadedPlans: SaaSPlanConfig[] = DEFAULT_FALLBACK_PLANS;

    if (auth.currentUser) {
      const plansSnap = await getDocs(collection(db, 'subscription_plans')).catch((err) => {
        if (err?.code === 'permission-denied') {
          handleFirestoreError(err, OperationType.LIST, 'subscription_plans');
        }
        return null;
      });
      if (plansSnap && !plansSnap.empty) {
        const fsPlans = plansSnap.docs.map((d) => d.data() as SaaSPlanConfig);
        const existingIds = new Set(fsPlans.map((p) => p.id));
        const merged = [
          ...fsPlans,
          ...DEFAULT_FALLBACK_PLANS.filter((p) => !existingIds.has(p.id)),
        ];
        loadedPlans = merged
          .filter((p) => p.isActive !== false)
          .sort((a, b) => (a.sortOrder ?? order[a.id] ?? 100) - (b.sortOrder ?? order[b.id] ?? 100));
      }
    }

    setPlans(loadedPlans);
    setChannels((prev) =>
      prev.bkash || prev.nagad || prev.bank ? prev : DEFAULT_FALLBACK_CHANNELS
    );
    if (loadedPlans.length > 0) {
      const currentPlan =
        loadedPlans.find((p) => p.id === saasSession?.subscription?.planId) || loadedPlans[0];
      setSelectedPlanId(currentPlan.id);
      setAmount(String(getEffectivePlanPriceBdt(currentPlan)));
    }

    const schoolId = !previewMode ? saasSession?.school?.schoolId : undefined;
    if (auth.currentUser && schoolId) {
      const tokenRes = await auth.currentUser.getIdTokenResult().catch(() => null);
      const claimSchoolId = String(tokenRes?.claims?.schoolId || '');
      const isMasterClaim =
        tokenRes?.claims?.isMasterAdmin === true ||
        tokenRes?.claims?.schoolRole === 'master_admin';
      if (isMasterClaim || claimSchoolId === schoolId) {
        const [reqSnap, histSnap] = await Promise.all([
          getDocs(query(collection(db, 'payment_requests'), where('schoolId', '==', schoolId))).catch(
            (err) => {
              if (err?.code === 'permission-denied') {
                handleFirestoreError(err, OperationType.LIST, 'payment_requests');
              }
              return null;
            }
          ),
          getDocs(
            query(collection(db, 'subscription_history'), where('schoolId', '==', schoolId))
          ).catch((err) => {
            if (err?.code === 'permission-denied') {
              handleFirestoreError(err, OperationType.LIST, 'subscription_history');
            }
            return null;
          }),
        ]);
        if (reqSnap) {
          setPaymentRequests(
            reqSnap.docs
              .map((d) => d.data() as SaaSPaymentRequestDTO)
              .sort((a, b) => (b.submittedAt || '').localeCompare(a.submittedAt || ''))
          );
        }
        if (histSnap) {
          setHistory(
            histSnap.docs
              .map((d) => d.data() as SaaSSubscriptionHistoryDTO)
              .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
          );
        }
      }
    }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [planRes, myRes] = await Promise.all([
        SaaSApi.getPlans(),
        SaaSApi.getMyPaymentRequests().catch((err) => {
          if (isSaaSBackendUnavailableError(err)) {
            throw err;
          }
          return {
            paymentRequests: [],
            subscriptionHistory: [],
          };
        }),
      ]);
      setPlans(planRes.plans);
      setChannels(planRes.platformPaymentChannels);
      if (planRes.plans.length > 0) {
        const currentPlan =
          planRes.plans.find((p) => p.id === saasSession?.subscription?.planId) || planRes.plans[0];
        setSelectedPlanId(currentPlan.id);
        setAmount(String(getEffectivePlanPriceBdt(currentPlan)));
      }
      setPaymentRequests(myRes.paymentRequests || []);
      setHistory(myRes.subscriptionHistory || []);
    } catch (err: any) {
      if (isSaaSBackendUnavailableError(err)) {
        await loadFromFirestoreFallback().catch((fsErr) => {
          console.warn('Firestore billing fallback failed:', fsErr);
        });
      } else {
        console.warn('Error loading subscription billing data:', err);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [saasSession?.school?.schoolId]);

  const handlePlanChange = (planId: SaaSPlanId) => {
    setSelectedPlanId(planId);
    const plan = plans.find((p) => p.id === planId);
    if (plan) {
      setAmount(String(getEffectivePlanPriceBdt(plan)));
    }
  };

  const handleCopyChannel = async (key: string, value: string) => {
    if (!value) return;
    try {
      await navigator.clipboard?.writeText(value);
      setCopiedChannel(key);
      setTimeout(() => setCopiedChannel((prev) => (prev === key ? null : prev)), 1800);
    } catch {
      // Clipboard API may be unavailable in restricted contexts
    }
  };

  const handleScreenshotUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImageToPassportSize(file, 640, 800, 0.72);
      setScreenshotUrl(compressed);
    } catch {
      const reader = new FileReader();
      reader.onload = () => setScreenshotUrl(String(reader.result || ''));
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    if (previewMode) {
      setFeedback({
        type: 'success',
        message:
          language === 'bn'
            ? 'ডেমো প্রিভিউ: মেয়াদ শেষ হওয়া স্কুলের অ্যাডমিন এই ফর্মের মাধ্যমে bKash/Nagad TrxID জমা দিলে তা সরাসরি আপনার "পেমেন্ট যাচাই" ট্যাবে চলে আসবে।'
            : 'Demo Preview: When an expired school submits this form, the TrxID appears in your Master Admin Payment Approvals tab.',
      });
      return;
    }
    setSubmitting(true);
    try {
      const res = await SaaSApi.submitPaymentRequest({
        planId: selectedPlanId,
        amount: Number(amount),
        paymentMethod,
        senderNumber: senderNumber.trim(),
        transactionId: transactionId.trim(),
        paymentDate,
        screenshotUrl: screenshotUrl || undefined,
        notes: notes.trim() || undefined,
      });

      setPaymentRequests((prev) => [res.paymentRequest, ...prev]);
      setSenderNumber('');
      setTransactionId('');
      setScreenshotUrl('');
      setNotes('');
      setFeedback({
        type: 'success',
        message:
          language === 'bn'
            ? 'পেমেন্ট রিকোয়েস্ট সফলভাবে জমা হয়েছে! মাস্টার অ্যাডমিন যাচাই করে অনুমোদন করলে আপনার সাবস্ক্রিপশন সক্রিয় হবে।'
            : 'Payment request submitted! Your subscription will be activated once Master Admin verifies and approves the Transaction ID.',
      });
    } catch (err: any) {
      const msg = isSaaSIamPermissionError(err)
        ? language === 'bn'
          ? 'Firebase Admin সার্ভারের IAM অনুমোদন (Cloud Datastore User) এখনো সেট করা হয়নি। প্ল্যাটফর্ম অ্যাডমিনকে জানান।'
          : 'Server Firebase Admin IAM permissions are not yet granted on the Firebase project.'
        : isSaaSBackendUnavailableError(err)
        ? language === 'bn'
          ? isNetlifyHostingEnvironment()
            ? 'পেমেন্ট রিকোয়েস্ট জমা দেওয়ার জন্য মূল SaaS ব্যাকএন্ড সার্ভার (FIREBASE_SERVICE_ACCOUNT_JSON) চালু থাকতে হবে। প্রয়োজনে প্ল্যাটফর্ম সাপোর্টে যোগাযোগ করুন।'
            : 'পেমেন্ট রিকোয়েস্ট জমা দেওয়ার জন্য ব্যাকএন্ড সার্ভারের সাথে সংযোগ প্রয়োজন। অনুগ্রহ করে কিছুক্ষণ পর আবার চেষ্টা করুন।'
          : 'Submitting a payment request requires the active SaaS backend server. Please try again or contact platform support.'
        : err?.message || 'Failed to submit payment request.';
      setFeedback({
        type: 'error',
        message: msg,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const selectedPlan = plans.find((p) => p.id === selectedPlanId);
  const sub = previewMode && previewSubscription ? previewSubscription : saasSession?.subscription;
  const school = previewMode && previewSchool ? previewSchool : saasSession?.school;

  const billingLauncherItems: LauncherTileItem[] = [
    {
      id: 'status',
      label: language === 'bn' ? 'বর্তমান প্ল্যান' : 'Current Plan',
      icon: ShieldCheck,
      color: 'blue',
      active: true,
      badge: sub ? (sub.isExpired ? 0 : `${sub.remainingDays}d`) : undefined,
      onClick: () => {},
    },
    {
      id: 'refresh',
      label: language === 'bn' ? 'রিফ্রেশ স্ট্যাটাস' : 'Refresh Status',
      icon: RefreshCw,
      color: 'teal',
      onClick: async () => {
        await refreshSaasSession();
        await loadData();
      },
    },
    {
      id: 'channels',
      label: language === 'bn' ? 'বিকাশ / নগদ' : 'Payment Info',
      icon: Smartphone,
      color: 'purple',
      onClick: () => {
        document.getElementById('subscription-payment-channels')?.scrollIntoView({ behavior: 'smooth' });
      },
    },
    {
      id: 'plans',
      label: language === 'bn' ? 'সাবস্ক্রিপশন প্ল্যান' : 'All Plans',
      icon: CreditCard,
      color: 'green',
      badge: plans.length || undefined,
      onClick: () => {
        document.getElementById('subscription-payment-channels')?.scrollIntoView({ behavior: 'smooth' });
      },
    },
  ];

  return (
    <div className={compactMode ? 'space-y-5' : 'space-y-5'}>
      {!compactMode && <LauncherIconGrid items={billingLauncherItems} columns={4} compact />}

      {/* Current Subscription Card */}
      {school && sub && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
            <div className="flex items-start space-x-3">
              <div className="p-2.5 rounded-xl bg-blue-50 text-blue-700 border border-blue-200">
                <Building2 className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center flex-wrap gap-2">
                  <h2 className="text-base font-bold text-slate-900">{school.schoolName}</h2>
                  <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-slate-100 text-slate-700 border border-slate-200">
                    ID: {school.schoolId}
                  </span>
                  <span
                    className={`px-2.5 py-0.5 rounded text-[11px] font-bold uppercase ${
                      sub.effectiveStatus === 'Active'
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                        : sub.effectiveStatus === 'Suspended'
                        ? 'bg-rose-100 text-rose-800 border border-rose-200'
                        : sub.effectiveStatus === 'Pending'
                        ? 'bg-amber-100 text-amber-800 border border-amber-200'
                        : 'bg-rose-100 text-rose-800 border border-rose-200'
                    }`}
                  >
                    {sub.effectiveStatus}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  {language === 'bn' ? 'কোড:' : 'Code:'} <strong>{school.schoolCode}</strong> •{' '}
                  {language === 'bn' ? 'বর্তমান প্ল্যান:' : 'Current Plan:'}{' '}
                  <strong>{sub.planName}</strong>
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={async () => {
                await refreshSaasSession();
                await loadData();
              }}
              className="px-3 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 flex items-center space-x-1.5 self-start"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>{language === 'bn' ? 'স্ট্যাটাস রিফ্রেশ' : 'Refresh Status'}</span>
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 text-xs">
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <div className="text-[11px] text-slate-500 font-medium">
                {language === 'bn' ? 'শুরুর তারিখ' : 'Start Date'}
              </div>
              <div className="font-bold text-slate-900 mt-1">
                {new Date(sub.startDate).toLocaleDateString()}
              </div>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <div className="text-[11px] text-slate-500 font-medium">
                {language === 'bn' ? 'মেয়াদ শেষ' : 'Expiry Date'}
              </div>
              <div className="font-bold text-slate-900 mt-1">
                {new Date(sub.expiryDate).toLocaleDateString()}
              </div>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <div className="text-[11px] text-slate-500 font-medium">
                {sub.isExpired
                  ? language === 'bn'
                    ? 'মেয়াদোত্তীর্ণ দিন'
                    : 'Expired Days'
                  : language === 'bn'
                  ? 'অবশিষ্ট দিন'
                  : 'Remaining Days'}
              </div>
              <div
                className={`font-black text-base mt-0.5 ${
                  sub.isExpired ? 'text-rose-600' : 'text-emerald-700'
                }`}
              >
                {language === 'bn'
                  ? toBnNumber(sub.isExpired ? sub.expiredDays : sub.remainingDays)
                  : sub.isExpired
                  ? sub.expiredDays
                  : sub.remainingDays}{' '}
                <span className="text-xs font-semibold">
                  {language === 'bn' ? 'দিন' : 'days'}
                </span>
              </div>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <div className="text-[11px] text-slate-500 font-medium">
                {language === 'bn' ? 'সর্বশেষ পেমেন্ট' : 'Last Payment'}
              </div>
              <div className="font-bold text-slate-900 mt-1">
                {sub.lastPaymentDate ? new Date(sub.lastPaymentDate).toLocaleDateString() : '—'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Payment Channels + Manual Submission Form */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left: Plans & Payment Instructions */}
        <div id="subscription-payment-channels" className="lg:col-span-5 space-y-4">
          <div className="bg-white text-slate-900 rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-4">
            <div className="flex items-center space-x-2">
              <div className="p-2 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-extrabold text-slate-900">
                {language === 'bn'
                  ? 'পেমেন্ট পাঠানোর মাধ্যমসমূহ'
                  : 'Official Payment Channels'}
              </h3>
            </div>
            <p className="text-[11px] text-slate-600 leading-relaxed">
              {language === 'bn'
                ? 'নিচের যেকোনো মাধ্যমে আপনার নির্বাচিত প্ল্যানের টাকা পাঠিয়ে ডান পাশের ফর্মে Transaction ID জমা দিন। মাস্টার অ্যাডমিন যাচাই করে অনুমোদন করলে সাবস্ক্রিপশন চালু হবে।'
                : 'Send subscription fee to any channel below, then submit your Transaction ID. Subscriptions are activated only after Master Admin verification.'}
            </p>

            <div className="space-y-2.5 text-xs">
              {channels.bkash && (
                <div className="p-3 rounded-xl bg-pink-50/70 border border-pink-200 flex items-start justify-between gap-2">
                  <div className="flex items-start space-x-2.5 min-w-0">
                    <Smartphone className="w-4 h-4 text-pink-600 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <div className="font-bold text-pink-700">bKash</div>
                      <div className="font-mono font-bold text-slate-900 mt-0.5 break-all">{channels.bkash}</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopyChannel('bkash', channels.bkash)}
                    className="shrink-0 px-2 py-1 rounded-lg bg-white hover:bg-pink-100 border border-pink-200 text-[10px] font-semibold text-pink-700 flex items-center space-x-1"
                    title="Copy bKash Number"
                  >
                    {copiedChannel === 'bkash' ? (
                      <Check className="w-3 h-3 text-emerald-600" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                    <span>{copiedChannel === 'bkash' ? (language === 'bn' ? 'কপি' : 'Copied') : (language === 'bn' ? 'কপি' : 'Copy')}</span>
                  </button>
                </div>
              )}

              {channels.nagad && (
                <div className="p-3 rounded-xl bg-orange-50/70 border border-orange-200 flex items-start justify-between gap-2">
                  <div className="flex items-start space-x-2.5 min-w-0">
                    <Smartphone className="w-4 h-4 text-orange-600 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <div className="font-bold text-orange-700">Nagad</div>
                      <div className="font-mono font-bold text-slate-900 mt-0.5 break-all">{channels.nagad}</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopyChannel('nagad', channels.nagad)}
                    className="shrink-0 px-2 py-1 rounded-lg bg-white hover:bg-orange-100 border border-orange-200 text-[10px] font-semibold text-orange-700 flex items-center space-x-1"
                    title="Copy Nagad Number"
                  >
                    {copiedChannel === 'nagad' ? (
                      <Check className="w-3 h-3 text-emerald-600" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                    <span>{copiedChannel === 'nagad' ? (language === 'bn' ? 'কপি' : 'Copied') : (language === 'bn' ? 'কপি' : 'Copy')}</span>
                  </button>
                </div>
              )}

              {channels.rocket && (
                <div className="p-3 rounded-xl bg-purple-50/70 border border-purple-200 flex items-start justify-between gap-2">
                  <div className="flex items-start space-x-2.5 min-w-0">
                    <Smartphone className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <div className="font-bold text-purple-700">Rocket</div>
                      <div className="font-mono font-bold text-slate-900 mt-0.5 break-all">{channels.rocket}</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopyChannel('rocket', channels.rocket || '')}
                    className="shrink-0 px-2 py-1 rounded-lg bg-white hover:bg-purple-100 border border-purple-200 text-[10px] font-semibold text-purple-700 flex items-center space-x-1"
                    title="Copy Rocket Number"
                  >
                    {copiedChannel === 'rocket' ? (
                      <Check className="w-3 h-3 text-emerald-600" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                    <span>{copiedChannel === 'rocket' ? (language === 'bn' ? 'কপি' : 'Copied') : (language === 'bn' ? 'কপি' : 'Copy')}</span>
                  </button>
                </div>
              )}

              {channels.bank && (
                <div className="p-3 rounded-xl bg-sky-50/70 border border-sky-200 flex items-start justify-between gap-2">
                  <div className="flex items-start space-x-2.5 min-w-0">
                    <Landmark className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <div className="font-bold text-sky-700">Bank Transfer</div>
                      <div className="font-mono font-bold text-slate-900 mt-0.5 break-words">{channels.bank}</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopyChannel('bank', channels.bank)}
                    className="shrink-0 px-2 py-1 rounded-lg bg-white hover:bg-sky-100 border border-sky-200 text-[10px] font-semibold text-sky-700 flex items-center space-x-1"
                    title="Copy Bank Details"
                  >
                    {copiedChannel === 'bank' ? (
                      <Check className="w-3 h-3 text-emerald-600" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                    <span>{copiedChannel === 'bank' ? (language === 'bn' ? 'কপি' : 'Copied') : (language === 'bn' ? 'কপি' : 'Copy')}</span>
                  </button>
                </div>
              )}
            </div>

            {channels.paymentInstruction && (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-900 leading-relaxed">
                <strong className="text-amber-800">
                  {language === 'bn' ? 'নির্দেশনা:' : 'Note:'}
                </strong>{' '}
                {channels.paymentInstruction}
              </div>
            )}

            <div className="pt-2 border-t border-slate-100 text-[11px] text-slate-500">
              Support: <span className="text-slate-900 font-semibold">{channels.supportPhone}</span> •{' '}
              <span className="text-slate-900 font-semibold">{channels.supportEmail}</span>
            </div>
          </div>

          {/* Subscription Plans */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-2.5">
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              {language === 'bn' ? 'সাবস্ক্রিপশন প্ল্যান' : 'Available Plans'}
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {plans.map((p) => {
                const selected = selectedPlanId === p.id;
                const isLifetime = p.id === 'lifetime' || p.durationDays >= 36500;
                const effPrice = getEffectivePlanPriceBdt(p);
                const discPct = Math.min(100, Math.max(0, Number(p.discountPercent) || 0));
                const hasDiscount = discPct > 0 && p.priceBdt > 0;
                const isFree = effPrice === 0;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handlePlanChange(p.id)}
                    className={`p-3 rounded-xl border text-left transition-all flex flex-col justify-between ${
                      selected
                        ? 'border-blue-600 bg-blue-50/70 ring-1 ring-blue-600'
                        : hasDiscount
                        ? 'border-rose-200 hover:border-rose-300 bg-white'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-bold text-slate-900">
                          {language === 'bn' ? p.nameBn || p.name : p.name}
                        </span>
                        <div className="flex items-center gap-1 shrink-0">
                          {hasDiscount && (
                            <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-rose-600 text-white">
                              -{discPct}%
                            </span>
                          )}
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
                            {isLifetime
                              ? language === 'bn'
                                ? 'আজীবন'
                                : 'Lifetime'
                              : `${p.durationDays}d`}
                          </span>
                        </div>
                      </div>
                      {p.badgeText && (
                        <div className="mt-1">
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-900">
                            {p.badgeText}
                          </span>
                        </div>
                      )}
                      <div className="flex items-baseline gap-1.5 mt-1.5">
                        <span className={`text-sm font-black ${hasDiscount ? 'text-rose-600' : 'text-blue-700'}`}>
                          {isFree
                            ? language === 'bn'
                              ? `${formatTaka(0)} (ফ্রি)`
                              : `${formatTaka(0)} (Free)`
                            : formatTaka(effPrice)}
                        </span>
                        {hasDiscount && (
                          <span className="text-[11px] font-semibold text-slate-400 line-through">
                            {formatTaka(p.priceBdt)}
                          </span>
                        )}
                      </div>
                    </div>

                    {Array.isArray(p.features) && p.features.length > 0 && (
                      <ul className="mt-2 pt-1.5 border-t border-slate-100 space-y-0.5">
                        {p.features.slice(0, 4).map((feat, idx) => (
                          <li key={idx} className="text-[10px] text-slate-600 flex items-center gap-1">
                            <Check className="w-3 h-3 text-emerald-600 shrink-0" />
                            <span className="truncate">{feat}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right: Manual Payment Request Form */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 shadow-xs p-5">
          <div className="flex items-center space-x-2 pb-3 border-b border-slate-100">
            <CreditCard className="w-5 h-5 text-blue-600" />
            <h3 className="text-sm font-bold text-slate-900">
              {language === 'bn'
                ? 'সাবস্ক্রিপশন পেমেন্ট রিকোয়েস্ট জমা দিন'
                : 'Submit Manual Subscription Payment'}
            </h3>
          </div>

          {feedback && (
            <div
              className={`mt-4 p-3 rounded-xl border text-xs font-semibold flex items-start space-x-2 ${
                feedback.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-rose-50 border-rose-200 text-rose-800'
              }`}
            >
              {feedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              )}
              <span>{feedback.message}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-4 space-y-3.5 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  {language === 'bn' ? 'নির্বাচিত প্ল্যান *' : 'Selected Plan *'}
                </label>
                <select
                  value={selectedPlanId}
                  onChange={(e) => handlePlanChange(e.target.value as SaaSPlanId)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white font-semibold focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  {plans.map((p) => {
                    const effPrice = getEffectivePlanPriceBdt(p);
                    const discPct = Number(p.discountPercent) || 0;
                    return (
                      <option key={p.id} value={p.id}>
                        {p.name} (
                        {p.id === 'lifetime' || p.durationDays >= 36500
                          ? 'Lifetime'
                          : `${p.durationDays} Days`}
                        ) — ৳{effPrice}{discPct > 0 ? ` (${discPct}% OFF)` : ''}
                      </option>
                    );
                  })}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  {language === 'bn' ? 'টাকার পরিমাণ (BDT) *' : 'Amount (BDT) *'}
                </label>
                <DigitInput
                  min={selectedPlan && getEffectivePlanPriceBdt(selectedPlan) === 0 ? 0 : 1}
                  required
                  value={amount === '' ? '' : parseLocaleNumber(amount, 0)}
                  onValueChange={(val) => setAmount(String(val))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl font-bold focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  {language === 'bn' ? 'পেমেন্ট মাধ্যম *' : 'Payment Method *'}
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as any)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white font-semibold focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  <option value="bKash">bKash</option>
                  <option value="Nagad">Nagad</option>
                  {channels.rocket ? <option value="Rocket">Rocket</option> : null}
                  <option value="Bank Transfer">Bank Transfer</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  {language === 'bn' ? 'প্রেরকের নম্বর / অ্যাকাউন্ট *' : 'Sender Number / Account *'}
                </label>
                <input
                  type="text"
                  required
                  placeholder="017XXXXXXXX"
                  value={senderNumber}
                  onChange={(e) => setSenderNumber(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  {language === 'bn' ? 'ট্রানজেকশন আইডি (TrxID) *' : 'Transaction ID (TrxID) *'}
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. BL94X72K10"
                  value={transactionId}
                  onChange={(e) => setTransactionId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl font-mono uppercase focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  {language === 'bn' ? 'পেমেন্টের তারিখ *' : 'Payment Date *'}
                </label>
                <input
                  type="date"
                  required
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                {language === 'bn'
                  ? 'পেমেন্ট স্ক্রিনশট / রসিদ (ঐচ্ছিক)'
                  : 'Payment Screenshot / Receipt (Optional)'}
              </label>
              <div className="flex items-center space-x-3">
                <label className="cursor-pointer px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 font-semibold flex items-center space-x-2">
                  <Upload className="w-4 h-4 text-blue-600" />
                  <span>{language === 'bn' ? 'ছবি আপলোড করুন' : 'Upload Screenshot'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleScreenshotUpload}
                  />
                </label>
                {screenshotUrl && (
                  <span className="text-[11px] text-emerald-700 font-semibold flex items-center space-x-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{language === 'bn' ? 'সংযুক্ত হয়েছে' : 'Attached'}</span>
                  </span>
                )}
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                {language === 'bn' ? 'নোট (ঐচ্ছিক)' : 'Notes (Optional)'}
              </label>
              <input
                type="text"
                placeholder={language === 'bn' ? 'অতিরিক্ত তথ্য...' : 'Additional payment details...'}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-sm transition-all flex items-center space-x-2 disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
                <span>
                  {submitting
                    ? language === 'bn'
                      ? 'জমা হচ্ছে...'
                      : 'Submitting...'
                    : language === 'bn'
                    ? 'পেমেন্ট রিকোয়েস্ট পাঠান'
                    : 'Submit Payment Request'}
                </span>
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Payment Requests & Subscription History */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center space-x-2">
              <Clock className="w-4 h-4 text-amber-600" />
              <span>{language === 'bn' ? 'পেমেন্ট রিকোয়েস্ট সমূহ' : 'Payment Requests'}</span>
            </h4>
          </div>
          <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
            {paymentRequests.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400">
                {language === 'bn' ? 'এখনো কোনো পেমেন্ট রিকোয়েস্ট নেই।' : 'No payment requests submitted yet.'}
              </div>
            ) : (
              paymentRequests.map((req) => (
                <div key={req.id} className="p-4 text-xs flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="font-bold text-slate-900">
                      {req.planName} • {formatTaka(req.amount)}
                    </div>
                    <div className="text-[11px] text-slate-600">
                      {req.paymentMethod} • TrxID:{' '}
                      <span className="font-mono font-bold text-slate-800">{req.transactionId}</span>
                    </div>
                    <div className="text-[11px] text-slate-400 flex items-center space-x-1">
                      <Calendar className="w-3 h-3" />
                      <span>{req.paymentDate}</span>
                    </div>
                    {req.status === 'rejected' && req.rejectionReason && (
                      <div className="text-[11px] text-rose-600 font-medium">
                        Reason: {req.rejectionReason}
                      </div>
                    )}
                  </div>
                  <span
                    className={`px-2.5 py-1 rounded text-[10px] font-bold uppercase shrink-0 ${
                      req.status === 'approved'
                        ? 'bg-emerald-100 text-emerald-800'
                        : req.status === 'rejected'
                        ? 'bg-rose-100 text-rose-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {req.status}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100">
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center space-x-2">
              <FileText className="w-4 h-4 text-blue-600" />
              <span>{language === 'bn' ? 'সাবস্ক্রিপশন হিস্ট্রি' : 'Subscription History'}</span>
            </h4>
          </div>
          <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
            {history.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400">
                {language === 'bn' ? 'কোনো হিস্ট্রি পাওয়া যায়নি।' : 'No subscription history records yet.'}
              </div>
            ) : (
              history.map((item) => (
                <div key={item.id} className="p-4 text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900">{item.planName}</span>
                    <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                      {item.eventType.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600">{item.remarks}</p>
                  <div className="text-[10px] text-slate-400">
                    {new Date(item.createdAt).toLocaleString()}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
