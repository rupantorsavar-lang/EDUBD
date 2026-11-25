export type SubscriptionPlanId =
  | 'free'
  | 'monthly'
  | 'quarterly'
  | 'half_yearly'
  | 'yearly'
  | 'lifetime'
  | (string & {});

export const CORE_SUBSCRIPTION_PLAN_IDS = new Set<string>([
  'free',
  'monthly',
  'quarterly',
  'half_yearly',
  'yearly',
  'lifetime',
]);

export type SubscriptionStatus = 'Pending' | 'Active' | 'Expired' | 'Suspended';

export type SchoolStatus = 'pending' | 'active' | 'expired' | 'suspended';

export type SaaSRole =
  | 'master_admin'
  | 'super_admin'
  | 'admin'
  | 'teacher'
  | 'accountant'
  | 'staff'
  | 'student'
  | 'guardian'
  | 'librarian'
  | 'receptionist'
  | 'gatekeeper';

export type ManualPaymentMethod = 'bKash' | 'Nagad' | 'Rocket' | 'Bank Transfer';

export type PaymentRequestStatus = 'pending' | 'approved' | 'rejected';

export interface SubscriptionPlanConfig {
  id: SubscriptionPlanId;
  name: string;
  nameBn: string;
  durationDays: number;
  priceBdt: number;
  discountPercent?: number;
  badgeText?: string;
  features?: string[];
  sortOrder?: number;
  isCustom?: boolean;
  description: string;
  descriptionBn: string;
  isActive: boolean;
  updatedAt: string;
}

export function getEffectivePlanPriceBdt(plan: {
  priceBdt: number;
  discountPercent?: number;
}): number {
  const base = Math.max(0, Number(plan.priceBdt) || 0);
  const pct = Math.min(100, Math.max(0, Number(plan.discountPercent) || 0));
  if (base === 0 || pct === 0) return Math.round(base);
  return Math.max(0, Math.round(base * (1 - pct / 100)));
}

export const DEFAULT_SUBSCRIPTION_PLANS: SubscriptionPlanConfig[] = [
  {
    id: 'free',
    name: 'Free Plan',
    nameBn: 'ফ্রি প্ল্যান',
    durationDays: 30,
    priceBdt: 0,
    description: 'Free starter plan with full school ERP access',
    descriptionBn: 'সম্পূর্ণ বিনামূল্যে ৩০ দিনের স্টার্টার স্কুল ইআরপি প্ল্যান',
    isActive: true,
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'monthly',
    name: 'Monthly Plan',
    nameBn: 'মাসিক প্ল্যান',
    durationDays: 30,
    priceBdt: 1500,
    description: 'Full multi-module school ERP access for 30 days',
    descriptionBn: '৩০ দিনের জন্য সম্পূর্ণ স্কুল ইআরপি সুবিধা',
    isActive: true,
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'quarterly',
    name: 'Quarterly Plan',
    nameBn: 'ত্রৈমাসিক প্ল্যান',
    durationDays: 90,
    priceBdt: 4200,
    description: '90-day school ERP subscription with priority support',
    descriptionBn: '৯০ দিনের স্কুল ইআরপি সাবস্ক্রিপশন ও সাপোর্ট',
    isActive: true,
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'half_yearly',
    name: 'Half-Yearly Plan',
    nameBn: 'ষাণ্মাসিক প্ল্যান',
    durationDays: 180,
    priceBdt: 8000,
    description: '180-day semester subscription with savings',
    descriptionBn: '১৮০ দিনের সাশ্রয়ী সেমিস্টার সাবস্ক্রিপশন',
    isActive: true,
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'yearly',
    name: 'Yearly Plan',
    nameBn: 'বাৎসরিক প্ল্যান',
    durationDays: 365,
    priceBdt: 15000,
    description: 'Best value 365-day annual institutional license',
    descriptionBn: '৩৬৫ দিনের সেরা সাশ্রয়ী বাৎসরিক লাইসেন্স',
    isActive: true,
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'lifetime',
    name: 'Lifetime Plan',
    nameBn: 'লাইফটাইম প্ল্যান',
    durationDays: 36500,
    priceBdt: 25000,
    description: 'One-time lifetime institutional school ERP license',
    descriptionBn: 'এককালীন পেমেন্টে আজীবন (লাইফটাইম) স্কুল ইআরপি লাইসেন্স',
    isActive: true,
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

export interface SchoolSubscriptionInfo {
  planId: SubscriptionPlanId;
  planName: string;
  status: SubscriptionStatus;
  startDate: string; // ISO UTC
  expiryDate: string; // ISO UTC
  lastPaymentDate: string | null;
  nextRenewalDate: string | null;
  amountBdt: number;
}

export interface SchoolTenantRecord {
  schoolId: string; // e.g., SCH001, SCH002
  schoolCode: string; // unique normalized uppercase code
  schoolName: string;
  address: string;
  contactNumber: string;
  email: string;
  principalName: string;
  adminName: string;
  adminEmail: string;
  adminUsername?: string;
  adminUid: string;
  status: SchoolStatus;
  subscription: SchoolSubscriptionInfo;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  notes?: string;
}

export interface ComputedSubscriptionState {
  planId: SubscriptionPlanId;
  planName: string;
  effectiveStatus: SubscriptionStatus;
  schoolStatus: SchoolStatus;
  startDate: string;
  expiryDate: string;
  remainingDays: number;
  expiredDays: number;
  isExpired: boolean;
  isSuspended: boolean;
  isPending: boolean;
  accessAllowed: boolean;
  lastPaymentDate: string | null;
  nextRenewalDate: string | null;
  serverTime: string;
}

export interface SaaSPaymentRequest {
  id: string;
  schoolId: string;
  schoolName: string;
  planId: SubscriptionPlanId;
  planName: string;
  durationDays: number;
  amount: number;
  paymentMethod: ManualPaymentMethod;
  senderNumber: string;
  transactionId: string;
  normalizedTransactionId: string;
  paymentDate: string;
  screenshotUrl?: string;
  notes?: string;
  status: PaymentRequestStatus;
  submittedByUid: string;
  submittedByEmail: string;
  submittedAt: string;
  reviewedByUid?: string;
  reviewedByEmail?: string;
  reviewedAt?: string;
  rejectionReason?: string;
}

export interface SubscriptionHistoryRecord {
  id: string;
  schoolId: string;
  schoolName: string;
  eventType:
    | 'school_created'
    | 'payment_approved'
    | 'payment_rejected'
    | 'manual_extension'
    | 'suspended'
    | 'activated'
    | 'plan_changed';
  planId: SubscriptionPlanId;
  planName: string;
  previousExpiryDate: string | null;
  newExpiryDate: string | null;
  durationDaysAdded: number;
  amount?: number;
  paymentRequestId?: string;
  transactionId?: string;
  actorUid: string;
  actorEmail: string;
  remarks: string;
  createdAt: string;
}

export interface SaaSUserRecord {
  uid: string;
  email: string;
  username?: string;
  usernameNormalized?: string;
  phoneNormalized?: string;
  displayName: string;
  schoolId: string;
  schoolRole: SaaSRole;
  linkedStaffId?: string;
  linkedStudentId?: string;
  phone?: string;
  avatarUrl?: string;
  status: 'active' | 'disabled';
  createdAt: string;
  createdBy: string;
  updatedAt: string;
}

export interface MasterAdminVaultRecord {
  uid: string;
  schoolId: string;
  email: string;
  displayName: string;
  schoolRole: SaaSRole;
  encryptedPassword: string;
  updatedAt: string;
  updatedBy: string;
}

export interface AuthPrincipal {
  uid: string;
  email: string;
  username?: string;
  emailVerified: boolean;
  schoolId: string | null;
  schoolRole: SaaSRole | null;
  isMasterAdmin: boolean;
  displayName?: string;
  linkedStaffId?: string;
  linkedStudentId?: string;
  phone?: string;
  avatarUrl?: string;
}

export interface CreateSchoolInput {
  schoolName: string;
  schoolCode: string;
  address: string;
  contactNumber: string;
  email: string;
  principalName: string;
  adminName: string;
  adminEmail: string;
  adminUsername?: string;
  adminPassword: string;
  initialPlan: SubscriptionPlanId;
  startDate: string;
  expiryDate?: string;
  activateImmediately?: boolean;
}

export interface UpdateSchoolInput {
  schoolName?: string;
  schoolCode?: string;
  address?: string;
  contactNumber?: string;
  email?: string;
  principalName?: string;
  status?: SchoolStatus;
  extendDays?: number;
  newExpiryDate?: string;
  planId?: SubscriptionPlanId;
  notes?: string;
}

export interface CreatePaymentRequestInput {
  planId: SubscriptionPlanId;
  amount: number;
  paymentMethod: ManualPaymentMethod;
  senderNumber: string;
  transactionId: string;
  paymentDate: string;
  screenshotUrl?: string;
  notes?: string;
}

export interface CreateTenantUserInput {
  email?: string;
  username?: string;
  password: string;
  displayName: string;
  schoolRole: Exclude<SaaSRole, 'master_admin'>;
  schoolId?: string; // Only honored if caller is Master Admin; ignored for school admins
  linkedStaffId?: string;
  linkedStudentId?: string;
  phone?: string;
}

export interface CustomClaimsPayload {
  schoolId?: string;
  schoolRole: SaaSRole;
  isMasterAdmin?: boolean;
}

export interface UpdateOwnCredentialsInput {
  displayName?: string;
  email?: string;
  username?: string;
  password?: string;
  phone?: string;
  avatarUrl?: string;
}

export interface UpdateTenantUserCredentialsInput {
  displayName?: string;
  email?: string;
  username?: string;
  password?: string;
  phone?: string;
  schoolRole?: Exclude<SaaSRole, 'master_admin'>;
  linkedStudentId?: string;
  linkedStaffId?: string;
}

export interface AuthProviderInterface {
  readonly providerName: string;
  verifyIdToken(idToken: string): Promise<AuthPrincipal>;
  createUser(input: {
    email: string;
    password: string;
    displayName: string;
  }): Promise<{ uid: string; email: string; displayName: string }>;
  setCustomClaims(uid: string, claims: CustomClaimsPayload): Promise<void>;
  getUserByEmail(
    email: string
  ): Promise<{
    uid: string;
    email: string;
    disabled: boolean;
    customClaims?: Record<string, any>;
  } | null>;
  getUserByUid?(uid: string): Promise<{ uid: string; email: string; displayName: string; disabled: boolean } | null>;
  updateUserStatus(uid: string, disabled: boolean): Promise<void>;
  updateUserPassword?(uid: string, password: string): Promise<void>;
  updateUser?(
    uid: string,
    updates: {
      email?: string;
      password?: string;
      displayName?: string;
      disabled?: boolean;
      emailVerified?: boolean;
    }
  ): Promise<{ uid: string; email: string; displayName: string; disabled: boolean }>;
  deleteUser?(uid: string): Promise<void>;
}

export interface TransactionContext {
  getSchoolById(schoolId: string): Promise<SchoolTenantRecord | null>;
  updateSchool(schoolId: string, updates: Partial<SchoolTenantRecord>): Promise<SchoolTenantRecord>;
  getPaymentRequestById(id: string): Promise<SaaSPaymentRequest | null>;
  getPaymentByNormalizedTrxId(normalizedTrxId: string): Promise<SaaSPaymentRequest | null>;
  createPaymentRequestWithTrxLock(request: SaaSPaymentRequest): Promise<SaaSPaymentRequest>;
  updatePaymentRequest(id: string, updates: Partial<SaaSPaymentRequest>): Promise<SaaSPaymentRequest>;
  appendSubscriptionHistory(entry: SubscriptionHistoryRecord): Promise<void>;
}

export interface PlatformPaymentChannels {
  bkash: string;
  nagad: string;
  rocket?: string;
  bank: string;
  paymentInstruction?: string;
  supportPhone: string;
  supportEmail: string;
  updatedAt?: string;
  updatedBy?: string;
}

export function getDefaultPlatformPaymentChannels(): PlatformPaymentChannels {
  return {
    bkash: process.env.PLATFORM_BKASH_NUMBER || '01711-234567 (Merchant / Send Money)',
    nagad: process.env.PLATFORM_NAGAD_NUMBER || '01911-234567 (Personal / Merchant)',
    rocket: process.env.PLATFORM_ROCKET_NUMBER || '',
    bank:
      process.env.PLATFORM_BANK_ACCOUNT ||
      'Dutch-Bangla Bank • A/C: 101-110-0045678 (SmartSchool BD)',
    paymentInstruction: process.env.PLATFORM_PAYMENT_INSTRUCTION || '',
    supportPhone: process.env.PLATFORM_SUPPORT_PHONE || '+880 1700-070707',
    supportEmail: process.env.PLATFORM_SUPPORT_EMAIL || 'support@smartschoolbd.com',
  };
}

export type SupportCategory = 'technical' | 'billing' | 'training' | 'data' | 'other';
export type SupportTicketStatus = 'open' | 'replied' | 'resolved';
export type SupportSenderRole = 'school' | 'master_admin';

export interface SupportTicketRecord {
  id: string;
  schoolId: string;
  schoolName: string;
  schoolCode?: string;
  createdByUid: string;
  createdByName?: string;
  createdByEmail: string;
  createdByRole: string;
  subject: string;
  category: SupportCategory;
  status: SupportTicketStatus;
  lastMessagePreview?: string;
  lastSenderRole: SupportSenderRole;
  unreadByMaster: boolean;
  unreadBySchool: boolean;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface SupportMessageRecord {
  id: string;
  ticketId: string;
  schoolId: string;
  ticketCreatorUid?: string;
  senderUid: string;
  senderName: string;
  senderEmail?: string;
  senderRole: SupportSenderRole;
  senderSchoolRole?: string;
  text: string;
  imageUrls: string[];
  createdAt: string;
}

export type SupportVideoCategory =
  | 'getting_started'
  | 'fees'
  | 'attendance'
  | 'exams'
  | 'students'
  | 'settings'
  | 'other';

export type SupportVideoAudience = 'admins' | 'all';

export interface SupportVideoRecord {
  id: string;
  title: string;
  description?: string;
  category: SupportVideoCategory;
  videoId: string;
  embedUrl: string;
  watchUrl: string;
  thumbnailUrl: string;
  audience: SupportVideoAudience;
  sortOrder: number;
  isActive: boolean;
  createdByUid: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

export interface DatabaseProviderInterface {
  readonly providerName: string;
  isMasterAdminUidOrEmail(uid: string, email: string): Promise<boolean>;
  getPlans(): Promise<SubscriptionPlanConfig[]>;
  getPlanById(planId: SubscriptionPlanId): Promise<SubscriptionPlanConfig | null>;
  upsertPlan(plan: SubscriptionPlanConfig): Promise<SubscriptionPlanConfig>;
  deletePlan?(planId: SubscriptionPlanId): Promise<void>;

  getPaymentChannels(): Promise<PlatformPaymentChannels>;
  savePaymentChannels(channels: PlatformPaymentChannels): Promise<PlatformPaymentChannels>;

  getNextSchoolId(): Promise<string>;
  getSchoolById(schoolId: string): Promise<SchoolTenantRecord | null>;
  getSchoolByCode(schoolCode: string): Promise<SchoolTenantRecord | null>;
  listSchools(): Promise<SchoolTenantRecord[]>;
  createSchool(school: SchoolTenantRecord): Promise<SchoolTenantRecord>;
  updateSchool(schoolId: string, updates: Partial<SchoolTenantRecord>): Promise<SchoolTenantRecord>;
  deleteSchool(schoolId: string): Promise<void>;

  listPaymentRequests(schoolId?: string): Promise<SaaSPaymentRequest[]>;
  getPaymentRequestById(id: string): Promise<SaaSPaymentRequest | null>;
  getPaymentByNormalizedTrxId(normalizedTrxId: string): Promise<SaaSPaymentRequest | null>;

  listSubscriptionHistory(schoolId?: string): Promise<SubscriptionHistoryRecord[]>;
  appendSubscriptionHistory(entry: SubscriptionHistoryRecord): Promise<void>;

  createSaaSUserRecord(user: SaaSUserRecord): Promise<SaaSUserRecord>;
  getSaaSUserByUid(uid: string): Promise<SaaSUserRecord | null>;
  getSaaSUserByEmail(email: string): Promise<SaaSUserRecord | null>;
  getSaaSUserByUsernameNormalized(usernameNormalized: string): Promise<SaaSUserRecord | null>;
  findSaaSUsersByLoginIdentifier(
    usernameNormalized: string,
    phoneNormalized?: string
  ): Promise<SaaSUserRecord[]>;
  listSaaSUsersBySchool(schoolId: string): Promise<SaaSUserRecord[]>;
  updateSaaSUserRecord(uid: string, updates: Partial<SaaSUserRecord>): Promise<SaaSUserRecord>;
  deleteSaaSUserRecord(uid: string, schoolIdHint?: string): Promise<void>;

  saveMasterVaultRecord?(record: MasterAdminVaultRecord): Promise<void>;
  getMasterVaultRecordByUid?(uid: string): Promise<MasterAdminVaultRecord | null>;
  getMasterVaultRecordsBySchool?(schoolId: string): Promise<MasterAdminVaultRecord[]>;
  deleteMasterVaultRecord?(uid: string): Promise<void>;
  deleteMasterVaultRecordsBySchool?(schoolId: string): Promise<void>;

  getTenantSlices(schoolId: string): Promise<Record<string, any>>;
  saveTenantSlice(schoolId: string, sliceName: string, data: Record<string, any>): Promise<void>;

  listSupportTickets(schoolId?: string): Promise<SupportTicketRecord[]>;
  getSupportTicketById(ticketId: string): Promise<SupportTicketRecord | null>;
  createSupportTicket(
    ticket: SupportTicketRecord,
    initialMessage: SupportMessageRecord
  ): Promise<{ ticket: SupportTicketRecord; message: SupportMessageRecord }>;
  listSupportMessages(ticketId: string): Promise<SupportMessageRecord[]>;
  addSupportMessage(
    ticketId: string,
    message: SupportMessageRecord,
    ticketUpdates: Partial<SupportTicketRecord>
  ): Promise<{ ticket: SupportTicketRecord; message: SupportMessageRecord }>;
  updateSupportTicket(
    ticketId: string,
    updates: Partial<SupportTicketRecord>
  ): Promise<SupportTicketRecord>;

  listSupportVideos(): Promise<SupportVideoRecord[]>;
  getSupportVideoById(videoDocId: string): Promise<SupportVideoRecord | null>;
  upsertSupportVideo(video: SupportVideoRecord): Promise<SupportVideoRecord>;
  upsertSupportVideosBatch(videos: SupportVideoRecord[]): Promise<SupportVideoRecord[]>;
  deleteSupportVideo(videoDocId: string): Promise<void>;

  runInTransaction<T>(fn: (tx: TransactionContext) => Promise<T>): Promise<T>;
}

export class SaaSServiceError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: Record<string, any>;

  constructor(
    message: string,
    statusCode = 400,
    code = 'SAAS_ERROR',
    details?: Record<string, any>
  ) {
    super(message);
    this.name = 'SaaSServiceError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}
