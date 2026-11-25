import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  initializeAuth,
  inMemoryPersistence,
  browserSessionPersistence,
  setPersistence,
  browserPopupRedirectResolver,
  GoogleAuthProvider,
  EmailAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  updatePassword,
  signOut,
  User,
} from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import {
  clearFailedOriginValidationCache,
  isExpectedAuthWarningCode,
} from '../utils/firebaseAuthErrors';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const currentUser = auth?.currentUser;
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: currentUser?.uid,
      email: currentUser?.email,
      emailVerified: currentUser?.emailVerified,
      isAnonymous: currentUser?.isAnonymous,
      tenantId: currentUser?.tenantId,
      providerInfo:
        currentUser?.providerData?.map((provider: any) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.warn('Firestore Error: ', JSON.stringify(errInfo));
  return errInfo;
}

const GOOGLE_REDIRECT_PENDING_KEY = 'smartschool_google_redirect_pending';

export function isEmbeddedIframe(): boolean {
  try {
    return typeof window !== 'undefined' && window.self !== window.top;
  } catch {
    return true;
  }
}

export function isMobileBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(
    navigator.userAgent
  );
}

export function markGoogleRedirectPending(pending: boolean): void {
  try {
    if (pending) {
      sessionStorage.setItem(GOOGLE_REDIRECT_PENDING_KEY, '1');
    } else {
      sessionStorage.removeItem(GOOGLE_REDIRECT_PENDING_KEY);
    }
  } catch {
    // Ignore storage failures in restricted third-party iframes
  }
}

export function isGoogleRedirectPending(): boolean {
  try {
    return sessionStorage.getItem(GOOGLE_REDIRECT_PENDING_KEY) === '1';
  } catch {
    return false;
  }
}

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
// Use browserSessionPersistence so redirect OAuth works within the active tab while still isolating fresh browser tabs
export const auth = (() => {
  try {
    return initializeAuth(app, {
      persistence: [browserSessionPersistence, inMemoryPersistence],
      popupRedirectResolver: browserPopupRedirectResolver,
    });
  } catch {
    const existingAuth = getAuth(app);
    setPersistence(existingAuth, browserSessionPersistence).catch(() => {
      setPersistence(existingAuth, inMemoryPersistence).catch(() => {});
    });
    return existingAuth;
  }
})();
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });
// CRITICAL: Must pass firestoreDatabaseId as required by skill guidelines
export const db = getFirestore(app, (firebaseConfig as any).firestoreDatabaseId);

let originValidationNeedsReset = false;

function resetPopupOriginValidationCache(): void {
  clearFailedOriginValidationCache([
    browserPopupRedirectResolver as any,
    (auth as any)?._popupRedirectResolver,
  ]);
  originValidationNeedsReset = false;
}

function assertBrowserOnlineForAuth(): void {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    const offlineErr: any = new Error('Firebase: Error (auth/network-request-failed).');
    offlineErr.code = 'auth/network-request-failed';
    throw offlineErr;
  }
}

export async function testConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('Firebase client is offline or starting up.');
      return false;
    }
    return true;
  }
}

export async function loginWithFirebaseEmail(email: string, password: string) {
  assertBrowserOnlineForAuth();
  return await signInWithEmailAndPassword(auth, email.trim(), password);
}

export async function loginWithGoogle() {
  assertBrowserOnlineForAuth();
  if (originValidationNeedsReset) {
    resetPopupOriginValidationCache();
  }
  try {
    return await signInWithPopup(auth, googleProvider);
  } catch (err: any) {
    const code = err?.code || '';
    if (code === 'auth/network-request-failed' || code === 'auth/internal-error') {
      resetPopupOriginValidationCache();
      originValidationNeedsReset = true;
    }
    if (isExpectedAuthWarningCode(code)) {
      console.warn('Google Sign-In interrupted:', code, err?.message || '');
    } else {
      console.error('Google Sign In Error:', err);
    }
    throw err;
  }
}

export async function loginWithGoogleRedirect() {
  assertBrowserOnlineForAuth();
  if (originValidationNeedsReset) {
    resetPopupOriginValidationCache();
  }
  markGoogleRedirectPending(true);
  try {
    await signInWithRedirect(auth, googleProvider);
  } catch (err: any) {
    markGoogleRedirectPending(false);
    if (err?.code === 'auth/network-request-failed' || err?.code === 'auth/internal-error') {
      resetPopupOriginValidationCache();
      originValidationNeedsReset = true;
    }
    throw err;
  }
}

export async function completeGoogleRedirectLogin() {
  try {
    return await getRedirectResult(auth);
  } catch (err: any) {
    if (isExpectedAuthWarningCode(err?.code)) {
      console.warn('Google Redirect Result interrupted:', err?.code, err?.message || '');
    } else {
      console.error('Google Redirect Result Error:', err);
    }
    throw err;
  }
}

export async function getFreshIdToken(forceRefresh = false): Promise<string | null> {
  const user = auth.currentUser;
  if (!user) return null;
  return await user.getIdToken(forceRefresh);
}

export async function resetFirebasePassword(email: string) {
  assertBrowserOnlineForAuth();
  return await sendPasswordResetEmail(auth, email.trim());
}

export function hasPasswordProvider(user: User | null): boolean {
  return Boolean(user?.providerData?.some((p) => p.providerId === 'password'));
}

export async function reauthenticateWithCurrentPassword(currentPassword: string): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.email) {
    throw new Error('No authenticated email session found.');
  }
  const cred = EmailAuthProvider.credential(user.email, currentPassword);
  await reauthenticateWithCredential(user, cred);
}

export async function reauthenticateWithGoogleAccount(): Promise<void> {
  assertBrowserOnlineForAuth();
  if (originValidationNeedsReset) {
    resetPopupOriginValidationCache();
  }
  const user = auth.currentUser;
  if (!user) {
    throw new Error('No authenticated user session found.');
  }
  try {
    await reauthenticateWithPopup(user, googleProvider);
  } catch (err: any) {
    if (err?.code === 'auth/network-request-failed' || err?.code === 'auth/internal-error') {
      resetPopupOriginValidationCache();
      originValidationNeedsReset = true;
    }
    throw err;
  }
}

export async function updateFirebaseClientPassword(newPassword: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('No authenticated user session found.');
  }
  await updatePassword(user, newPassword);
}

export async function logoutUser() {
  return await signOut(auth);
}
