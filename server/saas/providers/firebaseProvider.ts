import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeApp, getApps, getApp, cert, applicationDefault, App } from 'firebase-admin/app';
import { getAuth, Auth } from 'firebase-admin/auth';
import { getFirestore, Firestore, Timestamp } from 'firebase-admin/firestore';
import bundledAppletConfig from '../../../firebase-applet-config.json';
import {
  AuthPrincipal,
  AuthProviderInterface,
  CustomClaimsPayload,
  DEFAULT_SUBSCRIPTION_PLANS,
  DatabaseProviderInterface,
  MasterAdminVaultRecord,
  PlatformPaymentChannels,
  SaaSPaymentRequest,
  SaaSRole,
  SaaSServiceError,
  SaaSUserRecord,
  SchoolTenantRecord,
  SubscriptionHistoryRecord,
  SubscriptionPlanConfig,
  SubscriptionPlanId,
  SupportMessageRecord,
  SupportTicketRecord,
  SupportVideoRecord,
  TransactionContext,
  getDefaultPlatformPaymentChannels,
} from '../types';
import {
  normalizeLoginUsernameKey,
  normalizePhoneNumber,
} from '../../../src/utils/loginIdentifier';

function getSafeDirname(): string {
  try {
    if (typeof import.meta !== 'undefined' && import.meta.url) {
      return path.dirname(fileURLToPath(import.meta.url));
    }
  } catch {
    // Fallback for CJS-bundled serverless functions
  }
  return process.cwd();
}

const SAFE_DIRNAME = getSafeDirname();

interface FirebaseAppletConfig {
  projectId: string;
  apiKey?: string;
  firestoreDatabaseId?: string;
}

function loadAppletConfig(): FirebaseAppletConfig {
  const candidates = [
    path.resolve(process.cwd(), 'firebase-applet-config.json'),
    ...(process.env.LAMBDA_TASK_ROOT
      ? [path.resolve(process.env.LAMBDA_TASK_ROOT, 'firebase-applet-config.json')]
      : []),
    path.resolve(SAFE_DIRNAME, 'firebase-applet-config.json'),
    path.resolve(SAFE_DIRNAME, '../firebase-applet-config.json'),
    path.resolve(SAFE_DIRNAME, '../../firebase-applet-config.json'),
    path.resolve(SAFE_DIRNAME, '../../../firebase-applet-config.json'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return JSON.parse(fs.readFileSync(candidate, 'utf-8'));
    }
  }
  const fallback = bundledAppletConfig as Partial<FirebaseAppletConfig>;
  return {
    projectId: process.env.FIREBASE_PROJECT_ID || fallback.projectId || '',
    apiKey: process.env.FIREBASE_WEB_API_KEY || fallback.apiKey || '',
    firestoreDatabaseId: process.env.FIRESTORE_DATABASE_ID || fallback.firestoreDatabaseId || '(default)',
  };
}

let cachedApp: App | null = null;
let adminInitError: string | null = null;
let adminInitStatus: 'ok' | 'missing_credentials' | 'invalid_json' | 'missing_fields' | 'invalid_credentials' | 'init_error' = 'missing_credentials';
let adminAuthMode: 'service_account' | 'adc' | 'none' = 'none';

function stripWrappingQuotesAndFences(raw: string): string {
  let value = raw.replace(/^\uFEFF/, '').trim();
  if (value.startsWith('```')) {
    value = value.replace(/^```[a-zA-Z]*\r?\n?/, '').replace(/\r?\n?```$/, '').trim();
  }
  if (
    (value.startsWith("'") && value.endsWith("'")) ||
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith('`') && value.endsWith('`'))
  ) {
    value = value.slice(1, -1).trim();
  }
  return value;
}

function escapeLiteralNewlinesInJsonStrings(jsonText: string): string {
  let out = '';
  let inString = false;
  let escaped = false;
  for (let i = 0; i < jsonText.length; i++) {
    const ch = jsonText[i];
    if (escaped) {
      out += ch;
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      out += ch;
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      out += ch;
      continue;
    }
    if (inString && (ch === '\n' || ch === '\r')) {
      if (ch === '\r' && jsonText[i + 1] === '\n') {
        i++;
      }
      out += '\\n';
      continue;
    }
    out += ch;
  }
  return out;
}

export function parseServiceAccountFromEnv(rawValue: string): Record<string, any> | null {
  let trimmed = stripWrappingQuotesAndFences(rawValue);
  if (!trimmed) return null;

  let jsonText = trimmed;
  if (!jsonText.startsWith('{') && !jsonText.startsWith('"{')) {
    try {
      const decoded = Buffer.from(trimmed, 'base64').toString('utf-8').trim();
      if (decoded.startsWith('{')) {
        jsonText = decoded;
      }
    } catch {
      // ignore base64 decode failure
    }
  }

  let parsed: any;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    try {
      parsed = JSON.parse(escapeLiteralNewlinesInJsonStrings(jsonText));
    } catch {
      // Handle env var pasted with escaped quotes like {\"type\":...}
      const unescapedQuotes = jsonText.replace(/\\"/g, '"');
      parsed = JSON.parse(escapeLiteralNewlinesInJsonStrings(unescapedQuotes));
    }
  }

  // Handle double-JSON-encoded string ("{\"type\":...}")
  if (typeof parsed === 'string') {
    parsed = JSON.parse(escapeLiteralNewlinesInJsonStrings(parsed.trim()));
  }

  if (!parsed || typeof parsed !== 'object') return null;
  if (typeof parsed.private_key === 'string') {
    parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
  }
  return parsed;
}

function resolvePrivateKeyFromEnv(rawKey?: string, rawBase64Key?: string): string {
  const direct = rawKey ? stripWrappingQuotesAndFences(rawKey) : '';
  if (direct) {
    return direct.replace(/\\n/g, '\n');
  }
  const b64 = rawBase64Key ? stripWrappingQuotesAndFences(rawBase64Key) : '';
  if (b64) {
    return Buffer.from(b64, 'base64').toString('utf-8').replace(/\\n/g, '\n');
  }
  return '';
}

function getRawServiceAccountEnv(): string {
  return (
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON ||
    process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 ||
    process.env.FIREBASE_SERVICE_ACCOUNT ||
    process.env.FIREBASE_ADMIN_CREDENTIALS ||
    ''
  );
}

function getAdminApp(): { app: App | null; config: FirebaseAppletConfig; hasCredentials: boolean } {
  const config = loadAppletConfig();
  if (cachedApp) {
    adminInitStatus = 'ok';
    return { app: cachedApp, config, hasCredentials: true };
  }
  if (getApps().length > 0) {
    cachedApp = getApp();
    adminInitStatus = 'ok';
    if (adminAuthMode === 'none') {
      adminAuthMode = 'adc';
    }
    return { app: cachedApp, config, hasCredentials: true };
  }

  const isNetlifyRuntime = Boolean(
    process.env.NETLIFY === 'true' ||
      process.env.VERCEL ||
      process.env.AWS_LAMBDA_FUNCTION_NAME ||
      process.env.LAMBDA_TASK_ROOT
  );
  const isTestEnv = Boolean(process.env.VITEST || process.env.NODE_ENV === 'test');
  const hasValidProjectId = Boolean(config.projectId && !/remixed/i.test(config.projectId));

  try {
    const serviceAccountJson = getRawServiceAccountEnv();
    if (serviceAccountJson && serviceAccountJson.trim()) {
      let parsed: Record<string, any> | null = null;
      try {
        parsed = parseServiceAccountFromEnv(serviceAccountJson);
      } catch (parseErr: any) {
        adminInitStatus = 'invalid_json';
        adminInitError = `FIREBASE_SERVICE_ACCOUNT_JSON is present on the server but could not be parsed as valid JSON (${parseErr?.message || 'parse error'}).`;
        return { app: null, config, hasCredentials: false };
      }
      if (parsed?.client_email && parsed?.private_key) {
        cachedApp = initializeApp({
          credential: cert(parsed),
          projectId: parsed.project_id || config.projectId,
        });
        adminInitStatus = 'ok';
        adminAuthMode = 'service_account';
        adminInitError = null;
        return { app: cachedApp, config, hasCredentials: true };
      }
      adminInitStatus = 'missing_fields';
      adminInitError = 'FIREBASE_SERVICE_ACCOUNT_JSON was parsed but is missing client_email or private_key.';
      return { app: null, config, hasCredentials: false };
    }

    // Alternative split env vars (useful if hosting UI limits single-var formatting)
    const envClientEmail = stripWrappingQuotesAndFences(process.env.FIREBASE_CLIENT_EMAIL || '');
    const envPrivateKey = resolvePrivateKeyFromEnv(
      process.env.FIREBASE_PRIVATE_KEY,
      process.env.FIREBASE_PRIVATE_KEY_BASE64
    );
    const envProjectId = (process.env.FIREBASE_PROJECT_ID || config.projectId || '').trim();
    if (envClientEmail && envPrivateKey && envProjectId) {
      cachedApp = initializeApp({
        credential: cert({
          projectId: envProjectId,
          clientEmail: envClientEmail,
          privateKey: envPrivateKey,
        }),
        projectId: envProjectId,
      });
      adminInitStatus = 'ok';
      adminAuthMode = 'service_account';
      adminInitError = null;
      return { app: cachedApp, config, hasCredentials: true };
    }

    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      const credPath = path.resolve(process.cwd(), process.env.GOOGLE_APPLICATION_CREDENTIALS);
      if (fs.existsSync(credPath)) {
        try {
          const parsed = JSON.parse(fs.readFileSync(credPath, 'utf-8'));
          if (parsed?.type === 'service_account' && parsed?.private_key && parsed?.client_email) {
            cachedApp = initializeApp({
              credential: cert(parsed),
              projectId: parsed.project_id || config.projectId,
            });
            adminInitStatus = 'ok';
            adminAuthMode = 'service_account';
            adminInitError = null;
            return { app: cachedApp, config, hasCredentials: true };
          }
        } catch {
          // Fall back to applicationDefault below
        }
        if (!process.env.GOOGLE_CLOUD_QUOTA_PROJECT && hasValidProjectId) {
          process.env.GOOGLE_CLOUD_QUOTA_PROJECT = config.projectId;
        }
        cachedApp = initializeApp({
          credential: applicationDefault(),
          projectId: config.projectId,
        });
        adminInitStatus = 'ok';
        adminAuthMode = 'adc';
        adminInitError = null;
        return { app: cachedApp, config, hasCredentials: true };
      }
      // If a stale/non-existent path was injected, clear it so applicationDefault() can fall back to metadata ADC
      delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
    }

    // Attempt Application Default Credentials (ADC) in managed Cloud Run / AI Studio or when explicitly enabled
    const runtimeProject = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT;
    const shouldTryAdc =
      process.env.FIREBASE_USE_ADC === 'true' ||
      (runtimeProject && runtimeProject === config.projectId) ||
      (!isNetlifyRuntime && !isTestEnv && process.env.FIREBASE_USE_ADC !== 'false' && hasValidProjectId);

    if (shouldTryAdc && hasValidProjectId) {
      if (!process.env.GOOGLE_CLOUD_QUOTA_PROJECT && config.projectId) {
        process.env.GOOGLE_CLOUD_QUOTA_PROJECT = config.projectId;
      }
      cachedApp = initializeApp({
        credential: applicationDefault(),
        projectId: config.projectId,
      });
      adminInitStatus = 'ok';
      adminAuthMode = 'adc';
      adminInitError = null;
      return { app: cachedApp, config, hasCredentials: true };
    }

    adminInitStatus = 'missing_credentials';
    adminAuthMode = 'none';
    adminInitError =
      'Firebase Admin credentials are not configured on this server.';
    return { app: null, config, hasCredentials: false };
  } catch (err: any) {
    const msg = String(err?.message || '');
    adminInitStatus = /private key|pem|credential|decoder|unsupported/i.test(msg)
      ? 'invalid_credentials'
      : 'init_error';
    adminAuthMode = 'none';
    adminInitError = msg || 'Failed to initialize Firebase Admin SDK';
    return { app: null, config, hasCredentials: false };
  }
}

export function getFirebaseAdminDiagnostics() {
  const { config, hasCredentials } = getAdminApp();
  const hasServiceAccountJson = Boolean(getRawServiceAccountEnv().trim());
  const hasClientEmail = Boolean(process.env.FIREBASE_CLIENT_EMAIL?.trim());
  const hasPrivateKey = Boolean(
    process.env.FIREBASE_PRIVATE_KEY?.trim() || process.env.FIREBASE_PRIVATE_KEY_BASE64?.trim()
  );
  return {
    adminSdkReady: hasCredentials,
    initStatus: adminInitStatus,
    authMode: adminAuthMode,
    hasServiceAccountJson,
    hasSplitCredentials: hasClientEmail && hasPrivateKey,
    hasClientEmail,
    hasPrivateKey,
    hasGoogleAppCreds: Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim()),
    hasProjectId: Boolean(config.projectId),
    isNetlifyRuntime: Boolean(
      process.env.NETLIFY === 'true' || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.LAMBDA_TASK_ROOT
    ),
  };
}

function getMasterAdminEmailAllowlist(): Set<string> {
  const raw = process.env.MASTER_ADMIN_EMAILS || '';
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );
}

function normalizeSchoolRecordForFirestore(school: SchoolTenantRecord) {
  const expiryDate = school.subscription?.expiryDate ? new Date(school.subscription.expiryDate) : new Date();
  return {
    ...school,
    subscription: {
      ...school.subscription,
      expiryTimestamp: Timestamp.fromDate(Number.isNaN(expiryDate.getTime()) ? new Date() : expiryDate),
    },
  };
}

function stripFirestoreInternalFields(data: any): SchoolTenantRecord {
  const clone = { ...data };
  if (clone.subscription && clone.subscription.expiryTimestamp) {
    const subClone = { ...clone.subscription };
    delete subClone.expiryTimestamp;
    clone.subscription = subClone;
  }
  return clone as SchoolTenantRecord;
}

function stripUndefined<T>(value: T): T {
  if (value === undefined || value === null) return value;
  if (value instanceof Date || value instanceof Timestamp) return value;
  if (Array.isArray(value)) {
    return value.filter((item) => item !== undefined).map((item) => stripUndefined(item)) as unknown as T;
  }
  if (typeof value === 'object') {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value as Record<string, any>)) {
      if (v !== undefined) {
        out[k] = stripUndefined(v);
      }
    }
    return out as T;
  }
  return value;
}

const configuredFirestoreInstances = new WeakSet<Firestore>();

export class FirebaseAuthProvider implements AuthProviderInterface {
  public readonly providerName = 'firebase-admin-auth';

  private requireAdminAuth(): Auth {
    const { app } = getAdminApp();
    if (!app) {
      throw new SaaSServiceError(
        adminInitError || 'Firebase Admin Auth is not configured on the server.',
        503,
        'ADMIN_SDK_UNAVAILABLE'
      );
    }
    return getAuth(app);
  }

  async verifyIdToken(idToken: string): Promise<AuthPrincipal> {
    if (!idToken || !idToken.trim()) {
      throw new SaaSServiceError('Missing Bearer authentication token.', 401, 'UNAUTHORIZED');
    }

    const { app, config } = getAdminApp();
    const allowlist = getMasterAdminEmailAllowlist();

    if (app) {
      try {
        const decoded = await getAuth(app).verifyIdToken(idToken, false);
        const email = (decoded.email || '').toLowerCase();
        const schoolRole = (decoded.schoolRole as SaaSRole) || null;
        const isMaster =
          decoded.isMasterAdmin === true ||
          schoolRole === 'master_admin' ||
          (!!email && decoded.email_verified === true && allowlist.has(email));

        return {
          uid: decoded.uid,
          email,
          emailVerified: !!decoded.email_verified,
          schoolId: typeof decoded.schoolId === 'string' ? decoded.schoolId : null,
          schoolRole: isMaster ? 'master_admin' : schoolRole,
          isMasterAdmin: isMaster,
          displayName: decoded.name || email,
        };
      } catch (err: any) {
        const adminErr = toFirebaseAdminServiceError(err);
        if (adminErr) {
          throw adminErr;
        }
        throw new SaaSServiceError(
          `Invalid or expired authentication token: ${err?.message || 'unauthorized'}`,
          401,
          'INVALID_TOKEN'
        );
      }
    }

    // Fallback token verification using Firebase Identity Toolkit REST API when service account JSON
    // is not yet injected locally (never trusts unsigned claims; verifies directly with Google)
    if (!config.apiKey) {
      throw new SaaSServiceError(
        'Server cannot verify Firebase tokens: configure FIREBASE_SERVICE_ACCOUNT_JSON.',
        503,
        'AUTH_VERIFIER_UNAVAILABLE'
      );
    }

    const resp = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(config.apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      }
    );
    if (!resp.ok) {
      throw new SaaSServiceError('Invalid or expired Firebase ID token.', 401, 'INVALID_TOKEN');
    }
    const payload = (await resp.json()) as any;
    const user = payload?.users?.[0];
    if (!user?.localId) {
      throw new SaaSServiceError('Invalid Firebase ID token payload.', 401, 'INVALID_TOKEN');
    }

    let customClaims: Record<string, any> = {};
    if (user.customAttributes) {
      try {
        customClaims = JSON.parse(user.customAttributes);
      } catch {}
    }

    const email = (user.email || '').toLowerCase();
    const schoolRole = (customClaims.schoolRole as SaaSRole) || null;
    const isMaster =
      customClaims.isMasterAdmin === true ||
      schoolRole === 'master_admin' ||
      (!!email && !!user.emailVerified && allowlist.has(email));

    return {
      uid: user.localId,
      email,
      emailVerified: !!user.emailVerified,
      schoolId: typeof customClaims.schoolId === 'string' ? customClaims.schoolId : null,
      schoolRole: isMaster ? 'master_admin' : schoolRole,
      isMasterAdmin: isMaster,
      displayName: user.displayName || email,
    };
  }

  async createUser(input: {
    email: string;
    password: string;
    displayName: string;
  }): Promise<{ uid: string; email: string; displayName: string }> {
    const auth = this.requireAdminAuth();
    const userRecord = await auth.createUser({
      email: input.email,
      password: input.password,
      displayName: input.displayName,
      emailVerified: true,
      disabled: false,
    });
    return {
      uid: userRecord.uid,
      email: userRecord.email || input.email,
      displayName: userRecord.displayName || input.displayName,
    };
  }

  async setCustomClaims(uid: string, claims: CustomClaimsPayload): Promise<void> {
    const auth = this.requireAdminAuth();
    await auth.setCustomUserClaims(uid, claims);
  }

  async getUserByEmail(
    email: string
  ): Promise<{ uid: string; email: string; disabled: boolean; customClaims?: Record<string, any> } | null> {
    const auth = this.requireAdminAuth();
    try {
      const user = await auth.getUserByEmail(email);
      return {
        uid: user.uid,
        email: user.email || email,
        disabled: user.disabled,
        customClaims: user.customClaims || undefined,
      };
    } catch (err: any) {
      if (err?.code === 'auth/user-not-found') {
        return null;
      }
      throw err;
    }
  }

  async getUserByUid(
    uid: string
  ): Promise<{ uid: string; email: string; displayName: string; disabled: boolean } | null> {
    const auth = this.requireAdminAuth();
    try {
      const user = await auth.getUser(uid);
      return {
        uid: user.uid,
        email: user.email || '',
        displayName: user.displayName || '',
        disabled: user.disabled,
      };
    } catch (err: any) {
      if (err?.code === 'auth/user-not-found') {
        return null;
      }
      throw err;
    }
  }

  async updateUserStatus(uid: string, disabled: boolean): Promise<void> {
    const auth = this.requireAdminAuth();
    await auth.updateUser(uid, { disabled });
  }

  async updateUserPassword(uid: string, password: string): Promise<void> {
    const auth = this.requireAdminAuth();
    await auth.updateUser(uid, { password });
  }

  async deleteUser(uid: string): Promise<void> {
    const auth = this.requireAdminAuth();
    try {
      await auth.revokeRefreshTokens(uid).catch(() => {});
      await auth.deleteUser(uid);
    } catch (err: any) {
      if (err?.code !== 'auth/user-not-found') {
        throw err;
      }
    }
  }

  async updateUser(
    uid: string,
    updates: {
      email?: string;
      password?: string;
      displayName?: string;
      disabled?: boolean;
      emailVerified?: boolean;
    }
  ): Promise<{ uid: string; email: string; displayName: string; disabled: boolean }> {
    const auth = this.requireAdminAuth();
    const payload: Record<string, any> = {};
    if (updates.email !== undefined) payload.email = updates.email;
    if (updates.password !== undefined) payload.password = updates.password;
    if (updates.displayName !== undefined) payload.displayName = updates.displayName;
    if (updates.disabled !== undefined) payload.disabled = updates.disabled;
    if (updates.emailVerified !== undefined) payload.emailVerified = updates.emailVerified;

    const updated = await auth.updateUser(uid, payload);
    return {
      uid: updated.uid,
      email: updated.email || '',
      displayName: updated.displayName || '',
      disabled: updated.disabled,
    };
  }
}

export class FirebaseDatabaseProvider implements DatabaseProviderInterface {
  public readonly providerName = 'firebase-firestore';
  private plansCache: { data: SubscriptionPlanConfig[]; expiresAt: number } | null = null;
  private channelsCache: { data: PlatformPaymentChannels; expiresAt: number } | null = null;
  private static readonly CONFIG_CACHE_TTL_MS = 30_000;

  private getDb(): Firestore {
    const { app, config } = getAdminApp();
    if (!app) {
      throw new SaaSServiceError(
        adminInitError || 'Firebase Admin Firestore is not configured on the server.',
        503,
        'ADMIN_SDK_UNAVAILABLE'
      );
    }
    const dbId = config.firestoreDatabaseId || '(default)';
    const db = dbId && dbId !== '(default)' ? getFirestore(app, dbId) : getFirestore(app);
    if (!configuredFirestoreInstances.has(db)) {
      configuredFirestoreInstances.add(db);
      try {
        db.settings({ ignoreUndefinedProperties: true });
      } catch {
        // Ignore if settings were already applied before first call; stripUndefined handles cleanup regardless
      }
    }
    return db;
  }

  async isMasterAdminUidOrEmail(uid: string, email: string): Promise<boolean> {
    if (email && getMasterAdminEmailAllowlist().has(email.toLowerCase())) {
      return true;
    }
    try {
      const db = this.getDb();
      const snap = await db.collection('master_admins').doc(uid).get();
      return snap.exists && snap.data()?.active !== false;
    } catch {
      return false;
    }
  }

  async getPlans(): Promise<SubscriptionPlanConfig[]> {
    const nowMs = Date.now();
    if (this.plansCache && this.plansCache.expiresAt > nowMs) {
      return this.plansCache.data;
    }
    const db = this.getDb();
    const snap = await db.collection('subscription_plans').get();
    if (snap.empty) {
      // Seed default plans on first read
      const batch = db.batch();
      for (const plan of DEFAULT_SUBSCRIPTION_PLANS) {
        batch.set(db.collection('subscription_plans').doc(plan.id), plan);
      }
      await batch.commit();
      this.plansCache = { data: DEFAULT_SUBSCRIPTION_PLANS, expiresAt: nowMs + FirebaseDatabaseProvider.CONFIG_CACHE_TTL_MS };
      return DEFAULT_SUBSCRIPTION_PLANS;
    }
    const plans = snap.docs.map((d) => d.data() as SubscriptionPlanConfig);
    const existingIds = new Set(plans.map((p) => p.id));
    const missingPlans = DEFAULT_SUBSCRIPTION_PLANS.filter((p) => !existingIds.has(p.id));
    if (missingPlans.length > 0) {
      const batch = db.batch();
      for (const plan of missingPlans) {
        batch.set(db.collection('subscription_plans').doc(plan.id), plan);
        plans.push(plan);
      }
      await batch.commit();
    }
    const order: Record<string, number> = {
      free: 1,
      monthly: 2,
      quarterly: 3,
      half_yearly: 4,
      yearly: 5,
      lifetime: 6,
    };
    const sorted = plans.sort(
      (a, b) => (a.sortOrder ?? order[a.id] ?? 100) - (b.sortOrder ?? order[b.id] ?? 100)
    );
    this.plansCache = { data: sorted, expiresAt: nowMs + FirebaseDatabaseProvider.CONFIG_CACHE_TTL_MS };
    return sorted;
  }

  async getPlanById(planId: SubscriptionPlanId): Promise<SubscriptionPlanConfig | null> {
    const plans = await this.getPlans();
    return plans.find((p) => p.id === planId) || null;
  }

  async upsertPlan(plan: SubscriptionPlanConfig): Promise<SubscriptionPlanConfig> {
    const db = this.getDb();
    const clean = stripUndefined(plan);
    await db.collection('subscription_plans').doc(plan.id).set(clean, { merge: true });
    this.plansCache = null;
    return clean;
  }

  async deletePlan(planId: SubscriptionPlanId): Promise<void> {
    const db = this.getDb();
    await db.collection('subscription_plans').doc(planId).delete();
    this.plansCache = null;
  }

  async getPaymentChannels(): Promise<PlatformPaymentChannels> {
    const nowMs = Date.now();
    if (this.channelsCache && this.channelsCache.expiresAt > nowMs) {
      return this.channelsCache.data;
    }
    const db = this.getDb();
    const defaults = getDefaultPlatformPaymentChannels();
    const snap = await db.collection('saas_platform_config').doc('payment_channels').get();
    const result = !snap.exists
      ? defaults
      : {
          ...defaults,
          ...(snap.data() as Partial<PlatformPaymentChannels>),
        };
    this.channelsCache = { data: result, expiresAt: nowMs + FirebaseDatabaseProvider.CONFIG_CACHE_TTL_MS };
    return result;
  }

  async savePaymentChannels(channels: PlatformPaymentChannels): Promise<PlatformPaymentChannels> {
    const db = this.getDb();
    const cleanPayload: PlatformPaymentChannels = {
      bkash: String(channels.bkash || '').trim(),
      nagad: String(channels.nagad || '').trim(),
      rocket: String(channels.rocket || '').trim(),
      bank: String(channels.bank || '').trim(),
      paymentInstruction: String(channels.paymentInstruction || '').trim(),
      supportPhone: String(channels.supportPhone || '').trim(),
      supportEmail: String(channels.supportEmail || '').trim(),
      updatedAt: channels.updatedAt || new Date().toISOString(),
      updatedBy: channels.updatedBy || '',
    };
    await db
      .collection('saas_platform_config')
      .doc('payment_channels')
      .set(cleanPayload, { merge: true });
    this.channelsCache = { data: cleanPayload, expiresAt: Date.now() + FirebaseDatabaseProvider.CONFIG_CACHE_TTL_MS };
    return cleanPayload;
  }

  async getNextSchoolId(): Promise<string> {
    const db = this.getDb();
    const counterRef = db.collection('platform_counters').doc('schools');
    return db.runTransaction(async (tx) => {
      const snap = await tx.get(counterRef);
      let nextSeq = 1;
      if (snap.exists) {
        nextSeq = Number(snap.data()?.lastSeq || 0) + 1;
      } else {
        const existing = await tx.get(db.collection('schools').select('schoolId'));
        existing.forEach((doc) => {
          const m = /^SCH(\d+)$/i.exec(doc.id);
          if (m) {
            const num = parseInt(m[1], 10);
            if (num >= nextSeq) nextSeq = num + 1;
          }
        });
      }
      tx.set(counterRef, { lastSeq: nextSeq, updatedAt: new Date().toISOString() }, { merge: true });
      return `SCH${String(nextSeq).padStart(3, '0')}`;
    });
  }

  async getSchoolById(schoolId: string): Promise<SchoolTenantRecord | null> {
    const db = this.getDb();
    const snap = await db.collection('schools').doc(schoolId).get();
    return snap.exists ? stripFirestoreInternalFields(snap.data()) : null;
  }

  async getSchoolByCode(schoolCode: string): Promise<SchoolTenantRecord | null> {
    const db = this.getDb();
    const normalized = schoolCode.trim().toUpperCase();
    const snap = await db.collection('schools').where('schoolCode', '==', normalized).limit(1).get();
    if (snap.empty) return null;
    return stripFirestoreInternalFields(snap.docs[0].data());
  }

  async listSchools(): Promise<SchoolTenantRecord[]> {
    const db = this.getDb();
    const snap = await db.collection('schools').orderBy('createdAt', 'desc').get();
    return snap.docs
      .map((d) => stripFirestoreInternalFields(d.data()))
      .filter((s) => !!s.schoolId);
  }

  async createSchool(school: SchoolTenantRecord): Promise<SchoolTenantRecord> {
    const db = this.getDb();
    const clean = stripUndefined(school);
    await db.collection('schools').doc(school.schoolId).set(stripUndefined(normalizeSchoolRecordForFirestore(clean)));
    return clean;
  }

  async updateSchool(schoolId: string, updates: Partial<SchoolTenantRecord>): Promise<SchoolTenantRecord> {
    const db = this.getDb();
    const ref = db.collection('schools').doc(schoolId);
    const snap = await ref.get();
    if (!snap.exists) {
      throw new SaaSServiceError(`School "${schoolId}" not found.`, 404, 'SCHOOL_NOT_FOUND');
    }
    const merged = stripUndefined({
      ...stripFirestoreInternalFields(snap.data()),
      ...updates,
    }) as SchoolTenantRecord;
    await ref.set(stripUndefined(normalizeSchoolRecordForFirestore(merged)));
    return merged;
  }

  async deleteSchool(schoolId: string): Promise<void> {
    const db = this.getDb();
    const schoolRef = db.collection('schools').doc(schoolId);
    const snap = await schoolRef.get();
    if (!snap.exists) {
      throw new SaaSServiceError(`School "${schoolId}" not found.`, 404, 'SCHOOL_NOT_FOUND');
    }

    const [
      saasUsersSnap,
      paymentsSnap,
      historySnap,
      legacySyncBySchoolSnap,
      legacySyncByTenantSnap,
      supportTicketsSnap,
      vaultSnap,
    ] = await Promise.all([
      db.collection('saas_users').where('schoolId', '==', schoolId).get(),
      db.collection('payment_requests').where('schoolId', '==', schoolId).get(),
      db.collection('subscription_history').where('schoolId', '==', schoolId).get(),
      db.collection('school_sync').where('schoolId', '==', schoolId).get().catch(() => null),
      db.collection('school_sync').where('tenantId', '==', schoolId).get().catch(() => null),
      db.collection('support_tickets').where('schoolId', '==', schoolId).get().catch(() => null),
      db.collection('master_admin_vault').where('schoolId', '==', schoolId).get().catch(() => null),
    ]);

    const refsToDelete = new Map<string, FirebaseFirestore.DocumentReference>();
    const addRef = (ref: FirebaseFirestore.DocumentReference) => {
      refsToDelete.set(ref.path, ref);
    };

    saasUsersSnap.docs.forEach((d) => addRef(d.ref));
    paymentsSnap.docs.forEach((d) => {
      const pData = d.data() as Partial<SaaSPaymentRequest>;
      if (pData?.normalizedTransactionId) {
        addRef(db.collection('payment_trx_index').doc(pData.normalizedTransactionId));
      }
      addRef(d.ref);
    });
    historySnap.docs.forEach((d) => addRef(d.ref));
    legacySyncBySchoolSnap?.docs.forEach((d) => addRef(d.ref));
    legacySyncByTenantSnap?.docs.forEach((d) => addRef(d.ref));
    vaultSnap?.docs.forEach((d) => addRef(d.ref));
    addRef(db.collection('school_sync').doc(schoolId));
    if (supportTicketsSnap && !supportTicketsSnap.empty) {
      for (const tDoc of supportTicketsSnap.docs) {
        const msgSnap = await tDoc.ref.collection('messages').get().catch(() => null);
        msgSnap?.docs.forEach((mDoc) => addRef(mDoc.ref));
        addRef(tDoc.ref);
      }
    }

    // Delete all top-level SaaS / legacy references in batches of 400
    const topLevelRefs = Array.from(refsToDelete.values());
    for (let i = 0; i < topLevelRefs.length; i += 400) {
      const batch = db.batch();
      for (const r of topLevelRefs.slice(i, i + 400)) {
        batch.delete(r);
      }
      await batch.commit();
    }

    // Recursively delete schools/{schoolId} and EVERY nested subcollection (users, slices, chunks, domain collections)
    if (typeof (db as any).recursiveDelete === 'function') {
      await (db as any).recursiveDelete(schoolRef);
    } else {
      const subCols = await schoolRef.listCollections();
      const subRefs: FirebaseFirestore.DocumentReference[] = [];
      for (const col of subCols) {
        const colSnap = await col.get();
        colSnap.docs.forEach((d) => subRefs.push(d.ref));
      }
      subRefs.push(schoolRef);
      for (let i = 0; i < subRefs.length; i += 400) {
        const batch = db.batch();
        for (const r of subRefs.slice(i, i + 400)) {
          batch.delete(r);
        }
        await batch.commit();
      }
    }
  }

  async listPaymentRequests(schoolId?: string): Promise<SaaSPaymentRequest[]> {
    const db = this.getDb();
    let query: FirebaseFirestore.Query = db.collection('payment_requests');
    if (schoolId) {
      query = query.where('schoolId', '==', schoolId);
    }
    const snap = await query.get();
    const list = snap.docs.map((d) => d.data() as SaaSPaymentRequest);
    return list.sort((a, b) => (b.submittedAt || '').localeCompare(a.submittedAt || ''));
  }

  async getPaymentRequestById(id: string): Promise<SaaSPaymentRequest | null> {
    const db = this.getDb();
    const snap = await db.collection('payment_requests').doc(id).get();
    return snap.exists ? (snap.data() as SaaSPaymentRequest) : null;
  }

  async getPaymentByNormalizedTrxId(normalizedTrxId: string): Promise<SaaSPaymentRequest | null> {
    const db = this.getDb();
    const lockSnap = await db.collection('payment_trx_index').doc(normalizedTrxId).get();
    if (!lockSnap.exists) return null;
    const reqId = lockSnap.data()?.paymentRequestId;
    if (!reqId) return null;
    return this.getPaymentRequestById(reqId);
  }

  async listSubscriptionHistory(schoolId?: string): Promise<SubscriptionHistoryRecord[]> {
    const db = this.getDb();
    let query: FirebaseFirestore.Query = db.collection('subscription_history');
    if (schoolId) {
      query = query.where('schoolId', '==', schoolId);
    }
    const snap = await query.get();
    const list = snap.docs.map((d) => d.data() as SubscriptionHistoryRecord);
    return list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }

  async appendSubscriptionHistory(entry: SubscriptionHistoryRecord): Promise<void> {
    const db = this.getDb();
    await db.collection('subscription_history').doc(entry.id).set(stripUndefined(entry));
  }

  async createSaaSUserRecord(user: SaaSUserRecord): Promise<SaaSUserRecord> {
    const db = this.getDb();
    const cleanUser = stripUndefined(user);
    const batch = db.batch();
    batch.set(db.collection('saas_users').doc(user.uid), cleanUser);
    batch.set(db.collection('schools').doc(user.schoolId).collection('users').doc(user.uid), cleanUser);
    await batch.commit();
    return cleanUser;
  }

  async getSaaSUserByUid(uid: string): Promise<SaaSUserRecord | null> {
    const db = this.getDb();
    const snap = await db.collection('saas_users').doc(uid).get();
    return snap.exists ? (snap.data() as SaaSUserRecord) : null;
  }

  async getSaaSUserByEmail(email: string): Promise<SaaSUserRecord | null> {
    const db = this.getDb();
    const snap = await db
      .collection('saas_users')
      .where('email', '==', email.trim().toLowerCase())
      .limit(1)
      .get();
    return snap.empty ? null : (snap.docs[0].data() as SaaSUserRecord);
  }

  async getSaaSUserByUsernameNormalized(usernameNormalized: string): Promise<SaaSUserRecord | null> {
    if (!usernameNormalized) return null;
    const db = this.getDb();
    const snap = await db
      .collection('saas_users')
      .where('usernameNormalized', '==', usernameNormalized)
      .limit(1)
      .get();
    if (!snap.empty) {
      return snap.docs[0].data() as SaaSUserRecord;
    }

    // Legacy fallback for older docs written without usernameNormalized index
    const fallbackSnap = await db.collection('saas_users').limit(500).get();
    for (const d of fallbackSnap.docs) {
      const u = d.data() as SaaSUserRecord;
      const key = u.usernameNormalized || (u.username ? normalizeLoginUsernameKey(u.username) : '');
      if (key === usernameNormalized) {
        return u;
      }
    }
    return null;
  }

  async findSaaSUsersByLoginIdentifier(
    usernameNormalized: string,
    phoneNormalized?: string
  ): Promise<SaaSUserRecord[]> {
    const db = this.getDb();

    if (usernameNormalized) {
      const directSnap = await db
        .collection('saas_users')
        .where('usernameNormalized', '==', usernameNormalized)
        .limit(5)
        .get();
      if (!directSnap.empty) {
        return directSnap.docs.map((d) => d.data() as SaaSUserRecord);
      }
    }

    if (phoneNormalized) {
      const phoneSnap = await db
        .collection('saas_users')
        .where('phoneNormalized', '==', phoneNormalized)
        .limit(5)
        .get();
      if (!phoneSnap.empty) {
        return phoneSnap.docs.map((d) => d.data() as SaaSUserRecord);
      }
    }

    // Bounded legacy fallback for records created before usernameNormalized / phoneNormalized fields
    const allSnap = await db.collection('saas_users').limit(500).get();
    const all = allSnap.docs.map((d) => d.data() as SaaSUserRecord);

    if (usernameNormalized) {
      const legacyDirect = all.filter((u) => {
        const key = u.usernameNormalized || (u.username ? normalizeLoginUsernameKey(u.username) : '');
        return key === usernameNormalized;
      });
      if (legacyDirect.length > 0) return legacyDirect;
    }

    if (phoneNormalized) {
      return all.filter((u) => {
        const storedPhone = u.phoneNormalized || (u.phone ? normalizePhoneNumber(u.phone) : '');
        return storedPhone === phoneNormalized;
      });
    }

    return [];
  }

  async listSaaSUsersBySchool(schoolId: string): Promise<SaaSUserRecord[]> {
    const db = this.getDb();
    const [scopedSnap, globalSnap] = await Promise.all([
      db.collection('schools').doc(schoolId).collection('users').get(),
      db.collection('saas_users').where('schoolId', '==', schoolId).get(),
    ]);
    const byUid = new Map<string, SaaSUserRecord>();
    globalSnap.docs.forEach((d) => {
      const u = d.data() as SaaSUserRecord;
      if (u?.uid) byUid.set(u.uid, u);
    });
    scopedSnap.docs.forEach((d) => {
      const u = d.data() as SaaSUserRecord;
      if (u?.uid) byUid.set(u.uid, u);
    });
    return Array.from(byUid.values());
  }

  async updateSaaSUserRecord(uid: string, updates: Partial<SaaSUserRecord>): Promise<SaaSUserRecord> {
    const db = this.getDb();
    const existing = await this.getSaaSUserByUid(uid);
    if (!existing) {
      throw new SaaSServiceError('User record not found.', 404, 'USER_NOT_FOUND');
    }
    const updated = stripUndefined({ ...existing, ...updates });
    const batch = db.batch();
    batch.set(db.collection('saas_users').doc(uid), updated);
    batch.set(db.collection('schools').doc(existing.schoolId).collection('users').doc(uid), updated);
    await batch.commit();
    return updated;
  }

  async deleteSaaSUserRecord(uid: string, schoolIdHint?: string): Promise<void> {
    const db = this.getDb();
    const existing = await this.getSaaSUserByUid(uid);
    const schoolId = existing?.schoolId || schoolIdHint;
    if (!existing && !schoolId) {
      throw new SaaSServiceError('User record not found.', 404, 'USER_NOT_FOUND');
    }
    const batch = db.batch();
    batch.delete(db.collection('saas_users').doc(uid));
    if (schoolId) {
      batch.delete(db.collection('schools').doc(schoolId).collection('users').doc(uid));
    }
    batch.delete(db.collection('master_admin_vault').doc(uid));
    await batch.commit();
  }

  async saveMasterVaultRecord(record: MasterAdminVaultRecord): Promise<void> {
    const db = this.getDb();
    await db.collection('master_admin_vault').doc(record.uid).set(stripUndefined(record));
  }

  async getMasterVaultRecordByUid(uid: string): Promise<MasterAdminVaultRecord | null> {
    const db = this.getDb();
    const snap = await db.collection('master_admin_vault').doc(uid).get();
    return snap.exists ? (snap.data() as MasterAdminVaultRecord) : null;
  }

  async getMasterVaultRecordsBySchool(schoolId: string): Promise<MasterAdminVaultRecord[]> {
    const db = this.getDb();
    const snap = await db.collection('master_admin_vault').where('schoolId', '==', schoolId).get();
    return snap.docs.map((d) => d.data() as MasterAdminVaultRecord);
  }

  async deleteMasterVaultRecord(uid: string): Promise<void> {
    const db = this.getDb();
    await db.collection('master_admin_vault').doc(uid).delete();
  }

  async deleteMasterVaultRecordsBySchool(schoolId: string): Promise<void> {
    const db = this.getDb();
    const snap = await db.collection('master_admin_vault').where('schoolId', '==', schoolId).get();
    if (snap.empty) return;
    for (let i = 0; i < snap.docs.length; i += 400) {
      const batch = db.batch();
      for (const d of snap.docs.slice(i, i + 400)) {
        batch.delete(d.ref);
      }
      await batch.commit();
    }
  }

  async getTenantSlices(schoolId: string): Promise<Record<string, any>> {
    const db = this.getDb();
    const snap = await db.collection('schools').doc(schoolId).collection('slices').get();
    const result: Record<string, any> = {};
    snap.forEach((doc) => {
      result[doc.id] = doc.data();
    });
    return result;
  }

  async saveTenantSlice(schoolId: string, sliceName: string, data: Record<string, any>): Promise<void> {
    const db = this.getDb();
    await db
      .collection('schools')
      .doc(schoolId)
      .collection('slices')
      .doc(sliceName)
      .set(
        stripUndefined({
          ...data,
          schoolId,
          slice: sliceName,
          updatedAt: new Date().toISOString(),
        }),
        { merge: true }
      );
  }

  async listSupportTickets(schoolId?: string): Promise<SupportTicketRecord[]> {
    const db = this.getDb();
    let q: FirebaseFirestore.Query = db.collection('support_tickets');
    if (schoolId) {
      q = q.where('schoolId', '==', schoolId);
    }
    const snap = await q.get();
    return snap.docs
      .map((d) => d.data() as SupportTicketRecord)
      .filter((t) => Boolean(t?.id))
      .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  }

  async getSupportTicketById(ticketId: string): Promise<SupportTicketRecord | null> {
    const db = this.getDb();
    const snap = await db.collection('support_tickets').doc(ticketId).get();
    return snap.exists ? (snap.data() as SupportTicketRecord) : null;
  }

  async createSupportTicket(
    ticket: SupportTicketRecord,
    initialMessage: SupportMessageRecord
  ): Promise<{ ticket: SupportTicketRecord; message: SupportMessageRecord }> {
    const db = this.getDb();
    const cleanTicket = stripUndefined(ticket);
    const cleanMessage = stripUndefined(initialMessage);
    const batch = db.batch();
    const ticketRef = db.collection('support_tickets').doc(cleanTicket.id);
    const msgRef = ticketRef.collection('messages').doc(cleanMessage.id);
    batch.set(ticketRef, cleanTicket);
    batch.set(msgRef, cleanMessage);
    await batch.commit();
    return { ticket: cleanTicket, message: cleanMessage };
  }

  async listSupportMessages(ticketId: string): Promise<SupportMessageRecord[]> {
    const db = this.getDb();
    const snap = await db
      .collection('support_tickets')
      .doc(ticketId)
      .collection('messages')
      .orderBy('createdAt', 'asc')
      .get();
    return snap.docs
      .map((d) => d.data() as SupportMessageRecord)
      .filter((m) => Boolean(m?.id));
  }

  async addSupportMessage(
    ticketId: string,
    message: SupportMessageRecord,
    ticketUpdates: Partial<SupportTicketRecord>
  ): Promise<{ ticket: SupportTicketRecord; message: SupportMessageRecord }> {
    const db = this.getDb();
    const ticketRef = db.collection('support_tickets').doc(ticketId);
    const msgRef = ticketRef.collection('messages').doc(message.id);
    const cleanMessage = stripUndefined(message);

    const updatedTicket = await db.runTransaction(async (tx) => {
      const ticketSnap = await tx.get(ticketRef);
      if (!ticketSnap.exists) {
        throw new SaaSServiceError('Support ticket not found.', 404, 'TICKET_NOT_FOUND');
      }
      const existing = ticketSnap.data() as SupportTicketRecord;
      const merged = stripUndefined({
        ...existing,
        ...ticketUpdates,
        messageCount: Number(existing.messageCount || 0) + 1,
      }) as SupportTicketRecord;
      tx.set(ticketRef, merged);
      tx.set(msgRef, cleanMessage);
      return merged;
    });

    return { ticket: updatedTicket, message: cleanMessage };
  }

  async updateSupportTicket(
    ticketId: string,
    updates: Partial<SupportTicketRecord>
  ): Promise<SupportTicketRecord> {
    const db = this.getDb();
    const ref = db.collection('support_tickets').doc(ticketId);
    const snap = await ref.get();
    if (!snap.exists) {
      throw new SaaSServiceError('Support ticket not found.', 404, 'TICKET_NOT_FOUND');
    }
    const merged = stripUndefined({
      ...(snap.data() as SupportTicketRecord),
      ...updates,
    }) as SupportTicketRecord;
    await ref.set(merged);
    return merged;
  }

  async listSupportVideos(): Promise<SupportVideoRecord[]> {
    const db = this.getDb();
    const snap = await db.collection('support_videos').get();
    return snap.docs
      .map((d) => d.data() as SupportVideoRecord)
      .filter((v) => Boolean(v?.id && v?.embedUrl))
      .sort((a, b) => {
        if ((a.sortOrder ?? 0) !== (b.sortOrder ?? 0)) {
          return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
        }
        return (b.createdAt || '').localeCompare(a.createdAt || '');
      });
  }

  async getSupportVideoById(videoDocId: string): Promise<SupportVideoRecord | null> {
    const db = this.getDb();
    const snap = await db.collection('support_videos').doc(videoDocId).get();
    return snap.exists ? (snap.data() as SupportVideoRecord) : null;
  }

  async upsertSupportVideo(video: SupportVideoRecord): Promise<SupportVideoRecord> {
    const db = this.getDb();
    const clean = stripUndefined(video);
    await db.collection('support_videos').doc(clean.id).set(clean);
    return clean;
  }

  async upsertSupportVideosBatch(videos: SupportVideoRecord[]): Promise<SupportVideoRecord[]> {
    const db = this.getDb();
    const cleaned = videos.map((v) => stripUndefined(v));
    const batch = db.batch();
    for (const item of cleaned) {
      batch.set(db.collection('support_videos').doc(item.id), item);
    }
    await batch.commit();
    return cleaned;
  }

  async deleteSupportVideo(videoDocId: string): Promise<void> {
    const db = this.getDb();
    await db.collection('support_videos').doc(videoDocId).delete();
  }

  async runInTransaction<T>(fn: (tx: TransactionContext) => Promise<T>): Promise<T> {
    const db = this.getDb();
    return db.runTransaction(async (fsTx) => {
      // Cache reads inside the transaction so sequential updates (e.g., approvePaymentRequest)
      // never perform a Firestore read after a write.
      const schoolCache = new Map<string, SchoolTenantRecord | null>();
      const paymentCache = new Map<string, SaaSPaymentRequest | null>();

      const ctx: TransactionContext = {
        async getSchoolById(schoolId) {
          if (schoolCache.has(schoolId)) {
            const cached = schoolCache.get(schoolId);
            return cached ? structuredClone(cached) : null;
          }
          const snap = await fsTx.get(db.collection('schools').doc(schoolId));
          const record = snap.exists ? stripFirestoreInternalFields(snap.data()) : null;
          schoolCache.set(schoolId, record);
          return record ? structuredClone(record) : null;
        },
        async updateSchool(schoolId, updates) {
          const ref = db.collection('schools').doc(schoolId);
          let existing = schoolCache.has(schoolId) ? schoolCache.get(schoolId) ?? null : undefined;
          if (existing === undefined) {
            const snap = await fsTx.get(ref);
            existing = snap.exists ? stripFirestoreInternalFields(snap.data()) : null;
          }
          if (!existing) {
            throw new SaaSServiceError(`School "${schoolId}" not found.`, 404, 'SCHOOL_NOT_FOUND');
          }
          const merged = stripUndefined({
            ...existing,
            ...updates,
          }) as SchoolTenantRecord;
          schoolCache.set(schoolId, merged);
          fsTx.set(ref, stripUndefined(normalizeSchoolRecordForFirestore(merged)));
          return structuredClone(merged);
        },
        async getPaymentRequestById(id) {
          if (paymentCache.has(id)) {
            const cached = paymentCache.get(id);
            return cached ? structuredClone(cached) : null;
          }
          const snap = await fsTx.get(db.collection('payment_requests').doc(id));
          const record = snap.exists ? (snap.data() as SaaSPaymentRequest) : null;
          paymentCache.set(id, record);
          return record ? structuredClone(record) : null;
        },
        async getPaymentByNormalizedTrxId(normalizedTrxId) {
          const lockSnap = await fsTx.get(db.collection('payment_trx_index').doc(normalizedTrxId));
          if (!lockSnap.exists) return null;
          const reqId = lockSnap.data()?.paymentRequestId;
          if (!reqId) return null;
          return ctx.getPaymentRequestById(reqId);
        },
        async createPaymentRequestWithTrxLock(request) {
          const cleanReq = stripUndefined(request);
          const lockRef = db.collection('payment_trx_index').doc(cleanReq.normalizedTransactionId);
          const reqRef = db.collection('payment_requests').doc(cleanReq.id);
          fsTx.create(lockRef, {
            normalizedTransactionId: cleanReq.normalizedTransactionId,
            paymentRequestId: cleanReq.id,
            schoolId: cleanReq.schoolId,
            createdAt: cleanReq.submittedAt,
          });
          fsTx.create(reqRef, cleanReq);
          paymentCache.set(cleanReq.id, cleanReq);
          return structuredClone(cleanReq);
        },
        async updatePaymentRequest(id, updates) {
          const ref = db.collection('payment_requests').doc(id);
          let existing = paymentCache.has(id) ? paymentCache.get(id) ?? null : undefined;
          if (existing === undefined) {
            const snap = await fsTx.get(ref);
            existing = snap.exists ? (snap.data() as SaaSPaymentRequest) : null;
          }
          if (!existing) {
            throw new SaaSServiceError('Payment request not found.', 404, 'PAYMENT_NOT_FOUND');
          }
          const merged = stripUndefined({ ...existing, ...updates }) as SaaSPaymentRequest;
          paymentCache.set(id, merged);
          fsTx.set(ref, merged);
          return structuredClone(merged);
        },
        async appendSubscriptionHistory(entry) {
          fsTx.set(db.collection('subscription_history').doc(entry.id), stripUndefined(entry));
        },
      };
      return fn(ctx);
    });
  }
}

export function toFirebaseAdminServiceError(err: unknown): SaaSServiceError | null {
  if (!err || typeof err !== 'object') return null;
  if (err instanceof SaaSServiceError) return err;
  const anyErr = err as any;
  const code = anyErr?.code;
  const httpStatus = anyErr?.httpResponse?.status;
  const message = String(anyErr?.message || '');
  const httpStatusText = String(anyErr?.httpResponse?.data?.error?.status || '');
  const isIamDenied =
    code === 7 ||
    code === 'permission-denied' ||
    code === 'PERMISSION_DENIED' ||
    code === 'auth/insufficient-permission' ||
    (code === 'auth/internal-error' && (httpStatus === 403 || /permission|identitytoolkit|serviceusage|disabled/i.test(message))) ||
    httpStatus === 403 ||
    httpStatusText === 'PERMISSION_DENIED' ||
    /7 PERMISSION_DENIED|Missing or insufficient permissions|USER_PROJECT_DENIED|serviceusage\.services\.use/i.test(message);

  if (isIamDenied) {
    return new SaaSServiceError(
      'Server Firebase Admin SDK does not yet have IAM permissions (Cloud Datastore User, Firebase Authentication Admin, Service Usage Consumer) on this Firebase project.',
      503,
      'ADMIN_IAM_PERMISSION_DENIED'
    );
  }

  const isClientTokenError =
    typeof code === 'string' &&
    (code === 'auth/id-token-expired' ||
      code === 'auth/id-token-revoked' ||
      code === 'auth/argument-error' ||
      code === 'auth/invalid-id-token');

  const isAdminCredentialInvalid =
    !isClientTokenError &&
    (code === 16 ||
      code === '16' ||
      code === 'unauthenticated' ||
      code === 'UNAUTHENTICATED' ||
      httpStatusText === 'UNAUTHENTICATED' ||
      /16 UNAUTHENTICATED|Request had invalid authentication credentials|invalid_grant|Invalid JWT Signature|DECODER routines|private key/i.test(
        message
      ));

  if (isAdminCredentialInvalid) {
    return new SaaSServiceError(
      'Server Firebase Admin credentials (service account key) are invalid, deleted, or revoked. Generate a fresh Service Account JSON key and update FIREBASE_SERVICE_ACCOUNT_JSON.',
      503,
      'ADMIN_CREDENTIAL_INVALID'
    );
  }

  return null;
}

export function isFirebaseAdminConfigured(): boolean {
  const { hasCredentials } = getAdminApp();
  return hasCredentials;
}
