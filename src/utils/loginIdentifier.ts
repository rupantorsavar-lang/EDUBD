export const SYNTHETIC_EMAIL_DOMAIN_SUFFIX = '.users.smartschool.bd';

const BANGLA_DIGIT_MAP: Record<string, string> = {
  '০': '0',
  '১': '1',
  '২': '2',
  '৩': '3',
  '৪': '4',
  '৫': '5',
  '৬': '6',
  '৭': '7',
  '৮': '8',
  '৯': '9',
};

export function normalizeBanglaDigits(raw: string): string {
  return String(raw || '').replace(/[০-৯]/g, (ch) => BANGLA_DIGIT_MAP[ch] ?? ch);
}

export function isValidEmailAddress(raw: string): boolean {
  const trimmed = String(raw || '').trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

export function isSyntheticAuthEmail(email?: string | null): boolean {
  const trimmed = String(email || '').trim().toLowerCase();
  return /^[^\s@]+@[a-z0-9-]+\.users\.smartschool\.bd$/.test(trimmed);
}

export function isPhoneLikeIdentifier(raw: string): boolean {
  const converted = normalizeBanglaDigits(raw).trim();
  if (!converted || converted.includes('@')) return false;
  // Allow optional leading '+', digits, spaces, hyphens, parentheses, dots only
  if (!/^\+?[\d\s().-]+$/.test(converted)) return false;
  const digits = converted.replace(/\D/g, '');
  return digits.length >= 6 && digits.length <= 15;
}

export function normalizePhoneNumber(raw: string): string {
  const converted = normalizeBanglaDigits(raw).trim();
  const digits = converted.replace(/\D/g, '');
  if (!digits) return '';
  // Canonicalize Bangladesh mobile formats: +8801XXXXXXXXX, 8801XXXXXXXXX, 008801XXXXXXXXX, 1XXXXXXXXX -> 01XXXXXXXXX
  if (digits.startsWith('008801') && digits.length === 15) {
    return `0${digits.slice(5)}`;
  }
  if (digits.startsWith('8801') && digits.length === 13) {
    return `0${digits.slice(3)}`;
  }
  if (digits.startsWith('1') && digits.length === 10) {
    return `0${digits}`;
  }
  return digits;
}

export function normalizeLoginUsernameKey(raw: string): string {
  const trimmed = normalizeBanglaDigits(raw).trim();
  if (!trimmed) return '';
  if (trimmed.includes('@')) {
    return `email:${trimmed.toLowerCase()}`;
  }
  if (isPhoneLikeIdentifier(trimmed)) {
    const normPhone = normalizePhoneNumber(trimmed);
    return normPhone ? `phone:${normPhone}` : '';
  }
  const collapsed = trimmed.replace(/\s+/g, ' ').toLowerCase();
  return `name:${collapsed}`;
}

export interface LoginIdentifierValidationResult {
  valid: boolean;
  kind: 'email' | 'mobile' | 'username';
  displayValue: string;
  normalizedKey: string;
  normalizedPhone?: string;
  error?: string;
  errorBn?: string;
}

export function validateLoginIdentifier(raw: string): LoginIdentifierValidationResult {
  const trimmed = String(raw || '').trim();
  if (!trimmed) {
    return {
      valid: false,
      kind: 'username',
      displayValue: '',
      normalizedKey: '',
      error: 'Please enter an email address, mobile number, or username.',
      errorBn: 'অনুগ্রহ করে ইমেইল, মোবাইল নম্বর অথবা ইউজারনেম লিখুন।',
    };
  }

  if (/[\u0000-\u001F\u007F]/.test(trimmed)) {
    return {
      valid: false,
      kind: 'username',
      displayValue: trimmed,
      normalizedKey: '',
      error: 'Login identifier contains invalid characters.',
      errorBn: 'লগইন আইডিতে অবৈধ অক্ষর রয়েছে।',
    };
  }

  if (trimmed.length > 120) {
    return {
      valid: false,
      kind: 'username',
      displayValue: trimmed,
      normalizedKey: '',
      error: 'Login identifier must be 120 characters or fewer.',
      errorBn: 'লগইন আইডি ১২০ অক্ষরের মধ্যে হতে হবে।',
    };
  }

  if (trimmed.includes('@')) {
    if (!isValidEmailAddress(trimmed)) {
      return {
        valid: false,
        kind: 'email',
        displayValue: trimmed.toLowerCase(),
        normalizedKey: '',
        error: 'Please provide a valid email address.',
        errorBn: 'সঠিক ইমেইল ঠিকানা লিখুন।',
      };
    }
    const lowerEmail = trimmed.toLowerCase();
    return {
      valid: true,
      kind: 'email',
      displayValue: lowerEmail,
      normalizedKey: `email:${lowerEmail}`,
    };
  }

  if (trimmed.length < 2) {
    return {
      valid: false,
      kind: 'username',
      displayValue: trimmed,
      normalizedKey: '',
      error: 'Username or mobile number must be at least 2 characters.',
      errorBn: 'ইউজারনেম বা মোবাইল নম্বর কমপক্ষে ২ অক্ষরের হতে হবে।',
    };
  }

  if (isPhoneLikeIdentifier(trimmed)) {
    const normalizedPhone = normalizePhoneNumber(trimmed);
    const displayValue = normalizeBanglaDigits(trimmed).replace(/\s+/g, ' ').trim();
    return {
      valid: true,
      kind: 'mobile',
      displayValue,
      normalizedKey: `phone:${normalizedPhone}`,
      normalizedPhone,
    };
  }

  return {
    valid: true,
    kind: 'username',
    displayValue: trimmed,
    normalizedKey: normalizeLoginUsernameKey(trimmed),
  };
}

function shortFnvHashHex(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36).padStart(6, '0').slice(0, 7);
}

export function buildSyntheticAuthEmail(
  identifier: string,
  schoolIdOrSlug: string,
  collisionSuffix?: string
): string {
  const schoolSlug =
    String(schoolIdOrSlug || 'sch')
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '')
      .slice(0, 32) || 'sch';

  const normalizedKey = normalizeLoginUsernameKey(identifier) || `raw:${identifier.trim().toLowerCase()}`;
  const isPhone = normalizedKey.startsWith('phone:');
  const prefix = isPhone ? 'm' : 'u';

  const rawForBase = isPhone ? normalizedKey.slice(6) : normalizeBanglaDigits(identifier);
  const asciiBase = rawForBase
    .toLowerCase()
    .replace(/\s+/g, '.')
    .replace(/[^a-z0-9._-]/g, '')
    .replace(/\.{2,}/g, '.')
    .replace(/^[._-]+|[._-]+$/g, '')
    .slice(0, 28);

  const hash = shortFnvHashHex(`${schoolSlug}:${normalizedKey}`);
  const suffix = collisionSuffix ? `.${collisionSuffix.replace(/[^a-z0-9]/gi, '').toLowerCase()}` : '';
  const localPart = asciiBase ? `${prefix}.${asciiBase}.${hash}${suffix}` : `${prefix}.${hash}${suffix}`;

  return `${localPart}@${schoolSlug}${SYNTHETIC_EMAIL_DOMAIN_SUFFIX}`;
}

export function formatDisplayLoginId(user: { username?: string | null; email?: string | null }): string {
  const uname = String(user?.username || '').trim();
  const email = String(user?.email || '').trim();
  if (uname) return uname;
  if (email && !isSyntheticAuthEmail(email)) return email;
  if (email) {
    return email.split('@')[0] || email;
  }
  return '';
}
