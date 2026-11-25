import {
  AuthPrincipal,
  CreatePaymentRequestInput,
  DatabaseProviderInterface,
  SaaSPaymentRequest,
  SaaSServiceError,
  getEffectivePlanPriceBdt,
} from './types';
import { calculateRenewedSubscriptionWindow } from './subscriptionService';

export interface PaymentServiceDeps {
  db: DatabaseProviderInterface;
  nowProvider?: () => Date;
}

const VALID_METHODS = new Set(['bKash', 'Nagad', 'Rocket', 'Bank Transfer']);

export function normalizeTransactionId(trxId: string): string {
  return (trxId || '').trim().toUpperCase().replace(/\s+/g, '');
}

export function createPaymentService(deps: PaymentServiceDeps) {
  const getNow = deps.nowProvider ?? (() => new Date());

  return {
    async submitPaymentRequest(
      input: CreatePaymentRequestInput,
      actor: AuthPrincipal
    ): Promise<SaaSPaymentRequest> {
      if (!actor.schoolId) {
        throw new SaaSServiceError(
          'Only an authenticated school account can submit a subscription payment request.',
          403,
          'NO_TENANT_CONTEXT'
        );
      }

      const school = await deps.db.getSchoolById(actor.schoolId);
      if (!school) {
        throw new SaaSServiceError('Associated school tenant not found.', 404, 'SCHOOL_NOT_FOUND');
      }

      if (school.status === 'suspended') {
        throw new SaaSServiceError(
          'This school is currently suspended by Master Admin. Please contact platform support.',
          403,
          'SCHOOL_SUSPENDED'
        );
      }

      const plan = await deps.db.getPlanById(input.planId);
      if (!plan || !plan.isActive) {
        throw new SaaSServiceError('Selected subscription plan is invalid or inactive.', 400, 'INVALID_PLAN');
      }

      if (!VALID_METHODS.has(input.paymentMethod)) {
        throw new SaaSServiceError(
          'Payment method must be bKash, Nagad, Rocket, or Bank Transfer.',
          400,
          'INVALID_PAYMENT_METHOD'
        );
      }

      const amount = Number(input.amount);
      const effectivePrice = getEffectivePlanPriceBdt(plan);
      const isFreePlan = effectivePrice === 0;
      if (!Number.isFinite(amount) || (isFreePlan ? amount < 0 : amount <= 0)) {
        throw new SaaSServiceError('Payment amount must be greater than zero.', 400, 'INVALID_AMOUNT');
      }

      const senderNumber = (input.senderNumber || '').trim();
      const rawTrxId = (input.transactionId || '').trim();
      const normalizedTrx = normalizeTransactionId(rawTrxId);

      if (!senderNumber || senderNumber.length < 6) {
        throw new SaaSServiceError('Valid sender account/mobile number is required.', 400, 'INVALID_SENDER');
      }

      if (!normalizedTrx || normalizedTrx.length < 4) {
        throw new SaaSServiceError('Valid Transaction ID is required.', 400, 'INVALID_TRX_ID');
      }

      const now = getNow();
      const nowIso = now.toISOString();

      const requestRecord: SaaSPaymentRequest = {
        id: `payreq_${now.getTime()}_${Math.random().toString(36).slice(2, 8)}`,
        schoolId: school.schoolId,
        schoolName: school.schoolName,
        planId: plan.id,
        planName: plan.name,
        durationDays: plan.durationDays,
        amount,
        paymentMethod: input.paymentMethod,
        senderNumber,
        transactionId: rawTrxId,
        normalizedTransactionId: normalizedTrx,
        paymentDate: input.paymentDate || nowIso.slice(0, 10),
        screenshotUrl: input.screenshotUrl || '',
        notes: input.notes?.trim() || '',
        status: 'pending', // NEVER auto-approved on submission
        submittedByUid: actor.uid,
        submittedByEmail: actor.email,
        submittedAt: nowIso,
      };

      // Transactional atomic duplicate Transaction ID lock
      return deps.db.runInTransaction(async (tx) => {
        const existingTrx = await tx.getPaymentByNormalizedTrxId(normalizedTrx);
        if (existingTrx) {
          throw new SaaSServiceError(
            `Duplicate Transaction ID "${rawTrxId}". This Transaction ID has already been submitted.`,
            409,
            'DUPLICATE_TRANSACTION_ID'
          );
        }
        return tx.createPaymentRequestWithTrxLock(requestRecord);
      });
    },

    async approvePaymentRequest(
      requestId: string,
      actor: AuthPrincipal
    ): Promise<{ paymentRequest: SaaSPaymentRequest; school: any }> {
      if (!actor.isMasterAdmin) {
        throw new SaaSServiceError('Only Master Admin can approve payment requests.', 403, 'FORBIDDEN');
      }

      const now = getNow();
      const nowIso = now.toISOString();

      return deps.db.runInTransaction(async (tx) => {
        const paymentReq = await tx.getPaymentRequestById(requestId);
        if (!paymentReq) {
          throw new SaaSServiceError('Payment request not found.', 404, 'PAYMENT_NOT_FOUND');
        }
        if (paymentReq.status !== 'pending') {
          throw new SaaSServiceError(
            `Payment request is already ${paymentReq.status}.`,
            409,
            'PAYMENT_ALREADY_PROCESSED'
          );
        }

        const school = await tx.getSchoolById(paymentReq.schoolId);
        if (!school) {
          throw new SaaSServiceError('Associated school not found.', 404, 'SCHOOL_NOT_FOUND');
        }

        const previousExpiry = school.subscription.expiryDate;
        const { newExpiryDate, extendedFromExistingExpiry } = calculateRenewedSubscriptionWindow(
          previousExpiry,
          paymentReq.durationDays,
          now
        );

        const updatedPayment = await tx.updatePaymentRequest(paymentReq.id, {
          status: 'approved',
          reviewedByUid: actor.uid,
          reviewedByEmail: actor.email,
          reviewedAt: nowIso,
        });

        const updatedSchool = await tx.updateSchool(school.schoolId, {
          status: 'active',
          updatedAt: nowIso,
          subscription: {
            planId: paymentReq.planId,
            planName: paymentReq.planName,
            status: 'Active',
            startDate: extendedFromExistingExpiry ? school.subscription.startDate : nowIso,
            expiryDate: newExpiryDate,
            lastPaymentDate: nowIso,
            nextRenewalDate: newExpiryDate,
            amountBdt: paymentReq.amount,
          },
        });

        await tx.appendSubscriptionHistory({
          id: `hist_${now.getTime()}_${Math.random().toString(36).slice(2, 8)}`,
          schoolId: school.schoolId,
          schoolName: school.schoolName,
          eventType: 'payment_approved',
          planId: paymentReq.planId,
          planName: paymentReq.planName,
          previousExpiryDate: previousExpiry,
          newExpiryDate,
          durationDaysAdded: paymentReq.durationDays,
          amount: paymentReq.amount,
          paymentRequestId: paymentReq.id,
          transactionId: paymentReq.transactionId,
          actorUid: actor.uid,
          actorEmail: actor.email,
          remarks: extendedFromExistingExpiry
            ? `Payment ${paymentReq.transactionId} approved; extended ${paymentReq.durationDays} days from existing expiry.`
            : `Payment ${paymentReq.transactionId} approved; activated ${paymentReq.durationDays} days from approval time.`,
          createdAt: nowIso,
        });

        return {
          paymentRequest: updatedPayment,
          school: updatedSchool,
        };
      });
    },

    async rejectPaymentRequest(
      requestId: string,
      reason: string,
      actor: AuthPrincipal
    ): Promise<SaaSPaymentRequest> {
      if (!actor.isMasterAdmin) {
        throw new SaaSServiceError('Only Master Admin can reject payment requests.', 403, 'FORBIDDEN');
      }

      const now = getNow();
      const nowIso = now.toISOString();

      return deps.db.runInTransaction(async (tx) => {
        const paymentReq = await tx.getPaymentRequestById(requestId);
        if (!paymentReq) {
          throw new SaaSServiceError('Payment request not found.', 404, 'PAYMENT_NOT_FOUND');
        }
        if (paymentReq.status !== 'pending') {
          throw new SaaSServiceError(
            `Payment request is already ${paymentReq.status}.`,
            409,
            'PAYMENT_ALREADY_PROCESSED'
          );
        }

        const updatedPayment = await tx.updatePaymentRequest(paymentReq.id, {
          status: 'rejected',
          rejectionReason: (reason || 'Transaction verification failed').trim(),
          reviewedByUid: actor.uid,
          reviewedByEmail: actor.email,
          reviewedAt: nowIso,
        });

        await tx.appendSubscriptionHistory({
          id: `hist_${now.getTime()}_${Math.random().toString(36).slice(2, 8)}`,
          schoolId: paymentReq.schoolId,
          schoolName: paymentReq.schoolName,
          eventType: 'payment_rejected',
          planId: paymentReq.planId,
          planName: paymentReq.planName,
          previousExpiryDate: null,
          newExpiryDate: null,
          durationDaysAdded: 0,
          amount: paymentReq.amount,
          paymentRequestId: paymentReq.id,
          transactionId: paymentReq.transactionId,
          actorUid: actor.uid,
          actorEmail: actor.email,
          remarks: `Payment ${paymentReq.transactionId} rejected: ${updatedPayment.rejectionReason}`,
          createdAt: nowIso,
        });

        return updatedPayment;
      });
    },
  };
}
