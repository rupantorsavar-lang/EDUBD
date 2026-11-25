export type AuthFlowType =
  | 'google-popup'
  | 'google-redirect'
  | 'email-password'
  | 'password-reset';

export interface FormattedAuthError {
  message: string;
  needsStandaloneTab: boolean;
  canUseRedirect: boolean;
  isNetworkError: boolean;
  isUnauthorizedDomain: boolean;
}

const EXPECTED_AUTH_WARNING_CODES = new Set([
  'auth/network-request-failed',
  'auth/popup-blocked',
  'auth/popup-closed-by-user',
  'auth/cancelled-popup-request',
  'auth/unauthorized-domain',
  'auth/user-cancelled',
  'auth/expired-popup-request',
]);

export function isExpectedAuthWarningCode(code?: string | null): boolean {
  if (!code) return false;
  return EXPECTED_AUTH_WARNING_CODES.has(code);
}

/**
 * Firebase JS SDK's BrowserPopupRedirectResolver caches `_validateOrigin(auth)` in
 * `this.originValidationPromises[key]` without a `.catch()` cleanup handler.
 * If `_validateOrigin` rejects once (e.g. `auth/network-request-failed`), the same
 * rejected Promise stays cached for the rest of the page session unless cleared.
 */
export function clearFailedOriginValidationCache(resolverCandidates: Array<any>): number {
  let clearedCount = 0;
  for (const resolver of resolverCandidates) {
    if (
      resolver &&
      typeof resolver === 'object' &&
      resolver.originValidationPromises &&
      typeof resolver.originValidationPromises === 'object'
    ) {
      for (const key of Object.keys(resolver.originValidationPromises)) {
        delete resolver.originValidationPromises[key];
        clearedCount += 1;
      }
    }
  }
  return clearedCount;
}

export function formatFirebaseAuthErrorMessage(params: {
  code?: string;
  rawMessage?: string;
  flow: AuthFlowType;
  host?: string;
  inIframe?: boolean;
  isOffline?: boolean;
  isWebView?: boolean;
}): FormattedAuthError {
  const {
    code = '',
    rawMessage = '',
    flow,
    host = '',
    inIframe = false,
    isOffline = false,
    isWebView = false,
  } = params;

  if (code === 'auth/unauthorized-domain') {
    return {
      message: `ডোমেইনটি Firebase-এ অনুমোদিত নয় (${host || 'current host'})। Firebase Console → Authentication → Settings → Authorized domains-এ "${host}" যোগ করুন।`,
      needsStandaloneTab: false,
      canUseRedirect: false,
      isNetworkError: false,
      isUnauthorizedDomain: true,
    };
  }

  if (code === 'auth/network-request-failed') {
    if (isOffline) {
      return {
        message:
          'ইন্টারনেট সংযোগ বিচ্ছিন্ন রয়েছে (Offline)। আপনার Wi-Fi বা মোবাইল ডেটা চালু করে আবার চেষ্টা করুন।',
        needsStandaloneTab: false,
        canUseRedirect: false,
        isNetworkError: true,
        isUnauthorizedDomain: false,
      };
    }

    if (flow === 'google-popup' || flow === 'google-redirect') {
      if (isWebView) {
        return {
          message:
            'অ্যাপ WebView বা নেটওয়ার্কের কারণে Google Sign-In সার্ভারের সাথে সংযোগ হয়নি। ইন্টারনেট চেক করুন, অথবা Chrome ব্রাউজারে খুলে / Email ও Password দিয়ে লগইন করুন।',
          needsStandaloneTab: true,
          canUseRedirect: false,
          isNetworkError: true,
          isUnauthorizedDomain: false,
        };
      }

      if (inIframe) {
        return {
          message:
            'প্রিভিউ ফ্রেম (iframe) বা নেটওয়ার্ক সমস্যার কারণে Google Auth সার্ভারে সংযোগ হয়নি। ইন্টারনেট/Ad-Blocker চেক করে আবার চেষ্টা করুন, অথবা "নতুন ট্যাবে খুলে Google Login করুন" বা Email ও Password ব্যবহার করুন।',
          needsStandaloneTab: true,
          canUseRedirect: false,
          isNetworkError: true,
          isUnauthorizedDomain: false,
        };
      }

      return {
        message:
          'Google Auth সার্ভারের সাথে নেটওয়ার্ক সংযোগ ব্যর্থ হয়েছে (auth/network-request-failed)। আপনার ইন্টারনেট/VPN/Ad-Blocker চেক করে আবার চেষ্টা করুন অথবা Email ও Password দিয়ে লগইন করুন।',
        needsStandaloneTab: false,
        canUseRedirect: false,
        isNetworkError: true,
        isUnauthorizedDomain: false,
      };
    }

    return {
      message:
        'নেটওয়ার্ক সমস্যার কারণে সার্ভারের সাথে সংযোগ করা যায়নি। আপনার ইন্টারনেট সংযোগ বা Ad-Blocker/VPN চেক করে আবার চেষ্টা করুন।',
      needsStandaloneTab: false,
      canUseRedirect: false,
      isNetworkError: true,
      isUnauthorizedDomain: false,
    };
  }

  if (code === 'auth/popup-blocked') {
    if (inIframe) {
      return {
        message:
          'মোবাইল/প্রিভিউ ব্রাউজার লগইন পপ-আপ ব্লক করেছে। নিচের "নতুন ট্যাবে খুলে Google Login করুন" বাটনে চাপ দিন অথবা Email ও Password দিয়ে লগইন করুন।',
        needsStandaloneTab: true,
        canUseRedirect: false,
        isNetworkError: false,
        isUnauthorizedDomain: false,
      };
    }
    return {
      message: 'পপ-আপ ব্লক হওয়ায় Google Redirect লগইনে পাঠানো হচ্ছে...',
      needsStandaloneTab: false,
      canUseRedirect: true,
      isNetworkError: false,
      isUnauthorizedDomain: false,
    };
  }

  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
    if (inIframe) {
      return {
        message:
          'মোবাইল প্রিভিউ উইন্ডো (iframe)-এর ভেতর থেকে Google পপ-আপ সম্পন্ন হওয়ার আগেই বন্ধ হয়ে গেছে। নিচের বাটনে চাপ দিয়ে নতুন ট্যাবে খুলে Google Login করুন, অথবা Email ও Password দিয়ে লগইন করুন।',
        needsStandaloneTab: true,
        canUseRedirect: false,
        isNetworkError: false,
        isUnauthorizedDomain: false,
      };
    }
    return {
      message:
        'Google লগইন পপ-আপ সম্পূর্ণ হওয়ার আগেই বন্ধ হয়ে গেছে। আবার চেষ্টা করুন অথবা নিচের "Redirect দিয়ে Google Login" বাটন ব্যবহার করুন।',
      needsStandaloneTab: false,
      canUseRedirect: true,
      isNetworkError: false,
      isUnauthorizedDomain: false,
    };
  }

  if (code === 'auth/too-many-requests') {
    return {
      message:
        'অতিরিক্ত চেষ্টার কারণে সাময়িকভাবে ব্লক করা হয়েছে। কিছুক্ষণ অপেক্ষা করে আবার চেষ্টা করুন।',
      needsStandaloneTab: false,
      canUseRedirect: false,
      isNetworkError: false,
      isUnauthorizedDomain: false,
    };
  }

  const defaultFallback =
    flow === 'google-redirect'
      ? 'Google redirect sign-in failed. Please try again.'
      : flow === 'password-reset'
      ? 'Could not send reset email. Please verify your login ID or contact your School Admin.'
      : flow === 'email-password'
      ? 'Authentication failed.'
      : 'Google Sign-In failed.';

  return {
    message: rawMessage || defaultFallback,
    needsStandaloneTab: false,
    canUseRedirect: false,
    isNetworkError: false,
    isUnauthorizedDomain: false,
  };
}
