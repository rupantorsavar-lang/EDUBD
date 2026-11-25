import {
  ComputedSubscriptionState,
  DEFAULT_SUBSCRIPTION_PLANS,
  SchoolTenantRecord,
  SubscriptionPlanConfig,
  SubscriptionPlanId,
  SubscriptionStatus,
} from './types';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function getDefaultPlanById(planId: SubscriptionPlanId): SubscriptionPlanConfig {
  const found = DEFAULT_SUBSCRIPTION_PLANS.find((p) => p.id === planId);
  if (!found) {
    throw new Error(`Unsupported subscription plan: ${planId}`);
  }
  return found;
}

export function addDaysUtc(baseDate: Date, days: number): Date {
  return new Date(baseDate.getTime() + days * MS_PER_DAY);
}

/**
 * Evaluates a school's real-time subscription state strictly against server-side time.
 * Never relies on client/browser clocks.
 */
export function evaluateSubscriptionState(
  school: SchoolTenantRecord,
  now: Date = new Date()
): ComputedSubscriptionState {
  const sub = school.subscription;
  const expiryMs = Date.parse(sub.expiryDate);
  const nowMs = now.getTime();
  const isValidExpiry = !Number.isNaN(expiryMs);

  const isSuspended = school.status === 'suspended' || sub.status === 'Suspended';
  const isPending = school.status === 'pending' || sub.status === 'Pending';

  const diffMs = isValidExpiry ? expiryMs - nowMs : -1;
  const isExpiredByTime = !isValidExpiry || diffMs <= 0;

  let effectiveStatus: SubscriptionStatus;
  let schoolStatus = school.status;
  let remainingDays = 0;
  let expiredDays = 0;

  if (isSuspended) {
    effectiveStatus = 'Suspended';
    schoolStatus = 'suspended';
  } else if (isPending) {
    effectiveStatus = 'Pending';
    schoolStatus = 'pending';
  } else if (isExpiredByTime || school.status === 'expired' || sub.status === 'Expired') {
    effectiveStatus = 'Expired';
    schoolStatus = 'expired';
    if (isValidExpiry && nowMs > expiryMs) {
      expiredDays = Math.max(1, Math.ceil((nowMs - expiryMs) / MS_PER_DAY));
    }
  } else {
    effectiveStatus = 'Active';
    schoolStatus = 'active';
    remainingDays = Math.max(1, Math.ceil(diffMs / MS_PER_DAY));
  }

  return {
    planId: sub.planId,
    planName: sub.planName,
    effectiveStatus,
    schoolStatus,
    startDate: sub.startDate,
    expiryDate: sub.expiryDate,
    remainingDays,
    expiredDays,
    isExpired: effectiveStatus === 'Expired',
    isSuspended: effectiveStatus === 'Suspended',
    isPending: effectiveStatus === 'Pending',
    accessAllowed: effectiveStatus === 'Active',
    lastPaymentDate: sub.lastPaymentDate,
    nextRenewalDate: sub.expiryDate,
    serverTime: now.toISOString(),
  };
}

/**
 * Computes new start & expiry dates on subscription renewal/approval:
 * - If renewed BEFORE expiration (existingExpiry > now): add durationDays to existingExpiry.
 * - If renewed AFTER expiration (existingExpiry <= now or missing): start durationDays from now.
 */
export function calculateRenewedSubscriptionWindow(
  currentExpiryIso: string | null | undefined,
  durationDays: number,
  now: Date = new Date()
): {
  newStartDate: string;
  newExpiryDate: string;
  extendedFromExistingExpiry: boolean;
} {
  const existingMs = currentExpiryIso ? Date.parse(currentExpiryIso) : NaN;
  const nowMs = now.getTime();

  if (!Number.isNaN(existingMs) && existingMs > nowMs) {
    // Renewed before expiration -> extend from existing expiry
    const newExpiry = addDaysUtc(new Date(existingMs), durationDays);
    return {
      newStartDate: now.toISOString(),
      newExpiryDate: newExpiry.toISOString(),
      extendedFromExistingExpiry: true,
    };
  }

  // Renewed after expiration (or first activation) -> start from approval time
  const newExpiry = addDaysUtc(now, durationDays);
  return {
    newStartDate: now.toISOString(),
    newExpiryDate: newExpiry.toISOString(),
    extendedFromExistingExpiry: false,
  };
}
