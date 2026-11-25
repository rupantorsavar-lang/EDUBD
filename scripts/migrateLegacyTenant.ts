import fs from 'fs';
import path from 'path';
import readline from 'readline';
import dotenv from 'dotenv';
import { initializeApp, cert, applicationDefault, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import {
  executeSafeMigration,
  LegacyTenantSnapshot,
  MigrationDestinationStore,
} from '../server/saas/migrationService';

dotenv.config();

const LEGACY_TOP_COLLECTIONS = [
  'students',
  'staff',
  'attendance',
  'attendance_audit_logs',
  'exams',
  'marks',
  'feeInvoices',
  'feePayments',
  'feeHeads',
  'expenses',
  'homework',
  'homework_submissions',
  'notices',
  'blog_posts',
  'online_payments',
  'student_performance',
  'config',
  'school_settings',
];

function parseArgs(argv: string[]) {
  const args: Record<string, string | boolean> = {};
  for (const token of argv) {
    if (token.startsWith('--')) {
      const eq = token.indexOf('=');
      if (eq !== -1) {
        args[token.slice(2, eq)] = token.slice(eq + 1);
      } else {
        args[token.slice(2)] = true;
      }
    }
  }
  return args;
}

function loadFirestore() {
  const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
  const config = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, 'utf-8')) : {};

  if (getApps().length === 0) {
    const saJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (saJson && saJson.trim().startsWith('{')) {
      initializeApp({
        credential: cert(JSON.parse(saJson)),
        projectId: config.projectId,
      });
    } else {
      initializeApp({
        credential: applicationDefault(),
        projectId: config.projectId,
      });
    }
  }
  const dbId = config.firestoreDatabaseId || '(default)';
  return dbId !== '(default)' ? getFirestore(getApps()[0], dbId) : getFirestore(getApps()[0]);
}

async function promptConfirmation(question: string): Promise<boolean> {
  if (!process.stdin.isTTY) return false;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'yes');
    });
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const db = loadFirestore();

  // Discover legacy tenant IDs in school_sync
  const syncSnap = await db.collection('school_sync').get();
  const discoveredTenantIds = new Set<string>();
  syncSnap.forEach((doc) => {
    const base = doc.id.split('__')[0];
    if (base) discoveredTenantIds.add(base);
  });

  const legacyTenantId =
    (typeof args['legacy-tenant-id'] === 'string' && args['legacy-tenant-id']) ||
    Array.from(discoveredTenantIds)[0] ||
    'domain_default';

  const targetSchoolId =
    (typeof args['target-school-id'] === 'string' && args['target-school-id']) || 'SCH001';

  console.log('===================================================================');
  console.log(' SmartSchoolBD Legacy -> Multi-Tenant Safe Migration Tool');
  console.log('===================================================================');
  console.log('Discovered legacy tenants in school_sync:', Array.from(discoveredTenantIds));
  console.log(`Selected Legacy Tenant ID : ${legacyTenantId}`);
  console.log(`Target Multi-Tenant ID    : ${targetSchoolId}`);

  // Read legacy slices
  const slices: LegacyTenantSnapshot['slices'] = {};
  syncSnap.forEach((doc) => {
    if (doc.id === legacyTenantId || doc.id.startsWith(`${legacyTenantId}__`)) {
      const sliceId = doc.id === legacyTenantId ? 'legacy_root' : doc.id.slice(legacyTenantId.length + 2);
      slices[sliceId] = { id: doc.id, data: doc.data() };
    }
  });

  // Read legacy top-level collections
  const legacyCollections: LegacyTenantSnapshot['legacyCollections'] = {};
  for (const colName of LEGACY_TOP_COLLECTIONS) {
    const colSnap = await db.collection(colName).get();
    if (!colSnap.empty) {
      legacyCollections[colName] = colSnap.docs.map((d) => ({ id: d.id, data: d.data() }));
    }
  }

  const snapshot: LegacyTenantSnapshot = {
    legacyTenantId,
    slices,
    legacyCollections,
  };

  const store: MigrationDestinationStore = {
    async hasSchool(schoolId) {
      const s = await db.collection('schools').doc(schoolId).get();
      return s.exists;
    },
    async createSchoolIfMissing(schoolId, schoolData) {
      const ref = db.collection('schools').doc(schoolId);
      const snap = await ref.get();
      if (snap.exists) return false;
      const expiry = new Date(schoolData.subscription.expiryDate);
      await ref.create({
        ...schoolData,
        subscription: {
          ...schoolData.subscription,
          expiryTimestamp: Timestamp.fromDate(expiry),
        },
      });
      return true;
    },
    async hasSlice(schoolId, sliceId) {
      const s = await db.collection('schools').doc(schoolId).collection('slices').doc(sliceId).get();
      return s.exists;
    },
    async writeSliceIfMissing(schoolId, sliceId, data) {
      const ref = db.collection('schools').doc(schoolId).collection('slices').doc(sliceId);
      const snap = await ref.get();
      if (snap.exists) return false;
      await ref.create(data);
      return true;
    },
    async hasSubCollectionDoc(schoolId, colName, docId) {
      const s = await db.collection('schools').doc(schoolId).collection(colName).doc(docId).get();
      return s.exists;
    },
    async writeSubCollectionDocIfMissing(schoolId, colName, docId, data) {
      const ref = db.collection('schools').doc(schoolId).collection(colName).doc(docId);
      const snap = await ref.get();
      if (snap.exists) return false;
      await ref.create(data);
      return true;
    },
    async countDestinationSlices(schoolId) {
      const snap = await db.collection('schools').doc(schoolId).collection('slices').get();
      return snap.size;
    },
    async countDestinationSubCollectionDocs(schoolId, collections) {
      let count = 0;
      for (const col of collections) {
        const snap = await db.collection('schools').doc(schoolId).collection(col).get();
        count += snap.size;
      }
      return count;
    },
    async getMigratedStaffSliceSample(schoolId) {
      const snap = await db.collection('schools').doc(schoolId).collection('slices').doc('staff').get();
      const arr = snap.data()?.school_erp_staff;
      return Array.isArray(arr) ? arr.slice(0, 5) : [];
    },
  };

  const backupDir = path.resolve(process.cwd(), 'backups');
  const schoolMeta = {
    schoolName: (args['school-name'] as string) || 'Migrated Legacy School',
    schoolCode: (args['school-code'] as string) || targetSchoolId,
    address: (args['address'] as string) || 'Dhaka, Bangladesh',
    contactNumber: (args['contact'] as string) || '+880 1700-000000',
    email: (args['email'] as string) || 'school@smartschoolbd.com',
    principalName: (args['principal'] as string) || 'Principal',
    adminName: (args['admin-name'] as string) || 'School Admin',
    adminEmail: (args['admin-email'] as string) || 'admin@smartschoolbd.com',
  };

  // Step 1-3: Dry Run + JSON Backup + Document Counts
  const dryRunResult = await executeSafeMigration({
    snapshot,
    targetSchoolId,
    schoolMeta,
    store,
    backupDir,
    confirmed: false,
  });

  console.log('\n[Step 1-3] DRY RUN REPORT & DOCUMENT COUNTS:');
  console.log(JSON.stringify(dryRunResult.dryRun, null, 2));
  console.log(`\n[Step 2] Timestamped JSON backup saved at: ${dryRunResult.backupFilePath}`);

  // Step 4: Require explicit confirmation
  let isConfirmed = args['confirm'] === true || args['confirm'] === 'true';
  if (!isConfirmed && !args['dry-run']) {
    isConfirmed = await promptConfirmation(
      `\nType "yes" to apply non-destructive migration to ${targetSchoolId} (original data untouched): `
    );
  }

  if (!isConfirmed) {
    console.log('\nDry run completed. Pass --confirm to apply the migration.');
    return;
  }

  // Step 5-6: Apply & Verify
  const finalResult = await executeSafeMigration({
    snapshot,
    targetSchoolId,
    schoolMeta,
    store,
    backupDir,
    confirmed: true,
  });

  console.log('\n[Step 5-6] MIGRATION APPLIED & VERIFIED:');
  console.log(JSON.stringify(finalResult.applied, null, 2));
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
