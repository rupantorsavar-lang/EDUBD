import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { db, auth } from './firebase';
import { safeGetLocalStorage, safeSetLocalStorage, safeRemoveLocalStorage } from '../utils/storageHelper';
import {
  PURGEABLE_DATA_KEYS,
  sanitizeDemoArray,
  purgeAllDemoDataFromLocalStorage,
} from '../utils/demoPurge';

export const CLOUD_SYNC_COLLECTION = 'school_sync';
export const LAST_SYNC_KEY = 'school_erp_last_cloud_sync_time';
export const WORKSPACE_ID_KEY = 'school_erp_workspace_id';
export const SAAS_ACTIVE_SCHOOL_KEY = 'school_erp_active_saas_school_id';

const MAX_SINGLE_DOC_CHARS = 600000;
const CHUNK_CHAR_SIZE = 480000;

let activeSaaSSchoolId: string | null =
  typeof window !== 'undefined' ? safeGetLocalStorage(SAAS_ACTIVE_SCHOOL_KEY) : null;
let saasAccessAllowed = false;

/**
 * Resolves the active tenant ID. In Multi-Tenant SaaS mode, this strictly returns
 * the server-verified schoolId from Firebase Auth custom claims.
 */
export function getDomainTenantId(): string {
  if (activeSaaSSchoolId) {
    return activeSaaSSchoolId;
  }
  if (typeof window === 'undefined') return 'domain_default';

  const customWorkspace = safeGetLocalStorage(WORKSPACE_ID_KEY);
  if (customWorkspace && customWorkspace.trim()) {
    return `workspace_${customWorkspace.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_')}`;
  }

  const rawHost = window.location.hostname || 'localhost';
  let normalizedHost = rawHost.toLowerCase().trim();
  normalizedHost = normalizedHost.replace(/^www\./, '');
  normalizedHost = normalizedHost.replace(/^(ais-dev-|ais-pre-)/, 'ais-');
  normalizedHost = normalizedHost.replace(/^[a-z0-9_-]+--([a-z0-9-]+\.netlify\.app)$/, '$1');
  normalizedHost = normalizedHost.split(':')[0];

  const cleanHost = normalizedHost.replace(/[^a-z0-9_-]/g, '_');
  return `domain_${cleanHost}`;
}

export function getCustomWorkspaceId(): string {
  if (typeof window === 'undefined') return '';
  return safeGetLocalStorage(WORKSPACE_ID_KEY) || '';
}

export const getDeviceId = (): string => {
  if (typeof window === 'undefined') return 'server';
  let id = safeGetLocalStorage('school_erp_device_id');
  if (!id) {
    id = `dev_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    safeSetLocalStorage('school_erp_device_id', id);
  }
  return id;
};

export const DATA_SLICES = {
  profile: [
    'school_erp_profile',
    'school_erp_access_control',
    'school_erp_super_admin_creds',
    'school_erp_mfs_settings',
    'school_erp_website_messages',
    'school_erp_blog_posts',
    'school_erp_holidays',
    'school_erp_saturday_off',
  ],
  students: ['school_erp_students', 'school_erp_enquiries'],
  staff: ['school_erp_staff'],
  academics: [
    'school_erp_classes',
    'school_erp_subjects',
    'school_erp_routines',
    'school_erp_exams',
    'school_erp_exam_routines',
    'school_erp_exam_seat_plans',
    'school_routine_tiffin_time',
    'school_routine_tiffin_after',
  ],
  attendance: [
    'school_erp_attendance',
    'school_erp_attendance_rules',
    'school_erp_attendance_audit',
    'school_erp_marks',
  ],
  finance: [
    'school_erp_fee_heads',
    'school_erp_class_fees',
    'school_erp_scheduled_fees',
    'school_erp_student_transports',
    'school_erp_invoices',
    'school_erp_payments',
    'school_erp_expenses',
    'school_erp_income_vouchers',
    'school_erp_sale_items',
    'school_erp_staff_salaries',
    'school_erp_custom_class_fee_columns',
    'school_erp_hidden_class_fee_columns',
    'school_erp_transaction_security',
    'school_erp_homework',
    'school_erp_books',
    'school_erp_book_issues',
    'school_erp_routes',
    'school_erp_inventory',
    'school_erp_notices',
  ],
  homework_submissions: ['school_erp_homework_submissions'],
  online_payments: ['school_erp_online_payment_requests'],
};

export type SliceType = keyof typeof DATA_SLICES;
export const SYNCED_STORAGE_KEYS = Object.values(DATA_SLICES).flat();

export interface SyncStatus {
  isOnline: boolean;
  isSyncing: boolean;
  lastSyncedAt: string | null;
  hasCloudData: boolean;
  tenantId: string;
  domain: string;
  error?: string | null;
}

type SyncListener = (status: SyncStatus) => void;
const statusListeners = new Set<SyncListener>();

let currentStatus: SyncStatus = {
  isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
  isSyncing: false,
  lastSyncedAt: typeof window !== 'undefined' ? safeGetLocalStorage(LAST_SYNC_KEY) : null,
  hasCloudData: false,
  tenantId: typeof window !== 'undefined' ? getDomainTenantId() : 'domain_default',
  domain: typeof window !== 'undefined' ? window.location.hostname : 'localhost',
  error: null,
};

function notifyStatus(update: Partial<SyncStatus>) {
  currentStatus = { ...currentStatus, ...update };
  statusListeners.forEach((listener) => {
    try {
      listener(currentStatus);
    } catch {}
  });
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('cloud_sync_status_changed', { detail: currentStatus }));
  }
}

export function subscribeToSyncStatus(listener: SyncListener): () => void {
  statusListeners.add(listener);
  listener(currentStatus);
  return () => {
    statusListeners.delete(listener);
  };
}

export function getSyncStatus(): SyncStatus {
  return currentStatus;
}

let applyingDepth = 0;
let syncTimeout: any = null;
let hasCompletedInitialPull = false;
let lastPullSucceeded = false;
let activePullPromise: Promise<boolean> | null = null;
let lastFocusPullTime = 0;
let activeCleanup: (() => void) | null = null;
const ALL_SLICES = Object.keys(DATA_SLICES) as SliceType[];
const pulledSlices = new Set<SliceType>();
let pendingDemoCleanupPush = false;

function sanitizeSliceForCloudStorage(sliceData: Record<string, any>): Record<string, any> {
  const sanitized = { ...sliceData };

  // Never store plaintext staff passwords in Firestore
  if (Array.isArray(sanitized.school_erp_staff)) {
    sanitized.school_erp_staff = sanitized.school_erp_staff.map((st: any) => {
      if (st && typeof st === 'object') {
        const copy = { ...st };
        delete copy.password;
        return copy;
      }
      return st;
    });
  }

  // Never store plaintext super admin password in Firestore
  if (
    sanitized.school_erp_super_admin_creds &&
    typeof sanitized.school_erp_super_admin_creds === 'object'
  ) {
    const credsCopy = { ...sanitized.school_erp_super_admin_creds };
    delete credsCopy.password;
    sanitized.school_erp_super_admin_creds = credsCopy;
  }

  return sanitized;
}

function getSliceDocRef(schoolId: string, sliceName: string) {
  return doc(db, 'schools', schoolId, 'slices', sliceName);
}

function getSliceChunkDocRef(schoolId: string, sliceName: string, chunkIdx: number) {
  return doc(db, 'schools', schoolId, 'slices', `${sliceName}__c${chunkIdx}`);
}

function clearLocalTenantCache() {
  SYNCED_STORAGE_KEYS.forEach((k) => safeRemoveLocalStorage(k));
  (Object.keys(DATA_SLICES) as SliceType[]).forEach((s) => {
    safeRemoveLocalStorage(`school_erp_sync_${s}`);
  });
  safeRemoveLocalStorage(LAST_SYNC_KEY);
}

async function writeSliceDocWithChunking(
  schoolId: string,
  sliceName: string,
  rawSliceData: Record<string, any>,
  meta: { domain: string; deviceId: string; updatedAt: string; clientTimestamp: number }
): Promise<void> {
  const sliceData = sanitizeSliceForCloudStorage(rawSliceData);
  const mainDocRef = getSliceDocRef(schoolId, sliceName);
  const serialized = JSON.stringify(sliceData);

  if (serialized.length <= MAX_SINGLE_DOC_CHARS) {
    await setDoc(
      mainDocRef,
      {
        ...sliceData,
        __chunked: false,
        chunkCount: 0,
        slice: sliceName,
        schoolId,
        tenantId: schoolId,
        ...meta,
      },
      { merge: true }
    );
    return;
  }

  const chunks: string[] = [];
  for (let i = 0; i < serialized.length; i += CHUNK_CHAR_SIZE) {
    chunks.push(serialized.slice(i, i + CHUNK_CHAR_SIZE));
  }

  await Promise.all(
    chunks.map((chunkStr, idx) =>
      setDoc(getSliceChunkDocRef(schoolId, sliceName, idx), {
        slice: sliceName,
        schoolId,
        tenantId: schoolId,
        chunkIndex: idx,
        chunkCount: chunks.length,
        data: chunkStr,
        updatedAt: meta.updatedAt,
      })
    )
  );

  await setDoc(mainDocRef, {
    __chunked: true,
    chunkCount: chunks.length,
    slice: sliceName,
    schoolId,
    tenantId: schoolId,
    ...meta,
  });
}

async function resolveSliceDocData(
  schoolId: string,
  sliceName: string,
  docData: Record<string, any>
): Promise<Record<string, any>> {
  if (docData && docData.__chunked === true && Number(docData.chunkCount) > 0) {
    const count = Number(docData.chunkCount);
    const chunkSnaps = await Promise.all(
      Array.from({ length: count }, (_, idx) => getDoc(getSliceChunkDocRef(schoolId, sliceName, idx)))
    );
    let combined = '';
    for (let idx = 0; idx < chunkSnaps.length; idx++) {
      const snap = chunkSnaps[idx];
      if (!snap.exists()) {
        throw new Error(`Missing chunk ${idx + 1}/${count} for slice ${sliceName}`);
      }
      combined += snap.data()?.data || '';
    }
    if (!combined) {
      throw new Error(`Empty chunk payload for slice ${sliceName}`);
    }
    const parsed = JSON.parse(combined);
    return {
      ...parsed,
      updatedAt: docData.updatedAt,
      deviceId: docData.deviceId,
    };
  }
  return docData;
}

export const CloudSyncService = {
  /**
   * Configures the active SaaS school tenant from server-verified token claims.
   * Automatically clears previous school's cached data from localStorage when switching tenants
   * to prevent cross-school data leakage on shared browsers.
   */
  async setActiveSaaSTenant(
    schoolId: string | null,
    accessAllowed: boolean,
    options?: {
      prioritySlices?: SliceType[];
      backgroundRemainingPull?: boolean;
      priorityTimeoutMs?: number;
    }
  ): Promise<void> {
    if (syncTimeout) {
      clearTimeout(syncTimeout);
      syncTimeout = null;
    }
    if (activeCleanup) {
      activeCleanup();
      activeCleanup = null;
    }

    const prevSchoolId = safeGetLocalStorage(SAAS_ACTIVE_SCHOOL_KEY);
    const normalizedNew = schoolId ? schoolId.trim() : null;

    if (prevSchoolId && normalizedNew && prevSchoolId !== normalizedNew) {
      clearLocalTenantCache();
    } else if (!normalizedNew && prevSchoolId) {
      clearLocalTenantCache();
    }

    activeSaaSSchoolId = normalizedNew;
    saasAccessAllowed = Boolean(normalizedNew && accessAllowed);

    if (normalizedNew) {
      safeSetLocalStorage(SAAS_ACTIVE_SCHOOL_KEY, normalizedNew);
    } else {
      safeRemoveLocalStorage(SAAS_ACTIVE_SCHOOL_KEY);
    }

    hasCompletedInitialPull = false;
    lastPullSucceeded = false;
    pulledSlices.clear();
    pendingDemoCleanupPush = false;
    notifyStatus({
      tenantId: normalizedNew || getDomainTenantId(),
      error: null,
    });

    if (saasAccessAllowed) {
      const priority = options?.prioritySlices;
      if (priority && priority.length > 0) {
        const priorityUnique = Array.from(new Set(priority));
        const remaining = ALL_SLICES.filter((s) => !priorityUnique.includes(s));
        const timeoutMs = options?.priorityTimeoutMs ?? 4000;
        const priorityPull = this.pullFromCloud(priorityUnique);

        await Promise.race([
          priorityPull.catch(() => false),
          new Promise<boolean>((resolve) => setTimeout(() => resolve(false), timeoutMs)),
        ]);

        if (activeSaaSSchoolId !== normalizedNew || !saasAccessAllowed) {
          return;
        }

        this.reinitialize({ skipInitialPull: true });

        if (options?.backgroundRemainingPull !== false && remaining.length > 0) {
          void (async () => {
            await priorityPull.catch(() => false);
            if (activeSaaSSchoolId !== normalizedNew || !saasAccessAllowed) return;
            await this.pullFromCloud(remaining).catch(() => false);
          })();
        }
      } else {
        await this.pullFromCloud();
        this.reinitialize({ skipInitialPull: true });
      }
    }
  },

  clearTenantSession(): void {
    if (syncTimeout) {
      clearTimeout(syncTimeout);
      syncTimeout = null;
    }
    activeSaaSSchoolId = null;
    saasAccessAllowed = false;
    hasCompletedInitialPull = false;
    lastPullSucceeded = false;
    pulledSlices.clear();
    pendingDemoCleanupPush = false;
    safeRemoveLocalStorage(SAAS_ACTIVE_SCHOOL_KEY);
    clearLocalTenantCache();
    if (activeCleanup) {
      activeCleanup();
      activeCleanup = null;
    }
  },

  getSlicePayload(keys: string[]): Record<string, any> {
    const payload: Record<string, any> = {};
    for (const key of keys) {
      const raw = safeGetLocalStorage(key);
      if (raw !== null) {
        try {
          payload[key] = JSON.parse(raw);
        } catch {
          payload[key] = raw;
        }
      }
    }
    return payload;
  },

  applySnapshotToLocal(
    data: Record<string, any>,
    serverTimestamp?: string,
    onDemoStripped?: () => void
  ): boolean {
    applyingDepth++;
    try {
      let changed = false;
      let profileUpdated = false;
      let credsUpdated = false;
      let saturdayUpdated = false;
      let homeworkSubmissionsUpdated = false;
      let onlinePaymentsUpdated = false;
      let newlyArrivedPendingPayments: any[] = [];
      let strippedAnyDemo = false;

      let validExamIds = new Set<string>();
      const rawExamsCandidate = data['school_erp_exams'];
      if (Array.isArray(rawExamsCandidate)) {
        const examSanitized = sanitizeDemoArray('school_erp_exams', rawExamsCandidate);
        validExamIds = new Set(
          examSanitized.cleaned.map((e: any) => String(e?.id || '')).filter(Boolean)
        );
      } else {
        try {
          const localExamsRaw = safeGetLocalStorage('school_erp_exams');
          if (localExamsRaw) {
            const parsedLocalExams = JSON.parse(localExamsRaw);
            if (Array.isArray(parsedLocalExams)) {
              validExamIds = new Set(
                parsedLocalExams.map((e: any) => String(e?.id || '')).filter(Boolean)
              );
            }
          }
        } catch {}
      }

      for (const [key, value] of Object.entries(data)) {
        if (
          key === 'updatedAt' ||
          key === 'clientTimestamp' ||
          key === 'deviceId' ||
          key === 'tenantId' ||
          key === 'schoolId' ||
          key === 'domain' ||
          key === 'slice' ||
          key === '__chunked' ||
          key === 'chunkCount' ||
          key === 'migratedFrom' ||
          key === 'migratedAt'
        ) {
          continue;
        }
        if (SYNCED_STORAGE_KEYS.includes(key) && value !== undefined) {
          // Do not overwrite dedicated online_payments slice with legacy finance copy once synced
          if (
            key === 'school_erp_online_payment_requests' &&
            data.slice === 'finance' &&
            safeGetLocalStorage('school_erp_sync_online_payments')
          ) {
            continue;
          }
          // Do not overwrite dedicated homework_submissions slice with legacy finance copy once synced
          if (
            key === 'school_erp_homework_submissions' &&
            data.slice === 'finance' &&
            safeGetLocalStorage('school_erp_sync_homework_submissions')
          ) {
            continue;
          }

          let finalValue = value;
          if (Array.isArray(value) && PURGEABLE_DATA_KEYS.includes(key)) {
            const sanitized = sanitizeDemoArray(
              key,
              value,
              key === 'school_erp_exam_routines' ? validExamIds : undefined
            );
            finalValue = sanitized.cleaned;
            if (sanitized.changed) {
              strippedAnyDemo = true;
            }
          }
          const stringified = typeof finalValue === 'string' ? finalValue : JSON.stringify(finalValue);
          const current = safeGetLocalStorage(key);
          if (current !== stringified) {
            if (key === 'school_erp_online_payment_requests' && Array.isArray(finalValue)) {
              let prevIds = new Set<string>();
              try {
                const prevParsed = current ? JSON.parse(current) : [];
                if (Array.isArray(prevParsed)) {
                  prevIds = new Set(prevParsed.map((r: any) => String(r?.id || '')).filter(Boolean));
                }
              } catch {}
              newlyArrivedPendingPayments = finalValue.filter(
                (r: any) => r && r.status === 'pending' && r.id && !prevIds.has(String(r.id))
              );
              onlinePaymentsUpdated = true;
            }
            if (key === 'school_erp_homework_submissions') {
              homeworkSubmissionsUpdated = true;
            }
            safeSetLocalStorage(key, stringified);
            changed = true;
            if (key === 'school_erp_profile') profileUpdated = true;
            if (key === 'school_erp_super_admin_creds') credsUpdated = true;
            if (key === 'school_erp_saturday_off') saturdayUpdated = true;
          }
        }
      }

      if (strippedAnyDemo && onDemoStripped) {
        onDemoStripped();
      }

      const syncTime = serverTimestamp || new Date().toISOString();
      safeSetLocalStorage(LAST_SYNC_KEY, syncTime);
      notifyStatus({
        isSyncing: false,
        lastSyncedAt: syncTime,
        hasCloudData: true,
        tenantId: getDomainTenantId(),
        domain: typeof window !== 'undefined' ? window.location.hostname : 'localhost',
        error: null,
      });

      if (changed && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('school_cloud_data_synced', { detail: { syncTime } }));
        if (homeworkSubmissionsUpdated) {
          try {
            const rawSubs = safeGetLocalStorage('school_erp_homework_submissions');
            const parsedSubs = rawSubs ? JSON.parse(rawSubs) : [];
            window.dispatchEvent(new CustomEvent('homework_submissions_updated', { detail: parsedSubs }));
          } catch {}
        }
        if (onlinePaymentsUpdated) {
          try {
            const rawOnline = safeGetLocalStorage('school_erp_online_payment_requests');
            const parsedOnline = rawOnline ? JSON.parse(rawOnline) : [];
            window.dispatchEvent(new CustomEvent('online_payments_updated', { detail: parsedOnline }));
            if (
              newlyArrivedPendingPayments.length > 0 &&
              (hasCompletedInitialPull || data.deviceId === 'server_online_payment')
            ) {
              const totalPending = Array.isArray(parsedOnline)
                ? parsedOnline.filter((r: any) => r?.status === 'pending').length
                : newlyArrivedPendingPayments.length;
              window.dispatchEvent(
                new CustomEvent('new_online_payment_notification', {
                  detail: {
                    newRequests: newlyArrivedPendingPayments,
                    totalPending,
                  },
                })
              );
            }
          } catch {}
        }
        if (profileUpdated) {
          try {
            const rawProfile = safeGetLocalStorage('school_erp_profile');
            const parsed = rawProfile ? JSON.parse(rawProfile) : null;
            if (parsed && (parsed.nameEn || parsed.nameBn)) {
              window.dispatchEvent(new CustomEvent('school_profile_updated', { detail: parsed }));
            }
          } catch {}
        }
        if (credsUpdated) {
          try {
            const rawCreds = safeGetLocalStorage('school_erp_super_admin_creds');
            const parsed = rawCreds ? JSON.parse(rawCreds) : null;
            window.dispatchEvent(new CustomEvent('super_admin_creds_updated', { detail: parsed }));
          } catch {}
        }
        if (saturdayUpdated) {
          try {
            const rawSat = safeGetLocalStorage('school_erp_saturday_off');
            window.dispatchEvent(
              new CustomEvent('saturday_off_toggled', { detail: { isSaturdayOff: rawSat === 'true' } })
            );
          } catch {}
        }
      }

      return changed;
    } finally {
      applyingDepth = Math.max(0, applyingDepth - 1);
    }
  },

  async pushSliceToCloud(sliceName: SliceType, force: boolean = true): Promise<boolean> {
    if (applyingDepth > 0) return false;
    if (!auth.currentUser || !activeSaaSSchoolId || !saasAccessAllowed) {
      return false;
    }
    if (activePullPromise && !pulledSlices.has(sliceName)) {
      await activePullPromise.catch(() => false);
    }
    if ((!hasCompletedInitialPull || !lastPullSucceeded) && !pulledSlices.has(sliceName)) {
      if (!force) {
        return false;
      }
      const pulled = await this.pullFromCloud([sliceName]);
      if (!pulled) {
        return false;
      }
    }

    const schoolId = activeSaaSSchoolId;
    try {
      const keys = DATA_SLICES[sliceName];
      const sliceData = this.getSlicePayload(keys);
      if (Object.keys(sliceData).length === 0) {
        return false;
      }

      const timestamp = new Date().toISOString();
      const myDeviceId = getDeviceId();
      const domain = typeof window !== 'undefined' ? window.location.hostname : 'localhost';

      await writeSliceDocWithChunking(schoolId, sliceName, sliceData, {
        domain,
        deviceId: myDeviceId,
        updatedAt: timestamp,
        clientTimestamp: Date.now(),
      });

      safeSetLocalStorage(`school_erp_sync_${sliceName}`, timestamp);
      safeSetLocalStorage(LAST_SYNC_KEY, timestamp);
      notifyStatus({
        isSyncing: false,
        lastSyncedAt: timestamp,
        hasCloudData: true,
        tenantId: schoolId,
        error: null,
      });
      return true;
    } catch (err: any) {
      console.warn(`[CloudSync] pushSliceToCloud failed for ${schoolId}/${sliceName}:`, err);
      notifyStatus({
        isSyncing: false,
        error: err?.message || `Cloud sync failed for ${sliceName}`,
      });
      return false;
    }
  },

  async pushLocalToCloud(force: boolean = false): Promise<boolean> {
    if (applyingDepth > 0 && !force) return false;
    if (!auth.currentUser || !activeSaaSSchoolId || !saasAccessAllowed) {
      return false;
    }
    if (activePullPromise) {
      await activePullPromise.catch(() => false);
    }
    if (!hasCompletedInitialPull || !lastPullSucceeded) {
      if (!force) {
        return false;
      }
      const pulled = await this.pullFromCloud();
      if (!pulled) {
        return false;
      }
    }

    const schoolId = activeSaaSSchoolId;
    notifyStatus({ isSyncing: true, error: null, tenantId: schoolId });
    try {
      const timestamp = new Date().toISOString();
      const myDeviceId = getDeviceId();
      const domain = typeof window !== 'undefined' ? window.location.hostname : 'localhost';

      const sliceEntries = Object.entries(DATA_SLICES);
      await Promise.all(
        sliceEntries.map(async ([sliceName, keys]) => {
          const sliceData = this.getSlicePayload(keys);
          if (Object.keys(sliceData).length === 0) {
            return;
          }
          await writeSliceDocWithChunking(schoolId, sliceName, sliceData, {
            domain,
            deviceId: myDeviceId,
            updatedAt: timestamp,
            clientTimestamp: Date.now(),
          });
          safeSetLocalStorage(`school_erp_sync_${sliceName}`, timestamp);
        })
      );

      safeSetLocalStorage(LAST_SYNC_KEY, timestamp);
      notifyStatus({
        isSyncing: false,
        lastSyncedAt: timestamp,
        hasCloudData: true,
        tenantId: schoolId,
        error: null,
      });
      return true;
    } catch (err: any) {
      console.warn(`[CloudSync] Push to Firestore failed for ${schoolId}:`, err);
      notifyStatus({
        isSyncing: false,
        error: err?.message || 'Cloud sync upload failed',
      });
      return false;
    }
  },

  async pullFromCloud(targetSlices?: SliceType[]): Promise<boolean> {
    if (!auth.currentUser || !activeSaaSSchoolId || !saasAccessAllowed) {
      return false;
    }
    if (activePullPromise && !targetSlices) return activePullPromise;
    if (activePullPromise && targetSlices) {
      await activePullPromise.catch(() => false);
    }

    let runPull!: Promise<boolean>;
    runPull = (async () => {
      const schoolId = activeSaaSSchoolId!;
      notifyStatus({ isSyncing: true, error: null, tenantId: schoolId });
      try {
        let hasAnyCloudData = false;
        const sliceNames = (
          targetSlices && targetSlices.length > 0 ? targetSlices : ALL_SLICES
        ) as SliceType[];

        const snaps = await Promise.all(
          sliceNames.map(async (sliceName) => {
            const docRef = getSliceDocRef(schoolId, sliceName);
            const snap = await getDoc(docRef);
            return { sliceName, snap };
          })
        );

        // Resolve any chunked slices in parallel instead of sequentially
        const resolvedEntries = await Promise.all(
          snaps.map(async ({ sliceName, snap }) => {
            if (!snap.exists()) {
              return { sliceName, exists: false as const, rawCloudData: null, resolvedData: null };
            }
            const rawCloudData = snap.data();
            const resolvedData = await resolveSliceDocData(schoolId, sliceName, rawCloudData);
            return { sliceName, exists: true as const, rawCloudData, resolvedData };
          })
        );

        for (const entry of resolvedEntries) {
          pulledSlices.add(entry.sliceName);
          if (entry.exists && entry.resolvedData) {
            hasAnyCloudData = true;
            this.applySnapshotToLocal(entry.resolvedData, entry.rawCloudData.updatedAt, () => {
              pendingDemoCleanupPush = true;
            });
            safeSetLocalStorage(`school_erp_sync_${entry.sliceName}`, entry.rawCloudData.updatedAt || '');
          }
        }

        const allSlicesCovered = ALL_SLICES.every((s) => pulledSlices.has(s));

        if (!hasAnyCloudData && allSlicesCovered) {
          purgeAllDemoDataFromLocalStorage();
          hasCompletedInitialPull = true;
          lastPullSucceeded = true;
          notifyStatus({ isSyncing: false, hasCloudData: false, tenantId: schoolId, error: null });
          return true;
        }

        if (allSlicesCovered) {
          const localPurgeRes = purgeAllDemoDataFromLocalStorage();
          hasCompletedInitialPull = true;
          lastPullSucceeded = true;

          if (pendingDemoCleanupPush || localPurgeRes.changed) {
            pendingDemoCleanupPush = false;
            void this.pushLocalToCloud(true).catch(() => {});
            if (typeof window !== 'undefined') {
              window.dispatchEvent(
                new CustomEvent('school_cloud_data_synced', { detail: { syncTime: new Date().toISOString() } })
              );
            }
          }
        } else {
          notifyStatus({ isSyncing: false, hasCloudData: hasAnyCloudData || currentStatus.hasCloudData, tenantId: schoolId, error: null });
        }

        return true;
      } catch (err: any) {
        console.warn(`[CloudSync] Pull from Firestore failed for ${schoolId}:`, err);
        lastPullSucceeded = false;
        notifyStatus({
          isSyncing: false,
          error: err?.message || 'Could not fetch from cloud database',
        });
        return false;
      } finally {
        if (activePullPromise === runPull) {
          activePullPromise = null;
        }
      }
    })();

    activePullPromise = runPull;
    return runPull;
  },

  async syncBidirectional(): Promise<boolean> {
    if (!auth.currentUser || !activeSaaSSchoolId || !saasAccessAllowed) {
      return false;
    }
    const pulled = await this.pullFromCloud();
    if (!pulled) {
      return false;
    }
    const pushed = await this.pushLocalToCloud(true);
    return pulled && pushed;
  },

  async setCustomWorkspaceId(workspaceId: string): Promise<void> {
    const trimmed = workspaceId.trim();
    if (trimmed) {
      safeSetLocalStorage(WORKSPACE_ID_KEY, trimmed);
    } else {
      safeRemoveLocalStorage(WORKSPACE_ID_KEY);
    }
    notifyStatus({ tenantId: getDomainTenantId() });
  },

  scheduleCloudSync(delayMs: number = 350): void {
    if (applyingDepth > 0) return;
    if (!hasCompletedInitialPull || !lastPullSucceeded) return;
    if (!auth.currentUser || !activeSaaSSchoolId || !saasAccessAllowed) return;
    if (syncTimeout) clearTimeout(syncTimeout);
    syncTimeout = setTimeout(() => {
      this.pushLocalToCloud(false);
    }, delayMs);
  },

  reinitialize(options?: { skipInitialPull?: boolean }): () => void {
    if (activeCleanup) {
      activeCleanup();
      activeCleanup = null;
    }
    return this.initialize(options);
  },

  initialize(options?: { skipInitialPull?: boolean }): () => void {
    if (activeCleanup) {
      return activeCleanup;
    }

    if (!auth.currentUser || !activeSaaSSchoolId || !saasAccessAllowed) {
      return () => {};
    }

    const schoolId = activeSaaSSchoolId;
    const myDeviceId = getDeviceId();
    const unsubscribers: (() => void)[] = [];

    if (!options?.skipInitialPull) {
      this.pullFromCloud().catch(() => {});
    }

    const sliceNames = Object.keys(DATA_SLICES) as SliceType[];
    sliceNames.forEach((sliceName) => {
      try {
        const docRef = getSliceDocRef(schoolId, sliceName);
        const unsub = onSnapshot(
          docRef,
          async (snap: any) => {
            if (!snap.exists()) return;
            const data = snap.data();
            const cloudTime = data.updatedAt || '';
            const sliceSyncKey = `school_erp_sync_${sliceName}`;
            const lastSliceTime = safeGetLocalStorage(sliceSyncKey) || '';
            const incomingDeviceId = data.deviceId || '';

            if (incomingDeviceId !== myDeviceId && cloudTime && cloudTime !== lastSliceTime) {
              try {
                const resolvedData = await resolveSliceDocData(schoolId, sliceName, data);
                this.applySnapshotToLocal(resolvedData, cloudTime);
                safeSetLocalStorage(sliceSyncKey, cloudTime);
                hasCompletedInitialPull = true;
                lastPullSucceeded = true;
              } catch (resolveErr) {
                console.warn(`[CloudSync] Failed resolving snapshot for ${schoolId}/${sliceName}:`, resolveErr);
              }
            }
          },
          (err: any) => {
            console.warn(`[CloudSync] Real-time listener error for ${schoolId}/${sliceName}:`, err);
          }
        );
        unsubscribers.push(unsub);
      } catch (e) {
        console.warn(`[CloudSync] Could not set up onSnapshot listener for ${sliceName}:`, e);
      }
    });

    const throttledPull = () => {
      const now = Date.now();
      if (now - lastFocusPullTime > 4000) {
        lastFocusPullTime = now;
        this.pullFromCloud().catch(() => {});
      }
    };

    const handleOnline = () => {
      notifyStatus({ isOnline: true });
      this.pullFromCloud().catch(() => {});
    };
    const handleOffline = () => {
      notifyStatus({ isOnline: false });
    };
    const handleVisibilityChange = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        throttledPull();
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
      window.addEventListener('focus', throttledPull);
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    const cleanup = () => {
      unsubscribers.forEach((u) => u());
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
        window.removeEventListener('focus', throttledPull);
      }
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
      activeCleanup = null;
    };

    activeCleanup = cleanup;
    return cleanup;
  },
};
