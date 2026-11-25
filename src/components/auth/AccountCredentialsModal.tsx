import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import {
  auth,
  db,
  handleFirestoreError,
  OperationType,
  hasPasswordProvider,
  reauthenticateWithCurrentPassword,
  reauthenticateWithGoogleAccount,
  updateFirebaseClientPassword,
} from '../../services/firebase';
import { updateProfile } from 'firebase/auth';
import { collection, getDocs } from 'firebase/firestore';
import {
  SaaSApi,
  SaaSHealthDiagnostics,
  SaaSSchoolAdminCredentialDTO,
  SaaSSchoolRecord,
  SaaSUserDTO,
  computeClientSubscriptionState,
  isSaaSBackendUnavailableError,
  isSaaSIamPermissionError,
  isNetlifyHostingEnvironment,
} from '../../services/saasApi';
import { StorageService } from '../../services/storage';
import {
  KeyRound,
  ShieldCheck,
  Eye,
  EyeOff,
  User,
  CheckCircle2,
  AlertTriangle,
  X,
  Lock,
  Mail,
  Phone,
  Users,
  UserPlus,
  Search,
  Edit2,
  Ban,
  Unlock,
  Copy,
  Check,
  RefreshCw,
  Building2,
  Sparkles,
  Trash2,
  Camera,
} from 'lucide-react';
import { compressImageToPassportSize } from '../../utils/storageHelper';
import {
  formatDisplayLoginId,
  isSyntheticAuthEmail,
  normalizeLoginUsernameKey,
  validateLoginIdentifier,
} from '../../utils/loginIdentifier';
import { Staff, Student } from '../../types';
import { SearchablePicker } from '../common/SearchablePicker';
import { filterStaffByQuery, filterStudentsByQuery } from '../../utils/personSearchFilter';

export interface AccountCredentialsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'my_account' | 'manage_users';
  initialSchoolId?: string;
}

const ROLE_OPTIONS: { value: string; labelEn: string; labelBn: string }[] = [
  { value: 'super_admin', labelEn: 'School Super Admin', labelBn: 'স্কুল সুপার অ্যাডমিন' },
  { value: 'admin', labelEn: 'Head Teacher / Admin', labelBn: 'প্রধান শিক্ষক / অ্যাডমিন' },
  { value: 'teacher', labelEn: 'Teacher', labelBn: 'শিক্ষক' },
  { value: 'accountant', labelEn: 'Accountant', labelBn: 'হিসাবরক্ষক' },
  { value: 'librarian', labelEn: 'Librarian', labelBn: 'গ্রন্থাগারিক' },
  { value: 'receptionist', labelEn: 'Admission Officer', labelBn: 'ভর্তি কর্মকর্তা' },
  { value: 'gatekeeper', labelEn: 'Gate QR Kiosk', labelBn: 'গেট কিওস্ক' },
  { value: 'student', labelEn: 'Student', labelBn: 'শিক্ষার্থী' },
  { value: 'guardian', labelEn: 'Guardian', labelBn: 'অভিভাবক' },
];

function generateRandomPassword(length = 8): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789@#';
  let out = '';
  for (let i = 0; i < length; i++) {
    out += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return out;
}

export const AccountCredentialsModal: React.FC<AccountCredentialsModalProps> = ({
  isOpen,
  onClose,
  initialTab = 'my_account',
  initialSchoolId,
}) => {
  const { currentUser, activeRole, saasSession, firebaseUser, refreshSaasSession, updateUserAvatar } = useAuth();
  const { language } = useLanguage();
  const [avatarBusy, setAvatarBusy] = useState(false);
  const modalAvatarInputId = React.useId();

  const isMaster = activeRole === 'master_admin' || Boolean(saasSession?.principal?.isMasterAdmin);
  const canManageUsers = isMaster || activeRole === 'super_admin' || activeRole === 'admin';

  const [tab, setTab] = useState<'my_account' | 'manage_users'>(initialTab);

  // =========================================================================
  // TAB 1: MY ACCOUNT & PASSWORD (ALL ROLES)
  // =========================================================================
  const [myDisplayName, setMyDisplayName] = useState<string>('');
  const [myEmail, setMyEmail] = useState<string>('');
  const [myPhone, setMyPhone] = useState<string>('');
  const [currentPassword, setCurrentPassword] = useState<string>('');
  const [newPassword, setNewPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [showCurPass, setShowCurPass] = useState<boolean>(false);
  const [showNewPass, setShowNewPass] = useState<boolean>(false);
  const [mySaving, setMySaving] = useState<boolean>(false);
  const [myFeedback, setMyFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const userHasPassword = hasPasswordProvider(firebaseUser);

  // =========================================================================
  // TAB 2: SCHOOL USERS & PASSWORDS MANAGER (MASTER ADMIN & SCHOOL ADMINS)
  // =========================================================================
  const [schools, setSchools] = useState<SaaSSchoolRecord[]>([]);
  const [selectedSchoolId, setSelectedSchoolId] = useState<string>('');
  const [usersList, setUsersList] = useState<SaaSUserDTO[]>([]);
  const [loadingUsers, setLoadingUsers] = useState<boolean>(false);
  const [userSearch, setUserSearch] = useState<string>('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [usersFeedback, setUsersFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [serverAdminUnavailable, setServerAdminUnavailable] = useState<boolean>(false);
  const [serverDiagnostics, setServerDiagnostics] = useState<SaaSHealthDiagnostics | null>(null);
  const [fallbackTriggerCode, setFallbackTriggerCode] = useState<string | null>(null);
  const [healthProbeError, setHealthProbeError] = useState<string | null>(null);
  const [vaultFetchError, setVaultFetchError] = useState<string | null>(null);
  const [adminVaultCreds, setAdminVaultCreds] = useState<Record<string, SaaSSchoolAdminCredentialDTO>>({});
  const [revealedAdminUids, setRevealedAdminUids] = useState<Record<string, boolean>>({});
  const [copiedUid, setCopiedUid] = useState<string | null>(null);

  // Create user panel
  const [showCreateForm, setShowCreateForm] = useState<boolean>(false);
  const [creatingUser, setCreatingUser] = useState<boolean>(false);
  const [createForm, setCreateForm] = useState({
    displayName: '',
    email: '',
    password: '',
    phone: '',
    schoolRole: 'teacher',
    linkedStaffId: '',
    linkedStudentId: '',
  });

  // Edit user drawer
  const [editingUser, setEditingUser] = useState<SaaSUserDTO | null>(null);
  const [editUserSaving, setEditUserSaving] = useState<boolean>(false);
  const [editUserForm, setEditUserForm] = useState({
    displayName: '',
    email: '',
    phone: '',
    schoolRole: 'teacher',
    linkedStudentId: '',
    newPassword: '',
  });
  const [showEditUserPass, setShowEditUserPass] = useState<boolean>(false);

  // Delete user confirmation state
  const [confirmDeleteUser, setConfirmDeleteUser] = useState<SaaSUserDTO | null>(null);
  const [deletingUid, setDeletingUid] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setTab(initialTab);
    const rawEmail = currentUser.email || saasSession?.principal?.email || '';
    const rawUsername = saasSession?.principal?.username || currentUser.username || '';
    const displayLogin = isSyntheticAuthEmail(rawEmail)
      ? rawUsername || formatDisplayLoginId({ username: rawUsername, email: rawEmail })
      : rawEmail || rawUsername;
    setMyDisplayName(currentUser.name || saasSession?.principal?.displayName || '');
    setMyEmail(displayLogin);
    const matchedStaff = StorageService.getStaff().find(
      (s) => s.authUid === currentUser.authUid || s.id === currentUser.linkedStaffId
    );
    setMyPhone(saasSession?.principal?.phone || currentUser.phone || matchedStaff?.phone || '');
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setMyFeedback(null);
    setUsersFeedback(null);
    setEditingUser(null);
    setConfirmDeleteUser(null);
    setDeletingUid(null);
    setShowCreateForm(false);
    setRevealedAdminUids({});
    setAdminVaultCreds({});
  }, [isOpen, initialTab, currentUser, saasSession]);

  const refreshServerDiagnostics = async () => {
    try {
      const h = await SaaSApi.getHealth();
      setHealthProbeError(null);
      setServerDiagnostics(
        h.diagnostics || {
          adminSdkReady: Boolean(h.adminSdkReady),
          initStatus: h.adminSdkReady ? 'ok' : 'missing_credentials',
          hasServiceAccountJson: false,
          hasSplitCredentials: false,
          hasClientEmail: false,
          hasPrivateKey: false,
          hasGoogleAppCreds: false,
          hasProjectId: false,
          isNetlifyRuntime: false,
        }
      );
    } catch (healthErr: any) {
      setHealthProbeError(healthErr?.code || (healthErr?.status ? `HTTP_${healthErr.status}` : 'NETWORK_ERROR'));
    }
  };

  // Load schools (for Master Admin) and school users when Manage Users tab opens
  useEffect(() => {
    if (!isOpen || !canManageUsers) return;

    const loadContext = async () => {
      if (isMaster) {
        try {
          const res = await SaaSApi.masterListSchools();
          setSchools(res.schools);
          setServerAdminUnavailable(false);
          setServerDiagnostics(null);
          setFallbackTriggerCode(null);
          setHealthProbeError(null);
          const defaultSid =
            initialSchoolId ||
            selectedSchoolId ||
            saasSession?.school?.schoolId ||
            res.schools[0]?.schoolId ||
            '';
          setSelectedSchoolId(defaultSid);
        } catch (err: any) {
          if (isSaaSBackendUnavailableError(err)) {
            setServerAdminUnavailable(true);
            setFallbackTriggerCode(err?.code || (err?.status ? `HTTP_${err.status}` : 'UNAVAILABLE'));
            refreshServerDiagnostics();
            try {
              const snap = await getDocs(collection(db, 'schools'));
              const fsSchools = snap.docs
                .map((d) => {
                  const raw = d.data() as SaaSSchoolRecord;
                  return {
                    ...raw,
                    computedSubscription: computeClientSubscriptionState(raw, Date.now()),
                  };
                })
                .filter((s) => Boolean(s.schoolId))
                .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
              setSchools(fsSchools);
              const defaultSid =
                initialSchoolId ||
                selectedSchoolId ||
                saasSession?.school?.schoolId ||
                fsSchools[0]?.schoolId ||
                '';
              setSelectedSchoolId(defaultSid);
              return;
            } catch (fsErr: any) {
              if (fsErr?.code === 'permission-denied') {
                handleFirestoreError(fsErr, OperationType.LIST, 'schools');
              }
            }
          }
          setUsersFeedback({
            type: 'error',
            text: err?.message || 'Failed to load schools list.',
          });
        }
      } else {
        const sid = saasSession?.school?.schoolId || currentUser.schoolId || '';
        setSelectedSchoolId(sid);
      }
    };

    loadContext();
  }, [isOpen, canManageUsers, isMaster, initialSchoolId, saasSession?.school?.schoolId, currentUser.schoolId]);

  const fetchSchoolUsers = async (schoolIdToLoad: string) => {
    if (!schoolIdToLoad) {
      setUsersList([]);
      setAdminVaultCreds({});
      return;
    }
    setLoadingUsers(true);
    setUsersFeedback(null);
    setVaultFetchError(null);
    try {
      let localVaultErr: string | null = null;
      const [res, vaultRes] = await Promise.all([
        SaaSApi.listUsers(isMaster ? schoolIdToLoad : undefined),
        isMaster
          ? SaaSApi.masterGetSchoolAdminCredentials(schoolIdToLoad).catch((vErr: any) => {
              localVaultErr = vErr?.message || 'Failed to load Master Admin vault credentials.';
              return null;
            })
          : Promise.resolve(null),
      ]);
      setUsersList(res.users || []);
      setVaultFetchError(localVaultErr);
      if (isMaster && vaultRes?.credentials) {
        const nextMap: Record<string, SaaSSchoolAdminCredentialDTO> = {};
        for (const cred of vaultRes.credentials) {
          nextMap[cred.uid] = cred;
        }
        setAdminVaultCreds(nextMap);
      } else {
        setAdminVaultCreds({});
      }
      setServerAdminUnavailable(false);
      setServerDiagnostics(null);
      setFallbackTriggerCode(null);
      setHealthProbeError(null);
    } catch (err: any) {
      if (isSaaSBackendUnavailableError(err)) {
        setServerAdminUnavailable(true);
        setFallbackTriggerCode(err?.code || (err?.status ? `HTTP_${err.status}` : 'UNAVAILABLE'));
        setAdminVaultCreds({});
        refreshServerDiagnostics();
        try {
          const tokenRes = auth.currentUser
            ? await auth.currentUser.getIdTokenResult().catch(() => null)
            : null;
          const claimSchoolId = String(tokenRes?.claims?.schoolId || '');
          const claimRole = String(tokenRes?.claims?.schoolRole || '');
          const isMasterClaim =
            tokenRes?.claims?.isMasterAdmin === true ||
            claimRole === 'master_admin' ||
            isMaster;
          const isSchoolAdminClaim =
            claimSchoolId === schoolIdToLoad &&
            (claimRole === 'super_admin' || claimRole === 'admin');

          if (isMasterClaim || isSchoolAdminClaim) {
            const snap = await getDocs(collection(db, 'schools', schoolIdToLoad, 'users'));
            const loadedUsers = snap.docs
              .map((d) => d.data() as SaaSUserDTO)
              .sort((a, b) => (a.displayName || '').localeCompare(b.displayName || ''));
            setUsersList(loadedUsers);
            return;
          }
          setUsersList([]);
          return;
        } catch (fsErr: any) {
          if (fsErr?.code === 'permission-denied') {
            handleFirestoreError(fsErr, OperationType.LIST, `schools/${schoolIdToLoad}/users`);
          }
          setUsersList([]);
          return;
        }
      }
      setUsersFeedback({
        type: 'error',
        text: err?.message || 'Could not load users for this school.',
      });
    } finally {
      setLoadingUsers(false);
    }
  };

  useEffect(() => {
    if (isOpen && canManageUsers && tab === 'manage_users' && selectedSchoolId) {
      fetchSchoolUsers(selectedSchoolId);
    }
  }, [isOpen, canManageUsers, tab, selectedSchoolId]);

  // Existing local Staff & Students for quick login provisioning (only when viewing own active school)
  const isViewingActiveLocalSchool =
    Boolean(selectedSchoolId) &&
    (selectedSchoolId === saasSession?.school?.schoolId || selectedSchoolId === currentUser.schoolId);

  const unprovisionedStaff = useMemo(() => {
    if (!isViewingActiveLocalSchool) return [];
    return StorageService.getStaff().filter((s) => !s.authUid && s.role !== 'master_admin');
  }, [isViewingActiveLocalSchool, usersList]);

  const allLocalStudents = useMemo(() => {
    if (!isViewingActiveLocalSchool) return [];
    return StorageService.getStudents().filter((s) => s.status !== 'inactive');
  }, [isViewingActiveLocalSchool, usersList]);

  const unprovisionedStudents = useMemo(() => {
    if (!isViewingActiveLocalSchool) return [];
    return allLocalStudents.filter((s) => !s.authUid);
  }, [isViewingActiveLocalSchool, allLocalStudents]);

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    return usersList.filter((u) => {
      if (roleFilter !== 'all') {
        if (roleFilter === 'staff_group') {
          if (!['teacher', 'accountant', 'librarian', 'receptionist', 'gatekeeper', 'staff'].includes(u.schoolRole)) {
            return false;
          }
        } else if (u.schoolRole !== roleFilter) {
          return false;
        }
      }
      if (!q) return true;
      return (
        u.displayName.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.username && u.username.toLowerCase().includes(q)) ||
        u.schoolRole.toLowerCase().includes(q) ||
        (u.phone && u.phone.toLowerCase().includes(q)) ||
        (u.linkedStaffId && u.linkedStaffId.toLowerCase().includes(q)) ||
        (u.linkedStudentId && u.linkedStudentId.toLowerCase().includes(q))
      );
    });
  }, [usersList, userSearch, roleFilter]);

  if (!isOpen) return null;

  // =========================================================================
  // HANDLERS: MY ACCOUNT & PASSWORD
  // =========================================================================
  const handleSaveMyAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setMyFeedback(null);

    const cleanName = myDisplayName.trim();
    const rawEmail = currentUser.email || saasSession?.principal?.email || '';
    const rawUsername = saasSession?.principal?.username || currentUser.username || '';
    const baselineLoginId = isSyntheticAuthEmail(rawEmail)
      ? rawUsername || formatDisplayLoginId({ username: rawUsername, email: rawEmail })
      : rawEmail || rawUsername;
    const cleanLoginInput = myEmail.trim();
    const parsedLogin = validateLoginIdentifier(cleanLoginInput);
    const currentKey = normalizeLoginUsernameKey(baselineLoginId);
    const nextKey = parsedLogin.valid ? parsedLogin.normalizedKey : cleanLoginInput.toLowerCase();
    const emailChanged = Boolean(
      !isMaster &&
        baselineLoginId !== cleanLoginInput &&
        (nextKey !== currentKey || cleanLoginInput.toLowerCase() !== baselineLoginId.toLowerCase())
    );
    const wantsPasswordChange = Boolean(newPassword || confirmPassword);

    if (!cleanName) {
      setMyFeedback({
        type: 'error',
        text: language === 'bn' ? 'আপনার নাম খালি রাখা যাবে না।' : 'Display name cannot be empty.',
      });
      return;
    }

    if (!isMaster && !cleanLoginInput) {
      setMyFeedback({
        type: 'error',
        text:
          language === 'bn'
            ? 'লগইন ইমেইল, মোবাইল নম্বর বা ইউজারনেম খালি রাখা যাবে না।'
            : 'Login email, mobile number, or username cannot be empty.',
      });
      return;
    }

    if (emailChanged && !parsedLogin.valid) {
      setMyFeedback({
        type: 'error',
        text:
          (language === 'bn' ? parsedLogin.errorBn : parsedLogin.error) ||
          'Please enter a valid email, mobile number, or username.',
      });
      return;
    }

    if (wantsPasswordChange) {
      if (newPassword.length < 6) {
        setMyFeedback({
          type: 'error',
          text:
            language === 'bn'
              ? 'নতুন পাসওয়ার্ড কমপক্ষে 6 অক্ষরের হতে হবে।'
              : 'New password must be at least 6 characters.',
        });
        return;
      }
      if (newPassword !== confirmPassword) {
        setMyFeedback({
          type: 'error',
          text:
            language === 'bn'
              ? 'নতুন পাসওয়ার্ড ও কনফার্ম পাসওয়ার্ড মিলছে না।'
              : 'New password and confirm password do not match.',
        });
        return;
      }
    }

    setMySaving(true);
    try {
      // Reauthenticate if changing password or email on password-based account
      if ((wantsPasswordChange || emailChanged) && userHasPassword) {
        if (!currentPassword.trim()) {
          setMyFeedback({
            type: 'error',
            text:
              language === 'bn'
                ? 'ইমেইল বা পাসওয়ার্ড পরিবর্তনের জন্য আপনার বর্তমান পাসওয়ার্ড দিন।'
                : 'Please enter your current password to verify your identity.',
          });
          setMySaving(false);
          return;
        }
        try {
          await reauthenticateWithCurrentPassword(currentPassword);
        } catch (reauthErr: any) {
          setMyFeedback({
            type: 'error',
            text:
              reauthErr?.code === 'auth/wrong-password' || reauthErr?.code === 'auth/invalid-credential'
                ? language === 'bn'
                  ? 'বর্তমান পাসওয়ার্ডটি সঠিক নয়!'
                  : 'Current password is incorrect.'
                : reauthErr?.message || 'Re-authentication failed.',
          });
          setMySaving(false);
          return;
        }
      } else if (wantsPasswordChange && !userHasPassword) {
        // Google-only user adding a password credential: reauth with Google if needed
        try {
          await reauthenticateWithGoogleAccount();
        } catch {
          // If popup is blocked or unnecessary, proceed with backend Admin SDK update using verified Bearer token
        }
      }

      // If user already has password provider and wants password update, update Firebase client password natively too
      if (wantsPasswordChange && userHasPassword) {
        await updateFirebaseClientPassword(newPassword);
      }

      if (auth.currentUser && cleanName !== (auth.currentUser.displayName || '')) {
        await updateProfile(auth.currentUser, { displayName: cleanName }).catch(() => {});
      }

      // Update backend SaaS profile + Firebase Auth displayName/email (and password if Google-only user)
      let backendSynced = true;
      let syncedUser: { email: string; username?: string } | null = null;
      try {
        const updateRes = await SaaSApi.updateMyCredentials({
          displayName: cleanName,
          phone: myPhone.trim(),
          ...(emailChanged ? { email: parsedLogin.displayValue } : {}),
          ...(wantsPasswordChange ? { password: newPassword } : {}),
        });
        syncedUser = updateRes.user;
      } catch (apiErr: any) {
        const canClientHandle =
          isSaaSBackendUnavailableError(apiErr) &&
          !emailChanged &&
          (!wantsPasswordChange || userHasPassword);
        if (!canClientHandle) {
          if (isSaaSIamPermissionError(apiErr)) {
            throw new Error(
              language === 'bn'
                ? 'লগইন আইডি পরিবর্তন বা Google অ্যাকাউন্টে পাসওয়ার্ড সেট করতে Firebase প্রজেক্টে সার্ভারের IAM অনুমোদন (Cloud Datastore User, Firebase Authentication Admin, Service Usage Consumer) যুক্ত থাকতে হবে।'
                : 'Changing login ID or setting a password on a Google-only account requires Firebase IAM permissions on the server service account.'
            );
          }
          if (isSaaSBackendUnavailableError(apiErr)) {
            throw new Error(
              language === 'bn'
                ? isNetlifyHostingEnvironment(serverDiagnostics)
                  ? 'লগইন আইডি পরিবর্তন বা Google অ্যাকাউন্টে নতুন পাসওয়ার্ড সেট করার জন্য মূল সার্ভারে FIREBASE_SERVICE_ACCOUNT_JSON কনফিগার থাকতে হবে।'
                  : 'লগইন আইডি পরিবর্তন বা Google অ্যাকাউন্টে পাসওয়ার্ড সেট করতে ব্যাকএন্ড সার্ভারের সাথে সংযোগ প্রয়োজন।'
                : isNetlifyHostingEnvironment(serverDiagnostics)
                ? 'Changing login identifier or adding a password to a Google-only account requires FIREBASE_SERVICE_ACCOUNT_JSON configured on the server.'
                : 'Backend server is currently unavailable to update login identifier.'
            );
          }
          throw apiErr;
        }
        backendSynced = false;
      }

      // Keep local staff/student directory email/username in sync if matched
      if (emailChanged) {
        const nextEmailVal = syncedUser?.email || (parsedLogin.kind === 'email' ? parsedLogin.displayValue : rawEmail);
        const nextUsernameVal = syncedUser?.username;
        const staffList = StorageService.getStaff();
        const stMatch = staffList.find(
          (s) => s.authUid === currentUser.authUid || s.id === currentUser.linkedStaffId
        );
        if (stMatch) {
          StorageService.updateStaff({
            ...stMatch,
            email: nextEmailVal || stMatch.email,
            ...(nextUsernameVal ? { username: nextUsernameVal } : {}),
            nameEn: cleanName,
            phone: myPhone.trim() || stMatch.phone,
          });
        }
        const stuList = StorageService.getStudents();
        const stuMatch = stuList.find((st) => st.authUid === currentUser.authUid);
        if (stuMatch) {
          StorageService.updateStudent({
            ...stuMatch,
            email: nextEmailVal || stuMatch.email,
            ...(nextUsernameVal ? { username: nextUsernameVal } : {}),
            phone: myPhone.trim() || stuMatch.phone,
          });
        }
      }

      if (auth.currentUser) {
        await auth.currentUser.reload().catch(() => {});
      }
      await refreshSaasSession();

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setMyFeedback({
        type: 'success',
        text:
          language === 'bn'
            ? backendSynced
              ? 'আপনার একাউন্টের তথ্য ও পাসওয়ার্ড সফলভাবে আপডেট হয়েছে!'
              : 'আপনার নাম/পাসওয়ার্ড Firebase-এ সফলভাবে আপডেট হয়েছে!'
            : 'Your account profile and credentials have been updated successfully!',
      });
    } catch (err: any) {
      setMyFeedback({
        type: 'error',
        text: err?.message || 'Failed to update account credentials.',
      });
    } finally {
      setMySaving(false);
    }
  };

  // =========================================================================
  // HANDLERS: SCHOOL USERS MANAGER
  // =========================================================================
  const handleSelectQuickStaff = (staffId: string) => {
    if (!staffId) {
      setCreateForm((prev) => ({ ...prev, linkedStaffId: '' }));
      return;
    }
    const found = unprovisionedStaff.find((s) => s.id === staffId);
    if (!found) return;
    const schoolSlug = (selectedSchoolId || 'sch').toLowerCase();
    const suggestedEmail =
      found.email && found.email.includes('@')
        ? found.email
        : `${found.employeeId.toLowerCase().replace(/[^a-z0-9]/g, '')}@${schoolSlug}.smartschool.bd`;
    setCreateForm((prev) => ({
      ...prev,
      displayName: found.nameEn || found.nameBn,
      email: suggestedEmail,
      phone: found.phone || '',
      schoolRole: found.role === 'master_admin' ? 'teacher' : found.role || 'teacher',
      linkedStaffId: found.id,
      linkedStudentId: '',
    }));
  };

  const handleSelectQuickStudent = (studentDocId: string) => {
    if (!studentDocId) {
      setCreateForm((prev) => ({ ...prev, linkedStudentId: '' }));
      return;
    }
    const found = allLocalStudents.find((s) => s.id === studentDocId);
    if (!found) return;
    const schoolSlug = (selectedSchoolId || 'sch').toLowerCase();
    const isGuardianMode = createForm.schoolRole === 'guardian';
    const cleanSid = found.studentId.toLowerCase().replace(/[^a-z0-9]/g, '');
    const suggestedEmail = isGuardianMode
      ? `guardian.${cleanSid}@${schoolSlug}.smartschool.bd`
      : found.email && found.email.includes('@')
      ? found.email
      : `${cleanSid}@${schoolSlug}.smartschool.bd`;

    setCreateForm((prev) => ({
      ...prev,
      displayName: isGuardianMode
        ? found.guardianName || found.fatherNameEn || `${found.nameEn} (Guardian)`
        : found.nameEn || found.nameBn,
      email: suggestedEmail,
      phone: isGuardianMode
        ? found.guardianPhone || found.fatherPhone || found.phone || ''
        : found.phone || found.guardianPhone || '',
      schoolRole: isGuardianMode ? 'guardian' : 'student',
      linkedStudentId: found.id,
      linkedStaffId: '',
    }));
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setUsersFeedback(null);

    const parsedCreateLogin = validateLoginIdentifier(createForm.email);
    if (!createForm.displayName.trim() || !parsedCreateLogin.valid || createForm.password.length < 6) {
      setUsersFeedback({
        type: 'error',
        text:
          !parsedCreateLogin.valid && createForm.email.trim()
            ? (language === 'bn' ? parsedCreateLogin.errorBn : parsedCreateLogin.error) || 'Invalid login ID.'
            : language === 'bn'
            ? 'নাম, সঠিক ইমেইল/মোবাইল/ইউজারনেম এবং কমপক্ষে 6 অক্ষরের পাসওয়ার্ড দিন।'
            : 'Please provide full name, a valid email/mobile/username, and a password of at least 6 characters.',
      });
      return;
    }

    setCreatingUser(true);
    try {
      const res = await SaaSApi.provisionUser({
        displayName: createForm.displayName.trim(),
        email: parsedCreateLogin.displayValue,
        ...(parsedCreateLogin.kind !== 'email' ? { username: parsedCreateLogin.displayValue } : {}),
        password: createForm.password,
        schoolRole: createForm.schoolRole,
        schoolId: selectedSchoolId,
        phone: createForm.phone.trim() || parsedCreateLogin.normalizedPhone || undefined,
        linkedStaffId: createForm.linkedStaffId || undefined,
        linkedStudentId: createForm.linkedStudentId || undefined,
      });

      // Sync authUid & email back to local Staff/Student record ONLY when creating that staff/student's own account
      // (Never overwrite a student's own email/authUid when provisioning a Guardian account)
      if (isViewingActiveLocalSchool) {
        if (createForm.linkedStaffId) {
          const st = StorageService.getStaff().find((x) => x.id === createForm.linkedStaffId);
          if (st) {
            StorageService.updateStaff({
              ...st,
              authUid: res.user.uid,
              email: res.user.email,
              ...(res.user.username ? { username: res.user.username } : {}),
              authProvisionStatus: 'provisioned',
            });
          }
        }
        if (createForm.linkedStudentId && createForm.schoolRole === 'student') {
          const stu = StorageService.getStudents().find((x) => x.id === createForm.linkedStudentId);
          if (stu) {
            StorageService.updateStudent({
              ...stu,
              authUid: res.user.uid,
              email: res.user.email,
              ...(res.user.username ? { username: res.user.username } : {}),
            });
          }
        }
      }

      const createdDisplayId = formatDisplayLoginId(res.user);
      setUsersFeedback({
        type: 'success',
        text:
          language === 'bn'
            ? `নতুন লগইন একাউন্ট তৈরি হয়েছে: ${createdDisplayId}`
            : `Login account created for ${res.user.displayName} (${createdDisplayId}).`,
      });
      setShowCreateForm(false);
      setCreateForm({
        displayName: '',
        email: '',
        password: '',
        phone: '',
        schoolRole: 'teacher',
        linkedStaffId: '',
        linkedStudentId: '',
      });
      await fetchSchoolUsers(selectedSchoolId);
    } catch (err: any) {
      const msg = isSaaSIamPermissionError(err)
        ? language === 'bn'
          ? 'নতুন শিক্ষক/স্টাফ/শিক্ষার্থী একাউন্ট তৈরি করতে আপনার Firebase প্রজেক্টের IAM-এ সার্ভার সার্ভিস একাউন্টকে Cloud Datastore User, Firebase Authentication Admin এবং Service Usage Consumer রোল দিতে হবে।'
          : 'Creating school user logins requires Cloud Datastore User, Firebase Authentication Admin, and Service Usage Consumer IAM roles on your Firebase project.'
        : isSaaSBackendUnavailableError(err)
        ? language === 'bn'
          ? isNetlifyHostingEnvironment(serverDiagnostics)
            ? 'নতুন শিক্ষক/স্টাফ/শিক্ষার্থী লগইন তৈরি করতে মূল Node.js সার্ভারে FIREBASE_SERVICE_ACCOUNT_JSON কনফিগার থাকতে হবে।'
            : 'সার্ভারের সাথে সংযোগ পাওয়া যায়নি বা সার্ভার রিস্টার্ট হচ্ছে। কিছুক্ষণ পর আবার চেষ্টা করুন।'
          : isNetlifyHostingEnvironment(serverDiagnostics)
          ? 'Provisioning new school user logins requires FIREBASE_SERVICE_ACCOUNT_JSON configured on the Node.js server.'
          : 'Backend server is unavailable or restarting. Please try again in a moment.'
        : err?.message || 'Failed to create user login account.';
      setUsersFeedback({
        type: 'error',
        text: msg,
      });
    } finally {
      setCreatingUser(false);
    }
  };

  const handleOpenEditUser = (u: SaaSUserDTO) => {
    setEditingUser(u);
    const initialEditLogin = isSyntheticAuthEmail(u.email)
      ? u.username || formatDisplayLoginId(u)
      : u.email || u.username || '';
    setEditUserForm({
      displayName: u.displayName || '',
      email: initialEditLogin,
      phone: u.phone || '',
      schoolRole: u.schoolRole || 'teacher',
      linkedStudentId: u.linkedStudentId || '',
      newPassword: '',
    });
    setShowEditUserPass(false);
    setUsersFeedback(null);
  };

  const handleSaveEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setUsersFeedback(null);

    const parsedEditLogin = validateLoginIdentifier(editUserForm.email);
    if (!editUserForm.displayName.trim() || !parsedEditLogin.valid) {
      setUsersFeedback({
        type: 'error',
        text:
          !parsedEditLogin.valid && editUserForm.email.trim()
            ? (language === 'bn' ? parsedEditLogin.errorBn : parsedEditLogin.error) || 'Invalid login ID.'
            : language === 'bn'
            ? 'নাম এবং ইমেইল / মোবাইল / ইউজারনেম খালি রাখা যাবে না।'
            : 'Name and login identifier are required.',
      });
      return;
    }

    if (editUserForm.newPassword && editUserForm.newPassword.length < 6) {
      setUsersFeedback({
        type: 'error',
        text:
          language === 'bn'
            ? 'নতুন পাসওয়ার্ড কমপক্ষে 6 অক্ষরের হতে হবে।'
            : 'New password must be at least 6 characters.',
      });
      return;
    }

    setEditUserSaving(true);
    try {
      const nextLinkedStudentId =
        editUserForm.schoolRole === 'student' || editUserForm.schoolRole === 'guardian'
          ? editUserForm.linkedStudentId
          : editingUser.linkedStudentId;
      const res = await SaaSApi.updateUserCredentials(editingUser.uid, {
        displayName: editUserForm.displayName.trim(),
        email: parsedEditLogin.displayValue,
        phone: editUserForm.phone.trim(),
        schoolRole: editUserForm.schoolRole,
        ...(nextLinkedStudentId !== undefined ? { linkedStudentId: nextLinkedStudentId } : {}),
        ...(editUserForm.newPassword ? { password: editUserForm.newPassword } : {}),
      });

      // Keep local staff/student directory email/username synced if viewing same school
      if (isViewingActiveLocalSchool) {
        if (editingUser.linkedStaffId) {
          const st = StorageService.getStaff().find((x) => x.id === editingUser.linkedStaffId || x.authUid === editingUser.uid);
          if (st) {
            StorageService.updateStaff({
              ...st,
              email: res.user.email,
              username: res.user.username || st.username,
              nameEn: res.user.displayName,
              phone: res.user.phone || st.phone,
            });
          }
        }
        if ((nextLinkedStudentId || editingUser.linkedStudentId) && editUserForm.schoolRole === 'student') {
          const stu = StorageService.getStudents().find(
            (x) => x.id === (nextLinkedStudentId || editingUser.linkedStudentId) || x.authUid === editingUser.uid
          );
          if (stu) {
            StorageService.updateStudent({
              ...stu,
              email: res.user.email,
              username: res.user.username,
              phone: res.user.phone || stu.phone,
            });
          }
        }
      }

      const updatedDisplayId = formatDisplayLoginId(res.user);
      setEditingUser(null);
      setUsersFeedback({
        type: 'success',
        text:
          language === 'bn'
            ? `${res.user.displayName}-এর ইউজার (${updatedDisplayId}) ও পাসওয়ার্ড আপডেট হয়েছে!`
            : `Updated credentials for ${res.user.displayName} (${updatedDisplayId}).`,
      });
      await fetchSchoolUsers(selectedSchoolId);
    } catch (err: any) {
      const msg = isSaaSIamPermissionError(err)
        ? language === 'bn'
          ? 'অন্য ইউজারের তথ্য বা পাসওয়ার্ড পরিবর্তনের জন্য Firebase প্রজেক্টে IAM অনুমোদন (Cloud Datastore User, Firebase Authentication Admin, Service Usage Consumer) প্রয়োজন।'
          : 'Updating another user’s credentials requires Firebase project IAM permissions.'
        : isSaaSBackendUnavailableError(err)
        ? language === 'bn'
          ? isNetlifyHostingEnvironment(serverDiagnostics)
            ? 'অন্য ইউজারের তথ্য বা পাসওয়ার্ড পরিবর্তনের জন্য মূল সার্ভারে FIREBASE_SERVICE_ACCOUNT_JSON কনফিগার থাকতে হবে।'
            : 'ব্যাকএন্ড সার্ভারের সাথে সংযোগ পাওয়া যায়নি। কিছুক্ষণ পর আবার চেষ্টা করুন।'
          : isNetlifyHostingEnvironment(serverDiagnostics)
          ? 'Updating another user’s credentials requires FIREBASE_SERVICE_ACCOUNT_JSON configured on the server.'
          : 'Backend server is temporarily unavailable. Please retry in a moment.'
        : err?.message || 'Failed to update user credentials.';
      setUsersFeedback({
        type: 'error',
        text: msg,
      });
    } finally {
      setEditUserSaving(false);
    }
  };

  const handleToggleUserStatus = async (u: SaaSUserDTO) => {
    setUsersFeedback(null);
    try {
      const nextDisabled = u.status === 'active';
      await SaaSApi.setUserStatus(u.uid, nextDisabled);
      setUsersFeedback({
        type: 'success',
        text: nextDisabled
          ? `${u.displayName} login disabled.`
          : `${u.displayName} login enabled.`,
      });
      await fetchSchoolUsers(selectedSchoolId);
    } catch (err: any) {
      const msg = isSaaSIamPermissionError(err)
        ? language === 'bn'
          ? 'ইউজারের লগইন চালু/বন্ধ করতে Firebase প্রজেক্টে IAM অনুমোদন (Cloud Datastore User, Firebase Authentication Admin, Service Usage Consumer) প্রয়োজন।'
          : 'Toggling user login status requires Firebase project IAM permissions.'
        : isSaaSBackendUnavailableError(err)
        ? language === 'bn'
          ? isNetlifyHostingEnvironment(serverDiagnostics)
            ? 'ইউজারের লগইন চালু/বন্ধ করতে মূল সার্ভারে FIREBASE_SERVICE_ACCOUNT_JSON কনফিগার থাকতে হবে।'
            : 'ব্যাকএন্ড সার্ভারের সাথে সংযোগ পাওয়া যায়নি। কিছুক্ষণ পর আবার চেষ্টা করুন।'
          : isNetlifyHostingEnvironment(serverDiagnostics)
          ? 'Toggling user login status requires FIREBASE_SERVICE_ACCOUNT_JSON configured on the server.'
          : 'Backend server is temporarily unavailable. Please retry in a moment.'
        : err?.message || 'Failed to update user status.';
      setUsersFeedback({
        type: 'error',
        text: msg,
      });
    }
  };

  const handleConfirmDeleteUser = async (u: SaaSUserDTO) => {
    setUsersFeedback(null);
    setDeletingUid(u.uid);
    try {
      await SaaSApi.deleteUser(u.uid);

      // Unlink Firebase auth reference from local Staff or Student profile without deleting their directory record
      if (isViewingActiveLocalSchool) {
        const matchedStaff = StorageService.getStaff().find(
          (st) => st.authUid === u.uid || (u.linkedStaffId && st.id === u.linkedStaffId)
        );
        if (matchedStaff) {
          StorageService.updateStaff({
            ...matchedStaff,
            authUid: undefined,
            authProvisionStatus: undefined,
          });
        }
        if (u.schoolRole === 'student') {
          const matchedStudent = StorageService.getStudents().find(
            (stu) => stu.authUid === u.uid || (u.linkedStudentId && stu.id === u.linkedStudentId)
          );
          if (matchedStudent) {
            StorageService.updateStudent({
              ...matchedStudent,
              authUid: undefined,
            });
          }
        }
      }

      if (editingUser?.uid === u.uid) {
        setEditingUser(null);
      }
      setConfirmDeleteUser(null);
      setUsersFeedback({
        type: 'success',
        text:
          language === 'bn'
            ? `${u.displayName} (${u.email})-এর ইউজার ও পাসওয়ার্ড স্থায়ীভাবে মুছে ফেলা হয়েছে। সে আর লগইন করতে পারবে না।`
            : `Login credentials for ${u.displayName} (${u.email}) have been permanently deleted. They can no longer log in.`,
      });
      await fetchSchoolUsers(selectedSchoolId);
    } catch (err: any) {
      const msg = isSaaSIamPermissionError(err)
        ? language === 'bn'
          ? 'ইউজারের লগইন একাউন্ট মুছতে Firebase প্রজেক্টে IAM অনুমোদন (Cloud Datastore User, Firebase Authentication Admin, Service Usage Consumer) প্রয়োজন।'
          : 'Deleting another user’s login account requires Firebase project IAM permissions.'
        : isSaaSBackendUnavailableError(err)
        ? language === 'bn'
          ? isNetlifyHostingEnvironment(serverDiagnostics)
            ? 'ইউজারের লগইন একাউন্ট স্থায়ীভাবে মুছে ফেলতে মূল সার্ভারে FIREBASE_SERVICE_ACCOUNT_JSON কনফিগার থাকতে হবে।'
            : 'ব্যাকএন্ড সার্ভারের সাথে সংযোগ পাওয়া যায়নি। কিছুক্ষণ পর আবার চেষ্টা করুন।'
          : isNetlifyHostingEnvironment(serverDiagnostics)
          ? 'Permanently deleting another user’s login account requires FIREBASE_SERVICE_ACCOUNT_JSON configured on the server.'
          : 'Backend server is temporarily unavailable. Please retry in a moment.'
        : err?.message || 'Failed to delete user login.';
      setUsersFeedback({
        type: 'error',
        text: msg,
      });
    } finally {
      setDeletingUid(null);
    }
  };

  const handleCopyUserInfo = (u: SaaSUserDTO) => {
    const vaultCred = isMaster && u.schoolRole === 'super_admin' ? adminVaultCreds[u.uid] : undefined;
    const passwordLine =
      vaultCred?.hasStoredPassword && vaultCred.managedPassword
        ? `\nPassword: ${vaultCred.managedPassword}`
        : '';
    const displayLogin = formatDisplayLoginId(u);
    const extraEmail = u.username && !isSyntheticAuthEmail(u.email) && u.email ? `\nEmail: ${u.email}` : '';
    const text = `School ID: ${u.schoolId}\nName: ${u.displayName}\nRole: ${u.schoolRole}\nLogin ID: ${displayLogin}${extraEmail}${passwordLine}`;
    navigator.clipboard?.writeText(text).then(() => {
      setCopiedUid(u.uid);
      setTimeout(() => setCopiedUid(null), 2000);
    });
  };

  const getRoleLabel = (roleCode: string) => {
    if (roleCode === 'master_admin') return language === 'bn' ? 'মাস্টার অ্যাডমিন' : 'Master Admin';
    const found = ROLE_OPTIONS.find((r) => r.value === roleCode);
    return found ? (language === 'bn' ? found.labelBn : found.labelEn) : roleCode;
  };

  const availableRoleOptionsForActor = isMaster || activeRole === 'super_admin'
    ? ROLE_OPTIONS
    : ROLE_OPTIONS.filter((r) => r.value !== 'super_admin');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/65 backdrop-blur-xs">
      <div className="bg-white rounded-2xl max-w-3xl w-full text-xs text-slate-800 shadow-2xl border border-slate-200 max-h-[92vh] flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="px-4 sm:px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/70 shrink-0">
          <div className="flex items-center space-x-3 min-w-0">
            <div className="p-2.5 rounded-xl bg-blue-600 text-white shadow-xs shrink-0">
              <KeyRound className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="font-extrabold text-slate-900 text-sm sm:text-base truncate">
                {language === 'bn'
                  ? 'ইউজার, পাসওয়ার্ড ও একাউন্ট সিকিউরিটি'
                  : 'User Credentials & Password Center'}
              </h3>
              <p className="text-[11px] text-slate-500 truncate">
                {language === 'bn'
                  ? 'সকল রোল (মাস্টার অ্যাডমিন, স্কুল অ্যাডমিন, শিক্ষক, শিক্ষার্থী ও স্টাফ) নিজের লগইন তথ্য পরিবর্তন করতে পারবেন'
                  : 'Update your login email, display name, and password — plus admin user management'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close modal"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs (Visible when user has admin access) */}
        {canManageUsers && (
          <div className="px-4 sm:px-6 pt-3 pb-0 border-b border-slate-200 bg-white flex items-center gap-2 overflow-x-auto shrink-0">
            <button
              type="button"
              onClick={() => setTab('my_account')}
              className={`px-3.5 py-2.5 text-xs font-bold border-b-2 transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
                tab === 'my_account'
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              <User className="w-3.5 h-3.5" />
              <span>{language === 'bn' ? 'আমার একাউন্ট ও পাসওয়ার্ড' : 'My Account & Password'}</span>
            </button>
            <button
              type="button"
              onClick={() => setTab('manage_users')}
              className={`px-3.5 py-2.5 text-xs font-bold border-b-2 transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
                tab === 'manage_users'
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>
                {isMaster
                  ? language === 'bn'
                    ? 'সকল স্কুলের ইউজার ও পাসওয়ার্ড'
                    : 'All Schools Users & Passwords'
                  : language === 'bn'
                  ? 'স্কুল ইউজার (শিক্ষক/স্টাফ/শিক্ষার্থী)'
                  : 'School Users (Teachers/Staff/Students)'}
              </span>
            </button>
          </div>
        )}

        {/* Modal Body */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-5">
          {tab === 'my_account' && (
            <>
              {/* Active Identity Overview + Profile Photo Upload */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="relative w-14 h-14 rounded-full bg-purple-100 border-2 border-purple-200 flex items-center justify-center overflow-hidden shrink-0">
                    {currentUser.avatar ? (
                      <img
                        src={currentUser.avatar}
                        alt={currentUser.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-lg font-extrabold text-purple-700">
                        {currentUser.name.charAt(0)}
                      </span>
                    )}
                  </div>
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0" />
                      <span className="font-extrabold text-sm text-slate-900 truncate">
                        {currentUser.name}
                      </span>
                      <span className="text-[11px] font-bold text-blue-700 bg-blue-100/70 px-2 py-0.5 rounded">
                        {getRoleLabel(activeRole)}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-600 font-mono truncate">
                      {formatDisplayLoginId({
                        username: saasSession?.principal?.username || currentUser.username,
                        email: currentUser.email || saasSession?.principal?.email,
                      })}
                    </div>
                    <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span>
                        {isMaster
                          ? language === 'bn'
                            ? 'প্ল্যাটফর্ম মাস্টার একাউন্ট'
                            : 'Platform Master Account'
                          : `${saasSession?.school?.schoolName || 'School'} (${saasSession?.school?.schoolId || currentUser.schoolId || 'SaaS'})`}
                      </span>
                      <span>•</span>
                      <span>
                        {userHasPassword
                          ? language === 'bn'
                            ? 'পাসওয়ার্ড লগইন সক্রিয়'
                            : 'Password Login Active'
                          : language === 'bn'
                          ? 'Google লগইন একাউন্ট'
                          : 'Google Sign-In Account'}
                      </span>
                    </div>
                  </div>
                </div>
                {(activeRole === 'super_admin' || activeRole === 'master_admin' || activeRole === 'admin') && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <input
                      id={modalAvatarInputId}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        e.target.value = '';
                        if (!file || !file.type.startsWith('image/')) return;
                        setAvatarBusy(true);
                        setMyFeedback(null);
                        try {
                          let compressed = await compressImageToPassportSize(file, 240, 240, 0.8);
                          if (compressed.length > 150_000) {
                            compressed = await compressImageToPassportSize(file, 160, 160, 0.68);
                          }
                          await updateUserAvatar(compressed);
                          setMyFeedback({
                            type: 'success',
                            text:
                              language === 'bn'
                                ? 'প্রোফাইল ছবি সফলভাবে আপডেট হয়েছে!'
                                : 'Profile photo updated successfully!',
                          });
                        } catch (err: any) {
                          setMyFeedback({
                            type: 'error',
                            text: err?.message || 'Failed to save profile photo.',
                          });
                        } finally {
                          setAvatarBusy(false);
                        }
                      }}
                    />
                    <label
                      htmlFor={modalAvatarInputId}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold cursor-pointer transition-colors"
                    >
                      <Camera className="w-3.5 h-3.5" />
                      <span>
                        {avatarBusy
                          ? language === 'bn'
                            ? 'আপলোড হচ্ছে...'
                            : 'Saving...'
                          : currentUser.avatar
                          ? language === 'bn'
                            ? 'ছবি পরিবর্তন'
                            : 'Change Photo'
                          : language === 'bn'
                          ? 'ছবি আপলোড'
                          : 'Upload Photo'}
                      </span>
                    </label>
                    {currentUser.avatar && (
                      <button
                        type="button"
                        disabled={avatarBusy}
                        onClick={async () => {
                          setAvatarBusy(true);
                          try {
                            await updateUserAvatar('');
                          } finally {
                            setAvatarBusy(false);
                          }
                        }}
                        title={language === 'bn' ? 'ছবি মুছুন' : 'Remove Photo'}
                        className="p-1.5 rounded-lg border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                )}
              </div>

              {myFeedback && (
                <div
                  role="alert"
                  className={`p-3 rounded-xl border text-xs font-semibold flex items-start gap-2 ${
                    myFeedback.type === 'success'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : 'bg-rose-50 border-rose-200 text-rose-800'
                  }`}
                >
                  {myFeedback.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  )}
                  <span>{myFeedback.text}</span>
                </div>
              )}

              <form onSubmit={handleSaveMyAccount} className="space-y-4">
                {/* Name & Phone */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      {language === 'bn' ? 'আপনার নাম (Display Name) *' : 'Display Name *'}
                    </label>
                    <div className="relative">
                      <User className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                      <input
                        type="text"
                        required
                        value={myDisplayName}
                        onChange={(e) => setMyDisplayName(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      {language === 'bn' ? 'মোবাইল নম্বর' : 'Phone Number'}
                    </label>
                    <div className="relative">
                      <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                      <input
                        type="text"
                        value={myPhone}
                        onChange={(e) => setMyPhone(e.target.value)}
                        placeholder="+880 17..."
                        className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-xl text-xs font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* Login Email / Mobile / Username */}
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    {language === 'bn'
                      ? 'লগইন আইডি (ইমেইল / মোবাইল / যেকোনো নাম)'
                      : 'Login ID (Email, Mobile Number, or Username)'}
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      value={myEmail}
                      disabled={isMaster}
                      onChange={(e) => setMyEmail(e.target.value)}
                      placeholder={
                        language === 'bn'
                          ? 'user@school.edu.bd অথবা 017... অথবা নাম/নম্বর'
                          : 'Email, 017..., or any username'
                      }
                      className={`w-full pl-9 pr-3 py-2 border rounded-xl text-xs font-mono focus:outline-none ${
                        isMaster
                          ? 'bg-slate-100 border-slate-200 text-slate-500 cursor-not-allowed'
                          : 'bg-white border-slate-300 text-slate-900 focus:ring-2 focus:ring-blue-500'
                      }`}
                    />
                  </div>
                  {isMaster && (
                    <p className="text-[11px] text-slate-500 mt-1">
                      {language === 'bn'
                        ? '* মাস্টার অ্যাডমিনের মূল ইমেইল প্ল্যাটফর্ম সিকিউরিটির সাথে যুক্ত, তবে আপনি নিচ থেকে নাম এবং লগইন পাসওয়ার্ড পরিবর্তন বা সেট করতে পারবেন।'
                        : '* Master Admin primary email is bound to platform security, while name and password can be updated below.'}
                    </p>
                  )}
                </div>

                <div className="border-t border-slate-200 pt-4 space-y-3.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                      <Lock className="w-4 h-4 text-blue-600" />
                      <span>
                        {userHasPassword
                          ? language === 'bn'
                            ? 'পাসওয়ার্ড পরিবর্তন করুন (ঐচ্ছিক)'
                            : 'Change Password (Optional)'
                          : language === 'bn'
                          ? 'ইমেইল লগইনের জন্য পাসওয়ার্ড সেট করুন'
                          : 'Set Password for Email Login'}
                      </span>
                    </span>
                  </div>

                  {userHasPassword && (
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        {language === 'bn'
                          ? 'বর্তমান পাসওয়ার্ড (ইমেইল বা পাসওয়ার্ড পরিবর্তনে প্রয়োজন)'
                          : 'Current Password (required when updating email or password)'}
                      </label>
                      <div className="relative">
                        <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                        <input
                          type={showCurPass ? 'text' : 'password'}
                          value={currentPassword}
                          onChange={(e) => setCurrentPassword(e.target.value)}
                          placeholder="••••••••"
                          autoComplete="current-password"
                          className="w-full pl-9 pr-9 py-2 border border-slate-300 rounded-xl text-xs font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => setShowCurPass((p) => !p)}
                          className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-700 p-0.5"
                        >
                          {showCurPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        {language === 'bn' ? 'নতুন পাসওয়ার্ড (কমপক্ষে 6 অক্ষর)' : 'New Password (min 6 chars)'}
                      </label>
                      <div className="relative">
                        <input
                          type={showNewPass ? 'text' : 'password'}
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="••••••••"
                          autoComplete="new-password"
                          className="w-full pl-3 pr-9 py-2 border border-slate-300 rounded-xl text-xs font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => setShowNewPass((p) => !p)}
                          className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-700 p-0.5"
                        >
                          {showNewPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        {language === 'bn' ? 'নতুন পাসওয়ার্ড নিশ্চিত করুন' : 'Confirm New Password'}
                      </label>
                      <input
                        type={showNewPass ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="••••••••"
                        autoComplete="new-password"
                        className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 font-semibold hover:bg-slate-50 transition-colors"
                  >
                    {language === 'bn' ? 'বন্ধ করুন' : 'Close'}
                  </button>
                  <button
                    type="submit"
                    disabled={mySaving}
                    className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-xs transition-colors flex items-center gap-2 disabled:opacity-60"
                  >
                    {mySaving && (
                      <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    )}
                    <span>{language === 'bn' ? 'পরিবর্তন সংরক্ষণ করুন' : 'Save Changes'}</span>
                  </button>
                </div>
              </form>
            </>
          )}

          {tab === 'manage_users' && canManageUsers && (
            <>
              {/* School Selector (Master Admin) + Action Toolbar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                {isMaster ? (
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <Building2 className="w-4 h-4 text-blue-600 shrink-0" />
                    <select
                      value={selectedSchoolId}
                      onChange={(e) => {
                        setSelectedSchoolId(e.target.value);
                        setEditingUser(null);
                        setConfirmDeleteUser(null);
                      }}
                      className="w-full sm:max-w-xs px-3 py-2 border border-slate-300 rounded-xl text-xs font-bold text-slate-800 bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    >
                      {schools.length === 0 ? (
                        <option value="">
                          {language === 'bn' ? 'কোনো স্কুল পাওয়া যায়নি' : 'No schools registered'}
                        </option>
                      ) : (
                        schools.map((s) => (
                          <option key={s.schoolId} value={s.schoolId}>
                            {s.schoolId} — {s.schoolName}
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                ) : (
                  <div className="text-xs font-bold text-slate-800 flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-blue-600" />
                    <span>
                      {saasSession?.school?.schoolName || 'School'} ({selectedSchoolId})
                    </span>
                  </div>
                )}

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => selectedSchoolId && fetchSchoolUsers(selectedSchoolId)}
                    className="p-2 rounded-xl border border-slate-300 text-slate-600 hover:bg-slate-50"
                    title="Refresh users"
                  >
                    <RefreshCw className={`w-4 h-4 ${loadingUsers ? 'animate-spin' : ''}`} />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateForm((prev) => !prev);
                      setEditingUser(null);
                      setUsersFeedback(null);
                    }}
                    disabled={!selectedSchoolId}
                    className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs disabled:opacity-50"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>{language === 'bn' ? 'নতুন ইউজার তৈরি' : 'Add User Login'}</span>
                  </button>
                </div>
              </div>

              {serverAdminUnavailable && (
                <div className="p-3.5 rounded-xl border bg-amber-50 border-amber-300 text-amber-950 text-[11px] space-y-1.5 leading-relaxed">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <div className="font-extrabold">
                          {fallbackTriggerCode === 'ADMIN_CREDENTIAL_INVALID' ||
                          serverDiagnostics?.initStatus === 'invalid_credentials'
                            ? language === 'bn'
                              ? 'সার্ভারের Firebase সার্ভিস অ্যাকাউন্ট Key-টি বাতিল/ডিলিট করা হয়েছে বা অকার্যকর'
                              : 'Server Firebase Service Account Key Is Invalid or Revoked'
                            : fallbackTriggerCode === 'ADMIN_IAM_PERMISSION_DENIED'
                            ? language === 'bn'
                              ? 'Firebase প্রজেক্টে সার্ভারের IAM অনুমোদন এখনো সেট করা হয়নি'
                              : 'Firebase Project IAM Permissions Needed for Server User Provisioning'
                            : serverDiagnostics?.adminSdkReady
                            ? language === 'bn'
                              ? `সার্ভার সংযুক্ত আছে, তবে রিকোয়েস্টে সময় লেগেছে (${fallbackTriggerCode || 'TIMEOUT'})`
                              : `Server Admin SDK is ready, but loading timed out (${fallbackTriggerCode || 'TIMEOUT'})`
                            : (healthProbeError === 'NON_JSON_RESPONSE' || fallbackTriggerCode === 'NON_JSON_RESPONSE') &&
                              isNetlifyHostingEnvironment(serverDiagnostics)
                            ? language === 'bn'
                              ? 'Netlify Functions (/api/saas/*) পাওয়া যাচ্ছে না — শুধু স্ট্যাটিক ফোল্ডার ডিপ্লয় হয়েছে'
                              : 'Netlify Functions (/api/saas/*) returned HTML instead of API JSON'
                            : healthProbeError === 'NON_JSON_RESPONSE' || fallbackTriggerCode === 'NON_JSON_RESPONSE'
                            ? language === 'bn'
                              ? 'ব্যাকএন্ড সার্ভার সাময়িকভাবে রিস্টার্ট হচ্ছে বা সংযোগ পাচ্ছে না'
                              : 'Backend server is restarting or temporarily unreachable'
                            : serverDiagnostics?.initStatus === 'invalid_json'
                            ? language === 'bn'
                              ? 'সার্ভারের FIREBASE_SERVICE_ACCOUNT_JSON ফরম্যাটে ত্রুটি (invalid_json)'
                              : 'Server FIREBASE_SERVICE_ACCOUNT_JSON Parse Error'
                            : language === 'bn'
                            ? 'সার্ভারে Firebase Admin SDK প্রস্তুত না থাকায় নতুন ইউজার তৈরি, পাসওয়ার্ড পরিবর্তন বা লগইন চালু/বন্ধ করা যাচ্ছে না।'
                            : 'Server Firebase Admin SDK is not configured yet — creating users, changing another user’s password, or toggling logins is currently unavailable.'}
                        </div>
                        <p className="text-amber-900">
                          {fallbackTriggerCode === 'ADMIN_CREDENTIAL_INVALID' ||
                          serverDiagnostics?.initStatus === 'invalid_credentials'
                            ? language === 'bn'
                              ? 'Netlify/সার্ভারের FIREBASE_SERVICE_ACCOUNT_JSON-এ থাকা পুরনো Key-টি ডিলিট বা রিভোক করা হয়েছে। Firebase Console → Project settings → Service accounts থেকে নতুন JSON Key তৈরি করে Netlify-এর Environment Variables-এ আপডেট করুন এবং Clear cache and deploy site দিন।'
                              : 'The Service Account JSON key in FIREBASE_SERVICE_ACCOUNT_JSON was deleted or revoked. Generate a new JSON key in Firebase Console → Service accounts, update Netlify Environment Variables, and redeploy.'
                            : fallbackTriggerCode === 'ADMIN_IAM_PERMISSION_DENIED'
                            ? language === 'bn'
                              ? 'নতুন শিক্ষক/স্টাফ/শিক্ষার্থী লগইন তৈরি করতে Google Cloud IAM-এ সার্ভার সার্ভিস একাউন্টকে Cloud Datastore User, Firebase Authentication Admin এবং Service Usage Consumer রোল দিয়ে "আবার চেষ্টা" বাটনে চাপ দিন। শুধু নিজের পাসওয়ার্ড প্রথম ট্যাব ("আমার একাউন্ট ও পাসওয়ার্ড") থেকে বদলানো যাবে।'
                              : 'Grant Cloud Datastore User, Firebase Authentication Admin, and Service Usage Consumer to the server service account in Google Cloud IAM, then click Retry. You can still update your own password in the first tab.'
                            : serverDiagnostics?.adminSdkReady
                            ? language === 'bn'
                              ? 'সার্ভার চালু আছে — "আবার চেষ্টা" বাটনে চাপ দিয়ে ইউজার ও পাসওয়ার্ড লোড করুন।'
                              : 'Server is online — click Retry to load users and Super Admin vault credentials.'
                            : (healthProbeError === 'NON_JSON_RESPONSE' || fallbackTriggerCode === 'NON_JSON_RESPONSE') &&
                              isNetlifyHostingEnvironment(serverDiagnostics)
                            ? language === 'bn'
                              ? 'শুধু dist ফোল্ডার নয়, GitHub বা Netlify CLI দিয়ে পুরো প্রোজেক্ট (netlify/functions) ডিপ্লয় করুন।'
                              : 'Deploy the full project (including netlify/functions) via GitHub or Netlify CLI rather than static dist upload.'
                            : healthProbeError === 'NON_JSON_RESPONSE' || fallbackTriggerCode === 'NON_JSON_RESPONSE'
                            ? language === 'bn'
                              ? 'কয়েক সেকেন্ড অপেক্ষা করে "আবার চেষ্টা" বাটনে চাপ দিন।'
                              : 'Wait a few seconds and click Retry.'
                            : isNetlifyHostingEnvironment(serverDiagnostics)
                            ? language === 'bn'
                              ? 'সমাধান (Netlify): Site configuration → Environment variables-এ FIREBASE_SERVICE_ACCOUNT_JSON (অথবা FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY) যোগ করে Scopes = "All scopes" দিন এবং Deploys → "Clear cache and deploy site" করুন। শুধু নিজের পাসওয়ার্ড প্রথম ট্যাব ("আমার একাউন্ট ও পাসওয়ার্ড") থেকে বদলানো যাবে।'
                              : 'Fix on Netlify: Add FIREBASE_SERVICE_ACCOUNT_JSON (or split FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY) in Environment variables with Scope = "All scopes", then run "Clear cache and deploy site". You can still change your own password from the first tab.'
                            : language === 'bn'
                            ? 'ব্যাকএন্ড সার্ভারের Firebase Admin ক্রেডেনশিয়াল বা IAM অনুমোদন নিশ্চিত করে "আবার চেষ্টা" চাপুন। শুধু নিজের পাসওয়ার্ড প্রথম ট্যাব ("আমার একাউন্ট ও পাসওয়ার্ড") থেকে বদলানো যাবে।'
                            : 'Verify server Firebase Admin credentials/IAM permissions and click Retry. You can still update your own password from the first tab.'}
                        </p>
                      </div>
                    </div>
                    {selectedSchoolId && (
                      <button
                        type="button"
                        onClick={() => fetchSchoolUsers(selectedSchoolId)}
                        className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-[11px] shrink-0"
                      >
                        {language === 'bn' ? 'আবার চেষ্টা' : 'Retry'}
                      </button>
                    )}
                  </div>
                </div>
              )}

              {vaultFetchError && !serverAdminUnavailable && (
                <div className="p-3 rounded-xl border border-rose-200 bg-rose-50 text-rose-800 text-[11px] font-semibold flex items-center justify-between gap-2">
                  <span>{vaultFetchError}</span>
                  {selectedSchoolId && (
                    <button
                      type="button"
                      onClick={() => fetchSchoolUsers(selectedSchoolId)}
                      className="px-2 py-1 rounded bg-rose-600 text-white font-bold text-[10px] shrink-0"
                    >
                      {language === 'bn' ? 'আবার চেষ্টা' : 'Retry'}
                    </button>
                  )}
                </div>
              )}

              {usersFeedback && (
                <div
                  role="alert"
                  className={`p-3 rounded-xl border text-xs font-semibold flex items-start gap-2 ${
                    usersFeedback.type === 'success'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : 'bg-rose-50 border-rose-200 text-rose-800'
                  }`}
                >
                  {usersFeedback.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  )}
                  <span>{usersFeedback.text}</span>
                </div>
              )}

              {/* Create New School User Panel */}
              {showCreateForm && (
                <form
                  onSubmit={handleCreateUser}
                  className="p-4 rounded-xl bg-blue-50/60 border border-blue-200 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-blue-950 text-xs flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-blue-600" />
                      <span>
                        {language === 'bn'
                          ? `স্কুল (${selectedSchoolId}) এর জন্য নতুন লগইন একাউন্ট তৈরি`
                          : `Provision Firebase Login for ${selectedSchoolId}`}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowCreateForm(false)}
                      className="text-slate-500 hover:text-slate-800"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Quick link existing Staff or Student / Guardian's Child */}
                  {isViewingActiveLocalSchool && (unprovisionedStaff.length > 0 || allLocalStudents.length > 0) && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {unprovisionedStaff.length > 0 && (
                        <div>
                          <label className="block text-[11px] font-semibold text-blue-900 mb-1">
                            {language === 'bn' ? 'বিদ্যমান শিক্ষক/স্টাফ বাছাই (ঐচ্ছিক)' : 'Pick Existing Staff (Optional)'}
                          </label>
                          <SearchablePicker<Staff>
                            items={unprovisionedStaff}
                            value={createForm.linkedStaffId}
                            onChange={handleSelectQuickStaff}
                            getId={(s) => s.id}
                            filterItems={filterStaffByQuery}
                            getPrimaryLabel={(s) =>
                              `${s.employeeId} — ${s.nameBn || s.nameEn}${
                                s.nameBn && s.nameEn && s.nameBn !== s.nameEn ? ` (${s.nameEn})` : ''
                              }`
                            }
                            getBadgeText={(s) => getRoleLabel(s.role)}
                            getSecondaryLabel={(s) =>
                              [s.designation, s.phone, s.email].filter(Boolean).join(' • ')
                            }
                            placeholder={
                              language === 'bn'
                                ? 'নাম, আইডি, পদবি বা মোবাইল লিখে স্টাফ খুঁজুন...'
                                : 'Search staff by name, ID, role, or mobile...'
                            }
                            searchPlaceholder={
                              language === 'bn'
                                ? 'স্টাফের নাম, আইডি বা মোবাইল লিখুন...'
                                : 'Type staff name, ID, or mobile...'
                            }
                            language={language}
                            borderTone="blue"
                            resetKey={`create-staff-${isOpen}-${showCreateForm}-${selectedSchoolId}`}
                            ariaLabel={
                              language === 'bn' ? 'বিদ্যমান শিক্ষক/স্টাফ বাছাই' : 'Pick Existing Staff'
                            }
                          />
                        </div>
                      )}
                      {allLocalStudents.length > 0 && (
                        <div>
                          <label className="block text-[11px] font-semibold text-blue-900 mb-1">
                            {createForm.schoolRole === 'guardian'
                              ? language === 'bn'
                                ? 'অভিভাবকের সন্তান/শিক্ষার্থী বাছাই করুন *'
                                : 'Select Guardian’s Child (Student) *'
                              : language === 'bn'
                              ? 'বিদ্যমান শিক্ষার্থী বাছাই (ঐচ্ছিক)'
                              : 'Pick Existing Student (Optional)'}
                          </label>
                          <SearchablePicker<Student>
                            items={
                              createForm.schoolRole === 'guardian'
                                ? allLocalStudents
                                : unprovisionedStudents.length > 0
                                ? unprovisionedStudents
                                : allLocalStudents
                            }
                            value={createForm.linkedStudentId}
                            onChange={handleSelectQuickStudent}
                            getId={(st) => st.id}
                            filterItems={filterStudentsByQuery}
                            getPrimaryLabel={(st) =>
                              `${st.studentId} — ${st.nameBn || st.nameEn}${
                                st.nameBn && st.nameEn && st.nameBn !== st.nameEn ? ` (${st.nameEn})` : ''
                              }`
                            }
                            getBadgeText={(st) =>
                              `${st.className}${st.section ? ` (${st.section})` : ''}, ${
                                language === 'bn' ? 'রোল' : 'Roll'
                              } ${st.roll}`
                            }
                            getSecondaryLabel={(st) => {
                              const guardianText = st.guardianName || st.fatherNameBn || st.fatherNameEn;
                              const phoneText = st.phone || st.guardianPhone || st.fatherPhone;
                              return [
                                guardianText
                                  ? `${language === 'bn' ? 'অভিভাবক' : 'Guardian'}: ${guardianText}`
                                  : '',
                                phoneText || '',
                              ]
                                .filter(Boolean)
                                .join(' • ');
                            }}
                            placeholder={
                              language === 'bn'
                                ? 'নাম, আইডি, রোল, শ্রেণি বা মোবাইল লিখে খুঁজুন...'
                                : 'Search student by name, ID, roll, class, or mobile...'
                            }
                            searchPlaceholder={
                              language === 'bn'
                                ? 'শিক্ষার্থীর নাম, রোল, আইডি বা মোবাইল লিখুন...'
                                : 'Type student name, roll, ID, or mobile...'
                            }
                            language={language}
                            borderTone="blue"
                            resetKey={`create-student-${isOpen}-${showCreateForm}-${selectedSchoolId}`}
                            ariaLabel={
                              language === 'bn' ? 'শিক্ষার্থী বাছাই' : 'Select Student'
                            }
                          />
                        </div>
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        {language === 'bn' ? 'পূর্ণ নাম *' : 'Full Name *'}
                      </label>
                      <input
                        type="text"
                        required
                        value={createForm.displayName}
                        onChange={(e) => setCreateForm((p) => ({ ...p, displayName: e.target.value }))}
                        placeholder="e.g. Teacher / Guardian Name"
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        {language === 'bn' ? 'রোল / পদবি *' : 'Account Role *'}
                      </label>
                      <select
                        value={createForm.schoolRole}
                        onChange={(e) => {
                          const nextRole = e.target.value;
                          setCreateForm((p) => {
                            const updated = { ...p, schoolRole: nextRole };
                            if (nextRole === 'guardian' && p.linkedStudentId) {
                              const found = allLocalStudents.find((s) => s.id === p.linkedStudentId);
                              if (found) {
                                const schoolSlug = (selectedSchoolId || 'sch').toLowerCase();
                                const cleanSid = found.studentId.toLowerCase().replace(/[^a-z0-9]/g, '');
                                updated.displayName =
                                  found.guardianName || found.fatherNameEn || `${found.nameEn} (Guardian)`;
                                updated.phone = found.guardianPhone || found.fatherPhone || p.phone;
                                updated.email = `guardian.${cleanSid}@${schoolSlug}.smartschool.bd`;
                              }
                            }
                            return updated;
                          });
                        }}
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs font-semibold"
                      >
                        {availableRoleOptionsForActor.map((r) => (
                          <option key={r.value} value={r.value}>
                            {language === 'bn' ? `${r.labelBn} (${r.labelEn})` : r.labelEn}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        {language === 'bn'
                          ? 'লগইন আইডি (ইমেইল / মোবাইল / যেকোনো নাম) *'
                          : 'Login ID (Email, Mobile, or Username) *'}
                      </label>
                      <input
                        type="text"
                        required
                        value={createForm.email}
                        onChange={(e) => setCreateForm((p) => ({ ...p, email: e.target.value }))}
                        placeholder="user@school.edu.bd, 017..., or rahim01"
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        {language === 'bn' ? 'মোবাইল নম্বর (ঐচ্ছিক)' : 'Phone Number (Optional)'}
                      </label>
                      <input
                        type="text"
                        value={createForm.phone}
                        onChange={(e) => setCreateForm((p) => ({ ...p, phone: e.target.value }))}
                        placeholder="017XXXXXXXX"
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs font-mono"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block font-semibold text-slate-700 mb-1">
                        {language === 'bn' ? 'প্রাথমিক পাসওয়ার্ড (6+ অক্ষর) *' : 'Initial Password (6+ chars) *'}
                      </label>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          required
                          minLength={6}
                          value={createForm.password}
                          onChange={(e) => setCreateForm((p) => ({ ...p, password: e.target.value }))}
                          placeholder="Min 6 characters"
                          className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs font-mono"
                        />
                        <button
                          type="button"
                          onClick={() => setCreateForm((p) => ({ ...p, password: generateRandomPassword(8) }))}
                          className="px-2.5 py-2 rounded-lg bg-white border border-slate-300 text-[11px] font-bold text-blue-700 hover:bg-blue-50 whitespace-nowrap"
                        >
                          {language === 'bn' ? 'জেনারেট' : 'Auto'}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setShowCreateForm(false)}
                      className="px-3.5 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 font-semibold"
                    >
                      {language === 'bn' ? 'বাতিল' : 'Cancel'}
                    </button>
                    <button
                      type="submit"
                      disabled={creatingUser}
                      className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold disabled:opacity-60"
                    >
                      {creatingUser
                        ? language === 'bn'
                          ? 'তৈরি হচ্ছে...'
                          : 'Creating...'
                        : language === 'bn'
                        ? 'একাউন্ট তৈরি করুন'
                        : 'Create Account'}
                    </button>
                  </div>
                </form>
              )}

              {/* Edit User / Reset Password Drawer */}
              {editingUser && (
                <form
                  onSubmit={handleSaveEditUser}
                  className="p-4 rounded-xl bg-amber-50/70 border border-amber-200 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-amber-950 text-xs flex items-center gap-1.5">
                      <Edit2 className="w-4 h-4 text-amber-700" />
                      <span>
                        {language === 'bn'
                          ? `ইউজার তথ্য ও পাসওয়ার্ড পরিবর্তন: ${editingUser.displayName}`
                          : `Edit Credentials: ${editingUser.displayName}`}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setEditingUser(null)}
                      className="text-slate-500 hover:text-slate-800"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {isMaster && editingUser.schoolRole === 'super_admin' && (
                    <div className="p-2.5 rounded-lg bg-indigo-50 border border-indigo-200 text-[11px] flex flex-wrap items-center justify-between gap-2">
                      {adminVaultCreds[editingUser.uid]?.hasStoredPassword &&
                      adminVaultCreds[editingUser.uid]?.managedPassword ? (
                        <>
                          <div className="flex items-center gap-1.5 text-indigo-950">
                            <Lock className="w-3.5 h-3.5 text-indigo-600" />
                            <span className="font-semibold">
                              {language === 'bn' ? 'সংরক্ষিত সুপার অ্যাডমিন পাসওয়ার্ড:' : 'Saved Super Admin Password:'}
                            </span>
                            <span className="font-mono font-black bg-white px-2 py-0.5 rounded border border-indigo-200">
                              {revealedAdminUids[editingUser.uid]
                                ? adminVaultCreds[editingUser.uid].managedPassword
                                : '••••••••'}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                setRevealedAdminUids((prev) => ({
                                  ...prev,
                                  [editingUser.uid]: !prev[editingUser.uid],
                                }))
                              }
                              className="p-1 text-indigo-700 hover:text-indigo-950"
                            >
                              {revealedAdminUids[editingUser.uid] ? (
                                <EyeOff className="w-3.5 h-3.5" />
                              ) : (
                                <Eye className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleCopyUserInfo(editingUser)}
                            className="px-2 py-1 rounded bg-indigo-600 text-white font-bold text-[10px] inline-flex items-center gap-1"
                          >
                            {copiedUid === editingUser.uid ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                            <span>{copiedUid === editingUser.uid ? 'Copied' : 'Copy Email & Pass'}</span>
                          </button>
                        </>
                      ) : (
                        <div className="flex items-center gap-1.5 text-indigo-900">
                          <Lock className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                          <span>
                            {language === 'bn'
                              ? 'পুরোনো একাউন্ট হওয়ায় আগের পাসওয়ার্ড সংরক্ষিত ছিল না। নিচে একবার নতুন পাসওয়ার্ড সেভ করলেই মাস্টার অ্যাডমিন সবসময় দেখতে পারবেন।'
                              : 'Legacy account without a vaulted password yet. Saving a new password below will store it encrypted for Master Admin.'}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        {language === 'bn' ? 'নাম *' : 'Display Name *'}
                      </label>
                      <input
                        type="text"
                        required
                        value={editUserForm.displayName}
                        onChange={(e) => setEditUserForm((p) => ({ ...p, displayName: e.target.value }))}
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        {language === 'bn' ? 'রোল' : 'Role'}
                      </label>
                      <select
                        value={editUserForm.schoolRole}
                        onChange={(e) => setEditUserForm((p) => ({ ...p, schoolRole: e.target.value }))}
                        disabled={!isMaster && activeRole === 'admin' && editingUser.schoolRole === 'super_admin'}
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs font-semibold disabled:bg-slate-100"
                      >
                        {availableRoleOptionsForActor.map((r) => (
                          <option key={r.value} value={r.value}>
                            {language === 'bn' ? r.labelBn : r.labelEn}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        {language === 'bn'
                          ? 'লগইন আইডি (ইমেইল / মোবাইল / ইউজারনেম) *'
                          : 'Login ID (Email, Mobile, or Username) *'}
                      </label>
                      <input
                        type="text"
                        required
                        value={editUserForm.email}
                        onChange={(e) => setEditUserForm((p) => ({ ...p, email: e.target.value }))}
                        placeholder="user@school.edu.bd, 017..., or rahim01"
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        {language === 'bn' ? 'ফোন নম্বর' : 'Phone'}
                      </label>
                      <input
                        type="text"
                        value={editUserForm.phone}
                        onChange={(e) => setEditUserForm((p) => ({ ...p, phone: e.target.value }))}
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs font-mono"
                      />
                    </div>
                    {(editUserForm.schoolRole === 'student' || editUserForm.schoolRole === 'guardian') &&
                      isViewingActiveLocalSchool &&
                      allLocalStudents.length > 0 && (
                        <div className="sm:col-span-2">
                          <label className="block font-semibold text-slate-700 mb-1">
                            {language === 'bn' ? 'সংশ্লিষ্ট শিক্ষার্থী (Linked Student)' : 'Linked Student'}
                          </label>
                          <SearchablePicker<Student>
                            items={allLocalStudents}
                            value={editUserForm.linkedStudentId}
                            onChange={(id) => setEditUserForm((p) => ({ ...p, linkedStudentId: id }))}
                            getId={(st) => st.id}
                            filterItems={filterStudentsByQuery}
                            getPrimaryLabel={(st) =>
                              `${st.studentId} — ${st.nameBn || st.nameEn}${
                                st.nameBn && st.nameEn && st.nameBn !== st.nameEn ? ` (${st.nameEn})` : ''
                              }`
                            }
                            getBadgeText={(st) =>
                              `${st.className}${st.section ? ` (${st.section})` : ''}, ${
                                language === 'bn' ? 'রোল' : 'Roll'
                              } ${st.roll}`
                            }
                            getSecondaryLabel={(st) => {
                              const guardianText = st.guardianName || st.fatherNameBn || st.fatherNameEn;
                              const phoneText = st.phone || st.guardianPhone || st.fatherPhone;
                              return [
                                guardianText
                                  ? `${language === 'bn' ? 'অভিভাবক' : 'Guardian'}: ${guardianText}`
                                  : '',
                                phoneText || '',
                              ]
                                .filter(Boolean)
                                .join(' • ');
                            }}
                            placeholder={
                              language === 'bn'
                                ? 'নাম, আইডি, রোল, শ্রেণি বা মোবাইল লিখে খুঁজুন...'
                                : 'Search student by name, ID, roll, class, or mobile...'
                            }
                            searchPlaceholder={
                              language === 'bn'
                                ? 'শিক্ষার্থীর নাম, রোল, আইডি বা মোবাইল লিখুন...'
                                : 'Type student name, roll, ID, or mobile...'
                            }
                            language={language}
                            borderTone="slate"
                            resetKey={`edit-student-${isOpen}-${editingUser.uid}`}
                            ariaLabel={
                              language === 'bn' ? 'সংশ্লিষ্ট শিক্ষার্থী নির্বাচন' : 'Linked Student'
                            }
                          />
                        </div>
                      )}
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      {language === 'bn'
                        ? 'নতুন পাসওয়ার্ড (পরিবর্তন না চাইলে খালি রাখুন)'
                        : 'New Password (leave blank to keep current password)'}
                    </label>
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <input
                          type={showEditUserPass ? 'text' : 'password'}
                          value={editUserForm.newPassword}
                          onChange={(e) => setEditUserForm((p) => ({ ...p, newPassword: e.target.value }))}
                          placeholder={language === 'bn' ? 'কমপক্ষে 6 অক্ষরের নতুন পাসওয়ার্ড' : 'Min 6 characters'}
                          className="w-full pl-3 pr-9 py-2 rounded-lg border border-slate-300 bg-white text-xs font-mono"
                        />
                        <button
                          type="button"
                          onClick={() => setShowEditUserPass((p) => !p)}
                          className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-700"
                        >
                          {showEditUserPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setShowEditUserPass(true);
                          setEditUserForm((p) => ({ ...p, newPassword: generateRandomPassword(8) }));
                        }}
                        className="px-3 py-2 rounded-lg bg-white border border-slate-300 text-[11px] font-bold text-blue-700 hover:bg-blue-50 whitespace-nowrap"
                      >
                        {language === 'bn' ? 'অটো পাসওয়ার্ড' : 'Generate'}
                      </button>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setEditingUser(null)}
                      className="px-3.5 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 font-semibold"
                    >
                      {language === 'bn' ? 'বাতিল' : 'Cancel'}
                    </button>
                    <button
                      type="submit"
                      disabled={editUserSaving}
                      className="px-4 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold disabled:opacity-60"
                    >
                      {editUserSaving
                        ? language === 'bn'
                          ? 'সংরক্ষণ হচ্ছে...'
                          : 'Saving...'
                        : language === 'bn'
                        ? 'আপডেট সেভ করুন'
                        : 'Save Credentials'}
                    </button>
                  </div>
                </form>
              )}

              {/* Search & Role Filter */}
              <div className="flex flex-col sm:flex-row gap-2.5">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    placeholder={
                      language === 'bn'
                        ? 'নাম, ইমেইল, মোবাইল, ইউজারনেম বা রোল দিয়ে খুঁজুন...'
                        : 'Search by name, email, mobile, username, or role...'
                    }
                    className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  className="px-3 py-2 border border-slate-300 rounded-xl text-xs font-semibold bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  <option value="all">{language === 'bn' ? 'সকল রোল' : 'All Roles'}</option>
                  <option value="super_admin">{language === 'bn' ? 'সুপার অ্যাডমিন' : 'School Super Admin'}</option>
                  <option value="admin">{language === 'bn' ? 'প্রধান শিক্ষক / অ্যাডমিন' : 'Admin'}</option>
                  <option value="teacher">{language === 'bn' ? 'শিক্ষক' : 'Teachers'}</option>
                  <option value="staff_group">{language === 'bn' ? 'সকল স্টাফ ও কর্মচারী' : 'All Staff'}</option>
                  <option value="student">{language === 'bn' ? 'শিক্ষার্থী' : 'Students'}</option>
                  <option value="guardian">{language === 'bn' ? 'অভিভাবক' : 'Guardians'}</option>
                </select>
              </div>

              {/* Provisioned Users List */}
              {loadingUsers ? (
                <div className="py-10 text-center text-slate-500">
                  <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-blue-600" />
                  <span>{language === 'bn' ? 'ইউজার তালিকা লোড হচ্ছে...' : 'Loading school users...'}</span>
                </div>
              ) : filteredUsers.length === 0 ? (
                <div className="py-10 text-center bg-slate-50 rounded-xl border border-slate-200 text-slate-500">
                  <Users className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                  <p className="font-semibold">
                    {language === 'bn'
                      ? 'এই স্কুলে কোনো ইউজার একাউন্ট পাওয়া যায়নি।'
                      : 'No provisioned user accounts found for this filter.'}
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-slate-200 border border-slate-200 rounded-xl overflow-hidden bg-white">
                  {filteredUsers.map((u) => {
                    const isSelf = u.uid === currentUser.authUid || u.uid === currentUser.id;
                    const canDeleteThisUser =
                      !isSelf &&
                      u.schoolRole !== 'master_admin' &&
                      (isMaster ||
                        activeRole === 'super_admin' ||
                        (activeRole === 'admin' && u.schoolRole !== 'super_admin'));
                    const isConfirmingDelete = confirmDeleteUser?.uid === u.uid;
                    const isDeletingThis = deletingUid === u.uid;

                    return (
                      <div key={u.uid} className="hover:bg-slate-50/70 transition-colors">
                        <div className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="min-w-0 space-y-0.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-slate-900 text-xs truncate">
                                {u.displayName}
                              </span>
                              <span className="text-[11px] font-bold text-blue-700">
                                · {getRoleLabel(u.schoolRole)}
                              </span>
                              <span
                                className={`text-[11px] font-bold ${
                                  u.status === 'active' ? 'text-emerald-700' : 'text-rose-600'
                                }`}
                              >
                                · {u.status === 'active' ? (language === 'bn' ? 'সক্রিয়' : 'Active') : (language === 'bn' ? 'নিষ্ক্রিয়' : 'Disabled')}
                              </span>
                              {isSelf && (
                                <span className="text-[10px] font-bold text-slate-500">(You)</span>
                              )}
                            </div>
                            <div className="text-[11px] font-mono text-slate-600 truncate">
                              {formatDisplayLoginId(u)}
                              {u.username && !isSyntheticAuthEmail(u.email) && u.email ? ` (${u.email})` : ''}
                              {u.phone ? ` • ${u.phone}` : ''}
                              {u.linkedStudentId && (() => {
                                const stu = allLocalStudents.find((s) => s.id === u.linkedStudentId || s.studentId === u.linkedStudentId);
                                return stu ? ` • শিক্ষার্থী: ${stu.nameBn || stu.nameEn} (${stu.className}, রোল ${stu.roll})` : '';
                              })()}
                            </div>
                            {isMaster && u.schoolRole === 'super_admin' && (() => {
                              const vaultCred = adminVaultCreds[u.uid];
                              const isRevealed = Boolean(revealedAdminUids[u.uid]);
                              if (vaultCred?.hasStoredPassword && vaultCred.managedPassword) {
                                return (
                                  <div className="mt-1 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-indigo-50 border border-indigo-200 text-[11px] text-indigo-950">
                                    <Lock className="w-3 h-3 text-indigo-600 shrink-0" />
                                    <span className="font-semibold">
                                      {language === 'bn' ? 'পাসওয়ার্ড:' : 'Pass:'}
                                    </span>
                                    <span className="font-mono font-bold">
                                      {isRevealed ? vaultCred.managedPassword : '••••••••'}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setRevealedAdminUids((prev) => ({
                                          ...prev,
                                          [u.uid]: !prev[u.uid],
                                        }))
                                      }
                                      className="p-0.5 text-indigo-700 hover:text-indigo-950"
                                      title={isRevealed ? 'Hide password' : 'Show password'}
                                    >
                                      {isRevealed ? (
                                        <EyeOff className="w-3.5 h-3.5" />
                                      ) : (
                                        <Eye className="w-3.5 h-3.5" />
                                      )}
                                    </button>
                                  </div>
                                );
                              }
                              return (
                                <div className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-[10px] font-semibold text-amber-800">
                                  <Lock className="w-3 h-3 shrink-0" />
                                  <span>
                                    {serverAdminUnavailable
                                      ? language === 'bn'
                                        ? 'সার্ভার Admin SDK সংযোগ ছাড়া পাসওয়ার্ড পড়া যাবে না'
                                        : 'Server Admin SDK required to read vault password'
                                      : language === 'bn'
                                      ? 'পাসওয়ার্ড সংরক্ষিত নেই — "ইমেইল/পাসওয়ার্ড" থেকে নতুন পাসওয়ার্ড সেট করলে দেখতে পাবেন'
                                      : 'Password not vaulted yet — reset once via Edit / Pass'}
                                  </span>
                                </div>
                              );
                            })()}
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                            <button
                              type="button"
                              onClick={() => {
                                setConfirmDeleteUser(null);
                                handleOpenEditUser(u);
                              }}
                              className="px-2.5 py-1.5 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 text-[11px] font-bold flex items-center gap-1"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                              <span>{language === 'bn' ? 'ইমেইল/পাসওয়ার্ড' : 'Edit / Pass'}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleCopyUserInfo(u)}
                              title="Copy login details"
                              className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 text-[11px] font-semibold flex items-center gap-1"
                            >
                              {copiedUid === u.uid ? (
                                <Check className="w-3.5 h-3.5 text-emerald-600" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                              <span className="hidden md:inline">
                                {copiedUid === u.uid ? 'Copied' : 'Copy'}
                              </span>
                            </button>
                            {!isSelf && (
                              <button
                                type="button"
                                onClick={() => handleToggleUserStatus(u)}
                                title={u.status === 'active' ? 'Disable login' : 'Enable login'}
                                className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-bold flex items-center gap-1 ${
                                  u.status === 'active'
                                    ? 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100'
                                    : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                                }`}
                              >
                                {u.status === 'active' ? (
                                  <Ban className="w-3.5 h-3.5" />
                                ) : (
                                  <Unlock className="w-3.5 h-3.5" />
                                )}
                              </button>
                            )}
                            {canDeleteThisUser && (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteUser(isConfirmingDelete ? null : u)}
                                title={language === 'bn' ? 'ইউজার ও পাসওয়ার্ড ডিলিট করুন' : 'Delete user login'}
                                className="px-2.5 py-1.5 rounded-lg border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 text-[11px] font-bold flex items-center gap-1"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>{language === 'bn' ? 'ডিলিট' : 'Delete'}</span>
                              </button>
                            )}
                          </div>
                        </div>

                        {isConfirmingDelete && (
                          <div className="mx-3.5 mb-3.5 p-3 rounded-xl border border-rose-300 bg-rose-50 text-rose-950 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                            <div className="flex items-start gap-2 text-[11px] leading-relaxed">
                              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                              <span>
                                {language === 'bn' ? (
                                  <>
                                    আপনি কি নিশ্চিতভাবে <strong>{u.displayName}</strong> (<span className="font-mono">{formatDisplayLoginId(u)}</span>)-এর ইউজার ও পাসওয়ার্ড স্থায়ীভাবে মুছে ফেলতে চান? ডিলিট করলে সে আর লগইন করতে পারবে না।
                                  </>
                                ) : (
                                  <>
                                    Permanently delete login credentials for <strong>{u.displayName}</strong> (<span className="font-mono">{formatDisplayLoginId(u)}</span>)? They will no longer be able to log in.
                                  </>
                                )}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0 justify-end">
                              <button
                                type="button"
                                disabled={isDeletingThis}
                                onClick={() => setConfirmDeleteUser(null)}
                                className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 font-semibold hover:bg-slate-50 disabled:opacity-50"
                              >
                                {language === 'bn' ? 'বাতিল' : 'Cancel'}
                              </button>
                              <button
                                type="button"
                                disabled={isDeletingThis}
                                onClick={() => handleConfirmDeleteUser(u)}
                                className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold flex items-center gap-1.5 disabled:opacity-60"
                              >
                                {isDeletingThis && (
                                  <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                )}
                                <span>
                                  {isDeletingThis
                                    ? language === 'bn'
                                      ? 'মুছে ফেলা হচ্ছে...'
                                      : 'Deleting...'
                                    : language === 'bn'
                                    ? 'হ্যাঁ, ডিলিট করুন'
                                    : 'Confirm Delete'}
                                </span>
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
