import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { UserProfile, UserRole, SystemAccessControl } from '../types';
import {
  auth,
  db,
  handleFirestoreError,
  OperationType,
  loginWithFirebaseEmail,
  loginWithGoogle,
  loginWithGoogleRedirect,
  completeGoogleRedirectLogin,
  isEmbeddedIframe,
  isGoogleRedirectPending,
  markGoogleRedirectPending,
  logoutUser,
  testConnection,
} from '../services/firebase';
import { StorageService } from '../services/storage';
import { onAuthStateChanged, User, IdTokenResult } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { safeSetLocalStorage, safeRemoveLocalStorage } from '../utils/storageHelper';
import { CloudSyncService } from '../services/cloudSync';
import {
  SaaSApi,
  SaaSComputedSubscription,
  SaaSMeResponse,
  SaaSPlanId,
  SaaSSchoolRecord,
  isSaaSBackendUnavailableError,
} from '../services/saasApi';
import { hydrateSchoolProfileFromSaaSSchool } from '../utils/schoolNameResolver';
import { validateLoginIdentifier } from '../utils/loginIdentifier';
import {
  cacheSessionPasswordVerifier,
  clearSessionPasswordVerifier,
  lockTransactionSession,
} from '../utils/transactionAuth';
import { formatFirebaseAuthErrorMessage } from '../utils/firebaseAuthErrors';
import { isAndroidWebView } from '../utils/cameraPermissionHelper';

export interface LoginResult {
  success: boolean;
  errorType?:
    | 'INVALID_CREDENTIALS'
    | 'SYSTEM_LOCKED'
    | 'ROLE_DISABLED'
    | 'ACCOUNT_DISABLED'
    | 'NO_TENANT_ASSIGNED'
    | 'AUTH_ERROR';
  errorMessage?: string;
  needsStandaloneTab?: boolean;
  canUseRedirect?: boolean;
  user?: UserProfile;
}

export const defaultProfiles: Record<UserRole, UserProfile> = {
  master_admin: {
    id: 'usr_master_admin',
    email: 'owner@smartschoolbd.com',
    name: 'Platform Master Admin',
    nameBn: 'প্ল্যাটফর্ম মাস্টার অ্যাডমিন',
    role: 'master_admin',
    isMasterAdmin: true,
  },
  super_admin: {
    id: 'usr_super_admin',
    email: 'superadmin@smartschoolbd.com',
    name: 'School Super Admin',
    nameBn: 'স্কুল সুপার অ্যাডমিন',
    role: 'super_admin',
  },
  admin: {
    id: 'usr_admin',
    email: 'principal@smartschoolbd.com',
    name: 'Head Teacher / Admin',
    nameBn: 'প্রধান শিক্ষক / অ্যাডমিন',
    role: 'admin',
  },
  teacher: {
    id: 'usr_teacher',
    email: 'teacher@smartschoolbd.com',
    name: 'Assistant Teacher',
    nameBn: 'সহকারী শিক্ষক',
    role: 'teacher',
  },
  accountant: {
    id: 'usr_accountant',
    email: 'accountant@smartschoolbd.com',
    name: 'Accountant',
    nameBn: 'হিসাবরক্ষক',
    role: 'accountant',
  },
  student: {
    id: 'usr_student',
    email: 'student@smartschoolbd.com',
    name: 'Student Portal',
    nameBn: 'শিক্ষার্থী পোর্টাল',
    role: 'student',
  },
  guardian: {
    id: 'usr_guardian',
    email: 'guardian@smartschoolbd.com',
    name: 'Guardian Portal',
    nameBn: 'অভিভাবক পোর্টাল',
    role: 'guardian',
  },
  librarian: {
    id: 'usr_librarian',
    email: 'library@smartschoolbd.com',
    name: 'Librarian',
    nameBn: 'গ্রন্থাগারিক',
    role: 'librarian',
  },
  receptionist: {
    id: 'usr_receptionist',
    email: 'admission@smartschoolbd.com',
    name: 'Admission Officer',
    nameBn: 'ভর্তি কর্মকর্তা',
    role: 'receptionist',
  },
  gatekeeper: {
    id: 'usr_gatekeeper',
    email: 'gate@smartschoolbd.com',
    name: 'Gate QR Scanner Kiosk',
    nameBn: 'স্কুল গেট কিউআর কিওস্ক',
    role: 'gatekeeper',
    permissions: {
      manageStudents: false,
      manageAttendance: true,
      manageExams: false,
      manageFees: false,
      manageRoutine: false,
      manageHomework: false,
      manageLibrary: false,
      onlyQrAttendanceKiosk: true,
    },
  },
};

function mapClaimsRoleToUserRole(rawRole: string | null | undefined, isMasterAdmin: boolean): UserRole {
  if (isMasterAdmin || rawRole === 'master_admin') return 'master_admin';
  const valid: UserRole[] = [
    'super_admin',
    'admin',
    'teacher',
    'accountant',
    'student',
    'guardian',
    'librarian',
    'receptionist',
    'gatekeeper',
  ];
  if (rawRole && valid.includes(rawRole as UserRole)) {
    return rawRole as UserRole;
  }
  if (rawRole === 'staff') return 'teacher';
  return 'teacher';
}

function shouldUseClientSaaSFallback(err: any): boolean {
  return isSaaSBackendUnavailableError(err);
}

function computeClientSubscriptionState(school: any, nowMs: number): SaaSComputedSubscription {
  const planId = (school?.subscription?.planId || 'monthly') as SaaSPlanId;
  const planName = school?.subscription?.planName || planId;
  const startDate = school?.subscription?.startDate || school?.createdAt || new Date(nowMs).toISOString();
  const expiryDate = school?.subscription?.expiryDate || new Date(nowMs).toISOString();
  const expiryMs = new Date(expiryDate).getTime();
  const diffMs = Number.isNaN(expiryMs) ? -1 : expiryMs - nowMs;
  const dayMs = 86_400_000;

  const isSuspended = school?.status === 'suspended' || school?.subscription?.status === 'Suspended';
  const isPending = school?.status === 'pending' || school?.subscription?.status === 'Pending';
  const isExpiredByDate = diffMs <= 0;
  const isExpired =
    !isSuspended &&
    !isPending &&
    (school?.status === 'expired' || school?.subscription?.status === 'Expired' || isExpiredByDate);

  const effectiveStatus = isSuspended
    ? 'Suspended'
    : isPending
    ? 'Pending'
    : isExpired
    ? 'Expired'
    : 'Active';

  const schoolStatus = isSuspended
    ? 'suspended'
    : isPending
    ? 'pending'
    : isExpired
    ? 'expired'
    : 'active';

  return {
    planId,
    planName,
    effectiveStatus,
    schoolStatus,
    startDate,
    expiryDate,
    remainingDays: diffMs > 0 ? Math.ceil(diffMs / dayMs) : 0,
    expiredDays: diffMs < 0 ? Math.ceil(Math.abs(diffMs) / dayMs) : 0,
    isExpired,
    isSuspended,
    isPending,
    accessAllowed: effectiveStatus === 'Active',
    lastPaymentDate: school?.subscription?.lastPaymentDate || null,
    nextRenewalDate: school?.subscription?.nextRenewalDate || null,
    serverTime: new Date(nowMs).toISOString(),
  };
}

async function buildFirebaseClientFallbackMe(
  fbUser: User,
  tokenResult: IdTokenResult
): Promise<SaaSMeResponse> {
  const claims = tokenResult.claims || {};
  const defaultSupport = {
    phone: 'Platform Support',
    email: 'support@smartschoolbd.com',
  };

  const [masterResult, userResult] = await Promise.all([
    getDoc(doc(db, 'master_admins', fbUser.uid)).catch((err: any) => {
      if (err?.code === 'permission-denied') {
        handleFirestoreError(err, OperationType.GET, `master_admins/${fbUser.uid}`);
      }
      return null;
    }),
    getDoc(doc(db, 'saas_users', fbUser.uid)).catch((err: any) => {
      if (err?.code === 'permission-denied') {
        handleFirestoreError(err, OperationType.GET, `saas_users/${fbUser.uid}`);
      }
      return null;
    }),
  ]);

  const isDbMasterAdmin = Boolean(masterResult?.exists() && masterResult.data()?.active !== false);
  const saasUserDoc: Record<string, any> | null = userResult?.exists() ? userResult.data() || null : null;

  if (saasUserDoc?.status === 'disabled') {
    throw new Error('Your user account has been disabled by your administrator.');
  }

  const rawClaimRole = typeof claims.schoolRole === 'string' ? claims.schoolRole : null;
  const isMasterAdmin =
    claims.isMasterAdmin === true || rawClaimRole === 'master_admin' || isDbMasterAdmin;
  const claimSchoolId =
    typeof claims.schoolId === 'string' && claims.schoolId.trim() ? claims.schoolId.trim() : null;
  const docSchoolId =
    typeof saasUserDoc?.schoolId === 'string' && saasUserDoc.schoolId.trim()
      ? saasUserDoc.schoolId.trim()
      : null;
  const schoolId = claimSchoolId || docSchoolId;
  const schoolRole = isMasterAdmin
    ? 'master_admin'
    : rawClaimRole || (typeof saasUserDoc?.schoolRole === 'string' ? saasUserDoc.schoolRole : null);

  const principal: SaaSMeResponse['principal'] = {
    uid: fbUser.uid,
    email: fbUser.email || saasUserDoc?.email || '',
    username: typeof saasUserDoc?.username === 'string' ? saasUserDoc.username : undefined,
    emailVerified: Boolean(fbUser.emailVerified),
    schoolId,
    schoolRole,
    isMasterAdmin,
    displayName: fbUser.displayName || saasUserDoc?.displayName || fbUser.email || '',
    linkedStaffId: typeof saasUserDoc?.linkedStaffId === 'string' ? saasUserDoc.linkedStaffId : undefined,
    linkedStudentId:
      typeof saasUserDoc?.linkedStudentId === 'string' ? saasUserDoc.linkedStudentId : undefined,
    phone:
      (typeof saasUserDoc?.phone === 'string' && saasUserDoc.phone) ||
      fbUser.phoneNumber ||
      undefined,
    avatarUrl:
      typeof saasUserDoc?.avatarUrl === 'string' ? saasUserDoc.avatarUrl : undefined,
  };

  if (isMasterAdmin) {
    return {
      success: true,
      principal,
      school: null,
      subscription: null,
      accessAllowed: true,
      blockReason: null,
      platformSupportContact: defaultSupport,
    };
  }

  if (!schoolId) {
    return {
      success: true,
      principal,
      school: null,
      subscription: null,
      accessAllowed: false,
      blockReason: 'NO_TENANT_ASSIGNED',
      platformSupportContact: defaultSupport,
    };
  }

  let schoolDoc: SaaSSchoolRecord | null = null;
  let schoolPermissionDenied = false;
  try {
    const schoolSnap = await getDoc(doc(db, 'schools', schoolId));
    if (schoolSnap.exists()) {
      schoolDoc = schoolSnap.data() as SaaSSchoolRecord;
    }
  } catch (err: any) {
    if (err?.code === 'permission-denied') {
      schoolPermissionDenied = true;
      handleFirestoreError(err, OperationType.GET, `schools/${schoolId}`);
    }
  }

  if (!schoolDoc) {
    if (schoolPermissionDenied && !claimSchoolId) {
      throw new Error(
        'School access claims are not synced on this account yet. Please contact your administrator or configure the backend server.'
      );
    }
    throw new Error('Assigned school tenant could not be found.');
  }

  const subscription = computeClientSubscriptionState(schoolDoc, Date.now());
  let blockReason: string | null = null;
  if (!subscription.accessAllowed) {
    blockReason = subscription.isSuspended
      ? 'SCHOOL_SUSPENDED'
      : subscription.isPending
      ? 'SUBSCRIPTION_PENDING'
      : 'SUBSCRIPTION_EXPIRED';
  }

  return {
    success: true,
    principal,
    school: schoolDoc,
    subscription,
    accessAllowed: subscription.accessAllowed,
    blockReason,
    platformSupportContact: defaultSupport,
  };
}

interface AuthContextType {
  currentUser: UserProfile;
  activeRole: UserRole;
  isAuthenticated: boolean;
  isAuthInitializing: boolean;
  saasSession: SaaSMeResponse | null;
  refreshSaasSession: () => Promise<SaaSMeResponse | null>;
  switchRole: (role: UserRole) => void;
  loginWithCredentials: (email: string, password: string) => Promise<LoginResult>;
  logout: () => Promise<void>;
  systemAccessControl: SystemAccessControl;
  updateSystemAccessControl: (control: Partial<SystemAccessControl>) => void;
  firebaseUser: User | null;
  isFirebaseConnected: boolean;
  syncStatus: 'idle' | 'syncing' | 'synced' | 'error';
  syncNow: () => Promise<void>;
  loginWithGooglePopup: () => Promise<LoginResult>;
  loginWithGoogleRedirectFallback: () => Promise<LoginResult>;
  updateUserAvatar: (avatarUrl: string) => Promise<void>;
  redirectAuthError: string | null;
  clearRedirectAuthError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isAuthInitializing, setIsAuthInitializing] = useState<boolean>(true);
  const [activeRole, setActiveRole] = useState<UserRole>('super_admin');
  const [loggedInUser, setLoggedInUser] = useState<UserProfile | null>(null);
  const [saasSession, setSaasSession] = useState<SaaSMeResponse | null>(null);
  const [redirectAuthError, setRedirectAuthError] = useState<string | null>(null);

  const [systemAccessControl, setSystemAccessControl] = useState<SystemAccessControl>(() => {
    return StorageService.getSystemAccessControl();
  });

  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [isFirebaseConnected, setIsFirebaseConnected] = useState<boolean>(true);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'synced' | 'error'>('idle');

  const lastHydrateErrorRef = useRef<string | null>(null);
  const hasExplicitLoginThisLoadRef = useRef<boolean>(false);
  const isExplicitLoginInProgressRef = useRef<boolean>(false);
  const isCheckingRedirectRef = useRef<boolean>(true);

  const hydrateFromSaasMe = useCallback(
    async (fbUser: User, options?: { forceRefreshToken?: boolean }): Promise<SaaSMeResponse | null> => {
      try {
        lastHydrateErrorRef.current = null;
        if (options?.forceRefreshToken) {
          await fbUser.getIdToken(true).catch(() => {});
        }
        let me: SaaSMeResponse;
        try {
          me = await SaaSApi.getMe();
          if (me?.principal && !me.principal.isMasterAdmin && !me.principal.schoolId) {
            try {
              const tokenResult = await fbUser.getIdTokenResult(false);
              const clientMe = await buildFirebaseClientFallbackMe(fbUser, tokenResult);
              if (clientMe.principal.isMasterAdmin || clientMe.principal.schoolId) {
                me = clientMe;
              }
            } catch {
              // Keep original /me response if fallback check throws
            }
          }
        } catch (apiErr: any) {
          if (!shouldUseClientSaaSFallback(apiErr)) {
            throw apiErr;
          }
          const tokenResult = await fbUser.getIdTokenResult(false);
          me = await buildFirebaseClientFallbackMe(fbUser, tokenResult);
        }

        if (!me || !me.principal) {
          throw new Error('Unable to verify user role and school tenant session.');
        }

        setSaasSession(me);

        const resolvedRole = mapClaimsRoleToUserRole(
          me.principal.schoolRole ?? null,
          Boolean(me.principal.isMasterAdmin)
        );

        // Pull only essential bootstrap slices before mounting UI; pull remaining heavy slices in background
        if (me.principal.schoolId) {
          const prioritySlices: ('profile' | 'staff' | 'students')[] =
            resolvedRole === 'student' || resolvedRole === 'guardian' || Boolean(me.principal.linkedStudentId)
              ? ['profile', 'students']
              : resolvedRole === 'gatekeeper'
              ? ['profile', 'students', 'staff']
              : ['profile', 'staff'];
          await CloudSyncService.setActiveSaaSTenant(me.principal.schoolId, me.accessAllowed, {
            prioritySlices,
            backgroundRemainingPull: true,
            priorityTimeoutMs: 4000,
          });
        } else {
          await CloudSyncService.setActiveSaaSTenant(null, false);
        }

      if (me.principal.schoolId && me.school) {
        const currentProfile = StorageService.getSchoolProfile();
        const { profile: hydratedProfile, changed } = hydrateSchoolProfileFromSaaSSchool(
          currentProfile,
          me.school
        );
        if (changed) {
          const canPersistProfileToCloud =
            me.accessAllowed &&
            (resolvedRole === 'super_admin' ||
              resolvedRole === 'admin' ||
              Boolean(me.principal.isMasterAdmin));
          if (canPersistProfileToCloud) {
            StorageService.saveSchoolProfile(hydratedProfile);
          } else {
            StorageService.saveSchoolProfileLocally(hydratedProfile);
          }
        }
      }
      const principalEmailLower = (me.principal.email || fbUser.email || '').toLowerCase();
      const matchedStaff = me.principal.schoolId
        ? StorageService.getStaff().find(
            (s) =>
              (me.principal.linkedStaffId && s.id === me.principal.linkedStaffId) ||
              (s.authUid && s.authUid === fbUser.uid) ||
              (s.email && principalEmailLower && s.email.toLowerCase() === principalEmailLower)
          )
        : undefined;

      const normalizePhone = (p?: string) => (p || '').replace(/\D/g, '').slice(-10);
      const principalPhoneNorm = normalizePhone(me.principal.phone);

      const matchedStudent =
        me.principal.schoolId &&
        (resolvedRole === 'student' || resolvedRole === 'guardian' || Boolean(me.principal.linkedStudentId))
          ? StorageService.getStudents().find(
              (st) =>
                (me.principal.linkedStudentId &&
                  (st.id === me.principal.linkedStudentId || st.studentId === me.principal.linkedStudentId)) ||
                (resolvedRole === 'student' &&
                  ((st.authUid && st.authUid === fbUser.uid) ||
                    (st.email && principalEmailLower && st.email.toLowerCase() === principalEmailLower))) ||
                (resolvedRole === 'guardian' &&
                  principalPhoneNorm.length >= 10 &&
                  principalPhoneNorm !== '1700000000' &&
                  (normalizePhone(st.guardianPhone) === principalPhoneNorm ||
                    normalizePhone(st.fatherPhone) === principalPhoneNorm ||
                    normalizePhone(st.motherPhone) === principalPhoneNorm))
            )
          : undefined;

      const currentSchoolProfile = StorageService.getSchoolProfile();
      const resolvedAvatar =
        me.principal.avatarUrl !== undefined
          ? me.principal.avatarUrl
          : resolvedRole === 'super_admin' && currentSchoolProfile.superAdminAvatarUrl
          ? currentSchoolProfile.superAdminAvatarUrl
          : matchedStaff?.photoUrl || matchedStudent?.photoUrl || undefined;

      const userProfile: UserProfile = {
        ...defaultProfiles[resolvedRole],
        id: fbUser.uid,
        authUid: fbUser.uid,
        email: me.principal.email || fbUser.email || '',
        username:
          me.principal.username ||
          matchedStaff?.username ||
          matchedStudent?.username ||
          undefined,
        phone:
          me.principal.phone ||
          matchedStaff?.phone ||
          matchedStudent?.guardianPhone ||
          matchedStudent?.phone ||
          undefined,
        avatar: resolvedAvatar || undefined,
        name:
          me.principal.displayName ||
          fbUser.displayName ||
          matchedStaff?.nameEn ||
          matchedStudent?.nameEn ||
          defaultProfiles[resolvedRole].name,
        nameBn:
          matchedStaff?.nameBn ||
          (resolvedRole === 'student' ? matchedStudent?.nameBn : undefined) ||
          me.principal.displayName ||
          fbUser.displayName ||
          defaultProfiles[resolvedRole].nameBn,
        role: resolvedRole,
        schoolId: me.principal.schoolId || undefined,
        isMasterAdmin: me.principal.isMasterAdmin,
        linkedStaffId: me.principal.linkedStaffId || matchedStaff?.id,
        linkedStudentId: me.principal.linkedStudentId || matchedStudent?.id,
        permissions: matchedStaff?.permissions || defaultProfiles[resolvedRole].permissions,
      };

      setLoggedInUser(userProfile);
      setActiveRole(resolvedRole);
      setIsAuthenticated(true);
      safeSetLocalStorage('school_erp_role', resolvedRole);
      safeSetLocalStorage('school_erp_authenticated', 'true');
      safeSetLocalStorage('school_erp_user', JSON.stringify(userProfile));

      return me;
    } catch (err: any) {
      const msg = err?.message || 'Unable to verify school tenant session with server.';
      console.warn('[AuthContext] Failed hydrating SaaS session:', msg);
      lastHydrateErrorRef.current = msg;
      return null;
    }
  }, []);

  const refreshSaasSession = useCallback(async (): Promise<SaaSMeResponse | null> => {
    const fbUser = auth.currentUser;
    if (!fbUser) return null;
    return await hydrateFromSaasMe(fbUser, { forceRefreshToken: true });
  }, [hydrateFromSaasMe]);

  useEffect(() => {
    let isMounted = true;
    // Ensure every fresh load starts at Hero Login section unless completing a Google redirect login
    safeRemoveLocalStorage('school_erp_authenticated');
    safeRemoveLocalStorage('school_erp_role');
    safeRemoveLocalStorage('school_erp_user');
    CloudSyncService.clearTenantSession();

    testConnection().then((connected) => {
      if (isMounted) setIsFirebaseConnected(connected);
    });

    let unsubscribe: (() => void) | null = null;

    const initAuth = async () => {
      const pendingRedirect = isGoogleRedirectPending();
      isCheckingRedirectRef.current = pendingRedirect;

      if (pendingRedirect) {
        try {
          const redirectCred = await Promise.race([
            completeGoogleRedirectLogin(),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
          ]);
          if (redirectCred?.user && isMounted) {
            markGoogleRedirectPending(false);
            hasExplicitLoginThisLoadRef.current = true;
            isExplicitLoginInProgressRef.current = true;
            const me = await hydrateFromSaasMe(redirectCred.user);
            if (!me || !me.principal) {
              hasExplicitLoginThisLoadRef.current = false;
              await logoutUser().catch(() => {});
              setIsAuthenticated(false);
              setRedirectAuthError(
                lastHydrateErrorRef.current || 'Could not verify SaaS session after Google sign-in.'
              );
            } else if (!me.principal.isMasterAdmin && !me.principal.schoolId) {
              hasExplicitLoginThisLoadRef.current = false;
              await logoutUser().catch(() => {});
              setIsAuthenticated(false);
              setRedirectAuthError(
                `Signed in as ${me.principal.email}, but this email is not set as Master Admin (MASTER_ADMIN_EMAILS) or assigned to any school yet.`
              );
            } else {
              setFirebaseUser(redirectCred.user);
            }
            isExplicitLoginInProgressRef.current = false;
            if (isMounted) setIsAuthInitializing(false);
          } else if (isMounted) {
            markGoogleRedirectPending(false);
          }
        } catch (err: any) {
          markGoogleRedirectPending(false);
          if (isMounted) {
            const host = typeof window !== 'undefined' ? window.location.hostname : '';
            const formatted = formatFirebaseAuthErrorMessage({
              code: err?.code,
              rawMessage: err?.message,
              flow: 'google-redirect',
              host,
              inIframe: isEmbeddedIframe(),
              isOffline: typeof navigator !== 'undefined' && navigator.onLine === false,
              isWebView: isAndroidWebView(),
            });
            setRedirectAuthError(formatted.message);
          }
        } finally {
          isCheckingRedirectRef.current = false;
        }
      }

      if (!isMounted) return;

      unsubscribe = onAuthStateChanged(auth, async (user) => {
        if (isCheckingRedirectRef.current || isExplicitLoginInProgressRef.current) {
          return;
        }

        if (user && !hasExplicitLoginThisLoadRef.current) {
          // Clear any leftover persisted session so Hero Login always comes first on fresh load
          setFirebaseUser(null);
          setSaasSession(null);
          setIsAuthenticated(false);
          setLoggedInUser(null);
          CloudSyncService.clearTenantSession();
          await logoutUser().catch(() => {});
          setIsAuthInitializing(false);
          return;
        }

        setFirebaseUser(user);
        if (user) {
          await hydrateFromSaasMe(user);
        } else {
          setSaasSession(null);
          setIsAuthenticated(false);
          setLoggedInUser(null);
          CloudSyncService.clearTenantSession();
        }
        setIsAuthInitializing(false);
      });
    };

    initAuth();

    // Safety failsafe so UI can never stay permanently blocked on auth initialization
    const initSafetyTimer = setTimeout(() => {
      if (isMounted) {
        setIsAuthInitializing(false);
      }
    }, 6000);

    const handleCloudSynced = () => {
      setSystemAccessControl(StorageService.getSystemAccessControl());
    };
    window.addEventListener('school_cloud_data_synced', handleCloudSynced);

    return () => {
      isMounted = false;
      clearTimeout(initSafetyTimer);
      if (unsubscribe) unsubscribe();
      window.removeEventListener('school_cloud_data_synced', handleCloudSynced);
    };
  }, [hydrateFromSaasMe]);

  const updateSystemAccessControl = (partial: Partial<SystemAccessControl>) => {
    const updated: SystemAccessControl = {
      ...systemAccessControl,
      ...partial,
      updatedAt: new Date().toISOString(),
      updatedBy:
        activeRole === 'master_admin'
          ? loggedInUser?.name || saasSession?.principal?.displayName || 'Master Admin'
          : 'Admin',
    };
    StorageService.saveSystemAccessControl(updated);
    setSystemAccessControl(updated);
  };

  const switchRole = (role: UserRole) => {
    if (!saasSession?.principal?.isMasterAdmin && activeRole !== 'master_admin') {
      console.warn('Role switching blocked for non-master admin accounts');
      return;
    }
    setActiveRole(role);
    safeSetLocalStorage('school_erp_role', role);
  };

  const loginWithCredentials = async (identifierInput: string, pass: string): Promise<LoginResult> => {
    const rawInput = identifierInput.trim();
    if (!rawInput || !pass) {
      return {
        success: false,
        errorType: 'INVALID_CREDENTIALS',
        errorMessage: 'Please enter your email, mobile number, or username and password.',
      };
    }

    const parsedId = validateLoginIdentifier(rawInput);
    if (!parsedId.valid) {
      return {
        success: false,
        errorType: 'INVALID_CREDENTIALS',
        errorMessage:
          parsedId.error || 'Please enter a valid email address, mobile number, or username.',
      };
    }

    let resolvedEmail = parsedId.kind === 'email' ? parsedId.displayValue : '';
    if (!resolvedEmail) {
      try {
        const res = await SaaSApi.resolveLoginIdentifier(rawInput);
        resolvedEmail = res.resolvedEmail;
      } catch (resolveErr: any) {
        if (resolveErr?.code === 'ACCOUNT_DISABLED') {
          return {
            success: false,
            errorType: 'ACCOUNT_DISABLED',
            errorMessage:
              resolveErr?.message || 'This account has been disabled by your administrator.',
          };
        }
        if (resolveErr?.code === 'AMBIGUOUS_IDENTIFIER') {
          return {
            success: false,
            errorType: 'INVALID_CREDENTIALS',
            errorMessage: resolveErr.message,
          };
        }
        if (resolveErr?.code === 'USER_NOT_FOUND') {
          return {
            success: false,
            errorType: 'INVALID_CREDENTIALS',
            errorMessage:
              'Invalid username, mobile number, or password. Please verify your credentials.',
          };
        }
        if (isSaaSBackendUnavailableError(resolveErr)) {
          return {
            success: false,
            errorType: 'AUTH_ERROR',
            errorMessage:
              'Mobile/username login requires backend server access. Please sign in with your @ email or check server connection.',
          };
        }
        return {
          success: false,
          errorType: 'INVALID_CREDENTIALS',
          errorMessage: resolveErr?.message || 'Unable to verify login identifier.',
        };
      }
    }

    try {
      isExplicitLoginInProgressRef.current = true;
      hasExplicitLoginThisLoadRef.current = true;
      const cred = await loginWithFirebaseEmail(resolvedEmail, pass);
      const me = await hydrateFromSaasMe(cred.user);

      if (!me || !me.principal) {
        hasExplicitLoginThisLoadRef.current = false;
        await logoutUser().catch(() => {});
        setIsAuthenticated(false);
        return {
          success: false,
          errorType: 'AUTH_ERROR',
          errorMessage: lastHydrateErrorRef.current || 'Unable to verify school tenant session with server.',
        };
      }

      if (!me.principal.isMasterAdmin && !me.principal.schoolId) {
        hasExplicitLoginThisLoadRef.current = false;
        await logoutUser().catch(() => {});
        setIsAuthenticated(false);
        return {
          success: false,
          errorType: 'NO_TENANT_ASSIGNED',
          errorMessage:
            'This account is not assigned to any school tenant. Contact your School Admin or Platform Owner.',
        };
      }

      // Enforce Master Admin local role lock if active for that school
      const resolvedRole = mapClaimsRoleToUserRole(
        me.principal.schoolRole ?? null,
        Boolean(me.principal.isMasterAdmin)
      );
      if (!me.principal.isMasterAdmin && systemAccessControl.isSystemLocked) {
        hasExplicitLoginThisLoadRef.current = false;
        await logoutUser().catch(() => {});
        setIsAuthenticated(false);
        return {
          success: false,
          errorType: 'SYSTEM_LOCKED',
          errorMessage: systemAccessControl.disabledMessage,
        };
      }
      if (!me.principal.isMasterAdmin && systemAccessControl.disabledRoles.includes(resolvedRole)) {
        hasExplicitLoginThisLoadRef.current = false;
        await logoutUser().catch(() => {});
        setIsAuthenticated(false);
        return {
          success: false,
          errorType: 'ROLE_DISABLED',
          errorMessage: systemAccessControl.disabledMessage,
        };
      }

      await cacheSessionPasswordVerifier(cred.user.uid, cred.user.email || resolvedEmail, pass);
      setFirebaseUser(cred.user);
      setIsAuthInitializing(false);
      return { success: true };
    } catch (err: any) {
      hasExplicitLoginThisLoadRef.current = false;
      const code = err?.code || '';
      let msg = err?.message || 'Authentication failed.';
      if (
        code === 'auth/invalid-credential' ||
        code === 'auth/wrong-password' ||
        code === 'auth/user-not-found'
      ) {
        msg =
          'Invalid email, mobile number, username, or password. Please verify your credentials.';
      } else if (code === 'auth/user-disabled') {
        return {
          success: false,
          errorType: 'ACCOUNT_DISABLED',
          errorMessage: 'This account has been disabled by your administrator.',
        };
      } else if (code === 'auth/invalid-email') {
        msg = 'Please enter a valid email address, mobile number, or username.';
      } else if (code === 'auth/operation-not-allowed') {
        msg =
          'Email/Password Sign-In is disabled in Firebase Console. Enable it under Authentication → Sign-in method, or use Google Sign-In.';
      } else if (code === 'auth/network-request-failed' || code === 'auth/too-many-requests') {
        msg = formatFirebaseAuthErrorMessage({
          code,
          rawMessage: err?.message,
          flow: 'email-password',
          isOffline: typeof navigator !== 'undefined' && navigator.onLine === false,
        }).message;
      }
      return {
        success: false,
        errorType: 'INVALID_CREDENTIALS',
        errorMessage: msg,
      };
    } finally {
      isExplicitLoginInProgressRef.current = false;
      setIsAuthInitializing(false);
    }
  };

  const handleGoogleRedirectLogin = async (): Promise<LoginResult> => {
    try {
      setRedirectAuthError(null);
      await loginWithGoogleRedirect();
      return { success: true };
    } catch (e: any) {
      markGoogleRedirectPending(false);
      const formatted = formatFirebaseAuthErrorMessage({
        code: e?.code,
        rawMessage: e?.message,
        flow: 'google-redirect',
        host: typeof window !== 'undefined' ? window.location.hostname : '',
        inIframe: isEmbeddedIframe(),
        isOffline: typeof navigator !== 'undefined' && navigator.onLine === false,
        isWebView: isAndroidWebView(),
      });
      return {
        success: false,
        errorType: 'AUTH_ERROR',
        needsStandaloneTab: formatted.needsStandaloneTab,
        errorMessage: formatted.message,
      };
    }
  };

  const handleGoogleLogin = async (): Promise<LoginResult> => {
    try {
      setRedirectAuthError(null);
      isExplicitLoginInProgressRef.current = true;
      hasExplicitLoginThisLoadRef.current = true;
      const cred = await loginWithGoogle();
      const me = await hydrateFromSaasMe(cred.user);
      if (!me || !me.principal) {
        hasExplicitLoginThisLoadRef.current = false;
        await logoutUser().catch(() => {});
        setIsAuthenticated(false);
        return {
          success: false,
          errorType: 'AUTH_ERROR',
          errorMessage: lastHydrateErrorRef.current || 'Could not verify SaaS session after Google sign-in.',
        };
      }
      if (!me.principal.isMasterAdmin && !me.principal.schoolId) {
        hasExplicitLoginThisLoadRef.current = false;
        await logoutUser().catch(() => {});
        setIsAuthenticated(false);
        return {
          success: false,
          errorType: 'NO_TENANT_ASSIGNED',
          errorMessage: `Signed in as ${me.principal.email}, but this email is not set as Master Admin (MASTER_ADMIN_EMAILS) or assigned to any school yet.`,
        };
      }
      setFirebaseUser(cred.user);
      setIsAuthInitializing(false);
      return { success: true };
    } catch (e: any) {
      hasExplicitLoginThisLoadRef.current = false;
      const code = e?.code || '';
      const inIframe = isEmbeddedIframe();
      const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
      const host = typeof window !== 'undefined' ? window.location.hostname : '';

      if (code === 'auth/popup-blocked' && !inIframe && !isOffline) {
        // Directly fall back to redirect sign-in when running in standalone browser tab
        await loginWithGoogleRedirect().catch(() => {});
        return {
          success: false,
          errorType: 'AUTH_ERROR',
          canUseRedirect: true,
          errorMessage: 'পপ-আপ ব্লক হওয়ায় Google Redirect লগইনে পাঠানো হচ্ছে...',
        };
      }

      const formatted = formatFirebaseAuthErrorMessage({
        code,
        rawMessage: e?.message,
        flow: 'google-popup',
        host,
        inIframe,
        isOffline,
        isWebView: isAndroidWebView(),
      });

      return {
        success: false,
        errorType: 'AUTH_ERROR',
        needsStandaloneTab: formatted.needsStandaloneTab,
        canUseRedirect: formatted.canUseRedirect,
        errorMessage: formatted.message,
      };
    } finally {
      isExplicitLoginInProgressRef.current = false;
      setIsAuthInitializing(false);
    }
  };

  const handleLogout = async () => {
    hasExplicitLoginThisLoadRef.current = false;
    setIsAuthenticated(false);
    setActiveRole('super_admin');
    setLoggedInUser(null);
    setSaasSession(null);
    safeSetLocalStorage('school_erp_authenticated', 'false');
    safeRemoveLocalStorage('school_erp_role');
    safeRemoveLocalStorage('school_erp_user');
    CloudSyncService.clearTenantSession();
    clearSessionPasswordVerifier();
    lockTransactionSession();
    await logoutUser().catch(console.error);
  };

  const syncNow = async () => {
    setSyncStatus('syncing');
    try {
      const ok = await CloudSyncService.syncBidirectional();
      if (ok) {
        setSyncStatus('synced');
        setTimeout(() => setSyncStatus('idle'), 4000);
      } else {
        setSyncStatus('error');
      }
    } catch {
      setSyncStatus('error');
    }
  };

  const updateUserAvatar = useCallback(
    async (avatarUrl: string) => {
      const cleanUrl = (avatarUrl || '').trim();

      setLoggedInUser((prev) => {
        const base = prev || defaultProfiles[activeRole];
        const nextUser: UserProfile = { ...base, avatar: cleanUrl || undefined };
        safeSetLocalStorage('school_erp_user', JSON.stringify(nextUser));
        return nextUser;
      });

      setSaasSession((prev) =>
        prev
          ? {
              ...prev,
              principal: {
                ...prev.principal,
                avatarUrl: cleanUrl,
              },
            }
          : prev
      );

      if (activeRole === 'super_admin' || saasSession?.principal?.schoolRole === 'super_admin') {
        const currentProfile = StorageService.getSchoolProfile();
        const nextProfile = { ...currentProfile, superAdminAvatarUrl: cleanUrl };
        if (saasSession?.accessAllowed) {
          StorageService.saveSchoolProfile(nextProfile);
        } else {
          StorageService.saveSchoolProfileLocally(nextProfile);
        }
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('school_profile_updated', { detail: nextProfile }));
        }
      }

      if (auth.currentUser) {
        try {
          await SaaSApi.updateMyCredentials({ avatarUrl: cleanUrl });
        } catch (err: any) {
          if (!isSaaSBackendUnavailableError(err)) {
            throw err;
          }
        }
      }
    },
    [activeRole, saasSession]
  );

  const currentUser: UserProfile =
    loggedInUser && loggedInUser.role === activeRole
      ? loggedInUser
      : {
          ...defaultProfiles[activeRole],
          ...(firebaseUser?.email
            ? {
                id: firebaseUser.uid,
                authUid: firebaseUser.uid,
                email: firebaseUser.email,
                name: firebaseUser.displayName || defaultProfiles[activeRole].name,
                schoolId: saasSession?.principal?.schoolId || undefined,
                isMasterAdmin: saasSession?.principal?.isMasterAdmin || false,
              }
            : {}),
        };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        activeRole,
        isAuthenticated,
        isAuthInitializing,
        saasSession,
        refreshSaasSession,
        switchRole,
        loginWithCredentials,
        logout: handleLogout,
        systemAccessControl,
        updateSystemAccessControl,
        firebaseUser,
        isFirebaseConnected,
        syncStatus,
        syncNow,
        loginWithGooglePopup: handleGoogleLogin,
        loginWithGoogleRedirectFallback: handleGoogleRedirectLogin,
        updateUserAvatar,
        redirectAuthError,
        clearRedirectAuthError: () => setRedirectAuthError(null),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
