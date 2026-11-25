import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Staff, TransactionSecurityConfig, UserProfile } from '../../types';
import {
  DEFAULT_TRANSACTION_SECURITY_CONFIG,
  LOCKOUT_DURATION_MS,
  MAX_PASSWORD_ATTEMPTS,
  TIMED_UNLOCK_DURATION_MS,
  buildTransactionPinUpdate,
  cacheSessionPasswordVerifier,
  clearSessionPasswordVerifier,
  getRemainingCooldownSeconds,
  hashUserSecret,
  hasConfiguredTransactionPin,
  isTransactionSessionUnlocked,
  lockTransactionSession,
  markTransactionSessionUnlocked,
  resetFailedPasswordAttempts,
  verifyAccountOwnerIdentity,
  verifyTransactionSecret,
} from '../transactionAuth';

const mockAccountant: UserProfile = {
  id: 'u_acc_1',
  authUid: 'firebase_uid_1',
  linkedStaffId: 'staff_1',
  name: 'Karim Uddin',
  nameBn: 'করিম উদ্দিন',
  email: 'karim@school.edu.bd',
  role: 'accountant',
};

const mockSuperAdmin: UserProfile = {
  id: 'u_sa_1',
  authUid: 'firebase_uid_sa',
  linkedStaffId: 'staff_sa',
  name: 'Principal Rahman',
  nameBn: 'অধ্যক্ষ রহমান',
  email: 'principal@school.edu.bd',
  role: 'super_admin',
};

const mockStaff: Staff = {
  id: 'staff_1',
  employeeId: 'EMP-001',
  authUid: 'firebase_uid_1',
  nameEn: 'Karim Uddin',
  nameBn: 'করিম উদ্দিন',
  gender: 'Male',
  designation: 'Accountant',
  department: 'Accounts',
  qualification: 'M.Com',
  phone: '01711000000',
  email: 'karim@school.edu.bd',
  role: 'accountant',
  joiningDate: '2025-01-01',
  basicSalary: 20000,
  houseRentAllowance: 5000,
  medicalAllowance: 2000,
  otherAllowance: 1000,
  providentFundDeduction: 1000,
  status: 'active',
};

describe('transactionAuth utilities (strict PIN-only & privacy)', () => {
  beforeEach(() => {
    clearSessionPasswordVerifier();
    lockTransactionSession();
    resetFailedPasswordAttempts();
  });

  it('hashes PINs deterministically and never stores plaintext', async () => {
    const h1 = await hashUserSecret('1234');
    const h2 = await hashUserSecret(' 1234 ');
    const h3 = await hashUserSecret('9999');

    expect(h1).toBe(h2);
    expect(h1).not.toBe('1234');
    expect(h1).not.toBe(h3);
    expect(h1.length).toBeGreaterThanOrEqual(16);
  });

  it('requires PIN setup first and rejects transactions until personal PIN is configured', async () => {
    await cacheSessionPasswordVerifier('firebase_uid_1', 'karim@school.edu.bd', 'LoginPass#123');

    const res = await verifyTransactionSecret({
      password: 'LoginPass#123',
      user: mockAccountant,
      staffList: [mockStaff],
      config: DEFAULT_TRANSACTION_SECURITY_CONFIG,
    });
    expect(res).toEqual({ valid: false, reason: 'NEEDS_PIN_SETUP' });
  });

  it('authorizes transactions ONLY with personal Transaction PIN and rejects login password', async () => {
    await cacheSessionPasswordVerifier('firebase_uid_1', 'karim@school.edu.bd', 'LoginPass#123');

    const { nextConfig, updatedStaff } = await buildTransactionPinUpdate(
      mockAccountant,
      '4567',
      [mockStaff],
      { ...DEFAULT_TRANSACTION_SECURITY_CONFIG }
    );

    expect(updatedStaff?.transactionPinHash).toBeTruthy();
    expect(updatedStaff?.transactionPinHash).not.toBe('4567');
    expect(hasConfiguredTransactionPin(mockAccountant, [updatedStaff!], nextConfig)).toBe(true);

    // Typing login password MUST FAIL for transaction authorization
    const loginPwAttempt = await verifyTransactionSecret({
      password: 'LoginPass#123',
      user: mockAccountant,
      staffList: [updatedStaff!],
      config: nextConfig,
    });
    expect(loginPwAttempt.valid).toBe(false);
    expect(loginPwAttempt.reason).toBe('WRONG_PIN');

    // Typing personal Transaction PIN MUST SUCCEED
    const pinAttempt = await verifyTransactionSecret({
      password: '4567',
      user: mockAccountant,
      staffList: [updatedStaff!],
      config: nextConfig,
    });
    expect(pinAttempt).toEqual({ valid: true, method: 'transaction_pin' });
  });

  it('isolates each user PIN so Super Admin PIN cannot authorize Accountant transactions and vice versa', async () => {
    const step1 = await buildTransactionPinUpdate(
      mockAccountant,
      '1122',
      [mockStaff],
      { ...DEFAULT_TRANSACTION_SECURITY_CONFIG }
    );
    const step2 = await buildTransactionPinUpdate(
      mockSuperAdmin,
      '9988',
      [step1.updatedStaff!],
      step1.nextConfig
    );

    // Super Admin cannot use Accountant PIN
    const saUsingAccPin = await verifyTransactionSecret({
      password: '1122',
      user: mockSuperAdmin,
      staffList: [step1.updatedStaff!],
      config: step2.nextConfig,
    });
    expect(saUsingAccPin.valid).toBe(false);
    expect(saUsingAccPin.reason).toBe('WRONG_PIN');

    // Accountant cannot use Super Admin PIN
    const accUsingSaPin = await verifyTransactionSecret({
      password: '9988',
      user: mockAccountant,
      staffList: [step1.updatedStaff!],
      config: step2.nextConfig,
    });
    expect(accUsingSaPin.valid).toBe(false);
    expect(accUsingSaPin.reason).toBe('WRONG_PIN');

    // Each works with their own PIN
    const accOk = await verifyTransactionSecret({
      password: '1122',
      user: mockAccountant,
      staffList: [step1.updatedStaff!],
      config: step2.nextConfig,
    });
    const saOk = await verifyTransactionSecret({
      password: '9988',
      user: mockSuperAdmin,
      staffList: [step1.updatedStaff!],
      config: step2.nextConfig,
    });
    expect(accOk).toEqual({ valid: true, method: 'transaction_pin' });
    expect(saOk).toEqual({ valid: true, method: 'transaction_pin' });
  });

  it('allows self-service PIN recovery ONLY via own account identity without exposing PIN to others', async () => {
    const verifyFirebasePassword = vi.fn(async (pw: string) => {
      if (pw !== 'SecretLogin#1') {
        const err: any = new Error('auth/wrong-password');
        err.code = 'auth/wrong-password';
        throw err;
      }
    });

    const badOwner = await verifyAccountOwnerIdentity({
      loginPassword: 'WrongLogin',
      user: mockAccountant,
      hasFirebasePasswordProvider: true,
      verifyFirebasePassword,
    });
    expect(badOwner.verified).toBe(false);

    const goodOwner = await verifyAccountOwnerIdentity({
      loginPassword: 'SecretLogin#1',
      user: mockAccountant,
      hasFirebasePasswordProvider: true,
      verifyFirebasePassword,
    });
    expect(goodOwner.verified).toBe(true);

    // Offline network fallback for self-service recovery
    await cacheSessionPasswordVerifier('firebase_uid_1', 'karim@school.edu.bd', 'OfflineOwner99');
    const networkFail = vi.fn(async () => {
      const err: any = new Error('Network error');
      err.code = 'auth/network-request-failed';
      throw err;
    });
    const offlineOwner = await verifyAccountOwnerIdentity({
      loginPassword: 'OfflineOwner99',
      user: mockAccountant,
      hasFirebasePasswordProvider: true,
      verifyFirebasePassword: networkFail,
    });
    expect(offlineOwner.verified).toBe(true);
  });

  it('enforces 30s lockout cooldown after 5 failed PIN attempts and resets on success', async () => {
    const now = 1_000_000;
    const { nextConfig, updatedStaff } = await buildTransactionPinUpdate(
      mockAccountant,
      '1234',
      [mockStaff],
      DEFAULT_TRANSACTION_SECURITY_CONFIG
    );

    for (let i = 1; i < MAX_PASSWORD_ATTEMPTS; i++) {
      const r = await verifyTransactionSecret({
        password: 'wrong',
        user: mockAccountant,
        staffList: [updatedStaff!],
        config: nextConfig,
        nowMs: now + i * 100,
      });
      expect(r.valid).toBe(false);
      expect(r.reason).toBe('WRONG_PIN');
    }

    // 5th wrong attempt triggers 30s cooldown
    const locked = await verifyTransactionSecret({
      password: 'wrong',
      user: mockAccountant,
      staffList: [updatedStaff!],
      config: nextConfig,
      nowMs: now + 500,
    });
    expect(locked.valid).toBe(false);
    expect(locked.reason).toBe('COOLDOWN');
    expect(locked.cooldownSeconds).toBe(30);
    expect(getRemainingCooldownSeconds(now + 10_500)).toBe(20);

    // Even right PIN is blocked during cooldown
    const blockedDuringLock = await verifyTransactionSecret({
      password: '1234',
      user: mockAccountant,
      staffList: [updatedStaff!],
      config: nextConfig,
      nowMs: now + 10_500,
    });
    expect(blockedDuringLock.valid).toBe(false);
    expect(blockedDuringLock.reason).toBe('COOLDOWN');

    // Succeeds after cooldown expires
    const afterExpiry = await verifyTransactionSecret({
      password: '1234',
      user: mockAccountant,
      staffList: [updatedStaff!],
      config: nextConfig,
      nowMs: now + 500 + LOCKOUT_DURATION_MS + 1,
    });
    expect(afterExpiry).toEqual({ valid: true, method: 'transaction_pin' });
    expect(getRemainingCooldownSeconds(now + 500 + LOCKOUT_DURATION_MS + 2)).toBe(0);
  });

  it('honors always vs timed_15m session unlock policies and manual lock', () => {
    const alwaysConfig: TransactionSecurityConfig = {
      ...DEFAULT_TRANSACTION_SECURITY_CONFIG,
      requireTransactionPassword: true,
      promptFrequency: 'always',
    };
    const timedConfig: TransactionSecurityConfig = {
      ...DEFAULT_TRANSACTION_SECURITY_CONFIG,
      requireTransactionPassword: true,
      promptFrequency: 'timed_15m',
    };

    const t0 = 5_000_000;
    markTransactionSessionUnlocked('staff_1', t0);

    // Always mode never caches unlock
    expect(isTransactionSessionUnlocked('staff_1', alwaysConfig, t0 + 1000)).toBe(false);

    // Timed mode stays unlocked for 15 minutes for same user only
    expect(isTransactionSessionUnlocked('staff_1', timedConfig, t0 + 60_000)).toBe(true);
    expect(isTransactionSessionUnlocked('staff_2', timedConfig, t0 + 60_000)).toBe(false);
    expect(
      isTransactionSessionUnlocked('staff_1', timedConfig, t0 + TIMED_UNLOCK_DURATION_MS + 1)
    ).toBe(false);

    // Manual lock clears unlock immediately
    markTransactionSessionUnlocked('staff_1', t0);
    lockTransactionSession();
    expect(isTransactionSessionUnlocked('staff_1', timedConfig, t0 + 1000)).toBe(false);
  });
});
