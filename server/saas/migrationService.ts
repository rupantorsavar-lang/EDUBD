import fs from 'fs';
import path from 'path';

export interface LegacyTenantSnapshot {
  legacyTenantId: string;
  slices: Record<string, { id: string; data: Record<string, any> }>;
  legacyCollections: Record<string, Array<{ id: string; data: Record<string, any> }>>;
}

export interface MigrationDryRunReport {
  legacyTenantId: string;
  targetSchoolId: string;
  destinationAlreadyExists: boolean;
  sliceCounts: Record<string, number>;
  collectionCounts: Record<string, number>;
  totalDocuments: number;
  staffPlaintextPasswordsDetected: number;
  warnings: string[];
}

export interface MigrationApplyResult {
  dryRun: MigrationDryRunReport;
  backupFilePath: string;
  migratedSlices: number;
  migratedCollectionDocs: number;
  skippedExistingDocs: number;
  strippedPasswordFieldsCount: number;
  verifiedCounts: {
    slicesInDestination: number;
    collectionDocsInDestination: number;
    sampleStaffClean: boolean;
  };
}

/**
 * Strips legacy plaintext password fields from migrated staff, student, and super_admin_creds records.
 * Never alters the source snapshot object (deep clones first).
 */
export function sanitizeMigratedDataPayload(raw: Record<string, any>): {
  sanitized: Record<string, any>;
  strippedCount: number;
} {
  const clone = structuredClone(raw);
  let strippedCount = 0;

  // 1. Strip staff plaintext passwords inside slice arrays
  if (Array.isArray(clone.school_erp_staff)) {
    clone.school_erp_staff = clone.school_erp_staff.map((st: any) => {
      if (st && typeof st === 'object') {
        const copy = { ...st };
        if ('password' in copy) {
          delete copy.password;
          strippedCount++;
        }
        if (!copy.authUid) {
          copy.authProvisionStatus = 'pending_provisioning';
        }
        return copy;
      }
      return st;
    });
  }

  // 2. Strip student plaintext passwords inside slice arrays
  if (Array.isArray(clone.school_erp_students)) {
    clone.school_erp_students = clone.school_erp_students.map((stu: any) => {
      if (stu && typeof stu === 'object') {
        const copy = { ...stu };
        if ('password' in copy) {
          delete copy.password;
          strippedCount++;
        }
        return copy;
      }
      return stu;
    });
  }

  // 3. Strip legacy super admin plaintext password
  if (clone.school_erp_super_admin_creds && typeof clone.school_erp_super_admin_creds === 'object') {
    if ('password' in clone.school_erp_super_admin_creds) {
      delete clone.school_erp_super_admin_creds.password;
      strippedCount++;
    }
  }

  // 4. Strip direct document password (for top-level staff/student docs)
  if ('password' in clone && typeof clone.password === 'string') {
    delete clone.password;
    strippedCount++;
  }

  return { sanitized: clone, strippedCount };
}

export function analyzeLegacySnapshot(
  snapshot: LegacyTenantSnapshot,
  targetSchoolId: string,
  destinationExists: boolean
): MigrationDryRunReport {
  const sliceCounts: Record<string, number> = {};
  const collectionCounts: Record<string, number> = {};
  let totalDocuments = 0;
  let staffPlaintextPasswordsDetected = 0;
  const warnings: string[] = [];

  for (const [sliceId, entry] of Object.entries(snapshot.slices)) {
    sliceCounts[sliceId] = 1;
    totalDocuments++;
    const staffArr = entry.data?.school_erp_staff;
    if (Array.isArray(staffArr)) {
      staffPlaintextPasswordsDetected += staffArr.filter((s: any) => s && 'password' in s).length;
    }
    const creds = entry.data?.school_erp_super_admin_creds;
    if (creds && typeof creds === 'object' && 'password' in creds) {
      staffPlaintextPasswordsDetected++;
    }
  }

  for (const [colName, docs] of Object.entries(snapshot.legacyCollections)) {
    collectionCounts[colName] = docs.length;
    totalDocuments += docs.length;
    for (const d of docs) {
      if (d.data && 'password' in d.data) {
        staffPlaintextPasswordsDetected++;
      }
    }
  }

  if (destinationExists) {
    warnings.push(
      `Destination school ${targetSchoolId} already exists. Existing destination documents will NOT be overwritten.`
    );
  }
  if (totalDocuments === 0) {
    warnings.push(`No legacy documents found for tenant "${snapshot.legacyTenantId}".`);
  }

  return {
    legacyTenantId: snapshot.legacyTenantId,
    targetSchoolId,
    destinationAlreadyExists: destinationExists,
    sliceCounts,
    collectionCounts,
    totalDocuments,
    staffPlaintextPasswordsDetected,
    warnings,
  };
}

export function writeTimestampedBackup(
  snapshot: LegacyTenantSnapshot,
  backupDir: string,
  now: Date = new Date()
): string {
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  const filePath = path.join(backupDir, `legacy-backup-${snapshot.legacyTenantId}-${stamp}.json`);
  fs.writeFileSync(
    filePath,
    JSON.stringify(
      {
        exportedAt: now.toISOString(),
        legacyTenantId: snapshot.legacyTenantId,
        snapshot,
      },
      null,
      2
    ),
    'utf-8'
  );
  return filePath;
}

export interface MigrationDestinationStore {
  hasSchool(schoolId: string): Promise<boolean>;
  createSchoolIfMissing(schoolId: string, schoolData: Record<string, any>): Promise<boolean>;
  hasSlice(schoolId: string, sliceId: string): Promise<boolean>;
  writeSliceIfMissing(schoolId: string, sliceId: string, data: Record<string, any>): Promise<boolean>;
  hasSubCollectionDoc(schoolId: string, collectionName: string, docId: string): Promise<boolean>;
  writeSubCollectionDocIfMissing(
    schoolId: string,
    collectionName: string,
    docId: string,
    data: Record<string, any>
  ): Promise<boolean>;
  countDestinationSlices(schoolId: string): Promise<number>;
  countDestinationSubCollectionDocs(schoolId: string, collections: string[]): Promise<number>;
  getMigratedStaffSliceSample(schoolId: string): Promise<any[]>;
}

export async function executeSafeMigration(params: {
  snapshot: LegacyTenantSnapshot;
  targetSchoolId: string;
  schoolMeta: {
    schoolName: string;
    schoolCode: string;
    address: string;
    contactNumber: string;
    email: string;
    principalName: string;
    adminName: string;
    adminEmail: string;
  };
  store: MigrationDestinationStore;
  backupDir: string;
  confirmed: boolean;
  now?: Date;
}): Promise<{ dryRun: MigrationDryRunReport; backupFilePath: string; applied?: MigrationApplyResult }> {
  const now = params.now ?? new Date();
  const destExists = await params.store.hasSchool(params.targetSchoolId);
  const dryRun = analyzeLegacySnapshot(params.snapshot, params.targetSchoolId, destExists);

  // Step 2: Always generate timestamped JSON backup before any write
  const backupFilePath = writeTimestampedBackup(params.snapshot, params.backupDir, now);

  if (!params.confirmed) {
    return { dryRun, backupFilePath };
  }

  // Step 5: Apply migration safely (never overwrite destination, never delete source!)
  const nowIso = now.toISOString();
  const expiry = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();

  await params.store.createSchoolIfMissing(params.targetSchoolId, {
    schoolId: params.targetSchoolId,
    schoolCode: params.schoolMeta.schoolCode.toUpperCase(),
    schoolName: params.schoolMeta.schoolName,
    address: params.schoolMeta.address,
    contactNumber: params.schoolMeta.contactNumber,
    email: params.schoolMeta.email,
    principalName: params.schoolMeta.principalName,
    adminName: params.schoolMeta.adminName,
    adminEmail: params.schoolMeta.adminEmail,
    adminUid: '',
    status: 'active',
    migratedFromLegacyTenantId: params.snapshot.legacyTenantId,
    subscription: {
      planId: 'monthly',
      planName: 'Monthly Plan',
      status: 'Active',
      startDate: nowIso,
      expiryDate: expiry,
      lastPaymentDate: nowIso,
      nextRenewalDate: expiry,
      amountBdt: 1500,
    },
    createdAt: nowIso,
    updatedAt: nowIso,
    createdBy: 'legacy_migration_script',
  });

  let migratedSlices = 0;
  let migratedCollectionDocs = 0;
  let skippedExistingDocs = 0;
  let strippedPasswordFieldsCount = 0;

  for (const [sliceId, entry] of Object.entries(params.snapshot.slices)) {
    const exists = await params.store.hasSlice(params.targetSchoolId, sliceId);
    if (exists) {
      skippedExistingDocs++;
      continue;
    }
    const { sanitized, strippedCount } = sanitizeMigratedDataPayload(entry.data);
    strippedPasswordFieldsCount += strippedCount;
    const written = await params.store.writeSliceIfMissing(params.targetSchoolId, sliceId, {
      ...sanitized,
      schoolId: params.targetSchoolId,
      migratedFrom: params.snapshot.legacyTenantId,
      migratedAt: nowIso,
    });
    if (written) migratedSlices++;
  }

  const colNames = Object.keys(params.snapshot.legacyCollections);
  for (const [colName, docs] of Object.entries(params.snapshot.legacyCollections)) {
    for (const d of docs) {
      const exists = await params.store.hasSubCollectionDoc(params.targetSchoolId, colName, d.id);
      if (exists) {
        skippedExistingDocs++;
        continue;
      }
      const { sanitized, strippedCount } = sanitizeMigratedDataPayload(d.data);
      strippedPasswordFieldsCount += strippedCount;
      const written = await params.store.writeSubCollectionDocIfMissing(
        params.targetSchoolId,
        colName,
        d.id,
        {
          ...sanitized,
          schoolId: params.targetSchoolId,
          migratedFrom: colName,
          migratedAt: nowIso,
        }
      );
      if (written) migratedCollectionDocs++;
    }
  }

  // Step 6: Verify migrated counts and confirm zero plaintext passwords in destination
  const slicesInDestination = await params.store.countDestinationSlices(params.targetSchoolId);
  const collectionDocsInDestination = await params.store.countDestinationSubCollectionDocs(
    params.targetSchoolId,
    colNames
  );
  const staffSample = await params.store.getMigratedStaffSliceSample(params.targetSchoolId);
  const sampleStaffClean = staffSample.every((st) => !('password' in st));

  return {
    dryRun,
    backupFilePath,
    applied: {
      dryRun,
      backupFilePath,
      migratedSlices,
      migratedCollectionDocs,
      skippedExistingDocs,
      strippedPasswordFieldsCount,
      verifiedCounts: {
        slicesInDestination,
        collectionDocsInDestination,
        sampleStaffClean,
      },
    },
  };
}
