export type CameraPermissionState = 'granted' | 'prompt' | 'denied' | 'unknown';

export function isAndroidWebView(userAgent?: string): boolean {
  const ua =
    typeof userAgent === 'string'
      ? userAgent
      : typeof navigator !== 'undefined'
      ? navigator.userAgent || ''
      : '';
  if (!ua) return false;
  if (/AppCreator24/i.test(ua)) return true;
  if (/\bwv\b/i.test(ua) && /Android/i.test(ua)) return true;
  if (/Android/i.test(ua) && /Version\/\d+\.\d+/i.test(ua) && !/EdgA|OPR|SamsungBrowser|Firefox/i.test(ua)) {
    return true;
  }
  return false;
}

export function isCameraPermissionError(err: unknown): boolean {
  const raw =
    typeof err === 'string'
      ? err
      : `${(err as any)?.name || ''} ${(err as any)?.message || ''} ${String(err || '')}`;
  const lower = raw.toLowerCase();
  return (
    lower.includes('notallowed') ||
    lower.includes('permission') ||
    lower.includes('securityerror') ||
    lower.includes('denied by system') ||
    lower.includes('not allowed')
  );
}

export function isCameraHardwareBusyError(err: unknown): boolean {
  const raw =
    typeof err === 'string'
      ? err
      : `${(err as any)?.name || ''} ${(err as any)?.message || ''} ${String(err || '')}`;
  const lower = raw.toLowerCase();
  return (
    lower.includes('notreadable') ||
    lower.includes('trackstarterror') ||
    lower.includes('could not start video source') ||
    lower.includes('device in use') ||
    lower.includes('aborterror')
  );
}

export function formatCameraStartupErrorMessage(params: {
  error: unknown;
  language: 'bn' | 'en';
  inIframe: boolean;
  permissionState: CameraPermissionState;
  hasMediaDevices: boolean;
  isWebView?: boolean;
}): {
  message: string;
  isPermissionBlocked: boolean;
} {
  const { error, language, inIframe, permissionState, hasMediaDevices, isWebView = false } = params;

  if (!hasMediaDevices) {
    return {
      isPermissionBlocked: true,
      message: isWebView
        ? language === 'bn'
          ? 'এই অ্যাপ (WebView)-এ লাইভ ক্যামেরা সাপোর্ট বন্ধ আছে। AppCreator24-এ Camera পারমিশন চালু করুন অথবা নিচের "ক্রোম ব্রাউজারে খুলুন" ও "ছবি/গ্যালারি স্ক্যান" ব্যবহার করুন।'
          : 'Live camera is unsupported in this App WebView. Enable Camera permission in AppCreator24 or use "Open in Chrome" or Photo/Gallery Scan below.'
        : language === 'bn'
        ? 'এই ইন-অ্যাপ ব্রাউজার বা ব্রাউজারে লাইভ ক্যামেরা সমর্থিত নয়। সরাসরি Google Chrome দিয়ে সাইটটি খুলুন অথবা নিচের "ছবি তুলে স্ক্যান" ব্যবহার করুন।'
        : 'Live camera streaming is unavailable in this browser/WebView. Open the URL directly in Chrome or use Photo Scan below.',
    };
  }

  if (isCameraPermissionError(error) || permissionState === 'denied') {
    if (inIframe) {
      return {
        isPermissionBlocked: true,
        message:
          language === 'bn'
            ? 'আইফ্রেম/প্রিভিউ উইন্ডোর ভেতর ক্যামেরা ব্লক রয়েছে। নিচের "নতুন ট্যাবে খুলুন" বাটনে চাপ দিয়ে সরাসরি ব্রাউজারে ওপেন করুন।'
            : 'Camera is blocked inside this embedded iframe/preview. Tap "Open in New Tab" below to run the scanner directly in Chrome.',
      };
    }

    if (isWebView) {
      return {
        isPermissionBlocked: true,
        message:
          language === 'bn'
            ? 'এই অ্যাপ (AppCreator24 WebView)-এর ভেতর ক্যামেরা পারমিশন ব্লক রয়েছে। AppCreator24 সেটিংস ও ফোনের App Permissions থেকে Camera চালু করুন, অথবা "ক্রোম ব্রাউজারে খুলুন" / "ছবি তুলে স্ক্যান" ব্যবহার করুন।'
            : 'Camera permission is blocked inside this App WebView (AppCreator24). Enable Camera in AppCreator24 & Android App Permissions, or use "Open in Chrome" / Photo Scan below.',
      };
    }

    if (permissionState === 'denied') {
      return {
        isPermissionBlocked: true,
        message:
          language === 'bn'
            ? 'ব্রাউজারে ক্যামেরা পারমিশন Block করা আছে। অ্যাড্রেস বারের বাম পাশে ⚙️ বা 🔒 আইকনে চাপ দিয়ে Camera → Allow করুন এবং পেজ রিলোড দিন।'
            : 'Camera permission is blocked in browser settings. Tap the 🔒/⚙️ icon in the address bar, set Camera to Allow, and reload.',
      };
    }

    return {
      isPermissionBlocked: true,
      message:
        language === 'bn'
          ? 'ক্যামেরা পারমিশন পাওয়া যায়নি। "ক্যামেরা চালু করুন" বাটনে চাপ দিয়ে ব্রাউজার পপ-আপে Allow দিন (অথবা নিচের ছবি তুলে স্ক্যান ব্যবহার করুন)।'
          : 'Camera permission was not granted. Tap Start Camera and select Allow in the prompt (or use Photo Scan below).',
    };
  }

  if (isCameraHardwareBusyError(error)) {
    return {
      isPermissionBlocked: false,
      message:
        language === 'bn'
          ? 'ফোন/পিসির ক্যামেরাটি অন্য কোনো অ্যাপ ব্যবহার করছে বা সাময়িকভাবে ব্যস্ত। অন্য অ্যাপ বন্ধ করে আবার চেষ্টা করুন।'
          : 'Camera is currently busy or in use by another application. Close other camera apps and retry.',
    };
  }

  const fallback =
    typeof error === 'string'
      ? error
      : (error as any)?.message || String(error || 'Camera could not be started.');

  return {
    isPermissionBlocked: false,
    message: fallback,
  };
}
