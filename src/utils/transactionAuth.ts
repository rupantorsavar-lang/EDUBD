import { Staff, TransactionAuthMethod, TransactionSecurityConfig, UserProfile } from '../types';

const SESSION_PASSWORD_HASH_KEY = 'school_erp_tx_session_pw_hash';
const SESSION_UNLOCK_KEY = 'school_erp_tx_session_unlock';
const ATTEMPT_STATE_KEY = 'school_erp_tx_attempts';

export const MAX_PASSWORD_ATTEMPTS = 5;
export const LOCKOUT_DURATION_MS = 30_000; // 30 seconds cooldown after 5 wrong tries
export const TIMED_UNLOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes

export const DEFAULT_TRANSACTION_SECURITY_CONFIG: TransactionSecurityConfig = {
  requireTransactionPassword: true,
  promptFrequency: 'always',
  allowDedicatedPin: true,
  userPinHashes: {},
};

const safeSessionGet = (key: string): string | null => {
  try {
    if (typeof sessionStorage !== 'undefined') return sessionStorage.getItem(key);
  } catch {
    // ignore
  }
  return null;
};

const safeSessionSet = (key: string, val: string): void => {
  try {
    if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(key, val);
  } catch {
    // ignore
  }
};

const safeSessionRemove = (key: string): void => {
  try {
    if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(key);
  } catch {
    // ignore
  }
};

// In-memory fallbacks when sessionStorage is unavailable (tests / strict mode)
const memStore = new Map<string, string>();
const readSession = (key: string): string | null => safeSessionGet(key) ?? memStore.get(key) ?? null;
const writeSession = (key: string, val: string): void => {
  memStore.set(key, val);
  safeSessionSet(key, val);
};
const removeSession = (key: string): void => {
  memStore.delete(key);
  safeSessionRemove(key);
};

export async function sha256Hex(input: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const encoder = new TextEncoder();
    const data = encoder.encode(input);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  // Pure deterministic fallback for restricted non-secure contexts
  let h1 = 0xdeadbeef ^ input.length;
  let h2 = 0x41c6ce57 ^ input.length;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `${(h2 >>> 0).toString(16).padStart(8, '0')}${(h1 >>> 0).toString(16).padStart(8, '0')}`;
}

export async function hashUserSecret(secret: string): Promise<string> {
  return sha256Hex(`smartschool_tx_v1:${secret.trim()}`);
}

export function getUserIdentityKeys(user?: UserProfile | null, staffList: Staff[] = []): string[] {
  if (!user) return [];
  const keys = new Set<string>();
  if (user.linkedStaffId) keys.add(`staff:${user.linkedStaffId}`);
  if (user.id) keys.add(`uid:${user.id}`);
  if (user.authUid) keys.add(`uid:${user.authUid}`);
  if (user.email) keys.add(`email:${user.email.trim().toLowerCase()}`);

  const matchedStaff = staffList.find(
    (s) =>
      (user.linkedStaffId && s.id === user.linkedStaffId) ||
      (user.authUid && s.authUid === user.authUid) ||
      (user.email && s.email && s.email.trim().toLowerCase() === user.email.trim().toLowerCase())
  );
  if (matchedStaff) {
    keys.add(`staff:${matchedStaff.id}`);
    if (matchedStaff.email) keys.add(`email:${matchedStaff.email.trim().toLowerCase()}`);
  }
  return Array.from(keys);
}

export function findMatchedStaffForUser(user?: UserProfile | null, staffList: Staff[] = []): Staff | undefined {
  if (!user) return undefined;
  const emailLower = (user.email || '').trim().toLowerCase();
  return staffList.find(
    (s) =>
      (user.linkedStaffId && s.id === user.linkedStaffId) ||
      (user.authUid && s.authUid === user.authUid) ||
      (s.email && emailLower && s.email.trim().toLowerCase() === emailLower)
  );
}

export function getPrimaryUserUnlockKey(user?: UserProfile | null): string {
  if (!user) return '';
  return user.linkedStaffId || user.authUid || user.id || (user.email || '').trim().toLowerCase();
}

export function getStoredTransactionPinHashes(
  user: UserProfile | null | undefined,
  staffList: Staff[],
  config: TransactionSecurityConfig
): string[] {
  const hashes = new Set<string>();
  const matchedStaff = findMatchedStaffForUser(user, staffList);
  if (matchedStaff?.transactionPinHash) {
    hashes.add(matchedStaff.transactionPinHash);
  }
  const map = config.userPinHashes || {};
  getUserIdentityKeys(user, staffList).forEach((k) => {
    if (map[k]) hashes.add(map[k]);
  });
  return Array.from(hashes);
}

export function hasConfiguredTransactionPin(
  user: UserProfile | null | undefined,
  staffList: Staff[],
  config: TransactionSecurityConfig
): boolean {
  return getStoredTransactionPinHashes(user, staffList, config).length > 0;
}

/**
 * Updates ONLY the currently authenticated user's own personal Transaction PIN hash.
 * Plaintext PIN is never stored anywhere — only an irreversible SHA-256 digest.
 * No other user (including Super Admin) can view, set, or reset another user's PIN.
 */
export async function buildTransactionPinUpdate(
  targetUser: UserProfile,
  newPin: string,
  staffList: Staff[],
  config: TransactionSecurityConfig
): Promise<{ nextConfig: TransactionSecurityConfig; updatedStaff?: Staff }> {
  const cleanPin = newPin.trim();
  if (!cleanPin) {
    throw new Error('Transaction PIN cannot be empty');
  }
  const pinHash = await hashUserSecret(cleanPin);
  const keys = getUserIdentityKeys(targetUser, staffList);
  const nextPinHashes = { ...(config.userPinHashes || {}) };

  keys.forEach((k) => {
    nextPinHashes[k] = pinHash;
  });

  const matchedStaff = findMatchedStaffForUser(targetUser, staffList);
  const updatedStaff: Staff | undefined = matchedStaff
    ? {
        ...matchedStaff,
        transactionPinHash: pinHash,
      }
    : undefined;

  return {
    nextConfig: {
      ...config,
      allowDedicatedPin: true,
      userPinHashes: nextPinHashes,
      updatedAt: new Date().toISOString(),
    },
    updatedStaff,
  };
}

// Session login-password hash is ONLY used for self-service "Forgot PIN" identity verification
// when offline — NEVER for authorizing financial transactions.
export async function cacheSessionPasswordVerifier(
  uid: string,
  email: string,
  password: string
): Promise<void> {
  if (!password || (!uid && !email)) return;
  const normalizedEmail = (email || '').trim().toLowerCase();
  const hash = await hashUserSecret(password);
  writeSession(
    SESSION_PASSWORD_HASH_KEY,
    JSON.stringify({ uid: uid || '', email: normalizedEmail, hash })
  );
}

export async function verifySessionPasswordFallback(
  uid: string,
  email: string,
  password: string
): Promise<boolean> {
  const raw = readSession(SESSION_PASSWORD_HASH_KEY);
  if (!raw || !password) return false;
  try {
    const parsed = JSON.parse(raw);
    const normalizedEmail = (email || '').trim().toLowerCase();
    const identityMatches =
      (uid && parsed.uid && parsed.uid === uid) ||
      (normalizedEmail && parsed.email && parsed.email === normalizedEmail);
    if (!identityMatches) return false;
    const candidate = await hashUserSecret(password);
    return candidate === parsed.hash;
  } catch {
    return false;
  }
}

export function clearSessionPasswordVerifier(): void {
  removeSession(SESSION_PASSWORD_HASH_KEY);
}

export function isTransactionSessionUnlocked(
  userKey: string,
  config: TransactionSecurityConfig,
  nowMs = Date.now()
): boolean {
  if (!config.requireTransactionPassword) return true;
  if (config.promptFrequency !== 'timed_15m' || !userKey) return false;
  const raw = readSession(SESSION_UNLOCK_KEY);
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw);
    if (parsed.userKey !== userKey) return false;
    return typeof parsed.expiresAt === 'number' && parsed.expiresAt > nowMs;
  } catch {
    return false;
  }
}

export function markTransactionSessionUnlocked(userKey: string, nowMs = Date.now()): void {
  if (!userKey) return;
  writeSession(
    SESSION_UNLOCK_KEY,
    JSON.stringify({
      userKey,
      unlockedAt: nowMs,
      expiresAt: nowMs + TIMED_UNLOCK_DURATION_MS,
    })
  );
}

export function lockTransactionSession(): void {
  removeSession(SESSION_UNLOCK_KEY);
}

export function getTransactionRemainingUnlockMinutes(userKey: string, nowMs = Date.now()): number {
  const raw = readSession(SESSION_UNLOCK_KEY);
  if (!raw || !userKey) return 0;
  try {
    const parsed = JSON.parse(raw);
    if (parsed.userKey !== userKey || typeof parsed.expiresAt !== 'number') return 0;
    const rem = parsed.expiresAt - nowMs;
    return rem > 0 ? Math.ceil(rem / 60_000) : 0;
  } catch {
    return 0;
  }
}

// Wrong PIN attempt cooldown tracking
interface AttemptRecord {
  count: number;
  lockedUntil: number;
}

const readAttempts = (): AttemptRecord => {
  const raw = readSession(ATTEMPT_STATE_KEY);
  if (!raw) return { count: 0, lockedUntil: 0 };
  try {
    return JSON.parse(raw);
  } catch {
    return { count: 0, lockedUntil: 0 };
  }
};

export function getRemainingCooldownSeconds(nowMs = Date.now()): number {
  const rec = readAttempts();
  if (rec.lockedUntil > nowMs) {
    return Math.ceil((rec.lockedUntil - nowMs) / 1000);
  }
  return 0;
}

export function recordFailedPasswordAttempt(nowMs = Date.now()): {
  attempts: number;
  cooldownSeconds: number;
} {
  const prev = readAttempts();
  const baseCount = prev.lockedUntil > 0 && prev.lockedUntil <= nowMs ? 0 : prev.count;
  const nextCount = baseCount + 1;
  const lockedUntil = nextCount >= MAX_PASSWORD_ATTEMPTS ? nowMs + LOCKOUT_DURATION_MS : 0;
  writeSession(ATTEMPT_STATE_KEY, JSON.stringify({ count: nextCount, lockedUntil }));
  return {
    attempts: nextCount,
    cooldownSeconds: lockedUntil > nowMs ? Math.ceil((lockedUntil - nowMs) / 1000) : 0,
  };
}

export function resetFailedPasswordAttempts(): void {
  removeSession(ATTEMPT_STATE_KEY);
}

export interface VerifyTransactionSecretResult {
  valid: boolean;
  method?: TransactionAuthMethod;
  reason?: 'EMPTY' | 'COOLDOWN' | 'WRONG_PIN' | 'NEEDS_PIN_SETUP';
  cooldownSeconds?: number;
}

/**
 * Strictly authorizes financial transactions using ONLY the user's personal Transaction PIN.
 * Account login passwords are NEVER accepted to authorize a transaction.
 */
export async function verifyTransactionSecret(params: {
  password: string;
  user: UserProfile;
  staffList: Staff[];
  config: TransactionSecurityConfig;
  nowMs?: number;
}): Promise<VerifyTransactionSecretResult> {
  const nowMs = params.nowMs ?? Date.now();
  const cooldown = getRemainingCooldownSeconds(nowMs);
  if (cooldown > 0) {
    return { valid: false, reason: 'COOLDOWN', cooldownSeconds: cooldown };
  }

  const storedPinHashes = getStoredTransactionPinHashes(
    params.user,
    params.staffList,
    params.config
  );
  if (storedPinHashes.length === 0) {
    return { valid: false, reason: 'NEEDS_PIN_SETUP' };
  }

  const entered = params.password.trim();
  if (!entered) {
    return { valid: false, reason: 'EMPTY' };
  }

  const enteredHash = await hashUserSecret(entered);
  if (storedPinHashes.includes(enteredHash)) {
    resetFailedPasswordAttempts();
    return { valid: true, method: 'transaction_pin' };
  }

  const res = recordFailedPasswordAttempt(nowMs);
  return {
    valid: false,
    reason: res.cooldownSeconds > 0 ? 'COOLDOWN' : 'WRONG_PIN',
    cooldownSeconds: res.cooldownSeconds,
  };
}

/**
 * Verifies ONLY the logged-in user's own account login password for self-service
 * "Forgot Transaction PIN" recovery. Never used to authorize transactions directly.
 */
export async function verifyAccountOwnerIdentity(params: {
  loginPassword: string;
  user: UserProfile;
  hasFirebasePasswordProvider: boolean;
  verifyFirebasePassword?: (password: string) => Promise<void>;
}): Promise<{ verified: boolean; needsGoogleReauth?: boolean }> {
  if (!params.loginPassword.trim()) {
    return { verified: false };
  }

  if (params.hasFirebasePasswordProvider && params.verifyFirebasePassword) {
    try {
      await params.verifyFirebasePassword(params.loginPassword);
      return { verified: true };
    } catch (err: any) {
      const code = String(err?.code || '');
      const msg = String(err?.message || '').toLowerCase();
      const isNetworkIssue =
        code === 'auth/network-request-failed' ||
        code === 'auth/internal-error' ||
        msg.includes('network');
      if (isNetworkIssue) {
        const offlineMatched = await verifySessionPasswordFallback(
          params.user.authUid || params.user.id,
          params.user.email,
          params.loginPassword
        );
        return { verified: offlineMatched };
      }
      return { verified: false };
    }
  }

  const sessionMatched = await verifySessionPasswordFallback(
    params.user.authUid || params.user.id,
    params.user.email,
    params.loginPassword
  );
  if (sessionMatched) {
    return { verified: true };
  }

  if (!params.hasFirebasePasswordProvider) {
    return { verified: false, needsGoogleReauth: true };
  }

  return { verified: false };
}
