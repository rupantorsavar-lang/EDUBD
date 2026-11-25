import {
  AuthPrincipal,
  AuthProviderInterface,
  CreateSchoolInput,
  CreateTenantUserInput,
  DatabaseProviderInterface,
  MasterAdminVaultRecord,
  SaaSServiceError,
  SaaSUserRecord,
  SchoolTenantRecord,
  UpdateOwnCredentialsInput,
  UpdateSchoolInput,
  UpdateTenantUserCredentialsInput,
  getEffectivePlanPriceBdt,
} from './types';
import { addDaysUtc, evaluateSubscriptionState } from './subscriptionService';
import { decryptVaultPassword, encryptVaultPassword } from './credentialVault';
import {
  buildSyntheticAuthEmail,
  isSyntheticAuthEmail,
  normalizeLoginUsernameKey,
  normalizePhoneNumber,
  validateLoginIdentifier,
} from '../../src/utils/loginIdentifier';

export interface TenantServiceDeps {
  db: DatabaseProviderInterface;
  auth: AuthProviderInterface;
  nowProvider?: () => Date;
}

const ALLOWED_SCHOOL_ROLES = new Set([
  'super_admin',
  'admin',
  'teacher',
  'accountant',
  'staff',
  'student',
  'guardian',
  'librarian',
  'receptionist',
  'gatekeeper',
]);

export function createTenantService(deps: TenantServiceDeps) {
  const getNow = deps.nowProvider ?? (() => new Date());

  const upsertSuperAdminVault = async (params: {
    uid: string;
    schoolId: string;
    email: string;
    displayName: string;
    plainPassword: string;
    updatedBy: string;
    nowIso: string;
  }) => {
    if (!deps.db.saveMasterVaultRecord || !params.plainPassword) return;
    const record: MasterAdminVaultRecord = {
      uid: params.uid,
      schoolId: params.schoolId,
      email: params.email.trim().toLowerCase(),
      displayName: params.displayName.trim(),
      schoolRole: 'super_admin',
      encryptedPassword: encryptVaultPassword(params.plainPassword),
      updatedAt: params.nowIso,
      updatedBy: params.updatedBy,
    };
    await deps.db.saveMasterVaultRecord(record);
  };

  const syncSuperAdminVaultMetadata = async (params: {
    uid: string;
    schoolId: string;
    email: string;
    displayName: string;
    updatedBy: string;
    nowIso: string;
  }) => {
    if (!deps.db.getMasterVaultRecordByUid || !deps.db.saveMasterVaultRecord) return;
    const existing = await deps.db.getMasterVaultRecordByUid(params.uid);
    if (!existing) return;
    await deps.db.saveMasterVaultRecord({
      ...existing,
      schoolId: params.schoolId,
      email: params.email.trim().toLowerCase(),
      displayName: params.displayName.trim(),
      schoolRole: 'super_admin',
      updatedAt: params.nowIso,
      updatedBy: params.updatedBy,
    });
  };

  return {
    async createSchool(
      input: CreateSchoolInput,
      actor: AuthPrincipal
    ): Promise<SchoolTenantRecord> {
      const schoolName = (input.schoolName || '').trim();
      const schoolCode = (input.schoolCode || '').trim().toUpperCase();
      const address = (input.address || '').trim();
      const contactNumber = (input.contactNumber || '').trim();
      const email = (input.email || '').trim().toLowerCase();
      const principalName = (input.principalName || '').trim();
      const adminName = (input.adminName || '').trim();
      const rawAdminIdentifier = (input.adminEmail || input.adminUsername || '').trim();
      const adminPassword = input.adminPassword || '';

      if (
        !schoolName ||
        !schoolCode ||
        !address ||
        !contactNumber ||
        !email ||
        !principalName ||
        !adminName ||
        !rawAdminIdentifier ||
        !adminPassword
      ) {
        throw new SaaSServiceError(
          'All required school and administrator fields must be provided.',
          400,
          'VALIDATION_ERROR'
        );
      }

      const parsedAdminId = validateLoginIdentifier(rawAdminIdentifier);
      if (!parsedAdminId.valid) {
        throw new SaaSServiceError(
          parsedAdminId.error || 'Please provide a valid admin email, mobile number, or username.',
          400,
          'INVALID_EMAIL'
        );
      }

      let explicitAdminUsername = input.adminUsername !== undefined ? input.adminUsername.trim() : undefined;
      if (parsedAdminId.kind !== 'email' && !explicitAdminUsername) {
        explicitAdminUsername = parsedAdminId.displayValue;
      }
      if (explicitAdminUsername && parsedAdminId.kind === 'email') {
        const parsedU = validateLoginIdentifier(explicitAdminUsername);
        if (!parsedU.valid || parsedU.kind === 'email') {
          throw new SaaSServiceError(
            parsedU.error || 'Please provide a valid admin username.',
            400,
            'INVALID_USERNAME'
          );
        }
        explicitAdminUsername = parsedU.displayValue;
      }
      const adminUsernameNormalized = explicitAdminUsername
        ? normalizeLoginUsernameKey(explicitAdminUsername)
        : undefined;

      if (adminPassword.length < 6) {
        throw new SaaSServiceError(
          'Admin password must be at least 6 characters.',
          400,
          'WEAK_PASSWORD'
        );
      }

      // 1. Prevent duplicate school code
      const existingCode = await deps.db.getSchoolByCode(schoolCode);
      if (existingCode) {
        throw new SaaSServiceError(
          `School code "${schoolCode}" is already registered.`,
          409,
          'DUPLICATE_SCHOOL_CODE'
        );
      }

      // 2. Prevent duplicate admin username or real email
      if (adminUsernameNormalized) {
        const existingByUsername = await deps.db.getSaaSUserByUsernameNormalized(adminUsernameNormalized);
        if (existingByUsername) {
          throw new SaaSServiceError(
            `Administrator username "${explicitAdminUsername}" is already registered.`,
            409,
            'DUPLICATE_USERNAME'
          );
        }
      }

      if (parsedAdminId.kind === 'email') {
        const checkEmail = parsedAdminId.displayValue;
        const existingSaasUser = await deps.db.getSaaSUserByEmail(checkEmail);
        const existingAuthUser = await deps.auth.getUserByEmail(checkEmail);
        if (existingSaasUser || existingAuthUser) {
          throw new SaaSServiceError(
            `Administrator email "${checkEmail}" is already registered.`,
            409,
            'DUPLICATE_ADMIN_EMAIL'
          );
        }
      }

      // 3. Validate plan
      const plan = await deps.db.getPlanById(input.initialPlan);
      if (!plan) {
        throw new SaaSServiceError(
          `Invalid subscription plan "${input.initialPlan}".`,
          400,
          'INVALID_PLAN'
        );
      }

      const now = getNow();
      const startDateObj = input.startDate ? new Date(input.startDate) : now;
      if (Number.isNaN(startDateObj.getTime())) {
        throw new SaaSServiceError('Invalid startDate format.', 400, 'INVALID_DATE');
      }

      const expiryDateObj = input.expiryDate
        ? new Date(input.expiryDate)
        : addDaysUtc(startDateObj, plan.durationDays);
      if (Number.isNaN(expiryDateObj.getTime()) || expiryDateObj.getTime() <= startDateObj.getTime()) {
        throw new SaaSServiceError(
          'Subscription expiryDate must be after startDate.',
          400,
          'INVALID_DATE'
        );
      }

      // 4. Generate unique schoolId (SCH001, SCH002...)
      const schoolId = await deps.db.getNextSchoolId();

      // Resolve final Firebase Auth email (real email or unique synthetic internal email)
      let adminEmail = parsedAdminId.kind === 'email'
        ? parsedAdminId.displayValue
        : buildSyntheticAuthEmail(explicitAdminUsername || rawAdminIdentifier, schoolId);

      if (parsedAdminId.kind !== 'email') {
        for (let attempt = 1; attempt <= 5; attempt += 1) {
          const authCollision = await deps.auth.getUserByEmail(adminEmail);
          const dbCollision = await deps.db.getSaaSUserByEmail(adminEmail);
          if (!authCollision && !dbCollision) break;
          adminEmail = buildSyntheticAuthEmail(
            explicitAdminUsername || rawAdminIdentifier,
            schoolId,
            String(attempt + 1)
          );
        }
      }

      // 5. Create School Admin Firebase Auth account and assign custom claims
      const createdAuthUser = await deps.auth.createUser({
        email: adminEmail,
        password: adminPassword,
        displayName: adminName,
      });

      await deps.auth.setCustomClaims(createdAuthUser.uid, {
        schoolId,
        schoolRole: 'super_admin',
        isMasterAdmin: false,
      });

      const activateNow = input.activateImmediately !== false;
      const nowIso = now.toISOString();

      const schoolRecord: SchoolTenantRecord = {
        schoolId,
        schoolCode,
        schoolName,
        address,
        contactNumber,
        email,
        principalName,
        adminName,
        adminEmail,
        ...(explicitAdminUsername ? { adminUsername: explicitAdminUsername } : {}),
        adminUid: createdAuthUser.uid,
        status: activateNow ? 'active' : 'pending',
        subscription: {
          planId: plan.id,
          planName: plan.name,
          status: activateNow ? 'Active' : 'Pending',
          startDate: startDateObj.toISOString(),
          expiryDate: expiryDateObj.toISOString(),
          lastPaymentDate: activateNow ? nowIso : null,
          nextRenewalDate: expiryDateObj.toISOString(),
          amountBdt: getEffectivePlanPriceBdt(plan),
        },
        createdAt: nowIso,
        updatedAt: nowIso,
        createdBy: actor.email || actor.uid,
      };

      await deps.db.createSchool(schoolRecord);

      const adminPhoneNorm = normalizePhoneNumber(
        parsedAdminId.normalizedPhone || contactNumber
      );

      // 6. Store school admin profile record (without plaintext password)
      const adminUserRecord: SaaSUserRecord = {
        uid: createdAuthUser.uid,
        email: adminEmail,
        ...(explicitAdminUsername ? { username: explicitAdminUsername } : {}),
        ...(adminUsernameNormalized ? { usernameNormalized: adminUsernameNormalized } : {}),
        ...(adminPhoneNorm.length >= 6 ? { phoneNormalized: adminPhoneNorm } : {}),
        displayName: adminName,
        schoolId,
        schoolRole: 'super_admin',
        phone: contactNumber,
        status: 'active',
        createdAt: nowIso,
        createdBy: actor.email || actor.uid,
        updatedAt: nowIso,
      };
      await deps.db.createSaaSUserRecord(adminUserRecord);
      await upsertSuperAdminVault({
        uid: createdAuthUser.uid,
        schoolId,
        email: adminEmail,
        displayName: adminName,
        plainPassword: adminPassword,
        updatedBy: actor.email || actor.uid,
        nowIso,
      });

      // 7. Initialize isolated tenant profile slice
      await deps.db.saveTenantSlice(schoolId, 'profile', {
        school_erp_profile: {
          id: schoolId,
          nameEn: schoolName,
          nameBn: schoolName,
          eiin: schoolCode,
          schoolCode,
          addressEn: address,
          addressBn: address,
          phone: contactNumber,
          email,
          website: '',
          principalNameEn: principalName,
          principalNameBn: principalName,
          establishedYear: String(now.getUTCFullYear()),
          currentSession: String(now.getUTCFullYear()),
          currencySymbol: '৳',
          timezone: 'Asia/Dhaka',
          isSaturdayOff: true,
        },
      });

      // 8. Append subscription audit history
      await deps.db.appendSubscriptionHistory({
        id: `hist_${now.getTime()}_${Math.random().toString(36).slice(2, 8)}`,
        schoolId,
        schoolName,
        eventType: 'school_created',
        planId: plan.id,
        planName: plan.name,
        previousExpiryDate: null,
        newExpiryDate: expiryDateObj.toISOString(),
        durationDaysAdded: plan.durationDays,
        amount: plan.priceBdt,
        actorUid: actor.uid,
        actorEmail: actor.email,
        remarks: activateNow
          ? `School created and activated on ${plan.name}`
          : `School created with Pending activation on ${plan.name}`,
        createdAt: nowIso,
      });

      return schoolRecord;
    },

    async listSchoolsWithState(filters?: { search?: string; status?: string }) {
      const now = getNow();
      const schools = await deps.db.listSchools();
      const enriched = schools.map((s) => ({
        ...s,
        computedSubscription: evaluateSubscriptionState(s, now),
      }));

      return enriched.filter((item) => {
        if (filters?.status && filters.status !== 'all') {
          const eff = item.computedSubscription.effectiveStatus.toLowerCase();
          if (eff !== filters.status.toLowerCase() && item.status !== filters.status.toLowerCase()) {
            return false;
          }
        }
        if (filters?.search && filters.search.trim()) {
          const q = filters.search.trim().toLowerCase();
          const match =
            item.schoolId.toLowerCase().includes(q) ||
            item.schoolCode.toLowerCase().includes(q) ||
            item.schoolName.toLowerCase().includes(q) ||
            item.adminEmail.toLowerCase().includes(q) ||
            item.principalName.toLowerCase().includes(q);
          if (!match) return false;
        }
        return true;
      });
    },

    async updateSchool(
      schoolId: string,
      input: UpdateSchoolInput,
      actor: AuthPrincipal
    ): Promise<SchoolTenantRecord> {
      const school = await deps.db.getSchoolById(schoolId);
      if (!school) {
        throw new SaaSServiceError(`School "${schoolId}" not found.`, 404, 'SCHOOL_NOT_FOUND');
      }

      const now = getNow();
      const nowIso = now.toISOString();

      if (input.schoolCode && input.schoolCode.trim().toUpperCase() !== school.schoolCode) {
        const dup = await deps.db.getSchoolByCode(input.schoolCode.trim().toUpperCase());
        if (dup && dup.schoolId !== schoolId) {
          throw new SaaSServiceError(
            `School code "${input.schoolCode.trim().toUpperCase()}" already exists.`,
            409,
            'DUPLICATE_SCHOOL_CODE'
          );
        }
      }

      const nextSubscription = { ...school.subscription };
      let nextStatus = input.status ?? school.status;
      let eventType: 'manual_extension' | 'suspended' | 'activated' | 'plan_changed' | null = null;
      let daysAdded = 0;
      const prevExpiry = school.subscription.expiryDate;

      if (input.planId && input.planId !== school.subscription.planId) {
        const plan = await deps.db.getPlanById(input.planId);
        if (!plan) {
          throw new SaaSServiceError(`Invalid plan "${input.planId}".`, 400, 'INVALID_PLAN');
        }
        nextSubscription.planId = plan.id;
        nextSubscription.planName = plan.name;
        nextSubscription.amountBdt = getEffectivePlanPriceBdt(plan);
        eventType = 'plan_changed';
      }

      if (typeof input.extendDays === 'number' && input.extendDays > 0) {
        const existingExpiryMs = Date.parse(nextSubscription.expiryDate);
        const baseDate =
          !Number.isNaN(existingExpiryMs) && existingExpiryMs > now.getTime()
            ? new Date(existingExpiryMs)
            : now;
        const extended = addDaysUtc(baseDate, input.extendDays);
        nextSubscription.expiryDate = extended.toISOString();
        nextSubscription.nextRenewalDate = extended.toISOString();
        nextSubscription.status = 'Active';
        if (nextStatus !== 'suspended') {
          nextStatus = 'active';
        }
        daysAdded = input.extendDays;
        eventType = 'manual_extension';
      } else if (input.newExpiryDate) {
        const parsed = new Date(input.newExpiryDate);
        if (Number.isNaN(parsed.getTime())) {
          throw new SaaSServiceError('Invalid newExpiryDate format.', 400, 'INVALID_DATE');
        }
        nextSubscription.expiryDate = parsed.toISOString();
        nextSubscription.nextRenewalDate = parsed.toISOString();
        if (parsed.getTime() > now.getTime() && nextStatus !== 'suspended') {
          nextSubscription.status = 'Active';
          nextStatus = 'active';
        }
        eventType = 'manual_extension';
      }

      if (input.status === 'suspended') {
        nextSubscription.status = 'Suspended';
        nextStatus = 'suspended';
        eventType = 'suspended';
      } else if (input.status === 'active') {
        const expMs = Date.parse(nextSubscription.expiryDate);
        if (Number.isNaN(expMs) || expMs <= now.getTime()) {
          throw new SaaSServiceError(
            'Cannot activate an expired school without extending the expiry date.',
            400,
            'CANNOT_ACTIVATE_EXPIRED'
          );
        }
        nextSubscription.status = 'Active';
        nextStatus = 'active';
        eventType = eventType || 'activated';
      }

      const updated = await deps.db.updateSchool(schoolId, {
        schoolName: input.schoolName?.trim() || school.schoolName,
        schoolCode: input.schoolCode?.trim().toUpperCase() || school.schoolCode,
        address: input.address?.trim() || school.address,
        contactNumber: input.contactNumber?.trim() || school.contactNumber,
        email: input.email?.trim().toLowerCase() || school.email,
        principalName: input.principalName?.trim() || school.principalName,
        notes: input.notes !== undefined ? input.notes : school.notes,
        status: nextStatus,
        subscription: nextSubscription,
        updatedAt: nowIso,
      });

      if (eventType) {
        await deps.db.appendSubscriptionHistory({
          id: `hist_${now.getTime()}_${Math.random().toString(36).slice(2, 8)}`,
          schoolId,
          schoolName: updated.schoolName,
          eventType,
          planId: updated.subscription.planId,
          planName: updated.subscription.planName,
          previousExpiryDate: prevExpiry,
          newExpiryDate: updated.subscription.expiryDate,
          durationDaysAdded: daysAdded,
          actorUid: actor.uid,
          actorEmail: actor.email,
          remarks:
            eventType === 'manual_extension'
              ? `Subscription extended (${daysAdded ? `${daysAdded} days` : 'custom date'}) by Master Admin`
              : eventType === 'suspended'
              ? 'School suspended by Master Admin'
              : eventType === 'activated'
              ? 'School activated by Master Admin'
              : 'Subscription plan updated by Master Admin',
          createdAt: nowIso,
        });
      }

      return updated;
    },

    async deleteSchool(
      schoolId: string,
      actor: AuthPrincipal
    ): Promise<{ deletedSchoolId: string; deletedUsersCount: number }> {
      if (!actor.isMasterAdmin) {
        throw new SaaSServiceError('Only Master Admin can delete schools.', 403, 'MASTER_ADMIN_REQUIRED');
      }

      const school = await deps.db.getSchoolById(schoolId);
      if (!school) {
        throw new SaaSServiceError(`School "${schoolId}" not found.`, 404, 'SCHOOL_NOT_FOUND');
      }

      const schoolUsers = await deps.db.listSaaSUsersBySchool(schoolId);
      const userTargets = new Map<string, { uid: string; email: string }>();
      for (const u of schoolUsers) {
        if (u.uid) {
          userTargets.set(u.uid, { uid: u.uid, email: u.email || '' });
        }
      }
      if (school.adminUid && !userTargets.has(school.adminUid)) {
        userTargets.set(school.adminUid, {
          uid: school.adminUid,
          email: school.adminEmail || '',
        });
      }

      let deletedUsersCount = 0;
      for (const target of userTargets.values()) {
        try {
          const isProtectedMaster = await deps.db.isMasterAdminUidOrEmail(target.uid, target.email);
          if (!isProtectedMaster) {
            if (deps.auth.deleteUser) {
              await deps.auth.deleteUser(target.uid);
            } else {
              await deps.auth.updateUserStatus(target.uid, true);
            }
            deletedUsersCount += 1;
          }
        } catch (err) {
          console.warn(`[SaaS] Failed removing auth user ${target.uid} while deleting school ${schoolId}:`, err);
        }
      }

      await deps.db.deleteMasterVaultRecordsBySchool?.(schoolId);
      await deps.db.deleteSchool(schoolId);
      return { deletedSchoolId: schoolId, deletedUsersCount };
    },

    /**
     * Provisions a Firebase Auth user account for a school staff member, student, or guardian,
     * assigns server-side custom claims { schoolId, schoolRole }, and stores a safe profile
     * record without plaintext passwords.
     */
    async provisionTenantUser(
      input: CreateTenantUserInput,
      actor: AuthPrincipal
    ): Promise<SaaSUserRecord> {
      const rawIdentifierInput = (input.email || input.username || '').trim();
      const rawExplicitUsername = input.username !== undefined ? input.username.trim() : '';
      const displayName = (input.displayName || '').trim();
      const password = input.password || '';
      const role = input.schoolRole;

      if (!rawIdentifierInput || !displayName || !password) {
        throw new SaaSServiceError(
          'Login ID (email, mobile, or username), displayName, and password are required.',
          400,
          'VALIDATION_ERROR'
        );
      }

      const parsedPrimary = validateLoginIdentifier(rawIdentifierInput);
      if (!parsedPrimary.valid) {
        throw new SaaSServiceError(
          parsedPrimary.error || 'Please provide a valid email, mobile number, or username.',
          400,
          'INVALID_EMAIL'
        );
      }

      let finalUsername: string | undefined;
      if (rawExplicitUsername) {
        const parsedU = validateLoginIdentifier(rawExplicitUsername);
        if (!parsedU.valid) {
          throw new SaaSServiceError(
            parsedU.error || 'Please provide a valid username or mobile number.',
            400,
            'INVALID_USERNAME'
          );
        }
        finalUsername = parsedU.kind === 'email' ? undefined : parsedU.displayValue;
      } else if (parsedPrimary.kind !== 'email') {
        finalUsername = parsedPrimary.displayValue;
      }

      const usernameNormalized = finalUsername ? normalizeLoginUsernameKey(finalUsername) : undefined;
      const phoneNormalized = normalizePhoneNumber(
        input.phone || parsedPrimary.normalizedPhone || ''
      );

      if (password.length < 6) {
        throw new SaaSServiceError(
          'Password must be at least 6 characters.',
          400,
          'WEAK_PASSWORD'
        );
      }

      if (!ALLOWED_SCHOOL_ROLES.has(role)) {
        throw new SaaSServiceError(
          `Role "${role}" cannot be provisioned via tenant user API.`,
          403,
          'FORBIDDEN_ROLE'
        );
      }

      // Strictly derive target schoolId: school admins can NEVER provision into another school!
      let targetSchoolId: string | null = null;
      if (actor.isMasterAdmin) {
        targetSchoolId = (input.schoolId || actor.schoolId || '').trim() || null;
      } else {
        if (actor.schoolRole !== 'super_admin' && actor.schoolRole !== 'admin') {
          throw new SaaSServiceError(
            'Only School Super Admin, Head Teacher/Admin, or Master Admin can provision user accounts.',
            403,
            'FORBIDDEN'
          );
        }
        targetSchoolId = actor.schoolId;
      }

      if (!targetSchoolId) {
        throw new SaaSServiceError(
          'Target schoolId is required for user provisioning.',
          400,
          'MISSING_SCHOOL_ID'
        );
      }

      const school = await deps.db.getSchoolById(targetSchoolId);
      if (!school) {
        throw new SaaSServiceError(`School "${targetSchoolId}" not found.`, 404, 'SCHOOL_NOT_FOUND');
      }

      if (!actor.isMasterAdmin) {
        const subState = evaluateSubscriptionState(school, getNow());
        if (!subState.accessAllowed) {
          throw new SaaSServiceError(
            'Cannot provision users while school subscription is inactive or expired.',
            403,
            'SUBSCRIPTION_EXPIRED'
          );
        }
      }

      if (usernameNormalized) {
        const existingUsernameUser = await deps.db.getSaaSUserByUsernameNormalized(usernameNormalized);
        if (existingUsernameUser) {
          throw new SaaSServiceError(
            `Username or mobile "${finalUsername}" is already registered to another account.`,
            409,
            'DUPLICATE_USERNAME'
          );
        }
      }

      let email =
        parsedPrimary.kind === 'email'
          ? parsedPrimary.displayValue
          : buildSyntheticAuthEmail(finalUsername || rawIdentifierInput, targetSchoolId);

      if (parsedPrimary.kind !== 'email') {
        for (let attempt = 1; attempt <= 5; attempt += 1) {
          const authHit = await deps.auth.getUserByEmail(email);
          const dbHit = await deps.db.getSaaSUserByEmail(email);
          if (!authHit && !dbHit) break;
          email = buildSyntheticAuthEmail(
            finalUsername || rawIdentifierInput,
            targetSchoolId,
            String(attempt + 1)
          );
        }
      }

      const existingAuth = await deps.auth.getUserByEmail(email);
      const existingRecord = await deps.db.getSaaSUserByEmail(email);

      let uidToUse: string;
      if (existingAuth) {
        const isOrphanSameSchool =
          !existingRecord &&
          existingAuth.customClaims?.schoolId === targetSchoolId &&
          existingAuth.customClaims?.isMasterAdmin !== true &&
          !(await deps.db.isMasterAdminUidOrEmail(existingAuth.uid, email));

        if (!isOrphanSameSchool) {
          throw new SaaSServiceError(
            `A user account with email "${email}" already exists.`,
            409,
            'DUPLICATE_EMAIL'
          );
        }

        uidToUse = existingAuth.uid;
        if (deps.auth.updateUser) {
          await deps.auth.updateUser(uidToUse, {
            password,
            displayName,
            disabled: false,
            emailVerified: true,
          });
        } else if (deps.auth.updateUserPassword) {
          await deps.auth.updateUserPassword(uidToUse, password);
        }
      } else if (existingRecord) {
        throw new SaaSServiceError(
          `A user account with email "${email}" already exists.`,
          409,
          'DUPLICATE_EMAIL'
        );
      } else {
        const created = await deps.auth.createUser({
          email,
          password,
          displayName,
        });
        uidToUse = created.uid;
      }

      await deps.auth.setCustomClaims(uidToUse, {
        schoolId: targetSchoolId,
        schoolRole: role,
        isMasterAdmin: false,
      });

      const resolvedPhone =
        input.phone?.trim() || (parsedPrimary.kind === 'mobile' ? parsedPrimary.displayValue : undefined);

      const nowIso = getNow().toISOString();
      const record: SaaSUserRecord = {
        uid: uidToUse,
        email,
        ...(finalUsername ? { username: finalUsername } : {}),
        ...(usernameNormalized ? { usernameNormalized } : {}),
        ...(phoneNormalized.length >= 6 ? { phoneNormalized } : {}),
        displayName,
        schoolId: targetSchoolId,
        schoolRole: role,
        ...(input.linkedStaffId ? { linkedStaffId: input.linkedStaffId } : {}),
        ...(input.linkedStudentId ? { linkedStudentId: input.linkedStudentId } : {}),
        ...(resolvedPhone ? { phone: resolvedPhone } : {}),
        status: 'active',
        createdAt: nowIso,
        createdBy: actor.email || actor.uid,
        updatedAt: nowIso,
      };

      const savedUser = await deps.db.createSaaSUserRecord(record);
      if (role === 'super_admin') {
        await upsertSuperAdminVault({
          uid: uidToUse,
          schoolId: targetSchoolId,
          email,
          displayName,
          plainPassword: password,
          updatedBy: actor.email || actor.uid,
          nowIso,
        });
      }
      return savedUser;
    },

    async setTenantUserStatus(
      targetUid: string,
      disabled: boolean,
      actor: AuthPrincipal
    ): Promise<SaaSUserRecord> {
      const user = await deps.db.getSaaSUserByUid(targetUid);
      if (!user) {
        throw new SaaSServiceError('User not found.', 404, 'USER_NOT_FOUND');
      }

      if (!actor.isMasterAdmin && user.schoolId !== actor.schoolId) {
        throw new SaaSServiceError(
          'Cross-tenant user management is strictly prohibited.',
          403,
          'CROSS_TENANT_FORBIDDEN'
        );
      }

      if (!actor.isMasterAdmin && actor.schoolRole !== 'super_admin' && actor.schoolRole !== 'admin') {
        throw new SaaSServiceError('Insufficient permissions.', 403, 'FORBIDDEN');
      }

      await deps.auth.updateUserStatus(targetUid, disabled);
      return deps.db.updateSaaSUserRecord(targetUid, {
        status: disabled ? 'disabled' : 'active',
        updatedAt: getNow().toISOString(),
      });
    },

    async updateOwnCredentials(
      actor: AuthPrincipal,
      input: UpdateOwnCredentialsInput
    ): Promise<{
      uid: string;
      email: string;
      username?: string;
      displayName: string;
      phone?: string;
      avatarUrl?: string;
      schoolId: string | null;
      schoolRole: string | null;
      isMasterAdmin: boolean;
    }> {
      const nextDisplayName = input.displayName !== undefined ? input.displayName.trim() : undefined;
      const rawNextEmail = input.email !== undefined ? input.email.trim() : undefined;
      const rawExplicitUsername = input.username !== undefined ? input.username.trim() : undefined;
      const nextPassword = input.password !== undefined ? input.password : undefined;
      const nextPhone = input.phone !== undefined ? input.phone.trim() : undefined;
      const nextAvatarUrl = input.avatarUrl !== undefined ? String(input.avatarUrl).trim() : undefined;

      if (nextDisplayName !== undefined && !nextDisplayName) {
        throw new SaaSServiceError('Display name cannot be empty.', 400, 'VALIDATION_ERROR');
      }

      if (nextPassword !== undefined && nextPassword.length > 0 && nextPassword.length < 6) {
        throw new SaaSServiceError('Password must be at least 6 characters.', 400, 'WEAK_PASSWORD');
      }

      if (nextAvatarUrl !== undefined && nextAvatarUrl.length > 0) {
        if (nextAvatarUrl.length > 180_000) {
          throw new SaaSServiceError(
            'Profile photo is too large. Please choose a smaller image.',
            400,
            'IMAGE_TOO_LARGE'
          );
        }
        if (
          !/^data:image\/(jpeg|jpg|png|webp|gif);base64,/i.test(nextAvatarUrl) &&
          !/^https?:\/\//i.test(nextAvatarUrl)
        ) {
          throw new SaaSServiceError('Invalid profile image format.', 400, 'INVALID_IMAGE_FORMAT');
        }
      }

      const existingSaasUser = await deps.db.getSaaSUserByUid(actor.uid);
      const currentEmailLower = (existingSaasUser?.email || actor.email || '').toLowerCase();
      const currentUsername = existingSaasUser?.username;
      const currentUsernameNorm =
        existingSaasUser?.usernameNormalized ||
        (currentUsername ? normalizeLoginUsernameKey(currentUsername) : undefined);

      let resolvedNextEmail: string | undefined;
      let resolvedNextUsername: string | undefined = currentUsername;
      let resolvedNextUsernameNorm: string | undefined = currentUsernameNorm;
      let shouldClearUsername = false;

      if (rawNextEmail !== undefined && rawNextEmail.length > 0) {
        const parsedId = validateLoginIdentifier(rawNextEmail);
        if (!parsedId.valid) {
          throw new SaaSServiceError(
            parsedId.error || 'Please provide a valid email, mobile number, or username.',
            400,
            'INVALID_EMAIL'
          );
        }

        if (actor.isMasterAdmin && rawNextEmail.toLowerCase() !== currentEmailLower) {
          throw new SaaSServiceError(
            'Master Admin primary email is bound to platform configuration. You can update your display name, phone, or password.',
            400,
            'MASTER_EMAIL_IMMUTABLE'
          );
        }

        if (parsedId.kind === 'email') {
          if (parsedId.displayValue !== currentEmailLower) {
            resolvedNextEmail = parsedId.displayValue;
            if (rawExplicitUsername === undefined && isSyntheticAuthEmail(currentEmailLower)) {
              resolvedNextUsername = undefined;
              resolvedNextUsernameNorm = undefined;
              shouldClearUsername = true;
            }
          }
        } else {
          const usernameChanged =
            parsedId.normalizedKey !== currentUsernameNorm ||
            parsedId.displayValue !== currentUsername;
          if (usernameChanged || !isSyntheticAuthEmail(currentEmailLower)) {
            if (parsedId.normalizedKey !== currentUsernameNorm) {
              const dupUser = await deps.db.getSaaSUserByUsernameNormalized(parsedId.normalizedKey);
              if (dupUser && dupUser.uid !== actor.uid) {
                throw new SaaSServiceError(
                  `Username or mobile "${parsedId.displayValue}" is already in use by another account.`,
                  409,
                  'DUPLICATE_USERNAME'
                );
              }
            }
            resolvedNextUsername = parsedId.displayValue;
            resolvedNextUsernameNorm = parsedId.normalizedKey;

            if (!isSyntheticAuthEmail(currentEmailLower) || parsedId.normalizedKey !== currentUsernameNorm) {
              let synth = buildSyntheticAuthEmail(parsedId.displayValue, actor.schoolId || 'sch');
              for (let attempt = 1; attempt <= 5; attempt += 1) {
                const authHit = await deps.auth.getUserByEmail(synth);
                const dbHit = await deps.db.getSaaSUserByEmail(synth);
                if ((!authHit || authHit.uid === actor.uid) && (!dbHit || dbHit.uid === actor.uid)) {
                  break;
                }
                synth = buildSyntheticAuthEmail(parsedId.displayValue, actor.schoolId || 'sch', String(attempt + 1));
              }
              if (synth !== currentEmailLower) {
                resolvedNextEmail = synth;
              }
            }
          }
        }
      }

      if (rawExplicitUsername !== undefined) {
        if (actor.isMasterAdmin && rawExplicitUsername.length > 0 && rawExplicitUsername.toLowerCase() !== (currentUsername || '').toLowerCase()) {
          throw new SaaSServiceError(
            'Master Admin login identifier is bound to platform configuration.',
            400,
            'MASTER_EMAIL_IMMUTABLE'
          );
        }
        if (rawExplicitUsername === '') {
          resolvedNextUsername = undefined;
          resolvedNextUsernameNorm = undefined;
          shouldClearUsername = true;
        } else {
          const parsedU = validateLoginIdentifier(rawExplicitUsername);
          if (!parsedU.valid || parsedU.kind === 'email') {
            throw new SaaSServiceError(
              parsedU.error || 'Please provide a valid username or mobile number.',
              400,
              'INVALID_USERNAME'
            );
          }
          if (parsedU.normalizedKey !== currentUsernameNorm) {
            const dupU = await deps.db.getSaaSUserByUsernameNormalized(parsedU.normalizedKey);
            if (dupU && dupU.uid !== actor.uid) {
              throw new SaaSServiceError(
                `Username or mobile "${parsedU.displayValue}" is already registered.`,
                409,
                'DUPLICATE_USERNAME'
              );
            }
          }
          resolvedNextUsername = parsedU.displayValue;
          resolvedNextUsernameNorm = parsedU.normalizedKey;
          shouldClearUsername = false;
        }
      }

      const emailChanged = Boolean(resolvedNextEmail && resolvedNextEmail !== currentEmailLower);
      if (emailChanged && resolvedNextEmail) {
        const existingAuth = await deps.auth.getUserByEmail(resolvedNextEmail);
        if (existingAuth && existingAuth.uid !== actor.uid) {
          throw new SaaSServiceError(
            `Email "${resolvedNextEmail}" is already in use by another account.`,
            409,
            'DUPLICATE_EMAIL'
          );
        }
        const existingRecord = await deps.db.getSaaSUserByEmail(resolvedNextEmail);
        if (existingRecord && existingRecord.uid !== actor.uid) {
          throw new SaaSServiceError(
            `Email "${resolvedNextEmail}" is already registered.`,
            409,
            'DUPLICATE_EMAIL'
          );
        }
      }

      const authUpdates: {
        email?: string;
        emailVerified?: boolean;
        password?: string;
        displayName?: string;
      } = {};
      if (emailChanged && resolvedNextEmail) {
        authUpdates.email = resolvedNextEmail;
        authUpdates.emailVerified = true;
      }
      if (nextDisplayName !== undefined) {
        authUpdates.displayName = nextDisplayName;
      }
      if (nextPassword && nextPassword.length >= 6) {
        authUpdates.password = nextPassword;
      }

      if (Object.keys(authUpdates).length > 0) {
        if (deps.auth.updateUser) {
          await deps.auth.updateUser(actor.uid, authUpdates);
        } else if (authUpdates.password && deps.auth.updateUserPassword) {
          await deps.auth.updateUserPassword(actor.uid, authUpdates.password);
        }
      }

      const finalEmail = (emailChanged && resolvedNextEmail ? resolvedNextEmail : currentEmailLower).toLowerCase();
      const finalName = nextDisplayName !== undefined ? nextDisplayName : actor.displayName || finalEmail;
      const nowIso = getNow().toISOString();
      const resolvedPhoneNorm =
        nextPhone !== undefined
          ? normalizePhoneNumber(nextPhone)
          : existingSaasUser?.phoneNormalized;

      if (existingSaasUser) {
        const nextRecord: SaaSUserRecord = {
          ...existingSaasUser,
          email: finalEmail,
          displayName: finalName,
          ...(nextPhone !== undefined ? { phone: nextPhone } : {}),
          ...(resolvedPhoneNorm && resolvedPhoneNorm.length >= 6
            ? { phoneNormalized: resolvedPhoneNorm }
            : {}),
          ...(nextAvatarUrl !== undefined ? { avatarUrl: nextAvatarUrl } : {}),
          updatedAt: nowIso,
        };
        if (shouldClearUsername) {
          delete nextRecord.username;
          delete nextRecord.usernameNormalized;
        } else if (resolvedNextUsername) {
          nextRecord.username = resolvedNextUsername;
          nextRecord.usernameNormalized = resolvedNextUsernameNorm;
        }
        if (nextPhone !== undefined && (!resolvedPhoneNorm || resolvedPhoneNorm.length < 6)) {
          delete nextRecord.phoneNormalized;
        }
        await deps.db.updateSaaSUserRecord(actor.uid, nextRecord);
      } else if (actor.schoolId) {
        await deps.db.createSaaSUserRecord({
          uid: actor.uid,
          email: finalEmail,
          ...(resolvedNextUsername ? { username: resolvedNextUsername } : {}),
          ...(resolvedNextUsernameNorm ? { usernameNormalized: resolvedNextUsernameNorm } : {}),
          ...(resolvedPhoneNorm && resolvedPhoneNorm.length >= 6
            ? { phoneNormalized: resolvedPhoneNorm }
            : {}),
          displayName: finalName,
          schoolId: actor.schoolId,
          schoolRole: actor.schoolRole || 'teacher',
          ...(nextPhone !== undefined ? { phone: nextPhone } : {}),
          ...(nextAvatarUrl !== undefined ? { avatarUrl: nextAvatarUrl } : {}),
          status: 'active',
          createdAt: nowIso,
          createdBy: actor.email || actor.uid,
          updatedAt: nowIso,
        });
      }

      if (actor.schoolId) {
        const school = await deps.db.getSchoolById(actor.schoolId);
        if (
          school &&
          school.adminUid === actor.uid &&
          (emailChanged || nextDisplayName !== undefined || resolvedNextUsername !== currentUsername)
        ) {
          await deps.db.updateSchool(actor.schoolId, {
            adminEmail: finalEmail,
            ...(resolvedNextUsername ? { adminUsername: resolvedNextUsername } : { adminUsername: '' }),
            adminName: finalName,
            updatedAt: nowIso,
          });
        }
      }

      if (actor.schoolRole === 'super_admin' && actor.schoolId) {
        if (nextPassword && nextPassword.length >= 6) {
          await upsertSuperAdminVault({
            uid: actor.uid,
            schoolId: actor.schoolId,
            email: finalEmail,
            displayName: finalName,
            plainPassword: nextPassword,
            updatedBy: actor.email || actor.uid,
            nowIso,
          });
        } else if (emailChanged || nextDisplayName !== undefined) {
          await syncSuperAdminVaultMetadata({
            uid: actor.uid,
            schoolId: actor.schoolId,
            email: finalEmail,
            displayName: finalName,
            updatedBy: actor.email || actor.uid,
            nowIso,
          });
        }
      }

      return {
        uid: actor.uid,
        email: finalEmail,
        ...(resolvedNextUsername ? { username: resolvedNextUsername } : {}),
        displayName: finalName,
        phone: nextPhone !== undefined ? nextPhone : existingSaasUser?.phone,
        avatarUrl: nextAvatarUrl !== undefined ? nextAvatarUrl : existingSaasUser?.avatarUrl,
        schoolId: actor.schoolId,
        schoolRole: actor.schoolRole,
        isMasterAdmin: actor.isMasterAdmin,
      };
    },

    async updateTenantUserCredentials(
      targetUid: string,
      input: UpdateTenantUserCredentialsInput,
      actor: AuthPrincipal
    ): Promise<SaaSUserRecord> {
      if (!actor.isMasterAdmin && actor.schoolRole !== 'super_admin' && actor.schoolRole !== 'admin') {
        throw new SaaSServiceError('Only School Admins or Master Admin can update user credentials.', 403, 'FORBIDDEN');
      }

      const user = await deps.db.getSaaSUserByUid(targetUid);
      if (!user) {
        throw new SaaSServiceError('User not found.', 404, 'USER_NOT_FOUND');
      }

      if (!actor.isMasterAdmin && user.schoolId !== actor.schoolId) {
        throw new SaaSServiceError('Cross-tenant user management is strictly prohibited.', 403, 'CROSS_TENANT_FORBIDDEN');
      }

      if (!actor.isMasterAdmin && actor.schoolRole === 'admin') {
        if (user.schoolRole === 'super_admin' || input.schoolRole === 'super_admin') {
          throw new SaaSServiceError('Only Super Admin or Master Admin can modify Super Admin credentials.', 403, 'FORBIDDEN');
        }
      }

      const nextDisplayName = input.displayName !== undefined ? input.displayName.trim() : undefined;
      const rawNextEmail = input.email !== undefined ? input.email.trim() : undefined;
      const rawExplicitUsername = input.username !== undefined ? input.username.trim() : undefined;
      const nextPassword = input.password !== undefined ? input.password : undefined;
      const nextPhone = input.phone !== undefined ? input.phone.trim() : undefined;
      const nextRole = input.schoolRole;
      const nextLinkedStudentId =
        input.linkedStudentId !== undefined ? input.linkedStudentId.trim() : undefined;
      const nextLinkedStaffId =
        input.linkedStaffId !== undefined ? input.linkedStaffId.trim() : undefined;

      if (nextDisplayName !== undefined && !nextDisplayName) {
        throw new SaaSServiceError('Display name cannot be empty.', 400, 'VALIDATION_ERROR');
      }
      if (nextPassword !== undefined && nextPassword.length > 0 && nextPassword.length < 6) {
        throw new SaaSServiceError('Password must be at least 6 characters.', 400, 'WEAK_PASSWORD');
      }
      if (nextRole !== undefined && !ALLOWED_SCHOOL_ROLES.has(nextRole)) {
        throw new SaaSServiceError(`Invalid school role "${nextRole}".`, 403, 'FORBIDDEN_ROLE');
      }

      const currentEmailLower = user.email.toLowerCase();
      const currentUsernameNorm =
        user.usernameNormalized || (user.username ? normalizeLoginUsernameKey(user.username) : undefined);

      let resolvedNextEmail: string | undefined;
      let resolvedNextUsername: string | undefined = user.username;
      let resolvedNextUsernameNorm: string | undefined = currentUsernameNorm;
      let shouldClearUsername = false;

      if (rawNextEmail !== undefined && rawNextEmail.length > 0) {
        const parsedId = validateLoginIdentifier(rawNextEmail);
        if (!parsedId.valid) {
          throw new SaaSServiceError(
            parsedId.error || 'Please provide a valid email, mobile number, or username.',
            400,
            'INVALID_EMAIL'
          );
        }

        if (parsedId.kind === 'email') {
          if (parsedId.displayValue !== currentEmailLower) {
            resolvedNextEmail = parsedId.displayValue;
            if (rawExplicitUsername === undefined && isSyntheticAuthEmail(currentEmailLower)) {
              resolvedNextUsername = undefined;
              resolvedNextUsernameNorm = undefined;
              shouldClearUsername = true;
            }
          }
        } else {
          const usernameChanged =
            parsedId.normalizedKey !== currentUsernameNorm ||
            parsedId.displayValue !== user.username;
          if (usernameChanged || !isSyntheticAuthEmail(currentEmailLower)) {
            if (parsedId.normalizedKey !== currentUsernameNorm) {
              const dupUser = await deps.db.getSaaSUserByUsernameNormalized(parsedId.normalizedKey);
              if (dupUser && dupUser.uid !== targetUid) {
                throw new SaaSServiceError(
                  `Username or mobile "${parsedId.displayValue}" is already in use by another account.`,
                  409,
                  'DUPLICATE_USERNAME'
                );
              }
            }
            resolvedNextUsername = parsedId.displayValue;
            resolvedNextUsernameNorm = parsedId.normalizedKey;

            if (!isSyntheticAuthEmail(currentEmailLower) || parsedId.normalizedKey !== currentUsernameNorm) {
              let synth = buildSyntheticAuthEmail(parsedId.displayValue, user.schoolId);
              for (let attempt = 1; attempt <= 5; attempt += 1) {
                const authHit = await deps.auth.getUserByEmail(synth);
                const dbHit = await deps.db.getSaaSUserByEmail(synth);
                if ((!authHit || authHit.uid === targetUid) && (!dbHit || dbHit.uid === targetUid)) {
                  break;
                }
                synth = buildSyntheticAuthEmail(parsedId.displayValue, user.schoolId, String(attempt + 1));
              }
              if (synth !== currentEmailLower) {
                resolvedNextEmail = synth;
              }
            }
          }
        }
      }

      if (rawExplicitUsername !== undefined) {
        if (rawExplicitUsername === '') {
          resolvedNextUsername = undefined;
          resolvedNextUsernameNorm = undefined;
          shouldClearUsername = true;
        } else {
          const parsedU = validateLoginIdentifier(rawExplicitUsername);
          if (!parsedU.valid || parsedU.kind === 'email') {
            throw new SaaSServiceError(
              parsedU.error || 'Please provide a valid username or mobile number.',
              400,
              'INVALID_USERNAME'
            );
          }
          if (parsedU.normalizedKey !== currentUsernameNorm) {
            const dupU = await deps.db.getSaaSUserByUsernameNormalized(parsedU.normalizedKey);
            if (dupU && dupU.uid !== targetUid) {
              throw new SaaSServiceError(
                `Username or mobile "${parsedU.displayValue}" is already registered.`,
                409,
                'DUPLICATE_USERNAME'
              );
            }
          }
          resolvedNextUsername = parsedU.displayValue;
          resolvedNextUsernameNorm = parsedU.normalizedKey;
          shouldClearUsername = false;
        }
      }

      const emailChanged = Boolean(resolvedNextEmail && resolvedNextEmail !== currentEmailLower);
      if (emailChanged && resolvedNextEmail) {
        const existingAuth = await deps.auth.getUserByEmail(resolvedNextEmail);
        if (existingAuth && existingAuth.uid !== targetUid) {
          throw new SaaSServiceError(
            `Email "${resolvedNextEmail}" is already in use by another account.`,
            409,
            'DUPLICATE_EMAIL'
          );
        }
        const existingRecord = await deps.db.getSaaSUserByEmail(resolvedNextEmail);
        if (existingRecord && existingRecord.uid !== targetUid) {
          throw new SaaSServiceError(
            `Email "${resolvedNextEmail}" is already registered.`,
            409,
            'DUPLICATE_EMAIL'
          );
        }
      }

      const authUpdates: {
        email?: string;
        emailVerified?: boolean;
        password?: string;
        displayName?: string;
      } = {};
      if (emailChanged && resolvedNextEmail) {
        authUpdates.email = resolvedNextEmail;
        authUpdates.emailVerified = true;
      }
      if (nextDisplayName !== undefined) {
        authUpdates.displayName = nextDisplayName;
      }
      if (nextPassword && nextPassword.length >= 6) {
        authUpdates.password = nextPassword;
      }

      if (Object.keys(authUpdates).length > 0) {
        if (deps.auth.updateUser) {
          await deps.auth.updateUser(targetUid, authUpdates);
        } else if (authUpdates.password && deps.auth.updateUserPassword) {
          await deps.auth.updateUserPassword(targetUid, authUpdates.password);
        }
      }

      if (nextRole && nextRole !== user.schoolRole) {
        await deps.auth.setCustomClaims(targetUid, {
          schoolId: user.schoolId,
          schoolRole: nextRole,
          isMasterAdmin: false,
        });
      }

      const nowIso = getNow().toISOString();
      const resolvedPhoneNorm =
        nextPhone !== undefined
          ? normalizePhoneNumber(nextPhone)
          : user.phoneNormalized;

      const updatedPayload: SaaSUserRecord = {
        ...user,
        ...(emailChanged && resolvedNextEmail ? { email: resolvedNextEmail } : {}),
        ...(nextDisplayName !== undefined ? { displayName: nextDisplayName } : {}),
        ...(nextPhone !== undefined ? { phone: nextPhone } : {}),
        ...(nextRole ? { schoolRole: nextRole } : {}),
        ...(nextLinkedStudentId !== undefined ? { linkedStudentId: nextLinkedStudentId } : {}),
        ...(nextLinkedStaffId !== undefined ? { linkedStaffId: nextLinkedStaffId } : {}),
        updatedAt: nowIso,
      };
      if (shouldClearUsername) {
        delete updatedPayload.username;
        delete updatedPayload.usernameNormalized;
      } else if (resolvedNextUsername) {
        updatedPayload.username = resolvedNextUsername;
        updatedPayload.usernameNormalized = resolvedNextUsernameNorm;
      }
      if (resolvedPhoneNorm && resolvedPhoneNorm.length >= 6) {
        updatedPayload.phoneNormalized = resolvedPhoneNorm;
      } else if (nextPhone !== undefined) {
        delete updatedPayload.phoneNormalized;
      }

      const updatedUser = await deps.db.updateSaaSUserRecord(targetUid, updatedPayload);

      const school = await deps.db.getSchoolById(user.schoolId);
      if (
        school &&
        school.adminUid === targetUid &&
        (emailChanged || nextDisplayName !== undefined || resolvedNextUsername !== user.username)
      ) {
        await deps.db.updateSchool(user.schoolId, {
          adminEmail: updatedUser.email,
          ...(updatedUser.username ? { adminUsername: updatedUser.username } : { adminUsername: '' }),
          adminName: updatedUser.displayName,
          updatedAt: nowIso,
        });
      }

      if (updatedUser.schoolRole === 'super_admin') {
        if (nextPassword && nextPassword.length >= 6) {
          await upsertSuperAdminVault({
            uid: targetUid,
            schoolId: updatedUser.schoolId,
            email: updatedUser.email,
            displayName: updatedUser.displayName,
            plainPassword: nextPassword,
            updatedBy: actor.email || actor.uid,
            nowIso,
          });
        } else if (emailChanged || nextDisplayName !== undefined || nextRole === 'super_admin') {
          await syncSuperAdminVaultMetadata({
            uid: targetUid,
            schoolId: updatedUser.schoolId,
            email: updatedUser.email,
            displayName: updatedUser.displayName,
            updatedBy: actor.email || actor.uid,
            nowIso,
          });
        }
      } else if (user.schoolRole === 'super_admin' && nextRole && nextRole !== 'super_admin') {
        await deps.db.deleteMasterVaultRecord?.(targetUid);
      }

      return updatedUser;
    },

    async resolveLoginIdentifier(rawIdentifier: string): Promise<{
      resolvedEmail: string;
      method: 'email' | 'username' | 'phone';
      isSyntheticEmail: boolean;
    }> {
      const parsed = validateLoginIdentifier(rawIdentifier);
      if (!parsed.valid) {
        throw new SaaSServiceError(
          parsed.error || 'Please provide a valid email, mobile number, or username.',
          400,
          'INVALID_IDENTIFIER'
        );
      }

      if (parsed.kind === 'email') {
        return {
          resolvedEmail: parsed.displayValue,
          method: 'email',
          isSyntheticEmail: isSyntheticAuthEmail(parsed.displayValue),
        };
      }

      const candidates = await deps.db.findSaaSUsersByLoginIdentifier(
        parsed.normalizedKey,
        parsed.normalizedPhone
      );

      // Deduplicate by uid
      const byUid = new Map<string, SaaSUserRecord>();
      for (const c of candidates) {
        if (c?.uid && !byUid.has(c.uid)) {
          byUid.set(c.uid, c);
        }
      }
      const uniqueCandidates = Array.from(byUid.values());

      // Exact usernameNormalized match has top priority
      const directMatches = uniqueCandidates.filter((u) => {
        const key = u.usernameNormalized || (u.username ? normalizeLoginUsernameKey(u.username) : '');
        return key === parsed.normalizedKey;
      });

      let matched: SaaSUserRecord | null = null;
      let method: 'username' | 'phone' = parsed.kind === 'mobile' ? 'phone' : 'username';

      if (directMatches.length === 1) {
        matched = directMatches[0];
      } else if (directMatches.length > 1) {
        throw new SaaSServiceError(
          'Multiple accounts matched this login identifier. Please contact your School Admin.',
          409,
          'AMBIGUOUS_IDENTIFIER'
        );
      } else if (parsed.kind === 'mobile' && parsed.normalizedPhone) {
        if (uniqueCandidates.length > 1) {
          throw new SaaSServiceError(
            'Multiple accounts share this mobile number. Please log in with your unique Username or Email.',
            409,
            'AMBIGUOUS_IDENTIFIER'
          );
        }
        if (uniqueCandidates.length === 1) {
          matched = uniqueCandidates[0];
          method = 'phone';
        }
      }

      if (!matched) {
        throw new SaaSServiceError(
          'No active account matched this username or mobile number.',
          404,
          'USER_NOT_FOUND'
        );
      }

      if (matched.status === 'disabled') {
        throw new SaaSServiceError(
          'This account has been disabled by your administrator.',
          403,
          'ACCOUNT_DISABLED'
        );
      }

      return {
        resolvedEmail: matched.email,
        method,
        isSyntheticEmail: isSyntheticAuthEmail(matched.email),
      };
    },

    async deleteTenantUser(
      targetUid: string,
      actor: AuthPrincipal
    ): Promise<{ deletedUid: string; schoolId: string; email: string }> {
      if (!actor.isMasterAdmin && actor.schoolRole !== 'super_admin' && actor.schoolRole !== 'admin') {
        throw new SaaSServiceError('Only School Admins or Master Admin can delete user logins.', 403, 'FORBIDDEN');
      }

      if (actor.uid === targetUid) {
        throw new SaaSServiceError('You cannot delete your own active login account.', 400, 'CANNOT_DELETE_SELF');
      }

      let user = await deps.db.getSaaSUserByUid(targetUid);
      if (!user && !actor.isMasterAdmin && actor.schoolId) {
        const schoolUsers = await deps.db.listSaaSUsersBySchool(actor.schoolId);
        user = schoolUsers.find((u) => u.uid === targetUid) || null;
      }

      if (!user) {
        throw new SaaSServiceError('User not found.', 404, 'USER_NOT_FOUND');
      }

      if (!actor.isMasterAdmin && user.schoolId !== actor.schoolId) {
        throw new SaaSServiceError('Cross-tenant user deletion is strictly prohibited.', 403, 'CROSS_TENANT_FORBIDDEN');
      }

      if (user.schoolRole === 'master_admin' || (await deps.db.isMasterAdminUidOrEmail(user.uid, user.email))) {
        throw new SaaSServiceError('Master Admin account cannot be deleted.', 403, 'CANNOT_DELETE_MASTER_ADMIN');
      }

      if (!actor.isMasterAdmin && actor.schoolRole === 'admin' && user.schoolRole === 'super_admin') {
        throw new SaaSServiceError('Only Super Admin or Master Admin can delete a Super Admin account.', 403, 'FORBIDDEN');
      }

      if (deps.auth.deleteUser) {
        await deps.auth.deleteUser(targetUid);
      } else {
        await deps.auth.updateUserStatus(targetUid, true);
      }

      await deps.db.deleteMasterVaultRecord?.(targetUid);
      await deps.db.deleteSaaSUserRecord(targetUid, user.schoolId);

      const school = await deps.db.getSchoolById(user.schoolId);
      if (school && school.adminUid === targetUid) {
        await deps.db.updateSchool(user.schoolId, {
          adminUid: '',
          updatedAt: getNow().toISOString(),
        });
      }

      return {
        deletedUid: targetUid,
        schoolId: user.schoolId,
        email: user.email,
      };
    },

    async getSchoolAdminCredentials(
      schoolId: string,
      actor: AuthPrincipal
    ): Promise<
      Array<{
        uid: string;
        schoolId: string;
        schoolName: string;
        schoolCode: string;
        email: string;
        displayName: string;
        phone: string;
        schoolRole: 'super_admin';
        status: 'active' | 'disabled';
        isPrimaryAdmin: boolean;
        managedPassword: string | null;
        hasStoredPassword: boolean;
        passwordUpdatedAt: string | null;
        updatedBy: string | null;
      }>
    > {
      if (!actor.isMasterAdmin) {
        throw new SaaSServiceError(
          'Only Master Admin can view school Super Admin credentials.',
          403,
          'MASTER_ADMIN_REQUIRED'
        );
      }

      const school = await deps.db.getSchoolById(schoolId);
      if (!school) {
        throw new SaaSServiceError(`School "${schoolId}" not found.`, 404, 'SCHOOL_NOT_FOUND');
      }

      const [users, vaultRecords] = await Promise.all([
        deps.db.listSaaSUsersBySchool(schoolId),
        deps.db.getMasterVaultRecordsBySchool
          ? deps.db.getMasterVaultRecordsBySchool(schoolId)
          : Promise.resolve([] as MasterAdminVaultRecord[]),
      ]);

      const vaultByUid = new Map<string, MasterAdminVaultRecord>();
      for (const vr of vaultRecords) {
        if (vr?.uid) vaultByUid.set(vr.uid, vr);
      }

      const superAdmins = users.filter((u) => u.schoolRole === 'super_admin');
      if (
        school.adminUid &&
        !superAdmins.some((u) => u.uid === school.adminUid)
      ) {
        const fallbackFromUsers = users.find((u) => u.uid === school.adminUid);
        superAdmins.unshift(
          fallbackFromUsers || {
            uid: school.adminUid,
            email: school.adminEmail,
            displayName: school.adminName,
            schoolId: school.schoolId,
            schoolRole: 'super_admin',
            phone: school.contactNumber,
            status: school.status === 'suspended' ? 'disabled' : 'active',
            createdAt: school.createdAt,
            createdBy: school.createdBy,
            updatedAt: school.updatedAt,
          }
        );
      }

      return superAdmins
        .map((u) => {
          const vault = vaultByUid.get(u.uid);
          const decrypted = vault?.encryptedPassword
            ? decryptVaultPassword(vault.encryptedPassword)
            : null;
          const isPrimaryAdmin =
            (Boolean(school.adminUid) && u.uid === school.adminUid) ||
            (Boolean(school.adminEmail) &&
              u.email.toLowerCase() === school.adminEmail.toLowerCase());

          return {
            uid: u.uid,
            schoolId: school.schoolId,
            schoolName: school.schoolName,
            schoolCode: school.schoolCode,
            email: u.email,
            displayName: u.displayName,
            phone: u.phone || '',
            schoolRole: 'super_admin' as const,
            status: u.status,
            isPrimaryAdmin,
            managedPassword: decrypted,
            hasStoredPassword: decrypted !== null,
            passwordUpdatedAt: vault?.updatedAt || null,
            updatedBy: vault?.updatedBy || null,
          };
        })
        .sort((a, b) => {
          if (a.isPrimaryAdmin !== b.isPrimaryAdmin) return a.isPrimaryAdmin ? -1 : 1;
          return (a.displayName || '').localeCompare(b.displayName || '');
        });
    },
  };
}
