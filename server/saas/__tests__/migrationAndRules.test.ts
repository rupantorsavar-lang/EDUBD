import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, it, expect } from 'vitest';
import {
  LegacyTenantSnapshot,
  MigrationDestinationStore,
  executeSafeMigration,
} from '../migrationService';
import { POSTGRES_SAAS_SCHEMA_SQL } from '../providers/postgresStub';

class InMemoryMigrationStore implements MigrationDestinationStore {
  public schools = new Map<string, Record<string, any>>();
  public slices = new Map<string, Map<string, Record<string, any>>>();
  public subCollections = new Map<string, Map<string, Map<string, Record<string, any>>>>();

  async hasSchool(schoolId: string): Promise<boolean> {
    return this.schools.has(schoolId);
  }
  async createSchoolIfMissing(schoolId: string, schoolData: Record<string, any>): Promise<boolean> {
    if (this.schools.has(schoolId)) return false;
    this.schools.set(schoolId, structuredClone(schoolData));
    return true;
  }
  async hasSlice(schoolId: string, sliceId: string): Promise<boolean> {
    return this.slices.get(schoolId)?.has(sliceId) ?? false;
  }
  async writeSliceIfMissing(schoolId: string, sliceId: string, data: Record<string, any>): Promise<boolean> {
    if (!this.slices.has(schoolId)) this.slices.set(schoolId, new Map());
    const map = this.slices.get(schoolId)!;
    if (map.has(sliceId)) return false;
    map.set(sliceId, structuredClone(data));
    return true;
  }
  async hasSubCollectionDoc(schoolId: string, collectionName: string, docId: string): Promise<boolean> {
    return this.subCollections.get(schoolId)?.get(collectionName)?.has(docId) ?? false;
  }
  async writeSubCollectionDocIfMissing(
    schoolId: string,
    collectionName: string,
    docId: string,
    data: Record<string, any>
  ): Promise<boolean> {
    if (!this.subCollections.has(schoolId)) this.subCollections.set(schoolId, new Map());
    const cols = this.subCollections.get(schoolId)!;
    if (!cols.has(collectionName)) cols.set(collectionName, new Map());
    const docs = cols.get(collectionName)!;
    if (docs.has(docId)) return false;
    docs.set(docId, structuredClone(data));
    return true;
  }
  async countDestinationSlices(schoolId: string): Promise<number> {
    return this.slices.get(schoolId)?.size ?? 0;
  }
  async countDestinationSubCollectionDocs(schoolId: string, collections: string[]): Promise<number> {
    let total = 0;
    const cols = this.subCollections.get(schoolId);
    if (!cols) return 0;
    for (const c of collections) {
      total += cols.get(c)?.size ?? 0;
    }
    return total;
  }
  async getMigratedStaffSliceSample(schoolId: string): Promise<any[]> {
    const staffSlice = this.slices.get(schoolId)?.get('staff');
    if (staffSlice && Array.isArray(staffSlice.school_erp_staff)) {
      return staffSlice.school_erp_staff;
    }
    return [];
  }
}

describe('15. Legacy School Data Migration & Security Hardening Verification', () => {
  it('Performs dry-run, writes JSON backup, copies non-destructively, and strips plaintext passwords', async () => {
    const tmpBackupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'smartschool-backup-'));
    const snapshot: LegacyTenantSnapshot = {
      legacyTenantId: 'domain_default',
      slices: {
        students: {
          id: 'students',
          data: {
            school_erp_students: [
              { id: 'stu1', nameEn: 'Tanvir Ahmed', password: 'legacy-stu-password' },
            ],
          },
        },
        staff: {
          id: 'staff',
          data: {
            school_erp_staff: [
              { id: 'st1', nameEn: 'Selina Parvin', email: 'selina@school.edu.bd', password: 'staff123' },
            ],
          },
        },
        super_admin_creds: {
          id: 'super_admin_creds',
          data: {
            school_erp_super_admin_creds: {
              username: 'superadmin',
              password: '070707',
              email: 'super@school.edu.bd',
            },
          },
        },
      },
      legacyCollections: {
        students: [{ id: 'stu1', data: { nameEn: 'Tanvir Ahmed', password: 'old' } }],
        staff: [{ id: 'st1', data: { nameEn: 'Selina Parvin', password: 'staff123' } }],
      },
    };

    const store = new InMemoryMigrationStore();
    const schoolMeta = {
      schoolName: 'Legacy Model School',
      schoolCode: 'LMS01',
      address: 'Dhaka',
      contactNumber: '01700000000',
      email: 'info@lms.edu.bd',
      principalName: 'Principal',
      adminName: 'Super Admin',
      adminEmail: 'super@lms.edu.bd',
    };

    // Dry run (confirmed: false) writes backup but writes ZERO docs to destination
    const dryRunRes = await executeSafeMigration({
      snapshot,
      targetSchoolId: 'SCH001',
      schoolMeta,
      store,
      backupDir: tmpBackupDir,
      confirmed: false,
    });
    expect(dryRunRes.dryRun.totalDocuments).toBe(5);
    expect(dryRunRes.dryRun.staffPlaintextPasswordsDetected).toBe(4);
    expect(fs.existsSync(dryRunRes.backupFilePath)).toBe(true);
    expect(dryRunRes.applied).toBeUndefined();
    expect(await store.hasSchool('SCH001')).toBe(false);

    // Apply migration (confirmed: true)
    const applyRes = await executeSafeMigration({
      snapshot,
      targetSchoolId: 'SCH001',
      schoolMeta,
      store,
      backupDir: tmpBackupDir,
      confirmed: true,
    });
    expect(applyRes.applied).toBeDefined();
    expect(applyRes.applied!.migratedSlices).toBe(3);
    expect(applyRes.applied!.migratedCollectionDocs).toBe(2);
    expect(applyRes.applied!.strippedPasswordFieldsCount).toBe(5);
    expect(applyRes.applied!.verifiedCounts.slicesInDestination).toBe(3);
    expect(applyRes.applied!.verifiedCounts.collectionDocsInDestination).toBe(2);
    expect(applyRes.applied!.verifiedCounts.sampleStaffClean).toBe(true);

    // Source snapshot was never mutated (non-destructive)
    expect(snapshot.slices.staff.data.school_erp_staff[0].password).toBe('staff123');
    // Destination staff requires auth provisioning and has no password field
    const destStaff = await store.getMigratedStaffSliceSample('SCH001');
    expect(destStaff[0].password).toBeUndefined();
    expect(destStaff[0].authProvisionStatus).toBe('pending_provisioning');
  });

  it('18. Verifies Firestore Security Rules contain zero open wildcards and enforce tenant & subscription invariants', () => {
    const rules = fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf-8');

    // No insecure allow read, write: if true
    expect(rules).not.toMatch(/allow\s+(read|write|read,\s*write)\s*:\s*if\s+true\s*;/);
    // Global default deny must be present
    expect(rules).toContain('match /{document=**}');
    expect(rules).toContain('allow read, write: if false;');
    // Tenant claim + active subscription + server request.time enforcement
    expect(rules).toContain('request.auth.token.schoolId == schoolId');
    expect(rules).toContain('schoolDoc.subscription.expiryTimestamp > request.time');
    expect(rules).toContain('match /schools/{schoolId}');
    expect(rules).toContain('match /slices/{sliceId}');
  });

  it('19. Verifies Future VPS PostgreSQL schema blueprint matches multi-tenant entities', () => {
    expect(POSTGRES_SAAS_SCHEMA_SQL).toContain('CREATE TABLE IF NOT EXISTS schools');
    expect(POSTGRES_SAAS_SCHEMA_SQL).toContain('CREATE TABLE IF NOT EXISTS payment_requests');
    expect(POSTGRES_SAAS_SCHEMA_SQL).toContain('normalized_transaction_id VARCHAR(128) NOT NULL UNIQUE');
    expect(POSTGRES_SAAS_SCHEMA_SQL).toContain('CREATE TABLE IF NOT EXISTS saas_users');
    expect(POSTGRES_SAAS_SCHEMA_SQL).toContain('CREATE TABLE IF NOT EXISTS tenant_slices');
  });

  it('20. Verifies AuthContext and StorageService do not hardcode or auto-inject login passwords', () => {
    const authCtx = fs.readFileSync(path.resolve(process.cwd(), 'src/context/AuthContext.tsx'), 'utf-8');
    expect(authCtx).not.toContain('070707');
    expect(authCtx).not.toContain('SYSTEM_DEMO_ACCOUNTS');
    const storageSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/services/storage.ts'), 'utf-8');
    expect(storageSrc).not.toContain("updated.password = 'staff123'");
  });
});
