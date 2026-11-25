import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { SaaSPlanId } from '../../services/saasApi';
import { SubscriptionBillingView } from './SubscriptionBillingView';
import {
  ShieldAlert,
  Clock,
  CreditCard,
  LogOut,
  Phone,
  Mail,
  RefreshCw,
  ArrowLeft,
  Building2,
  Calendar,
  Eye,
  X,
} from 'lucide-react';

interface SaaSAccessGateProps {
  children: React.ReactNode;
}

export interface SaaSAccessBlockScreenProps {
  blockReason: 'SUBSCRIPTION_EXPIRED' | 'SCHOOL_SUSPENDED' | 'SUBSCRIPTION_PENDING' | 'NO_TENANT_ASSIGNED' | string;
  school: {
    schoolId: string;
    schoolName: string;
    schoolCode?: string;
    adminName: string;
    adminEmail: string;
  } | null;
  subscription: {
    planId?: SaaSPlanId;
    planName: string;
    startDate?: string;
    expiryDate: string;
    lastPaymentDate?: string | null;
    expiredDays: number;
    remainingDays?: number;
    isSuspended?: boolean;
    isPending?: boolean;
  } | null;
  support: {
    phone: string;
    email: string;
  };
  refreshing?: boolean;
  onRefresh?: () => Promise<void> | void;
  onLogout?: () => void;
  isDemoPreview?: boolean;
  onClosePreview?: () => void;
  demoToolbarSlot?: React.ReactNode;
}

export const SaaSAccessBlockScreen: React.FC<SaaSAccessBlockScreenProps> = ({
  blockReason,
  school,
  subscription: sub,
  support,
  refreshing = false,
  onRefresh,
  onLogout,
  isDemoPreview = false,
  onClosePreview,
  demoToolbarSlot,
}) => {
  const { language, toBnNumber } = useLanguage();
  const [showRenewalForm, setShowRenewalForm] = useState(false);

  const isSuspended = blockReason === 'SCHOOL_SUSPENDED' || sub?.isSuspended;
  const isPending = blockReason === 'SUBSCRIPTION_PENDING' || sub?.isPending;
  const isNoTenant = blockReason === 'NO_TENANT_ASSIGNED' || !school;

  const previewBanner = isDemoPreview ? (
    <div className="bg-gradient-to-r from-amber-500 via-orange-500 to-rose-600 text-white px-4 py-2.5 shadow-lg">
      <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-2.5 text-xs">
        <div className="flex items-center space-x-2">
          <Eye className="w-4 h-4 shrink-0" />
          <span className="font-bold">
            {language === 'bn'
              ? 'লাইভ ডেমো প্রিভিউ — কোনো স্কুলের মেয়াদ শেষ হলে (Expired) সেই স্কুলের স্ক্রিন ঠিক এমন দেখাবে:'
              : 'Live Demo Preview — This is the exact lock screen an expired school sees:'}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {demoToolbarSlot}
          {onClosePreview && (
            <button
              type="button"
              onClick={onClosePreview}
              className="px-3 py-1 rounded-lg bg-slate-950/90 hover:bg-slate-900 text-white font-bold flex items-center space-x-1 shadow-xs cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              <span>{language === 'bn' ? 'প্রিভিউ বন্ধ করুন' : 'Close Demo'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  ) : null;

  if (showRenewalForm && school && !isSuspended) {
    return (
      <div className="min-h-screen bg-slate-100 flex flex-col">
        {previewBanner}
        <div className="flex-1 p-4 sm:p-6">
          <div className="max-w-5xl mx-auto space-y-4">
            <div className="flex items-center justify-between bg-white px-5 py-3.5 rounded-2xl border border-slate-200 shadow-xs">
              <button
                type="button"
                onClick={() => setShowRenewalForm(false)}
                className="flex items-center space-x-2 text-xs font-bold text-slate-700 hover:text-slate-900 cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>{language === 'bn' ? 'অবরোধ স্ক্রিনে ফিরে যান' : 'Back to Subscription Notice'}</span>
              </button>
              <button
                type="button"
                onClick={isDemoPreview ? onClosePreview : onLogout}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-rose-50 text-rose-700 border border-rose-200 text-xs font-bold hover:bg-rose-100 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>
                  {isDemoPreview
                    ? language === 'bn'
                      ? 'ডেমো বন্ধ করুন'
                      : 'Exit Demo'
                    : language === 'bn'
                    ? 'লগআউট'
                    : 'Logout'}
                </span>
              </button>
            </div>

            <SubscriptionBillingView
              compactMode
              previewMode={isDemoPreview}
              previewSchool={
                isDemoPreview
                  ? {
                      schoolId: school.schoolId,
                      schoolName: school.schoolName,
                      schoolCode: school.schoolCode || school.schoolId,
                    }
                  : undefined
              }
              previewSubscription={
                isDemoPreview && sub
                  ? {
                      planId: sub.planId || 'monthly',
                      planName: sub.planName,
                      startDate: sub.startDate || new Date(Date.now() - 40 * 86_400_000).toISOString(),
                      expiryDate: sub.expiryDate,
                      lastPaymentDate: sub.lastPaymentDate ?? null,
                      effectiveStatus: 'Expired',
                      isExpired: true,
                      expiredDays: sub.expiredDays,
                      remainingDays: 0,
                    }
                  : undefined
              }
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      {previewBanner}
      <div className="flex-1 flex items-center justify-center p-4 sm:p-6">
        <div className="max-w-xl w-full bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden">
          <div
            className={`px-6 py-5 text-white flex items-center justify-between ${
              isSuspended
                ? 'bg-gradient-to-r from-rose-700 to-red-800'
                : isPending
                ? 'bg-gradient-to-r from-amber-600 to-orange-700'
                : 'bg-gradient-to-r from-slate-900 via-rose-900 to-slate-900'
            }`}
          >
            <div className="flex items-center space-x-3">
              <div className="p-2.5 rounded-xl bg-white/15">
                {isPending ? <Clock className="w-6 h-6" /> : <ShieldAlert className="w-6 h-6" />}
              </div>
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-white/80">
                  SmartSchoolBD SaaS Access Gate
                </div>
                <h1 className="text-lg font-black">
                  {isNoTenant
                    ? language === 'bn'
                      ? 'কোনো স্কুল অ্যাসাইন করা নেই'
                      : 'No School Tenant Assigned'
                    : isSuspended
                    ? language === 'bn'
                      ? 'স্কুল অ্যাকাউন্ট স্থগিত করা হয়েছে'
                      : 'School Account Suspended'
                    : isPending
                    ? language === 'bn'
                      ? 'সাবস্ক্রিপশন অনুমোদনের অপেক্ষায়'
                      : 'Subscription Pending Activation'
                    : language === 'bn'
                    ? 'স্কুলের সাবস্ক্রিপশন মেয়াদ শেষ হয়েছে'
                    : 'School Subscription Expired'}
                </h1>
              </div>
            </div>
          </div>

          <div className="p-6 space-y-5 text-xs text-slate-700">
            {school && sub ? (
              <>
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Building2 className="w-4 h-4 text-blue-600" />
                      <span className="font-bold text-slate-900 text-sm">{school.schoolName}</span>
                    </div>
                    <span className="px-2 py-0.5 rounded bg-slate-200 text-slate-800 font-mono font-bold text-[11px]">
                      {school.schoolId}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 border-t border-slate-200">
                    <div>
                      <div className="text-[11px] text-slate-500">
                        {language === 'bn' ? 'বর্তমান প্ল্যান' : 'Current Plan'}
                      </div>
                      <div className="font-bold text-slate-900 mt-0.5">{sub.planName}</div>
                    </div>
                    <div>
                      <div className="text-[11px] text-slate-500">
                        {language === 'bn' ? 'মেয়াদ শেষের তারিখ' : 'Expiry Date'}
                      </div>
                      <div className="font-bold text-slate-900 mt-0.5 flex items-center space-x-1">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        <span>{new Date(sub.expiryDate).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] text-slate-500">
                        {isSuspended
                          ? language === 'bn'
                            ? 'স্ট্যাটাস'
                            : 'Status'
                          : language === 'bn'
                          ? 'মেয়াদোত্তীর্ণ সময়'
                          : 'Expired Days'}
                      </div>
                      <div className="font-black text-rose-600 mt-0.5">
                        {isSuspended
                          ? 'SUSPENDED'
                          : isPending
                          ? 'PENDING'
                          : `${language === 'bn' ? toBnNumber(sub.expiredDays) : sub.expiredDays} ${
                              language === 'bn' ? 'দিন আগে' : 'days ago'
                            }`}
                      </div>
                    </div>
                  </div>
                </div>

                <p className="text-slate-600 leading-relaxed">
                  {isSuspended
                    ? language === 'bn'
                      ? 'মাস্টার অ্যাডমিন কর্তৃক এই স্কুলের অ্যাক্সেস সাময়িকভাবে স্থগিত করা হয়েছে। আপনার স্কুলের সকল ডেটা সুরক্ষিত রয়েছে।'
                      : 'Access for this school has been temporarily suspended by the Platform Master Admin. All school records remain safely preserved.'
                    : language === 'bn'
                    ? 'সাবস্ক্রিপশন মেয়াদ শেষ হওয়ায় ড্যাশবোর্ড ও সকল মডিউল সাময়িকভাবে বন্ধ রয়েছে। আপনার স্কুলের সমস্ত ডেটা সম্পূর্ণ নিরাপদ আছে—নবায়ন (Renew) করলেই পুনরায় চালু হবে।'
                    : 'Access to dashboards and ERP modules is temporarily blocked because the school subscription has expired. All your school data is safely preserved and will be restored immediately upon renewal.'}
                </p>
              </>
            ) : (
              <p className="text-slate-600 leading-relaxed">
                {language === 'bn'
                  ? 'আপনার অ্যাকাউন্টে এখনো কোনো বৈধ স্কুল আইডি যুক্ত করা হয়নি।'
                  : 'Your authenticated account is not yet linked to an active school tenant.'}
              </p>
            )}

            {/* Contact Admin Info */}
            <div className="p-4 rounded-2xl bg-blue-50/70 border border-blue-200 space-y-1.5">
              <div className="font-bold text-blue-950">
                {language === 'bn'
                  ? 'সাহায্য ও অ্যাডমিন যোগাযোগ:'
                  : 'Contact School / Platform Admin:'}
              </div>
              <div className="flex flex-wrap items-center gap-4 text-blue-900">
                <span className="flex items-center space-x-1.5">
                  <Phone className="w-3.5 h-3.5 text-blue-600" />
                  <span>{support.phone}</span>
                </span>
                <span className="flex items-center space-x-1.5">
                  <Mail className="w-3.5 h-3.5 text-blue-600" />
                  <span>{support.email}</span>
                </span>
              </div>
              {school && (
                <div className="text-[11px] text-blue-800 pt-1">
                  School Admin: <strong>{school.adminName}</strong> ({school.adminEmail})
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2">
              <div className="flex flex-wrap items-center gap-2">
                {school && !isSuspended && (
                  <button
                    type="button"
                    onClick={() => setShowRenewalForm(true)}
                    className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-sm flex items-center space-x-2 cursor-pointer"
                  >
                    <CreditCard className="w-4 h-4" />
                    <span>{language === 'bn' ? 'সাবস্ক্রিপশন নবায়ন করুন' : 'Renew Subscription'}</span>
                  </button>
                )}

                {onRefresh && (
                  <button
                    type="button"
                    onClick={onRefresh}
                    disabled={refreshing}
                    className="px-3.5 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold flex items-center space-x-1.5 cursor-pointer"
                  >
                    <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                    <span>{language === 'bn' ? 'পুনরায় যাচাই' : 'Check Status'}</span>
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={isDemoPreview ? onClosePreview : onLogout}
                className="px-3.5 py-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold flex items-center space-x-1.5 cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                <span>
                  {isDemoPreview
                    ? language === 'bn'
                      ? 'প্রিভিউ বন্ধ করুন'
                      : 'Exit Preview'
                    : language === 'bn'
                    ? 'লগআউট'
                    : 'Logout'}
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * Reusable SaaSAccessGate:
 * Validates server-verified school subscription status before rendering protected school modules.
 * Master Admin always retains access to the platform management portal.
 * Note: Backend APIs and Firestore Security Rules also independently block expired/suspended tenants.
 */
export const SaaSAccessGate: React.FC<SaaSAccessGateProps> = ({ children }) => {
  const { isAuthenticated, isAuthInitializing, saasSession, activeRole, logout, refreshSaasSession } =
    useAuth();
  const { language } = useLanguage();
  const [refreshing, setRefreshing] = useState(false);

  if (isAuthInitializing && !(isAuthenticated && saasSession)) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-6 py-5 flex items-center space-x-3 text-sm font-semibold text-slate-700">
          <RefreshCw className="w-5 h-5 text-blue-600 animate-spin" />
          <span>{language === 'bn' ? 'অ্যাকাউন্ট যাচাই করা হচ্ছে...' : 'Verifying school tenant session...'}</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <>{children}</>;
  }

  // Master Admin always retains platform management access
  if (saasSession?.principal?.isMasterAdmin || activeRole === 'master_admin') {
    return <>{children}</>;
  }

  // If subscription is active and accessAllowed === true, render protected ERP modules
  if (saasSession?.accessAllowed) {
    return <>{children}</>;
  }

  const school = saasSession?.school || null;
  const sub = saasSession?.subscription || null;
  const support = saasSession?.platformSupportContact || {
    phone: '+880 1700-070707',
    email: 'support@smartschoolbd.com',
  };
  const blockReason = saasSession?.blockReason || 'SUBSCRIPTION_EXPIRED';

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshSaasSession();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <SaaSAccessBlockScreen
      blockReason={blockReason}
      school={school}
      subscription={sub}
      support={support}
      refreshing={refreshing}
      onRefresh={handleRefresh}
      onLogout={logout}
    />
  );
};
