import React, { useEffect, useMemo, useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import {
  CORE_PLAN_IDS,
  DEFAULT_FALLBACK_CHANNELS,
  DEFAULT_FALLBACK_PLANS,
  SaaSApi,
  SaaSHealthDiagnostics,
  SaaSMasterAnalytics,
  SaaSPaymentRequestDTO,
  SaaSPlanConfig,
  SaaSPlanId,
  SaaSPlatformPaymentChannels,
  SaaSSchoolAdminCredentialDTO,
  SaaSSchoolRecord,
  SaaSSchoolStatus,
  SaaSSubscriptionHistoryDTO,
  SaaSUserDTO,
  computeClientSubscriptionState,
  getEffectivePlanPriceBdt,
  isSaaSBackendUnavailableError,
  isSaaSIamPermissionError,
  isNetlifyHostingEnvironment,
} from '../../services/saasApi';
import { db, handleFirestoreError, OperationType } from '../../services/firebase';
import { collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, where } from 'firebase/firestore';
import {
  Building2,
  Plus,
  Search,
  CheckCircle2,
  XCircle,
  CreditCard,
  RefreshCw,
  Eye,
  EyeOff,
  Edit2,
  CalendarPlus,
  Ban,
  Unlock,
  Sliders,
  X,
  Users,
  FileText,
  TrendingUp,
  KeyRound,
  Smartphone,
  Landmark,
  Save,
  BellRing,
  ShieldCheck,
  Trash2,
  AlertTriangle,
  Headphones,
  Percent,
  Tag,
  Check,
  Copy,
  Lock,
  Sparkles,
  Power,
} from 'lucide-react';
import { AccountCredentialsModal } from '../auth/AccountCredentialsModal';
import { SupportTeamView } from '../support/SupportTeamView';
import {
  SUPPORT_UPDATED_EVENT,
  subscribeToSupportTickets,
} from '../../services/supportService';
import { DigitInput } from '../common/DigitInput';
import { parseLocaleNumber } from '../../utils/i18n';
import { LauncherIconGrid, LauncherTileItem } from '../common/LauncherIconGrid';
import { formatDisplayLoginId, isSyntheticAuthEmail } from '../../utils/loginIdentifier';

type SubTab = 'schools' | 'payments' | 'plans' | 'payment_channels' | 'support';

function computeExpiryDateStr(startDate: string, durationDays: number): string {
  const base = startDate ? new Date(`${startDate}T00:00:00.000Z`) : new Date();
  if (Number.isNaN(base.getTime())) return '';
  const expiry = new Date(base.getTime() + durationDays * 86_400_000);
  return expiry.toISOString().slice(0, 10);
}

export const MasterAdminSaaSPanel: React.FC = () => {
  const { language, formatTaka, toBnNumber } = useLanguage();
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('schools');
  const [loading, setLoading] = useState(true);
  const [firestoreFallbackActive, setFirestoreFallbackActive] = useState(false);
  const [serverDiagnostics, setServerDiagnostics] = useState<SaaSHealthDiagnostics | null>(null);
  const [fallbackTriggerCode, setFallbackTriggerCode] = useState<string | null>(null);
  const [healthProbeError, setHealthProbeError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Platform data
  const [schools, setSchools] = useState<SaaSSchoolRecord[]>([]);
  const [analytics, setAnalytics] = useState<SaaSMasterAnalytics | null>(null);
  const [paymentRequests, setPaymentRequests] = useState<SaaSPaymentRequestDTO[]>([]);
  const [plans, setPlans] = useState<SaaSPlanConfig[]>([]);
  const [unreadSupportCount, setUnreadSupportCount] = useState(0);

  // Filters
  const [schoolSearch, setSchoolSearch] = useState('');
  const [schoolStatusFilter, setSchoolStatusFilter] = useState<string>('all');
  const [schoolPlanFilter, setSchoolPlanFilter] = useState<'all' | SaaSPlanId>('all');
  const [schoolSortBy, setSchoolSortBy] = useState<'newest' | 'expiry_asc'>('newest');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState('all');

  // Create school modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creatingSchool, setCreatingSchool] = useState(false);
  const [newSchool, setNewSchool] = useState({
    schoolName: '',
    schoolCode: '',
    address: '',
    contactNumber: '',
    email: '',
    principalName: '',
    adminName: '',
    adminEmail: '',
    adminPassword: '',
    initialPlan: 'monthly' as SaaSPlanId,
    startDate: new Date().toISOString().slice(0, 10),
    expiryDate: computeExpiryDateStr(new Date().toISOString().slice(0, 10), 30),
    activateImmediately: true,
  });

  // Edit school modal
  const [editingSchool, setEditingSchool] = useState<SaaSSchoolRecord | null>(null);
  const [editForm, setEditForm] = useState({
    schoolName: '',
    schoolCode: '',
    address: '',
    contactNumber: '',
    email: '',
    principalName: '',
    notes: '',
  });

  // Extend subscription modal
  const [extendingSchool, setExtendingSchool] = useState<SaaSSchoolRecord | null>(null);
  const [extendDays, setExtendDays] = useState<string>('30');
  const [extendPlanId, setExtendPlanId] = useState<SaaSPlanId>('monthly');

  // School details drawer/modal & Master Admin credential vault
  const [detailsData, setDetailsData] = useState<{
    school: SaaSSchoolRecord;
    paymentHistory: SaaSPaymentRequestDTO[];
    subscriptionHistory: SaaSSubscriptionHistoryDTO[];
    users: SaaSUserDTO[];
    adminCredentials: SaaSSchoolAdminCredentialDTO[];
    vaultError?: string | null;
  } | null>(null);
  const [revealedVaultUids, setRevealedVaultUids] = useState<Record<string, boolean>>({});
  const [copiedVaultKey, setCopiedVaultKey] = useState<string | null>(null);
  const [vaultResetUid, setVaultResetUid] = useState<string | null>(null);
  const [vaultResetPass, setVaultResetPass] = useState<string>('');
  const [vaultResetBusy, setVaultResetBusy] = useState<boolean>(false);
  const [vaultResetMsg, setVaultResetMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [lastCreatedCreds, setLastCreatedCreds] = useState<{
    schoolId: string;
    schoolName: string;
    adminName: string;
    adminEmail: string;
    adminUsername?: string;
    adminPassword: string;
  } | null>(null);
  const [showLastCreatedPass, setShowLastCreatedPass] = useState(true);

  // Payment screenshot & rejection modal
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<SaaSPaymentRequestDTO | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [busyActionId, setBusyActionId] = useState<string | null>(null);

  // Permanent school deletion modal
  const [deletingSchool, setDeletingSchool] = useState<SaaSSchoolRecord | null>(null);
  const [deleteConfirmChecked, setDeleteConfirmChecked] = useState(false);

  // Plans adding & editing state
  const [editingPlan, setEditingPlan] = useState<SaaSPlanConfig | null>(null);
  const [isCreatingPlan, setIsCreatingPlan] = useState(false);
  const [newPlanFeatureInput, setNewPlanFeatureInput] = useState('');
  const [credsModalSchoolId, setCredsModalSchoolId] = useState<string | null>(null);

  // Payment channels setup (bKash / Nagad / Rocket / Bank)
  const [paymentChannels, setPaymentChannels] = useState<SaaSPlatformPaymentChannels>({
    bkash: '',
    nagad: '',
    rocket: '',
    bank: '',
    paymentInstruction: '',
    supportPhone: '',
    supportEmail: '',
  });
  const [savingChannels, setSavingChannels] = useState(false);

  const loadFromFirestoreFallback = async () => {
    const [schoolsSnap, paymentsSnap, plansSnap] = await Promise.all([
      getDocs(collection(db, 'schools')).catch((err) => {
        if (err?.code === 'permission-denied') {
          handleFirestoreError(err, OperationType.LIST, 'schools');
        }
        throw err;
      }),
      getDocs(collection(db, 'payment_requests')).catch((err) => {
        if (err?.code === 'permission-denied') {
          handleFirestoreError(err, OperationType.LIST, 'payment_requests');
        }
        return null;
      }),
      getDocs(collection(db, 'subscription_plans')).catch(() => null),
    ]);

    const nowMs = Date.now();
    const loadedSchools: SaaSSchoolRecord[] = schoolsSnap.docs
      .map((d) => {
        const raw = d.data() as SaaSSchoolRecord;
        const computedSubscription = computeClientSubscriptionState(raw, nowMs);
        return { ...raw, computedSubscription };
      })
      .filter((s) => Boolean(s.schoolId))
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

    const loadedPayments: SaaSPaymentRequestDTO[] = paymentsSnap
      ? paymentsSnap.docs
          .map((d) => d.data() as SaaSPaymentRequestDTO)
          .sort((a, b) => (b.submittedAt || '').localeCompare(a.submittedAt || ''))
      : [];

    const order: Record<string, number> = {
      free: 1,
      monthly: 2,
      quarterly: 3,
      half_yearly: 4,
      yearly: 5,
      lifetime: 6,
    };
    const loadedPlans: SaaSPlanConfig[] =
      plansSnap && !plansSnap.empty
        ? (() => {
            const fsPlans = plansSnap.docs.map((d) => d.data() as SaaSPlanConfig);
            const existingIds = new Set(fsPlans.map((p) => p.id));
            return [
              ...fsPlans,
              ...DEFAULT_FALLBACK_PLANS.filter((p) => !existingIds.has(p.id)),
            ].sort((a, b) => (a.sortOrder ?? order[a.id] ?? 100) - (b.sortOrder ?? order[b.id] ?? 100));
          })()
        : DEFAULT_FALLBACK_PLANS;

    const approvedPayments = loadedPayments.filter((p) => p.status === 'approved');
    const planDistribution: Record<string, number> = {
      free: 0,
      monthly: 0,
      quarterly: 0,
      half_yearly: 0,
      yearly: 0,
      lifetime: 0,
    };
    for (const s of loadedSchools) {
      const pid = s.subscription?.planId;
      if (pid) {
        planDistribution[pid] = (planDistribution[pid] || 0) + 1;
      }
    }

    const computedAnalytics: SaaSMasterAnalytics = {
      totalSchools: loadedSchools.length,
      activeSchools: loadedSchools.filter((s) => s.computedSubscription?.effectiveStatus === 'Active').length,
      expiredSchools: loadedSchools.filter((s) => s.computedSubscription?.effectiveStatus === 'Expired').length,
      suspendedSchools: loadedSchools.filter((s) => s.computedSubscription?.effectiveStatus === 'Suspended').length,
      pendingSchools: loadedSchools.filter((s) => s.computedSubscription?.effectiveStatus === 'Pending').length,
      totalRevenue: approvedPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0),
      pendingPaymentsCount: loadedPayments.filter((p) => p.status === 'pending').length,
      approvedPaymentsCount: approvedPayments.length,
      planDistribution,
    };

    setSchools(loadedSchools);
    setAnalytics(computedAnalytics);
    setPaymentRequests(loadedPayments);
    setPlans(loadedPlans);
    setPaymentChannels((prev) => (prev.bkash || prev.nagad || prev.bank ? prev : DEFAULT_FALLBACK_CHANNELS));
    setFirestoreFallbackActive(true);
  };

  const refreshServerDiagnostics = async () => {
    try {
      const h = await SaaSApi.getHealth();
      setHealthProbeError(null);
      setServerDiagnostics(
        h.diagnostics || {
          adminSdkReady: Boolean(h.adminSdkReady),
          initStatus: h.adminSdkReady ? 'ok' : 'missing_credentials',
          hasServiceAccountJson: false,
          hasSplitCredentials: false,
          hasClientEmail: false,
          hasPrivateKey: false,
          hasGoogleAppCreds: false,
          hasProjectId: false,
          isNetlifyRuntime: false,
        }
      );
    } catch (healthErr: any) {
      setHealthProbeError(healthErr?.code || (healthErr?.status ? `HTTP_${healthErr.status}` : 'NETWORK_ERROR'));
    }
  };

  const loadAll = async () => {
    setLoading(true);
    try {
      const [schoolsRes, paymentsRes, plansRes, channelsRes] = await Promise.all([
        SaaSApi.masterListSchools(),
        SaaSApi.masterListPaymentRequests(),
        SaaSApi.masterListPlans(),
        SaaSApi.masterGetPaymentChannels().catch(() => null),
      ]);
      setSchools(schoolsRes.schools);
      setAnalytics(schoolsRes.analytics);
      setPaymentRequests(paymentsRes.paymentRequests);
      setPlans(plansRes.plans);
      if (channelsRes?.channels) {
        setPaymentChannels(channelsRes.channels);
      }
      setFirestoreFallbackActive(false);
      setServerDiagnostics(null);
      setFallbackTriggerCode(null);
      setHealthProbeError(null);
    } catch (err: any) {
      if (isSaaSBackendUnavailableError(err)) {
        setFallbackTriggerCode(err?.code || (err?.status ? `HTTP_${err.status}` : 'UNAVAILABLE'));
        refreshServerDiagnostics();
        try {
          await loadFromFirestoreFallback();
          return;
        } catch (fsErr: any) {
          setFeedback({
            type: 'error',
            message: fsErr?.message || 'Failed to load Master Admin SaaS data from Firestore.',
          });
          return;
        }
      }
      setFeedback({
        type: 'error',
        message: err?.message || 'Failed to load Master Admin SaaS data.',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    const unsub = subscribeToSupportTickets({
      schoolId: null,
      isMasterAdmin: true,
      onTickets: (list) => {
        setUnreadSupportCount(list.filter((t) => t.unreadByMaster).length);
      },
    });
    const onCustom = (e: Event) => {
      const detail = (e as CustomEvent<{ tickets?: any[] }>).detail;
      if (Array.isArray(detail?.tickets)) {
        setUnreadSupportCount(detail.tickets.filter((t) => t?.unreadByMaster).length);
      }
    };
    window.addEventListener(SUPPORT_UPDATED_EVENT, onCustom);
    return () => {
      unsub();
      window.removeEventListener(SUPPORT_UPDATED_EVENT, onCustom);
    };
  }, []);

  const formatMasterWriteError = (err: any, fallbackMsg: string): string => {
    if (isSaaSIamPermissionError(err)) {
      refreshServerDiagnostics();
      return language === 'bn'
        ? 'Firebase প্রজেক্টে সার্ভারের IAM অনুমোদন (Cloud Datastore User, Firebase Authentication Admin, Service Usage Consumer) এখনো যুক্ত বা সক্রিয় হয়নি। Google Cloud IAM-এ অনুমোদন দেওয়ার পর আবার চেষ্টা করুন।'
        : 'Server Firebase Admin IAM permissions (Cloud Datastore User, Firebase Authentication Admin, Service Usage Consumer) are not yet granted on this Firebase project.';
    }
    if (err?.code === 'ADMIN_CREDENTIAL_INVALID' || /16 UNAUTHENTICATED|Request had invalid authentication credentials/i.test(String(err?.message || ''))) {
      refreshServerDiagnostics();
      return language === 'bn'
        ? 'সার্ভারের FIREBASE_SERVICE_ACCOUNT_JSON Key-টি Google Cloud থেকে ডিলিট বা বাতিল করা হয়েছে (ADMIN_CREDENTIAL_INVALID)। Firebase Console → Service accounts থেকে নতুন JSON Key ডাউনলোড করে Netlify Environment Variables-এ আপডেট করুন।'
        : 'Server Firebase Service Account key in FIREBASE_SERVICE_ACCOUNT_JSON was deleted or revoked (ADMIN_CREDENTIAL_INVALID). Generate a fresh JSON key in Firebase Console and update Netlify Environment Variables.';
    }
    if (isSaaSBackendUnavailableError(err)) {
      refreshServerDiagnostics();
      if (serverDiagnostics?.initStatus === 'invalid_credentials') {
        return language === 'bn'
          ? 'সার্ভারের Firebase সার্ভিস অ্যাকাউন্ট Key-টি অকার্যকর বা ডিলিট করা হয়েছে। নতুন Service Account JSON দিন।'
          : 'Server Firebase Service Account key is invalid or revoked. Provide a fresh Service Account JSON.';
      }
      if (serverDiagnostics?.initStatus === 'invalid_json') {
        return language === 'bn'
          ? 'সার্ভারে FIREBASE_SERVICE_ACCOUNT_JSON পাওয়া গেছে, কিন্তু এর JSON ফরম্যাটে ত্রুটি রয়েছে (invalid_json)। সঠিক JSON অথবা আলাদা করে FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL এবং FIREBASE_PRIVATE_KEY সেট করুন।'
          : 'FIREBASE_SERVICE_ACCOUNT_JSON was detected on the server but could not be parsed (invalid_json).';
      }
      if (serverDiagnostics?.initStatus === 'missing_fields') {
        return language === 'bn'
          ? 'সার্ভারের FIREBASE_SERVICE_ACCOUNT_JSON-এ client_email বা private_key পাওয়া যাচ্ছে না। সম্পূর্ণ Service Account JSON পেস্ট করুন।'
          : 'FIREBASE_SERVICE_ACCOUNT_JSON is missing client_email or private_key.';
      }
      if (!isNetlifyHostingEnvironment(serverDiagnostics)) {
        return language === 'bn'
          ? 'ব্যাকএন্ড সার্ভার সাময়িকভাবে পাওয়া যাচ্ছে না বা Firebase Admin অনুমোদন প্রস্তুত নয়। অনুগ্রহ করে কিছুক্ষণ পর আবার চেষ্টা করুন।'
          : 'Backend server is temporarily unavailable or Firebase Admin credentials/IAM are not ready yet. Please retry in a moment.';
      }
      return language === 'bn'
        ? 'সার্ভারে Firebase Admin কী (FIREBASE_SERVICE_ACCOUNT_JSON) কনফিগার করা নেই বলে নতুন স্কুল বা Auth ইউজার তৈরি করা যাচ্ছে না। Netlify Site configuration → Environment variables-এ এই কী যোগ করে (Scope: All scopes / Functions) Clear cache and deploy site দিন।'
        : 'Cannot create schools or Auth accounts because Firebase Admin SDK credentials are not configured on the server/Netlify Functions. Add FIREBASE_SERVICE_ACCOUNT_JSON (Scope: All scopes) and trigger "Clear cache and deploy site".';
    }
    return err?.message || fallbackMsg;
  };

  const schoolFilterCounts = useMemo(() => {
    const counts = {
      total: schools.length,
      active: 0,
      expiring_7: 0,
      expiring_30: 0,
      expired: 0,
      suspended: 0,
      pending: 0,
      plans: {
        free: 0,
        monthly: 0,
        quarterly: 0,
        half_yearly: 0,
        yearly: 0,
        lifetime: 0,
      } as Record<SaaSPlanId, number>,
    };

    for (const s of schools) {
      const comp = s.computedSubscription;
      const effStatus = comp?.schoolStatus || s.status;
      if (effStatus === 'active') {
        counts.active += 1;
        if (!comp?.isExpired) {
          const rem = comp?.remainingDays ?? 0;
          if (rem <= 7) counts.expiring_7 += 1;
          if (rem <= 30) counts.expiring_30 += 1;
        }
      } else if (effStatus === 'expired') {
        counts.expired += 1;
      } else if (effStatus === 'suspended') {
        counts.suspended += 1;
      } else if (effStatus === 'pending') {
        counts.pending += 1;
      }

      const pid = s.subscription?.planId;
      if (pid && pid in counts.plans) {
        counts.plans[pid] += 1;
      }
    }
    return counts;
  }, [schools]);

  const filteredSchools = useMemo(() => {
    const q = schoolSearch.trim().toLowerCase();
    const list = schools.filter((s) => {
      const comp = s.computedSubscription;
      const effectiveStatus = comp?.schoolStatus || s.status;

      if (schoolStatusFilter === 'expiring_7') {
        if (effectiveStatus !== 'active' || comp?.isExpired || (comp?.remainingDays ?? 999) > 7) {
          return false;
        }
      } else if (schoolStatusFilter === 'expiring_30') {
        if (effectiveStatus !== 'active' || comp?.isExpired || (comp?.remainingDays ?? 999) > 30) {
          return false;
        }
      } else if (schoolStatusFilter !== 'all' && effectiveStatus !== schoolStatusFilter) {
        return false;
      }

      if (schoolPlanFilter !== 'all' && s.subscription?.planId !== schoolPlanFilter) {
        return false;
      }

      if (!q) return true;
      return (
        s.schoolId.toLowerCase().includes(q) ||
        s.schoolName.toLowerCase().includes(q) ||
        s.schoolCode.toLowerCase().includes(q) ||
        s.adminEmail.toLowerCase().includes(q) ||
        (s.adminUsername && s.adminUsername.toLowerCase().includes(q)) ||
        s.email.toLowerCase().includes(q)
      );
    });

    if (schoolSortBy === 'expiry_asc') {
      return [...list].sort((a, b) => {
        const aTime = new Date(a.subscription?.expiryDate || '').getTime() || Number.MAX_SAFE_INTEGER;
        const bTime = new Date(b.subscription?.expiryDate || '').getTime() || Number.MAX_SAFE_INTEGER;
        return aTime - bTime;
      });
    }
    return list;
  }, [schools, schoolSearch, schoolStatusFilter, schoolPlanFilter, schoolSortBy]);

  const filteredPayments = useMemo(() => {
    return paymentRequests.filter((p) => {
      if (paymentStatusFilter !== 'all' && p.status !== paymentStatusFilter) return false;
      return true;
    });
  }, [paymentRequests, paymentStatusFilter]);

  const handlePlanOrStartChange = (planId: SaaSPlanId, startDate: string) => {
    const plan = plans.find((p) => p.id === planId);
    const days =
      plan?.durationDays ||
      (planId === 'lifetime'
        ? 36500
        : planId === 'yearly'
        ? 365
        : planId === 'half_yearly'
        ? 180
        : planId === 'quarterly'
        ? 90
        : 30);
    setNewSchool((prev) => ({
      ...prev,
      initialPlan: planId,
      startDate,
      expiryDate: computeExpiryDateStr(startDate, days),
    }));
  };

  const handleCreateSchool = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    setCreatingSchool(true);
    const createdPassword = newSchool.adminPassword;
    try {
      const res = await SaaSApi.masterCreateSchool({
        ...newSchool,
        startDate: new Date(`${newSchool.startDate}T00:00:00.000Z`).toISOString(),
        expiryDate: newSchool.expiryDate
          ? new Date(`${newSchool.expiryDate}T23:59:59.000Z`).toISOString()
          : undefined,
      });
      const createdAdminLoginDisplay = formatDisplayLoginId({
        username: res.school.adminUsername,
        email: res.school.adminEmail,
      });
      setShowCreateModal(false);
      setLastCreatedCreds({
        schoolId: res.school.schoolId,
        schoolName: res.school.schoolName,
        adminName: res.school.adminName,
        adminEmail: res.school.adminEmail,
        adminUsername: res.school.adminUsername,
        adminPassword: createdPassword,
      });
      setShowLastCreatedPass(true);
      setNewSchool({
        schoolName: '',
        schoolCode: '',
        address: '',
        contactNumber: '',
        email: '',
        principalName: '',
        adminName: '',
        adminEmail: '',
        adminPassword: '',
        initialPlan: 'monthly',
        startDate: new Date().toISOString().slice(0, 10),
        expiryDate: computeExpiryDateStr(new Date().toISOString().slice(0, 10), 30),
        activateImmediately: true,
      });
      setFeedback({
        type: 'success',
        message: `School ${res.school.schoolName} (${res.school.schoolId}) created with School Admin auth account (${createdAdminLoginDisplay}).`,
      });
      await loadAll();
    } catch (err: any) {
      setFeedback({ type: 'error', message: formatMasterWriteError(err, 'Failed to create school.') });
    } finally {
      setCreatingSchool(false);
    }
  };

  const handleOpenEdit = (school: SaaSSchoolRecord) => {
    setEditingSchool(school);
    setEditForm({
      schoolName: school.schoolName,
      schoolCode: school.schoolCode,
      address: school.address,
      contactNumber: school.contactNumber,
      email: school.email,
      principalName: school.principalName,
      notes: school.notes || '',
    });
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSchool) return;
    setBusyActionId(editingSchool.schoolId);
    try {
      await SaaSApi.masterUpdateSchool(editingSchool.schoolId, editForm);
      setEditingSchool(null);
      setFeedback({ type: 'success', message: `School ${editingSchool.schoolId} updated.` });
      await loadAll();
    } catch (err: any) {
      setFeedback({ type: 'error', message: formatMasterWriteError(err, 'Failed to update school.') });
    } finally {
      setBusyActionId(null);
    }
  };

  const handleToggleSuspend = async (school: SaaSSchoolRecord) => {
    const effective = school.computedSubscription?.schoolStatus || school.status;
    const nextStatus: SaaSSchoolStatus =
      effective === 'suspended' || effective === 'pending' ? 'active' : 'suspended';
    setBusyActionId(school.schoolId);
    try {
      await SaaSApi.masterUpdateSchool(school.schoolId, { status: nextStatus });
      setFeedback({
        type: 'success',
        message:
          nextStatus === 'suspended'
            ? `School ${school.schoolId} suspended. School data preserved.`
            : `School ${school.schoolId} activated.`,
      });
      await loadAll();
    } catch (err: any) {
      setFeedback({ type: 'error', message: formatMasterWriteError(err, 'Failed to update school status.') });
    } finally {
      setBusyActionId(null);
    }
  };

  const handleConfirmDeleteSchool = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deletingSchool || !deleteConfirmChecked) return;
    const target = deletingSchool;
    setBusyActionId(target.schoolId);
    setFeedback(null);
    try {
      const res = await SaaSApi.masterDeleteSchool(target.schoolId);
      if (detailsData?.school.schoolId === target.schoolId) {
        setDetailsData(null);
      }
      if (credsModalSchoolId === target.schoolId) {
        setCredsModalSchoolId(null);
      }
      try {
        if (localStorage.getItem('school_erp_active_saas_school_id') === target.schoolId) {
          localStorage.removeItem('school_erp_active_saas_school_id');
        }
      } catch {
        // ignore storage errors
      }
      setDeletingSchool(null);
      setDeleteConfirmChecked(false);
      setFeedback({
        type: 'success',
        message:
          language === 'bn'
            ? `${target.schoolName} (${target.schoolId}) এবং এর সকল ডেটা, পেমেন্ট হিস্ট্রি ও ${res.deletedUsersCount ?? 0}টি ইউজার অ্যাকাউন্ট স্থায়ীভাবে ডিলিট করা হয়েছে।`
            : `Permanently deleted ${target.schoolName} (${target.schoolId}), all tenant data, payment history, and ${res.deletedUsersCount ?? 0} user login account(s).`,
      });
      await loadAll();
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: formatMasterWriteError(err, 'Failed to permanently delete school.'),
      });
    } finally {
      setBusyActionId(null);
    }
  };

  const handleExtendSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!extendingSchool) return;
    const days = Number(extendDays);
    if (!Number.isFinite(days) || days <= 0) return;
    setBusyActionId(extendingSchool.schoolId);
    try {
      await SaaSApi.masterUpdateSchool(extendingSchool.schoolId, {
        extendDays: days,
        planId: extendPlanId,
      });
      setExtendingSchool(null);
      setFeedback({
        type: 'success',
        message: `Extended subscription for ${extendingSchool.schoolId} by ${days} days.`,
      });
      await loadAll();
    } catch (err: any) {
      setFeedback({ type: 'error', message: formatMasterWriteError(err, 'Failed to extend subscription.') });
    } finally {
      setBusyActionId(null);
    }
  };

  const handleViewDetails = async (schoolId: string) => {
    setBusyActionId(schoolId);
    setVaultResetUid(null);
    setVaultResetPass('');
    setVaultResetMsg(null);
    try {
      let vaultErrMsg: string | null = null;
      const [res, vaultRes] = await Promise.all([
        SaaSApi.masterGetSchoolDetails(schoolId),
        SaaSApi.masterGetSchoolAdminCredentials(schoolId).catch((vErr: any) => {
          vaultErrMsg = vErr?.message || 'Could not load Super Admin vault credentials.';
          return { credentials: [] as SaaSSchoolAdminCredentialDTO[] };
        }),
      ]);
      setDetailsData({
        school: res.school,
        paymentHistory: res.paymentHistory,
        subscriptionHistory: res.subscriptionHistory,
        users: res.users,
        adminCredentials: vaultRes.credentials || [],
        vaultError: vaultErrMsg,
      });
    } catch (err: any) {
      if (isSaaSBackendUnavailableError(err)) {
        refreshServerDiagnostics();
        try {
          const [schoolSnap, paymentsSnap, historySnap, usersSnap] = await Promise.all([
            getDoc(doc(db, 'schools', schoolId)),
            getDocs(query(collection(db, 'payment_requests'), where('schoolId', '==', schoolId))),
            getDocs(query(collection(db, 'subscription_history'), where('schoolId', '==', schoolId))),
            getDocs(collection(db, 'schools', schoolId, 'users')),
          ]);
          if (schoolSnap.exists()) {
            const schoolData = schoolSnap.data() as SaaSSchoolRecord;
            const loadedUsers = usersSnap.docs.map((d) => d.data() as SaaSUserDTO);
            const fallbackSuperAdmins: SaaSSchoolAdminCredentialDTO[] = loadedUsers
              .filter((u) => u.schoolRole === 'super_admin')
              .map((u) => ({
                uid: u.uid,
                schoolId: schoolData.schoolId,
                schoolName: schoolData.schoolName,
                schoolCode: schoolData.schoolCode,
                email: u.email,
                displayName: u.displayName,
                phone: u.phone || '',
                schoolRole: 'super_admin',
                status: u.status,
                isPrimaryAdmin:
                  u.uid === schoolData.adminUid ||
                  u.email.toLowerCase() === (schoolData.adminEmail || '').toLowerCase(),
                managedPassword: null,
                hasStoredPassword: false,
                passwordUpdatedAt: null,
                updatedBy: null,
              }));
            setDetailsData({
              school: {
                ...schoolData,
                computedSubscription: computeClientSubscriptionState(schoolData, Date.now()),
              },
              paymentHistory: paymentsSnap.docs
                .map((d) => d.data() as SaaSPaymentRequestDTO)
                .sort((a, b) => (b.submittedAt || '').localeCompare(a.submittedAt || '')),
              subscriptionHistory: historySnap.docs
                .map((d) => d.data() as SaaSSubscriptionHistoryDTO)
                .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')),
              users: loadedUsers,
              adminCredentials: fallbackSuperAdmins,
            });
            return;
          }
        } catch {
          // Fall through to feedback error below
        }
      }
      setFeedback({ type: 'error', message: err?.message || 'Failed to load school details.' });
    } finally {
      setBusyActionId(null);
    }
  };

  const handleSaveVaultResetPassword = async (cred: SaaSSchoolAdminCredentialDTO) => {
    const cleanPass = vaultResetPass.trim();
    if (cleanPass.length < 6) {
      setVaultResetMsg({
        type: 'error',
        text: language === 'bn' ? 'পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।' : 'Password must be at least 6 characters.',
      });
      return;
    }
    setVaultResetBusy(true);
    setVaultResetMsg(null);
    try {
      await SaaSApi.updateUserCredentials(cred.uid, { password: cleanPass });
      const vaultRes = await SaaSApi.masterGetSchoolAdminCredentials(cred.schoolId).catch(() => null);
      if (vaultRes && detailsData?.school.schoolId === cred.schoolId) {
        setDetailsData((prev) => (prev ? { ...prev, adminCredentials: vaultRes.credentials } : prev));
      }
      setRevealedVaultUids((prev) => ({ ...prev, [cred.uid]: true }));
      setVaultResetUid(null);
      setVaultResetPass('');
      setVaultResetMsg({
        type: 'success',
        text:
          language === 'bn'
            ? `${cred.email}-এর নতুন পাসওয়ার্ড সেভ ও এনক্রিপ্টেড ভল্টে সংরক্ষণ করা হয়েছে।`
            : `Updated and encrypted password for ${cred.email}.`,
      });
    } catch (err: any) {
      setVaultResetMsg({
        type: 'error',
        text: formatMasterWriteError(err, 'Failed to update Super Admin password.'),
      });
    } finally {
      setVaultResetBusy(false);
    }
  };

  const copyTextToClipboard = (key: string, text: string) => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopiedVaultKey(key);
      setTimeout(() => setCopiedVaultKey(null), 2000);
    });
  };

  const handleApprovePayment = async (req: SaaSPaymentRequestDTO) => {
    setBusyActionId(req.id);
    setFeedback(null);
    try {
      const res = await SaaSApi.masterApprovePaymentRequest(req.id);
      setFeedback({
        type: 'success',
        message: `Approved TrxID ${req.transactionId} for ${req.schoolName} (${req.schoolId}). New expiry: ${new Date(
          res.school.subscription.expiryDate
        ).toLocaleDateString()}.`,
      });
      await loadAll();
    } catch (err: any) {
      setFeedback({ type: 'error', message: formatMasterWriteError(err, 'Approval failed.') });
    } finally {
      setBusyActionId(null);
    }
  };

  const handleConfirmReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectTarget) return;
    setBusyActionId(rejectTarget.id);
    try {
      await SaaSApi.masterRejectPaymentRequest(
        rejectTarget.id,
        rejectionReason || 'Payment verification failed'
      );
      setRejectTarget(null);
      setRejectionReason('');
      setFeedback({ type: 'success', message: 'Payment request rejected.' });
      await loadAll();
    } catch (err: any) {
      setFeedback({ type: 'error', message: formatMasterWriteError(err, 'Rejection failed.') });
    } finally {
      setBusyActionId(null);
    }
  };

  const openAddPlanModal = () => {
    setIsCreatingPlan(true);
    setNewPlanFeatureInput('');
    setEditingPlan({
      id: '',
      name: '',
      nameBn: '',
      durationDays: 30,
      priceBdt: 1500,
      discountPercent: 0,
      badgeText: '',
      features: [
        'সব মডিউল সম্পূর্ণ এক্সেস',
        'স্মার্ট QR ও ফেস হাজিরা',
        'ফি, ভাউচার ও একাউন্টস',
      ],
      sortOrder: plans.length + 10,
      isCustom: true,
      description: '',
      descriptionBn: '',
      isActive: true,
      updatedAt: new Date().toISOString(),
    });
  };

  const openEditPlanModal = (plan: SaaSPlanConfig) => {
    setIsCreatingPlan(false);
    setNewPlanFeatureInput('');
    setEditingPlan({
      ...plan,
      discountPercent: plan.discountPercent ?? 0,
      badgeText: plan.badgeText || '',
      features: Array.isArray(plan.features) ? [...plan.features] : [],
    });
  };

  const handleSavePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPlan) return;

    const cleanName = editingPlan.name.trim();
    if (!cleanName) {
      setFeedback({ type: 'error', message: language === 'bn' ? 'প্ল্যানের নাম লিখুন।' : 'Plan name is required.' });
      return;
    }

    const generatedSlug = (editingPlan.id || cleanName)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 48);

    const targetPlanId = isCreatingPlan ? generatedSlug : editingPlan.id;
    if (!targetPlanId || !/^[a-zA-Z0-9_-]{2,64}$/.test(targetPlanId)) {
      setFeedback({
        type: 'error',
        message:
          language === 'bn'
            ? 'প্ল্যান আইডি কমপক্ষে ২ অক্ষরের হতে হবে (ইংরেজি অক্ষর, সংখ্যা, _ বা -)।'
            : 'Plan ID must be at least 2 characters (letters, digits, _ or -).',
      });
      return;
    }

    const clampedDiscount = Math.min(100, Math.max(0, Math.round((Number(editingPlan.discountPercent) || 0) * 100) / 100));
    const cleanedFeatures = (editingPlan.features || []).map((f) => f.trim()).filter(Boolean);
    const updatedPayload: SaaSPlanConfig = {
      id: targetPlanId,
      name: cleanName,
      nameBn: (editingPlan.nameBn || cleanName).trim(),
      priceBdt: Math.max(0, Number(editingPlan.priceBdt) || 0),
      discountPercent: clampedDiscount,
      durationDays: Math.max(1, Math.round(Number(editingPlan.durationDays) || 30)),
      badgeText: (editingPlan.badgeText || '').trim(),
      features: cleanedFeatures,
      sortOrder: editingPlan.sortOrder ?? plans.length + 10,
      isCustom: isCreatingPlan ? !CORE_PLAN_IDS.has(targetPlanId) : editingPlan.isCustom,
      description: (editingPlan.description || '').trim(),
      descriptionBn: (editingPlan.descriptionBn || editingPlan.description || '').trim(),
      isActive: editingPlan.isActive,
      updatedAt: new Date().toISOString(),
    };

    setBusyActionId(targetPlanId);
    try {
      if (isCreatingPlan) {
        await SaaSApi.masterCreatePlan(updatedPayload);
        setFeedback({
          type: 'success',
          message:
            language === 'bn'
              ? `নতুন সাবস্ক্রিপশন প্ল্যান "${updatedPayload.nameBn}" (${clampedDiscount > 0 ? `${toBnNumber(clampedDiscount)}% ছাড়ে ` : ''}৳${toBnNumber(getEffectivePlanPriceBdt(updatedPayload))}) সফলভাবে যুক্ত হয়েছে!`
              : `New subscription plan "${updatedPayload.name}" added!`,
        });
      } else {
        await SaaSApi.masterUpdatePlan(targetPlanId, {
          name: updatedPayload.name,
          nameBn: updatedPayload.nameBn,
          priceBdt: updatedPayload.priceBdt,
          discountPercent: updatedPayload.discountPercent,
          durationDays: updatedPayload.durationDays,
          badgeText: updatedPayload.badgeText,
          features: updatedPayload.features,
          sortOrder: updatedPayload.sortOrder,
          description: updatedPayload.description,
          descriptionBn: updatedPayload.descriptionBn,
          isActive: updatedPayload.isActive,
        });
        setFeedback({
          type: 'success',
          message:
            language === 'bn'
              ? `প্ল্যান "${updatedPayload.nameBn}" আপডেট হয়েছে (চূড়ান্ত মূল্য: ${formatTaka(getEffectivePlanPriceBdt(updatedPayload))})।`
              : `Plan "${updatedPayload.name}" updated.`,
        });
      }
      setEditingPlan(null);
      setIsCreatingPlan(false);
      await loadAll();
    } catch (err: any) {
      if (isSaaSBackendUnavailableError(err)) {
        try {
          if (isCreatingPlan && plans.some((p) => p.id === targetPlanId)) {
            setFeedback({
              type: 'error',
              message:
                language === 'bn'
                  ? `"${targetPlanId}" আইডির একটি প্ল্যান ইতিমধ্যেই রয়েছে। অন্য আইডি দিন।`
                  : `Plan ID "${targetPlanId}" already exists.`,
            });
            return;
          }
          await setDoc(doc(db, 'subscription_plans', targetPlanId), updatedPayload, { merge: true });
          setEditingPlan(null);
          setIsCreatingPlan(false);
          setFeedback({
            type: 'success',
            message:
              language === 'bn'
                ? `প্ল্যান "${updatedPayload.nameBn}" সরাসরি ডাটাবেজে সেভ হয়েছে।`
                : `Plan "${updatedPayload.name}" saved to Firestore.`,
          });
          await loadAll();
          return;
        } catch (fsErr: any) {
          setFeedback({ type: 'error', message: fsErr?.message || 'Failed to save plan.' });
          return;
        }
      }
      setFeedback({ type: 'error', message: err?.message || 'Failed to save plan.' });
    } finally {
      setBusyActionId(null);
    }
  };

  const handleTogglePlanActive = async (plan: SaaSPlanConfig) => {
    const nextActive = !plan.isActive;
    setBusyActionId(plan.id);
    try {
      await SaaSApi.masterUpdatePlan(plan.id, { isActive: nextActive });
      setFeedback({
        type: 'success',
        message:
          language === 'bn'
            ? `"${plan.nameBn || plan.name}" ${nextActive ? 'সক্রিয় (Active)' : 'বন্ধ (Inactive)'} করা হয়েছে।`
            : `${plan.name} is now ${nextActive ? 'Active' : 'Inactive'}.`,
      });
      await loadAll();
    } catch (err: any) {
      if (isSaaSBackendUnavailableError(err)) {
        try {
          await setDoc(
            doc(db, 'subscription_plans', plan.id),
            { isActive: nextActive, updatedAt: new Date().toISOString() },
            { merge: true }
          );
          await loadAll();
          return;
        } catch (fsErr: any) {
          setFeedback({ type: 'error', message: fsErr?.message || 'Failed to update plan status.' });
          return;
        }
      }
      setFeedback({ type: 'error', message: err?.message || 'Failed to update plan status.' });
    } finally {
      setBusyActionId(null);
    }
  };

  const handleDeletePlan = async (plan: SaaSPlanConfig) => {
    if (CORE_PLAN_IDS.has(plan.id)) {
      setFeedback({
        type: 'error',
        message:
          language === 'bn'
            ? 'মূল ডিফল্ট প্ল্যান ডিলিট করা যাবে না; চাইলে ইনঅ্যাক্টিভ করে রাখতে পারেন।'
            : 'Built-in core plans cannot be deleted. You can pause/deactivate them instead.',
      });
      return;
    }
    setBusyActionId(plan.id);
    try {
      await SaaSApi.masterDeletePlan(plan.id);
      setFeedback({
        type: 'success',
        message:
          language === 'bn'
            ? `কাস্টম প্ল্যান "${plan.nameBn || plan.name}" মুছে ফেলা হয়েছে।`
            : `Custom plan "${plan.name}" deleted.`,
      });
      await loadAll();
    } catch (err: any) {
      if (isSaaSBackendUnavailableError(err)) {
        try {
          await deleteDoc(doc(db, 'subscription_plans', plan.id));
          setFeedback({
            type: 'success',
            message:
              language === 'bn'
                ? `কাস্টম প্ল্যান "${plan.nameBn || plan.name}" ডাটাবেজ থেকে মুছে ফেলা হয়েছে।`
                : `Custom plan "${plan.name}" deleted from Firestore.`,
          });
          await loadAll();
          return;
        } catch (fsErr: any) {
          setFeedback({ type: 'error', message: fsErr?.message || 'Failed to delete plan.' });
          return;
        }
      }
      setFeedback({ type: 'error', message: err?.message || 'Failed to delete plan.' });
    } finally {
      setBusyActionId(null);
    }
  };

  const handleSavePaymentChannels = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingChannels(true);
    setFeedback(null);
    try {
      const res = await SaaSApi.masterUpdatePaymentChannels(paymentChannels);
      setPaymentChannels(res.channels);
      setFeedback({
        type: 'success',
        message:
          language === 'bn'
            ? 'আপনার bKash / Nagad / Bank নম্বর সফলভাবে সেভ হয়েছে! এখন সকল স্কুলের বিলিং পেজে এই নম্বরগুলো দেখাবে।'
            : 'bKash / Nagad / Bank payment channels saved! All schools now see these live numbers on their Subscription & Renewal page.',
      });
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: formatMasterWriteError(err, 'Failed to save payment channels.'),
      });
    } finally {
      setSavingChannels(false);
    }
  };

  const statusBadge = (status: string) => {
    if (status === 'active' || status === 'Active') {
      return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    }
    if (status === 'suspended' || status === 'Suspended') {
      return 'bg-rose-100 text-rose-800 border-rose-200';
    }
    if (status === 'expired' || status === 'Expired') {
      return 'bg-orange-100 text-orange-800 border-orange-200';
    }
    return 'bg-amber-100 text-amber-800 border-amber-200';
  };

  const planCatalogIds = useMemo(() => {
    const ids: SaaSPlanId[] = [];
    const seen = new Set<string>();
    for (const p of plans) {
      if (!seen.has(p.id)) {
        seen.add(p.id);
        ids.push(p.id);
      }
    }
    for (const p of DEFAULT_FALLBACK_PLANS) {
      if (!seen.has(p.id)) {
        seen.add(p.id);
        ids.push(p.id);
      }
    }
    return ids;
  }, [plans]);

  const getPlanLabel = (planKey: SaaSPlanId): { en: string; bn: string } => {
    const live = plans.find((p) => p.id === planKey) || DEFAULT_FALLBACK_PLANS.find((p) => p.id === planKey);
    if (live) {
      return {
        en: live.name,
        bn: live.nameBn || live.name,
      };
    }
    return { en: String(planKey), bn: String(planKey) };
  };

  const saasLauncherItems: LauncherTileItem[] = [
    {
      id: 'schools',
      label: language === 'bn' ? 'স্কুল তালিকা' : 'Schools',
      icon: Building2,
      color: 'blue',
      active: activeSubTab === 'schools',
      badge: schools.length,
      onClick: () => setActiveSubTab('schools'),
    },
    {
      id: 'payments',
      label: language === 'bn' ? 'পেমেন্ট যাচাই' : 'Approvals',
      icon: CreditCard,
      color: 'amber',
      active: activeSubTab === 'payments',
      badge: analytics?.pendingPaymentsCount || undefined,
      onClick: () => setActiveSubTab('payments'),
    },
    {
      id: 'plans',
      label: language === 'bn' ? 'সাবস্ক্রিপশন প্ল্যান' : 'Plans',
      icon: Sliders,
      color: 'purple',
      active: activeSubTab === 'plans',
      onClick: () => setActiveSubTab('plans'),
    },
    {
      id: 'payment_channels',
      label: language === 'bn' ? 'বিকাশ / নগদ' : 'Payment Setup',
      icon: Smartphone,
      color: 'red',
      active: activeSubTab === 'payment_channels',
      onClick: () => setActiveSubTab('payment_channels'),
    },
    {
      id: 'support',
      label: language === 'bn' ? 'সাপোর্ট টিম' : 'Support Team',
      icon: Headphones,
      color: 'teal',
      active: activeSubTab === 'support',
      badge: unreadSupportCount || undefined,
      onClick: () => setActiveSubTab('support'),
    },
  ];

  return (
    <div className="space-y-5">
      {/* App-Launcher Icon Tile Grid */}
      <LauncherIconGrid items={saasLauncherItems} columns={5} compact />

      {/* Analytics KPI Grid (1-Click Filters) */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <button
          type="button"
          onClick={() => {
            setActiveSubTab('schools');
            setSchoolStatusFilter('all');
            setSchoolPlanFilter('all');
          }}
          className={`p-4 bg-white rounded-2xl border text-left transition-all shadow-2xs hover:border-slate-400 ${
            activeSubTab === 'schools' && schoolStatusFilter === 'all' && schoolPlanFilter === 'all'
              ? 'border-slate-900 ring-2 ring-slate-900/15'
              : 'border-slate-200'
          }`}
        >
          <div className="text-[10px] font-bold uppercase text-slate-500">
            {language === 'bn' ? 'মোট স্কুল' : 'Total Schools'}
          </div>
          <div className="text-2xl font-black text-slate-900 mt-1">
            {language === 'bn' ? toBnNumber(analytics?.totalSchools || 0) : analytics?.totalSchools || 0}
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveSubTab('schools');
            setSchoolStatusFilter('active');
          }}
          className={`p-4 bg-emerald-50/70 rounded-2xl border text-left transition-all hover:border-emerald-400 ${
            activeSubTab === 'schools' && schoolStatusFilter === 'active'
              ? 'border-emerald-600 ring-2 ring-emerald-500/25'
              : 'border-emerald-200'
          }`}
        >
          <div className="text-[10px] font-bold uppercase text-emerald-700">
            {language === 'bn' ? 'সক্রিয় স্কুল' : 'Active'}
          </div>
          <div className="text-2xl font-black text-emerald-900 mt-1">
            {language === 'bn' ? toBnNumber(analytics?.activeSchools || 0) : analytics?.activeSchools || 0}
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveSubTab('schools');
            setSchoolStatusFilter('expired');
            setSchoolSortBy('expiry_asc');
          }}
          className={`p-4 bg-orange-50/70 rounded-2xl border text-left transition-all hover:border-orange-400 ${
            activeSubTab === 'schools' && schoolStatusFilter === 'expired'
              ? 'border-orange-600 ring-2 ring-orange-500/25'
              : 'border-orange-200'
          }`}
        >
          <div className="text-[10px] font-bold uppercase text-orange-700">
            {language === 'bn' ? 'মেয়াদোত্তীর্ণ' : 'Expired'}
          </div>
          <div className="text-2xl font-black text-orange-900 mt-1">
            {language === 'bn' ? toBnNumber(analytics?.expiredSchools || 0) : analytics?.expiredSchools || 0}
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveSubTab('schools');
            setSchoolStatusFilter('suspended');
          }}
          className={`p-4 bg-rose-50/70 rounded-2xl border text-left transition-all hover:border-rose-400 ${
            activeSubTab === 'schools' && schoolStatusFilter === 'suspended'
              ? 'border-rose-600 ring-2 ring-rose-500/25'
              : 'border-rose-200'
          }`}
        >
          <div className="text-[10px] font-bold uppercase text-rose-700">
            {language === 'bn' ? 'স্থগিত স্কুল' : 'Suspended'}
          </div>
          <div className="text-2xl font-black text-rose-900 mt-1">
            {language === 'bn' ? toBnNumber(analytics?.suspendedSchools || 0) : analytics?.suspendedSchools || 0}
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveSubTab('schools');
            setSchoolStatusFilter('pending');
          }}
          className={`p-4 bg-amber-50/70 rounded-2xl border text-left transition-all hover:border-amber-400 ${
            activeSubTab === 'schools' && schoolStatusFilter === 'pending'
              ? 'border-amber-600 ring-2 ring-amber-500/25'
              : 'border-amber-200'
          }`}
        >
          <div className="text-[10px] font-bold uppercase text-amber-700">
            {language === 'bn' ? 'অপেক্ষমাণ স্কুল' : 'Pending Apps'}
          </div>
          <div className="text-2xl font-black text-amber-900 mt-1">
            {language === 'bn' ? toBnNumber(analytics?.pendingSchools || 0) : analytics?.pendingSchools || 0}
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveSubTab('payments');
            setPaymentStatusFilter('pending');
          }}
          className={`p-4 bg-blue-50/70 rounded-2xl border text-left transition-all hover:border-blue-400 ${
            activeSubTab === 'payments' && paymentStatusFilter === 'pending'
              ? 'border-blue-600 ring-2 ring-blue-500/25'
              : 'border-blue-200'
          }`}
        >
          <div className="text-[10px] font-bold uppercase text-blue-700">
            {language === 'bn' ? 'বকেয়া যাচাই' : 'Pending Pay'}
          </div>
          <div className="text-2xl font-black text-blue-900 mt-1">
            {language === 'bn'
              ? toBnNumber(analytics?.pendingPaymentsCount || 0)
              : analytics?.pendingPaymentsCount || 0}
          </div>
        </button>

        <div className="p-4 bg-indigo-50/70 rounded-2xl border border-indigo-200 col-span-2 md:col-span-2 lg:col-span-1">
          <div className="text-[10px] font-bold uppercase text-indigo-700">
            {language === 'bn' ? 'মোট আয়' : 'Total Revenue'}
          </div>
          <div className="text-lg font-black text-indigo-900 mt-1 truncate">
            {formatTaka(analytics?.totalRevenue || 0)}
          </div>
        </div>
      </div>

      {/* Plan distribution bar (1-Click Plan Filter) */}
      {analytics && analytics.totalSchools > 0 && (
        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-2xs flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center space-x-2 font-bold text-slate-800">
            <TrendingUp className="w-4 h-4 text-blue-600" />
            <span>
              {language === 'bn'
                ? '১-ক্লিকে প্ল্যান অনুযায়ী স্কুল দেখুন:'
                : '1-Click Plan Filter:'}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setActiveSubTab('schools');
                setSchoolPlanFilter('all');
              }}
              className={`px-3 py-1.5 rounded-lg border font-semibold transition-all ${
                schoolPlanFilter === 'all' && activeSubTab === 'schools'
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {language === 'bn' ? 'সব প্ল্যান' : 'All Plans'} ({schools.length})
            </button>
            {planCatalogIds.map((planKey) => {
              const count = analytics.planDistribution?.[planKey] ?? schoolFilterCounts.plans[planKey] ?? 0;
              const isSelected = activeSubTab === 'schools' && schoolPlanFilter === planKey;
              const lbl = getPlanLabel(planKey);
              return (
                <button
                  key={planKey}
                  type="button"
                  onClick={() => {
                    setActiveSubTab('schools');
                    setSchoolPlanFilter((prev) => (prev === planKey ? 'all' : planKey));
                  }}
                  className={`px-3 py-1.5 rounded-lg border font-semibold transition-all ${
                    isSelected
                      ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                      : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-blue-50 hover:border-blue-300'
                  }`}
                >
                  {language === 'bn' ? lbl.bn : lbl.en}:{' '}
                  <strong>{language === 'bn' ? toBnNumber(count) : count}</strong>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {firestoreFallbackActive && (
        <div className="p-4 rounded-2xl border bg-amber-50 border-amber-300 text-amber-950 text-xs space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="font-extrabold">
                  {fallbackTriggerCode === 'ADMIN_CREDENTIAL_INVALID' ||
                  serverDiagnostics?.initStatus === 'invalid_credentials'
                    ? language === 'bn'
                      ? 'সার্ভারের Firebase সার্ভিস অ্যাকাউন্ট Key-টি বাতিল/ডিলিট করা হয়েছে বা অকার্যকর (ADMIN_CREDENTIAL_INVALID)'
                      : 'Server Firebase Service Account Key Is Invalid or Revoked'
                    : fallbackTriggerCode === 'ADMIN_IAM_PERMISSION_DENIED'
                    ? language === 'bn'
                      ? 'Firebase প্রজেক্টে সার্ভারের IAM অনুমোদন এখনো যুক্ত হয়নি'
                      : 'Firebase Project IAM Permissions Needed for Server Admin SDK'
                    : serverDiagnostics?.adminSdkReady
                    ? language === 'bn'
                      ? `সার্ভার সংযুক্ত আছে, তবে প্রথম লোডে সময় লেগেছে (${fallbackTriggerCode || 'TIMEOUT'})`
                      : `Backend Admin SDK is ready, but initial data load timed out (${fallbackTriggerCode || 'TIMEOUT'})`
                    : (healthProbeError === 'NON_JSON_RESPONSE' || fallbackTriggerCode === 'NON_JSON_RESPONSE') &&
                      isNetlifyHostingEnvironment(serverDiagnostics)
                    ? language === 'bn'
                      ? 'Netlify Functions (/api/saas/*) পাওয়া যাচ্ছে না — সাইটটি শুধু স্ট্যাটিক ফোল্ডার হিসেবে ডিপ্লয় হয়েছে'
                      : 'Netlify Functions (/api/saas/*) returned HTML instead of API JSON'
                    : healthProbeError === 'NON_JSON_RESPONSE' || fallbackTriggerCode === 'NON_JSON_RESPONSE'
                    ? language === 'bn'
                      ? 'ব্যাকএন্ড API সাময়িকভাবে সাড়া দিচ্ছে না বা রিস্টার্ট হচ্ছে'
                      : 'Backend API temporarily returned non-JSON (server restarting)'
                    : serverDiagnostics?.initStatus === 'invalid_json'
                    ? language === 'bn'
                      ? 'সার্ভারের FIREBASE_SERVICE_ACCOUNT_JSON ফরম্যাটে ত্রুটি (invalid_json)'
                      : 'Server FIREBASE_SERVICE_ACCOUNT_JSON Parse Error (invalid_json)'
                    : serverDiagnostics?.initStatus === 'missing_fields'
                    ? language === 'bn'
                      ? 'সার্ভারের FIREBASE_SERVICE_ACCOUNT_JSON অসম্পূর্ণ (client_email / private_key নেই)'
                      : 'Server FIREBASE_SERVICE_ACCOUNT_JSON Missing Required Fields'
                    : language === 'bn'
                    ? 'সার্ভারে Firebase Admin SDK সংযুক্ত নয় — তাই নতুন স্কুল তৈরি ও ইউজার লগইন/পাসওয়ার্ড পরিবর্তন বন্ধ রয়েছে'
                    : 'Server Firebase Admin SDK Unavailable — Creating Schools & Provisioning Users Disabled'}
                </div>
                <p className="text-[11px] text-amber-900 leading-relaxed">
                  {fallbackTriggerCode === 'ADMIN_CREDENTIAL_INVALID' ||
                  serverDiagnostics?.initStatus === 'invalid_credentials'
                    ? language === 'bn'
                      ? 'Netlify বা সার্ভারের FIREBASE_SERVICE_ACCOUNT_JSON-এ থাকা পুরনো Key-টি ডিলিট বা রিভোক করা হয়েছে। Firebase Console → Project settings → Service accounts থেকে নতুন JSON Key ডাউনলোড করে Netlify Environment Variables-এ FIREBASE_SERVICE_ACCOUNT_JSON আপডেট করুন এবং "Clear cache and deploy site" দিন।'
                      : 'The service account key in FIREBASE_SERVICE_ACCOUNT_JSON was deleted or revoked. Download a fresh JSON key from Firebase Console → Service accounts, update FIREBASE_SERVICE_ACCOUNT_JSON on Netlify, and trigger "Clear cache and deploy site".'
                    : fallbackTriggerCode === 'ADMIN_IAM_PERMISSION_DENIED'
                    ? language === 'bn'
                      ? 'স্কুল ও পেমেন্ট তথ্য সরাসরি Firestore থেকে লোড হয়েছে। নতুন স্কুল/ইউজার তৈরি চালু করতে আপনার Google Cloud প্রজেক্টের IAM-এ সার্ভার সার্ভিস একাউন্টকে Cloud Datastore User, Firebase Authentication Admin এবং Service Usage Consumer রোল দিয়ে "পুনরায় সংযোগ করুন" চাপুন।'
                      : 'School records loaded via client Firestore fallback. Grant Cloud Datastore User, Firebase Authentication Admin, and Service Usage Consumer in Google Cloud IAM, then click Retry.'
                    : serverDiagnostics?.adminSdkReady
                    ? language === 'bn'
                      ? 'ডাটা সাময়িকভাবে Firestore থেকে লোড হয়েছে। সার্ভার কাজ করছে — নিচের "পুনরায় সংযোগ করুন" বাটনে চাপ দিন।'
                      : 'Records loaded via Firestore fallback due to a slow cold start or temporary network timeout. Click Retry below to reconnect.'
                    : (healthProbeError === 'NON_JSON_RESPONSE' || fallbackTriggerCode === 'NON_JSON_RESPONSE') &&
                      isNetlifyHostingEnvironment(serverDiagnostics)
                    ? language === 'bn'
                      ? 'আপনি যদি শুধু build/dist ফোল্ডার Netlify-তে Drop করে থাকেন, তাহলে সার্ভার ফাংশন (netlify/functions/api.ts) ডিপ্লয় হয়নি। পুরো প্রোজেক্ট GitHub বা Netlify CLI থেকে ডিপ্লয় করুন।'
                      : 'If you deployed only the static dist folder, serverless functions (netlify/functions/api.ts) were not deployed. Deploy the full repository via GitHub or Netlify CLI.'
                    : healthProbeError === 'NON_JSON_RESPONSE' || fallbackTriggerCode === 'NON_JSON_RESPONSE'
                    ? language === 'bn'
                      ? 'সার্ভার রিস্টার্ট হওয়ার কারণে এমন হতে পারে। কয়েক সেকেন্ড পর "পুনরায় সংযোগ করুন" বাটনে চাপ দিন।'
                      : 'The server may be restarting. Click Retry below in a few seconds.'
                    : language === 'bn'
                    ? 'স্কুল ও পেমেন্ট তথ্য সরাসরি Firestore থেকে লোড হয়েছে। কিন্তু নতুন স্কুল তৈরি, সুপার অ্যাডমিনের পাসওয়ার্ড রিসেট বা নতুন ইউজার তৈরি করতে সার্ভার এনভায়রনমেন্টে Firebase Admin Credential থাকা বাধ্যতামূলক।'
                    : 'Live school records are shown via Firestore fallback, but creating new schools, provisioning user logins, or resetting passwords requires Firebase Admin credentials on the backend server.'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={loadAll}
                className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-[11px]"
              >
                {language === 'bn' ? 'পুনরায় সংযোগ করুন' : 'Retry'}
              </button>
              <button
                type="button"
                onClick={() => setFirestoreFallbackActive(false)}
                className="px-2 font-bold text-amber-700 hover:text-amber-950"
              >
                ✕
              </button>
            </div>
          </div>
          {!serverDiagnostics?.adminSdkReady &&
            fallbackTriggerCode !== 'ADMIN_IAM_PERMISSION_DENIED' &&
            healthProbeError !== 'NON_JSON_RESPONSE' &&
            fallbackTriggerCode !== 'NON_JSON_RESPONSE' &&
            isNetlifyHostingEnvironment(serverDiagnostics) && (
              <div className="p-2.5 rounded-xl bg-white/80 border border-amber-200 text-[11px] text-slate-800 space-y-1">
                <div className="font-bold text-slate-900">
                  {language === 'bn' ? 'Netlify-এ সমাধান করার সহজ ৩টি ধাপ:' : '3-Step Fix on Netlify:'}
                </div>
                <ol className="list-decimal list-inside space-y-0.5">
                  <li>
                    {language === 'bn'
                      ? 'Netlify Dashboard → Site configuration → Environment variables-এ যান এবং FIREBASE_SERVICE_ACCOUNT_JSON (অথবা FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY) যোগ করুন।'
                      : 'Open Netlify → Site configuration → Environment variables and add FIREBASE_SERVICE_ACCOUNT_JSON (or split FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY).'}
                  </li>
                  <li>
                    {language === 'bn'
                      ? 'Scopes অপশনে অবশ্যই "All scopes" (অথবা "Functions") টিক দিন।'
                      : 'Set Scopes to "All scopes" (Functions runtime must have access).'}
                  </li>
                  <li>
                    {language === 'bn'
                      ? 'Deploys ট্যাব থেকে "Trigger deploy → Clear cache and deploy site" দিন।'
                      : 'Open Deploys → Trigger deploy → "Clear cache and deploy site".'}
                  </li>
                </ol>
              </div>
            )}
        </div>
      )}

      {lastCreatedCreds && (
        <div className="p-4 rounded-2xl border border-emerald-300 bg-emerald-50 text-emerald-950 text-xs space-y-2.5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2 font-black text-emerald-900">
              <KeyRound className="w-4 h-4 text-emerald-600" />
              <span>
                {language === 'bn'
                  ? `নতুন স্কুল সুপার অ্যাডমিন লগইন তথ্য সংরক্ষিত হয়েছে — ${lastCreatedCreds.schoolName} (${lastCreatedCreds.schoolId})`
                  : `New School Super Admin Credentials Saved — ${lastCreatedCreds.schoolName} (${lastCreatedCreds.schoolId})`}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setLastCreatedCreds(null)}
              className="px-2 font-bold text-emerald-700 hover:text-emerald-950"
            >
              ✕
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 bg-white p-3 rounded-xl border border-emerald-200">
            <div>
              <div className="text-[10px] text-slate-500 font-semibold">Super Admin</div>
              <div className="font-bold text-slate-900">{lastCreatedCreds.adminName}</div>
            </div>
            <div>
              <div className="text-[10px] text-slate-500 font-semibold">Login ID</div>
              <div className="font-mono font-bold text-slate-900">
                {formatDisplayLoginId({
                  username: lastCreatedCreds.adminUsername,
                  email: lastCreatedCreds.adminEmail,
                })}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-slate-500 font-semibold">Initial Password</div>
              <div className="flex items-center gap-1.5">
                <span className="font-mono font-black text-emerald-800">
                  {showLastCreatedPass ? lastCreatedCreds.adminPassword : '••••••••'}
                </span>
                <button
                  type="button"
                  onClick={() => setShowLastCreatedPass((p) => !p)}
                  className="p-1 rounded hover:bg-slate-100 text-slate-600"
                  title={showLastCreatedPass ? 'Hide' : 'Show'}
                >
                  {showLastCreatedPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    copyTextToClipboard(
                      'new_school',
                      `School ID: ${lastCreatedCreds.schoolId}\nSchool: ${lastCreatedCreds.schoolName}\nLogin ID: ${formatDisplayLoginId({
                        username: lastCreatedCreds.adminUsername,
                        email: lastCreatedCreds.adminEmail,
                      })}\nPassword: ${lastCreatedCreds.adminPassword}`
                    )
                  }
                  className="px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold inline-flex items-center gap-1"
                >
                  {copiedVaultKey === 'new_school' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedVaultKey === 'new_school' ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {feedback && (
        <div
          className={`p-3.5 rounded-xl border text-xs font-semibold flex items-center justify-between ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <span>{feedback.message}</span>
          <button onClick={() => setFeedback(null)} className="px-2 font-bold">
            ✕
          </button>
        </div>
      )}

      {(analytics?.pendingPaymentsCount || 0) > 0 && (
        <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-300 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start space-x-2.5 text-xs">
            <BellRing className="w-4 h-4 text-amber-600 shrink-0 mt-0.5 animate-pulse" />
            <div>
              <span className="font-black text-amber-950">
                {language === 'bn'
                  ? `${toBnNumber(analytics?.pendingPaymentsCount || 0)}টি স্কুলের পেমেন্ট অনুমোদনের অপেক্ষায় আছে`
                  : `${analytics?.pendingPaymentsCount || 0} School Payment Request(s) Pending Approval`}
              </span>
              <p className="text-[11px] text-amber-800 mt-0.5">
                {language === 'bn'
                  ? 'স্কুলগুলোর পাঠানো বিকাশ/নগদ TrxID যাচাই করে Approve করলেই সাবস্ক্রিপশন চালু/নবায়ন হবে।'
                  : 'Verify the sender number & TrxID in Payment Approvals and click Approve to activate/renew access.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setActiveSubTab('payments');
              setPaymentStatusFilter('pending');
            }}
            className="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shrink-0 self-start sm:self-center"
          >
            {language === 'bn' ? 'পেমেন্ট যাচাই ও অনুমোদন করুন →' : 'Review Approvals →'}
          </button>
        </div>
      )}

      {/* Sub-navigation & Refresh */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200 shadow-2xs">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveSubTab('schools')}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center space-x-1.5 transition-all ${
              activeSubTab === 'schools'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Building2 className="w-4 h-4" />
            <span>{language === 'bn' ? 'স্কুল তালিকা ও ব্যবস্থাপনা' : `Schools (${schools.length})`}</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('payments')}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center space-x-1.5 transition-all ${
              activeSubTab === 'payments'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <CreditCard className="w-4 h-4" />
            <span>
              {language === 'bn'
                ? `পেমেন্ট যাচাই (${analytics?.pendingPaymentsCount || 0})`
                : `Payment Approvals (${analytics?.pendingPaymentsCount || 0} pending)`}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('plans')}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center space-x-1.5 transition-all ${
              activeSubTab === 'plans'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Sliders className="w-4 h-4" />
            <span>{language === 'bn' ? 'সাবস্ক্রিপশন প্ল্যান' : 'Subscription Plans'}</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('payment_channels')}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center space-x-1.5 transition-all ${
              activeSubTab === 'payment_channels'
                ? 'bg-pink-600 text-white shadow-sm'
                : 'bg-pink-50 text-pink-700 border border-pink-200 hover:bg-pink-100'
            }`}
          >
            <Smartphone className="w-4 h-4" />
            <span>{language === 'bn' ? 'বিকাশ / নগদ নম্বর' : 'bKash / Nagad Setup'}</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('support')}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center space-x-1.5 transition-all ${
              activeSubTab === 'support'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100'
            }`}
          >
            <Headphones className="w-4 h-4" />
            <span>
              {language === 'bn' ? 'সাপোর্ট টিম' : 'Support Team'}
              {unreadSupportCount > 0
                ? ` (${language === 'bn' ? toBnNumber(unreadSupportCount) : unreadSupportCount})`
                : ''}
            </span>
          </button>
        </div>

        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={loadAll}
            disabled={loading}
            className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 flex items-center space-x-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>{language === 'bn' ? 'রিফ্রেশ' : 'Refresh'}</span>
          </button>
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-sm flex items-center space-x-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>{language === 'bn' ? 'নতুন স্কুল তৈরি করুন' : 'Create New School'}</span>
          </button>
        </div>
      </div>

      {/* TAB 1: SCHOOLS DIRECTORY */}
      {activeSubTab === 'schools' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 space-y-3">
            <div className="flex flex-col sm:flex-row gap-3 justify-between">
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  value={schoolSearch}
                  onChange={(e) => setSchoolSearch(e.target.value)}
                  placeholder={
                    language === 'bn'
                      ? 'স্কুল আইডি, নাম, কোড বা ইমেইল দিয়ে খুঁজুন...'
                      : 'Search by School ID, name, code, or admin email...'
                  }
                  className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-xs"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={schoolSortBy}
                  onChange={(e) => setSchoolSortBy(e.target.value as 'newest' | 'expiry_asc')}
                  className="px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold bg-white"
                >
                  <option value="newest">
                    {language === 'bn' ? 'সাজান: নতুন স্কুল আগে' : 'Sort: Newest First'}
                  </option>
                  <option value="expiry_asc">
                    {language === 'bn' ? 'সাজান: মেয়াদ আগে শেষ হবে' : 'Sort: Expiry Soonest First'}
                  </option>
                </select>

                {(schoolSearch || schoolStatusFilter !== 'all' || schoolPlanFilter !== 'all') && (
                  <button
                    type="button"
                    onClick={() => {
                      setSchoolSearch('');
                      setSchoolStatusFilter('all');
                      setSchoolPlanFilter('all');
                    }}
                    className="px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-bold text-slate-700"
                  >
                    {language === 'bn' ? 'ফিল্টার রিসেট' : 'Reset Filters'}
                  </button>
                )}
              </div>
            </div>

            {/* 1-Click Status & Expiry Filter Chips */}
            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
              <span className="font-bold text-slate-500 mr-1">
                {language === 'bn' ? 'মেয়াদ ও স্ট্যাটাস:' : 'Status & Expiry:'}
              </span>
              {[
                { id: 'all', bn: 'সবগুলো', en: 'All', count: schoolFilterCounts.total, activeCls: 'bg-slate-900 text-white border-slate-900' },
                { id: 'active', bn: 'সক্রিয়', en: 'Active', count: schoolFilterCounts.active, activeCls: 'bg-emerald-600 text-white border-emerald-600' },
                { id: 'expiring_7', bn: '৭ দিনে শেষ হবে', en: 'Expiring ≤7d', count: schoolFilterCounts.expiring_7, activeCls: 'bg-amber-600 text-white border-amber-600' },
                { id: 'expiring_30', bn: '৩০ দিনে শেষ হবে', en: 'Expiring ≤30d', count: schoolFilterCounts.expiring_30, activeCls: 'bg-yellow-600 text-white border-yellow-600' },
                { id: 'expired', bn: 'মেয়াদোত্তীর্ণ (শেষ)', en: 'Expired', count: schoolFilterCounts.expired, activeCls: 'bg-orange-600 text-white border-orange-600' },
                { id: 'suspended', bn: 'স্থগিত', en: 'Suspended', count: schoolFilterCounts.suspended, activeCls: 'bg-rose-600 text-white border-rose-600' },
              ].map((item) => {
                const isActive = schoolStatusFilter === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setSchoolStatusFilter(item.id);
                      if (item.id === 'expiring_7' || item.id === 'expiring_30' || item.id === 'expired') {
                        setSchoolSortBy('expiry_asc');
                      }
                    }}
                    className={`px-2.5 py-1 rounded-lg border font-bold transition-all ${
                      isActive
                        ? item.activeCls
                        : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {language === 'bn' ? item.bn : item.en} ({language === 'bn' ? toBnNumber(item.count) : item.count})
                  </button>
                );
              })}
            </div>

            {/* 1-Click Plan Filter Chips */}
            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
              <span className="font-bold text-slate-500 mr-1">
                {language === 'bn' ? 'প্যাকেজ/প্ল্যান:' : 'Plan:'}
              </span>
              <button
                type="button"
                onClick={() => setSchoolPlanFilter('all')}
                className={`px-2.5 py-1 rounded-lg border font-bold transition-all ${
                  schoolPlanFilter === 'all'
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                }`}
              >
                {language === 'bn' ? 'সব প্ল্যান' : 'All Plans'} ({language === 'bn' ? toBnNumber(schools.length) : schools.length})
              </button>
              {planCatalogIds.map((pid) => {
                const count = schoolFilterCounts.plans[pid] || 0;
                const isActive = schoolPlanFilter === pid;
                const lbl = getPlanLabel(pid);
                return (
                  <button
                    key={pid}
                    type="button"
                    onClick={() => setSchoolPlanFilter((prev) => (prev === pid ? 'all' : pid))}
                    className={`px-2.5 py-1 rounded-lg border font-bold transition-all ${
                      isActive
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-blue-50 hover:border-blue-300'
                    }`}
                  >
                    {language === 'bn' ? lbl.bn : lbl.en} ({language === 'bn' ? toBnNumber(count) : count})
                  </button>
                );
              })}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider">
                  <th className="py-3 px-4">School ID & Name</th>
                  <th className="py-3 px-4">Principal & Admin</th>
                  <th className="py-3 px-4">Plan & Dates</th>
                  <th className="py-3 px-4 text-center">Remaining / Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredSchools.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-10 text-center text-slate-400">
                      {loading
                        ? language === 'bn'
                          ? 'স্কুল তালিকা লোড হচ্ছে...'
                          : 'Loading schools...'
                        : language === 'bn'
                        ? 'এই ফিল্টার অনুযায়ী কোনো স্কুল পাওয়া যায়নি।'
                        : 'No schools matched your selected filter.'}
                    </td>
                  </tr>
                ) : (
                  filteredSchools.map((s) => {
                    const comp = s.computedSubscription;
                    const effStatus = comp?.schoolStatus || s.status;
                    const isExpiringSoon =
                      effStatus === 'active' && !comp?.isExpired && (comp?.remainingDays ?? 999) <= 7;
                    return (
                      <tr key={s.schoolId} className="hover:bg-slate-50/70">
                        <td className="py-3.5 px-4">
                          <div className="flex items-center space-x-2">
                            <span className="px-2 py-0.5 rounded bg-slate-900 text-white font-mono font-bold text-[11px]">
                              {s.schoolId}
                            </span>
                            <span className="font-bold text-slate-900">{s.schoolName}</span>
                          </div>
                          <div className="text-[11px] text-slate-500 mt-1">
                            Code: <strong className="font-mono">{s.schoolCode}</strong> • {s.contactNumber}
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-slate-800">{s.adminName}</div>
                          <div className="text-[11px] text-slate-500 font-mono">
                            {formatDisplayLoginId({ username: s.adminUsername, email: s.adminEmail })}
                          </div>
                          <div className="text-[10px] text-slate-400">Principal: {s.principalName}</div>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="font-bold text-slate-900">{s.subscription.planName}</div>
                          <div className="text-[11px] text-slate-500">
                            {new Date(s.subscription.startDate).toLocaleDateString()} →{' '}
                            {new Date(s.subscription.expiryDate).toLocaleDateString()}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <span
                            className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold border uppercase ${statusBadge(
                              effStatus
                            )}`}
                          >
                            {effStatus}
                          </span>
                          <div
                            className={`text-[11px] mt-1 font-semibold ${
                              comp?.isExpired
                                ? 'text-orange-700'
                                : isExpiringSoon
                                ? 'text-amber-700'
                                : 'text-slate-600'
                            }`}
                          >
                            {effStatus === 'suspended'
                              ? 'Access Blocked'
                              : comp?.isExpired
                              ? `Expired ${comp.expiredDays}d ago`
                              : s.subscription.planId === 'lifetime' || (comp?.remainingDays ?? 0) >= 10000
                              ? language === 'bn'
                                ? 'আজীবন (Lifetime)'
                                : 'Lifetime'
                              : `${comp?.remainingDays ?? 0}d left`}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-right whitespace-nowrap space-x-1">
                          <button
                            type="button"
                            onClick={() => handleViewDetails(s.schoolId)}
                            className="p-1.5 px-2 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-700 font-semibold inline-flex items-center space-x-1"
                            title="View Details, Payments & History"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Details</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setCredsModalSchoolId(s.schoolId)}
                            className="p-1.5 px-2 rounded-lg border border-purple-200 bg-purple-50 hover:bg-purple-100 text-purple-700 font-semibold inline-flex items-center space-x-1"
                            title="Manage Users & Passwords"
                          >
                            <KeyRound className="w-3.5 h-3.5" />
                            <span>Users</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(s)}
                            className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-700 inline-flex items-center"
                            title="Edit School"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setExtendingSchool(s);
                              setExtendPlanId(s.subscription.planId);
                              setExtendDays('30');
                            }}
                            className="p-1.5 px-2 rounded-lg border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold inline-flex items-center space-x-1"
                            title="Extend Subscription"
                          >
                            <CalendarPlus className="w-3.5 h-3.5" />
                            <span>Extend</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleSuspend(s)}
                            disabled={busyActionId === s.schoolId}
                            className={`p-1.5 px-2 rounded-lg border font-semibold inline-flex items-center space-x-1 ${
                              effStatus === 'suspended' || effStatus === 'pending'
                                ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
                                : 'bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100'
                            }`}
                          >
                            {effStatus === 'suspended' || effStatus === 'pending' ? (
                              <>
                                <Unlock className="w-3.5 h-3.5" />
                                <span>Activate</span>
                              </>
                            ) : (
                              <>
                                <Ban className="w-3.5 h-3.5" />
                                <span>Suspend</span>
                              </>
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setDeletingSchool(s);
                              setDeleteConfirmChecked(false);
                            }}
                            disabled={busyActionId === s.schoolId}
                            className="p-1.5 px-2 rounded-lg border border-rose-600 bg-rose-600 hover:bg-rose-700 text-white font-semibold inline-flex items-center space-x-1 disabled:opacity-50"
                            title={
                              language === 'bn'
                                ? 'স্কুল এবং এর সব ডেটা ও অ্যাকাউন্ট স্থায়ীভাবে ডিলিট করুন'
                                : 'Permanently Delete School & All Data'
                            }
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Delete</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: PAYMENT APPROVALS */}
      {activeSubTab === 'payments' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                {language === 'bn' ? 'সাবস্ক্রিপশন পেমেন্ট যাচাই ও অনুমোদন (Approval)' : 'Manual Subscription Payment Queue'}
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {language === 'bn'
                  ? '১) স্কুলের প্রেরক নম্বর ও TrxID আপনার বিকাশ/নগদে মিলিয়ে দেখুন → ২) প্রয়োজনে Screenshot দেখুন → ৩) Approve চাপলেই স্কুল চালু/নবায়ন হবে।'
                  : 'Verify bKash, Nagad, Rocket, or Bank Transfer TrxID before clicking Approve. Approval immediately activates or extends the school.'}
              </p>
            </div>
            <select
              value={paymentStatusFilter}
              onChange={(e) => setPaymentStatusFilter(e.target.value)}
              className="px-3 py-1.5 border border-slate-200 rounded-xl text-xs font-semibold bg-white shrink-0"
            >
              <option value="all">All Requests ({paymentRequests.length})</option>
              <option value="pending">Pending Only ({analytics?.pendingPaymentsCount || 0})</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider">
                  <th className="py-3 px-4">School & Plan</th>
                  <th className="py-3 px-4">Method & TrxID</th>
                  <th className="py-3 px-4">Sender & Date</th>
                  <th className="py-3 px-4">Amount</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Verification</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredPayments.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-slate-400">
                      No payment requests found.
                    </td>
                  </tr>
                ) : (
                  filteredPayments.map((req) => (
                    <tr key={req.id} className="hover:bg-slate-50/60">
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900">
                          {req.schoolName}{' '}
                          <span className="font-mono text-[11px] text-slate-500">({req.schoolId})</span>
                        </div>
                        <div className="text-[11px] text-blue-700 font-semibold">
                          {req.planName} ({req.durationDays}d)
                        </div>
                        <div className="text-[10px] text-slate-400">By: {req.submittedByEmail}</div>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200 font-bold text-[10px]">
                          {req.paymentMethod}
                        </span>
                        <div className="font-mono font-bold text-slate-900 mt-1">{req.transactionId}</div>
                        {req.screenshotUrl && (
                          <button
                            type="button"
                            onClick={() => setPreviewImage(req.screenshotUrl!)}
                            className="text-[11px] text-blue-600 hover:underline mt-0.5 inline-flex items-center space-x-1"
                          >
                            <Eye className="w-3 h-3" />
                            <span>View Screenshot</span>
                          </button>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-mono text-slate-800">{req.senderNumber}</div>
                        <div className="text-[11px] text-slate-500">{req.paymentDate}</div>
                      </td>
                      <td className="py-3.5 px-4 font-black text-slate-900">
                        {formatTaka(req.amount)}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase border ${
                            req.status === 'approved'
                              ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                              : req.status === 'rejected'
                              ? 'bg-rose-100 text-rose-800 border-rose-200'
                              : 'bg-amber-100 text-amber-800 border-amber-200'
                          }`}
                        >
                          {req.status}
                        </span>
                        {req.rejectionReason && (
                          <div className="text-[10px] text-rose-600 mt-0.5">{req.rejectionReason}</div>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right whitespace-nowrap space-x-1.5">
                        {req.status === 'pending' ? (
                          <>
                            <button
                              type="button"
                              onClick={() => handleApprovePayment(req)}
                              disabled={busyActionId === req.id}
                              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold inline-flex items-center space-x-1 disabled:opacity-50"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Approve</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setRejectTarget(req);
                                setRejectionReason('');
                              }}
                              disabled={busyActionId === req.id}
                              className="px-3 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold inline-flex items-center space-x-1 disabled:opacity-50"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              <span>Reject</span>
                            </button>
                          </>
                        ) : (
                          <span className="text-[11px] text-slate-400">
                            {req.reviewedByEmail ? `By ${req.reviewedByEmail}` : 'Processed'}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: SUBSCRIPTION PLANS */}
      {activeSubTab === 'plans' && (
        <div className="space-y-4">
          {/* Top Management Toolbar */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-2xs">
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <div className="flex items-center space-x-2">
                <div className="p-2 rounded-xl bg-purple-50 text-purple-600 border border-purple-200">
                  <Sliders className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900">
                    {language === 'bn' ? 'সাবস্ক্রিপশন প্ল্যান ও ডিসকাউন্ট ব্যবস্থাপনা' : 'Subscription Plans & Discounts'}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    {language === 'bn'
                      ? 'নতুন প্ল্যান আইটেম যুক্ত করুন, ডিসকাউন্ট (%) দিন ও ফিচার তালিকা পরিচালনা করুন।'
                      : 'Add plan items, apply percentage discounts (%), and customize included features.'}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:ml-4">
                <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 font-bold text-[11px]">
                  {language === 'bn' ? `মোট: ${toBnNumber(plans.length)}` : `Total: ${plans.length}`}
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold text-[11px]">
                  {language === 'bn'
                    ? `সক্রিয়: ${toBnNumber(plans.filter((p) => p.isActive).length)}`
                    : `Active: ${plans.filter((p) => p.isActive).length}`}
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 font-bold text-[11px]">
                  {language === 'bn'
                    ? `ডিসকাউন্ট অফার: ${toBnNumber(plans.filter((p) => (p.discountPercent || 0) > 0).length)}`
                    : `Discounted: ${plans.filter((p) => (p.discountPercent || 0) > 0).length}`}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={openAddPlanModal}
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-xs font-black shadow-md flex items-center justify-center space-x-1.5 shrink-0 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>{language === 'bn' ? 'নতুন প্ল্যান যোগ করুন' : 'Add Plan Item'}</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {plans.map((plan) => {
              const effectivePrice = getEffectivePlanPriceBdt(plan);
              const discountPct = Math.min(100, Math.max(0, Number(plan.discountPercent) || 0));
              const hasDiscount = discountPct > 0 && plan.priceBdt > 0;
              const isFree = effectivePrice === 0;
              const isLifetime = plan.id === 'lifetime' || plan.durationDays >= 36500;
              const isCustomPlan = !CORE_PLAN_IDS.has(plan.id);
              const isBusy = busyActionId === plan.id;

              return (
                <div
                  key={plan.id}
                  className={`p-5 bg-white rounded-2xl border shadow-2xs flex flex-col justify-between space-y-4 transition-all ${
                    !plan.isActive
                      ? 'border-slate-200 bg-slate-50/70 opacity-80'
                      : hasDiscount
                      ? 'border-rose-300 ring-1 ring-rose-100'
                      : isLifetime
                      ? 'border-indigo-300 ring-1 ring-indigo-100'
                      : isFree
                      ? 'border-emerald-300 ring-1 ring-emerald-100'
                      : 'border-slate-200'
                  }`}
                >
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-1.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={`px-2 py-0.5 rounded font-mono font-bold text-[10px] uppercase ${
                            isLifetime
                              ? 'bg-indigo-50 text-indigo-700'
                              : isFree
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-blue-50 text-blue-700'
                          }`}
                        >
                          {plan.id}
                        </span>
                        {isCustomPlan && (
                          <span className="px-2 py-0.5 rounded bg-purple-50 text-purple-700 font-bold text-[10px]">
                            {language === 'bn' ? 'কাস্টম' : 'Custom'}
                          </span>
                        )}
                        {plan.badgeText && (
                          <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-900 font-bold text-[10px] flex items-center gap-1">
                            <Sparkles className="w-2.5 h-2.5" />
                            {plan.badgeText}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        {hasDiscount && (
                          <span className="px-2 py-0.5 rounded-full bg-rose-600 text-white text-[10px] font-black shadow-2xs">
                            -{language === 'bn' ? toBnNumber(discountPct) : discountPct}% OFF
                          </span>
                        )}
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            plan.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
                          }`}
                        >
                          {plan.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                    </div>

                    <h4 className="text-base font-black text-slate-900 mt-2.5">{plan.name}</h4>
                    <p className="text-xs text-slate-500">{plan.nameBn}</p>

                    <div className="mt-3 flex flex-wrap items-baseline gap-2">
                      <div
                        className={`text-2xl font-black ${
                          isFree ? 'text-emerald-700' : hasDiscount ? 'text-rose-600' : isLifetime ? 'text-indigo-700' : 'text-blue-700'
                        }`}
                      >
                        {isFree
                          ? `${formatTaka(0)} (${language === 'bn' ? 'ফ্রি' : 'Free'})`
                          : formatTaka(effectivePrice)}
                      </div>
                      {hasDiscount && (
                        <>
                          <span className="text-xs font-bold text-slate-400 line-through">
                            {formatTaka(plan.priceBdt)}
                          </span>
                          <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                            {language === 'bn'
                              ? `সাশ্রয় ${formatTaka(plan.priceBdt - effectivePrice)}`
                              : `Save ${formatTaka(plan.priceBdt - effectivePrice)}`}
                          </span>
                        </>
                      )}
                    </div>

                    <div className="text-xs font-semibold text-slate-600 mt-1">
                      Duration:{' '}
                      {isLifetime
                        ? `${language === 'bn' ? 'আজীবন' : 'Lifetime'} (${plan.durationDays} Days)`
                        : `${plan.durationDays} Days`}
                    </div>

                    {(plan.description || plan.descriptionBn) && (
                      <p className="text-[11px] text-slate-500 mt-2">
                        {language === 'bn' ? plan.descriptionBn || plan.description : plan.description}
                      </p>
                    )}

                    {Array.isArray(plan.features) && plan.features.length > 0 && (
                      <ul className="mt-3 pt-2.5 border-t border-slate-100 space-y-1">
                        {plan.features.map((feat, idx) => (
                          <li key={idx} className="flex items-start gap-1.5 text-[11px] text-slate-700 font-medium">
                            <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                            <span>{feat}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => openEditPlanModal(plan)}
                      className="flex-1 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-xs font-bold text-slate-800 flex items-center justify-center space-x-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                      <span>{language === 'bn' ? 'এডিট / ডিসকাউন্ট' : 'Edit Plan'}</span>
                    </button>

                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => handleTogglePlanActive(plan)}
                      title={plan.isActive ? 'Deactivate Plan' : 'Activate Plan'}
                      className={`px-3 py-2 rounded-xl border text-xs font-bold flex items-center justify-center cursor-pointer disabled:opacity-50 ${
                        plan.isActive
                          ? 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100'
                          : 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                      }`}
                    >
                      <Power className="w-3.5 h-3.5" />
                    </button>

                    {isCustomPlan && (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleDeletePlan(plan)}
                        title="Delete Custom Plan"
                        className="px-3 py-2 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold flex items-center justify-center cursor-pointer disabled:opacity-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 4: PLATFORM PAYMENT CHANNELS (bKash / Nagad / Bank Setup) */}
      {activeSubTab === 'payment_channels' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <form
            onSubmit={handleSavePaymentChannels}
            className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-4 text-xs"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center space-x-2">
                <div className="p-2 rounded-xl bg-pink-50 text-pink-600 border border-pink-200">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900">
                    {language === 'bn'
                      ? 'মাস্টার অ্যাডমিন বিকাশ / নগদ / ব্যাংক নম্বর সেটিংস'
                      : 'Master Admin bKash, Nagad & Bank Settings'}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    {language === 'bn'
                      ? 'এখানে সেভ করা নম্বরগুলো প্রতিটি স্কুলের সাবস্ক্রিপশন ও রিনিউ পেজে সরাসরি দেখাবে।'
                      : 'Numbers saved here immediately appear on every school’s Subscription & Billing page.'}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block font-bold text-pink-700 mb-1">
                  {language === 'bn' ? 'bKash নম্বর ও ধরন *' : 'bKash Number & Type *'}
                </label>
                <input
                  type="text"
                  value={paymentChannels.bkash}
                  onChange={(e) => setPaymentChannels({ ...paymentChannels, bkash: e.target.value })}
                  placeholder="017XXXXXXXX (Personal / Merchant)"
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl font-mono focus:ring-2 focus:ring-pink-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-orange-700 mb-1">
                  {language === 'bn' ? 'Nagad নম্বর ও ধরন *' : 'Nagad Number & Type *'}
                </label>
                <input
                  type="text"
                  value={paymentChannels.nagad}
                  onChange={(e) => setPaymentChannels({ ...paymentChannels, nagad: e.target.value })}
                  placeholder="019XXXXXXXX (Personal / Merchant)"
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl font-mono focus:ring-2 focus:ring-orange-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-purple-700 mb-1">
                  {language === 'bn' ? 'Rocket নম্বর (ঐচ্ছিক)' : 'Rocket Number (Optional)'}
                </label>
                <input
                  type="text"
                  value={paymentChannels.rocket || ''}
                  onChange={(e) => setPaymentChannels({ ...paymentChannels, rocket: e.target.value })}
                  placeholder="018XXXXXXXX-X (Optional)"
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl font-mono focus:ring-2 focus:ring-purple-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-sky-700 mb-1">
                  {language === 'bn' ? 'সাপোর্ট হেল্পলাইন নম্বর *' : 'Support Phone *'}
                </label>
                <input
                  type="text"
                  required
                  value={paymentChannels.supportPhone}
                  onChange={(e) =>
                    setPaymentChannels({ ...paymentChannels, supportPhone: e.target.value })
                  }
                  placeholder="+880 1700-000000"
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">
                {language === 'bn' ? 'ব্যাংক অ্যাকাউন্ট তথ্য (Bank Transfer)' : 'Bank Account Details'}
              </label>
              <input
                type="text"
                value={paymentChannels.bank}
                onChange={(e) => setPaymentChannels({ ...paymentChannels, bank: e.target.value })}
                placeholder="Dutch-Bangla Bank • A/C: 101-110-0045678 (SmartSchool BD)"
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">
                {language === 'bn' ? 'সাপোর্ট ইমেইল *' : 'Support Email *'}
              </label>
              <input
                type="email"
                required
                value={paymentChannels.supportEmail}
                onChange={(e) =>
                  setPaymentChannels({ ...paymentChannels, supportEmail: e.target.value })
                }
                placeholder="support@smartschoolbd.com"
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">
                {language === 'bn'
                  ? 'স্কুলের জন্য বিশেষ নির্দেশনা (ঐচ্ছিক)'
                  : 'Special Payment Instruction for Schools (Optional)'}
              </label>
              <textarea
                rows={2}
                value={paymentChannels.paymentInstruction || ''}
                onChange={(e) =>
                  setPaymentChannels({ ...paymentChannels, paymentInstruction: e.target.value })
                }
                placeholder={
                  language === 'bn'
                    ? 'যেমন: Send Money করার সময় রেফারেন্সে আপনার School ID (SCH001) লিখুন।'
                    : 'e.g. Mention your School ID in the bKash/Nagad reference note.'
                }
                className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>

            <div className="pt-2 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100">
              <div className="text-[11px] text-slate-400">
                {paymentChannels.updatedAt
                  ? `Last updated: ${new Date(paymentChannels.updatedAt).toLocaleString()} (${
                      paymentChannels.updatedBy || 'Master Admin'
                    })`
                  : language === 'bn'
                  ? 'পরিবর্তন করার পর সেভ বাটনে ক্লিক করুন'
                  : 'Click Save to publish immediately to all schools'}
              </div>
              <button
                type="submit"
                disabled={savingChannels}
                className="px-5 py-2.5 rounded-xl bg-pink-600 hover:bg-pink-700 text-white font-bold shadow-sm flex items-center space-x-2 disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                <span>
                  {savingChannels
                    ? language === 'bn'
                      ? 'সেভ হচ্ছে...'
                      : 'Saving...'
                    : language === 'bn'
                    ? 'পেমেন্ট নম্বর সেভ করুন'
                    : 'Save Payment Channels'}
                </span>
              </button>
            </div>
          </form>

          {/* Live School Preview Card */}
          <div className="lg:col-span-5 space-y-4">
            <div className="bg-slate-900 text-white rounded-2xl p-5 border border-slate-800 space-y-3.5 text-xs">
              <div className="flex items-center space-x-2">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
                <h4 className="text-sm font-bold">
                  {language === 'bn' ? 'স্কুল অ্যাডমিনরা যেমন দেখবে (Live Preview)' : 'Live School Billing Preview'}
                </h4>
              </div>

              <div className="space-y-2">
                {paymentChannels.bkash && (
                  <div className="p-3 rounded-xl bg-white/5 border border-white/10 flex items-start space-x-2.5">
                    <Smartphone className="w-4 h-4 text-pink-400 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-bold text-pink-300">bKash</div>
                      <div className="font-mono text-slate-200 mt-0.5">{paymentChannels.bkash}</div>
                    </div>
                  </div>
                )}
                {paymentChannels.nagad && (
                  <div className="p-3 rounded-xl bg-white/5 border border-white/10 flex items-start space-x-2.5">
                    <Smartphone className="w-4 h-4 text-orange-400 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-bold text-orange-300">Nagad</div>
                      <div className="font-mono text-slate-200 mt-0.5">{paymentChannels.nagad}</div>
                    </div>
                  </div>
                )}
                {paymentChannels.rocket && (
                  <div className="p-3 rounded-xl bg-white/5 border border-white/10 flex items-start space-x-2.5">
                    <Smartphone className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-bold text-purple-300">Rocket</div>
                      <div className="font-mono text-slate-200 mt-0.5">{paymentChannels.rocket}</div>
                    </div>
                  </div>
                )}
                {paymentChannels.bank && (
                  <div className="p-3 rounded-xl bg-white/5 border border-white/10 flex items-start space-x-2.5">
                    <Landmark className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-bold text-sky-300">Bank Transfer</div>
                      <div className="font-mono text-slate-200 mt-0.5">{paymentChannels.bank}</div>
                    </div>
                  </div>
                )}
              </div>

              {paymentChannels.paymentInstruction && (
                <div className="p-3 rounded-xl bg-amber-500/15 border border-amber-400/30 text-[11px] text-amber-100">
                  <strong className="text-amber-300">নির্দেশনা:</strong>{' '}
                  {paymentChannels.paymentInstruction}
                </div>
              )}

              <div className="pt-2 border-t border-white/10 text-[11px] text-slate-400">
                Support: <span className="text-white font-semibold">{paymentChannels.supportPhone}</span> •{' '}
                <span className="text-white font-semibold">{paymentChannels.supportEmail}</span>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-blue-50 border border-blue-200 text-xs text-blue-950 space-y-1.5">
              <div className="font-bold">
                {language === 'bn'
                  ? 'স্কুল সাবস্ক্রিপশন অনুমোদন প্রক্রিয়া:'
                  : 'How School Subscription Approval Works:'}
              </div>
              <ol className="list-decimal list-inside space-y-1 text-[11px] text-blue-900">
                <li>
                  {language === 'bn'
                    ? 'স্কুল অ্যাডমিন উপরের বিকাশ/নগদ নম্বরে টাকা পাঠিয়ে TrxID সাবমিট করবে।'
                    : 'School Admin sends payment to your bKash/Nagad and submits their TrxID.'}
                </li>
                <li>
                  {language === 'bn'
                    ? 'আপনি "পেমেন্ট যাচাই (Payment Approvals)" ট্যাবে গিয়ে TrxID মিলিয়ে Approve চাপবেন।'
                    : 'Open "Payment Approvals", verify the TrxID & screenshot, and click Approve.'}
                </li>
                <li>
                  {language === 'bn'
                    ? 'Approve করার সাথে সাথে স্কুলের ড্যাশবোর্ড আনলক ও মেয়াদ আপডেট হবে।'
                    : 'Approving instantly unlocks the school and extends its expiry date.'}
                </li>
              </ol>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: SUPPORT TEAM CHAT & SCREENSHOT FEEDBACK */}
      {activeSubTab === 'support' && <SupportTeamView embedded />}

      {/* MODAL: CREATE NEW SCHOOL */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 text-xs max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm font-black text-slate-900 flex items-center space-x-2">
                <Building2 className="w-4 h-4 text-blue-600" />
                <span>{language === 'bn' ? 'নতুন স্কুল তৈরি করুন' : 'Create New School Tenant'}</span>
              </h3>
              <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            {firestoreFallbackActive && (
              <div className="mt-3 p-3 rounded-xl bg-amber-50 border border-amber-300 text-amber-950 text-[11px] flex items-start gap-2 leading-relaxed">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  {fallbackTriggerCode === 'ADMIN_IAM_PERMISSION_DENIED'
                    ? language === 'bn'
                      ? 'সতর্কতা: Firebase প্রজেক্টে সার্ভারের IAM অনুমোদন (Cloud Datastore User, Firebase Authentication Admin, Service Usage Consumer) এখনো যুক্ত হয়নি।'
                      : 'Note: Server Firebase Admin IAM permissions are not yet granted on the Firebase project.'
                    : isNetlifyHostingEnvironment(serverDiagnostics)
                    ? language === 'bn'
                      ? 'সতর্কতা: সার্ভারে Firebase Admin কী (FIREBASE_SERVICE_ACCOUNT_JSON) এখনো সংযুক্ত নয়। নতুন স্কুল ও Auth লগইন তৈরি করতে Netlify Environment variables-এ (Scope: All scopes) কী যোগ করে "Clear cache and deploy site" দিন।'
                      : 'Note: Server Firebase Admin credentials are missing. Configure FIREBASE_SERVICE_ACCOUNT_JSON in Netlify (Scope: All scopes) and redeploy to enable creating schools.'
                    : language === 'bn'
                    ? 'সতর্কতা: ব্যাকএন্ড সার্ভারের সাথে সংযোগ বা Firebase Admin অনুমোদন এখনো প্রস্তুত হয়নি। কিছুক্ষণ পর পুনরায় চেষ্টা করুন।'
                    : 'Note: Backend server or Firebase Admin permissions are not ready yet.'}
                </span>
              </div>
            )}

            <form onSubmit={handleCreateSchool} className="mt-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">School Name *</label>
                  <input
                    type="text"
                    required
                    value={newSchool.schoolName}
                    onChange={(e) => setNewSchool({ ...newSchool, schoolName: e.target.value })}
                    placeholder="e.g. Dhaka Model High School"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">School Code *</label>
                  <input
                    type="text"
                    required
                    value={newSchool.schoolCode}
                    onChange={(e) => setNewSchool({ ...newSchool, schoolCode: e.target.value })}
                    placeholder="e.g. DMHS-101"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl font-mono"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block font-bold text-slate-700 mb-1">Address *</label>
                  <input
                    type="text"
                    required
                    value={newSchool.address}
                    onChange={(e) => setNewSchool({ ...newSchool, address: e.target.value })}
                    placeholder="e.g. Mirpur-10, Dhaka-1216"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">School Contact Number *</label>
                  <input
                    type="text"
                    required
                    value={newSchool.contactNumber}
                    onChange={(e) => setNewSchool({ ...newSchool, contactNumber: e.target.value })}
                    placeholder="+880 1711-000000"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">School Official Email *</label>
                  <input
                    type="email"
                    required
                    value={newSchool.email}
                    onChange={(e) => setNewSchool({ ...newSchool, email: e.target.value })}
                    placeholder="info@school.edu.bd"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Principal Name *</label>
                  <input
                    type="text"
                    required
                    value={newSchool.principalName}
                    onChange={(e) => setNewSchool({ ...newSchool, principalName: e.target.value })}
                    placeholder="Principal Name"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">School Admin Name *</label>
                  <input
                    type="text"
                    required
                    value={newSchool.adminName}
                    onChange={(e) => setNewSchool({ ...newSchool, adminName: e.target.value })}
                    placeholder="School Super Admin Name"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Admin Login ID (Email, Mobile, or Username) *
                  </label>
                  <input
                    type="text"
                    required
                    value={newSchool.adminEmail}
                    onChange={(e) => setNewSchool({ ...newSchool, adminEmail: e.target.value })}
                    placeholder="admin@school.edu.bd, 017..., or admin01"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Admin Initial Password *</label>
                  <input
                    type="text"
                    required
                    minLength={6}
                    value={newSchool.adminPassword}
                    onChange={(e) => setNewSchool({ ...newSchool, adminPassword: e.target.value })}
                    placeholder="Min 6 characters"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Initial Subscription Plan *</label>
                  <select
                    value={newSchool.initialPlan}
                    onChange={(e) =>
                      handlePlanOrStartChange(e.target.value as SaaSPlanId, newSchool.startDate)
                    }
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white font-semibold"
                  >
                    {plans.map((p) => {
                      const effPrice = getEffectivePlanPriceBdt(p);
                      const hasDisc = (p.discountPercent || 0) > 0 && p.priceBdt > 0;
                      return (
                        <option key={p.id} value={p.id}>
                          {p.name} (
                          {p.id === 'lifetime' || p.durationDays >= 36500
                            ? 'Lifetime'
                            : `${p.durationDays}d`}{' '}
                          — ৳{effPrice}{hasDisc ? ` [${p.discountPercent}% OFF]` : ''})
                        </option>
                      );
                    })}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Start Date *</label>
                      <input
                        type="date"
                        required
                        value={newSchool.startDate}
                        onChange={(e) =>
                          handlePlanOrStartChange(newSchool.initialPlan, e.target.value)
                        }
                        className="w-full px-2.5 py-2 border border-slate-200 rounded-xl"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Expiry Date *</label>
                      <input
                        type="date"
                        required
                        value={newSchool.expiryDate}
                        onChange={(e) => setNewSchool({ ...newSchool, expiryDate: e.target.value })}
                        className="w-full px-2.5 py-2 border border-slate-200 rounded-xl"
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const pastStart = new Date(Date.now() - 37 * 86_400_000).toISOString().slice(0, 10);
                      const pastExpiry = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
                      setNewSchool((prev) => ({
                        ...prev,
                        startDate: pastStart,
                        expiryDate: pastExpiry,
                        activateImmediately: true,
                      }));
                    }}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-orange-200 bg-orange-50 hover:bg-orange-100 text-orange-800 text-[11px] font-bold text-center transition-colors cursor-pointer"
                  >
                    {language === 'bn'
                      ? 'মেয়াদোত্তীর্ণ ডেমো তারিখ বসান (Past Expiry Test: ৭ দিন আগে শেষ)'
                      : 'Set Past Expiry Date (7 days ago — Expired Test School)'}
                  </button>
                </div>
              </div>

              <label className="flex items-center space-x-2 p-3 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newSchool.activateImmediately}
                  onChange={(e) =>
                    setNewSchool({ ...newSchool, activateImmediately: e.target.checked })
                  }
                />
                <span className="font-semibold text-slate-800">
                  Activate school subscription immediately upon creation
                </span>
              </label>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 font-semibold text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingSchool}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold disabled:opacity-50"
                >
                  {creatingSchool ? 'Provisioning School...' : 'Create School & Provision Admin'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: EDIT SCHOOL */}
      {editingSchool && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-black text-slate-900 text-sm">
                Edit School ({editingSchool.schoolId})
              </h3>
              <button onClick={() => setEditingSchool(null)} className="text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveEdit} className="mt-4 space-y-3">
              <div>
                <label className="block font-bold mb-1">School Name</label>
                <input
                  type="text"
                  required
                  value={editForm.schoolName}
                  onChange={(e) => setEditForm({ ...editForm, schoolName: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold mb-1">School Code</label>
                  <input
                    type="text"
                    required
                    value={editForm.schoolCode}
                    onChange={(e) => setEditForm({ ...editForm, schoolCode: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold mb-1">Contact Number</label>
                  <input
                    type="text"
                    required
                    value={editForm.contactNumber}
                    onChange={(e) => setEditForm({ ...editForm, contactNumber: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl"
                  />
                </div>
              </div>
              <div>
                <label className="block font-bold mb-1">Principal Name</label>
                <input
                  type="text"
                  required
                  value={editForm.principalName}
                  onChange={(e) => setEditForm({ ...editForm, principalName: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl"
                />
              </div>
              <div>
                <label className="block font-bold mb-1">Address</label>
                <input
                  type="text"
                  required
                  value={editForm.address}
                  onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl"
                />
              </div>
              <div>
                <label className="block font-bold mb-1">Admin Notes</label>
                <textarea
                  rows={2}
                  value={editForm.notes}
                  onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl"
                />
              </div>
              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingSchool(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-blue-600 text-white font-bold"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: EXTEND SUBSCRIPTION */}
      {extendingSchool && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-black text-slate-900 text-sm">
                Extend Subscription — {extendingSchool.schoolId}
              </h3>
              <button onClick={() => setExtendingSchool(null)} className="text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleExtendSubmit} className="mt-4 space-y-3">
              <p className="text-slate-600">
                Current Expiry:{' '}
                <strong>{new Date(extendingSchool.subscription.expiryDate).toLocaleDateString()}</strong>
              </p>
              <div>
                <label className="block font-bold mb-1">Plan Label</label>
                <select
                  value={extendPlanId}
                  onChange={(e) => {
                    const nextPid = e.target.value as SaaSPlanId;
                    setExtendPlanId(nextPid);
                    const chosen = plans.find((p) => p.id === nextPid);
                    if (chosen) {
                      setExtendDays(String(chosen.durationDays));
                    }
                  }}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white"
                >
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.id === 'lifetime' || p.durationDays >= 36500 ? 'Lifetime' : `${p.durationDays} days`})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-bold mb-1">Days to Add *</label>
                <DigitInput
                  min={1}
                  required
                  value={extendDays === '' ? '' : parseLocaleNumber(extendDays, 1)}
                  onValueChange={(val) => setExtendDays(String(val))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl font-bold"
                />
              </div>
              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setExtendingSchool(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-blue-600 text-white font-bold"
                >
                  Apply Extension
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: SCHOOL DETAILS */}
      {detailsData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-3xl w-full p-6 shadow-2xl border border-slate-200 text-xs max-h-[90vh] overflow-y-auto space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <span className="px-2 py-0.5 rounded bg-slate-900 text-white font-mono font-bold text-[10px]">
                  {detailsData.school.schoolId}
                </span>
                <h3 className="text-base font-black text-slate-900 mt-1">
                  {detailsData.school.schoolName}
                </h3>
              </div>
              <button onClick={() => setDetailsData(null)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200">
              <div>
                <div className="text-[10px] text-slate-500">Code</div>
                <div className="font-mono font-bold">{detailsData.school.schoolCode}</div>
              </div>
              <div>
                <div className="text-[10px] text-slate-500">Plan</div>
                <div className="font-bold">{detailsData.school.subscription.planName}</div>
              </div>
              <div>
                <div className="text-[10px] text-slate-500">Start Date</div>
                <div className="font-bold">
                  {new Date(detailsData.school.subscription.startDate).toLocaleDateString()}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-slate-500">Expiry Date</div>
                <div className="font-bold">
                  {new Date(detailsData.school.subscription.expiryDate).toLocaleDateString()}
                </div>
              </div>
            </div>

            {/* Master Admin Only: School Super Admin Login & Encrypted Password Vault */}
            <div className="p-4 rounded-2xl bg-indigo-50/70 border border-indigo-200 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="font-black text-indigo-950 flex items-center gap-1.5 text-xs">
                    <Lock className="w-4 h-4 text-indigo-600" />
                    <span>
                      {language === 'bn'
                        ? 'স্কুল সুপার অ্যাডমিন লগইন ও পাসওয়ার্ড (Master Admin Vault)'
                        : 'School Super Admin Login & Password (Master Admin Only)'}
                    </span>
                  </h4>
                  <p className="text-[10px] text-indigo-800/80 mt-0.5">
                    {language === 'bn'
                      ? 'শুধুমাত্র মাস্টার অ্যাডমিন স্কুলের সুপার অ্যাডমিনের লগইন পাসওয়ার্ড দেখতে ও রিসেট করতে পারবেন (Transaction PIN সর্বদা গোপন থাকে)।'
                      : 'Only Master Admin can view or copy Super Admin login passwords. Transaction PINs remain strictly private.'}
                  </p>
                </div>
              </div>

              {vaultResetMsg && (
                <div
                  className={`p-2.5 rounded-xl border text-[11px] font-semibold ${
                    vaultResetMsg.type === 'success'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : 'bg-rose-50 border-rose-200 text-rose-800'
                  }`}
                >
                  {vaultResetMsg.text}
                </div>
              )}

              {detailsData.vaultError && (
                <div className="p-2.5 rounded-xl border border-rose-200 bg-rose-50 text-rose-800 text-[11px] font-semibold flex items-center justify-between gap-2">
                  <span>{detailsData.vaultError}</span>
                  <button
                    type="button"
                    onClick={() => handleViewDetails(detailsData.school.schoolId)}
                    className="px-2 py-1 rounded bg-rose-600 text-white font-bold text-[10px] shrink-0"
                  >
                    {language === 'bn' ? 'আবার চেষ্টা' : 'Retry'}
                  </button>
                </div>
              )}

              {detailsData.adminCredentials.length === 0 ? (
                <div className="p-3 rounded-xl bg-white border border-indigo-100 text-[11px] text-slate-600">
                  {language === 'bn'
                    ? `প্রাথমিক সুপার অ্যাডমিন লগইন: ${
                        formatDisplayLoginId({
                          username: detailsData.school.adminUsername,
                          email: detailsData.school.adminEmail,
                        }) || 'N/A'
                      }`
                    : `Primary Super Admin login: ${
                        formatDisplayLoginId({
                          username: detailsData.school.adminUsername,
                          email: detailsData.school.adminEmail,
                        }) || 'N/A'
                      }`}
                </div>
              ) : (
                <div className="space-y-2.5">
                  {detailsData.adminCredentials.map((cred) => {
                    const isRevealed = Boolean(revealedVaultUids[cred.uid]);
                    const isEditingPass = vaultResetUid === cred.uid;
                    const copyKey = `vault_${cred.uid}`;
                    return (
                      <div
                        key={cred.uid}
                        className="p-3 rounded-xl bg-white border border-indigo-200/80 space-y-2"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div className="space-y-0.5 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-bold text-slate-900 text-xs">{cred.displayName}</span>
                              {cred.isPrimaryAdmin && (
                                <span className="px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-800 font-bold text-[10px]">
                                  Primary Super Admin
                                </span>
                              )}
                              <span
                                className={`px-1.5 py-0.5 rounded font-bold text-[10px] ${
                                  cred.status === 'active'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : 'bg-rose-100 text-rose-800'
                                }`}
                              >
                                {cred.status}
                              </span>
                            </div>
                            <div className="text-[11px] font-mono text-slate-700 break-all">
                              Email: <strong>{cred.email}</strong>
                              {cred.phone ? ` • ${cred.phone}` : ''}
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 flex-wrap shrink-0">
                            {cred.hasStoredPassword && cred.managedPassword ? (
                              <>
                                <div className="px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200 font-mono font-bold text-slate-900 flex items-center gap-1.5">
                                  <span className="text-[10px] text-slate-500 font-sans">Pass:</span>
                                  <span>{isRevealed ? cred.managedPassword : '••••••••'}</span>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setRevealedVaultUids((prev) => ({
                                        ...prev,
                                        [cred.uid]: !prev[cred.uid],
                                      }))
                                    }
                                    className="p-0.5 text-slate-500 hover:text-slate-900"
                                    title={isRevealed ? 'Hide password' : 'Show password'}
                                  >
                                    {isRevealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                  </button>
                                </div>
                                <button
                                  type="button"
                                  onClick={() =>
                                    copyTextToClipboard(
                                      copyKey,
                                      `School: ${cred.schoolName} (${cred.schoolId})\nSuper Admin: ${cred.displayName}\nEmail: ${cred.email}\nPassword: ${cred.managedPassword}`
                                    )
                                  }
                                  className="px-2.5 py-1.5 rounded-lg border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 font-bold text-[11px] inline-flex items-center gap-1"
                                >
                                  {copiedVaultKey === copyKey ? (
                                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                                  ) : (
                                    <Copy className="w-3.5 h-3.5" />
                                  )}
                                  <span>{copiedVaultKey === copyKey ? 'Copied' : 'Copy'}</span>
                                </button>
                              </>
                            ) : (
                              <span className="px-2 py-1 rounded-lg bg-amber-50 border border-amber-200 text-[10px] font-semibold text-amber-800">
                                {language === 'bn'
                                  ? 'পুরোনো একাউন্ট — পাসওয়ার্ড সেট করলে সংরক্ষিত হবে'
                                  : 'Legacy account — set password to store in vault'}
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                if (isEditingPass) {
                                  setVaultResetUid(null);
                                  setVaultResetPass('');
                                } else {
                                  setVaultResetUid(cred.uid);
                                  setVaultResetPass('');
                                  setVaultResetMsg(null);
                                }
                              }}
                              className="px-2.5 py-1.5 rounded-lg border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-800 font-bold text-[11px]"
                            >
                              {isEditingPass
                                ? language === 'bn'
                                  ? 'বাতিল'
                                  : 'Cancel'
                                : cred.hasStoredPassword
                                ? language === 'bn'
                                  ? 'পাসওয়ার্ড বদলান'
                                  : 'Reset Pass'
                                : language === 'bn'
                                ? 'পাসওয়ার্ড সেট করুন'
                                : 'Set Pass'}
                            </button>
                          </div>
                        </div>

                        {isEditingPass && (
                          <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center gap-2">
                            <input
                              type="text"
                              minLength={6}
                              value={vaultResetPass}
                              onChange={(e) => setVaultResetPass(e.target.value)}
                              placeholder={
                                language === 'bn' ? 'নতুন পাসওয়ার্ড (কমপক্ষে ৬ অক্ষর)' : 'New password (min 6 chars)'
                              }
                              className="flex-1 min-w-[180px] px-2.5 py-1.5 border border-slate-300 rounded-lg font-mono text-xs"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789@#';
                                let out = '';
                                for (let i = 0; i < 8; i++) out += chars.charAt(Math.floor(Math.random() * chars.length));
                                setVaultResetPass(out);
                              }}
                              className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-slate-50 hover:bg-slate-100 font-bold text-[11px] text-blue-700"
                            >
                              {language === 'bn' ? 'অটো তৈরি' : 'Generate'}
                            </button>
                            <button
                              type="button"
                              disabled={vaultResetBusy}
                              onClick={() => handleSaveVaultResetPassword(cred)}
                              className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[11px] disabled:opacity-50"
                            >
                              {vaultResetBusy
                                ? language === 'bn'
                                  ? 'সেভ হচ্ছে...'
                                  : 'Saving...'
                                : language === 'bn'
                                ? 'সেভ করুন'
                                : 'Save Password'}
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-bold text-slate-900 flex items-center space-x-1.5">
                  <Users className="w-4 h-4 text-blue-600" />
                  <span>Provisioned School Users ({detailsData.users.length})</span>
                </h4>
                <button
                  type="button"
                  onClick={() => setCredsModalSchoolId(detailsData.school.schoolId)}
                  className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-bold text-[11px] inline-flex items-center space-x-1 shadow-xs"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>Manage Users / Reset Passwords</span>
                </button>
              </div>
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-left text-[11px]">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="py-2 px-3">Name</th>
                      <th className="py-2 px-3">Email</th>
                      <th className="py-2 px-3">Role</th>
                      <th className="py-2 px-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {detailsData.users.map((u) => (
                      <tr key={u.uid}>
                        <td className="py-2 px-3 font-semibold">{u.displayName}</td>
                        <td className="py-2 px-3 font-mono">
                          {formatDisplayLoginId(u)}
                          {u.username && !isSyntheticAuthEmail(u.email) && u.email ? ` (${u.email})` : ''}
                        </td>
                        <td className="py-2 px-3">{u.schoolRole}</td>
                        <td className="py-2 px-3 uppercase font-bold">{u.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <h4 className="font-bold text-slate-900 mb-2 flex items-center space-x-1.5">
                <FileText className="w-4 h-4 text-emerald-600" />
                <span>Subscription & Payment Audit History</span>
              </h4>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {detailsData.subscriptionHistory.map((h) => (
                  <div
                    key={h.id}
                    className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between"
                  >
                    <div>
                      <div className="font-bold text-slate-900">
                        {h.eventType} — {h.planName}
                      </div>
                      <div className="text-[11px] text-slate-500">{h.remarks}</div>
                    </div>
                    <div className="text-right text-[10px] text-slate-500">
                      <div>{new Date(h.createdAt).toLocaleString()}</div>
                      {h.amount ? <strong className="text-emerald-700">{formatTaka(h.amount)}</strong> : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: REJECT PAYMENT */}
      {rejectTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 text-xs">
            <h3 className="font-black text-slate-900 text-sm mb-2">
              Reject Payment Request ({rejectTarget.transactionId})
            </h3>
            <form onSubmit={handleConfirmReject} className="space-y-3">
              <textarea
                rows={3}
                required
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Reason for rejection (e.g. Transaction ID not found in bKash statement)"
                className="w-full px-3 py-2 border border-slate-200 rounded-xl"
              />
              <div className="flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setRejectTarget(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-rose-600 text-white font-bold"
                >
                  Confirm Rejection
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADD / EDIT PLAN (with Discount % & Feature Items) */}
      {editingPlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 text-xs my-6 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-black text-slate-900 text-sm flex items-center gap-2">
                  <Tag className="w-4 h-4 text-blue-600" />
                  <span>
                    {isCreatingPlan
                      ? language === 'bn'
                        ? 'নতুন সাবস্ক্রিপশন প্ল্যান তৈরি করুন'
                        : 'Create New Subscription Plan'
                      : `Edit Plan (${editingPlan.id})`}
                  </span>
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {language === 'bn'
                    ? 'মূল মূল্য, ডিসকাউন্ট (%) ও অন্তর্ভুক্ত সুবিধাসমূহ সেট করুন — সাথে সাথে সকল স্কুল প্যানেলে আপডেট হবে।'
                    : 'Set base price, discount %, and included features — immediately visible to all schools.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditingPlan(null);
                  setIsCreatingPlan(false);
                }}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSavePlan} className="mt-4 space-y-3.5">
              {isCreatingPlan && (
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    {language === 'bn' ? 'প্ল্যান কোড / ID (ইংরেজি, খালি রাখলে নাম থেকে তৈরি হবে)' : 'Plan ID / Slug (optional)'}
                  </label>
                  <input
                    type="text"
                    value={editingPlan.id}
                    onChange={(e) =>
                      setEditingPlan({
                        ...editingPlan,
                        id: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''),
                      })
                    }
                    placeholder="e.g. eid_offer, two_year, pro_bundle"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl font-mono"
                  />
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Plan Name (English) *</label>
                  <input
                    type="text"
                    required
                    value={editingPlan.name}
                    onChange={(e) => setEditingPlan({ ...editingPlan, name: e.target.value })}
                    placeholder="e.g. Pro Annual Plan"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl font-semibold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">প্ল্যানের নাম (বাংলা)</label>
                  <input
                    type="text"
                    value={editingPlan.nameBn}
                    onChange={(e) => setEditingPlan({ ...editingPlan, nameBn: e.target.value })}
                    placeholder="যেমন: প্রো বাৎসরিক প্ল্যান"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl font-semibold"
                  />
                </div>
              </div>

              {/* Price + Discount % + Duration */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    {language === 'bn' ? 'মূল মূল্য (BDT) *' : 'Original Price (BDT) *'}
                  </label>
                  <DigitInput
                    min={0}
                    required
                    value={editingPlan.priceBdt}
                    onValueChange={(val) =>
                      setEditingPlan({ ...editingPlan, priceBdt: val })
                    }
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl font-bold"
                  />
                </div>

                <div>
                  <label className="block font-bold text-rose-700 mb-1 flex items-center gap-1">
                    <Percent className="w-3.5 h-3.5" />
                    <span>{language === 'bn' ? 'ডিসকাউন্ট (%)' : 'Discount (%)'}</span>
                  </label>
                  <DigitInput
                    min={0}
                    max={100}
                    value={editingPlan.discountPercent ?? 0}
                    onValueChange={(val) =>
                      setEditingPlan({
                        ...editingPlan,
                        discountPercent: Math.min(100, Math.max(0, val)),
                      })
                    }
                    className="w-full px-3 py-2 border border-rose-200 rounded-xl font-black text-rose-700 bg-rose-50/40"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    {language === 'bn' ? 'মেয়াদ (দিন) *' : 'Duration (Days) *'}
                  </label>
                  <DigitInput
                    min={1}
                    required
                    value={editingPlan.durationDays}
                    onValueChange={(val) =>
                      setEditingPlan({ ...editingPlan, durationDays: val })
                    }
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl font-bold"
                  />
                </div>
              </div>

              {/* Quick Discount % & Duration Preset Pills */}
              <div className="space-y-2 p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] font-bold text-slate-600 mr-1">
                    {language === 'bn' ? 'কুইক ডিসকাউন্ট:' : 'Quick Discount:'}
                  </span>
                  {[0, 10, 15, 20, 25, 30, 50].map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => setEditingPlan({ ...editingPlan, discountPercent: pct })}
                      className={`px-2 py-1 rounded-lg text-[11px] font-bold border transition-all cursor-pointer ${
                        Number(editingPlan.discountPercent || 0) === pct
                          ? 'bg-rose-600 text-white border-rose-600'
                          : 'bg-white border-slate-200 text-slate-700 hover:border-rose-300'
                      }`}
                    >
                      {pct === 0 ? '0% (No Disc)' : `${pct}% OFF`}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] font-bold text-slate-600 mr-1">
                    {language === 'bn' ? 'মেয়াদ প্রিসেট:' : 'Duration:'}
                  </span>
                  {[
                    { days: 30, label: '30d (১ মাস)' },
                    { days: 90, label: '90d (৩ মাস)' },
                    { days: 180, label: '180d (৬ মাস)' },
                    { days: 365, label: '365d (১ বছর)' },
                    { days: 730, label: '730d (২ বছর)' },
                    { days: 36500, label: 'আজীবন' },
                  ].map((d) => (
                    <button
                      key={d.days}
                      type="button"
                      onClick={() => setEditingPlan({ ...editingPlan, durationDays: d.days })}
                      className={`px-2 py-1 rounded-lg text-[11px] font-bold border transition-all cursor-pointer ${
                        Number(editingPlan.durationDays) === d.days
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white border-slate-200 text-slate-700 hover:border-blue-300'
                      }`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Live Calculated Final Price Summary */}
              {(() => {
                const eff = getEffectivePlanPriceBdt(editingPlan);
                const saved = Math.max(0, (Number(editingPlan.priceBdt) || 0) - eff);
                const disc = Number(editingPlan.discountPercent) || 0;
                return (
                  <div className="p-3.5 rounded-xl bg-gradient-to-r from-emerald-50 to-blue-50 border border-emerald-200 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-[11px] font-bold text-slate-600">
                        {language === 'bn' ? 'স্কুলের জন্য চূড়ান্ত বিক্রয়মূল্য (ডিসকাউন্ট সহ)' : 'Final Payable Price After Discount'}
                      </div>
                      <div className="text-xs text-slate-500">
                        {disc > 0
                          ? `মূল ${formatTaka(editingPlan.priceBdt)} থেকে ${disc}% (${formatTaka(saved)}) ছাড়`
                          : 'কোনো ডিসকাউন্ট প্রযোজ্য নয়'}
                      </div>
                    </div>
                    <div className="text-xl font-black text-emerald-700">
                      {eff === 0 ? `${formatTaka(0)} (ফ্রি)` : formatTaka(eff)}
                    </div>
                  </div>
                );
              })()}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    {language === 'bn' ? 'অফার / হাইলাইট ব্যাজ (ঐচ্ছিক)' : 'Promo Badge Tag (optional)'}
                  </label>
                  <input
                    type="text"
                    value={editingPlan.badgeText || ''}
                    onChange={(e) => setEditingPlan({ ...editingPlan, badgeText: e.target.value })}
                    placeholder="যেমন: সেরা অফার, Popular, ঈদ অফার"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    {language === 'bn' ? 'সংক্ষিপ্ত বিবরণ (বাংলা)' : 'Description (BN)'}
                  </label>
                  <input
                    type="text"
                    value={editingPlan.descriptionBn}
                    onChange={(e) => setEditingPlan({ ...editingPlan, descriptionBn: e.target.value })}
                    placeholder="প্ল্যানের সংক্ষিপ্ত বিবরণ লিখুন"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Description (English)</label>
                <input
                  type="text"
                  value={editingPlan.description}
                  onChange={(e) => setEditingPlan({ ...editingPlan, description: e.target.value })}
                  placeholder="Short plan description in English"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl"
                />
              </div>

              {/* Included Feature Items Builder */}
              <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-slate-800">
                    {language === 'bn' ? 'প্ল্যানের সুবিধাসমূহ / আইটেম যুক্ত করুন' : 'Included Plan Items / Features'}
                  </label>
                  <span className="text-[11px] font-bold text-slate-500">
                    {(editingPlan.features || []).length} {language === 'bn' ? 'টি আইটেম' : 'items'}
                  </span>
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newPlanFeatureInput}
                    onChange={(e) => setNewPlanFeatureInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const val = newPlanFeatureInput.trim();
                        if (!val) return;
                        setEditingPlan({
                          ...editingPlan,
                          features: [...(editingPlan.features || []), val],
                        });
                        setNewPlanFeatureInput('');
                      }
                    }}
                    placeholder={language === 'bn' ? 'নতুন সুবিধা লিখুন (যেমন: আনলিমিটেড শিক্ষার্থী)...' : 'Add a feature item...'}
                    className="flex-1 px-3 py-2 border border-slate-200 rounded-xl bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const val = newPlanFeatureInput.trim();
                      if (!val) return;
                      setEditingPlan({
                        ...editingPlan,
                        features: [...(editingPlan.features || []), val],
                      });
                      setNewPlanFeatureInput('');
                    }}
                    className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold flex items-center gap-1 shrink-0 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{language === 'bn' ? 'যুক্ত করুন' : 'Add'}</span>
                  </button>
                </div>

                {/* Quick Feature Suggestion Chips */}
                <div className="flex flex-wrap gap-1.5">
                  {[
                    'সব মডিউল সম্পূর্ণ এক্সেস',
                    'স্মার্ট QR ও ফেস হাজিরা',
                    'ফি, ভাউচার ও একাউন্টস',
                    'ক্লাউড অটো ব্যাকআপ',
                    'অনলাইন ভর্তি ও রেজাল্ট',
                    '২৪/৭ প্রায়োরিটি সাপোর্ট',
                  ]
                    .filter((preset) => !(editingPlan.features || []).includes(preset))
                    .map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() =>
                          setEditingPlan({
                            ...editingPlan,
                            features: [...(editingPlan.features || []), preset],
                          })
                        }
                        className="px-2 py-1 rounded-lg border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-800 text-[10px] font-bold cursor-pointer"
                      >
                        + {preset}
                      </button>
                    ))}
                </div>

                {(editingPlan.features || []).length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    {(editingPlan.features || []).map((feat, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg bg-white border border-slate-200"
                      >
                        <span className="flex items-center gap-1.5 font-medium text-slate-800">
                          <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          <span>{feat}</span>
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setEditingPlan({
                              ...editingPlan,
                              features: (editingPlan.features || []).filter((_, i) => i !== idx),
                            })
                          }
                          className="text-rose-500 hover:text-rose-700 p-0.5 cursor-pointer"
                          title="Remove"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <label className="flex items-center space-x-2 p-2.5 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editingPlan.isActive}
                  onChange={(e) => setEditingPlan({ ...editingPlan, isActive: e.target.checked })}
                />
                <span className="font-semibold text-slate-800">
                  {language === 'bn' ? 'সকল স্কুলের জন্য এই প্ল্যান চালু রাখুন (Active)' : 'Plan Active for Schools'}
                </span>
              </label>

              <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setEditingPlan(null);
                    setIsCreatingPlan(false);
                  }}
                  className="px-4 py-2 rounded-xl border border-slate-200 font-semibold text-slate-700"
                >
                  {language === 'bn' ? 'বাতিল' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={busyActionId === (isCreatingPlan ? editingPlan.id || 'creating' : editingPlan.id)}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  <span>
                    {isCreatingPlan
                      ? language === 'bn'
                        ? 'নতুন প্ল্যান তৈরি করুন'
                        : 'Create Plan'
                      : language === 'bn'
                      ? 'পরিবর্তন সেভ করুন'
                      : 'Save Plan'}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SCREENSHOT LIGHTBOX */}
      {previewImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80"
          onClick={() => setPreviewImage(null)}
        >
          <div className="bg-white rounded-2xl p-3 max-w-xl w-full">
            <img src={previewImage} alt="Payment proof" className="w-full max-h-[75vh] object-contain rounded-xl" />
          </div>
        </div>
      )}

      {/* MODAL: PERMANENT DELETE SCHOOL */}
      {deletingSchool && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-rose-200 text-xs">
            <div className="flex items-start justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 rounded-xl bg-rose-100 text-rose-700">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-rose-900 text-sm">
                    {language === 'bn' ? 'স্কুল স্থায়ীভাবে ডিলিট করুন' : 'Permanently Delete School'}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    {deletingSchool.schoolName} ({deletingSchool.schoolId})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setDeletingSchool(null);
                  setDeleteConfirmChecked(false);
                }}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmDeleteSchool} className="mt-4 space-y-3.5">
              <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 space-y-1.5">
                <p className="font-bold">
                  {language === 'bn'
                    ? 'সতর্কতা: এই স্কুল ডিলিট করলে নিচের সবকিছু চিরতরে মুছে যাবে (আর ফেরত পাওয়া যাবে না):'
                    : 'Warning: Deleting this school permanently erases all of the following (irreversible):'}
                </p>
                <ul className="list-disc list-inside text-[11px] space-y-0.5 text-rose-800">
                  <li>
                    {language === 'bn'
                      ? 'সকল শিক্ষার্থী, শিক্ষক/স্টাফ, হাজিরা, ফি ও পরীক্ষার ডেটা'
                      : 'All students, staff, attendance, fees, exams & ERP slices'}
                  </li>
                  <li>
                    {language === 'bn'
                      ? 'সকল পেমেন্ট রিকোয়েস্ট ও সাবস্ক্রিপশন হিস্ট্রি'
                      : 'All payment requests, TrxID locks & subscription history'}
                  </li>
                  <li>
                    {language === 'bn'
                      ? `স্কুলের সকল লগইন অ্যাকাউন্ট (${deletingSchool.adminEmail} সহ)`
                      : `All school Firebase Auth login accounts (including ${deletingSchool.adminEmail})`}
                  </li>
                </ul>
              </div>

              <label className="flex items-start space-x-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={deleteConfirmChecked}
                  onChange={(e) => setDeleteConfirmChecked(e.target.checked)}
                  className="mt-0.5"
                />
                <span className="text-[11px] font-semibold text-slate-800">
                  {language === 'bn'
                    ? `আমি নিশ্চিত যে "${deletingSchool.schoolName}" (${deletingSchool.schoolId}) এবং এর সকল ডেটা স্থায়ীভাবে ডিলিট করতে চাই।`
                    : `I confirm I want to permanently delete "${deletingSchool.schoolName}" (${deletingSchool.schoolId}) and all its data.`}
                </span>
              </label>

              <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setDeletingSchool(null);
                    setDeleteConfirmChecked(false);
                  }}
                  className="px-4 py-2 rounded-xl border border-slate-200 font-semibold text-slate-700"
                >
                  {language === 'bn' ? 'বাতিল করুন' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={!deleteConfirmChecked || busyActionId === deletingSchool.schoolId}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold inline-flex items-center space-x-1.5 disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>
                    {busyActionId === deletingSchool.schoolId
                      ? language === 'bn'
                        ? 'ডিলিট হচ্ছে...'
                        : 'Deleting...'
                      : language === 'bn'
                      ? 'স্থায়ীভাবে ডিলিট করুন'
                      : 'Delete Permanently'}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PER-SCHOOL CREDENTIALS & USER MANAGEMENT MODAL */}
      <AccountCredentialsModal
        isOpen={Boolean(credsModalSchoolId)}
        initialTab="manage_users"
        initialSchoolId={credsModalSchoolId || undefined}
        onClose={() => {
          const sid = credsModalSchoolId;
          setCredsModalSchoolId(null);
          if (sid && detailsData?.school.schoolId === sid) {
            handleViewDetails(sid);
          }
        }}
      />
    </div>
  );
};
